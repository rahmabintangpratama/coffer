import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutContext, type LayoutMode } from "@/components/layout";
import * as forget from "@/lib/storage/forget";
import type { ConnectionSummary } from "@/lib/types";
import { defaultSettings, SETTINGS_KEY, useSettings } from "../settings";
import { useSession } from "../session";
import { useTheme } from "../theme";
import { SettingsScreen } from "./SettingsScreen";

// FR-100: the Settings list and pages (S50, T50), their persistence, and About.
const connection: ConnectionSummary = {
  id: "c1", name: "Other S3-compatible · photos", providerId: "custom", fields: {}, endpoint: "https://s3.example.test", region: "us-east-1",
  addressingStyle: "path", bucket: "photos", access: "readWrite", createdAt: "2026-01-01T00:00:00Z",
};

function renderSettings(layout: LayoutMode, hash: string) {
  window.location.hash = hash;
  return render(
    <Router hook={useHashLocation}>
      <LayoutContext value={layout}>
        <SettingsScreen connection={connection} notify={vi.fn()} />
      </LayoutContext>
    </Router>,
  );
}

beforeEach(() => {
  // jsdom has no matchMedia; the theme reads it to follow the system.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  window.localStorage.clear();
  useSettings.setState({ ...defaultSettings });
  useSession.setState({ saved: [connection], connection });
  vi.spyOn(forget, "storedReport").mockResolvedValue({ connections: 1, journal: 0, starred: 0, recent: 0, uploads: 0 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("AC-100.1 below 768 px: a list that opens detail pages", () => {
  it("lists the five pages with a second line each, as links", async () => {
    const { container } = renderSettings("compact", "#/settings");
    const list = screen.getByRole("list", { name: "Settings sections" });
    const rows = within(list).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["#/settings/appearance", "#/settings/behavior", "#/settings/connections", "#/settings/security", "#/settings/about"]);
    expect(within(list).getByText("Theme, density")).toBeInTheDocument();
    expect(within(list).getByText("Confirmations, upload parts")).toBeInTheDocument();
    expect(within(list).getByText("1 connection")).toBeInTheDocument();
    expect(within(list).getByText("Auto-lock after 15 minutes")).toBeInTheDocument();
    expect(within(list).getByText("Version, licenses")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows Never in the Security line when auto-lock is off", () => {
    useSettings.setState({ autoLockMinutes: 0 });
    renderSettings("compact", "#/settings");
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("a page has a way back to the list and no list beside it", () => {
    renderSettings("compact", "#/settings/behavior");
    expect(screen.getByRole("heading", { level: 2, name: "Behavior" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Settings" })).toHaveAttribute("href", "#/settings");
    expect(screen.queryByRole("list", { name: "Settings sections" })).toBeNull();
  });
});

describe("AC-100.1 from 768 px: a section nav beside the page", () => {
  it("shows the nav and Security for the bare address", async () => {
    const { container } = renderSettings("rail", "#/settings");
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Security" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("marks the page that is open", () => {
    renderSettings("sidebar", "#/settings/about");
    expect(within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "About" })).toBeInTheDocument();
  });

  it("an unknown page falls back to the default", () => {
    renderSettings("rail", "#/settings/nonsense");
    expect(screen.getByRole("heading", { level: 2, name: "Security" })).toBeInTheDocument();
  });
});

describe("AC-100.1 and AC-100.2 Appearance", () => {
  it("changes the theme and the density, and stores them", async () => {
    const { container } = renderSettings("rail", "#/settings/appearance");
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(useTheme.getState().theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("coffer:theme")).toBe("dark");
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}")).toMatchObject({ density: "compact" });
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("radio", { name: "System" }));
  });
});

describe("AC-100.1 Behavior", () => {
  it("shows ask-before-trash, hidden files and parallel parts, and stores each change", async () => {
    const { container } = renderSettings("rail", "#/settings/behavior");
    const confirm = screen.getByRole("checkbox", { name: /Ask before moving to trash/ });
    const hidden = screen.getByRole("checkbox", { name: /Show hidden files/ });
    expect(confirm).not.toBeChecked();
    expect(hidden).not.toBeChecked();
    expect(screen.getByText("Off by default. Undo is always offered.")).toBeInTheDocument();
    expect(screen.getByText("Names that start with a dot.")).toBeInTheDocument();
    await userEvent.click(confirm);
    await userEvent.click(hidden);
    await userEvent.selectOptions(screen.getByLabelText("Parallel upload parts"), "6");
    expect(useSettings.getState()).toMatchObject({ confirmTrash: true, showHiddenFiles: true, uploadConcurrency: 6 });
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}")).toMatchObject({ confirmTrash: true, showHiddenFiles: true, uploadConcurrency: 6 });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AC-100.3 About", () => {
  it("shows the version, the origin, the MIT text and the IBM Plex credit", async () => {
    const { container } = renderSettings("rail", "#/settings/about");
    expect(screen.getByText(`Coffer ${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByText(window.location.origin)).toBeInTheDocument();
    expect(screen.getByText(/Free and open source/)).toBeInTheDocument();
    expect(await screen.findByText(/Permission is hereby granted, free of charge/)).toBeInTheDocument();
    expect(screen.getByText(/^MIT License/)).toBeInTheDocument();
    expect(screen.getByText(/IBM Plex Sans and Mono, licensed under the SIL Open Font License/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Connections and Security pages", () => {
  it("the Connections page lists the connection with Show secret key", () => {
    renderSettings("rail", "#/settings/connections");
    expect(screen.getByRole("heading", { level: 2, name: "Connections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Show secret key: ${connection.name}` })).toBeEnabled();
  });

  it("the Security page has auto-lock, Lock now and Forget", async () => {
    renderSettings("rail", "#/settings/security");
    expect(screen.getByRole("radio", { name: "15 minutes" })).toBeChecked();
    expect(await screen.findByText("1 connection · encrypted with your passphrase")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Forget$/ })).toBeInTheDocument();
    await act(async () => { await userEvent.click(screen.getByRole("radio", { name: "30 minutes" })); });
    expect(useSettings.getState().autoLockMinutes).toBe(30);
  });
});
