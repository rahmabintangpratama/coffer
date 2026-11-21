import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { providersFile } from "@/lib/providers";
import { arrangeProviders, ProviderScreen } from "./ProviderScreen";

const names = (list: HTMLElement) => within(list).getAllByRole("button").map((button) => button.textContent);

describe("ProviderScreen (O20, O21)", () => {
  it("AC-2.1 shows Popular in popularOrder, then everything A to Z with the generic option last", () => {
    render(<ProviderScreen onBack={() => undefined} onSelect={() => undefined} />);
    const popular = names(screen.getByRole("region", { name: "Popular" }));
    const { popular: expected } = arrangeProviders(providersFile.providers);
    expect(popular).toHaveLength(expected.length);
    expect(popular[0]).toContain(expected[0]?.displayName);
    const all = names(screen.getByRole("region", { name: "All providers" }));
    expect(all.at(-1)).toContain("Other S3-compatible service");
    const named = all.slice(0, -1).map((text) => text.replace(/^[A-Z0-9]{2}/, ""));
    expect([...named].sort((a, b) => a.localeCompare(b))).toEqual(named);
  });

  it("AC-2.2 filters by name, and offers the generic option when nothing matches", async () => {
    render(<ProviderScreen onBack={() => undefined} onSelect={() => undefined} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search providers" }), "back");
    expect(screen.getAllByRole("button").filter((button) => button.textContent.includes("Backblaze"))).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Wasabi/ })).toBeNull();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzzz");
    expect(screen.getByRole("heading", { name: "No provider named “zzzz”" })).toBeInTheDocument();
    expect(screen.getByText(/Most services with an S3 API work/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other S3-compatible service" })).toBeInTheDocument();
  });

  it("AC-2.3 includes a row's badge in its accessible name", () => {
    render(<ProviderScreen onBack={() => undefined} onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: /Oracle OCI.*Browser access not supported \(CORS\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alibaba.*Virtual-hosted only/ })).toBeInTheDocument();
  });

  it("selects a provider by click and by keyboard, and goes back", async () => {
    const onSelect = vi.fn();
    const onBack = vi.fn();
    render(<ProviderScreen onBack={onBack} onSelect={onSelect} />);
    await userEvent.click(within(screen.getByRole("region", { name: "Popular" })).getAllByRole("button")[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    const wasabi = screen.getAllByRole("button").find((button) => button.textContent.includes("Wasabi"));
    wasabi?.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("wasabi");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the heading and sets the document title", () => {
    render(<ProviderScreen onBack={() => undefined} onSelect={() => undefined} />);
    expect(screen.getByRole("heading", { level: 1, name: "Choose your provider" })).toHaveFocus();
    expect(document.title).toBe("Choose your provider · Coffer");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ProviderScreen onBack={() => undefined} onSelect={() => undefined} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
