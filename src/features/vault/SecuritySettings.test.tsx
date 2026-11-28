import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as forget from "@/lib/storage/forget";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, JournalEntry } from "@/lib/types";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { type ConnectionRemoval, ConnectionsSettings, type ConnectionsSettingsProps, type RemovalPlan } from "./ConnectionsSettings";
import { SecuritySettings, type SecuritySettingsProps } from "./SecuritySettings";

// FR-101, FR-102, FR-11: Security and Connections settings, and the switcher.
const connection = (id: string): ConnectionSummary => ({
  id, name: `Other S3-compatible · ${id}`, providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: id, access: "readWrite", createdAt: "2026-01-01T00:00:00Z",
});
const one = connection("photos");
const two = connection("docs");

function props(over: Partial<SecuritySettingsProps> = {}): SecuritySettingsProps {
  return { autoLockMinutes: 15, onAutoLock: vi.fn(), savedCount: 2, onLock: vi.fn(), onForget: vi.fn(() => Promise.resolve()), ...over };
}
const emptyPlan: RemovalPlan = { unfinished: [], transfers: 0, uploads: 0, starred: 0, recent: 0 };
const entry = (id: string, status: JournalEntry["status"] = "interrupted"): JournalEntry => ({
  id, kind: "move", connectionId: "docs", endpoint: "https://s3.example.test", bucket: "docs", source: "reports/", target: "archive/", status, phase: "copying",
  total: 10, done: 4, startedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
});
function removalOf(over: Partial<ConnectionRemoval> = {}): ConnectionRemoval {
  return { inspect: vi.fn(() => Promise.resolve(emptyPlan)), resume: vi.fn(), discard: vi.fn(() => Promise.resolve()), remove: vi.fn(() => Promise.resolve({ aborted: 0, failed: 0 })), ...over };
}
function connectionProps(over: Partial<ConnectionsSettingsProps> = {}): ConnectionsSettingsProps {
  return { active: one, saved: [one, two], removal: removalOf(), tools: { providerName: () => "Other S3-compatible", add: vi.fn(), test: vi.fn(() => Promise.resolve({ steps: [] })), rename: vi.fn((connection: ConnectionSummary, name: string) => Promise.resolve({ ...connection, name })) }, onRenamed: vi.fn(), onRemoved: vi.fn(), notify: vi.fn(), ...over };
}

beforeEach(() => {
  vi.spyOn(forget, "storedReport").mockResolvedValue({ connections: 2, journal: 1, starred: 3, recent: 4, uploads: 0 });
  vi.spyOn(vault, "isUnlocked").mockReturnValue(true);
  vi.spyOn(vault, "savedCount").mockResolvedValue(2);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("AC-101.1 and AC-101.2 Security", () => {
  it("lists the auto-lock choices with the current one checked, and warns on Never", async () => {
    const onAutoLock = vi.fn();
    const { container, rerender } = render(<SecuritySettings {...props({ onAutoLock })} />);
    for (const label of ["5 minutes", "15 minutes", "30 minutes", "60 minutes", "Never"]) expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "15 minutes" })).toBeChecked();
    expect(screen.queryByText(/Without auto-lock/)).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Never" }));
    expect(onAutoLock).toHaveBeenCalledWith(0);
    rerender(<SecuritySettings {...props({ autoLockMinutes: 0 })} />);
    expect(screen.getByText(/Without auto-lock, anyone who opens this browser/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("What's stored lists the counts and says nothing leaves except to the provider", async () => {
    render(<SecuritySettings {...props()} />);
    const stored = await screen.findByText("2 connections · encrypted with your passphrase", { selector: "dd" });
    expect(stored).toBeInTheDocument();
    expect(screen.getByText("1 interrupted move")).toBeInTheDocument();
    expect(screen.getByText("3 items · not encrypted")).toBeInTheDocument();
    expect(screen.getByText("4 files · names only")).toBeInTheDocument();
    expect(screen.getByText("Coffer sends nothing to any server except your own storage provider.")).toBeInTheDocument();
  });

  it("AC-9.4 Lock now asks first, then locks", async () => {
    const onLock = vi.fn();
    render(<SecuritySettings {...props({ onLock })} />);
    await userEvent.click(screen.getByRole("button", { name: "Lock now" }));
    const dialog = await screen.findByRole("dialog", { name: "Lock Coffer now?" });
    expect(onLock).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Lock now" }));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("Lock now is off, with the reason, when nothing is saved", () => {
    vi.spyOn(vault, "isUnlocked").mockReturnValue(false);
    render(<SecuritySettings {...props()} />);
    expect(screen.getByRole("button", { name: "Lock now" })).toBeDisabled();
    expect(screen.getByText(/No connections are saved on this device/)).toBeInTheDocument();
  });

  it("Forget asks for the count and then forgets", async () => {
    const onForget = vi.fn(() => Promise.resolve());
    render(<SecuritySettings {...props({ onForget })} />);
    await userEvent.click(screen.getByRole("button", { name: /^Forget$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Forget this device?" });
    expect(await within(dialog).findByText("2 saved connections and their keys")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Forget this device" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Type 2 to confirm"), "2");
    await userEvent.click(confirm);
    await vi.waitFor(() => { expect(onForget).toHaveBeenCalledTimes(1); });
  });
});

describe("AC-11.4 and AC-102.1 Connections", () => {
  it("a connection that is not saved cannot be revealed or removed, and says why", () => {
    render(<ConnectionsSettings {...connectionProps({ saved: [two] })} />);
    expect(screen.getByRole("button", { name: `Show secret key: ${one.name}` })).toBeDisabled();
    expect(screen.queryByRole("button", { name: `Remove: ${one.name}` })).toBeNull();
    expect(screen.getByText("This connection isn’t saved, so its secret key can’t be shown again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Show secret key: ${two.name}` })).toBeEnabled();
  });

  it("OQ-37 the confirmation lists what goes, and removing runs the removal once and reports it", async () => {
    const removal = removalOf({ inspect: vi.fn(() => Promise.resolve({ ...emptyPlan, transfers: 2, uploads: 1, starred: 3, recent: 1 })) });
    const p = connectionProps({ removal });
    render(<ConnectionsSettings {...p} />);
    await userEvent.click(screen.getByRole("button", { name: `Remove: ${two.name}` }));
    const dialog = await screen.findByRole("dialog", { name: `Remove ${two.name}?` });
    expect(within(dialog).getByText(/Your bucket and its files are not touched/)).toBeInTheDocument();
    for (const line of ["Its saved keys", "2 running or waiting transfers, stopped", "1 unfinished upload, cancelled at your provider", "3 starred items", "1 recent file"]) expect(within(dialog).getByText(line)).toBeInTheDocument();
    expect(within(dialog).getByText(/Other connections, their transfers and your passphrase stay/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() => { expect(p.onRemoved).toHaveBeenCalledWith(two); });
    expect(removal.remove).toHaveBeenCalledTimes(1);
    expect(removal.remove).toHaveBeenCalledWith(two);
    expect(p.notify).toHaveBeenCalledWith(`Removed ${two.name}`);
  });

  it("OQ-37 says how many unfinished uploads were cancelled and how many were not", async () => {
    const removal = removalOf({ remove: vi.fn(() => Promise.resolve({ aborted: 2, failed: 1 })) });
    const p = connectionProps({ removal });
    render(<ConnectionsSettings {...p} />);
    await userEvent.click(screen.getByRole("button", { name: `Remove: ${two.name}` }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: `Remove ${two.name}?` })).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() => { expect(p.notify).toHaveBeenCalledWith(`Removed ${two.name}. 2 of 3 unfinished uploads cancelled at your provider; 1 could not be and may still use space there.`); });
  });

  it("a removal that fails says so and keeps the connection in the list", async () => {
    const p = connectionProps({ removal: removalOf({ remove: vi.fn(() => Promise.reject(new Error("blocked"))) }) });
    render(<ConnectionsSettings {...p} />);
    await userEvent.click(screen.getByRole("button", { name: `Remove: ${two.name}` }));
    const dialog = await screen.findByRole("dialog", { name: `Remove ${two.name}?` });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() => { expect(p.notify).toHaveBeenCalledWith(`Couldn’t remove ${two.name}. Try again.`); });
    expect(p.onRemoved).not.toHaveBeenCalled();
  });

  it("OQ-37 an unfinished move blocks the removal and offers Resume or Discard", async () => {
    const removal = removalOf({ inspect: vi.fn(() => Promise.resolve({ ...emptyPlan, unfinished: [{ entry: entry("e1"), live: false }] })) });
    const p = connectionProps({ removal });
    render(<ConnectionsSettings {...p} />);
    await userEvent.click(screen.getByRole("button", { name: `Remove: ${two.name}` }));
    const dialog = await screen.findByRole("dialog", { name: "Finish the unfinished moves first" });
    expect(within(dialog).getByText("reports: 4 of 10 done")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: `Remove ${two.name}?` })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Resume" }));
    expect(removal.resume).toHaveBeenCalledWith(two, expect.objectContaining({ id: "e1" }));
    expect(removal.remove).not.toHaveBeenCalled();
  });

  it("OQ-37 discarding the last unfinished move goes on to the confirmation", async () => {
    let discarded = false;
    const removal = removalOf({
      inspect: vi.fn(() => Promise.resolve(discarded ? emptyPlan : { ...emptyPlan, unfinished: [{ entry: entry("e1"), live: false }] })),
      discard: vi.fn(() => { discarded = true; return Promise.resolve(); }),
    });
    render(<ConnectionsSettings {...connectionProps({ removal })} />);
    await userEvent.click(screen.getByRole("button", { name: `Remove: ${two.name}` }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Finish the unfinished moves first" })).getByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("dialog", { name: `Remove ${two.name}?` })).toBeInTheDocument();
    expect(removal.remove).not.toHaveBeenCalled();
  });

  it("OQ-37 a move that is still running cannot be resumed or discarded", async () => {
    const removal = removalOf({ inspect: vi.fn(() => Promise.resolve({ ...emptyPlan, unfinished: [{ entry: entry("e1", "running"), live: true }] })) });
    render(<ConnectionsSettings {...connectionProps({ removal })} />);
    await userEvent.click(screen.getByRole("button", { name: `Remove: ${two.name}` }));
    const dialog = await screen.findByRole("dialog", { name: "Finish the unfinished moves first" });
    expect(within(dialog).getByText("Still running. Try again when it finishes.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("What's stored lists the upload state as well", async () => {
    render(<SecuritySettings {...props()} />);
    expect(await screen.findByText("Upload state")).toBeInTheDocument();
    expect(screen.getByText("0 unfinished uploads · no file contents")).toBeInTheDocument();
  });

  it("Forget that fails says so and Cancel is off while it works", async () => {
    let fail: (error: Error) => void = () => undefined;
    const onForget = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    render(<SecuritySettings {...props({ onForget })} />);
    await userEvent.click(screen.getByRole("button", { name: /^Forget$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Forget this device?" });
    await userEvent.type(await within(dialog).findByLabelText("Type 2 to confirm"), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Forget this device" }));
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fail(new Error("storage"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn’t finish forgetting this device");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("Show secret key opens the passphrase dialog for that connection", async () => {
    render(<ConnectionsSettings {...connectionProps()} />);
    await userEvent.click(screen.getByRole("button", { name: `Show secret key: ${two.name}` }));
    expect(await screen.findByText(`Enter your passphrase to show the secret key for ${two.name}.`)).toBeInTheDocument();
  });
});

describe("FR-11 the switcher", () => {
  beforeEach(() => {
    vi.spyOn(vault, "saved").mockResolvedValue([one, two]);
    vi.spyOn(vault, "has").mockImplementation((id) => id === "photos");
  });

  it("names the active connection and its lock state, lists both with their state, and marks the current one", async () => {
    const { container } = render(<ConnectionSwitcher active={one} variant="block" onSwitch={vi.fn()} onAdd={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: `Switch connection: ${one.name}, Unlocked` });
    await userEvent.click(trigger);
    const list = await screen.findByRole("list", { name: "Connections" });
    await vi.waitFor(() => { expect(within(list).getAllByRole("listitem")).toHaveLength(2); });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Unlocked");
    expect(first).toHaveTextContent("Current");
    expect(second).toHaveTextContent("Locked · needs passphrase");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("choosing another connection switches; the current one does nothing; Add connection and Lock are offered", async () => {
    const onSwitch = vi.fn();
    const onAdd = vi.fn();
    const onLock = vi.fn();
    render(<ConnectionSwitcher active={one} variant="icon" onSwitch={onSwitch} onAdd={onAdd} onLock={onLock} />);
    await userEvent.click(screen.getByRole("button", { name: /^Switch connection:/ }));
    await screen.findByRole("list", { name: "Connections" });
    await vi.waitFor(() => { expect(screen.getAllByRole("listitem")).toHaveLength(2); });
    await userEvent.click(screen.getByRole("button", { name: new RegExp(two.name) }));
    expect(onSwitch).toHaveBeenCalledWith(two);
    await userEvent.click(screen.getByRole("button", { name: /^Switch connection:/ }));
    await userEvent.click(screen.getByRole("button", { name: /Current/ }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /^Switch connection:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add connection" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /^Switch connection:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("without anything saved there is no Lock", async () => {
    render(<ConnectionSwitcher active={one} variant="block" onSwitch={vi.fn()} onAdd={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /^Switch connection:/ }));
    await screen.findByRole("list", { name: "Connections" });
    expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
  });
});

describe("M11 Connections: add, test, rename and the row subtitle", () => {
  it("describes each connection by provider and bucket, and says how it is kept", () => {
    render(<ConnectionsSettings {...connectionProps({ saved: [two] })} />);
    const list = screen.getByRole("list", { name: "Connections" });
    expect(within(list).getByText("Other S3-compatible · docs · Encrypted with your passphrase")).toBeInTheDocument();
    expect(within(list).getByText("Other S3-compatible · photos · Not saved on this device")).toBeInTheDocument();
    expect(screen.queryByText(/1 connection ·/)).toBeNull();
  });

  it("Add connection starts onboarding", async () => {
    const p = connectionProps();
    render(<ConnectionsSettings {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Add connection" }));
    expect(p.tools.add).toHaveBeenCalled();
  });

  it("Test connection runs the steps and says it works, or that it failed", async () => {
    const steps = (status: "pass" | "fail") => (["reach", "cors", "list", "write", "read", "clean"] as const).map((id) => ({ id, status: id === "write" ? status : ("pass" as const) }));
    const test = vi.fn().mockResolvedValueOnce({ steps: steps("pass") }).mockResolvedValueOnce({ steps: steps("fail") });
    const p = connectionProps();
    render(<ConnectionsSettings {...p} tools={{ ...p.tools, test }} />);
    await userEvent.click(screen.getByRole("button", { name: `Test connection: ${one.name}` }));
    const dialog = await screen.findByRole("dialog", { name: `Test ${one.name}` });
    expect(await within(dialog).findByText("Connection works")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("Connection test failed")).toBeInTheDocument();
    expect(test).toHaveBeenCalledTimes(2);
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it("Rename saves the new label for a saved connection only, and refuses an empty one", async () => {
    const p = connectionProps({ saved: [two] });
    render(<ConnectionsSettings {...p} />);
    expect(screen.queryByRole("button", { name: `Rename: ${one.name}` })).toBeNull(); // only in memory
    await userEvent.click(screen.getByRole("button", { name: `Rename: ${two.name}` }));
    const dialog = await screen.findByRole("dialog", { name: `Rename ${two.name}` });
    const field = within(dialog).getByLabelText("Name");
    await userEvent.clear(field);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    await userEvent.type(field, "Team docs");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => { expect(p.onRenamed).toHaveBeenCalledWith(expect.objectContaining({ id: "docs", name: "Team docs" })); });
    expect(p.notify).toHaveBeenCalledWith("Renamed to Team docs");
  });
});
