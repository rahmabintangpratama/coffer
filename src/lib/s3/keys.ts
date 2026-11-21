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
