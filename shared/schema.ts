/**
 * Elevizion OS Database Schema
 * 
 * This schema implements a contract-based advertising management system with:
 * - Advertisers and Locations (partners)
 * - PackagePlans (what is sold) and Contracts (who bought what)
 * - Screens and Placements (where ads run)
 * - ScheduleSnapshots (immutable monthly truth for billing)
 * - Invoices, Payments, Payouts with carry-over support
 * - Integration and Job tracking for automation
 */

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, decimal, timestamp, integer, boolean, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * Advertisers - Companies that buy advertising space
 * These are the revenue source - they sign contracts and receive invoices
 */
export const advertisers = pgTable("advertisers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  vatNumber: text("vat_number"),
  address: text("address"),
  moneybirdContactId: text("moneybird_contact_id"), // Synced from Moneybird
  status: text("status").notNull().default("active"), // active, paused, churned
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Locations - Partner businesses that host screens
 * These earn revenue share based on screen time at their location
 */
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  revenueSharePercent: decimal("revenue_share_percent", { precision: 5, scale: 2 }).notNull().default("10.00"),
  minimumPayoutAmount: decimal("minimum_payout_amount", { precision: 10, scale: 2 }).notNull().default("25.00"),
  bankAccountIban: text("bank_account_iban"),
  status: text("status").notNull().default("active"), // active, paused, terminated
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Screens - Digital signage displays at locations
 * Each screen can show multiple ads and syncs with Yodeck
 */
export const screens = pgTable("screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  yodeckPlayerId: text("yodeck_player_id"), // Linked Yodeck player ID
  yodeckPlayerName: text("yodeck_player_name"),
  resolution: text("resolution"), // e.g., "1920x1080"
  orientation: text("orientation").default("landscape"), // landscape, portrait
  status: text("status").notNull().default("unknown"), // online, offline, unknown
  lastSeenAt: timestamp("last_seen_at"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// COMMERCIAL ENTITIES (What is sold, who bought it)
// ============================================================================

/**
 * PackagePlans - Predefined advertising packages that can be sold
 * Examples: "Basic Package", "Premium Screen Time", "Full Network"
 */
export const packagePlans = pgTable("package_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  baseMonthlyPriceExVat: decimal("base_monthly_price_ex_vat", { precision: 10, scale: 2 }).notNull(),
  defaultSecondsPerLoop: integer("default_seconds_per_loop").notNull().default(10),
  defaultPlaysPerHour: integer("default_plays_per_hour").notNull().default(6),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Contracts - The commercial agreement between Elevizion and an Advertiser
 * This is the source of truth for "who pays what, for how long"
 */
export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  packagePlanId: varchar("package_plan_id").references(() => packagePlans.id),
  name: text("name").notNull(), // Contract reference name
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // NULL = ongoing/indefinite
  monthlyPriceExVat: decimal("monthly_price_ex_vat", { precision: 10, scale: 2 }).notNull(),
  vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }).notNull().default("21.00"),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly, quarterly, yearly
  status: text("status").notNull().default("active"), // draft, active, paused, ended, cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Placements - Where a contract's ads are shown
 * Links contracts to specific screens with scheduling details
 */
export const placements = pgTable("placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id),
  screenId: varchar("screen_id").notNull().references(() => screens.id),
  source: text("source").notNull().default("manual"), // manual, yodeck_sync
  secondsPerLoop: integer("seconds_per_loop").notNull().default(10),
  playsPerHour: integer("plays_per_hour").notNull().default(6),
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  yodeckPlaylistId: text("yodeck_playlist_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// SCHEDULING & PROOF (Monthly snapshots - the legal/billing truth)
// ============================================================================

/**
 * ScheduleSnapshots - Immutable monthly record of what ran where
 * Generated once per month, locked, and referenced by all billing/payouts
 * This is the legal proof layer of the system
 */
export const scheduleSnapshots = pgTable("schedule_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1-12
  status: text("status").notNull().default("draft"), // draft, locked
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }),
  totalWeight: decimal("total_weight", { precision: 12, scale: 2 }),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  lockedAt: timestamp("locked_at"),
  lockedByJobId: varchar("locked_by_job_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * SnapshotPlacements - Individual placement records within a snapshot
 * Contains the calculated weight for revenue distribution
 */
export const snapshotPlacements = pgTable("snapshot_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: varchar("snapshot_id").notNull().references(() => scheduleSnapshots.id),
  placementId: varchar("placement_id").notNull().references(() => placements.id),
  contractId: varchar("contract_id").notNull().references(() => contracts.id),
  screenId: varchar("screen_id").notNull().references(() => screens.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  // Weight calculation: seconds × plays × days active in period
  secondsPerLoop: integer("seconds_per_loop").notNull(),
  playsPerHour: integer("plays_per_hour").notNull(),
  daysActive: integer("days_active").notNull(),
  weight: decimal("weight", { precision: 12, scale: 2 }).notNull(), // seconds × plays × days
  revenueShare: decimal("revenue_share", { precision: 10, scale: 2 }), // Calculated share of revenue
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// FINANCIAL ENTITIES
// ============================================================================

/**
 * Invoices - Bills sent to advertisers
 * Generated from contracts, synced to Moneybird
 */
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  contractId: varchar("contract_id").references(() => contracts.id),
  snapshotId: varchar("snapshot_id").references(() => scheduleSnapshots.id),
  invoiceNumber: text("invoice_number"), // Auto-generated or from Moneybird
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  amountExVat: decimal("amount_ex_vat", { precision: 10, scale: 2 }).notNull(),
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).notNull(),
  amountIncVat: decimal("amount_inc_vat", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("draft"), // draft, sent, paid, overdue, cancelled
  dueDate: date("due_date"),
  paidAt: timestamp("paid_at"),
  moneybirdInvoiceId: text("moneybird_invoice_id"),
  moneybirdInvoiceUrl: text("moneybird_invoice_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Payments - Tracks payments received for invoices
 * Can have multiple payments per invoice (partial payments)
 */
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMethod: text("payment_method"), // bank_transfer, credit_card, etc.
  moneybirdPaymentId: text("moneybird_payment_id"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Payouts - Money owed to location partners
 * Calculated from schedule snapshots based on weighted screen time
 */
export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  snapshotId: varchar("snapshot_id").references(() => scheduleSnapshots.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  grossRevenueExVat: decimal("gross_revenue_ex_vat", { precision: 10, scale: 2 }).notNull(),
  sharePercent: decimal("share_percent", { precision: 5, scale: 2 }).notNull(),
  payoutAmountExVat: decimal("payout_amount_ex_vat", { precision: 10, scale: 2 }).notNull(),
  carryOverFromPrevious: decimal("carry_over_from_previous", { precision: 10, scale: 2 }).default("0.00"),
  totalDue: decimal("total_due", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, paid, carried_over
  paidAt: timestamp("paid_at"),
  paymentReference: text("payment_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * CarryOvers - Tracks unpaid small balances rolled to next period
 * When payout is below minimum threshold, it's carried forward
 */
export const carryOvers = pgTable("carry_overs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  fromPayoutId: varchar("from_payout_id").references(() => payouts.id),
  toPayoutId: varchar("to_payout_id").references(() => payouts.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  status: text("status").notNull().default("pending"), // pending, applied
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// INTEGRATION & AUTOMATION
// ============================================================================

/**
 * IntegrationLogs - Audit trail of all API calls to external services
 */
export const integrationLogs = pgTable("integration_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  service: text("service").notNull(), // yodeck, moneybird
  action: text("action").notNull(), // sync_screens, create_invoice, etc.
  status: text("status").notNull(), // success, error, pending
  requestData: jsonb("request_data"),
  responseData: jsonb("response_data"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Jobs - Background job definitions and schedules
 */
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  type: text("type").notNull(), // sync, generate, invoice, payout
  schedule: text("schedule"), // cron expression
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"), // success, error
  lastErrorMessage: text("last_error_message"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * JobRuns - Individual execution records of jobs
 */
export const jobRuns = pgTable("job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id),
  status: text("status").notNull(), // running, success, error
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  resultSummary: jsonb("result_summary"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * AuditLogs - Track all important actions in the system
 */
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // advertiser, contract, invoice, etc.
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(), // create, update, delete, status_change
  actorType: text("actor_type").notNull(), // user, system, job
  actorId: varchar("actor_id"),
  changes: jsonb("changes"), // { field: { old: x, new: y } }
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// INSERT SCHEMAS (for validation)
// ============================================================================

export const insertAdvertiserSchema = createInsertSchema(advertisers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScreenSchema = createInsertSchema(screens).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackagePlanSchema = createInsertSchema(packagePlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlacementSchema = createInsertSchema(placements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScheduleSnapshotSchema = createInsertSchema(scheduleSnapshots).omit({ id: true, createdAt: true });
export const insertSnapshotPlacementSchema = createInsertSchema(snapshotPlacements).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCarryOverSchema = createInsertSchema(carryOvers).omit({ id: true, createdAt: true });
export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Advertiser = typeof advertisers.$inferSelect;
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Screen = typeof screens.$inferSelect;
export type InsertScreen = z.infer<typeof insertScreenSchema>;

export type PackagePlan = typeof packagePlans.$inferSelect;
export type InsertPackagePlan = z.infer<typeof insertPackagePlanSchema>;

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;

export type Placement = typeof placements.$inferSelect;
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;

export type ScheduleSnapshot = typeof scheduleSnapshots.$inferSelect;
export type InsertScheduleSnapshot = z.infer<typeof insertScheduleSnapshotSchema>;

export type SnapshotPlacement = typeof snapshotPlacements.$inferSelect;
export type InsertSnapshotPlacement = z.infer<typeof insertSnapshotPlacementSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;

export type CarryOver = typeof carryOvers.$inferSelect;
export type InsertCarryOver = z.infer<typeof insertCarryOverSchema>;

export type IntegrationLog = typeof integrationLogs.$inferSelect;
export type InsertIntegrationLog = z.infer<typeof insertIntegrationLogSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
