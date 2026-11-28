import { act, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Sheet } from "./Sheet";
import { Skeleton } from "./Skeleton";
import { Toast } from "./Toast";

describe("Button", () => {
  it("renders a native button of type button with the btn utility for its variant", () => {
    render(<Button variant="primary">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("btn-primary");
  });

  it.each(["primary", "secondary", "tonal", "ghost", "danger", "danger-tonal", "inverse"] as const)(
    "uses btn-%s",
    (variant) => {
      render(<Button variant={variant}>Label</Button>);
      expect(screen.getByRole("button")).toHaveClass(`btn-${variant}`);
    },
  );

  it("is named by aria-label when icon-only", () => {
    render(<Button iconOnly aria-label="Open menu" icon={<svg aria-hidden="true" />} />);
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("requires an accessible name when icon-only (type check)", () => {
    // @ts-expect-error an icon-only button without aria-label must not compile
    render(<Button iconOnly icon={<svg aria-hidden="true" />} />);
  });

  it("keeps its label, sets aria-busy and ignores clicks while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Connect
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not click when disabled and clicks otherwise", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Save</Button>
        <Button iconOnly aria-label="Close" icon={<svg aria-hidden="true" />} />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

function Harness({ side }: { side?: "bottom" | "start" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      {side ? (
        <Sheet
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          title="Panel title"
          closeLabel="Close"
          side={side}
          component="Test"
        >
          <p>Content</p>
        </Sheet>
      ) : (
        <Dialog
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          title="Panel title"
          closeLabel="Close"
        >
          <p>Content</p>
        </Dialog>
      )}
    </>
  );
}

describe.each([
  ["Dialog", undefined],
  ["Sheet (bottom)", "bottom"],
  ["Sheet (start)", "start"],
] as const)("%s", (_name, side) => {
  it("opens on the native dialog, is named by its title and sits on the elevated surface", () => {
    const { container } = render(<Harness side={side} />);
    // Not in the document until it opens: nothing for a password manager to watch.
    expect(container.querySelector("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = container.querySelector("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("data-surface", "elevated");
    expect(screen.getByRole("dialog", { name: "Panel title" })).toBeInTheDocument();
  });

  it("is put on the top layer once, however often it renders while open", () => {
    const shown = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { rerender } = render(<Harness side={side} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    rerender(<Harness side={side} />);
    rerender(<Harness side={side} />);
    expect(shown).toHaveBeenCalledTimes(1);
    shown.mockRestore();
  });

  it("closes with the close button and leaves the document", () => {
    const { container } = render(<Harness side={side} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("closes when the browser reports a close, as it does for Escape", () => {
    const { container } = render(<Harness side={side} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("no dialog");
    // The browser closes the element and then queues the event.
    dialog.removeAttribute("open");
    fireEvent(dialog, new Event("close"));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("closes on a click outside the panel but not inside it", () => {
    const { container } = render(<Harness side={side} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByText("Content"));
    expect(container.querySelector("dialog")).toHaveAttribute("open");
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("no dialog");
    fireEvent.click(dialog);
    expect(container.querySelector("dialog")).toBeNull();
  });
});

describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a status region that leaves after 8 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Saved" dismissLabel="Dismiss" onDismiss={onDismiss} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays longer when it has an action and runs the action", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <Toast message="Moved" dismissLabel="Dismiss" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />,
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("waits while focus is inside and resumes after", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Saved" dismissLabel="Dismiss" onDismiss={onDismiss} />);
    const status = screen.getByRole("status");
    fireEvent.focus(status);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(status);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
