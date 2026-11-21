import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, EllipsisVertical } from "lucide-react";
import { type MouseEvent, type ReactElement, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { useLayout } from "./layout";
import { Sheet } from "./Sheet";

export interface MenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
  /** Marks the current choice in a menu of options (the filter chips). */
  checked?: boolean;
}

export interface MenuGroup {
  id: string;
  label?: string;
  actions: MenuAction[];
}

// Portals mount inside .cf-root so container queries and the theme apply (D-25).
const portalRoot = (): HTMLElement | undefined => document.querySelector<HTMLElement>(".cf-root") ?? undefined;

const itemClass = (action: MenuAction, focus: string) =>
  cn(
    "flex min-h-(--cf-size-touch-min) w-full cursor-pointer items-center gap-3 rounded-sm px-3 text-left text-base outline-none @md:min-h-(--cf-size-control-md)",
    focus,
    action.tone === "danger" ? "text-danger-fg data-[highlighted]:bg-danger-subtle" : "text-fg data-[highlighted]:bg-hover",
    "data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-disabled",
  );

const contentClass =
  "z-(--cf-z-dropdown) min-w-56 rounded-md border border-line bg-elevated p-1 text-fg shadow-overlay";
const focusRing = "data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-focus";

function Items({ groups, kind }: { groups: MenuGroup[]; kind: typeof Dropdown | typeof ContextMenu }) {
  return groups.map((group, index) => (
    <kind.Group key={group.id}>
      {index > 0 && <kind.Separator className="my-1 h-px bg-line" />}
      {group.label !== undefined && <kind.Label className="px-3 py-1 text-sm text-fg-muted">{group.label}</kind.Label>}
      {group.actions.map((action) => (
        <kind.Item key={action.id} disabled={action.disabled ?? false} onSelect={action.onSelect} className={itemClass(action, focusRing)}>
          {action.icon}
          {action.label}
          {action.checked === true && <Check aria-hidden="true" className="ml-auto size-4" />}
        </kind.Item>
      ))}
    </kind.Group>
  ));
}

export interface TriggerProps {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  "aria-haspopup"?: "dialog";
}

export interface ActionMenuProps {
  groups: MenuGroup[];
  /** The ⋮ button's name, for example "More actions for report.pdf". */
  triggerLabel: string;
  /** The sheet's header at compact widths: the file name. */
  title: string;
  closeLabel: string;
  /** Component name from design/components.md. */
  component: string;
  className?: string;
  /** A button to use instead of ⋮. Spread the props it receives onto a native button. */
  trigger?: (props: TriggerProps) => ReactElement;
}

/**
 * The ⋮ menu. A popover from 768 px, a bottom action sheet with a header
 * below it (FR-31). Menus are non-modal under the CSP (D-25).
 */
export function ActionMenu({ groups, triggerLabel, title, closeLabel, component, className, trigger: customTrigger }: ActionMenuProps) {
  const layout = useLayout();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  // The button that opened the sheet is remembered from the click, so focus can return to it on close (Safari does not focus a clicked button).
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    setOpener(event.currentTarget);
    setSheetOpen(true);
  };
  const icon = <EllipsisVertical aria-hidden="true" className="size-5" />;

  if (layout === "compact") {
    return (
      <>
        {customTrigger ? (
          customTrigger({ "aria-haspopup": "dialog", onClick: open })
        ) : (
          <Button
            variant="ghost"
            iconOnly
            aria-label={triggerLabel}
            aria-haspopup="dialog"
            icon={icon}
            className={className}
            onClick={open}
          />
        )}
        <Sheet open={sheetOpen} onClose={() => { setSheetOpen(false); opener?.focus(); }} title={title} closeLabel={closeLabel} component={component}>
          {groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label}>
              {group.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled ?? false}
                  onClick={() => {
                    setSheetOpen(false);
                    action.onSelect();
                  }}
                  className={cn(itemClass(action, ""), "hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus")}
                >
                  {action.icon}
                  {action.label}
                  {action.checked === true && <Check aria-hidden="true" className="ml-auto size-4" />}
                </button>
              ))}
            </div>
          ))}
        </Sheet>
      </>
    );
  }

  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>
        {customTrigger?.({}) ?? <Button variant="ghost" iconOnly aria-label={triggerLabel} icon={icon} className={className} />}
      </Dropdown.Trigger>
      <Dropdown.Portal container={portalRoot() ?? null}>
        <Dropdown.Content align="end" sideOffset={4} data-surface="elevated" data-component={component} className={contentClass}>
          <Items groups={groups} kind={Dropdown} />
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/**
 * Right-click, Shift+F10 and the Menu key open the menu at the pointer from
 * 768 px. The caller chooses the groups from its own state, set by an
 * onContextMenu handler on the row that was hit. Below 768 px it renders its
 * children alone: touch uses the ⋮ button.
 */
export function ContextMenuArea({ groups, children, component, className }: { groups: MenuGroup[]; children: ReactNode; component: string; className?: string }) {
  const layout = useLayout();
  if (layout === "compact") return <div className={className}>{children}</div>;
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>
        <div className={className}>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal container={portalRoot() ?? null}>
        <ContextMenu.Content data-surface="elevated" data-component={component} className={contentClass}>
          <Items groups={groups} kind={ContextMenu} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
