import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutContext } from "@/components/layout";
import { AppError } from "@/lib/s3/errors";
import type { ListPage } from "@/lib/s3/list";
import type { ConnectionSummary } from "@/lib/types";
import FilesAppBar from "./AppBarContent";
import { FilesScreen } from "./FilesScreen";
import { useSelection } from "./selection";

const listPage = vi.fn<(client: unknown, options: { prefix: string; token?: string }) => Promise<ListPage>>();
vi.mock("./client", () => ({ getClient: () => Promise.resolve({}) }));
vi.mock("@/lib/s3", () => ({ listPage: (client: unknown, options: { prefix: string; token?: string }) => listPage(client, options), headObject: vi.fn(), presignDownload: vi.fn() }));

const connection: ConnectionSummary = {
  id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00.000Z",
};
const settings = { view: "list", sort: { by: "name", dir: "asc" }, density: "comfortable", showHiddenFiles: false, confirmTrash: false } as const;
const page = (names: string[], next?: string, folders: string[] = []): ListPage => ({
  folders: folders.map((name) => ({ kind: "folder", key: `${name}/`, name })),
  files: names.map((name) => ({ kind: "file", key: name, name, size: 1536, lastModified: "2026-01-02T03:04:05Z", etag: "e", contentType: "", fileKind: "unknown" })),
  count: names.length + folders.length,
  ...(next === undefined ? {} : { nextToken: next }),
});

function renderScreen(layout: "compact" | "rail" = "compact", over: Partial<Parameters<typeof FilesScreen>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LayoutContext value={layout}>
        {/* The search pill, chips and selection bar live in the app bar; its Files content is rendered here without the shell. */}
        <header>
          <FilesAppBar menuButton={null} brand={null} />
        </header>
        <FilesScreen connection={connection} settings={settings} onSettings={vi.fn()} notify={vi.fn()} {...over} />
      </LayoutContext>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
  vi.stubGlobal("scrollTo", vi.fn());
  window.location.hash = "#/files";
});
afterEach(() => {
  vi.unstubAllGlobals();
  listPage.mockReset();
  useSelection.getState().clear();
});

describe("FR-20 states", () => {
  it("shows a labelled loading state, then the rows", async () => {
    listPage.mockResolvedValue(page(["a.txt", "b.txt"]));
    renderScreen();
    expect(screen.getByRole("status", { name: "Loading files" })).toBeInTheDocument();
    expect(await screen.findByRole("row", { name: /a\.txt/ })).toBeInTheDocument();
  });

  it("empty bucket names the bucket", async () => {
    listPage.mockResolvedValue(page([]));
    renderScreen();
    expect(await screen.findByRole("heading", { name: "photos has no files yet" })).toBeInTheDocument();
  });

  it("empty folder says so", async () => {
    window.location.hash = "#/files/docs";
    listPage.mockResolvedValue(page([]));
    renderScreen();
    expect(await screen.findByRole("heading", { name: "This folder is empty" })).toBeInTheDocument();
    expect(listPage.mock.calls[0]?.[1].prefix).toBe("docs/");
  });

  it("AC-130.1 an error says files are not affected and Try again reloads", async () => {
    listPage.mockRejectedValueOnce(new AppError("network", { retryable: true }));
    renderScreen();
    expect(await screen.findByRole("alert")).toHaveTextContent("Your files are not affected");
    listPage.mockResolvedValue(page(["ok.txt"]));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("row", { name: /ok\.txt/ })).toBeInTheDocument();
  });

  it("AC-20.2 a phone row has the name over date and size", async () => {
    listPage.mockResolvedValue(page(["a.txt"]));
    renderScreen("compact");
    const row = await screen.findByRole("row", { name: /a\.txt/ });
    expect(within(row).getByText(/1\.5 KiB/)).toBeInTheDocument();
  });

  it("AC-20.2 from 768 px the list has Name, Last modified and File size columns", async () => {
    listPage.mockResolvedValue(page(["a.txt"]));
    renderScreen("rail");
    await screen.findByRole("row", { name: /a\.txt/ });
    for (const name of ["Name", "Last modified", "File size"]) expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
  });

  it("AC-20.1 shows folders before files", async () => {
    listPage.mockResolvedValue(page(["a.txt"], undefined, ["zeta"]));
    renderScreen();
    const rows = await screen.findAllByRole("row");
    expect(rows[0]).toHaveTextContent("zeta");
    expect(rows[1]).toHaveTextContent("a.txt");
  });

  it("AC-20.6 renders a hostile name as text", async () => {
    listPage.mockResolvedValue(page(["<img src=x onerror=alert(1)>.txt"]));
    renderScreen();
    await screen.findByRole("row", { name: /img src/ });
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("has no axe violations", async () => {
    listPage.mockResolvedValue(page(["a.txt", "b.txt"], undefined, ["dir"]));
    const { container } = renderScreen("rail");
    await screen.findByRole("row", { name: /a\.txt/ });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FR-21 partial listing", () => {
  const big = (from: number, count: number) => Array.from({ length: count }, (_, i) => `f-${String(from + i).padStart(5, "0")}`);

  it("AC-21.1 stops at 2,000 items with the banner, and Load all continues", async () => {
    listPage.mockImplementation((_client, options) => {
      const index = options.token === undefined ? 0 : Number(options.token);
      return Promise.resolve(page(big(index * 1000, 1000), index < 3 ? String(index + 1) : undefined));
    });
    renderScreen();
    expect(await screen.findByText("Showing 2,000 items")).toBeInTheDocument();
    expect(listPage).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Load all" }));
    await vi.waitFor(() => { expect(listPage).toHaveBeenCalledTimes(4); });
    await vi.waitFor(() => { expect(screen.queryByText(/Showing .* items/)).toBeNull(); });
  });

  it("AC-21.2 Load all shows progress and Cancel stops loading more", async () => {
    let release: () => void = () => undefined;
    listPage.mockImplementation((_client, options) => {
      const index = options.token === undefined ? 0 : Number(options.token);
      const result = page(big(index * 1000, 1000), String(index + 1));
      // Pages from the third on wait for the test, so the loading state can be seen and cancelled.
      return index < 2 ? Promise.resolve(result) : new Promise((resolve) => { release = () => { resolve(result); }; });
    });
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "Load all" }));
    expect(await screen.findByText("Loaded 2,000 items")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    release();
    expect(await screen.findByText("Showing 3,000 items")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listPage).toHaveBeenCalledTimes(3);
  });

  it("AC-21.1 exactly 2,000 items show no banner", async () => {
    listPage.mockImplementation((_client, options) => Promise.resolve(page(big(options.token === undefined ? 0 : 1000, 1000), options.token === undefined ? "1" : undefined)));
    renderScreen();
    await screen.findAllByRole("row");
    await vi.waitFor(() => { expect(listPage).toHaveBeenCalledTimes(2); });
    expect(screen.queryByRole("button", { name: "Load all" })).toBeNull();
  });

  it("edge: a failure on page 2 keeps page 1 and offers a retry in the banner", async () => {
    listPage.mockImplementation((_client, options) =>
      options.token === undefined ? Promise.resolve(page(["one.txt"], "next")) : Promise.reject(new AppError("network", { retryable: true })),
    );
    renderScreen();
    expect(await screen.findByText(/Couldn’t load more items after 1/)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /one\.txt/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("FR-30 and FR-23 in the screen", () => {
  it("AC-23.1 filters loaded items by name and AC-23.3 shows the empty result", async () => {
    listPage.mockResolvedValue(page(["alpha.txt", "beta.txt"]));
    renderScreen();
    await screen.findByRole("row", { name: /alpha/ });
    await userEvent.type(screen.getByRole("searchbox"), "bet");
    expect(screen.queryByRole("row", { name: /alpha/ })).toBeNull();
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "nope");
    expect(screen.getByRole("heading", { name: "No results for “nope”" })).toBeInTheDocument();
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it("AC-30.2 a tap on a selected phone row toggles it and the count is announced", async () => {
    listPage.mockResolvedValue(page(["a.txt", "b.txt"]));
    renderScreen("compact");
    await screen.findByRole("row", { name: /a\.txt/ });
    useSelection.getState().set("a.txt");
    await userEvent.click(screen.getByRole("row", { name: /b\.txt/ }));
    expect(screen.getByRole("toolbar", { name: "Selection actions" })).toHaveTextContent("2 selected");
  });
});

describe("AC-30.3 actions that do not apply are disabled", () => {
  it("Download is disabled when a folder is selected", async () => {
    listPage.mockResolvedValue(page(["a.txt"], undefined, ["dir"]));
    renderScreen();
    await screen.findByRole("row", { name: /dir/ });
    useSelection.getState().selectAll(["dir/", "a.txt"]);
    const toolbar = await screen.findByRole("toolbar", { name: "Selection actions" });
    expect(within(toolbar).getByRole("button", { name: "Download" })).toBeDisabled();
  });
});
