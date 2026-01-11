# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room for digital signage network management. Its core purpose is to ensure high screen uptime, efficient ad delivery, fast onboarding, and simple automation for digital signage networks. The system uses `SCREEN_ID` (e.g., EVZ-001) as the central identifier. It provides real-time screen monitoring, advertiser/ad creative management, quick onboarding wizards, and automation rules, all within a simplified, Dutch-language interface. The project aims to instantly answer critical operational questions like "How many screens are running, how many ads are live, how many customers are paying?".

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
- **UI/UX**: Pages-based structure with a sidebar layout, breadcrumb navigation, and a Dutch language UI. Key pages include Home (`/dashboard`) with KPI tiles, dedicated modules for Schermen, Ads & Plaatsingen, Adverteerders, Instellingen, and a Finance page.
- **Onboarding**: Features quick-create flows and public portal pages for Advertiser and Location self-service, utilizing `portal_tokens` and `location_tokens` for secure, one-time access.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer with business logic in storage service.

### Data Model
Core entities include: **Entities** (unified model for ADVERTISER + SCREEN), Sites, Advertisers, PackagePlans, Contracts, Placements, ScheduleSnapshots, Invoices/Payments, and Payouts/CarryOvers. The `entities` table serves as a centralized hub for both advertisers and screens, linking to Moneybird contacts and Yodeck devices. The `advertisers` table includes comprehensive Moneybird contact fields.

### Authentication & Authorization
- **Provider**: Username/password with bcrypt hashing.
- **Session Storage**: PostgreSQL-backed via `connect-pg-simple`.
- **User Roles**: Five predefined roles with hierarchical access control and `requireRole()` middleware.

### System Design Choices
- **Yodeck Statistics Integration**: Backend service with 5-minute caching for screen and advertiser statistics.
- **Content Inventory Module**: Centralized YodeckClient with retry logic, pagination, rate limiting, and TTL-based caching for Yodeck content.
- **Screenshot Analysis**: Perceptual Hashing (pHash) for detecting empty/blank screens and matching creative content.
- **Control Room Action Priority**: Prioritizes `offline_screen`, `onboarding_hint`, `unmanaged_content`, and `paused_placement` for operational alerts.
- **Server-side Caching**: 10-second in-memory TTL cache for control room stats.
- **Yodeck Media Linking System**: Manages the lifecycle of Yodeck media items, allowing linking, unlinking, and archiving with advertisers.
- **Integration Outbox Pattern**: Ensures transactional consistency for external API operations using an `integration_outbox` table, idempotency keys, and a background worker with exponential backoff for retries. This includes sync status fields for entities and a comprehensive data health overview.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, content resolution, and detailed sync reporting.
- **Moneybird**: Accounting and invoicing software for invoice generation, contact synchronization, and SEPA Direct Debit. Features include a dedicated client with pagination and rate limiting, scheduled background sync, and entity linking capabilities.
- **Postmark**: Email integration for contract confirmations and SEPA mandate requests, with email deliverability status monitoring and a robust template system.

## Recent Feature Additions (Jan 2026)

### Lead Categorization System
- Auto-categorizes leads using keyword-based classification into 8 categories (Horeca, Sport & Fitness, Retail, etc.)
- Confidence scoring and user override capability via `finalCategory` field
- Supports both `advertiser_leads` and `screen_leads` tables

### Contract Auto-Draft & Versioning
- `contractDraftService.ts`: Generates HTML contract templates from advertiser and package data
- Versioning system for tracking signed contract changes with `contractEvents` table
- API endpoints: `/api/contracts/draft`, `/api/contracts/:id/versions`

### Revenue Allocation Engine
- Weighted screen-days allocation based on visitor staffels:
  - 0-300 visitors/week → ×0.8 weight
  - 301-700 visitors/week → ×1.0 weight
  - 701-1500 visitors/week → ×1.2 weight
  - 1501+ visitors/week → ×1.5 weight
- Location payouts with €25 minimum threshold and carry-over system
- Database tables: `revenue_allocations`, `location_payouts`

### Monthly Reporting Service
- Automated report generation for advertisers (screens, invoices, spending) and locations (revenue, payouts)
- Email templates with resend capability
- Database table: `monthly_reports`
- API endpoints: `/api/monthly-reports/generate`, `/api/monthly-reports/:id/resend`

### Onboarding Improvements
- CompletenessProgress component for visual form completion tracking
- Required field indicators with progress percentage
- Integrated in NewAdvertiserWizard and NewScreenWizard

### Enhanced Payouts UI
- Period selector (month/year) for historical data
- Revenue allocations table with weighted scores
- Visitor staffels explanation with visual cards
- Integration with new allocation/payout calculation APIs