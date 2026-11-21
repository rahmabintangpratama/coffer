import { FolderPlus, FolderUp, Plus, Upload } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { ActionMenu } from "@/components/ActionMenu";
import { Button } from "@/components/Button";
import { useLayout } from "@/components/layout";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { candidatesFromInput, type UploadCandidate } from "@/features/transfers";

const icon = (Component: typeof Plus) => <Component aria-hidden="true" className="size-5 text-fg-muted" />;

/**
 * The New control (FR-35, FR-40): a 56 px FAB above the bottom nav below 768 px, a
 * button in the toolbar from 768 px. It opens New folder, Upload files and Upload
 * folder. The pickers are hidden file inputs started from the menu click, which
 * is the user gesture the browser needs.
 */
export function NewMenu({ onNewFolder, onFiles, raised }: { onNewFolder: () => void; onFiles: (candidates: UploadCandidate[]) => void; raised: boolean }) {
  const layout = useLayout();
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(candidatesFromInput(event.target.files));
    // The same file can be picked again.
    event.target.value = "";
  };

  return (
    <>
      <input ref={files} type="file" multiple hidden data-testid="upload-files-input" onChange={picked} />
      <input ref={folder} type="file" multiple hidden data-testid="upload-folder-input" {...{ webkitdirectory: "" }} onChange={picked} />
      <ActionMenu
        groups={[
          {
            id: "new",
            actions: [
              { id: "newFolder", label: t("act.newFolder"), icon: icon(FolderPlus), onSelect: onNewFolder },
              { id: "uploadFiles", label: t("act.uploadFiles"), icon: icon(Upload), onSelect: () => { files.current?.click(); } },
              { id: "uploadFolder", label: t("act.uploadFolder"), icon: icon(FolderUp), onSelect: () => { folder.current?.click(); } },
            ],
          },
        ]}
        triggerLabel={t("act.new")}
        title={t("act.new")}
        closeLabel={t("act.close")}
        component="NewMenu"
        trigger={(props) =>
          layout === "compact" ? (
            <Button
              {...props}
              variant="primary"
              iconOnly
              aria-label={t("act.new")}
              data-component="NewMenuButton"
              icon={<Plus aria-hidden="true" className="size-6" />}
              // Above the bottom nav, and above the transfer header while it is showing.
              className={cn(
                "fixed right-4 z-(--cf-z-sticky) size-(--cf-size-fab-size) rounded-full shadow-overlay",
                raised ? "bottom-[calc(var(--cf-size-bnav-height)+var(--cf-size-fab-size)+var(--cf-space-4))]" : "bottom-[calc(var(--cf-size-bnav-height)+var(--cf-space-4))]",
              )}
            />
          ) : (
            <Button {...props} variant="primary" icon={<Plus aria-hidden="true" className="size-5" />} data-component="NewMenuButton">
              {t("act.new")}
            </Button>
          )
        }
      />
    </>
  );
}
