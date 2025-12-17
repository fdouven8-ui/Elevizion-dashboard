import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  advertisersApi,
  locationsApi,
  screensApi,
  contractsApi,
  placementsApi,
  invoicesApi,
  payoutsApi,
  snapshotsApi,
  dashboardApi,
} from "@/lib/api";
import type {
  Advertiser,
  Location,
  Screen,
  Contract,
  Placement,
  Invoice,
  Payout,
  ScheduleSnapshot,
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

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: contractsApi.getAll,
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

  const snapshotsQuery = useQuery({
    queryKey: ["snapshots"],
    queryFn: snapshotsApi.getAll,
  });

  const kpisQuery = useQuery({
    queryKey: ["kpis"],
    queryFn: dashboardApi.getKPIs,
  });

  // Mutations - Advertisers
  const addAdvertiserMutation = useMutation({
    mutationFn: advertisersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advertisers"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
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
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
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
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
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
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
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

  // Mutations - Contracts
  const addContractMutation = useMutation({
    mutationFn: contractsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["placements"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast({ title: "Contract created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contract> }) =>
      contractsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast({ title: "Contract updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mutations - Snapshots
  const generateSnapshotMutation = useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      snapshotsApi.generate(year, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      toast({ title: "Snapshot generated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const lockSnapshotMutation = useMutation({
    mutationFn: snapshotsApi.lock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      toast({ title: "Snapshot locked successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mutations - Invoices
  const generateInvoicesMutation = useMutation({
    mutationFn: invoicesApi.generate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
      toast({ title: "Invoices generated successfully" });
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
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
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
    contracts: contractsQuery.data || [],
    placements: placementsQuery.data || [],
    invoices: invoicesQuery.data || [],
    payouts: payoutsQuery.data || [],
    snapshots: snapshotsQuery.data || [],
    kpis: kpisQuery.data,

    isLoading:
      advertisersQuery.isLoading ||
      locationsQuery.isLoading ||
      screensQuery.isLoading ||
      contractsQuery.isLoading ||
      placementsQuery.isLoading ||
      invoicesQuery.isLoading ||
      payoutsQuery.isLoading,

    addAdvertiser: (data: Omit<Advertiser, "id" | "createdAt" | "updatedAt">) =>
      addAdvertiserMutation.mutate(data),
    updateAdvertiser: (id: string, data: Partial<Advertiser>) =>
      updateAdvertiserMutation.mutate({ id, data }),

    addLocation: (data: Omit<Location, "id" | "createdAt" | "updatedAt">) =>
      addLocationMutation.mutate(data),
    updateLocation: (id: string, data: Partial<Location>) =>
      updateLocationMutation.mutate({ id, data }),

    addScreen: (data: Omit<Screen, "id" | "createdAt" | "updatedAt">) =>
      addScreenMutation.mutate(data),
    updateScreen: (id: string, data: Partial<Screen>) =>
      updateScreenMutation.mutate({ id, data }),

    addContract: (
      data: Omit<Contract, "id" | "createdAt" | "updatedAt">,
      placementData?: { screenIds: string[] }
    ) => {
      addContractMutation.mutate({
        ...data,
        screenIds: placementData?.screenIds,
      } as any);
    },
    updateContract: (id: string, data: Partial<Contract>) =>
      updateContractMutation.mutate({ id, data }),

    generateSnapshot: (year: number, month: number) =>
      generateSnapshotMutation.mutate({ year, month }),
    lockSnapshot: (id: string) => lockSnapshotMutation.mutate(id),

    generateInvoices: (snapshotId: string) =>
      generateInvoicesMutation.mutate(snapshotId),
    generatePayouts: (snapshotId: string) =>
      generatePayoutsMutation.mutate(snapshotId),
  };
}
