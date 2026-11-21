import type { ReactNode } from "react";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";

export interface FailureAction {
  label: string;
  onClick: () => void;
}

/** What failed, why, and what to do next, with one main action and an optional second one (FR-5). */
export function FailureCard({
  title,
  why,
  next,
  primary,
  secondary,
  children,
}: {
  title: string;
  why: string;
  next: string;
  primary: FailureAction;
  secondary?: FailureAction;
  children?: ReactNode;
}) {
  return (
    <div data-component="FailureCard" className="flex flex-col gap-4">
      <Banner tone="danger" title={title}>
        <p>{why}</p>
        <p className="mt-1">{next}</p>
      </Banner>
      {children}
      <div className="flex flex-col gap-2 @md:flex-row">
        <Button variant="primary" onClick={primary.onClick}>
          {primary.label}
        </Button>
        {secondary ? (
          <Button variant="secondary" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
