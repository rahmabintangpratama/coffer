import { type SubmitEvent, useState } from "react";
import { Button } from "@/components/Button";
import { Field, TextInput } from "@/components/Field";
import { t } from "@/lib/i18n";
import { StepFrame } from "./StepFrame";

/** How many buckets show before "and N more": a long list is searched, not scrolled. */
export const VISIBLE_BUCKETS = 50;

interface PickBucketScreenProps {
  /** The buckets the key can list, or null when it cannot list them. */
  buckets: readonly string[] | null;
  onBack: () => void;
  /** `typed` is true for a name the person entered, which may still need the provider's suffix. */
  onPick: (bucket: string, typed: boolean) => void;
}

/** O50: choose a bucket, or type its name when the key cannot list them (FR-7). */
export function PickBucketScreen({ buckets, onBack, onPick }: PickBucketScreenProps) {
  const canList = buckets !== null && buckets.length > 0;
  const [manual, setManual] = useState(!canList);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");

  const needle = query.trim().toLowerCase();
  const matches = (buckets ?? []).filter((bucket) => bucket.toLowerCase().includes(needle));
  const shown = needle === "" ? matches.slice(0, VISIBLE_BUCKETS) : matches;
  const hidden = matches.length - shown.length;

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (name.trim() !== "") onPick(name.trim(), true);
  };

  return (
    <StepFrame title={t("ob.pick.title")} onBack={onBack}>
      {canList && !manual ? (
        <>
          <p className="text-base text-fg-muted">{t("ob.pick.scope", { count: buckets.length })}</p>
          <Field label={t("ob.pick.search")}>
            <TextInput
              type="search"
              value={query}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </Field>
          {shown.length > 0 ? (
            <ul aria-label={t("ob.pick.listLabel")} className="flex flex-col gap-2">
              {shown.map((bucket) => (
                <li key={bucket}>
                  <Button
                    variant="secondary"
                    block
                    className="justify-start font-mono"
                    onClick={() => {
                      onPick(bucket, false);
                    }}
                  >
                    {bucket}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-base text-fg-muted">
              {t("ob.pick.noMatch")}
            </p>
          )}
          {hidden > 0 ? <p className="text-sm text-fg-muted">{t("ob.pick.more", { count: hidden })}</p> : null}
          <div>
            <Button
              variant="link"
              onClick={() => {
                setManual(true);
              }}
            >
              {t("ob.pick.manual")}
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {canList ? null : <p className="text-base text-fg-muted">{t("ob.pick.none")}</p>}
          <Field label={t("ob.pick.manualLabel")}>
            <TextInput
              mono
              value={name}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block disabled={name.trim() === ""}>
            {t("ob.pick.cta")}
          </Button>
        </form>
      )}
    </StepFrame>
  );
}
