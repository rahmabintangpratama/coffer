import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesScreen } from "@/features/files";
import { useSelection } from "@/features/files/selection";
import { LayoutContext } from "@/components/layout";
import type { ListPage } from "@/lib/s3/list";
import type { ConnectionSummary } from "@/lib/types";
import { AppBar } from "./AppBar";

const listPage = vi.fn<() => Promise<ListPage>>();
vi.mock("@/features/files/client", () => ({ getClient: () => Promise.resolve({}) }));
vi.mock("@/lib/s3", () => ({ listPage: () => listPage(), headObject: vi.fn(), presignDownload: vi.fn() }));

const connection: ConnectionSummary = {
  id: "c1", name: "n", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00.000Z",
};
const settings = { view: "list", sort: { by: "name", dir: "asc" }, density: "comfortable", showHiddenFiles: false, confirmTrash: false } as const;
const files = (names: string[]): ListPage => ({
  folders: [],
  files: names.map((name) => ({ kind: "file", key: name, name, size: 1, lastModified: "2026-01-02T03:04:05Z", etag: "e", contentType: "", fileKind: "unknown" })),
  count: names.length,
});

function renderApp(withFiles: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LayoutContext value="compact">
        <Router hook={useHashLocation}>
          <AppBar menuRef={{ current: null }} menuOpen={false} onMenu={vi.fn()} />
          {withFiles && <FilesScreen connection={connection} settings={settings} onSettings={vi.fn()} notify={vi.fn()} onUseAnotherKey={vi.fn()} />}
        </Router>
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

describe("the app bar is route-aware (components.md: SearchPill, FilterChips, SelectionBar)", () => {
  it("shows the plain bar without the Files screen", () => {
    renderApp(false);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText("Coffer")).toBeInTheDocument();
  });

  it("on Files the pill reads Search in {folder} and the filter chips sit under it, in the app bar", async () => {
    listPage.mockResolvedValue(files(["a.txt"]));
    renderApp(true);
    const bar = screen.getByRole("banner");
    expect(await within(bar).findByRole("searchbox", { name: "Search in photos" })).toBeInTheDocument();
    expect(within(bar).getByRole("group", { name: "Filters" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Type" })).toHaveAttribute("aria-pressed", "false");
    // On a phone the pill is the bar: the menu button and the pill, not the brand.
    expect(within(bar).getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(within(bar).queryByText("Coffer")).toBeNull();
  });

  it("typing in the pill filters the list", async () => {
    listPage.mockResolvedValue(files(["alpha.txt", "beta.txt"]));
    renderApp(true);
    await screen.findByRole("row", { name: /alpha/ });
    await userEvent.type(screen.getByRole("searchbox"), "bet");
    expect(screen.queryByRole("row", { name: /alpha/ })).toBeNull();
  });

  it("the selection bar replaces the app bar while items are selected and the chips row keeps its height", async () => {
    listPage.mockResolvedValue(files(["a.txt", "b.txt"]));
    renderApp(true);
    const bar = screen.getByRole("banner");
    await within(bar).findByRole("searchbox");
    useSelection.getState().set("a.txt");
    const toolbar = await within(bar).findByRole("toolbar", { name: "Selection actions" });
    expect(toolbar).toHaveTextContent("1 selected");
    expect(within(bar).queryByRole("searchbox")).toBeNull();
    expect(within(toolbar).getByRole("button", { name: "Download" })).toBeEnabled();
    expect(bar.querySelector('[data-component="FilterChips"]')).toHaveClass("invisible");
    await userEvent.click(within(toolbar).getByRole("button", { name: "Clear selection" }));
    expect(await within(bar).findByRole("searchbox")).toBeInTheDocument();
  });

  it("the pill leaves the bar the moment the route is no longer Files, even while the screen is still mounted", async () => {
    listPage.mockResolvedValue(files(["a.txt"]));
    renderApp(true);
    await screen.findByRole("searchbox");
    // Let the list mount before the route changes, so nothing mounts after the test has ended.
    await screen.findByRole("row", { name: /a\.txt/ });
    window.location.hash = "#/";
    await waitFor(() => { expect(screen.queryByRole("searchbox")).toBeNull(); });
    expect(screen.getByText("Coffer")).toBeInTheDocument();
  });

  it("leaving the Files screen takes the pill out of the bar and drops the search", async () => {
    listPage.mockResolvedValue(files(["a.txt"]));
    const { unmount } = renderApp(true);
    await userEvent.type(await screen.findByRole("searchbox"), "abc");
    unmount();
    const { useFilesChrome } = await import("@/features/files/chrome");
    expect(useFilesChrome.getState().active).toBe(false);
    expect(useFilesChrome.getState().filters.query).toBe("");
  });
});
