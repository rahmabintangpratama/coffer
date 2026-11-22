import type { ReactNode } from "react";
import { Banner } from "./Banner";

/**
 * The warning in the Share dialog when the connection signs with a session token: the link stops working when
 * the token does, so longer choices are disabled (FR-61). The icon and the words carry the meaning.
 */
export function SessionTokenNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div data-component="SessionTokenNotice">
      <Banner tone="warning" title={title}>{children}</Banner>
    </div>
  );
}
