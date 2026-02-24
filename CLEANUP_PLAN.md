# Elevizion Dashboard - Code Cleanup Plan

## Gevonden Issues:

### 1. DEPRECATED Routes (geven 410 errors - moeten verwijderd worden)
- `/api/admin/layouts` (8 endpoints) - regels ~17778-17835
- `/api/admin/autopilot/baseline-status` - regel ~20207
- `/api/admin/autopilot/config/layout-region` - regel ~20248
- `/api/admin/autopilot/layout/:layoutId/regions` - regel ~20256
- `/api/admin/autopilot/ensure-ads-region/:layoutId` - regel ~20264
- `/api/admin/autopilot/seed-playlist/:playlistId` - regel ~20272
- `/api/admin/autopilot/verify-screen/:screenId` - regel ~20280
- `/api/admin/autopilot/full-repair/:locationId` - regel ~20288
- `/api/admin/autopilot/combined-config` (2 endpoints) - regels ~20300-20308
- `/api/admin/autopilot/repair/:locationId` - regel ~20316
- `/api/admin/locations/:id/content-status` - regel ~20324
- `/api/admin/autopilot/config` (2e keer, duplicate!) - regels ~20336-20348

### 2. Test Bestanden in Productie Code
- `server/services/aiDumpService.test.ts` → verplaatsen naar `tests/`
- `server/services/yodeckPayloadBuilder.test.ts` → verplaatsen naar `tests/`

### 3. Duplicate Imports/Globals
- `e2eTestRuns` wordt geïmporteerd maar niet gebruikt in routes.ts

### 4. Ongebruikte Imports in routes.ts
- `e2eTestRuns` uit @shared/schema

## Acties:
1. Verwijder alle DEPRECATED routes die alleen 410 errors returnen
2. Verplaats .test.ts bestanden naar tests/ folder
3. Verwijder ongebruikte imports
4. Controleer storage.ts op duplicaten
