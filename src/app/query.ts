import { QueryClient } from "@tanstack/react-query";
import { AppError } from "@/lib/s3/errors";
import { vault } from "@/lib/storage/vault";

/** Retry only what can pass by itself (network, throttling, 5xx), and twice at most (AC-130.1 shows the error after that). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 2 && error instanceof AppError && error.retryable,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// A lock drops the keys; listings must not outlive them (src/AGENTS.md).
vault.onLock(() => {
  queryClient.clear();
});
