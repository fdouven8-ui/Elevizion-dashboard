# Elevizion Dashboard - Kritieke Bugs Fix

## Overzicht
Dit document beschrijft de fixes die zijn geïmplementeerd voor de kritieke bugs in het Elevizion dashboard.

## Fixes Geïmplementeerd

### 1. ✅ Race Condition Fix - Database Locks
**Probleem:** Yodeck sync gebruikte een memory-based mutex (`yodeckSyncInProgress`) die niet werkt bij meerdere Replit instances.

**Oplossing:** 
- Nieuwe `syncLocks` tabel in database
- Distributed locking via `acquireLock()` / `releaseLock()`
- Auto-expire locks na timeout
- Stale lock detectie en cleanup

**Bestanden:**
- `server/syncLocks.ts` (nieuw)
- `shared/schema.ts` - syncLocks tabel toegevoegd
- `server/routes.ts` - Memory lock vervangen door database lock

### 2. ✅ Publish Queue Systeem
**Probleem:** Geen gestructureerde flow voor upload → review → publicatie.

**Oplossing:**
- Nieuwe `publish_queue` tabel
- Queue service met priority support
- Retry mechanisme met exponential backoff
- Worker voor automatische verwerking
- REST API endpoints voor queue management

**Bestanden:**
- `server/services/publishQueueService.ts` (nieuw)
- `server/workers/publishQueueWorker.ts` (nieuw)
- `shared/schema.ts` - publishQueue tabel toegevoegd
- `server/storage.ts` - Queue storage methods
- `server/routes.ts` - Queue endpoints toegevoegd

**API Endpoints:**
- `GET /api/publish-queue/stats` - Queue statistieken
- `GET /api/publish-queue/items` - Queue items ophalen
- `POST /api/publish-queue/retry/:id` - Handmatig retry
- `POST /api/publish-queue/cancel/:id` - Item annuleren
- `POST /api/publish-queue/process` - Handmatig triggeren
- `GET /api/publish-queue/health` - Worker health check

### 3. ✅ Alert Systeem voor Errors
**Probleem:** Yodeck errors werden silently gelogd, geen alerting.

**Oplossing:**
- Nieuwe `alerts` tabel
- Alert service met severity levels
- Deduplicatie met 5-minuten venster
- Auto-escalatie bij herhaalde errors
- Convenience functies voor Yodeck errors

**Bestanden:**
- `server/services/alertService.ts` (nieuw)
- `shared/schema.ts` - alerts tabel toegevoegd
- `server/services/yodeckClient.ts` - Alert integratie

**Severity Levels:**
- `info` - Informatieve meldingen
- `warning` - Waarschuwingen (rate limiting)
- `error` - Errors (API failures)
- `critical` - Kritieke issues (meerdere errors)

### 4. ✅ Status Management Vereenvoudigd
**Probleem:** Te complex status management door verspreide logica.

**Oplossing:**
- Centralisatie via publish queue
- Duidelijke status flow: `pending` → `processing` → `completed`/`failed`/`retrying`
- Idempotency guards
- Automatische retry logica

### 5. ✅ Upload → Live Flow Automatisering
**Probleem:** Handmatige stappen tussen upload en live.

**Oplossing:**
- Automatische queue toevoeging na admin approval
- Worker controleert continu queue
- Auto-retry bij failures
- Notificaties bij status wijzigingen

## Database Migratie Vereist

Voer de volgende migratie uit in Replit om de nieuwe tabellen aan te maken:

```sql
-- Sync Locks tabel
CREATE TABLE IF NOT EXISTS sync_locks (
  id VARCHAR PRIMARY KEY,
  locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMP,
  locked_by TEXT,
  expires_at TIMESTAMP,
  last_success_at TIMESTAMP,
  last_error TEXT,
  retry_count INTEGER DEFAULT 0,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS sync_locks_expires_at_idx ON sync_locks (expires_at);

-- Publish Queue tabel
CREATE TABLE IF NOT EXISTS publish_queue (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_asset_id VARCHAR NOT NULL REFERENCES ad_assets(id),
  advertiser_id VARCHAR NOT NULL REFERENCES advertisers(id),
  status VARCHAR NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 100,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  error_message TEXT,
  error_code TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  scheduled_for TIMESTAMP,
  processed_at TIMESTAMP,
  completed_at TIMESTAMP,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS publish_queue_status_idx ON publish_queue (status);
CREATE INDEX IF NOT EXISTS publish_queue_advertiser_idx ON publish_queue (advertiser_id);

-- Alerts tabel
CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  severity VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  dedup_key TEXT,
  duplicate_count INTEGER DEFAULT 0,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (acknowledged);
CREATE INDEX IF NOT EXISTS alerts_severity_idx ON alerts (severity);
CREATE INDEX IF NOT EXISTS alerts_category_idx ON alerts (category);
CREATE INDEX IF NOT EXISTS alerts_dedup_key_idx ON alerts (dedup_key);
```

## Environment Variables

Zorg dat deze environment variables zijn gezet in Replit:

```
# Yodeck API (verplicht)
YODECK_AUTH_TOKEN=5s6pRuIlk7XOBCFgQJN8hyjIxcFXw-YDXDwOpmSAMH4HcxR7-Wr69KsDCI9gVz-7

# Optioneel: Queue worker interval (default: 10000ms)
PUBLISH_QUEUE_INTERVAL_MS=10000

# Optioneel: Disable queue worker (voor debugging)
# DISABLE_PUBLISH_QUEUE=true
```

## Deploy Instructies

1. **Database migratie uitvoeren:**
   - Open de Replit console
   - Voer het SQL script hierboven uit

2. **Code deployen:**
   ```bash
   git pull origin main
   npm install
   npm run build
   ```

3. **Worker verificatie:**
   - Check worker status: `GET /api/publish-queue/health`
   - Check queue stats: `GET /api/publish-queue/stats`

4. **Test flow:**
   - Upload een video als adverteerder
   - Keur goed in admin panel
   - Controleer queue: `GET /api/publish-queue/items`
   - Verifieer processing in logs

## Monitoring

### Belangrijke Metrics
- Queue stats: `GET /api/publish-queue/stats`
- Active alerts: `GET /api/admin/alerts/active`
- Sync lock status: Check `sync_locks` tabel
- Worker health: `GET /api/publish-queue/health`

### Logs
Zoek naar deze prefixes in de logs:
- `[SyncLock]` - Lock operations
- `[PublishQueue]` - Queue processing
- `[AlertService]` - Alert creation
- `[YodeckClient]` - API calls

## Rollback Plan

Mocht er iets misgaan:

1. **Code rollback:**
   ```bash
   git log --oneline -5
   git revert debf12d
   git push
   ```

2. **Database rollback:**
   ```sql
   -- Tabellen verwijderen (let op: data gaat verloren!)
   DROP TABLE IF EXISTS alerts;
   DROP TABLE IF EXISTS publish_queue;
   DROP TABLE IF EXISTS sync_locks;
   ```

3. **Worker stoppen:**
   - Set `DISABLE_PUBLISH_QUEUE=true` in environment
   - Restart server

## Support

Bij problemen:
1. Check de alerts tabel voor errors
2. Bekijk Replit logs op errors
3. Verifieer Yodeck API token is geldig
4. Check database connectiviteit
