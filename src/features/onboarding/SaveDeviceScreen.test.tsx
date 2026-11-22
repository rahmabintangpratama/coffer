import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vault, WrongPassphraseError } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { SaveDeviceScreen } from "./SaveDeviceScreen";

// FR-8: Save on this device (O51).
const summary: ConnectionSummary = {
  id: "c1", name: "Other S3-compatible · photos", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00Z",
};
afterEach(() => { vi.restoreAllMocks(); });

describe("AC-8.1 to AC-8.4 Save on this device", () => {
  it("AC-8.1 offers a passphrase or Not now, and says the passphrase cannot be recovered", async () => {
    const { container } = render(<SaveDeviceScreen summary={summary} onSaved={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Save on this device?" })).toBeInTheDocument();
    expect(screen.getByText(/We can’t recover this passphrase/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save with a passphrase" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-8.2 blocks under 12 characters with what to do, and hints from 16", async () => {
    const save = vi.spyOn(vault, "save").mockResolvedValue();
    const { container } = render(<SaveDeviceScreen summary={summary} onSaved={vi.fn()} onSkip={vi.fn()} />);
    const field = screen.getByLabelText("Passphrase");
    await userEvent.type(field, "eleven char");
    expect(screen.getByText("Use at least 12 characters. A longer passphrase is harder to guess.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save with a passphrase" })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.type(field, "s");
    expect(screen.queryByText(/Use at least 12/)).toBeNull();
    expect(screen.queryByText(/^Strong\./)).toBeNull();
    await userEvent.type(field, "1234");
    expect(screen.getByText("Strong. 16 characters or more is best.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves with the passphrase, reports the connection and drops the passphrase from the field", async () => {
    const save = vi.spyOn(vault, "save").mockResolvedValue();
    const onSaved = vi.fn();
    render(<SaveDeviceScreen summary={summary} onSaved={onSaved} onSkip={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Save with a passphrase" }));
    await vi.waitFor(() => { expect(onSaved).toHaveBeenCalledWith(summary); });
    expect(save).toHaveBeenCalledWith(summary, "correct horse battery");
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
  });

  it("AC-8.4 Not now saves nothing", async () => {
    const save = vi.spyOn(vault, "save").mockResolvedValue();
    const onSkip = vi.fn();
    render(<SaveDeviceScreen summary={summary} onSaved={vi.fn()} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onSkip).toHaveBeenCalledWith(summary);
    expect(save).not.toHaveBeenCalled();
  });

  it("while the vault is open the passphrase is not asked again", async () => {
    vi.spyOn(vault, "isUnlocked").mockReturnValue(true);
    const save = vi.spyOn(vault, "save").mockResolvedValue();
    const onSaved = vi.fn();
    const { container } = render(<SaveDeviceScreen summary={summary} onSaved={onSaved} onSkip={vi.fn()} />);
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
    expect(screen.getByText(/share one passphrase/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Save on this device" }));
    await vi.waitFor(() => { expect(onSaved).toHaveBeenCalled(); });
    expect(save).toHaveBeenCalledWith(summary, undefined);
  });

  it("a passphrase that is not the saved connections' one is refused and nothing moves on", async () => {
    vi.spyOn(vault, "save").mockRejectedValue(new WrongPassphraseError());
    const onSaved = vi.fn();
    render(<SaveDeviceScreen summary={summary} onSaved={onSaved} onSkip={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Passphrase"), "another passphrase here");
    await userEvent.click(screen.getByRole("button", { name: "Save with a passphrase" }));
    expect(await screen.findByText(/doesn’t match/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
