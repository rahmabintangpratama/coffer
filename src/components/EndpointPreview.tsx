import { useId, useState } from "react";
import { Button } from "./Button";
import { Field, TextInput } from "./Field";

export interface EndpointPreviewProps {
  label: string;
  /** "Built from your details." */
  note: string;
  editLabel: string;
  value: string;
  onChange: (value: string) => void;
  /** A warning shown under the endpoint, for example that the host does not look like the provider's. */
  warning?: string | undefined;
  error?: string | undefined;
}

/**
 * The endpoint built from the form, shown read-only in an output element with an
 * Edit action that turns it into a text field.
 */
export function EndpointPreview({ label, note, editLabel, value, onChange, warning, error }: EndpointPreviewProps) {
  const [editing, setEditing] = useState(false);
  const labelId = useId();
  if (editing) {
    return (
      <div data-component="EndpointPreview" className="flex flex-col gap-1">
        <Field label={label} hint={note} error={error}>
          <TextInput mono value={value} onChange={(event) => { onChange(event.target.value); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        {warning ? <p className="text-sm text-warning-fg">{warning}</p> : null}
      </div>
    );
  }
  return (
    <div data-component="EndpointPreview" className="flex flex-col gap-1">
      <span id={labelId} className="text-base font-medium">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-sm border border-line bg-subtle px-3 py-2">
        <output aria-labelledby={labelId} className="min-w-0 flex-1 font-mono text-base break-all">
          {value === "" ? "-" : value}
        </output>
        <Button variant="ghost" size="sm" onClick={() => { setEditing(true); }}>
          {editLabel}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{note}</p>
      {warning ? <p className="text-sm text-warning-fg">{warning}</p> : null}
      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}
    </div>
  );
}
