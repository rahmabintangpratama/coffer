import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";

describe("AC-32.3 and FR-43 conflict dialog (D-42)", () => {
  it("offers Replace, Keep both and Skip for a file", () => {
    render(<ConflictDialog question={{ key: "d/a.txt", remaining: 1 }} folder="d" onAnswer={vi.fn()} />);
    expect(screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      expect.stringContaining("Replace"),
      expect.stringContaining("Keep both"),
      expect.stringContaining("Skip"),
    ]);
  });

  it("offers only Keep both and Merge for a folder, and Merge answers as replace", async () => {
    const onAnswer = vi.fn();
    const { container } = render(<ConflictDialog question={{ key: "d/dir/", remaining: 1, folder: true }} folder="d" onAnswer={onAnswer} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /Skip/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Replace/ })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("radio", { name: /Merge/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAnswer).toHaveBeenCalledWith({ choice: "replace", applyToAll: false });
  });

  it("falls back to Keep both when an earlier file choice is not offered for a folder", async () => {
    const onAnswer = vi.fn();
    const { rerender } = render(<ConflictDialog question={{ key: "d/a.txt", remaining: 2 }} folder="d" onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("radio", { name: /Skip/ }));
    rerender(<ConflictDialog question={{ key: "d/dir/", remaining: 1, folder: true }} folder="d" onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onAnswer).toHaveBeenCalledWith({ choice: "keepBoth", applyToAll: false });
  });
});
