import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** A loading placeholder block. Decorative: pair it with a labelled live region. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      aria-hidden="true"
      data-component="Skeleton"
      className={cn("animate-pulse rounded-sm bg-subtle motion-reduce:animate-none", className)}
    />
  );
}
