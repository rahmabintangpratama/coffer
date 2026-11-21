/**
 * Copy is split by its top-level group (`ob`, `files`, ...). The core groups are
 * in the first bundle because the shell uses them; every other group is its own
 * chunk that a feature loads before it renders (loadCopyGroups). Add a group
 * here only if the shell itself needs it on the first screen.
 */
export const CORE_GROUPS = ["act", "app", "main", "nav", "set", "toast"] as const;

export type CoreGroup = (typeof CORE_GROUPS)[number];
