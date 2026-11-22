import { closeSharedDb, sharedDb, type UploadRecord } from "./db";

const db = sharedDb;

/**
 * The `uploads` store. It matches the UploadStateStore shape that lib/s3 defines
 * (lib/storage never imports lib/s3). It stores and returns records; aborting
 * them is the app's job (technical-spec 7).
 */
export const uploadStore = {
  async put(record: UploadRecord): Promise<void> {
    await (await db()).put("uploads", record);
  },

  /** Record a finished part. A part that was already recorded is replaced, so a retry cannot duplicate it. */
  async addPart(id: string, part: { partNumber: number; etag: string }): Promise<void> {
    const handle = await db();
    const tx = handle.transaction("uploads", "readwrite");
    const record = await tx.store.get(id);
    if (record) {
      record.parts = [...record.parts.filter((existing) => existing.partNumber !== part.partNumber), part];
      await tx.store.put(record);
    }
    await tx.done;
  },

  async delete(id: string): Promise<void> {
    await (await db()).delete("uploads", id);
  },

  async list(): Promise<UploadRecord[]> {
    return (await db()).getAll("uploads");
  },
};

/** Close the shared handle (Forget this device closes handles before deleting the database; tests use it too). */
export async function closeUploadStore(): Promise<void> {
  await closeSharedDb();
}
