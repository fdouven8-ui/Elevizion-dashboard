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
- **Simple Playlist Model** (CURRENT): Exactly 1 global "Basis playlist" + 1 screen playlist per screen.
  - **Key Service**: `simplePlaylistModel.ts` with:
    - `getBasePlaylistId()`: Finds "Basis playlist" in Yodeck (case-sensitive, cached)
    - `ensureScreenPlaylist()`: Ensures screen has exactly 1 playlist named "EVZ | SCREEN | {playerId}"
    - `syncScreenPlaylistFromBase()`: Copies items from base playlist to screen playlist
    - `addAdsToScreenPlaylist()`: Appends ad media IDs (deduplicated) WITH HARD VERIFICATION - re-fetches playlist after PATCH and fails if media not present
    - `applyPlayerSourceAndPush()`: Sets player source to playlist and verifies
    - `rebuildScreenPlaylist()`: Full rebuild with DOUBLE VERIFICATION:
      1. After addAds: Verify all ads added to playlist
      2. After push: FINAL re-fetch from Yodeck to confirm all expected mediaIds present
      - Returns `ok:false` with `AD_MEDIA_NOT_IN_PLAYLIST` error if verification fails
      - Response includes: actualMediaIds, expectedAdMediaIds, missingMediaIds
    - `getScreenNowPlayingSimple()`: READ-ONLY status check (returns actualSourceType, actualSourceId, actualSourceName, isCorrect, itemCount, topItems)
    - `getScreenPlaybackState()`: Single source of truth combining:
      - expected state (DB)
      - actual state (Yodeck) including REAL mediaIds from playlist
      - sync status with recommendedAction
    - `simulateRebuild()`: Dry-run simulation using same targeting/status logic as actual rebuild
  - **Targeting-Based Ad Selection** (in `rebuildScreenPlaylist`):
    - Uses `targetRegionCodes` (text[] array) and `targetCities` (comma-separated string) from advertisers
    - Matches screen's location city/region against advertiser targeting with normalization
    - Nationwide advertisers (no targeting) match ALL screens
    - Screens without location only receive nationwide advertisers
    - MAX_ADS_PER_SCREEN = 20 capacity limit enforced
    - Normalization handles Dutch prefixes ('s-, 't-) and diacritics
  - **Hard Rules**:
    - `now-playing` endpoint NEVER creates playlists (read-only)
    - Only `rebuild-playlist` endpoint may create/modify playlists
    - No COMBINED/ADS/BASELINE playlists per screen - only 1 screen playlist
    - Layout mode is forbidden; screens must be in playlist mode
- **Shared Playlist Guard** (in `ensureScreenPlaylist`):
  - Detects if playlistId is shared with another screen (NEVER allowed)
  - Automatically clears and creates new playlist if shared detected
  - Logs `SHARED_PLAYLIST_DETECTED: screen X shares playlistId Y with Z`
  - Validates playlist name matches `EVZ | SCREEN | {playerId}` convention
- **Admin Endpoints**:
  - `POST /api/admin/screens/:screenId/rebuild-playlist`: The ONLY endpoint that creates/modifies playlists
  - `POST /api/admin/screens/:screenId/rebuild-playlist?dryRun=true`: Simulate rebuild without mutations
  - `GET /api/admin/yodeck/base-playlist`: Read-only base playlist info
  - `GET /api/admin/yodeck/auth-status`: Validate Yodeck authentication
  - `GET /api/admin/yodeck/media/:id/inspect`: Debug endpoint for media validation (returns status, duration, isValid)
- **System Health & Self-Heal Endpoints**:
  - `GET /api/admin/system/config-health`: Returns config status (nodeEnv, testMode, yodeckConfigured, baselinePlaylist, warnings, errors)
  - `POST /api/admin/screens/self-heal`: 1-click fix for all screens (dryRun support) - ensures unique playlists, rebuilds, reports
  - `POST /api/admin/screens/fix-shared-playlists`: Detect and fix screens sharing same playlistId
  - `GET /api/admin/screens/smoke-check`: Verify invariants (unique playlists, base exists, naming convention)
- **Screen Status Endpoints**:
  - `GET /api/screens/:screenId/playback-state`: Single source of truth for UI - returns expected (DB), actual (Yodeck), sync status
  - `GET /api/screens/:screenId/now-playing`: READ-ONLY status check
  - `GET /api/screens/:screenId/device-status`: Unified online/offline status
- **Debug Endpoints** (always return JSON, never HTML):
  - `GET /api/yodeck/playlists/:id`: Fetch playlist data - explicitly JSON-only
  - `GET /api/debug/yodeck/playlist/:id/raw`: Raw playlist inspection with media status for each item
  - `GET /api/debug/yodeck/media/:id/status`: Media status (uploadOk, encodingStatus, playable)
  - `GET /api/debug/yodeck/media/:id/exists`: Check if media exists in Yodeck (name, status, filesize, created_at)
  - `GET /api/debug/yodeck/whoami`: Identify Yodeck workspace/account (tokenHashHint, sampleScreen, workspace info)
  - `GET /api/debug/yodeck/media/:id/raw`: Raw proxy for Yodeck media API (media details + status)
  - `POST /api/debug/yodeck/selftest`: Integration self-test (whoami + optional media check + playlists)
  - `GET /api/debug/yodeck/upload-jobs`: List recent upload jobs with status
  - `GET /api/debug/storage/object?key=<path>`: Inspect storage object (exists, contentType, contentLength, signedUrl)
  - `POST /api/admin/test-e2e-advertiser-upload`: Full 7-step E2E test (asset lookup → storage check → download → upload → verify media → rebuild → verify playback)
- **Transactional Upload Service** (transactionalUploadService.ts): Ensures uploads are 100% reliable:
  - **Step 1: CREATE_MEDIA**: POST /api/v2/media with `media_origin: { type: "video", source: "upload" }`, name ends with .mp4. Returns mediaId and get_upload_url (API endpoint, NOT presigned URL)
  - **Step 2: GET_PRESIGNED_URL**: **CRITICAL** - GET get_upload_url endpoint to retrieve actual S3 presigned URL. Response JSON contains `upload_url` field with the real PUT target
  - **Step 3: PUT_BINARY**: Presigned PUT to S3 URL with explicit Content-Length and Content-Type headers, requires 200/204. Logs timing diagnostics and response headers
  - **Step 3.5: FINALIZE (soft)**: Tries POST to /upload/complete, /upload/confirm, /upload/done - **SOFT WARNING if 404/405** (Yodeck may auto-finalize after PUT)
  - **Step 4: VERIFY_EXISTS_IMMEDIATELY**: GET /media/:id to confirm media exists, if 404 = FAILED
  - **Step 5: POLL_STATUS**: Poll until ready/ok or failed/404, timeout 120s, FAILED_INIT_STUCK if initialized after 20+ polls
  - **Job Tracking**: All steps recorded in `upload_jobs` table with finalState (CREATED, UPLOADED, VERIFIED_EXISTS, ENCODING, READY, FAILED)
  - **Finalize Tracking**: finalizeAttempted, finalizeStatus, finalizeUrlUsed columns in upload_jobs
  - **Database Integrity**: assetStatus="live" and yodeckMediaIdCanonical only set after READY status
  - **Failure Handling**: Sets assetStatus="ready_for_yodeck", clears yodeckMediaIdCanonical to prevent stale IDs
  - **ensureAdvertiserMediaIsValid()**: Checks if existing mediaId is valid in Yodeck, clears invalid IDs
- **Upload Worker Service** (DEPRECATED): Legacy upload path - disabled by default
  - Set LEGACY_UPLOAD_DISABLED=false to re-enable (not recommended)
  - All new uploads should use transactionalUploadService
- **API Routing Safety**:
  - All /api/* routes return JSON only (never HTML)
  - SPA fallback only for non-API routes
  - API 404 guard in static.ts prevents HTML responses for unknown API paths
- **E2E Test Endpoint**: POST /api/admin/test-yodeck-e2e
  - Full end-to-end test for Yodeck integration
  - Parameters: { screenId, advertiserId, forceUpload? }
  - Runs: validate advertiser → upload/verify media → rebuild playlist → verify playback-state
  - Returns HTTP 500 if any step fails (media missing, playlist mismatch, wrong source)
- **Environment Flags**:
  - `TEST_MODE=true`: Enables test mode, bypasses contract gating for ads
  - `ADS_REQUIRE_CONTRACT=false`: Allows ads without active contracts (default: true)
  - `LEGACY_UPLOAD_DISABLED=true`: Blocks legacy upload paths (default: true)
  - When TEST_MODE=true, ADS_REQUIRE_CONTRACT is automatically bypassed

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Drizzle ORM**: For type-safe database interaction.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content.
- **Moneybird**: For accounting, invoicing, contact synchronization, and SEPA Direct Debit.
- **Postmark**: Email service provider for transactional emails.