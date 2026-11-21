import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field, TextInput } from "@/components/Field";
import { t } from "@/lib/i18n";
import { folderNameProblem, type KeyProblem } from "@/lib/s3/keys";

const problemCopy = (problem: KeyProblem, name: string) => {
  switch (problem) {
    case "slash": return t("dlg.rename.err.slash");
    case "tooLong": return t("dlg.newFolder.err.tooLong");
    case "control":
    case "surrogate": return t("dlg.newFolder.err.control");
    case "dots": return t("dlg.newFolder.err.dots");
    case "empty": return name.trim() === "" ? t("dlg.newFolder.err.empty") : t("dlg.newFolder.err.dots");
  }
};

/** Creates the zero-byte placeholder for a folder (FR-35). The name is checked here; the folder is written by `onCreate`. */
export function NewFolderDialog({ open, onClose, parentPrefix, existingNames, onCreate }: { open: boolean; onClose: () => void; parentPrefix: string; existingNames: ReadonlySet<string>; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const problem = folderNameProblem(trimmed, parentPrefix);
    if (problem !== null) {
      setError(problemCopy(problem, trimmed));
      return;
    }
    if (existingNames.has(trimmed)) {
      setError(t("dlg.newFolder.err.exists", { name: trimmed }));
      return;
    }
    setBusy(true);
    try {
      await onCreate(trimmed);
      close();
    } catch {
      setError(t("dlg.newFolder.err.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={t("act.newFolder")} closeLabel={t("act.close")}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Field label={t("dlg.newFolder.label")} error={error ?? undefined}>
          <TextInput value={name} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => { setName(event.target.value); setError(null); }} />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={close}>{t("act.cancel")}</Button>
          <Button type="submit" variant="primary" loading={busy}>{t("dlg.newFolder.create")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
