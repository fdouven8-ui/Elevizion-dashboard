/**
 * API Routes for Elevizion OS
 * Thin controller layer - all business logic in storage/services
 */

import type { Express } from "express";
import { type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import {
  insertAdvertiserSchema,
  insertLocationSchema,
  insertScreenSchema,
  insertPackagePlanSchema,
  insertContractSchema,
  insertPlacementSchema,
  placementUpdateSchema,
  insertInvoiceSchema,
  insertPayoutSchema,
  insertLeadSchema,
  insertLocationSurveySchema,
  insertDigitalSignatureSchema,
  insertSalesActivitySchema,
  insertSurveyPhotoSchema,
  insertSupplyItemSchema,
  insertSurveySupplySchema,
  insertTaskSchema,
  insertTaskAttachmentSchema,
  insertSiteSchema,
  insertEntitySchema,
  insertSyncJobSchema,
} from "@shared/schema";
import { getMoneybirdClient } from "./services/moneybirdClient";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import {
  getIntegrationStatus,
  testYodeckConnection,
  testMoneybirdConnection,
  testDropboxSignConnection,
  syncYodeckScreens,
  getYodeckConfigStatus,
} from "./integrations";
import {
  isEmailConfigured,
  sendContractEmail,
  sendSepaEmail,
  sendEmail,
} from "./email";
import {
  generateSigningToken,
  hashToken,
  verifyToken,
  generateContractHtml,
  calculateExpirationDate,
  formatClientInfo,
} from "./contract-signing";
import { setupAuth, registerAuthRoutes, isAuthenticated, requirePermission } from "./replit_integrations/auth";
import { getScreenStats, getAdvertiserStats, clearStatsCache, checkYodeckScreenHasContent } from "./yodeckStats";
import { classifyMediaItems } from "./services/mediaClassifier";

// ============================================================================
// IN-MEMORY CACHE (10 second TTL for control-room endpoints)
// ============================================================================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const endpointCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 10_000; // 10 seconds

function getCached<T>(key: string): T | null {
  const entry = endpointCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    endpointCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  endpointCache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// YODECK SYNC MUTEX (prevent concurrent syncs)
// ============================================================================
let yodeckSyncInProgress = false;
let yodeckSyncLastStarted: Date | null = null;
const SYNC_MIN_INTERVAL_MS = 30_000; // 30 seconds minimum between syncs

function canStartYodeckSync(): { ok: boolean; reason?: string } {
  if (yodeckSyncInProgress) {
    return { ok: false, reason: "Sync al bezig, probeer later opnieuw" };
  }
  if (yodeckSyncLastStarted) {
    const elapsed = Date.now() - yodeckSyncLastStarted.getTime();
    if (elapsed < SYNC_MIN_INTERVAL_MS) {
      const waitSecs = Math.ceil((SYNC_MIN_INTERVAL_MS - elapsed) / 1000);
      return { ok: false, reason: `Te snel, wacht nog ${waitSecs} seconden` };
    }
  }
  return { ok: true };
}

function startYodeckSync() {
  yodeckSyncInProgress = true;
  yodeckSyncLastStarted = new Date();
}

function endYodeckSync() {
  yodeckSyncInProgress = false;
}

// ============================================================================
// MEMORY LOGGING (every 60 seconds)
// ============================================================================
function logMemoryUsage() {
  const mem = process.memoryUsage();
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`[MEMORY] RSS: ${formatMB(mem.rss)}MB | Heap: ${formatMB(mem.heapUsed)}/${formatMB(mem.heapTotal)}MB | External: ${formatMB(mem.external)}MB`);
}

// Start memory logging interval (60 seconds)
setInterval(logMemoryUsage, 60_000);
logMemoryUsage(); // Log once at startup

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup authentication first (before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // ============================================================================
  // ADVERTISERS
  // ============================================================================
  
  app.get("/api/advertisers", async (_req, res) => {
    const advertisers = await storage.getAdvertisers();
    res.json(advertisers);
  });

  app.get("/api/advertisers/:id", async (req, res) => {
    const advertiser = await storage.getAdvertiser(req.params.id);
    if (!advertiser) return res.status(404).json({ message: "Advertiser not found" });
    res.json(advertiser);
  });

  app.get("/api/advertisers/:id/placements", async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) return res.status(404).json({ message: "Advertiser not found" });
      
      const contracts = await storage.getContracts();
      const advertiserContracts = contracts.filter(c => c.advertiserId === req.params.id);
      const contractIds = advertiserContracts.map(c => c.id);
      
      const allPlacements = await storage.getPlacements();
      const advertiserPlacements = allPlacements.filter(p => contractIds.includes(p.contractId));
      
      const screens = await storage.getScreens();
      const locations = await storage.getLocations();
      
      const enrichedPlacements = advertiserPlacements.map(p => {
        const screen = screens.find(s => s.id === p.screenId);
        const location = screen ? locations.find(l => l.id === screen.locationId) : null;
        const contract = advertiserContracts.find(c => c.id === p.contractId);
        return {
          ...p,
          screenId_display: screen?.screenId || "Onbekend",
          screenName: screen?.name || "Onbekend scherm",
          screenStatus: screen?.status || "unknown",
          locationName: location?.name || "Onbekende locatie",
          contractName: contract?.name || "Onbekend contract",
        };
      });
      
      res.json(enrichedPlacements);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/advertisers", async (req, res) => {
    try {
      const data = insertAdvertiserSchema.parse(req.body);
      const advertiser = await storage.createAdvertiser(data);
      res.status(201).json(advertiser);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/advertisers/:id", async (req, res) => {
    const advertiser = await storage.updateAdvertiser(req.params.id, req.body);
    if (!advertiser) return res.status(404).json({ message: "Advertiser not found" });
    res.json(advertiser);
  });

  app.delete("/api/advertisers/:id", async (req, res) => {
    await storage.deleteAdvertiser(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // LOCATIONS
  // ============================================================================

  app.get("/api/locations", async (_req, res) => {
    const locations = await storage.getLocations();
    res.json(locations);
  });

  app.get("/api/locations/:id", async (req, res) => {
    const location = await storage.getLocation(req.params.id);
    if (!location) return res.status(404).json({ message: "Location not found" });
    res.json(location);
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const data = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(data);
      res.status(201).json(location);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/locations/:id", async (req, res) => {
    const location = await storage.updateLocation(req.params.id, req.body);
    if (!location) return res.status(404).json({ message: "Location not found" });
    res.json(location);
  });

  app.delete("/api/locations/:id", async (req, res) => {
    await storage.deleteLocation(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // SITES (Unified entity: 1 site = 1 screen location)
  // ============================================================================

  app.get("/api/sites", async (_req, res) => {
    try {
      const sites = await storage.getSitesWithSnapshots();
      res.json(sites);
    } catch (error: any) {
      console.error("[Sites API] Error fetching sites:", error);
      res.status(500).json({ message: "Error fetching sites" });
    }
  });

  app.get("/api/sites/:id", async (req, res) => {
    try {
      const site = await storage.getSiteWithSnapshots(req.params.id);
      if (!site) return res.status(404).json({ message: "Site not found" });
      res.json(site);
    } catch (error: any) {
      console.error("[Sites API] Error fetching site:", error);
      res.status(500).json({ message: "Error fetching site" });
    }
  });

  app.post("/api/sites", async (req, res) => {
    try {
      const data = insertSiteSchema.parse(req.body);
      const site = await storage.createSite(data);
      res.status(201).json(site);
    } catch (error: any) {
      console.error("[Sites API] Error creating site:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/sites/:id", async (req, res) => {
    try {
      const site = await storage.updateSite(req.params.id, req.body);
      if (!site) return res.status(404).json({ message: "Site not found" });
      res.json(site);
    } catch (error: any) {
      console.error("[Sites API] Error updating site:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/sites/:id", async (req, res) => {
    try {
      await storage.deleteSite(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("[Sites API] Error deleting site:", error);
      res.status(500).json({ message: "Error deleting site" });
    }
  });

  app.post("/api/sites/:id/link-moneybird", async (req, res) => {
    try {
      const { moneybirdContactId } = req.body;
      if (!moneybirdContactId) {
        return res.status(400).json({ message: "moneybirdContactId is required" });
      }
      
      const site = await storage.linkSiteToMoneybird(req.params.id, moneybirdContactId);
      if (!site) return res.status(404).json({ message: "Site not found" });
      
      const cachedContact = await storage.getMoneybirdContactCache(moneybirdContactId);
      if (cachedContact) {
        const addressData = cachedContact.address as any || {};
        await storage.upsertSiteContactSnapshot(site.id, {
          companyName: cachedContact.companyName,
          contactName: cachedContact.contactName,
          email: cachedContact.email,
          phone: cachedContact.phone,
          address1: addressData.street || null,
          postcode: addressData.postcode || null,
          city: addressData.city || null,
          country: addressData.country || null,
          rawMoneybird: cachedContact.raw as object,
        });
      }
      
      const updatedSite = await storage.getSiteWithSnapshots(site.id);
      res.json(updatedSite);
    } catch (error: any) {
      console.error("[Sites API] Error linking to Moneybird:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sites/:id/link-yodeck", async (req, res) => {
    try {
      const { yodeckScreenId } = req.body;
      if (!yodeckScreenId) {
        return res.status(400).json({ message: "yodeckScreenId is required" });
      }
      
      const site = await storage.linkSiteToYodeck(req.params.id, yodeckScreenId);
      if (!site) return res.status(404).json({ message: "Site not found" });
      
      const cachedScreen = await storage.getYodeckScreenCache(yodeckScreenId);
      if (cachedScreen) {
        await storage.upsertSiteYodeckSnapshot(site.id, {
          screenName: cachedScreen.name,
          status: cachedScreen.status,
          lastSeen: cachedScreen.lastSeen,
          screenshotUrl: cachedScreen.screenshotUrl,
          rawYodeck: cachedScreen.raw as object,
        });
      }
      
      const updatedSite = await storage.getSiteWithSnapshots(site.id);
      res.json(updatedSite);
    } catch (error: any) {
      console.error("[Sites API] Error linking to Yodeck:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/moneybird/contacts-cache", async (_req, res) => {
    try {
      const contacts = await storage.getMoneybirdContactsCache();
      res.json(contacts);
    } catch (error: any) {
      console.error("[Sites API] Error fetching Moneybird contacts cache:", error);
      res.status(500).json({ message: "Error fetching contacts cache" });
    }
  });

  app.get("/api/yodeck/screens-cache", async (_req, res) => {
    try {
      const screens = await storage.getYodeckScreensCache();
      res.json(screens);
    } catch (error: any) {
      console.error("[Sites API] Error fetching Yodeck screens cache:", error);
      res.status(500).json({ message: "Error fetching screens cache" });
    }
  });

  // ============================================================================
  // ENTITIES (UNIFIED MODEL FOR ADVERTISERS + SCREENS)
  // ============================================================================

  app.get("/api/entities", async (_req, res) => {
    try {
      const entities = await storage.getEntities();
      res.json(entities);
    } catch (error: any) {
      console.error("[Entities API] Error fetching entities:", error);
      res.status(500).json({ message: "Error fetching entities" });
    }
  });

  app.get("/api/entities/:id", async (req, res) => {
    try {
      const entity = await storage.getEntity(req.params.id);
      if (!entity) return res.status(404).json({ message: "Entity not found" });
      res.json(entity);
    } catch (error: any) {
      console.error("[Entities API] Error fetching entity:", error);
      res.status(500).json({ message: "Error fetching entity" });
    }
  });

  app.get("/api/entities/code/:code", async (req, res) => {
    try {
      const entity = await storage.getEntityByCode(req.params.code);
      if (!entity) return res.status(404).json({ message: "Entity not found" });
      res.json(entity);
    } catch (error: any) {
      console.error("[Entities API] Error fetching entity by code:", error);
      res.status(500).json({ message: "Error fetching entity" });
    }
  });

  // Create entity with automatic Moneybird contact creation
  app.post("/api/entities", isAuthenticated, async (req, res) => {
    try {
      const result = insertEntitySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid entity data", errors: result.error.flatten() });
      }

      const { entityType, entityCode, displayName, contactData, tags } = result.data;

      // Create entity in PENDING state
      const entity = await storage.createEntity({
        entityType,
        entityCode,
        displayName,
        status: "PENDING",
        contactData: contactData as object || null,
        tags: tags as string[] || [],
      });

      // Create sync job for Moneybird contact creation
      const syncJob = await storage.createSyncJob({
        entityId: entity.id,
        provider: "MONEYBIRD",
        action: "CREATE_CONTACT",
        status: "PENDING",
        payload: contactData as object || null,
      });

      // Try to create Moneybird contact
      const moneybirdClient = await getMoneybirdClient();
      if (moneybirdClient && contactData) {
        try {
          await storage.updateSyncJob(syncJob.id, { status: "RUNNING" });
          
          const cd = contactData as any;
          const { contact, created } = await moneybirdClient.createOrUpdateContact(null, {
            company_name: cd.company || displayName,
            address1: cd.address || undefined,
            zipcode: cd.zipcode || undefined,
            city: cd.city || undefined,
            phone: cd.phone || undefined,
            email: cd.email || undefined,
            chamber_of_commerce: cd.kvk || undefined,
            tax_number: cd.btw || undefined,
          });

          // Update entity with Moneybird contact ID and set status to ACTIVE
          await storage.updateEntity(entity.id, {
            moneybirdContactId: contact.id,
            status: "ACTIVE",
          });

          await storage.updateSyncJob(syncJob.id, { 
            status: "SUCCESS",
            finishedAt: new Date(),
          });

          // Fetch updated entity
          const updatedEntity = await storage.getEntity(entity.id);
          return res.status(201).json({
            entity: updatedEntity,
            moneybirdContact: { id: contact.id, created },
          });
        } catch (mbError: any) {
          console.error("[Entities API] Moneybird error:", mbError);
          await storage.updateSyncJob(syncJob.id, { 
            status: "FAILED",
            errorMessage: mbError.message,
            finishedAt: new Date(),
          });
          await storage.updateEntity(entity.id, { status: "ERROR" });
        }
      }

      // Return entity even if Moneybird failed (status will be PENDING or ERROR)
      const finalEntity = await storage.getEntity(entity.id);
      res.status(201).json({ entity: finalEntity });
    } catch (error: any) {
      console.error("[Entities API] Error creating entity:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update entity
  app.patch("/api/entities/:id", isAuthenticated, async (req, res) => {
    try {
      const entity = await storage.updateEntity(req.params.id, req.body);
      if (!entity) return res.status(404).json({ message: "Entity not found" });
      res.json(entity);
    } catch (error: any) {
      console.error("[Entities API] Error updating entity:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete entity
  app.delete("/api/entities/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteEntity(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Entities API] Error deleting entity:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get sync jobs for entity
  app.get("/api/entities/:id/sync-jobs", async (req, res) => {
    try {
      const jobs = await storage.getSyncJobs(req.params.id);
      res.json(jobs);
    } catch (error: any) {
      console.error("[Entities API] Error fetching sync jobs:", error);
      res.status(500).json({ message: "Error fetching sync jobs" });
    }
  });

  // Get all sync jobs
  app.get("/api/sync-jobs", async (_req, res) => {
    try {
      const jobs = await storage.getSyncJobs();
      res.json(jobs);
    } catch (error: any) {
      console.error("[Entities API] Error fetching sync jobs:", error);
      res.status(500).json({ message: "Error fetching sync jobs" });
    }
  });

  // Retry sync job (re-attempt Moneybird contact creation)
  app.post("/api/entities/:id/retry-sync", isAuthenticated, async (req, res) => {
    try {
      const entity = await storage.getEntity(req.params.id);
      if (!entity) return res.status(404).json({ message: "Entity not found" });

      // Only retry if entity is in ERROR state
      if (entity.status !== "ERROR" && entity.status !== "PENDING") {
        return res.status(400).json({ message: "Entity is not in error state" });
      }

      const moneybirdClient = await getMoneybirdClient();
      if (!moneybirdClient) {
        return res.status(503).json({ message: "Moneybird not configured" });
      }

      // Create new sync job
      const syncJob = await storage.createSyncJob({
        entityId: entity.id,
        provider: "MONEYBIRD",
        action: entity.moneybirdContactId ? "UPDATE_CONTACT" : "CREATE_CONTACT",
        status: "RUNNING",
        payload: entity.contactData as object || null,
      });

      try {
        const cd = entity.contactData as any || {};
        const { contact, created } = await moneybirdClient.createOrUpdateContact(
          entity.moneybirdContactId || null,
          {
            company_name: cd.company || entity.displayName,
            address1: cd.address || undefined,
            zipcode: cd.zipcode || undefined,
            city: cd.city || undefined,
            phone: cd.phone || undefined,
            email: cd.email || undefined,
            chamber_of_commerce: cd.kvk || undefined,
            tax_number: cd.btw || undefined,
          }
        );

        await storage.updateEntity(entity.id, {
          moneybirdContactId: contact.id,
          status: "ACTIVE",
        });

        await storage.updateSyncJob(syncJob.id, { 
          status: "SUCCESS",
          finishedAt: new Date(),
        });

        const updatedEntity = await storage.getEntity(entity.id);
        res.json({ entity: updatedEntity, moneybirdContact: { id: contact.id, created } });
      } catch (mbError: any) {
        console.error("[Entities API] Retry Moneybird error:", mbError);
        await storage.updateSyncJob(syncJob.id, { 
          status: "FAILED",
          errorMessage: mbError.message,
          finishedAt: new Date(),
        });
        res.status(500).json({ message: `Moneybird sync failed: ${mbError.message}` });
      }
    } catch (error: any) {
      console.error("[Entities API] Error retrying sync:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/migrate/screens-to-sites", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const { migrateScreensToSites } = await import("./migrations/migrateScreensToSites");
      const result = await migrateScreensToSites();
      res.json(result);
    } catch (error: any) {
      console.error("[Migration] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============================================================================
  // SCREENS
  // ============================================================================

  app.get("/api/screens", async (_req, res) => {
    const screens = await storage.getScreens();
    
    // Enrich mediaItems with category if missing (for backward compatibility with old data)
    const enrichedScreens = screens.map(screen => {
      const summary = screen.yodeckContentSummary as any;
      if (summary?.mediaItems && Array.isArray(summary.mediaItems)) {
        // Classify all items at once for efficiency
        const result = classifyMediaItems(summary.mediaItems);
        const categoryMap = new Map(result.classifiedMediaItems.map(c => [c.id, c.category]));
        
        const enrichedMediaItems = summary.mediaItems.map((m: any) => {
          if (m.category) return m; // Already has category
          return { ...m, category: categoryMap.get(m.id) || 'ad' };
        });
        return {
          ...screen,
          yodeckContentSummary: { ...summary, mediaItems: enrichedMediaItems },
        };
      }
      return screen;
    });
    
    res.json(enrichedScreens);
  });

  // ScreenWithBusiness: Gecombineerd data object voor UI
  // Retourneert: yodeck info, moneybirdContact, linkStatus, locationLabel
  // Moneybird velden: city, address1, zipcode komen uit moneybirdContactSnapshot (JSONB)
  app.get("/api/screens/with-business", async (_req, res) => {
    const screens = await storage.getScreens();
    
    const screensWithBusiness = screens.map(screen => {
      // Parse Moneybird contact snapshot (filled when screen is linked via /api/screens/:id/link-moneybird)
      // Velden: companyName, address1, zipcode, city, country, phone, email, chamberOfCommerce, taxNumber
      const snapshot = screen.moneybirdContactSnapshot as {
        companyName?: string;
        firstname?: string;
        lastname?: string;
        address1?: string;
        zipcode?: string;
        city?: string;
        country?: string;
        phone?: string;
        email?: string;
        kvk?: string;
        btw?: string;
        chamberOfCommerce?: string;
        taxNumber?: string;
      } | null;

      // Debug logging for development
      if (process.env.NODE_ENV === 'development' && screen.moneybirdContactId) {
        console.log(`[ScreenWithBusiness] ${screen.screenId}: moneybirdContactId=${screen.moneybirdContactId}, snapshot.city=${snapshot?.city || 'EMPTY'}, snapshot.address1=${snapshot?.address1 || 'EMPTY'}`);
      }

      // Determine link status
      let linkStatus: "linked" | "unlinked" | "missing_data" = "unlinked";
      if (screen.moneybirdContactId && snapshot) {
        linkStatus = snapshot.companyName ? "linked" : "missing_data";
      } else if (screen.moneybirdContactId) {
        linkStatus = "missing_data";
      }

      // Build location sublabel: address1 • zipcode (alleen als aanwezig)
      let locationSubLabel: string | null = null;
      if (snapshot?.address1 || snapshot?.zipcode) {
        const parts = [snapshot.address1, snapshot.zipcode].filter(Boolean);
        locationSubLabel = parts.join(" • ");
      }

      return {
        id: screen.id,
        screenId: screen.screenId,
        yodeck: {
          deviceId: screen.yodeckPlayerId || null,
          screenName: screen.yodeckPlayerName || screen.name,
          tags: [], // Tags not stored on screens, reserved for future
          uuid: screen.yodeckUuid || null,
          status: screen.status,
          lastSeenAt: screen.lastSeenAt,
          screenshotUrl: screen.yodeckScreenshotUrl || null,
        },
        moneybirdContact: screen.moneybirdContactId && snapshot ? {
          id: screen.moneybirdContactId,
          name: snapshot.companyName || `${snapshot.firstname || ''} ${snapshot.lastname || ''}`.trim() || null,
          address1: snapshot.address1 || null,
          zipcode: snapshot.zipcode || null,
          city: snapshot.city || null,
          country: snapshot.country || null,
          phone: snapshot.phone || null,
          email: snapshot.email || null,
          kvk: snapshot.chamberOfCommerce || snapshot.kvk || null,
          btw: snapshot.taxNumber || snapshot.btw || null,
        } : null,
        linkStatus,
        // Plaats (city) als primaire locatie indicator
        locationLabel: snapshot?.city || screen.city || "—",
        // Straat + postcode als secundaire info
        locationSubLabel,
        isActive: screen.isActive,
        createdAt: screen.createdAt,
      };
    });

    res.json(screensWithBusiness);
  });

  app.get("/api/screens/:id", async (req, res) => {
    const screen = await storage.getScreen(req.params.id);
    if (!screen) return res.status(404).json({ message: "Screen not found" });
    
    // Fetch current content items from screen_content_items table
    const currentContent = await storage.getScreenContentItems(screen.id);
    
    // Enrich mediaItems with category if missing (for backward compatibility)
    const summary = screen.yodeckContentSummary as any;
    if (summary?.mediaItems && Array.isArray(summary.mediaItems)) {
      const result = classifyMediaItems(summary.mediaItems);
      const categoryMap = new Map(result.classifiedMediaItems.map(c => [c.id, c.category]));
      
      const enrichedMediaItems = summary.mediaItems.map((m: any) => {
        if (m.category) return m;
        return { ...m, category: categoryMap.get(m.id) || 'ad' };
      });
      res.json({
        ...screen,
        yodeckContentSummary: { ...summary, mediaItems: enrichedMediaItems },
        currentContent,
      });
    } else {
      res.json({ ...screen, currentContent });
    }
  });

  // Debug endpoint for Yodeck content per screen
  // GET /api/screens/:id/yodeck-debug
  // Returns: attemptedEndpoints, responsesSummary, resolvedContent
  app.get("/api/screens/:id/yodeck-debug", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.id);
      if (!screen) return res.status(404).json({ message: "Screen not found" });
      
      const playerId = screen.yodeckPlayerId;
      if (!playerId) {
        return res.json({
          screenId: screen.screenId,
          error: "No yodeckPlayerId linked",
          attemptedEndpoints: [],
          responsesSummary: {},
          resolvedContent: {
            status: "unknown",
            count: 0,
            items: [],
            playlists: [],
          },
        });
      }
      
      console.log(`[YodeckDebug] Debug request for screen ${screen.screenId} (playerId=${playerId})`);
      
      const { discoverScreenContent, debugYodeckScreen } = await import("./services/yodeckContent");
      
      // Get discovery result with probes (with safe defaults)
      const discoveryResult = await discoverScreenContent(playerId);
      
      // Get raw debug info (with safe defaults)
      let debugResult: any = { screenDetail: null };
      try {
        debugResult = await debugYodeckScreen(playerId);
      } catch (debugError: any) {
        console.log(`[YodeckDebug] Debug fetch failed: ${debugError.message}`);
      }
      
      // Safe access with defaults
      const resolved = discoveryResult?.resolved || {
        status: "error",
        statusReason: "Discovery failed",
        count: 0,
        playlists: [],
        topItems: [],
      };
      const tried = discoveryResult?.tried || [];
      
      res.json({
        screenId: screen.screenId,
        yodeckPlayerId: playerId,
        yodeckPlayerName: screen.yodeckPlayerName,
        attemptedEndpoints: tried.map((t: any) => ({
          endpoint: t.endpoint,
          status: t.status,
          hasContent: t.hasContent,
          keys: t.keys,
        })),
        responsesSummary: {
          screenContent: debugResult?.screenDetail?.screen_content || null,
          screenState: debugResult?.screenDetail?.state || null,
          screenName: debugResult?.screenDetail?.name || null,
        },
        resolvedContent: {
          status: resolved.status,
          statusReason: resolved.statusReason,
          count: resolved.count,
          items: discoveryResult?.playlistItems || [],
          playlists: resolved.playlists || [],
          topItems: resolved.topItems || [],
        },
        // Current DB values for comparison
        currentDbValues: {
          yodeckContentStatus: screen.yodeckContentStatus,
          yodeckContentCount: screen.yodeckContentCount,
          yodeckContentSummary: screen.yodeckContentSummary,
          yodeckContentLastFetchedAt: screen.yodeckContentLastFetchedAt,
          yodeckContentError: screen.yodeckContentError,
        },
      });
    } catch (error: any) {
      console.error("[YodeckDebug] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/screens", async (req, res) => {
    try {
      const data = insertScreenSchema.parse(req.body);
      const screen = await storage.createScreen(data);
      res.status(201).json(screen);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Create screen with automatic Moneybird contact creation or linking
  // Link Yodeck screen to Moneybird contact
  app.post("/api/screens/with-moneybird", requirePermission("onboard_screens"), async (req, res) => {
    try {
      const { 
        screenId, 
        name,
        yodeckPlayerId,
        // Bestaand Moneybird contact koppelen
        moneybirdContactId: existingMoneybirdContactId,
        // Nieuw Moneybird contact aanmaken
        company,
        city,
        address,
        zipcode,
        email,
        phone,
        kvk,
        btw,
        createMoneybird = false, // Default: geen nieuw contact (alleen koppelen)
      } = req.body;

      if (!screenId) {
        return res.status(400).json({ message: "screenId (bijv. EVZ-001) is vereist" });
      }
      if (!name && !company) {
        return res.status(400).json({ message: "Naam of bedrijfsnaam is vereist" });
      }
      // VALIDATIE: Yodeck device is verplicht
      if (!yodeckPlayerId) {
        return res.status(400).json({ message: "yodeckPlayerId is vereist - selecteer een Yodeck scherm" });
      }
      // VALIDATIE: Moneybird contact is verplicht (bestaand of nieuw)
      if (!existingMoneybirdContactId && !createMoneybird) {
        return res.status(400).json({ message: "Moneybird contact is vereist - selecteer of maak een contact" });
      }

      let moneybirdContactId: string | null = existingMoneybirdContactId || null;
      let moneybirdContactSnapshot: Record<string, any> | null = null;

      // CASE 1: Link existing Moneybird contact (from local cache)
      if (existingMoneybirdContactId && !createMoneybird) {
        console.log(`[Onboarding] Linking existing Moneybird contact: ${existingMoneybirdContactId}`);
        
        // VALIDATIE: Controleer dat contact bestaat in lokale cache
        const cachedContact = await storage.getMoneybirdContactByMoneybirdId(existingMoneybirdContactId);
        if (!cachedContact) {
          return res.status(400).json({ 
            message: `Moneybird contact ${existingMoneybirdContactId} niet gevonden. Synchroniseer eerst de contacten.` 
          });
        }
        
        // Snapshot opslaan voor snelle weergave (geen API calls nodig later)
        // Dit is geen "lokale kopie" maar een cache voor performance
        moneybirdContactSnapshot = {
          companyName: cachedContact.companyName,
          firstname: cachedContact.firstname,
          lastname: cachedContact.lastname,
          address1: cachedContact.address1,
          zipcode: cachedContact.zipcode,
          city: cachedContact.city,
          email: cachedContact.email,
          phone: cachedContact.phone,
          chamberOfCommerce: cachedContact.chamberOfCommerce,
          taxNumber: cachedContact.taxNumber,
          syncedAt: new Date().toISOString(),
        };
      }
      
      // CASE 2: Create new Moneybird contact
      else if (createMoneybird && company) {
        try {
          const { getMoneybirdClient } = await import("./services/moneybirdClient");
          const mbClient = await getMoneybirdClient();
          
          if (mbClient) {
            const { contact, created } = await mbClient.createOrUpdateContact(null, {
              company_name: company,
              address1: address || undefined,
              zipcode: zipcode || undefined,
              city: city || undefined,
              email: email || undefined,
              phone: phone || undefined,
              chamber_of_commerce: kvk || undefined,
              tax_number: btw || undefined,
            });

            console.log(`[Onboarding] ${created ? 'Created' : 'Found'} Moneybird contact for ${company}: ${contact.id}`);

            moneybirdContactId = contact.id;
            moneybirdContactSnapshot = {
              companyName: contact.company_name,
              address1: contact.address1,
              zipcode: contact.zipcode,
              city: contact.city,
              email: contact.email,
              phone: contact.phone,
              chamberOfCommerce: contact.chamber_of_commerce,
              taxNumber: contact.tax_number,
              syncedAt: new Date().toISOString(),
            };

            // Also cache in local DB
            await storage.upsertMoneybirdContact({
              moneybirdId: contact.id,
              companyName: contact.company_name || null,
              firstname: contact.firstname || null,
              lastname: contact.lastname || null,
              email: contact.email || null,
              phone: contact.phone || null,
              address1: contact.address1 || null,
              address2: contact.address2 || null,
              zipcode: contact.zipcode || null,
              city: contact.city || null,
              country: contact.country || null,
              chamberOfCommerce: contact.chamber_of_commerce || null,
              taxNumber: contact.tax_number || null,
            });
          }
        } catch (mbError: any) {
          console.error("[Onboarding] Failed to create Moneybird contact:", mbError);
          // Continue without Moneybird - we'll create the screen anyway
        }
      }

      // Create the screen with required fields
      const effectiveName = company || name;
      const screenData: any = {
        screenId,
        name: name || company,
        status: "unknown",
        isActive: true,
        effectiveName,
      };

      // Add optional fields only if they have values
      if (yodeckPlayerId) screenData.yodeckPlayerId = yodeckPlayerId;
      if (city) screenData.city = city;
      if (moneybirdContactId) {
        screenData.moneybirdContactId = moneybirdContactId;
        screenData.moneybirdContactSnapshot = moneybirdContactSnapshot;
        screenData.moneybirdSyncStatus = "linked";
      }

      const screen = await storage.createScreen(screenData);

      res.status(201).json({
        success: true,
        screen,
        moneybirdContactCreated: !!moneybirdContactId,
      });
    } catch (error: any) {
      console.error("[Onboarding] Error creating screen:", error);
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/screens/:id", async (req, res) => {
    const screen = await storage.updateScreen(req.params.id, req.body);
    if (!screen) return res.status(404).json({ message: "Screen not found" });
    res.json(screen);
  });

  app.delete("/api/screens/:id", async (req, res) => {
    await storage.deleteScreen(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // SCREEN STATISTICS (Yodeck)
  // ============================================================================

  const statsFilterSchema = z.object({
    startDate: z.string().optional().default(() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d.toISOString().split("T")[0];
    }),
    endDate: z.string().optional().default(() => new Date().toISOString().split("T")[0]),
    granularity: z.enum(["hour", "day", "week"]).optional().default("day"),
    activeHoursOnly: z.coerce.boolean().optional().default(false),
    forceRefresh: z.coerce.boolean().optional().default(false),
  });

  app.get("/api/screens/:id/stats", async (req, res) => {
    try {
      const screen = await storage.getScreen(req.params.id);
      if (!screen) return res.status(404).json({ message: "Screen not found" });

      const query = statsFilterSchema.parse(req.query);
      const stats = await getScreenStats(req.params.id, {
        dateRange: { startDate: query.startDate, endDate: query.endDate },
        granularity: query.granularity,
        activeHoursOnly: query.activeHoursOnly,
        forceRefresh: query.forceRefresh,
      });

      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching screen stats:", error);
      res.status(500).json({ message: error.message || "Fout bij ophalen statistieken" });
    }
  });

  app.get("/api/advertisers/:id/stats", async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) return res.status(404).json({ message: "Advertiser not found" });

      const query = statsFilterSchema.parse(req.query);
      const stats = await getAdvertiserStats(req.params.id, {
        dateRange: { startDate: query.startDate, endDate: query.endDate },
        granularity: query.granularity,
        activeHoursOnly: query.activeHoursOnly,
        forceRefresh: query.forceRefresh,
      });

      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching advertiser stats:", error);
      res.status(500).json({ message: error.message || "Fout bij ophalen statistieken" });
    }
  });

  app.post("/api/stats/refresh", isAuthenticated, async (_req, res) => {
    try {
      clearStatsCache();
      res.json({ success: true, message: "Stats cache cleared" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // PACKAGE PLANS
  // ============================================================================

  app.get("/api/package-plans", async (_req, res) => {
    const plans = await storage.getPackagePlans();
    res.json(plans);
  });

  app.post("/api/package-plans", async (req, res) => {
    try {
      const data = insertPackagePlanSchema.parse(req.body);
      const plan = await storage.createPackagePlan(data);
      res.status(201).json(plan);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/package-plans/:id", async (req, res) => {
    const plan = await storage.updatePackagePlan(req.params.id, req.body);
    if (!plan) return res.status(404).json({ message: "Package plan not found" });
    res.json(plan);
  });

  // ============================================================================
  // CONTRACTS
  // ============================================================================

  app.get("/api/contracts", async (_req, res) => {
    const contracts = await storage.getContracts();
    res.json(contracts);
  });

  app.get("/api/contracts/:id", async (req, res) => {
    const contract = await storage.getContract(req.params.id);
    if (!contract) return res.status(404).json({ message: "Contract not found" });
    res.json(contract);
  });

  app.post("/api/contracts", async (req, res) => {
    try {
      const { screenIds, ...contractData } = req.body;
      const data = insertContractSchema.parse(contractData);
      const contract = await storage.createContract(data);

      // Create placements if screenIds provided
      if (screenIds && Array.isArray(screenIds)) {
        for (const screenId of screenIds) {
          await storage.createPlacement({
            contractId: contract.id,
            screenId,
            secondsPerLoop: 10,
            playsPerHour: 6,
          });
        }
      }

      res.status(201).json(contract);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contracts/:id", async (req, res) => {
    const contract = await storage.updateContract(req.params.id, req.body);
    if (!contract) return res.status(404).json({ message: "Contract not found" });
    res.json(contract);
  });

  // ============================================================================
  // PLACEMENTS
  // ============================================================================

  app.get("/api/placements", async (_req, res) => {
    const placements = await storage.getPlacements();
    res.json(placements);
  });

  // New endpoint: Get all ads (from Yodeck media) with linked/unlinked status
  // This shows ALL ads including those that are not yet linked to a placement
  app.get("/api/placements/ads-view", async (_req, res) => {
    try {
      const mediaLinks = await storage.getYodeckMediaLinks();
      const screens = await storage.getScreens();
      const advertisers = await storage.getAdvertisers();
      const screenContentItems = await storage.getAllScreenContentItems();
      
      // Filter to only show ads (not non_ad content)
      const ads = mediaLinks.filter(m => m.category === 'ad');
      
      // Get locations for name lookup
      const locations = await storage.getLocations();
      
      // Build a map of which screens each ad is playing on
      const adScreenMap: Record<number, Array<{ screenId: string; screenDisplayId: string; screenName: string; locationName: string; isOnline: boolean }>> = {};
      for (const item of screenContentItems) {
        if (item.category === 'ad' && item.isActive) {
          const screen = screens.find(s => s.id === item.screenId);
          if (screen) {
            if (!adScreenMap[item.yodeckMediaId]) {
              adScreenMap[item.yodeckMediaId] = [];
            }
            const location = locations.find(l => l.id === screen.locationId);
            adScreenMap[item.yodeckMediaId].push({
              screenId: item.screenId,
              screenDisplayId: screen.screenId, // EVZ-001 format
              screenName: screen.name,
              locationName: location?.name || screen.name,
              isOnline: screen.status === 'online',
            });
          }
        }
      }
      
      // Build response with all ads
      const result = ads.map(ad => {
        const advertiser = ad.advertiserId ? advertisers.find(a => a.id === ad.advertiserId) : null;
        const screensPlaying = adScreenMap[ad.yodeckMediaId] || [];
        
        return {
          yodeckMediaId: ad.yodeckMediaId,
          name: ad.name,
          mediaType: ad.mediaType,
          duration: ad.duration,
          // Linking status
          advertiserId: ad.advertiserId,
          advertiserName: advertiser?.companyName || null,
          placementId: ad.placementId,
          status: ad.advertiserId || ad.placementId ? 'linked' : 'unlinked',
          // Where it's playing
          screensCount: screensPlaying.length,
          screens: screensPlaying,
          // Timestamps
          lastSeenAt: ad.lastSeenAt,
          updatedAt: ad.updatedAt,
        };
      });
      
      // Sort: unlinked first, then by name
      result.sort((a, b) => {
        if (a.status === 'unlinked' && b.status !== 'unlinked') return -1;
        if (a.status !== 'unlinked' && b.status === 'unlinked') return 1;
        return a.name.localeCompare(b.name);
      });
      
      res.json({ 
        items: result,
        summary: {
          total: result.length,
          linked: result.filter(r => r.status === 'linked').length,
          unlinked: result.filter(r => r.status === 'unlinked').length,
        }
      });
    } catch (error: any) {
      console.error("Error fetching ads view:", error);
      res.status(500).json({ message: "Failed to load ads view" });
    }
  });

  app.get("/api/contracts/:contractId/placements", async (req, res) => {
    const placements = await storage.getPlacementsByContract(req.params.contractId);
    res.json(placements);
  });

  app.post("/api/placements", async (req, res) => {
    try {
      const data = insertPlacementSchema.parse(req.body);
      const placement = await storage.createPlacement(data);
      res.status(201).json(placement);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/placements/:id", async (req, res) => {
    await storage.deletePlacement(req.params.id);
    res.status(204).send();
  });

  app.patch("/api/placements/:id", async (req, res) => {
    try {
      const parseResult = placementUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.message });
      }
      
      const updateData = parseResult.data;
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const placement = await storage.updatePlacement(req.params.id, updateData);
      if (!placement) {
        return res.status(404).json({ message: "Placement not found" });
      }
      res.json(placement);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // SCHEDULE SNAPSHOTS
  // ============================================================================

  app.get("/api/snapshots", async (_req, res) => {
    const snapshots = await storage.getScheduleSnapshots();
    res.json(snapshots);
  });

  app.get("/api/snapshots/:id", async (req, res) => {
    const snapshot = await storage.getScheduleSnapshot(req.params.id);
    if (!snapshot) return res.status(404).json({ message: "Snapshot not found" });
    
    const placements = await storage.getSnapshotPlacements(snapshot.id);
    res.json({ ...snapshot, placements });
  });

  // Create snapshot for monthly close
  app.post("/api/snapshots", async (req, res) => {
    try {
      const { year, month } = req.body;
      if (!year || !month) {
        return res.status(400).json({ message: "Jaar en maand zijn verplicht" });
      }

      // Check if snapshot already exists
      const existing = await storage.getSnapshotByPeriod(year, month);
      if (existing) {
        return res.status(400).json({ message: "Snapshot voor deze maand bestaat al" });
      }

      // Get active contracts for this period
      const contracts = await storage.getActiveContracts();
      const allPlacements = await storage.getPlacements();
      const screens = await storage.getScreens();
      const locations = await storage.getLocations();
      const pendingCarryOvers = await storage.getAllPendingCarryOvers();

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);
      const daysInMonth = periodEnd.getDate();

      // Filter contracts active in this period
      const activeContracts = contracts.filter(c => {
        const start = new Date(c.startDate);
        if (start > periodEnd) return false;
        if (c.endDate) {
          const end = new Date(c.endDate);
          if (end < periodStart) return false;
        }
        return true;
      });

      // Calculate total revenue from active contracts
      const totalRevenue = activeContracts.reduce((sum, c) => sum + parseFloat(c.monthlyPriceExVat), 0);

      // Freeze all data at snapshot time for immutability
      const advertisers = await storage.getAdvertisers();
      const frozenData = {
        frozenContracts: activeContracts.map(c => ({
          id: c.id,
          name: c.name,
          advertiserId: c.advertiserId,
          advertiserName: advertisers.find(a => a.id === c.advertiserId)?.companyName,
          monthlyPriceExVat: c.monthlyPriceExVat,
          vatPercent: c.vatPercent,
          billingCycle: c.billingCycle,
        })),
        frozenLocations: locations.map(l => ({
          id: l.id,
          name: l.name,
          revenueSharePercent: l.revenueSharePercent,
          minimumPayoutAmount: l.minimumPayoutAmount,
        })),
        frozenCarryOvers: pendingCarryOvers.map(co => ({
          id: co.id,
          locationId: co.locationId,
          periodYear: co.periodYear,
          periodMonth: co.periodMonth,
          amount: co.amount,
        })),
        frozenTotalRevenue: totalRevenue.toFixed(2),
        createdAt: new Date().toISOString(),
      };

      // Create the snapshot with normalized schema fields and frozen data
      const snapshot = await storage.createScheduleSnapshot({
        periodYear: year,
        periodMonth: month,
        status: "draft",
        totalRevenue: totalRevenue.toFixed(2),
        notes: JSON.stringify(frozenData),
      });

      // Create snapshot placements with weight-based calculations
      const activePlacements = allPlacements.filter(p => 
        activeContracts.some(c => c.id === p.contractId)
      );

      let totalWeight = 0;
      for (const p of activePlacements) {
        const contract = activeContracts.find(c => c.id === p.contractId);
        const screen = screens.find(s => s.id === p.screenId);
        const location = locations.find(l => l.id === screen?.locationId);
        
        // Skip placements without a valid location
        if (!location?.id) continue;
        
        // Calculate weight: seconds × plays × days
        const secondsPerLoop = p.secondsPerLoop || 10;
        const playsPerHour = p.playsPerHour || 6;
        const weight = secondsPerLoop * playsPerHour * daysInMonth;
        totalWeight += weight;
        
        await storage.createSnapshotPlacement({
          snapshotId: snapshot.id,
          placementId: p.id,
          contractId: p.contractId,
          screenId: p.screenId,
          advertiserId: contract?.advertiserId || "",
          locationId: location.id,
          secondsPerLoop,
          playsPerHour,
          daysActive: daysInMonth,
          weight: weight.toFixed(2),
        });
      }

      // Update snapshot with total weight
      await storage.updateScheduleSnapshot(snapshot.id, {
        totalWeight: totalWeight.toFixed(2),
      });

      res.status(201).json({ ...snapshot, totalWeight: totalWeight.toFixed(2) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate invoices from snapshot (uses frozen contract data for immutability)
  app.post("/api/snapshots/:id/generate-invoices", async (req, res) => {
    try {
      const snapshot = await storage.getScheduleSnapshot(req.params.id);
      if (!snapshot) {
        return res.status(404).json({ message: "Snapshot niet gevonden" });
      }

      if (snapshot.status === "locked") {
        return res.status(400).json({ message: "Snapshot is al afgesloten" });
      }

      // Parse frozen data from snapshot notes (immutable at creation time)
      let frozenData: any = {};
      try {
        frozenData = snapshot.notes ? JSON.parse(snapshot.notes) : {};
      } catch {
        return res.status(400).json({ message: "Snapshot data is beschadigd. Maak een nieuwe snapshot." });
      }

      const frozenContracts = frozenData.frozenContracts || [];
      if (frozenContracts.length === 0) {
        return res.status(400).json({ message: "Geen contracten gevonden in snapshot. Maak een nieuwe snapshot." });
      }

      const existingInvoices = await storage.getInvoices();
      
      const periodStart = new Date(snapshot.periodYear, snapshot.periodMonth - 1, 1).toISOString().split("T")[0];
      const periodEnd = new Date(snapshot.periodYear, snapshot.periodMonth, 0).toISOString().split("T")[0];

      let count = 0;
      for (const contract of frozenContracts) {
        // Check if invoice already exists for this contract and period
        const exists = existingInvoices.some(inv => 
          inv.contractId === contract.id && 
          inv.periodStart === periodStart
        );

        if (exists) continue;

        const amountExVat = parseFloat(contract.monthlyPriceExVat);
        const vatRate = parseFloat(contract.vatPercent) / 100;
        const vatAmount = amountExVat * vatRate;
        const amountIncVat = amountExVat + vatAmount;

        // Generate invoice number
        const invoiceNumber = `INV-${snapshot.periodYear}-${String(snapshot.periodMonth).padStart(2, "0")}-${String(count + 1).padStart(4, "0")}`;

        await storage.createInvoice({
          advertiserId: contract.advertiserId,
          contractId: contract.id,
          snapshotId: snapshot.id,
          invoiceNumber,
          periodStart,
          periodEnd,
          amountExVat: amountExVat.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
          amountIncVat: amountIncVat.toFixed(2),
          status: "draft",
          dueDate: new Date(snapshot.periodYear, snapshot.periodMonth, 15).toISOString().split("T")[0],
        });

        count++;
      }

      await storage.updateScheduleSnapshot(snapshot.id, { status: "invoiced" });

      res.json({ success: true, count, message: `${count} facturen aangemaakt` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate payouts from snapshot using weight-based revenue distribution (uses frozen data)
  app.post("/api/snapshots/:id/generate-payouts", async (req, res) => {
    try {
      const snapshot = await storage.getScheduleSnapshot(req.params.id);
      if (!snapshot) {
        return res.status(404).json({ message: "Snapshot niet gevonden" });
      }

      if (snapshot.status === "locked") {
        return res.status(400).json({ message: "Snapshot is afgesloten, uitbetalingen kunnen niet meer worden gewijzigd" });
      }

      // Parse frozen data from snapshot notes (immutable at creation time)
      let frozenData: any = {};
      try {
        frozenData = snapshot.notes ? JSON.parse(snapshot.notes) : {};
      } catch {
        return res.status(400).json({ message: "Snapshot data is beschadigd. Maak een nieuwe snapshot." });
      }

      const frozenLocations = frozenData.frozenLocations || [];
      const frozenCarryOvers = frozenData.frozenCarryOvers || [];

      const snapshotPlacements = await storage.getSnapshotPlacements(snapshot.id);

      // Validate all placements have valid locationIds
      const invalidPlacements = snapshotPlacements.filter(p => !p.locationId);
      if (invalidPlacements.length > 0) {
        return res.status(422).json({
          message: `Data integriteit fout: ${invalidPlacements.length} placements hebben geen geldige locatie. Maak een nieuwe snapshot.`,
        });
      }

      const totalRevenue = parseFloat(snapshot.totalRevenue || "0");
      const totalWeight = parseFloat(snapshot.totalWeight || "0");

      // Group by location and calculate revenue share based on weight (using frozen location data)
      const locationPayouts = new Map<string, { 
        amount: number; 
        revenueSharePercent: string; 
        minPayout: number; 
        carryOverIds: string[];
        locationName: string;
      }>();

      // Calculate revenue share per location based on weight proportion
      for (const placement of snapshotPlacements) {
        const frozenLocation = frozenLocations.find((l: any) => l.id === placement.locationId);
        if (!frozenLocation) continue;

        const weight = parseFloat(placement.weight);
        const sharePercent = parseFloat(frozenLocation.revenueSharePercent || "0");
        const minPayout = parseFloat(frozenLocation.minimumPayoutAmount || "0");
        
        // Revenue proportional to weight, then apply share percentage
        const proportionalRevenue = totalWeight > 0 ? (weight / totalWeight) * totalRevenue : 0;
        const share = (proportionalRevenue * sharePercent) / 100;
        
        const current = locationPayouts.get(placement.locationId);
        if (current) {
          current.amount += share;
        } else {
          locationPayouts.set(placement.locationId, {
            amount: share,
            revenueSharePercent: frozenLocation.revenueSharePercent || "0",
            minPayout,
            carryOverIds: [],
            locationName: frozenLocation.name,
          });
        }
      }

      // Add frozen carry-overs (from snapshot creation time, not live data)
      for (const carryOver of frozenCarryOvers) {
        const frozenLocation = frozenLocations.find((l: any) => l.id === carryOver.locationId);
        if (!frozenLocation) continue;

        const current = locationPayouts.get(carryOver.locationId);
        if (current) {
          current.amount += parseFloat(carryOver.amount);
          current.carryOverIds.push(carryOver.id);
        } else {
          locationPayouts.set(carryOver.locationId, {
            amount: parseFloat(carryOver.amount),
            revenueSharePercent: frozenLocation.revenueSharePercent || "0",
            minPayout: parseFloat(frozenLocation.minimumPayoutAmount || "0"),
            carryOverIds: [carryOver.id],
            locationName: frozenLocation.name,
          });
        }
      }

      // Build payout results
      const payoutResults: any[] = [];
      const carryOverResults: any[] = [];

      const periodStart = new Date(snapshot.periodYear, snapshot.periodMonth - 1, 1).toISOString().split("T")[0];
      const periodEnd = new Date(snapshot.periodYear, snapshot.periodMonth, 0).toISOString().split("T")[0];

      for (const [locationId, data] of Array.from(locationPayouts.entries())) {
        if (data.amount === 0) continue;

        if (data.amount >= data.minPayout) {
          payoutResults.push({
            locationId,
            locationName: data.locationName,
            periodStart,
            periodEnd,
            revenueAmount: data.amount.toFixed(2),
            revenueSharePercent: data.revenueSharePercent,
            payoutAmount: data.amount.toFixed(2),
            appliedCarryOverIds: data.carryOverIds,
          });
        } else {
          carryOverResults.push({
            locationId,
            locationName: data.locationName,
            amount: data.amount.toFixed(2),
            appliedCarryOverIds: data.carryOverIds,
          });
        }
      }

      // Store payout results in notes, preserving frozen data
      const updatedNotes = {
        ...frozenData,
        payoutResults,
        carryOverResults,
        payoutsGeneratedAt: new Date().toISOString(),
      };

      await storage.updateScheduleSnapshot(snapshot.id, {
        status: "payouts_calculated",
        notes: JSON.stringify(updatedNotes),
      });

      res.json({ 
        success: true, 
        count: payoutResults.length, 
        carryOverCount: carryOverResults.length,
        payoutResults,
        carryOverResults,
        message: `${payoutResults.length} uitbetalingen berekend${carryOverResults.length > 0 ? `, ${carryOverResults.length} bedragen worden doorgeschoven` : ""}` 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Lock snapshot (finalize month and apply database mutations)
  app.post("/api/snapshots/:id/lock", async (req, res) => {
    try {
      const snapshot = await storage.getScheduleSnapshot(req.params.id);
      if (!snapshot) {
        return res.status(404).json({ message: "Snapshot niet gevonden" });
      }

      if (snapshot.status === "locked") {
        return res.status(400).json({ message: "Snapshot is al afgesloten" });
      }

      // Parse payout results from notes field (stored by generate-payouts)
      let payoutResults: any[] = [];
      let carryOverResults: any[] = [];
      try {
        const notesData = snapshot.notes ? JSON.parse(snapshot.notes) : {};
        payoutResults = notesData.payoutResults || [];
        carryOverResults = notesData.carryOverResults || [];
      } catch {
        // Notes field not in expected format - regenerate payouts first
        return res.status(400).json({ 
          message: "Uitbetalingen zijn nog niet berekend. Bereken eerst de uitbetalingen." 
        });
      }

      if (payoutResults.length === 0 && carryOverResults.length === 0) {
        return res.status(400).json({ 
          message: "Geen uitbetalingen om te verwerken. Bereken eerst de uitbetalingen." 
        });
      }

      const locations = await storage.getLocations();

      // Apply all payout mutations at lock time
      for (const payout of payoutResults) {
        const location = locations.find(l => l.id === payout.locationId);
        
        await storage.createPayout({
          locationId: payout.locationId,
          snapshotId: snapshot.id,
          periodStart: payout.periodStart,
          periodEnd: payout.periodEnd,
          grossRevenueExVat: payout.revenueAmount,
          sharePercent: payout.revenueSharePercent,
          payoutAmountExVat: payout.payoutAmount,
          totalDue: payout.payoutAmount,
          status: "pending",
        });

        // Mark all applied carry-overs as used
        for (const carryOverId of payout.appliedCarryOverIds || []) {
          await storage.updateCarryOver(carryOverId, { status: "applied" });
        }
      }

      // Create new carry-overs for amounts below minimum payout
      for (const carryOver of carryOverResults) {
        await storage.createCarryOver({
          locationId: carryOver.locationId,
          periodYear: snapshot.periodYear,
          periodMonth: snapshot.periodMonth,
          amount: carryOver.amount,
          status: "pending",
        });

        // Mark all applied carry-overs as used (rolled into the new one)
        for (const carryOverId of carryOver.appliedCarryOverIds || []) {
          await storage.updateCarryOver(carryOverId, { status: "applied" });
        }
      }

      await storage.updateScheduleSnapshot(snapshot.id, {
        status: "locked",
        lockedAt: new Date(),
      });

      res.json({ success: true, message: "Maand succesvol afgesloten" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/snapshots/generate", async (req, res) => {
    try {
      const { year, month } = req.body;
      
      // Check if snapshot already exists
      const existing = await storage.getSnapshotByPeriod(year, month);
      if (existing) {
        return res.status(400).json({ message: "Snapshot already exists for this period" });
      }

      // Get all active contracts with placements
      const contracts = await storage.getActiveContracts();
      const placements = await storage.getPlacements();
      const screens = await storage.getScreens();

      // Calculate total revenue from active contracts
      const totalRevenue = contracts.reduce((sum, c) => sum + parseFloat(c.monthlyPriceExVat), 0);

      // Create snapshot
      const snapshot = await storage.createScheduleSnapshot({
        periodYear: year,
        periodMonth: month,
        status: "draft",
        totalRevenue: totalRevenue.toFixed(2),
      });

      // Calculate weight for each placement
      // Weight = seconds per loop × plays per hour × days active (30 for full month)
      let totalWeight = 0;
      const placementWeights: { placement: any; weight: number; screen: any }[] = [];

      for (const placement of placements) {
        const contract = contracts.find(c => c.id === placement.contractId);
        if (!contract || contract.status !== "active") continue;
        
        const screen = screens.find(s => s.id === placement.screenId);
        if (!screen) continue;

        const daysActive = 30; // Assume full month for now
        const weight = placement.secondsPerLoop * placement.playsPerHour * daysActive;
        totalWeight += weight;
        placementWeights.push({ placement, weight, screen });
      }

      // Create snapshot placements with revenue shares
      for (const { placement, weight, screen } of placementWeights) {
        const contract = contracts.find(c => c.id === placement.contractId);
        if (!contract) continue;

        const revenueShare = totalWeight > 0 ? (weight / totalWeight) * totalRevenue : 0;

        await storage.createSnapshotPlacement({
          snapshotId: snapshot.id,
          placementId: placement.id,
          contractId: placement.contractId,
          screenId: placement.screenId,
          locationId: screen.locationId,
          advertiserId: contract.advertiserId,
          secondsPerLoop: placement.secondsPerLoop,
          playsPerHour: placement.playsPerHour,
          daysActive: 30,
          weight: weight.toFixed(2),
          revenueShare: revenueShare.toFixed(2),
        });
      }

      // Update snapshot with total weight
      await storage.updateScheduleSnapshot(snapshot.id, {
        totalWeight: totalWeight.toFixed(2),
      });

      res.status(201).json(snapshot);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // INVOICES
  // ============================================================================

  app.get("/api/invoices", async (_req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
  });

  app.get("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  });

  app.post("/api/invoices/generate", async (req, res) => {
    try {
      const { snapshotId } = req.body;
      
      const snapshot = await storage.getScheduleSnapshot(snapshotId);
      if (!snapshot) return res.status(404).json({ message: "Snapshot not found" });
      if (snapshot.status !== "locked") {
        return res.status(400).json({ message: "Snapshot must be locked before generating invoices" });
      }

      const contracts = await storage.getActiveContracts();
      const createdInvoices = [];

      for (const contract of contracts) {
        const advertiser = await storage.getAdvertiser(contract.advertiserId);
        if (!advertiser) continue;

        const amountExVat = parseFloat(contract.monthlyPriceExVat);
        const vatRate = parseFloat(contract.vatPercent) / 100;
        const vatAmount = amountExVat * vatRate;
        const amountIncVat = amountExVat + vatAmount;

        const invoice = await storage.createInvoice({
          advertiserId: contract.advertiserId,
          contractId: contract.id,
          snapshotId: snapshot.id,
          periodStart: `${snapshot.periodYear}-${String(snapshot.periodMonth).padStart(2, '0')}-01`,
          periodEnd: `${snapshot.periodYear}-${String(snapshot.periodMonth).padStart(2, '0')}-30`,
          amountExVat: amountExVat.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
          amountIncVat: amountIncVat.toFixed(2),
          status: "draft",
        });

        createdInvoices.push(invoice);
      }

      res.status(201).json(createdInvoices);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.updateInvoice(req.params.id, req.body);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  });

  // ============================================================================
  // PAYOUTS
  // ============================================================================

  app.get("/api/payouts", async (_req, res) => {
    const payouts = await storage.getPayouts();
    res.json(payouts);
  });

  app.get("/api/payouts/:id", async (req, res) => {
    const payout = await storage.getPayout(req.params.id);
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    res.json(payout);
  });

  app.post("/api/payouts/generate", async (req, res) => {
    try {
      const { snapshotId } = req.body;
      
      const snapshot = await storage.getScheduleSnapshot(snapshotId);
      if (!snapshot) return res.status(404).json({ message: "Snapshot not found" });
      if (snapshot.status !== "locked") {
        return res.status(400).json({ message: "Snapshot must be locked before generating payouts" });
      }

      const snapshotPlacements = await storage.getSnapshotPlacements(snapshot.id);
      const locations = await storage.getLocations();

      // Group revenue by location
      const locationRevenue: Record<string, number> = {};
      for (const sp of snapshotPlacements) {
        const share = parseFloat(sp.revenueShare || "0");
        locationRevenue[sp.locationId] = (locationRevenue[sp.locationId] || 0) + share;
      }

      const createdPayouts = [];

      for (const location of locations) {
        const grossRevenue = locationRevenue[location.id] || 0;
        if (grossRevenue === 0) continue;

        const sharePercent = parseFloat(location.revenueSharePercent);
        const payoutAmount = grossRevenue * (sharePercent / 100);
        const minimumPayout = parseFloat(location.minimumPayoutAmount);

        // Check for carry-over from previous period
        const pendingCarryOver = await storage.getPendingCarryOver(location.id);
        const carryOverAmount = pendingCarryOver ? parseFloat(pendingCarryOver.amount) : 0;
        const totalDue = payoutAmount + carryOverAmount;

        let status = "pending";
        let carryOverRecord = null;

        // If below minimum, create carry-over
        if (totalDue < minimumPayout) {
          status = "carried_over";
          carryOverRecord = await storage.createCarryOver({
            locationId: location.id,
            amount: totalDue.toFixed(2),
            periodYear: snapshot.periodYear,
            periodMonth: snapshot.periodMonth,
            status: "pending",
          });
        }

        // Mark previous carry-over as applied
        if (pendingCarryOver) {
          await storage.updateCarryOver(pendingCarryOver.id, { status: "applied" });
        }

        const payout = await storage.createPayout({
          locationId: location.id,
          snapshotId: snapshot.id,
          periodStart: `${snapshot.periodYear}-${String(snapshot.periodMonth).padStart(2, '0')}-01`,
          periodEnd: `${snapshot.periodYear}-${String(snapshot.periodMonth).padStart(2, '0')}-30`,
          grossRevenueExVat: grossRevenue.toFixed(2),
          sharePercent: sharePercent.toFixed(2),
          payoutAmountExVat: payoutAmount.toFixed(2),
          carryOverFromPrevious: carryOverAmount.toFixed(2),
          totalDue: totalDue.toFixed(2),
          status,
        });

        createdPayouts.push(payout);
      }

      res.status(201).json(createdPayouts);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/payouts/:id", async (req, res) => {
    const payout = await storage.updatePayout(req.params.id, req.body);
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    res.json(payout);
  });

  // ============================================================================
  // DASHBOARD / KPIs
  // ============================================================================

  app.get("/api/dashboard/kpis", async (_req, res) => {
    try {
      const [advertisers, locations, screens, contracts, invoices, payouts] = await Promise.all([
        storage.getAdvertisers(),
        storage.getLocations(),
        storage.getScreens(),
        storage.getContracts(),
        storage.getInvoices(),
        storage.getPayouts(),
      ]);

      const activeContracts = contracts.filter(c => c.status === "active");
      const mrr = activeContracts.reduce((sum, c) => sum + parseFloat(c.monthlyPriceExVat), 0);
      const unpaidInvoices = invoices.filter(i => i.status === "sent" || i.status === "overdue");
      const unpaidAmount = unpaidInvoices.reduce((sum, i) => sum + parseFloat(i.amountIncVat), 0);
      const pendingPayouts = payouts.filter(p => p.status === "pending" || p.status === "approved");
      const pendingPayoutAmount = pendingPayouts.reduce((sum, p) => sum + parseFloat(p.totalDue), 0);

      res.json({
        totalAdvertisers: advertisers.length,
        activeAdvertisers: advertisers.filter(a => a.status === "active").length,
        totalLocations: locations.length,
        activeLocations: locations.filter(l => l.status === "active").length,
        totalScreens: screens.length,
        onlineScreens: screens.filter(s => s.status === "online").length,
        activeContracts: activeContracts.length,
        mrr,
        unpaidInvoiceCount: unpaidInvoices.length,
        unpaidAmount,
        pendingPayoutCount: pendingPayouts.length,
        pendingPayoutAmount,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // INTEGRATIONS
  // ============================================================================

  app.get("/api/integrations/status", async (_req, res) => {
    const status = getIntegrationStatus();
    res.json(status);
  });

  // Yodeck config-status endpoint - checks all auth options
  app.get("/api/integrations/yodeck/config-status", async (_req, res) => {
    const hasAuthToken = Boolean(process.env.YODECK_AUTH_TOKEN?.trim());
    const hasV2Token = Boolean(process.env.YODECK_V2_TOKEN?.trim());
    const hasLabel = Boolean(process.env.YODECK_TOKEN_LABEL?.trim());
    const hasValue = Boolean(process.env.YODECK_TOKEN_VALUE?.trim());
    const hasSeparate = hasLabel && hasValue;
    const hasDbConfig = await getYodeckConfigStatus();

    res.json({
      ok: hasAuthToken || hasV2Token || hasSeparate || hasDbConfig.configured,
      baseUrl: process.env.YODECK_BASE_URL || "https://app.yodeck.com",
      hasAuthToken,
      hasV2Token,
      hasLabel,
      hasValue,
      hasDbConfig: hasDbConfig.configured,
      authFormatExample: "Authorization: Token <label:value>",
      envPriority: [
        "1. YODECK_AUTH_TOKEN (format: label:apikey)",
        "2. YODECK_V2_TOKEN (format: label:apikey)",
        "3. YODECK_TOKEN_LABEL + YODECK_TOKEN_VALUE",
        "4. Database integration config"
      ]
    });
  });
  
  console.log("[routes] Yodeck routes registered: GET /api/integrations/yodeck/config-status, POST /api/integrations/yodeck/test");
  console.log("[routes] Sync routes registered: POST /api/sync/yodeck/run");

  // Yodeck sync core function - reusable without req/res
  const runYodeckSyncCore = async (): Promise<{ ok: boolean; processed?: number; message?: string }> => {
    try {
      const config = await storage.getIntegrationConfig("yodeck");
      if (!config?.isEnabled) {
        return { ok: false, message: "Yodeck integratie is niet ingeschakeld" };
      }
      
      const encryptedCreds = await storage.getIntegrationEncryptedCredentials("yodeck");
      if (!encryptedCreds) {
        return { ok: false, message: "Geen Yodeck credentials geconfigureerd" };
      }
      
      const { decryptCredentials } = await import("./crypto");
      const creds = decryptCredentials(encryptedCreds);
      const apiKey = creds.api_key || creds.apiKey || creds.token;
      
      if (!apiKey) {
        return { ok: false, message: "Geen API key gevonden in credentials" };
      }
      
      const response = await fetch("https://app.yodeck.com/api/v2/screens", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Token ${apiKey}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[SYNC] yodeck API error ${response.status}: ${errorText.substring(0, 200)}`);
        await storage.updateIntegrationConfig("yodeck", { status: "error", lastTestError: `API error: ${response.status}` });
        return { ok: false, message: `Yodeck API error: ${response.status}` };
      }
      
      const data = await response.json();
      const processed = data.count || (data.results?.length || 0);
      
      // Update integration status
      await storage.updateIntegrationConfig("yodeck", {
        lastSyncAt: new Date(),
        lastSyncItemsProcessed: processed,
        status: "connected",
      });
      
      console.log(`[SYNC] completed processed=${processed}`);
      return { ok: true, processed };
    } catch (error: any) {
      console.error("[SYNC] yodeck error:", error.message);
      await storage.updateIntegrationConfig("yodeck", { status: "error", lastTestError: error.message });
      return { ok: false, message: error.message };
    }
  };

  // NOTE: Full Yodeck sync with DB upsert is registered later at POST /api/sync/yodeck/run
  // The runYodeckSyncCore function is kept for status checking only

  // Legacy POST handler (keeping for reference)
  app.post("/api/sync/yodeck/run-legacy", async (_req, res) => {
    console.log("[YODECK SYNC RUN] handler hit");
    try {
      // Get API key from integration record (decrypted)
      const config = await storage.getIntegrationConfig("yodeck");
      if (!config?.isEnabled) {
        return res.status(400).json({ ok: false, message: "Yodeck integratie is niet ingeschakeld" });
      }
      
      const encryptedCreds = await storage.getIntegrationEncryptedCredentials("yodeck");
      if (!encryptedCreds) {
        return res.status(400).json({ ok: false, message: "Geen Yodeck credentials geconfigureerd" });
      }
      
      const { decryptCredentials } = await import("./crypto");
      const creds = decryptCredentials(encryptedCreds);
      const apiKey = creds.api_key || creds.apiKey || creds.token;
      
      if (!apiKey) {
        return res.status(400).json({ ok: false, message: "Geen API key gevonden in credentials" });
      }
      
      // Call Yodeck API
      const response = await fetch("https://app.yodeck.com/api/v2/screens", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Authorization": `Token ${apiKey}`,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[YODECK SYNC RUN] API error ${response.status}: ${errorText.substring(0, 200)}`);
        return res.status(response.status).json({ ok: false, message: `Yodeck API error: ${response.status}` });
      }
      
      const data = await response.json();
      const processed = data.count || (data.results?.length || 0);
      
      console.log(`[YODECK SYNC RUN] success, processed=${processed}`);
      res.json({ ok: true, processed });
    } catch (error: any) {
      console.error("[YODECK SYNC RUN] error:", error.message);
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Yodeck test connection - uses ONLY process.env.YODECK_API_KEY
  app.post("/api/integrations/yodeck/test", async (_req, res) => {
    console.log("[YODECK TEST] handler hit");
    try {
      const result = await testYodeckConnection();
      console.log(`[YODECK TEST] result: ok=${result.ok}, count=${(result as any).count || 0}`);
      
      // If Yodeck returned non-JSON or non-2xx, return 502 Bad Gateway
      if (!result.ok) {
        const httpStatus = (result.contentType && !result.contentType.includes("application/json")) ? 502 : (result.statusCode || 400);
        return res.status(httpStatus).json({
          ok: false,
          success: false,
          message: result.message,
          status: result.statusCode,
          requestedUrl: result.requestedUrl,
          contentType: result.contentType,
          bodyPreview: result.bodyPreview,
        });
      }
      
      res.json({
        ok: true,
        success: true,
        message: result.message,
        count: (result as any).count,
        sampleFields: (result as any).sampleFields,
        status: result.statusCode,
        requestedUrl: result.requestedUrl,
      });
    } catch (error: any) {
      console.error("[YODECK TEST] error:", error.message);
      res.status(500).json({
        ok: false,
        success: false,
        message: `Server error: ${error.message}`,
        status: 500,
      });
    }
  });

  app.post("/api/integrations/moneybird/test", async (_req, res) => {
    const result = await testMoneybirdConnection();
    res.json(result);
  });

  // ============================================================================
  // MONEYBIRD INTEGRATION ROUTES
  // ============================================================================

  // Moneybird config status
  app.get("/api/integrations/moneybird/status", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const hasApiToken = Boolean(process.env.MONEYBIRD_API_TOKEN?.trim());
      const hasAdminId = Boolean(process.env.MONEYBIRD_ADMINISTRATION_ID?.trim());
      const config = await storage.getIntegrationConfig("moneybird");
      const stats = await storage.getMoneybirdStats();

      res.json({
        configured: hasApiToken && hasAdminId,
        connected: config?.status === "connected" || config?.status === "active",
        hasApiToken,
        hasAdministrationId: hasAdminId,
        administrationId: hasAdminId ? process.env.MONEYBIRD_ADMINISTRATION_ID : null,
        lastSyncAt: config?.lastSyncAt,
        lastSyncItemsProcessed: config?.lastSyncItemsProcessed,
        stats,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get Moneybird administrations (for selecting which one to use)
  app.get("/api/integrations/moneybird/administrations", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const { getMoneybirdClient } = await import("./services/moneybirdClient");
      const client = await getMoneybirdClient();
      
      if (!client) {
        return res.status(400).json({ message: "Moneybird API token niet geconfigureerd" });
      }

      const administrations = await client.getAdministrations();
      res.json(administrations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Select Moneybird administration
  app.post("/api/integrations/moneybird/select-administration", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { administrationId } = req.body;
      if (!administrationId) {
        return res.status(400).json({ message: "administrationId is vereist" });
      }

      // Store in integration config
      await storage.upsertIntegrationConfig("moneybird", {
        isEnabled: true,
        settings: { administrationId },
        status: "connected",
      });

      res.json({ success: true, message: "Administratie geselecteerd" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Sync Moneybird contacts and invoices
  app.post("/api/sync/moneybird/run", requirePermission("manage_integrations"), async (_req, res) => {
    const startTime = Date.now();
    console.log("[Moneybird Sync] Starting sync...");
    
    try {
      const { getMoneybirdClient } = await import("./services/moneybirdClient");
      const client = await getMoneybirdClient();
      
      if (!client) {
        return res.status(400).json({ 
          ok: false, 
          message: "Moneybird API token niet geconfigureerd. Stel MONEYBIRD_API_TOKEN in." 
        });
      }

      const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;
      if (!administrationId) {
        return res.status(400).json({ 
          ok: false, 
          message: "Geen administratie geselecteerd. Stel MONEYBIRD_ADMINISTRATION_ID in." 
        });
      }

      client.setAdministrationId(administrationId);

      // Sync contacts
      console.log("[Moneybird Sync] Fetching contacts from administration:", administrationId);
      const contacts = await client.getAllContacts();
      
      // Warn if no contacts found
      if (contacts.length === 0) {
        console.warn("[Moneybird Sync] WARNING: 0 contacten opgehaald!");
        console.warn("[Moneybird Sync] Mogelijke oorzaken:");
        console.warn("  - Lege administratie in Moneybird");
        console.warn("  - Verkeerde MONEYBIRD_ADMINISTRATION_ID:", administrationId);
        console.warn("  - API token heeft geen toegang tot deze administratie");
      } else {
        console.log(`[Moneybird Sync] Opgehaald: ${contacts.length} contacten`);
      }
      
      let contactsCreated = 0;
      let contactsUpdated = 0;

      for (const contact of contacts) {
        const existing = await storage.getMoneybirdContactByMoneybirdId(contact.id);
        await storage.upsertMoneybirdContact({
          moneybirdId: contact.id,
          companyName: contact.company_name || null,
          firstname: contact.firstname || null,
          lastname: contact.lastname || null,
          email: contact.email || null,
          phone: contact.phone || null,
          address1: contact.address1 || null,
          address2: contact.address2 || null,
          zipcode: contact.zipcode || null,
          city: contact.city || null,
          country: contact.country || null,
          chamberOfCommerce: contact.chamber_of_commerce || null,
          taxNumber: contact.tax_number || null,
          sepaActive: contact.sepa_active || false,
          sepaIban: contact.sepa_iban || null,
          sepaIbanAccountName: contact.sepa_iban_account_name || null,
          sepaMandateId: contact.sepa_mandate_id || null,
          sepaMandateDate: contact.sepa_mandate_date || null,
          customerId: contact.customer_id || null,
          lastSyncedAt: new Date(),
        });
        if (existing) {
          contactsUpdated++;
        } else {
          contactsCreated++;
        }
      }

      console.log(`[Moneybird Sync] Contacts: ${contactsCreated} created, ${contactsUpdated} updated`);

      // Sync invoices
      console.log("[Moneybird Sync] Fetching invoices...");
      const invoices = await client.getAllSalesInvoices();
      let invoicesCreated = 0;
      let invoicesUpdated = 0;
      let paymentsCreated = 0;

      for (const invoice of invoices) {
        const existing = await storage.getMoneybirdInvoiceByMoneybirdId(invoice.id);
        await storage.upsertMoneybirdInvoice({
          moneybirdId: invoice.id,
          moneybirdContactId: invoice.contact_id,
          invoiceId: invoice.invoice_id || null,
          reference: invoice.reference || null,
          invoiceDate: invoice.invoice_date || null,
          dueDate: invoice.due_date || null,
          state: invoice.state || null,
          totalPriceExclTax: invoice.total_price_excl_tax || null,
          totalPriceInclTax: invoice.total_price_incl_tax || null,
          totalUnpaid: invoice.total_unpaid || null,
          currency: invoice.currency || "EUR",
          paidAt: invoice.paid_at ? new Date(invoice.paid_at) : null,
          url: invoice.url || null,
          lastSyncedAt: new Date(),
        });
        if (existing) {
          invoicesUpdated++;
        } else {
          invoicesCreated++;
        }

        // Sync payments for this invoice
        if (invoice.payments && invoice.payments.length > 0) {
          for (const payment of invoice.payments) {
            await storage.upsertMoneybirdPayment({
              moneybirdId: payment.id,
              moneybirdInvoiceId: invoice.id,
              paymentDate: payment.payment_date || null,
              price: payment.price || null,
              priceCurrency: invoice.currency || "EUR",
              lastSyncedAt: new Date(),
            });
            paymentsCreated++;
          }
        }
      }

      console.log(`[Moneybird Sync] Invoices: ${invoicesCreated} created, ${invoicesUpdated} updated`);
      console.log(`[Moneybird Sync] Payments: ${paymentsCreated} synced`);

      const duration = Date.now() - startTime;

      // Update integration config
      await storage.upsertIntegrationConfig("moneybird", {
        isEnabled: true,
        lastSyncAt: new Date(),
        lastSyncItemsProcessed: contacts.length + invoices.length,
        status: "connected",
      });

      // Log the sync
      await storage.createIntegrationLog({
        service: "moneybird",
        action: "sync",
        status: "success",
        responseData: {
          contacts: { created: contactsCreated, updated: contactsUpdated },
          invoices: { created: invoicesCreated, updated: invoicesUpdated },
          payments: { synced: paymentsCreated },
        },
        durationMs: duration,
      });

      res.json({
        ok: true,
        message: `Sync voltooid in ${duration}ms`,
        contacts: { total: contacts.length, created: contactsCreated, updated: contactsUpdated },
        invoices: { total: invoices.length, created: invoicesCreated, updated: invoicesUpdated },
        payments: { synced: paymentsCreated },
        duration,
      });
    } catch (error: any) {
      console.error("[Moneybird Sync] Error:", error.message);
      
      await storage.createIntegrationLog({
        service: "moneybird",
        action: "sync",
        status: "error",
        errorMessage: error.message,
        durationMs: Date.now() - startTime,
      });

      res.status(500).json({ ok: false, message: error.message });
    }
  });

  // Get synced Moneybird contacts
  app.get("/api/moneybird/contacts", requirePermission("view_finance"), async (req, res) => {
    try {
      const query = (req.query.query as string)?.toLowerCase() || "";
      let contacts = await storage.getMoneybirdContacts();
      
      // Filter by search query if provided
      if (query) {
        contacts = contacts.filter(c => {
          const companyName = (c.companyName || "").toLowerCase();
          const fullName = `${c.firstname || ""} ${c.lastname || ""}`.toLowerCase();
          const email = (c.email || "").toLowerCase();
          const city = (c.city || "").toLowerCase();
          return companyName.includes(query) || 
                 fullName.includes(query) || 
                 email.includes(query) || 
                 city.includes(query);
        });
      }
      
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get synced Moneybird invoices
  app.get("/api/moneybird/invoices", requirePermission("view_finance"), async (_req, res) => {
    try {
      const invoices = await storage.getMoneybirdInvoices();
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get invoices for a specific contact
  app.get("/api/moneybird/contacts/:contactId/invoices", requirePermission("view_finance"), async (req, res) => {
    try {
      const { contactId } = req.params;
      const contact = await storage.getMoneybirdContact(contactId);
      if (!contact) {
        return res.status(404).json({ message: "Contact niet gevonden" });
      }
      const invoices = await storage.getMoneybirdInvoicesByContact(contact.moneybirdId);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Link Moneybird contact to advertiser
  app.post("/api/moneybird/contacts/:contactId/link", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { contactId } = req.params;
      const { advertiserId } = req.body;

      if (!advertiserId) {
        return res.status(400).json({ message: "advertiserId is vereist" });
      }

      const result = await storage.linkMoneybirdContactToAdvertiser(contactId, advertiserId);
      if (!result) {
        return res.status(404).json({ message: "Contact niet gevonden" });
      }

      res.json({ success: true, contact: result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get Moneybird stats
  app.get("/api/moneybird/stats", requirePermission("view_finance"), async (_req, res) => {
    try {
      const stats = await storage.getMoneybirdStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Link screen directly to Moneybird contact (alternative to location-based linking)
  app.post("/api/screens/:id/link-moneybird", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;
      const { moneybirdContactId } = req.body;

      if (!moneybirdContactId) {
        return res.status(400).json({ message: "moneybirdContactId is vereist" });
      }

      // Verify screen exists
      const screen = await storage.getScreen(id);
      if (!screen) {
        return res.status(404).json({ message: "Scherm niet gevonden" });
      }

      // Verify Moneybird contact exists (lookup by Moneybird external ID)
      const contact = await storage.getMoneybirdContactByMoneybirdId(moneybirdContactId);
      if (!contact) {
        return res.status(404).json({ message: "Moneybird contact niet gevonden" });
      }

      // Build contact snapshot for fast UI loading
      const contactSnapshot = {
        companyName: contact.companyName,
        firstname: contact.firstname,
        lastname: contact.lastname,
        email: contact.email,
        phone: contact.phone,
        address1: contact.address1,
        address2: contact.address2,
        zipcode: contact.zipcode,
        city: contact.city,
        country: contact.country,
        chamberOfCommerce: contact.chamberOfCommerce,
        taxNumber: contact.taxNumber,
        syncedAt: new Date().toISOString(),
      };

      // Calculate effective name: Moneybird > Yodeck > screenId
      const moneybirdDisplayName = contact.companyName || 
        `${contact.firstname || ''} ${contact.lastname || ''}`.trim() || null;
      const effectiveName = moneybirdDisplayName || screen.yodeckPlayerName || screen.name || screen.screenId;

      console.log(`[Moneybird Link] Linking screen ${id} (${screen.screenId}) to contact ${contact.moneybirdId}:`, {
        companyName: contact.companyName,
        effectiveName,
      });

      // Update screen with Moneybird contact ID, snapshot, and effective name
      const updated = await storage.updateScreen(id, {
        moneybirdContactId: contact.moneybirdId,
        moneybirdContactSnapshot: contactSnapshot,
        moneybirdSyncStatus: "linked",
        effectiveName,
      });

      // Also update the location if it exists and is a placeholder
      const location = await storage.getLocation(screen.locationId);
      if (location && location.isPlaceholder && !location.moneybirdContactId) {
        await storage.updateLocationFromMoneybirdContact(location.id, contact);
        console.log(`[Moneybird Link] Also linked location ${location.id} to contact ${contact.moneybirdId}`);
      }

      res.json({ 
        success: true, 
        message: "Scherm gekoppeld aan Moneybird contact",
        screen: updated,
        contact: {
          id: contact.id,
          moneybirdId: contact.moneybirdId,
          displayName: contact.companyName || `${contact.firstname || ''} ${contact.lastname || ''}`.trim(),
          city: contact.city,
          email: contact.email,
        },
      });
    } catch (error: any) {
      console.error("[Moneybird Link] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Unlink screen from Moneybird contact
  app.post("/api/screens/:id/unlink-moneybird", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;

      const screen = await storage.getScreen(id);
      if (!screen) {
        return res.status(404).json({ message: "Scherm niet gevonden" });
      }

      // Calculate effective name without Moneybird: Yodeck > name > screenId
      const effectiveName = screen.yodeckPlayerName || screen.name || screen.screenId;

      const updated = await storage.updateScreen(id, {
        moneybirdContactId: null,
        moneybirdContactSnapshot: null,
        moneybirdSyncStatus: "unlinked",
        effectiveName,
      });

      res.json({ 
        success: true, 
        message: "Scherm ontkoppeld van Moneybird contact",
        screen: updated,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Sync screen data from Moneybird (refresh contact info)
  app.post("/api/screens/:id/sync", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;

      const screen = await storage.getScreen(id);
      if (!screen) {
        return res.status(404).json({ message: "Scherm niet gevonden" });
      }

      if (!screen.moneybirdContactId) {
        return res.status(400).json({ message: "Scherm is niet gekoppeld aan Moneybird" });
      }

      // Fetch fresh contact data from Moneybird
      const contact = await storage.getMoneybirdContactByMoneybirdId(screen.moneybirdContactId);
      if (!contact) {
        // Contact no longer exists in Moneybird - mark as stale
        await storage.updateScreen(id, { moneybirdSyncStatus: "stale" });
        return res.status(404).json({ message: "Moneybird contact niet meer gevonden - mogelijk verwijderd" });
      }

      // Build fresh contact snapshot
      const contactSnapshot = {
        companyName: contact.companyName,
        firstname: contact.firstname,
        lastname: contact.lastname,
        email: contact.email,
        phone: contact.phone,
        address1: contact.address1,
        address2: contact.address2,
        zipcode: contact.zipcode,
        city: contact.city,
        country: contact.country,
        chamberOfCommerce: contact.chamberOfCommerce,
        taxNumber: contact.taxNumber,
        syncedAt: new Date().toISOString(),
      };

      // Recalculate effective name
      const moneybirdDisplayName = contact.companyName || 
        `${contact.firstname || ''} ${contact.lastname || ''}`.trim() || null;
      const effectiveName = moneybirdDisplayName || screen.yodeckPlayerName || screen.name || screen.screenId;

      const updated = await storage.updateScreen(id, {
        moneybirdContactSnapshot: contactSnapshot,
        moneybirdSyncStatus: "linked",
        effectiveName,
      });

      console.log(`[Moneybird Sync] Synced screen ${id} (${screen.screenId}) with contact ${contact.moneybirdId}`);

      res.json({ 
        success: true, 
        message: "Scherm gesynchroniseerd met Moneybird",
        screen: updated,
        contact: contactSnapshot,
      });
    } catch (error: any) {
      console.error("[Moneybird Sync] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Link location to Moneybird contact
  app.post("/api/locations/:id/link-moneybird", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;
      const { moneybirdContactId } = req.body;

      if (!moneybirdContactId) {
        return res.status(400).json({ message: "moneybirdContactId is vereist" });
      }

      // Verify location exists
      const location = await storage.getLocation(id);
      if (!location) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }

      // Verify Moneybird contact exists (lookup by Moneybird external ID)
      const contact = await storage.getMoneybirdContactByMoneybirdId(moneybirdContactId);
      if (!contact) {
        return res.status(404).json({ message: "Moneybird contact niet gevonden" });
      }

      // Use the dedicated function that properly syncs all Moneybird data
      console.log(`[Moneybird Link] Linking location ${id} to contact ${contact.moneybirdId}:`, {
        companyName: contact.companyName,
        firstname: contact.firstname,
        lastname: contact.lastname,
        address: contact.address1,
        city: contact.city,
        zipcode: contact.zipcode,
        email: contact.email,
        phone: contact.phone,
      });

      const updated = await storage.updateLocationFromMoneybirdContact(id, contact);

      res.json({ 
        success: true, 
        message: "Locatie gekoppeld aan Moneybird contact",
        location: updated,
        syncedFields: ['name', 'address', 'street', 'zipcode', 'city', 'contactName', 'email', 'phone', 'moneybirdContactId'],
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Unlink location from Moneybird contact
  app.post("/api/locations/:id/unlink-moneybird", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;

      const location = await storage.getLocation(id);
      if (!location) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }

      const updated = await storage.updateLocation(id, {
        moneybirdContactId: null,
      });

      res.json({ 
        success: true, 
        message: "Locatie ontkoppeld van Moneybird contact",
        location: updated 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Link advertiser to Moneybird contact
  app.post("/api/advertisers/:id/link-moneybird", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;
      const { moneybirdContactId } = req.body;

      if (!moneybirdContactId) {
        return res.status(400).json({ message: "moneybirdContactId is vereist" });
      }

      // Verify advertiser exists
      const advertiser = await storage.getAdvertiser(id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      // Verify Moneybird contact exists (lookup by Moneybird external ID)
      const contact = await storage.getMoneybirdContactByMoneybirdId(moneybirdContactId);
      if (!contact) {
        return res.status(404).json({ message: "Moneybird contact niet gevonden" });
      }

      // Update advertiser with Moneybird contact ID
      const updated = await storage.updateAdvertiser(id, {
        moneybirdContactId: contact.moneybirdId,
        // Optionally sync contact info from Moneybird
        email: contact.email || advertiser.email,
        phone: contact.phone || advertiser.phone,
      });

      res.json({ 
        success: true, 
        message: "Adverteerder gekoppeld aan Moneybird contact",
        advertiser: updated 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Unlink advertiser from Moneybird contact
  app.post("/api/advertisers/:id/unlink-moneybird", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { id } = req.params;

      const advertiser = await storage.getAdvertiser(id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      const updated = await storage.updateAdvertiser(id, {
        moneybirdContactId: null,
      });

      res.json({ 
        success: true, 
        message: "Adverteerder ontkoppeld van Moneybird contact",
        advertiser: updated 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Auto-match locations to Moneybird contacts
  app.post("/api/locations/auto-match-moneybird", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const locations = await storage.getLocations();
      const moneybirdContacts = await storage.getMoneybirdContacts();
      
      const unlinkedLocations = locations.filter(l => !l.moneybirdContactId);
      
      const matches: { locationId: string; locationName: string; contactId: string; contactName: string; matchType: string; score: number }[] = [];
      const suggestions: { locationId: string; locationName: string; contactId: string; contactName: string; matchType: string; score: number }[] = [];
      let autoLinked = 0;
      
      // Normalize function for matching
      const normalize = (str: string | null | undefined): string => {
        if (!str) return "";
        return str.toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      };
      
      // Calculate simple token similarity
      const tokenSimilarity = (a: string, b: string): number => {
        const tokensA = normalize(a).split(" ").filter(t => t.length > 2);
        const tokensB = normalize(b).split(" ").filter(t => t.length > 2);
        if (tokensA.length === 0 || tokensB.length === 0) return 0;
        
        let matches = 0;
        for (const tokenA of tokensA) {
          if (tokensB.some(tokenB => tokenB.includes(tokenA) || tokenA.includes(tokenB))) {
            matches++;
          }
        }
        return matches / Math.max(tokensA.length, tokensB.length);
      };
      
      for (const location of unlinkedLocations) {
        let bestMatch: { contact: typeof moneybirdContacts[0]; type: string; score: number } | null = null;
        
        for (const contact of moneybirdContacts) {
          const contactName = contact.companyName || 
            [contact.firstname, contact.lastname].filter(Boolean).join(" ") || 
            "";
          
          // Exact name match (normalized)
          if (normalize(location.name) === normalize(contactName) && contactName) {
            bestMatch = { contact, type: "exact_name", score: 1.0 };
            break;
          }
          
          // Email match
          if (location.email && contact.email && 
              normalize(location.email) === normalize(contact.email)) {
            if (!bestMatch || bestMatch.score < 0.95) {
              bestMatch = { contact, type: "exact_email", score: 0.95 };
            }
          }
          
          // City + name token match
          if (location.city && contact.city && 
              normalize(location.city) === normalize(contact.city)) {
            const similarity = tokenSimilarity(location.name, contactName);
            if (similarity > 0.6 && (!bestMatch || bestMatch.score < similarity * 0.9)) {
              bestMatch = { contact, type: "city_name_fuzzy", score: similarity * 0.9 };
            }
          }
          
          // Pure fuzzy name match
          const nameSimilarity = tokenSimilarity(location.name, contactName);
          if (nameSimilarity > 0.7 && (!bestMatch || bestMatch.score < nameSimilarity * 0.85)) {
            bestMatch = { contact, type: "fuzzy_name", score: nameSimilarity * 0.85 };
          }
        }
        
        if (bestMatch) {
          const matchInfo = {
            locationId: location.id,
            locationName: location.name,
            contactId: bestMatch.contact.id,
            contactName: bestMatch.contact.companyName || 
              [bestMatch.contact.firstname, bestMatch.contact.lastname].filter(Boolean).join(" ") || 
              "Onbekend",
            matchType: bestMatch.type,
            score: bestMatch.score
          };
          
          // Auto-link if score >= 0.92
          if (bestMatch.score >= 0.92) {
            await storage.updateLocation(location.id, {
              moneybirdContactId: bestMatch.contact.moneybirdId,
              address: bestMatch.contact.address1 || location.address,
              city: bestMatch.contact.city || location.city,
              zipcode: bestMatch.contact.zipcode || location.zipcode,
            });
            matches.push(matchInfo);
            autoLinked++;
          } else if (bestMatch.score >= 0.5) {
            // Suggest for manual review
            suggestions.push(matchInfo);
          }
        }
      }
      
      console.log(`[Auto-match] ${autoLinked} locaties automatisch gekoppeld, ${suggestions.length} suggesties`);
      
      res.json({
        success: true,
        autoLinked,
        matches,
        suggestions,
        totalUnlinked: unlinkedLocations.length,
        totalContacts: moneybirdContacts.length
      });
    } catch (error: any) {
      console.error("[Auto-match] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get ontbrekende gegevens overview (missing data)
  app.get("/api/ontbrekende-gegevens", requirePermission("view_screens"), async (_req, res) => {
    try {
      // Get screens without location linked to Moneybird
      const screens = await storage.getScreens();
      const activeScreens = screens.filter((s: any) => s.isActive !== false);
      const locations = await storage.getLocations();
      const moneybirdContacts = await storage.getMoneybirdContacts();
      
      const screensWithoutLocation = activeScreens.filter((s: any) => !s.locationId);
      const locationsWithoutMoneybird = locations.filter(l => !l.moneybirdContactId);
      
      // Screens where location has no Moneybird contact
      const screensWithUnlinkedLocation = activeScreens.filter((s: any) => {
        if (!s.locationId) return false;
        const loc = locations.find(l => l.id === s.locationId);
        return loc && !loc.moneybirdContactId;
      });

      res.json({
        screensWithoutLocation: screensWithoutLocation.length,
        locationsWithoutMoneybird: locationsWithoutMoneybird.length,
        screensWithUnlinkedLocation: screensWithUnlinkedLocation.length,
        totalMoneybirdContacts: moneybirdContacts.length,
        details: {
          screensWithoutLocation: screensWithoutLocation.map((s: any) => ({ 
            id: s.id, 
            screenId: s.screenId, 
            name: s.name 
          })),
          locationsWithoutMoneybird: locationsWithoutMoneybird.map(l => ({ 
            id: l.id, 
            name: l.name, 
            city: l.city 
          })),
          screensWithUnlinkedLocation: screensWithUnlinkedLocation.map((s: any) => {
            const loc = locations.find(l => l.id === s.locationId);
            return { 
              id: s.id, 
              screenId: s.screenId, 
              name: s.name,
              locationId: s.locationId,
              locationName: loc?.name 
            };
          }),
        }
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  console.log("[routes] Moneybird routes registered");

  // Yodeck sync - TWO-STEP: 1) sync screens, 2) fetch content details per screen
  app.post("/api/integrations/yodeck/sync", async (_req, res) => {
    try {
      // Step 1: Sync screens (status, UUID, name)
      console.log("[Yodeck Sync] Step 1: Syncing screens from Yodeck API...");
      const result = await syncYodeckScreens();
      
      if (!result.success) {
        if (result.statusCode === 502) {
          return res.status(502).json(result);
        }
        return res.status(400).json(result);
      }
      
      // Step 2: Fetch content details per screen (requires separate API calls per screen)
      console.log("[Yodeck Sync] Step 2: Fetching content details per screen...");
      const { syncAllScreensContent } = await import("./services/yodeckContent");
      const contentResult = await syncAllScreensContent();
      
      console.log(`[Yodeck Sync] Complete - Screens: ${result.count}, Content: ${contentResult.stats.withContent} with content, ${contentResult.stats.empty} empty, ${contentResult.stats.unknown} unknown`);
      
      // Update integration config
      await storage.upsertIntegrationConfig("yodeck", {
        lastSyncAt: new Date(),
        lastSyncItemsProcessed: result.count,
        status: "active",
      });
      
      res.json({
        success: true,
        count: result.count,
        mapped: result.mapped,
        unmapped: result.unmapped,
        updated: result.updated,
        content: contentResult.stats,
        message: `Sync voltooid: ${result.count} schermen, ${contentResult.stats.withContent} met content, ${contentResult.stats.empty} leeg, ${contentResult.stats.unknown} onbekend`,
      });
    } catch (error: any) {
      console.error("[Yodeck Sync] Error:", error.message);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Yodeck sync-screens - new endpoint per spec
  app.post("/api/integrations/yodeck/sync-screens", async (_req, res) => {
    const result = await syncYodeckScreens();
    if (!result.success) {
      const httpStatus = result.statusCode === 502 ? 502 : 400;
      return res.status(httpStatus).json(result);
    }
    if (result.screens) {
      // Update existing screens with Yodeck data
      const existingScreens = await storage.getScreens();
      let updated = 0;
      for (const yodeckScreen of result.screens) {
        const match = existingScreens.find(s => 
          s.yodeckPlayerId === String(yodeckScreen.yodeck_screen_id) ||
          (yodeckScreen.screen_id && s.screenId === yodeckScreen.screen_id)
        );
        if (match) {
          await storage.updateScreen(match.id, {
            status: yodeckScreen.online ? "online" : "offline",
            lastSeenAt: yodeckScreen.last_seen ? new Date(yodeckScreen.last_seen) : new Date(),
            yodeckPlayerId: String(yodeckScreen.yodeck_screen_id),
            yodeckPlayerName: yodeckScreen.yodeck_name,
          });
          updated++;
        }
      }
      await storage.upsertIntegrationConfig("yodeck", {
        lastSyncAt: new Date(),
        lastSyncItemsProcessed: result.screens.length,
        status: "active",
      });
      res.json({
        success: true,
        count: result.count,
        mapped: result.mapped,
        unmapped: result.unmapped,
        synced: updated,
        message: `${result.count} schermen gesynchroniseerd`,
      });
    }
  });

  // GET /api/yodeck/screens - returns cached/last-synced screen list
  app.get("/api/yodeck/screens", isAuthenticated, async (_req, res) => {
    try {
      // Get screens with Yodeck data
      const screens = await storage.getScreens();
      const yodeckScreens = screens
        .filter(s => s.yodeckPlayerId)
        .map(s => ({
          id: s.id,
          screenId: s.screenId,
          yodeckPlayerId: s.yodeckPlayerId,
          yodeckPlayerName: s.yodeckPlayerName,
          name: s.name,
          status: s.status,
          lastSeenAt: s.lastSeenAt,
          locationId: s.locationId,
        }));
      res.json(yodeckScreens);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // INTEGRATION LOGS
  // ============================================================================

  app.get("/api/integration-logs", async (_req, res) => {
    const logs = await storage.getRecentIntegrationLogs();
    res.json(logs);
  });

  // ============================================================================
  // JOBS
  // ============================================================================

  app.get("/api/jobs", async (_req, res) => {
    const jobs = await storage.getJobs();
    res.json(jobs);
  });

  app.get("/api/jobs/:id/runs", async (req, res) => {
    const runs = await storage.getRecentJobRuns(req.params.id);
    res.json(runs);
  });

  // Execute a job manually
  app.post("/api/jobs/:name/run", async (req, res) => {
    try {
      const { executeJob, jobRegistry } = await import("./jobs");
      const jobName = req.params.name;
      
      if (!jobRegistry[jobName]) {
        return res.status(404).json({ 
          message: `Onbekende job: ${jobName}`,
          availableJobs: Object.keys(jobRegistry),
        });
      }
      
      const result = await executeJob(jobName);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // List available jobs
  app.get("/api/jobs/available", async (_req, res) => {
    try {
      const { jobRegistry } = await import("./jobs");
      res.json({
        jobs: Object.keys(jobRegistry),
        descriptions: {
          "contract-signing-reminders": "Verstuurt herinneringen voor contracten die wachten op ondertekening",
          "contract-expiration-check": "Controleert contracten die binnenkort verlopen en stuurt waarschuwingen",
          "signing-token-cleanup": "Verwijdert verlopen ondertekenings-tokens (ouder dan 30 dagen)",
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // EMAIL
  // ============================================================================

  app.get("/api/email/status", async (_req, res) => {
    res.json({
      configured: isEmailConfigured(),
      message: isEmailConfigured() 
        ? "E-mail service is geconfigureerd" 
        : "Voeg SENDGRID_API_KEY toe aan uw environment variables om e-mails te versturen",
    });
  });

  app.post("/api/email/contract/:contractId", async (req, res) => {
    try {
      const contract = await storage.getContract(req.params.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden" });
      }

      const advertiser = await storage.getAdvertiser(contract.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      const placements = await storage.getPlacementsByContract(contract.id);
      const screens = await storage.getScreens();
      const screenNames = placements
        .map(p => screens.find(s => s.id === p.screenId)?.name)
        .filter(Boolean) as string[];

      const result = await sendContractEmail(advertiser.email, {
        advertiserName: advertiser.companyName,
        contactName: advertiser.contactName,
        contractName: contract.name,
        monthlyPrice: contract.monthlyPriceExVat,
        vatPercent: contract.vatPercent,
        startDate: contract.startDate,
        endDate: contract.endDate,
        billingCycle: contract.billingCycle,
        screens: screenNames,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/email/sepa/:advertiserId", async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      const contracts = await storage.getContracts();
      const activeContract = contracts.find(
        c => c.advertiserId === advertiser.id && c.status === "active"
      );

      const monthlyAmount = activeContract 
        ? (parseFloat(activeContract.monthlyPriceExVat) * 1.21).toFixed(2)
        : "0.00";
      const vatPercent = activeContract?.vatPercent || "21.00";

      const result = await sendSepaEmail(advertiser.email, {
        advertiserName: advertiser.companyName,
        contactName: advertiser.contactName,
        email: advertiser.email,
        monthlyAmount,
        vatPercent,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============================================================================
  // CONTRACT SIGNING
  // ============================================================================

  // Send contract for signing
  app.post("/api/contracts/:id/send", async (req, res) => {
    try {
      const contract = await storage.getContract(req.params.id);
      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden" });
      }

      if (contract.status !== "draft") {
        return res.status(400).json({ message: "Contract kan alleen verzonden worden vanuit conceptstatus" });
      }

      const advertiser = await storage.getAdvertiser(contract.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      // Generate signing token
      const { token, hash } = generateSigningToken();
      const expiresAt = calculateExpirationDate(14);

      // Get screens for contract
      const placements = await storage.getPlacementsByContract(contract.id);
      const screens = await storage.getScreens();
      const screenNames = placements
        .map(p => screens.find(s => s.id === p.screenId)?.name)
        .filter(Boolean) as string[];

      // Generate contract HTML
      const htmlContent = generateContractHtml({
        advertiserName: advertiser.companyName,
        contactName: advertiser.contactName,
        contractName: contract.name,
        monthlyPrice: contract.monthlyPriceExVat,
        vatPercent: contract.vatPercent,
        startDate: contract.startDate,
        endDate: contract.endDate,
        billingCycle: contract.billingCycle,
        screens: screenNames,
      });

      // Update contract with token and status
      await storage.updateContract(contract.id, {
        status: "sent",
        signatureTokenHash: hash,
        expiresAt,
        sentAt: new Date(),
        htmlContent,
      });

      // Log event
      await storage.createContractEvent({
        contractId: contract.id,
        eventType: "sent",
        actorType: "system",
        metadata: { recipientEmail: advertiser.email },
      });

      // Send email with signing link
      const signingUrl = `${req.protocol}://${req.get("host")}/sign/${token}`;
      const emailResult = await sendEmail({
        to: advertiser.email,
        subject: `Contract ter ondertekening: ${contract.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0;">Elevizion</h1>
              <p style="color: #f8a12f; margin: 5px 0 0 0;">See Your Business Grow</p>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd;">
              <h2 style="color: #1e3a5f;">Contract ter ondertekening</h2>
              <p>Beste ${advertiser.contactName},</p>
              <p>Er staat een contract klaar voor ondertekening. Klik op onderstaande knop om het contract te bekijken en digitaal te ondertekenen.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${signingUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Contract Bekijken & Ondertekenen
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">Dit contract verloopt op ${expiresAt.toLocaleDateString("nl-NL")}.</p>
              <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
            </div>
          </div>
        `,
      });

      res.json({ 
        success: true, 
        message: "Contract verzonden", 
        signingUrl,
        emailSent: emailResult.success 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get contract for signing (public endpoint)
  app.get("/api/sign/:token", async (req, res) => {
    try {
      const tokenHash = hashToken(req.params.token);
      const contract = await storage.getContractBySignatureToken(tokenHash);

      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden of link is verlopen" });
      }

      if (contract.status === "signed") {
        return res.status(400).json({ message: "Dit contract is al ondertekend", signed: true });
      }

      if (contract.status === "expired" || contract.status === "cancelled") {
        return res.status(400).json({ message: "Dit contract is niet meer geldig" });
      }

      if (contract.expiresAt && new Date() > new Date(contract.expiresAt)) {
        await storage.updateContract(contract.id, { status: "expired" });
        await storage.createContractEvent({
          contractId: contract.id,
          eventType: "expired",
          actorType: "system",
        });
        return res.status(400).json({ message: "Dit contract is verlopen" });
      }

      // Mark as viewed if first time
      if (!contract.viewedAt) {
        const { ip, userAgent } = formatClientInfo(req);
        await storage.updateContract(contract.id, { viewedAt: new Date() });
        await storage.createContractEvent({
          contractId: contract.id,
          eventType: "viewed",
          actorType: "signer",
          ipAddress: ip,
          userAgent: userAgent,
        });
      }

      const advertiser = await storage.getAdvertiser(contract.advertiserId);

      res.json({
        id: contract.id,
        name: contract.name,
        title: contract.title,
        htmlContent: contract.htmlContent,
        monthlyPriceExVat: contract.monthlyPriceExVat,
        vatPercent: contract.vatPercent,
        startDate: contract.startDate,
        endDate: contract.endDate,
        billingCycle: contract.billingCycle,
        advertiserName: advertiser?.companyName,
        contactName: advertiser?.contactName,
        contactEmail: advertiser?.email,
        expiresAt: contract.expiresAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Sign contract (public endpoint)
  app.post("/api/sign/:token", async (req, res) => {
    try {
      const tokenHash = hashToken(req.params.token);
      const contract = await storage.getContractBySignatureToken(tokenHash);

      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden of link is verlopen" });
      }

      if (contract.status === "signed") {
        return res.status(400).json({ message: "Dit contract is al ondertekend" });
      }

      if (contract.expiresAt && new Date() > new Date(contract.expiresAt)) {
        return res.status(400).json({ message: "Dit contract is verlopen" });
      }

      const { name, email, signatureData, agreedToTerms } = req.body;

      if (!name || !email || !agreedToTerms) {
        return res.status(400).json({ message: "Naam, e-mail en akkoord zijn verplicht" });
      }

      if (!signatureData) {
        return res.status(400).json({ message: "Een digitale handtekening is verplicht" });
      }

      const { ip, userAgent } = formatClientInfo(req);

      // Update contract with signature
      await storage.updateContract(contract.id, {
        status: "signed",
        signedAt: new Date(),
        signedByName: name,
        signedByEmail: email,
        signedIp: ip,
        signedUserAgent: userAgent,
        signatureData: signatureData || null,
      });

      // Log signing event with full audit trail
      await storage.createContractEvent({
        contractId: contract.id,
        eventType: "signed",
        actorType: "signer",
        actorId: email,
        actorName: name,
        ipAddress: ip,
        userAgent: userAgent,
        metadata: { 
          agreedToTerms: true,
          hasSignature: !!signatureData,
          signedAt: new Date().toISOString(),
        },
      });

      // Activate advertiser if needed
      const advertiser = await storage.getAdvertiser(contract.advertiserId);
      if (advertiser && advertiser.status !== "active") {
        await storage.updateAdvertiser(advertiser.id, { status: "active" });
      }

      // Create onboarding checklist
      const existingChecklist = await storage.getOnboardingChecklist(contract.advertiserId);
      if (!existingChecklist) {
        const checklist = await storage.createOnboardingChecklist({
          advertiserId: contract.advertiserId,
          status: "in_progress",
        });

        // Create onboarding tasks
        const taskTypes = [
          "creative_received",
          "creative_approved",
          "campaign_created",
          "scheduled_on_screens",
          "billing_configured",
          "first_invoice_sent",
          "go_live_confirmed",
          "first_report_sent",
        ];

        for (const taskType of taskTypes) {
          await storage.createOnboardingTask({
            checklistId: checklist.id,
            taskType,
            status: "todo",
          });
        }
      }

      // Send confirmation email
      await sendEmail({
        to: email,
        subject: `Contract ondertekend: ${contract.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0;">Elevizion</h1>
              <p style="color: #f8a12f; margin: 5px 0 0 0;">See Your Business Grow</p>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd;">
              <h2 style="color: #1e3a5f;">Contract Ondertekend</h2>
              <p>Beste ${name},</p>
              <p>Bedankt voor het ondertekenen van uw contract. Hieronder vindt u de bevestiging:</p>
              <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #f8a12f; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Contract:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${contract.name}</td></tr>
                  <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Ondertekend door:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${name}</td></tr>
                  <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Datum:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${new Date().toLocaleDateString("nl-NL")}</td></tr>
                  <tr><td style="padding: 8px 0;"><strong>IP-adres:</strong></td><td style="padding: 8px 0;">${ip}</td></tr>
                </table>
              </div>
              <p>Wij nemen binnenkort contact met u op om de volgende stappen te bespreken.</p>
              <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
            </div>
          </div>
        `,
      });

      res.json({ 
        success: true, 
        message: "Contract succesvol ondertekend",
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get contract events (timeline)
  app.get("/api/contracts/:id/events", async (req, res) => {
    try {
      const events = await storage.getContractEvents(req.params.id);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel contract
  app.post("/api/contracts/:id/cancel", async (req, res) => {
    try {
      const contract = await storage.getContract(req.params.id);
      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden" });
      }

      if (contract.status === "signed" || contract.status === "active") {
        return res.status(400).json({ message: "Ondertekende of actieve contracten kunnen niet geannuleerd worden" });
      }

      await storage.updateContract(contract.id, { status: "cancelled" });
      await storage.createContractEvent({
        contractId: contract.id,
        eventType: "cancelled",
        actorType: "user",
        metadata: { reason: req.body.reason },
      });

      res.json({ success: true, message: "Contract geannuleerd" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Resend contract
  app.post("/api/contracts/:id/resend", async (req, res) => {
    try {
      const contract = await storage.getContract(req.params.id);
      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden" });
      }

      if (contract.status !== "sent") {
        return res.status(400).json({ message: "Alleen verzonden contracten kunnen opnieuw verstuurd worden" });
      }

      const advertiser = await storage.getAdvertiser(contract.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      // Generate new token
      const { token, hash } = generateSigningToken();
      const expiresAt = calculateExpirationDate(14);

      await storage.updateContract(contract.id, {
        signatureTokenHash: hash,
        expiresAt,
        sentAt: new Date(),
      });

      await storage.createContractEvent({
        contractId: contract.id,
        eventType: "sent",
        actorType: "system",
        metadata: { recipientEmail: advertiser.email, isResend: true },
      });

      // Send email
      const signingUrl = `${req.protocol}://${req.get("host")}/sign/${token}`;
      await sendEmail({
        to: advertiser.email,
        subject: `Herinnering: Contract ter ondertekening - ${contract.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0;">Elevizion</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd;">
              <h2 style="color: #1e3a5f;">Herinnering: Contract ter ondertekening</h2>
              <p>Beste ${advertiser.contactName},</p>
              <p>Dit is een herinnering dat er een contract klaar staat voor ondertekening.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${signingUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Contract Bekijken & Ondertekenen
                </a>
              </div>
              <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
            </div>
          </div>
        `,
      });

      res.json({ success: true, message: "Contract opnieuw verzonden", signingUrl });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============================================================================
  // ONBOARDING
  // ============================================================================

  app.get("/api/advertisers/:advertiserId/onboarding", async (req, res) => {
    try {
      const checklist = await storage.getOnboardingChecklist(req.params.advertiserId);
      if (!checklist) {
        return res.json(null);
      }
      const tasks = await storage.getOnboardingTasks(checklist.id);
      res.json({ ...checklist, tasks });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/advertisers/:advertiserId/onboarding", async (req, res) => {
    try {
      const advertiserId = req.params.advertiserId;
      
      const existingChecklist = await storage.getOnboardingChecklist(advertiserId);
      if (existingChecklist) {
        return res.status(400).json({ message: "Onboarding checklist bestaat al" });
      }

      const checklist = await storage.createOnboardingChecklist({
        advertiserId,
        status: "in_progress",
      });

      const defaultTasks = [
        { taskType: "creative_received", status: "todo" as const },
        { taskType: "creative_approved", status: "todo" as const },
        { taskType: "campaign_created", status: "todo" as const },
        { taskType: "scheduled_on_screens", status: "todo" as const },
        { taskType: "billing_configured", status: "todo" as const },
        { taskType: "first_invoice_sent", status: "todo" as const },
        { taskType: "go_live_confirmed", status: "todo" as const },
        { taskType: "first_report_sent", status: "todo" as const },
      ];

      const createdTasks = [];
      for (const task of defaultTasks) {
        const createdTask = await storage.createOnboardingTask({
          checklistId: checklist.id,
          ...task,
        });
        createdTasks.push(createdTask);
      }

      res.status(201).json({ ...checklist, tasks: createdTasks });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/onboarding-tasks/:id", async (req, res) => {
    try {
      const task = await storage.updateOnboardingTask(req.params.id, {
        ...req.body,
        completedAt: req.body.status === "done" ? new Date() : null,
      });
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // INCIDENTS & MONITORING
  // ============================================================================

  app.get("/api/incidents", async (_req, res) => {
    try {
      const incidents = await storage.getIncidents();
      res.json(incidents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/incidents", async (req, res) => {
    try {
      const incident = await storage.createIncident(req.body);
      res.status(201).json(incident);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/incidents/:id", async (req, res) => {
    try {
      const incident = await storage.updateIncident(req.params.id, req.body);
      res.json(incident);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/alert-rules", async (_req, res) => {
    try {
      const rules = await storage.getAlertRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // REPORTS
  // ============================================================================

  app.get("/api/reports", async (_req, res) => {
    try {
      const reports = await storage.getReports();
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/advertisers/:advertiserId/reports", async (req, res) => {
    try {
      const reports = await storage.getReportsByAdvertiser(req.params.advertiserId);
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/reports", async (req, res) => {
    try {
      const report = await storage.createReport(req.body);
      res.status(201).json(report);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/reports/:id/send", async (req, res) => {
    try {
      const reports = await storage.getReports();
      const report = reports.find(r => r.id === req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Rapport niet gevonden" });
      }
      
      const advertisers = await storage.getAdvertisers();
      const advertiser = advertisers.find(a => a.id === report.advertiserId);
      if (!advertiser?.email) {
        return res.status(400).json({ message: "Adverteerder heeft geen e-mailadres" });
      }

      const { sendEmail } = await import("./email");
      const emailResult = await sendEmail({
        to: advertiser.email,
        subject: `Proof-of-Play Rapport - ${report.periodStart} t/m ${report.periodEnd}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Proof-of-Play Rapport</h2>
            <p>Beste ${advertiser.contactName || advertiser.companyName},</p>
            <p>Hierbij ontvangt u uw proof-of-play rapport voor de periode ${report.periodStart} t/m ${report.periodEnd}.</p>
            <p>Dit rapport toont een overzicht van alle vertoningen van uw advertenties op ons netwerk.</p>
            <p>Met vriendelijke groet,<br>Elevizion</p>
          </div>
        `,
      });

      if (emailResult.success) {
        await storage.updateReport(report.id, { sentAt: new Date() });
        res.json({ message: "Rapport verzonden" });
      } else {
        res.status(500).json({ message: emailResult.message });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // EXPORT/IMPORT - Bulk Data Operations
  // ============================================================================

  const entityExporters: Record<string, () => Promise<any[]>> = {
    advertisers: () => storage.getAdvertisers(),
    locations: () => storage.getLocations(),
    screens: () => storage.getScreens(),
    contracts: () => storage.getContracts(),
    placements: () => storage.getPlacements(),
    invoices: () => storage.getInvoices(),
  };

  function convertToCSV(data: any[]): string {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map(item => 
      headers.map(h => {
        const val = item[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val).replace(/"/g, '""');
        return String(val).replace(/"/g, '""');
      }).map(v => `"${v}"`).join(",")
    );
    return [headers.join(","), ...rows].join("\n");
  }

  app.get("/api/export/:entity", async (req, res) => {
    try {
      const { entity } = req.params;
      const format = (req.query.format as string) || "json";
      
      const exporter = entityExporters[entity];
      if (!exporter) {
        return res.status(400).json({ message: `Onbekende entiteit: ${entity}` });
      }
      
      const data = await exporter();
      
      if (format === "csv") {
        const csv = convertToCSV(data);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${entity}_export.csv"`);
        res.send(csv);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${entity}_export.json"`);
        res.json(data);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  app.get("/api/webhooks", async (_req, res) => {
    try {
      const webhooks = await storage.getWebhooks();
      res.json(webhooks);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/webhooks", async (req, res) => {
    try {
      const webhook = await storage.createWebhook(req.body);
      res.status(201).json(webhook);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/webhooks/:id", async (req, res) => {
    try {
      const webhook = await storage.updateWebhook(req.params.id, req.body);
      if (!webhook) return res.status(404).json({ message: "Webhook niet gevonden" });
      res.json(webhook);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/webhooks/:id", async (req, res) => {
    try {
      await storage.deleteWebhook(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/webhooks/:id/deliveries", async (req, res) => {
    try {
      const deliveries = await storage.getWebhookDeliveries(req.params.id);
      res.json(deliveries);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/webhooks/:id/test", async (req, res) => {
    try {
      const webhook = await storage.getWebhook(req.params.id);
      if (!webhook) return res.status(404).json({ message: "Webhook niet gevonden" });
      
      const testPayload = {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        data: { message: "Test webhook delivery from Elevizion OS" }
      };
      
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Webhook-Secret": webhook.secret || "",
        },
        body: JSON.stringify(testPayload),
      });
      
      const delivery = await storage.createWebhookDelivery({
        webhookId: webhook.id,
        eventType: "test.ping",
        payload: testPayload,
        responseStatus: response.status,
        responseBody: await response.text().catch(() => ""),
        deliveredAt: new Date(),
        status: response.ok ? "success" : "failed",
      });
      
      res.json({ success: response.ok, delivery });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // CREATIVES
  // ============================================================================

  app.get("/api/creatives", async (_req, res) => {
    try {
      const creatives = await storage.getCreatives();
      res.json(creatives);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/creatives/:id", async (req, res) => {
    try {
      const creative = await storage.getCreative(req.params.id);
      if (!creative) return res.status(404).json({ message: "Creative niet gevonden" });
      res.json(creative);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/creatives", async (req, res) => {
    try {
      const creative = await storage.createCreative(req.body);
      res.status(201).json(creative);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/creatives/:id", async (req, res) => {
    try {
      const creative = await storage.updateCreative(req.params.id, req.body);
      if (!creative) return res.status(404).json({ message: "Creative niet gevonden" });
      res.json(creative);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/creatives/:id", async (req, res) => {
    try {
      await storage.deleteCreative(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/creatives/:id/versions", async (req, res) => {
    try {
      const versions = await storage.getCreativeVersions(req.params.id);
      res.json(versions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/creatives/:id/versions", async (req, res) => {
    try {
      const version = await storage.createCreativeVersion({
        ...req.body,
        creativeId: req.params.id,
      });
      res.status(201).json(version);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/creatives/:id/submit", async (req, res) => {
    try {
      const creative = await storage.updateCreative(req.params.id, { status: "submitted" });
      if (!creative) return res.status(404).json({ message: "Creative niet gevonden" });
      res.json(creative);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/creatives/:id/approve", async (req, res) => {
    try {
      const creative = await storage.updateCreative(req.params.id, { status: "approved" });
      if (!creative) return res.status(404).json({ message: "Creative niet gevonden" });
      
      await storage.createCreativeApproval({
        creativeId: req.params.id,
        approvedAt: new Date(),
        approvedByUserId: req.body.reviewedBy || null,
        notes: req.body.notes,
      });
      
      res.json(creative);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/creatives/:id/reject", async (req, res) => {
    try {
      const creative = await storage.updateCreative(req.params.id, { status: "rejected" });
      if (!creative) return res.status(404).json({ message: "Creative niet gevonden" });
      
      await storage.createCreativeApproval({
        creativeId: req.params.id,
        rejectedAt: new Date(),
        approvedByUserId: req.body.reviewedBy || null,
        notes: req.body.notes,
      });
      
      res.json(creative);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/creatives/:id/compute-hash", async (req, res) => {
    try {
      const creative = await storage.getCreative(req.params.id);
      if (!creative) return res.status(404).json({ message: "Creative niet gevonden" });
      
      const versions = await storage.getCreativeVersions(req.params.id);
      if (versions.length === 0) return res.status(400).json({ message: "Creative heeft geen versies met bestanden" });
      
      const latestVersion = versions[0];
      if (!latestVersion.fileUrl) return res.status(400).json({ message: "Nieuwste versie heeft geen file URL" });
      
      const { computePHashFromUrl } = await import("./utils/phash");
      const hashResult = await computePHashFromUrl(latestVersion.fileUrl);
      
      if (!hashResult) return res.status(500).json({ message: "Hash berekening mislukt" });
      
      const updated = await storage.updateCreative(req.params.id, {
        phash: hashResult.hash,
        phashUpdatedAt: new Date(),
      } as any);
      
      res.json({ 
        success: true, 
        hash: hashResult.hash,
        isEmptyOrBlank: hashResult.isEmptyOrBlank,
        creative: updated 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/creatives/:id/approvals", async (req, res) => {
    try {
      const approvals = await storage.getCreativeApprovals(req.params.id);
      res.json(approvals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // BACKUP & EXPORT
  // ============================================================================

  app.get("/api/backup/full", async (_req, res) => {
    try {
      const backup = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        data: {
          advertisers: await storage.getAdvertisers(),
          locations: await storage.getLocations(),
          screens: await storage.getScreens(),
          packagePlans: await storage.getPackagePlans(),
          contracts: await storage.getContracts(),
          placements: await storage.getPlacements(),
          invoices: await storage.getInvoices(),
          payouts: await storage.getPayouts(),
          snapshots: await storage.getScheduleSnapshots(),
          users: await storage.getUsers(),
        },
      };
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="elevizion-backup-${new Date().toISOString().split("T")[0]}.json"`);
      res.json(backup);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/backup/:table", async (req, res) => {
    try {
      const { table } = req.params;
      let data: any[] = [];
      
      switch (table) {
        case "advertisers": data = await storage.getAdvertisers(); break;
        case "locations": data = await storage.getLocations(); break;
        case "screens": data = await storage.getScreens(); break;
        case "contracts": data = await storage.getContracts(); break;
        case "placements": data = await storage.getPlacements(); break;
        case "invoices": data = await storage.getInvoices(); break;
        case "payouts": data = await storage.getPayouts(); break;
        case "snapshots": data = await storage.getScheduleSnapshots(); break;
        case "users": data = await storage.getUsers(); break;
        default:
          return res.status(400).json({ message: "Onbekende tabel" });
      }
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="elevizion-${table}-${new Date().toISOString().split("T")[0]}.json"`);
      res.json({ table, exportedAt: new Date().toISOString(), count: data.length, data });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/backup/:table/csv", async (req, res) => {
    try {
      const { table } = req.params;
      let data: any[] = [];
      
      const defaultHeaders: Record<string, string[]> = {
        advertisers: ["id", "name", "email", "phone", "contactPerson", "status", "vatNumber", "address"],
        locations: ["id", "name", "address", "ownerName", "ownerEmail", "ownerPhone", "ownerIban", "revenueShare", "minimumPayout", "status"],
        screens: ["id", "locationId", "name", "status", "yodeckPlayerId", "notes"],
        contracts: ["id", "advertiserId", "packagePlanId", "startDate", "endDate", "monthlyPrice", "status"],
        placements: ["id", "contractId", "screenId", "secondsPerLoop", "playsPerHour", "isActive"],
        invoices: ["id", "advertiserId", "invoiceNumber", "amount", "dueDate", "status", "sentAt", "paidAt"],
        payouts: ["id", "locationId", "amount", "status", "periodMonth", "periodYear", "paidAt"],
        snapshots: ["id", "periodYear", "periodMonth", "lockedAt", "status", "totalRevenue"],
        users: ["id", "email", "firstName", "lastName", "role", "isActive"],
      };
      
      switch (table) {
        case "advertisers": data = await storage.getAdvertisers(); break;
        case "locations": data = await storage.getLocations(); break;
        case "screens": data = await storage.getScreens(); break;
        case "contracts": data = await storage.getContracts(); break;
        case "placements": data = await storage.getPlacements(); break;
        case "invoices": data = await storage.getInvoices(); break;
        case "payouts": data = await storage.getPayouts(); break;
        case "snapshots": data = await storage.getScheduleSnapshots(); break;
        case "users": data = await storage.getUsers(); break;
        default:
          return res.status(400).json({ message: "CSV export niet beschikbaar voor deze tabel" });
      }
      
      const headers = data.length > 0 ? Object.keys(data[0]) : (defaultHeaders[table] || []);
      const csvRows = [
        headers.join(";"),
        ...data.map(row => headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return JSON.stringify(val).replace(/"/g, '""');
          if (typeof val === "string" && (val.includes(";") || val.includes("\n") || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        }).join(";"))
      ];
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="elevizion-${table}-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send("\uFEFF" + csvRows.join("\n"));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SALES & ACQUISITIE (Leads, Surveys, Signatures)
  // ============================================================================

  // Cold Walk-in Onboarding Wizard
  app.post("/api/acquisitie/create", isAuthenticated, async (req, res) => {
    try {
      const { createColdWalkIn, acquisitieWizardSchema } = await import("./services/acquisitie");
      const validated = acquisitieWizardSchema.parse(req.body);
      const userId = (req.user as any)?.id;
      const result = await createColdWalkIn(validated, userId);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Acquisitie create error:", error);
      res.status(400).json({ success: false, errors: [error.message] });
    }
  });

  // Check for duplicates before creating
  app.get("/api/acquisitie/check-duplicates", isAuthenticated, async (req, res) => {
    try {
      const { checkDuplicates } = await import("./services/acquisitie");
      const { companyName, email, postcode } = req.query as { companyName?: string; email?: string; postcode?: string };
      
      if (!companyName) {
        return res.status(400).json({ message: "companyName is verplicht" });
      }
      
      const duplicates = await checkDuplicates(companyName, email, postcode);
      res.json(duplicates);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/leads", async (_req, res) => {
    const leads = await storage.getLeads();
    res.json(leads);
  });

  app.get("/api/leads/:id", async (req, res) => {
    const lead = await storage.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead niet gevonden" });
    res.json(lead);
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const data = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(data);
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.updateLead(req.params.id, req.body);
      if (!lead) return res.status(404).json({ message: "Lead niet gevonden" });
      res.json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/leads/:id", async (req, res) => {
    await storage.deleteLead(req.params.id);
    res.status(204).send();
  });

  // Lead activities
  app.get("/api/leads/:id/activities", async (req, res) => {
    const activities = await storage.getSalesActivities(req.params.id);
    res.json(activities);
  });

  app.post("/api/leads/:id/activities", async (req, res) => {
    try {
      const data = insertSalesActivitySchema.parse({ ...req.body, leadId: req.params.id });
      const activity = await storage.createSalesActivity(data);
      res.status(201).json(activity);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Location Surveys (Schouwdocumenten)
  app.get("/api/surveys", async (_req, res) => {
    const surveys = await storage.getLocationSurveys();
    res.json(surveys);
  });

  app.get("/api/surveys/:id", async (req, res) => {
    const survey = await storage.getLocationSurvey(req.params.id);
    if (!survey) return res.status(404).json({ message: "Schouw niet gevonden" });
    res.json(survey);
  });

  app.get("/api/leads/:id/surveys", async (req, res) => {
    const surveys = await storage.getLocationSurveysByLead(req.params.id);
    res.json(surveys);
  });

  app.post("/api/surveys", async (req, res) => {
    try {
      const data = insertLocationSurveySchema.parse(req.body);
      const survey = await storage.createLocationSurvey(data);
      res.status(201).json(survey);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/surveys/:id", async (req, res) => {
    try {
      const survey = await storage.updateLocationSurvey(req.params.id, req.body);
      if (!survey) return res.status(404).json({ message: "Schouw niet gevonden" });
      res.json(survey);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Digital Signatures
  app.get("/api/signatures/:documentType/:documentId", async (req, res) => {
    const signatures = await storage.getDigitalSignatures(req.params.documentType, req.params.documentId);
    res.json(signatures);
  });

  app.post("/api/signatures", async (req, res) => {
    try {
      const data = insertDigitalSignatureSchema.parse(req.body);
      const signature = await storage.createDigitalSignature(data);
      res.status(201).json(signature);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Convert lead to advertiser or location
  app.post("/api/leads/:id/convert", async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.id);
      if (!lead) return res.status(404).json({ message: "Lead niet gevonden" });
      
      if (lead.type === "advertiser") {
        const advertiser = await storage.createAdvertiser({
          name: lead.companyName,
          contactPerson: lead.contactName,
          email: lead.email || "",
          phone: lead.phone || "",
          address: lead.address || "",
          status: "active",
        });
        await storage.updateLead(req.params.id, {
          status: "gewonnen",
          convertedAt: new Date(),
          convertedToId: advertiser.id,
        });
        res.json({ type: "advertiser", entity: advertiser });
      } else {
        const location = await storage.createLocation({
          name: lead.companyName,
          ownerName: lead.contactName,
          ownerEmail: lead.email || "",
          ownerPhone: lead.phone || "",
          address: lead.address || "",
          status: "active",
        });
        await storage.updateLead(req.params.id, {
          status: "gewonnen",
          convertedAt: new Date(),
          convertedToId: location.id,
        });
        res.json({ type: "location", entity: location });
      }
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // TASKS
  // ============================================================================

  app.get("/api/tasks", async (req, res) => {
    const { assignee, role, status } = req.query;
    let tasks;
    if (assignee) {
      tasks = await storage.getTasksByAssignee(assignee as string);
    } else if (role) {
      tasks = await storage.getTasksByRole(role as string);
    } else if (status === "open") {
      tasks = await storage.getOpenTasks();
    } else {
      tasks = await storage.getTasks();
    }
    res.json(tasks);
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const task = await storage.getTask(req.params.id);
    if (!task) return res.status(404).json({ message: "Taak niet gevonden" });
    res.json(task);
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const data = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(data);
      res.status(201).json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.id, req.body);
      if (!task) return res.status(404).json({ message: "Taak niet gevonden" });
      res.json(task);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    await storage.deleteTask(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  app.get("/api/templates", async (req, res) => {
    const { category } = req.query;
    let templates;
    if (category && category !== "all") {
      templates = await storage.getTemplatesByCategory(category as string);
    } else {
      templates = await storage.getTemplates();
    }
    res.json(templates);
  });

  app.get("/api/templates/:id", async (req, res) => {
    const template = await storage.getTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: "Template niet gevonden" });
    res.json(template);
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const template = await storage.createTemplate(req.body);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.updateTemplate(req.params.id, req.body);
      if (!template) return res.status(404).json({ message: "Template niet gevonden" });
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    await storage.deleteTemplate(req.params.id);
    res.status(204).send();
  });

  app.get("/api/templates/:id/versions", async (req, res) => {
    const versions = await storage.getTemplateVersions(req.params.id);
    res.json(versions);
  });

  app.post("/api/templates/:id/restore/:version", async (req, res) => {
    try {
      const version = parseInt(req.params.version);
      const template = await storage.restoreTemplateVersion(req.params.id, version);
      if (!template) return res.status(404).json({ message: "Versie niet gevonden" });
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/templates/:id/preview", async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Template niet gevonden" });
      
      const { advertiserId, screenId } = req.body;
      let data: Record<string, string> = {};

      if (advertiserId) {
        const advertiser = await storage.getAdvertiser(advertiserId);
        if (advertiser) {
          data.advertiser_name = advertiser.companyName;
          data.contact_name = advertiser.contactName;
          data.phone = advertiser.phone || "";
          data.email = advertiser.email;
        }
      }

      if (screenId) {
        const screen = await storage.getScreen(screenId);
        if (screen) {
          data.screen_id = screen.screenId || "";
          data.screen_name = screen.name;
          const location = await storage.getLocation(screen.locationId);
          if (location) {
            data.location_name = location.name;
          }
        }
      }

      let renderedBody = template.body;
      let renderedSubject = template.subject || "";
      
      for (const [key, value] of Object.entries(data)) {
        const placeholder = `{{${key}}}`;
        renderedBody = renderedBody.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value);
        renderedSubject = renderedSubject.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value);
      }

      res.json({
        subject: renderedSubject,
        body: renderedBody,
        placeholdersUsed: template.placeholders,
        dataProvided: data,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/templates/:id/duplicate", async (req, res) => {
    try {
      const original = await storage.getTemplate(req.params.id);
      if (!original) return res.status(404).json({ message: "Template niet gevonden" });
      
      const duplicate = await storage.createTemplate({
        name: `${original.name} (kopie)`,
        category: original.category,
        subject: original.subject,
        body: original.body,
        language: original.language,
        isEnabled: false,
        eSignTemplateId: original.eSignTemplateId,
        eSignSigningOrder: original.eSignSigningOrder,
        eSignRequiredDocs: original.eSignRequiredDocs,
        moneybirdStyleId: original.moneybirdStyleId,
      });
      res.status(201).json(duplicate);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // SUPPLY ITEMS (CATALOG)
  // ============================================================================

  app.get("/api/supply-items", async (_req, res) => {
    const items = await storage.getSupplyItems();
    res.json(items);
  });

  app.post("/api/supply-items", async (req, res) => {
    try {
      const data = insertSupplyItemSchema.parse(req.body);
      const item = await storage.createSupplyItem(data);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/supply-items/:id", async (req, res) => {
    try {
      const item = await storage.updateSupplyItem(req.params.id, req.body);
      if (!item) return res.status(404).json({ message: "Artikel niet gevonden" });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // SURVEY SUPPLIES & PHOTOS
  // ============================================================================

  app.get("/api/surveys/:id/supplies", async (req, res) => {
    const supplies = await storage.getSurveySupplies(req.params.id);
    res.json(supplies);
  });

  app.post("/api/surveys/:id/supplies", async (req, res) => {
    try {
      const data = insertSurveySupplySchema.parse({ ...req.body, surveyId: req.params.id });
      const supply = await storage.createSurveySupply(data);
      res.status(201).json(supply);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/survey-supplies/:id", async (req, res) => {
    await storage.deleteSurveySupply(req.params.id);
    res.status(204).send();
  });

  app.get("/api/surveys/:id/photos", async (req, res) => {
    const photos = await storage.getSurveyPhotos(req.params.id);
    res.json(photos);
  });

  app.post("/api/surveys/:id/photos", async (req, res) => {
    try {
      const data = insertSurveyPhotoSchema.parse({ ...req.body, surveyId: req.params.id });
      const photo = await storage.createSurveyPhoto(data);
      res.status(201).json(photo);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/survey-photos/:id", async (req, res) => {
    await storage.deleteSurveyPhoto(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // OBJECT STORAGE (FILE UPLOADS)
  // ============================================================================

  app.post("/api/objects/upload", async (_req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // ============================================================================
  // SURVEY FINALIZATION (AUTO-GENERATE TASKS)
  // ============================================================================

  app.post("/api/surveys/:id/finalize", async (req, res) => {
    try {
      const survey = await storage.getLocationSurvey(req.params.id);
      if (!survey) return res.status(404).json({ message: "Schouw niet gevonden" });

      const lead = survey.leadId ? await storage.getLead(survey.leadId) : null;
      const locationName = lead?.companyName || "Onbekende locatie";

      const supplies = await storage.getSurveySupplies(req.params.id);
      const supplyList = supplies.map(s => `${s.quantity}x ${s.customName || 'Artikel'}`).join(", ");

      const createdTasks: any[] = [];

      const installTask = await storage.createTask({
        title: `Installatie: ${locationName}`,
        description: `Installeer ${survey.proposedScreenCount || 1} scherm(en) bij ${locationName}.\n\nLocaties: ${survey.proposedScreenLocations || 'Zie schouw'}\nNotities: ${survey.installationNotes || 'Geen'}`,
        taskType: "installatie",
        priority: "normaal",
        status: "open",
        surveyId: req.params.id,
        leadId: survey.leadId || undefined,
        assignedToRole: "ops",
      });
      createdTasks.push(installTask);

      if (supplies.length > 0) {
        const inkoopTask = await storage.createTask({
          title: `Inkoop: ${locationName}`,
          description: `Bestel materialen voor ${locationName}:\n\n${supplyList}\n\nGeschatte kosten: €${survey.estimatedInstallationCost || 0}`,
          taskType: "inkoop",
          priority: "hoog",
          status: "open",
          surveyId: req.params.id,
          leadId: survey.leadId || undefined,
          assignedToRole: "admin",
        });
        createdTasks.push(inkoopTask);
      }

      await storage.updateLocationSurvey(req.params.id, { status: "afgerond" });

      if (survey.leadId) {
        await storage.updateLead(survey.leadId, { status: "voorstel" });
      }

      res.json({ message: "Schouw afgerond, taken aangemaakt", tasks: createdTasks });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // YODECK SYNC ENDPOINTS
  // ============================================================================

  // POST /api/sync/yodeck/run - Full sync with distinctItemCount per screen
  app.post("/api/sync/yodeck/run", requirePermission("manage_integrations"), async (req, res) => {
    // Rate limit check
    const canSync = canStartYodeckSync();
    if (!canSync.ok) {
      return res.status(429).json({ ok: false, error: canSync.reason });
    }
    
    startYodeckSync();
    
    try {
      const onlyOnline = Boolean(req.body?.onlyOnline);
      
      const { getYodeckClient, ContentResolver } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        endYodeckSync();
        return res.status(400).json({ 
          ok: false, 
          error: "Missing YODECK_AUTH_TOKEN env var",
          hint: "Check env YODECK_AUTH_TOKEN. Must be: Token mylabel:XXXXXXXX (include 'Token ' prefix) OR label:value (without prefix)."
        });
      }

      // Get all Yodeck screens
      const allScreens = await client.getScreens();
      const screens = onlyOnline 
        ? allScreens.filter(s => s.state?.online === true) 
        : allScreens;
      
      const resolver = new ContentResolver(client);
      
      type ContentSummary = {
        screenYodeckId: number;
        screenUuid: string;
        screenName: string;
        online: boolean | null;
        screenshotUrl: string | null;
        sourceType: string | null;
        sourceId: number | null;
        sourceName: string | null;
        distinctItemCount: number;
        breakdown: {
          playlistsResolved: number;
          playlistsFailed: number;
          mediaItems: number;
          widgetItems: number;
          unknownItems: number;
        };
        status: "no_content_set" | "ok" | "unknown_source" | "error";
        error?: string | null;
      };

      const results: ContentSummary[] = [];
      
      for (const screen of screens) {
        const base: ContentSummary = {
          screenYodeckId: screen.id,
          screenUuid: screen.uuid || String(screen.id),
          screenName: screen.name,
          online: screen.state?.online ?? null,
          screenshotUrl: (screen as any).screenshot_url ?? null,
          sourceType: screen.screen_content?.source_type ?? null,
          sourceId: screen.screen_content?.source_id ?? null,
          sourceName: screen.screen_content?.source_name ?? null,
          distinctItemCount: 0,
          breakdown: {
            playlistsResolved: 0,
            playlistsFailed: 0,
            mediaItems: 0,
            widgetItems: 0,
            unknownItems: 0,
          },
          status: "no_content_set",
          error: null,
        };

        if (!screen.screen_content?.source_type || !screen.screen_content?.source_id) {
          results.push(base);
          continue;
        }

        try {
          const resolved = await resolver.resolveScreenContent(screen);
          
          // Count breakdown from resolved items
          let playlistsResolved = 0;
          let mediaItems = 0;
          let widgetItems = 0;
          let unknownItems = 0;
          
          for (const item of resolved.items) {
            if (item.type === "playlist") playlistsResolved++;
            else if (item.type === "media") mediaItems++;
            else if (item.type === "widget" || item.type === "app" || item.type === "webpage") widgetItems++;
            else unknownItems++;
          }
          
          // Media items from resolved media
          mediaItems = resolved.mediaItems.length;
          
          results.push({
            ...base,
            distinctItemCount: resolved.uniqueMediaCount,
            breakdown: {
              playlistsResolved,
              playlistsFailed: resolved.warnings.filter(w => w.includes("not found")).length,
              mediaItems,
              widgetItems,
              unknownItems,
            },
            status: resolved.status === "unknown" || resolved.status === "unknown_tagbased" 
              ? "unknown_source" 
              : resolved.status === "error" 
                ? "error" 
                : resolved.uniqueMediaCount > 0 || resolved.items.length > 0 
                  ? "ok" 
                  : "no_content_set",
            error: resolved.warnings.length > 0 ? resolved.warnings.join("; ") : null,
          });
        } catch (e: any) {
          results.push({
            ...base,
            status: "error",
            error: e?.message ?? String(e),
          });
        }
      }

      // Calculate stats
      const screensTotal = results.length;
      const screensOnline = results.filter(r => r.online === true).length;
      const screensWithYodeckContent = results.filter(r => r.status === "ok" && r.distinctItemCount > 0).length;
      const screensYodeckEmpty = results.filter(r => r.status === "no_content_set" || (r.status === "ok" && r.distinctItemCount === 0)).length;
      const contentUnknown = results.filter(r => r.status === "unknown_source").length;
      const contentError = results.filter(r => r.status === "error").length;

      endYodeckSync();
      return res.json({
        ok: true,
        stats: {
          screensTotal,
          screensOnline,
          screensWithYodeckContent,
          screensYodeckEmpty,
          contentUnknown,
          contentError,
        },
        results,
        meta: {
          baseUrl: "https://app.yodeck.com",
          note: "distinctItemCount = number of different ads/messages/items. playlist=items.length; layout=distinct items across regions + playlist items.",
        },
      });
    } catch (error: any) {
      endYodeckSync();
      res.status(500).json({ 
        ok: false, 
        error: error?.message ?? String(error),
        hint: "Check env YODECK_AUTH_TOKEN. Must be: Token mylabel:XXXXXXXX (include 'Token ' prefix)."
      });
    }
  });

  // GET /api/sync/yodeck/run-v2 - Compact content summary per screen
  app.get("/api/sync/yodeck/run-v2", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const { getYodeckClient, ContentResolver } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        return res.status(400).json({ 
          ok: false, 
          error: "Missing YODECK_V2_TOKEN env var. Expected format: mylabel:XXXXXXXXXXX"
        });
      }

      const screens = await client.getScreens();
      const resolver = new ContentResolver(client);
      
      const results: Array<{
        yodeckScreenId: number;
        name: string;
        online: boolean;
        lastSeen: string | null;
        sourceType: string;
        sourceId: number | null;
        contentCount: number;
      }> = [];

      for (const screen of screens) {
        try {
          const resolved = await resolver.resolveScreenContent(screen);
          results.push({
            yodeckScreenId: screen.id,
            name: screen.name,
            online: screen.state?.online ?? false,
            lastSeen: screen.state?.last_seen ?? null,
            sourceType: resolved.sourceType || "unknown",
            sourceId: resolved.sourceId ?? null,
            contentCount: resolved.uniqueMediaCount,
          });
        } catch (e: any) {
          results.push({
            yodeckScreenId: screen.id,
            name: screen.name,
            online: screen.state?.online ?? false,
            lastSeen: screen.state?.last_seen ?? null,
            sourceType: screen.screen_content?.source_type || "unknown",
            sourceId: screen.screen_content?.source_id ?? null,
            contentCount: 0,
          });
        }
      }

      return res.json({ ok: true, total: results.length, results });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // Yodeck content sync - fetches what's playing on each screen
  // Query params: force=true to bypass 10-minute cache
  app.post("/api/integrations/yodeck/content-sync", async (req, res) => {
    try {
      const force = req.query.force === "true" || req.body?.force === true;
      const { syncAllScreensContent } = await import("./services/yodeckContent");
      const result = await syncAllScreensContent(force);
      res.json(result);
    } catch (error: any) {
      console.error("[YodeckContent] Sync error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Yodeck media mappings endpoints
  app.get("/api/yodeck/media-mappings", requirePermission("view_screens"), async (_req, res) => {
    try {
      const mappings = await storage.getYodeckMediaLinks();
      res.json({ ok: true, mappings });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  const mediaMappingUpdateSchema = z.object({
    yodeckMediaId: z.number(),
    advertiserId: z.string().uuid().nullable().optional(),
    placementId: z.string().uuid().nullable().optional(),
  });

  app.post("/api/yodeck/media-mappings", requirePermission("edit_screens"), async (req, res) => {
    try {
      const parsed = mediaMappingUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: parsed.error.message });
      }
      const { yodeckMediaId, advertiserId, placementId } = parsed.data;
      
      const existingLink = await storage.getYodeckMediaLink(yodeckMediaId);
      if (!existingLink) {
        return res.status(404).json({ ok: false, error: "Media item not found in database" });
      }
      
      const updated = await storage.updateYodeckMediaLink(yodeckMediaId, {
        advertiserId: advertiserId ?? null,
        placementId: placementId ?? null,
        updatedAt: new Date(),
      });
      
      res.json({ ok: true, mapping: updated });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Debug endpoint to inspect raw Yodeck API responses for troubleshooting
  app.get("/api/integrations/yodeck/debug/screen/:yodeckScreenId", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { yodeckScreenId } = req.params;
      const { debugYodeckScreen } = await import("./services/yodeckContent");
      const result = await debugYodeckScreen(yodeckScreenId);
      res.json(result);
    } catch (error: any) {
      console.error("[YodeckDebug] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Discovery endpoint - probes multiple Yodeck endpoints to find content
  // GET /api/debug/yodeck/screen-content?playerId=591896
  // Returns: { tried:[{path,status,keys}], resolved:{count,playlists,topItems}, rawSample:..., playlistItems:... }
  app.get("/api/debug/yodeck/screen-content", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const playerId = req.query.playerId as string;
      if (!playerId) {
        return res.status(400).json({ error: "playerId query parameter required" });
      }
      
      const { discoverScreenContent } = await import("./services/yodeckContent");
      const result = await discoverScreenContent(playerId);
      res.json(result);
    } catch (error: any) {
      console.error("[YodeckDiscovery] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // User-friendly debug endpoint for screen content (dev only)
  // GET /api/integrations/yodeck/screen-content/:playerId
  // Returns: sanitized content info with status, count, items, and debug info
  app.get("/api/integrations/yodeck/screen-content/:playerId", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { playerId } = req.params;
      console.log(`[YodeckDebug] Fetching content for playerId=${playerId}`);
      
      const { discoverScreenContent, debugYodeckScreen } = await import("./services/yodeckContent");
      
      // Get discovery result with probes (with safe defaults for error cases)
      const discoveryResult = await discoverScreenContent(playerId);
      
      // Get raw debug info (with safe defaults)
      let debugResult: any = { screenDetail: null };
      try {
        debugResult = await debugYodeckScreen(playerId);
      } catch (debugError: any) {
        console.log(`[YodeckDebug] Debug fetch failed: ${debugError.message}`);
      }
      
      // Safe access with defaults for error/unknown cases
      const resolved = discoveryResult?.resolved || {
        status: "error",
        statusReason: "Discovery failed",
        count: 0,
        playlists: [],
        topItems: [],
      };
      const tried = discoveryResult?.tried || [];
      
      // Build sanitized response
      const response = {
        playerId,
        timestamp: new Date().toISOString(),
        status: resolved.status,
        statusReason: resolved.statusReason,
        contentCount: resolved.count,
        playlists: resolved.playlists || [],
        topItems: resolved.topItems || [],
        playlistItems: discoveryResult?.playlistItems || [],
        // Debug info (sanitized - no API keys)
        debug: {
          endpointsProbed: tried.map((t: any) => ({
            endpoint: t.endpoint,
            status: t.status,
            hasContent: t.hasContent,
            keys: t.keys,
          })),
          rawScreenContent: debugResult?.screenDetail?.screen_content || null,
          screenState: debugResult?.screenDetail?.state || null,
          screenName: debugResult?.screenDetail?.name || null,
        },
      };
      
      console.log(`[YodeckDebug] Result for ${playerId}: status=${response.status}, count=${response.contentCount}`);
      res.json(response);
    } catch (error: any) {
      console.error("[YodeckDebug] Error:", error);
      res.status(500).json({ error: error.message, playerId: req.params.playerId });
    }
  });

  // ============================================================================
  // YODECK CONTENT INVENTORY (Full content hierarchy resolution)
  // ============================================================================
  
  // GET /api/yodeck/inventory - Build complete content inventory
  // Resolves all screens → playlists/layouts/schedules → media items
  // Query params: workspaceId (optional)
  app.get("/api/yodeck/inventory", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const workspaceId = req.query.workspaceId ? parseInt(req.query.workspaceId as string) : undefined;
      
      console.log(`[YodeckInventory] Starting inventory request, workspaceId=${workspaceId || "all"}`);
      
      const { buildContentInventory } = await import("./services/yodeckInventory");
      const result = await buildContentInventory(workspaceId);
      
      console.log(`[YodeckInventory] Completed: ${result.totals.screens} screens, ${result.totals.uniqueMediaAcrossAllScreens} unique media`);
      res.json(result);
    } catch (error: any) {
      console.error("[YodeckInventory] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/yodeck/inventory/refresh - Force refresh (clears caches)
  app.post("/api/yodeck/inventory/refresh", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const workspaceId = req.body.workspaceId ? parseInt(req.body.workspaceId) : undefined;
      
      console.log(`[YodeckInventory] Refresh requested, workspaceId=${workspaceId || "all"}`);
      
      const { refreshInventory } = await import("./services/yodeckInventory");
      const result = await refreshInventory();
      
      console.log(`[YodeckInventory] Refresh completed: ${result.totals.screens} screens, ${result.totals.uniqueMediaAcrossAllScreens} unique media`);
      res.json(result);
    } catch (error: any) {
      console.error("[YodeckInventory] Refresh error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // YODECK DEDICATED ROUTES (Spec-compliant API)
  // ============================================================================

  // GET /api/yodeck/health - Test Yodeck API connection
  app.get("/api/yodeck/health", async (_req, res) => {
    try {
      const { getYodeckClient } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        return res.json({
          ok: true,
          yodeck: false,
          mode: "mock",
          message: "Yodeck API not configured - using mock mode",
        });
      }

      const screens = await client.getScreens();
      
      return res.json({
        ok: true,
        yodeck: true,
        mode: "live",
        screens_found: screens.length,
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        yodeck: false,
        error: error.message || "Failed to connect to Yodeck API",
      });
    }
  });

  // Mock data for when Yodeck API is not configured
  const MOCK_SCREENS = [
    {
      screen_id: 1,
      screen_name: "Demo Screen 1",
      workspace_id: 1,
      workspace_name: "Demo Workspace",
      source_type: "playlist",
      source_id: 100,
      source_name: "Demo Playlist",
      media_count: 5,
      unique_media_count: 4,
      media: [
        { media_id: 1001, name: "Welcome Video", type: "video", from: "playlist" },
        { media_id: 1002, name: "Promo Image 1", type: "image", from: "playlist" },
        { media_id: 1003, name: "Promo Image 2", type: "image", from: "playlist" },
        { media_id: 1004, name: "Background Music", type: "audio", from: "playlist" },
      ],
      playlists_resolved: [
        { playlist_id: 100, name: "Demo Playlist", media_count: 5, unique_media_count: 4 },
      ],
      warnings: [],
    },
    {
      screen_id: 2,
      screen_name: "Demo Screen 2",
      workspace_id: 1,
      workspace_name: "Demo Workspace",
      source_type: "layout",
      source_id: 200,
      source_name: "Demo Layout",
      media_count: 8,
      unique_media_count: 6,
      media: [
        { media_id: 2001, name: "Header Image", type: "image", from: "layout" },
        { media_id: 2002, name: "Main Video", type: "video", from: "layout" },
        { media_id: 2003, name: "Side Banner", type: "image", from: "layout" },
      ],
      playlists_resolved: [
        { playlist_id: 201, name: "Layout Playlist 1", media_count: 4, unique_media_count: 3 },
        { playlist_id: 202, name: "Layout Playlist 2", media_count: 4, unique_media_count: 3 },
      ],
      warnings: ["region item type ignored: widget"],
    },
  ];

  const MOCK_STATS = {
    total_screens: 2,
    total_media_in_use: 13,
    total_unique_media_in_use: 10,
    top_media: [
      { media_id: 1001, name: "Welcome Video", screen_count: 1 },
      { media_id: 2002, name: "Main Video", screen_count: 1 },
    ],
    top_playlists: [
      { source_type: "playlist", source_name: "Demo Playlist", screen_count: 1 },
      { source_type: "layout", source_name: "Demo Layout", screen_count: 1 },
    ],
    errors_count: 0,
    warnings_count: 1,
  };

  // GET /api/yodeck/screens/summary - Get all screens with media counts
  app.get("/api/yodeck/screens/summary", requirePermission("manage_integrations"), async (req, res) => {
    const refresh = req.query.refresh === "1";
    const workspaceId = req.query.workspace_id ? parseInt(req.query.workspace_id as string, 10) : undefined;

    try {
      const startTime = Date.now();
      const { getYodeckClient } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        return res.json({
          mode: "mock",
          screens: MOCK_SCREENS,
          total: MOCK_SCREENS.length,
          generated_at: new Date().toISOString(),
          timing_ms: Date.now() - startTime,
        });
      }

      const { buildContentInventory, refreshInventory } = await import("./services/yodeckInventory");
      
      let inventory;
      if (refresh) {
        inventory = await refreshInventory();
      } else {
        inventory = await buildContentInventory(workspaceId);
      }

      const screens = inventory.screens.map(s => ({
        screen_id: s.screenId,
        screen_name: s.name,
        workspace_id: s.workspaceId,
        workspace_name: s.workspaceName,
        source_type: s.screen_content?.source_type || null,
        source_id: s.screen_content?.source_id || null,
        source_name: s.screen_content?.source_name || undefined,
        media_count: s.counts.mediaItemsTotal,
        unique_media_count: s.counts.uniqueMediaIds,
        media: s.topMedia.map(m => ({
          media_id: m.id,
          name: m.name,
          type: m.type,
          from: s.screen_content?.source_type || "playlist",
        })),
        playlists_resolved: s.playlistsResolved || [],
        warnings: s.warnings.length > 0 
          ? s.warnings 
          : (s.screen_content?.source_type ? [] : ["no content assigned"]),
      }));

      return res.json({
        mode: "live",
        screens,
        total: screens.length,
        generated_at: inventory.generatedAt,
        timing_ms: Date.now() - startTime,
      });
    } catch (error: any) {
      console.error("[Yodeck] Error fetching screens summary:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch screens" });
    }
  });

  // GET /api/yodeck/screens/:id/details - Get detailed info for single screen
  app.get("/api/yodeck/screens/:id/details", requirePermission("manage_integrations"), async (req, res) => {
    const screenId = parseInt(req.params.id, 10);
    
    if (isNaN(screenId) || screenId <= 0) {
      return res.status(400).json({ error: "Invalid screen ID - must be a positive number" });
    }

    try {
      const startTime = Date.now();
      const { getYodeckClient } = await import("./services/yodeckClient");
      const { buildContentInventory } = await import("./services/yodeckInventory");
      
      const client = await getYodeckClient();
      if (!client) {
        const mockScreen = MOCK_SCREENS.find(s => s.screen_id === screenId);
        if (!mockScreen) {
          return res.status(404).json({ error: "Screen not found", mode: "mock" });
        }
        return res.json({
          mode: "mock",
          screen: {
            ...mockScreen,
            raw_screen_content: { source_type: mockScreen.source_type, source_id: mockScreen.source_id, source_name: mockScreen.source_name },
            timings_ms: { screen_fetch: 10, content_resolve: 20, total: 30 },
          },
        });
      }

      const screenFetchStart = Date.now();
      const screen = await client.getScreen(screenId);
      const screenFetchTime = Date.now() - screenFetchStart;

      if (!screen) {
        return res.status(404).json({ error: "Screen not found in Yodeck" });
      }

      const contentResolveStart = Date.now();
      const inventory = await buildContentInventory();
      const screenInventory = inventory.screens.find(s => s.screenId === screenId);
      const contentResolveTime = Date.now() - contentResolveStart;

      if (!screenInventory) {
        return res.status(404).json({ error: "Screen not found in inventory" });
      }

      const details = {
        screen_id: screenInventory.screenId,
        screen_name: screenInventory.name,
        workspace_id: screenInventory.workspaceId,
        workspace_name: screenInventory.workspaceName,
        source_type: screenInventory.screen_content?.source_type || null,
        source_id: screenInventory.screen_content?.source_id || null,
        source_name: screenInventory.screen_content?.source_name || undefined,
        media_count: screenInventory.counts.mediaItemsTotal,
        unique_media_count: screenInventory.counts.uniqueMediaIds,
        media: screenInventory.topMedia.map(m => ({
          media_id: m.id,
          name: m.name,
          type: m.type,
          from: screenInventory.screen_content?.source_type || "playlist",
        })),
        playlists_resolved: screenInventory.playlistsResolved || [],
        warnings: screenInventory.warnings.length > 0 
          ? screenInventory.warnings 
          : (screenInventory.screen_content?.source_type ? [] : ["no content assigned"]),
        raw_screen_content: screen.screen_content,
        timings_ms: {
          screen_fetch: screenFetchTime,
          content_resolve: contentResolveTime,
          total: Date.now() - startTime,
        },
      };

      return res.json({ mode: "live", screen: details });
    } catch (error: any) {
      console.error(`[Yodeck] Error fetching screen ${screenId} details:`, error);
      return res.status(500).json({ error: error.message || "Failed to fetch screen details" });
    }
  });

  // GET /api/yodeck/stats - Get aggregated statistics
  app.get("/api/yodeck/stats", requirePermission("manage_integrations"), async (req, res) => {
    const refresh = req.query.refresh === "1";

    try {
      const startTime = Date.now();
      const { getYodeckClient } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        return res.json({
          mode: "mock",
          stats: MOCK_STATS,
          generated_at: new Date().toISOString(),
          timing_ms: Date.now() - startTime,
        });
      }

      const { buildContentInventory, refreshInventory } = await import("./services/yodeckInventory");
      
      let inventory;
      if (refresh) {
        inventory = await refreshInventory();
      } else {
        inventory = await buildContentInventory();
      }

      const totalWarnings = inventory.screens.reduce((count, s) => {
        return count + (s.warnings?.length || 0) + (s.screen_content?.source_type ? 0 : 1);
      }, 0);

      const stats = {
        total_screens: inventory.totals.screens,
        total_media_in_use: inventory.totals.totalMediaAllScreens,
        total_unique_media_in_use: inventory.totals.uniqueMediaAcrossAllScreens,
        top_media: inventory.totals.topMediaByScreens.map(m => ({
          media_id: m.mediaId,
          name: m.name,
          screen_count: m.screenCount,
        })),
        top_playlists: inventory.totals.topSourcesByUsage.map(s => ({
          source_type: s.sourceType,
          source_name: s.sourceName,
          screen_count: s.screenCount,
        })),
        errors_count: 0,
        warnings_count: totalWarnings,
      };

      return res.json({
        mode: "live",
        stats,
        generated_at: inventory.generatedAt,
        timing_ms: Date.now() - startTime,
      });
    } catch (error: any) {
      console.error("[Yodeck] Error fetching stats:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch stats" });
    }
  });

  // GET /api/yodeck/content/summary - Full content summary using ContentResolver
  app.get("/api/yodeck/content/summary", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const { getYodeckClient, ContentResolver } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        return res.status(400).json({ error: "Yodeck API not configured" });
      }

      // Get all Yodeck screens
      const screens = await client.getScreens();
      
      // Resolve content for each screen
      const resolver = new ContentResolver(client);
      const screenSummaries: Array<{
        screenId: number;
        name: string;
        status: string;
        uniqueMediaCount: number;
        itemsPlaying: Array<{ type: string; id: number; name: string }>;
        topItems: string[];
        mediaItems: Array<{ id: number; name: string; type: string; duration: number; mediaType?: string }>;
        sourceType?: string;
        sourceId?: number;
        sourceName?: string;
        warnings: string[];
        lastFetchedAt: string;
      }> = [];

      const allMediaIds = new Set<number>();
      let totalMediaCountSum = 0;
      
      // Track status counts
      let screensWithContent = 0;
      let screensEmpty = 0;
      let screensUnknown = 0;
      let screensError = 0;
      
      // Track media usage for top10
      const mediaUsageCount = new Map<number, { id: number; name: string; count: number }>();

      for (const screen of screens) {
        const resolved = await resolver.resolveScreenContent(screen);
        
        screenSummaries.push({
          screenId: screen.id,
          name: screen.name,
          status: resolved.status,
          uniqueMediaCount: resolved.uniqueMediaCount,
          itemsPlaying: resolved.items,
          topItems: resolved.topItems,
          mediaItems: resolved.mediaItems,
          sourceType: resolved.sourceType,
          sourceId: resolved.sourceId,
          sourceName: resolved.sourceName,
          warnings: resolved.warnings,
          lastFetchedAt: resolved.lastFetchedAt,
        });

        // Count by status
        switch (resolved.status) {
          case "has_content": screensWithContent++; break;
          case "empty": screensEmpty++; break;
          case "unknown": case "unknown_tagbased": screensUnknown++; break;
          case "error": screensError++; break;
        }

        // Accumulate totals and track media usage
        for (const media of resolved.mediaItems) {
          allMediaIds.add(media.id);
          const existing = mediaUsageCount.get(media.id);
          if (existing) {
            existing.count++;
          } else {
            mediaUsageCount.set(media.id, { id: media.id, name: media.name, count: 1 });
          }
        }
        totalMediaCountSum += resolved.uniqueMediaCount;
      }

      // Get top 10 most used media across all screens
      const top10Media = Array.from(mediaUsageCount.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(m => ({ mediaId: m.id, name: m.name, screenCount: m.count }));

      // Get last sync timestamp from our DB
      const dbScreens = await storage.getScreens();
      const lastSyncedAt = dbScreens.reduce((latest, s) => {
        if (s.yodeckContentLastFetchedAt) {
          const ts = new Date(s.yodeckContentLastFetchedAt);
          return !latest || ts > latest ? ts : latest;
        }
        return latest;
      }, null as Date | null);

      return res.json({
        screens: screenSummaries,
        totals: {
          totalScreens: screens.length,
          screensWithContent,
          screensEmpty,
          screensUnknown,
          screensError,
          totalUniqueMediaAcrossAllScreens: allMediaIds.size,
          totalMediaAssignments: totalMediaCountSum,
          top10Media,
        },
        lastSyncedAt: lastSyncedAt?.toISOString() || null,
      });
    } catch (error: any) {
      console.error("[Yodeck] Error fetching content summary:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch content summary" });
    }
  });

  // ============================================================================
  // CONTROL ROOM (OPS-FIRST DASHBOARD)
  // ============================================================================

  app.get("/api/control-room/stats", async (_req, res) => {
    try {
      // Check cache first (10 second TTL)
      const cached = getCached<any>("control-room-stats");
      if (cached) {
        return res.json(cached);
      }
      
      const screens = await storage.getScreens();
      const placements = await storage.getPlacements();
      const contracts = await storage.getContracts();
      const now = new Date();
      
      const screensOnline = screens.filter(s => s.status === "online").length;
      const screensOffline = screens.filter(s => s.status === "offline").length;
      const screensTotal = screens.length;
      const onlineScreens = screens.filter(s => s.status === "online");
      
      // Active placements: isActive AND current date within start/end range
      const isPlacementActive = (p: any) => {
        if (!p.isActive) return false;
        const startDate = p.startDate ? new Date(p.startDate) : null;
        const endDate = p.endDate ? new Date(p.endDate) : null;
        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;
        return true;
      };
      
      const activePlacementsList = placements.filter(isPlacementActive);
      const activePlacements = activePlacementsList.length;
      
      // PLACEMENT-BASED STATS (Elevizion data, NOT Yodeck)
      // Count active placements per screen
      const screenPlacementCounts = new Map<string, number>();
      activePlacementsList.forEach(p => {
        const count = screenPlacementCounts.get(p.screenId) || 0;
        screenPlacementCounts.set(p.screenId, count + 1);
      });
      
      // Screens with/without active Elevizion placements
      const screensWithPlacements = onlineScreens.filter(s => 
        (screenPlacementCounts.get(s.id) || 0) > 0
      ).length;
      const screensWithoutPlacements = onlineScreens.filter(s => 
        (screenPlacementCounts.get(s.id) || 0) === 0
      ).length;
      
      // Screens with screenshot (online + has yodeckScreenshotUrl)
      const screensWithScreenshot = onlineScreens.filter(s => 
        s.yodeckScreenshotUrl && s.yodeckScreenshotUrl.length > 0
      ).length;
      
      // Yodeck content tracking (SECONDARY - for unmanaged content detection)
      // Status values: unknown, empty, has_content, likely_has_content, error
      const screensWithYodeckContent = onlineScreens.filter(s => 
        s.yodeckContentStatus === "has_content" || s.yodeckContentStatus === "likely_has_content"
      ).length;
      const screensYodeckEmpty = onlineScreens.filter(s => 
        s.yodeckContentStatus === "empty"
      ).length;
      const contentUnknown = onlineScreens.filter(s => 
        !s.yodeckContentLastFetchedAt
      ).length;
      const contentError = onlineScreens.filter(s => 
        s.yodeckContentStatus === "error"
      ).length;
      
      // Paying advertisers: advertisers with active/signed contract AND active placements
      const activeContracts = contracts.filter(c => 
        c.status === "signed" || c.status === "active"
      );
      const activePlacementContractIds = new Set(
        activePlacementsList.map(p => p.contractId)
      );
      const payingAdvertiserIds = new Set<string>();
      activeContracts.forEach(contract => {
        if (activePlacementContractIds.has(contract.id)) {
          payingAdvertiserIds.add(contract.advertiserId);
        }
      });
      const payingAdvertisers = payingAdvertiserIds.size;
      
      // Yodeck media links stats (ads classification from yodeck_media_links table)
      const mediaLinkStats = await storage.getYodeckMediaLinkStats();
      
      // Location / Moneybird data completeness stats
      const locations = await storage.getLocations();
      const locationsTotal = locations.length;
      const locationsWithMoneybird = locations.filter(l => l.moneybirdContactId).length;
      const locationsWithoutMoneybird = locationsTotal - locationsWithMoneybird;
      const locationsAddressComplete = locations.filter(l => 
        l.address?.trim() && l.zipcode?.trim() && l.city?.trim()
      ).length;
      const locationsAddressIncomplete = locationsTotal - locationsAddressComplete;
      const screensWithoutLocation = screens.filter(s => !s.locationId).length;
      
      const result = {
        screensOnline,
        screensTotal,
        screensOffline,
        activePlacements,
        payingAdvertisers,
        // Placement-based stats (Elevizion data)
        screensWithPlacements,
        screensWithoutPlacements,
        screensWithScreenshot,
        // Yodeck content stats (secondary)
        screensWithYodeckContent,
        screensYodeckEmpty,
        contentUnknown,
        contentError,
        // Ads classification stats (from yodeck_media_links)
        adsTotal: mediaLinkStats.totalAds,
        adsUnlinked: mediaLinkStats.unlinkedAds,
        nonAdsTotal: mediaLinkStats.totalNonAds,
        // Location / Moneybird data completeness
        locationsTotal,
        locationsWithMoneybird,
        locationsWithoutMoneybird,
        locationsAddressComplete,
        locationsAddressIncomplete,
        screensWithoutLocation,
      };
      setCache("control-room-stats", result);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/control-room/alerts", async (_req, res) => {
    try {
      const screens = await storage.getScreens();
      const placements = await storage.getPlacements();
      const alerts: any[] = [];
      
      const now = new Date();
      screens.forEach(screen => {
        if (screen.status === "offline") {
          let minutesOffline = 999;
          try {
            if (screen.lastSeenAt) {
              const lastSeen = new Date(screen.lastSeenAt);
              if (!isNaN(lastSeen.getTime())) {
                minutesOffline = Math.floor((now.getTime() - lastSeen.getTime()) / 60000);
              }
            }
          } catch {
            minutesOffline = 999;
          }
          
          if (minutesOffline > 30) {
            alerts.push({
              id: `offline-${screen.id}`,
              type: "screen_offline",
              severity: minutesOffline > 120 ? "high" : "medium",
              title: `Scherm ${screen.screenId} offline`,
              description: `Al ${minutesOffline} minuten geen verbinding`,
              screenId: screen.screenId,
              createdAt: screen.lastSeenAt || now.toISOString(),
              minutesOffline,
            });
          }
        }
        
        if (!screen.lastSeenAt && screen.status === "unknown") {
          alerts.push({
            id: `never-seen-${screen.id}`,
            type: "screen_never_seen",
            severity: "high",
            title: `Scherm ${screen.screenId} nooit online gezien`,
            description: "Nieuw scherm meldt zich niet aan",
            screenId: screen.screenId,
            createdAt: now.toISOString(),
          });
        }
      });
      
      // placement.screenId references screens.id (UUID), not screens.screenId (EVZ-001)
      const activePlacements = placements.filter(p => p.isActive);
      const placementsPerScreen: Record<string, number> = {};
      activePlacements.forEach(p => {
        placementsPerScreen[p.screenId] = (placementsPerScreen[p.screenId] || 0) + 1;
      });
      
      // Use screen.id (UUID) to match placement.screenId
      screens.forEach(screen => {
        const count = placementsPerScreen[screen.id] || 0;
        if (count < 20 && screen.status === "online") {
          alerts.push({
            id: `empty-${screen.id}`,
            type: "empty_inventory",
            severity: "low",
            title: `Scherm ${screen.screenId} heeft weinig ads`,
            description: `Slechts ${count} plaatsingen (< 20)`,
            screenId: screen.screenId,
            createdAt: now.toISOString(),
          });
        }
      });
      
      alerts.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return (severityOrder[a.severity as keyof typeof severityOrder] || 2) - 
               (severityOrder[b.severity as keyof typeof severityOrder] || 2);
      });
      
      res.json(alerts.slice(0, 5));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/control-room/checklist", async (_req, res) => {
    try {
      const screens = await storage.getScreens();
      const placements = await storage.getPlacements();
      
      const offlineScreens = screens.filter(s => s.status === "offline").length;
      
      // placement.screenId references screens.id (UUID), not screens.screenId (EVZ-001)
      const activePlacements = placements.filter(p => p.isActive);
      const placementsPerScreen: Record<string, number> = {};
      activePlacements.forEach(p => {
        placementsPerScreen[p.screenId] = (placementsPerScreen[p.screenId] || 0) + 1;
      });
      // Use screen.id (UUID) to match placement.screenId
      const emptyScreens = screens.filter(s => 
        (placementsPerScreen[s.id] || 0) < 20 && s.status === "online"
      ).length;
      
      const checklist = [
        {
          id: "1",
          label: "Bevestig alle schermen online",
          completed: offlineScreens === 0,
          link: "/screens?status=offline",
          count: offlineScreens,
        },
        {
          id: "2",
          label: "Vul lege schermen",
          completed: emptyScreens === 0,
          link: "/screens?empty=true",
          count: emptyScreens,
        },
        {
          id: "3",
          label: "Keur wachtende creatives goed",
          completed: true,
          link: "/placements?pending=true",
          count: 0,
        },
        {
          id: "4",
          label: "Verleng aflopende plaatsingen",
          completed: true,
          link: "/placements?expiring=true",
          count: 0,
        },
      ];
      
      res.json(checklist);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Action items for lightweight Action Overview (operational only, no financial/contract items)
  // PRIORITY ORDER:
  // 1. offline_screen (error) - Screen is offline
  // 2. onboarding_hint (warning) - Online but no Elevizion placements
  // 3. unmanaged_content (info) - Has screenshot/online but no managed placements
  // 4. ok/active (success) - Has active placements (not shown in actions, these are good)
  app.get("/api/control-room/actions", async (_req, res) => {
    try {
      // Check cache first (10 second TTL)
      const cached = getCached<any[]>("control-room-actions");
      if (cached) {
        return res.json(cached);
      }
      
      const screens = await storage.getScreens();
      const placements = await storage.getPlacements();
      const locations = await storage.getLocations();
      const advertisers = await storage.getAdvertisers();
      const contracts = await storage.getContracts();
      const actions: any[] = [];
      const now = new Date();
      
      // Build contract -> advertiser lookup
      const contractAdvertiserMap = new Map<string, string>();
      contracts.forEach(c => contractAdvertiserMap.set(c.id, c.advertiserId));
      
      // Helper: get recognizable screen name (priority: yodeckPlayerName -> name -> screenId)
      // Per user request: use yodeckPlayerName primarily, avoid screenId in list
      const getScreenDisplayName = (screen: any) => 
        screen.yodeckPlayerName || screen.name || screen.screenId || "Onbekend scherm";
      
      // Helper: get location description (LocationName only, no screenId in description)
      const getLocationDesc = (screen: any) => {
        const location = locations.find(l => l.id === screen.locationId);
        return location?.name || "";
      };
      
      // Calculate truly active placements (isActive AND within date range)
      const isPlacementActive = (p: any) => {
        if (!p.isActive) return false;
        const startDate = p.startDate ? new Date(p.startDate) : null;
        const endDate = p.endDate ? new Date(p.endDate) : null;
        if (startDate && now < startDate) return false;
        if (endDate && now > endDate) return false;
        return true;
      };
      
      // Build placement counts per screen (Elevizion data)
      const screenPlacementCounts = new Map<string, number>();
      const screenActiveAdvertisers = new Map<string, string[]>();
      placements.filter(isPlacementActive).forEach(p => {
        const count = screenPlacementCounts.get(p.screenId) || 0;
        screenPlacementCounts.set(p.screenId, count + 1);
        
        // Track advertiser names for this screen (via contract -> advertiser)
        const advertiserId = contractAdvertiserMap.get(p.contractId);
        const advertiser = advertiserId ? advertisers.find(a => a.id === advertiserId) : null;
        if (advertiser) {
          const names = screenActiveAdvertisers.get(p.screenId) || [];
          if (!names.includes(advertiser.companyName)) {
            names.push(advertiser.companyName);
            screenActiveAdvertisers.set(p.screenId, names);
          }
        }
      });
      
      // PRIORITY 1: Offline screens (error severity)
      screens.forEach(screen => {
        if (screen.status === "offline") {
          const locationDesc = getLocationDesc(screen);
          actions.push({
            id: `offline-${screen.id}`,
            type: "offline_screen",
            itemName: getScreenDisplayName(screen),
            description: locationDesc || "Geen locatie",
            severity: "error",
            link: `/screens/${screen.id}`,
          });
        }
      });
      
      // Process online screens for placement-based actions
      const onlineScreens = screens.filter(s => s.status === "online");
      
      onlineScreens.forEach(screen => {
        const locationDesc = getLocationDesc(screen);
        const placementCount = screenPlacementCounts.get(screen.id) || 0;
        const advertiserNames = screenActiveAdvertisers.get(screen.id) || [];
        const hasScreenshot = screen.yodeckScreenshotUrl && screen.yodeckScreenshotUrl.length > 0;
        const contentLastFetched = screen.yodeckContentLastFetchedAt;
        const contentStatus = screen.yodeckContentStatus;
        
        if (placementCount === 0) {
          // PRIORITY 2: No Elevizion placements - onboarding hint
          // Check if it's unmanaged content (has screenshot or Yodeck content but no Elevizion placements)
          const hasYodeckContent = contentStatus === "has_content" || contentStatus === "likely_has_content";
          
          if (hasScreenshot || hasYodeckContent) {
            // Screen is playing SOMETHING (screenshot/Yodeck content) but not managed by Elevizion
            const itemCount = screen.yodeckContentCount;
            const contentSummary = screen.yodeckContentSummary as any;
            const lastFetchedAt = screen.yodeckContentLastFetchedAt;
            const mediaItems = contentSummary?.mediaItems || [];
            
            // Classify media items
            const classification = classifyMediaItems(mediaItems);
            const ads = classification.classifiedMediaItems.filter(m => m.category === 'ad');
            const nonAds = classification.classifiedMediaItems.filter(m => m.category === 'non_ad');
            
            // New statusText: "Yodeck content actief • X items (A ads, B overig) • Y nog niet gekoppeld"
            let statusText = itemCount && itemCount > 0
              ? `Yodeck content actief • ${itemCount} items (${ads.length} ads, ${nonAds.length} overig)`
              : "Yodeck content actief";
            if (ads.length > 0) {
              statusText += ` • ${ads.length} nog niet gekoppeld`;
            }
            
            // Build topItems from mediaItems if topItems not available
            let topItems = contentSummary?.topItems || [];
            if (topItems.length === 0 && mediaItems.length > 0) {
              topItems = mediaItems.slice(0, 5).map((m: any) => 
                `${m.type || 'media'}: ${m.name}`
              );
            }
            
            actions.push({
              id: `unmanaged-${screen.id}`,
              type: "unmanaged_content",
              itemName: getScreenDisplayName(screen),
              description: locationDesc || "Geen locatie",
              severity: "info",
              link: `/screens/${screen.id}`,
              statusText,
              contentCount: itemCount || 0,
              adsCount: ads.length,
              nonAdsCount: nonAds.length,
              adsUnlinkedCount: ads.length, // All ads on unmanaged screens are unlinked
              topAds: ads.slice(0, 5).map(m => m.name),
              topNonAds: nonAds.slice(0, 5).map(m => m.name),
              topItems,
              sourceType: contentSummary?.sourceType,
              sourceName: contentSummary?.sourceName,
              lastFetchedAt: lastFetchedAt?.toISOString() || null,
              mediaItems: classification.classifiedMediaItems,
            });
          } else {
            // Screen has no placements and we can't confirm content
            actions.push({
              id: `onboarding-${screen.id}`,
              type: "onboarding_hint",
              itemName: getScreenDisplayName(screen),
              description: locationDesc || "Geen locatie",
              severity: "warning",
              link: `/screens/${screen.id}`,
              statusText: "Nog geen placements in Elevizion",
            });
          }
        }
        // If placementCount > 0, screen is OK - no action needed (these are actively managed)
      });
      
      // Paused placements - only for online screens with active placements but some paused
      placements.filter(p => !p.isActive).forEach(placement => {
        const screen = screens.find(s => s.id === placement.screenId);
        // Skip if screen is offline - we already show offline_screen action
        if (screen && screen.status === "offline") return;
        
        const displayName = screen ? getScreenDisplayName(screen) : "Onbekend scherm";
        const locationName = screen ? getLocationDesc(screen) : "";
        actions.push({
          id: `paused-${placement.id}`,
          type: "paused_placement",
          itemName: displayName,
          description: locationName || "Plaatsing gepauzeerd",
          severity: "warning",
          link: `/placements/${placement.id}`,
        });
      });
      
      // Sort by severity priority (error first, then warning, then info)
      const severityPriority: Record<string, number> = {
        error: 0,
        warning: 1,
        info: 2,
      };
      actions.sort((a, b) => {
        const priorityA = severityPriority[a.severity] ?? 99;
        const priorityB = severityPriority[b.severity] ?? 99;
        return priorityA - priorityB;
      });
      
      setCache("control-room-actions", actions);
      res.json(actions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Online trend for last 7 days (mock data for now, can be enhanced with actual tracking)
  app.get("/api/control-room/online-trend", async (_req, res) => {
    try {
      const screens = await storage.getScreens();
      const totalScreens = screens.length;
      const onlineNow = screens.filter(s => s.status === "online").length;
      const currentPercentage = totalScreens > 0 ? Math.round((onlineNow / totalScreens) * 100) : 100;
      
      // Generate 7-day trend (current day is accurate, previous days are simulated)
      const trend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        if (i === 0) {
          trend.push({ date: dateStr, percentage: currentPercentage });
        } else {
          // Simulate slight variation for past days
          const variation = Math.floor(Math.random() * 10) - 5;
          const simulated = Math.min(100, Math.max(0, currentPercentage + variation));
          trend.push({ date: dateStr, percentage: simulated });
        }
      }
      
      res.json(trend);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SYNC STATUS & INTEGRATIONS
  // ============================================================================

  app.get("/api/sync/status", async (_req, res) => {
    try {
      let configs = await storage.getIntegrationConfigs();
      let yodeck = configs.find(c => c.service === "yodeck");
      const moneybird = configs.find(c => c.service === "moneybird");
      
      // Auto-trigger Yodeck sync if enabled and lastSyncAt is null or older than 10 minutes
      if (yodeck?.isEnabled) {
        const TEN_MINUTES = 10 * 60 * 1000;
        const now = Date.now();
        const lastSyncTime = yodeck.lastSyncAt ? new Date(yodeck.lastSyncAt).getTime() : 0;
        const needsSync = !yodeck.lastSyncAt || (now - lastSyncTime > TEN_MINUTES);
        
        if (needsSync) {
          console.log("[SYNC] auto-run triggered from /api/sync/status");
          try {
            await runYodeckSyncCore();
            // Refresh configs after sync
            configs = await storage.getIntegrationConfigs();
            yodeck = configs.find(c => c.service === "yodeck");
          } catch (syncError: any) {
            console.error("[SYNC] auto-run error:", syncError.message);
            // Don't fail the status endpoint, just log and continue with current status
          }
        }
      }
      
      res.json({
        yodeck: {
          lastSync: yodeck?.lastSyncAt?.toISOString() || "-",
          status: yodeck?.status || "not_configured",
          itemsProcessed: yodeck?.lastSyncItemsProcessed || 0,
        },
        moneybird: {
          lastSync: moneybird?.lastSyncAt?.toISOString() || "-",
          status: moneybird?.status || "not_configured",
          itemsProcessed: moneybird?.lastSyncItemsProcessed || 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // INTEGRATION CONFIGURATION
  // ============================================================================

  const VALID_SERVICES = ["yodeck", "moneybird", "dropbox_sign"];

  app.get("/api/integrations", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const configs = await storage.getIntegrationConfigs();
      
      const result = VALID_SERVICES.map(service => {
        const config = configs.find(c => c.service === service);
        return config || {
          id: null,
          service,
          isEnabled: false,
          status: "not_configured",
          lastTestedAt: null,
          lastTestResult: null,
          lastTestError: null,
          lastSyncAt: null,
          lastSyncItemsProcessed: null,
          syncFrequency: "15min",
          settings: null,
        };
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/:service", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      const config = await storage.getIntegrationConfig(service);
      
      if (!config) {
        return res.json({
          service,
          isEnabled: false,
          status: "not_configured",
          settings: null,
        });
      }
      
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const integrationUpdateSchema = z.object({
    isEnabled: z.boolean().optional(),
    syncFrequency: z.enum(["5min", "15min", "30min", "1hour", "manual"]).optional(),
    settings: z.record(z.unknown()).optional().nullable(),
  });

  app.put("/api/integrations/:service", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      const parsed = integrationUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "Ongeldige invoer", 
          errors: parsed.error.errors 
        });
      }

      const { isEnabled, syncFrequency, settings } = parsed.data;
      
      const config = await storage.upsertIntegrationConfig(service, {
        isEnabled,
        syncFrequency,
        settings,
      });
      
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/:service/test", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      let testResult: { success: boolean; message: string; deviceCount?: number } = { success: false, message: "Test niet beschikbaar" };
      
      // Yodeck uses ONLY process.env.YODECK_API_KEY - no credentials from database
      if (service === "yodeck") {
        const yodeckResult = await testYodeckConnection();
        testResult = { 
          success: yodeckResult.ok, 
          message: yodeckResult.message,
          deviceCount: yodeckResult.deviceCount
        };
      } else {
        // Other services use stored credentials
        const encryptedCreds = await storage.getIntegrationEncryptedCredentials(service);
        let credentials: Record<string, string> = {};
        
        if (encryptedCreds) {
          try {
            credentials = decryptCredentials(encryptedCreds);
          } catch {
          }
        }

        if (service === "moneybird") {
          testResult = await testMoneybirdConnection(credentials);
        } else if (service === "dropbox_sign") {
          testResult = await testDropboxSignConnection(credentials);
        }
      }

      await storage.upsertIntegrationConfig(service, {
        lastTestedAt: new Date(),
        lastTestResult: testResult.success ? "success" : "error",
        lastTestError: testResult.success ? null : testResult.message,
        status: testResult.success ? "connected" : "error",
      });

      res.json(testResult);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/integrations/:service/sync", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      const config = await storage.getIntegrationConfig(service);
      if (!config?.isEnabled) {
        return res.status(400).json({ message: "Integratie is niet ingeschakeld" });
      }
      if (config.status !== "connected") {
        return res.status(400).json({ message: "Integratie is niet verbonden. Test eerst de verbinding." });
      }
      
      // Actually run the sync for Yodeck
      if (service === "yodeck") {
        // Step 1: Sync screens (status, UUID, name)
        console.log("[Yodeck Sync] Step 1: Syncing screens from Yodeck API...");
        const result = await syncYodeckScreens();
        if (!result.success) {
          res.status(400).json({ success: false, message: result.message });
          return;
        }
        
        // Step 2: Fetch content details per screen (requires separate API calls)
        console.log("[Yodeck Sync] Step 2: Fetching content details per screen...");
        const { syncAllScreensContent } = await import("./services/yodeckContent");
        const contentResult = await syncAllScreensContent();
        
        console.log(`[Yodeck Sync] Complete - Screens: ${result.count}, Content: ${contentResult.stats.withContent} with content, ${contentResult.stats.empty} empty, ${contentResult.stats.unknown} unknown`);
        
        res.json({ 
          success: true, 
          message: `Sync voltooid: ${result.count} schermen, ${contentResult.stats.withContent} met content, ${contentResult.stats.empty} leeg, ${contentResult.stats.unknown} onbekend`,
          count: result.count,
          mapped: result.mapped,
          unmapped: result.unmapped,
          updated: result.updated,
          content: contentResult.stats,
        });
        return;
      }
      
      // Placeholder for other services
      await storage.upsertIntegrationConfig(service, {
        lastSyncAt: new Date(),
        lastSyncItemsProcessed: 0,
      });
      
      res.json({ success: true, message: "Sync gestart" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/integrations/secrets/status", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const configs = await storage.getIntegrationConfigs();
      const result: Record<string, Record<string, boolean>> = {
        yodeck: { api_key: false },
        moneybird: { access_token: false, admin_id: false },
        dropbox_sign: { api_key: false },
      };
      
      for (const config of configs) {
        if (config.credentialsConfigured) {
          result[config.service] = config.credentialsConfigured as Record<string, boolean>;
        }
      }
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const { encryptCredentials, decryptCredentials, maskApiKey } = await import("./crypto");

  const credentialsSchema = z.object({
    credentials: z.record(z.string().min(1)),
  });

  app.post("/api/integrations/:service/credentials", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      const parseResult = credentialsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Ongeldige credentials formaat" });
      }

      const { credentials } = parseResult.data;
      
      const existingEncrypted = await storage.getIntegrationEncryptedCredentials(service);
      let mergedCredentials = { ...credentials };
      
      if (existingEncrypted) {
        try {
          const existing = decryptCredentials(existingEncrypted);
          mergedCredentials = { ...existing, ...credentials };
        } catch {
        }
      }

      const encrypted = encryptCredentials(mergedCredentials);
      const configuredKeys: Record<string, boolean> = {};
      for (const key of Object.keys(mergedCredentials)) {
        configuredKeys[key] = true;
      }

      const config = await storage.saveIntegrationCredentials(service, encrypted, configuredKeys);
      
      res.json({ 
        success: true, 
        message: "Credentials opgeslagen",
        credentialsConfigured: configuredKeys,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/integrations/:service/credentials", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      await storage.deleteIntegrationCredentials(service);
      res.json({ success: true, message: "Credentials verwijderd" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/integrations/:service/credentials/:key", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { service, key } = req.params;
      if (!VALID_SERVICES.includes(service)) {
        return res.status(400).json({ message: "Ongeldige service" });
      }

      const existingEncrypted = await storage.getIntegrationEncryptedCredentials(service);
      if (!existingEncrypted) {
        return res.status(404).json({ message: "Geen credentials gevonden" });
      }

      const existing = decryptCredentials(existingEncrypted);
      delete existing[key];

      if (Object.keys(existing).length === 0) {
        await storage.deleteIntegrationCredentials(service);
      } else {
        const encrypted = encryptCredentials(existing);
        const configuredKeys: Record<string, boolean> = {};
        for (const k of Object.keys(existing)) {
          configuredKeys[k] = true;
        }
        await storage.saveIntegrationCredentials(service, encrypted, configuredKeys);
      }

      res.json({ success: true, message: "Credential verwijderd" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/finance/overdue", requirePermission("view_finance"), async (_req, res) => {
    try {
      // Get Moneybird invoices that are overdue
      const moneybirdInvoices = await storage.getMoneybirdInvoices();
      const today = new Date();
      
      const overdueItems = moneybirdInvoices
        .filter(inv => {
          // Check if invoice is open and past due date
          if (inv.state !== "open" && inv.state !== "late") return false;
          if (!inv.dueDate) return false;
          const dueDate = new Date(inv.dueDate);
          return dueDate < today;
        })
        .map(inv => {
          const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: inv.id,
            moneybirdInvoiceId: inv.moneybirdId,
            invoiceNumber: inv.invoiceId || inv.reference || inv.moneybirdId,
            moneybirdContactId: inv.moneybirdContactId,
            totalAmount: inv.totalPriceInclTax,
            unpaidAmount: inv.totalUnpaid,
            dueDate: inv.dueDate,
            daysOverdue,
            state: inv.state,
            url: inv.url,
          };
        })
        .sort((a, b) => b.daysOverdue - a.daysOverdue);

      // Also get internal invoices that are overdue
      const internalInvoices = await storage.getInvoices();
      const overdueInternal = internalInvoices
        .filter(inv => {
          if (inv.status === "paid") return false;
          if (!inv.dueDate) return false;
          const dueDate = new Date(inv.dueDate);
          return dueDate < today;
        })
        .map(inv => {
          const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: inv.id,
            type: "internal" as const,
            invoiceNumber: inv.invoiceNumber,
            advertiserId: inv.advertiserId,
            totalAmount: inv.amountIncVat,
            dueDate: inv.dueDate,
            daysOverdue,
            status: inv.status,
          };
        });

      res.json({
        moneybird: overdueItems,
        internal: overdueInternal,
        summary: {
          moneybirdCount: overdueItems.length,
          moneybirdTotal: overdueItems.reduce((sum, i) => sum + parseFloat(i.unpaidAmount || "0"), 0),
          internalCount: overdueInternal.length,
          internalTotal: overdueInternal.reduce((sum, i) => sum + parseFloat(String(i.totalAmount || 0)), 0),
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SCREEN <-> MONEYBIRD MAPPING ROUTES
  // ============================================================================

  // Get screens with mapping status and suggestions
  app.get("/api/mappings/screens", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const { findMatchesForScreen, getBestAutoMatch } = await import("./services/screenMatcher");
      
      const screensWithStatus = await storage.getScreensWithMappingStatus();
      const contacts = await storage.getMoneybirdContacts();
      const mappingStats = await storage.getMappingStats();
      
      const results = screensWithStatus.map(row => {
        const screenName = row.screen.yodeckPlayerName || row.screen.name;
        const suggestions = findMatchesForScreen(row.screen.name, row.screen.yodeckPlayerName, contacts);
        const bestMatch = getBestAutoMatch(suggestions);
        
        let status: "unmapped" | "auto_mapped" | "manually_mapped" | "needs_review" = "unmapped";
        if (row.screen.matchConfidence === "manual") {
          status = "manually_mapped";
        } else if (row.screen.matchConfidence === "auto_exact" || row.screen.matchConfidence === "auto_fuzzy") {
          status = "auto_mapped";
        } else if (row.screen.matchConfidence === "needs_review") {
          status = "needs_review";
        }
        
        return {
          screen: {
            id: row.screen.id,
            screenId: row.screen.screenId,
            name: row.screen.name,
            yodeckPlayerName: row.screen.yodeckPlayerName,
            locationId: row.screen.locationId,
            locationName: row.locationName
          },
          currentMatch: row.mappedContactId ? {
            confidence: row.screen.matchConfidence,
            reason: row.screen.matchReason,
            moneybirdContactId: row.mappedContactId,
            contactName: row.mappedContactName
          } : null,
          suggestions,
          bestAutoMatch: bestMatch,
          status
        };
      });
      
      res.json({
        screens: results,
        stats: mappingStats,
        contactsCount: contacts.length
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Link screen to Moneybird contact
  app.post("/api/mappings/link", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { screenId, moneybirdContactId, isManual } = req.body;
      
      if (!screenId || !moneybirdContactId) {
        return res.status(400).json({ message: "screenId en moneybirdContactId zijn vereist" });
      }
      
      const contact = await storage.getMoneybirdContactByMoneybirdId(moneybirdContactId);
      if (!contact) {
        return res.status(404).json({ message: "Moneybird contact niet gevonden" });
      }
      
      const contactName = contact.companyName || 
        [contact.firstname, contact.lastname].filter(Boolean).join(" ") || 
        "Onbekend";
      
      const confidence = isManual ? "manual" : "auto_exact";
      const reason = isManual 
        ? `Handmatig gekoppeld aan: "${contactName}"`
        : `Automatisch gekoppeld aan: "${contactName}"`;
      
      const result = await storage.linkScreenToMoneybirdContact(
        screenId, 
        moneybirdContactId,
        confidence,
        reason
      );
      
      res.json({
        ok: true,
        message: `Screen gekoppeld aan ${contactName}`,
        screen: result.screen,
        location: result.location
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Unlink screen from Moneybird contact
  app.post("/api/mappings/unlink", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { screenId } = req.body;
      
      if (!screenId) {
        return res.status(400).json({ message: "screenId is vereist" });
      }
      
      const defaultLocation = await storage.getDefaultLocation();
      if (!defaultLocation) {
        return res.status(500).json({ message: "Geen default locatie gevonden" });
      }
      
      const screen = await storage.unlinkScreen(screenId, defaultLocation.id);
      
      res.json({
        ok: true,
        message: "Screen ontkoppeld van Moneybird contact",
        screen
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Auto-match all screens
  app.post("/api/mappings/auto-match", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { findMatchesForScreen, getBestAutoMatch } = await import("./services/screenMatcher");
      
      const unmappedScreens = await storage.getUnmappedScreens();
      const contacts = await storage.getMoneybirdContacts();
      
      let matched = 0;
      let needsReview = 0;
      let noMatch = 0;
      const results: Array<{
        screenId: string;
        screenName: string;
        action: "matched" | "needs_review" | "no_match";
        contactName?: string;
        confidence?: string;
      }> = [];
      
      for (const screen of unmappedScreens) {
        const suggestions = findMatchesForScreen(screen.name, screen.yodeckPlayerName, contacts);
        const bestMatch = getBestAutoMatch(suggestions);
        
        if (bestMatch) {
          await storage.linkScreenToMoneybirdContact(
            screen.id,
            bestMatch.moneybirdContactId,
            bestMatch.confidence as "auto_exact" | "auto_fuzzy",
            bestMatch.reason
          );
          matched++;
          results.push({
            screenId: screen.screenId,
            screenName: screen.yodeckPlayerName || screen.name,
            action: "matched",
            contactName: bestMatch.contactName,
            confidence: bestMatch.confidence
          });
        } else if (suggestions.length > 0) {
          needsReview++;
          results.push({
            screenId: screen.screenId,
            screenName: screen.yodeckPlayerName || screen.name,
            action: "needs_review"
          });
        } else {
          noMatch++;
          results.push({
            screenId: screen.screenId,
            screenName: screen.yodeckPlayerName || screen.name,
            action: "no_match"
          });
        }
      }
      
      res.json({
        ok: true,
        message: `Auto-matching voltooid: ${matched} gekoppeld, ${needsReview} review nodig, ${noMatch} geen match`,
        summary: { matched, needsReview, noMatch },
        results
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get mapping stats
  app.get("/api/mappings/stats", requirePermission("view_screens"), async (_req, res) => {
    try {
      const stats = await storage.getMappingStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
