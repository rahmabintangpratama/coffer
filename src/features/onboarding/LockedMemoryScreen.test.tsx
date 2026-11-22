import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { LockedMemoryScreen } from "./LockedMemoryScreen";

// AC-9.8: the screen for a connection that was only in memory when another tab locked.
const connection: ConnectionSummary = {
  id: "m1", name: "Other S3-compatible · photos", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00Z",
};
afterEach(() => { vi.restoreAllMocks(); });

describe("LockedMemoryScreen", () => {
  it("says it was locked from another tab and that the connection was not saved, and leads to the form", async () => {
    vi.spyOn(vault, "savedCount").mockResolvedValue(0);
    const onReenter = vi.fn();
    const { container } = render(<LockedMemoryScreen connection={connection} reason="remote" onReenter={onReenter} onUnlockSaved={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Coffer is locked" })).toBeInTheDocument();
    expect(screen.getByText("Coffer was locked from another tab. This connection wasn’t saved, so enter its keys again.")).toBeInTheDocument();
    expect(screen.getByText(connection.name)).toBeInTheDocument();
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock saved connections" })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Enter the keys again" }));
    expect(onReenter).toHaveBeenCalledTimes(1);
  });

  it("a lock made in this tab says so without naming another tab", () => {
    vi.spyOn(vault, "savedCount").mockResolvedValue(0);
    render(<LockedMemoryScreen connection={connection} reason="manual" onReenter={vi.fn()} onUnlockSaved={vi.fn()} />);
    expect(screen.getByText("Coffer was locked. This connection wasn’t saved, so enter its keys again.")).toBeInTheDocument();
  });

  it("offers Unlock saved connections when others are saved", async () => {
    vi.spyOn(vault, "savedCount").mockResolvedValue(2);
    const onUnlockSaved = vi.fn();
    render(<LockedMemoryScreen connection={connection} reason="remote" onReenter={vi.fn()} onUnlockSaved={onUnlockSaved} />);
    await userEvent.click(await screen.findByRole("button", { name: "Unlock saved connections" }));
    expect(onUnlockSaved).toHaveBeenCalledTimes(1);
  });
});
