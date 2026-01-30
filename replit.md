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
- **Combined Playlist Architecture**: Each location gets ONE combined playlist ("EVZ | SCREEN | {LocationName}") containing base items and interleaved advertisements, with an automatic fallback video. This replaces previous layout-based systems.
- **Canonical Broadcast Service**: Acts as the single source of truth for all broadcast operations, ensuring each location has one canonical playlist (`location.yodeckPlaylistId`) and managing screen assignments and media additions.
- **Playlist-Only Guard**: Enforces 100% playlist mode; no screen is allowed to have `source_type="layout"`. Detects and auto-reverts layout modes to playlist.
- **Deterministic Publish Service** (NEW): Golden flow implementation with:
  - **Playlist Enforcer**: Forces screens from layout to playlist mode before any publish
  - **Canonical Playlist Resolution**: Creates/resolves "EVZ | SCREEN | {LocationName}" playlists per location
  - **Deterministic Playlist Mutation**: Deduplicates items, preserves existing content, appends new ads
  - **Hard Verification**: Only succeeds if specific ad mediaId is physically in playlist AND screen is in playlist mode
  - **Full Trace Logging**: correlationId, sourceTypeBefore/After, playlistMutation, verificationSnapshot
  - **No Soft Success**: If ad is not visible → publish FAILS with explicit error
- **Production Broadcast Engine**: A safety-first publish pipeline with eligibility gates for screens, media verification, and a robust fallback system to prevent black screens. It includes a `selfHealPlaylist()` function and a `publishWithVerifyAndHeal` flow.
- **Upload Worker Service**: Handles a two-step upload process with retries and validation, tracking media status.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: For type-safe database interaction.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content.
- **Moneybird**: For accounting, invoicing, contact synchronization, and SEPA Direct Debit.
- **Postmark**: Email service provider for transactional emails.