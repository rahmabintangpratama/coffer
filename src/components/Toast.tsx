import { useCallback, useEffect, useRef } from "react";
import { Button } from "./Button";

export interface ToastProps {
  message: string;
  dismissLabel: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Milliseconds before it goes away. Defaults: 8 s, 12 s when it has an action. */
  duration?: number;
}

const DEFAULT_DURATION = 8000;
const ACTION_DURATION = 12000;

/**
 * Short status with an optional action (usually Undo). It leaves after 8 s,
 * longer with an action, and waits while the pointer or focus is on it.
 */
export function Toast(props: ToastProps) {
  const { message, dismissLabel, actionLabel, onAction, onDismiss, duration } = props;
  const total = duration ?? (actionLabel ? ACTION_DURATION : DEFAULT_DURATION);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dismiss.current();
    }, total);
  }, [total]);
  const pause = useCallback(() => {
    clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    start();
    return pause;
  }, [start, pause]);

  return (
    <div
      role="status"
      data-component="Toast"
      data-surface="inverse"
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
      className="flex items-center gap-2 rounded-md bg-(--cf-color-inverse-bg) py-2 pr-2 pl-4 text-base text-(--cf-color-inverse-fg) shadow-overlay"
    >
      <span className="min-w-0 flex-1">{message}</span>
      {actionLabel && onAction ? (
        <Button variant="inverse" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      <Button variant="inverse" size="sm" onClick={onDismiss}>
        {dismissLabel}
      </Button>
    </div>
  );
}
