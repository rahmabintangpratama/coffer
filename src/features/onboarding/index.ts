export { OnboardingFlow } from "./OnboardingFlow";
// Settings → Connections runs the same test and shows the same rows (M11).
export { pendingSteps, stepRows } from "./test-rows";
export type { EditActions, EditPlan } from "./edit-types";
/** Edit connection loads when it is opened: it holds the form, which Welcome and Unlock must not load. */
export const loadEditConnectionFlow = () => import("./EditConnectionFlow");
