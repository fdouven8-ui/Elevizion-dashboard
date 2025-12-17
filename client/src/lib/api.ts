import type {
  Advertiser,
  Location,
  Screen,
  PackagePlan,
  Contract,
  Placement,
  ScheduleSnapshot,
  Invoice,
  Payout,
} from "@shared/schema";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || "Request failed");
  }

  return response.json();
}

// Advertisers
export const advertisersApi = {
  getAll: () => fetchJson<Advertiser[]>("/api/advertisers"),
  get: (id: string) => fetchJson<Advertiser>(`/api/advertisers/${id}`),
  create: (data: Omit<Advertiser, "id" | "createdAt" | "updatedAt">) =>
    fetchJson<Advertiser>("/api/advertisers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Advertiser>) =>
    fetchJson<Advertiser>(`/api/advertisers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetch(`/api/advertisers/${id}`, { method: "DELETE" }),
};

// Locations
export const locationsApi = {
  getAll: () => fetchJson<Location[]>("/api/locations"),
  get: (id: string) => fetchJson<Location>(`/api/locations/${id}`),
  create: (data: Omit<Location, "id" | "createdAt" | "updatedAt">) =>
    fetchJson<Location>("/api/locations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Location>) =>
    fetchJson<Location>(`/api/locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetch(`/api/locations/${id}`, { method: "DELETE" }),
};

// Screens
export const screensApi = {
  getAll: () => fetchJson<Screen[]>("/api/screens"),
  get: (id: string) => fetchJson<Screen>(`/api/screens/${id}`),
  create: (data: Omit<Screen, "id" | "createdAt" | "updatedAt">) =>
    fetchJson<Screen>("/api/screens", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Screen>) =>
    fetchJson<Screen>(`/api/screens/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetch(`/api/screens/${id}`, { method: "DELETE" }),
};

// Package Plans
export const packagePlansApi = {
  getAll: () => fetchJson<PackagePlan[]>("/api/package-plans"),
  create: (data: Omit<PackagePlan, "id" | "createdAt" | "updatedAt">) =>
    fetchJson<PackagePlan>("/api/package-plans", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<PackagePlan>) =>
    fetchJson<PackagePlan>(`/api/package-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Contracts
export const contractsApi = {
  getAll: () => fetchJson<Contract[]>("/api/contracts"),
  get: (id: string) => fetchJson<Contract>(`/api/contracts/${id}`),
  create: (data: Omit<Contract, "id" | "createdAt" | "updatedAt"> & { screenIds?: string[] }) =>
    fetchJson<Contract>("/api/contracts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Contract>) =>
    fetchJson<Contract>(`/api/contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Placements
export const placementsApi = {
  getAll: () => fetchJson<Placement[]>("/api/placements"),
  getByContract: (contractId: string) => fetchJson<Placement[]>(`/api/contracts/${contractId}/placements`),
  create: (data: Omit<Placement, "id" | "createdAt" | "updatedAt">) =>
    fetchJson<Placement>("/api/placements", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetch(`/api/placements/${id}`, { method: "DELETE" }),
};

// Schedule Snapshots
export const snapshotsApi = {
  getAll: () => fetchJson<ScheduleSnapshot[]>("/api/snapshots"),
  get: (id: string) => fetchJson<ScheduleSnapshot & { placements: any[] }>(`/api/snapshots/${id}`),
  generate: (year: number, month: number) =>
    fetchJson<ScheduleSnapshot>("/api/snapshots/generate", {
      method: "POST",
      body: JSON.stringify({ year, month }),
    }),
  lock: (id: string) =>
    fetchJson<ScheduleSnapshot>(`/api/snapshots/${id}/lock`, {
      method: "POST",
    }),
};

// Invoices
export const invoicesApi = {
  getAll: () => fetchJson<Invoice[]>("/api/invoices"),
  get: (id: string) => fetchJson<Invoice>(`/api/invoices/${id}`),
  generate: (snapshotId: string) =>
    fetchJson<Invoice[]>("/api/invoices/generate", {
      method: "POST",
      body: JSON.stringify({ snapshotId }),
    }),
  update: (id: string, data: Partial<Invoice>) =>
    fetchJson<Invoice>(`/api/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Payouts
export const payoutsApi = {
  getAll: () => fetchJson<Payout[]>("/api/payouts"),
  get: (id: string) => fetchJson<Payout>(`/api/payouts/${id}`),
  generate: (snapshotId: string) =>
    fetchJson<Payout[]>("/api/payouts/generate", {
      method: "POST",
      body: JSON.stringify({ snapshotId }),
    }),
  update: (id: string, data: Partial<Payout>) =>
    fetchJson<Payout>(`/api/payouts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Dashboard
export interface DashboardKPIs {
  totalAdvertisers: number;
  activeAdvertisers: number;
  totalLocations: number;
  activeLocations: number;
  totalScreens: number;
  onlineScreens: number;
  activeContracts: number;
  mrr: number;
  unpaidInvoiceCount: number;
  unpaidAmount: number;
  pendingPayoutCount: number;
  pendingPayoutAmount: number;
}

export const dashboardApi = {
  getKPIs: () => fetchJson<DashboardKPIs>("/api/dashboard/kpis"),
};
