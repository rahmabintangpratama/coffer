import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { FileIcon } from "@/components/FileIcon";
import { fileKindOf } from "@/lib/s3/keys";
import { SessionTokenNotice } from "@/components/SessionTokenNotice";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, ShareExpiry } from "@/lib/types";
import type * as S3 from "@/lib/s3";

export interface ShareTarget {
  key: string;
  name: string;
}

interface ShareDialogProps {
  connection: ConnectionSummary;
  /** The file to share; null while the dialog is closed. */
  file: ShareTarget | null;
  onClose: () => void;
  notify: (message: string) => void;
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** "15 minutes", "1 hour", "7 days": the choice as the duration the button names. */
function durationLabel(seconds: number): string {
  if (seconds >= 86_400) return t("share.expDay", { count: seconds / 86_400 });
  if (seconds >= 3600) return t("share.expHour", { count: seconds / 3600 });
  return t("share.expMinutes", { count: seconds / 60 });
}

type Loaded = typeof S3;

/**
 * Share link (FR-60, FR-61): choose how long the link lives, create it locally, show it with Copy link. The link
 * is held in this component's state only. It is not logged, stored or put in the page address (AC-60.5), and it
 * is gone when the dialog closes. The spec asks for it to be shown here once, which is the one place a presigned
 * URL is displayed.
 */
export function ShareDialog({ connection, file, onClose, notify }: ShareDialogProps) {
  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      title={file ? t("share.title", { name: file.name }) : t("act.share")}
      {...(file ? { titleIcon: <FileIcon kind={fileKindOf(file.name)} className="size-5 shrink-0" /> } : {})}
      closeLabel={t("act.close")}
    >
      {file && <ShareBody key={file.key} connection={connection} file={file} onClose={onClose} notify={notify} />}
    </Dialog>
  );
}

function ShareBody({ connection, file, onClose, notify }: { connection: ConnectionSummary; file: ShareTarget; onClose: () => void; notify: (message: string) => void }) {
  const [s3, setS3] = useState<Loaded | null>(null);
  const [limits, setLimits] = useState<S3.ShareLimitsResult | null>(null);
  const [choice, setChoice] = useState<ShareExpiry | null>(null);
  const [link, setLink] = useState<S3.ShareLink | null>(null);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Limits use the clock the provider agrees with, so they are worked out when the dialog opens and again when the link is made.
  const limitsNow = (loaded: Loaded): S3.ShareLimitsResult =>
    loaded.shareLimits({ sessionToken: vault.hasSessionToken(connection.id), sessionTokenExpiresAt: connection.sessionTokenExpiresAt, now: loaded.providerNow(loaded.clientFor(connection)) });

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/s3").then((loaded) => {
      if (cancelled) return;
      const found = limitsNow(loaded);
      setS3(loaded);
      setLimits(found);
      setChoice(loaded.defaultChoice(found));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- worked out once per opening
  }, []);

  const create = async () => {
    if (!s3 || choice === null) return;
    setFailed(false);
    try {
      const fresh = limitsNow(s3);
      setLimits(fresh);
      setLink(await s3.presignShare(s3.clientFor(connection), { bucket: connection.bucket ?? "", key: file.key, name: file.name, expiry: choice, limits: fresh }));
    } catch {
      setFailed(true);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      notify(t("toast.copied"));
    } catch {
      // No clipboard permission (or an insecure context): select the text so Ctrl+C or the share sheet can take it.
      input.current?.select();
    }
  };

  if (link) {
    return (
      <div data-component="ShareDone">
        <label htmlFor="share-link" className="block text-sm font-semibold">{t("share.link")}</label>
        <input
          id="share-link"
          ref={input}
          readOnly
          value={link.url}
          onFocus={(event) => { event.currentTarget.select(); }}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 h-(--cf-size-control-lg) w-full rounded-md border border-line bg-surface px-3 font-mono text-sm text-fg"
        />
        <p className="mt-3 text-base">{t("share.expiresAt", { date: when.format(link.expiresAt) })}</p>
        <p className="mt-1 text-sm text-fg-muted">{t("share.invalidate")}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
          <Button variant="secondary" onClick={onClose}>{t("act.done")}</Button>
          <Button variant="primary" icon={<Copy aria-hidden="true" className="size-5" />} onClick={() => void copy()}>{t("act.copyLink")}</Button>
        </div>
      </div>
    );
  }

  const none = limits !== null && s3 !== null && s3.allowedChoices(limits).length === 0;
  return (
    <div data-component="ShareChoose">
      <p className="text-base">{t("share.body")}</p>
      {limits?.reason === "sessionToken" && (
        <div className="mt-4">
          <SessionTokenNotice title={t("share.session.title")}>
            {none
              ? t("share.session.none")
              : limits.tokenSecondsLeft === null
                ? t("share.session.unknown")
                : t("share.session.body", { time: when.format(new Date(connection.sessionTokenExpiresAt ?? 0)), minutes: Math.floor(limits.tokenSecondsLeft / 60) })}
          </SessionTokenNotice>
        </div>
      )}
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t("share.expiry")}</legend>
        {(s3?.SHARE_CHOICES ?? []).map(({ id, seconds }) => {
          const allowed = limits !== null && seconds <= limits.maxSeconds;
          return (
            // aria-disabled, not disabled: the choice stays in the tab order and in the page, so the cap is explained and not hidden (AC-61.2).
            <label key={id} className={cn("flex min-h-(--cf-size-touch-min) items-center gap-3 rounded-md border border-line p-3 has-checked:border-accent has-checked:bg-selected", allowed ? "cursor-pointer" : "cursor-not-allowed text-fg-disabled")}>
              <input
                type="radio"
                name="share-expiry"
                value={id}
                checked={choice === id}
                aria-disabled={!allowed}
                onChange={() => { if (allowed) setChoice(id); }}
                className="size-4 accent-accent"
              />
              <span>{durationLabel(seconds)}</span>
            </label>
          );
        })}
      </fieldset>
      {failed && <Banner tone="danger" className="mt-4">{t("share.error")}</Banner>}
      <div className="mt-6 flex flex-col-reverse gap-2 @md:flex-row @md:justify-end">
        <Button variant="secondary" onClick={onClose}>{t("act.cancel")}</Button>
        <Button variant="primary" disabled={choice === null || s3 === null} onClick={() => void create()}>
          {choice === null ? t("act.share") : t("share.create", { duration: durationLabel(s3?.secondsOf(choice) ?? 0) })}
        </Button>
      </div>
    </div>
  );
}
