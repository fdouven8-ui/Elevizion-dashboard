# Elevizion Dashboard

## Overview

Elevizion Dashboard is a centralized management system for digital signage advertising operations. It serves as the single source of truth for managing advertisers, partner locations, screens, contracts, billing, and revenue-sharing payouts. The platform is designed to scale from 25 screens to 500+ screens with full automation capabilities.

The application manages:
- What advertisements run and where
- Contract and billing cycles
- Revenue sharing with partner locations (default 10%)
- Integration with external services (Yodeck for screen management, Moneybird for invoicing)

## User Preferences

- Preferred communication style: Simple, everyday language.
- **Language**: Dutch (Nederlands) - All UI text, labels, buttons, and navigation items are in Dutch.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers

The frontend follows a pages-based structure with shared components. The dashboard uses a sidebar layout with breadcrumb navigation.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful API endpoints under `/api/*`
- **Storage Layer**: Centralized `storage.ts` service that abstracts all database operations
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod

The backend implements a thin controller layer in routes - all business logic resides in the storage service layer.

### Data Model
Core entities with relationships:
- **Advertisers**: Companies that purchase advertising (revenue source)
- **Locations**: Partner businesses hosting screens (earn revenue share)
- **Screens**: Physical displays linked to locations, synced with Yodeck
- **PackagePlans**: Standardized advertising packages
- **Contracts**: Agreements linking advertisers to package plans
- **Placements**: Maps contracts to specific screens
- **ScheduleSnapshots**: Immutable monthly records for accurate billing
- **Invoices/Payments**: Billing cycle management
- **Payouts/CarryOvers**: Revenue sharing with location partners

### Build System
- Development: Vite dev server with HMR, proxied through Express
- Production: esbuild bundles server code, Vite builds client assets
- Database migrations: Drizzle Kit with `db:push` command

## External Dependencies

### Database
- **PostgreSQL**: Primary data store accessed via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database operations with schema defined in `shared/schema.ts`

### External Service Integrations
- **Yodeck API**: Digital signage player management for screen synchronization
  - Configured via `YODECK_API_TOKEN` environment variable
  - Syncs screen status and player information
  
- **Moneybird**: Dutch accounting/invoicing software integration
  - Used for invoice generation and contact synchronization
  - Stores `moneybirdContactId` on advertisers and `moneybirdInvoiceId` on invoices

### Key NPM Dependencies
- `@tanstack/react-query`: Server state management
- `drizzle-orm` / `drizzle-zod`: Database ORM and schema validation
- `express`: HTTP server framework
- `date-fns`: Date manipulation utilities
- `zod`: Runtime type validation
- Full shadcn/ui component set via Radix UI primitives

### Email Integration (SendGrid)
- **Status**: Code is ready, API key must be configured manually
- **Configuration**: Add `SENDGRID_API_KEY` environment variable with your SendGrid API key
- **Optional**: Set `SENDGRID_FROM_EMAIL` for custom sender address (default: noreply@elevizion.nl)
- **Features**:
  - Contract confirmation emails (`POST /api/email/contract/:contractId`)
  - SEPA mandate request emails (`POST /api/email/sepa/:advertiserId`)
  - Status check endpoint (`GET /api/email/status`)
- **Get API Key**: https://sendgrid.com/docs/ui/account-and-settings/api-keys/

## Authentication & Authorization

### Replit Auth Integration
- **Provider**: Replit OIDC authentication
- **Session Storage**: PostgreSQL-backed sessions via `connect-pg-simple`
- **User Storage**: `users` table with extended profile fields
- **Token Refresh**: Automatic refresh token handling

### User Roles
Five predefined roles with descending access levels:
- **admin**: Full system access, user management
- **finance**: Billing, invoices, payments access
- **ops**: Screens, locations, monitoring access
- **viewer**: Read-only dashboard access
- **partner**: Location-specific access (linked via `locationId`)

### Permission Middleware
Use `requireRole()` middleware for protected routes:
```typescript
import { isAuthenticated, requireRole } from "./replit_integrations/auth";
app.get("/api/users", isAuthenticated, requireRole("admin"), handler);
```

### Audit Logging
All permission changes are logged to `audit_logs` table:
- Role changes (`role_changed`)
- User activation (`activated`)
- User deactivation (`deactivated`)

## Recent Changes

### December 2025 - Dashboard Redesign (Screen-First)
- Redesigned dashboard to focus on screens as primary element
  - Visual card grid showing all screens with status indicators
  - Each screen card shows: online/offline status, location, all active ads
  - Ads display: advertiser name, seconds per loop, plays per hour
  - Offline screens highlighted with red border and alert banner
- Improved KPI cards: screen status, active campaigns, placements, unpaid invoices
- Fixed metrics to only count truly active placements (active placement + active contract)
- Top Advertisers now ranks by active placements on online screens only
- Added scrollable ad list per screen card for screens with many ads

### December 2025 - Public Landing Page
- Added public landing page at `/` for elevizion.nl
  - Hero section with main value proposition and CTAs
  - Services section explaining digital signage network
  - Benefits section with pricing packages (Starter, Professional, Enterprise)
  - Location partners section for potential hosting locations
  - Contact section with email links for adverteerders and locaties
  - Full Dutch language implementation
- Dashboard moved to `/dashboard` (was `/`)
- Updated meta tags for SEO (title, description, Open Graph, Twitter Cards)

### December 2025 - Backup & Handleiding
- Added Backup & Export page (`/backup`) for data backup and disaster recovery
  - Full JSON backup of all tables in one file
  - Per-table JSON and CSV exports for all major entities
  - Supports empty table exports with header-only CSV files
- Added Handleiding page (`/handleiding`) with Dutch user manual
  - Accordion-based explanation of all features
  - Common mistakes section with preventive guidance
  - All text in Dutch for Dutch-speaking users
- API endpoints: `/api/backup/full`, `/api/backup/:table`, `/api/backup/:table/csv`

### December 2025 - Phase 4 (Schema Alignment)
- Refactored snapshot routes to use normalized schema fields (periodYear/periodMonth instead of legacy year/month)
- Implemented immutable snapshot data by freezing contracts, locations, and carry-overs at snapshot creation time
- Invoice generation now uses frozen contract data from snapshot notes JSON
- Payout generation uses weight-based revenue distribution with frozen location data
- Fixed webhook deliveries to use correct fields (eventType, responseStatus, responseBody)
- Fixed creative approvals to use approvedAt/rejectedAt timestamps instead of action field
- Added Phase 4 schemas: webhooks, webhookDeliveries, creatives, creativeVersions, creativeApprovals, apiKeys

### December 2025 - Phase 3
- Added Partner Portal with Replit Auth integration
- Implemented role-based access control system
- Created Users management page for admins
- Added audit logging for permission changes
- Extended auth storage with role management functions

## Snapshot Immutability Design

Monthly snapshots freeze all relevant business data at creation time to ensure billing accuracy:
- `frozenContracts`: Contract pricing (monthlyPriceExVat, vatPercent) captured at snapshot time
- `frozenLocations`: Location revenue share settings (revenueSharePercent, minimumPayoutAmount)
- `frozenCarryOvers`: Pending carry-over amounts from previous periods
- `frozenTotalRevenue`: Calculated total revenue from active contracts

This data is stored in the snapshot's `notes` field as JSON and used by invoice/payout generation to guarantee consistent billing regardless of subsequent changes to live data.