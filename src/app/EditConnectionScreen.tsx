import { lazy, Suspense, useMemo } from "react";
import { loadEditConnectionFlow } from "@/features/onboarding";
import { t } from "@/lib/i18n";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { editActions } from "./edit-connection";
import { useSession } from "./session";
import { useToasts } from "./toast";
import { useAutoLock } from "./useAutoLock";

const EditConnectionFlow = lazy(loadEditConnectionFlow);

/** Edit connection, in place of the app until it is saved or cancelled. The keys stay open, so auto-lock stays on. */
export default function EditConnectionScreen({ connection }: { connection: ConnectionSummary }) {
  useAutoLock();
  const actions = useMemo(() => editActions(connection), [connection]);
  return (
    <div className="cf-root min-h-dvh">
      <div className="cf-app flex min-h-dvh flex-col bg-app text-fg">
        <Suspense fallback={<div aria-busy="true" className="min-h-dvh" />}>
          <EditConnectionFlow
            connection={connection}
            actions={actions}
            onCancel={() => { useSession.getState().stopEditing(); }}
            onDone={({ connection: next, oldRemoved }) => {
              void vault.saved().catch(() => null).then((saved) => {
                const session = useSession.getState();
                if (saved) session.setSaved(saved);
                useToasts.getState().push({ message: t(oldRemoved ? "conn.edited" : "conn.editedOldKept", { name: next.name }) });
                // The open connection follows its edit; another one stays open as it was.
                if (session.connection?.id === connection.id) {
                  session.connect(next);
                }
                session.stopEditing();
              });
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
