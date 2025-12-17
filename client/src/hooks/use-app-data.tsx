import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  advertisersApi,
  locationsApi,
  screensApi,
  campaignsApi,
  placementsApi,
  invoicesApi,
  payoutsApi,
} from "@/lib/api";
import type {
  Advertiser,
  Location,
  Screen,
  Campaign,
  Placement,
  Invoice,
  Payout,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useAppData() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Queries
  const advertisersQuery = useQuery({
    queryKey: ["advertisers"],
    queryFn: advertisersApi.getAll,
  });

  const locationsQuery = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
  });

  const screensQuery = useQuery({
    queryKey: ["screens"],
    queryFn: screensApi.getAll,
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.getAll,
  });

  const placementsQuery = useQuery({
    queryKey: ["placements"],
    queryFn: placementsApi.getAll,
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: invoicesApi.getAll,
  });

  const payoutsQuery = useQuery({
    queryKey: ["payouts"],
    queryFn: payoutsApi.getAll,
  });

  // Mutations - Advertisers
  const addAdvertiserMutation = useMutation({
    mutationFn: advertisersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advertisers"] });
      toast({ title: "Advertiser created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateAdvertiserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Advertiser> }) =>
      advertisersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advertisers"] });
      toast({ title: "Advertiser updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mutations - Locations
  const addLocationMutation = useMutation({
    mutationFn: locationsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Location> }) =>
      locationsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: "Location updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mutations - Screens
  const addScreenMutation = useMutation({
    mutationFn: screensApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      toast({ title: "Screen created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateScreenMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Screen> }) =>
      screensApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      toast({ title: "Screen updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mutations - Campaigns
  const addCampaignMutation = useMutation({
    mutationFn: campaignsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["placements"] });
      toast({ title: "Campaign created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mutations - Payouts
  const generatePayoutsMutation = useMutation({
    mutationFn: payoutsApi.generate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      toast({ title: "Payouts generated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    advertisers: advertisersQuery.data || [],
    locations: locationsQuery.data || [],
    screens: screensQuery.data || [],
    campaigns: campaignsQuery.data || [],
    placements: placementsQuery.data || [],
    invoices: invoicesQuery.data || [],
    payouts: payoutsQuery.data || [],

    isLoading:
      advertisersQuery.isLoading ||
      locationsQuery.isLoading ||
      screensQuery.isLoading ||
      campaignsQuery.isLoading ||
      placementsQuery.isLoading ||
      invoicesQuery.isLoading ||
      payoutsQuery.isLoading,

    addAdvertiser: (data: Omit<Advertiser, "id" | "createdAt">) =>
      addAdvertiserMutation.mutate(data),
    updateAdvertiser: (id: string, data: Partial<Advertiser>) =>
      updateAdvertiserMutation.mutate({ id, data }),

    addLocation: (data: Omit<Location, "id" | "createdAt">) =>
      addLocationMutation.mutate(data),
    updateLocation: (id: string, data: Partial<Location>) =>
      updateLocationMutation.mutate({ id, data }),

    addScreen: (data: Omit<Screen, "id" | "createdAt" | "status" | "lastSeenAt">) =>
      addScreenMutation.mutate(data),
    updateScreen: (id: string, data: Partial<Screen>) =>
      updateScreenMutation.mutate({ id, data }),

    addCampaign: (
      data: Omit<Campaign, "id" | "createdAt">,
      placementData?: { screenIds: string[] }
    ) => {
      addCampaignMutation.mutate({
        ...data,
        screenIds: placementData?.screenIds,
      });
    },

    generatePayouts: (month: string) => generatePayoutsMutation.mutate(month),
  };
}
