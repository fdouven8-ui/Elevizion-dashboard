# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for managing digital signage networks. Its primary goal is to ensure high screen uptime, efficient ad delivery, rapid location onboarding, and streamlined automation using a unique `SCREEN_ID`. Key capabilities include real-time screen monitoring, comprehensive advertiser and ad creative management, intuitive onboarding wizards, and flexible automation rules. The project aims to provide immediate answers to critical operational questions through a simplified, Dutch-language interface, enhancing efficiency and operational control.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Language: Dutch (Nederlands) - All UI text, labels, buttons, and navigation items are in Dutch.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, and Vite. It uses Wouter for routing, TanStack React Query for state management, and shadcn/ui (Radix UI + Tailwind CSS v4) for UI components. Forms are handled with React Hook Form and Zod validation. The UI/UX features a pages-based structure with consistent navigation, KPI tiles, and modules for screens, ads, advertisers, settings, and finance. Quick-create onboarding flows are accessible via public portals with token-based authentication.

#### Customer Portal (Mini Dashboard)
- **Layout**: `PortalLayout` component with sidebar navigation (Overzicht, Schermen, Video, Facturatie, Uitloggen)
- **Auth pages** (`/portal/login`, `/portal/signup`): No sidebar layout
- **Dashboard pages** (wrapped in PortalLayout):
  - `/portal` — Overview: company info, plan, screen count, status, onboarding CTA
  - `/portal/screens` — Plan selection + screen selection with city filters
  - `/portal/video` — Upload link (blocked when onboarding incomplete)
  - `/portal/billing` — Placeholder for future invoicing
  - `/portal/onboarding` — Legacy onboarding wizard (also in layout)
  - `/portal/status` — Legacy status page (also in layout)
- **Plans table** includes: code, name, maxScreens, priceMonthlyCents, minCommitMonths
- **Admin seed**: `POST /api/admin/plans/seed` — idempotent upsert of 3 plans (Starter/Local Plus/Premium)

### Backend
The backend is an Express.js application written in TypeScript, providing a RESTful API. It uses a centralized `storage.ts` for database abstraction and PostgreSQL with Drizzle ORM for data persistence. Zod schemas are used for data validation, with business logic primarily residing within the storage service.

### Authentication & Authorization
Authentication uses username/password with bcrypt hashing and session data stored in PostgreSQL. User access is controlled by five predefined roles enforced by `requireRole()` middleware.

### System Design Choices
- **Centralized `SCREEN_ID`**: Primary identifier for all operations.
- **Yodeck Integration**: Backend services with caching for Yodeck statistics, a robust `YodeckClient` with retry and rate limiting, and Yodeck media management.
- **Screenshot Analysis**: Uses Perceptual Hashing (pHash) for detecting empty screens and content matching.
- **Operational Prioritization**: Alerts for `offline_screen`, `onboarding_hint`, `unmanaged_content`, and `paused_placement`.
- **Integration Outbox Pattern**: Ensures transactional consistency for external APIs.
- **Contract Signing**: Internal OTP-based digital contract signing with audit trails and HTML-to-PDF generation.
- **Lead & Location Management**: Tracks lead workflows and a 2-phase, 9-state location onboarding process.
- **Revenue Allocation**: Engine for calculating weighted screen-days for location payouts.
- **Communication & Logging**: Database-driven template management and comprehensive email logging.
- **System Health**: Dedicated admin page (`/system-health`) for comprehensive health checks.
- **Unified Availability Service**: Manages capacity (`MAX_ADS_PER_SCREEN`) to prevent overselling.
- **Ad Publishing Workflow**: Includes video upload portals, validation, object storage integration, transcoding, and an admin review workflow for approval.
- **Simple Playlist Model**: Manages playlists with a "Basis playlist" and one screen playlist per screen, ensuring synchronization and ad delivery. It includes robust verification steps for media inclusion and playback state, and intelligent ad selection based on targeting.
- **Shared Playlist Guard**: Automatically detects and fixes instances where playlists are shared between screens, ensuring unique playlist assignments.
- **Admin Endpoints**: Provides various administrative functionalities including playlist rebuilds, Yodeck integration status, media inspection, and advertiser asset management. Key admin endpoints:
  - `POST /api/admin/yodeck/sync-playlist-mappings`: Syncs DB playlist IDs from live Yodeck player assignments
  - `POST /api/admin/autopilot/ensure-baseline-playlist`: Ensures baseline playlist exists in Yodeck
  - `POST /api/admin/yodeck/cleanup-duplicates`: Safe duplicate media cleanup (supports dryRun)
  - `GET /api/admin/advertisers/:id/mapping-health`: Enhanced health check with playlist IDs, live names, baseline status, media validation
  - `GET /api/admin/truth/verify?locationId=...`: Deterministic single-source-of-truth verification (screens, baseline, canonicalMedia, pushProof, online)
  - `POST /api/admin/baseline/add-item`: Add media to baseline playlist, rebuild all screen playlists, push players, return proof
- **Yodeck Admin Service** (`server/services/yodeckAdminService.ts`): Centralized admin operations for playlist sync, baseline management, duplicate cleanup, truth verification, and mapping health checks.
- **Yodeck Truth Service** (`server/services/yodeckTruthService.ts`): Single source of truth for Yodeck account state, cleanup, and baseline sync. Key endpoints:
  - `GET /api/admin/yodeck/truth?locationId=...`: Full truth - baseline, screen playlists, keep sets (playlistIds + mediaIds), canonical media
  - `POST /api/admin/yodeck/cleanup`: Delete unused media/playlists with safety guards (dryRun, allowLarge, max 500 media / 200 playlists)
  - `POST /api/admin/yodeck/baseline/sync`: Deterministic baseline→screen sync with push and now-playing verification
- **Baseline Sync Service** (`server/services/baselineSyncService.ts`): Deterministic baseline-to-screen playlist synchronization with now-playing verification. Key endpoints:
  - `GET /api/admin/playlists/truth?locationId=...`: Single source of truth - baseline, screen playlists, mismatches, duplicates
  - `POST /api/admin/playlists/sync?push=true&locationId=...`: Sync baseline→screens, push players, verify now-playing
  - `POST /api/admin/playlists/baseline/add-item`: Add media to baseline, auto-sync all screens, push, verify
  - `POST /api/admin/playlists/migrate-live`: Fix DB playlistId from live Yodeck assignments
- **Shared Playlist Guard**: Automatically detects and fixes instances where playlists are shared between screens, ensuring unique playlist assignments.
- **Simple Playlist Model**: Manages playlists with a "Basis playlist" and one screen playlist per screen, ensuring synchronization and ad delivery. It includes robust verification steps for media inclusion and playback state, and intelligent ad selection based on targeting.
  - `playlistId` is the ACTIVE field used by all playlist operations (20+ references). `combinedPlaylistId` exists in schema but has 0 references in code.
- **System Health & Self-Heal Endpoints**: Tools for monitoring system configuration, fixing common issues like shared playlists, and performing smoke checks.
- **Screen Status Endpoints**: Provides real-time playback and device status information for screens.
- **Debug Endpoints**: A suite of read-only and diagnostic endpoints for Yodeck integration, storage inspection, and end-to-end testing.
- **Canonical Media Service**: Automatically resolves and ensures the validity of Yodeck media for advertisers, including search, upload, and URL-cloning strategies, and deduplication of assets. Features:
  - Post-failure Yodeck search: after upload/clone failure, re-searches Yodeck before marking REJECTED (ensures upload that created media but timed out still gets found)
  - Duplicate detection: `detectAndMarkYodeckDuplicates()` finds duplicate Yodeck media per advertiser, keeps best FINISHED one, marks others as `duplicate_unused`
  - `GET /api/admin/advertisers/:id/detect-duplicates`: Server-side duplicate detection endpoint
- **Media Migration Service**: Ensures all media is locally playable by migrating URL-based Yodeck media to local uploads, improving reliability and performance.
- **Transactional Upload Service**: Implements a robust multi-step process for media uploads to Yodeck, including presigned URLs, binary transfer, and status polling, with comprehensive tracking and failure handling. Features:
  - Upload idempotency guard: checks for existing completed/in-progress upload jobs before starting new ones (prevents duplicate Yodeck media)
  - Canonical state protection: terminal failures verify existing canonical media in Yodeck before clearing (prevents REJECTED when valid video exists)
- **Deterministic Publish Pipeline**: `ensureAdvertiserMediaUploaded()` always runs canonical resolution FIRST (validate existing → Yodeck search → upload → URL-clone), never depends solely on upload success.
- **API Routing Safety**: Enforces JSON-only responses for API routes and prevents HTML fallback for unknown API paths.
- **Environment Flags**: Utilizes flags like `TEST_MODE` and `ADS_REQUIRE_CONTRACT` to control system behavior and feature access.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: For type-safe database interaction.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content.
- **Moneybird**: For accounting, invoicing, contact synchronization, and SEPA Direct Debit.
- **Postmark**: Email service provider for transactional emails.