# Elevizion Video Flow — End-to-End Analyse Rapport
**Datum**: 25 februari 2026  
**Type**: Read-only analyse, geen code wijzigingen

---

## 1) FLOW DIAGRAM (bullet steps)

```
1. UPLOAD
   └─ POST /api/upload-portal/:token/upload
      ├─ Bestand: server/routes.ts :4804
      ├─ Multer → /tmp/uploads (max 100MB)
      ├─ Token validatie → validatePortalTokenWithDetails()
      ├─ processAdAssetUpload() → server/services/adAssetUploadService.ts :245
      │   ├─ ffprobe metadata extractie
      │   ├─ Video validatie (duur, codec, resolutie)
      │   ├─ Object Storage upload (streaming)
      │   ├─ INSERT ad_assets met approvalStatus='UPLOADED'
      │   ├─ Background: normalizeForYodeck(assetId) → videoTranscodeService.ts :494
      │   └─ Background: startTranscodeJob(assetId) (als niet H.264)

2. ADMIN REVIEW LIST
   └─ GET /api/admin/video-review
      ├─ Bestand: server/routes.ts :2625
      ├─ getReviewAssets(bucket) → adAssetUploadService.ts :642
      ├─ getBucketFilter() → adAssetUploadService.ts :581
      │   Default bucket='pending-review' filter:
      │   WHERE approvalStatus IN ('UPLOADED','IN_REVIEW','PENDING_REVIEW')
      │   AND approvalStatus NOT IN ('DELETED','ARCHIVED','REVIEWED')
      └─ Per asset: enrichment met advertiser + portalScreens

3. APPROVE
   └─ POST /api/admin/video-review/:id/approve
      ├─ Bestand: server/routes.ts :2638
      ├─ approveAsset() → adAssetUploadService.ts :707
      │   ├─ Guard: validationStatus must be 'valid'
      │   ├─ Guard: approvalStatus must be 'UPLOADED' or 'IN_REVIEW'
      │   ├─ UPDATE ad_assets: approvalStatus='APPROVED', publishStatus='PENDING'
      │   │
      │   ├─ Step A: createAutoPlacementsForAsset() → autoPlacementService.ts :75
      │   │   └─ ⛔ GUARD: Vereist actief contract (status='signed'|'active')
      │   │      Als geen contract → return success=false, "Geen actief contract"
      │   │
      │   ├─ Step B: getPortalPlacementScreens() → placementResolver.ts :139
      │   │   └─ Query portal_placements WHERE advertiser_id=X AND status!='REMOVED'
      │   │
      │   ├─ Step C: publishSingleAsset() → mediaPipelineService.ts :833
      │   │   └─ Alleen als asset.yodeckMediaId NULL:
      │   │      Download van Object Storage → Yodeck upload → poll readiness
      │   │
      │   ├─ Step D: publishApprovedAdToAllLocations() → yodeckAutopilotService.ts :310
      │   │   └─ ⛔ GUARD: approvalStatus must be 'APPROVED' (regel 333)
      │   │   └─ findLocationsForAdvertiser() → yodeckCanonicalService.ts :3015
      │   │      └─ ⛔ GUARD: Zoekt contracts met status='signed' (niet 'active'!)
      │   │
      │   ├─ Step E: PlacementEngineService.createPlan() (legacy)
      │   │
      │   └─ Final: UPDATE ad_assets:
      │      approvalStatus = publishSuccess ? 'LIVE' : 'APPROVED'
      │      publishStatus = publishSuccess ? 'PUBLISHED' : 'PUBLISH_FAILED'

4. YODECK READINESS (in publishSingleAsset poll loop)
   ├─ Bestand: mediaPipelineService.ts :1318-1400
   ├─ Gebruikt: GET /api/v2/media/{id}/ (detail endpoint)
   ├─ isYodeckMediaReady() → :1135
   │   ├─ FILE_FIELDS: fileSize>0 of file object → READY ✓
   │   ├─ STRONG: status=finished + last_uploaded + thumbnail_url → READY ✓
   │   ├─ WAIT_THUMBNAIL: finished + last_uploaded, geen thumbnail → NOT READY, poll door
   │   └─ NONE: overig → NOT READY
   └─ Na READY: verify call (double-check), dan markAssetReady()

5. PLAYLIST PUSH + VERIFY
   ├─ publishApprovedAdToAllLocations() → per locatie:
   │   performFullLocationRepair() → yodeckCanonicalService.ts
   │   ├─ Ensure layout assigned
   │   ├─ Ensure ads playlist exists + media items correct
   │   └─ Push to Yodeck player
   └─ Screen-level: repairScreen() → screenPlaylistService.ts
```

---

## 2) TOP 3 ISSUES — waar het nu misgaat

### ISSUE 1: ad_assets tabel is LEEG (0 rijen)
**Symptoom**: Admin opent video review → ziet lege lijst, count=0  
**Root cause**: Er zijn simpelweg GEEN uploads gedaan. De `ad_assets` tabel bevat 0 rijen.  
**Bewijs**:
```sql
SELECT count(*) FROM ad_assets;
-- Resultaat: 0
```
**Impact**: Alles downstream is dood — geen review, geen approve, geen publish.

### ISSUE 2: Contract status mismatch in canonical publish
**Symptoom**: Zelfs als er een upload+approve zou zijn, faalt `publishApprovedAdToAllLocations()` voor de enige adverteerder met canonical media (Douven).  
**Root cause**: `findLocationsForAdvertiser()` (yodeckCanonicalService.ts :3021) zoekt contracts met `status='signed'`. Maar in de DB heeft het Douven-contract `status='active'`:
```
contracts:
  id=e9b988d6 advertiser_id=b59dcd32 (Douven) status='active'
```
De functie vindt dus 0 contracts → 0 locations → skip publish.

Tegelijkertijd zoekt `createAutoPlacementsForAsset()` (autoPlacementService.ts :101-104) WEL op `signed` OR `active`, dus die zou het contract WEL vinden. Maar daar stopt het ook, want er zijn geen `placements` records die naar schermen verwijzen.

**Bewijs**:
```
yodeckCanonicalService.ts:3021: eq(contracts.status, "signed")  ← mist 'active'
autoPlacementService.ts:103:   eq(contracts.status, "active")   ← vindt 'active' WEL
```

### ISSUE 3: Geen portal placements / screen selecties
**Symptoom**: Zelfs als de media pipeline slaagt, worden er 0 placements aangemaakt want er zijn geen `portal_placements` en geen `portal_user_screen_selections`.
**Root cause**: De portal onboarding flow voor screen selectie is blijkbaar nooit voltooid door enige adverteerder.
**Bewijs**:
```sql
SELECT count(*) FROM portal_placements;        -- 0
SELECT count(*) FROM portal_user_screen_selections;  -- 0
SELECT count(*) FROM placement_plans;          -- 0
```
De `approveAsset()` flow (adAssetUploadService.ts :797-806) checkt `getPortalPlacementScreens()`, maar vindt 0 records. Hierdoor is `hasTargetsAvailable=false` en wordt `publishErrorMsg` gezet op "Publicatie naar schermen mislukt (geen contract, geen portaal-selectie)".

---

## 3) SPECIFIEK: Waarom /api/admin/video-review [] retourneert

**Exacte oorzaak**: De `ad_assets` tabel heeft **0 rijen**.

De filter zelf (getBucketFilter, adAssetUploadService.ts :581-640) is correct:
- Default bucket = `pending-review`
- Filter: `approvalStatus IN ('UPLOADED', 'IN_REVIEW', 'PENDING_REVIEW') AND NOT IN ('DELETED', 'ARCHIVED', 'REVIEWED')`

Dit is NIET te streng — er zijn simpelweg geen records om te filteren. Als er assets zouden bestaan met `approvalStatus='UPLOADED'`, zouden ze gewoon verschijnen.

**Alternatieve buckets die ook leeg zijn**:
- `?bucket=all` → 0 resultaten (0 rijen totaal)
- `?bucket=approved-pending` → 0
- `?bucket=published` → 0

**Test bewijs**:
```
GET /api/admin/video-review → 200, body: []
GET /api/admin/video-review?bucket=all → 200, body: []
```

---

## 4) SPECIFIEK: "Selected screen placement" — bestaat het en wordt het gebruikt?

### Opslag van screen selectie:
- **Tabel**: `portal_placements` (kolommen: advertiser_id, screen_id, status)
- **Tabel**: `portal_user_screen_selections` (aanvullende selecties)
- **Beide tabellen zijn LEEG** (0 rijen)

### Wordt het gebruikt bij publish?
**JA**, maar alleen als fallback info:
1. `approveAsset()` (adAssetUploadService.ts :797-806): roept `getPortalPlacementScreens()` aan om `portalPlacementCount` te bepalen
2. Deze count wordt alleen gebruikt voor de `hasTargetsAvailable` boolean (:905)
3. `hasTargetsAvailable` bepaalt alleen de **foutmelding tekst** — het stuurt NIET het daadwerkelijke publicatie-proces

### Wat het publicatie-proces WEL stuurt:
- **autoPlacementService**: Maakt placements op basis van contract targeting + screen matching. Vereist actief contract.
- **publishApprovedAdToAllLocations**: Vindt locations via contract → placements → screens chain. Vereist signed contract.

**Conclusie**: Portal screen selectie wordt **opgeslagen maar NIET actief gebruikt** door de publish pipeline. Het is alleen informatief voor de error message. De daadwerkelijke publish gaat via contract-based targeting (autoPlacement) of contract→placement→location chain (autopilot), NIET via portal selecties.

---

## 5) RISICO'S / REGRESSIE PUNTEN

| # | Risico | Bestand | Toelichting |
|---|--------|---------|-------------|
| 1 | `findLocationsForAdvertiser` zoekt alleen `status='signed'`, niet `'active'` | yodeckCanonicalService.ts :3021 | Fix is 1 regel, maar test eerst of active contracts publish-worthy zijn |
| 2 | `approvalStatus` overgang APPROVED→LIVE/PUBLISH_FAILED is onomkeerbaar | adAssetUploadService.ts :914-922 | Na approve kan admin niet terug naar UPLOADED |
| 3 | `normalizeForYodeck` draait async op achtergrond zonder completion tracking in approve flow | adAssetUploadService.ts :414 | Approve kan starten voordat normalization klaar is |
| 4 | Readiness poll timeout (POLL_MAX_MS) is hardcoded | mediaPipelineService.ts | Als Yodeck traag is, faalt de hele approve |
| 5 | Token-based portal auth tokens zijn verlopen (alle < feb 2026) | portal_tokens tabel | Adverteerders kunnen niet meer uploaden zonder nieuwe tokens |

**NIET AANRAKEN**:
- Playlist structuur en sync (baselineSyncService, simplePlaylistModel)
- Yodeck duplicate cleanup service (net gebouwd, stabiel)
- Readiness signals (net gecorrigeerd: WEAK→WAIT_THUMBNAIL)
- Contract signing flow
- Moneybird integratie

---

## 6) AANBEVOLEN MINIMALE FIXES (gesorteerd op impact/risico)

### FIX 1 — HOOGSTE PRIORITEIT: Upload portal werkend maken
**Impact**: ★★★★★ | **Risico**: ★☆☆☆☆  
**Probleem**: Geen adverteerder heeft een geldig upload token. ad_assets = 0 rijen.  
**Voorstel**: 
- Genereer een nieuw portal token voor "Bouwservice Douven" (de enige adverteerder met link_key + active contract)
- Test de upload flow end-to-end via dat token
- Verifieer dat ad_assets record wordt aangemaakt met approvalStatus='UPLOADED'

### FIX 2 — HOOG: Contract status filter in findLocationsForAdvertiser
**Impact**: ★★★★☆ | **Risico**: ★☆☆☆☆  
**Probleem**: `findLocationsForAdvertiser()` filtert op `status='signed'` maar echte contracts staan op `status='active'`  
**Voorstel**: Voeg `OR status='active'` toe aan de where clause op yodeckCanonicalService.ts :3021, consistent met autoPlacementService.ts :101-104

### FIX 3 — MEDIUM: Portal screen selectie daadwerkelijk gebruiken in publish
**Impact**: ★★★☆☆ | **Risico**: ★★★☆☆  
**Probleem**: `getPortalPlacementScreens()` resultaat wordt alleen voor error text gebruikt, niet voor daadwerkelijke targeting  
**Voorstel**: Als autoPlacement faalt (geen contract) maar portalPlacements WEL bestaan → gebruik die als targeting bron voor screen publish

### FIX 4 — MEDIUM: Normalization completion check voor approve
**Impact**: ★★★☆☆ | **Risico**: ★★☆☆☆  
**Probleem**: Approve kan starten terwijl normalization nog draait → publiceert ongeoptimaliseerde video  
**Voorstel**: Check `normalizedStoragePath` voordat publishSingleAsset() start. Als normalization bezig is, wacht of weiger met duidelijke melding.

### FIX 5 — LAAG: Admin "bucket=all" debug view
**Impact**: ★★☆☆☆ | **Risico**: ★☆☆☆☆  
**Probleem**: Als er geen assets zijn, is er geen manier om te debuggen via de UI  
**Voorstel**: Voeg een "Systeem Status" indicator toe die toont: 0 assets, 0 upload tokens actief, advertiser link_key status

---

## BIJLAGE: DB State Snapshot (25-02-2026)

| Tabel | Rijen | Opmerking |
|-------|-------|-----------|
| ad_assets | 0 | **LEEG** — geen uploads ooit gedaan |
| upload_jobs | 0 | Geen Yodeck upload jobs |
| portal_placements | 0 | Geen screen selecties |
| portal_user_screen_selections | 0 | Geen screen selecties |
| placement_plans | 0 | Geen placement plannen |
| contracts | 5 | 4x active, 1x ended |
| advertisers (asset_status!=none) | 1 | Alleen "Douven" = live |
| advertisers (met link_key) | 2 | Douven + TestBedrijf |
| active screens | 2 | Basil's + Douven |
| portal_tokens | 4 | Alle verlopen (<feb 2026) |

### Adverteerder "Douven" (enige live):
- advertiser_id: b59dcd32
- contract: e9b988d6, status='active'  
- yodeck_media_id_canonical: 29893553
- link_key: ADV-BOUWSERVICEDOUVEN-6E43D3
- ad_assets: 0 (geen uploads via portal)
