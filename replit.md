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
    - **Home page (`/dashboard`)**: Owner-focused overview with 4 compact main KPI tiles (Screens online/offline, Ads online, Paying advertisers). "Ads online" is clickable and expands a detail panel showing: Actieve placements, Ads op schermen, Ads gekoppeld, Ads niet gekoppeld, Overig content, Schermen met/leeg content. Uses reusable `KpiCard` component with support for onClick, isActive, hasDetails props. "Actie Overzicht" section below shows operational items.
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
Core entities: Screens (primary entity = SchermLocatie), Advertisers, LocationGroups (for rare multi-screen locations), PackagePlans, Contracts, Placements, ScheduleSnapshots (immutable monthly records), Invoices/Payments, and Payouts/CarryOvers. Monthly snapshots ensure billing accuracy.

**CRITICAL BUSINESS RULE: 1 Screen = 1 Location (99% of cases)**
- Each screen is treated as its own location ("SchermLocatie" concept)
- Screens have their own direct Moneybird link (`moneybirdContactId` + `moneybirdContactSnapshot`)
- NO automatic grouping of screens by shared Moneybird contact
- Multi-screen locations are explicit exceptions via `isMultiScreenLocation` + `locationGroupId`

**Data Source Separation:**
- **Yodeck** = device data source: device ID, player name, online/offline status, last_seen, content metadata
- **Moneybird** = customer data source: company name, contact person, email, phone, address, KvK, BTW
- Yodeck sync NEVER touches Moneybird fields
- Moneybird sync NEVER touches Yodeck fields

**Display Name Priority:** Moneybird company > Yodeck device name > screen name > screenId fallback

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
- **Yodeck Media Links Table**: `yodeck_media_links` table tracks detected media items for Moneybird advertiser linking with normalized name keys, category (ad/non_ad), and advertiser/placement mapping fields.
  - Sync populates both `yodeck_creatives` (legacy) and `yodeck_media_links` (new) tables for consistency.
  - normalizedKey generation includes fallback for empty/emoji-only names: `media_${id}`.
  - **GET /api/yodeck/media-mappings**: Returns all media links for admin UI mapping management.
  - **POST /api/yodeck/media-mappings**: Updates advertiser/placement mappings for a specific yodeckMediaId.
- **Home KPI Data Pipeline**: Control room stats (`/api/control-room/stats`) use `getYodeckMediaLinkStats()` for ads classification:
  - `adsTotal`: Total number of ads detected on screens
  - `adsUnlinked`: Ads without advertiser/placement mapping
  - `nonAdsTotal`: Non-ad content (NOS nieuws, weer, etc.)
- **Screen Content Items (Inferred Placements)**: `screen_content_items` table tracks per-screen Yodeck media with unique index on (screenId, yodeckMediaId).
  - Populated during scheduled sync with category (ad/non_ad), duration, and link status
  - `markScreenContentItemsInactive()` sets isActive=false for removed media
  - **GET /api/screens/:id** returns `currentContent` array for detail page display
  - **Screen Detail Page**: "Gedetecteerde content" card shows detected media with category badges (Advertentie/Overig) and link status (Gekoppeld/Niet gekoppeld)

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
  - **Auth**: `MONEYBIRD_API_TOKEN` (personal access token) + `MONEYBIRD_ADMINISTRATION_ID`
  - **Client**: `server/services/moneybirdClient.ts` with pagination, rate limiting (1000 req/5min), and 5-minute TTL cache
  - **Database Tables**: `moneybird_contacts`, `moneybird_invoices`, `moneybird_payments` for synced data
  - **Scheduled Sync**: 30-minute background sync with per-item error handling (partial failures don't abort)
  - **API Endpoints**:
    - **GET /api/integrations/moneybird/status**: Config status and sync stats
    - **POST /api/sync/moneybird/run**: Manual sync trigger (contacts, invoices, payments)
    - **GET /api/moneybird/contacts**: List synced contacts
    - **GET /api/moneybird/invoices**: List synced invoices
    - **POST /api/moneybird/contacts/:id/link**: Link contact to advertiser
    - **POST /api/locations/:id/link-moneybird**: Link location to Moneybird contact
    - **POST /api/advertisers/:id/link-moneybird**: Link advertiser to Moneybird contact
    - **GET /api/ontbrekende-gegevens**: Overview of missing data (screens without location, locations without Moneybird)
  - **Permissions**: `manage_integrations` for sync/config, `view_finance` for reading data
  - **Entity Linking to Moneybird**: Three levels of Moneybird linking supported:
    - **Screen-level**: Direct `moneybirdContactId` and `moneybirdSyncStatus` fields on screens table
    - **Location-level**: `moneybirdContactId` on locations table (syncs address/contact info from Moneybird)
    - **Advertiser-level**: `moneybirdContactId` on advertisers table
  - **Link Priority**: UI checks screen-level first, then falls back to location-level for displaying link status
  - **POST /api/screens/:id/link-moneybird**: Direct screen-to-Moneybird linking (also updates placeholder location)
  - **Auto-match Service**: `POST /api/locations/auto-match-moneybird` finds matching Moneybird contacts based on name/city similarity with confidence scores (0.92+ auto-links, 0.5+ suggests)
  - **Resolve Wizard**: `ResolveWizard.tsx` component steps through unlinked locations/advertisers for manual Moneybird linking
- **Yodeck Sync Improvements**:
  - Each new screen automatically gets its own placeholder location (1 screen = 1 location default)
  - Locations have `isPlaceholder` (auto-created) and `source` (manual/yodeck) fields
  - Placeholder locations need Moneybird linking to populate address/contact details
- **Navigation**:
  - "Locaties" menu item in sidebar with Building2 icon
  - `/locations` overview page with Moneybird status badges (Gekoppeld/Ontbreekt) and address completeness badges
  - `/locations/:id` detail page for Moneybird contact linking with address display (read-only from Moneybird)
  - Home dashboard "Data Compleetheid" widget with actionable links to Schermen/Locaties pages
- **Screens Page UX Improvements**:
  - Banner showing "X schermen zonder Moneybird koppeling" with filter button
  - Inline "Koppel" dropdown per screen row for direct Moneybird contact linking
  - Filter state via URL query param `?moneybird=missing` for deep linking from Home

## Moneybird Setup

### Required Secrets
1. **MONEYBIRD_API_TOKEN**: Personal access token from Moneybird
   - Get it at: Moneybird > Instellingen > Ontwikkelaars > Personal access tokens
   - Create a new token with "sales_invoices" and "contacts" scopes
2. **MONEYBIRD_ADMINISTRATION_ID**: The ID of your Moneybird administration
   - Find it in the URL when logged into Moneybird: `moneybird.com/123456789/...` (the number is the ID)

### Testing Sync
1. Set both secrets in Replit Secrets
2. Navigate to Instellingen > Integraties in the dashboard
3. Click "Test Moneybird" to verify connection
4. Click "Sync nu" or use the "Ontbrekende gegevens" page > "Sync Moneybird" button
5. Check logs for: `[Moneybird Sync] Opgehaald: X contacten`

### Troubleshooting
- **0 contacten opgehaald**: Check if MONEYBIRD_ADMINISTRATION_ID is correct and the token has access
- **401 Unauthorized**: Token is invalid or expired, create a new one
- **403 Forbidden**: Token doesn't have the required scopes (contacts, sales_invoices)

### Linking Flow
1. Sync Moneybird contacts via "Sync Moneybird" button
2. Go to "Ontbrekende gegevens" page
3. For each location without Moneybird: select a contact from dropdown and click link button
4. Address/city info from Moneybird is automatically synced to the location

## Other Integrations
- **SendGrid**: Email integration for contract confirmations and SEPA mandate requests.