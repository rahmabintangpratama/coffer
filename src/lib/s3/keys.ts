import type { FileKind } from "@/lib/types";

/** S3 limits a key to 1,024 bytes of UTF-8. */
export const MAX_KEY_BYTES = 1024;

export const keyByteLength = (key: string): number => new TextEncoder().encode(key).length;

/**
 * Decode a key or prefix from a listing made with `EncodingType=url`. S3 writes
 * a space as `+`, so that is undone first. A value that is not valid
 * percent-encoding (a provider that ignored the parameter) comes back as it was.
 */
export function decodeS3Key(encoded: string): string {
  const spaced = encoded.replaceAll("+", " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return encoded;
  }
}

/** The last path segment of a key or folder prefix. */
export function nameOf(keyOrPrefix: string): string {
  const trimmed = keyOrPrefix.endsWith("/") ? keyOrPrefix.slice(0, -1) : keyOrPrefix;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** Names that start with a dot are hidden unless the person asks for them (FR-20). */
export const isHiddenName = (name: string): boolean => name.startsWith(".");

/** The trash prefix for a connection root ("" or ending in "/"). Always hidden from Files (ADR-004). */
export const trashPrefixOf = (root: string): string => `${root}.trash/`;

const KINDS: Record<Exclude<FileKind, "unknown">, readonly string[]> = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "heic", "heif", "tif", "tiff"],
  svg: ["svg"],
  video: ["mp4", "mov", "webm", "mkv", "m4v", "avi", "ogv"],
  audio: ["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac", "opus"],
  pdf: ["pdf"],
  markdown: ["md", "markdown", "mdx"],
  html: ["html", "htm"],
  code: [
    "txt", "log", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "py", "go", "rs", "java", "c", "cc",
    "cpp", "h", "hpp", "sh", "bash", "zsh", "yml", "yaml", "toml", "ini", "xml", "csv", "tsv", "sql", "rb", "php", "swift", "kt",
  ],
  archive: ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst"],
};

const kindByExtension = new Map<string, FileKind>(
  Object.entries(KINDS).flatMap(([kind, extensions]) => extensions.map((extension) => [extension, kind as FileKind] as const)),
);

/** What a file is, from its extension. Listings carry no content type, so this is the only signal. */
export function fileKindOf(name: string): FileKind {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "unknown";
  return kindByExtension.get(name.slice(dot + 1).toLowerCase()) ?? "unknown";
}

export type KeyProblem = "empty" | "tooLong" | "control" | "slash" | "dots" | "surrogate";

/** Characters no S3 provider stores reliably: C0 controls, DEL and unpaired surrogates (which cannot be UTF-8). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Whether a full object key can be stored, checked before an upload starts
 * (AC-40.4): at most 1,024 bytes, no control characters, no empty or dot-only
 * path segments (`a//b`, `./x`, `../x`) and no unpaired surrogates.
 */
export function keyProblem(key: string): KeyProblem | null {
  if (key === "") return "empty";
  if (keyByteLength(key) > MAX_KEY_BYTES) return "tooLong";
  if (CONTROL.test(key)) return "control";
  if (LONE_SURROGATE.test(key)) return "surrogate";
  const segments = key.endsWith("/") ? key.slice(0, -1).split("/") : key.split("/");
  if (segments.some((segment) => segment === "")) return "empty";
  if (segments.some((segment) => segment === "." || segment === "..")) return "dots";
  return null;
}

/** A single folder name from the New folder dialog: no `/`, not empty or dot-only, and a key that fits under its parent. */
export function folderNameProblem(name: string, parentPrefix: string): KeyProblem | null {
  if (name.trim() === "") return "empty";
  if (name.includes("/")) return "slash";
  return keyProblem(`${parentPrefix}${name}/`);
}

/**
 * `name (1).ext`: the first number whose key is free, inserted before the last
 * extension. A name that starts with a dot and has no other dot (`.env`) takes the
 * number at the end.
 */
export function keepBothKey(key: string, isTaken: (candidate: string) => boolean): string {
  const slash = key.lastIndexOf("/") + 1;
  const dir = key.slice(0, slash);
  const name = key.slice(slash);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n += 1) {
    const candidate = `${dir}${stem} (${n.toString()})${extension}`;
    if (!isTaken(candidate)) return candidate;
  }
}
