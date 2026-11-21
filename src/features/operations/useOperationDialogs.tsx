import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, TextInput } from "@/components/Field";
import { FolderTree, type TreeFolder } from "@/components/FolderTree";
import { useConflictPrompt } from "@/features/transfers";
import { t } from "@/lib/i18n";
import { folderNameProblem, type KeyProblem, keyProblem } from "@/lib/s3/keys";
import type { ConnectionSummary } from "@/lib/types";
import { type RunHooks, startOperation } from "./run";
import { copyCandidate, decideTargets, type ItemRef, type Move, stemLength, targetIn } from "./targets";

async function s3() {
  return import("@/lib/s3");
}

/** Whether a key, or any object under a folder prefix, exists (AC-32.3: a clash is asked about, never overwritten silently). */
async function exists(connection: ConnectionSummary, key: string): Promise<boolean> {
  const { clientFor, existingKeys, listPage } = await s3();
  const client = clientFor(connection);
  const bucket = connection.bucket ?? "";
  if (!key.endsWith("/")) return (await existingKeys(client, { bucket, keys: [key] })).has(key);
  const page = await listPage(client, { bucket, prefix: key, root: "" });
  return page.count > 0 || page.files.length > 0;
}

const problemText = (problem: KeyProblem, name: string, slashKey: "dlg.rename.err.slash" | "dlg.copy.err.slash") => {
  if (problem === "slash") return t(slashKey);
  if (problem === "tooLong") return t("dlg.rename.err.tooLong");
  if (problem === "empty") return name.trim() === "" ? t("dlg.rename.err.empty") : t("dlg.rename.err.invalid");
  return t("dlg.rename.err.invalid");
};

export interface DialogOptions {
  connection: ConnectionSummary;
  /** The folder being shown: an absolute prefix, "" or ending in "/". */
  folderPrefix: string;
  /** The folder's display name, for the copy hint and the conflict dialog. */
  folderName: string;
  /** The connection root: the Move tree starts here. */
  root: string;
  hooks: RunHooks;
}

/**
 * Rename, Make a copy and Move (FR-32, FR-33, FR-34): the three dialogs, their name and clash
 * checks, and the start of the journaled operation. Returns the openers and the elements to render.
 */
export function useOperationDialogs({ connection, folderPrefix, folderName, root, hooks }: DialogOptions) {
  const [renaming, setRenaming] = useState<ItemRef | null>(null);
  const [copying, setCopying] = useState<ItemRef | null>(null);
  const [moving, setMoving] = useState<ItemRef[] | null>(null);
  const { ask, dialog: conflictDialog } = useConflictPrompt(folderName);

  const decide = useCallback(
    (moves: Move[]) => decideTargets(moves, (key) => exists(connection, key), ask),
    [ask, connection],
  );

  const dialogs = (
    <>
      {conflictDialog}
      <RenameDialog item={renaming} folderPrefix={folderPrefix} onClose={() => { setRenaming(null); }} decide={decide} connection={connection} hooks={hooks} />
      <CopyDialog item={copying} folderPrefix={folderPrefix} folderName={folderName} onClose={() => { setCopying(null); }} decide={decide} connection={connection} hooks={hooks} />
      <MoveDialog items={moving} folderPrefix={folderPrefix} root={root} onClose={() => { setMoving(null); }} decide={decide} connection={connection} hooks={hooks} />
    </>
  );
  return {
    rename: setRenaming,
    copy: setCopying,
    move: (items: ItemRef[]) => { setMoving(items); },
    dialogs,
  };
}

interface DialogProps {
  connection: ConnectionSummary;
  hooks: RunHooks;
  decide: (moves: Move[]) => Promise<Move[]>;
  onClose: () => void;
  folderPrefix: string;
}

function RenameDialog({ item, folderPrefix, onClose, decide, connection, hooks }: DialogProps & { item: ItemRef | null }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [startedFor, setStartedFor] = useState<string | null>(null);

  // The name starts as the item's own. Adjusted while rendering, when the item changes.
  if (item && startedFor !== item.key) {
    setStartedFor(item.key);
    setName(item.name);
  }
  // The extension stays out of the selection, so typing replaces the stem (FR-32).
  useEffect(() => {
    if (!item) return;
    const frame = requestAnimationFrame(() => { input.current?.setSelectionRange(0, stemLength(item.name)); });
    return () => { cancelAnimationFrame(frame); };
  }, [item]);

  const close = () => {
    setStartedFor(null);
    setName("");
    setError(null);
    onClose();
  };
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!item) return;
    const trimmed = name.trim();
    const problem = trimmed === "" ? ("empty" as const) : item.kind === "folder" ? folderNameProblem(trimmed, folderPrefix) : trimmed.includes("/") ? ("slash" as const) : keyProblem(`${folderPrefix}${trimmed}`);
    if (problem !== null) {
      setError(problemText(problem, trimmed, "dlg.rename.err.slash"));
      return;
    }
    if (trimmed === item.name) {
      close();
      return;
    }
    setBusy(true);
    try {
      const moves = await decide([{ source: item.key, target: targetIn(folderPrefix, { ...item, name: trimmed }) }]);
      for (const move of moves) startOperation({ connection, kind: "rename", source: move.source, target: move.target }, hooks);
      close();
    } catch {
      setError(t("op.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={item !== null} onClose={close} title={t("act.rename")} closeLabel={t("act.close")}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Field label={t("dlg.rename.label")} error={error ?? undefined}>
          <TextInput ref={input} value={name} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => { setName(event.target.value); setError(null); }} />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={close}>{t("act.cancel")}</Button>
          <Button type="submit" variant="primary" loading={busy}>{t("dlg.rename.confirm")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function CopyDialog({ item, folderPrefix, folderName, onClose, decide, connection, hooks }: DialogProps & { item: ItemRef | null; folderName: string }) {
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The proposal is `name (copy).ext`, then `(copy 2)` and on until a name is free (AC-33.1, AC-33.3).
  useEffect(() => {
    if (!item) return;
    const flag = { cancelled: false };
    void (async () => {
      setChecking(true);
      let proposal = copyCandidate(item.name, 1);
      for (let n = 1; n < 50; n += 1) {
        proposal = copyCandidate(item.name, n);
        if (!(await exists(connection, `${folderPrefix}${proposal}`))) break;
      }
      if (!flag.cancelled) {
        setName(proposal);
        setChecking(false);
      }
    })().catch(() => { if (!flag.cancelled) setChecking(false); });
    return () => { flag.cancelled = true; };
  }, [item, connection, folderPrefix]);

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!item) return;
    const trimmed = name.trim();
    const problem = trimmed === "" ? ("empty" as const) : trimmed.includes("/") ? ("slash" as const) : keyProblem(`${folderPrefix}${trimmed}`);
    if (problem !== null) {
      setError(problemText(problem, trimmed, "dlg.copy.err.slash"));
      return;
    }
    setBusy(true);
    try {
      const moves = await decide([{ source: item.key, target: `${folderPrefix}${trimmed}` }]);
      for (const move of moves) startOperation({ connection, kind: "copy", source: move.source, target: move.target }, hooks);
      close();
    } catch {
      setError(t("op.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={item !== null} onClose={close} title={t("act.makeCopy")} closeLabel={t("act.close")}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Field label={t("dlg.copy.label")} hint={checking ? t("dlg.copy.checking") : t("dlg.copy.hint", { folder: folderName })} error={error ?? undefined}>
          <TextInput value={name} disabled={checking} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => { setName(event.target.value); setError(null); }} />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={close}>{t("act.cancel")}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={checking}>{t("dlg.copy.confirm")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({ items, folderPrefix, root, onClose, decide, connection, hooks }: DialogProps & { items: ItemRef[] | null; root: string }) {
  const [destination, setDestination] = useState(folderPrefix);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<ItemRef[] | null>(null);

  // Each time the dialog opens, the destination starts at the folder the items are in.
  if (items !== opened) {
    setOpened(items);
    if (items) {
      setDestination(folderPrefix);
      setCreating(false);
      setNewName("");
      setError(null);
    }
  }

  const loadChildren = useCallback(
    async (prefix: string): Promise<TreeFolder[]> => {
      const { clientFor, listPage } = await s3();
      const client = clientFor(connection);
      const folders: TreeFolder[] = [];
      let token: string | undefined;
      do {
        const page = await listPage(client, { bucket: connection.bucket ?? "", prefix, root, ...(token === undefined ? {} : { token }) });
        for (const folder of page.folders) folders.push({ prefix: folder.key, name: folder.name });
        token = page.nextToken;
      } while (token !== undefined);
      return folders;
    },
    [connection, root],
  );

  const moved = useMemo(() => items ?? [], [items]);
  const inside = (prefix: string) => moved.some((item) => item.kind === "folder" && prefix.startsWith(item.key));
  const isCurrent = destination === folderPrefix;
  const isInside = inside(destination);
  const blocked = isCurrent || isInside;
  const reason = isInside ? t("dlg.move.err.inside") : isCurrent ? t("dlg.move.err.same") : null;

  const close = () => {
    setOpened(null);
    onClose();
  };
  const createFolder = async (event: SyntheticEvent) => {
    event.preventDefault();
    const trimmed = newName.trim();
    const problem = folderNameProblem(trimmed, destination);
    if (problem !== null) {
      setError(problemText(problem, trimmed, "dlg.rename.err.slash"));
      return;
    }
    try {
      const { clientFor, putFolder } = await s3();
      await putFolder(clientFor(connection), { bucket: connection.bucket ?? "", key: `${destination}${trimmed}/` });
      setDestination(`${destination}${trimmed}/`);
      setReload((value) => value + 1);
      setCreating(false);
      setNewName("");
      setError(null);
    } catch {
      setError(t("op.error"));
    }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const moves = await decide(moved.map((item) => ({ source: item.key, target: targetIn(destination, item) })));
      for (const move of moves) startOperation({ connection, kind: "move", source: move.source, target: move.target }, hooks);
      close();
    } catch {
      setError(t("op.error"));
    } finally {
      setBusy(false);
    }
  };

  const first = moved[0];
  return (
    <Dialog open={items !== null} onClose={close} title={t("dlg.move.title", { n: moved.length })} closeLabel={t("act.close")} wide>
      <p className="text-base text-fg-muted">{t("dlg.move.sub", { name: moved.length === 1 && first ? first.name : t("sel.count", { n: moved.length }) })}</p>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-line p-1">
        {/* The tree exists only while the dialog is open, so the Files screen does not list folders in advance. */}
        {items !== null && <FolderTree
          root={{ prefix: root, name: connection.bucket ?? "" }}
          loadChildren={loadChildren}
          value={destination}
          onChange={(prefix) => { setDestination(prefix); setError(null); }}
          isDisabled={(prefix) => prefix === folderPrefix || inside(prefix)}
          currentPrefix={folderPrefix}
          currentLabel={t("dlg.move.current")}
          label={t("dlg.move.tree")}
          loadingLabel={t("files.loading")}
          errorLabel={t("dlg.move.loadError")}
          reloadKey={reload}
        />}
      </div>
      {reason !== null && <p role="status" className="mt-2 text-sm text-fg-muted">{reason}</p>}
      {creating ? (
        <form onSubmit={(event) => void createFolder(event)} noValidate className="mt-3">
          <Field label={t("dlg.move.newFolderName")} error={error ?? undefined}>
            <TextInput value={newName} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => { setNewName(event.target.value); setError(null); }} />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button type="submit" size="sm">{t("dlg.move.create")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setError(null); }}>{t("act.cancel")}</Button>
          </div>
        </form>
      ) : (
        <Button className="mt-3" variant="secondary" size="sm" disabled={isInside} onClick={() => { setCreating(true); }}>{t("dlg.move.newFolder")}</Button>
      )}
      {error !== null && !creating && <p role="alert" className="mt-2 text-sm text-danger-fg">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={close}>{t("act.cancel")}</Button>
        <Button variant="primary" loading={busy} disabled={blocked} onClick={() => void confirm()}>{t("dlg.move.confirm")}</Button>
      </div>
    </Dialog>
  );
}
