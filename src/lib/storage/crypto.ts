import type { Credentials } from "@/lib/types";

/** PBKDF2-HMAC-SHA-256 work factor for new records (ADR-005, FR-8: at least 600,000). */
export const KDF_ITERATIONS = 600_000;
/** Saving is blocked below this many characters (C-34). */
export const MIN_PASSPHRASE_LENGTH = 12;
/** An advisory "strong" hint shows from here (C-34). */
export const STRONG_PASSPHRASE_LENGTH = 16;

const SALT_BYTES = 16;
const IV_BYTES = 12;

/** The passphrase as it is derived from: NFKC, so the same text typed on another keyboard gives the same key. */
export const normalizePassphrase = (passphrase: string): string => passphrase.normalize("NFKC");

/** Characters as a person counts them (code points), after normalization. */
export const passphraseLength = (passphrase: string): number => Array.from(normalizePassphrase(passphrase)).length;

export type PassphraseProblem = "tooShort";

/** What is wrong with a passphrase for saving, or null when it is long enough. */
export const passphraseProblem = (passphrase: string): PassphraseProblem | null => (passphraseLength(passphrase) < MIN_PASSPHRASE_LENGTH ? "tooShort" : null);

export const isStrongPassphrase = (passphrase: string): boolean => passphraseLength(passphrase) >= STRONG_PASSPHRASE_LENGTH;

/** Shared by every saved record: one salt, one derivation per unlock. */
export interface KdfParams {
  salt: Uint8Array;
  iterations: number;
}

export function newKdfParams(iterations: number = KDF_ITERATIONS): KdfParams {
  return { salt: crypto.getRandomValues(new Uint8Array(SALT_BYTES)), iterations };
}

/**
 * A saved record: `ConnectionProfile.credentials` for `storage: "encrypted"`, plus the format version. Binary
 * fields are base64url. Nothing here can be used without the passphrase.
 */
export interface SealedCredentials {
  v: 1;
  cipher: "AES-GCM";
  kdf: "PBKDF2";
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

/** The passphrase did not open the record (AES-GCM authentication failed), or the record was changed. */
export class WrongPassphraseError extends Error {
  constructor() {
    super("wrong passphrase");
    this.name = "WrongPassphraseError";
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const encoder = new TextEncoder();

/**
 * The key for a passphrase: PBKDF2 into a non-extractable AES-GCM-256 `CryptoKey`. It cannot be exported, so it
 * cannot be written to storage or posted to another tab even by mistake.
 */
export async function deriveKey(passphrase: string, params: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(normalizePassphrase(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: params.salt as BufferSource, iterations: params.iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Additional authenticated data: a record cannot be moved to another profile id and still open. */
const aadFor = (profileId: string): Uint8Array => encoder.encode(`coffer-v1|${profileId}`);

/** Encrypt the keys for one profile with a fresh IV. */
export async function seal(key: CryptoKey, profileId: string, credentials: Credentials, params: KdfParams): Promise<SealedCredentials> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = encoder.encode(
    JSON.stringify({ accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, ...(credentials.sessionToken === undefined ? {} : { sessionToken: credentials.sessionToken }) }),
  );
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadFor(profileId) as BufferSource }, key, plain);
  return { v: 1, cipher: "AES-GCM", kdf: "PBKDF2", iterations: params.iterations, salt: toBase64Url(params.salt), iv: toBase64Url(iv), data: toBase64Url(new Uint8Array(cipher)) };
}

/** Decrypt one record. Throws WrongPassphraseError when the key, the profile id or the bytes do not match. */
export async function open(key: CryptoKey, profileId: string, sealed: SealedCredentials): Promise<Credentials> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(sealed.iv) as BufferSource, additionalData: aadFor(profileId) as BufferSource }, key, fromBase64Url(sealed.data) as BufferSource);
  } catch {
    throw new WrongPassphraseError();
  }
  const value = JSON.parse(new TextDecoder().decode(plain)) as Partial<Credentials>;
  if (typeof value.accessKeyId !== "string" || typeof value.secretAccessKey !== "string") throw new WrongPassphraseError();
  return { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey, ...(typeof value.sessionToken === "string" ? { sessionToken: value.sessionToken } : {}) };
}

export const paramsOf = (sealed: SealedCredentials): KdfParams => ({ salt: fromBase64Url(sealed.salt), iterations: sealed.iterations });

/** A record made below the current work factor is re-encrypted the next time the vault is unlocked. */
export const needsRehash = (sealed: SealedCredentials): boolean => sealed.iterations < KDF_ITERATIONS;
