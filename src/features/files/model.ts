import { nameOf } from "@/lib/s3/keys";
import type { FileItem, FileKind, FolderItem, Settings } from "@/lib/types";

export type Item = FolderItem | FileItem;
export type Sort = Settings["sort"];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Folders first, then files (AC-20.1). Names use a numeric, case-insensitive
 * collator. Folders have no date or size, so they stay in name order whichever
 * column is chosen; only a name sort follows the direction for folders too.
 */
export function sortItems(items: readonly Item[], sort: Sort): Item[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const byName = (a: Item, b: Item) => collator.compare(a.name, b.name);
  const folders = items.filter((item): item is FolderItem => item.kind === "folder");
  const files = items.filter((item): item is FileItem => item.kind === "file");
  folders.sort((a, b) => (sort.by === "name" ? sign * byName(a, b) : byName(a, b)));
  files.sort((a, b) => {
    const primary =
      sort.by === "size" ? a.size - b.size : sort.by === "modified" ? a.lastModified.localeCompare(b.lastModified) : byName(a, b);
    return primary === 0 ? byName(a, b) : sign * primary;
  });
  return [...folders, ...files];
}

export type TypeFilter = "folder" | "image" | "video" | "audio" | "pdf" | "document" | "archive";
export type ModifiedFilter = "today" | "week" | "month" | "year";

export const typeFilters: readonly TypeFilter[] = ["folder", "image", "video", "audio", "pdf", "document", "archive"];
export const modifiedFilters: readonly ModifiedFilter[] = ["today", "week", "month", "year"];

export interface Filters {
  query: string;
  type: TypeFilter | null;
  modified: ModifiedFilter | null;
}

export const noFilters: Filters = { query: "", type: null, modified: null };
export const hasFilters = (filters: Filters): boolean => filters.query.trim() !== "" || filters.type !== null || filters.modified !== null;

const documentKinds: readonly FileKind[] = ["markdown", "html", "code"];

function matchesType(item: Item, type: TypeFilter): boolean {
  if (type === "folder") return item.kind === "folder";
  if (item.kind === "folder") return false;
  if (type === "image") return item.fileKind === "image" || item.fileKind === "svg";
  if (type === "document") return documentKinds.includes(item.fileKind);
  return item.fileKind === type;
}

const DAY = 24 * 60 * 60 * 1000;
const windows: Record<ModifiedFilter, number> = { today: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY };

function matchesModified(item: Item, modified: ModifiedFilter, now: number): boolean {
  if (item.kind === "folder") return false;
  const time = Date.parse(item.lastModified);
  return !Number.isNaN(time) && now - time <= windows[modified];
}

/** Name search is a case-insensitive substring over loaded items; no request is made (AC-23.1). */
export function filterItems(items: readonly Item[], filters: Filters, now: number = Date.now()): Item[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter(
    (item) =>
      (query === "" || item.name.toLowerCase().includes(query)) &&
      (filters.type === null || matchesType(item, filters.type)) &&
      (filters.modified === null || matchesModified(item, filters.modified, now)),
  );
}

export const withoutHidden = (items: readonly Item[], show: boolean): Item[] =>
  show ? [...items] : items.filter((item) => !item.name.startsWith("."));

/** Breadcrumb parts for a folder prefix: `a/b/` gives `a` and `b`, each with the prefix that opens it. */
export function crumbsOf(prefix: string): { name: string; prefix: string }[] {
  const parts = prefix.split("/").filter((part) => part !== "");
  return parts.map((name, index) => ({ name, prefix: `${parts.slice(0, index + 1).join("/")}/` }));
}

/** The folder (relative to the bucket) that a hash path like `/files/a/b` opens. */
export function prefixFromPath(path: string): string {
  const rest = path.replace(/^\/files\/?/, "");
  if (rest === "") return "";
  const decoded = rest.split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const parts = decoded.filter((part) => part !== "");
  return parts.length === 0 ? "" : `${parts.join("/")}/`;
}

/** The hash path for a folder prefix; each segment is encoded so `#`, `?` and `%` in names survive. */
export function pathFromPrefix(prefix: string): string {
  const parts = prefix.split("/").filter((part) => part !== "");
  return parts.length === 0 ? "/files" : `/files/${parts.map(encodeURIComponent).join("/")}`;
}

export const displayName = (item: Item): string => item.name || nameOf(item.key);
