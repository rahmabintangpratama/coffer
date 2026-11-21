import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from "react";

/**
 * A full-screen modal on the native <dialog> (design: Preview). The browser gives
 * the focus trap, the inert page behind it, Escape and focus return to the
 * element that was focused when it opened. It is dark in both themes through the
 * inverse layer. Escape asks the owner to close it (so the address can follow);
 * the owner unmounts it.
 */
export function FullscreenDialog({ label, onClose, onClosed, onKeyDown, children }: { label: string; onClose: () => void; /** Called once the dialog has closed and the page is usable again: the place to move focus. */ onClosed?: () => void; onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClosed);
  useLayoutEffect(() => {
    closed.current = onClosed;
  }, [onClosed]);
  // A layout effect, so the cleanup runs while the dialog is still in the page: closing a detached dialog cannot give focus back.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
      closed.current?.();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={label}
      data-component="Preview"
      data-surface="inverse"
      className="cf-modal fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col bg-(--cf-color-inverse-bg) p-0 text-(--cf-color-inverse-fg) open:flex"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      {...(onKeyDown ? { onKeyDown } : {})}
    >
      {children}
    </dialog>
  );
}
