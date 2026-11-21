import { useId, useState } from "react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { t } from "@/lib/i18n";
import { nameOf } from "@/lib/s3/keys";
import type { ConflictAnswer, ConflictChoice, ConflictQuestion } from "./resolve";

type ChoiceLabel = "conf.replaceLabel" | "conf.keepLabel" | "conf.skipLabel" | "conf.mergeLabel";

const fileChoices: { value: ConflictChoice; label: ChoiceLabel }[] = [
  { value: "replace", label: "conf.replaceLabel" },
  { value: "keepBoth", label: "conf.keepLabel" },
  { value: "skip", label: "conf.skipLabel" },
];

// A folder is never replaced wholesale: Merge keeps what only the destination holds (D-42).
const folderChoices: { value: ConflictChoice; label: ChoiceLabel }[] = [
  { value: "keepBoth", label: "conf.keepLabel" },
  { value: "replace", label: "conf.mergeLabel" },
];

/** One name that already exists (FR-43): Replace, Keep both or Skip, and "Apply to all N conflicts". */
export function ConflictDialog({ question, folder, onAnswer }: { question: ConflictQuestion | null; folder: string; onAnswer: (answer: ConflictAnswer) => void }) {
  const group = useId();
  const [picked, setChoice] = useState<ConflictChoice>("keepBoth");
  const [all, setAll] = useState(false);
  const name = question ? nameOf(question.key) : "";
  const folderClash = question?.folder === true;
  const choices = folderClash ? folderChoices : fileChoices;
  // A choice from an earlier file question that this question does not offer falls back to Keep both.
  const choice = choices.some((option) => option.value === picked) ? picked : "keepBoth";
  const keepName = question ? t(folderClash ? "conf.keepFolder.sub" : "conf.keep.sub", { name: nameOf(question.key) }) : "";
  const submit = () => {
    onAnswer({ choice, applyToAll: all });
    setAll(false);
  };
  const sub = (value: ConflictChoice) => (value === "replace" ? t(folderClash ? "conf.merge.sub" : "conf.replace.sub") : value === "keepBoth" ? keepName : t("conf.skip.sub"));
  return (
    <Dialog
      open={question !== null}
      // Closing without a choice skips the file; nothing is overwritten by accident.
      onClose={() => { onAnswer({ choice: "skip", applyToAll: false }); }}
      title={t("conf.title")}
      closeLabel={t("act.close")}
    >
      <p className="text-base">{t(folderClash ? "conf.bodyFolder" : "conf.body", { folder, name })}</p>
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="sr-only">{t("conf.title")}</legend>
        {choices.map(({ value, label }) => (
          <label key={value} className="flex min-h-(--cf-size-touch-min) cursor-pointer items-start gap-3 rounded-md border border-line p-3 has-checked:border-accent has-checked:bg-selected">
            <input type="radio" name={group} value={value} checked={choice === value} onChange={() => { setChoice(value); }} className="mt-1 size-4 accent-accent" />
            <span>
              <span className="block font-semibold">{t(label)}</span>
              <span className="block text-sm text-fg-muted">{sub(value)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {question && question.remaining > 1 && (
        <label className="mt-4 flex min-h-(--cf-size-touch-min) cursor-pointer items-center gap-3">
          <input type="checkbox" checked={all} onChange={(event) => { setAll(event.target.checked); }} className="size-4 accent-accent" />
          {t("conf.all", { count: question.remaining })}
        </label>
      )}
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={submit}>{t("conf.confirm")}</Button>
      </div>
    </Dialog>
  );
}
