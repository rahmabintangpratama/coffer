import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type AppError, toAppError } from "@/lib/s3/errors";
import type { ConnectionSummary } from "@/lib/types";
import { getClient } from "./client";
import { INITIAL_LIMIT, LOAD_ALL_CAP } from "./config";
import type { Item } from "./model";

/**
 * What the list is doing: `loading` the first pages, `partial` stopped at the
 * limit with more to load, `loadingAll` after "Load all", `capped` stopped at the
 * 100,000-key cap, `complete` nothing more to load (FR-21).
 */
export type ListMode = "loading" | "partial" | "loadingAll" | "capped" | "complete";

export interface Limits {
  initial: number;
  cap: number;
}

export interface Listing {
  items: Item[];
  isPending: boolean;
  error: AppError | null;
  /** A page after the first failed: the loaded ones are kept and this offers a retry. */
  pageError: boolean;
  mode: ListMode;
  loadAll: () => void;
  cancelLoadAll: () => void;
  retryPage: () => void;
  /** Reload from page 1 (AC-21.5). */
  refresh: () => Promise<void>;
  retry: () => void;
}

/**
 * One folder as an infinite query over ListObjectsV2 pages. Pages load by
 * themselves up to the initial limit; `Load all` raises the limit to the cap.
 * Mount it with a key per folder so the limit resets on navigation.
 */
export function useListing(connection: ConnectionSummary, prefix: string, limits: Limits = { initial: INITIAL_LIMIT, cap: LOAD_ALL_CAP }): Listing {
  const bucket = connection.bucket ?? "";
  const root = connection.prefix ?? "";
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["list", connection.id, bucket, prefix] as const, [connection.id, bucket, prefix]);
  const [target, setTarget] = useState(limits.initial);

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { listPage } = await import("@/lib/s3");
      const client = await getClient(connection);
      return listPage(client, { bucket, prefix, root, signal, ...(pageParam === undefined ? {} : { token: pageParam }) });
    },
    getNextPageParam: (last) => last.nextToken,
  });

  const items = useMemo<Item[]>(() => (query.data?.pages ?? []).flatMap((page) => [...page.folders, ...page.files]), [query.data]);
  const count = items.length;
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetching && !isFetchNextPageError && count < target) void fetchNextPage();
  }, [hasNextPage, isFetching, isFetchNextPageError, count, target, fetchNextPage]);

  let mode: ListMode;
  if (query.isPending) mode = "loading";
  else if (!hasNextPage) mode = "complete";
  else if (count < target) mode = target > limits.initial ? "loadingAll" : "loading";
  else mode = target >= limits.cap ? "capped" : "partial";

  const loadAll = useCallback(() => {
    setTarget(limits.cap);
  }, [limits.cap]);
  const cancelLoadAll = useCallback(() => {
    setTarget(count);
  }, [count]);
  const refresh = useCallback(async () => {
    setTarget(limits.initial);
    await queryClient.resetQueries({ queryKey });
  }, [queryClient, queryKey, limits.initial]);

  return {
    items,
    isPending: query.isPending,
    error: query.isError && !isFetchNextPageError ? toAppError(query.error) : null,
    pageError: isFetchNextPageError,
    mode,
    loadAll,
    cancelLoadAll,
    retryPage: () => void fetchNextPage(),
    refresh,
    retry: () => void query.refetch(),
  };
}
