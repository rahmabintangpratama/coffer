import type { UploadCandidate } from "./plan";

/** Files from `<input type=file>`: a folder pick carries `webkitRelativePath` (`folder/sub/a.txt`), a file pick only its name. */
export function candidatesFromInput(files: FileList | null): UploadCandidate[] {
  return Array.from(files ?? [], (file) => ({ file, path: file.webkitRelativePath === "" ? file.name : file.webkitRelativePath }));
}

const readEntries = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => { reader.readEntries(resolve, reject); });

async function walk(entry: FileSystemEntry, into: UploadCandidate[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => { (entry as FileSystemFileEntry).file(resolve, reject); });
    // `fullPath` starts with "/" and holds the dropped folder's own name, so folders keep their structure.
    into.push({ file, path: entry.fullPath.replace(/^\//, "") });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns a page at a time (about 100) until it returns an empty one.
  for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
    for (const child of batch) await walk(child, into);
  }
}

/** Files and folders from a drop (AC-40.2). Folders keep their relative paths; empty folders are not uploaded (technical-spec 7). */
export async function candidatesFromDrop(transfer: DataTransfer): Promise<UploadCandidate[]> {
  // The entries and files must be taken synchronously, before the first await: the DataTransfer is cleared after the event.
  const items = Array.from(transfer.items, (item) => ({ entry: item.webkitGetAsEntry(), file: item.getAsFile() }));
  if (items.every((item) => item.entry === null)) return candidatesFromInput(transfer.files);
  const out: UploadCandidate[] = [];
  for (const { entry, file } of items) {
    if (entry === null) continue;
    try {
      await walk(entry, out);
    } catch {
      // Some engines hand out an entry they cannot read (a synthetic drop); a plain file still has its File.
      if (entry.isFile && file) out.push({ file, path: file.name });
    }
  }
  return out;
}
