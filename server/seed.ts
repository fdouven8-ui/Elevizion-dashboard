import { db } from "./db";
import * as schema from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Seed Advertisers
  const advertisers = await db.insert(schema.advertisers).values([
    {
      companyName: "TechCorp Solutions",
      contactName: "John Doe",
      email: "john@techcorp.com",
      phone: "+1 555 0101",
      status: "active",
      monthlyPriceExVat: "500.00",
    },
    {
      companyName: "Fresh Bakery",
      contactName: "Sarah Smith",
      email: "sarah@bakery.com",
      phone: "+1 555 0102",
      status: "active",
      monthlyPriceExVat: "250.00",
    },
    {
      companyName: "City Gym",
      contactName: "Mike Tyson",
      email: "mike@citygym.com",
      phone: "+1 555 0103",
      status: "paused",
      monthlyPriceExVat: "300.00",
    },
  ]).returning();

  // Seed Locations
  const locations = await db.insert(schema.locations).values([
    {
      name: "Central Mall",
      address: "123 Main St, Cityville",
      contactName: "Alice Manager",
      email: "alice@mall.com",
      phone: "+1 555 1001",
      revenueSharePercent: 10,
    },
    {
      name: "Airport Terminal 1",
      address: "456 Sky Rd, FlightCity",
      contactName: "Bob Operator",
      email: "bob@airport.com",
      phone: "+1 555 1002",
      revenueSharePercent: 15,
    },
  ]).returning();

  // Seed Screens
  const screens = await db.insert(schema.screens).values([
    {
      locationId: locations[0].id,
      name: "Mall Entrance Lobby",
      yodeckPlayerId: "yd_123",
      status: "online",
      lastSeenAt: new Date(),
    },
    {
      locationId: locations[0].id,
      name: "Food Court Main",
      yodeckPlayerId: "yd_124",
      status: "online",
      lastSeenAt: new Date(),
    },
    {
      locationId: locations[1].id,
      name: "Gate A5",
      yodeckPlayerId: "yd_125",
      status: "offline",
      lastSeenAt: new Date(Date.now() - 86400000),
    },
  ]).returning();

  // Seed Campaigns
  const campaigns = await db.insert(schema.campaigns).values([
    {
      advertiserId: advertisers[0].id,
      name: "Q4 Tech Promo",
      startDate: "2024-10-01",
      endDate: "2024-12-31",
      status: "active",
    },
    {
      advertiserId: advertisers[1].id,
      name: "Morning Bagel Special",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      status: "active",
    },
  ]).returning();

  // Seed Placements
  await db.insert(schema.placements).values([
    {
      campaignId: campaigns[0].id,
      screenId: screens[0].id,
      secondsPerLoop: 15,
      playsPerHour: 10,
    },
    {
      campaignId: campaigns[0].id,
      screenId: screens[1].id,
      secondsPerLoop: 15,
      playsPerHour: 10,
    },
    {
      campaignId: campaigns[1].id,
      screenId: screens[0].id,
      secondsPerLoop: 10,
      playsPerHour: 6,
    },
  ]);

  // Seed Invoices
  await db.insert(schema.invoices).values([
    {
      advertiserId: advertisers[0].id,
      periodStart: "2024-11-01",
      periodEnd: "2024-11-30",
      amountExVat: "500.00",
      amountIncVat: "605.00",
      status: "paid",
      moneybirdInvoiceId: "mb_001",
    },
    {
      advertiserId: advertisers[1].id,
      periodStart: "2024-11-01",
      periodEnd: "2024-11-30",
      amountExVat: "250.00",
      amountIncVat: "302.50",
      status: "sent",
      moneybirdInvoiceId: "mb_002",
    },
  ]);

  console.log("✅ Database seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
