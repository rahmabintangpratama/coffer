import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Radix Tabs adds no style element, so it is allowed under the CSP (D-25).

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  return (
    <RadixTabs.Root defaultValue={defaultValue} data-component="Tabs">
      {children}
    </RadixTabs.Root>
  );
}

export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTabs.List aria-label={label} className="flex gap-1 border-b border-line">
      {children}
    </RadixTabs.List>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        "min-h-(--cf-size-touch-min) cursor-pointer rounded-t-sm px-4 text-base text-fg-muted @md:min-h-10",
        "data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-fg",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Content value={value} className="pt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {children}
    </RadixTabs.Content>
  );
}
