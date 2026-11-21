import { ChevronDown, ChevronRight, Folder, LoaderCircle } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TreeFolder {
  /** The folder's prefix: "" for the root, otherwise ending in "/". */
  prefix: string;
  name: string;
}

type Load = { state: "error" } | { state: "ready"; folders: TreeFolder[] };

export interface FolderTreeProps {
  /** The root node: its label (the bucket) and prefix. */
  root: TreeFolder;
  loadChildren: (prefix: string) => Promise<TreeFolder[]>;
  value: string;
  onChange: (prefix: string) => void;
  /** A folder that cannot be the destination (the current location, the moved folder and its children). */
  isDisabled: (prefix: string) => boolean;
  /** Marks one folder as where the items are now. */
  currentPrefix?: string;
  currentLabel: string;
  label: string;
  loadingLabel: string;
  errorLabel: string;
  /** Folders to reload after the caller created one. Changing it reloads the open nodes. */
  reloadKey?: number;
}

interface Row {
  folder: TreeFolder;
  level: number;
  expanded: boolean;
  hasChildren: boolean | null;
}

/**
 * The destination picker for Move (design: FolderTree): role=tree, folders load when
 * opened, arrow keys walk the visible nodes, Right opens and Left closes, Enter or
 * Space chooses. The current location is marked and cannot be chosen.
 */
export function FolderTree(props: FolderTreeProps) {
  const { root, loadChildren, value, onChange, isDisabled, currentPrefix, currentLabel, label, loadingLabel, errorLabel, reloadKey = 0 } = props;
  const [loads, setLoads] = useState<Record<string, Load>>({});
  // The tree opens along the way to the current location, so where the items are now is in view and its folders are the first choices.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const open = new Set([root.prefix]);
    if (currentPrefix !== undefined) {
      const parts = currentPrefix.split("/").filter((part) => part !== "");
      for (let index = 1; index <= parts.length; index += 1) open.add(`${parts.slice(0, index).join("/")}/`);
    }
    return open;
  });
  const [focused, setFocused] = useState(root.prefix);
  const tree = useRef<HTMLUListElement>(null);
  const idBase = useId();

  const inflight = useRef(new Set<string>());

  // Changing reloadKey (a folder was created) drops what was loaded; the open nodes load again below. Adjusted while rendering.
  const [seenReload, setSeenReload] = useState(reloadKey);
  if (seenReload !== reloadKey) {
    setSeenReload(reloadKey);
    setLoads({});
  }
  // Declared before the loading effect, so it runs first: what was in flight belongs to the old epoch.
  useEffect(() => {
    inflight.current.clear();
  }, [reloadKey]);

  // An open node whose children are not known yet loads them. The "loading" look is simply "open and not loaded".
  useEffect(() => {
    for (const prefix of expanded) {
      if (prefix in loads || inflight.current.has(prefix)) continue;
      inflight.current.add(prefix);
      loadChildren(prefix).then(
        (folders) => { inflight.current.delete(prefix); setLoads((current) => ({ ...current, [prefix]: { state: "ready", folders } })); },
        () => { inflight.current.delete(prefix); setLoads((current) => ({ ...current, [prefix]: { state: "error" } })); },
      );
    }
  }, [expanded, loads, loadChildren]);

  const toggle = (prefix: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
    // Opening a node that failed to load tries again.
    if (loads[prefix]?.state === "error") {
      setLoads((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== prefix)));
    }
  };

  // A flat list of the visible nodes, in order.
  const rows: Row[] = [];
  const walk = (folder: TreeFolder, level: number) => {
    const state = loads[folder.prefix];
    const open = expanded.has(folder.prefix);
    rows.push({ folder, level, expanded: open, hasChildren: state?.state === "ready" ? state.folders.length > 0 : null });
    if (open && state?.state === "ready") for (const child of state.folders) walk(child, level + 1);
  };
  walk(root, 1);

  const move = (to: number) => {
    const target = rows[Math.min(rows.length - 1, Math.max(0, to))];
    if (!target) return;
    setFocused(target.folder.prefix);
    requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-prefix="${CSS.escape(target.folder.prefix)}"]`)?.focus());
  };

  const onKeyDown = (event: KeyboardEvent, row: Row, index: number) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(index - 1); }
    else if (event.key === "Home") { event.preventDefault(); move(0); }
    else if (event.key === "End") { event.preventDefault(); move(rows.length - 1); }
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (!row.expanded) toggle(row.folder.prefix);
      else move(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (row.expanded && row.folder.prefix !== root.prefix) toggle(row.folder.prefix);
      else {
        const parent = [...rows.slice(0, index)].reverse().findIndex((candidate) => candidate.level < row.level);
        if (parent >= 0) move(index - 1 - parent);
      }
    } else if ((event.key === "Enter" || event.key === " ") && !isDisabled(row.folder.prefix)) {
      event.preventDefault();
      onChange(row.folder.prefix);
    }
  };

  return (
    <ul ref={tree} role="tree" aria-label={label} data-component="FolderTree" className="flex flex-col">
      {rows.map((row, index) => {
        const prefix = row.folder.prefix;
        const state = loads[prefix];
        const open = row.expanded;
        const disabled = isDisabled(prefix);
        const selected = value === prefix;
        return (
          <li
            key={prefix === "" ? "root" : prefix}
            role="treeitem"
            aria-level={row.level}
            // The visible name sits in an aria-hidden button (the row is the one control), so the item is named from those texts:
            // the name is exactly what is drawn, which is what a voice-control user says (WCAG 2.5.3).
            aria-labelledby={prefix === currentPrefix ? `${idBase}-n${index.toString()} ${idBase}-c${index.toString()}` : `${idBase}-n${index.toString()}`}
            aria-selected={selected}
            aria-disabled={disabled}
            aria-expanded={row.hasChildren === false ? undefined : row.expanded}
            data-prefix={prefix}
            tabIndex={prefix === focused ? 0 : -1}
            onKeyDown={(event) => { event.stopPropagation(); onKeyDown(event, row, index); }}
            onFocus={() => { setFocused(prefix); }}
            className="list-none outline-none"
          >
            <div
              className={cn(
                "flex min-h-(--cf-size-touch-min) items-center gap-1 rounded-sm pr-2 @md:min-h-(--cf-size-control-md)",
                selected ? "bg-selected" : disabled ? "text-fg-disabled" : "hover:bg-hover",
                "in-[li:focus-visible]:outline-2 in-[li:focus-visible]:-outline-offset-2 in-[li:focus-visible]:outline-focus",
              )}
              // Indentation by level in steps of one spacing token, set through the CSSOM like the list rows.
              style={{ paddingLeft: `calc(var(--cf-space-2) + ${(row.level - 1).toString()} * var(--cf-space-5))` }}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => { toggle(prefix); }}
                className="flex size-6 shrink-0 items-center justify-center"
              >
                {open && state === undefined ? (
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                ) : row.hasChildren === false ? null : row.expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                disabled={disabled}
                onClick={() => { onChange(prefix); setFocused(prefix); }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
              >
                <Folder aria-hidden="true" className={cn("size-5 shrink-0", disabled ? "text-fg-disabled" : "text-accent")} />
                <span id={`${idBase}-n${index.toString()}`} className="truncate">{row.folder.name}</span>
                {prefix === currentPrefix && <span id={`${idBase}-c${index.toString()}`} className="shrink-0 text-sm text-fg-muted">{currentLabel}</span>}
              </button>
            </div>
            {row.expanded && state === undefined && <p role="status" className="sr-only">{loadingLabel}</p>}
            {row.expanded && state?.state === "error" && (
              <p role="alert" className="py-1 text-sm text-danger-fg" style={{ paddingLeft: `calc(var(--cf-space-2) + ${row.level.toString()} * var(--cf-space-5))` }}>{errorLabel}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
