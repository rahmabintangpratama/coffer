import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";

interface StepFrameProps {
  /** The page heading. Also the document title, and the first thing focus lands on. */
  title: string;
  onBack?: () => void;
  /** Overrides the Back label ("Back to details"). */
  backLabel?: string;
  /** Move focus to the heading when the step appears. Off for the first screen. */
  focusHeading?: boolean;
  /** A visual above the heading (the logo on Welcome). */
  lead?: ReactNode;
  children: ReactNode;
}

/**
 * One onboarding step: a single centered column that works from 320 px up, with
 * a Back button, the heading and the content. After a step change, focus moves
 * to the heading so keyboard and screen reader users start at the top.
 */
export function StepFrame({ title, onBack, backLabel, focusHeading = true, lead, children }: StepFrameProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${title} · ${t("app.name")}`;
  }, [title]);

  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 @md:px-6 @md:py-10" data-component="StepFrame">
      {onBack ? (
        <div>
          <Button variant="ghost" icon={<ArrowLeft aria-hidden="true" className="size-5" />} onClick={onBack} className="-ml-3">
            {backLabel ?? t("act.back")}
          </Button>
        </div>
      ) : null}
      {lead}
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold text-balance focus:outline-none">
        {title}
      </h1>
      {children}
    </main>
  );
}
