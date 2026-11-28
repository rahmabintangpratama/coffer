import { StarredScreen } from "@/features/library";
import type { ConnectionSummary } from "@/lib/types";
import { useToasts } from "../toast";

/** Connects the Starred view (FR-80) to the app's toast store. */
export default function StarredRoute({ connection }: { connection: ConnectionSummary }) {
  const push = useToasts((state) => state.push);
  return <StarredScreen connection={connection} notify={(message) => { push({ message }); }} />;
}
