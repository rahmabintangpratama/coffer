import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { type PointerEvent, type WheelEvent, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { NoPreview } from "./NoPreview";
import { type PreviewViewProps, typeLabelOf } from "./types";
import { useMediaSource } from "./source";

const MIN = 1;
const MAX = 6;
const STEP = 1.5;
const SWIPE_PX = 60;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A raster image from a presigned link (or a blob on a loopback endpoint): fit to
 * the screen, zoom with the buttons, the wheel, a pinch or a double tap, and drag
 * to pan while zoomed. At fit size a horizontal swipe moves to the next file
 * (design: ux-patterns, gestures). A format the browser cannot draw falls to FR-58.
 */
export function ImageView({ connection, file, onSwipe, onDownload }: PreviewViewProps & { connection: ConnectionSummary; file: FileItem }) {
  const { source, retry } = useMediaSource(connection, file, 300);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDistance: number; startScale: number; startX: number; startY: number; moved: boolean } | null>(null);

  const zoomTo = (next: number) => {
    const value = clamp(next);
    setScale(value);
    if (value === 1) setOffset({ x: 0, y: 0 });
  };

  const down = (event: PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const [first, second] = [...pointers.current.values()];
    gesture.current = { startDistance: first && second ? distance(first, second) : 0, startScale: scale, startX: event.clientX, startY: event.clientY, moved: false };
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [first, second] = [...pointers.current.values()];
    if (first && second && gesture.current.startDistance > 0) {
      zoomTo(gesture.current.startScale * (distance(first, second) / gesture.current.startDistance));
      gesture.current.moved = true;
    } else if (scale > 1) {
      setOffset((current) => ({ x: current.x + event.clientX - previous.x, y: current.y + event.clientY - previous.y }));
      gesture.current.moved = true;
    }
  };
  const up = (event: PointerEvent) => {
    const start = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0 || !start) return;
    gesture.current = null;
    const dx = event.clientX - start.startX;
    const dy = event.clientY - start.startY;
    if (scale === 1 && !start.moved && event.pointerType === "touch" && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 2) onSwipe(dx < 0 ? 1 : -1);
  };
  const wheel = (event: WheelEvent) => { zoomTo(scale * (event.deltaY < 0 ? STEP : 1 / STEP)); };

  if (failed || source.state === "error") return <NoPreview type={typeLabelOf(file)} onDownload={onDownload} />;
  if (source.state === "loading") return <p role="status" className="text-(--cf-color-inverse-muted)">{t("pv.loading")}</p>;

  return (
    <div className="relative flex size-full items-center justify-center overflow-hidden">
      <div
        data-component="ImageStage"
        className="flex size-full touch-none items-center justify-center"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={wheel}
        onDoubleClick={() => { zoomTo(scale > 1 ? 1 : 2.5); }}
      >
        <img
          src={source.value}
          alt={t("pv.image.alt", { name: file.name })}
          draggable={false}
          onError={() => {
            // A link can expire or the first request can fail: sign one new link, then give up.
            if (retried) setFailed(true);
            else {
              setRetried(true);
              retry();
            }
          }}
          style={{ transform: `translate(${offset.x.toString()}px, ${offset.y.toString()}px) scale(${scale.toString()})` }}
          className="max-h-full max-w-full object-contain select-none"
        />
      </div>
      <div role="group" aria-label={t("pv.zoomLabel")} className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-(--cf-color-inverse-hover) p-1">
        <Button variant="ghost" iconOnly aria-label={t("pv.zoomOut")} disabled={scale <= MIN} icon={<ZoomOut aria-hidden="true" className="size-5" />} onClick={() => { zoomTo(scale / STEP); }} />
        <Button variant="ghost" iconOnly aria-label={t("pv.fit")} disabled={scale === 1} icon={<Maximize aria-hidden="true" className="size-5" />} onClick={() => { zoomTo(1); }} />
        <Button variant="ghost" iconOnly aria-label={t("pv.zoomIn")} disabled={scale >= MAX} icon={<ZoomIn aria-hidden="true" className="size-5" />} onClick={() => { zoomTo(scale * STEP); }} />
      </div>
    </div>
  );
}
