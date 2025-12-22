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

// Import and re-export auth schema (users and sessions tables)
import { 
  users as authUsers, 
  sessions as authSessions, 
  PERMISSIONS, 
  ROLE_PRESETS,
  type User, 
  type UpsertUser,
  type Permission,
  type RolePreset,
} from "./models/auth";
export const users = authUsers;
export const sessions = authSessions;
export { PERMISSIONS, ROLE_PRESETS };
export type { User, UpsertUser, Permission, RolePreset };

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
  kvkNumber: text("kvk_number"), // KvK nummer (Kamer van Koophandel)
  address: text("address"),
  street: text("street"),
  zipcode: text("zipcode"),
  city: text("city"),
  // SEPA Automatisch Incasso velden
  iban: text("iban"), // IBAN rekeningnummer voor incasso
  ibanAccountHolder: text("iban_account_holder"), // Tenaamstelling rekening
  sepaMandate: boolean("sepa_mandate").default(false), // Heeft machtiging getekend
  sepaMandateReference: text("sepa_mandate_reference"), // Mandaat kenmerk (bijv. ELEVIZ-2024-001)
  sepaMandateDate: date("sepa_mandate_date"), // Datum ondertekening machtiging
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
  street: text("street"),
  zipcode: text("zipcode"),
  city: text("city"), // Plaats - used for filtering screens
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
 * ScreenGroups - Groups of screens for bulk operations
 */
export const screenGroups = pgTable("screen_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Screens - Digital signage displays at locations
 * Each screen can show multiple ads and syncs with Yodeck
 * screenId is the unique identifier (EVZ-001 format) used everywhere
 */
export const screens = pgTable("screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenId: text("screen_id").notNull().unique(), // EVZ-001 format - MANDATORY
  locationId: varchar("location_id").notNull().references(() => locations.id),
  groupId: varchar("group_id").references(() => screenGroups.id),
  name: text("name").notNull(),
  yodeckPlayerId: text("yodeck_player_id"), // Linked Yodeck player ID (numeric ID as string)
  yodeckPlayerName: text("yodeck_player_name"),
  yodeckUuid: text("yodeck_uuid").unique(), // Yodeck UUID for upsert matching
  yodeckWorkspaceName: text("yodeck_workspace_name"),
  yodeckScreenshotUrl: text("yodeck_screenshot_url"),
  // Yodeck content tracking - what's playing on the screen
  // Content status enum: unknown (never synced), empty (API confirmed no content), has_content (verified), likely_has_content (heuristic)
  yodeckContentStatus: text("yodeck_content_status").default("unknown"), // unknown, empty, has_content, likely_has_content
  yodeckContentCount: integer("yodeck_content_count"), // Number of items/playlists assigned (0 = empty, >0 = has content)
  yodeckContentSummary: jsonb("yodeck_content_summary"), // { playlists:[], items:[], topItems:[], lastFetchedAt }
  yodeckContentLastFetchedAt: timestamp("yodeck_content_last_fetched_at"),
  // Screenshot fallback for content detection
  yodeckScreenshotLastOkAt: timestamp("yodeck_screenshot_last_ok_at"), // Last time screenshot was valid
  yodeckScreenshotByteSize: integer("yodeck_screenshot_byte_size"), // Screenshot size (>5KB suggests content)
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
 * Extended with e-sign capabilities for digital contract signing
 */
export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  packagePlanId: varchar("package_plan_id").references(() => packagePlans.id),
  name: text("name").notNull(), // Contract reference name
  version: integer("version").notNull().default(1),
  title: text("title"), // Display title for contract
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // NULL = ongoing/indefinite
  monthlyPriceExVat: decimal("monthly_price_ex_vat", { precision: 10, scale: 2 }).notNull(),
  vatPercent: decimal("vat_percent", { precision: 5, scale: 2 }).notNull().default("21.00"),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly, quarterly, yearly
  status: text("status").notNull().default("draft"), // draft, sent, viewed, signed, expired, cancelled, active, paused, ended
  // E-sign fields
  pdfUrl: text("pdf_url"),
  htmlContent: text("html_content"), // Contract HTML template content
  signatureTokenHash: text("signature_token_hash"), // Hashed token for signing
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  signedAt: timestamp("signed_at"),
  expiresAt: timestamp("expires_at"),
  signedByName: text("signed_by_name"),
  signedByEmail: text("signed_by_email"),
  signedIp: text("signed_ip"),
  signedUserAgent: text("signed_user_agent"),
  signatureData: text("signature_data"), // Base64 signature image
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * ContractEvents - Audit trail of contract lifecycle events
 */
export const contractEvents = pgTable("contract_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id),
  eventType: text("event_type").notNull(), // created, sent, viewed, signed, reminder_sent, expired, cancelled
  actorType: text("actor_type").notNull().default("system"), // user, system, signer
  actorId: varchar("actor_id"), // User ID or email of the actor
  actorName: text("actor_name"), // Display name of the actor
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * ContractFiles - Document storage for contracts (PDFs, attachments)
 */
export const contractFiles = pgTable("contract_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id),
  fileType: text("file_type").notNull(), // pdf, html, attachment, signature
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  sha256Hash: text("sha256_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
 * IntegrationConfigs - Store settings for external API integrations
 * Secrets are stored encrypted or as references to env vars
 */
export const integrationConfigs = pgTable("integration_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  service: text("service").notNull().unique(), // yodeck, moneybird, dropbox_sign
  isEnabled: boolean("is_enabled").notNull().default(false),
  status: text("status").notNull().default("not_configured"), // not_configured, connected, error
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: text("last_test_result"), // success, error
  lastTestError: text("last_test_error"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncItemsProcessed: integer("last_sync_items_processed"),
  syncFrequency: text("sync_frequency").default("15min"), // 5min, 15min, 30min, 1hour, manual
  settings: jsonb("settings"), // service-specific non-secret settings
  encryptedCredentials: text("encrypted_credentials"), // AES-256 encrypted JSON of API keys
  credentialsConfigured: jsonb("credentials_configured").$type<Record<string, boolean>>(), // which keys are set (e.g., {api_key: true, admin_id: true})
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
// ONBOARDING (Advertiser workflow tracking)
// ============================================================================

/**
 * OnboardingChecklists - Track advertiser onboarding progress
 */
export const onboardingChecklists = pgTable("onboarding_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  status: text("status").notNull().default("not_started"), // not_started, in_progress, completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * OnboardingTasks - Individual tasks within a checklist
 */
export const onboardingTasks = pgTable("onboarding_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checklistId: varchar("checklist_id").notNull().references(() => onboardingChecklists.id),
  taskType: text("task_type").notNull(), // creative_received, creative_approved, campaign_created, scheduled_on_screens, billing_configured, first_invoice_sent, go_live_confirmed, first_report_sent
  status: text("status").notNull().default("todo"), // todo, doing, done, blocked
  ownerUserId: varchar("owner_user_id"),
  notes: text("notes"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// REPORTING & MONITORING (Phase 2)
// ============================================================================

/**
 * Reports - Generated proof-of-play and performance reports
 */
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  reportType: text("report_type").notNull().default("monthly"), // monthly, quarterly, custom
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  pdfUrl: text("pdf_url"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * ReportMetrics - Detailed metrics per screen for a report
 */
export const reportMetrics = pgTable("report_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => reports.id),
  screenId: varchar("screen_id").notNull().references(() => screens.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  scheduledPlaysEstimate: integer("scheduled_plays_estimate").notNull(),
  scheduledSecondsEstimate: integer("scheduled_seconds_estimate").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Issues - Track screen and system problems (OPS-first)
 * Renamed from incidents for clearer terminology
 */
export const incidents = pgTable("incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentType: text("incident_type").notNull(), // screen_offline, sync_failed, playlist_mismatch, storage_issue, empty_inventory
  severity: text("severity").notNull().default("medium"), // low, medium, high
  screenId: varchar("screen_id").references(() => screens.id),
  locationId: varchar("location_id").references(() => locations.id),
  assigneeUserId: varchar("assignee_user_id"), // Who is working on this
  status: text("status").notNull().default("open"), // open, acknowledged, resolved
  title: text("title").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * SyncLogs - Track Yodeck/Moneybird sync runs
 */
export const syncLogs = pgTable("sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncType: text("sync_type").notNull(), // yodeck_devices, moneybird_invoices, moneybird_contacts
  status: text("status").notNull().default("running"), // running, success, failed
  itemsProcessed: integer("items_processed").default(0),
  itemsCreated: integer("items_created").default(0),
  itemsUpdated: integer("items_updated").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * AlertRules - Configuration for automated alerts
 */
export const alertRules = pgTable("alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: text("alert_type").notNull(), // screen_offline, sync_failed, invoice_overdue
  thresholdMinutes: integer("threshold_minutes").notNull().default(30),
  notifyEmails: text("notify_emails").notNull(), // comma-separated emails
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Note: Users and Sessions tables are defined in ./models/auth.ts
// and re-exported at the top of this file

// ============================================================================
// CREATIVES & ASSETS (Phase 4)
// ============================================================================

/**
 * Creatives - Advertising content files
 */
export const creatives = pgTable("creatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  creativeType: text("creative_type").notNull(), // video, image
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"), // draft, pending_approval, approved, rejected, archived
  durationSeconds: integer("duration_seconds"), // For videos
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * CreativeVersions - Version history for creatives
 */
export const creativeVersions = pgTable("creative_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creativeId: varchar("creative_id").notNull().references(() => creatives.id),
  versionNo: integer("version_no").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  sha256Hash: text("sha256_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * CreativeApprovals - Approval workflow for creatives
 */
export const creativeApprovals = pgTable("creative_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creativeId: varchar("creative_id").notNull().references(() => creatives.id),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  approvedByUserId: varchar("approved_by_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// WEBHOOKS & API (Phase 4)
// ============================================================================

/**
 * Webhooks - External webhook endpoints for event notifications
 */
export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  eventTypes: text("event_types").notNull(), // comma-separated: invoice.paid, screen.offline, contract.signed
  secret: text("secret"), // For signature verification
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  failureCount: integer("failure_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * WebhookDeliveries - Log of webhook delivery attempts
 */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookId: varchar("webhook_id").notNull().references(() => webhooks.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  deliveredAt: timestamp("delivered_at"),
  status: text("status").notNull().default("pending"), // pending, success, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// SALES & ACQUISITIE (Leads, Schouwdocumenten, Handtekeningen)
// ============================================================================

/**
 * Leads - Potentiële adverteerders of locaties
 * Gebruikt tijdens acquisitie voordat ze klant worden
 */
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'advertiser', 'location', or 'both'
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  postcode: text("postcode"),
  kvkNumber: text("kvk_number"), // Kamer van Koophandel nummer
  notes: text("notes"),
  status: text("status").notNull().default("nieuw"), // nieuw, contact, schouw_gepland, voorstel, onderhandeling, gewonnen, verloren
  source: text("source"), // website, beurs, cold_call, referral, etc.
  assignedToUserId: varchar("assigned_to_user_id"),
  expectedValue: decimal("expected_value", { precision: 10, scale: 2 }),
  followUpDate: date("follow_up_date"),
  convertedAt: timestamp("converted_at"), // Wanneer omgezet naar adverteerder/locatie
  convertedToId: varchar("converted_to_id"), // ID van de aangemaakte adverteerder/locatie
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * LocationSurveys - Schouwdocumenten voor nieuwe schermlocaties
 * Vastleggen wat er nodig is voor installatie
 */
export const locationSurveys = pgTable("location_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  locationId: varchar("location_id").references(() => locations.id),
  // Locatie details
  surveyDate: date("survey_date").notNull(),
  surveyByUserId: varchar("survey_by_user_id"),
  // Schouw checklist
  hasWifiAvailable: boolean("has_wifi_available"),
  wifiNetworkName: text("wifi_network_name"),
  wifiPasswordEncrypted: text("wifi_password_encrypted"), // AES-256 encrypted
  hasPowerOutlet: boolean("has_power_outlet"),
  powerOutletLocation: text("power_outlet_location"),
  proposedScreenCount: integer("proposed_screen_count").default(1),
  proposedScreenLocations: text("proposed_screen_locations"), // Beschrijving waar schermen komen
  wallMountPossible: boolean("wall_mount_possible"),
  ceilingMountPossible: boolean("ceiling_mount_possible"),
  standMountPossible: boolean("stand_mount_possible"),
  // Omgeving
  footTrafficEstimate: text("foot_traffic_estimate"), // laag, gemiddeld, hoog
  targetAudience: text("target_audience"),
  competingScreens: boolean("competing_screens"),
  competingScreensNotes: text("competing_screens_notes"),
  // Voorwaarden
  proposedRevenueShare: decimal("proposed_revenue_share", { precision: 5, scale: 2 }),
  installationNotes: text("installation_notes"),
  estimatedInstallationCost: decimal("estimated_installation_cost", { precision: 10, scale: 2 }),
  // Status
  status: text("status").notNull().default("concept"), // concept, afgerond, goedgekeurd, afgekeurd
  // Foto's en documenten (URLs of base64)
  photos: jsonb("photos").$type<string[]>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * DigitalSignatures - Handtekeningen voor contracten en overeenkomsten
 */
export const digitalSignatures = pgTable("digital_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentType: text("document_type").notNull(), // 'contract', 'locatie_overeenkomst', 'sepa_machtiging', 'schouw_akkoord'
  documentId: varchar("document_id").notNull(), // ID van contract, lead, etc.
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email"),
  signerRole: text("signer_role"), // 'adverteerder', 'locatie_eigenaar', 'elevizion'
  signatureData: text("signature_data"), // Base64 encoded signature image
  signedAt: timestamp("signed_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * SalesActivities - Log van alle sales activiteiten
 */
export const salesActivities = pgTable("sales_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull().references(() => leads.id),
  activityType: text("activity_type").notNull(), // call, email, meeting, schouw, voorstel, contract
  description: text("description"),
  outcome: text("outcome"),
  nextAction: text("next_action"),
  nextActionDate: date("next_action_date"),
  performedByUserId: varchar("performed_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * SurveyPhotos - Foto's gemaakt tijdens schouw
 */
export const surveyPhotos = pgTable("survey_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: varchar("survey_id").notNull().references(() => locationSurveys.id),
  storagePath: text("storage_path").notNull(),
  filename: text("filename").notNull(),
  category: text("category"), // locatie, technisch, montage, overig
  description: text("description"),
  uploadedByUserId: varchar("uploaded_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * SupplyItems - Catalogus van materialen die besteld kunnen worden
 */
export const supplyItems = pgTable("supply_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(), // tv, kabel, kabelgoot, beugel, accessoire
  description: text("description"),
  defaultPrice: decimal("default_price", { precision: 10, scale: 2 }),
  unit: text("unit").default("stuk"), // stuk, meter, set
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * SurveySupplies - Benodigde materialen per schouw
 */
export const surveySupplies = pgTable("survey_supplies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surveyId: varchar("survey_id").notNull().references(() => locationSurveys.id),
  supplyItemId: varchar("supply_item_id").references(() => supplyItems.id),
  customName: text("custom_name"), // Als supplyItemId null is
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  estimatedPrice: decimal("estimated_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Tasks - Taken die voortvloeien uit schouwen en andere processen
 */
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull(), // installatie, inkoop, administratie, contact, schouw
  priority: text("priority").notNull().default("normaal"), // laag, normaal, hoog, urgent
  status: text("status").notNull().default("open"), // open, in_progress, done, cancelled
  dueDate: date("due_date"),
  // Koppelingen
  surveyId: varchar("survey_id").references(() => locationSurveys.id),
  leadId: varchar("lead_id").references(() => leads.id),
  locationId: varchar("location_id").references(() => locations.id),
  advertiserId: varchar("advertiser_id").references(() => advertisers.id),
  contractId: varchar("contract_id").references(() => contracts.id),
  // Toewijzing
  assignedToUserId: varchar("assigned_to_user_id"),
  assignedToRole: text("assigned_to_role"), // ops, finance, admin voor role-based assignment
  createdByUserId: varchar("created_by_user_id"),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * TaskAttachments - Bijlagen bij taken (documenten, foto's)
 */
export const taskAttachments = pgTable("task_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  fileType: text("file_type"), // pdf, image, document
  uploadedByUserId: varchar("uploaded_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// INSERT SCHEMAS (for validation)
// ============================================================================

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLocationSurveySchema = createInsertSchema(locationSurveys).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDigitalSignatureSchema = createInsertSchema(digitalSignatures).omit({ id: true, createdAt: true });
export const insertSalesActivitySchema = createInsertSchema(salesActivities).omit({ id: true, createdAt: true });
export const insertSurveyPhotoSchema = createInsertSchema(surveyPhotos).omit({ id: true, createdAt: true });
export const insertSupplyItemSchema = createInsertSchema(supplyItems).omit({ id: true, createdAt: true });
export const insertSurveySupplySchema = createInsertSchema(surveySupplies).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskAttachmentSchema = createInsertSchema(taskAttachments).omit({ id: true, createdAt: true });

export const insertAdvertiserSchema = createInsertSchema(advertisers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScreenGroupSchema = createInsertSchema(screenGroups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScreenSchema = createInsertSchema(screens).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({ id: true, createdAt: true });
export const insertPackagePlanSchema = createInsertSchema(packagePlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractEventSchema = createInsertSchema(contractEvents).omit({ id: true, createdAt: true });
export const insertContractFileSchema = createInsertSchema(contractFiles).omit({ id: true, createdAt: true });
export const insertPlacementSchema = createInsertSchema(placements).omit({ id: true, createdAt: true, updatedAt: true });

// Placement update schema - for PATCH operations, only allows specific fields
export const placementUpdateSchema = insertPlacementSchema.pick({
  isActive: true,
  startDate: true,
  endDate: true,
  notes: true,
  secondsPerLoop: true,
  playsPerHour: true,
}).partial().strict();
export const insertScheduleSnapshotSchema = createInsertSchema(scheduleSnapshots).omit({ id: true, createdAt: true });
export const insertSnapshotPlacementSchema = createInsertSchema(snapshotPlacements).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertPayoutSchema = createInsertSchema(payouts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCarryOverSchema = createInsertSchema(carryOvers).omit({ id: true, createdAt: true });
export const insertIntegrationLogSchema = createInsertSchema(integrationLogs).omit({ id: true, createdAt: true });
export const insertIntegrationConfigSchema = createInsertSchema(integrationConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklists).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOnboardingTaskSchema = createInsertSchema(onboardingTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true });
export const insertReportMetricSchema = createInsertSchema(reportMetrics).omit({ id: true, createdAt: true });
export const insertIncidentSchema = createInsertSchema(incidents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCreativeSchema = createInsertSchema(creatives).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCreativeVersionSchema = createInsertSchema(creativeVersions).omit({ id: true, createdAt: true });
export const insertCreativeApprovalSchema = createInsertSchema(creativeApprovals).omit({ id: true, createdAt: true });
export const insertWebhookSchema = createInsertSchema(webhooks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({ id: true, createdAt: true });

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Advertiser = typeof advertisers.$inferSelect;
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type ScreenGroup = typeof screenGroups.$inferSelect;
export type InsertScreenGroup = z.infer<typeof insertScreenGroupSchema>;

export type Screen = typeof screens.$inferSelect;
export type InsertScreen = z.infer<typeof insertScreenSchema>;

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;

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

export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type InsertIntegrationConfig = z.infer<typeof insertIntegrationConfigSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type ContractEvent = typeof contractEvents.$inferSelect;
export type InsertContractEvent = z.infer<typeof insertContractEventSchema>;

export type ContractFile = typeof contractFiles.$inferSelect;
export type InsertContractFile = z.infer<typeof insertContractFileSchema>;

export type OnboardingChecklist = typeof onboardingChecklists.$inferSelect;
export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;

export type OnboardingTask = typeof onboardingTasks.$inferSelect;
export type InsertOnboardingTask = z.infer<typeof insertOnboardingTaskSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type ReportMetric = typeof reportMetrics.$inferSelect;
export type InsertReportMetric = z.infer<typeof insertReportMetricSchema>;

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;

export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Creative = typeof creatives.$inferSelect;
export type InsertCreative = z.infer<typeof insertCreativeSchema>;

export type CreativeVersion = typeof creativeVersions.$inferSelect;
export type InsertCreativeVersion = z.infer<typeof insertCreativeVersionSchema>;

export type CreativeApproval = typeof creativeApprovals.$inferSelect;
export type InsertCreativeApproval = z.infer<typeof insertCreativeApprovalSchema>;

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;

// ============================================================================
// TEMPLATE CENTER
// ============================================================================

/**
 * Templates - Central repository for all messaging and document templates
 * Used for WhatsApp, Email, Contracts, Invoices, etc.
 */
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(), // whatsapp, email, contract, invoice, internal
  subject: text("subject"), // For email templates
  body: text("body").notNull(),
  language: text("language").default("nl"), // nl, en
  isEnabled: boolean("is_enabled").notNull().default(true),
  version: integer("version").notNull().default(1),
  placeholders: text("placeholders").array(), // Auto-detected placeholders like {{advertiser_name}}
  // E-sign integration
  eSignTemplateId: text("e_sign_template_id"), // External e-sign provider template ID
  eSignSigningOrder: text("e_sign_signing_order").array(), // Order of signers
  eSignRequiredDocs: text("e_sign_required_docs").array(), // Required documents
  // Moneybird integration
  moneybirdStyleId: text("moneybird_style_id"), // Moneybird document style ID
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  lastEditedBy: varchar("last_edited_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * TemplateVersions - Version history for templates (keep last 5 versions)
 */
export const templateVersions = pgTable("template_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  version: integer("version").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  placeholders: text("placeholders").array(),
  editedBy: varchar("edited_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTemplateVersionSchema = createInsertSchema(templateVersions).omit({
  id: true,
  createdAt: true,
});

// Template types
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

export type TemplateVersion = typeof templateVersions.$inferSelect;
export type InsertTemplateVersion = z.infer<typeof insertTemplateVersionSchema>;

// Sales & Acquisitie types
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

export type LocationSurvey = typeof locationSurveys.$inferSelect;
export type InsertLocationSurvey = z.infer<typeof insertLocationSurveySchema>;

export type DigitalSignature = typeof digitalSignatures.$inferSelect;
export type InsertDigitalSignature = z.infer<typeof insertDigitalSignatureSchema>;

export type SalesActivity = typeof salesActivities.$inferSelect;
export type InsertSalesActivity = z.infer<typeof insertSalesActivitySchema>;

export type SurveyPhoto = typeof surveyPhotos.$inferSelect;
export type InsertSurveyPhoto = z.infer<typeof insertSurveyPhotoSchema>;

export type SupplyItem = typeof supplyItems.$inferSelect;
export type InsertSupplyItem = z.infer<typeof insertSupplyItemSchema>;

export type SurveySupply = typeof surveySupplies.$inferSelect;
export type InsertSurveySupply = z.infer<typeof insertSurveySupplySchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type InsertTaskAttachment = z.infer<typeof insertTaskAttachmentSchema>;
