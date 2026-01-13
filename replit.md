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

### Template Management System
- Database-driven templates with `templates` table (name, category, subject, body)
- 10 default templates seeded via `/api/templates/seed-defaults` (6 email, 4 contract)
- Template categories: email, contract, whatsapp, invoice, internal
- `{{placeholder}}` syntax for dynamic content rendering

### Email Logging & Integration
- `email_logs` table tracks all sent emails with status (queued/sent/failed)
- `templateEmailService.ts`: Sends emails using database templates with Dutch branding
- Full Postmark integration with provider message ID tracking
- Settings UI tab "E-mail Logs" shows delivery history with Dutch status labels

### Contract Document Generation
- `contractTemplateService.ts`: Generates contracts from database templates
- `contract_documents` table stores rendered HTML with versioning
- API endpoints: `/api/contract-documents/generate`, `/api/contract-documents/:id/status`
- Full HTML output with Elevizion styling and signature blocks
- Status workflow: draft → sent → signed → declined/expired/cancelled

### Internal OTP Contract Signing (Jan 2026)
- **Digital contract signing** via internal OTP-based verification (replaces external SignRequest)
- **OTP verification flow**: 6-digit code via email → verify code → finalize with audit trail
- **Terms acceptance check**: Contracts can only be sent if `terms_acceptance` record exists
- **Database tables**:
  - `contract_documents`: Extended with `signProvider` ("internal_otp"), `otpCode`, `otpExpiresAt`, `otpSentAt`, `otpVerifiedAt`, `signStatus`, `signedPdfUrl`, `signerEmail`, `signerName`, `signerIp`, `signerUserAgent`
  - `terms_acceptance`: Tracks entity acceptance of general terms (entityType, entityId, acceptedAt, ip, userAgent, termsVersion, termsHash, source)
- **Services**:
  - `contractEngine.ts`: Central engine for OTP generation, verification, expiration (24-hour), and audit trail
  - `contractPdfService.ts`: HTML→PDF generation using Puppeteer (preserves branding/layout) with embedded audit trail
- **API endpoints**:
  - `POST /api/contract-documents/:id/send-for-signing`: Send OTP via email
  - `POST /api/contract-documents/:id/verify-otp`: Verify 6-digit OTP code
  - `POST /api/contract-documents/:id/finalize-signature`: Complete signing with audit trail PDF
  - `POST /api/contract-documents/:id/resend-otp`: Resend OTP email
  - `GET /api/contract-documents/:id/signing-status`: Check current signing status
  - `GET /api/contract-documents/:id/signed-pdf`: Download signed PDF
  - `GET /api/terms-acceptance/:entityType/:entityId`: Check terms acceptance
  - `POST /api/terms-acceptance`: Record terms acceptance
- **UI** (Settings → Templates → Gegenereerde Docs):
  - Sign status badges (Verzonden, OTP geverifieerd, Getekend, Afgewezen, Verlopen)
  - "Verstuur ter ondertekening" button (disabled if terms not accepted)
  - "Download getekende PDF" button
  - Legacy badge for old SignRequest contracts (read-only)
- **Sign status progression**: none → sent → verified → signed (or expired)
- **Public Signing Page** (`/contract-ondertekenen/:id`): Customer-facing page for OTP verification
  - Step-by-step wizard: view contract → enter OTP → confirm signature
  - Mobile-responsive design with Elevizion branding
  - Real-time status updates and error handling
- **AdvertiserDetail Integration**: 
  - One-click generate+send: generates contract and immediately sends OTP
  - Terms validation: blocks sending if `termsAcceptance?.accepted !== true`
  - Contract status badges with download signed PDF button