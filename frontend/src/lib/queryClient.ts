import { QueryClient } from '@tanstack/react-query';

// Extracted to its own module (rather than defined inline in main.tsx) so
// authStore.clear()/setSession() can wipe the cache on actor switches — see
// the comment there. A React Query cache is keyed by query params, not by
// who's logged in; several row-scoped queries (appointments/today,
// payroll/me/*) share the same key across different actors.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
