import { TrashScreen } from "@/features/trash";
import type { ConnectionSummary } from "@/lib/types";
import { useSession } from "../session";
import { useToasts } from "../toast";

/** Connects the Trash feature to the app's toast store. */
export default function TrashRoute({ connection }: { connection: ConnectionSummary }) {
  const push = useToasts((state) => state.push);
  const startAdding = useSession((state) => state.startAdding);
  return (
    <TrashScreen
      connection={connection}
      writable={connection.access === "readWrite"}
      onUseAnotherKey={startAdding}
      notify={(message, action) => { push({ message, ...(action ? { actionLabel: action.label, onAction: action.run } : {}) }); }}
    />
  );
}
