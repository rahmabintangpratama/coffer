import { FilesScreen } from "@/features/files";
import type { ConnectionSummary } from "@/lib/types";
import { useSettings } from "../settings";
import { useToasts } from "../toast";

/** Connects the Files feature to the app's settings and toast stores. */
export default function FilesRoute({ connection }: { connection: ConnectionSummary }) {
  const { view, sort, density, showHiddenFiles, update } = useSettings();
  const push = useToasts((state) => state.push);
  return (
    <FilesScreen
      connection={connection}
      settings={{ view, sort, density, showHiddenFiles }}
      onSettings={update}
      notify={(message) => { push({ message }); }}
    />
  );
}
