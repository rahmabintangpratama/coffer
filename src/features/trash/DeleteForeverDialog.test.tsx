import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { DeleteForeverDialog, needsTypedCount, TYPED_COUNT_OVER, type DeleteRequest } from "./DeleteForeverDialog";
import type { TrashItem } from "./model";

const item = (n: number): TrashItem => ({ key: `.coffer-trash/20261122T090503Z-aaaaaa/f${n.toString()}.txt`, batch: "b", deletedAt: new Date(0), original: `f${n.toString()}.txt`, path: `f${n.toString()}.txt`, name: `f${n.toString()}.txt`, size: 1, folder: false });
const keys = (count: number): DeleteRequest => ({ kind: "keys", items: Array.from({ length: count }, (_, n) => item(n)) });

describe("FR-71 delete forever confirmation", () => {
  it("AC-71.1 names the item and the bucket and says it can't be undone, with no typed count for one item", async () => {
    const onConfirm = vi.fn();
    const { container } = render(<DeleteForeverDialog request={keys(1)} bucket="my-bucket" onClose={vi.fn()} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/f0\.txt will be deleted from my-bucket\. You can’t undo this\./)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Type 1 to confirm/)).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Delete forever" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("AC-71.2 above 50 items the danger button stays disabled until the count is typed", async () => {
    const onConfirm = vi.fn();
    render(<DeleteForeverDialog request={keys(TYPED_COUNT_OVER + 1)} bucket="b" onClose={vi.fn()} onConfirm={onConfirm} />);
    const confirm = screen.getByRole("button", { name: "Delete forever" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type 51 to confirm/), "50");
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Type 51 to confirm/));
    await userEvent.type(screen.getByLabelText(/Type 51 to confirm/), "51");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("exactly 50 items need no typing", () => {
    expect(needsTypedCount(keys(TYPED_COUNT_OVER))).toBe(false);
    expect(needsTypedCount(keys(TYPED_COUNT_OVER + 1))).toBe(true);
  });

  it("AC-71.2 Empty trash always needs the count, even for one item", async () => {
    render(<DeleteForeverDialog request={{ kind: "empty", count: 1 }} bucket="b" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Empty trash?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type 1 to confirm/), "1");
    expect(screen.getByRole("button", { name: "Delete forever" })).toBeEnabled();
  });

  it("starts with an empty field each time it opens", async () => {
    const { rerender } = render(<DeleteForeverDialog request={{ kind: "empty", count: 3 }} bucket="b" onClose={vi.fn()} onConfirm={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Type 3 to confirm/), "3");
    rerender(<DeleteForeverDialog request={null} bucket="b" onClose={vi.fn()} onConfirm={vi.fn()} />);
    rerender(<DeleteForeverDialog request={{ kind: "empty", count: 3 }} bucket="b" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByLabelText(/Type 3 to confirm/)).toHaveValue("");
  });
});
