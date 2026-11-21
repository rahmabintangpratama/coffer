// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockedError, vault } from "./vault";

afterEach(() => {
  vault.lock();
});

const keys = { accessKeyId: "AK", secretAccessKey: "SK", sessionToken: "TK" };

describe("vault (memory only)", () => {
  it("hands out the keys it was given", async () => {
    vault.put("c1", keys);
    expect(vault.has("c1")).toBe(true);
    await expect(vault.credentialsFor("c1")).resolves.toEqual(keys);
  });

  it("keeps its own copy, so changing what it returned or was given changes nothing", async () => {
    const given = { ...keys };
    vault.put("c1", given);
    given.secretAccessKey = "changed";
    const first = await vault.credentialsFor("c1");
    first.secretAccessKey = "changed again";
    await expect(vault.credentialsFor("c1")).resolves.toEqual(keys);
  });

  it("omits a session token that was not given", async () => {
    vault.put("c2", { accessKeyId: "A", secretAccessKey: "S" });
    expect(await vault.credentialsFor("c2")).toEqual({ accessKeyId: "A", secretAccessKey: "S" });
  });

  it("refuses with LockedError for an unknown or forgotten connection", async () => {
    await expect(vault.credentialsFor("nope")).rejects.toBeInstanceOf(LockedError);
    vault.put("c1", keys);
    vault.forget("c1");
    await expect(vault.credentialsFor("c1")).rejects.toBeInstanceOf(LockedError);
  });

  it("drops every key on lock and tells listeners", async () => {
    vault.put("a", keys);
    vault.put("b", keys);
    const listener = vi.fn();
    const stop = vault.onLock(listener);
    vault.lock();
    expect(listener).toHaveBeenCalledTimes(1);
    await expect(vault.credentialsFor("a")).rejects.toBeInstanceOf(LockedError);
    stop();
    vault.lock();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("names its error LockedError, which the s3 layer maps to the locked app error", async () => {
    const error = await vault.credentialsFor("none").catch((reason: unknown) => reason);
    expect((error as Error).name).toBe("LockedError");
  });
});
