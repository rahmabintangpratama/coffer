import type { ConnectionProfile } from "@/lib/types";
import { sharedDb } from "./db";

/**
 * Saved connections in the `connections` store. A profile here always has `credentials.storage === "encrypted"`:
 * a memory-only profile is never persisted (lib/storage AGENTS.md). The vault writes and reads these; nothing
 * else needs them in full.
 */
export const connectionStore = {
  async put(profile: ConnectionProfile): Promise<void> {
    if (profile.credentials.storage !== "encrypted") throw new Error("only encrypted connections are stored");
    await (await sharedDb()).put("connections", profile);
  },
  async get(id: string): Promise<ConnectionProfile | undefined> {
    return (await sharedDb()).get("connections", id);
  },
  async list(): Promise<ConnectionProfile[]> {
    return (await sharedDb()).getAll("connections");
  },
  async count(): Promise<number> {
    return (await sharedDb()).count("connections");
  },
  async delete(id: string): Promise<void> {
    await (await sharedDb()).delete("connections", id);
  },
};
