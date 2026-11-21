import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A fresh module registry per test, so each one starts with no feature group loaded.
beforeEach(() => {
  vi.resetModules();
});

async function setup() {
  const { CopyBoundary } = await import("./CopyBoundary");
  const { t } = await import("@/lib/i18n");
  // t() runs when this component renders, which is after the boundary has loaded the group.
  const Content = () => <p>{t("pv.fit")}</p>;
  return { CopyBoundary, Content };
}

describe("CopyBoundary", () => {
  it("shows the fallback while a group loads, then the children", async () => {
    const { CopyBoundary, Content } = await setup();
    render(
      <CopyBoundary groups={["pv"]} fallback={<p>loading</p>} errorFallback={<p>failed</p>}>
        <Content />
      </CopyBoundary>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("Fit to screen")).toBeInTheDocument();
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
  });

  it("renders the children at once when the groups are already loaded", async () => {
    const { CopyBoundary, Content } = await setup();
    const { loadCopyGroups } = await import("@/lib/i18n");
    await loadCopyGroups("pv");
    render(
      <CopyBoundary groups={["pv"]} fallback={<p>loading</p>} errorFallback={<p>failed</p>}>
        <Content />
      </CopyBoundary>,
    );
    expect(screen.getByText("Fit to screen")).toBeInTheDocument();
  });

  it("waits again when the same boundary is given groups that are not loaded yet (the router reuses it between routes)", async () => {
    const { CopyBoundary, Content } = await setup();
    const { loadCopyGroups, t } = await import("@/lib/i18n");
    await loadCopyGroups("pv");
    const Other = () => <p>{t("trash.note", { prefix: ".trash/" })}</p>;
    const { rerender } = render(
      <CopyBoundary groups={["pv"]} fallback={<p>loading</p>} errorFallback={<p>failed</p>}>
        <Content />
      </CopyBoundary>,
    );
    expect(screen.getByText("Fit to screen")).toBeInTheDocument();
    rerender(
      <CopyBoundary groups={["trash"]} fallback={<p>loading</p>} errorFallback={<p>failed</p>}>
        <Other />
      </CopyBoundary>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText(/Trash is the \.trash\/ folder/)).toBeInTheDocument();
  });
});
