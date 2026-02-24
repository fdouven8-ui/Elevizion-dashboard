# Elevizion Dashboard - Deployment Guide

## ✅ Status: KLAAR VOOR DEPLOYMENT

Alle kritieke bugs zijn opgelost en de code is productie-ready.

---

## Pre-Deployment Checklist

### 1. Database Migratie (VERPLICHT)
Voer dit SQL script uit in de Replit database console:

```sql
-- ============================================================
-- ELEVIZION DASHBOARD - DATABASE MIGRATIE
-- ============================================================

-- 1. Sync Locks tabel (voor distributed locking)
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

-- 2. Publish Queue tabel (voor upload → publish flow)
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
CREATE INDEX IF NOT EXISTS publish_queue_scheduled_idx ON publish_queue (scheduled_for) WHERE status = 'pending';

-- 3. Alerts tabel (voor error monitoring)
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
CREATE INDEX IF NOT EXISTS alerts_created_idx ON alerts (created_at DESC);

-- Verificatie
SELECT 'Tabellen aangemaakt:' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('sync_locks', 'publish_queue', 'alerts');
```

### 2. Environment Variables
Controleer dat deze variables zijn gezet in Replit Secrets:

```
YODECK_AUTH_TOKEN=5s6pRuIlk7XOBCFgQJN8hyjIxcFXw-YDXDwOpmSAMH4HcxR7-Wr69KsDCI9gVz-7
```

**Optioneel:**
```
DISABLE_PUBLISH_QUEUE=false    # 'true' om worker te disablen
PUBLISH_QUEUE_INTERVAL_MS=10000  # Worker check interval (default: 10s)
```

### 3. Git Update
```bash
cd elevizion-dashboard
git pull origin main
npm install
```

---

## Deployment Stappen

### Stap 1: Backup (Belangrijk!)
```bash
# Export database backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M).sql
```

### Stap 2: Database Migratie
1. Open Replit Database tab
2. Kopieer het SQL script hierboven
3. Voer uit en verifieer output

### Stap 3: Code Deploy
```bash
# In Replit Shell
npm run build
```

### Stap 4: Worker Verificatie
Controleer de logs na deployment:
```
[BOOT][PublishQueue] Worker started
[BOOT][Yodeck] Connection OK: X screens found
```

### Stap 5: Health Checks
Test deze endpoints:
- `GET /health` → `{ "status": "ok" }`
- `GET /api/publish-queue/health` → Worker status
- `GET /api/admin/sync-locks` → Lock status
- `GET /api/admin/alerts` → Alert systeem (leeg is OK)

---

## Post-Deployment Verificatie

### 1. Queue Systeem Test
```bash
# 1. Upload een test video als adverteerder
# 2. Keur goed in admin panel
# 3. Check queue: GET /api/publish-queue/items
# 4. Verifieer processing in logs
```

### 2. Alert Systeem Test
```bash
# Trigger een Yodeck error (bijv. verkeerde API key tijdelijk)
# Check of alert verschijnt: GET /api/admin/alerts
# Bevestig alert via UI: POST /api/admin/alerts/:id/acknowledge
```

### 3. Sync Lock Test
```bash
# Start twee parallelle sync operaties
# Verifieer dat tweede wordt geblokkeerd
# Check lock status: GET /api/admin/sync-locks
```

---

## Monitoring Setup

### Belangrijke Metrics
Bewaar deze queries voor regelmatige monitoring:

```sql
-- Queue status
SELECT status, COUNT(*) FROM publish_queue GROUP BY status;

-- Active alerts
SELECT severity, COUNT(*) FROM alerts WHERE acknowledged = false GROUP BY severity;

-- Sync lock status
SELECT id, locked, locked_by, expires_at FROM sync_locks;

-- Recent errors (laatste uur)
SELECT * FROM alerts 
WHERE severity IN ('error', 'critical') 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Log Monitoring
Zoek naar deze prefixes in Replit logs:
```
[SyncLock]          - Lock operations
[PublishQueue]      - Queue processing
[AlertService]      - Alert creation
[YodeckClient]      - API calls
[BOOT]              - Startup messages
```

---

## Rollback Procedure

### Als er iets misgaat:

**1. Code Rollback:**
```bash
git log --oneline -5
git revert HEAD
git push
```

**2. Database Rollback (alleen als nodig):**
```sql
-- WAARSCHUWING: Data gaat verloren!
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS publish_queue;
DROP TABLE IF EXISTS sync_locks;
```

**3. Worker Stoppen:**
- Set `DISABLE_PUBLISH_QUEUE=true` in Replit Secrets
- Restart server

**4. Emergency Lock Break:**
```bash
# Als een lock vastzit
curl -X POST https://jouw-app.replit.app/api/admin/sync-locks/yodeck_sync/break \
  -H "Authorization: Bearer [admin-token]"
```

---

## Support & Troubleshooting

### Veelvoorkomende Problemen

**Probleem:** Queue worker start niet  
**Oplossing:**
```bash
# Check logs voor [BOOT][PublishQueue]
# Verifieer DISABLE_PUBLISH_QUEUE != "true"
# Restart server
```

**Probleem:** Yodeck sync werkt niet  
**Oplossing:**
```bash
# Check YODECK_AUTH_TOKEN in Secrets
# Test: GET /api/integrations/yodeck/test
# Check alerts: GET /api/admin/alerts
```

**Probleem:** Lock blijft vastzitten  
**Oplossing:**
```bash
# Force break via API
# Of wacht tot expires_at is verstreken (max 5 min)
```

---

## Contact

Bij deployment problemen:
1. Check deze guide stap-voor-stap
2. Review logs in Replit
3. Raadpleeg AANBEVELINGEN.md voor verdere ontwikkeling

---

**Laatst bijgewerkt:** 2026-02-24  
**Versie:** 2.0 - Production Ready  
**Status:** ✅ Goedgekeurd voor deployment
