import { useCallback, useState } from "react";
import type { ConnectionSummary } from "@/lib/types";
import { ShareDialog, type ShareTarget } from "./ShareDialog";

/** Share link (FR-60): `share` opens the dialog for one file. Folders and several items never get here (AC-60.4). */
export function useShareAction({ connection, notify }: { connection: ConnectionSummary; notify: (message: string) => void }) {
  const [file, setFile] = useState<ShareTarget | null>(null);
  const share = useCallback((target: ShareTarget) => { setFile(target); }, []);
  const dialog = <ShareDialog connection={connection} file={file} onClose={() => { setFile(null); }} notify={notify} />;
  return { share, dialog };
}
