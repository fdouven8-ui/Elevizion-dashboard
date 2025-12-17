/**
 * Storage Layer - Database operations for Elevizion OS
 * All database access goes through this service layer
 */

import { db } from "./db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  Advertiser, InsertAdvertiser,
  Location, InsertLocation,
  Screen, InsertScreen,
  PackagePlan, InsertPackagePlan,
  Contract, InsertContract,
  Placement, InsertPlacement,
  ScheduleSnapshot, InsertScheduleSnapshot,
  SnapshotPlacement, InsertSnapshotPlacement,
  Invoice, InsertInvoice,
  Payment, InsertPayment,
  Payout, InsertPayout,
  CarryOver, InsertCarryOver,
  IntegrationLog, InsertIntegrationLog,
  Job, InsertJob,
  JobRun, InsertJobRun,
  AuditLog, InsertAuditLog,
} from "@shared/schema";

export interface IStorage {
  // Advertisers
  getAdvertisers(): Promise<Advertiser[]>;
  getAdvertiser(id: string): Promise<Advertiser | undefined>;
  createAdvertiser(data: InsertAdvertiser): Promise<Advertiser>;
  updateAdvertiser(id: string, data: Partial<InsertAdvertiser>): Promise<Advertiser | undefined>;
  deleteAdvertiser(id: string): Promise<boolean>;

  // Locations
  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(data: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;

  // Screens
  getScreens(): Promise<Screen[]>;
  getScreensByLocation(locationId: string): Promise<Screen[]>;
  getScreen(id: string): Promise<Screen | undefined>;
  createScreen(data: InsertScreen): Promise<Screen>;
  updateScreen(id: string, data: Partial<Screen>): Promise<Screen | undefined>;
  deleteScreen(id: string): Promise<boolean>;

  // Package Plans
  getPackagePlans(): Promise<PackagePlan[]>;
  getPackagePlan(id: string): Promise<PackagePlan | undefined>;
  createPackagePlan(data: InsertPackagePlan): Promise<PackagePlan>;
  updatePackagePlan(id: string, data: Partial<InsertPackagePlan>): Promise<PackagePlan | undefined>;

  // Contracts
  getContracts(): Promise<Contract[]>;
  getContract(id: string): Promise<Contract | undefined>;
  getActiveContracts(): Promise<Contract[]>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(id: string, data: Partial<InsertContract>): Promise<Contract | undefined>;

  // Placements
  getPlacements(): Promise<Placement[]>;
  getPlacementsByContract(contractId: string): Promise<Placement[]>;
  getPlacementsByScreen(screenId: string): Promise<Placement[]>;
  createPlacement(data: InsertPlacement): Promise<Placement>;
  updatePlacement(id: string, data: Partial<InsertPlacement>): Promise<Placement | undefined>;
  deletePlacement(id: string): Promise<boolean>;

  // Schedule Snapshots
  getScheduleSnapshots(): Promise<ScheduleSnapshot[]>;
  getScheduleSnapshot(id: string): Promise<ScheduleSnapshot | undefined>;
  getSnapshotByPeriod(year: number, month: number): Promise<ScheduleSnapshot | undefined>;
  createScheduleSnapshot(data: InsertScheduleSnapshot): Promise<ScheduleSnapshot>;
  updateScheduleSnapshot(id: string, data: Partial<ScheduleSnapshot>): Promise<ScheduleSnapshot | undefined>;
  getSnapshotPlacements(snapshotId: string): Promise<SnapshotPlacement[]>;
  createSnapshotPlacement(data: InsertSnapshotPlacement): Promise<SnapshotPlacement>;

  // Invoices
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoicesByAdvertiser(advertiserId: string): Promise<Invoice[]>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined>;

  // Payments
  getPayments(): Promise<Payment[]>;
  getPaymentsByInvoice(invoiceId: string): Promise<Payment[]>;
  createPayment(data: InsertPayment): Promise<Payment>;

  // Payouts
  getPayouts(): Promise<Payout[]>;
  getPayout(id: string): Promise<Payout | undefined>;
  getPayoutsByLocation(locationId: string): Promise<Payout[]>;
  createPayout(data: InsertPayout): Promise<Payout>;
  updatePayout(id: string, data: Partial<Payout>): Promise<Payout | undefined>;

  // CarryOvers
  getCarryOversByLocation(locationId: string): Promise<CarryOver[]>;
  getPendingCarryOver(locationId: string): Promise<CarryOver | undefined>;
  createCarryOver(data: InsertCarryOver): Promise<CarryOver>;
  updateCarryOver(id: string, data: Partial<CarryOver>): Promise<CarryOver | undefined>;

  // Integration Logs
  createIntegrationLog(data: InsertIntegrationLog): Promise<IntegrationLog>;
  getRecentIntegrationLogs(limit?: number): Promise<IntegrationLog[]>;

  // Jobs
  getJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  getJobByName(name: string): Promise<Job | undefined>;
  createJob(data: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<Job>): Promise<Job | undefined>;
  createJobRun(data: InsertJobRun): Promise<JobRun>;
  updateJobRun(id: string, data: Partial<JobRun>): Promise<JobRun | undefined>;
  getRecentJobRuns(jobId: string, limit?: number): Promise<JobRun[]>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  // ============================================================================
  // ADVERTISERS
  // ============================================================================
  
  async getAdvertisers(): Promise<Advertiser[]> {
    return await db.select().from(schema.advertisers).orderBy(desc(schema.advertisers.createdAt));
  }

  async getAdvertiser(id: string): Promise<Advertiser | undefined> {
    const [advertiser] = await db.select().from(schema.advertisers).where(eq(schema.advertisers.id, id));
    return advertiser;
  }

  async createAdvertiser(data: InsertAdvertiser): Promise<Advertiser> {
    const [advertiser] = await db.insert(schema.advertisers).values(data).returning();
    return advertiser;
  }

  async updateAdvertiser(id: string, data: Partial<InsertAdvertiser>): Promise<Advertiser | undefined> {
    const [advertiser] = await db.update(schema.advertisers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.advertisers.id, id))
      .returning();
    return advertiser;
  }

  async deleteAdvertiser(id: string): Promise<boolean> {
    const result = await db.delete(schema.advertisers).where(eq(schema.advertisers.id, id));
    return true;
  }

  // ============================================================================
  // LOCATIONS
  // ============================================================================

  async getLocations(): Promise<Location[]> {
    return await db.select().from(schema.locations).orderBy(desc(schema.locations.createdAt));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(schema.locations).where(eq(schema.locations.id, id));
    return location;
  }

  async createLocation(data: InsertLocation): Promise<Location> {
    const [location] = await db.insert(schema.locations).values(data).returning();
    return location;
  }

  async updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined> {
    const [location] = await db.update(schema.locations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.locations.id, id))
      .returning();
    return location;
  }

  async deleteLocation(id: string): Promise<boolean> {
    await db.delete(schema.locations).where(eq(schema.locations.id, id));
    return true;
  }

  // ============================================================================
  // SCREENS
  // ============================================================================

  async getScreens(): Promise<Screen[]> {
    return await db.select().from(schema.screens).orderBy(desc(schema.screens.createdAt));
  }

  async getScreensByLocation(locationId: string): Promise<Screen[]> {
    return await db.select().from(schema.screens).where(eq(schema.screens.locationId, locationId));
  }

  async getScreen(id: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(schema.screens).where(eq(schema.screens.id, id));
    return screen;
  }

  async createScreen(data: InsertScreen): Promise<Screen> {
    const [screen] = await db.insert(schema.screens).values(data).returning();
    return screen;
  }

  async updateScreen(id: string, data: Partial<Screen>): Promise<Screen | undefined> {
    const [screen] = await db.update(schema.screens)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.screens.id, id))
      .returning();
    return screen;
  }

  async deleteScreen(id: string): Promise<boolean> {
    await db.delete(schema.screens).where(eq(schema.screens.id, id));
    return true;
  }

  // ============================================================================
  // PACKAGE PLANS
  // ============================================================================

  async getPackagePlans(): Promise<PackagePlan[]> {
    return await db.select().from(schema.packagePlans).orderBy(schema.packagePlans.name);
  }

  async getPackagePlan(id: string): Promise<PackagePlan | undefined> {
    const [plan] = await db.select().from(schema.packagePlans).where(eq(schema.packagePlans.id, id));
    return plan;
  }

  async createPackagePlan(data: InsertPackagePlan): Promise<PackagePlan> {
    const [plan] = await db.insert(schema.packagePlans).values(data).returning();
    return plan;
  }

  async updatePackagePlan(id: string, data: Partial<InsertPackagePlan>): Promise<PackagePlan | undefined> {
    const [plan] = await db.update(schema.packagePlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.packagePlans.id, id))
      .returning();
    return plan;
  }

  // ============================================================================
  // CONTRACTS
  // ============================================================================

  async getContracts(): Promise<Contract[]> {
    return await db.select().from(schema.contracts).orderBy(desc(schema.contracts.createdAt));
  }

  async getContract(id: string): Promise<Contract | undefined> {
    const [contract] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
    return contract;
  }

  async getActiveContracts(): Promise<Contract[]> {
    return await db.select().from(schema.contracts).where(eq(schema.contracts.status, "active"));
  }

  async createContract(data: InsertContract): Promise<Contract> {
    const [contract] = await db.insert(schema.contracts).values(data).returning();
    return contract;
  }

  async updateContract(id: string, data: Partial<InsertContract>): Promise<Contract | undefined> {
    const [contract] = await db.update(schema.contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.contracts.id, id))
      .returning();
    return contract;
  }

  // ============================================================================
  // PLACEMENTS
  // ============================================================================

  async getPlacements(): Promise<Placement[]> {
    return await db.select().from(schema.placements).orderBy(desc(schema.placements.createdAt));
  }

  async getPlacementsByContract(contractId: string): Promise<Placement[]> {
    return await db.select().from(schema.placements).where(eq(schema.placements.contractId, contractId));
  }

  async getPlacementsByScreen(screenId: string): Promise<Placement[]> {
    return await db.select().from(schema.placements).where(eq(schema.placements.screenId, screenId));
  }

  async createPlacement(data: InsertPlacement): Promise<Placement> {
    const [placement] = await db.insert(schema.placements).values(data).returning();
    return placement;
  }

  async updatePlacement(id: string, data: Partial<InsertPlacement>): Promise<Placement | undefined> {
    const [placement] = await db.update(schema.placements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.placements.id, id))
      .returning();
    return placement;
  }

  async deletePlacement(id: string): Promise<boolean> {
    await db.delete(schema.placements).where(eq(schema.placements.id, id));
    return true;
  }

  // ============================================================================
  // SCHEDULE SNAPSHOTS
  // ============================================================================

  async getScheduleSnapshots(): Promise<ScheduleSnapshot[]> {
    return await db.select().from(schema.scheduleSnapshots).orderBy(desc(schema.scheduleSnapshots.generatedAt));
  }

  async getScheduleSnapshot(id: string): Promise<ScheduleSnapshot | undefined> {
    const [snapshot] = await db.select().from(schema.scheduleSnapshots).where(eq(schema.scheduleSnapshots.id, id));
    return snapshot;
  }

  async getSnapshotByPeriod(year: number, month: number): Promise<ScheduleSnapshot | undefined> {
    const [snapshot] = await db.select().from(schema.scheduleSnapshots)
      .where(and(
        eq(schema.scheduleSnapshots.periodYear, year),
        eq(schema.scheduleSnapshots.periodMonth, month)
      ));
    return snapshot;
  }

  async createScheduleSnapshot(data: InsertScheduleSnapshot): Promise<ScheduleSnapshot> {
    const [snapshot] = await db.insert(schema.scheduleSnapshots).values(data).returning();
    return snapshot;
  }

  async updateScheduleSnapshot(id: string, data: Partial<ScheduleSnapshot>): Promise<ScheduleSnapshot | undefined> {
    const [snapshot] = await db.update(schema.scheduleSnapshots)
      .set(data)
      .where(eq(schema.scheduleSnapshots.id, id))
      .returning();
    return snapshot;
  }

  async getSnapshotPlacements(snapshotId: string): Promise<SnapshotPlacement[]> {
    return await db.select().from(schema.snapshotPlacements)
      .where(eq(schema.snapshotPlacements.snapshotId, snapshotId));
  }

  async createSnapshotPlacement(data: InsertSnapshotPlacement): Promise<SnapshotPlacement> {
    const [placement] = await db.insert(schema.snapshotPlacements).values(data).returning();
    return placement;
  }

  // ============================================================================
  // INVOICES
  // ============================================================================

  async getInvoices(): Promise<Invoice[]> {
    return await db.select().from(schema.invoices).orderBy(desc(schema.invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
    return invoice;
  }

  async getInvoicesByAdvertiser(advertiserId: string): Promise<Invoice[]> {
    return await db.select().from(schema.invoices).where(eq(schema.invoices.advertiserId, advertiserId));
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(schema.invoices).values(data).returning();
    return invoice;
  }

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined> {
    const [invoice] = await db.update(schema.invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.invoices.id, id))
      .returning();
    return invoice;
  }

  // ============================================================================
  // PAYMENTS
  // ============================================================================

  async getPayments(): Promise<Payment[]> {
    return await db.select().from(schema.payments).orderBy(desc(schema.payments.createdAt));
  }

  async getPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
    return await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, invoiceId));
  }

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(schema.payments).values(data).returning();
    return payment;
  }

  // ============================================================================
  // PAYOUTS
  // ============================================================================

  async getPayouts(): Promise<Payout[]> {
    return await db.select().from(schema.payouts).orderBy(desc(schema.payouts.createdAt));
  }

  async getPayout(id: string): Promise<Payout | undefined> {
    const [payout] = await db.select().from(schema.payouts).where(eq(schema.payouts.id, id));
    return payout;
  }

  async getPayoutsByLocation(locationId: string): Promise<Payout[]> {
    return await db.select().from(schema.payouts).where(eq(schema.payouts.locationId, locationId));
  }

  async createPayout(data: InsertPayout): Promise<Payout> {
    const [payout] = await db.insert(schema.payouts).values(data).returning();
    return payout;
  }

  async updatePayout(id: string, data: Partial<Payout>): Promise<Payout | undefined> {
    const [payout] = await db.update(schema.payouts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.payouts.id, id))
      .returning();
    return payout;
  }

  // ============================================================================
  // CARRY OVERS
  // ============================================================================

  async getCarryOversByLocation(locationId: string): Promise<CarryOver[]> {
    return await db.select().from(schema.carryOvers).where(eq(schema.carryOvers.locationId, locationId));
  }

  async getPendingCarryOver(locationId: string): Promise<CarryOver | undefined> {
    const [carryOver] = await db.select().from(schema.carryOvers)
      .where(and(
        eq(schema.carryOvers.locationId, locationId),
        eq(schema.carryOvers.status, "pending")
      ));
    return carryOver;
  }

  async createCarryOver(data: InsertCarryOver): Promise<CarryOver> {
    const [carryOver] = await db.insert(schema.carryOvers).values(data).returning();
    return carryOver;
  }

  async updateCarryOver(id: string, data: Partial<CarryOver>): Promise<CarryOver | undefined> {
    const [carryOver] = await db.update(schema.carryOvers)
      .set(data)
      .where(eq(schema.carryOvers.id, id))
      .returning();
    return carryOver;
  }

  // ============================================================================
  // INTEGRATION LOGS
  // ============================================================================

  async createIntegrationLog(data: InsertIntegrationLog): Promise<IntegrationLog> {
    const [log] = await db.insert(schema.integrationLogs).values(data).returning();
    return log;
  }

  async getRecentIntegrationLogs(limit: number = 50): Promise<IntegrationLog[]> {
    return await db.select().from(schema.integrationLogs)
      .orderBy(desc(schema.integrationLogs.createdAt))
      .limit(limit);
  }

  // ============================================================================
  // JOBS
  // ============================================================================

  async getJobs(): Promise<Job[]> {
    return await db.select().from(schema.jobs).orderBy(schema.jobs.name);
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    return job;
  }

  async getJobByName(name: string): Promise<Job | undefined> {
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.name, name));
    return job;
  }

  async createJob(data: InsertJob): Promise<Job> {
    const [job] = await db.insert(schema.jobs).values(data).returning();
    return job;
  }

  async updateJob(id: string, data: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db.update(schema.jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.jobs.id, id))
      .returning();
    return job;
  }

  async createJobRun(data: InsertJobRun): Promise<JobRun> {
    const [run] = await db.insert(schema.jobRuns).values(data).returning();
    return run;
  }

  async updateJobRun(id: string, data: Partial<JobRun>): Promise<JobRun | undefined> {
    const [run] = await db.update(schema.jobRuns)
      .set(data)
      .where(eq(schema.jobRuns.id, id))
      .returning();
    return run;
  }

  async getRecentJobRuns(jobId: string, limit: number = 10): Promise<JobRun[]> {
    return await db.select().from(schema.jobRuns)
      .where(eq(schema.jobRuns.jobId, jobId))
      .orderBy(desc(schema.jobRuns.startedAt))
      .limit(limit);
  }

  // ============================================================================
  // AUDIT LOGS
  // ============================================================================

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(schema.auditLogs).values(data).returning();
    return log;
  }

  async getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]> {
    if (entityType && entityId) {
      return await db.select().from(schema.auditLogs)
        .where(and(
          eq(schema.auditLogs.entityType, entityType),
          eq(schema.auditLogs.entityId, entityId)
        ))
        .orderBy(desc(schema.auditLogs.createdAt));
    }
    return await db.select().from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100);
  }
}

export const storage = new DatabaseStorage();
