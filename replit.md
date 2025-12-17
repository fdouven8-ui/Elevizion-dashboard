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