import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vault, WrongPassphraseError } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { pickConnection, UnlockScreen, type UnlockScreenProps, waitAfter } from "./UnlockScreen";

// FR-9: Unlock, the wrong-passphrase state, the Locked screen and its transfers banner (C-38).
const connection = (id: string, lastUsedAt?: string): ConnectionSummary => ({
  id, name: `Other S3-compatible · ${id}`, providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: id, access: "readWrite", createdAt: "2026-01-01T00:00:00Z", ...(lastUsedAt === undefined ? {} : { lastUsedAt }),
});
const saved = [connection("old", "2026-01-01T00:00:00Z"), connection("new", "2026-02-01T00:00:00Z")];

function props(over: Partial<UnlockScreenProps> = {}): UnlockScreenProps {
  return { reason: "start", onUnlocked: vi.fn(), onUseOther: vi.fn(), onNothingSaved: vi.fn(), onStopTransfers: vi.fn(), onForget: vi.fn(() => Promise.resolve()), ...over };
}

beforeEach(() => {
  vi.spyOn(vault, "savedCount").mockResolvedValue(2);
  vi.spyOn(vault, "touch").mockResolvedValue();
});
afterEach(() => { vi.useRealTimers(); });

describe("which connection opens", () => {
  it("is the one that was active, else the one used last", () => {
    expect(pickConnection(saved, "old")?.id).toBe("old");
    expect(pickConnection(saved, undefined)?.id).toBe("new");
    expect(pickConnection(saved, "gone")?.id).toBe("new");
    expect(pickConnection([], undefined)).toBeUndefined();
  });
});

describe("the wait after wrong passphrases", () => {
  it("is free for three tries, then 2, 4, 8, 16 and at most 30 seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(waitAfter)).toEqual([0, 0, 0, 2, 4, 8, 16, 30, 30]);
  });
});

describe("AC-9.1 and AC-9.2 Unlock", () => {
  it("asks for the passphrase, with Unlock, a different connection and Forget", async () => {
    const { container } = render(<UnlockScreen {...props()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Unlock your connections" })).toBeInTheDocument();
    expect(screen.getByLabelText("Passphrase")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Use a different connection" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forget this device" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens the most recent connection with the right passphrase, and clears the field", async () => {
    vi.spyOn(vault, "unlock").mockResolvedValue(saved);
    const p = props();
    render(<UnlockScreen {...p} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await vi.waitFor(() => { expect(p.onUnlocked).toHaveBeenCalledTimes(1); });
    expect(p.onUnlocked).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }), saved);
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
  });

  it("AC-9.5 reopens the connection that was active before a lock", async () => {
    vi.spyOn(vault, "unlock").mockResolvedValue(saved);
    const p = props({ reason: "manual", previousId: "old" });
    render(<UnlockScreen {...p} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await vi.waitFor(() => { expect(p.onUnlocked).toHaveBeenCalledWith(expect.objectContaining({ id: "old" }), saved); });
  });

  it("a wrong passphrase says so, stays locked and keeps the field", async () => {
    vi.spyOn(vault, "unlock").mockRejectedValue(new WrongPassphraseError());
    const p = props();
    const { container } = render(<UnlockScreen {...p} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "nope nope nope");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("That passphrase doesn’t match. Check for caps lock and try again.")).toBeInTheDocument();
    expect(p.onUnlocked).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Passphrase")).toHaveAttribute("aria-invalid", "true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("after three wrong passphrases the button waits, and says for how long", async () => {
    vi.spyOn(vault, "unlock").mockRejectedValue(new WrongPassphraseError());
    render(<UnlockScreen {...props()} />);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await userEvent.clear(screen.getByLabelText("Passphrase"));
      await userEvent.type(screen.getByLabelText("Passphrase"), `wrong ${attempt.toString()}`);
      await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
      await screen.findByText(/doesn’t match/);
    }
    expect(await screen.findByText("Too many tries. Wait 2 seconds before trying again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });

  it("a failure that is not a wrong passphrase (storage gone, a record that is not ours) says so instead of spinning", async () => {
    vi.spyOn(vault, "unlock").mockRejectedValue(new Error("IndexedDB is unavailable"));
    render(<UnlockScreen {...props()} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t open the saved connections");
    expect(screen.getByRole("button", { name: "Unlock" })).toBeEnabled();
    expect(screen.queryByText(/doesn’t match/)).toBeNull();
  });

  it("the wait is said once with its full length, not counted down aloud", async () => {
    vi.spyOn(vault, "unlock").mockRejectedValue(new WrongPassphraseError());
    render(<UnlockScreen {...props()} />);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await userEvent.clear(screen.getByLabelText("Passphrase"));
      await userEvent.type(screen.getByLabelText("Passphrase"), `wrong ${attempt.toString()}`);
      await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
      await screen.findByText(/doesn’t match/);
    }
    const status = await screen.findByText(/Too many tries/);
    expect(status).toHaveAttribute("role", "status");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(status).toHaveTextContent("Wait 2 seconds");
  });

  it("a stale hint (nothing saved) goes to Welcome", async () => {
    vi.spyOn(vault, "savedCount").mockResolvedValue(0);
    const p = props();
    render(<UnlockScreen {...p} />);
    await vi.waitFor(() => { expect(p.onNothingSaved).toHaveBeenCalledTimes(1); });
  });

  it("Use a different connection leaves Unlock", async () => {
    const p = props();
    render(<UnlockScreen {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Use a different connection" }));
    expect(p.onUseOther).toHaveBeenCalledTimes(1);
  });
});

describe("O62 the Locked screen", () => {
  it("says how long it was away after an auto-lock, and that it was locked here or elsewhere otherwise", () => {
    const { rerender } = render(<UnlockScreen {...props({ reason: "auto", minutes: 15 })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Coffer is locked" })).toBeInTheDocument();
    expect(screen.getByText(/It locked after 15 minutes away/)).toBeInTheDocument();
    rerender(<UnlockScreen {...props({ reason: "manual" })} />);
    expect(screen.getByText(/You locked Coffer/)).toBeInTheDocument();
    rerender(<UnlockScreen {...props({ reason: "remote" })} />);
    expect(screen.getByText(/Coffer was locked in another tab/)).toBeInTheDocument();
  });

  it("AC-9.7 shows the running transfers and Stop transfers and lock, and the count follows the leases", async () => {
    vault.put("lease-c", { accessKeyId: "AK", secretAccessKey: "SK" });
    const p = props({ reason: "manual" });
    const { container } = render(<UnlockScreen {...p} />);
    expect(screen.queryByText(/still finishing/)).toBeNull();
    let lease!: ReturnType<typeof vault.lease>;
    act(() => { lease = vault.lease("lease-c"); });
    expect(await screen.findByText("1 transfer is still finishing in the background.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Stop transfers and lock" }));
    expect(p.onStopTransfers).toHaveBeenCalledTimes(1);
    act(() => { lease.release(); });
    await vi.waitFor(() => { expect(screen.queryByText(/still finishing/)).toBeNull(); });
    vault.forget("lease-c");
  });
});

describe("Forget this device from Unlock", () => {
  it("opens the dialog with the count to type, and forgets only when it matches", async () => {
    const p = props();
    render(<UnlockScreen {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Forget this device" }));
    const dialog = await screen.findByRole("dialog", { name: "Forget this device?" });
    const confirm = within(dialog).getByRole("button", { name: "Forget this device" });
    expect(confirm).toBeDisabled();
    await userEvent.type(await within(dialog).findByLabelText("Type 2 to confirm"), "2");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await vi.waitFor(() => { expect(p.onForget).toHaveBeenCalledTimes(1); });
  });
});
