import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyByteLength, looksBinary, mimeOf, sniffKind } from "@/lib/s3/keys";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { Preview, type PreviewProps } from "./Preview";

const readObject = vi.fn<(client: unknown, options: { key: string; length?: number }) => Promise<Uint8Array>>();
const presignView = vi.fn<(client: unknown, options: { key: string }) => Promise<string>>();
vi.mock("@/lib/s3", () => ({
  clientFor: () => ({}),
  readObject: (client: unknown, options: { key: string; length?: number }) => readObject(client, options),
  presignView: (client: unknown, options: { key: string }) => presignView(client, options),
  mimeOf,
  sniffKind,
  looksBinary,
  keyByteLength,
}));

const https: ConnectionSummary = {
  id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "b", access: "readWrite", createdAt: "2026-01-01T00:00:00.000Z",
};
const loopback: ConnectionSummary = { ...https, endpoint: "http://127.0.0.1:9000" };

const file = (name: string, over: Partial<FileItem> = {}): FileItem => ({
  kind: "file", key: `d/${name}`, name, size: 10, lastModified: "2026-01-02T03:04:05Z", etag: "e", contentType: "",
  fileKind: (name.endsWith(".png") ? "image" : name.endsWith(".svg") ? "svg" : name.endsWith(".mp3") ? "audio" : name.endsWith(".mp4") ? "video" : name.endsWith(".zip") ? "archive" : name.includes(".") ? "code" : "unknown"),
  ...over,
});
const enc = (text: string) => new TextEncoder().encode(text);

const created: Blob[] = [];
beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { created.push(blob); return "blob:mock"; }), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  readObject.mockReset();
  presignView.mockReset();
  created.length = 0;
});

function setup(files: FileItem[], index = 0, over: Partial<PreviewProps> = {}) {
  const props: PreviewProps = {
    connection: loopback, files, index, onClose: vi.fn(), onStep: vi.fn(), onDownload: vi.fn(), renderDetails: vi.fn((file: FileItem) => <aside aria-label="Details">{file.name}</aside>), onCopyKey: vi.fn(), onShare: vi.fn(), isStarred: () => false, onToggleStar: vi.fn(), ...over,
  };
  render(<Preview {...props} />);
  return props;
}

describe("FR-50 viewer", () => {
  it("AC-50.3 is a dialog named Preview of {name}", async () => {
    readObject.mockResolvedValue(enc("x"));
    setup([file("a.txt")]);
    expect(screen.getByRole("dialog", { name: "Preview of a.txt" })).toBeInTheDocument();
    await screen.findByText(/Code or text/);
  });

  it("AC-50.1 shows the name, Download and Details, and back closes", async () => {
    readObject.mockResolvedValue(enc("x"));
    const props = setup([file("a.txt")]);
    await screen.findByText(/Code or text/);
    expect(screen.getByRole("heading", { level: 1, name: "a.txt" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(props.onDownload).toHaveBeenCalledWith(expect.objectContaining({ name: "a.txt" }));
    expect(screen.queryByRole("complementary", { name: "Details" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("dialog")).getByRole("complementary", { name: "Details" })).toHaveTextContent("a.txt");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("AC-50.1 Escape asks to close", async () => {
    readObject.mockResolvedValue(enc("x"));
    const props = setup([file("a.txt")]);
    await screen.findByText(/Code or text/);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("AC-50.2 announces the position and moves with the arrow keys, not past either end", async () => {
    readObject.mockResolvedValue(enc("x"));
    const props = setup([file("a.txt"), file("b.txt"), file("c.txt")], 1);
    await screen.findByText(/Code or text/);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(props.onStep).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(props.onStep).toHaveBeenLastCalledWith(-1);
  });

  it("AC-50.2 does not step before the first file or after the last", async () => {
    readObject.mockResolvedValue(enc("x"));
    const props = setup([file("a.txt"), file("b.txt")], 0);
    await screen.findByText(/Code or text/);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(props.onStep).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Previous file" })).toBeNull();
  });

  it("offers previous and next in the menu so every width has a way", async () => {
    readObject.mockResolvedValue(enc("x"));
    const props = setup([file("a.txt"), file("b.txt")], 0);
    await screen.findByText(/Code or text/);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    // The on-screen arrow is hidden by CSS below 768 px (not applied in jsdom), so take the menu entry, which comes last.
    await userEvent.click((await screen.findAllByRole("button", { name: "Next file" })).at(-1)!);
    expect(props.onStep).toHaveBeenCalledWith(1);
  });
});

describe("FR-54 text and code", () => {
  it("AC-54.1 shows plain text with line numbers and the meta line", async () => {
    readObject.mockResolvedValue(enc("one\ntwo\nthree\n"));
    setup([file("notes.txt", { size: 14 })]);
    expect(await screen.findByText("Code or text · 3 lines · 14 B")).toBeInTheDocument();
    const [gutter, content] = Array.from(screen.getByRole("region", { name: "Preview of notes.txt" }).querySelectorAll("pre"));
    expect(gutter?.getAttribute("aria-hidden")).toBe("true");
    expect(gutter?.textContent).toBe("1\n2\n3");
    expect(content?.textContent).toBe("one\ntwo\nthree\n");
    expect(readObject.mock.calls[0]?.[1].length).toBe(1024 * 1024);
  });

  it("AC-54.2 says only the beginning is shown for a larger file", async () => {
    readObject.mockResolvedValue(enc("a\nb"));
    setup([file("big.txt", { size: 5 * 1024 * 1024 })]);
    expect(await screen.findByText("Only the first 1 MiB is shown.")).toBeInTheDocument();
  });

  it("AC-54.3 renders markup as text, never as HTML", async () => {
    readObject.mockResolvedValue(enc('<script>window.__ran = 1</script><img src="x" onerror="window.__ran = 1">'));
    setup([file("hostile.txt")]);
    await screen.findByText(/Code or text/);
    expect(document.querySelector("dialog script")).toBeNull();
    expect(document.querySelector("dialog img")).toBeNull();
    expect(screen.getByRole("region", { name: "Preview of hostile.txt" })).toHaveTextContent("<script>window.__ran = 1</script>");
  });

  it("edge: a binary file mislabelled as text falls to the no-preview fallback", async () => {
    readObject.mockResolvedValue(Uint8Array.from([65, 0, 66, 1, 2, 3]));
    setup([file("fake.txt")]);
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
  });

  it("edge: invalid UTF-8 shows replacement characters instead of failing", async () => {
    readObject.mockResolvedValue(Uint8Array.from([0x68, 0x69, 0xff, 0x21]));
    setup([file("latin.txt")]);
    expect(await screen.findByRole("region", { name: "Preview of latin.txt" })).toHaveTextContent("hi�!");
  });
});

describe("FR-50 kind detection and FR-58 fallback", () => {
  it("reads the first bytes of a file with no telling extension and shows text", async () => {
    readObject.mockImplementation((_client, options) => Promise.resolve(enc(options.length === 512 ? "plain words here" : "plain words here")));
    setup([file("README")]);
    expect(await screen.findByText(/Code or text/)).toBeInTheDocument();
    expect(readObject.mock.calls[0]?.[1].length).toBe(512);
  });

  it("AC-58.1 says what cannot be shown and offers Download", async () => {
    const props = setup([file("data.zip")]);
    expect(await screen.findByText("ZIP files can’t be shown in the browser. You can still download the file.")).toBeInTheDocument();
    const fallback = document.querySelector<HTMLElement>("[data-component='NoPreview']");
    await userEvent.click(within(fallback!).getByRole("button", { name: "Download" }));
    expect(props.onDownload).toHaveBeenCalled();
  });

  it("an unknown binary with no extension says Unknown", async () => {
    readObject.mockResolvedValue(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    setup([file("blob")]);
    expect(await screen.findByText("Unknown files can’t be shown in the browser. You can still download the file.")).toBeInTheDocument();
  });
});

describe("FR-57 SVG", () => {
  it("AC-57.1 draws an SVG only through an img with a blob URL of type image/svg+xml", async () => {
    readObject.mockResolvedValue(enc('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>x()</script></svg>'));
    setup([file("logo.svg")]);
    const image = await screen.findByRole("img", { name: "Preview of logo.svg" });
    expect(image).toHaveAttribute("src", "blob:mock");
    expect(created[0]?.type).toBe("image/svg+xml");
    expect(screen.getByText("SVG · shown as an image, scripts never run")).toBeInTheDocument();
    expect(document.querySelector("dialog script")).toBeNull();
    // The only img is the blob one; the SVG markup itself is never put into the page.
    expect(document.querySelectorAll("dialog img")).toHaveLength(1);
  });

  it("AC-57.2 falls to the fallback over 2 MiB, without reading the file", async () => {
    setup([file("huge.svg", { size: 3 * 1024 * 1024 })]);
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
    expect(readObject).not.toHaveBeenCalled();
  });
});

describe("FR-51 and FR-52 media sources", () => {
  it("uses a presigned link on an https endpoint, so nothing passes through memory", async () => {
    presignView.mockResolvedValue("https://s3.example.test/b/d/p.png?X-Amz-Signature=abc");
    setup([file("p.png")], 0, { connection: https });
    const image = await screen.findByRole("img", { name: "Preview of p.png" });
    expect(image).toHaveAttribute("src", expect.stringContaining("X-Amz-Signature"));
    expect(readObject).not.toHaveBeenCalled();
  });

  it("reads through the signed API into a blob URL on a loopback http endpoint (CSP, D-38)", async () => {
    readObject.mockResolvedValue(enc("png-bytes"));
    setup([file("p.png")]);
    expect(await screen.findByRole("img", { name: "Preview of p.png" })).toHaveAttribute("src", "blob:mock");
    expect(created[0]?.type).toBe("image/png");
    expect(presignView).not.toHaveBeenCalled();
  });

  it("AC-51.2 signs one new link when the image fails, then falls to the fallback", async () => {
    presignView.mockResolvedValue("https://s3.example.test/p.png?sig=1");
    setup([file("p.png")], 0, { connection: https });
    const image = await screen.findByRole("img", { name: "Preview of p.png" });
    fireEvent.error(image);
    await vi.waitFor(() => { expect(presignView).toHaveBeenCalledTimes(2); });
    fireEvent.error(await screen.findByRole("img", { name: "Preview of p.png" }));
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
  });

  it("AC-51.1 zooms with the buttons and Fit resets", async () => {
    readObject.mockResolvedValue(enc("png"));
    setup([file("p.png")]);
    const image = await screen.findByRole("img", { name: "Preview of p.png" });
    const fit = screen.getByRole("button", { name: "Fit to screen" });
    expect(fit).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(image.style.transform).toContain("scale(1.5)");
    expect(fit).toBeEnabled();
    await userEvent.click(fit);
    expect(image.style.transform).toContain("scale(1)");
  });

  it("AC-50.2 a horizontal touch swipe at fit size moves to the next or previous file", async () => {
    Element.prototype.setPointerCapture = vi.fn();
    readObject.mockResolvedValue(enc("png"));
    const props = setup([file("a.png"), file("b.png"), file("c.png")], 1);
    await screen.findByRole("img", { name: "Preview of b.png" });
    const stage = document.querySelector("[data-component='ImageStage']")!;
    const swipe = (from: number, to: number) => {
      fireEvent.pointerDown(stage, { pointerId: 1, pointerType: "touch", clientX: from, clientY: 100 });
      fireEvent.pointerUp(stage, { pointerId: 1, pointerType: "touch", clientX: to, clientY: 104 });
    };
    swipe(300, 100);
    expect(props.onStep).toHaveBeenLastCalledWith(1);
    swipe(100, 300);
    expect(props.onStep).toHaveBeenLastCalledWith(-1);
    swipe(200, 220);
    expect(props.onStep).toHaveBeenCalledTimes(2);
  });

  it("AC-51.1 a double tap zooms in and a second one returns to fit", async () => {
    readObject.mockResolvedValue(enc("png"));
    setup([file("p.png")]);
    const image = await screen.findByRole("img", { name: "Preview of p.png" });
    const stage = document.querySelector("[data-component='ImageStage']")!;
    fireEvent.doubleClick(stage);
    expect(image.style.transform).toContain("scale(2.5)");
    fireEvent.doubleClick(stage);
    expect(image.style.transform).toContain("scale(1)");
  });

  it("AC-52.1 plays audio and video with native controls", async () => {
    presignView.mockResolvedValue("https://s3.example.test/clip.mp4?sig=1");
    setup([file("clip.mp4")], 0, { connection: https });
    await vi.waitFor(() => { expect(document.querySelector("video")).not.toBeNull(); });
    expect(document.querySelector("video")).toHaveAttribute("controls");
  });

  it("AC-52.2 a codec the browser cannot play falls to the fallback", async () => {
    presignView.mockResolvedValue("https://s3.example.test/song.mp3?sig=1");
    setup([file("song.mp3")], 0, { connection: https });
    await vi.waitFor(() => { expect(document.querySelector("audio")).not.toBeNull(); });
    fireEvent.error(document.querySelector("audio") as HTMLElement);
    await vi.waitFor(() => { expect(presignView).toHaveBeenCalledTimes(2); });
    await vi.waitFor(() => { expect(document.querySelector("audio")).not.toBeNull(); });
    fireEvent.error(document.querySelector("audio") as HTMLElement);
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("has no axe violations in the text view", async () => {
    readObject.mockResolvedValue(enc("hello\nworld"));
    setup([file("a.txt"), file("b.txt")]);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/Code or text/);
    await act(async () => { await Promise.resolve(); });
    expect(await axe(dialog.parentElement ?? dialog)).toHaveNoViolations();
  });
});

describe("M11 details inside the viewer", () => {
  it("renders inside the dialog and follows the file on screen", async () => {
    readObject.mockResolvedValue(enc("x"));
    const files = [file("a.txt"), file("b.txt")];
    const renderDetails = vi.fn((shown: FileItem) => <aside aria-label="Details">{shown.name}</aside>);
    const props: PreviewProps = { connection: loopback, files, index: 0, onClose: vi.fn(), onStep: vi.fn(), onDownload: vi.fn(), renderDetails, onCopyKey: vi.fn(), onShare: vi.fn(), isStarred: () => false, onToggleStar: vi.fn() };
    const { rerender } = render(<Preview {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    const panel = () => within(screen.getByRole("dialog")).getByRole("complementary", { name: "Details" });
    expect(panel()).toHaveTextContent("a.txt");
    rerender(<Preview {...props} index={1} />);
    expect(panel()).toHaveTextContent("b.txt");
  });
});
