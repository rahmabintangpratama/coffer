import { cva } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Variants and states follow design/button-states.md. Colors come from the
// btn-* utilities in tailwind.css (the --cf-btn-* tokens), never from here.
const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap select-none",
    "cursor-pointer disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
    // 44 px touch target on mobile; the design size applies from 768 px.
    "min-h-(--cf-size-touch-min) @md:min-h-0",
  ],
  {
    variants: {
      variant: {
        primary: "btn-primary",
        secondary: "btn-secondary",
        tonal: "btn-tonal",
        ghost: "btn-ghost",
        danger: "btn-danger",
        "danger-tonal": "btn-danger-tonal",
        inverse: "btn-inverse",
        link: [
          "text-link underline underline-offset-2 rounded-xs",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        ],
      },
      size: {
        sm: "h-(--cf-size-control-sm) px-3 text-sm",
        md: "h-(--cf-size-control-md) px-4 text-base",
        lg: "h-(--cf-size-control-lg) px-5 text-md",
      },
      block: { true: "w-full", false: "" },
      iconOnly: {
        true: "aspect-square min-w-(--cf-size-touch-min) px-0 @md:min-w-0",
        false: "",
      },
    },
    defaultVariants: { variant: "secondary", size: "md", block: false, iconOnly: false },
  },
);

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger" | "danger-tonal" | "inverse" | "link";
export type ButtonSize = "sm" | "md" | "lg";

interface CommonProps extends Omit<ComponentProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, sets aria-busy and ignores clicks. The label stays. */
  loading?: boolean;
}

type LabelledProps = CommonProps & {
  iconOnly?: false;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
};

// An icon-only button has no text, so it must carry an accessible name.
type IconOnlyProps = CommonProps & {
  iconOnly: true;
  "aria-label": string;
  icon: ReactNode;
  trailingIcon?: never;
  children?: never;
};

export type ButtonProps = LabelledProps | IconOnlyProps;

export function Button(props: ButtonProps) {
  const {
    variant,
    size,
    block,
    loading = false,
    iconOnly = false,
    icon,
    trailingIcon,
    children,
    className,
    type = "button",
    disabled,
    onClick,
    ...rest
  } = props;

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      data-component="Button"
      className={cn(button({ variant, size, block, iconOnly }), className)}
      onClick={loading ? undefined : onClick}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : (
        icon
      )}
      {children}
      {trailingIcon}
    </button>
  );
}
