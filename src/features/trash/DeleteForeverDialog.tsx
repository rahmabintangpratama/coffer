import { useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { HiddenCharsNotice } from "@/components/HiddenCharsNotice";
import { t } from "@/lib/i18n";
import type { TrashItem } from "./model";

export type DeleteRequest = { kind: "keys"; items: TrashItem[] } | { kind: "empty"; count: number };

/** Above this many items the count must be typed (AC-71.2). */
export const TYPED_COUNT_OVER = 50;

export const needsTypedCount = (request: DeleteRequest): boolean => request.kind === "empty" || request.items.length > TYPED_COUNT_OVER;

const countOf = (request: DeleteRequest): number => (request.kind === "empty" ? request.count : request.items.length);

function Body({ request, bucket, onClose, onConfirm }: { request: DeleteRequest; bucket: string; onClose: () => void; onConfirm: (request: DeleteRequest) => void }) {
  const [typed, setTyped] = useState("");
  const count = countOf(request);
  const typedCount = needsTypedCount(request);
  const ready = !typedCount || typed.trim() === count.toString();
  const body =
    request.kind === "empty"
      ? t("del.empty.body", { count })
      : count === 1
        ? t("del.one.body", { name: request.items[0]?.name ?? "", bucket })
        : t("del.bulk.body", { count, bucket });
  return (
    <>
      <p className="text-base">{body}</p>
      {request.kind === "keys" && <HiddenCharsNotice names={request.items.map((item) => item.name)} className="mt-3" />}
      {typedCount && (
        <label className="mt-4 block">
          <span className="block text-sm font-semibold">{t("del.typeCount", { count })}</span>
          <input
            value={typed}
            onChange={(event) => { setTyped(event.target.value); }}
            inputMode="numeric"
            autoComplete="off"
            className="mt-1 h-11 w-full rounded-md border border-line bg-surface px-3"
          />
          {request.kind === "keys" && <span className="mt-1 block text-sm text-fg-muted">{t("del.bulk.hint")}</span>}
        </label>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t("act.cancel")}</Button>
        <Button variant="danger" disabled={!ready} onClick={() => { onConfirm(request); }}>{t("del.forever")}</Button>
      </div>
    </>
  );
}

/** Delete forever and Empty trash (FR-71): names the item and bucket, says it can't be undone, and gates big deletes on the typed count. */
export function DeleteForeverDialog({ request, bucket, onClose, onConfirm }: { request: DeleteRequest | null; bucket: string; onClose: () => void; onConfirm: (request: DeleteRequest) => void }) {
  const count = request ? countOf(request) : 0;
  const title = request?.kind === "empty" ? t("del.empty.title") : count === 1 ? t("del.one.title") : t("del.bulk.title", { count });
  return (
    <Dialog open={request !== null} onClose={onClose} title={title} closeLabel={t("act.close")}>
      {/* Keyed by the request so the typed text starts empty every time. */}
      {request && <Body key={request.kind === "empty" ? "empty" : request.items.map((item) => item.key).join("|")} request={request} bucket={bucket} onClose={onClose} onConfirm={onConfirm} />}
    </Dialog>
  );
}
