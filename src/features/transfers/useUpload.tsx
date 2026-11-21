import { useCallback, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import type { ConnectionSummary } from "@/lib/types";
import { ConflictDialog } from "./ConflictDialog";
import { type UploadCandidate, planUploads } from "./plan";
import { startUploads } from "./queue";
import { type ConflictAnswer, type ConflictQuestion, resolveConflicts } from "./resolve";

export interface UseUploadOptions {
  connection: ConnectionSummary;
  /** The folder uploads go into: a prefix under the bucket, "" or ending in "/". */
  folderPrefix: string;
  /** The folder's name for dialogs. */
  folderName: string;
  notify: (message: string) => void;
  /** Every file of a batch has finished (the listing should reload). */
  onUploaded: () => void;
}

/**
 * Starts uploads into one folder: checks names, asks about conflicts once per
 * batch, then hands the rest to the queue. Returns the function to call and the
 * conflict dialog to render.
 */
export function useUpload({ connection, folderPrefix, folderName, notify, onUploaded }: UseUploadOptions) {
  const [question, setQuestion] = useState<ConflictQuestion | null>(null);
  const waiting = useRef<((answer: ConflictAnswer) => void) | null>(null);

  const ask = useCallback(
    (next: ConflictQuestion) =>
      new Promise<ConflictAnswer>((resolve) => {
        waiting.current = resolve;
        setQuestion(next);
      }),
    [],
  );
  const answer = useCallback((value: ConflictAnswer) => {
    setQuestion(null);
    waiting.current?.(value);
    waiting.current = null;
  }, []);

  const upload = useCallback(
    async (candidates: UploadCandidate[]) => {
      if (candidates.length === 0) return;
      const { planned, rejected } = planUploads(folderPrefix, candidates);
      const first = rejected[0];
      if (first) {
        notify(rejected.length === 1 ? t("upl.rejected.one", { name: first.path }) : t("upl.rejected.many", { count: rejected.length }));
      }
      if (planned.length === 0) return;
      try {
        const { clientFor, existingKeys } = await import("@/lib/s3");
        const client = clientFor(connection);
        const bucket = connection.bucket ?? "";
        const existing = await existingKeys(client, { bucket, keys: planned.map((item) => item.key) });
        const final = await resolveConflicts(planned, existing, ask, (keys) => existingKeys(client, { bucket, keys }));
        startUploads(connection, final, folderName, onUploaded);
      } catch {
        notify(t("upl.checkError"));
      }
    },
    [ask, connection, folderName, folderPrefix, notify, onUploaded],
  );

  const dialog = <ConflictDialog question={question} folder={folderName} onAnswer={answer} />;
  return { upload, dialog };
}
