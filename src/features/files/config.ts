/** Items shown before the banner asks for "Load all" (AC-21.1). */
export const INITIAL_LIMIT = 2000;

const configured = Number.parseInt(import.meta.env.VITE_COFFER_LOAD_ALL_CAP ?? "", 10);

/** Keys that "Load all" stops at (AC-21.3). The e2e build lowers it with VITE_COFFER_LOAD_ALL_CAP so the cap message can be shown without 100,000 objects. */
export const LOAD_ALL_CAP = Number.isFinite(configured) && configured > INITIAL_LIMIT ? configured : 100_000;
