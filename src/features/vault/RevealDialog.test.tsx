import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vault, WrongPassphraseError } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { REVEAL_SECONDS, RevealDialog } from "./RevealDialog";

// FR-102: Show secret key. The secret is fake.
const connection: ConnectionSummary = {
  id: "c1", name: "Other S3-compatible · photos", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00Z",
};
const SECRET = "fake-secret-key-for-tests-only";

beforeEach(() => { vi.spyOn(vault, "reveal").mockImplementation((_id, passphrase) => (passphrase === "right passphrase" ? Promise.resolve(SECRET) : Promise.reject(new WrongPassphraseError()))); });
afterEach(() => { vi.useRealTimers(); });

async function reveal(passphrase: string) {
  await userEvent.type(screen.getByLabelText("Passphrase"), passphrase);
  await userEvent.click(screen.getByRole("button", { name: "Show secret key" }));
}

describe("AC-102.1 to AC-102.4", () => {
  it("needs the passphrase: a wrong one shows nothing", async () => {
    const { container } = render(<RevealDialog connection={connection} onClose={vi.fn()} notify={vi.fn()} />);
    expect(screen.getByText("Enter your passphrase to show the secret key for Other S3-compatible · photos.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await reveal("wrong one");
    expect(await screen.findByText(/doesn’t match/)).toBeInTheDocument();
    expect(screen.queryByTestId("revealed-secret")).toBeNull();
  });

  it("shows the secret with the 15-second note, then hides it again and asks again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(<RevealDialog connection={connection} onClose={vi.fn()} notify={vi.fn()} />);
    await reveal("right passphrase");
    expect(await screen.findByTestId("revealed-secret")).toHaveTextContent(SECRET);
    expect(screen.getByText(`The secret stays visible for ${REVEAL_SECONDS.toString()} seconds, then hides again.`)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    act(() => { vi.advanceTimersByTime((REVEAL_SECONDS - 1) * 1000); });
    expect(screen.getByTestId("revealed-secret")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByTestId("revealed-secret")).toBeNull();
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
  });

  it("Hide now and closing both clear it", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<RevealDialog connection={connection} onClose={onClose} notify={vi.fn()} />);
    await reveal("right passphrase");
    await userEvent.click(await screen.findByRole("button", { name: "Hide now" }));
    expect(screen.queryByTestId("revealed-secret")).toBeNull();
    await reveal("right passphrase");
    await screen.findByTestId("revealed-secret");
    rerender(<RevealDialog connection={null} onClose={onClose} notify={vi.fn()} />);
    rerender(<RevealDialog connection={connection} onClose={onClose} notify={vi.fn()} />);
    expect(screen.queryByTestId("revealed-secret")).toBeNull();
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
  });

  it("AC-102.3 Copy puts the secret on the clipboard and says to clear it", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const notify = vi.fn();
    render(<RevealDialog connection={connection} onClose={vi.fn()} notify={notify} />);
    await reveal("right passphrase");
    await userEvent.click(await screen.findByRole("button", { name: "Copy secret key" }));
    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(notify).toHaveBeenCalledWith("Copied. Clear your clipboard when you’re done.");
  });

  it("AC-102.4 the secret is not in the dialog's name, the title or the address", async () => {
    render(<RevealDialog connection={connection} onClose={vi.fn()} notify={vi.fn()} />);
    await reveal("right passphrase");
    const dialog = await screen.findByRole("dialog", { name: "Show secret key" });
    expect(within(dialog).getByRole("heading", { name: "Show secret key" })).toBeInTheDocument();
    expect(document.title).not.toContain(SECRET);
    expect(window.location.href).not.toContain(SECRET);
  });
});
