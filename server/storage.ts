import { db } from "./db";
import { eq, and } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  Advertiser,
  InsertAdvertiser,
  Location,
  InsertLocation,
  Screen,
  InsertScreen,
  Campaign,
  InsertCampaign,
  Placement,
  InsertPlacement,
  Invoice,
  InsertInvoice,
  Payout,
  InsertPayout,
} from "@shared/schema";

export interface IStorage {
  // Advertisers
  getAdvertisers(): Promise<Advertiser[]>;
  getAdvertiser(id: string): Promise<Advertiser | undefined>;
  createAdvertiser(data: InsertAdvertiser): Promise<Advertiser>;
  updateAdvertiser(id: string, data: Partial<InsertAdvertiser>): Promise<Advertiser | undefined>;

  // Locations
  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(data: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;

  // Screens
  getScreens(): Promise<Screen[]>;
  getScreen(id: string): Promise<Screen | undefined>;
  createScreen(data: InsertScreen): Promise<Screen>;
  updateScreen(id: string, data: Partial<Screen>): Promise<Screen | undefined>;

  // Campaigns
  getCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(data: InsertCampaign): Promise<Campaign>;

  // Placements
  getPlacements(): Promise<Placement[]>;
  getPlacement(id: string): Promise<Placement | undefined>;
  createPlacement(data: InsertPlacement): Promise<Placement>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;

  // Payouts
  getPayouts(): Promise<Payout[]>;
  getPayout(id: string): Promise<Payout | undefined>;
  createPayout(data: InsertPayout): Promise<Payout>;
}

export class DatabaseStorage implements IStorage {
  // Advertisers
  async getAdvertisers(): Promise<Advertiser[]> {
    return await db.select().from(schema.advertisers);
  }

  async getAdvertiser(id: string): Promise<Advertiser | undefined> {
    const [advertiser] = await db
      .select()
      .from(schema.advertisers)
      .where(eq(schema.advertisers.id, id));
    return advertiser;
  }

  async createAdvertiser(data: InsertAdvertiser): Promise<Advertiser> {
    const [advertiser] = await db
      .insert(schema.advertisers)
      .values(data)
      .returning();
    return advertiser;
  }

  async updateAdvertiser(id: string, data: Partial<InsertAdvertiser>): Promise<Advertiser | undefined> {
    const [advertiser] = await db
      .update(schema.advertisers)
      .set(data)
      .where(eq(schema.advertisers.id, id))
      .returning();
    return advertiser;
  }

  // Locations
  async getLocations(): Promise<Location[]> {
    return await db.select().from(schema.locations);
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db
      .select()
      .from(schema.locations)
      .where(eq(schema.locations.id, id));
    return location;
  }

  async createLocation(data: InsertLocation): Promise<Location> {
    const [location] = await db
      .insert(schema.locations)
      .values(data)
      .returning();
    return location;
  }

  async updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined> {
    const [location] = await db
      .update(schema.locations)
      .set(data)
      .where(eq(schema.locations.id, id))
      .returning();
    return location;
  }

  // Screens
  async getScreens(): Promise<Screen[]> {
    return await db.select().from(schema.screens);
  }

  async getScreen(id: string): Promise<Screen | undefined> {
    const [screen] = await db
      .select()
      .from(schema.screens)
      .where(eq(schema.screens.id, id));
    return screen;
  }

  async createScreen(data: InsertScreen): Promise<Screen> {
    const [screen] = await db
      .insert(schema.screens)
      .values(data)
      .returning();
    return screen;
  }

  async updateScreen(id: string, data: Partial<Screen>): Promise<Screen | undefined> {
    const [screen] = await db
      .update(schema.screens)
      .set(data)
      .where(eq(schema.screens.id, id))
      .returning();
    return screen;
  }

  // Campaigns
  async getCampaigns(): Promise<Campaign[]> {
    return await db.select().from(schema.campaigns);
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, id));
    return campaign;
  }

  async createCampaign(data: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db
      .insert(schema.campaigns)
      .values(data)
      .returning();
    return campaign;
  }

  // Placements
  async getPlacements(): Promise<Placement[]> {
    return await db.select().from(schema.placements);
  }

  async getPlacement(id: string): Promise<Placement | undefined> {
    const [placement] = await db
      .select()
      .from(schema.placements)
      .where(eq(schema.placements.id, id));
    return placement;
  }

  async createPlacement(data: InsertPlacement): Promise<Placement> {
    const [placement] = await db
      .insert(schema.placements)
      .values(data)
      .returning();
    return placement;
  }

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return await db.select().from(schema.invoices);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id));
    return invoice;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db
      .insert(schema.invoices)
      .values(data)
      .returning();
    return invoice;
  }

  // Payouts
  async getPayouts(): Promise<Payout[]> {
    return await db.select().from(schema.payouts);
  }

  async getPayout(id: string): Promise<Payout | undefined> {
    const [payout] = await db
      .select()
      .from(schema.payouts)
      .where(eq(schema.payouts.id, id));
    return payout;
  }

  async createPayout(data: InsertPayout): Promise<Payout> {
    const [payout] = await db
      .insert(schema.payouts)
      .values(data)
      .returning();
    return payout;
  }
}

export const storage = new DatabaseStorage();
