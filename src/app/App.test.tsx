import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionSummary } from "@/lib/types";
import { App } from "./App";
import { useSession } from "./session";

const connection: ConnectionSummary = {
  id: "c1",
  name: "Other S3-compatible · photos",
  providerId: "custom",
  fields: {},
  endpoint: "https://s3.example-provider.test",
  region: "us-east-1",
  addressingStyle: "auto",
  bucket: "photos",
  access: "readWrite",
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  // The shell measures its container; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSession.getState().disconnect();
  window.location.hash = "";
});

describe("App gate", () => {
  it("AC-1.1 shows Welcome while there is no connection, not the shell", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Connect a bucket" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  });

  it("shows the shell once a connection exists", async () => {
    useSession.getState().connect(connection);
    render(<App />);
    // The connected app is a lazy chunk with a large module graph; the first import can take seconds when the machine is busy.
    expect(await screen.findByRole("heading", { level: 1, name: "Home" }, { timeout: 15_000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect a bucket" })).toBeNull();
  }, 20_000);

  it("holds a connection without keys in the session store", () => {
    useSession.getState().connect(connection);
    expect(JSON.stringify(useSession.getState())).not.toMatch(/secret|accessKeyId/i);
  });
});
