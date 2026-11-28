import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyByteLength, looksBinary, mimeOf, sniffKind } from "@/lib/s3/keys";
import type { ConnectionSummary, FileItem } from "@/lib/types";
import { Preview, type PreviewProps } from "./Preview";

const readObject = vi.fn<(client: unknown, options: { key: string; length?: number }) => Promise<Uint8Array>>();
vi.mock("@/lib/s3", () => ({
  clientFor: () => ({}),
  readObject: (client: unknown, options: { key: string; length?: number }) => readObject(client, options),
  presignView: vi.fn(),
  mimeOf,
  sniffKind,
  looksBinary,
  keyByteLength,
}));

// pdf.js needs a canvas and a worker; the view's own logic is what is tested here.
const destroy = vi.fn();
const getDocument = vi.fn();
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: (options: unknown) => getDocument(options) as unknown }));

const connection: ConnectionSummary = {
  id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "http://127.0.0.1:9000", region: "us-east-1",
  addressingStyle: "path", bucket: "b", access: "readWrite", createdAt: "2026-01-01T00:00:00.000Z",
};
const file = (name: string, fileKind: FileItem["fileKind"], size = 100): FileItem => ({
  kind: "file", key: `d/${name}`, name, size, lastModified: "2026-01-02T03:04:05Z", etag: "e", contentType: "", fileKind,
});
const enc = (text: string) => new TextEncoder().encode(text);

function setup(item: FileItem, over: Partial<PreviewProps> = {}) {
  const props: PreviewProps = { connection, files: [item], index: 0, onClose: vi.fn(), onStep: vi.fn(), onDownload: vi.fn(), renderDetails: vi.fn(() => null), onCopyKey: vi.fn(), onShare: vi.fn(), ...over };
  render(<Preview {...props} />);
  return props;
}

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  readObject.mockReset();
  getDocument.mockReset();
  destroy.mockReset();
});

const HOSTILE_MD = [
  "# Title",
  "",
  "A **bold** word and [safe](https://example.com/a) and [mail](mailto:a@b.test).",
  "",
  "[js](javascript:window.__ran=1) and [data](data:text/html,x)",
  "",
  "![remote pixel](https://attacker.invalid/p.png)",
  "",
  '<script>window.__ran = 1</script><img src="x" onerror="window.__ran = 1"><iframe src="https://attacker.invalid"></iframe>',
  '<a href="https://attacker.invalid" onclick="window.__ran = 1">raw</a>',
].join("\n");

describe("FR-55 Markdown", () => {
  it("AC-55.1 sanitizes: no raw HTML, no images, only http, https and mailto links with rel and target", async () => {
    readObject.mockResolvedValue(enc(HOSTILE_MD));
    setup(file("notes.md", "markdown"));
    await waitFor(() => { expect(document.querySelector("[data-component='MarkdownBody'] h1")).not.toBeNull(); });
    const body = document.querySelector<HTMLElement>("[data-component='MarkdownBody']")!;
    expect(body.querySelector("strong")?.textContent).toBe("bold");
    expect(body.querySelectorAll("script, iframe, img, form, meta, [onerror], [onclick]")).toHaveLength(0);
    const links = Array.from(body.querySelectorAll("a"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(expect.arrayContaining(["https://example.com/a", "mailto:a@b.test"]));
    for (const link of links) {
      const href = link.getAttribute("href");
      expect(href === null || /^(https?|mailto):/.test(href)).toBe(true);
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("target")).toBe("_blank");
    }
    // The alt text stays as text; the image is gone.
    expect(body.textContent).toContain("remote pixel");
    // Raw HTML in the file is shown as text, not run.
    expect(body.textContent).toContain("<script>");
    expect((window as unknown as { __ran?: number }).__ran).toBeUndefined();
  });

  it("AC-55.2 the meta line reads Markdown · sanitized", async () => {
    readObject.mockResolvedValue(enc("# Hi"));
    setup(file("a.md", "markdown"));
    expect(await screen.findByText("Markdown · sanitized")).toBeInTheDocument();
  });

  it("a Markdown file with control characters falls to the fallback", async () => {
    readObject.mockResolvedValue(Uint8Array.from([35, 0, 1, 2, 3]));
    setup(file("bad.md", "markdown"));
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
  });
});

describe("FR-56 HTML as source", () => {
  const page = '<h1>Title</h1><script>window.__ran = 1</script><img src="https://attacker.invalid/p.png">';

  it("AC-56.1 opens as source with the safety notice and Render in sandbox", async () => {
    readObject.mockResolvedValue(enc(page));
    setup(file("page.html", "html"));
    expect(await screen.findByText("Shown as code for your safety.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Preview of page.html" })).toHaveTextContent("<script>window.__ran = 1</script>");
    expect(screen.getByRole("button", { name: "Render in sandbox" })).toBeInTheDocument();
    expect(document.querySelector("dialog iframe")).toBeNull();
    expect(document.querySelector("dialog script")).toBeNull();
  });

  it("the sandbox attribute is exactly empty: never allow-scripts, never allow-same-origin, never any allow-* token", async () => {
    readObject.mockResolvedValue(enc(page));
    setup(file("page.html", "html"));
    await userEvent.click(await screen.findByRole("button", { name: "Render in sandbox" }));
    const frame = document.querySelector("iframe");
    // allow-scripts together with allow-same-origin would let the page remove its own sandbox and read the app's storage.
    expect(frame?.getAttribute("sandbox")).toBe("");
    // jsdom has no iframe.sandbox token list, so the attribute text is split by hand.
    expect((frame?.getAttribute("sandbox") ?? "x").split(/\s+/).filter(Boolean)).toEqual([]);
    expect(frame?.getAttribute("sandbox") ?? "").not.toMatch(/allow-/);
    expect(frame?.hasAttribute("allow")).toBe(true);
    expect(frame?.getAttribute("allow")).toBe("");
  });

  it("AC-56.2 renders in an iframe with sandbox=\"\", the network locked first, and can go back to source", async () => {
    readObject.mockResolvedValue(enc(page));
    setup(file("page.html", "html"));
    await userEvent.click(await screen.findByRole("button", { name: "Render in sandbox" }));
    const frame = document.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("sandbox")).toBe("");
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
    const doc = frame?.getAttribute("srcdoc") ?? "";
    expect(doc.startsWith("<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'")).toBe(true);
    expect(doc).toContain("<h1>Title</h1>");
    expect(screen.getByText(/Shown in a sandbox: scripts, forms, popups and remote resources are blocked/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show source" }));
    expect(document.querySelector("iframe")).toBeNull();
  });
});

function pdfDocument(pages: number) {
  const render = vi.fn(() => ({ cancel: vi.fn(), promise: Promise.resolve() }));
  return {
    numPages: pages,
    getPage: vi.fn(() => Promise.resolve({ getViewport: ({ scale }: { scale: number }) => ({ width: 300 * scale, height: 200 * scale }), render })),
    render,
  };
}

describe("FR-53 PDF", () => {
  it("AC-53.1 shows Page N of M and moves with Previous and Next page", async () => {
    const pdf = pdfDocument(3);
    getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });
    readObject.mockResolvedValue(enc("%PDF-1.4"));
    setup(file("doc.pdf", "pdf"));
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await waitFor(() => { expect(pdf.getPage).toHaveBeenCalledWith(3); });
    // Drawn on a canvas, with no annotation layer, so links are not followed and scripts do not exist.
    expect(pdf.render).toHaveBeenCalledWith(expect.objectContaining({ annotationMode: 0 }));
  });

  it("opens the document without WebAssembly and with the log quiet, from the bytes it read", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument(1)), destroy });
    readObject.mockResolvedValue(enc("%PDF-1.4"));
    setup(file("doc.pdf", "pdf"));
    await screen.findByText("Page 1 of 1");
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ useWasm: false, verbosity: 0 }));
  });

  it("AC-53.2 a PDF over 50 MiB is not read; FR-58 offers Download", async () => {
    setup(file("huge.pdf", "pdf", 51 * 1024 * 1024));
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
    expect(readObject).not.toHaveBeenCalled();
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("edge: an encrypted or damaged PDF falls to the fallback", async () => {
    getDocument.mockImplementation(() => ({ promise: Promise.reject(new Error("PasswordException")), destroy }));
    readObject.mockResolvedValue(enc("%PDF-1.4"));
    setup(file("locked.pdf", "pdf"));
    expect(await screen.findByRole("heading", { name: "No preview for this file type" })).toBeInTheDocument();
  });

  it("releases the document when the viewer closes", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument(1)), destroy });
    readObject.mockResolvedValue(enc("%PDF-1.4"));
    const { unmount } = render(<Preview connection={connection} files={[file("doc.pdf", "pdf")]} index={0} onClose={vi.fn()} onStep={vi.fn()} onDownload={vi.fn()} renderDetails={() => null} onCopyKey={vi.fn()} onShare={vi.fn()} />);
    await screen.findByText("Page 1 of 1");
    unmount();
    expect(destroy).toHaveBeenCalled();
  });
});

describe("accessibility of the M5b views", () => {
  it.each([
    ["Markdown", file("a.md", "markdown"), "# Heading\n\ntext [link](https://example.com)"],
    ["HTML source", file("a.html", "html"), "<p>hi</p>"],
  ])("%s has no axe violations", async (_name, item, content) => {
    readObject.mockResolvedValue(enc(content));
    setup(item);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("region", { name: `Preview of ${item.name}` });
    expect(await axe(dialog.parentElement ?? dialog)).toHaveNoViolations();
  });
});
