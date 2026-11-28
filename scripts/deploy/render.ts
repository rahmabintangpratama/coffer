import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// One source for the response headers (ADR-010): deploy/headers.json. Every host's configuration is rendered from it.

export interface HeaderConfig {
  csp: Record<string, string>;
  headers: Record<string, string>;
  cache: { value: string; paths: string[] }[];
}

export const readConfig = (): HeaderConfig => JSON.parse(readFileSync(fileURLToPath(new URL("../../deploy/headers.json", import.meta.url)), "utf8")) as HeaderConfig;

export const cspValue = (csp: Record<string, string>): string => Object.entries(csp).map(([name, sources]) => `${name} ${sources}`).join("; ");

/** The headers every response carries, the policy first. */
export const globalHeaders = (config: HeaderConfig): [string, string][] => [["Content-Security-Policy", cspValue(config.csp)], ...Object.entries(config.headers)];

/** "/assets/*" under "/coffer/" is "/coffer/assets/*". */
const under = (base: string, path: string): string => `${base}${path.slice(1)}`;

const notice = "Generated from deploy/headers.json by `pnpm deploy:build` (ADR-010). Do not edit by hand.";

/** `_headers`, read by Cloudflare Pages and Netlify. */
export function renderHeadersFile(config: HeaderConfig, base = "/"): string {
  const blocks = [[under(base, "/*"), ...globalHeaders(config).map(([name, value]) => `  ${name}: ${value}`)].join("\n")];
  for (const { value, paths } of config.cache) for (const path of paths) blocks.push(`${under(base, path)}\n  Cache-Control: ${value}`);
  return `# ${notice}\n${blocks.join("\n\n")}\n`;
}

const regexEscape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const quoted = (text: string): string => `"${text.replace(/[\\"]/g, "\\$&")}"`;

/** An nginx `conf.d` file: a `map` for the cache rules, and one server whose headers every location inherits. */
export function renderNginx(config: HeaderConfig, base = "/"): string {
  // Only a response that carries the file gets its cache rule: a missing asset must not be cached for a year.
  const entries = config.cache.flatMap(({ value, paths }) =>
    paths.map((path) => {
      const full = under(base, path);
      const pattern = full.endsWith("*") ? regexEscape(full.slice(0, -1)) : `${regexEscape(full)}$`;
      return `    ${quoted(`~^(200|206|304):${pattern}`)} ${quoted(value)};`;
    }),
  );
  return `# ${notice}
# Copy to /etc/nginx/conf.d/, put the files of dist/ in the root below${base === "/" ? "" : ` (under ${base.slice(1)})`}, and serve it over HTTPS.

map "$status:$uri" $coffer_cache_control {
    default "";
${entries.join("\n")}
}

server {
    listen 8080;
    listen [::]:8080;
    server_name _;
    server_tokens off;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/css text/javascript application/javascript application/json application/manifest+json image/svg+xml;

    # A location that adds a header of its own stops inheriting these: add none there.
${globalHeaders(config).map(([name, value]) => `    add_header ${name} ${quoted(value)} always;`).join("\n")}
    add_header Cache-Control $coffer_cache_control always;

    location / {
        try_files $uri $uri/ =404;
    }

    # Types that older mime.types files do not list.
    location ~ \\.mjs$ {
        types { }
        default_type text/javascript;
    }
    location ~ \\.webmanifest$ {
        types { }
        default_type application/manifest+json;
    }

    # The Cloudflare and Netlify header file is not part of the site here.
    location = ${base}_headers {
        return 404;
    }
}
`;
}

/** A Caddyfile. With a domain in COFFER_SITE, Caddy obtains the certificate itself. */
export function renderCaddy(config: HeaderConfig, base = "/"): string {
  const rules = config.cache.map(({ value, paths }, index) => `	# Only a file that exists gets its cache rule: a missing asset must not be cached for a year.
	@cache${String(index)} {
		file
		path ${paths.map((path) => under(base, path)).join(" ")}
	}
	header @cache${String(index)} Cache-Control ${quoted(value)}`);
  return `# ${notice}
# Put the files of dist/ in COFFER_ROOT${base === "/" ? "" : ` (under ${base.slice(1)})`}. Set COFFER_SITE to your domain for HTTPS.

{$COFFER_SITE::8080} {
	root * {$COFFER_ROOT:/srv}
	encode gzip

	header {
${globalHeaders(config).map(([name, value]) => `		${name} ${quoted(value)}`).join("\n")}
	}

${rules.join("\n\n")}

	@webmanifest path *.webmanifest
	header @webmanifest Content-Type application/manifest+json

	# The Cloudflare and Netlify header file is not part of the site here.
	respond ${base}_headers 404
	file_server
}
`;
}

/** `vercel.json`. Vercel adds every matching rule to a response. */
export function renderVercel(config: HeaderConfig, base = "/"): string {
  const source = (path: string): string => (path.endsWith("*") ? `${under(base, path.slice(0, -1))}(.*)` : under(base, path));
  const list = (headers: [string, string][]) => headers.map(([key, value]) => ({ key, value }));
  const json = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    buildCommand: "pnpm build",
    outputDirectory: "dist",
    headers: [
      { source: source("/*"), headers: list(globalHeaders(config)) },
      ...config.cache.flatMap(({ value, paths }) => paths.map((path) => ({ source: source(path), headers: list([["Cache-Control", value]]) }))),
    ],
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

/**
 * The part of the policy a page can set for itself, for a host that sends no headers (GitHub Pages). Browsers ignore
 * `frame-ancestors` in a meta element and report it, so it is left out: that protection is lost there.
 */
export function metaTags(config: HeaderConfig): string[] {
  const csp = Object.fromEntries(Object.entries(config.csp).filter(([name]) => name !== "frame-ancestors"));
  const referrer = config.headers["Referrer-Policy"];
  return [
    `<meta http-equiv="Content-Security-Policy" content="${cspValue(csp)}" />`,
    ...(referrer === undefined ? [] : [`<meta name="referrer" content="${referrer}" />`]),
  ];
}

/** The committed files, by repository path. */
export const TARGETS: Record<string, (config: HeaderConfig, base?: string) => string> = {
  "public/_headers": renderHeadersFile,
  "deploy/nginx/coffer.conf": renderNginx,
  "deploy/caddy/Caddyfile": renderCaddy,
  "vercel.json": renderVercel,
};
