import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { ConnectionTestResult, ConnectionTestStep, TestFailure, TestStepId } from "@/lib/types";
import { AppError, isNetworkFailure, toAppError } from "./errors";
import { addressSpaceOf, localNetworkPermission, needsLocalNetworkPermission, type PermissionQuery } from "./local-network";

export interface ConnectionTestRun extends ConnectionTestResult {
  /** Bucket names, when no bucket was given and the key may list them. */
  buckets?: string[];
  /** For a read-only outcome: whether a read was actually proven (false when the bucket was empty). */
  readVerified?: boolean;
}

export interface ConnectionTestOptions {
  /** Use a client created with maxAttempts 1 so a CORS block fails at once. */
  client: S3Client;
  endpoint: string;
  /** Without a bucket only the first three steps run, and ListBuckets is used. */
  bucket?: string;
  /** The connection root (start folder). The test file is written under it. */
  prefix?: string;
  /** "https:" makes a non-local http endpoint fail before any request (mixed content). Defaults to the page's protocol. */
  pageProtocol?: string;
  /** Proves the host answers at all. Default: a no-cors fetch, which succeeds for any HTTP response. */
  reach?: (endpoint: string, signal: AbortSignal) => Promise<void>;
  onStep?: (step: ConnectionTestStep) => void;
  signal?: AbortSignal;
  /** For tests: 16 hex characters. */
  randomHex?: () => string;
  /** For tests: the host of the page making the requests. Default: the page's own. */
  pageHostname?: string;
  /** For tests: reads the local network permission. Default: the browser's Permissions API. */
  queryPermission?: PermissionQuery;
}

const STEP_ORDER: TestStepId[] = ["reach", "cors", "list", "write", "read", "clean"];
const REACH_TIMEOUT_MS = 10_000;
const BODY = "coffer connection test\n";
const BODY_LENGTH = new TextEncoder().encode(BODY).length;


function defaultHex(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function defaultReach(endpoint: string, signal: AbortSignal): Promise<void> {
  await fetch(endpoint, { method: "HEAD", mode: "no-cors", cache: "no-store", signal });
}

function failureFor(error: AppError): TestFailure {
  switch (error.code) {
    case "accessDenied":
      return "accessDenied";
    case "signature":
    case "clockSkew":
    case "expiredToken":
      return "signatureDoesNotMatch";
    case "wrongRegion":
      return "wrongRegion";
    case "noSuchBucket":
      return "noSuchBucket";
    case "network":
      return "network";
    default:
      return "unknown";
  }
}

/**
 * Run the connection test: reach the endpoint, check CORS, list, write a small
 * file, read it back, delete it (spec section 5). Every step reports through
 * onStep, and no request carries a secret in a place the UI can see.
 *
 * A browser reports a CORS block and an unreachable host as the same TypeError.
 * They are told apart in order: a no-cors probe succeeds if anything answers, so
 * if it passes and the signed call then fails without a response, it was CORS.
 */
export async function runConnectionTest(options: ConnectionTestOptions): Promise<ConnectionTestRun> {
  const { client, endpoint, bucket, signal } = options;
  const prefix = options.prefix ?? "";
  const steps: ConnectionTestStep[] = STEP_ORDER.map((id) => ({ id, status: "pending" }));
  const emit = (step: ConnectionTestStep) => options.onStep?.({ ...step });
  const update = (id: TestStepId, patch: Partial<ConnectionTestStep>) => {
    const step = steps.find((candidate) => candidate.id === id);
    if (!step) return;
    Object.assign(step, patch);
    emit(step);
  };
  const skipPending = () => {
    for (const step of steps) if (step.status === "pending") update(step.id, { status: "skipped" });
  };
  const finish = (outcome: ConnectionTestResult["outcome"], extra: Partial<ConnectionTestRun> = {}): ConnectionTestRun => {
    if (outcome !== "ok" || bucket !== undefined) skipPending();
    return { steps: steps.map((step) => ({ ...step })), outcome, ...extra };
  };
  const checkAbort = () => {
    if (signal?.aborted) throw new AppError("aborted");
  };
  const timed = async <T>(id: TestStepId, work: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    update(id, { status: "running" });
    try {
      const value = await work();
      update(id, { status: "pass", ms: Math.round(performance.now() - started) });
      return value;
    } catch (error) {
      update(id, { ms: Math.round(performance.now() - started) });
      throw error;
    }
  };
  const failStep = (id: TestStepId, error: AppError, failure = failureFor(error)) => {
    const hint = error.hint;
    update(id, { status: "fail", failure, ...(hint === undefined ? {} : { hint }) });
    return finish("failed");
  };
  const send = <T>(command: object): Promise<T> =>
    (client.send as (command: object, options?: { abortSignal?: AbortSignal }) => Promise<T>)(command, {
      ...(signal === undefined ? {} : { abortSignal: signal }),
    });

  // ------------------------------------------------------------ 1. reach
  const pageProtocol = options.pageProtocol ?? (typeof location === "undefined" ? undefined : location.protocol);
  const url = new URL(endpoint);
  if (pageProtocol === "https:" && url.protocol === "http:" && addressSpaceOf(url.hostname) !== "loopback") {
    update("reach", { status: "fail", failure: "mixedContent", ms: 0 });
    return finish("failed");
  }
  const reach = options.reach ?? defaultReach;
  const probe = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REACH_TIMEOUT_MS);
    const forward = () => {
      controller.abort();
    };
    signal?.addEventListener("abort", forward);
    try {
      await reach(endpoint, controller.signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  };
  try {
    await timed("reach", async () => {
      try {
        await probe();
      } catch (error) {
        checkAbort();
        if (isNetworkFailure(error) || (error as { name?: string }).name === "AbortError") await probe();
        else throw error;
      }
    });
  } catch {
    checkAbort();
    // A blocked local network and a stopped server look alike. Read the permission now: if it is denied, say so.
    const pageHostname = options.pageHostname ?? (typeof location === "undefined" ? "" : location.hostname);
    const local = needsLocalNetworkPermission(pageHostname, url.hostname);
    // Not granted after a failed request means the person has not allowed it: "denied" is a Block, and "prompt"
    // is a dismissed prompt (headless Chromium too). Either way the fix is the same, so both get the remediation.
    const permission = local ? await localNetworkPermission(endpoint, options.queryPermission) : "unsupported";
    const denied = permission === "denied" || permission === "prompt";
    update("reach", { status: "fail", failure: denied ? "localNetworkDenied" : "network" });
    return finish("failed");
  }

  // ------------------------------------------------- 2. cors and 3. list
  let firstKey: string | undefined;
  let buckets: string[] | undefined;
  const corsStarted = performance.now();
  update("cors", { status: "running" });
  try {
    if (bucket === undefined) {
      const listed = await send<{ Buckets?: { Name?: string }[] }>(new ListBucketsCommand({}));
      buckets = (listed.Buckets ?? []).flatMap((item) => (item.Name === undefined ? [] : [item.Name]));
    } else {
      const listed = await send<{ Contents?: { Key?: string }[] }>(
        new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1, ...(prefix === "" ? {} : { Prefix: prefix }) }),
      );
      firstKey = listed.Contents?.[0]?.Key;
    }
    const ms = Math.round(performance.now() - corsStarted);
    update("cors", { status: "pass", ms });
    update("list", { status: "pass", ms });
  } catch (error) {
    checkAbort();
    if (isNetworkFailure(error)) {
      // The host answered the probe but this signed request got no response: CORS.
      update("cors", { status: "fail", failure: "cors", ms: Math.round(performance.now() - corsStarted) });
      return finish("failed");
    }
    const app = toAppError(error);
    update("cors", { status: "pass", ms: Math.round(performance.now() - corsStarted) });
    if (bucket === undefined && app.code === "accessDenied") {
      // The key cannot list buckets; the person will type the bucket name.
      update("list", { status: "pass" });
      return finish("ok");
    }
    return failStep("list", app);
  }
  if (bucket === undefined) return finish("ok", buckets === undefined ? {} : { buckets });

  // ------------------------------------------------------------ 4. write
  const key = `${prefix}.coffer-test-${(options.randomHex ?? defaultHex)()}.txt`;
  try {
    await timed("write", () => send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: BODY, ContentLength: BODY_LENGTH, ContentType: "text/plain" })));
  } catch (error) {
    checkAbort();
    const app = toAppError(error);
    if (app.code !== "accessDenied") return failStep("write", app);
    update("write", { status: "fail", failure: "accessDenied" });
    // Read-only branch: list passed and the write was denied. Prove a read on an existing object instead.
    if (firstKey === undefined) return finish("readOnly", { readVerified: false });
    try {
      await send(new GetObjectCommand({ Bucket: bucket, Key: firstKey, Range: "bytes=0-0" }));
      return finish("readOnly", { readVerified: true });
    } catch (readError) {
      checkAbort();
      update("read", { status: "fail", failure: failureFor(toAppError(readError)) });
      return finish("failed");
    }
  }

  // ------------------------------------------------------------- 5. read
  try {
    await timed("read", async () => {
      const object = await send<{ Body?: { transformToString: () => Promise<string> } }>(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const text = await object.Body?.transformToString();
      if (text !== BODY) throw new AppError("unknown");
    });
  } catch (error) {
    checkAbort();
    return failStep("read", toAppError(error));
  }

  // ------------------------------------------------------------ 6. clean
  try {
    await timed("clean", () => send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
  } catch (error) {
    checkAbort();
    // A key that can write but not delete would fail on rename, move and trash later (C-20).
    return failStep("clean", toAppError(error));
  }
  return finish("ok");
}
