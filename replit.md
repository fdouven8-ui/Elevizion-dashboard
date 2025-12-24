# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for digital signage network management. Its primary purpose is to ensure high screen uptime, efficient ad delivery, fast onboarding processes, and simple automation for digital signage networks. The core principle is that `SCREEN_ID` (e.g., EVZ-001) is the mandatory central identifier across the system. It aims to provide real-time screen monitoring, advertiser and ad creative management, quick onboarding wizards, and automation rules, all with a simplified, Dutch-language interface focused on essential operational aspects. The project's ambition is to answer key operational questions like "How many screens are running, how many ads are live, how many customers are paying?" instantly.

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
- **UI/UX Decisions**:
    - **Home page (`/dashboard`)**: Owner-focused overview with 4 KPI tiles (Screens online/offline, Ads online, Paying advertisers) and an "Actie Overzicht" for operational items (offline screens, screens without placements, paused placements).
    - **Onboarding**: Quick wizards for screens, advertisers, and ad placements.
    - **Modules**: Dedicated sections for Schermen, Ads & Plaatsingen, Adverteerders, Instellingen.
    - **Screens module**: City-first organization with "Plaats" as primary filter.
    - **Placements module**: Operational-first design with KPIs (Active placements, Placements on offline screens).
    - **Finance page (`/finance`)**: Minimal design showing paying customers and monthly recurring revenue (MRR) with a trend chart.
    - **Detail Pages**: Owner-friendly Screen and Advertiser detail pages with key information, action buttons, and integrated statistics (uptime, plays, top creatives).

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer, business logic in storage service.

### Data Model
Core entities: Advertisers, Locations, Screens, PackagePlans, Contracts, Placements, ScheduleSnapshots (immutable monthly records), Invoices/Payments, and Payouts/CarryOvers. Monthly snapshots ensure billing accuracy.

### Authentication & Authorization
- **Provider**: Username/password with bcrypt hashing.
- **Session Storage**: PostgreSQL-backed via `connect-pg-simple`.
- **User Roles**: Five predefined roles (eigenaar, finance, ops, viewer, partner) with hierarchical access control.
- **Permission Middleware**: `requireRole()` for route protection.
- **Audit Logging**: Tracks permission changes.
- **Auto Admin Initialization**: Admin user creation/sync on server startup via environment variables.

### System Design Choices
- **Yodeck Statistics Integration**: Backend service `server/yodeckStats.ts` with 5-minute caching, providing API endpoints for screen and advertiser statistics. Frontend uses Recharts for visualization with date range and granularity filters.
- **Content Inventory Module**: Centralized YodeckClient with retry logic, pagination, rate limiting, and TTL-based caching. Supports all Yodeck source types (playlist, layout, schedule, tagbased-playlist). Provides API endpoints for inventory loading and refreshing.
- **Screenshot Analysis with Perceptual Hashing (pHash)**: Used to detect empty/blank screens and match creative content when Yodeck API content detection is insufficient.
- **Control Room Action Priority**: Prioritizes `offline_screen`, `onboarding_hint`, `unmanaged_content`, and `paused_placement` statuses for operational alerts.
- **Server-side Caching**: 10-second in-memory TTL cache for `/api/control-room/stats` and `/api/control-room/actions` to reduce database load.
- **Memory Logging**: Optional via `DEBUG_MEMORY=true` - logs `process.memoryUsage()` every 60 seconds (RSS, Heap, External) for monitoring stability.
- **Unmanaged Content Display**: Shows "Yodeck content actief • X items (nog niet via Elevizion placements)" with playlist name, lastFetchedAt, and expandable media items list with duration badges.
- **Yodeck Media Links Table**: `yodeck_media_links` table tracks detected media items for future Moneybird advertiser linking with normalized name keys.

### Production Stability Features
- **Graceful Shutdown**: Handlers for SIGTERM/SIGINT with 5-second drain period, database pool cleanup, and scheduler stop.
- **Scheduled Background Sync**: 15-minute interval Yodeck content sync, starts 30 seconds after server boot to allow stabilization.
- **Sync Caching**: `clearAllCaches()` at start of each sync run, then `mediaCache` and `playlistCache` prevent duplicate API calls within run.
- **Reduced Logging**: `DEBUG_YODECK=true` flag gates verbose Yodeck sync logs, all detailed logs use `debugLog()` instead of `console.log()`.
- **Control Room DB-Only**: `/api/control-room/stats` and `/api/control-room/actions` use only database queries, no Yodeck API calls.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Digital signage player management and screen synchronization.
  - **Auth Priority**: 1) `YODECK_AUTH_TOKEN` (format: `label:apikey`), 2) `YODECK_TOKEN_LABEL` + `YODECK_TOKEN_VALUE`, 3) Database config
  - **ContentResolver**: Recursive content resolution (max depth 3, cycle detection) for playlist, tagbased-playlist, layout, schedule, media
  - **POST /api/sync/yodeck/run**: Per-screen distinctItemCount, breakdown (playlistsResolved/Failed, mediaItems, widgetItems, unknownItems), stats (screensTotal, screensOnline, screensWithYodeckContent, screensYodeckEmpty, contentUnknown, contentError)
  - **GET /api/yodeck/content/summary**: topItems (top 5 media), mediaItems (sorted by name with mediaType), totals (totalScreens, screensWithContent/Empty/Unknown/Error, top10Media)
- **Moneybird**: Accounting and invoicing software for invoice generation, contact sync, and SEPA Direct Debit.
- **SendGrid**: Email integration for contract confirmations and SEPA mandate requests.