import { useQuery } from "@tanstack/react-query";

export type UIMode = "operator" | "admin";

interface UIModeConfig {
  uiMode: UIMode;
}

/**
 * Hook to get the current UI mode from server config
 * Default: "operator" (clean, simple interface)
 * "admin" shows advanced tools and debug options
 */
export function useUIMode(): { uiMode: UIMode; isAdmin: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery<UIModeConfig>({
    queryKey: ["/api/public/ui-config"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/public/ui-config");
        if (!res.ok) return { uiMode: "operator" };
        return res.json();
      } catch {
        return { uiMode: "operator" };
      }
    },
    staleTime: 60000, // Cache for 1 minute
  });

  const uiMode = data?.uiMode || "operator";
  
  return {
    uiMode,
    isAdmin: uiMode === "admin",
    isLoading,
  };
}
