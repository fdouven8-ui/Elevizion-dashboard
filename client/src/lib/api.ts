import type {
  Advertiser,
  Location,
  Screen,
  Campaign,
  Placement,
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
  create: (data: Omit<Advertiser, "id" | "createdAt">) =>
    fetchJson<Advertiser>("/api/advertisers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Advertiser>) =>
    fetchJson<Advertiser>(`/api/advertisers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Locations
export const locationsApi = {
  getAll: () => fetchJson<Location[]>("/api/locations"),
  create: (data: Omit<Location, "id" | "createdAt">) =>
    fetchJson<Location>("/api/locations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Location>) =>
    fetchJson<Location>(`/api/locations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Screens
export const screensApi = {
  getAll: () => fetchJson<Screen[]>("/api/screens"),
  create: (data: Omit<Screen, "id" | "createdAt" | "status" | "lastSeenAt">) =>
    fetchJson<Screen>("/api/screens", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Screen>) =>
    fetchJson<Screen>(`/api/screens/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Campaigns
export const campaignsApi = {
  getAll: () => fetchJson<Campaign[]>("/api/campaigns"),
  create: (data: Omit<Campaign, "id" | "createdAt"> & { screenIds?: string[] }) =>
    fetchJson<Campaign>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Placements
export const placementsApi = {
  getAll: () => fetchJson<Placement[]>("/api/placements"),
};

// Invoices
export const invoicesApi = {
  getAll: () => fetchJson<Invoice[]>("/api/invoices"),
};

// Payouts
export const payoutsApi = {
  getAll: () => fetchJson<Payout[]>("/api/payouts"),
  generate: (month: string) =>
    fetchJson<Payout[]>("/api/payouts/generate", {
      method: "POST",
      body: JSON.stringify({ month }),
    }),
};
