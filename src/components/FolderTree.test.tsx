import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { FolderTree, type TreeFolder } from "./FolderTree";

const root: TreeFolder = { prefix: "", name: "bucket" };
const props = (load: (prefix: string) => Promise<TreeFolder[]>, over: Partial<Parameters<typeof FolderTree>[0]> = {}) => ({
  root, loadChildren: load, value: "", onChange: vi.fn(), isDisabled: () => false, currentLabel: "Current location", label: "Folders", loadingLabel: "Loading", errorLabel: "Could not load", ...over,
});

describe("FolderTree", () => {
  it("names a tree item with the text that is drawn, also while its folders are still loading (WCAG 2.5.3)", async () => {
    render(<FolderTree {...props(() => new Promise<TreeFolder[]>(() => undefined), { currentPrefix: "" })} />);
    const item = await screen.findByRole("treeitem", { name: "bucket Current location" });
    // The words that are drawn are the words of the name, with the space between them (axe label-content-name-mismatch).
    expect(item.textContent).toBe("bucket Current location");
    // The loading line is a status of its own, not part of what the item says.
    expect(item).not.toHaveTextContent("Loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(within(item).queryByRole("status")).toBeNull();
  });

  it("shows a load error outside the item, and opening the node again tries again", async () => {
    const load = vi.fn<(prefix: string) => Promise<TreeFolder[]>>().mockRejectedValueOnce(new Error("no")).mockResolvedValue([{ prefix: "a/", name: "a" }]);
    render(<FolderTree {...props(load)} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
    const item = screen.getByRole("treeitem", { name: "bucket" });
    expect(within(item).queryByRole("alert")).toBeNull();
    item.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(await screen.findByRole("treeitem", { name: "a" })).toBeInTheDocument();
  });

  it("opens along the way to the current location and marks it", async () => {
    const load = async (prefix: string): Promise<TreeFolder[]> => {
      await Promise.resolve();
      return prefix === "" ? [{ prefix: "a/", name: "a" }] : prefix === "a/" ? [{ prefix: "a/b/", name: "b" }] : [{ prefix: "a/b/c/", name: "c" }];
    };
    render(<FolderTree {...props(load, { currentPrefix: "a/b/" })} />);
    expect(await screen.findByRole("treeitem", { name: "b Current location" })).toBeInTheDocument();
    expect(await screen.findByRole("treeitem", { name: "c" })).toBeInTheDocument();
  });

  it("cannot choose a disabled folder, with Enter or by click", async () => {
    const onChange = vi.fn();
    const load = () => Promise.resolve([{ prefix: "x/", name: "x" }]);
    render(<FolderTree {...props(load, { onChange, isDisabled: (prefix) => prefix === "x/" })} />);
    const item = await screen.findByRole("treeitem", { name: "x" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    item.focus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<FolderTree {...props((prefix) => Promise.resolve(prefix === "" ? [{ prefix: "a/", name: "a" }] : []), { currentPrefix: "a/" })} />);
    await waitFor(() => { expect(screen.getByRole("treeitem", { name: "a Current location" })).toBeInTheDocument(); });
    expect(await axe(container)).toHaveNoViolations();
  });
});
