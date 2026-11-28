import { FolderPlus, FolderUp, Upload } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import { candidatesFromInput, type UploadCandidate } from "@/features/transfers";

/** The empty folder's actions (M11): Upload files, Upload folder and New folder, right where the list would be. */
export function EmptyActions({ onFiles, onNewFolder }: { onFiles: (candidates: UploadCandidate[]) => void; onNewFolder: () => void }) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(candidatesFromInput(event.target.files));
    event.target.value = "";
  };
  return (
    <div role="group" aria-label={t("files.emptyFolder.actions")} className="mt-4 flex flex-wrap justify-center gap-2">
      <input ref={files} type="file" multiple hidden data-testid="empty-upload-files-input" onChange={picked} />
      <input ref={folder} type="file" multiple hidden data-testid="empty-upload-folder-input" {...{ webkitdirectory: "" }} onChange={picked} />
      <Button variant="primary" icon={<Upload aria-hidden="true" className="size-5" />} onClick={() => { files.current?.click(); }}>{t("act.uploadFiles")}</Button>
      <Button icon={<FolderUp aria-hidden="true" className="size-5" />} onClick={() => { folder.current?.click(); }}>{t("act.uploadFolder")}</Button>
      <Button icon={<FolderPlus aria-hidden="true" className="size-5" />} onClick={onNewFolder}>{t("act.newFolder")}</Button>
    </div>
  );
}
