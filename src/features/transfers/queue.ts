import type { RequestPool, S3Handle } from "@/lib/s3";
import type { UploadBody } from "@/lib/s3/upload";
import type { ConnectionSummary } from "@/lib/types";
import type { PlannedUpload } from "./plan";
import { type Transfer, useTransfers } from "./store";

/** At most this many files upload at once; their parts share one request pool (technical-spec 7). */
export const MAX_ACTIVE_FILES = 3;

interface Job {
  connection: ConnectionSummary;
  key: string;
  file: UploadBody;
  controller: AbortController | null;
  batch: number;
  onDone: (() => void) | undefined;
}

interface Batch {
  pending: number;
  succeeded: number;
  onDone: (() => void) | undefined;
}

let getConcurrency: () => number = () => 4;
/** The app tells the queue how many parts may be in flight (Settings.uploadConcurrency). */
export function configureTransfers(options: { getConcurrency: () => number }): void {
  getConcurrency = options.getConcurrency;
}

const jobs = new Map<string, Job>();
const batches = new Map<number, Batch>();
let nextBatch = 1;
let active = 0;
let pool: RequestPool | null = null;

const finishBatch = (id: number, succeeded: boolean) => {
  const batch = batches.get(id);
  if (!batch) return;
  batch.pending -= 1;
  if (succeeded) batch.succeeded += 1;
  if (batch.pending <= 0) {
    batches.delete(id);
    if (batch.succeeded > 0) batch.onDone?.();
  }
};

async function run(id: string, job: Job): Promise<void> {
  const store = useTransfers.getState();
  const controller = new AbortController();
  job.controller = controller;
  store.patch(id, { status: "running", bytesDone: 0 });
  try {
    const [s3, { uploadStore }, { withUploadLock }] = await Promise.all([
      import("@/lib/s3"),
      import("@/lib/storage/uploads"),
      import("@/lib/storage/locks"),
    ]);
    const shared = (pool ??= new s3.RequestPool(() => getConcurrency()));
    const client: S3Handle = s3.clientFor(job.connection);
    // The lock is taken before the record is written and kept until the upload ends, so another tab never sees a record without it (D-36).
    await withUploadLock(id, () =>
      s3.uploadObject({
        client,
        bucket: job.connection.bucket ?? "",
        key: job.key,
        body: job.file,
        pool: shared,
        store: uploadStore,
        connection: { id: job.connection.id, endpoint: job.connection.endpoint },
        signal: controller.signal,
        id,
        onProgress: (bytesDone) => { useTransfers.getState().patch(id, { bytesDone }); },
      }),
    );
    useTransfers.getState().patch(id, { status: "done", bytesDone: job.file.size });
    jobs.delete(id);
    finishBatch(job.batch, true);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
    if (controller.signal.aborted || code === "aborted") {
      // A cancelled upload leaves the panel, with nothing left at the provider.
      useTransfers.getState().remove(id);
      jobs.delete(id);
    } else {
      useTransfers.getState().patch(id, { status: "failed", error: code });
    }
    finishBatch(job.batch, false);
  } finally {
    job.controller = null;
    active -= 1;
    pump();
  }
}

function pump(): void {
  const { transfers } = useTransfers.getState();
  for (const transfer of transfers) {
    if (active >= MAX_ACTIVE_FILES) return;
    if (transfer.status !== "queued") continue;
    const job = jobs.get(transfer.id);
    if (!job || job.controller) continue;
    active += 1;
    // Mark it before the async start so the next loop turn does not pick it again.
    useTransfers.getState().patch(transfer.id, { status: "running" });
    void run(transfer.id, job);
  }
}

/** Queue uploads; `onDone` runs once when the whole batch has finished and at least one file arrived. */
export function startUploads(connection: ConnectionSummary, items: readonly PlannedUpload[], folder: string, onDone?: () => void): void {
  if (items.length === 0) return;
  const batch = nextBatch++;
  batches.set(batch, { pending: items.length, succeeded: 0, onDone });
  const transfers: Transfer[] = items.map((item) => {
    const id = crypto.randomUUID();
    jobs.set(id, { connection, key: item.key, file: item.file, controller: null, batch, onDone });
    return { id, name: item.name, folder, size: item.file.size, bytesDone: 0, status: "queued" };
  });
  useTransfers.getState().add(transfers);
  pump();
}

/** Cancel one upload: a queued one just leaves; a running one aborts its parts and the multipart upload (AC-41.3). */
export function cancelTransfer(id: string): void {
  const job = jobs.get(id);
  if (!job) {
    useTransfers.getState().remove(id);
    return;
  }
  if (job.controller) {
    job.controller.abort();
    return;
  }
  jobs.delete(id);
  useTransfers.getState().remove(id);
  finishBatch(job.batch, false);
}

/** Try a failed upload again from the start (AC-44.2). */
export function retryTransfer(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  useTransfers.getState().patch(id, { status: "queued", bytesDone: 0 });
  const batch = batches.get(job.batch);
  if (batch) batch.pending += 1;
  else {
    job.batch = nextBatch++;
    batches.set(job.batch, { pending: 1, succeeded: 0, onDone: job.onDone });
  }
  pump();
}
