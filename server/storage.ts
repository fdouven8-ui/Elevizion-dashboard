/**
 * Storage Layer - Database operations for Elevizion OS
 * All database access goes through this service layer
 */

import { db } from "./db";
import { eq, and, gte, lte, lt, desc, sql, isNull, notInArray, ilike, or } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  Advertiser, InsertAdvertiser,
  Location, InsertLocation,
  Screen, InsertScreen,
  PackagePlan, InsertPackagePlan,
  Contract, InsertContract,
  ContractEvent, InsertContractEvent,
  ContractFile, InsertContractFile,
  Placement, InsertPlacement,
  ScheduleSnapshot, InsertScheduleSnapshot,
  SnapshotPlacement, InsertSnapshotPlacement,
  Invoice, InsertInvoice,
  Payment, InsertPayment,
  Payout, InsertPayout,
  CarryOver, InsertCarryOver,
  IntegrationLog, InsertIntegrationLog,
  IntegrationConfig, InsertIntegrationConfig,
  Job, InsertJob,
  JobRun, InsertJobRun,
  AuditLog, InsertAuditLog,
  OnboardingChecklist, InsertOnboardingChecklist,
  OnboardingTask, InsertOnboardingTask,
  Report, InsertReport,
  ReportMetric, InsertReportMetric,
  Incident, InsertIncident,
  AlertRule, InsertAlertRule,
  User, InsertUser,
  Webhook, InsertWebhook,
  WebhookDelivery, InsertWebhookDelivery,
  Creative, InsertCreative,
  CreativeVersion, InsertCreativeVersion,
  CreativeApproval, InsertCreativeApproval,
  Lead, InsertLead,
  LocationSurvey, InsertLocationSurvey,
  DigitalSignature, InsertDigitalSignature,
  SalesActivity, InsertSalesActivity,
  SurveyPhoto, InsertSurveyPhoto,
  SupplyItem, InsertSupplyItem,
  SurveySupply, InsertSurveySupply,
  Task, InsertTask,
  TaskAttachment, InsertTaskAttachment,
  Template, InsertTemplate,
  TemplateVersion, InsertTemplateVersion,
  YodeckCreative, InsertYodeckCreative,
  YodeckMediaLink, InsertYodeckMediaLink,
  ScreenContentItem, InsertScreenContentItem,
  MoneybirdContact, InsertMoneybirdContact,
  MoneybirdInvoice, InsertMoneybirdInvoice,
  MoneybirdPayment, InsertMoneybirdPayment,
  Site, InsertSite,
  SiteContactSnapshot, InsertSiteContactSnapshot,
  SiteYodeckSnapshot, InsertSiteYodeckSnapshot,
  MoneybirdContactCache, InsertMoneybirdContactCache,
  YodeckScreenCache, InsertYodeckScreenCache,
  SiteWithSnapshots,
  Entity, InsertEntity,
  SyncJob, InsertSyncJob,
  PortalToken, InsertPortalToken,
  EmailLog, InsertEmailLog,
  VerificationCode, InsertVerificationCode,
  OnboardingInviteToken, InsertOnboardingInviteToken,
  IntegrationOutbox, InsertIntegrationOutbox,
  LocationToken, InsertLocationToken,
  LocationOnboardingEvent, InsertLocationOnboardingEvent,
  CompanyProfile, InsertCompanyProfile,
  WaitlistRequest, InsertWaitlistRequest,
} from "@shared/schema";

// Lead query params for server-side filtering/pagination
export interface LeadQueryParams {
  q?: string;
  type?: string;
  status?: string;
  category?: string;
  onlyNew?: boolean;
  dateRange?: "7" | "30" | "all";
  sortBy?: "createdAt" | "companyName" | "status" | "handledAt" | "deletedAt";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  isHandled?: boolean;
  isDeleted?: boolean;
}

export interface LeadQueryResult {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  newCount: number;
}

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
  getLocationByCode(locationCode: string): Promise<Location | undefined>;
  createLocation(data: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;
  getNextLocationCode(): Promise<string>;

  // Location Onboarding Tokens
  createLocationToken(data: InsertLocationToken): Promise<LocationToken>;
  getLocationTokenByHash(tokenHash: string): Promise<LocationToken | undefined>;
  markLocationTokenUsed(id: string): Promise<void>;

  // Location Onboarding Events
  createLocationOnboardingEvent(data: InsertLocationOnboardingEvent): Promise<LocationOnboardingEvent>;
  getLocationOnboardingEvents(locationId: string): Promise<LocationOnboardingEvent[]>;

  // Screens
  getScreens(): Promise<Screen[]>;
  getScreensByLocation(locationId: string): Promise<Screen[]>;
  getScreen(id: string): Promise<Screen | undefined>;
  getScreenByScreenId(screenId: string): Promise<Screen | undefined>; // EVZ-### lookup
  getScreenByYodeckUuid(yodeckUuid: string): Promise<Screen | undefined>;
  getScreenByYodeckPlayerId(playerId: string): Promise<Screen | undefined>;
  getScreenStats(): Promise<{ total: number; online: number; offline: number }>;
  createScreen(data: InsertScreen): Promise<Screen>;
  updateScreen(id: string, data: Partial<Screen>): Promise<Screen | undefined>;
  updateScreenByYodeckUuid(yodeckUuid: string, data: Partial<Screen>): Promise<Screen | undefined>;
  deleteScreen(id: string): Promise<boolean>;

  // Package Plans
  getPackagePlans(): Promise<PackagePlan[]>;
  getPackagePlan(id: string): Promise<PackagePlan | undefined>;
  createPackagePlan(data: InsertPackagePlan): Promise<PackagePlan>;
  updatePackagePlan(id: string, data: Partial<InsertPackagePlan>): Promise<PackagePlan | undefined>;

  // Contracts
  getContracts(): Promise<Contract[]>;
  getContract(id: string): Promise<Contract | undefined>;
  getContractBySignatureToken(tokenHash: string): Promise<Contract | undefined>;
  getActiveContracts(): Promise<Contract[]>;
  getPendingSignatureContracts(): Promise<Contract[]>;
  getExpiredContracts(): Promise<Contract[]>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(id: string, data: Partial<Contract>): Promise<Contract | undefined>;
  
  // Contract Events
  getContractEvents(contractId: string): Promise<ContractEvent[]>;
  createContractEvent(data: InsertContractEvent): Promise<ContractEvent>;
  
  // Contract Files
  getContractFiles(contractId: string): Promise<ContractFile[]>;
  createContractFile(data: InsertContractFile): Promise<ContractFile>;
  
  // Onboarding
  getOnboardingChecklist(advertiserId: string): Promise<OnboardingChecklist | undefined>;
  createOnboardingChecklist(data: InsertOnboardingChecklist): Promise<OnboardingChecklist>;
  updateOnboardingChecklist(id: string, data: Partial<OnboardingChecklist>): Promise<OnboardingChecklist | undefined>;
  getOnboardingTasks(checklistId: string): Promise<OnboardingTask[]>;
  createOnboardingTask(data: InsertOnboardingTask): Promise<OnboardingTask>;
  updateOnboardingTask(id: string, data: Partial<OnboardingTask>): Promise<OnboardingTask | undefined>;
  
  // Reports
  getReports(): Promise<Report[]>;
  getReportsByAdvertiser(advertiserId: string): Promise<Report[]>;
  createReport(data: InsertReport): Promise<Report>;
  updateReport(id: string, data: Partial<Report>): Promise<Report | undefined>;
  
  // Incidents
  getIncidents(): Promise<Incident[]>;
  getOpenIncidents(): Promise<Incident[]>;
  createIncident(data: InsertIncident): Promise<Incident>;
  updateIncident(id: string, data: Partial<Incident>): Promise<Incident | undefined>;
  
  // Alert Rules
  getAlertRules(): Promise<AlertRule[]>;
  createAlertRule(data: InsertAlertRule): Promise<AlertRule>;
  updateAlertRule(id: string, data: Partial<AlertRule>): Promise<AlertRule | undefined>;
  
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  // Placements
  getPlacements(): Promise<Placement[]>;
  getPlacementsByContract(contractId: string): Promise<Placement[]>;
  getPlacementsByScreen(screenId: string): Promise<Placement[]>;
  createPlacement(data: InsertPlacement): Promise<Placement>;
  updatePlacement(id: string, data: Partial<InsertPlacement>): Promise<Placement | undefined>;
  deletePlacement(id: string): Promise<boolean>;
  listPlacements(): Promise<Placement[]>;
  getPlacementsWithoutContracts(): Promise<Placement[]>;
  getPlacementsWithoutCompetitorGroup(): Promise<Placement[]>;
  getLocationsWithoutExclusivityMode(): Promise<Location[]>;
  getLocationsWithoutYodeckPlaylist(): Promise<Location[]>;
  getLocationsWithoutRegionCode(): Promise<Location[]>;
  getLocationsWithoutCategories(): Promise<Location[]>;
  getStaleOnlineLocations(minutesThreshold: number): Promise<Location[]>;
  getLocationsWithoutCapacityConfig(): Promise<Location[]>;
  getOnlineLocationsWithoutPlaylist(): Promise<Location[]>;

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
  getAllPendingCarryOvers(): Promise<CarryOver[]>;
  createCarryOver(data: InsertCarryOver): Promise<CarryOver>;
  updateCarryOver(id: string, data: Partial<CarryOver>): Promise<CarryOver | undefined>;

  // Integration Logs
  createIntegrationLog(data: InsertIntegrationLog): Promise<IntegrationLog>;
  getRecentIntegrationLogs(limit?: number): Promise<IntegrationLog[]>;

  // Integration Configs
  getIntegrationConfigs(): Promise<IntegrationConfig[]>;
  getIntegrationConfig(service: string): Promise<IntegrationConfig | undefined>;
  upsertIntegrationConfig(service: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig>;
  updateIntegrationConfig(service: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined>;
  saveIntegrationCredentials(service: string, encryptedCreds: string, configuredKeys: Record<string, boolean>): Promise<IntegrationConfig>;
  deleteIntegrationCredentials(service: string): Promise<IntegrationConfig>;
  getIntegrationEncryptedCredentials(service: string): Promise<string | null>;

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

  // Webhooks
  getWebhooks(): Promise<Webhook[]>;
  getWebhook(id: string): Promise<Webhook | undefined>;
  createWebhook(data: InsertWebhook): Promise<Webhook>;
  updateWebhook(id: string, data: Partial<InsertWebhook>): Promise<Webhook | undefined>;
  deleteWebhook(id: string): Promise<boolean>;
  getWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]>;
  createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery>;

  // Creatives
  getCreatives(): Promise<Creative[]>;
  getCreative(id: string): Promise<Creative | undefined>;
  getCreativesWithHash(): Promise<Array<{ id: string; phash: string; advertiserId: string }>>;
  createCreative(data: InsertCreative): Promise<Creative>;
  updateCreative(id: string, data: Partial<InsertCreative>): Promise<Creative | undefined>;
  deleteCreative(id: string): Promise<boolean>;
  getCreativeVersions(creativeId: string): Promise<CreativeVersion[]>;
  createCreativeVersion(data: InsertCreativeVersion): Promise<CreativeVersion>;
  getCreativeApprovals(creativeId: string): Promise<CreativeApproval[]>;
  createCreativeApproval(data: InsertCreativeApproval): Promise<CreativeApproval>;

  // Sales & Acquisitie (Leads, Surveys, Signatures)
  getLeads(): Promise<Lead[]>;
  getLeadsPaginated(params: LeadQueryParams): Promise<LeadQueryResult>;
  getLead(id: string): Promise<Lead | undefined>;
  getLeadsByStatus(status: string): Promise<Lead[]>;
  getLeadsByType(type: string): Promise<Lead[]>;
  createLead(data: InsertLead): Promise<Lead>;
  updateLead(id: string, data: Partial<InsertLead>): Promise<Lead | undefined>;
  deleteLead(id: string): Promise<boolean>;

  getLocationSurveys(): Promise<LocationSurvey[]>;
  getLocationSurvey(id: string): Promise<LocationSurvey | undefined>;
  getLocationSurveysByLead(leadId: string): Promise<LocationSurvey[]>;
  createLocationSurvey(data: InsertLocationSurvey): Promise<LocationSurvey>;
  updateLocationSurvey(id: string, data: Partial<InsertLocationSurvey>): Promise<LocationSurvey | undefined>;

  getDigitalSignatures(documentType: string, documentId: string): Promise<DigitalSignature[]>;
  createDigitalSignature(data: InsertDigitalSignature): Promise<DigitalSignature>;

  getSalesActivities(leadId: string): Promise<SalesActivity[]>;
  createSalesActivity(data: InsertSalesActivity): Promise<SalesActivity>;

  // Survey Photos
  getSurveyPhotos(surveyId: string): Promise<SurveyPhoto[]>;
  createSurveyPhoto(data: InsertSurveyPhoto): Promise<SurveyPhoto>;
  deleteSurveyPhoto(id: string): Promise<boolean>;

  // Supply Items (catalog)
  getSupplyItems(): Promise<SupplyItem[]>;
  getSupplyItem(id: string): Promise<SupplyItem | undefined>;
  createSupplyItem(data: InsertSupplyItem): Promise<SupplyItem>;
  updateSupplyItem(id: string, data: Partial<InsertSupplyItem>): Promise<SupplyItem | undefined>;

  // Survey Supplies (per survey)
  getSurveySupplies(surveyId: string): Promise<SurveySupply[]>;
  createSurveySupply(data: InsertSurveySupply): Promise<SurveySupply>;
  updateSurveySupply(id: string, data: Partial<InsertSurveySupply>): Promise<SurveySupply | undefined>;
  deleteSurveySupply(id: string): Promise<boolean>;

  // Tasks
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  getTasksByAssignee(userId: string): Promise<Task[]>;
  getTasksByRole(role: string): Promise<Task[]>;
  getTasksBySurvey(surveyId: string): Promise<Task[]>;
  getOpenTasks(): Promise<Task[]>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;

  // Templates
  getTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  getTemplatesByCategory(category: string): Promise<Template[]>;
  createTemplate(data: InsertTemplate): Promise<Template>;
  updateTemplate(id: string, data: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;
  getTemplateVersions(templateId: string): Promise<TemplateVersion[]>;
  createTemplateVersion(data: InsertTemplateVersion): Promise<TemplateVersion>;
  restoreTemplateVersion(templateId: string, version: number): Promise<Template | undefined>;

  // Task Attachments
  getTaskAttachments(taskId: string): Promise<TaskAttachment[]>;
  createTaskAttachment(data: InsertTaskAttachment): Promise<TaskAttachment>;
  deleteTaskAttachment(id: string): Promise<boolean>;

  // Yodeck Creatives (media tracking)
  getYodeckCreatives(): Promise<YodeckCreative[]>;
  getYodeckCreative(id: string): Promise<YodeckCreative | undefined>;
  getYodeckCreativeByMediaId(yodeckMediaId: number): Promise<YodeckCreative | undefined>;
  getUnlinkedYodeckCreatives(): Promise<YodeckCreative[]>;
  upsertYodeckCreative(data: {
    yodeckMediaId: number;
    name: string;
    mediaType?: string | null;
    duration?: number | null;
    category: string;
    lastSeenAt?: Date | null;
  }): Promise<YodeckCreative>;
  updateYodeckCreative(id: string, data: Partial<YodeckCreative>): Promise<YodeckCreative | undefined>;
  getYodeckCreativeStats(): Promise<{ totalAds: number; unlinkedAds: number; totalNonAds: number }>;
  
  // Yodeck Media Links
  getYodeckMediaLinks(): Promise<YodeckMediaLink[]>;
  getYodeckMediaLink(yodeckMediaId: number): Promise<YodeckMediaLink | undefined>;
  upsertYodeckMediaLink(data: { yodeckMediaId: number; name: string; normalizedKey: string; mediaType?: string; category: string; duration?: number }): Promise<YodeckMediaLink>;
  updateYodeckMediaLink(yodeckMediaId: number, data: { advertiserId?: string | null; placementId?: string | null; updatedAt?: Date }): Promise<YodeckMediaLink | undefined>;
  getYodeckMediaLinkStats(): Promise<{ totalAds: number; unlinkedAds: number; totalNonAds: number }>;
  
  // Screen Content Items (inferred placements from Yodeck)
  getScreenContentItems(screenId: string): Promise<ScreenContentItem[]>;
  getAllScreenContentItems(): Promise<ScreenContentItem[]>;
  upsertScreenContentItem(data: { screenId: string; yodeckMediaId: number; name: string; mediaType?: string; category: string; duration?: number; isActive?: boolean }): Promise<ScreenContentItem>;
  markScreenContentItemsInactive(screenId: string, activeMediaIds: number[]): Promise<number>;
  getScreenContentItemStats(): Promise<{ totalAds: number; unlinkedAds: number; totalNonAds: number; activeScreensWithContent: number }>;

  // Sites (unified entity: 1 site = 1 screen location)
  getSites(): Promise<Site[]>;
  getSite(id: string): Promise<Site | undefined>;
  getSiteByCode(code: string): Promise<Site | undefined>;
  getSiteByYodeckScreenId(yodeckScreenId: string): Promise<Site | undefined>;
  getSiteWithSnapshots(id: string): Promise<SiteWithSnapshots | undefined>;
  getSitesWithSnapshots(): Promise<SiteWithSnapshots[]>;
  createSite(data: InsertSite): Promise<Site>;
  updateSite(id: string, data: Partial<InsertSite>): Promise<Site | undefined>;
  deleteSite(id: string): Promise<boolean>;
  linkSiteToMoneybird(siteId: string, moneybirdContactId: string): Promise<Site | undefined>;
  linkSiteToYodeck(siteId: string, yodeckScreenId: string): Promise<Site | undefined>;
  
  // Site Snapshots
  getSiteContactSnapshot(siteId: string): Promise<SiteContactSnapshot | undefined>;
  upsertSiteContactSnapshot(siteId: string, data: Omit<InsertSiteContactSnapshot, 'siteId'>): Promise<SiteContactSnapshot>;
  getSiteYodeckSnapshot(siteId: string): Promise<SiteYodeckSnapshot | undefined>;
  upsertSiteYodeckSnapshot(siteId: string, data: Omit<InsertSiteYodeckSnapshot, 'siteId'>): Promise<SiteYodeckSnapshot>;

  // Moneybird Contacts Cache
  getMoneybirdContactsCache(): Promise<MoneybirdContactCache[]>;
  getMoneybirdContactCache(moneybirdContactId: string): Promise<MoneybirdContactCache | undefined>;
  upsertMoneybirdContactCache(data: InsertMoneybirdContactCache): Promise<MoneybirdContactCache>;
  
  // Yodeck Screens Cache
  getYodeckScreensCache(): Promise<YodeckScreenCache[]>;
  getYodeckScreenCache(yodeckScreenId: string): Promise<YodeckScreenCache | undefined>;
  upsertYodeckScreenCache(data: InsertYodeckScreenCache): Promise<YodeckScreenCache>;
  
  // Entities (unified model for ADVERTISER + SCREEN)
  getEntities(): Promise<Entity[]>;
  getEntity(id: string): Promise<Entity | undefined>;
  getEntityByCode(entityCode: string): Promise<Entity | undefined>;
  createEntity(data: InsertEntity): Promise<Entity>;
  updateEntity(id: string, data: Partial<InsertEntity>): Promise<Entity | undefined>;
  deleteEntity(id: string): Promise<boolean>;
  
  // Sync Jobs
  getSyncJobs(entityId?: string): Promise<SyncJob[]>;
  getSyncJob(id: string): Promise<SyncJob | undefined>;
  createSyncJob(data: InsertSyncJob): Promise<SyncJob>;
  updateSyncJob(id: string, data: Partial<InsertSyncJob>): Promise<SyncJob | undefined>;
  
  // Portal Tokens
  createPortalToken(data: InsertPortalToken): Promise<PortalToken>;
  getPortalTokenByHash(tokenHash: string): Promise<PortalToken | undefined>;
  markPortalTokenUsed(id: string): Promise<PortalToken | undefined>;
  getPortalTokensForAdvertiser(advertiserId: string): Promise<PortalToken[]>;

  // Email Logs
  createEmailLog(data: InsertEmailLog): Promise<EmailLog>;
  updateEmailLog(id: string, data: Partial<EmailLog>): Promise<EmailLog | undefined>;
  getEmailLogs(limit?: number): Promise<EmailLog[]>;
  getEmailLogsWithFilters(filters: { limit?: number; status?: string; templateKey?: string; entityType?: string; entityId?: string; search?: string }): Promise<EmailLog[]>;
  getEmailLogById(id: string): Promise<EmailLog | undefined>;
  getEmailLogByTemplateAndEntity(templateKey: string, entityType: string, entityId: string): Promise<EmailLog | undefined>;

  // Verification Codes
  createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode>;
  getActiveVerificationCode(email: string): Promise<VerificationCode | undefined>;
  getRecentVerificationCodeCount(email: string, minutes: number): Promise<number>;
  incrementVerificationAttempts(id: string): Promise<VerificationCode | undefined>;
  markVerificationCodeUsed(id: string): Promise<VerificationCode | undefined>;

  // Onboarding Invite Tokens
  createOnboardingInviteToken(data: InsertOnboardingInviteToken): Promise<OnboardingInviteToken>;
  getOnboardingInviteTokenByHash(tokenHash: string): Promise<OnboardingInviteToken | undefined>;
  markOnboardingInviteTokenUsed(id: string): Promise<OnboardingInviteToken | undefined>;

  // Integration Outbox (SSOT Pattern)
  createOutboxJob(data: InsertIntegrationOutbox): Promise<IntegrationOutbox>;
  getOutboxJob(id: string): Promise<IntegrationOutbox | undefined>;
  getOutboxJobByIdempotencyKey(key: string): Promise<IntegrationOutbox | undefined>;
  getQueuedOutboxJobs(limit?: number): Promise<IntegrationOutbox[]>;
  getFailedOutboxJobs(provider?: string): Promise<IntegrationOutbox[]>;
  getOutboxJobsByEntity(entityType: string, entityId: string): Promise<IntegrationOutbox[]>;
  updateOutboxJob(id: string, data: Partial<IntegrationOutbox>): Promise<IntegrationOutbox | undefined>;
  getOutboxStats(): Promise<{ queued: number; processing: number; succeeded: number; failed: number; total: number }>;

  // Company Profile (singleton)
  getCompanyProfile(): Promise<CompanyProfile | undefined>;
  updateCompanyProfile(data: Partial<InsertCompanyProfile>): Promise<CompanyProfile | undefined>;

  // Waitlist Requests
  getWaitlistRequests(): Promise<WaitlistRequest[]>;
  getWaitlistRequest(id: string): Promise<WaitlistRequest | undefined>;
  getWaitlistRequestByStatus(status: string): Promise<WaitlistRequest[]>;
  getWaitingRequests(): Promise<WaitlistRequest[]>;
  getWaitlistRequestByTokenHash(tokenHash: string): Promise<WaitlistRequest | undefined>;
  getActiveWaitlistRequest(email: string, packageType: string): Promise<WaitlistRequest | undefined>;
  createWaitlistRequest(data: InsertWaitlistRequest): Promise<WaitlistRequest>;
  updateWaitlistRequest(id: string, data: Partial<WaitlistRequest>): Promise<WaitlistRequest | undefined>;
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

  async getLocationByCode(locationCode: string): Promise<Location | undefined> {
    const [location] = await db.select().from(schema.locations).where(eq(schema.locations.locationCode, locationCode));
    return location;
  }

  async getNextLocationCode(): Promise<string> {
    const locations = await db.select({ locationCode: schema.locations.locationCode })
      .from(schema.locations)
      .where(sql`${schema.locations.locationCode} IS NOT NULL`);
    
    let maxNum = 0;
    for (const loc of locations) {
      if (loc.locationCode) {
        const match = loc.locationCode.match(/EVZ-LOC-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    return `EVZ-LOC-${String(maxNum + 1).padStart(3, '0')}`;
  }

  // ============================================================================
  // LOCATION ONBOARDING TOKENS
  // ============================================================================

  async createLocationToken(data: InsertLocationToken): Promise<LocationToken> {
    const [token] = await db.insert(schema.locationTokens).values(data).returning();
    return token;
  }

  async getLocationTokenByHash(tokenHash: string): Promise<LocationToken | undefined> {
    const [token] = await db.select().from(schema.locationTokens).where(eq(schema.locationTokens.tokenHash, tokenHash));
    return token;
  }

  async markLocationTokenUsed(id: string): Promise<void> {
    await db.update(schema.locationTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.locationTokens.id, id));
  }

  // ============================================================================
  // LOCATION ONBOARDING EVENTS
  // ============================================================================

  async createLocationOnboardingEvent(data: InsertLocationOnboardingEvent): Promise<LocationOnboardingEvent> {
    const [event] = await db.insert(schema.locationOnboardingEvents).values(data).returning();
    return event;
  }

  async getLocationOnboardingEvents(locationId: string): Promise<LocationOnboardingEvent[]> {
    return await db.select()
      .from(schema.locationOnboardingEvents)
      .where(eq(schema.locationOnboardingEvents.locationId, locationId))
      .orderBy(desc(schema.locationOnboardingEvents.createdAt));
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

  async getScreenByYodeckUuid(yodeckUuid: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(schema.screens).where(eq(schema.screens.yodeckUuid, yodeckUuid));
    return screen;
  }

  async getScreenByScreenId(screenId: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(schema.screens).where(eq(schema.screens.screenId, screenId));
    return screen;
  }

  async getScreenByYodeckPlayerId(playerId: string): Promise<Screen | undefined> {
    const [screen] = await db.select().from(schema.screens).where(eq(schema.screens.yodeckPlayerId, playerId));
    return screen;
  }

  async getScreenStats(): Promise<{ total: number; online: number; offline: number }> {
    const screens = await db.select().from(schema.screens).where(eq(schema.screens.isActive, true));
    const total = screens.length;
    const online = screens.filter(s => s.status === "online").length;
    const offline = screens.filter(s => s.status === "offline").length;
    return { total, online, offline };
  }

  async updateScreenByYodeckUuid(yodeckUuid: string, data: Partial<Screen>): Promise<Screen | undefined> {
    const [screen] = await db.update(schema.screens)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.screens.yodeckUuid, yodeckUuid))
      .returning();
    return screen;
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

  async getContractBySignatureToken(tokenHash: string): Promise<Contract | undefined> {
    const [contract] = await db.select().from(schema.contracts)
      .where(eq(schema.contracts.signatureTokenHash, tokenHash));
    return contract;
  }

  async getPendingSignatureContracts(): Promise<Contract[]> {
    return await db.select().from(schema.contracts)
      .where(eq(schema.contracts.status, "sent"));
  }

  async getExpiredContracts(): Promise<Contract[]> {
    const now = new Date();
    return await db.select().from(schema.contracts)
      .where(and(
        eq(schema.contracts.status, "sent"),
        lte(schema.contracts.expiresAt, now)
      ));
  }

  async createContract(data: InsertContract): Promise<Contract> {
    const [contract] = await db.insert(schema.contracts).values(data).returning();
    return contract;
  }

  async updateContract(id: string, data: Partial<Contract>): Promise<Contract | undefined> {
    const [contract] = await db.update(schema.contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.contracts.id, id))
      .returning();
    return contract;
  }

  // ============================================================================
  // CONTRACT EVENTS
  // ============================================================================

  async getContractEvents(contractId: string): Promise<ContractEvent[]> {
    return await db.select().from(schema.contractEvents)
      .where(eq(schema.contractEvents.contractId, contractId))
      .orderBy(desc(schema.contractEvents.createdAt));
  }

  async createContractEvent(data: InsertContractEvent): Promise<ContractEvent> {
    const [event] = await db.insert(schema.contractEvents).values(data).returning();
    return event;
  }

  // ============================================================================
  // CONTRACT FILES
  // ============================================================================

  async getContractFiles(contractId: string): Promise<ContractFile[]> {
    return await db.select().from(schema.contractFiles)
      .where(eq(schema.contractFiles.contractId, contractId));
  }

  async createContractFile(data: InsertContractFile): Promise<ContractFile> {
    const [file] = await db.insert(schema.contractFiles).values(data).returning();
    return file;
  }

  // ============================================================================
  // ONBOARDING
  // ============================================================================

  async getOnboardingChecklist(advertiserId: string): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db.select().from(schema.onboardingChecklists)
      .where(eq(schema.onboardingChecklists.advertiserId, advertiserId));
    return checklist;
  }

  async createOnboardingChecklist(data: InsertOnboardingChecklist): Promise<OnboardingChecklist> {
    const [checklist] = await db.insert(schema.onboardingChecklists).values(data).returning();
    return checklist;
  }

  async updateOnboardingChecklist(id: string, data: Partial<OnboardingChecklist>): Promise<OnboardingChecklist | undefined> {
    const [checklist] = await db.update(schema.onboardingChecklists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.onboardingChecklists.id, id))
      .returning();
    return checklist;
  }

  async getOnboardingTasks(checklistId: string): Promise<OnboardingTask[]> {
    return await db.select().from(schema.onboardingTasks)
      .where(eq(schema.onboardingTasks.checklistId, checklistId));
  }

  async createOnboardingTask(data: InsertOnboardingTask): Promise<OnboardingTask> {
    const [task] = await db.insert(schema.onboardingTasks).values(data).returning();
    return task;
  }

  async updateOnboardingTask(id: string, data: Partial<OnboardingTask>): Promise<OnboardingTask | undefined> {
    const [task] = await db.update(schema.onboardingTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.onboardingTasks.id, id))
      .returning();
    return task;
  }

  // ============================================================================
  // REPORTS
  // ============================================================================

  async getReports(): Promise<Report[]> {
    return await db.select().from(schema.reports).orderBy(desc(schema.reports.createdAt));
  }

  async getReportsByAdvertiser(advertiserId: string): Promise<Report[]> {
    return await db.select().from(schema.reports)
      .where(eq(schema.reports.advertiserId, advertiserId));
  }

  async createReport(data: InsertReport): Promise<Report> {
    const [report] = await db.insert(schema.reports).values(data).returning();
    return report;
  }

  async updateReport(id: string, data: Partial<Report>): Promise<Report | undefined> {
    const [report] = await db.update(schema.reports)
      .set(data)
      .where(eq(schema.reports.id, id))
      .returning();
    return report;
  }

  // ============================================================================
  // INCIDENTS
  // ============================================================================

  async getIncidents(): Promise<Incident[]> {
    return await db.select().from(schema.incidents).orderBy(desc(schema.incidents.createdAt));
  }

  async getOpenIncidents(): Promise<Incident[]> {
    return await db.select().from(schema.incidents)
      .where(eq(schema.incidents.status, "open"));
  }

  async createIncident(data: InsertIncident): Promise<Incident> {
    const [incident] = await db.insert(schema.incidents).values(data).returning();
    return incident;
  }

  async updateIncident(id: string, data: Partial<Incident>): Promise<Incident | undefined> {
    const [incident] = await db.update(schema.incidents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.incidents.id, id))
      .returning();
    return incident;
  }

  // ============================================================================
  // ALERT RULES
  // ============================================================================

  async getAlertRules(): Promise<AlertRule[]> {
    return await db.select().from(schema.alertRules);
  }

  async createAlertRule(data: InsertAlertRule): Promise<AlertRule> {
    const [rule] = await db.insert(schema.alertRules).values(data).returning();
    return rule;
  }

  async updateAlertRule(id: string, data: Partial<AlertRule>): Promise<AlertRule | undefined> {
    const [rule] = await db.update(schema.alertRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.alertRules.id, id))
      .returning();
    return rule;
  }

  // ============================================================================
  // USERS
  // ============================================================================

  async getUsers(): Promise<User[]> {
    return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return user;
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

  async listPlacements(): Promise<Placement[]> {
    return await db.select().from(schema.placements).orderBy(desc(schema.placements.createdAt));
  }

  async getPlacementsWithoutContracts(): Promise<Placement[]> {
    return await db.select().from(schema.placements)
      .where(isNull(schema.placements.contractId));
  }

  async getPlacementsWithoutCompetitorGroup(): Promise<Placement[]> {
    const results = await db
      .select({ placement: schema.placements })
      .from(schema.placements)
      .leftJoin(schema.contracts, eq(schema.placements.contractId, schema.contracts.id))
      .leftJoin(schema.advertisers, eq(schema.contracts.advertiserId, schema.advertisers.id))
      .where(or(
        isNull(schema.advertisers.competitorGroup),
        eq(schema.advertisers.competitorGroup, "")
      ));
    return results.map(r => r.placement);
  }

  async getLocationsWithoutExclusivityMode(): Promise<Location[]> {
    return await db.select().from(schema.locations)
      .where(isNull(schema.locations.exclusivityMode));
  }

  async getLocationsWithoutYodeckPlaylist(): Promise<Location[]> {
    return await db.select().from(schema.locations)
      .where(and(
        isNull(schema.locations.yodeckPlaylistId),
        eq(schema.locations.status, "active")
      ));
  }

  async getLocationsWithoutRegionCode(): Promise<Location[]> {
    return await db.select().from(schema.locations)
      .where(or(
        isNull(schema.locations.regionCode),
        eq(schema.locations.regionCode, "")
      ));
  }

  async getLocationsWithoutCategories(): Promise<Location[]> {
    return await db.select().from(schema.locations)
      .where(or(
        isNull(schema.locations.categoriesAllowed),
        sql`array_length(${schema.locations.categoriesAllowed}, 1) IS NULL`
      ));
  }

  async getStaleOnlineLocations(minutesThreshold: number): Promise<Location[]> {
    const thresholdTime = new Date(Date.now() - minutesThreshold * 60 * 1000);
    return await db.select().from(schema.locations)
      .where(and(
        eq(schema.locations.status, "active"),
        or(
          isNull(schema.locations.lastSyncAt),
          lt(schema.locations.lastSyncAt, thresholdTime)
        )
      ));
  }

  async getLocationsWithoutCapacityConfig(): Promise<Location[]> {
    return await db.select().from(schema.locations)
      .where(or(
        isNull(schema.locations.adSlotCapacitySecondsPerLoop),
        eq(schema.locations.adSlotCapacitySecondsPerLoop, 0)
      ));
  }

  async getOnlineLocationsWithoutPlaylist(): Promise<Location[]> {
    return await db.select().from(schema.locations)
      .where(and(
        eq(schema.locations.status, "active"),
        or(
          isNull(schema.locations.yodeckPlaylistId),
          eq(schema.locations.yodeckPlaylistId, "")
        )
      ));
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

  async getAllPendingCarryOvers(): Promise<CarryOver[]> {
    return await db.select().from(schema.carryOvers)
      .where(eq(schema.carryOvers.status, "pending"));
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
  // INTEGRATION CONFIGS
  // ============================================================================

  async getIntegrationConfigs(): Promise<IntegrationConfig[]> {
    return await db.select().from(schema.integrationConfigs).orderBy(schema.integrationConfigs.service);
  }

  async getIntegrationConfig(service: string): Promise<IntegrationConfig | undefined> {
    const [config] = await db.select().from(schema.integrationConfigs)
      .where(eq(schema.integrationConfigs.service, service));
    return config;
  }

  async upsertIntegrationConfig(service: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig> {
    const existing = await this.getIntegrationConfig(service);
    if (existing) {
      const [updated] = await db.update(schema.integrationConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.integrationConfigs.service, service))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.integrationConfigs)
        .values({ service, ...data })
        .returning();
      return created;
    }
  }

  async updateIntegrationConfig(service: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined> {
    const [updated] = await db.update(schema.integrationConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.integrationConfigs.service, service))
      .returning();
    return updated;
  }

  async saveIntegrationCredentials(
    service: string, 
    encryptedCreds: string, 
    configuredKeys: Record<string, boolean>
  ): Promise<IntegrationConfig> {
    const existing = await this.getIntegrationConfig(service);
    if (existing) {
      const [updated] = await db.update(schema.integrationConfigs)
        .set({ 
          encryptedCredentials: encryptedCreds,
          credentialsConfigured: configuredKeys,
          updatedAt: new Date() 
        })
        .where(eq(schema.integrationConfigs.service, service))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.integrationConfigs)
        .values({ 
          service, 
          encryptedCredentials: encryptedCreds,
          credentialsConfigured: configuredKeys 
        })
        .returning();
      return created;
    }
  }

  async deleteIntegrationCredentials(service: string): Promise<IntegrationConfig> {
    const existing = await this.getIntegrationConfig(service);
    if (existing) {
      const [updated] = await db.update(schema.integrationConfigs)
        .set({ 
          encryptedCredentials: null,
          credentialsConfigured: null,
          status: "not_configured",
          isEnabled: false,
          updatedAt: new Date() 
        })
        .where(eq(schema.integrationConfigs.service, service))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.integrationConfigs)
        .values({ service })
        .returning();
      return created;
    }
  }

  async getIntegrationEncryptedCredentials(service: string): Promise<string | null> {
    const config = await this.getIntegrationConfig(service);
    return config?.encryptedCredentials ?? null;
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

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  async getWebhooks(): Promise<Webhook[]> {
    return await db.select().from(schema.webhooks).orderBy(desc(schema.webhooks.createdAt));
  }

  async getWebhook(id: string): Promise<Webhook | undefined> {
    const [webhook] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id));
    return webhook;
  }

  async createWebhook(data: InsertWebhook): Promise<Webhook> {
    const [webhook] = await db.insert(schema.webhooks).values(data).returning();
    return webhook;
  }

  async updateWebhook(id: string, data: Partial<InsertWebhook>): Promise<Webhook | undefined> {
    const [webhook] = await db.update(schema.webhooks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.webhooks.id, id))
      .returning();
    return webhook;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));
    return true;
  }

  async getWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
    return await db.select().from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(50);
  }

  async createWebhookDelivery(data: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const [delivery] = await db.insert(schema.webhookDeliveries).values(data).returning();
    return delivery;
  }

  // ============================================================================
  // CREATIVES
  // ============================================================================

  async getCreatives(): Promise<Creative[]> {
    return await db.select().from(schema.creatives).orderBy(desc(schema.creatives.createdAt));
  }

  async getCreative(id: string): Promise<Creative | undefined> {
    const [creative] = await db.select().from(schema.creatives).where(eq(schema.creatives.id, id));
    return creative;
  }

  async getCreativesWithHash(): Promise<Array<{ id: string; phash: string; advertiserId: string }>> {
    const creatives = await db.select({
      id: schema.creatives.id,
      phash: schema.creatives.phash,
      advertiserId: schema.creatives.advertiserId
    })
    .from(schema.creatives)
    .where(sql`${schema.creatives.phash} IS NOT NULL`);
    return creatives as Array<{ id: string; phash: string; advertiserId: string }>;
  }

  async createCreative(data: InsertCreative): Promise<Creative> {
    const [creative] = await db.insert(schema.creatives).values(data).returning();
    return creative;
  }

  async updateCreative(id: string, data: Partial<InsertCreative>): Promise<Creative | undefined> {
    const [creative] = await db.update(schema.creatives)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.creatives.id, id))
      .returning();
    return creative;
  }

  async deleteCreative(id: string): Promise<boolean> {
    await db.delete(schema.creatives).where(eq(schema.creatives.id, id));
    return true;
  }

  async getCreativeVersions(creativeId: string): Promise<CreativeVersion[]> {
    return await db.select().from(schema.creativeVersions)
      .where(eq(schema.creativeVersions.creativeId, creativeId))
      .orderBy(desc(schema.creativeVersions.versionNo));
  }

  async createCreativeVersion(data: InsertCreativeVersion): Promise<CreativeVersion> {
    const [version] = await db.insert(schema.creativeVersions).values(data).returning();
    return version;
  }

  async getCreativeApprovals(creativeId: string): Promise<CreativeApproval[]> {
    return await db.select().from(schema.creativeApprovals)
      .where(eq(schema.creativeApprovals.creativeId, creativeId))
      .orderBy(desc(schema.creativeApprovals.createdAt));
  }

  async createCreativeApproval(data: InsertCreativeApproval): Promise<CreativeApproval> {
    const [approval] = await db.insert(schema.creativeApprovals).values(data).returning();
    return approval;
  }

  // ============================================================================
  // SALES & ACQUISITIE
  // ============================================================================

  async getLeads(): Promise<Lead[]> {
    return await db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
  }

  async getLeadsPaginated(params: LeadQueryParams): Promise<LeadQueryResult> {
    const {
      q,
      type,
      status,
      category,
      onlyNew = false,
      dateRange = "all",
      sortBy = "createdAt",
      sortDir = "desc",
      page = 1,
      pageSize = 25,
      isHandled,
      isDeleted = false,
    } = params;

    // Build conditions array
    const conditions = [];

    // isDeleted filter (default: exclude deleted)
    conditions.push(eq(schema.leads.isDeleted, isDeleted));

    // isHandled filter
    if (typeof isHandled === "boolean") {
      conditions.push(eq(schema.leads.isHandled, isHandled));
    }

    // Text search (case-insensitive partial match)
    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      conditions.push(sql`(
        ${schema.leads.companyName} ILIKE ${searchTerm} OR
        ${schema.leads.contactName} ILIKE ${searchTerm} OR
        ${schema.leads.email} ILIKE ${searchTerm} OR
        ${schema.leads.phone} ILIKE ${searchTerm}
      )`);
    }

    // Type filter
    if (type && type !== "all") {
      conditions.push(eq(schema.leads.type, type));
    }

    // Status filter
    if (status && status !== "all") {
      conditions.push(eq(schema.leads.status, status));
    }

    // Category filter
    if (category && category !== "all") {
      conditions.push(sql`${schema.leads.category} = ${category}`);
    }

    // Only new filter
    if (onlyNew) {
      conditions.push(eq(schema.leads.status, "nieuw"));
    }

    // Date range filter
    if (dateRange === "7") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      conditions.push(gte(schema.leads.createdAt, sevenDaysAgo));
    } else if (dateRange === "30") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      conditions.push(gte(schema.leads.createdAt, thirtyDaysAgo));
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total for filtered results
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.leads)
      .where(whereClause);

    // Count new leads (global, not filtered, excluding deleted)
    const [{ count: newCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.leads)
      .where(and(eq(schema.leads.status, "nieuw"), eq(schema.leads.isDeleted, false)));

    // Build ORDER BY
    let orderColumn;
    if (sortBy === "companyName") {
      orderColumn = schema.leads.companyName;
    } else if (sortBy === "status") {
      orderColumn = schema.leads.status;
    } else if (sortBy === "handledAt") {
      orderColumn = schema.leads.handledAt;
    } else if (sortBy === "deletedAt") {
      orderColumn = schema.leads.deletedAt;
    } else {
      orderColumn = schema.leads.createdAt;
    }
    const orderFn = sortDir === "asc" ? sql`${orderColumn} ASC` : sql`${orderColumn} DESC`;

    // Fetch paginated items
    const offset = (page - 1) * pageSize;
    const items = await db
      .select()
      .from(schema.leads)
      .where(whereClause)
      .orderBy(orderFn)
      .limit(pageSize)
      .offset(offset);

    const total = Number(totalCount);
    const totalPages = Math.ceil(total / pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      newCount: Number(newCount),
    };
  }

  async getLead(id: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
    return lead;
  }

  async getLeadsByStatus(status: string): Promise<Lead[]> {
    return await db.select().from(schema.leads)
      .where(eq(schema.leads.status, status))
      .orderBy(desc(schema.leads.createdAt));
  }

  async getLeadsByType(type: string): Promise<Lead[]> {
    return await db.select().from(schema.leads)
      .where(eq(schema.leads.type, type))
      .orderBy(desc(schema.leads.createdAt));
  }

  async createLead(data: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(schema.leads).values(data).returning();
    return lead;
  }

  async updateLead(id: string, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const [lead] = await db.update(schema.leads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.leads.id, id))
      .returning();
    return lead;
  }

  async deleteLead(id: string): Promise<boolean> {
    await db.delete(schema.leads).where(eq(schema.leads.id, id));
    return true;
  }

  async getLocationSurveys(): Promise<LocationSurvey[]> {
    return await db.select().from(schema.locationSurveys).orderBy(desc(schema.locationSurveys.createdAt));
  }

  async getLocationSurvey(id: string): Promise<LocationSurvey | undefined> {
    const [survey] = await db.select().from(schema.locationSurveys).where(eq(schema.locationSurveys.id, id));
    return survey;
  }

  async getLocationSurveysByLead(leadId: string): Promise<LocationSurvey[]> {
    return await db.select().from(schema.locationSurveys)
      .where(eq(schema.locationSurveys.leadId, leadId))
      .orderBy(desc(schema.locationSurveys.createdAt));
  }

  async createLocationSurvey(data: InsertLocationSurvey): Promise<LocationSurvey> {
    const [survey] = await db.insert(schema.locationSurveys).values(data).returning();
    return survey;
  }

  async updateLocationSurvey(id: string, data: Partial<InsertLocationSurvey>): Promise<LocationSurvey | undefined> {
    const [survey] = await db.update(schema.locationSurveys)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.locationSurveys.id, id))
      .returning();
    return survey;
  }

  async getDigitalSignatures(documentType: string, documentId: string): Promise<DigitalSignature[]> {
    return await db.select().from(schema.digitalSignatures)
      .where(and(
        eq(schema.digitalSignatures.documentType, documentType),
        eq(schema.digitalSignatures.documentId, documentId)
      ))
      .orderBy(desc(schema.digitalSignatures.signedAt));
  }

  async createDigitalSignature(data: InsertDigitalSignature): Promise<DigitalSignature> {
    const [signature] = await db.insert(schema.digitalSignatures).values(data).returning();
    return signature;
  }

  async getSalesActivities(leadId: string): Promise<SalesActivity[]> {
    return await db.select().from(schema.salesActivities)
      .where(eq(schema.salesActivities.leadId, leadId))
      .orderBy(desc(schema.salesActivities.createdAt));
  }

  async createSalesActivity(data: InsertSalesActivity): Promise<SalesActivity> {
    const [activity] = await db.insert(schema.salesActivities).values(data).returning();
    return activity;
  }

  // ============================================================================
  // SURVEY PHOTOS
  // ============================================================================

  async getSurveyPhotos(surveyId: string): Promise<SurveyPhoto[]> {
    return await db.select().from(schema.surveyPhotos)
      .where(eq(schema.surveyPhotos.surveyId, surveyId))
      .orderBy(desc(schema.surveyPhotos.createdAt));
  }

  async createSurveyPhoto(data: InsertSurveyPhoto): Promise<SurveyPhoto> {
    const [photo] = await db.insert(schema.surveyPhotos).values(data).returning();
    return photo;
  }

  async deleteSurveyPhoto(id: string): Promise<boolean> {
    await db.delete(schema.surveyPhotos).where(eq(schema.surveyPhotos.id, id));
    return true;
  }

  // ============================================================================
  // SUPPLY ITEMS (CATALOG)
  // ============================================================================

  async getSupplyItems(): Promise<SupplyItem[]> {
    return await db.select().from(schema.supplyItems)
      .where(eq(schema.supplyItems.isActive, true))
      .orderBy(schema.supplyItems.category, schema.supplyItems.name);
  }

  async getSupplyItem(id: string): Promise<SupplyItem | undefined> {
    const [item] = await db.select().from(schema.supplyItems).where(eq(schema.supplyItems.id, id));
    return item;
  }

  async createSupplyItem(data: InsertSupplyItem): Promise<SupplyItem> {
    const [item] = await db.insert(schema.supplyItems).values(data).returning();
    return item;
  }

  async updateSupplyItem(id: string, data: Partial<InsertSupplyItem>): Promise<SupplyItem | undefined> {
    const [item] = await db.update(schema.supplyItems)
      .set(data)
      .where(eq(schema.supplyItems.id, id))
      .returning();
    return item;
  }

  // ============================================================================
  // SURVEY SUPPLIES
  // ============================================================================

  async getSurveySupplies(surveyId: string): Promise<SurveySupply[]> {
    return await db.select().from(schema.surveySupplies)
      .where(eq(schema.surveySupplies.surveyId, surveyId))
      .orderBy(desc(schema.surveySupplies.createdAt));
  }

  async createSurveySupply(data: InsertSurveySupply): Promise<SurveySupply> {
    const [supply] = await db.insert(schema.surveySupplies).values(data).returning();
    return supply;
  }

  async updateSurveySupply(id: string, data: Partial<InsertSurveySupply>): Promise<SurveySupply | undefined> {
    const [supply] = await db.update(schema.surveySupplies)
      .set(data)
      .where(eq(schema.surveySupplies.id, id))
      .returning();
    return supply;
  }

  async deleteSurveySupply(id: string): Promise<boolean> {
    await db.delete(schema.surveySupplies).where(eq(schema.surveySupplies.id, id));
    return true;
  }

  // ============================================================================
  // TASKS
  // ============================================================================

  async getTasks(): Promise<Task[]> {
    return await db.select().from(schema.tasks).orderBy(desc(schema.tasks.createdAt));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return task;
  }

  async getTasksByAssignee(userId: string): Promise<Task[]> {
    return await db.select().from(schema.tasks)
      .where(eq(schema.tasks.assignedToUserId, userId))
      .orderBy(desc(schema.tasks.createdAt));
  }

  async getTasksByRole(role: string): Promise<Task[]> {
    return await db.select().from(schema.tasks)
      .where(eq(schema.tasks.assignedToRole, role))
      .orderBy(desc(schema.tasks.createdAt));
  }

  async getTasksBySurvey(surveyId: string): Promise<Task[]> {
    return await db.select().from(schema.tasks)
      .where(eq(schema.tasks.surveyId, surveyId))
      .orderBy(desc(schema.tasks.createdAt));
  }

  async getOpenTasks(): Promise<Task[]> {
    return await db.select().from(schema.tasks)
      .where(sql`${schema.tasks.status} IN ('open', 'in_progress')`)
      .orderBy(schema.tasks.priority, desc(schema.tasks.createdAt));
  }

  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db.insert(schema.tasks).values(data).returning();
    return task;
  }

  async updateTask(id: string, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [task] = await db.update(schema.tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<boolean> {
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
    return true;
  }

  // ============================================================================
  // TASK ATTACHMENTS
  // ============================================================================

  async getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
    return await db.select().from(schema.taskAttachments)
      .where(eq(schema.taskAttachments.taskId, taskId))
      .orderBy(desc(schema.taskAttachments.createdAt));
  }

  async createTaskAttachment(data: InsertTaskAttachment): Promise<TaskAttachment> {
    const [attachment] = await db.insert(schema.taskAttachments).values(data).returning();
    return attachment;
  }

  async deleteTaskAttachment(id: string): Promise<boolean> {
    await db.delete(schema.taskAttachments).where(eq(schema.taskAttachments.id, id));
    return true;
  }

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  async getTemplates(): Promise<Template[]> {
    return await db.select().from(schema.templates).orderBy(schema.templates.category, schema.templates.name);
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await db.select().from(schema.templates).where(eq(schema.templates.id, id));
    return template;
  }

  async getTemplatesByCategory(category: string): Promise<Template[]> {
    return await db.select().from(schema.templates)
      .where(eq(schema.templates.category, category))
      .orderBy(schema.templates.name);
  }

  async createTemplate(data: InsertTemplate): Promise<Template> {
    const placeholders = this.extractPlaceholders(data.body);
    const [template] = await db.insert(schema.templates)
      .values({ ...data, placeholders })
      .returning();
    return template;
  }

  async updateTemplate(id: string, data: Partial<InsertTemplate>): Promise<Template | undefined> {
    const current = await this.getTemplate(id);
    if (!current) return undefined;

    // Save version history
    await this.createTemplateVersion({
      templateId: id,
      version: current.version,
      subject: current.subject,
      body: current.body,
      placeholders: current.placeholders,
      editedBy: current.lastEditedBy,
    });

    // Clean up old versions (keep last 5)
    const versions = await this.getTemplateVersions(id);
    if (versions.length > 5) {
      const oldVersions = versions.slice(5);
      for (const v of oldVersions) {
        await db.delete(schema.templateVersions).where(eq(schema.templateVersions.id, v.id));
      }
    }

    const placeholders = data.body ? this.extractPlaceholders(data.body) : current.placeholders;
    const [template] = await db.update(schema.templates)
      .set({ 
        ...data, 
        placeholders,
        version: current.version + 1,
        updatedAt: new Date() 
      })
      .where(eq(schema.templates.id, id))
      .returning();
    return template;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    await db.delete(schema.templateVersions).where(eq(schema.templateVersions.templateId, id));
    await db.delete(schema.templates).where(eq(schema.templates.id, id));
    return true;
  }

  async getTemplateVersions(templateId: string): Promise<TemplateVersion[]> {
    return await db.select().from(schema.templateVersions)
      .where(eq(schema.templateVersions.templateId, templateId))
      .orderBy(desc(schema.templateVersions.version));
  }

  async createTemplateVersion(data: InsertTemplateVersion): Promise<TemplateVersion> {
    const [version] = await db.insert(schema.templateVersions).values(data).returning();
    return version;
  }

  async restoreTemplateVersion(templateId: string, version: number): Promise<Template | undefined> {
    const [targetVersion] = await db.select().from(schema.templateVersions)
      .where(and(
        eq(schema.templateVersions.templateId, templateId),
        eq(schema.templateVersions.version, version)
      ));
    
    if (!targetVersion) return undefined;

    return await this.updateTemplate(templateId, {
      subject: targetVersion.subject,
      body: targetVersion.body,
    });
  }

  private extractPlaceholders(body: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = body.match(regex) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }

  // ============================================================================
  // YODECK CREATIVES (Media tracking for ads classification)
  // ============================================================================

  async getYodeckCreatives(): Promise<YodeckCreative[]> {
    return await db.select().from(schema.yodeckCreatives).orderBy(desc(schema.yodeckCreatives.lastSeenAt));
  }

  async getYodeckCreative(id: string): Promise<YodeckCreative | undefined> {
    const [creative] = await db.select().from(schema.yodeckCreatives).where(eq(schema.yodeckCreatives.id, id));
    return creative;
  }

  async getYodeckCreativeByMediaId(yodeckMediaId: number): Promise<YodeckCreative | undefined> {
    const [creative] = await db.select().from(schema.yodeckCreatives).where(eq(schema.yodeckCreatives.yodeckMediaId, yodeckMediaId));
    return creative;
  }

  async getUnlinkedYodeckCreatives(): Promise<YodeckCreative[]> {
    return await db.select().from(schema.yodeckCreatives)
      .where(and(
        eq(schema.yodeckCreatives.category, 'ad'),
        isNull(schema.yodeckCreatives.advertiserId)
      ))
      .orderBy(desc(schema.yodeckCreatives.lastSeenAt));
  }

  async upsertYodeckCreative(data: {
    yodeckMediaId: number;
    name: string;
    mediaType?: string | null;
    duration?: number | null;
    category: string;
    lastSeenAt?: Date | null;
  }): Promise<YodeckCreative> {
    const mediaId = Number(data.yodeckMediaId);
    const existing = await this.getYodeckCreativeByMediaId(mediaId);
    if (existing) {
      const [updated] = await db.update(schema.yodeckCreatives)
        .set({ 
          name: data.name,
          mediaType: data.mediaType || null,
          duration: data.duration || null,
          category: data.category,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.yodeckCreatives.yodeckMediaId, mediaId))
        .returning();
      return updated;
    }
    const [creative] = await db.insert(schema.yodeckCreatives).values({
      yodeckMediaId: mediaId,
      name: data.name,
      mediaType: data.mediaType || null,
      duration: data.duration || null,
      category: data.category,
      lastSeenAt: data.lastSeenAt || new Date(),
    }).returning();
    return creative;
  }

  async updateYodeckCreative(id: string, data: Partial<YodeckCreative>): Promise<YodeckCreative | undefined> {
    const [creative] = await db.update(schema.yodeckCreatives)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.yodeckCreatives.id, id))
      .returning();
    return creative;
  }

  async getYodeckCreativeStats(): Promise<{ totalAds: number; unlinkedAds: number; totalNonAds: number }> {
    const all = await db.select().from(schema.yodeckCreatives);
    const ads = all.filter(c => c.category === 'ad');
    const unlinked = ads.filter(c => !c.advertiserId);
    const nonAds = all.filter(c => c.category === 'non_ad');
    return {
      totalAds: ads.length,
      unlinkedAds: unlinked.length,
      totalNonAds: nonAds.length
    };
  }

  // ============================================================================
  // YODECK MEDIA LINKS
  // ============================================================================

  async getYodeckMediaLinks(): Promise<YodeckMediaLink[]> {
    return db.select().from(schema.yodeckMediaLinks);
  }

  async getYodeckMediaLink(yodeckMediaId: number): Promise<YodeckMediaLink | undefined> {
    const [link] = await db.select().from(schema.yodeckMediaLinks)
      .where(eq(schema.yodeckMediaLinks.yodeckMediaId, yodeckMediaId))
      .limit(1);
    return link;
  }

  async upsertYodeckMediaLink(data: { yodeckMediaId: number; name: string; normalizedKey: string; mediaType?: string; category: string; duration?: number }): Promise<YodeckMediaLink> {
    const existing = await this.getYodeckMediaLink(data.yodeckMediaId);
    if (existing) {
      const [updated] = await db.update(schema.yodeckMediaLinks)
        .set({
          name: data.name,
          normalizedKey: data.normalizedKey,
          mediaType: data.mediaType || null,
          category: data.category,
          duration: data.duration || null,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.yodeckMediaLinks.yodeckMediaId, data.yodeckMediaId))
        .returning();
      return updated;
    }
    const [link] = await db.insert(schema.yodeckMediaLinks).values({
      yodeckMediaId: data.yodeckMediaId,
      name: data.name,
      normalizedKey: data.normalizedKey,
      mediaType: data.mediaType || null,
      category: data.category,
      duration: data.duration || null,
      lastSeenAt: new Date(),
    }).returning();
    return link;
  }

  async updateYodeckMediaLink(yodeckMediaId: number, data: { advertiserId?: string | null; placementId?: string | null; updatedAt?: Date }): Promise<YodeckMediaLink | undefined> {
    const [updated] = await db.update(schema.yodeckMediaLinks)
      .set({
        advertiserId: data.advertiserId,
        placementId: data.placementId,
        updatedAt: data.updatedAt || new Date()
      })
      .where(eq(schema.yodeckMediaLinks.yodeckMediaId, yodeckMediaId))
      .returning();
    return updated;
  }

  async getYodeckMediaLinkStats(): Promise<{ totalAds: number; unlinkedAds: number; totalNonAds: number }> {
    const all = await db.select().from(schema.yodeckMediaLinks);
    const ads = all.filter(c => c.category === 'ad');
    const unlinked = ads.filter(c => !c.advertiserId && !c.placementId);
    const nonAds = all.filter(c => c.category === 'non_ad');
    return {
      totalAds: ads.length,
      unlinkedAds: unlinked.length,
      totalNonAds: nonAds.length
    };
  }

  // ============================================================================
  // SCREEN CONTENT ITEMS (Inferred Placements)
  // ============================================================================

  async getScreenContentItems(screenId: string): Promise<ScreenContentItem[]> {
    return await db.select()
      .from(schema.screenContentItems)
      .where(and(
        eq(schema.screenContentItems.screenId, screenId),
        eq(schema.screenContentItems.isActive, true)
      ))
      .orderBy(desc(schema.screenContentItems.lastSeenAt));
  }

  async getAllScreenContentItems(): Promise<ScreenContentItem[]> {
    return await db.select()
      .from(schema.screenContentItems)
      .orderBy(desc(schema.screenContentItems.lastSeenAt));
  }

  async upsertScreenContentItem(data: { screenId: string; yodeckMediaId: number; name: string; mediaType?: string; category: string; duration?: number; isActive?: boolean }): Promise<ScreenContentItem> {
    // Check if exists
    const [existing] = await db.select()
      .from(schema.screenContentItems)
      .where(and(
        eq(schema.screenContentItems.screenId, data.screenId),
        eq(schema.screenContentItems.yodeckMediaId, data.yodeckMediaId)
      ));
    
    if (existing) {
      // Update existing
      const [updated] = await db.update(schema.screenContentItems)
        .set({
          name: data.name,
          mediaType: data.mediaType || null,
          category: data.category,
          duration: data.duration || null,
          isActive: data.isActive !== false,
          lastSeenAt: new Date(),
        })
        .where(eq(schema.screenContentItems.id, existing.id))
        .returning();
      return updated;
    }
    
    // Insert new
    const [item] = await db.insert(schema.screenContentItems).values({
      screenId: data.screenId,
      yodeckMediaId: data.yodeckMediaId,
      name: data.name,
      mediaType: data.mediaType || null,
      category: data.category,
      duration: data.duration || null,
      isActive: data.isActive !== false,
      lastSeenAt: new Date(),
    }).returning();
    return item;
  }

  async markScreenContentItemsInactive(screenId: string, activeMediaIds: number[]): Promise<number> {
    // Mark items as inactive if they're not in the active list
    if (activeMediaIds.length === 0) {
      // Mark all items for this screen as inactive
      const result = await db.update(schema.screenContentItems)
        .set({ isActive: false, lastSeenAt: new Date() })
        .where(and(
          eq(schema.screenContentItems.screenId, screenId),
          eq(schema.screenContentItems.isActive, true)
        ))
        .returning();
      return result.length;
    }
    
    // Mark items not in the active list as inactive
    const result = await db.update(schema.screenContentItems)
      .set({ isActive: false, lastSeenAt: new Date() })
      .where(and(
        eq(schema.screenContentItems.screenId, screenId),
        eq(schema.screenContentItems.isActive, true),
        notInArray(schema.screenContentItems.yodeckMediaId, activeMediaIds)
      ))
      .returning();
    return result.length;
  }

  async getScreenContentItemStats(): Promise<{ totalAds: number; unlinkedAds: number; totalNonAds: number; activeScreensWithContent: number }> {
    const all = await db.select()
      .from(schema.screenContentItems)
      .where(eq(schema.screenContentItems.isActive, true));
    
    const ads = all.filter(c => c.category === 'ad');
    const unlinked = ads.filter(c => !c.linkedAdvertiserId && !c.linkedPlacementId);
    const nonAds = all.filter(c => c.category === 'non_ad');
    
    // Count unique screens with content
    const uniqueScreens = new Set(all.map(c => c.screenId));
    
    return {
      totalAds: ads.length,
      unlinkedAds: unlinked.length,
      totalNonAds: nonAds.length,
      activeScreensWithContent: uniqueScreens.size
    };
  }

  // ============================================================================
  // MONEYBIRD INTEGRATION
  // ============================================================================

  async getMoneybirdContacts(): Promise<MoneybirdContact[]> {
    return await db.select().from(schema.moneybirdContacts).orderBy(schema.moneybirdContacts.companyName);
  }

  async getMoneybirdContact(id: string): Promise<MoneybirdContact | undefined> {
    const [contact] = await db.select().from(schema.moneybirdContacts).where(eq(schema.moneybirdContacts.id, id));
    return contact;
  }

  async getMoneybirdContactByMoneybirdId(moneybirdId: string): Promise<MoneybirdContact | undefined> {
    const [contact] = await db.select().from(schema.moneybirdContacts).where(eq(schema.moneybirdContacts.moneybirdId, moneybirdId));
    return contact;
  }

  async upsertMoneybirdContact(data: InsertMoneybirdContact): Promise<MoneybirdContact> {
    const existing = await this.getMoneybirdContactByMoneybirdId(data.moneybirdId);
    if (existing) {
      const [updated] = await db.update(schema.moneybirdContacts)
        .set({ ...data, updatedAt: new Date(), lastSyncedAt: new Date() })
        .where(eq(schema.moneybirdContacts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(schema.moneybirdContacts).values(data).returning();
    return created;
  }

  async linkMoneybirdContactToAdvertiser(moneybirdContactId: string, advertiserId: string): Promise<MoneybirdContact | undefined> {
    const [updated] = await db.update(schema.moneybirdContacts)
      .set({ advertiserId, updatedAt: new Date() })
      .where(eq(schema.moneybirdContacts.id, moneybirdContactId))
      .returning();
    
    // Also update the advertiser with the Moneybird contact ID
    if (updated) {
      const contact = await this.getMoneybirdContact(moneybirdContactId);
      if (contact) {
        await db.update(schema.advertisers)
          .set({ moneybirdContactId: contact.moneybirdId, updatedAt: new Date() })
          .where(eq(schema.advertisers.id, advertiserId));
      }
    }
    return updated;
  }

  async getMoneybirdInvoices(): Promise<MoneybirdInvoice[]> {
    return await db.select().from(schema.moneybirdInvoices).orderBy(desc(schema.moneybirdInvoices.invoiceDate));
  }

  async getMoneybirdInvoicesByContact(moneybirdContactId: string): Promise<MoneybirdInvoice[]> {
    return await db.select()
      .from(schema.moneybirdInvoices)
      .where(eq(schema.moneybirdInvoices.moneybirdContactId, moneybirdContactId))
      .orderBy(desc(schema.moneybirdInvoices.invoiceDate));
  }

  async getMoneybirdInvoice(id: string): Promise<MoneybirdInvoice | undefined> {
    const [invoice] = await db.select().from(schema.moneybirdInvoices).where(eq(schema.moneybirdInvoices.id, id));
    return invoice;
  }

  async getMoneybirdInvoiceByMoneybirdId(moneybirdId: string): Promise<MoneybirdInvoice | undefined> {
    const [invoice] = await db.select().from(schema.moneybirdInvoices).where(eq(schema.moneybirdInvoices.moneybirdId, moneybirdId));
    return invoice;
  }

  async upsertMoneybirdInvoice(data: InsertMoneybirdInvoice): Promise<MoneybirdInvoice> {
    const existing = await this.getMoneybirdInvoiceByMoneybirdId(data.moneybirdId);
    if (existing) {
      const [updated] = await db.update(schema.moneybirdInvoices)
        .set({ ...data, updatedAt: new Date(), lastSyncedAt: new Date() })
        .where(eq(schema.moneybirdInvoices.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(schema.moneybirdInvoices).values(data).returning();
    return created;
  }

  async getMoneybirdPayments(): Promise<MoneybirdPayment[]> {
    return await db.select().from(schema.moneybirdPayments).orderBy(desc(schema.moneybirdPayments.paymentDate));
  }

  async getMoneybirdPaymentsByInvoice(moneybirdInvoiceId: string): Promise<MoneybirdPayment[]> {
    return await db.select()
      .from(schema.moneybirdPayments)
      .where(eq(schema.moneybirdPayments.moneybirdInvoiceId, moneybirdInvoiceId))
      .orderBy(desc(schema.moneybirdPayments.paymentDate));
  }

  async upsertMoneybirdPayment(data: InsertMoneybirdPayment): Promise<MoneybirdPayment> {
    const [existing] = await db.select()
      .from(schema.moneybirdPayments)
      .where(eq(schema.moneybirdPayments.moneybirdId, data.moneybirdId));
    
    if (existing) {
      const [updated] = await db.update(schema.moneybirdPayments)
        .set({ ...data, lastSyncedAt: new Date() })
        .where(eq(schema.moneybirdPayments.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(schema.moneybirdPayments).values(data).returning();
    return created;
  }

  async getMoneybirdStats(): Promise<{ 
    totalContacts: number; 
    linkedContacts: number; 
    totalInvoices: number; 
    openInvoices: number; 
    paidInvoices: number;
    totalUnpaid: string;
  }> {
    const contacts = await this.getMoneybirdContacts();
    const invoices = await this.getMoneybirdInvoices();
    
    const linkedContacts = contacts.filter(c => c.advertiserId).length;
    const openInvoices = invoices.filter(i => i.state === 'open' || i.state === 'late' || i.state === 'reminded').length;
    const paidInvoices = invoices.filter(i => i.state === 'paid').length;
    
    const totalUnpaid = invoices.reduce((sum, inv) => {
      const unpaid = parseFloat(inv.totalUnpaid || '0');
      return sum + unpaid;
    }, 0);

    return {
      totalContacts: contacts.length,
      linkedContacts,
      totalInvoices: invoices.length,
      openInvoices,
      paidInvoices,
      totalUnpaid: totalUnpaid.toFixed(2)
    };
  }

  // ============================================================================
  // SCREEN <-> MONEYBIRD MAPPING METHODS
  // ============================================================================

  async getUnmappedScreens(): Promise<Array<Screen & { locationName: string }>> {
    const results = await db.select({
      screen: schema.screens,
      locationName: schema.locations.name
    })
      .from(schema.screens)
      .leftJoin(schema.locations, eq(schema.screens.locationId, schema.locations.id))
      .where(sql`${schema.screens.matchConfidence} IS NULL`);
    
    return results.map(r => ({
      ...r.screen,
      locationName: r.locationName || "Onbekend"
    }));
  }

  async getScreensWithMappingStatus(): Promise<Array<{
    screen: Screen;
    locationName: string;
    mappedContactName: string | null;
    mappedContactId: string | null;
  }>> {
    const screens = await db.select({
      screen: schema.screens,
      locationName: schema.locations.name,
      moneybirdContactId: schema.locations.moneybirdContactId
    })
      .from(schema.screens)
      .leftJoin(schema.locations, eq(schema.screens.locationId, schema.locations.id))
      .where(eq(schema.screens.isActive, true));

    const results = [];
    for (const row of screens) {
      let mappedContactName = null;
      if (row.moneybirdContactId) {
        const contact = await this.getMoneybirdContactByMoneybirdId(row.moneybirdContactId);
        if (contact) {
          mappedContactName = contact.companyName || 
            [contact.firstname, contact.lastname].filter(Boolean).join(" ") || null;
        }
      }
      results.push({
        screen: row.screen,
        locationName: row.locationName || "Onbekend",
        mappedContactName,
        mappedContactId: row.moneybirdContactId
      });
    }
    return results;
  }

  async linkScreenToMoneybirdContact(
    screenId: string, 
    moneybirdContactId: string,
    confidence: "auto_exact" | "auto_fuzzy" | "manual",
    reason: string
  ): Promise<{ screen: Screen; location: Location }> {
    const screen = await this.getScreen(screenId);
    if (!screen) {
      throw new Error("Screen niet gevonden");
    }

    const contact = await this.getMoneybirdContactByMoneybirdId(moneybirdContactId);
    if (!contact) {
      throw new Error("Moneybird contact niet gevonden");
    }

    // Get or create location from Moneybird contact
    let location = await this.getLocationByMoneybirdContactId(moneybirdContactId);
    
    if (!location) {
      // Create new location from Moneybird contact
      const contactName = contact.companyName || 
        [contact.firstname, contact.lastname].filter(Boolean).join(" ") || 
        "Onbekend";
      
      const address = [contact.address1, contact.address2].filter(Boolean).join(", ") || "";
      
      const [newLocation] = await db.insert(schema.locations).values({
        name: contactName,
        address: address || "Adres onbekend",
        street: contact.address1 || null,
        zipcode: contact.zipcode || null,
        city: contact.city || null,
        contactName: [contact.firstname, contact.lastname].filter(Boolean).join(" ") || contactName,
        email: contact.email || "onbekend@example.com",
        phone: contact.phone || null,
        moneybirdContactId: moneybirdContactId,
        status: "active"
      }).returning();
      
      location = newLocation;
    }

    // Update screen with mapping info and location
    const [updatedScreen] = await db.update(schema.screens)
      .set({
        locationId: location.id,
        matchConfidence: confidence,
        matchReason: reason,
        updatedAt: new Date()
      })
      .where(eq(schema.screens.id, screenId))
      .returning();

    return { screen: updatedScreen, location };
  }

  async unlinkScreen(screenId: string, defaultLocationId: string): Promise<Screen> {
    const [updated] = await db.update(schema.screens)
      .set({
        locationId: defaultLocationId,
        matchConfidence: null,
        matchReason: null,
        updatedAt: new Date()
      })
      .where(eq(schema.screens.id, screenId))
      .returning();
    
    return updated;
  }

  async getLocationByMoneybirdContactId(moneybirdContactId: string): Promise<Location | undefined> {
    const [location] = await db.select()
      .from(schema.locations)
      .where(eq(schema.locations.moneybirdContactId, moneybirdContactId));
    return location;
  }

  async updateLocationFromMoneybirdContact(locationId: string, contact: MoneybirdContact): Promise<Location> {
    const contactName = contact.companyName || 
      [contact.firstname, contact.lastname].filter(Boolean).join(" ") || 
      "Onbekend";
    
    const address = [contact.address1, contact.address2].filter(Boolean).join(", ") || "";

    const [updated] = await db.update(schema.locations)
      .set({
        name: contactName,
        address: address || "Adres onbekend",
        street: contact.address1 || null,
        zipcode: contact.zipcode || null,
        city: contact.city || null,
        contactName: [contact.firstname, contact.lastname].filter(Boolean).join(" ") || contactName,
        email: contact.email || undefined,
        phone: contact.phone || null,
        moneybirdContactId: contact.moneybirdId,
        updatedAt: new Date()
      })
      .where(eq(schema.locations.id, locationId))
      .returning();
    
    return updated;
  }

  async getDefaultLocation(): Promise<Location | undefined> {
    const [location] = await db.select()
      .from(schema.locations)
      .where(sql`${schema.locations.name} ILIKE '%default%' OR ${schema.locations.name} ILIKE '%yodeck import%'`)
      .limit(1);
    return location;
  }

  async getMappingStats(): Promise<{
    totalScreens: number;
    mappedScreens: number;
    unmappedScreens: number;
    autoMapped: number;
    manualMapped: number;
    needsReview: number;
  }> {
    const screens = await db.select({
      matchConfidence: schema.screens.matchConfidence
    })
      .from(schema.screens)
      .where(eq(schema.screens.isActive, true));

    const total = screens.length;
    const mapped = screens.filter(s => s.matchConfidence !== null).length;
    const unmapped = screens.filter(s => s.matchConfidence === null).length;
    const autoExact = screens.filter(s => s.matchConfidence === "auto_exact").length;
    const autoFuzzy = screens.filter(s => s.matchConfidence === "auto_fuzzy").length;
    const manual = screens.filter(s => s.matchConfidence === "manual").length;
    const needsReview = screens.filter(s => s.matchConfidence === "needs_review").length;

    return {
      totalScreens: total,
      mappedScreens: mapped,
      unmappedScreens: unmapped,
      autoMapped: autoExact + autoFuzzy,
      manualMapped: manual,
      needsReview
    };
  }

  // ============================================================================
  // SITES (Unified entity: 1 site = 1 screen location)
  // ============================================================================

  async getSites(): Promise<Site[]> {
    return await db.select().from(schema.sites).orderBy(desc(schema.sites.createdAt));
  }

  async getSite(id: string): Promise<Site | undefined> {
    const [site] = await db.select().from(schema.sites).where(eq(schema.sites.id, id));
    return site;
  }

  async getSiteByCode(code: string): Promise<Site | undefined> {
    const [site] = await db.select().from(schema.sites).where(eq(schema.sites.code, code));
    return site;
  }

  async getSiteByYodeckScreenId(yodeckScreenId: string): Promise<Site | undefined> {
    const [site] = await db.select().from(schema.sites).where(eq(schema.sites.yodeckScreenId, yodeckScreenId));
    return site;
  }

  async getSiteWithSnapshots(id: string): Promise<SiteWithSnapshots | undefined> {
    const site = await this.getSite(id);
    if (!site) return undefined;
    
    const contactSnapshot = await this.getSiteContactSnapshot(id);
    const yodeckSnapshot = await this.getSiteYodeckSnapshot(id);
    
    return {
      ...site,
      contactSnapshot,
      yodeckSnapshot
    };
  }

  async getSitesWithSnapshots(): Promise<SiteWithSnapshots[]> {
    const sites = await this.getSites();
    const results: SiteWithSnapshots[] = [];
    
    for (const site of sites) {
      const contactSnapshot = await this.getSiteContactSnapshot(site.id);
      const yodeckSnapshot = await this.getSiteYodeckSnapshot(site.id);
      results.push({
        ...site,
        contactSnapshot,
        yodeckSnapshot
      });
    }
    
    return results;
  }

  async createSite(data: InsertSite): Promise<Site> {
    const [site] = await db.insert(schema.sites).values(data).returning();
    return site;
  }

  async updateSite(id: string, data: Partial<InsertSite>): Promise<Site | undefined> {
    const [site] = await db.update(schema.sites)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.sites.id, id))
      .returning();
    return site;
  }

  async deleteSite(id: string): Promise<boolean> {
    await db.delete(schema.sites).where(eq(schema.sites.id, id));
    return true;
  }

  async linkSiteToMoneybird(siteId: string, moneybirdContactId: string): Promise<Site | undefined> {
    const [site] = await db.update(schema.sites)
      .set({ moneybirdContactId, updatedAt: new Date() })
      .where(eq(schema.sites.id, siteId))
      .returning();
    return site;
  }

  async linkSiteToYodeck(siteId: string, yodeckScreenId: string): Promise<Site | undefined> {
    const [site] = await db.update(schema.sites)
      .set({ yodeckScreenId, updatedAt: new Date() })
      .where(eq(schema.sites.id, siteId))
      .returning();
    return site;
  }

  // ============================================================================
  // SITE SNAPSHOTS
  // ============================================================================

  async getSiteContactSnapshot(siteId: string): Promise<SiteContactSnapshot | undefined> {
    const [snapshot] = await db.select()
      .from(schema.siteContactSnapshot)
      .where(eq(schema.siteContactSnapshot.siteId, siteId));
    return snapshot;
  }

  async upsertSiteContactSnapshot(siteId: string, data: Omit<InsertSiteContactSnapshot, 'siteId'>): Promise<SiteContactSnapshot> {
    const existing = await this.getSiteContactSnapshot(siteId);
    
    if (existing) {
      const [updated] = await db.update(schema.siteContactSnapshot)
        .set({ ...data, syncedAt: new Date() })
        .where(eq(schema.siteContactSnapshot.siteId, siteId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.siteContactSnapshot)
        .values({ ...data, siteId })
        .returning();
      return created;
    }
  }

  async getSiteYodeckSnapshot(siteId: string): Promise<SiteYodeckSnapshot | undefined> {
    const [snapshot] = await db.select()
      .from(schema.siteYodeckSnapshot)
      .where(eq(schema.siteYodeckSnapshot.siteId, siteId));
    return snapshot;
  }

  async upsertSiteYodeckSnapshot(siteId: string, data: Omit<InsertSiteYodeckSnapshot, 'siteId'>): Promise<SiteYodeckSnapshot> {
    const existing = await this.getSiteYodeckSnapshot(siteId);
    
    if (existing) {
      const [updated] = await db.update(schema.siteYodeckSnapshot)
        .set({ ...data, syncedAt: new Date() })
        .where(eq(schema.siteYodeckSnapshot.siteId, siteId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.siteYodeckSnapshot)
        .values({ ...data, siteId })
        .returning();
      return created;
    }
  }

  // ============================================================================
  // MONEYBIRD CONTACTS CACHE
  // ============================================================================

  async getMoneybirdContactsCache(): Promise<MoneybirdContactCache[]> {
    return await db.select().from(schema.moneybirdContactsCache);
  }

  async getMoneybirdContactCache(moneybirdContactId: string): Promise<MoneybirdContactCache | undefined> {
    const [cache] = await db.select()
      .from(schema.moneybirdContactsCache)
      .where(eq(schema.moneybirdContactsCache.moneybirdContactId, moneybirdContactId));
    return cache;
  }

  async upsertMoneybirdContactCache(data: InsertMoneybirdContactCache): Promise<MoneybirdContactCache> {
    const existing = await this.getMoneybirdContactCache(data.moneybirdContactId);
    
    if (existing) {
      const [updated] = await db.update(schema.moneybirdContactsCache)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.moneybirdContactsCache.moneybirdContactId, data.moneybirdContactId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.moneybirdContactsCache)
        .values(data)
        .returning();
      return created;
    }
  }

  // ============================================================================
  // YODECK SCREENS CACHE
  // ============================================================================

  async getYodeckScreensCache(): Promise<YodeckScreenCache[]> {
    return await db.select().from(schema.yodeckScreensCache);
  }

  async getYodeckScreenCache(yodeckScreenId: string): Promise<YodeckScreenCache | undefined> {
    const [cache] = await db.select()
      .from(schema.yodeckScreensCache)
      .where(eq(schema.yodeckScreensCache.yodeckScreenId, yodeckScreenId));
    return cache;
  }

  async upsertYodeckScreenCache(data: InsertYodeckScreenCache): Promise<YodeckScreenCache> {
    const existing = await this.getYodeckScreenCache(data.yodeckScreenId);
    
    if (existing) {
      const [updated] = await db.update(schema.yodeckScreensCache)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.yodeckScreensCache.yodeckScreenId, data.yodeckScreenId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.yodeckScreensCache)
        .values(data)
        .returning();
      return created;
    }
  }

  // ============================================================================
  // ENTITIES (UNIFIED MODEL FOR ADVERTISER + SCREEN)
  // ============================================================================

  async getEntities(): Promise<Entity[]> {
    return await db.select().from(schema.entities).orderBy(desc(schema.entities.createdAt));
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(schema.entities).where(eq(schema.entities.id, id));
    return entity;
  }

  async getEntityByCode(entityCode: string): Promise<Entity | undefined> {
    const [entity] = await db.select().from(schema.entities).where(eq(schema.entities.entityCode, entityCode));
    return entity;
  }

  async createEntity(data: InsertEntity): Promise<Entity> {
    const [entity] = await db.insert(schema.entities).values(data).returning();
    return entity;
  }

  async updateEntity(id: string, data: Partial<InsertEntity>): Promise<Entity | undefined> {
    const [entity] = await db.update(schema.entities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.entities.id, id))
      .returning();
    return entity;
  }

  async deleteEntity(id: string): Promise<boolean> {
    await db.delete(schema.entities).where(eq(schema.entities.id, id));
    return true;
  }

  // ============================================================================
  // SYNC JOBS
  // ============================================================================

  async getSyncJobs(entityId?: string): Promise<SyncJob[]> {
    if (entityId) {
      return await db.select().from(schema.syncJobs)
        .where(eq(schema.syncJobs.entityId, entityId))
        .orderBy(desc(schema.syncJobs.startedAt));
    }
    return await db.select().from(schema.syncJobs).orderBy(desc(schema.syncJobs.startedAt));
  }

  async getSyncJob(id: string): Promise<SyncJob | undefined> {
    const [job] = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.id, id));
    return job;
  }

  async createSyncJob(data: InsertSyncJob): Promise<SyncJob> {
    const [job] = await db.insert(schema.syncJobs).values(data).returning();
    return job;
  }

  async updateSyncJob(id: string, data: Partial<InsertSyncJob>): Promise<SyncJob | undefined> {
    const [job] = await db.update(schema.syncJobs)
      .set(data)
      .where(eq(schema.syncJobs.id, id))
      .returning();
    return job;
  }

  // ============================================================================
  // PORTAL TOKENS
  // ============================================================================

  async createPortalToken(data: InsertPortalToken): Promise<PortalToken> {
    const [token] = await db.insert(schema.portalTokens).values(data).returning();
    return token;
  }

  async getPortalTokenByHash(tokenHash: string): Promise<PortalToken | undefined> {
    const [token] = await db.select().from(schema.portalTokens)
      .where(eq(schema.portalTokens.tokenHash, tokenHash));
    return token;
  }

  async markPortalTokenUsed(id: string): Promise<PortalToken | undefined> {
    const [token] = await db.update(schema.portalTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.portalTokens.id, id))
      .returning();
    return token;
  }

  async getPortalTokensForAdvertiser(advertiserId: string): Promise<PortalToken[]> {
    return await db.select().from(schema.portalTokens)
      .where(eq(schema.portalTokens.advertiserId, advertiserId))
      .orderBy(desc(schema.portalTokens.createdAt));
  }

  // ============================================================================
  // EMAIL LOGS
  // ============================================================================

  async createEmailLog(data: InsertEmailLog): Promise<EmailLog> {
    const [log] = await db.insert(schema.emailLogs).values(data).returning();
    return log;
  }

  async updateEmailLog(id: string, data: Partial<EmailLog>): Promise<EmailLog | undefined> {
    const [log] = await db.update(schema.emailLogs)
      .set(data)
      .where(eq(schema.emailLogs.id, id))
      .returning();
    return log;
  }

  async getEmailLogs(limit: number = 50): Promise<EmailLog[]> {
    return await db.select().from(schema.emailLogs)
      .orderBy(desc(schema.emailLogs.createdAt))
      .limit(limit);
  }

  async getEmailLogsWithFilters(filters: { 
    limit?: number; 
    status?: string; 
    templateKey?: string; 
    entityType?: string; 
    entityId?: string; 
    search?: string 
  }): Promise<EmailLog[]> {
    const conditions = [];
    
    if (filters.status) {
      conditions.push(eq(schema.emailLogs.status, filters.status));
    }
    if (filters.templateKey) {
      conditions.push(eq(schema.emailLogs.templateKey, filters.templateKey));
    }
    if (filters.entityType) {
      conditions.push(eq(schema.emailLogs.entityType, filters.entityType));
    }
    if (filters.entityId) {
      conditions.push(eq(schema.emailLogs.entityId, filters.entityId));
    }
    if (filters.search) {
      conditions.push(ilike(schema.emailLogs.toEmail, `%${filters.search}%`));
    }

    const query = db.select().from(schema.emailLogs);
    
    if (conditions.length > 0) {
      return await query
        .where(and(...conditions))
        .orderBy(desc(schema.emailLogs.createdAt))
        .limit(filters.limit || 200);
    }
    
    return await query
      .orderBy(desc(schema.emailLogs.createdAt))
      .limit(filters.limit || 200);
  }

  async getEmailLogById(id: string): Promise<EmailLog | undefined> {
    const [log] = await db.select().from(schema.emailLogs)
      .where(eq(schema.emailLogs.id, id));
    return log;
  }

  async getEmailLogByTemplateAndEntity(templateKey: string, entityType: string, entityId: string): Promise<EmailLog | undefined> {
    const [log] = await db.select().from(schema.emailLogs)
      .where(and(
        eq(schema.emailLogs.templateKey, templateKey),
        eq(schema.emailLogs.entityType, entityType),
        eq(schema.emailLogs.entityId, entityId),
        eq(schema.emailLogs.status, "sent")
      ))
      .orderBy(desc(schema.emailLogs.createdAt));
    return log;
  }

  // ============================================================================
  // VERIFICATION CODES
  // ============================================================================

  async createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode> {
    const [code] = await db.insert(schema.verificationCodes).values(data).returning();
    return code;
  }

  async getActiveVerificationCode(email: string): Promise<VerificationCode | undefined> {
    const [code] = await db.select().from(schema.verificationCodes)
      .where(and(
        eq(schema.verificationCodes.email, email.toLowerCase()),
        gte(schema.verificationCodes.expiresAt, new Date()),
        isNull(schema.verificationCodes.usedAt)
      ))
      .orderBy(desc(schema.verificationCodes.createdAt));
    return code;
  }

  async getRecentVerificationCodeCount(email: string, minutes: number): Promise<number> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.verificationCodes)
      .where(and(
        eq(schema.verificationCodes.email, email.toLowerCase()),
        gte(schema.verificationCodes.createdAt, since)
      ));
    return Number(result[0]?.count || 0);
  }

  async incrementVerificationAttempts(id: string): Promise<VerificationCode | undefined> {
    const [code] = await db.update(schema.verificationCodes)
      .set({ attempts: sql`attempts + 1` })
      .where(eq(schema.verificationCodes.id, id))
      .returning();
    return code;
  }

  async markVerificationCodeUsed(id: string): Promise<VerificationCode | undefined> {
    const [code] = await db.update(schema.verificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(schema.verificationCodes.id, id))
      .returning();
    return code;
  }

  // ============================================================================
  // ONBOARDING INVITE TOKENS
  // ============================================================================

  async createOnboardingInviteToken(data: InsertOnboardingInviteToken): Promise<OnboardingInviteToken> {
    const [token] = await db.insert(schema.onboardingInviteTokens).values(data).returning();
    return token;
  }

  async getOnboardingInviteTokenByHash(tokenHash: string): Promise<OnboardingInviteToken | undefined> {
    const [token] = await db.select().from(schema.onboardingInviteTokens)
      .where(eq(schema.onboardingInviteTokens.tokenHash, tokenHash));
    return token;
  }

  async markOnboardingInviteTokenUsed(id: string): Promise<OnboardingInviteToken | undefined> {
    const [token] = await db.update(schema.onboardingInviteTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.onboardingInviteTokens.id, id))
      .returning();
    return token;
  }

  // ============================================================================
  // INTEGRATION OUTBOX (SSOT Pattern)
  // ============================================================================

  async createOutboxJob(data: InsertIntegrationOutbox): Promise<IntegrationOutbox> {
    const [job] = await db.insert(schema.integrationOutbox).values(data).returning();
    return job;
  }

  async getOutboxJob(id: string): Promise<IntegrationOutbox | undefined> {
    const [job] = await db.select().from(schema.integrationOutbox)
      .where(eq(schema.integrationOutbox.id, id));
    return job;
  }

  async getOutboxJobByIdempotencyKey(key: string): Promise<IntegrationOutbox | undefined> {
    const [job] = await db.select().from(schema.integrationOutbox)
      .where(eq(schema.integrationOutbox.idempotencyKey, key));
    return job;
  }

  async getQueuedOutboxJobs(limit: number = 50): Promise<IntegrationOutbox[]> {
    return await db.select().from(schema.integrationOutbox)
      .where(and(
        eq(schema.integrationOutbox.status, "queued"),
        sql`(${schema.integrationOutbox.nextRetryAt} IS NULL OR ${schema.integrationOutbox.nextRetryAt} <= NOW())`
      ))
      .orderBy(schema.integrationOutbox.createdAt)
      .limit(limit);
  }

  async getFailedOutboxJobs(provider?: string): Promise<IntegrationOutbox[]> {
    if (provider) {
      return await db.select().from(schema.integrationOutbox)
        .where(and(
          eq(schema.integrationOutbox.status, "failed"),
          eq(schema.integrationOutbox.provider, provider)
        ))
        .orderBy(desc(schema.integrationOutbox.updatedAt));
    }
    return await db.select().from(schema.integrationOutbox)
      .where(eq(schema.integrationOutbox.status, "failed"))
      .orderBy(desc(schema.integrationOutbox.updatedAt));
  }

  async getOutboxJobsByEntity(entityType: string, entityId: string): Promise<IntegrationOutbox[]> {
    return await db.select().from(schema.integrationOutbox)
      .where(and(
        eq(schema.integrationOutbox.entityType, entityType),
        eq(schema.integrationOutbox.entityId, entityId)
      ))
      .orderBy(desc(schema.integrationOutbox.createdAt));
  }

  async updateOutboxJob(id: string, data: Partial<IntegrationOutbox>): Promise<IntegrationOutbox | undefined> {
    const [job] = await db.update(schema.integrationOutbox)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.integrationOutbox.id, id))
      .returning();
    return job;
  }

  async getOutboxStats(): Promise<{ queued: number; processing: number; succeeded: number; failed: number; total: number }> {
    const result = await db.select({
      status: schema.integrationOutbox.status,
      count: sql<number>`count(*)`
    })
      .from(schema.integrationOutbox)
      .groupBy(schema.integrationOutbox.status);
    
    const stats = { queued: 0, processing: 0, succeeded: 0, failed: 0, total: 0 };
    for (const row of result) {
      const count = Number(row.count);
      stats.total += count;
      if (row.status === "queued") stats.queued = count;
      if (row.status === "processing") stats.processing = count;
      if (row.status === "succeeded") stats.succeeded = count;
      if (row.status === "failed") stats.failed = count;
    }
    return stats;
  }

  // ============================================================================
  // COMPANY PROFILE (SINGLETON)
  // ============================================================================

  async getCompanyProfile(): Promise<CompanyProfile | undefined> {
    const [profile] = await db.select().from(schema.companyProfile).limit(1);
    return profile;
  }

  async updateCompanyProfile(data: Partial<InsertCompanyProfile>): Promise<CompanyProfile | undefined> {
    // Get existing profile first
    const existing = await this.getCompanyProfile();
    if (!existing) {
      // Create if doesn't exist (singleton)
      const [profile] = await db.insert(schema.companyProfile).values(data as InsertCompanyProfile).returning();
      return profile;
    }
    // Update existing
    const [profile] = await db.update(schema.companyProfile)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.companyProfile.id, existing.id))
      .returning();
    return profile;
  }

  // ============================================================================
  // WAITLIST REQUESTS
  // ============================================================================

  async getWaitlistRequests(): Promise<WaitlistRequest[]> {
    return await db.select().from(schema.waitlistRequests).orderBy(desc(schema.waitlistRequests.createdAt));
  }

  async getWaitlistRequest(id: string): Promise<WaitlistRequest | undefined> {
    const [request] = await db.select().from(schema.waitlistRequests).where(eq(schema.waitlistRequests.id, id));
    return request;
  }

  async getWaitlistRequestByStatus(status: string): Promise<WaitlistRequest[]> {
    return await db.select().from(schema.waitlistRequests)
      .where(eq(schema.waitlistRequests.status, status))
      .orderBy(desc(schema.waitlistRequests.createdAt));
  }

  async getWaitingRequests(): Promise<WaitlistRequest[]> {
    return await db.select().from(schema.waitlistRequests)
      .where(eq(schema.waitlistRequests.status, "WAITING"))
      .orderBy(schema.waitlistRequests.createdAt);
  }

  async getWaitlistRequestByTokenHash(tokenHash: string): Promise<WaitlistRequest | undefined> {
    const [request] = await db.select().from(schema.waitlistRequests)
      .where(eq(schema.waitlistRequests.inviteTokenHash, tokenHash));
    return request;
  }

  async getActiveWaitlistRequest(email: string, packageType: string): Promise<WaitlistRequest | undefined> {
    const [request] = await db.select().from(schema.waitlistRequests)
      .where(and(
        eq(schema.waitlistRequests.email, email.toLowerCase()),
        eq(schema.waitlistRequests.packageType, packageType),
        or(
          eq(schema.waitlistRequests.status, "WAITING"),
          eq(schema.waitlistRequests.status, "INVITED")
        )
      ));
    return request;
  }

  async createWaitlistRequest(data: InsertWaitlistRequest): Promise<WaitlistRequest> {
    const [request] = await db.insert(schema.waitlistRequests).values(data).returning();
    return request;
  }

  async updateWaitlistRequest(id: string, data: Partial<WaitlistRequest>): Promise<WaitlistRequest | undefined> {
    const [request] = await db.update(schema.waitlistRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.waitlistRequests.id, id))
      .returning();
    return request;
  }
}

export const storage = new DatabaseStorage();
