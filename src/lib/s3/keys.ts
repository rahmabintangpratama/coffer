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
export const trashPrefixOf = (root: string): string => `${root}.coffer-trash/`;

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

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac", aac: "audio/aac", opus: "audio/ogg",
};

/**
 * The media type to ask the provider to answer with for a preview, by extension.
 * Objects are often stored as application/octet-stream, which Safari will not
 * play or draw; the signed URL overrides it for this one response.
 */
export function mimeOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? undefined : MIME[name.slice(dot + 1).toLowerCase()];
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, start: number, end: number): string => String.fromCharCode(...bytes.slice(start, end));

/** Control characters other than tab, line feed, form feed and carriage return: what a text file does not contain. */
export function looksBinary(bytes: Uint8Array): boolean {
  let controls = 0;
  for (const byte of bytes) {
    if (byte === 0) return true;
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13) controls += 1;
  }
  return bytes.length > 0 && controls / bytes.length > 0.02;
}

/**
 * What a file is from its first bytes (FR-50: extension plus magic bytes). Used
 * when the extension says nothing. Text with no markup signature counts as `code`
 * (plain text); anything with control characters stays `unknown`.
 */
export function sniffKind(head: Uint8Array): FileKind {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return "image";
  if (startsWith(head, [0xff, 0xd8, 0xff]) || startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "image";
  if (ascii(head, 0, 4) === "RIFF") return ascii(head, 8, 12) === "WEBP" ? "image" : ascii(head, 8, 12) === "WAVE" ? "audio" : "unknown";
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x1f, 0x8b])) return "archive";
  if (ascii(head, 4, 8) === "ftyp" || startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return "video";
  if (ascii(head, 0, 4) === "OggS" || ascii(head, 0, 4) === "fLaC" || ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "audio";
  if (looksBinary(head)) return "unknown";
  const text = new TextDecoder().decode(head).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "svg";
  if (text.startsWith("<!doctype html") || text.startsWith("<html")) return "html";
  return "code";
}
