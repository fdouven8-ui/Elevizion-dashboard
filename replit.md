# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for digital signage network management. Its primary purpose is to ensure high screen uptime, efficient ad delivery, fast onboarding processes, and simple automation for digital signage networks. The core principle is that `SCREEN_ID` (e.g., EVZ-001) is the mandatory central identifier across the system.

Key capabilities include:
- Real-time screen monitoring (status, alerts, uptime).
- Management of advertisers, ad creatives, and placement configurations.
- Quick onboarding wizards for screens, advertisers, and ad placements.
- Automation rules for alerts and inventory management.
- Simplified navigation focusing on essential operational aspects.

## User Preferences
- Preferred communication style: Simple, everyday language.
- **Language**: Dutch (Nederlands) - All UI text, labels, buttons, and navigation items are in Dutch.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **UI Components**: shadcn/ui (Radix UI primitives).
- **Styling**: Tailwind CSS v4 with CSS variables.
- **Forms**: React Hook Form with Zod validation.
- **UI/UX**: Pages-based structure, sidebar layout, breadcrumb navigation, Dutch language UI.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer, business logic in storage service.

### Data Model
Core entities include Advertisers, Locations, Screens, PackagePlans, Contracts, Placements, ScheduleSnapshots (immutable monthly records), Invoices/Payments, and Payouts/CarryOvers. Monthly snapshots ensure billing accuracy by freezing critical business data (contracts, locations, carry-overs) at the time of creation.

### Authentication & Authorization
- **Provider**: Replit OIDC authentication.
- **Session Storage**: PostgreSQL-backed via `connect-pg-simple`.
- **User Roles**: Five predefined roles (admin, finance, ops, viewer, partner) with hierarchical access control.
- **Permission Middleware**: `requireRole()` for route protection.
- **Audit Logging**: Tracks permission changes (role changes, activation/deactivation).

### UI/UX Decisions
- Dashboard features a "Control Room" with real-time stats and alerts.
- Onboarding via quick wizards.
- Specific sections for Schermen, Ads & Plaatsingen, Adverteerders, and Instellingen.
- **Screens module**: City-first organization with "Plaats" (city) as primary filter and "Locatie/Bedrijf" as secondary cascading filter. Table columns: Screen ID, Plaats, Locatie/Bedrijf, Status, Actieve plaatsingen, Actie. "Laatst gezien" removed from list view (only shown on detail page).
- **Placements module**: Operational-first design with 2 KPIs (Active placements, Placements on offline screens). No financial metrics. Filters: Plaats, Locatie/Scherm, Adverteerder, Status. Search matches advertiser, screen ID, location, city. Table columns: Adverteerder, Plaats, Locatie/Scherm, Creative, Periode, Status (with warning badges), Actie. Placement detail page shows advertiser, screen/location, creative, period, status with warnings, and actions (Pause/Resume, Move, Open in Yodeck).
- "Template Center" for managing various communication templates with versioning and preview.
- "Cold Walk-in Onboarding Wizard" for rapid field onboarding of locations and advertisers.
- Sales pipeline with Kanban board for lead management, including location surveys with photo upload and supply lists.
- Task management system with role-based filtering.
- Dashboard redesigned to be "Screen-First," showing visual cards with status indicators and active ads.
- Public landing page at `/` (dashboard moved to `/dashboard`).
- "Backup & Export" page for data backup (JSON/CSV).
- "Handleiding" page for Dutch user manual.

### Detail Pages (Owner-Friendly)
**Screen Detail Page** (`/screens/:id`):
- Header: Screen ID (EVZ-###), Location name, Online/Offline status, Last seen
- Action buttons: Open in Yodeck, Contact locatie, Plaats Ad
- Location/Contact block: Address, Contact person, Phone, Email, Notes
- "Wat draait er op dit scherm?" table: Advertiser (linked), Creative, Start/End dates, Status, Open placement link
- Statistics accordion: Uptime trend, offline incidents (coming when Yodeck is synced)

**Advertiser Detail Page** (`/advertisers/:id`):
- Header: Company name, Status badge
- Contactgegevens: Contact person, Phone, Email, Address (street/zipcode/city), BTW-nummer, KVK-nummer
- Moneybird link status, Notes, SEPA Incasso status
- Contract status cards, "Waar draaien mijn ads?" placements list, Payment status

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Digital signage player management and screen synchronization.
- **Moneybird**: Accounting and invoicing software for invoice generation, contact sync, and SEPA Direct Debit.
- **SendGrid**: Email integration for contract confirmations and SEPA mandate requests (requires API key configuration).

### Key NPM Dependencies
- `@tanstack/react-query`
- `drizzle-orm` / `drizzle-zod`
- `express`
- `date-fns`
- `zod`
- `shadcn/ui` (via Radix UI)