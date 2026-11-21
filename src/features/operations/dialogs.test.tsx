import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepBothKey } from "@/lib/s3/keys";
import type { ConnectionSummary, JournalEntry } from "@/lib/types";
import { InterruptedBanner } from "./InterruptedBanner";
import { useOperations } from "./state";
import type { ItemRef } from "./targets";
import { useOperationDialogs } from "./useOperationDialogs";

const existing = new Set<string>();
const folders = new Map<string, { key: string; name: string }[]>();
const putFolder = vi.fn(() => Promise.resolve());
vi.mock("@/lib/s3", () => ({
  clientFor: () => ({}),
  existingKeys: (_client: unknown, options: { keys: string[] }) => Promise.resolve(new Set(options.keys.filter((key) => existing.has(key)))),
  listPage: (_client: unknown, options: { prefix: string }) => {
    const list = folders.get(options.prefix) ?? [];
    const present = [...existing].some((key) => key.startsWith(options.prefix) && key !== options.prefix);
    return Promise.resolve({ folders: list.map((folder) => ({ kind: "folder", ...folder })), files: present ? [{ kind: "file" }] : [], count: list.length + (present ? 1 : 0) });
  },
  putFolder: () => putFolder(),
  countUnder: () => Promise.resolve(3),
  listUnder: () => (async function* () { await Promise.resolve(); yield [{ key: "s/dir/a.txt", size: 1, etag: "e" }]; })(),
  keepBothKey,
}));
const startOperation = vi.fn<(...args: unknown[]) => unknown>();
const resumeOperation = vi.fn<(...args: unknown[]) => unknown>();
const discardOperation = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock("./run", () => ({
  startOperation: (...args: unknown[]) => startOperation(...args),
  resumeOperation: (...args: unknown[]) => resumeOperation(...args),
  discardOperation: (...args: unknown[]) => discardOperation(...args),
  loadInterrupted: vi.fn(),
}));

const connection: ConnectionSummary = {
  id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00.000Z",
};
const file: ItemRef = { key: "docs/report.pdf", name: "report.pdf", kind: "file" };
const folder: ItemRef = { key: "docs/old/", name: "old", kind: "folder" };
const hooks = { notify: vi.fn(), onChanged: vi.fn() };

function Harness({ item = file, items = [item] }: { item?: ItemRef; items?: ItemRef[] }) {
  const { rename, copy, move, dialogs } = useOperationDialogs({ connection, folderPrefix: "docs/", folderName: "docs", root: "", hooks });
  return (
    <>
      <button onClick={() => { rename(item); }}>open rename</button>
      <button onClick={() => { copy(item); }}>open copy</button>
      <button onClick={() => { move(items); }}>open move</button>
      {dialogs}
    </>
  );
}

beforeEach(() => {
  existing.clear();
  folders.clear();
  folders.set("", [{ key: "docs/", name: "docs" }, { key: "pics/", name: "pics" }]);
  folders.set("docs/", [{ key: "docs/old/", name: "old" }, { key: "docs/new/", name: "new" }]);
  folders.set("pics/", []);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 0; });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FR-32 Rename", () => {
  it("starts with the name selected up to the extension", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    expect(input).toHaveValue("report.pdf");
    await waitFor(() => { expect((input as HTMLInputElement).selectionEnd).toBe("report".length); });
  });

  it("AC-32.2 refuses a slash with dlg.rename.err.slash and does not start", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "a/b.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("Names can’t contain slashes. Use Move to change folders.")).toBeInTheDocument();
    expect(startOperation).not.toHaveBeenCalled();
  });

  it("rejects an empty name and a key over 1,024 bytes", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    await userEvent.type(input, "x".repeat(1100));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText(/at most 1,024 bytes/)).toBeInTheDocument();
  });

  it("AC-32.1 starts a rename operation for a new valid name", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "final.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => { expect(startOperation).toHaveBeenCalledTimes(1); });
    expect(startOperation.mock.calls[0]?.[0]).toMatchObject({ kind: "rename", source: "docs/report.pdf", target: "docs/final.pdf" });
  });

  it("an unchanged name closes without an operation", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rename" }));
    expect(startOperation).not.toHaveBeenCalled();
    await waitFor(() => { expect(screen.queryByRole("dialog", { name: "Rename" })).toBeNull(); });
  });

  it("AC-32.3 asks Replace, Keep both or Skip when the new key exists, and Keep both numbers it", async () => {
    existing.add("docs/final.pdf");
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "final.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog", { name: "This file already exists" });
    await userEvent.click(within(dialog).getByRole("radio", { name: /Keep both/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await waitFor(() => { expect(startOperation).toHaveBeenCalledTimes(1); });
    expect(startOperation.mock.calls[0]?.[0]).toMatchObject({ target: "docs/final (1).pdf" });
  });

  it("AC-32.3 Skip starts nothing", async () => {
    existing.add("docs/final.pdf");
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "final.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog", { name: "This file already exists" });
    await userEvent.click(within(dialog).getByRole("radio", { name: /Skip/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(startOperation).not.toHaveBeenCalled();
  });

  it("AC-32.4 renames a folder under its own prefix, slash included", async () => {
    render(<Harness item={folder} />);
    await userEvent.click(screen.getByRole("button", { name: "open rename" }));
    const input = await screen.findByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "archive");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => { expect(startOperation).toHaveBeenCalled(); });
    expect(startOperation.mock.calls[0]?.[0]).toMatchObject({ kind: "rename", source: "docs/old/", target: "docs/archive/" });
  });
});

describe("FR-33 Make a copy", () => {
  it("AC-33.1 proposes name (copy).ext and the hint names the folder", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open copy" }));
    await waitFor(() => { expect(screen.getByLabelText("Name for the copy")).toHaveValue("report (copy).pdf"); });
    expect(screen.getByText("The copy is saved in docs.")).toBeInTheDocument();
  });

  it("AC-33.3 increments when the proposal is taken", async () => {
    existing.add("docs/report (copy).pdf");
    existing.add("docs/report (copy 2).pdf");
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open copy" }));
    await waitFor(() => { expect(screen.getByLabelText("Name for the copy")).toHaveValue("report (copy 3).pdf"); });
  });

  it("starts a copy operation, which keeps the source", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open copy" }));
    await waitFor(() => { expect(screen.getByLabelText("Name for the copy")).toHaveValue("report (copy).pdf"); });
    await userEvent.click(screen.getByRole("button", { name: "Make a copy" }));
    await waitFor(() => { expect(startOperation).toHaveBeenCalled(); });
    expect(startOperation.mock.calls[0]?.[0]).toMatchObject({ kind: "copy", source: "docs/report.pdf", target: "docs/report (copy).pdf" });
  });
});

describe("FR-34 Move", () => {
  it("AC-34.1 shows the tree, marks the current location and disables Move here there", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 1 item" });
    expect(await within(dialog).findByRole("tree", { name: "Folders" })).toBeInTheDocument();
    expect(await within(dialog).findByRole("treeitem", { name: /pics/ })).toBeInTheDocument();
    expect(within(dialog).getByText("Current location")).toBeInTheDocument();
    // The accessible name is the text that is drawn (WCAG 2.5.3, axe label-content-name-mismatch).
    expect(within(dialog).getByRole("treeitem", { name: "docs Current location" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Move here" })).toBeDisabled();
    expect(within(dialog).getByText("This is where it already is. Choose another folder.")).toBeInTheDocument();
  });

  it("AC-34.2 moving to another folder starts a move operation", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 1 item" });
    const pics = await within(dialog).findByRole("treeitem", { name: /pics/ });
    pics.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move here" }));
    await waitFor(() => { expect(startOperation).toHaveBeenCalled(); });
    expect(startOperation.mock.calls[0]?.[0]).toMatchObject({ kind: "move", source: "docs/report.pdf", target: "pics/report.pdf" });
  });

  it("AC-34.3 a folder cannot move into itself or its children, with the reason", async () => {
    render(<Harness item={folder} />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 1 item" });
    // The tree opens along the way to the current folder, so its children are already there.
    const old = await within(dialog).findByRole("treeitem", { name: /^old/ });
    expect(old).toHaveAttribute("aria-disabled", "true");
    old.focus();
    await userEvent.keyboard("{Enter}");
    expect(within(dialog).getByRole("button", { name: "Move here" })).toBeDisabled();
  });

  it("AC-34.4 New folder here creates a folder and chooses it", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 1 item" });
    const pics = await within(dialog).findByRole("treeitem", { name: /pics/ });
    pics.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(within(dialog).getByRole("button", { name: "New folder here" }));
    await userEvent.type(within(dialog).getByLabelText("New folder name"), "fresh");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
    await waitFor(() => { expect(putFolder).toHaveBeenCalled(); });
    await waitFor(() => { expect(within(dialog).getByRole("button", { name: "Move here" })).toBeEnabled(); });
  });

  it("moves several items, each its own operation", async () => {
    render(<Harness items={[file, { key: "docs/b.txt", name: "b.txt", kind: "file" }]} />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 2 items" });
    const pics = await within(dialog).findByRole("treeitem", { name: /pics/ });
    pics.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Move here" }));
    await waitFor(() => { expect(startOperation).toHaveBeenCalledTimes(2); });
  });

  it("the tree walks with arrow keys and opens and closes with Right and Left", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 1 item" });
    const root = await within(dialog).findByRole("treeitem", { name: /photos/ });
    root.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => { expect(within(dialog).getByRole("treeitem", { name: /^docs/ })).toHaveFocus(); });
    // docs is open already: Left closes it, Right opens it again.
    expect(await within(dialog).findByRole("treeitem", { name: /^old/ })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => { expect(within(dialog).queryByRole("treeitem", { name: /^old/ })).toBeNull(); });
    await userEvent.keyboard("{ArrowRight}");
    expect(await within(dialog).findByRole("treeitem", { name: /^old/ })).toBeInTheDocument();
  });

  it("the Move dialog has no axe violations", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move 1 item" });
    await within(dialog).findByRole("treeitem", { name: /pics/ });
    expect(await axe(dialog.parentElement ?? dialog)).toHaveNoViolations();
  });
});

const interrupted = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "op1", kind: "move", connectionId: "c0", endpoint: "http://127.0.0.1:9000", bucket: "photos", source: "s/dir/", target: "t/dir/",
  total: 2000, done: 700, status: "interrupted", phase: "copying", cursor: "s/dir/x", startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
});

function renderBanner() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <InterruptedBanner connection={connection} notify={hooks.notify} />
    </QueryClientProvider>,
  );
}

describe("FR-45 interrupted banner", () => {
  beforeEach(() => { useOperations.setState({ interrupted: [] }); });

  it("shows nothing when nothing was interrupted", () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("AC-45.2 says a move was interrupted, how far it got, and offers Resume, Review and Discard", () => {
    useOperations.setState({ interrupted: [interrupted()] });
    renderBanner();
    expect(screen.getByText("A move was interrupted")).toBeInTheDocument();
    expect(screen.getByText("700 of 2000 objects in dir were moved before the page closed.")).toBeInTheDocument();
    for (const name of ["Resume", "Review", "Discard"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("names the objects that could not be moved", () => {
    useOperations.setState({ interrupted: [interrupted({ failures: [{ key: "s/dir/a", code: "accessDenied" }] })] });
    renderBanner();
    expect(screen.getByText(/1 object could not be moved/)).toBeInTheDocument();
  });

  it("AC-45.3 Resume continues the same entry", async () => {
    const entry = interrupted();
    useOperations.setState({ interrupted: [entry] });
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(resumeOperation).toHaveBeenCalledWith(connection, entry, expect.anything());
  });

  it("AC-45.4 Discard closes the entry and says some objects are in each place", async () => {
    const entry = interrupted();
    useOperations.setState({ interrupted: [entry] });
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => { expect(hooks.notify).toHaveBeenCalledWith("Discarded. Some objects are in the destination and some are still in dir; nothing was deleted."); });
    expect(discardOperation).toHaveBeenCalledWith(entry);
  });

  it("Review shows live counts of the source and the destination", async () => {
    useOperations.setState({ interrupted: [interrupted()] });
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await screen.findByRole("dialog", { name: "Moving “dir”" });
    expect(await within(dialog).findByText("Still in the source: 3 objects")).toBeInTheDocument();
    expect(within(dialog).getByText("Already in the destination: 3 objects")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    useOperations.setState({ interrupted: [interrupted()] });
    const { container } = renderBanner();
    expect(await axe(container)).toHaveNoViolations();
  });
});
