/**
 * Seed Data for Elevizion OS
 * Creates realistic test data for development and testing
 */

import { db } from "./db";
import * as schema from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // Clear existing data (in reverse order of dependencies)
  await db.delete(schema.snapshotPlacements);
  await db.delete(schema.scheduleSnapshots);
  await db.delete(schema.payments);
  await db.delete(schema.carryOvers);
  await db.delete(schema.payouts);
  await db.delete(schema.invoices);
  await db.delete(schema.placements);
  await db.delete(schema.contracts);
  await db.delete(schema.packagePlans);
  await db.delete(schema.screens);
  await db.delete(schema.locations);
  await db.delete(schema.advertisers);
  await db.delete(schema.jobRuns);
  await db.delete(schema.jobs);
  await db.delete(schema.integrationLogs);
  await db.delete(schema.auditLogs);

  // ============================================================================
  // ADVERTISERS
  // ============================================================================

  const [advertiser1, advertiser2, advertiser3] = await db
    .insert(schema.advertisers)
    .values([
      {
        companyName: "TechCorp Solutions",
        contactName: "John Doe",
        email: "john@techcorp.com",
        phone: "+31 20 123 4567",
        vatNumber: "NL123456789B01",
        address: "Herengracht 100, 1015 BS Amsterdam",
        status: "active",
      },
      {
        companyName: "Fresh Bakery",
        contactName: "Sarah Smith",
        email: "sarah@freshbakery.nl",
        phone: "+31 20 234 5678",
        vatNumber: "NL987654321B01",
        address: "Prinsengracht 200, 1016 HG Amsterdam",
        status: "active",
      },
      {
        companyName: "City Gym",
        contactName: "Mike Johnson",
        email: "mike@citygym.nl",
        phone: "+31 20 345 6789",
        vatNumber: "NL456789123B01",
        address: "Damrak 50, 1012 LM Amsterdam",
        status: "paused",
      },
    ])
    .returning();

  console.log("Created advertisers:", advertiser1.companyName, advertiser2.companyName, advertiser3.companyName);

  // ============================================================================
  // LOCATIONS (Partner businesses)
  // ============================================================================

  const [location1, location2, location3] = await db
    .insert(schema.locations)
    .values([
      {
        name: "Central Mall",
        address: "Kalverstraat 1, 1012 NX Amsterdam",
        contactName: "Alice Manager",
        email: "alice@centralmall.nl",
        phone: "+31 20 456 7890",
        revenueSharePercent: "10.00",
        minimumPayoutAmount: "25.00",
        bankAccountIban: "NL91ABNA0417164300",
        status: "active",
      },
      {
        name: "Airport Terminal 1",
        address: "Evert van de Beekstraat 202, 1118 CP Schiphol",
        contactName: "Bob Operator",
        email: "bob@schiphol.nl",
        phone: "+31 20 567 8901",
        revenueSharePercent: "15.00",
        minimumPayoutAmount: "50.00",
        bankAccountIban: "NL91INGB0001234567",
        status: "active",
      },
      {
        name: "Train Station Central",
        address: "Stationsplein 1, 1012 AB Amsterdam",
        contactName: "Carol Station",
        email: "carol@ns.nl",
        phone: "+31 20 678 9012",
        revenueSharePercent: "12.00",
        minimumPayoutAmount: "30.00",
        status: "active",
      },
    ])
    .returning();

  console.log("Created locations:", location1.name, location2.name, location3.name);

  // ============================================================================
  // SCREENS
  // ============================================================================

  const [screen1, screen2, screen3, screen4, screen5] = await db
    .insert(schema.screens)
    .values([
      {
        locationId: location1.id,
        name: "Mall Entrance Lobby",
        yodeckPlayerId: "yd_player_001",
        yodeckPlayerName: "Mall-Lobby-1",
        resolution: "1920x1080",
        orientation: "landscape",
        status: "online",
        lastSeenAt: new Date(),
        isActive: true,
      },
      {
        locationId: location1.id,
        name: "Food Court Main",
        yodeckPlayerId: "yd_player_002",
        yodeckPlayerName: "Mall-FoodCourt-1",
        resolution: "1920x1080",
        orientation: "landscape",
        status: "online",
        lastSeenAt: new Date(),
        isActive: true,
      },
      {
        locationId: location2.id,
        name: "Gate A5 Departure",
        yodeckPlayerId: "yd_player_003",
        yodeckPlayerName: "Airport-GateA5",
        resolution: "3840x2160",
        orientation: "portrait",
        status: "online",
        lastSeenAt: new Date(),
        isActive: true,
      },
      {
        locationId: location2.id,
        name: "Arrivals Hall",
        yodeckPlayerId: "yd_player_004",
        yodeckPlayerName: "Airport-Arrivals",
        resolution: "1920x1080",
        orientation: "landscape",
        status: "offline",
        lastSeenAt: new Date(Date.now() - 86400000),
        isActive: true,
      },
      {
        locationId: location3.id,
        name: "Main Platform Display",
        yodeckPlayerId: "yd_player_005",
        yodeckPlayerName: "Station-Platform1",
        resolution: "1920x1080",
        orientation: "landscape",
        status: "online",
        lastSeenAt: new Date(),
        isActive: true,
      },
    ])
    .returning();

  console.log("Created screens:", screen1.name, screen2.name, screen3.name, screen4.name, screen5.name);

  // ============================================================================
  // PACKAGE PLANS
  // ============================================================================

  const [planBasic, planPremium, planNetwork] = await db
    .insert(schema.packagePlans)
    .values([
      {
        name: "Basic",
        description: "Single screen placement, 10 seconds per loop",
        baseMonthlyPriceExVat: "250.00",
        defaultSecondsPerLoop: 10,
        defaultPlaysPerHour: 6,
        isActive: true,
      },
      {
        name: "Premium",
        description: "Multiple screens, 15 seconds per loop, priority placement",
        baseMonthlyPriceExVat: "500.00",
        defaultSecondsPerLoop: 15,
        defaultPlaysPerHour: 10,
        isActive: true,
      },
      {
        name: "Full Network",
        description: "All screens across all locations, maximum exposure",
        baseMonthlyPriceExVat: "1500.00",
        defaultSecondsPerLoop: 20,
        defaultPlaysPerHour: 12,
        isActive: true,
      },
    ])
    .returning();

  console.log("Created package plans:", planBasic.name, planPremium.name, planNetwork.name);

  // ============================================================================
  // CONTRACTS
  // ============================================================================

  const [contract1, contract2, contract3] = await db
    .insert(schema.contracts)
    .values([
      {
        advertiserId: advertiser1.id,
        packagePlanId: planPremium.id,
        name: "TechCorp Q1 2025",
        startDate: "2025-01-01",
        endDate: "2025-03-31",
        monthlyPriceExVat: "500.00",
        vatPercent: "21.00",
        billingCycle: "monthly",
        status: "active",
      },
      {
        advertiserId: advertiser2.id,
        packagePlanId: planBasic.id,
        name: "Fresh Bakery 2025",
        startDate: "2025-01-01",
        monthlyPriceExVat: "250.00",
        vatPercent: "21.00",
        billingCycle: "monthly",
        status: "active",
      },
      {
        advertiserId: advertiser3.id,
        packagePlanId: planBasic.id,
        name: "City Gym Promo",
        startDate: "2024-10-01",
        endDate: "2024-12-31",
        monthlyPriceExVat: "300.00",
        vatPercent: "21.00",
        billingCycle: "monthly",
        status: "ended",
      },
    ])
    .returning();

  console.log("Created contracts:", contract1.name, contract2.name, contract3.name);

  // ============================================================================
  // PLACEMENTS
  // ============================================================================

  await db
    .insert(schema.placements)
    .values([
      // TechCorp - Premium package (multiple screens)
      {
        contractId: contract1.id,
        screenId: screen1.id,
        source: "manual",
        secondsPerLoop: 15,
        playsPerHour: 10,
        isActive: true,
      },
      {
        contractId: contract1.id,
        screenId: screen2.id,
        source: "manual",
        secondsPerLoop: 15,
        playsPerHour: 10,
        isActive: true,
      },
      {
        contractId: contract1.id,
        screenId: screen3.id,
        source: "manual",
        secondsPerLoop: 15,
        playsPerHour: 10,
        isActive: true,
      },
      // Fresh Bakery - Basic package (single screen)
      {
        contractId: contract2.id,
        screenId: screen1.id,
        source: "manual",
        secondsPerLoop: 10,
        playsPerHour: 6,
        isActive: true,
      },
    ]);

  console.log("Created placements");

  // ============================================================================
  // SAMPLE INVOICE (from previous month)
  // ============================================================================

  await db
    .insert(schema.invoices)
    .values([
      {
        advertiserId: advertiser1.id,
        contractId: contract1.id,
        invoiceNumber: "INV-2024-0001",
        periodStart: "2024-11-01",
        periodEnd: "2024-11-30",
        amountExVat: "500.00",
        vatAmount: "105.00",
        amountIncVat: "605.00",
        status: "paid",
        dueDate: "2024-12-15",
        paidAt: new Date("2024-12-10"),
      },
      {
        advertiserId: advertiser2.id,
        contractId: contract2.id,
        invoiceNumber: "INV-2024-0002",
        periodStart: "2024-11-01",
        periodEnd: "2024-11-30",
        amountExVat: "250.00",
        vatAmount: "52.50",
        amountIncVat: "302.50",
        status: "sent",
        dueDate: "2024-12-15",
      },
    ]);

  console.log("Created invoices");

  // ============================================================================
  // BACKGROUND JOBS
  // ============================================================================

  await db
    .insert(schema.jobs)
    .values([
      {
        name: "yodeck_sync",
        type: "sync",
        schedule: "0 2 * * *",
        isEnabled: true,
      },
      {
        name: "moneybird_sync",
        type: "sync",
        schedule: "0 3 * * *",
        isEnabled: true,
      },
      {
        name: "monthly_snapshot",
        type: "generate",
        schedule: "0 0 1 * *",
        isEnabled: true,
      },
      {
        name: "monthly_invoices",
        type: "invoice",
        schedule: "0 6 1 * *",
        isEnabled: true,
      },
      {
        name: "overdue_check",
        type: "invoice",
        schedule: "0 9 * * *",
        isEnabled: true,
      },
    ]);

  console.log("Created background jobs");

  console.log("Seed completed successfully!");
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
