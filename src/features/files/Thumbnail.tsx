import { useEffect, useRef, useState } from "react";
import { FileIcon } from "@/components/FileIcon";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { thumbnailFor, wantsThumbnail } from "./thumbnails";

/** A tile's picture: the type icon until the tile is near the viewport and its thumbnail is ready; the icon again on any failure. Decorative (the name is the label). */
export function Thumbnail({ connection, file }: { connection: ConnectionSummary; file: FileItem }) {
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<{ key: string; value: string } | null>(null);
  const wanted = wantsThumbnail(file);
  useEffect(() => {
    const element = box.current;
    if (!wanted || !element || typeof IntersectionObserver === "undefined") return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void thumbnailFor(connection, file).then((value) => { if (!cancelled && value) setUrl({ key: file.key, value }); });
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [connection, file, wanted]);
  const [broken, setBroken] = useState<string | null>(null);
  const shown = url?.key === file.key && broken !== url.value ? url.value : null;
  return (
    <div ref={box} data-component="Thumbnail" className="flex flex-1 items-center justify-center overflow-hidden bg-subtle">
      {shown ? <img src={shown} alt="" draggable={false} className="h-full w-full object-cover" onError={() => { setBroken(shown); }} /> : <FileIcon kind={file.fileKind} className="size-10" />}
    </div>
  );
}
