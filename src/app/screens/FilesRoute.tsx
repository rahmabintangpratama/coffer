import { FilesScreen } from "@/features/files";
// Loaded with the Files chunk, so the app bar finds its Files content ready instead of suspending (the pill must exist when "/" is pressed).
import "@/features/files/AppBarContent";
import type { ConnectionSummary } from "@/lib/types";
import { useSettings } from "../settings";
import { useToasts } from "../toast";

/** Connects the Files feature to the app's settings and toast stores. */
export default function FilesRoute({ connection }: { connection: ConnectionSummary }) {
  const { view, sort, density, showHiddenFiles, confirmTrash, update } = useSettings();
  const push = useToasts((state) => state.push);
  return (
    <FilesScreen
      connection={connection}
      settings={{ view, sort, density, showHiddenFiles, confirmTrash }}
      onSettings={update}
      notify={(message, action) => { push({ message, ...(action ? { actionLabel: action.label, onAction: action.run } : {}) }); }}
    />
  );
}
