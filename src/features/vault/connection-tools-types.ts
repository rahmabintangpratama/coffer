import type { ConnectionSummary, ConnectionTestStep } from "@/lib/types";

/** What Settings → Connections needs from the app to add, test and rename (M11). */
export interface ConnectionTools {
  /** The provider's display name, for the row subtitle (the presets load with the app, not with this page's module). */
  providerName: (connection: ConnectionSummary) => string;
  /** Start the onboarding flow for another connection. */
  add: () => void;
  test: (connection: ConnectionSummary, onStep: (step: ConnectionTestStep) => void, signal: AbortSignal) => Promise<{ steps: ConnectionTestStep[] }>;
  rename: (connection: ConnectionSummary, name: string) => Promise<ConnectionSummary>;
}
