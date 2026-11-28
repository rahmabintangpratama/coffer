import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPreset } from "@/lib/providers";
import type { ConnectionTestRun } from "@/lib/s3";
import type { ConnectionTestStep, TestFailure, TestStepId } from "@/lib/types";
import { type ConnectedResult, ConnectingScreen } from "./ConnectingScreen";
import type { ConnectionPlan } from "./form-model";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({})),
  runConnectionTest: vi.fn(),
  permission: vi.fn(),
}));

vi.mock("@/lib/s3", () => ({ createClient: mocks.createClient, runConnectionTest: mocks.runConnectionTest }));
vi.mock("@/lib/s3/local-network", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  localNetworkPermission: mocks.permission,
}));

const ORDER: TestStepId[] = ["reach", "cors", "list", "write", "read", "clean"];

function run(outcome: ConnectionTestRun["outcome"], failAt?: { id: TestStepId; failure: TestFailure; hint?: ConnectionTestStep["hint"] }, extra: Partial<ConnectionTestRun> = {}): ConnectionTestRun {
  const failIndex = failAt ? ORDER.indexOf(failAt.id) : ORDER.length;
  const steps = ORDER.map((id, index): ConnectionTestStep => {
    if (failAt?.id === id) return { id, status: "fail", failure: failAt.failure, ms: 12, ...(failAt.hint ? { hint: failAt.hint } : {}) };
    return { id, status: index < failIndex ? "pass" : "skipped", ms: 12 };
  });
  return { steps, outcome, ...extra };
}

const plan: ConnectionPlan = {
  endpoint: "https://s3.example-provider.test",
  region: "us-east-1",
  addressingStyle: "auto",
  forcePathStyle: false,
  prefix: "",
  bucket: "photos",
  hostMismatch: false,
};

function setup(result: ConnectionTestRun | Promise<ConnectionTestRun>, overrides: { preset?: string; plan?: Partial<ConnectionPlan> } = {}) {
  mocks.runConnectionTest.mockImplementation(() => Promise.resolve(result));
  const onEdit = vi.fn();
  const onConnected = vi.fn<(result: ConnectedResult) => void>();
  const view = render(
    <ConnectingScreen
      preset={getPreset(overrides.preset ?? "custom")}
      plan={{ ...plan, ...overrides.plan }}
      connectionId="conn-1"
      origin="https://coffer.example.test"
      pageHost="coffer.example.test"
      onEdit={onEdit}
      onConnected={onConnected}
    />,
  );
  return { ...view, onEdit, onConnected };
}

beforeEach(() => {
  mocks.createClient.mockClear();
  mocks.runConnectionTest.mockReset();
  mocks.permission.mockReset();
  mocks.permission.mockResolvedValue("unsupported");
});

describe("ConnectingScreen: running and success (O40, O41)", () => {
  it("AC-5.1 shows six steps, each with a status in words, while the test runs", async () => {
    let finish: (value: ConnectionTestRun) => void = () => undefined;
    setup(new Promise<ConnectionTestRun>((resolve) => { finish = resolve; }));
    const running = await screen.findByRole("list", { name: "Connection checks" });
    expect(within(running).getAllByRole("listitem")).toHaveLength(6);
    expect(within(running).getAllByText("Waiting").length).toBeGreaterThan(0);
    expect(running).toHaveAttribute("aria-live", "polite");
    finish(run("ok"));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    const done = screen.getByRole("list", { name: "Connection checks" });
    expect(within(done).getAllByText(/^Passed/)).toHaveLength(6);
  });

  it("starts the test with a client that reads its keys from the vault and does not retry (a CORS block must fail at once)", async () => {
    setup(run("ok"));
    await screen.findByText("Connected");
    const config = mocks.createClient.mock.calls[0] as unknown as [{ maxAttempts: number; credentials: unknown; endpoint: string }];
    expect(config[0].maxAttempts).toBe(1);
    expect(typeof config[0].credentials).toBe("function");
    expect(config[0].endpoint).toBe(plan.endpoint);
  });

  it("AC-5.2 opens the bucket when one was given", async () => {
    const { onConnected } = setup(run("ok"));
    await userEvent.click(await screen.findByRole("button", { name: "Open bucket" }));
    expect(onConnected).toHaveBeenCalledWith({ plan: { ...plan }, access: "readWrite", buckets: [] });
  });

  it("AC-5.2 offers Choose a bucket when no bucket was given, with the buckets the key can list", async () => {
    const { onConnected } = setup(run("ok", undefined, { buckets: ["a", "b"] }), { plan: { bucket: undefined } });
    expect(screen.queryByText("Write a test file")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Choose a bucket" }));
    expect(onConnected.mock.calls[0]?.[0].buckets).toEqual(["a", "b"]);
  });

  it("AC-7.3 treats a key that cannot list buckets as connected, with manual entry next", async () => {
    const { onConnected } = setup(run("failed", { id: "list", failure: "accessDenied" }), { plan: { bucket: undefined } });
    await userEvent.click(await screen.findByRole("button", { name: "Choose a bucket" }));
    expect(onConnected.mock.calls[0]?.[0].buckets).toBeNull();
  });

  it("D-28 treats a CORS block on the bucket list as 'cannot list', not as a missing rule for a bucket nobody named", async () => {
    const { onConnected } = setup(run("failed", { id: "cors", failure: "cors" }), { plan: { bucket: undefined } });
    await userEvent.click(await screen.findByRole("button", { name: "Choose a bucket" }));
    expect(onConnected.mock.calls[0]?.[0].buckets).toBeNull();
  });

  it("has no accessibility violations on success", async () => {
    const { container } = setup(run("ok"));
    await screen.findByText("Connected");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ConnectingScreen: failures (O43)", () => {
  it("AC-5.3 names the endpoint, explains, and offers Edit endpoint", async () => {
    const { onEdit } = setup(run("failed", { id: "reach", failure: "network" }));
    expect(await screen.findByText("Can’t reach https://s3.example-provider.test")).toBeInTheDocument();
    expect(screen.getByText("Browsers block http endpoints on https pages, except localhost.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit endpoint" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("AC-5.4 says the key may have a stray space or the clock is off, with the offset when known", async () => {
    const { unmount } = setup(run("failed", { id: "list", failure: "signatureDoesNotMatch", hint: { clockOffsetMinutes: 3 } }));
    expect(await screen.findByText(/off by 3 minutes/)).toBeInTheDocument();
    unmount();
    setup(run("failed", { id: "list", failure: "signatureDoesNotMatch" }));
    expect(await screen.findByText(/device clock may be wrong/)).toBeInTheDocument();
  });

  it("AC-5.5 offers the bucket's real region and tests again with it", async () => {
    setup(run("failed", { id: "list", failure: "wrongRegion", hint: { suggestedRegion: "eu-west-1" } }));
    expect(await screen.findByText("photos exists in eu-west-1, not us-east-1.")).toBeInTheDocument();
    mocks.runConnectionTest.mockImplementation(() => Promise.resolve(run("ok")));
    await userEvent.click(screen.getByRole("button", { name: "Use eu-west-1" }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    const regions = (mocks.createClient.mock.calls as unknown as [{ region: string }][]).map((call) => call[0].region);
    expect(regions).toEqual(["us-east-1", "eu-west-1"]);
  });

  it("AC-5.6 says the key is valid but cannot list the bucket", async () => {
    setup(run("failed", { id: "list", failure: "accessDenied" }));
    expect(await screen.findByText("The key is valid, but it isn’t allowed to list photos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("AC-5.7 reports a failed clean-up as a key that cannot delete", async () => {
    setup(run("failed", { id: "clean", failure: "accessDenied" }));
    expect(await screen.findByText("This key can’t delete files")).toBeInTheDocument();
  });

  it("explains a missing bucket and offers to edit the details", async () => {
    const { onEdit } = setup(run("failed", { id: "list", failure: "noSuchBucket" }));
    expect(await screen.findByText("Bucket not found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("shows an unexpected error as a failure with a way to retry", async () => {
    mocks.runConnectionTest.mockRejectedValue(new Error("boom"));
    render(<ConnectingScreen preset={getPreset("custom")} plan={plan} connectionId="c" onEdit={() => undefined} onConnected={() => undefined} />);
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("boom");
  });

  it("goes back to the form from the Back button", async () => {
    const { onEdit } = setup(run("failed", { id: "reach", failure: "network" }));
    await screen.findByText("Can’t reach https://s3.example-provider.test");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("has no accessibility violations on a failure", async () => {
    const { container } = setup(run("failed", { id: "list", failure: "accessDenied" }));
    await screen.findByText("Access denied");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ConnectingScreen: CORS (O42)", () => {
  it("AC-6.1 shows the exact origin, JSON and XML tabs, Copy, and the wildcard warning", async () => {
    setup(run("failed", { id: "cors", failure: "cors" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your bucket needs a CORS rule" })).toBeInTheDocument();
    expect(screen.getAllByText("https://coffer.example.test").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "JSON" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "XML" }));
    expect(screen.getByText(/<AllowedOrigin>https:\/\/coffer\.example\.test<\/AllowedOrigin>/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy rule" })).toBeInTheDocument();
    expect(screen.getByText(/Don’t use \* as an allowed origin/)).toBeInTheDocument();
  });

  it("AC-6.2 the rule allows only the current origin and never * as an origin", async () => {
    setup(run("failed", { id: "cors", failure: "cors" }));
    const json = await screen.findByText(/"AllowedOrigins"/);
    const rules = JSON.parse(json.textContent) as { AllowedOrigins: string[] }[];
    expect(rules[0]?.AllowedOrigins).toEqual(["https://coffer.example.test"]);
  });

  it("copies the rule", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup(run("failed", { id: "cors", failure: "cors" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy rule" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("https://coffer.example.test"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("AC-6.3 tests again when the person says they added the rule, and continues on success", async () => {
    setup(run("failed", { id: "cors", failure: "cors" }));
    const again = await screen.findByRole("button", { name: "I’ve added it · Check again" });
    mocks.runConnectionTest.mockImplementation(() => Promise.resolve(run("ok")));
    await userEvent.click(again);
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(mocks.runConnectionTest).toHaveBeenCalledTimes(2);
  });

  it("AC-6.4 explains that Oracle's S3 API may not allow browser access", async () => {
    setup(run("failed", { id: "cors", failure: "cors" }), { preset: "oracle-oci" });
    expect(await screen.findByText(/Oracle OCI may not allow browser access/)).toBeInTheDocument();
  });

  it("keeps the provider's help steps within reach", async () => {
    setup(run("failed", { id: "cors", failure: "cors" }), { preset: "cloudflare-r2" });
    await screen.findByRole("heading", { level: 1, name: "Your bucket needs a CORS rule" });
    expect(screen.getByText(/open R2 and choose Manage R2 API tokens/)).toBeInTheDocument();
    expect(screen.getByText(/Open the CORS settings for photos in your Cloudflare R2 account/)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = setup(run("failed", { id: "cors", failure: "cors" }));
    await screen.findByText("Your bucket needs a CORS rule");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ConnectingScreen: read-only offer (O44)", () => {
  it("AC-110.1 offers Connect read-only and Edit keys", async () => {
    const { onConnected, onEdit } = setup(run("readOnly", { id: "write", failure: "accessDenied" }, { readVerified: true }));
    expect(await screen.findByText("This key can read but not write")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit keys" }));
    expect(onEdit).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Connect read-only" }));
    expect(onConnected.mock.calls[0]?.[0].access).toBe("readOnly");
  });

  it("AC-110.3 says no file could be read, without claiming the bucket is empty", async () => {
    // The same offer covers an empty bucket, an empty start folder and an object deleted before it was read.
    setup(run("readOnly", { id: "write", failure: "accessDenied" }, { readVerified: false }));
    expect(await screen.findByText("This key can list the bucket, but there was no file to read, so Coffer couldn’t confirm that reading works.")).toBeInTheDocument();
    expect(screen.queryByText(/bucket is empty/i)).toBeNull();
  });

  it("says nothing about reading once it was proven", async () => {
    setup(run("readOnly", { id: "write", failure: "accessDenied" }, { readVerified: true }));
    expect(await screen.findByText("This key can read but not write")).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t confirm that reading works/)).toBeNull();
  });
});

describe("ConnectingScreen: local network access (T-9)", () => {
  const local = { endpoint: "http://127.0.0.1:9000" };

  it("does not run the test, or touch the network, before a pre-prompt when the browser will ask", async () => {
    mocks.permission.mockResolvedValue("prompt");
    const { container } = setup(run("ok"), { plan: local });
    expect(await screen.findByText("Your browser will ask to reach your local network")).toBeInTheDocument();
    expect(mocks.runConnectionTest).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(mocks.runConnectionTest).toHaveBeenCalledTimes(1);
  });

  it("shows how to re-enable access when it was denied, and checks again", async () => {
    mocks.permission.mockResolvedValue("denied");
    setup(run("ok"), { plan: local });
    expect(await screen.findByText("Your browser blocked access to your local network")).toBeInTheDocument();
    expect(screen.getByText(/set Local network access to Allow/)).toBeInTheDocument();
    expect(mocks.runConnectionTest).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue("granted");
    await userEvent.click(screen.getByRole("button", { name: "Test again" }));
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("runs straight away when the permission is already granted", async () => {
    mocks.permission.mockResolvedValue("granted");
    setup(run("ok"), { plan: local });
    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });

  it("never asks the browser about a public endpoint", async () => {
    setup(run("ok"));
    await screen.findByText("Connected");
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it("shows the local-network failure code from the test as its own message, not a generic network error", async () => {
    setup(run("failed", { id: "reach", failure: "localNetworkDenied" }), { plan: local });
    expect(await screen.findByText("Your browser blocked access to your local network")).toBeInTheDocument();
    expect(screen.queryByText(/Can’t reach/)).toBeNull();
  });
});
