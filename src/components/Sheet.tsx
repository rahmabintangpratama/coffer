import type { HTMLAttributes, ReactNode } from "react";
import { ModalSurface } from "./ModalSurface";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  /** bottom: bottom sheet with a drag handle. start: left drawer. */
  side?: "bottom" | "start";
  /** Component name from design/components.md (for example MoreSheet or NavDrawer). */
  component: string;
  panelProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}

/** A layer that is always a bottom sheet or a side drawer, at any width. */
export function Sheet({ side = "bottom", ...props }: SheetProps) {
  return <ModalSurface {...props} placement={side} />;
}
