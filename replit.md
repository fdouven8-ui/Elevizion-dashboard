# Elevizion Dashboard

## Overview
Elevizion Dashboard is an OPS-first internal operations control room designed for managing digital signage networks. Its core purpose is to ensure high screen uptime, efficient ad delivery, rapid onboarding of new locations, and streamlined automation. The system uses a unique `SCREEN_ID` (e.g., EVZ-001) as the primary identifier for all operations. Key capabilities include real-time screen monitoring, comprehensive advertiser and ad creative management, intuitive quick onboarding wizards, and flexible automation rules. The project aims to provide immediate answers to critical operational questions through a simplified, Dutch-language interface, enhancing efficiency and operational control.

## User Preferences
- Preferred communication style: Simple, everyday language.
- Language: Dutch (Nederlands) - All UI text, labels, buttons, and navigation items are in Dutch.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using Vite for a fast development experience. Wouter handles routing, and TanStack React Query manages state. UI components are developed using shadcn/ui (based on Radix UI primitives) and styled with Tailwind CSS v4, leveraging CSS variables for theming. Forms are managed with React Hook Form, incorporating Zod for validation. The UI/UX follows a pages-based structure with a consistent sidebar and breadcrumb navigation. It features KPI tiles, dedicated modules for screens, ads, advertisers, settings, and finance, alongside quick-create onboarding flows accessible via public portals with token-based authentication.

### Backend
The backend is an Express.js application written in TypeScript, providing a RESTful API (`/api/*`). It utilizes a centralized `storage.ts` for database abstraction and PostgreSQL with Drizzle ORM for data persistence. Zod schemas, generated from Drizzle, are used for data validation. The architecture emphasizes a thin controller layer, with business logic primarily residing within the storage service.

### Data Model
Core entities include: a unified `entities` table for Advertisers and Screens, Sites, Advertisers, PackagePlans, Contracts, Placements, ScheduleSnapshots, Invoices/Payments, and Payouts/CarryOvers.

### Authentication & Authorization
Authentication uses a username/password system with bcrypt hashing. Session data is stored in PostgreSQL via `connect-pg-simple`. User access is controlled by five predefined roles with hierarchical access levels enforced by `requireRole()` middleware.

### System Design Choices
The system integrates various advanced functionalities:
- **Statistics & Content Management**: Backend services with caching for Yodeck statistics and a centralized `YodeckClient` with robust retry, pagination, rate limiting, and TTL-based caching.
- **Screenshot Analysis**: Perceptual Hashing (pHash) is used for detecting empty screens and matching content.
- **Operational Prioritization**: The control room prioritizes alerts such as `offline_screen`, `onboarding_hint`, `unmanaged_content`, and `paused_placement`.
- **Caching**: Server-side in-memory TTL caching (10 seconds) is applied to control room statistics.
- **Yodeck Media Management**: Manages the lifecycle of media items within Yodeck.
- **Integration Outbox Pattern**: Ensures transactional consistency for external APIs using an `integration_outbox` table, idempotency keys, and a background worker.
- **Contract Signing**: Internal OTP-based digital contract signing with audit trails and HTML-to-PDF generation.
- **Lead & Location Management**: Tracks lead workflows, manages a 2-phase, 9-state location onboarding process with dual tokens, and maintains a centralized company profile system.
- **Revenue Allocation**: A revenue allocation engine calculates weighted screen-days for location payouts, including minimum thresholds and carry-over mechanisms.
- **Communication & Logging**: Database-driven template management for dynamic communications and comprehensive logging of all outgoing emails via Postmark.
- **System Health**: A dedicated admin page (`/system-health`) provides comprehensive health checks, including configuration validation and test actions.
- **Unified Availability Service**: Manages a count-based capacity system (`MAX_ADS_PER_SCREEN=20`) to ensure accurate screen availability and prevent overselling, using `active` and `readyForAds` locations.
- **City-Based Targeting**: Enables dynamic region selection based on actual location cities.
- **Waitlist System**: Allows advertisers to join a waitlist when capacity is unavailable, featuring a background watcher, 48-hour claim tokens, and cross-device claim flows.
- **Ad Publishing Workflow**: Includes video upload portals with token-based authentication, validation, object storage integration, auto-renaming, and transcoding. An admin review workflow (`/video-review`) mandates approval, triggers automatic placement plan creation, and sends notifications.
- **Autopilot Ad Publishing**: Automatically targets and links approved ads to appropriate locations and their ADS playlists using `findLocationsForAdvertiser()` and `linkAdToLocation()`.
- **Layout-Based Baseline Content Architecture**: Baseline content (news, weather) is managed via a fixed Yodeck Layout ("Elevizion Baseline") rather than playlist media seeding. The autopilot system assigns this layout and only manages the ADS playlist for advertisements, ensuring content separation and consistency.
- **Auto-Playlist Provisioning & Cleanup**: Ensures screens have valid, sellable playlists through canonical naming, duplicate resolution, and auto-creation via the Yodeck API.
- **Tag-Based Publishing**: Utilizes Yodeck media tags for scalable and robust ad publishing, addressing Yodeck API v2 limitations regarding programmatic playlist item additions.
- **Content Guarantee System**: `seedAdsPlaylist()` ensures ADS playlists are never empty by using a fallback chain (approved ads → self-ad → any available Yodeck video) and leveraging media tagging when direct playlist append fails.
- **Layout-Based Content Separation**: Implements a 2-zone layout system (30% BASE, 70% ADS) for distinct content types, with admin configuration and API probing.
- **Yodeck Screen Mapper**: `yodeckScreenMapper.ts` acts as a central interpreter for Yodeck screen status, handling various API field formats with robust fallbacks.
- **Canonical Screen Status Model**: `CanonicalScreenStatus` in `shared/schema.ts` defines a standardized live screen state from the Yodeck API, accessible via `/api/admin/canonical-screens`.
- **Unified Screen Hook**: `useCanonicalScreens` in the frontend provides a single source of truth for live Yodeck screen data, supporting various operations and compliance checks.
- **Screen Content Operations**: Distinct paths for screen content assignment: `Layout Mode` (2-zone layouts) and `Playlist Mode` (single playlist), adhering to a "FAIL FAST" principle.
- **Canonical Playlist Management**: `yodeckCanonicalService.ts` provides the single control path for screen content operations, featuring a new architecture for layout-based baseline content, `ensureCanonicalSetupForLocation()`, and robust ad linking pipelines.
- **ELEVIZION_LAYOUT_SPEC**: Defines deterministic layout dimensions and provides helper functions for building and verifying Yodeck layout payloads.
- **Feature Flags**: Control legacy cleanup and logging for non-canonical data.

## External Dependencies

### Database
- **PostgreSQL**: The primary relational database.
- **Drizzle ORM**: Used for type-safe interaction with PostgreSQL.

### External Service Integrations
- **Yodeck API**: Integrates for managing digital signage players, screen synchronization, and content resolution.
- **Moneybird**: Used for accounting, invoicing, contact synchronization, and SEPA Direct Debit functionalities.
- **Postmark**: Utilized as the email service provider for transactional emails and deliverability monitoring.