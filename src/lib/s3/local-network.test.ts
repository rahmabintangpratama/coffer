// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { localNetworkPermission, needsLocalNetworkPermission, permissionNameFor, queryBrowserPermission } from "./local-network";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("permissionNameFor", () => {
  it("uses loopback-network for loopback, local-network for private addresses and nothing for public ones", () => {
    expect(permissionNameFor("loopback")).toBe("loopback-network");
    expect(permissionNameFor("local")).toBe("local-network");
    expect(permissionNameFor("public")).toBeNull();
  });
});

describe("needsLocalNetworkPermission", () => {
  it("asks only when the page is less private than the endpoint", () => {
    expect(needsLocalNetworkPermission("coffer.example.com", "127.0.0.1")).toBe(true);
    expect(needsLocalNetworkPermission("coffer.example.com", "192.168.1.20")).toBe(true);
    expect(needsLocalNetworkPermission("192.168.1.5", "localhost")).toBe(true);
    expect(needsLocalNetworkPermission("localhost", "127.0.0.1")).toBe(false);
    expect(needsLocalNetworkPermission("127.0.0.1", "192.168.1.20")).toBe(false);
    expect(needsLocalNetworkPermission("coffer.example.com", "s3.example.com")).toBe(false);
  });
});

describe("queryBrowserPermission", () => {
  it("returns the browser's state", async () => {
    for (const state of ["granted", "prompt", "denied"] as const) {
      vi.stubGlobal("navigator", { permissions: { query: () => Promise.resolve({ state }) } });
      expect(await queryBrowserPermission("loopback-network")).toBe(state);
    }
  });

  it("passes the descriptor name through", async () => {
    const query = vi.fn(() => Promise.resolve({ state: "prompt" }));
    vi.stubGlobal("navigator", { permissions: { query } });
    await queryBrowserPermission("local-network");
    expect(query).toHaveBeenCalledWith({ name: "local-network" });
  });

  it("answers unsupported when the API is missing, throws, or gives an odd state", async () => {
    vi.stubGlobal("navigator", {});
    expect(await queryBrowserPermission("loopback-network")).toBe("unsupported");
    vi.stubGlobal("navigator", { permissions: { query: () => Promise.reject(new TypeError("unknown permission name")) } });
    expect(await queryBrowserPermission("loopback-network")).toBe("unsupported");
    vi.stubGlobal("navigator", { permissions: { query: () => Promise.resolve({ state: "weird" }) } });
    expect(await queryBrowserPermission("loopback-network")).toBe("unsupported");
    vi.stubGlobal("navigator", { permissions: { query: () => { throw new Error("sync throw"); } } });
    expect(await queryBrowserPermission("loopback-network")).toBe("unsupported");
  });
});

describe("localNetworkPermission", () => {
  const query = vi.fn((name: string) => Promise.resolve(name === "loopback-network" ? ("prompt" as const) : ("denied" as const)));

  it("picks the permission name from the endpoint's address", async () => {
    expect(await localNetworkPermission("http://localhost:9000", query)).toBe("prompt");
    expect(await localNetworkPermission("https://192.168.1.10", query)).toBe("denied");
  });

  it("does not ask for a public address or an unparseable endpoint", async () => {
    query.mockClear();
    expect(await localNetworkPermission("https://s3.example.com", query)).toBe("unsupported");
    expect(await localNetworkPermission("not a url", query)).toBe("unsupported");
    expect(query).not.toHaveBeenCalled();
  });
});
