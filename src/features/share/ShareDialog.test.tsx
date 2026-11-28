import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary } from "@/lib/types";
import { ShareDialog } from "./ShareDialog";

// FR-60, FR-61: the dialog, its choices and the session-token cap. The S3 fixture rejects a made-up session token, so the
// token cases are proven here against the real presigner instead of in a browser.
const connection = (extra: Partial<ConnectionSummary> = {}): ConnectionSummary => ({
  id: "share-c1",
  name: "Test · bucket",
  providerId: "custom",
  fields: {},
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  addressingStyle: "path",
  bucket: "bucket",
  access: "readWrite",
  createdAt: "2026-11-22T00:00:00Z",
  ...extra,
});
const file = { key: "docs/report.txt", name: "report.txt" };
const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const keys = { accessKeyId: "fake-key", secretAccessKey: "fake-secret" };

/** jsdom has no clipboard; the dialog only calls writeText. */
function stubClipboard(writeText: () => Promise<void>) {
  const write = vi.fn(writeText);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  return write;
}

async function open(summary: ConnectionSummary, notify = vi.fn()) {
  const view = render(<ShareDialog connection={summary} file={file} onClose={vi.fn()} notify={notify} />);
  await screen.findByRole("radio", { name: "1 day" });
  return view;
}

describe("M11 the dialog names the file", () => {
  it("is titled Share “{name}” with the file's icon", async () => {
    await open(connection());
    const dialog = screen.getByRole("dialog", { name: "Share “report.txt”" });
    expect(dialog.querySelector("h2 svg")).not.toBeNull();
  });
});
const choice = (name: string) => screen.getByRole("radio", { name });
const labels = ["15 minutes", "30 minutes", "1 hour", "1 day", "7 days"];

beforeEach(() => { vault.put("share-c1", keys); });
afterEach(() => { vault.lock(); });

describe("AC-60.1 to AC-60.3 the dialog for an ordinary key", () => {
  it("shows the body, five choices, 1 day preselected, and creates a link with exactly that life", async () => {
    const { container } = await open(connection());
    expect(screen.getByText("Anyone with the link can open this file until it expires. Links can’t be revoked early.")).toBeInTheDocument();
    for (const label of labels) expect(choice(label)).not.toHaveAttribute("aria-disabled", "true");
    expect(choice("1 day")).toBeChecked();
    expect(screen.queryByText("This link stops working when your session token expires")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(choice("30 minutes"));
    await userEvent.click(screen.getByRole("button", { name: "Create link for 30 minutes" }));
    const link = await screen.findByRole<HTMLInputElement>("textbox", { name: "Link" });
    const url = new URL(link.value);
    expect(url.pathname).toBe("/bucket/docs/report.txt");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(screen.getByText(/^Expires /)).toBeInTheDocument();
    expect(screen.getByText("To cancel all links early, rotate the access key at your provider.")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-60.5 the link is not stored anywhere in the browser", async () => {
    await open(connection());
    await userEvent.click(screen.getByRole("button", { name: "Create link for 1 day" }));
    const link = await screen.findByRole<HTMLInputElement>("textbox", { name: "Link" });
    const signature = new URL(link.value).searchParams.get("X-Amz-Signature") ?? "missing";
    expect(JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])).not.toContain(signature);
    expect(window.location.href).not.toContain(signature);
  });

  it("Copy link writes the link to the clipboard and says so", async () => {
    const notify = vi.fn();
    const write = stubClipboard(() => Promise.resolve());
    await open(connection(), notify);
    await userEvent.click(screen.getByRole("button", { name: "Create link for 1 day" }));
    const link = await screen.findByRole<HTMLInputElement>("textbox", { name: "Link" });
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(write).toHaveBeenCalledWith(link.value);
    expect(notify).toHaveBeenCalledWith("Copied");
  });

  it("without clipboard access the link text is selected so it can be copied by hand", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    await open(connection());
    await userEvent.click(screen.getByRole("button", { name: "Create link for 1 day" }));
    const link = await screen.findByRole<HTMLInputElement>("textbox", { name: "Link" });
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => { expect(link.selectionEnd).toBe(link.value.length); });
    expect(link.selectionStart).toBe(0);
  });
});

describe("AC-61.1 to AC-61.3 and C-12 a session token", () => {
  beforeEach(() => { vault.put("share-c1", { ...keys, sessionToken: "fake-session-token" }); });

  it("with 3 hours left, longer choices are disabled but still listed, and the longest allowed one is preselected", async () => {
    const { container } = await open(connection({ sessionTokenExpiresAt: inSeconds(3 * 3600) }));
    const notice = screen.getByText("This link stops working when your session token expires").closest<HTMLElement>('[data-component="SessionTokenNotice"]');
    if (!notice) throw new Error("no notice");
    expect(within(notice).getByText(/so longer choices are unavailable/)).toBeInTheDocument();
    for (const label of ["1 day", "7 days"]) expect(choice(label)).toHaveAttribute("aria-disabled", "true");
    for (const label of ["15 minutes", "30 minutes", "1 hour"]) expect(choice(label)).not.toHaveAttribute("aria-disabled", "true");
    expect(choice("1 hour")).toBeChecked();
    await userEvent.click(choice("7 days"));
    expect(choice("1 hour")).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("an unknown expiry caps links at 1 hour and says so", async () => {
    await open(connection());
    expect(screen.getByText("Coffer doesn’t know when this token expires, so links last at most 1 hour.")).toBeInTheDocument();
    expect(choice("1 day")).toHaveAttribute("aria-disabled", "true");
    expect(choice("1 hour")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Create link for 1 hour" }));
    const link = await screen.findByRole<HTMLInputElement>("textbox", { name: "Link" });
    expect(new URL(link.value).searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(new URL(link.value).searchParams.get("X-Amz-Security-Token")).toBe("fake-session-token");
  });

  it("with under 15 minutes left no choice is available and the reason is given", async () => {
    const { container } = await open(connection({ sessionTokenExpiresAt: inSeconds(10 * 60) }));
    expect(screen.getByText(/under 15 minutes, so a link can’t be created/)).toBeInTheDocument();
    for (const label of labels) expect(choice(label)).toHaveAttribute("aria-disabled", "true");
    for (const label of labels) expect(choice(label)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Share link" })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("an expired token creates no link", async () => {
    await open(connection({ sessionTokenExpiresAt: inSeconds(-60) }));
    expect(screen.getByRole("button", { name: "Share link" })).toBeDisabled();
  });
});
