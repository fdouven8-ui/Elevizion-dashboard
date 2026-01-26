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
- **UI/UX**: Pages-based structure with a sidebar, breadcrumb navigation, and Dutch UI. Features KPI tiles, dedicated modules for screens, ads, advertisers, settings, finance, and quick-create onboarding flows via public portals with `portal_tokens` and `location_tokens`. Consistent branding across all pages.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer with business logic in storage service.

### Data Model
Core entities include: Entities (unified for ADVERTISER + SCREEN), Sites, Advertisers, PackagePlans, Contracts, Placements, ScheduleSnapshots, Invoices/Payments, and Payouts/CarryOvers. The `entities` table centralizes advertiser and screen data.

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
- **Yodeck Media Linking**: Manages Yodeck media item lifecycle.
- **Integration Outbox Pattern**: Ensures transactional consistency for external APIs using an `integration_outbox` table, idempotency keys, and a background worker.
- **Contract Signing**: Internal OTP-based digital contract signing with audit trails, including HTML-to-PDF generation.
- **Lead Workflow Management**: Tracks lead status (OPEN, BEHANDELD, VERWIJDERD) with soft-delete capabilities.
- **Location Onboarding**: A 2-phase workflow (intake, contract acceptance) using a 9-state process and dual token system.
- **Company Profile System**: Centralized, database-backed singleton for company branding and details with caching.
- **Revenue Allocation Engine**: Calculates weighted screen-days allocation for location payouts with a minimum threshold and carry-over system.
- **Template Management System**: Database-driven templates for communications with dynamic content `{{placeholder}}` syntax.
- **Email Logging**: Tracks all sent emails with status and integrates with Postmark.
- **System Health Check**: Comprehensive admin page (`/system-health`) for validating all configurations, integrations, and workflows, featuring test actions.
- **Unified Availability Service**: Count-based capacity system with `MAX_ADS_PER_SCREEN=20`. `availabilityService.ts` provides a single source of truth for screen capacity. Capacity is consumed when a contract is signed. Only `active` and `readyForAds` locations contribute to sellable screens.
- **Capacity Gating System**: Uses the unified `availabilityService` to check availability before allowing contract signing, preventing overselling.
- **City-Based Targeting**: Dynamic region selection based on actual location cities.
- **Waitlist System**: Allows advertisers to join a waitlist when capacity is unavailable, featuring a background capacity watcher, 48-hour claim tokens, an admin management page, and a cross-device claim flow with `ClaimPrefill` records for transactional single-use enforcement.
- **Re-simulate Before Publish**: Ensures plans are re-simulated before publishing to detect capacity/exclusivity changes.
- **Video Upload Portal**: Self-service portal (`/upload/:token`) for advertisers to upload video content. Features token-based authentication, video validation via `ffprobe`, auto-renaming, object storage integration, drag-and-drop UI, and auto-transcoding of non-standard video formats.
- **Admin Video Review Workflow**: Mandatory admin approval for uploaded videos at `/video-review`, including proposal preview for screen matching, automatic placement plan creation upon approval, and email notifications.
- **Auto-Playlist Provisioning & Cleanup Service**: Ensures screens have valid, sellable playlists by enforcing canonical naming, cleaning up stale mappings, resolving duplicates, and auto-creating playlists via the Yodeck API.
- **Tag-Based Publishing System**: Production-hardened ad publishing using Yodeck media tags for scalability and robust error tracking.
- **Layout-Based Content Separation**: 2-zone layout system with 30% BASE (left) for baseline content and 70% ADS (right) for advertisements. Admin page at `/layouts` manages layout configuration per location. Includes API probing with cached status, idempotent playlist/layout creation, and fallback schedule mode when Yodeck layouts API is unavailable.
- **Yodeck Screen Mapper**: Centralized `yodeckScreenMapper.ts` as single source of truth for interpreting Yodeck screen status. Handles all known API field variants (`default_playlist_type`, `content_type`, `layout`, `current_layout`, etc.) with robust fallbacks and logging.
- **Yodeck Debug Tools**: Admin page at `/admin/yodeck-debug` with raw JSON display, status mapping info, Yodeck links, and force layout tools. Raw debug endpoints at `/api/admin/yodeck/raw/screens/:id`, `/api/admin/yodeck/raw/layouts/:id`, `/api/admin/yodeck/raw/playlists/:id`.
- **Canonical Screen Status Model**: `CanonicalScreenStatus` interface in `shared/schema.ts` defines the standard for LIVE screen state from Yodeck API. Maps from Yodeck API v2 `screen_content` fields via `yodeckScreenMapper`. Endpoint `/api/admin/canonical-screens` returns this model. For cached DB data, use `/api/screens/with-business`.
- **Unified Screen Hook**: Frontend uses `useCanonicalScreens` hook (`client/src/hooks/useCanonicalScreens.ts`) as the SINGLE source of truth for live Yodeck screen data. Provides `screens`, `refresh()`, `getScreenByLocationId()`, `getScreenByYodeckId()`, `ensureCompliance()`, and `forceReset()` functions. Used by Schermen page (for live status badges) and YodeckDebug page (for debug operations).
- **Unified Screen Content Service**: Backend `yodeckScreenContentService.ts` provides `ensureCompliance()`, `forceReset()`, and `verifyLocation()` with v2 API format priority and FALLBACK_USED logging for legacy format fallbacks.
- **Screen Content Operations**: Two distinct paths for screen content assignment:
  - **Layout Mode** (`yodeckLayoutService.ts`): Uses 2-zone layouts with BASE/ADS playlists. Functions: `assignLayoutToScreen`, `forceResetScreenContent`, `ensureEmptyResetPlaylist`.
  - **Playlist Mode** (`yodeckPublishService.ts`): Single playlist assignment for screens not using layouts. Function: `ensureScreenPlaylistAssignment`.
- **FAIL FAST Principle**: If `screen_content` cannot be read, `sourceType = "unknown"`. Never guess, never infer, never fall back silently.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content resolution.
- **Moneybird**: Accounting and invoicing software for invoice generation, contact synchronization, and SEPA Direct Debit.
- **Postmark**: Email service for transactional emails and deliverability monitoring.