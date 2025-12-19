import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User, Permission } from "@shared/models/auth";
import { PERMISSIONS } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Logout failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries();
      window.location.href = "/login";
    },
  });

  const hasPermission = (permission: Permission | string): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  };

  const hasAnyPermission = (...permissions: (Permission | string)[]): boolean => {
    if (!user || !user.permissions) return false;
    return permissions.some((p) => user.permissions?.includes(p));
  };

  const hasAllPermissions = (...permissions: (Permission | string)[]): boolean => {
    if (!user || !user.permissions) return false;
    return permissions.every((p) => user.permissions?.includes(p));
  };

  const canViewHome = hasPermission(PERMISSIONS.VIEW_HOME);
  const canViewScreens = hasPermission(PERMISSIONS.VIEW_SCREENS);
  const canEditScreens = hasPermission(PERMISSIONS.EDIT_SCREENS);
  const canViewAdvertisers = hasPermission(PERMISSIONS.VIEW_ADVERTISERS);
  const canEditAdvertisers = hasPermission(PERMISSIONS.EDIT_ADVERTISERS);
  const canViewPlacements = hasPermission(PERMISSIONS.VIEW_PLACEMENTS);
  const canEditPlacements = hasPermission(PERMISSIONS.EDIT_PLACEMENTS);
  const canViewFinance = hasPermission(PERMISSIONS.VIEW_FINANCE);
  const canViewOnboarding = hasPermission(PERMISSIONS.VIEW_ONBOARDING);
  const canOnboardAdvertisers = hasPermission(PERMISSIONS.ONBOARD_ADVERTISERS);
  const canOnboardScreens = hasPermission(PERMISSIONS.ONBOARD_SCREENS);
  const canManageTemplates = hasPermission(PERMISSIONS.MANAGE_TEMPLATES);
  const canManageIntegrations = hasPermission(PERMISSIONS.MANAGE_INTEGRATIONS);
  const canManageUsers = hasPermission(PERMISSIONS.MANAGE_USERS);
  const canEditSettings = hasPermission(PERMISSIONS.EDIT_SYSTEM_SETTINGS);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canViewHome,
    canViewScreens,
    canEditScreens,
    canViewAdvertisers,
    canEditAdvertisers,
    canViewPlacements,
    canEditPlacements,
    canViewFinance,
    canViewOnboarding,
    canOnboardAdvertisers,
    canOnboardScreens,
    canManageTemplates,
    canManageIntegrations,
    canManageUsers,
    canEditSettings,
  };
}
