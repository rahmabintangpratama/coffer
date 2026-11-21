import { TrashScreen } from "@/features/trash";
import type { ConnectionSummary } from "@/lib/types";
import { useToasts } from "../toast";

/** Connects the Trash feature to the app's toast store. */
export default function TrashRoute({ connection }: { connection: ConnectionSummary }) {
  const push = useToasts((state) => state.push);
  return (
    <TrashScreen
      connection={connection}
      writable={connection.access === "readWrite"}
      notify={(message, action) => { push({ message, ...(action ? { actionLabel: action.label, onAction: action.run } : {}) }); }}
    />
  );
}
