import { CircleAlert } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  createContext,
  useContext,
  useId,
} from "react";
import { cn } from "@/lib/utils";

// Form controls on native elements. A native <select>, <input list> and radio
// group need no script and no injected style, and keep the platform keyboard and
// screen reader behavior (D-25).

interface FieldContext {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}
const FieldContext = createContext<FieldContext | null>(null);

function useField(): FieldContext {
  const context = useContext(FieldContext);
  if (!context) throw new Error("Use this control inside a Field.");
  return context;
}

export interface FieldProps {
  /** Visible label. Never replaced by the placeholder (accessibility.md, Forms). */
  label: string;
  /** The generic S3 term shown as a caption under the provider's own label. */
  caption?: string | undefined;
  hint?: string | undefined;
  /** What is wrong, why and what to do. Shown under the field and linked with aria-describedby. */
  error?: string | undefined;
  /** The word "optional", shown beside the label when the field is not required. */
  optionalLabel?: string | undefined;
  /** A small marker such as "detected" after a paste filled the field. */
  marker?: string | undefined;
  children: ReactNode;
  className?: string;
}

export function Field({ label, caption, hint, error, optionalLabel, marker, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: error !== undefined }}>
      <div className={cn("flex flex-col gap-1", className)} data-component="Field">
        <div className="flex items-baseline gap-2">
          <label htmlFor={id} className="text-base font-medium">
            {label}
          </label>
          {optionalLabel ? <span className="text-sm text-fg-muted">{optionalLabel}</span> : null}
          {marker ? <span className="rounded-xs bg-accent-subtle px-1.5 text-sm text-accent-fg">{marker}</span> : null}
        </div>
        {caption ? <span className="text-sm text-fg-muted">{caption}</span> : null}
        {children}
        {hint ? (
          <p id={hintId} className="text-sm text-fg-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="flex items-start gap-1 text-sm text-danger-fg">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const control = [
  "w-full rounded-sm border bg-surface px-3 text-fg placeholder:text-fg-subtle",
  // 48 px and 16 px text on mobile (a smaller font makes iOS zoom the page), 40 px from 768.
  "h-(--cf-size-control-lg) text-md @md:h-(--cf-size-control-md) @md:text-base",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:bg-hover disabled:text-fg-disabled",
];

const border = (invalid: boolean) => (invalid ? "border-danger-line" : "border-line-strong");

export function TextInput({ className, mono, ...rest }: ComponentProps<"input"> & { mono?: boolean }) {
  const { id, describedBy, invalid } = useField();
  return (
    <input
      {...rest}
      // React's autoFocus runs before a native <dialog> is open, so the dialog moves focus to its first control instead;
      // ModalSurface looks for this marker after showModal().
      data-autofocus={rest.autoFocus === true ? "" : undefined}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(control, border(invalid), mono && "font-mono", className)}
    />
  );
}

export function TextArea({ className, mono, ...rest }: ComponentProps<"textarea"> & { mono?: boolean }) {
  const { id, describedBy, invalid } = useField();
  return (
    <textarea
      {...rest}
      data-autofocus={rest.autoFocus === true ? "" : undefined}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(control, border(invalid), "h-auto min-h-32 py-2", mono && "font-mono", className)}
    />
  );
}

export function SelectInput({ className, children, ...rest }: ComponentProps<"select">) {
  const { id, describedBy, invalid } = useField();
  return (
    <select
      {...rest}
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(control, border(invalid), "cursor-pointer", className)}
    >
      {children}
    </select>
  );
}

/** A text input with suggestions (a native datalist): the person may type a value that is not listed. */
export function ComboInput({ options, className, mono, ...rest }: ComponentProps<"input"> & { options: readonly string[]; mono?: boolean }) {
  const { id, describedBy, invalid } = useField();
  const listId = `${id}-options`;
  return (
    <>
      <input
        {...rest}
        id={id}
        list={listId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={cn(control, border(invalid), mono && "font-mono", className)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

export interface SegmentedOption {
  value: string;
  label: string;
  hint?: string;
}

/** A small set of exclusive choices as native radio buttons. */
export function Segmented({
  name,
  legend,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  legend: string;
  value: string;
  options: readonly SegmentedOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset data-component="Segmented" disabled={disabled}>
      <legend className="mb-1 text-base font-medium">{legend}</legend>
      <div className="flex rounded-sm border border-line-strong bg-surface p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-(--cf-size-touch-min) flex-1 cursor-pointer items-center justify-center rounded-xs px-3 text-center text-base @md:min-h-9",
              "has-checked:bg-accent-subtle has-checked:font-semibold has-checked:text-accent-fg",
              "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
