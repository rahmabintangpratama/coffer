import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { t } from "@/lib/i18n";
import type { ConnectionSummary, FileKind, StarredItem } from "@/lib/types";

// lib/storage/library is small but holds IndexedDB code; it loads with the first use.
const library = () => import("@/lib/storage/library");

export const starredKey = (connection: ConnectionSummary) => ["starred", connection.id, connection.bucket ?? ""] as const;
export const recentKey = (connection: ConnectionSummary) => ["recent", connection.id, connection.bucket ?? ""] as const;

/** FR-80: the starred items of the active connection and bucket, newest first. */
export function useStarred(connection: ConnectionSummary) {
  return useQuery({ queryKey: starredKey(connection), queryFn: async () => (await library()).listStarred(connection.id, connection.bucket ?? "") });
}

/** The set of starred keys, for menus that offer Add or Remove. */
export function useStarredKeys(connection: ConnectionSummary): ReadonlySet<string> {
  const query = useStarred(connection);
  return new Set(query.data?.map((item) => item.key) ?? []);
}

/** Add or remove stars, then refresh every view of them. */
export function useStarActions(connection: ConnectionSummary, notify?: (message: string) => void) {
  const client = useQueryClient();
  const bucket = connection.bucket ?? "";
  const mutation = useMutation({
    mutationFn: async ({ add, items }: { add: boolean; items: readonly { key: string; kind: StarredItem["kind"] }[] }) => {
      const store = await library();
      if (add) await store.addStars(items.map((item) => ({ connectionId: connection.id, bucket, key: item.key, kind: item.kind })));
      else await store.removeStars(connection.id, bucket, items.map((item) => item.key));
      return { add, count: items.length };
    },
    onSuccess: async ({ add, count }) => {
      await client.invalidateQueries({ queryKey: starredKey(connection) });
      notify?.(add ? t("toast.starred", { count }) : t("toast.unstarred", { count }));
    },
  });
  const star = useCallback((items: readonly { key: string; kind: StarredItem["kind"] }[]) => { mutation.mutate({ add: true, items }); }, [mutation]);
  const unstar = useCallback((items: readonly { key: string; kind: StarredItem["kind"] }[]) => { mutation.mutate({ add: false, items }); }, [mutation]);
  return { star, unstar };
}

/** FR-81: the recent files of the active connection and bucket. */
export function useRecent(connection: ConnectionSummary) {
  return useQuery({ queryKey: recentKey(connection), queryFn: async () => (await library()).listRecent(connection.id, connection.bucket ?? "") });
}

/** AC-81.1: a file opened in Preview is recorded (its key, name and kind only). Failures are ignored: Recent is a convenience. */
export function useRecordOpen(connection: ConnectionSummary) {
  const client = useQueryClient();
  return useCallback(
    (file: { key: string; name: string; fileKind: FileKind }) => {
      void library()
        .then((store) => store.recordRecent({ connectionId: connection.id, bucket: connection.bucket ?? "", key: file.key, name: file.name, fileKind: file.fileKind }))
        .then(() => client.invalidateQueries({ queryKey: recentKey(connection) }))
        .catch(() => undefined);
    },
    [client, connection],
  );
}
