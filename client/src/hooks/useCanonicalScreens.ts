/**
 * useCanonicalScreens Hook
 * Shared state for canonical screen status across all pages
 * 
 * RULE: This is THE ONLY way to get live screen status in the UI.
 * Schermen, Yodeck Debug, and any other page showing screen status MUST use this hook.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchCanonicalScreens, 
  ensureCompliance, 
  forceReset,
  type CanonicalScreensResponse 
} from "@/lib/canonicalScreens";
import type { CanonicalScreenStatus } from "@shared/schema";

const CANONICAL_SCREENS_KEY = ["canonical-screens"];

interface UseCanonicalScreensOptions {
  /** Enable automatic polling (OFF by default per spec) */
  pollingEnabled?: boolean;
  /** Polling interval in ms (default 30s) */
  pollingInterval?: number;
}

export function useCanonicalScreens(options: UseCanonicalScreensOptions = {}) {
  const { pollingEnabled = false, pollingInterval = 30000 } = options;
  const queryClient = useQueryClient();

  // DEV ASSERTION: Log that canonical hook is being used
  if (process.env.NODE_ENV === "development") {
    console.debug("[CanonicalScreens] Hook initialized - using live Yodeck data");
  }

  const query = useQuery<CanonicalScreensResponse>({
    queryKey: CANONICAL_SCREENS_KEY,
    queryFn: fetchCanonicalScreens,
    refetchInterval: pollingEnabled ? pollingInterval : false,
    staleTime: 10000, // 10 seconds
  });

  const ensureComplianceMutation = useMutation({
    mutationFn: (locationId: string) => ensureCompliance(locationId),
    onSuccess: () => {
      // Refresh canonical screens after compliance action
      queryClient.invalidateQueries({ queryKey: CANONICAL_SCREENS_KEY });
    },
  });

  const forceResetMutation = useMutation({
    mutationFn: (locationId: string) => forceReset(locationId),
    onSuccess: () => {
      // Refresh canonical screens after reset action
      queryClient.invalidateQueries({ queryKey: CANONICAL_SCREENS_KEY });
    },
  });

  const manualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: CANONICAL_SCREENS_KEY });
  };

  // Helper to find screen by location ID
  const getScreenByLocationId = (locationId: string): CanonicalScreenStatus | undefined => {
    return query.data?.screens.find(s => s.locationId === locationId);
  };

  // Helper to find screen by Yodeck device ID
  const getScreenByYodeckId = (yodeckDeviceId: string): CanonicalScreenStatus | undefined => {
    return query.data?.screens.find(s => s.yodeckDeviceId === yodeckDeviceId);
  };

  return {
    // Data
    screens: query.data?.screens || [],
    total: query.data?.total || 0,
    generatedAt: query.data?.generatedAt,
    
    // Query state
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    isError: query.isError,
    isStale: query.isStale,
    
    // Actions
    refresh: manualRefresh,
    ensureCompliance: ensureComplianceMutation.mutateAsync,
    forceReset: forceResetMutation.mutateAsync,
    
    // Mutation states
    isEnsuringCompliance: ensureComplianceMutation.isPending,
    isResetting: forceResetMutation.isPending,
    
    // Helpers
    getScreenByLocationId,
    getScreenByYodeckId,
  };
}

export type { CanonicalScreenStatus, CanonicalScreensResponse };
