import { X } from "lucide-react";
import { type HTMLAttributes, type ReactNode, type RefObject, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export type Placement = "responsive" | "bottom" | "start";

export interface ModalSurfaceProps {
  open: boolean;
  onClose: () => void;
  /** Visible title. It also names the dialog. */
  title: string;
  closeLabel: string;
  /**
   * bottom: a bottom sheet. start: a side drawer. responsive: a bottom sheet
   * below 768 px and a centered dialog from 768 px (container width).
   */
  placement: Placement;
  /** Component name from design/components.md, written to data-component. */
  component: string;
  children: ReactNode;
  /**
   * The control that opened this layer. Focus goes back to it on close. The
   * browser does this too, but Safari does not focus a button when it is
   * clicked, so it would return to the page instead of the button.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Extra props for the panel, for example pointer handlers for a swipe. */
  panelProps?: HTMLAttributes<HTMLDivElement>;
  className?: string;
}

const panelByPlacement: Record<Placement, string> = {
  bottom: "self-end w-full rounded-t-lg pb-[env(safe-area-inset-bottom)]",
  start: "justify-self-start w-[86%] max-w-80 h-full rounded-r-lg pt-[env(safe-area-inset-top)]",
  responsive:
    "self-end w-full rounded-t-lg pb-[env(safe-area-inset-bottom)] " +
    "@md:self-center @md:justify-self-center @md:w-120 @md:rounded-lg @md:pb-0",
};

/**
 * A modal layer on the native <dialog> element. The browser provides the focus
 * trap, Escape to close, the inert page behind it and focus return to the
 * trigger. It needs no script-injected styles, which the CSP forbids (a Radix
 * Dialog would inject one for scroll locking). It stays inside .cf-root, so
 * container queries and the theme apply to it.
 */
export function ModalSurface(props: ModalSurfaceProps) {
  const { open, onClose, title, closeLabel, placement, component, children, panelProps, className, returnFocusRef } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const titleId = useId();

  useEffect(() => {
    openRef.current = open;
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) {
      element.close();
      returnFocusRef?.current?.focus();
    }
  }, [open, returnFocusRef]);

  const { className: panelClassName, ...otherPanelProps } = panelProps ?? {};

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      data-component={component}
      data-surface="elevated"
      data-placement={placement}
      className={cn(
        "cf-modal fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-fg",
        "open:grid backdrop:bg-overlay",
        className,
      )}
      // Escape and the dialog's own close() both end here; only report it if the parent still thinks it is open.
      onClose={() => {
        if (!openRef.current) return;
        onClose();
        returnFocusRef?.current?.focus();
      }}
      // A click on the dialog element itself is a click outside the panel.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        {...otherPanelProps}
        className={cn(
          "cf-panel flex max-h-[calc(100dvh-var(--cf-space-12))] flex-col overflow-hidden bg-elevated shadow-dialog",
          placement === "start" && "max-h-none",
          panelByPlacement[placement],
          panelClassName,
        )}
      >
        {placement !== "start" && (
          <div
            aria-hidden="true"
            className={cn("mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong", placement === "responsive" && "@md:hidden")}
          />
        )}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <Button variant="ghost" iconOnly aria-label={closeLabel} icon={<X aria-hidden="true" className="size-5" />} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </dialog>
  );
}
