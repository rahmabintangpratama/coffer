import type { ReactNode, RefObject } from "react";
import { ModalSurface } from "./ModalSurface";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** Modal for rename, move, share, delete and similar: a bottom sheet below 768 px, a centered dialog from 768 px. */
export function Dialog(props: DialogProps) {
  return <ModalSurface {...props} placement="responsive" component="Dialog" />;
}
