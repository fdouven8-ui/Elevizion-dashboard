import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertAdvertiserSchema,
  insertLocationSchema,
  insertScreenSchema,
  insertCampaignSchema,
  insertPlacementSchema,
  insertPayoutSchema,
} from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Advertisers
  app.get("/api/advertisers", async (_req, res) => {
    const advertisers = await storage.getAdvertisers();
    res.json(advertisers);
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
    const { id } = req.params;
    const advertiser = await storage.updateAdvertiser(id, req.body);
    if (!advertiser) {
      return res.status(404).json({ message: "Advertiser not found" });
    }
    res.json(advertiser);
  });

  // Locations
  app.get("/api/locations", async (_req, res) => {
    const locations = await storage.getLocations();
    res.json(locations);
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
    const { id } = req.params;
    const location = await storage.updateLocation(id, req.body);
    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }
    res.json(location);
  });

  // Screens
  app.get("/api/screens", async (_req, res) => {
    const screens = await storage.getScreens();
    res.json(screens);
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
    const { id } = req.params;
    const screen = await storage.updateScreen(id, req.body);
    if (!screen) {
      return res.status(404).json({ message: "Screen not found" });
    }
    res.json(screen);
  });

  // Campaigns
  app.get("/api/campaigns", async (_req, res) => {
    const campaigns = await storage.getCampaigns();
    res.json(campaigns);
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const { screenIds, ...campaignData } = req.body;
      const validatedCampaign = insertCampaignSchema.parse(campaignData);
      const campaign = await storage.createCampaign(validatedCampaign);

      // Create placements if screenIds provided
      if (screenIds && Array.isArray(screenIds)) {
        for (const screenId of screenIds) {
          await storage.createPlacement({
            campaignId: campaign.id,
            screenId,
            secondsPerLoop: 10,
            playsPerHour: 6,
          });
        }
      }

      res.status(201).json(campaign);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Placements
  app.get("/api/placements", async (_req, res) => {
    const placements = await storage.getPlacements();
    res.json(placements);
  });

  // Invoices
  app.get("/api/invoices", async (_req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
  });

  // Payouts
  app.get("/api/payouts", async (_req, res) => {
    const payouts = await storage.getPayouts();
    res.json(payouts);
  });

  app.post("/api/payouts/generate", async (req, res) => {
    try {
      const { month } = req.body;
      
      // Get active advertisers and calculate revenue
      const advertisers = await storage.getAdvertisers();
      const activeRevenue = advertisers
        .filter(a => a.status === 'active')
        .reduce((sum, a) => sum + parseFloat(a.monthlyPriceExVat.toString()), 0);

      const placements = await storage.getPlacements();
      const totalPlacements = placements.length;

      if (totalPlacements === 0) {
        return res.status(400).json({ message: "No placements found" });
      }

      const locations = await storage.getLocations();
      const screens = await storage.getScreens();

      const newPayouts = [];
      for (const loc of locations) {
        const locScreenIds = screens.filter(s => s.locationId === loc.id).map(s => s.id);
        const locPlacementCount = placements.filter(p => locScreenIds.includes(p.screenId)).length;
        
        const ratio = locPlacementCount / totalPlacements;
        const grossRevenue = activeRevenue * ratio;
        const share = grossRevenue * (loc.revenueSharePercent / 100);

        const payout = await storage.createPayout({
          locationId: loc.id,
          periodStart: `${month}-01`,
          periodEnd: `${month}-30`,
          grossRevenueExVat: grossRevenue.toFixed(2),
          sharePercent: loc.revenueSharePercent,
          payoutAmountExVat: share.toFixed(2),
          status: "pending",
        });

        newPayouts.push(payout);
      }

      res.status(201).json(newPayouts);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  return httpServer;
}
