import type { ReactNode } from "react";
import { Banner } from "./Banner";

/** The info banner at the top of a read-only connection: why actions are off, and a way out (ReadOnlyBanner). */
export function ReadOnlyBanner({ title, children, action, className }: { title: string; children: ReactNode; action: ReactNode; className?: string }) {
  return (
    <div data-component="ReadOnlyBanner">
      <Banner tone="info" title={title} actions={action} {...(className === undefined ? {} : { className })}>
        {children}
      </Banner>
    </div>
  );
}
