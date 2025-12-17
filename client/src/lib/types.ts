import { z } from "zod";

// --- Types ---

export type UserRole = "admin" | "viewer";
export type AdvertiserStatus = "active" | "paused";
export type ScreenStatus = "online" | "offline" | "unknown";
export type CampaignStatus = "active" | "ended" | "scheduled";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "failed";
export type PayoutStatus = "pending" | "paid";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Advertiser {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  status: AdvertiserStatus;
  monthlyPriceExVat: number;
  createdAt: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  revenueSharePercent: number; // default 10
  createdAt: string;
}

export interface Screen {
  id: string;
  locationId: string;
  name: string;
  yodeckPlayerId: string | null;
  status: ScreenStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Campaign {
  id: string;
  advertiserId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  createdAt: string;
}

export interface Placement {
  id: string;
  campaignId: string;
  screenId: string;
  secondsPerLoop: number;
  playsPerHour: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  advertiserId: string;
  periodStart: string;
  periodEnd: string;
  amountExVat: number;
  amountIncVat: number;
  status: InvoiceStatus;
  moneybirdInvoiceId: string | null;
  createdAt: string;
}

export interface Payout {
  id: string;
  locationId: string;
  periodStart: string;
  periodEnd: string;
  grossRevenueExVat: number;
  sharePercent: number;
  payoutAmountExVat: number;
  status: PayoutStatus;
  createdAt: string;
}

// --- Seed Data ---

export const SEED_ADVERTISERS: Advertiser[] = [
  {
    id: "adv_1",
    companyName: "TechCorp Solutions",
    contactName: "John Doe",
    email: "john@techcorp.com",
    phone: "+1 555 0101",
    status: "active",
    monthlyPriceExVat: 500,
    createdAt: new Date().toISOString(),
  },
  {
    id: "adv_2",
    companyName: "Fresh Bakery",
    contactName: "Sarah Smith",
    email: "sarah@bakery.com",
    phone: "+1 555 0102",
    status: "active",
    monthlyPriceExVat: 250,
    createdAt: new Date().toISOString(),
  },
  {
    id: "adv_3",
    companyName: "City Gym",
    contactName: "Mike Tyson",
    email: "mike@citygym.com",
    phone: "+1 555 0103",
    status: "paused",
    monthlyPriceExVat: 300,
    createdAt: new Date().toISOString(),
  },
];

export const SEED_LOCATIONS: Location[] = [
  {
    id: "loc_1",
    name: "Central Mall",
    address: "123 Main St, Cityville",
    contactName: "Alice Manager",
    email: "alice@mall.com",
    phone: "+1 555 1001",
    revenueSharePercent: 10,
    createdAt: new Date().toISOString(),
  },
  {
    id: "loc_2",
    name: "Airport Terminal 1",
    address: "456 Sky Rd, FlightCity",
    contactName: "Bob Operator",
    email: "bob@airport.com",
    phone: "+1 555 1002",
    revenueSharePercent: 15,
    createdAt: new Date().toISOString(),
  },
];

export const SEED_SCREENS: Screen[] = [
  {
    id: "scr_1",
    locationId: "loc_1",
    name: "Mall Entrance Lobby",
    yodeckPlayerId: "yd_123",
    status: "online",
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "scr_2",
    locationId: "loc_1",
    name: "Food Court Main",
    yodeckPlayerId: "yd_124",
    status: "online",
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: "scr_3",
    locationId: "loc_2",
    name: "Gate A5",
    yodeckPlayerId: "yd_125",
    status: "offline",
    lastSeenAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  },
];

export const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: "cmp_1",
    advertiserId: "adv_1",
    name: "Q4 Tech Promo",
    startDate: "2024-10-01",
    endDate: "2024-12-31",
    status: "active",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cmp_2",
    advertiserId: "adv_2",
    name: "Morning Bagel Special",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    status: "active",
    createdAt: new Date().toISOString(),
  },
];

export const SEED_PLACEMENTS: Placement[] = [
  {
    id: "pl_1",
    campaignId: "cmp_1",
    screenId: "scr_1",
    secondsPerLoop: 15,
    playsPerHour: 10,
    createdAt: new Date().toISOString(),
  },
  {
    id: "pl_2",
    campaignId: "cmp_1",
    screenId: "scr_2",
    secondsPerLoop: 15,
    playsPerHour: 10,
    createdAt: new Date().toISOString(),
  },
  {
    id: "pl_3",
    campaignId: "cmp_2",
    screenId: "scr_1",
    secondsPerLoop: 10,
    playsPerHour: 6,
    createdAt: new Date().toISOString(),
  },
];

export const SEED_INVOICES: Invoice[] = [
  {
    id: "inv_1",
    advertiserId: "adv_1",
    periodStart: "2024-11-01",
    periodEnd: "2024-11-30",
    amountExVat: 500,
    amountIncVat: 605,
    status: "paid",
    moneybirdInvoiceId: "mb_001",
    createdAt: new Date().toISOString(),
  },
  {
    id: "inv_2",
    advertiserId: "adv_2",
    periodStart: "2024-11-01",
    periodEnd: "2024-11-30",
    amountExVat: 250,
    amountIncVat: 302.5,
    status: "sent",
    moneybirdInvoiceId: "mb_002",
    createdAt: new Date().toISOString(),
  },
];
