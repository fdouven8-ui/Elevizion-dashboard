# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for managing digital signage networks. Its primary goal is to ensure high screen uptime, efficient ad delivery, rapid onboarding, and streamlined automation. The system uses `SCREEN_ID` (e.g., EVZ-001) as the central identifier and provides real-time screen monitoring, advertiser/ad creative management, quick onboarding wizards, and automation rules. The project aims to provide immediate answers to key operational questions in a simplified, Dutch-language interface.

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
- **UI/UX**: Pages-based structure with a sidebar, breadcrumb navigation, and Dutch UI. Features KPI tiles, dedicated modules for screens, ads, advertisers, settings, finance, and quick-create onboarding flows via public portals with `portal_tokens` and `location_tokens`.
- **UI Design**: Consistent Elevizion branding and styling across all public and internal pages.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer with business logic in storage service.

### Data Model
Core entities include: Entities (unified for ADVERTISER + SCREEN), Sites, Advertisers, PackagePlans, Contracts, Placements, ScheduleSnapshots, Invoices/Payments, and Payouts/CarryOvers. The `entities` table centralizes advertiser and screen data, linking to Moneybird contacts and Yodeck devices.

### Authentication & Authorization
- **Provider**: Username/password with bcrypt hashing.
- **Session Storage**: PostgreSQL-backed via `connect-pg-simple`.
- **User Roles**: Five predefined roles with hierarchical access control using `requireRole()` middleware.

### System Design Choices
- **Statistics Integration**: Backend service with caching for Yodeck screen and advertiser statistics.
- **Content Inventory**: Centralized `YodeckClient` with retry logic, pagination, rate limiting, and TTL-based caching.
- **Screenshot Analysis**: Perceptual Hashing (pHash) for detecting empty screens and matching content.
- **Control Room Prioritization**: Operational alerts prioritize `offline_screen`, `onboarding_hint`, `unmanaged_content`, and `paused_placement`.
- **Server-side Caching**: 10-second in-memory TTL cache for control room stats.
- **Yodeck Media Linking**: Manages Yodeck media item lifecycle (linking, unlinking, archiving).
- **Integration Outbox Pattern**: Ensures transactional consistency for external APIs using an `integration_outbox` table, idempotency keys, and a background worker with exponential backoff for retries.
- **Contract Signing**: Internal OTP-based digital contract signing with audit trails, replacing external services. Includes HTML-to-PDF generation and a public signing page.
- **Lead Workflow Management**: Tracks lead status (OPEN, BEHANDELD, VERWIJDERD) with soft-delete capabilities.
- **Location Onboarding**: A 2-phase workflow (intake, contract acceptance) for new locations using a 9-state process and dual token system.
- **Company Profile System**: Centralized, database-backed singleton for company branding and details, with caching and admin UI.
- **Revenue Allocation Engine**: Calculates weighted screen-days allocation for location payouts with a minimum threshold and carry-over system.
- **Template Management System**: Database-driven templates for emails, contracts, and other communications with dynamic content `{{placeholder}}` syntax.
- **Email Logging**: Tracks all sent emails with status and integrates with Postmark.
- **System Health Check**: Comprehensive admin page (`/system-health`) for validating all configurations, integrations, and workflows. Includes 8 check groups: Company Profile, Email/Postmark, Contract/OTP, Moneybird, Yodeck, Leads/Forms, Advertiser Workflow, and Location Workflow. Features test buttons for sending test emails, creating test Moneybird contacts, running Yodeck syncs, and creating test leads. Enhanced with placement data completeness checks (locations without regionCode/categories/capacity config, stale syncs, online locations without playlist).
- **Unified Availability Service**: Count-based capacity system with MAX_ADS_PER_SCREEN=20. Central `availabilityService.ts` provides single source of truth for both `/api/regions/active` and capacity gate. Availability calculated as locations where `activeAdsCount < MAX_ADS_PER_SCREEN`, independent of Yodeck mapping or online status.
- **Capacity Gating System**: Uses unified availabilityService (not placementEngine simulation) to check availability before allowing contract signing. Client-side waitlist display when clicking "Volgende" on step 2 with insufficient capacity - no server call needed. Prevents overselling by validating capacity before onboarding.
- **City-Based Targeting**: Dynamic region selection in /start flow based on actual location cities. API `/api/regions/active` returns cities from active locations with counts. PlacementEngine uses `effectiveRegion = regionCode || city.toLowerCase()` for matching. Searchable city selector with chips UI replaces static province dropdown.
- **Waitlist System**: When capacity is unavailable, advertisers can join a waitlist (WaitlistRequest with WAITING/INVITED/CLAIMED/EXPIRED/CANCELLED states). Includes:
  - Background capacity watcher worker (30-minute interval) that checks WAITING requests and sends invite emails when capacity becomes available
  - 48-hour claim tokens with SHA256 hashing
  - Admin Wachtlijst page (`/wachtlijst`) for managing waitlist requests
  - Automatic reset of expired invites back to WAITING for re-invitation
  - **Cross-device claim flow** with ClaimPrefill records:
    - Claim confirmation creates a prefill record with 60-minute expiry
    - User redirected to /start?prefill={id} with form data pre-filled
    - Works across devices (claim on mobile, continue on desktop via API fetch)
    - **Transactional single-use enforcement**: Prefill consumption and advertiser creation wrapped in database transaction
    - Concurrent submissions handled atomically (WHERE usedAt IS NULL guard)
    - Failed advertiser creation rolls back prefill consumption
    - 410 response for expired, used, or concurrently consumed prefills
- **Re-simulate Before Publish**: Single and bulk publish endpoints re-simulate plans before publishing to detect capacity/exclusivity changes since approval. Plans revert to WAITING if simulation fails.
- **Video Upload Portal**: Self-service portal (`/upload/:token`) for advertisers to upload their own video content. Features:
  - Token-based authentication via `portal_tokens` with SHA256 hashing and usage tracking
  - Video validation using ffprobe: MP4 format, 1920x1080 resolution, contract-specific duration (±0.5s tolerance)
  - **Auto-rename**: Server generates canonical filename `ADV-{COMPANYSLUG}-{LINKKEY}-{TIMESTAMP}.mp4`, no user renaming required
  - Asset workflow states: none → uploaded_invalid → uploaded_valid → ready_for_yodeck → live
  - Object Storage integration for file persistence (100MB limit)
  - Drag-and-drop UI with real-time upload progress, shows stored filename after upload

## Unified Availability & Waitlist System (v2)

### Single Source of Truth
- `availabilityService.ts` is the ONLY place where screen capacity is calculated.
- All UI steps and backend checks MUST use data derived from: `GET /api/regions/active`
- No other component may re-calculate availability independently.

### Capacity Rules
- **MAX_ADS_PER_SCREEN = 20**
- A screen has space if: `activeAdsCount < 20`
- **Signed = reserved**: Capacity is consumed as soon as a contract is signed
- `activeAdsCount` includes placements where: `signedAt IS NOT NULL OR status IN ('signed', 'active')`
- Draft, proposed, pending, cancelled, expired placements NEVER consume capacity.

### Sellable Screens Definition
- Only "sellable" screens are counted:
  - Location must be `status='active'` AND `readyForAds=true`
- Online/offline status and Yodeck playlist/screen mapping are NOT used for capacity.

### Unified Flow Behavior
- City selector shows: "X scherm(en) met plek"
- Package validation compares: `requiredScreens` (package) vs `screensWithSpace` (from availabilityService)
- If insufficient capacity: Waitlist card is shown immediately (client-side, no extra fetch)
- If sufficient capacity: User proceeds to billing

### Waitlist System
- Minimal required fields: `companyName`, `contactName`, `email`, `packageType`, `businessCategory`
- Address fields are optional
- Server-side de-duplication: Existing WAITING/INVITED entries are updated instead of duplicated
- Users are notified automatically when capacity becomes available

### System Health Monitoring
- Group: "Beschikbaarheid & Wachtlijst"
- Metrics:
  - Total sellable screens
  - Screens with space (count + %)
  - Cities with zero available space (top 5 shown with action link)
  - Waitlist registrations (24h / 7d)
  - Waitlist backlog (WAITING + INVITED)
- Thresholds:
  - <10% screens with space → WARNING
  - 0% screens with space → FAIL
  - Waitlist backlog > 20 → WARNING
- Health checks include `actionUrl`/`actionLabel` to guide admins to fixes

### Explicit Non-Rules
Availability MUST NOT depend on:
- Online/offline status
- Yodeck playlist or screen mapping
- Frontend-only calculations

Any new feature affecting capacity MUST integrate with `availabilityService`.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content resolution.
- **Moneybird**: Accounting and invoicing software for invoice generation, contact synchronization, and SEPA Direct Debit, with scheduled background sync.
- **Postmark**: Email service for contract confirmations, SEPA mandate requests, and deliverability monitoring, integrated with a robust template system.