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
- **UI/UX**: Pages-based structure with a sidebar, breadcrumb navigation, and Dutch UI. Features KPI tiles, dedicated modules for screens, ads, advertisers, settings, finance, and quick-create onboarding flows via public portals with `portal_tokens` and `location_tokens`.
- **UI Design**: Consistent Elevizion branding and styling across all public and internal pages.

### Backend
- **Framework**: Express.js with TypeScript.
- **API Pattern**: RESTful API (`/api/*`).
- **Storage Layer**: Centralized `storage.ts` for database abstraction.
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema Validation**: Zod schemas generated from Drizzle.
- **Architecture**: Thin controller layer with business logic in storage service.

### Data Model
Core entities include: Entities (unified for ADVERTISER + SCREEN), Sites, Advertisers, PackagePlans, Contracts, Placements, ScheduleSnapshots, Invoices/Payments, and Payouts/CarryOvers. The `entities` table centralizes advertiser and screen data, linking to Moneybird contacts and Yodeck devices.

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
- **Yodeck Media Linking**: Manages Yodeck media item lifecycle (linking, unlinking, archiving).
- **Integration Outbox Pattern**: Ensures transactional consistency for external APIs using an `integration_outbox` table, idempotency keys, and a background worker with exponential backoff for retries.
- **Contract Signing**: Internal OTP-based digital contract signing with audit trails, replacing external services. Includes HTML-to-PDF generation and a public signing page.
- **Lead Workflow Management**: Tracks lead status (OPEN, BEHANDELD, VERWIJDERD) with soft-delete capabilities.
- **Location Onboarding**: A 2-phase workflow (intake, contract acceptance) for new locations using a 9-state process and dual token system.
- **Company Profile System**: Centralized, database-backed singleton for company branding and details, with caching and admin UI.
- **Revenue Allocation Engine**: Calculates weighted screen-days allocation for location payouts with a minimum threshold and carry-over system.
- **Template Management System**: Database-driven templates for emails, contracts, and other communications with dynamic content `{{placeholder}}` syntax.
- **Email Logging**: Tracks all sent emails with status and integrates with Postmark.
- **System Health Check**: Comprehensive admin page (`/system-health`) for validating all configurations, integrations, and workflows. Includes 8 check groups: Company Profile, Email/Postmark, Contract/OTP, Moneybird, Yodeck, Leads/Forms, Advertiser Workflow, and Location Workflow. Features test buttons for sending test emails, creating test Moneybird contacts, running Yodeck syncs, and creating test leads.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Type-safe database operations.

### External Service Integrations
- **Yodeck API**: Manages digital signage players, screen synchronization, and content resolution.
- **Moneybird**: Accounting and invoicing software for invoice generation, contact synchronization, and SEPA Direct Debit, with scheduled background sync.
- **Postmark**: Email service for contract confirmations, SEPA mandate requests, and deliverability monitoring, integrated with a robust template system.