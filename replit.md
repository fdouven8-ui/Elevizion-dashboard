# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for managing digital signage networks. Its primary goal is to ensure high screen uptime, efficient ad delivery, rapid location onboarding, and streamlined automation using a unique `SCREEN_ID`. Key capabilities include real-time screen monitoring, comprehensive advertiser and ad creative management, intuitive onboarding wizards, and flexible automation rules. The project aims to provide immediate answers to critical operational questions through a simplified, Dutch-language interface, enhancing efficiency and operational control.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Language: Dutch (Nederlands) - All UI text, labels, buttons, and navigation items are in Dutch.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, and Vite. It uses Wouter for routing, TanStack React Query for state management, and shadcn/ui (Radix UI + Tailwind CSS v4) for UI components. Forms are handled with React Hook Form and Zod validation. The UI/UX features a pages-based structure with consistent navigation, KPI tiles, and modules for screens, ads, advertisers, settings, and finance. Quick-create onboarding flows are accessible via public portals with token-based authentication.

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
- **Communication & Logging**: Database-driven template management and comprehensive email logging via Postmark.
- **System Health**: Dedicated admin page (`/system-health`) for comprehensive health checks.
- **Unified Availability Service**: Manages capacity (`MAX_ADS_PER_SCREEN`) to prevent overselling.
- **Ad Publishing Workflow**: Includes video upload portals, validation, object storage integration, transcoding, and an admin review workflow for approval.
- **Single Playlist Model** (CURRENT): Each screen has exactly ONE canonical playlist (`screen.playlistId`) named "EVZ | SCREEN | {playerId}". This replaces the previous 3-playlist model (BASELINE, ADS, COMBINED) to prevent playlist explosion.
  - **Key Service**: `singlePlaylistService.ts` with:
    - `getCanonicalScreenPlaylist()`: Resolves or creates the ONE playlist per screen (creation only via admin endpoints)
    - `reconcileScreenPlaylist()`: Idempotent filling with baseline items (from configured playlist) + approved ads
    - `getScreenNowPlayingSimple()`: READ-ONLY endpoint that never creates playlists
    - `detectOrphanedPlaylists()`: Reports orphaned playlists for cleanup
  - **Hard Rules**:
    - `now-playing` endpoint NEVER creates playlists (read-only)
    - Baseline items loaded from `AUTOPILOT_BASELINE_PLAYLIST_ID` configuration
    - Reconcile is strict: fails if mutations fail or verification fails
    - Layout mode is forbidden; screens must be in playlist mode
- **Admin Endpoints**:
  - `POST /api/admin/screens/:screenId/reconcile`: The ONLY endpoint that may create/fill a playlist
  - `POST /api/admin/yodeck/cleanup-playlists`: Report orphaned playlists (read-only, no delete)
  - `GET /api/admin/screens/:screenId/canonical-playlist`: Read-only playlist info
- **Upload Worker Service**: Handles a two-step upload process with retries and validation, tracking media status.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: For type-safe database interaction.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content.
- **Moneybird**: For accounting, invoicing, contact synchronization, and SEPA Direct Debit.
- **Postmark**: Email service provider for transactional emails.