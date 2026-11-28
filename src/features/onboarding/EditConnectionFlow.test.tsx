import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionTestRun } from "@/lib/s3";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, TestStepId } from "@/lib/types";
import EditConnectionFlow from "./EditConnectionFlow";
import type { EditActions } from "./edit-types";

// FR-11, AC-11.6: the Edit connection flow's gate on the test, and its failure screens.
const mocks = vi.hoisted(() => ({ runConnectionTest: vi.fn() }));
vi.mock("@/lib/s3", () => ({ createClient: () => ({}), runConnectionTest: mocks.runConnectionTest }));

const ORDER: TestStepId[] = ["reach", "cors", "list", "write", "read", "clean"];
const passed: ConnectionTestRun = { outcome: "ok", steps: ORDER.map((id) => ({ id, status: "pass" })) };
const failed: ConnectionTestRun = { outcome: "failed", steps: ORDER.map((id) => ({ id, status: id === "reach" ? "fail" : "skipped", ...(id === "reach" ? { failure: "network" as const } : {}) })) };
const saved = { accessKeyId: "saved-example-access-id", secretAccessKey: "saved-example-secret-not-real" };
const connection: ConnectionSummary = {
  id: "docs", name: "Team docs", providerId: "custom", fields: { endpoint: "https://s3.example-provider.test" }, endpoint: "https://s3.example-provider.test",
  region: "us-east-1", addressingStyle: "auto", bucket: "docs", access: "readWrite", createdAt: "2026-11-22T00:00:00.000Z",
};

function setup(over: Partial<EditActions> = {}) {
  const actions: EditActions = {
    plan: vi.fn(() => Promise.resolve({ kind: "same" as const })),
    save: vi.fn((next: ConnectionSummary) => Promise.resolve({ connection: next, oldRemoved: true })),
    ...over,
  };
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const view = render(<EditConnectionFlow connection={connection} actions={actions} onDone={onDone} onCancel={onCancel} />);
  return { ...view, actions, onDone, onCancel };
}
const test = () => userEvent.click(screen.getByRole("button", { name: "Test connection" }));

beforeEach(() => {
  vault.lock();
  vault.put(connection.id, saved);
  mocks.runConnectionTest.mockReset().mockResolvedValue(passed);
});

describe("AC-11.6 Edit connection", () => {
  it("opens prefilled with empty key fields, and tests with the saved keys when they stay empty", async () => {
    const { actions, onDone, container } = setup();
    expect(screen.getByRole("heading", { level: 1, name: "Edit Team docs" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Team docs");
    expect(screen.getByDisplayValue("docs")).toBeInTheDocument();
    for (const field of container.querySelectorAll('input[type="password"]')) expect(field).toHaveValue("");
    expect(document.body.innerHTML).not.toContain(saved.secretAccessKey);
    expect(await axe(container)).toHaveNoViolations();
    await test();
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => { expect(onDone).toHaveBeenCalled(); });
    const next = vi.mocked(actions.save).mock.calls[0]?.[0];
    expect(next).toMatchObject({ name: "Team docs", bucket: "docs" });
    await expect(vault.credentialsFor(next?.id ?? "")).resolves.toEqual(saved);
  });

  it("saves nothing when the test fails", async () => {
    mocks.runConnectionTest.mockResolvedValue(failed);
    const { actions } = setup();
    await test();
    await vi.waitFor(() => { expect(document.querySelector('[data-component="FailureCard"]')).not.toBeNull(); });
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("needs a name and a bucket before it tests", async () => {
    setup();
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.clear(screen.getByDisplayValue("docs"));
    await test();
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Bucket is required.")).toBeInTheDocument();
    expect(mocks.runConnectionTest).not.toHaveBeenCalled();
  });

  it("says nothing changed when the save fails, and saves on Try again", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("quota")).mockImplementation((next: ConnectionSummary) => Promise.resolve({ connection: next, oldRemoved: true }));
    const { onDone } = setup({ save });
    await test();
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("The saved connection is unchanged. Try again.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => { expect(onDone).toHaveBeenCalled(); });
  });

  it("asks before replacing, listing what goes; Cancel saves nothing", async () => {
    const { actions, onCancel } = setup({ plan: vi.fn(() => Promise.resolve({ kind: "replace" as const, transfers: 0, uploads: 0, starred: 2, recent: 0 })) });
    await test();
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Point to a different place?" })).toBeInTheDocument();
    expect(screen.getByText("2 starred items")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(actions.save).not.toHaveBeenCalled();
  });

  it("blocks a changed destination while moves are unfinished, and drops the tested keys on leaving", async () => {
    const forget = vi.spyOn(vault, "forget");
    const { actions, unmount } = setup({ plan: vi.fn(() => Promise.resolve({ kind: "blocked" as const, unfinished: 1 })) });
    await test();
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/has a move that was cut off/)).toBeInTheDocument();
    expect(actions.save).not.toHaveBeenCalled();
    unmount();
    expect(forget).toHaveBeenCalledTimes(1);
  });
});
