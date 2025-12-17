import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const advertisers = pgTable("advertisers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  status: text("status").notNull().default("active"),
  monthlyPriceExVat: decimal("monthly_price_ex_vat", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  revenueSharePercent: integer("revenue_share_percent").notNull().default(10),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const screens = pgTable("screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  yodeckPlayerId: text("yodeck_player_id"),
  status: text("status").notNull().default("unknown"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const placements = pgTable("placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id),
  screenId: varchar("screen_id").notNull().references(() => screens.id),
  secondsPerLoop: integer("seconds_per_loop").notNull(),
  playsPerHour: integer("plays_per_hour").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  amountExVat: decimal("amount_ex_vat", { precision: 10, scale: 2 }).notNull(),
  amountIncVat: decimal("amount_inc_vat", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"),
  moneybirdInvoiceId: text("moneybird_invoice_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  grossRevenueExVat: decimal("gross_revenue_ex_vat", { precision: 10, scale: 2 }).notNull(),
  sharePercent: integer("share_percent").notNull(),
  payoutAmountExVat: decimal("payout_amount_ex_vat", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertAdvertiserSchema = createInsertSchema(advertisers).omit({ id: true, createdAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export const insertScreenSchema = createInsertSchema(screens).omit({ id: true, createdAt: true, status: true, lastSeenAt: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true });
export const insertPlacementSchema = createInsertSchema(placements).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, createdAt: true });

// Types
export type Advertiser = typeof advertisers.$inferSelect;
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Screen = typeof screens.$inferSelect;
export type InsertScreen = z.infer<typeof insertScreenSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Placement = typeof placements.$inferSelect;
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;

// Integration status tracking (tokens stored as secrets/env vars, not in DB)
export const integrationStatus = pgTable("integration_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  service: text("service").notNull().unique(), // 'yodeck' or 'moneybird'
  isConnected: text("is_connected").notNull().default("false"),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type IntegrationStatusRecord = typeof integrationStatus.$inferSelect;
