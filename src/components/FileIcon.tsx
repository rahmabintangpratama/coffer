import { Archive, File, FileAudio, FileCode, FileImage, FileText, FileVideo, Folder, type LucideIcon } from "lucide-react";
import type { FileKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const icons: Record<FileKind, LucideIcon> = {
  image: FileImage,
  svg: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  markdown: FileText,
  html: FileCode,
  code: FileCode,
  archive: Archive,
  unknown: File,
};

/** A decorative icon by kind: the name beside it carries the meaning. */
export function FileIcon({ kind, className }: { kind: FileKind | "folder"; className?: string }) {
  const Icon = kind === "folder" ? Folder : icons[kind];
  return <Icon aria-hidden="true" className={cn("size-6 shrink-0", kind === "folder" ? "text-accent" : "text-fg-muted", className)} />;
}
