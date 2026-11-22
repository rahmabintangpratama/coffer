// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deriveKey, fromBase64Url, isStrongPassphrase, KDF_ITERATIONS, needsRehash, newKdfParams, normalizePassphrase, open, paramsOf, passphraseLength, passphraseProblem, seal, toBase64Url, WrongPassphraseError } from "./crypto";

// FR-8, FR-9, C-34, ADR-005: the cryptographic building blocks, against Node's Web Crypto.
const keys = { accessKeyId: "AKFAKEFAKEFAKEFAKE00", secretAccessKey: "fake-secret-key-for-tests-only", sessionToken: "fake-session-token" };
const PASS = "correct horse battery";
// Fast derivations for the round trips; the default work factor is asserted separately.
const fast = (iterations = 2000) => newKdfParams(iterations);

describe("passphrase rules (C-34)", () => {
  it("AC-8.2 blocks under 12 characters and counts what a person counts", () => {
    expect(passphraseProblem("a".repeat(11))).toBe("tooShort");
    expect(passphraseProblem("a".repeat(12))).toBeNull();
    // Twelve emoji are twelve characters, not twenty-four UTF-16 units.
    expect(passphraseLength("😀".repeat(12))).toBe(12);
    expect(passphraseProblem("😀".repeat(12))).toBeNull();
    // NFKC folds a full-width letter and a ligature before counting.
    expect(passphraseLength("ＡＢＣ")).toBe(3);
    expect(passphraseLength("ﬁ")).toBe(2);
  });

  it("shows the strong hint from 16 characters", () => {
    expect(isStrongPassphrase("a".repeat(15))).toBe(false);
    expect(isStrongPassphrase("a".repeat(16))).toBe(true);
  });

  it("normalizes with NFKC, so the same text typed two ways gives one key", async () => {
    expect(normalizePassphrase("é")).toBe("é");
    const params = fast();
    const sealed = await seal(await deriveKey("café café café", params), "c1", keys, params);
    await expect(open(await deriveKey("café café café", params), "c1", sealed)).resolves.toEqual(keys);
  });
});

describe("AC-8.3 records", () => {
  it("round-trips the keys, with the session token only when there is one", async () => {
    const params = fast();
    const key = await deriveKey(PASS, params);
    expect(await open(key, "c1", await seal(key, "c1", keys, params))).toEqual(keys);
    const plain = { accessKeyId: "AK", secretAccessKey: "SK" };
    expect(await open(key, "c2", await seal(key, "c2", plain, params))).toEqual(plain);
  });

  it("writes the documented fields, base64url, and nothing readable", async () => {
    const params = fast();
    const sealed = await seal(await deriveKey(PASS, params), "c1", keys, params);
    expect(Object.keys(sealed).sort()).toEqual(["cipher", "data", "iterations", "iv", "kdf", "salt", "v"]);
    expect(sealed).toMatchObject({ v: 1, cipher: "AES-GCM", kdf: "PBKDF2" });
    for (const field of [sealed.salt, sealed.iv, sealed.data]) expect(field).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(sealed.salt)).toHaveLength(16);
    expect(fromBase64Url(sealed.iv)).toHaveLength(12);
    const dump = JSON.stringify(sealed);
    for (const secret of [keys.accessKeyId, keys.secretAccessKey, keys.sessionToken, PASS]) expect(dump).not.toContain(secret);
  });

  it("uses a fresh IV for every record", async () => {
    const params = fast();
    const key = await deriveKey(PASS, params);
    const ivs = new Set<string>();
    for (let n = 0; n < 20; n += 1) ivs.add((await seal(key, "c1", keys, params)).iv);
    expect(ivs.size).toBe(20);
  });

  it("a wrong passphrase does not open it", async () => {
    const params = fast();
    const sealed = await seal(await deriveKey(PASS, params), "c1", keys, params);
    await expect(open(await deriveKey(`${PASS}!`, params), "c1", sealed)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("tampered additional data fails: a record moved to another profile id does not open", async () => {
    const params = fast();
    const key = await deriveKey(PASS, params);
    const sealed = await seal(key, "c1", keys, params);
    await expect(open(key, "c2", sealed)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("a changed ciphertext, IV or salt fails", async () => {
    const params = fast();
    const key = await deriveKey(PASS, params);
    const sealed = await seal(key, "c1", keys, params);
    const flip = (text: string) => toBase64Url(fromBase64Url(text).map((byte, index) => (index === 0 ? byte ^ 1 : byte)));
    await expect(open(key, "c1", { ...sealed, data: flip(sealed.data) })).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(open(key, "c1", { ...sealed, iv: flip(sealed.iv) })).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(open(await deriveKey(PASS, { ...paramsOf(sealed), salt: fromBase64Url(flip(sealed.salt)) }), "c1", sealed)).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});

describe("work factor and key handling", () => {
  it("AC-8.3 new records default to at least 600,000 PBKDF2 iterations, stored per record", async () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const params = newKdfParams();
    expect(params.iterations).toBe(KDF_ITERATIONS);
    const sealed = await seal(await deriveKey(PASS, params), "c1", keys, params);
    expect(sealed.iterations).toBeGreaterThanOrEqual(600_000);
    expect(needsRehash(sealed)).toBe(false);
    expect(needsRehash({ ...sealed, iterations: 100_000 })).toBe(true);
  });

  it("the derived key is a non-extractable AES-GCM key that cannot be exported", async () => {
    const key = await deriveKey(PASS, fast());
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
    await expect(crypto.subtle.exportKey("jwk", key)).rejects.toThrow();
  });

  it("the same passphrase and salt give a key that opens the other's records; another salt does not", async () => {
    const params = fast();
    const sealed = await seal(await deriveKey(PASS, params), "c1", keys, params);
    await expect(open(await deriveKey(PASS, params), "c1", sealed)).resolves.toEqual(keys);
    await expect(open(await deriveKey(PASS, fast()), "c1", sealed)).rejects.toBeInstanceOf(WrongPassphraseError);
  });
});
