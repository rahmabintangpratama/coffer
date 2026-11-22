import { Field, SelectInput } from "@/components/Field";
import { t } from "@/lib/i18n";
import type { Settings } from "@/lib/types";
import { useSettings } from "../../settings";

const PARTS: readonly Settings["uploadConcurrency"][] = [2, 4, 6, 8];

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-(--cf-size-touch-min) cursor-pointer items-start gap-3 rounded-md px-1 py-2 hover:bg-hover">
      <input type="checkbox" checked={checked} onChange={(event) => { onChange(event.target.checked); }} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent" />
      <span className="flex flex-col">
        <span className="text-base">{label}</span>
        <span className="text-sm text-fg-muted">{sub}</span>
      </span>
    </label>
  );
}

/** Behavior (AC-100.1): ask before moving to trash, show hidden files, and the parallel upload parts. */
export function BehaviorPage() {
  const { confirmTrash, showHiddenFiles, uploadConcurrency, update } = useSettings();
  return (
    <section data-component="BehaviorSettings" aria-labelledby="behavior-title" className="flex flex-col gap-4">
      <h2 id="behavior-title" className="text-lg font-semibold">{t("set.behaviorLabel")}</h2>
      <Toggle label={t("beh.confirmTrashLabel")} sub={t("beh.confirmTrash.sub")} checked={confirmTrash} onChange={(next) => { update({ confirmTrash: next }); }} />
      <Toggle label={t("beh.hiddenLabel")} sub={t("beh.hidden.sub")} checked={showHiddenFiles} onChange={(next) => { update({ showHiddenFiles: next }); }} />
      <Field label={t("beh.parts")} className="max-w-xs">
        <SelectInput
          value={uploadConcurrency}
          onChange={(event) => { update({ uploadConcurrency: Number(event.target.value) as Settings["uploadConcurrency"] }); }}
        >
          {PARTS.map((count) => <option key={count} value={count}>{count}</option>)}
        </SelectInput>
      </Field>
    </section>
  );
}
