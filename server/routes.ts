/**
 * API Routes for Elevizion OS
 * Thin controller layer - all business logic in storage/services
 */

import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import {
  insertAdvertiserSchema,
  insertLocationSchema,
  insertScreenSchema,
  insertPackagePlanSchema,
  insertContractSchema,
  insertPlacementSchema,
  insertInvoiceSchema,
  insertPayoutSchema,
} from "@shared/schema";
import {
  getIntegrationStatus,
  testYodeckConnection,
  testMoneybirdConnection,
  syncYodeckScreens,
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
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

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
  // SCREENS
  // ============================================================================

  app.get("/api/screens", async (_req, res) => {
    const screens = await storage.getScreens();
    res.json(screens);
  });

  app.get("/api/screens/:id", async (req, res) => {
    const screen = await storage.getScreen(req.params.id);
    if (!screen) return res.status(404).json({ message: "Screen not found" });
    res.json(screen);
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

  app.post("/api/integrations/yodeck/test", async (_req, res) => {
    const result = await testYodeckConnection();
    res.json(result);
  });

  app.post("/api/integrations/moneybird/test", async (_req, res) => {
    const result = await testMoneybirdConnection();
    res.json(result);
  });

  app.post("/api/integrations/yodeck/sync", async (_req, res) => {
    const result = await syncYodeckScreens();
    if (result.success && result.screens) {
      for (const yodeckScreen of result.screens) {
        const existingScreens = await storage.getScreens();
        const match = existingScreens.find(s => s.yodeckPlayerId === yodeckScreen.id);
        if (match) {
          await storage.updateScreen(match.id, {
            status: yodeckScreen.online ? "online" : "offline",
            lastSeenAt: new Date(),
          });
        }
      }
    }
    res.json(result);
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

  return httpServer;
}
