import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionTestRun } from "@/lib/s3";
import { vault } from "@/lib/storage/vault";
import type { ConnectionSummary, ConnectionTestStep, TestStepId } from "@/lib/types";
import { OnboardingFlow } from "./OnboardingFlow";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({})), runConnectionTest: vi.fn() }));
vi.mock("@/lib/s3", () => ({ createClient: mocks.createClient, runConnectionTest: mocks.runConnectionTest }));

const ORDER: TestStepId[] = ["reach", "cors", "list", "write", "read", "clean"];
const passing = (extra: Partial<ConnectionTestRun> = {}): ConnectionTestRun => ({
  steps: ORDER.map((id): ConnectionTestStep => ({ id, status: "pass", ms: 5 })),
  outcome: "ok",
  ...extra,
});

async function fillCustom(bucket: string, secret = "example-secret-value") {
  await userEvent.click(screen.getByRole("button", { name: "Connect a bucket" }));
  await userEvent.click(screen.getByRole("button", { name: "Other S3-compatible service" }));
  await userEvent.type(screen.getByLabelText("Endpoint URL"), "https://s3.example-provider.test");
  await userEvent.type(screen.getByLabelText("Access Key ID"), "example-key-id");
  await userEvent.type(screen.getByLabelText("Secret Access Key"), secret);
  if (bucket !== "") await userEvent.type(screen.getByLabelText("Bucket", { exact: true }), bucket);
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
}

beforeEach(() => {
  mocks.createClient.mockClear();
  mocks.runConnectionTest.mockReset();
});
afterEach(() => {
  vault.lock();
});

describe("OnboardingFlow", () => {
  it("goes from Welcome to a connection, keeps the keys only in the vault, and reports a summary without keys", async () => {
    mocks.runConnectionTest.mockResolvedValue(passing());
    const onConnected = vi.fn<(connection: ConnectionSummary) => void>();
    render(<OnboardingFlow onConnected={onConnected} />);
    await fillCustom("photos");
    await userEvent.click(await screen.findByRole("button", { name: "Open bucket" }));

    expect(onConnected).toHaveBeenCalledTimes(1);
    const summary = onConnected.mock.calls[0]?.[0];
    if (!summary) throw new Error("no summary");
    expect(summary).toMatchObject({
      providerId: "custom",
      endpoint: "https://s3.example-provider.test",
      bucket: "photos",
      access: "readWrite",
      name: "Other S3-compatible · photos",
    });
    expect(JSON.stringify(summary)).not.toContain("example-secret-value");
    expect(JSON.stringify(summary)).not.toContain("example-key-id");
    await expect(vault.credentialsFor(summary.id)).resolves.toMatchObject({ secretAccessKey: "example-secret-value" });
  });

  it("saves a read-only choice as access readOnly (AC-110.2)", async () => {
    mocks.runConnectionTest.mockResolvedValue({
      steps: ORDER.map((id): ConnectionTestStep => (id === "write" ? { id, status: "fail", failure: "accessDenied" } : { id, status: id === "read" || id === "clean" ? "skipped" : "pass" })),
      outcome: "readOnly",
      readVerified: true,
    });
    const onConnected = vi.fn<(connection: ConnectionSummary) => void>();
    render(<OnboardingFlow onConnected={onConnected} />);
    await fillCustom("photos");
    await userEvent.click(await screen.findByRole("button", { name: "Connect read-only" }));
    expect(onConnected.mock.calls[0]?.[0].access).toBe("readOnly");
  });

  it("without a bucket, lists the buckets, then tests the one that was picked", async () => {
    mocks.runConnectionTest.mockResolvedValueOnce(passing({ buckets: ["alpha", "beta"] })).mockResolvedValueOnce(passing());
    const onConnected = vi.fn<(connection: ConnectionSummary) => void>();
    render(<OnboardingFlow onConnected={onConnected} />);
    await fillCustom("");
    await userEvent.click(await screen.findByRole("button", { name: "Choose a bucket" }));
    expect(await screen.findByText(/This key can access 2 buckets/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "beta" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open bucket" }));
    expect(onConnected.mock.calls[0]?.[0].bucket).toBe("beta");
    expect(mocks.runConnectionTest).toHaveBeenCalledTimes(2);
  });

  it("AC-7.2 skips the picker when the key can see exactly one bucket", async () => {
    mocks.runConnectionTest.mockResolvedValueOnce(passing({ buckets: ["solo"] })).mockResolvedValueOnce(passing());
    const onConnected = vi.fn<(connection: ConnectionSummary) => void>();
    render(<OnboardingFlow onConnected={onConnected} />);
    await fillCustom("");
    await userEvent.click(await screen.findByRole("button", { name: "Choose a bucket" }));
    await userEvent.click(await screen.findByRole("button", { name: "Open bucket" }));
    expect(screen.queryByText(/This key can access/)).toBeNull();
    expect(onConnected.mock.calls[0]?.[0].bucket).toBe("solo");
  });

  it("going back to the form keeps the details but not the secret, and drops the keys from the vault", async () => {
    mocks.runConnectionTest.mockResolvedValue({
      steps: ORDER.map((id): ConnectionTestStep => (id === "reach" ? { id, status: "fail", failure: "network" } : { id, status: "skipped" })),
      outcome: "failed",
    });
    render(<OnboardingFlow onConnected={() => undefined} />);
    await fillCustom("photos");
    await userEvent.click(await screen.findByRole("button", { name: "Edit endpoint" }));
    expect(screen.getByLabelText("Endpoint URL")).toHaveValue("https://s3.example-provider.test");
    expect(screen.getByLabelText("Bucket", { exact: true })).toHaveValue("photos");
    expect(screen.getByLabelText("Access Key ID")).toHaveValue("");
    expect(screen.getByLabelText("Secret Access Key")).toHaveValue("");
    expect(document.body.innerHTML).not.toContain("example-secret-value");
  });

  it("forgets an unfinished attempt's keys when the flow ends", async () => {
    mocks.runConnectionTest.mockResolvedValue(passing());
    const { unmount } = render(<OnboardingFlow onConnected={() => undefined} />);
    await fillCustom("photos");
    await screen.findByRole("button", { name: "Open bucket" });
    const config = mocks.createClient.mock.calls[0] as unknown as [{ credentials: () => Promise<{ secretAccessKey: string }> }];
    await expect(config[0].credentials()).resolves.toMatchObject({ secretAccessKey: "example-secret-value" });
    unmount();
    await expect(config[0].credentials()).rejects.toThrow("locked");
  });

  it("Back from a provider's form returns to the provider list, and from there to Welcome", async () => {
    render(<OnboardingFlow onConnected={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Connect a bucket" }));
    await userEvent.click(screen.getAllByRole("button", { name: /Cloudflare R2/ })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Choose your provider" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Connect a bucket" })).toBeInTheDocument();
  });
});
