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
import { pgTable, text, varchar, decimal, timestamp, integer, boolean, jsonb, date, uniqueIndex, doublePrecision } from "drizzle-orm/pg-core";
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
  // Basisgegevens
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  // Adresgegevens (losse velden voor Moneybird mapping)
  address: text("address"), // Legacy combined address field
  street: text("street"), // Straat + huisnummer
  zipcode: text("zipcode"), // Postcode
  city: text("city"), // Plaats
  country: text("country").default("NL"), // Land (default NL)
  // Identificatie & belasting
  vatNumber: text("vat_number"), // BTW-nummer
  kvkNumber: text("kvk_number"), // KvK-nummer (Kamer van Koophandel)
  customerReference: text("customer_reference"), // Externe referentie / klantnummer
  isBusiness: boolean("is_business").default(true), // Zakelijk (true) of particulier (false)
  // Extra contactgegevens (Moneybird)
  website: text("website"), // Website URL
  invoiceEmail: text("invoice_email"), // Factuur e-mail (als anders dan email)
  attention: text("attention"), // T.a.v. (ter attentie van)
  tags: text("tags"), // Labels (comma-separated, max 5)
  // Facturatie instellingen
  invoiceDeliveryMethod: text("invoice_delivery_method").default("email"), // email | post | portal
  language: text("language").default("nl"), // nl | en
  paymentTermDays: integer("payment_term_days").default(14), // Betaaltermijn in dagen (0-90)
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }), // Kortingspercentage (0-100)
  // SEPA Automatisch Incasso velden
  iban: text("iban"), // IBAN rekeningnummer voor incasso
  ibanAccountHolder: text("iban_account_holder"), // Tenaamstelling rekening
  sepaBic: text("sepa_bic"), // BIC code (optioneel, niet vereist voor NL)
  sepaMandate: boolean("sepa_mandate").default(false), // Heeft machtiging getekend
  sepaMandateReference: text("sepa_mandate_reference"), // Mandaat kenmerk (bijv. EVZ-{YYYYMMDD}-{random4})
  sepaMandateDate: date("sepa_mandate_date"), // Datum ondertekening machtiging
  // Moneybird integratie (SSOT pattern)
  moneybirdContactId: text("moneybird_contact_id"), // Synced from Moneybird
  moneybirdContactSnapshot: jsonb("moneybird_contact_snapshot"), // Cached Moneybird contact data for fast UI loading
  moneybirdSyncStatus: text("moneybird_sync_status").default("not_linked"), // not_linked | pending | synced | failed
  moneybirdSyncError: text("moneybird_sync_error"), // Laatste sync foutmelding
  moneybirdLastSyncAt: timestamp("moneybird_last_sync_at"),
  // Status & meta
  status: text("status").notNull().default("active"), // active, paused, churned
  onboardingStatus: text("onboarding_status").default("invited"), // INVITED | DETAILS_SUBMITTED | PACKAGE_SELECTED | CONTRACT_PENDING_OTP | CONTRACT_ACCEPTED | READY_FOR_ASSET | ASSET_RECEIVED | LIVE
  source: text("source"), // Face-to-face, Telefoon, Website, etc
  notes: text("notes"), // Interne notities (max 500 chars)
  // LinkKey voor Yodeck matching (ADV-BEDRIJFSNAAM-ABC123)
  linkKey: text("link_key").unique(), // Unieke key voor asset matching
  linkKeyGeneratedAt: timestamp("link_key_generated_at"),
  // Pakket selectie
  packageType: text("package_type"), // SINGLE | TRIPLE | TEN | CUSTOM
  screensIncluded: integer("screens_included"), // Aantal schermen in pakket
  packagePrice: decimal("package_price", { precision: 10, scale: 2 }), // Maandelijkse prijs
  packageNotes: text("package_notes"), // Toelichting bij CUSTOM pakket
  // Asset/video status
  assetStatus: text("asset_status").default("none"), // none | uploaded_invalid | uploaded_valid | ready_for_yodeck | publish_failed | live
  // Publish failure tracking (non-destructive - asset blijft zichtbaar bij failures)
  publishErrorCode: text("publish_error_code"), // Error code from failed Yodeck upload
  publishErrorMessage: text("publish_error_message"), // Human-readable error message
  publishFailedAt: timestamp("publish_failed_at"), // When publish last failed
  publishRetryCount: integer("publish_retry_count").default(0), // Number of retry attempts
  // Upload portal state - enables repeated access after onboarding reaches upload step
  uploadEnabled: boolean("upload_enabled").default(false), // true when advertiser can access upload portal
  lastUploadTokenGeneratedAt: timestamp("last_upload_token_generated_at"), // When last upload token was created
  // Video specification (contract-driven)
  videoDurationSeconds: integer("video_duration_seconds").default(15), // Required video length (default 15s, can be custom per contract)
  strictResolution: boolean("strict_resolution").default(false), // If true, resolution/aspect ratio mismatches are errors instead of warnings
  // === PLACEMENT TARGETING FIELDS ===
  targetRegionCodes: text("target_region_codes").array(), // Target regions (e.g., ['NB', 'ZH']) or null/empty for ANY
  targetCities: text("target_cities"), // Comma-separated target cities (e.g., "Amsterdam, Rotterdam") or null for ANY
  category: text("category"), // Advertiser category for location matching (horeca, retail, sport, etc.)
  businessCategory: text("business_category"), // Business type (barber, gym, horeca, etc.) - also used as default competitorGroup
  competitorGroup: text("competitor_group"), // Explicit competitor group (default = businessCategory, admin can override)
  desiredImpressionsPerWeek: integer("desired_impressions_per_week"), // Optional target impressions
  // Onboarding akkoord (OTP-based)
  acceptedTermsAt: timestamp("accepted_terms_at"), // Wanneer akkoord gegeven
  acceptedTermsIp: text("accepted_terms_ip"), // IP adres bij akkoord
  acceptedTermsUserAgent: text("accepted_terms_user_agent"), // Browser info bij akkoord
  acceptedTermsVersion: text("accepted_terms_version"), // Versie AV/Privacy
  acceptedTermsPdfUrl: text("accepted_terms_pdf_url"), // Opgeslagen PDF akkoordverklaring
  // Bundled contract PDF (AV + Overeenkomst + SEPA)
  bundledPdfUrl: text("bundled_pdf_url"), // URL to bundled contract PDF
  bundledPdfGeneratedAt: timestamp("bundled_pdf_generated_at"), // When bundle was generated
  // Email tracking timestamps (idempotency)
  inviteEmailSentAt: timestamp("invite_email_sent_at"), // When portal invite was sent
  confirmationEmailSentAt: timestamp("confirmation_email_sent_at"), // When submission confirmation was sent
  whatnowEmailSentAt: timestamp("whatnow_email_sent_at"), // When "what now" email was sent
  // Canonical Yodeck media (deduplicated, single source of truth)
  yodeckMediaIdCanonical: integer("yodeck_media_id_canonical"), // The ONE usable Yodeck media ID
  yodeckMediaIdCanonicalUpdatedAt: timestamp("yodeck_media_id_canonical_updated_at"),
  planId: varchar("plan_id").references(() => plans.id),
  onboardingComplete: boolean("onboarding_complete").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// PORTAL: Plans, Accounts, Portal Placements
// ============================================================================

export const PORTAL_PLACEMENT_STATUS = {
  SELECTED: "selected",
  QUEUED: "queued",
  LIVE: "live",
  PAUSED: "paused",
  REMOVED: "removed",
} as const;
export type PortalPlacementStatus = typeof PORTAL_PLACEMENT_STATUS[keyof typeof PORTAL_PLACEMENT_STATUS];

export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  maxScreens: integer("max_screens").notNull(),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  minCommitMonths: integer("min_commit_months").notNull().default(3),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const advertiserAccounts = pgTable("advertiser_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().unique().references(() => advertisers.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const portalUsers = pgTable("portal_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
  verifyTokenHash: text("verify_token_hash"),
  verifyTokenExpiresAt: timestamp("verify_token_expires_at"),
  changeEmailTokenHash: text("change_email_token_hash"),
  changeEmailTokenExpiresAt: timestamp("change_email_token_expires_at"),
  pendingEmail: text("pending_email"),
  companyName: text("company_name"),
  contactName: text("contact_name"),
  phone: text("phone"),
  kvk: text("kvk"),
  vat: text("vat"),
  address: text("address"),
  planCode: text("plan_code"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  advertiserId: varchar("advertiser_id").references(() => advertisers.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const portalUserScreenSelections = pgTable("portal_user_screen_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portalUserId: varchar("portal_user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("portal_user_screen_idx").on(table.portalUserId, table.screenId),
]);

export const portalPlacements = pgTable("portal_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("selected"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  liveAt: timestamp("live_at"),
  pausedAt: timestamp("paused_at"),
  removedAt: timestamp("removed_at"),
  lastReason: text("last_reason"),
}, (table) => [
  uniqueIndex("portal_placements_advertiser_screen_idx").on(table.advertiserId, table.screenId),
]);

/**
 * Portal Tokens - Secure tokens for advertiser self-service portal
 * Used for sending "complete your profile" links to advertisers
 */
export const portalTokens = pgTable("portal_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(), // SHA256 hash of the token for validation
  tokenCiphertext: text("token_ciphertext"), // Encrypted raw token for reuse (admin/TEST_MODE)
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"), // When the token was used (null = unused)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Ad Assets - Uploaded video files from advertisers
 * Stores metadata and validation results for uploaded advertisement videos
 */
export const adAssets = pgTable("ad_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  linkKey: text("link_key").notNull(), // Copy of advertiser's linkKey at upload time
  // File information
  originalFileName: text("original_file_name").notNull(), // User's original filename
  storedFilename: text("stored_filename"), // Canonical filename (e.g., ADV-BEDRIJFSNAAM-123456.mp4)
  mimeType: text("mime_type").notNull(), // video/mp4, video/quicktime, etc.
  sizeBytes: integer("size_bytes").notNull(),
  storageUrl: text("storage_url"), // URL in object storage
  storagePath: text("storage_path"), // Path in storage bucket
  // Video metadata (from ffprobe - original upload)
  durationSeconds: decimal("duration_seconds", { precision: 10, scale: 2 }), // Detected duration
  width: integer("width"), // Video width in pixels
  height: integer("height"), // Video height in pixels
  aspectRatio: text("aspect_ratio"), // Detected aspect ratio (e.g., "16:9")
  codec: text("codec"), // Video codec (e.g., "h264", "hevc")
  pixelFormat: text("pixel_format"), // Pixel format (e.g., "yuv420p", "yuv422p")
  // Conversion workflow (auto-transcode to H.264 if needed)
  // Status: NONE (no conversion needed) | PENDING | CONVERTING | COMPLETED | FAILED
  conversionStatus: text("conversion_status").notNull().default("NONE"),
  conversionStartedAt: timestamp("conversion_started_at"),
  conversionCompletedAt: timestamp("conversion_completed_at"),
  conversionError: text("conversion_error"), // Error message if conversion failed
  // Converted file info (if conversion was needed)
  convertedStoragePath: text("converted_storage_path"),
  convertedStorageUrl: text("converted_storage_url"),
  convertedCodec: text("converted_codec"), // Always "h264" after conversion
  convertedPixelFormat: text("converted_pixel_format"), // Always "yuv420p" after conversion
  convertedWidth: integer("converted_width"),
  convertedHeight: integer("converted_height"),
  convertedSizeBytes: integer("converted_size_bytes"),
  // Validation
  validationStatus: text("validation_status").notNull().default("pending"), // pending | valid | invalid
  validationErrors: jsonb("validation_errors").$type<string[]>().default([]), // List of hard errors
  validationWarnings: jsonb("validation_warnings").$type<string[]>().default([]), // List of soft warnings
  requiredDurationSeconds: integer("required_duration_seconds").notNull().default(15), // Expected duration from contract
  // Admin review & approval workflow
  // Status flow: UPLOADED → IN_REVIEW → APPROVED/REJECTED → PUBLISHED
  approvalStatus: text("approval_status").notNull().default("UPLOADED"), // UPLOADED | IN_REVIEW | APPROVED | REJECTED | PUBLISHED
  reviewedByAdminAt: timestamp("reviewed_by_admin_at"),
  reviewedByAdminId: varchar("reviewed_by_admin_id"),
  adminNotes: text("admin_notes"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by"), // Admin user ID who approved
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by"), // Admin user ID who rejected
  rejectedReason: text("rejected_reason"), // Reason category: quality | duration | content | other
  rejectedDetails: text("rejected_details"), // Optional detailed rejection notes
  // Publish workflow - tracks Yodeck publish attempts (non-destructive on failure)
  publishStatus: text("publish_status").default("PENDING"), // PENDING | PUBLISHED | PUBLISH_FAILED
  publishError: text("publish_error"), // Error message from last failed publish attempt
  publishAttempts: integer("publish_attempts").default(0), // Number of publish attempts
  lastPublishAttemptAt: timestamp("last_publish_attempt_at"), // When last publish was attempted
  // Yodeck integration - tracks when video is uploaded to Yodeck
  yodeckMediaId: integer("yodeck_media_id"), // Yodeck media ID after upload (null until uploaded)
  yodeckUploadedAt: timestamp("yodeck_uploaded_at"), // When uploaded to Yodeck
  // Yodeck-safe media pipeline status
  // Status flow: PENDING → VALIDATING → READY_FOR_YODECK (if compatible) or NEEDS_NORMALIZATION → NORMALIZING → READY_FOR_YODECK
  yodeckReadinessStatus: text("yodeck_readiness_status").notNull().default("PENDING"), // PENDING | VALIDATING | NEEDS_NORMALIZATION | NORMALIZING | READY_FOR_YODECK | REJECTED
  yodeckRejectReason: text("yodeck_reject_reason"), // Human-readable rejection reason
  yodeckMetadataJson: jsonb("yodeck_metadata_json").$type<{
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    pixelFormat?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    bitrate?: number;
    hasVideoStream?: boolean;
    hasAudioStream?: boolean;
    moovAtStart?: boolean;
    isYodeckCompatible?: boolean;
    compatibilityReasons?: string[];
    // Forensic diagnostics
    fileSizeBytes?: number;
    firstBytesHex?: string;
    detectedMime?: string;
    isMp4Container?: boolean;
    videoStreamCount?: number;
    audioStreamCount?: number;
    reasonCode?: string; // NO_FILE | EMPTY_FILE | NOT_MP4 | NO_VIDEO_STREAM | FFPROBE_FAILED | CORRUPT_CONTAINER
    ffprobeError?: string;
    sha256?: string;
  }>(), // Raw metadata from validation
  normalizationProvider: text("normalization_provider"), // cloudconvert | ffmpeg_wasm | none
  normalizationStartedAt: timestamp("normalization_started_at"),
  normalizationCompletedAt: timestamp("normalization_completed_at"),
  normalizationError: text("normalization_error"),
  normalizedStoragePath: text("normalized_storage_path"), // Path to normalized file
  normalizedStorageUrl: text("normalized_storage_url"), // URL to normalized file
  isSuperseded: boolean("is_superseded").notNull().default(false), // True if replaced by newer upload
  supersededById: varchar("superseded_by_id"), // ID of the asset that replaced this one
  // Timestamps
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Waitlist Requests - Capacity waitlist for advertisers when no placement slots available
 * Tracks waiting advertisers and sends claim invites when capacity becomes available
 */
export const waitlistRequests = pgTable("waitlist_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  kvkNumber: text("kvk_number"),
  vatNumber: text("vat_number"),
  packageType: text("package_type").notNull(), // SINGLE | TRIPLE | TEN | CUSTOM
  businessCategory: text("business_category").notNull(),
  competitorGroup: text("competitor_group"), // Default = businessCategory
  targetRegionCodes: text("target_region_codes").array(), // Target regions
  requiredCount: integer("required_count").notNull(), // 1/3/10 based on package
  status: text("status").notNull().default("WAITING"), // WAITING | INVITED | CLAIMED | EXPIRED | CANCELLED
  lastCheckedAt: timestamp("last_checked_at"),
  inviteTokenHash: text("invite_token_hash"), // SHA256 hash of claim token
  inviteSentAt: timestamp("invite_sent_at"),
  inviteExpiresAt: timestamp("invite_expires_at"),
  claimedAt: timestamp("claimed_at"),
  cancelledAt: timestamp("cancelled_at"),
  advertiserId: varchar("advertiser_id"), // Set after claim -> advertiser creation
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWaitlistRequestSchema = createInsertSchema(waitlistRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWaitlistRequest = z.infer<typeof insertWaitlistRequestSchema>;
export type WaitlistRequest = typeof waitlistRequests.$inferSelect;

/**
 * Claim Prefill Records - Server-side prefill data for cross-device claim flow
 * Created when claim is confirmed, consumed when advertiser loads /start with prefill param
 */
export const claimPrefills = pgTable("claim_prefills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  waitlistRequestId: varchar("waitlist_request_id").notNull().references(() => waitlistRequests.id, { onDelete: "cascade" }),
  formData: text("form_data").notNull(), // JSON stringified form data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // 60 minutes from creation
  usedAt: timestamp("used_at"), // Marked when prefill is consumed
});

export const insertClaimPrefillSchema = createInsertSchema(claimPrefills).omit({
  id: true,
  createdAt: true,
});
export type InsertClaimPrefill = z.infer<typeof insertClaimPrefillSchema>;
export type ClaimPrefill = typeof claimPrefills.$inferSelect;

/**
 * ReportLogs - Track monthly reports sent to advertisers
 * Used for idempotency: only send one report per advertiser per month
 */
export const reportLogs = pgTable("report_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  periodKey: text("period_key").notNull(), // YYYY-MM format
  liveLocationsCount: integer("live_locations_count").notNull().default(0),
  estimatedVisitors: integer("estimated_visitors").default(0),
  estimatedImpressions: integer("estimated_impressions").default(0),
  regionsLabel: text("regions_label"),
  status: text("status").notNull().default("pending"), // pending, sent, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
});

export const insertReportLogSchema = createInsertSchema(reportLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertReportLog = z.infer<typeof insertReportLogSchema>;
export type ReportLog = typeof reportLogs.$inferSelect;

/**
 * SystemSettings - Configurable operational settings
 * Used for thresholds, factors, and other admin-configurable values
 */
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // Setting key (e.g., "reportWeeksPerMonth")
  value: text("value").notNull(), // Setting value (stored as string, parsed by consumers)
  description: text("description"), // Human-readable description
  category: text("category").default("general"), // Category for grouping in UI
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"), // Who last updated this setting
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Default system settings for reporting
export const DEFAULT_SYSTEM_SETTINGS = {
  reportWeeksPerMonth: 4.33,
  reportViewFactor: 2.5,
  maxVisitorsPerWeek: 50000,
} as const;

/**
 * Locations - Partner businesses that host screens
 * These earn revenue share based on screen time at their location
 * isPlaceholder: true means this was auto-created from Yodeck import and needs Moneybird linking
 * source: where this location came from (manual, yodeck, onboarding)
 */
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationCode: text("location_code").unique(), // EVZ-LOC-001 format - central identifier
  locationKey: text("location_key").unique(), // LOC-COMPANYNAME-RANDOM6 for Yodeck matching
  name: text("name").notNull(),
  address: text("address"), // Made nullable for placeholder locations
  street: text("street"),
  houseNumber: text("house_number"),
  zipcode: text("zipcode"),
  city: text("city"), // Plaats - used for filtering screens
  country: text("country").default("Nederland"),
  locationType: text("location_type"), // Type locatie (sportschool, cafe, etc.)
  contactName: text("contact_name"), // Made nullable for placeholder locations
  email: text("email"), // Made nullable for placeholder locations
  phone: text("phone"),
  visitorsPerWeek: integer("visitors_per_week"), // Gemiddeld aantal bezoekers per week - REQUIRED voor allocatie
  openingHours: text("opening_hours"), // Openingstijden (optioneel)
  branche: text("branche"), // Branche/type zaak
  // Payout configuratie
  payoutType: text("payout_type").notNull().default("revshare"), // revshare | fixed
  revenueSharePercent: decimal("revenue_share_percent", { precision: 5, scale: 2 }).notNull().default("10.00"),
  fixedPayoutAmount: decimal("fixed_payout_amount", { precision: 10, scale: 2 }), // Alleen bij payoutType=fixed
  minimumPayoutAmount: decimal("minimum_payout_amount", { precision: 10, scale: 2 }).notNull().default("25.00"),
  bankAccountIban: text("bank_account_iban"),
  bankAccountName: text("bank_account_name"), // Tenaamstelling rekening
  moneybirdContactId: text("moneybird_contact_id"), // Link to Moneybird contact (NOT unique - same contact can link to multiple locations)
  // Moneybird sync status (SSOT pattern)
  moneybirdSyncStatus: text("moneybird_sync_status").default("not_linked"), // not_linked | pending | synced | failed
  moneybirdSyncError: text("moneybird_sync_error"),
  moneybirdLastSyncAt: timestamp("moneybird_last_sync_at"),
  // PI / Yodeck installation status
  piStatus: text("pi_status").default("not_installed"), // not_installed | installed
  yodeckDeviceId: text("yodeck_device_id"), // Linked Yodeck device ID
  yodeckStatus: text("yodeck_status").default("not_linked"), // not_linked | linked
  isPlaceholder: boolean("is_placeholder").default(false), // Auto-created from Yodeck, needs Moneybird linking
  source: text("source").default("manual"), // manual, yodeck, onboarding
  status: text("status").notNull().default("pending_details"), // pending_details | pending_pi | ready_for_pi | active | paused | terminated
  readyForAds: boolean("ready_for_ads").notNull().default(false), // Only true when location is fully set up and can accept ads
  pausedByAdmin: boolean("paused_by_admin").notNull().default(false), // If true, auto-live will NOT enable readyForAds (manual pause)
  // Onboarding status - 2-phase flow
  onboardingStatus: text("onboarding_status").default("draft"), // INVITED_INTAKE | INTAKE_SUBMITTED | PENDING_REVIEW | APPROVED_AWAITING_CONTRACT | CONTRACT_PENDING_OTP | CONTRACT_ACCEPTED | READY_FOR_INSTALL | ACTIVE | REJECTED
  // Intake token (Phase A)
  intakeToken: text("intake_token").unique(), // Crypto-secure token for intake form
  intakeTokenExpiresAt: timestamp("intake_token_expires_at"),
  intakeTokenUsedAt: timestamp("intake_token_used_at"),
  // Contract token (Phase B)
  contractToken: text("contract_token").unique(), // Crypto-secure token for contract form (only after approval)
  contractTokenExpiresAt: timestamp("contract_token_expires_at"),
  contractTokenUsedAt: timestamp("contract_token_used_at"),
  // Review audit fields
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"), // Admin user who reviewed
  reviewDecision: text("review_decision"), // APPROVED | REJECTED
  // Contract acceptance audit trail
  acceptedTermsAt: timestamp("accepted_terms_at"),
  acceptedTermsIp: text("accepted_terms_ip"),
  acceptedTermsUserAgent: text("accepted_terms_user_agent"),
  acceptedTermsVersion: text("accepted_terms_version"),
  acceptedTermsPdfUrl: text("accepted_terms_pdf_url"),
  // Bundled contract PDF (AV + Overeenkomst)
  bundledPdfUrl: text("bundled_pdf_url"), // URL to bundled contract PDF
  bundledPdfGeneratedAt: timestamp("bundled_pdf_generated_at"), // When bundle was generated
  contractInstanceId: text("contract_instance_id"), // Reference to contract document
  // Email tracking
  inviteEmailSentAt: timestamp("invite_email_sent_at"),
  intakeConfirmationSentAt: timestamp("intake_confirmation_sent_at"),
  contractEmailSentAt: timestamp("contract_email_sent_at"),
  completionEmailSentAt: timestamp("completion_email_sent_at"),
  reminderEmailSentAt: timestamp("reminder_email_sent_at"),
  lastReminderSentAt: timestamp("last_reminder_sent_at"), // Voor herinnering tracking
  notes: text("notes"),
  // === PLACEMENT ENGINE FIELDS ===
  regionCode: text("region_code"), // Province/region code for targeting (e.g., NB, ZH, NH)
  categoriesAllowed: text("categories_allowed").array(), // Allowed advertiser categories (horeca, retail, sport, etc.)
  audienceCategory: text("audience_category"), // Primary audience type at this location
  avgVisitorsPerWeek: integer("avg_visitors_per_week"), // Estimated weekly visitors for impression calculation
  adSlotCapacitySecondsPerLoop: integer("ad_slot_capacity_seconds_per_loop").default(120), // Max seconds of ads per loop
  currentAdLoadSeconds: integer("current_ad_load_seconds").default(0), // Current ad load in seconds
  loopDurationSeconds: integer("loop_duration_seconds").default(300), // Total loop duration (5 min default)
  exclusivityMode: text("exclusivity_mode").notNull().default("STRICT"), // STRICT = max 1 per competitorGroup, RELAXED = max 2
  yodeckPlaylistId: text("yodeck_playlist_id"), // DEPRECATED: Ad playlist for this location
  // Layout configuration for baseline + ads separation (DEPRECATED - use combined playlist)
  yodeckLayoutId: text("yodeck_layout_id"), // DEPRECATED: Yodeck layout ID for this screen
  yodeckBaselinePlaylistId: text("yodeck_baseline_playlist_id"), // DEPRECATED: Baseline playlist (news/weather/placeholder)
  layoutMode: text("layout_mode").notNull().default("FALLBACK_SCHEDULE"), // DEPRECATED: LAYOUT | FALLBACK_SCHEDULE
  // NEW: Combined playlist architecture - single playlist per location with base + ads
  combinedPlaylistId: text("combined_playlist_id"), // Yodeck playlist ID: "Elevizion | Loop | {LocationName}"
  combinedPlaylistVerifiedAt: timestamp("combined_playlist_verified_at"), // Last sync time
  combinedPlaylistItemCount: integer("combined_playlist_item_count").default(0), // Items in playlist
  // Tag-based playlist configuration (DEPRECATED)
  playlistMode: text("playlist_mode").notNull().default("TAG_BASED"), // TAG_BASED | CLASSIC
  playlistTag: text("playlist_tag"), // e.g., "elevizion:location:{locationId}"
  yodeckPlaylistVerifiedAt: timestamp("yodeck_playlist_verified_at"), // Last verification time
  yodeckPlaylistVerifyStatus: text("yodeck_playlist_verify_status"), // OK | MISSING | MISCONFIGURED | UNKNOWN
  lastYodeckVerifyError: text("last_yodeck_verify_error"), // Last verification error message
  lastSyncAt: timestamp("last_sync_at"), // Last Yodeck sync time
  // Reporting review flag - set when visitor data exceeds configured limits
  needsReview: boolean("needs_review").default(false), // True if visitorData needs manual review
  needsReviewReason: text("needs_review_reason"), // Reason for review (e.g., "bezoekersaantal overschrijdt limiet")
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Location Tokens - Secure tokens for location onboarding portal
 * Used for sending "complete your location details" links to location contacts
 */
export const locationTokens = pgTable("location_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(), // SHA256 hash of the token
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"), // When the token was used (null = unused)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Location Onboarding Events - Audit log for location onboarding actions
 */
export const locationOnboardingEvents = pgTable("location_onboarding_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // created | invite_sent | reminder_sent | details_submitted | pi_installed | yodeck_linked | completed
  eventData: jsonb("event_data"), // Additional data for the event
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

// ============================================================================
// SITES - UNIFIED ENTITY (1 site = 1 screen in 99% of cases)
// ============================================================================

/**
 * Sites - The central entity combining screen + location + business info
 * 
 * BUSINESS RULE: 1 Site = 1 physical screen location
 * - multiScreen=false (default): yodeck_screen_id AND moneybird_contact_id are unique per site
 * - multiScreen=true: multiple sites can share same moneybird_contact_id (rare edge case)
 * 
 * Data comes from:
 * - Moneybird: company name, contact, address (SOURCE OF TRUTH for customer data)
 * - Yodeck: device status, online/offline, content (SOURCE OF TRUTH for device data)
 */
export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // EVZ-001 format - central identifier
  displayName: text("display_name").notNull(), // UI display name (from Moneybird company or manual)
  moneybirdContactId: text("moneybird_contact_id"), // Link to Moneybird contact
  yodeckScreenId: text("yodeck_screen_id").unique(), // Link to Yodeck screen (always unique)
  yodeckTags: text("yodeck_tags").array(), // Tags for Yodeck matching (EVZ-SCREEN_ID:EVZ-001)
  multiScreen: boolean("multi_screen").default(false), // If true, allows shared moneybird_contact_id
  status: text("status").notNull().default("active"), // active, offline, paused, terminated
  syncStatus: text("sync_status").default("OK"), // OK, NEEDS_ACTION, ERROR
  syncError: text("sync_error"), // Short error message if sync failed
  lastSyncAt: timestamp("last_sync_at"), // Last successful sync
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * SiteContactSnapshot - Cached Moneybird contact data per site
 * Updated during reconcileSites() from moneybird_contacts_cache
 */
export const siteContactSnapshot = pgTable("site_contact_snapshot", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  companyName: text("company_name"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address1: text("address1"),
  address2: text("address2"),
  postcode: text("postcode"),
  city: text("city"),
  country: text("country"),
  vatNumber: text("vat_number"),
  kvkNumber: text("kvk_number"),
  rawMoneybird: jsonb("raw_moneybird"), // Full Moneybird contact data
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

/**
 * SiteYodeckSnapshot - Cached Yodeck screen data per site
 * Updated during reconcileSites() from yodeck_screens_cache
 */
export const siteYodeckSnapshot = pgTable("site_yodeck_snapshot", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  screenName: text("screen_name"),
  status: text("status"), // online, offline, unknown
  lastSeen: timestamp("last_seen"),
  screenshotUrl: text("screenshot_url"),
  contentStatus: text("content_status"), // empty, has_content, unknown
  contentCount: integer("content_count"),
  rawYodeck: jsonb("raw_yodeck"), // Full Yodeck player data
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

/**
 * MoneybirdContactsCache - Synced Moneybird contacts for linking
 * Filled by syncMoneybirdContacts(), used for UI search/select
 */
export const moneybirdContactsCache = pgTable("moneybird_contacts_cache", {
  moneybirdContactId: text("moneybird_contact_id").primaryKey(),
  companyName: text("company_name"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: jsonb("address"), // { street, postcode, city, country }
  raw: jsonb("raw"), // Full Moneybird API response
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * YodeckScreensCache - Synced Yodeck screens for linking
 * Filled by syncYodeckScreens(), used for UI search/select
 */
export const yodeckScreensCache = pgTable("yodeck_screens_cache", {
  yodeckScreenId: text("yodeck_screen_id").primaryKey(),
  name: text("name"),
  uuid: text("uuid"),
  status: text("status"), // online, offline, unknown
  lastSeen: timestamp("last_seen"),
  screenshotUrl: text("screenshot_url"),
  raw: jsonb("raw"), // Full Yodeck API response
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * ContactRoles - Track Moneybird contact roles (SITE_OWNER, ADVERTISER)
 * A single Moneybird contact can have multiple roles
 */
export const contactRoles = pgTable("contact_roles", {
  moneybirdContactId: text("moneybird_contact_id").notNull(),
  role: text("role").notNull(), // SITE_OWNER, ADVERTISER
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("contact_roles_pk").on(table.moneybirdContactId, table.role),
]);

// ============================================================================
// ENTITIES - UNIFIED MODEL FOR ADVERTISER + SCREEN
// ============================================================================

/**
 * Entities - Central table for both Advertisers and Screens
 * 
 * BUSINESS RULE: 1 Screen = 1 Location (95% of cases)
 * - entity_type="ADVERTISER": companies that buy advertising space
 * - entity_type="SCREEN": physical screen locations (each has its own Moneybird contact)
 * 
 * Each entity has exactly 1 Moneybird contact (never match on name, always by ID).
 * Yodeck devices are linked via tags containing the entity_code.
 */
export const entities = pgTable("entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // ADVERTISER, SCREEN
  entityCode: text("entity_code").notNull().unique(), // EVZ-ADV-0001 or EVZ-001
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("PENDING"), // ACTIVE, PENDING, ERROR
  moneybirdContactId: text("moneybird_contact_id").unique(), // Exactly 1 Moneybird contact per entity
  yodeckDeviceId: text("yodeck_device_id").unique(), // Linked Yodeck device (for screens only)
  tags: jsonb("tags").default([]), // Array of strings for Yodeck tag matching
  contactData: jsonb("contact_data"), // All contact info: company, address, kvk, btw, email, phone, etc.
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * SyncJobs - Track all sync operations with external services
 * Used for logging, debugging, and retry functionality
 */
export const syncJobs = pgTable("sync_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").references(() => entities.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // MONEYBIRD, YODECK
  action: text("action").notNull(), // CREATE_CONTACT, UPDATE_CONTACT, LINK_DEVICE, SYNC_STATUS
  status: text("status").notNull().default("PENDING"), // PENDING, RUNNING, SUCCESS, FAILED
  errorMessage: text("error_message"),
  payload: jsonb("payload"), // Request/response data for debugging
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

/**
 * LocationGroups - For rare multi-screen locations (2+ screens at same physical location)
 * Only used when isMultiScreenLocation=true on screens
 */
export const locationGroups = pgTable("location_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Basil's - 2 schermen"
  moneybirdContactId: text("moneybird_contact_id"), // Shared Moneybird contact for the group
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Screens - Digital signage displays (SchermLocatie = primary entity)
 * 
 * BUSINESS RULE: 99% of the time, 1 screen = 1 location
 * - Each screen has its own Moneybird link (no auto-grouping by shared contact)
 * - locationId is now OPTIONAL (legacy, kept for backward compatibility)
 * - isMultiScreenLocation + locationGroupId for rare multi-screen locations
 * 
 * DATA SOURCES:
 * - Moneybird: company name, contact, email, phone, address (master for customer data)
 * - Yodeck: device ID, online/offline, last_seen, content (master for device data)
 * 
 * DISPLAY NAME PRIORITY: Moneybird company > Yodeck device name > screenId fallback
 */
export const screens = pgTable("screens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenId: text("screen_id").notNull().unique(), // EVZ-001 format - MANDATORY
  locationId: varchar("location_id").references(() => locations.id), // OPTIONAL - legacy, for backward compat
  groupId: varchar("group_id").references(() => screenGroups.id), // For bulk operations
  locationGroupId: varchar("location_group_id").references(() => locationGroups.id), // For multi-screen locations
  isMultiScreenLocation: boolean("is_multi_screen_location").default(false), // Only true for rare 2+ screens at same location
  name: text("name").notNull(),
  // === YODECK FIELDS (source: Yodeck API) ===
  yodeckPlayerId: text("yodeck_player_id"), // Linked Yodeck player ID (numeric ID as string)
  yodeckPlayerName: text("yodeck_player_name"), // Device name from Yodeck
  yodeckUuid: text("yodeck_uuid").unique(), // Yodeck UUID for upsert matching
  yodeckWorkspaceName: text("yodeck_workspace_name"),
  yodeckScreenshotUrl: text("yodeck_screenshot_url"),
  // Yodeck content tracking - what's playing on the screen
  yodeckContentStatus: text("yodeck_content_status").default("unknown"), // unknown, empty, has_content, likely_has_content, error
  yodeckContentCount: integer("yodeck_content_count"), // Number of items/playlists assigned (0 = empty, >0 = has content)
  yodeckContentSummary: jsonb("yodeck_content_summary"), // { playlists:[], items:[], topItems:[], lastFetchedAt }
  yodeckContentLastFetchedAt: timestamp("yodeck_content_last_fetched_at"),
  yodeckContentError: text("yodeck_content_error"), // Error message if content sync failed
  // Screenshot fallback for content detection
  yodeckScreenshotLastOkAt: timestamp("yodeck_screenshot_last_ok_at"), // Last time screenshot was valid
  yodeckScreenshotByteSize: integer("yodeck_screenshot_byte_size"), // Screenshot size (>5KB suggests content)
  yodeckScreenshotHash: text("yodeck_screenshot_hash"), // Perceptual hash for content matching
  resolution: text("resolution"), // e.g., "1920x1080"
  orientation: text("orientation").default("landscape"), // landscape, portrait
  status: text("status").notNull().default("unknown"), // online, offline, unknown
  lastSeenAt: timestamp("last_seen_at"),
  isActive: boolean("is_active").notNull().default(true),
  matchConfidence: text("match_confidence"), // auto_exact, auto_fuzzy, manual, null=unmapped
  matchReason: text("match_reason"), // Explanation of match (e.g., "Exact name match: Basil's Barber Shop")
  // === MONEYBIRD FIELDS (source: Moneybird API) ===
  moneybirdContactId: text("moneybird_contact_id"), // Direct link to Moneybird contact (per-screen, no auto-grouping!)
  moneybirdContactSnapshot: jsonb("moneybird_contact_snapshot"), // Cached: { company, firstname, lastname, email, phone, address, city, kvk, btw, syncedAt }
  moneybirdSyncStatus: text("moneybird_sync_status").default("not_linked"), // not_linked | pending | synced | failed
  moneybirdSyncError: text("moneybird_sync_error"),
  moneybirdLastSyncAt: timestamp("moneybird_last_sync_at"),
  // === YODECK SYNC STATUS (SSOT pattern) ===
  yodeckSyncStatus: text("yodeck_sync_status").default("not_linked"), // not_linked | pending | synced | failed
  yodeckSyncError: text("yodeck_sync_error"),
  yodeckLastSyncAt: timestamp("yodeck_last_sync_at"),
  // === ONBOARDING STATUS ===
  onboardingStatus: text("onboarding_status").default("draft"), // draft | invited | in_progress | completed
  // === PLAYLIST-ONLY ARCHITECTURE (CANONICAL) ===
  // Three-playlist model per screen: baseline + ads = combined
  baselinePlaylistId: text("baseline_playlist_id"), // Yodeck playlist ID for baseline content (news/weather/house ads)
  baselinePlaylistName: text("baseline_playlist_name"), // Cached name
  adsPlaylistId: text("ads_playlist_id"), // Yodeck playlist ID for approved advertiser videos
  adsPlaylistName: text("ads_playlist_name"), // Cached name
  combinedPlaylistId: text("combined_playlist_id"), // Yodeck playlist ID = baseline + ads (assigned to screen)
  combinedPlaylistName: text("combined_playlist_name"), // Cached name
  playbackMode: text("playback_mode").default("PLAYLIST_ONLY"), // PLAYLIST_ONLY (only mode allowed)
  // Legacy field for backward compatibility (maps to combinedPlaylistId)
  playlistId: text("playlist_id"), // DEPRECATED: use combinedPlaylistId
  playlistName: text("playlist_name"), // DEPRECATED: use combinedPlaylistName
  // Push tracking
  lastPushAt: timestamp("last_push_at"), // When playlist was last pushed to screen
  lastPushResult: text("last_push_result"), // ok | failed | pending
  lastPushError: text("last_push_error"), // Error message if push failed
  // Verification tracking
  lastVerifyAt: timestamp("last_verify_at"), // When screen source was last verified
  lastVerifyResult: text("last_verify_result"), // ok | mismatch | failed
  lastVerifyError: text("last_verify_error"), // Error message if verify failed
  // === COMPUTED/DISPLAY FIELDS ===
  effectiveName: text("effective_name"), // Calculated: Moneybird company > Yodeck device name > screenId
  city: text("city"), // Denormalized from Moneybird for filtering/display
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// CANONICAL SCREEN STATUS (Single source of truth for UI)
// ============================================================================

/**
 * CanonicalScreenStatus - Standard interface for live Yodeck screen state.
 * 
 * IDENTIFIER SEMANTICS:
 * - locationId: Elevizion's internal location UUID (from locations table) OR "YODECK-{id}" if unlinked
 * - yodeckDeviceId: The numeric Yodeck screen ID (e.g., "591895")
 * - screenName: Display name from Yodeck or Elevizion
 * 
 * This maps from Yodeck API v2 screen_content fields via yodeckScreenMapper:
 * - sourceType: mapped from screen_content.source_type
 * - sourceId: mapped from screen_content.source_id  
 * - sourceName: mapped from screen_content.source_name
 * 
 * FAIL FAST Rules:
 * 1. If screen_content cannot be read → sourceType = "unknown"
 * 2. Never guess, never infer, never fall back silently
 * 3. isElevizion is true ONLY if sourceName starts with "Elevizion"
 * 
 * USAGE NOTE: This is for LIVE data from Yodeck API.
 * For cached/DB data, use ScreenWithBusiness from /api/screens/with-business.
 */
export interface CanonicalScreenStatus {
  // Identifier - Elevizion location ID or "YODECK-{yodeckId}" if not linked
  locationId: string;
  // Yodeck's numeric screen ID (e.g., "591895")
  yodeckDeviceId: string;
  // Display name (from Yodeck or Elevizion)
  screenName: string;
  
  // Content assignment (from screen_content via yodeckScreenMapper)
  sourceType: "layout" | "playlist" | "media" | "schedule" | "app" | "unknown";
  sourceId: string | null;
  sourceName: string | null;
  
  // Elevizion management status - true if sourceName starts with "Elevizion"
  isElevizion: boolean;
  
  // Online status from Yodeck
  onlineStatus: "online" | "offline" | "unknown";
  lastSeenAt: string | null;
  
  // For debugging only (not for business logic)
  _debug?: {
    rawContentModeField?: string;
    warnings?: string[];
  };
}

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
  // === CONTRACT-LEVEL TARGETING OVERRIDES ===
  // If set, these override advertiser-level targeting for THIS contract only
  targetRegionCodesOverride: text("target_region_codes_override").array(), // Override regions (e.g., ['NB']) or null to use advertiser default
  targetCitiesOverride: text("target_cities_override"), // Override cities CSV (e.g., "Maastricht, Heerlen") or null to use advertiser default
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
  service: text("service").notNull().unique(), // yodeck, moneybird
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

// ============================================================================
// INTEGRATION OUTBOX (SSOT Pattern - No Data Loss)
// ============================================================================

/**
 * IntegrationOutbox - Transactional outbox for external API calls
 * 
 * DESIGN PRINCIPLE: Dashboard DB is the source of truth.
 * All writes to Moneybird/Yodeck go through this outbox to ensure:
 * - No data loss if external API fails
 * - Retry capability with exponential backoff
 * - Idempotent operations (no duplicate records)
 * - Full auditability of all external operations
 */
export const integrationOutbox = pgTable("integration_outbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Target integration
  provider: text("provider").notNull(), // moneybird | yodeck
  actionType: text("action_type").notNull(), // create_contact, update_contact, link_device, sync_status
  // Entity reference
  entityType: text("entity_type").notNull(), // advertiser, screen, location, invoice
  entityId: varchar("entity_id").notNull(),
  // Payload for the API call
  payloadJson: jsonb("payload_json"),
  // Idempotency key (UNIQUE) - prevents duplicate operations
  idempotencyKey: text("idempotency_key").notNull().unique(),
  // Status tracking
  status: text("status").notNull().default("queued"), // queued | processing | succeeded | failed
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  lastError: text("last_error"),
  // External result
  externalId: text("external_id"), // moneybirdContactId, yodeckPlayerId
  responseJson: jsonb("response_json"), // Full API response for debugging
  // Scheduling
  nextRetryAt: timestamp("next_retry_at"),
  processedAt: timestamp("processed_at"),
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  // Perceptual hash for screenshot matching
  phash: text("phash"), // Perceptual hash of image creatives
  phashUpdatedAt: timestamp("phash_updated_at"), // When phash was last computed
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
  // Auto categorisatie (inferredCategory bepaald uit bedrijfsnaam)
  category: text("category"), // Effective category (computed from finalCategory || inferredCategory)
  inferredCategory: text("inferred_category"), // horeca, retail, zorg, sport, diensten, overig
  inferredConfidence: decimal("inferred_confidence", { precision: 3, scale: 2 }), // 0.00 - 1.00
  finalCategory: text("final_category"), // User-confirmed category (overrides inferred)
  categoryUpdatedAt: timestamp("category_updated_at"),
  // Workflow status (OPEN/BEHANDELD)
  isHandled: boolean("is_handled").notNull().default(false),
  handledAt: timestamp("handled_at"),
  handledBy: varchar("handled_by"),
  // Soft delete
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
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
// YODECK MEDIA TRACKING
// ============================================================================

/**
 * YodeckCreatives - Media items detected from Yodeck sync
 * Used to track ads vs non-ads and link to advertisers
 */
export const yodeckCreatives = pgTable("yodeck_creatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yodeckMediaId: integer("yodeck_media_id").notNull().unique(),
  name: text("name").notNull(),
  mediaType: text("media_type"), // video, image, widget, unknown
  duration: integer("duration"), // Duration in seconds (-1 for dynamic/unknown)
  category: text("category").notNull().default("ad"), // ad, non_ad
  advertiserId: varchar("advertiser_id").references(() => advertisers.id), // Nullable - linked when known
  matchType: text("match_type"), // auto, suggested, manual, none
  matchConfidence: decimal("match_confidence", { precision: 3, scale: 2 }), // 0.00 - 1.00
  suggestedAdvertiserId: varchar("suggested_advertiser_id").references(() => advertisers.id), // For suggested matches
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
export const insertYodeckCreativeSchema = createInsertSchema(yodeckCreatives).omit({ id: true, createdAt: true, updatedAt: true });

export const insertAdvertiserSchema = createInsertSchema(advertisers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPortalTokenSchema = createInsertSchema(portalTokens).omit({ id: true, createdAt: true });
export const insertAdAssetSchema = createInsertSchema(adAssets).omit({ id: true, createdAt: true, uploadedAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLocationTokenSchema = createInsertSchema(locationTokens).omit({ id: true, createdAt: true });
export const insertLocationOnboardingEventSchema = createInsertSchema(locationOnboardingEvents).omit({ id: true, createdAt: true });
export const insertScreenGroupSchema = createInsertSchema(screenGroups).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScreenSchema = createInsertSchema(screens).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({ id: true, createdAt: true });
export const insertIntegrationOutboxSchema = createInsertSchema(integrationOutbox).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPackagePlanSchema = createInsertSchema(packagePlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContractEventSchema = createInsertSchema(contractEvents).omit({ id: true, createdAt: true });
export const insertContractFileSchema = createInsertSchema(contractFiles).omit({ id: true, createdAt: true });
export const insertPlacementSchema = createInsertSchema(placements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true });
export const insertAdvertiserAccountSchema = createInsertSchema(advertiserAccounts).omit({ id: true, createdAt: true });
export const insertPortalPlacementSchema = createInsertSchema(portalPlacements).omit({ id: true, createdAt: true, updatedAt: true });

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

export type PortalToken = typeof portalTokens.$inferSelect;
export type InsertPortalToken = z.infer<typeof insertPortalTokenSchema>;

export type AdAsset = typeof adAssets.$inferSelect;
export type InsertAdAsset = z.infer<typeof insertAdAssetSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type LocationToken = typeof locationTokens.$inferSelect;
export type InsertLocationToken = z.infer<typeof insertLocationTokenSchema>;

export type LocationOnboardingEvent = typeof locationOnboardingEvents.$inferSelect;
export type InsertLocationOnboardingEvent = z.infer<typeof insertLocationOnboardingEventSchema>;

export type ScreenGroup = typeof screenGroups.$inferSelect;
export type InsertScreenGroup = z.infer<typeof insertScreenGroupSchema>;

export type Screen = typeof screens.$inferSelect;
export type InsertScreen = z.infer<typeof insertScreenSchema>;

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;

export type IntegrationOutbox = typeof integrationOutbox.$inferSelect;
export type InsertIntegrationOutbox = z.infer<typeof insertIntegrationOutboxSchema>;

export type PackagePlan = typeof packagePlans.$inferSelect;
export type InsertPackagePlan = z.infer<typeof insertPackagePlanSchema>;

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;

export type Placement = typeof placements.$inferSelect;
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;

export type AdvertiserAccount = typeof advertiserAccounts.$inferSelect;
export type InsertAdvertiserAccount = z.infer<typeof insertAdvertiserAccountSchema>;

export type PortalPlacement = typeof portalPlacements.$inferSelect;
export type InsertPortalPlacement = z.infer<typeof insertPortalPlacementSchema>;

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

export type YodeckCreative = typeof yodeckCreatives.$inferSelect;
export type InsertYodeckCreative = z.infer<typeof insertYodeckCreativeSchema>;

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

// ============================================================================
// YODECK MEDIA LINKS (Ad linking readiness for Moneybird)
// ============================================================================

/**
 * YodeckMediaLinks - Track detected Yodeck media items for future linking
 * This allows us to track which media items are ads vs non-ads and link them
 * to advertisers/placements when ready for Moneybird integration
 */
export const yodeckMediaLinks = pgTable("yodeck_media_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yodeckMediaId: integer("yodeck_media_id").notNull().unique(), // Yodeck media ID
  name: text("name").notNull(), // Original media name
  normalizedKey: text("normalized_key").notNull(), // Slug version for matching
  mediaType: text("media_type"), // video, image, app, etc.
  category: text("category").notNull().default("ad"), // ad, non_ad
  duration: integer("duration"), // Duration in seconds
  // Status: UNLINKED (default), LINKED (has advertiser), ARCHIVED (hidden from default view)
  status: text("status").notNull().default("UNLINKED"), // UNLINKED | LINKED | ARCHIVED
  // Linking fields (null until linked)
  advertiserId: varchar("advertiser_id").references(() => advertisers.id),
  placementId: varchar("placement_id").references(() => placements.id),
  // Match metadata - how the ad-advertiser link was established
  matchType: text("match_type"), // auto, suggested, manual, null
  matchConfidence: doublePrecision("match_confidence"), // 0.0 - 1.0 similarity score
  // Tracking
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  screenCount: integer("screen_count").default(1), // How many screens show this
  archivedAt: timestamp("archived_at"), // When archived (null = not archived)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertYodeckMediaLinkSchema = createInsertSchema(yodeckMediaLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type YodeckMediaLink = typeof yodeckMediaLinks.$inferSelect;
export type InsertYodeckMediaLink = z.infer<typeof insertYodeckMediaLinkSchema>;

// ============================================================================
// SCREEN CONTENT ITEMS (Inferred placements from Yodeck content)
// ============================================================================

/**
 * ScreenContentItems - Track what's actually playing on each screen
 * This allows us to show "inferred placements" from Yodeck content,
 * even before they're linked to our Ads/Placements records.
 */
export const screenContentItems = pgTable("screen_content_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  screenId: varchar("screen_id").notNull().references(() => screens.id, { onDelete: "cascade" }),
  yodeckMediaId: integer("yodeck_media_id").notNull(),
  name: text("name").notNull(),
  mediaType: text("media_type"), // video, image, app, etc.
  category: text("category").notNull().default("ad"), // ad, non_ad
  duration: integer("duration"),
  isActive: boolean("is_active").notNull().default(true),
  // Linking fields (null until linked)
  linkedAdvertiserId: varchar("linked_advertiser_id").references(() => advertisers.id),
  linkedPlacementId: varchar("linked_placement_id").references(() => placements.id),
  // Tracking
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (table) => [
  // Unique constraint: one entry per screen + yodeck media combo
  uniqueIndex("screen_content_items_screen_media_idx").on(table.screenId, table.yodeckMediaId),
]);

export const insertScreenContentItemSchema = createInsertSchema(screenContentItems).omit({
  id: true,
  detectedAt: true,
});

export type ScreenContentItem = typeof screenContentItems.$inferSelect;
export type InsertScreenContentItem = z.infer<typeof insertScreenContentItemSchema>;

// ============================================================================
// MONEYBIRD INTEGRATION
// ============================================================================

/**
 * MoneybirdContacts - Synced contacts from Moneybird
 * These are customers/advertisers in the Moneybird administration
 */
export const moneybirdContacts = pgTable("moneybird_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moneybirdId: text("moneybird_id").notNull().unique(), // Moneybird contact ID
  companyName: text("company_name"),
  firstname: text("firstname"),
  lastname: text("lastname"),
  email: text("email"),
  phone: text("phone"),
  address1: text("address1"),
  address2: text("address2"),
  zipcode: text("zipcode"),
  city: text("city"),
  country: text("country"),
  chamberOfCommerce: text("chamber_of_commerce"), // KvK nummer
  taxNumber: text("tax_number"), // BTW nummer
  sepaActive: boolean("sepa_active").default(false),
  sepaIban: text("sepa_iban"),
  sepaIbanAccountName: text("sepa_iban_account_name"),
  sepaMandateId: text("sepa_mandate_id"),
  sepaMandateDate: date("sepa_mandate_date"),
  customerId: text("customer_id"), // Moneybird customer ID
  // Link to internal advertiser
  advertiserId: varchar("advertiser_id").references(() => advertisers.id),
  // Sync tracking
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * MoneybirdInvoices - Synced invoices from Moneybird
 */
export const moneybirdInvoices = pgTable("moneybird_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moneybirdId: text("moneybird_id").notNull().unique(), // Moneybird invoice ID
  moneybirdContactId: text("moneybird_contact_id").notNull(), // Moneybird contact ID
  invoiceId: text("invoice_id"), // User-visible invoice number like 2024-0001
  reference: text("reference"),
  invoiceDate: date("invoice_date"),
  dueDate: date("due_date"),
  state: text("state"), // draft, open, scheduled, pending_payment, late, reminded, paid, uncollectible
  totalPriceExclTax: decimal("total_price_excl_tax", { precision: 12, scale: 2 }),
  totalPriceInclTax: decimal("total_price_incl_tax", { precision: 12, scale: 2 }),
  totalUnpaid: decimal("total_unpaid", { precision: 12, scale: 2 }),
  currency: text("currency").default("EUR"),
  paidAt: timestamp("paid_at"),
  url: text("url"), // Direct link to invoice in Moneybird
  // Link to internal invoice
  internalInvoiceId: varchar("internal_invoice_id").references(() => invoices.id),
  // Sync tracking
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * MoneybirdPayments - Synced payments from Moneybird
 */
export const moneybirdPayments = pgTable("moneybird_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  moneybirdId: text("moneybird_id").notNull().unique(), // Moneybird payment ID
  moneybirdInvoiceId: text("moneybird_invoice_id").notNull(), // Moneybird invoice ID
  paymentDate: date("payment_date"),
  price: decimal("price", { precision: 12, scale: 2 }),
  priceCurrency: text("price_currency").default("EUR"),
  // Sync tracking
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Moneybird Insert Schemas
export const insertMoneybirdContactSchema = createInsertSchema(moneybirdContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMoneybirdInvoiceSchema = createInsertSchema(moneybirdInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMoneybirdPaymentSchema = createInsertSchema(moneybirdPayments).omit({
  id: true,
  createdAt: true,
});

// Moneybird Types
export type MoneybirdContact = typeof moneybirdContacts.$inferSelect;
export type InsertMoneybirdContact = z.infer<typeof insertMoneybirdContactSchema>;

export type MoneybirdInvoice = typeof moneybirdInvoices.$inferSelect;
export type InsertMoneybirdInvoice = z.infer<typeof insertMoneybirdInvoiceSchema>;

export type MoneybirdPayment = typeof moneybirdPayments.$inferSelect;
export type InsertMoneybirdPayment = z.infer<typeof insertMoneybirdPaymentSchema>;

// ============================================================================
// SITES SCHEMAS AND TYPES
// ============================================================================

// Sites Insert Schema
export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSiteContactSnapshotSchema = createInsertSchema(siteContactSnapshot).omit({
  id: true,
  syncedAt: true,
});

export const insertSiteYodeckSnapshotSchema = createInsertSchema(siteYodeckSnapshot).omit({
  id: true,
  syncedAt: true,
});

export const insertMoneybirdContactsCacheSchema = createInsertSchema(moneybirdContactsCache).omit({
  updatedAt: true,
});

export const insertYodeckScreensCacheSchema = createInsertSchema(yodeckScreensCache).omit({
  updatedAt: true,
});

export const insertContactRoleSchema = createInsertSchema(contactRoles).omit({
  createdAt: true,
});

// Sites Types
export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;

export type SiteContactSnapshot = typeof siteContactSnapshot.$inferSelect;
export type InsertSiteContactSnapshot = z.infer<typeof insertSiteContactSnapshotSchema>;

export type SiteYodeckSnapshot = typeof siteYodeckSnapshot.$inferSelect;
export type InsertSiteYodeckSnapshot = z.infer<typeof insertSiteYodeckSnapshotSchema>;

export type MoneybirdContactCache = typeof moneybirdContactsCache.$inferSelect;
export type InsertMoneybirdContactCache = z.infer<typeof insertMoneybirdContactsCacheSchema>;

export type YodeckScreenCache = typeof yodeckScreensCache.$inferSelect;
export type InsertYodeckScreenCache = z.infer<typeof insertYodeckScreensCacheSchema>;

export type ContactRole = typeof contactRoles.$inferSelect;
export type InsertContactRole = z.infer<typeof insertContactRoleSchema>;

// Combined Site with snapshots (for API responses)
export type SiteWithSnapshots = Site & {
  contactSnapshot?: SiteContactSnapshot | null;
  yodeckSnapshot?: SiteYodeckSnapshot | null;
};

// ============================================================================
// ENTITIES SCHEMAS AND TYPES
// ============================================================================

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSyncJobSchema = createInsertSchema(syncJobs).omit({
  id: true,
  startedAt: true,
});

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = z.infer<typeof insertEntitySchema>;

export type SyncJob = typeof syncJobs.$inferSelect;
export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;

// Contact data structure for entities
export interface EntityContactData {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  kvkNumber?: string;
  vatNumber?: string;
}

// ============================================================================
// EMAIL LOGGING & VERIFICATION
// ============================================================================

/**
 * EmailLogs - Track all sent emails for auditing and debugging
 */
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toEmail: text("to_email").notNull(),
  templateKey: text("template_key").notNull(), // test_email, verification_code, onboarding_invite, onboarding_completed, contract_confirmation, sepa_request
  entityType: text("entity_type"), // advertiser, screen, location (nullable)
  entityId: varchar("entity_id"), // ID of related entity (nullable)
  status: text("status").notNull().default("queued"), // queued, sent, failed
  providerMessageId: text("provider_message_id"), // Postmark MessageID
  errorMessage: text("error_message"),
  // Rendered content for preview/audit
  subjectRendered: text("subject_rendered"),
  bodyRendered: text("body_rendered"),
  contactName: text("contact_name"), // Stored for accurate preview reconstruction
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
});

/**
 * ContractDocuments - Track all generated contracts for auditing
 * Uses internal "Akkoord + OTP" signing instead of external e-sign services
 */
export const contractDocuments = pgTable("contract_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: text("template_key").notNull(), // location_revshare, location_fixed, advertiser_standard, advertiser_premium
  entityType: text("entity_type").notNull(), // advertiser, location
  entityId: varchar("entity_id").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  renderedContent: text("rendered_content"), // HTML content
  pdfUrl: text("pdf_url"), // Object storage URL if PDF generated
  status: text("status").notNull().default("draft"), // draft, sent, signed, declined, expired, cancelled
  signedAt: timestamp("signed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Internal OTP signing fields (replaces external e-sign services)
  signProvider: text("sign_provider").default("internal_otp"), // internal_otp (legacy: signrequest)
  signStatus: text("sign_status").default("none"), // none, sent, verified, signed, expired
  signedPdfUrl: text("signed_pdf_url"), // Storage URL for signed PDF with audit trail
  sentAt: timestamp("sent_at"),
  // OTP verification audit trail
  otpSentAt: timestamp("otp_sent_at"),
  otpVerifiedAt: timestamp("otp_verified_at"),
  signerEmail: text("signer_email"),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signerUserAgent: text("signer_user_agent"),
  // Legacy SignRequest fields (read-only for old contracts)
  signrequestDocumentId: text("signrequest_document_id"),
  signrequestUrl: text("signrequest_url"),
  signedLogUrl: text("signed_log_url"),
});

/**
 * TermsAcceptance - Track acceptance of general terms/conditions for legal compliance
 */
export const termsAcceptance = pgTable("terms_acceptance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // advertiser, location
  entityId: varchar("entity_id").notNull(),
  acceptedAt: timestamp("accepted_at").notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  termsVersion: text("terms_version").notNull(), // e.g. "v1.0", "2024-01"
  termsHash: text("terms_hash"), // SHA256 hash of the terms content
  source: text("source").notNull().default("onboarding_checkbox"), // onboarding_checkbox, portal, manual
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * VerificationCodes - Email verification codes for auth
 */
export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(), // SHA256 hash of 6-digit code
  contractDocumentId: varchar("contract_document_id"), // Scopes OTP to specific contract
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * OnboardingInviteTokens - Single-use tokens for onboarding invites
 */
export const onboardingInviteTokens = pgTable("onboarding_invite_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull(), // SHA256 hash of token
  entityType: text("entity_type").notNull(), // screen, advertiser, location
  entityId: varchar("entity_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email & Verification Schemas
export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({
  id: true,
  createdAt: true,
});

export const insertOnboardingInviteTokenSchema = createInsertSchema(onboardingInviteTokens).omit({
  id: true,
  createdAt: true,
});

// Email & Verification Types
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;

// Contract Document Schema & Types
export const insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ContractDocument = typeof contractDocuments.$inferSelect;
export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;

// Terms Acceptance Schema & Types
export const insertTermsAcceptanceSchema = createInsertSchema(termsAcceptance).omit({
  id: true,
  createdAt: true,
});
export type TermsAcceptance = typeof termsAcceptance.$inferSelect;
export type InsertTermsAcceptance = z.infer<typeof insertTermsAcceptanceSchema>;

export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;

export type OnboardingInviteToken = typeof onboardingInviteTokens.$inferSelect;
export type InsertOnboardingInviteToken = z.infer<typeof insertOnboardingInviteTokenSchema>;

// ============================================================================
// WEBSITE LEADS
// ============================================================================

/**
 * AdvertiserLeads - Leads from "Ik wil adverteren" form on website
 */
export const advertiserLeads = pgTable("advertiser_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  goal: text("goal").notNull(), // Meer klanten / Naamsbekendheid / Actie promoten
  region: text("region").notNull(), // Limburg plaatsen
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  budgetIndication: text("budget_indication"), // €50 / €100 / €250 / €500+ per maand
  remarks: text("remarks"),
  status: text("status").notNull().default("new"), // new, contacted, converted, declined
  // Auto categorisatie
  inferredCategory: text("inferred_category"), // horeca, retail, zorg, sport, diensten, overig
  finalCategory: text("final_category"), // User-confirmed category
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * ScreenLeads - Leads from "Ik wil een scherm" form on website
 */
export const screenLeads = pgTable("screen_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessType: text("business_type").notNull(), // Kapper, Gym, Horeca, Retail, Overig
  city: text("city").notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  visitorsPerWeek: text("visitors_per_week"), // 0-250 / 250-500 / 500-1000 / 1000+
  remarks: text("remarks"),
  status: text("status").notNull().default("new"), // new, contacted, converted, declined
  // Auto categorisatie (businessType is al category voor screen leads)
  inferredCategory: text("inferred_category"), // Copied from businessType or inferred
  finalCategory: text("final_category"), // User-confirmed category
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// REVENUE ALLOCATION & PAYOUTS
// ============================================================================

/**
 * RevenueAllocations - Monthly revenue allocation per screen
 * Berekend uit Moneybird facturen en placements
 */
export const revenueAllocations = pgTable("revenue_allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1-12
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  screenId: varchar("screen_id").notNull().references(() => screens.id),
  locationId: varchar("location_id").references(() => locations.id),
  // Allocation berekening
  screenDays: integer("screen_days").notNull(), // Aantal dagen dat adverteerder op scherm actief was
  visitorWeight: decimal("visitor_weight", { precision: 4, scale: 2 }).notNull(), // Weight uit visitorsPerWeek staffel
  weightOverride: decimal("weight_override", { precision: 4, scale: 2 }), // Optionele override
  allocationScore: decimal("allocation_score", { precision: 12, scale: 4 }).notNull(), // screenDays * weight
  totalScoreForAdvertiser: decimal("total_score_for_advertiser", { precision: 12, scale: 4 }).notNull(),
  advertiserRevenueMonth: decimal("advertiser_revenue_month", { precision: 12, scale: 2 }).notNull(), // Totaal uit Moneybird
  allocatedRevenue: decimal("allocated_revenue", { precision: 12, scale: 2 }).notNull(), // Toegewezen aan dit scherm
  // Meta
  moneybirdInvoiceIds: jsonb("moneybird_invoice_ids").$type<string[]>(), // Factuur IDs waaruit revenue komt
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * LocationPayouts - Maandelijkse uitbetalingen per locatie
 * Aggregeert RevenueAllocations naar payout per locatie
 */
export const locationPayouts = pgTable("location_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1-12
  locationId: varchar("location_id").notNull().references(() => locations.id),
  // Payout berekening
  allocatedRevenueTotal: decimal("allocated_revenue_total", { precision: 12, scale: 2 }).notNull(), // Som van alle screen allocations
  payoutType: text("payout_type").notNull(), // revshare | fixed (gekopieerd uit location contract)
  revenueSharePercent: decimal("revenue_share_percent", { precision: 5, scale: 2 }), // % bij revshare
  fixedAmount: decimal("fixed_amount", { precision: 10, scale: 2 }), // Bedrag bij fixed
  payoutAmount: decimal("payout_amount", { precision: 12, scale: 2 }).notNull(), // Berekende uitbetaling
  minimumThreshold: decimal("minimum_threshold", { precision: 10, scale: 2 }), // Minimum payout bedrag
  carriedOver: boolean("carried_over").default(false), // Onder minimum, doorgeschoven
  // Status
  status: text("status").notNull().default("pending"), // pending | approved | paid | cancelled
  approvedAt: timestamp("approved_at"),
  approvedByUserId: varchar("approved_by_user_id"),
  paidAt: timestamp("paid_at"),
  paymentReference: text("payment_reference"),
  // Meta
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * MonthlyReports - Gegenereerde en verstuurde rapporten
 */
export const monthlyReports = pgTable("monthly_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1-12
  reportType: text("report_type").notNull(), // advertiser | location
  entityId: varchar("entity_id").notNull(), // advertiserId of locationId
  entityName: text("entity_name"), // Naam voor logging
  // Report content
  reportData: jsonb("report_data"), // Gegenereerde report data
  // Delivery status
  status: text("status").notNull().default("draft"), // draft | generated | sent | failed
  generatedAt: timestamp("generated_at"),
  sentAt: timestamp("sent_at"),
  sentToEmail: text("sent_to_email"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead Schemas
export const insertAdvertiserLeadSchema = createInsertSchema(advertiserLeads).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertScreenLeadSchema = createInsertSchema(screenLeads).omit({
  id: true,
  status: true,
  createdAt: true,
});

// Lead Types
export type AdvertiserLead = typeof advertiserLeads.$inferSelect;
export type InsertAdvertiserLead = z.infer<typeof insertAdvertiserLeadSchema>;

export type ScreenLead = typeof screenLeads.$inferSelect;
export type InsertScreenLead = z.infer<typeof insertScreenLeadSchema>;

// Revenue Allocation & Payout Schemas
export const insertRevenueAllocationSchema = createInsertSchema(revenueAllocations).omit({
  id: true,
  createdAt: true,
});

export const insertLocationPayoutSchema = createInsertSchema(locationPayouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMonthlyReportSchema = createInsertSchema(monthlyReports).omit({
  id: true,
  createdAt: true,
});

// Revenue Allocation & Payout Types
export type RevenueAllocation = typeof revenueAllocations.$inferSelect;
export type InsertRevenueAllocation = z.infer<typeof insertRevenueAllocationSchema>;

export type LocationPayout = typeof locationPayouts.$inferSelect;
export type InsertLocationPayout = z.infer<typeof insertLocationPayoutSchema>;

export type MonthlyReport = typeof monthlyReports.$inferSelect;
export type InsertMonthlyReport = z.infer<typeof insertMonthlyReportSchema>;

// ============================================================================
// COMPANY PROFILE (SINGLETON)
// ============================================================================

/**
 * CompanyProfile - Central company/brand information (singleton record)
 * Used for: footer, contracts, PDFs, emails, integrations
 */
export const companyProfile = pgTable("company_profile", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Legal & Brand
  legalName: text("legal_name").notNull(), // Juridische naam (Douven Services)
  tradeName: text("trade_name").notNull(), // Handelsnaam (Elevizion)
  kvkNumber: text("kvk_number").notNull(), // KvK nummer
  vatNumber: text("vat_number").notNull(), // BTW nummer
  // Address
  addressLine1: text("address_line1"), // Straat + huisnummer
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country").default("NL"),
  // Public visibility
  publicAddressEnabled: boolean("public_address_enabled").default(false), // Show address on website?
  // Contact
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  // Banking (for SEPA/contracts)
  iban: text("iban"),
  ibanAccountHolder: text("iban_account_holder"),
  bicCode: text("bic_code"),
  // PDF/Contract settings
  showFullAddressInPdf: boolean("show_full_address_in_pdf").default(true),
  // Meta
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCompanyProfileSchema = createInsertSchema(companyProfile).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CompanyProfile = typeof companyProfile.$inferSelect;
export type InsertCompanyProfile = z.infer<typeof insertCompanyProfileSchema>;

// Lead Category Constants
export const LEAD_CATEGORIES = [
  "horeca",
  "retail",
  "zorg",
  "sport",
  "diensten",
  "automotive",
  "beauty",
  "overig",
] as const;
export type LeadCategory = typeof LEAD_CATEGORIES[number];

// Visitor Weight Staffels (for revenue allocation)
export const VISITOR_WEIGHT_STAFFELS = [
  { min: 0, max: 300, weight: 0.8 },
  { min: 301, max: 700, weight: 1.0 },
  { min: 701, max: 1500, weight: 1.2 },
  { min: 1501, max: Infinity, weight: 1.5 },
] as const;

export function getVisitorWeight(visitorsPerWeek: number | null): number {
  if (!visitorsPerWeek || visitorsPerWeek <= 0) return 1.0; // Default weight
  for (const staffel of VISITOR_WEIGHT_STAFFELS) {
    if (visitorsPerWeek >= staffel.min && visitorsPerWeek <= staffel.max) {
      return staffel.weight;
    }
  }
  return 1.5; // Max weight for very high traffic
}

// ============================================================================
// PLACEMENT ENGINE (AUTO-PUBLISH)
// ============================================================================

/**
 * PlacementPlan - Orchestrates the placement workflow from proposal to publish
 * Status flow: PROPOSED → SIMULATED_OK/SIMULATED_FAIL → APPROVED → PUBLISHING → PUBLISHED/FAILED/ROLLED_BACK
 */
export const placementPlans = pgTable("placement_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  adAssetId: varchar("ad_asset_id").notNull().references(() => adAssets.id, { onDelete: "cascade" }),
  linkKey: text("link_key").notNull(), // Copy from advertiser for quick lookup
  // Workflow status
  status: text("status").notNull().default("PROPOSED"), // PROPOSED | SIMULATED_OK | SIMULATED_FAIL | APPROVED | PUBLISHING | PUBLISHED | FAILED | ROLLED_BACK
  // Target counts from package
  packageType: text("package_type").notNull(), // SINGLE | TRIPLE | TEN | CUSTOM
  requiredTargetCount: integer("required_target_count").notNull(), // 1, 3, 10, or custom
  // Proposed and approved targets stored as JSON
  proposedTargets: jsonb("proposed_targets").$type<{
    locationId: string;
    locationName: string;
    yodeckPlaylistId: string;
    score: number;
    expectedImpressionsPerWeek: number;
    capacityBefore: number;
    capacityAfter: number;
  }[]>(),
  approvedTargets: jsonb("approved_targets").$type<{
    locationId: string;
    locationName: string;
    yodeckPlaylistId: string;
    score: number;
    expectedImpressionsPerWeek: number;
  }[]>(),
  // Reports
  simulationReport: jsonb("simulation_report").$type<{
    selectedCount: number;
    rejectedCount: number;
    totalExpectedImpressions: number;
    rejectedReasons: { locationId: string; locationName: string; reason: string }[];
    capacitySnapshot: { locationId: string; before: number; after: number; max: number }[];
    simulatedAt: string;
    isFresh: boolean;
  }>(),
  publishReport: jsonb("publish_report").$type<{
    successCount: number;
    failedCount: number;
    yodeckMediaId: string | null;
    targets: { locationId: string; status: string; error?: string }[];
    publishedAt?: string;
    rolledBackAt?: string;
  }>(),
  // Idempotency
  idempotencyKey: text("idempotency_key").unique(), // hash(advertiserId + adAssetId + approvedTargets)
  // Retry tracking
  retryCount: integer("retry_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  lastErrorCode: text("last_error_code"),         // e.g., "YODECK_UPLOAD_FAILED", "PLAYLIST_ADD_FAILED"
  lastErrorMessage: text("last_error_message"),   // Human-readable summary
  lastErrorDetails: jsonb("last_error_details"),  // Full error object/stack
  // Timestamps
  simulatedAt: timestamp("simulated_at"),
  approvedAt: timestamp("approved_at"),
  approvedByUserId: varchar("approved_by_user_id"),
  publishedAt: timestamp("published_at"),
  failedAt: timestamp("failed_at"),
  rolledBackAt: timestamp("rolled_back_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * PlacementTarget - Individual screen/location placements within a plan
 * Tracks the publish status per location
 */
export const placementTargets = pgTable("placement_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => placementPlans.id, { onDelete: "cascade" }),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  yodeckPlaylistId: text("yodeck_playlist_id").notNull(),
  // Yodeck integration
  yodeckMediaId: text("yodeck_media_id"), // Media ID after upload to Yodeck
  yodeckMediaName: text("yodeck_media_name"), // Name in Yodeck
  // Status
  status: text("status").notNull().default("PENDING"), // PENDING | PUBLISHING | PUBLISHED | FAILED | ROLLED_BACK
  errorMessage: text("error_message"),
  // Metrics
  expectedImpressionsPerWeek: integer("expected_impressions_per_week"),
  score: decimal("score", { precision: 10, scale: 4 }), // Ranking score for this location
  // Timestamps
  publishedAt: timestamp("published_at"),
  rolledBackAt: timestamp("rolled_back_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Placement Plan Schemas
export const insertPlacementPlanSchema = createInsertSchema(placementPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlacementTargetSchema = createInsertSchema(placementTargets).omit({
  id: true,
  createdAt: true,
});

// Placement Plan Types
export type PlacementPlan = typeof placementPlans.$inferSelect;
export type InsertPlacementPlan = z.infer<typeof insertPlacementPlanSchema>;

export type PlacementTarget = typeof placementTargets.$inferSelect;
export type InsertPlacementTarget = z.infer<typeof insertPlacementTargetSchema>;

// Placement Status Constants
export const PLACEMENT_PLAN_STATUSES = [
  "PROPOSED",
  "SIMULATED_OK",
  "SIMULATED_FAIL",
  "APPROVED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "ROLLED_BACK",
] as const;
export type PlacementPlanStatus = typeof PLACEMENT_PLAN_STATUSES[number];

export const PLACEMENT_TARGET_STATUSES = [
  "PENDING",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "ROLLED_BACK",
] as const;
export type PlacementTargetStatus = typeof PLACEMENT_TARGET_STATUSES[number];

// Region Codes (Dutch provinces)
export const REGION_CODES = [
  { code: "DR", name: "Drenthe" },
  { code: "FL", name: "Flevoland" },
  { code: "FR", name: "Friesland" },
  { code: "GE", name: "Gelderland" },
  { code: "GR", name: "Groningen" },
  { code: "LI", name: "Limburg" },
  { code: "NB", name: "Noord-Brabant" },
  { code: "NH", name: "Noord-Holland" },
  { code: "OV", name: "Overijssel" },
  { code: "UT", name: "Utrecht" },
  { code: "ZE", name: "Zeeland" },
  { code: "ZH", name: "Zuid-Holland" },
] as const;
export type RegionCode = typeof REGION_CODES[number]["code"];

// Advertiser Categories
export const ADVERTISER_CATEGORIES = [
  "horeca",
  "retail",
  "sport",
  "zorg",
  "automotive",
  "beauty",
  "diensten",
  "overig",
] as const;
export type AdvertiserCategory = typeof ADVERTISER_CATEGORIES[number];

// ============================================
// E2E Test Runs - For admin chain verification
// ============================================
export const e2eTestRuns = pgTable("e2e_test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testType: text("test_type").notNull().default("YODECK_CHAIN"), // YODECK_CHAIN | PUBLISH_FLOW | etc.
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  ok: boolean("ok"),
  stepsJson: jsonb("steps_json"), // Array of step results
  error: text("error"),
  testLocationId: varchar("test_location_id"),
  testMediaId: text("test_media_id"),
  triggeredBy: varchar("triggered_by"), // user ID who triggered the test
});

export const insertE2eTestRunSchema = createInsertSchema(e2eTestRuns).omit({
  id: true,
  startedAt: true,
});
export type E2eTestRun = typeof e2eTestRuns.$inferSelect;
export type InsertE2eTestRun = z.infer<typeof insertE2eTestRunSchema>;

// ============================================
// Tag Policies - Whitelist/allowed tags for publishing
// ============================================
export const tagPolicies = pgTable("tag_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tagName: text("tag_name").notNull().unique(), // e.g., "category:food", "campaign:summer2024"
  tagType: text("tag_type").notNull().default("custom"), // predefined | category | campaign | format | custom
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  requiresYodeckCreation: boolean("requires_yodeck_creation").notNull().default(true), // true = must be created in Yodeck UI
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTagPolicySchema = createInsertSchema(tagPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TagPolicy = typeof tagPolicies.$inferSelect;
export type InsertTagPolicy = z.infer<typeof insertTagPolicySchema>;

// Predefined tag prefixes that are always allowed
export const ALLOWED_TAG_PREFIXES = [
  "elevizion:",
  "category:",
  "campaign:",
  "format:",
] as const;
export type AllowedTagPrefix = typeof ALLOWED_TAG_PREFIXES[number];

// Static predefined tags - must be pre-created manually in Yodeck UI
export const PREDEFINED_TAGS = [
  "elevizion:ad",
  "elevizion:advertiser", 
  "elevizion:plan",
  "elevizion:location",
] as const;
export type PredefinedTag = typeof PREDEFINED_TAGS[number];

/**
 * Upload Jobs - Tracks Yodeck media upload lifecycle with retry logic
 * Ensures uploads complete successfully with verification polling
 */
export const uploadJobs = pgTable("upload_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id, { onDelete: "cascade" }),
  adAssetId: varchar("ad_asset_id").references(() => adAssets.id, { onDelete: "set null" }),
  // Correlation tracking
  correlationId: text("correlation_id"), // For tracing across logs
  // Local file reference
  localAssetPath: text("local_asset_path").notNull(), // Path in object storage
  localFileSize: integer("local_file_size").notNull(), // File size in bytes
  localDurationSeconds: decimal("local_duration_seconds", { precision: 10, scale: 2 }), // FFprobe duration
  desiredFilename: text("desired_filename"), // Original filename
  // Yodeck media tracking
  yodeckMediaId: integer("yodeck_media_id"), // Assigned after create call
  yodeckMediaName: text("yodeck_media_name"), // Name in Yodeck
  // Transactional upload tracking
  createResponse: jsonb("create_response"), // Response from POST /media
  uploadUrl: text("upload_url"), // Presigned PUT URL
  putStatus: integer("put_status"), // HTTP status from PUT (should be 200/204)
  putEtag: text("put_etag"), // ETag from PUT response
  // Finalize tracking
  finalizeAttempted: boolean("finalize_attempted").default(false), // Whether finalize was attempted
  finalizeStatus: integer("finalize_status"), // HTTP status from finalize call
  finalizeUrlUsed: text("finalize_url_used"), // Which finalize URL succeeded (if any)
  confirmResponse: jsonb("confirm_response"), // Response from verify GET /media/:id
  pollAttempts: integer("poll_attempts").notNull().default(0), // Number of poll attempts
  // Upload status - now includes transactional states
  status: text("status").notNull().default("QUEUED"), // QUEUED | UPLOADING | POLLING | READY | RETRYABLE_FAIL | PERMANENT_FAIL
  finalState: text("final_state"), // CREATED | UPLOADED | VERIFIED_EXISTS | ENCODING | READY | FAILED
  attempt: integer("attempt").notNull().default(0), // Current attempt number (1-5)
  maxAttempts: integer("max_attempts").notNull().default(5),
  // Error tracking
  lastError: text("last_error"), // Last error message
  lastErrorAt: timestamp("last_error_at"),
  errorCode: text("error_code"), // Structured error code (e.g., PUT_FAILED, VERIFY_404)
  errorDetails: jsonb("error_details"), // Detailed error info as JSON
  // Yodeck verification snapshot (from poll)
  yodeckFileSize: integer("yodeck_file_size"), // File size reported by Yodeck
  yodeckDuration: decimal("yodeck_duration", { precision: 10, scale: 2 }), // Duration reported by Yodeck
  yodeckStatus: text("yodeck_status"), // Status reported by Yodeck (ready, processing, etc.)
  // Retry scheduling
  nextRetryAt: timestamp("next_retry_at"), // When to retry (null if not scheduled)
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"), // When job reached READY status
});

export const insertUploadJobSchema = createInsertSchema(uploadJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});
export type UploadJob = typeof uploadJobs.$inferSelect;
export type InsertUploadJob = z.infer<typeof insertUploadJobSchema>;

// Upload job status constants
export const UPLOAD_JOB_STATUS = {
  QUEUED: "QUEUED",
  UPLOADING: "UPLOADING",
  POLLING: "POLLING",
  READY: "READY",
  RETRYABLE_FAIL: "RETRYABLE_FAIL",
  PERMANENT_FAIL: "PERMANENT_FAIL",
} as const;
export type UploadJobStatus = typeof UPLOAD_JOB_STATUS[keyof typeof UPLOAD_JOB_STATUS];

// Upload job finalState - transactional upload states
export const UPLOAD_FINAL_STATE = {
  CREATED: "CREATED",           // POST /media succeeded, have mediaId
  UPLOADED: "UPLOADED",         // PUT binary succeeded (200/204)
  VERIFIED_EXISTS: "VERIFIED_EXISTS", // GET /media/:id returned 200
  ENCODING: "ENCODING",         // Yodeck is encoding/processing
  READY: "READY",               // Yodeck reports ready/ok
  FAILED: "FAILED",             // Any step failed
} as const;
export type UploadFinalState = typeof UPLOAD_FINAL_STATE[keyof typeof UPLOAD_FINAL_STATE];

// ============================================================================
// SYNC LOCKS - Distributed locking for preventing race conditions
// ============================================================================
export const syncLocks = pgTable("sync_locks", {
  id: varchar("id").primaryKey(), // lock name, e.g., "yodeck_sync", "moneybird_sync"
  locked: boolean("locked").notNull().default(false),
  lockedAt: timestamp("locked_at"),
  lockedBy: text("locked_by"), // server instance identifier
  expiresAt: timestamp("expires_at"), // auto-expire locks after timeout
  lastSuccessAt: timestamp("last_success_at"),
  lastError: text("last_error"),
  retryCount: integer("retry_count").default(0),
  metadata: text("metadata"), // JSON string with extra info
});

// ============================================================================
// PUBLISH QUEUE - Upload → Review → Publish flow management
// ============================================================================
export const PUBLISH_QUEUE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  RETRYING: "retrying",
} as const;
export type PublishQueueStatus = typeof PUBLISH_QUEUE_STATUS[keyof typeof PUBLISH_QUEUE_STATUS];

export const PUBLISH_QUEUE_PRIORITY = {
  CRITICAL: 1,   // Urgent ads
  HIGH: 10,      // Paid customers
  NORMAL: 100,   // Standard
  LOW: 1000,     // Bulk/backfill
} as const;

export const publishQueue = pgTable("publish_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adAssetId: varchar("ad_asset_id").notNull().references(() => adAssets.id),
  advertiserId: varchar("advertiser_id").notNull().references(() => advertisers.id),
  status: varchar("status").notNull().default(PUBLISH_QUEUE_STATUS.PENDING),
  priority: integer("priority").notNull().default(PUBLISH_QUEUE_PRIORITY.NORMAL),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(5),
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  scheduledFor: timestamp("scheduled_for"), // For delayed/retry processing
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
  metadata: text("metadata"), // JSON with extra info
});

// ============================================================================
// ALERTS - Error tracking and alerting system
// ============================================================================
export const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
} as const;

export const ALERT_CATEGORY = {
  YODECK_API: "yodeck_api",
  YODECK_PUBLISH: "yodeck_publish",
  YODECK_SYNC: "yodeck_sync",
  UPLOAD: "upload",
  INTEGRATION: "integration",
  SYSTEM: "system",
} as const;

export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  severity: varchar("severity").notNull(), // info, warning, error, critical
  category: varchar("category").notNull(), // yodeck_api, upload, etc.
  source: text("source").notNull(), // e.g., "yodeck:getScreens"
  message: text("message").notNull(),
  details: text("details"), // JSON
  dedupKey: text("dedup_key"), // For deduplication
  duplicateCount: integer("duplicate_count").default(0),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

