# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for digital signage network management. Its core purpose is to ensure high screen uptime, efficient ad delivery, fast onboarding, and simple automation for digital signage networks. The system uses `SCREEN_ID` (e.g., EVZ-001) as the central identifier. It provides real-time screen monitoring, advertiser/ad creative management, quick onboarding wizards, and automation rules, all within a simplified, Dutch-language interface. The project aims to instantly answer critical operational questions like "How many screens are running, how many ads are live, how many customers are paying?".

## User Preferences
- Preferred communication style: Simple, everyday language.
- Language: Dutch (Nederlands) - All UI text, labels, buttons, and navigation items are in Dutch.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **UI Components**: shadcn/ui (Radix UI primitives).
- **Styling**: Tailwind CSS v4 with CSS variables.
- **Forms**: React Hook Form with Zod validation.
- **UI/UX**: Pages-based structure, sidebar layout, breadcrumb navigation, Dutch language UI.
    - **Home page (`/dashboard`)**: Owner-focused overview with 4 main KPI tiles (Screens online/offline, Ads online, Paying advertisers) and an "Actie Overzicht" for operational items.
    - **Modules**: Dedicated sections for Schermen, Ads & Plaatsingen, Adverteerders, Instellingen.
    - **Finance page (`/finance`)**: Minimal design showing paying customers and monthly recurring revenue (MRR).
    - **Detail Pages**: Owner-friendly Screen and Advertiser detail pages with key information, action buttons, and integrated statistics.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer, business logic in storage service.

### Data Model
Core entities: **Entities** (unified model for ADVERTISER + SCREEN), Sites, Advertisers, PackagePlans, Contracts, Placements, ScheduleSnapshots, Invoices/Payments, and Payouts/CarryOvers.

#### Advertiser Schema (Extended January 2026)
The `advertisers` table now includes comprehensive Moneybird contact fields:
- **Basisgegevens**: companyName, contactName, email, phone, street, zipcode, city, country
- **Identificatie**: vatNumber, kvkNumber, customerReference, isBusiness
- **Extra contact**: website, invoiceEmail, attention, tags
- **Facturatie**: invoiceDeliveryMethod (email/post/portal), language (nl/en), paymentTermDays, discountPercentage
- **SEPA Incasso**: iban, ibanAccountHolder, sepaBic, sepaMandate, sepaMandateReference, sepaMandateDate
- **Moneybird sync**: moneybirdContactId, moneybirdContactSnapshot, moneybirdSyncStatus, moneybirdSyncError

The "Nieuwe Adverteerder" dialog has 2 modes via tabs:
1. **Snel (Quick Create)**: Minimal fields (companyName, email) with portal link generation for customer self-service
2. **Volledig (Full Form)**: Complete form with 3 collapsible sections:
   - Basisgegevens: Required company info + address fields
   - SEPA Automatisch Incasso: Toggle-controlled section for direct debit setup
   - Extra (Moneybird): Collapsible section with billing settings + extra contact info

#### Advertiser Self-Service Portal (January 2026)
- **Portal Tokens**: `portal_tokens` table with SHA256 hashed tokens, 7-day expiration, one-time use
- **Quick Create Flow**: POST `/api/advertisers/quick-create` creates draft advertiser + generates portal link
- **Public Portal Page**: `/portal/:token` allows customers to complete their profile (no authentication required)
- **Token Validation**: 404 for not found, 410 for expired/used tokens
- **Race Condition Prevention**: Token marked as used BEFORE advertiser update (optimistic locking)
- **onboardingStatus States**: `draft` → `invited` → `completed`
- **source Field**: Tracks advertiser origin (`quick_create`, `manual`, etc.)

#### Location Onboarding System (January 2026)
- **Location Code Format**: `EVZ-LOC-###` (e.g., EVZ-LOC-001), auto-incremented via `getNextLocationCode()`
- **Location Tokens**: `location_tokens` table mirrors portal_tokens pattern with SHA256 hash, 7-day expiry, one-time use
- **Location Onboarding Events**: `location_onboarding_events` table tracks all onboarding actions (location_created, invite_email_sent, details_submitted)
- **Extended Location Fields**: houseNumber, visitorsPerWeek, openingHours, branche, piStatus (not_installed|installed), yodeckStatus (not_linked|linked), inviteEmailSentAt, reminderEmailSentAt
- **Quick Create Flow**: POST `/api/locations/quick-create` creates location + generates portal link
- **Public Portal Page**: `/locatie-portal/:token` allows customers to fill in location details (no auth)
- **Onboarding Wizard**: New "Nieuwe Locatie" option in /onboarding page with emerald-themed wizard
- **Status Flow**: pending_details → pending_pi → ready_for_pi → active
- **API Endpoints**:
  - GET `/api/locations/next-code` - Preview next location code
  - POST `/api/locations/quick-create` - Create location + portal link
  - POST `/api/locations/:id/send-portal-email` - Send invite email (idempotent)
  - GET `/api/locations/:id/onboarding-events` - View onboarding timeline
  - GET/POST `/api/public/location-portal/:token` - Public portal validation and submission

#### New Unified Entities Architecture (December 2024)
- **entities table**: Centralized table for both ADVERTISERS and SCREENS with:
  - `entity_type`: ADVERTISER or SCREEN
  - `entity_code`: Unique identifier (EVZ-001 for screens, EVZ-ADV-0001 for advertisers)
  - `moneybird_contact_id`: Linked Moneybird contact (1:1 relationship)
  - `yodeck_device_id`: Linked Yodeck device (for screens)
  - `status`: PENDING → ACTIVE or ERROR based on Moneybird sync
  - `contact_data`: JSONB with company, address, kvk, btw, email, phone
  - `tags`: JSONB array for Yodeck device matching
- **sync_jobs table**: Tracks all external service operations
  - `provider`: MONEYBIRD or YODECK
  - `action`: CREATE_CONTACT, UPDATE_CONTACT, LINK_DEVICE, SYNC_STATUS
  - `status`: PENDING → RUNNING → SUCCESS/FAILED
  - `error_message`: For failed jobs
- **API Endpoints**: `/api/entities/*` and `/api/sync-jobs`
- **Frontend Pages**: `/entities` (tabs for SCREEN/ADVERTISER) and `/sync-logs`

#### Legacy Sites Architecture
- **Unified Sites Architecture**: The `sites` table combines screen, location, and business info into one entity, with `code` (e.g., EVZ-001) as the central unique identifier.
- **Critical Business Rule**: 1 Site = 1 Screen = 1 Location (99% of cases), explicitly handling multi-screen exceptions.
- **Data Source Separation**: Yodeck for device data, Moneybird for customer data.
- **Snapshot Tables**: `site_contact_snapshot`, `site_yodeck_snapshot` for cached external data.
- **Cache Tables**: `moneybird_contacts_cache`, `yodeck_screens_cache` for global syncing and UI search.
- **Display Name Priority**: Moneybird company > Yodeck device name > code fallback.

### Authentication & Authorization
- **Provider**: Username/password with bcrypt hashing.
- **Session Storage**: PostgreSQL-backed via `connect-pg-simple`.
- **User Roles**: Five predefined roles (eigenaar, finance, ops, viewer, partner) with hierarchical access control and `requireRole()` middleware.
- **Audit Logging**: Tracks permission changes.

### System Design Choices
- **Yodeck Statistics Integration**: Backend service `server/yodeckStats.ts` with 5-minute caching for screen and advertiser statistics.
- **Content Inventory Module**: Centralized YodeckClient with retry logic, pagination, rate limiting, and TTL-based caching for Yodeck content (playlists, layouts, schedules, media).
- **Screenshot Analysis**: Perceptual Hashing (pHash) for detecting empty/blank screens and matching creative content.
- **Control Room Action Priority**: Prioritizes `offline_screen`, `onboarding_hint`, `unmanaged_content`, and `paused_placement` for operational alerts.
- **Server-side Caching**: 10-second in-memory TTL cache for control room stats to reduce database load.
- **Yodeck Media Links Table**: `yodeck_media_links` tracks detected media items for Moneybird advertiser linking with normalized name keys and category (ad/non_ad).
- **Home KPI Data Pipeline**: Control room stats classify ads using `getYodeckMediaLinkStats()` to distinguish linked, unlinked, and non-ad content.
- **Screen Content Items**: `screen_content_items` table tracks per-screen Yodeck media, populated during scheduled sync, and displayed on screen detail pages.

### Production Stability Features
- **Graceful Shutdown**: Handlers for SIGTERM/SIGINT with database and scheduler cleanup.
- **Scheduled Background Sync**: 15-minute interval Yodeck content sync, with internal caching.
- **Reduced Logging**: `DEBUG_YODECK=true` flag for verbose Yodeck sync logs.
- **Control Room DB-Only**: `/api/control-room/stats` and `/api/control-room/actions` use only database queries.

### Integration Outbox Pattern (January 2026)
Transactional outbox pattern ensures DB is Single Source of Truth for external API operations:
- **integration_outbox Table**: Queued sync jobs with provider, actionType, entityType, entityId, status, retry scheduling
- **Idempotency Keys**: Format `${provider}:${actionType}:${entityType}:${entityId}` prevents duplicate operations
- **Sync Status Fields**: Added to screens, locations, advertisers: `moneybirdSyncStatus`, `yodeckSyncStatus`, `lastSyncAt`, `syncError`
- **Status Values**: `not_linked` | `pending` | `synced` | `failed`
- **Background Worker**: 30-second interval, batch size 10, max 5 attempts with exponential backoff (`Math.pow(2, attempts) * 5` minutes)
- **API Endpoints**:
  - `GET /api/sync/outbox/status` - Worker and queue statistics
  - `POST /api/sync/outbox/run` - Manual batch processing
  - `POST /api/sync/outbox/retry-failed` - Retry all failed jobs
  - `GET /api/sync/data-health` - Comprehensive sync health overview
  - `POST /api/sync/entity/:entityType/:entityId/resync` - Resync specific entity
- **Data Health UI**: `/data-health` page with health score, entity sync stats, failed items tabs
- **Dev Toggles**: `FORCE_MONEYBIRD_FAIL=true`, `FORCE_YODECK_FAIL=true` for testing failure scenarios
- **UI Components**: `SyncStatusBadge` component on Screen and Advertiser detail pages with resync buttons

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Digital signage player management and screen synchronization. Features content resolution, detailed sync reporting, and content summaries.
- **Moneybird**: Accounting and invoicing software for invoice generation, contact sync, and SEPA Direct Debit.
    - **Authentication**: `MONEYBIRD_API_TOKEN` and `MONEYBIRD_ADMINISTRATION_ID`.
    - **Client**: `server/services/moneybirdClient.ts` with pagination, rate limiting, and 5-minute TTL cache.
    - **Database Tables**: `moneybird_contacts`, `moneybird_invoices`, `moneybird_payments` for synced data.
    - **Scheduled Sync**: 30-minute background sync with per-item error handling.
    - **Entity Linking**: Supports linking Moneybird contacts at screen, location, and advertiser levels, with auto-matching and a `ResolveWizard` for manual linking.
- **Postmark**: Email integration for contract confirmations and SEPA mandate requests.
    - **Configuration**: `POSTMARK_SERVER_TOKEN` env var, consistent From: "Elevizion <info@elevizion.nl>"
    - **Email Deliverability Tab**: Settings → E-mail shows DNS records (SPF, DKIM, DMARC) with copy-to-clipboard
    - **API Endpoint**: `GET /api/email/config` returns email configuration and deliverability status
    - **Plain-text Generation**: Auto-generates plain-text version from HTML for multipart emails
    - **Template System**: Central `baseEmailTemplate()` wrapper with external logo and professional footer