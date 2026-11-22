import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransferPanel } from "./TransferPanel";
import { cancelTransfer } from "./queue";
import { useTransfers, type Transfer } from "./store";

vi.mock("./queue", () => ({ cancelTransfer: vi.fn(), retryTransfer: vi.fn() }));

const transfer = (over: Partial<Transfer>): Transfer => ({ id: "t1", name: "movie.mp4", folder: "videos", size: 1024 * 1024 * 100, bytesDone: 0, status: "running", ...over });

const resizeObservers: { callback: () => void }[] = [];
beforeEach(() => {
  useTransfers.getState().reset();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resizeObservers.push({ callback }); } observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resizeObservers.length = 0;
  document.documentElement.style.removeProperty("--cf-tray-height");
});

describe("the page keeps clear of the panel", () => {
  it("publishes the panel's height for the page's bottom padding while it shows, and takes it back when it goes", () => {
    useTransfers.getState().add([transfer({})]);
    const { unmount } = render(<TransferPanel />);
    expect(document.documentElement.style.getPropertyValue("--cf-tray-height")).toMatch(/^\d+px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue("--cf-tray-height")).toBe("");
  });

  it("publishes nothing when there is nothing to show", () => {
    render(<TransferPanel />);
    expect(document.documentElement.style.getPropertyValue("--cf-tray-height")).toBe("");
  });
});

describe("FR-44 transfer panel", () => {
  it("renders nothing without transfers", () => {
    const { container } = render(<TransferPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("AC-44.1 shows the count and a progressbar with a text value", () => {
    useTransfers.getState().add([transfer({ bytesDone: 1024 * 1024 * 25 }), transfer({ id: "t2", name: "b.txt", status: "queued", size: 10 })]);
    render(<TransferPanel />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Uploading 2 items");
    const bar = screen.getByRole("progressbar", { name: "movie.mp4" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar).toHaveAttribute("aria-valuetext", "25% · 25.0 MiB of 100.0 MiB");
    expect(screen.getByRole("progressbar", { name: "b.txt" })).toHaveAttribute("aria-valuetext", "Waiting");
  });

  it("AC-44.1 collapses to its header", async () => {
    useTransfers.getState().add([transfer({})]);
    render(<TransferPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-44.2 a failed row says why and offers Try again", () => {
    useTransfers.getState().add([transfer({ status: "failed", error: "accessDenied" })]);
    render(<TransferPanel />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("1 upload failed");
    expect(screen.getByRole("alert")).toHaveTextContent("This key isn’t allowed to write here.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("AC-41.3 each unfinished row has a Cancel upload button named with the file", async () => {
    useTransfers.getState().add([transfer({})]);
    render(<TransferPanel />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel upload: movie.mp4" }));
    expect(cancelTransfer).toHaveBeenCalledWith("t1");
  });

  it("AC-44.5 an interrupted upload says so and how to continue", () => {
    useTransfers.getState().addInterrupted([{ id: "u1", name: "big.iso" }]);
    render(<TransferPanel />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Upload interrupted");
    expect(screen.getByText("big.iso was interrupted when the page closed. Start it again.")).toBeInTheDocument();
    expect(screen.queryByText(/Choose file/)).toBeNull();
  });

  it("shows the finished count and Dismiss clears it", async () => {
    useTransfers.getState().add([transfer({ status: "done", bytesDone: 1024 * 1024 * 100 })]);
    render(<TransferPanel />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Uploaded 1 item");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(useTransfers.getState().transfers).toEqual([]);
  });

  it("renders a hostile name as text", () => {
    useTransfers.getState().add([transfer({ name: "<img src=x onerror=alert(1)>" })]);
    const { container } = render(<TransferPanel />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("has no axe violations", async () => {
    useTransfers.getState().add([transfer({ bytesDone: 5 }), transfer({ id: "t2", name: "x", status: "failed", error: "network" })]);
    useTransfers.getState().addInterrupted([{ id: "u1", name: "big.iso" }]);
    const { container } = render(<TransferPanel />);
    await act(async () => { await Promise.resolve(); });
    expect(await axe(container)).toHaveNoViolations();
    expect(within(container).getAllByRole("listitem").length).toBeGreaterThan(2);
  });
});
