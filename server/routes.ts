/**
 * API Routes for Elevizion OS
 * Thin controller layer - all business logic in storage/services
 */

import type { Express } from "express";
import { type Server } from "http";
import { z } from "zod";
import crypto from "crypto";
import { encryptToken, decryptToken, isTokenEncryptionEnabled } from "./tokenEncryption";
import { sql, desc, eq, and, or, isNull, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { emailLogs, contractDocuments, termsAcceptance, advertisers, portalTokens, claimPrefills, locations, screens, placements, adAssets, tagPolicies, e2eTestRuns, placementPlans, placementTargets, integrationOutbox } from "@shared/schema";
import { MAX_ADS_PER_SCREEN } from "@shared/regions";
import PDFDocument from "pdfkit";
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
  syncYodeckScreens,
  getYodeckConfigStatus,
} from "./integrations";
import {
  isEmailConfigured,
  sendContractEmail,
  sendSepaEmail,
  sendEmail,
  baseEmailTemplate,
  type BodyBlock,
} from "./email";
import { renderEmail, renderContract } from "./services/renderEngine";
import {
  generateSigningToken,
  hashToken,
  verifyToken,
  generateContractHtml,
  calculateExpirationDate,
  formatClientInfo,
} from "./contract-signing";
import { setupAuth, registerAuthRoutes, isAuthenticated, requirePermission, requireAdminAccess, hasAdminAccess } from "./replit_integrations/auth";
import { getScreenStats, getAdvertiserStats, clearStatsCache, checkYodeckScreenHasContent } from "./yodeckStats";
import { classifyMediaItems } from "./services/mediaClassifier";
import * as advertiserOnboarding from "./services/advertiserOnboarding";
import { clearBrandingCache } from "./companyBranding";
import { 
  getCityAvailability, 
  invalidateAvailabilityCache,
  getAvailabilityStats,
} from "./services/availabilityService";

// ============================================================================
// TEST MODE CONFIGURATION
// ============================================================================
export function isTestMode(): boolean {
  return process.env.TEST_MODE?.toLowerCase() === 'true';
}

export function getTokenTtlDays(): number {
  return isTestMode() ? 30 : 14; // Extended TTL in test mode
}

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
  
  // Mount Yodeck routes (mapping endpoints)
  const yodeckRouter = (await import("./routes/yodeck")).default;
  app.use("/api/yodeck", yodeckRouter);
  
  // ============================================================================
  // SEO & PUBLIC ROUTES (no auth required)
  // ============================================================================
  
  const SITE_URL = "https://elevizion.nl";
  
  // robots.txt
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain");
    res.send(`# Elevizion robots.txt
User-agent: *
Allow: /

# Block dashboard and API routes
Disallow: /dashboard
Disallow: /onboarding
Disallow: /screens
Disallow: /locations
Disallow: /advertisers
Disallow: /placements
Disallow: /finance
Disallow: /settings
Disallow: /content-inventory
Disallow: /yodeck
Disallow: /entities
Disallow: /sync-logs
Disallow: /email-center
Disallow: /data-health
Disallow: /api/
Disallow: /portal/
Disallow: /locatie-portal/

Sitemap: ${SITE_URL}/sitemap.xml
`);
  });
  
  // sitemap.xml
  app.get("/sitemap.xml", (_req, res) => {
    const lastmod = new Date().toISOString().split("T")[0];
    const cities = ["limburg", "sittard", "maastricht", "heerlen", "roermond", "venlo"];
    const cityUrls = cities.map(city => `
  <url>
    <loc>${SITE_URL}/regio/${city}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join("");
    
    res.type("application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${cityUrls}
  <url>
    <loc>${SITE_URL}/login</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`);
  });
  
  // Google Search Console verification (supports both HTML file and meta tag)
  app.get("/google:verificationId.html", (req, res) => {
    const verificationId = req.params.verificationId;
    res.type("text/html");
    res.send(`google-site-verification: google${verificationId}.html`);
  });
  
  // ============================================================================
  // WEBSITE LEADS (Public endpoints for lead capture forms)
  // ============================================================================
  
  // Rate limiting map for spam prevention
  const leadRateLimits = new Map<string, { count: number; resetAt: number }>();
  const LEAD_RATE_LIMIT = 5; // Max 5 leads per hour per IP
  const LEAD_RATE_WINDOW = 60 * 60 * 1000; // 1 hour
  
  function checkLeadRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = leadRateLimits.get(ip);
    if (!record || now > record.resetAt) {
      leadRateLimits.set(ip, { count: 1, resetAt: now + LEAD_RATE_WINDOW });
      return true;
    }
    if (record.count >= LEAD_RATE_LIMIT) {
      return false;
    }
    record.count++;
    return true;
  }
  
  // Advertiser lead schema with validation
  const advertiserLeadSchema = z.object({
    goal: z.enum(["Meer klanten", "Naamsbekendheid", "Actie promoten"]),
    region: z.string().min(1, "Regio is verplicht"),
    companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
    contactName: z.string().min(1, "Naam is verplicht"),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    budgetIndication: z.string().optional(),
    remarks: z.string().optional(),
    honeypot: z.string().optional(), // Spam trap - should be empty
  }).refine(data => data.phone || data.email, {
    message: "Vul minstens een telefoonnummer of e-mailadres in",
  });
  
  // Screen location lead schema with validation
  const screenLeadSchema = z.object({
    businessType: z.enum(["Kapper/Barbershop", "Gym/Sportschool", "Horeca", "Retail", "Overig"]),
    city: z.string().min(1, "Plaats is verplicht"),
    companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
    contactName: z.string().min(1, "Contactpersoon is verplicht"),
    phone: z.string().min(1, "Telefoonnummer is verplicht"),
    email: z.string().email().optional().or(z.literal("")),
    visitorsPerWeek: z.string().optional(),
    remarks: z.string().optional(),
    honeypot: z.string().optional(), // Spam trap - should be empty
  });
  
  // POST /api/leads/advertiser - Create advertiser lead
  app.post("/api/leads/advertiser", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      // Rate limit check
      if (!checkLeadRateLimit(ip)) {
        return res.status(429).json({ message: "Te veel aanvragen. Probeer het later opnieuw." });
      }
      
      // Validate input
      const result = advertiserLeadSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const data = result.data;
      
      // Honeypot check (spam trap)
      if (data.honeypot) {
        return res.status(200).json({ success: true }); // Silently accept spam
      }
      
      // Auto-determine category from company name
      const { inferLeadCategory } = await import("./services/leadCategoryService");
      const categoryResult = inferLeadCategory(data.companyName, data.remarks);
      
      // Insert into database using raw query (since we added tables directly)
      const { db } = await import("./db");
      const leadResult = await db.execute(sql`
        INSERT INTO advertiser_leads (goal, region, company_name, contact_name, phone, email, budget_indication, remarks, inferred_category)
        VALUES (${data.goal}, ${data.region}, ${data.companyName}, ${data.contactName}, ${data.phone || null}, ${data.email || null}, ${data.budgetIndication || null}, ${data.remarks || null}, ${categoryResult.category})
        RETURNING id
      `);
      
      // Get lead ID for internal reference
      const leadId = (leadResult.rows[0] as any)?.id;
      
      // INTERNAL: Send notification email to info@elevizion.nl (includes all fields + internal ref)
      const internalBlocks: BodyBlock[] = [
        { type: "paragraph", content: "Er is een nieuwe adverteerder lead binnengekomen via de website." },
        { 
          type: "infoCard", 
          rows: [
            { label: "Bedrijfsnaam", value: `<strong>${data.companyName}</strong>` },
            { label: "Contactpersoon", value: data.contactName },
            { label: "Telefoon", value: data.phone || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "E-mail", value: data.email || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "Doel", value: data.goal },
            { label: "Regio", value: data.region },
            { label: "Budget", value: data.budgetIndication || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "Opmerking", value: data.remarks || "<span style='color:#999;'>Geen</span>" },
            { label: "Interne referentie", value: `Lead #${leadId}` },
          ]
        },
      ];
      
      const { html: internalHtml, text: internalText } = baseEmailTemplate({
        subject: `Nieuwe lead: Adverteren – ${data.companyName}`,
        preheader: `Nieuwe adverteerder lead: ${data.companyName} (${data.region})`,
        title: "Nieuwe Lead Binnen",
        bodyBlocks: internalBlocks,
        cta: { label: "Open in Dashboard", url: `https://elevizion.nl/leads` },
      });
      
      await sendEmail({
        to: "info@elevizion.nl",
        subject: `Nieuwe lead: Adverteren – ${data.companyName}`,
        html: internalHtml,
        text: internalText,
        templateKey: "lead_advertiser_internal",
      });
      
      // CUSTOMER: Send confirmation email (clean, no internal IDs)
      if (data.email) {
        const customerBlocks: BodyBlock[] = [
          { type: "paragraph", content: `Hallo ${data.contactName},` },
          { type: "paragraph", content: "Bedankt voor je interesse in adverteren via Elevizion! We hebben je aanvraag ontvangen." },
          { 
            type: "infoCard", 
            rows: [
              { label: "Bedrijf", value: data.companyName },
              { label: "Regio", value: data.region },
            ]
          },
          { type: "paragraph", content: "<strong>Wat kun je verwachten?</strong>" },
          { type: "bullets", items: [
            "Binnen 1 werkdag nemen we contact met je op",
            "We bespreken je wensen en mogelijkheden",
            "Je ontvangt een vrijblijvend voorstel",
          ]},
          { type: "paragraph", content: "Heb je tussentijds vragen? Beantwoord gerust deze e-mail." },
        ];
        
        const { html: confirmHtml, text: confirmText } = baseEmailTemplate({
          subject: "We hebben je aanvraag ontvangen – Elevizion",
          preheader: "We nemen binnen 1 werkdag contact met je op.",
          title: "Aanvraag Ontvangen",
          bodyBlocks: customerBlocks,
          footerNote: "Je ontvangt deze e-mail omdat je een aanvraag hebt ingediend via elevizion.nl",
        });
        
        await sendEmail({
          to: data.email,
          subject: "We hebben je aanvraag ontvangen – Elevizion",
          html: confirmHtml,
          text: confirmText,
          templateKey: "lead_advertiser_confirmation",
        });
      }
      
      res.json({ success: true, message: "Bedankt! We nemen snel contact op." });
    } catch (error: any) {
      console.error("Error creating advertiser lead:", error);
      res.status(500).json({ message: "Er ging iets mis. Probeer het later opnieuw." });
    }
  });
  
  // POST /api/leads/screen-location - Create screen location lead
  app.post("/api/leads/screen-location", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      // Rate limit check
      if (!checkLeadRateLimit(ip)) {
        return res.status(429).json({ message: "Te veel aanvragen. Probeer het later opnieuw." });
      }
      
      // Validate input
      const result = screenLeadSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const data = result.data;
      
      // Honeypot check (spam trap)
      if (data.honeypot) {
        return res.status(200).json({ success: true }); // Silently accept spam
      }
      
      // Auto-determine category from company name and business type
      const { inferLeadCategory } = await import("./services/leadCategoryService");
      const categoryResult = inferLeadCategory(data.companyName, data.remarks);
      // For screen leads, use businessType as primary category if more confident
      const inferredCategory = data.businessType === "Overig" ? categoryResult.category : data.businessType.toLowerCase().replace(/\//g, "_");
      
      // Insert into database
      const { db } = await import("./db");
      const screenLeadResult = await db.execute(sql`
        INSERT INTO screen_leads (business_type, city, company_name, contact_name, phone, email, visitors_per_week, remarks, inferred_category)
        VALUES (${data.businessType}, ${data.city}, ${data.companyName}, ${data.contactName}, ${data.phone}, ${data.email || null}, ${data.visitorsPerWeek || null}, ${data.remarks || null}, ${inferredCategory})
        RETURNING id
      `);
      
      // Get lead ID for internal reference
      const screenLeadId = (screenLeadResult.rows[0] as any)?.id;
      
      // INTERNAL: Send notification email to info@elevizion.nl (includes all fields + internal ref)
      const screenInternalBlocks: BodyBlock[] = [
        { type: "paragraph", content: "Er is een nieuwe schermlocatie lead binnengekomen via de website." },
        { 
          type: "infoCard", 
          rows: [
            { label: "Bedrijfsnaam", value: `<strong>${data.companyName}</strong>` },
            { label: "Contactpersoon", value: data.contactName },
            { label: "Telefoon", value: data.phone },
            { label: "E-mail", value: data.email || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "Type zaak", value: data.businessType },
            { label: "Plaats", value: data.city },
            { label: "Bezoekers/week", value: data.visitorsPerWeek || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "Opmerking", value: data.remarks || "<span style='color:#999;'>Geen</span>" },
            { label: "Interne referentie", value: `Lead #${screenLeadId}` },
          ]
        },
      ];
      
      const { html: screenInternalHtml, text: screenInternalText } = baseEmailTemplate({
        subject: `Nieuwe lead: Schermlocatie – ${data.companyName}`,
        preheader: `Nieuwe schermlocatie lead: ${data.companyName} (${data.city})`,
        title: "Nieuwe Lead Binnen",
        bodyBlocks: screenInternalBlocks,
        cta: { label: "Open in Dashboard", url: `https://elevizion.nl/leads` },
      });
      
      await sendEmail({
        to: "info@elevizion.nl",
        subject: `Nieuwe lead: Schermlocatie – ${data.companyName}`,
        html: screenInternalHtml,
        text: screenInternalText,
        templateKey: "lead_screen_internal",
      });
      
      // CUSTOMER: Send confirmation email (clean, no internal IDs)
      if (data.email) {
        const screenCustomerBlocks: BodyBlock[] = [
          { type: "paragraph", content: `Hallo ${data.contactName},` },
          { type: "paragraph", content: "Bedankt voor je interesse in een digitaal scherm van Elevizion! We hebben je aanvraag ontvangen." },
          { 
            type: "infoCard", 
            rows: [
              { label: "Bedrijf", value: data.companyName },
              { label: "Plaats", value: data.city },
            ]
          },
          { type: "paragraph", content: "<strong>Wat kun je verwachten?</strong>" },
          { type: "bullets", items: [
            "Binnen 1 werkdag nemen we contact met je op",
            "We bespreken de mogelijkheden voor jouw locatie",
            "Je ontvangt een vrijblijvend voorstel",
          ]},
          { type: "paragraph", content: "Heb je tussentijds vragen? Beantwoord gerust deze e-mail." },
        ];
        
        const { html: screenConfirmHtml, text: screenConfirmText } = baseEmailTemplate({
          subject: "We hebben je aanvraag ontvangen – Elevizion",
          preheader: "We nemen binnen 1 werkdag contact met je op.",
          title: "Aanvraag Ontvangen",
          bodyBlocks: screenCustomerBlocks,
          footerNote: "Je ontvangt deze e-mail omdat je een aanvraag hebt ingediend via elevizion.nl",
        });
        
        await sendEmail({
          to: data.email,
          subject: "We hebben je aanvraag ontvangen – Elevizion",
          html: screenConfirmHtml,
          text: screenConfirmText,
          templateKey: "lead_screen_confirmation",
        });
      }
      
      res.json({ success: true, message: "Bedankt! We nemen snel contact op." });
    } catch (error: any) {
      console.error("Error creating screen lead:", error);
      res.status(500).json({ message: "Er ging iets mis. Probeer het later opnieuw." });
    }
  });

  // Contact form lead schema
  const contactLeadSchema = z.object({
    name: z.string().min(2, "Naam is verplicht"),
    company: z.string().optional(),
    email: z.string().email("Voer een geldig e-mailadres in"),
    phone: z.string().optional(),
    message: z.string().min(10, "Bericht moet minimaal 10 tekens bevatten"),
    honeypot: z.string().optional(),
  });

  // POST /api/public/contact-lead - Public contact form submission
  app.post("/api/public/contact-lead", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      if (!checkLeadRateLimit(ip)) {
        return res.status(429).json({ message: "Te veel aanvragen. Probeer het later opnieuw." });
      }
      
      const result = contactLeadSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const data = result.data;
      
      if (data.honeypot) {
        return res.status(200).json({ success: true });
      }
      
      const { db } = await import("./db");
      const leadResult = await db.execute(sql`
        INSERT INTO advertiser_leads (goal, region, company_name, contact_name, phone, email, remarks, inferred_category)
        VALUES ('Contact formulier', 'Onbekend', ${data.company || data.name}, ${data.name}, ${data.phone || null}, ${data.email}, ${data.message}, 'contact')
        RETURNING id
      `);
      
      const leadId = (leadResult.rows[0] as any)?.id;
      
      const contactInternalBlocks: BodyBlock[] = [
        { type: "paragraph", content: "Er is een nieuw contactformulier binnengekomen via de website." },
        { 
          type: "infoCard", 
          rows: [
            { label: "Naam", value: `<strong>${data.name}</strong>` },
            { label: "Bedrijf", value: data.company || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "E-mail", value: data.email },
            { label: "Telefoon", value: data.phone || "<span style='color:#999;'>Niet opgegeven</span>" },
            { label: "Bericht", value: data.message },
            { label: "Interne referentie", value: `Lead #${leadId}` },
          ]
        },
      ];
      
      const { html: contactHtml, text: contactText } = baseEmailTemplate({
        subject: `Nieuw contactformulier – ${data.name}`,
        preheader: `Nieuw bericht van ${data.name}`,
        title: "Nieuw Bericht",
        bodyBlocks: contactInternalBlocks,
        cta: { label: "Open in Dashboard", url: `https://elevizion.nl/leads` },
      });
      
      await sendEmail({
        to: "info@elevizion.nl",
        subject: `Nieuw contactformulier – ${data.name}`,
        html: contactHtml,
        text: contactText,
        templateKey: "contact_form_internal",
      });
      
      if (data.email) {
        const contactCustomerBlocks: BodyBlock[] = [
          { type: "paragraph", content: `Hallo ${data.name},` },
          { type: "paragraph", content: "Bedankt voor je bericht! We hebben je vraag ontvangen en nemen zo snel mogelijk contact met je op." },
          { type: "paragraph", content: "Meestal reageren we binnen 24 uur op werkdagen." },
          { type: "paragraph", content: "Heb je dringende vragen? Beantwoord gerust deze e-mail." },
        ];
        
        const { html: confirmHtml, text: confirmText } = baseEmailTemplate({
          subject: "We hebben je bericht ontvangen – Elevizion",
          preheader: "We nemen snel contact met je op.",
          title: "Bericht Ontvangen",
          bodyBlocks: contactCustomerBlocks,
          footerNote: "Je ontvangt deze e-mail omdat je het contactformulier hebt ingevuld op elevizion.nl",
        });
        
        await sendEmail({
          to: data.email,
          subject: "We hebben je bericht ontvangen – Elevizion",
          html: confirmHtml,
          text: confirmText,
          templateKey: "contact_form_confirmation",
        });
      }
      
      res.json({ success: true, message: "Bedankt voor je bericht! We nemen snel contact op." });
    } catch (error: any) {
      console.error("Error creating contact lead:", error);
      res.status(500).json({ message: "Er ging iets mis. Probeer het later opnieuw." });
    }
  });
  
  // ============================================================================
  // PUBLIC DOCUMENT ROUTES (No authentication required)
  // Serves legal documents for onboarding flows
  // ============================================================================
  
  app.get("/docs/algemene-voorwaarden", async (_req, res) => {
    try {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`
        <!DOCTYPE html>
        <html lang="nl">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Algemene Voorwaarden - Elevizion</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1, h2 { color: #1a1a2e; }
            h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
            h2 { margin-top: 30px; }
            p, li { margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <h1>Algemene Voorwaarden</h1>
          <p><strong>Elevizion B.V.</strong></p>
          <p>Laatste update: januari 2025</p>
          
          <h2>Artikel 1 - Definities</h2>
          <p>In deze algemene voorwaarden wordt verstaan onder:</p>
          <ul>
            <li><strong>Elevizion:</strong> Elevizion B.V., gevestigd te Nederland.</li>
            <li><strong>Adverteerder:</strong> De natuurlijke of rechtspersoon die een overeenkomst aangaat met Elevizion.</li>
            <li><strong>Diensten:</strong> De door Elevizion aangeboden digitale reclame-diensten op schermen.</li>
          </ul>
          
          <h2>Artikel 2 - Toepasselijkheid</h2>
          <p>Deze algemene voorwaarden zijn van toepassing op alle aanbiedingen, offertes en overeenkomsten tussen Elevizion en Adverteerder.</p>
          
          <h2>Artikel 3 - Prijzen en Betaling</h2>
          <p>Alle prijzen zijn exclusief BTW tenzij anders vermeld. Betaling geschiedt binnen 14 dagen na factuurdatum of via SEPA automatische incasso.</p>
          
          <h2>Artikel 4 - Contractduur</h2>
          <p>Overeenkomsten worden aangegaan voor de overeengekomen periode. Na afloop worden contracten automatisch verlengd tenzij schriftelijk opgezegd.</p>
          
          <h2>Artikel 5 - Aansprakelijkheid</h2>
          <p>Elevizion is niet aansprakelijk voor indirecte schade, gevolgschade of gederfde winst.</p>
          
          <h2>Artikel 6 - Toepasselijk Recht</h2>
          <p>Op alle overeenkomsten is Nederlands recht van toepassing.</p>
          
          <p style="margin-top: 40px; color: #666; font-size: 14px;">Voor vragen over deze voorwaarden kunt u contact opnemen via info@elevizion.nl</p>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Error serving algemene voorwaarden:", error);
      res.status(500).send("Document kon niet worden geladen");
    }
  });
  
  app.get("/docs/privacy", async (_req, res) => {
    try {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`
        <!DOCTYPE html>
        <html lang="nl">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Privacyverklaring - Elevizion</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1, h2 { color: #1a1a2e; }
            h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
            h2 { margin-top: 30px; }
          </style>
        </head>
        <body>
          <h1>Privacyverklaring</h1>
          <p><strong>Elevizion B.V.</strong></p>
          <p>Laatste update: januari 2025</p>
          
          <h2>1. Wie zijn wij?</h2>
          <p>Elevizion B.V. is verantwoordelijk voor de verwerking van persoonsgegevens zoals weergegeven in deze privacyverklaring.</p>
          
          <h2>2. Welke gegevens verzamelen wij?</h2>
          <p>Wij verwerken de volgende persoonsgegevens:</p>
          <ul>
            <li>Bedrijfsnaam en contactgegevens</li>
            <li>E-mailadres en telefoonnummer</li>
            <li>Factuur- en betalingsgegevens (IBAN)</li>
            <li>KvK-nummer en BTW-nummer</li>
          </ul>
          
          <h2>3. Waarom verwerken wij gegevens?</h2>
          <p>Wij verwerken persoonsgegevens voor:</p>
          <ul>
            <li>Het uitvoeren van onze dienstverlening</li>
            <li>Het afhandelen van betalingen</li>
            <li>Het verzenden van facturen en communicatie</li>
            <li>Het voldoen aan wettelijke verplichtingen</li>
          </ul>
          
          <h2>4. Bewaartermijn</h2>
          <p>Wij bewaren persoonsgegevens niet langer dan strikt noodzakelijk voor de doeleinden waarvoor ze zijn verzameld.</p>
          
          <h2>5. Uw rechten</h2>
          <p>U heeft recht op inzage, correctie en verwijdering van uw gegevens. Neem contact op via privacy@elevizion.nl.</p>
          
          <h2>6. Contact</h2>
          <p>Voor vragen over deze privacyverklaring kunt u contact opnemen via privacy@elevizion.nl.</p>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Error serving privacy policy:", error);
      res.status(500).send("Document kon niet worden geladen");
    }
  });
  
  app.get("/docs/sepa", async (_req, res) => {
    try {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`
        <!DOCTYPE html>
        <html lang="nl">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>SEPA Incassomachtiging - Elevizion</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1, h2 { color: #1a1a2e; }
            h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
            h2 { margin-top: 30px; }
            .info-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>SEPA Incassomachtiging</h1>
          <p><strong>Incassant:</strong> Elevizion B.V.</p>
          
          <div class="info-box">
            <p><strong>Wat is een SEPA machtiging?</strong></p>
            <p>Door het afgeven van een SEPA machtiging geeft u toestemming aan Elevizion B.V. om maandelijks het verschuldigde factuurbedrag automatisch van uw rekening af te schrijven.</p>
          </div>
          
          <h2>Voorwaarden</h2>
          <ul>
            <li>Het bedrag wordt rond de 1e van elke maand afgeschreven.</li>
            <li>U ontvangt voorafgaand aan elke incasso een factuur per e-mail.</li>
            <li>U kunt een onjuiste afschrijving binnen 8 weken terugvorderen bij uw bank.</li>
            <li>U kunt de machtiging op elk moment intrekken door contact op te nemen met Elevizion.</li>
          </ul>
          
          <h2>Uw rechten</h2>
          <p>Als u het niet eens bent met een afschrijving, kunt u deze laten terugboeken. Neem hiervoor binnen 8 weken na afschrijving contact op met uw bank.</p>
          
          <p style="margin-top: 40px; color: #666;">Voor vragen over incasso's kunt u contact opnemen via administratie@elevizion.nl</p>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Error serving SEPA info:", error);
      res.status(500).send("Document kon niet worden geladen");
    }
  });
  
  // ============================================================================
  // VERSION / BUILD INFO ENDPOINT
  // Returns build info for debugging deploy mismatches
  // ============================================================================
  const BUILD_TIME = new Date().toISOString();
  const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  
  app.get("/api/version", (_req, res) => {
    res.json({
      buildId: BUILD_ID,
      builtAt: BUILD_TIME,
      nodeEnv: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()),
    });
  });
  
  // ============================================================================
  // DYNAMIC REGIONS API (City-based from actual screen locations)
  // Shows "screens with space" - locations that have room for more ads
  // ============================================================================
  
  app.get("/api/regions/active", async (req, res) => {
    try {
      const debugMode = req.query.debug === "1";
      
      // Use the unified availability service (with caching)
      const cityAvailability = await getCityAvailability();
      
      // Add maxAdsPerScreen to each city for client-side use
      const regions = cityAvailability.map(city => ({
        code: city.code,
        label: city.label,
        screensTotal: city.screensTotal,
        screensWithSpace: city.screensWithSpace,
        screensFull: city.screensFull,
        maxAdsPerScreen: MAX_ADS_PER_SCREEN,
      }));
      
      // Debug mode: add diagnostic information
      if (debugMode) {
        // Filter counts at each step
        const locationsTotal = await db.select({ count: sql<number>`count(*)::int` })
          .from(locations);
        
        const locationsWithActiveTrue = await db.select({ count: sql<number>`count(*)::int` })
          .from(locations)
          .where(eq(locations.status, "active"));
        
        const locationsWithReadyTrue = await db.select({ count: sql<number>`count(*)::int` })
          .from(locations)
          .where(and(
            eq(locations.status, "active"),
            eq(locations.readyForAds, true)
          ));
        
        const locationsWithCityOrRegion = await db.select({ count: sql<number>`count(*)::int` })
          .from(locations)
          .where(and(
            eq(locations.status, "active"),
            eq(locations.readyForAds, true),
            or(
              and(isNotNull(locations.city), sql`${locations.city} != ''`),
              and(isNotNull(locations.regionCode), sql`${locations.regionCode} != ''`)
            )
          ));
        
        // Get sample of all locations to show exclusion reasons
        const allLocations = await db.select({
          id: locations.id,
          name: locations.name,
          city: locations.city,
          regionCode: locations.regionCode,
          status: locations.status,
          readyForAds: locations.readyForAds,
        })
          .from(locations)
          .limit(15);
        
        // Compute exclusion reasons
        const excludedLocations = allLocations.map(loc => {
          let exclusionReason = null;
          if (loc.status !== "active") {
            exclusionReason = "inactive";
          } else if (!loc.readyForAds) {
            exclusionReason = "not_ready_for_ads";
          } else if ((!loc.city || loc.city.trim() === "") && (!loc.regionCode || loc.regionCode.trim() === "")) {
            exclusionReason = "missing_city_and_region";
          }
          return {
            ...loc,
            exclusionReason,
            isIncluded: exclusionReason === null,
          };
        });
        
        // Count active placements
        const activePlacementsCount = await db.select({ count: sql<number>`count(*)::int` })
          .from(placements)
          .where(eq(placements.isActive, true));
        
        const debugInfo = {
          environment: {
            nodeEnv: process.env.NODE_ENV || "unknown",
            databaseHost: process.env.PGHOST ? `${process.env.PGHOST.substring(0, 20)}...` : "not_set",
            databaseName: process.env.PGDATABASE || "not_set",
          },
          filterCounts: {
            locationsTotal: locationsTotal[0]?.count || 0,
            locationsWithActiveTrue: locationsWithActiveTrue[0]?.count || 0,
            locationsWithReadyTrue: locationsWithReadyTrue[0]?.count || 0,
            locationsWithCityOrRegion: locationsWithCityOrRegion[0]?.count || 0,
            locationsConsideredSellable: locationsWithCityOrRegion[0]?.count || 0,
            placementsCountedAsActive: activePlacementsCount[0]?.count || 0,
          },
          sampleLocations: excludedLocations,
          maxAdsPerScreen: MAX_ADS_PER_SCREEN,
          timestamp: new Date().toISOString(),
        };
        
        return res.json({
          regions,
          debug: debugInfo,
        });
      }
      
      res.json(regions);
    } catch (error: any) {
      console.error("Error fetching active regions:", error);
      res.status(500).json({ message: "Fout bij ophalen van regio's" });
    }
  });
  
  // Debug endpoint for availability diagnostics (admin-only, temporary)
  app.get("/api/debug/availability", requirePermission("manage_users"), async (_req, res) => {
    try {
      // Get raw location counts for diagnosis
      const totalLocations = await db.select({ count: sql<number>`count(*)::int` })
        .from(locations);
      
      const activeLocations = await db.select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(eq(locations.status, "active"));
      
      const sellableLocations = await db.select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(and(
          eq(locations.status, "active"),
          eq(locations.readyForAds, true),
          isNotNull(locations.city),
          sql`${locations.city} != ''`
        ));
      
      const locationsMissingCity = await db.select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(and(
          eq(locations.status, "active"),
          eq(locations.readyForAds, true),
          or(isNull(locations.city), sql`${locations.city} = ''`)
        ));
      
      const locationsMissingReadyForAds = await db.select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(and(
          eq(locations.status, "active"),
          eq(locations.readyForAds, false)
        ));
      
      // Sample of locations with their flags
      const sampleLocations = await db.select({
        id: locations.id,
        name: locations.name,
        city: locations.city,
        regionCode: locations.regionCode,
        status: locations.status,
        readyForAds: locations.readyForAds,
      })
        .from(locations)
        .limit(15);
      
      // Get current availability from service
      const cityAvailability = await getCityAvailability();
      
      // Also count locations that would be included by the actual service query (city OR regionCode)
      const sellableWithRegionCode = await db.select({ count: sql<number>`count(*)::int` })
        .from(locations)
        .where(and(
          eq(locations.status, "active"),
          eq(locations.readyForAds, true),
          or(
            and(isNotNull(locations.city), sql`${locations.city} != ''`),
            and(isNotNull(locations.regionCode), sql`${locations.regionCode} != ''`)
          )
        ));
      
      res.json({
        timestamp: new Date().toISOString(),
        counts: {
          totalLocations: totalLocations[0]?.count || 0,
          activeLocations: activeLocations[0]?.count || 0,
          sellableLocations: sellableLocations[0]?.count || 0,
          sellableWithRegionCode: sellableWithRegionCode[0]?.count || 0,
          locationsMissingCity: locationsMissingCity[0]?.count || 0,
          locationsMissingReadyForAds: locationsMissingReadyForAds[0]?.count || 0,
          locationsIncludedInRegionsActiveQuery: sellableWithRegionCode[0]?.count || 0,
        },
        cityAvailability,
        sampleLocations,
        filters: {
          status: "active",
          readyForAds: true,
          cityOrRegionCodeNotEmpty: true,
        },
        maxAdsPerScreen: MAX_ADS_PER_SCREEN,
        note: "Locations are sellable if status=active AND readyForAds=true AND (city OR regionCode exists)",
      });
    } catch (error: any) {
      console.error("Error in availability debug:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Admin endpoint to fix location data (set readyForAds and city for specific locations)
  app.post("/api/admin/fix-location-availability", requirePermission("manage_users"), async (req, res) => {
    try {
      const { locationId, city, readyForAds } = req.body;
      
      if (!locationId) {
        return res.status(400).json({ error: "locationId is required" });
      }
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ error: "Location not found" });
      }
      
      const updates: Record<string, any> = {};
      if (city !== undefined) updates.city = city;
      if (readyForAds !== undefined) updates.readyForAds = readyForAds;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided. Provide city and/or readyForAds" });
      }
      
      await storage.updateLocation(locationId, updates);
      
      // Invalidate availability cache after update
      invalidateAvailabilityCache();
      
      const updated = await storage.getLocation(locationId);
      console.log(`[AdminFix] Updated location ${locationId}:`, updates);
      
      res.json({
        success: true,
        locationId,
        updates,
        location: {
          id: updated?.id,
          name: updated?.name,
          city: updated?.city,
          regionCode: updated?.regionCode,
          status: updated?.status,
          readyForAds: updated?.readyForAds,
        },
      });
    } catch (error: any) {
      console.error("Error fixing location availability:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // SELF-SERVICE START FLOW
  // ============================================================================
  
  const startFlowSchema = z.object({
    companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
    contactName: z.string().min(1, "Contactpersoon is verplicht"),
    email: z.string().email("Ongeldig e-mailadres"),
    phone: z.string().min(1, "Telefoonnummer is verplicht"),
    kvkNumber: z.string().regex(/^\d{8}$/, "KvK-nummer moet 8 cijfers zijn"),
    vatNumber: z.string().regex(/^NL\d{9}B\d{2}$/, "BTW-nummer moet formaat NL123456789B01 hebben"),
    businessCategory: z.string().min(1, "Type bedrijf is verplicht"),
    targetRegionCodes: z.array(z.string()).min(1, "Selecteer minimaal één regio"),
    addressLine1: z.string().min(1, "Adres is verplicht"),
    postalCode: z.string().regex(/^\d{4}\s?[A-Za-z]{2}$/, "Ongeldige postcode"),
    city: z.string().min(1, "Plaats is verplicht"),
    packageType: z.enum(["SINGLE", "TRIPLE", "TEN"]),
    // Optional prefillId for claim flow - used to mark prefill as consumed
    prefillId: z.string().optional(),
  });

  app.post("/api/start", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      if (!checkLeadRateLimit(ip)) {
        return res.status(429).json({ message: "Te veel aanvragen. Probeer het later opnieuw." });
      }
      
      // Normalize inputs before validation
      const body = req.body || {};
      const normalizedBody = {
        ...body,
        companyName: typeof body.companyName === "string" ? body.companyName.trim().replace(/\s+/g, " ") : body.companyName,
        contactName: typeof body.contactName === "string" ? body.contactName.trim() : body.contactName,
        email: typeof body.email === "string" ? body.email.toLowerCase().trim() : body.email,
        phone: typeof body.phone === "string" ? body.phone.trim() : body.phone,
        kvkNumber: typeof body.kvkNumber === "string" ? body.kvkNumber.replace(/\D/g, "") : body.kvkNumber,
        vatNumber: typeof body.vatNumber === "string" ? body.vatNumber.toUpperCase().replace(/\s/g, "") : body.vatNumber,
        postalCode: typeof body.postalCode === "string" ? body.postalCode.toUpperCase().replace(/\s/g, "") : body.postalCode,
        addressLine1: typeof body.addressLine1 === "string" ? body.addressLine1.trim() : body.addressLine1,
        city: typeof body.city === "string" ? body.city.trim() : body.city,
      };
      
      const result = startFlowSchema.safeParse(normalizedBody);
      if (!result.success) {
        // Return structured field errors
        const fieldErrors: Record<string, string> = {};
        for (const error of result.error.errors) {
          const field = error.path[0] as string;
          if (!fieldErrors[field]) {
            fieldErrors[field] = error.message;
          }
        }
        return res.status(400).json({ 
          message: Object.values(fieldErrors)[0],
          fieldErrors 
        });
      }
      
      const data = result.data;
      const normalizedEmail = data.email;
      const normalizedKvk = data.kvkNumber;
      const normalizedVat = data.vatNumber;
      
      // Validate prefillId if provided (claim flow) - consumption happens later
      let validatedPrefill: { id: string } | null = null;
      if (data.prefillId) {
        const prefill = await storage.getClaimPrefill(data.prefillId);
        
        if (!prefill) {
          return res.status(404).json({ 
            message: "Prefill niet gevonden. Start opnieuw via de wachtlijst link.",
            prefillExpired: true
          });
        }
        
        if (new Date() > new Date(prefill.expiresAt)) {
          return res.status(410).json({ 
            message: "Deze link is verlopen. Je staat weer op de wachtlijst en ontvangt automatisch een nieuwe uitnodiging zodra er plek is.",
            prefillExpired: true
          });
        }
        
        if (prefill.usedAt) {
          return res.status(410).json({ 
            message: "Deze aanvraag is al ingediend.",
            prefillExpired: true
          });
        }
        
        validatedPrefill = { id: prefill.id };
        // Note: consumption happens after all validations pass (capacity, duplicates)
      }
      
      const packagePrices: Record<string, { screens: number; price: number }> = {
        SINGLE: { screens: 1, price: 49.99 },
        TRIPLE: { screens: 3, price: 129.99 },
        TEN: { screens: 10, price: 299.99 },
      };
      const pkgInfo = packagePrices[data.packageType];
      
      // CAPACITY GATING: Check if there is available placement capacity
      const { capacityGateService } = await import("./services/capacityGateService");
      const capacityCheck = await capacityGateService.checkCapacity({
        packageType: data.packageType,
        businessCategory: data.businessCategory,
        competitorGroup: data.businessCategory, // Default to businessCategory
        targetRegionCodes: data.targetRegionCodes,
        videoDurationSeconds: 15,
      });
      
      if (!capacityCheck.isAvailable) {
        // Return structured response for client to show waitlist option
        return res.status(200).json({
          success: false,
          noCapacity: true,
          message: "Op dit moment is er niet genoeg plek in de gekozen regio's voor dit pakket.",
          availableSlotCount: capacityCheck.availableSlotCount,
          requiredCount: capacityCheck.requiredCount,
          topReasons: capacityCheck.topReasons,
          nextCheckAt: capacityCheck.nextCheckAt,
          // Pass back form data so client can offer waitlist option
          formData: {
            companyName: data.companyName,
            contactName: data.contactName,
            email: normalizedEmail,
            phone: data.phone,
            kvkNumber: normalizedKvk,
            vatNumber: normalizedVat,
            packageType: data.packageType,
            businessCategory: data.businessCategory,
            targetRegionCodes: data.targetRegionCodes,
          },
        });
      }
      
      const { db } = await import("./db");
      const existingByKvk = await db.query.advertisers.findFirst({
        where: eq(advertisers.kvkNumber, normalizedKvk),
      });
      
      let existingAdvertiser = existingByKvk;
      if (!existingAdvertiser) {
        const existingByEmailAndCompany = await db.query.advertisers.findFirst({
          where: and(
            eq(advertisers.email, normalizedEmail),
            eq(advertisers.companyName, data.companyName)
          ),
        });
        existingAdvertiser = existingByEmailAndCompany || null;
      }
      
      const generateLinkKey = (companyName: string): string => {
        const sanitized = companyName
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .substring(0, 20);
        const randomChars = crypto.randomBytes(3).toString("hex").toUpperCase();
        return `ADV-${sanitized}-${randomChars}`;
      };
      
      // Transaction: atomically consume prefill AND create/update advertiser
      // If prefill consumption fails (concurrent), throws error to abort transaction
      // If advertiser creation fails, prefill consumption is rolled back
      let advertiserId: string;
      
      const txResult = await db.transaction(async (tx) => {
        // Atomically consume prefill FIRST (inside transaction)
        if (validatedPrefill) {
          const [marked] = await tx.update(claimPrefills)
            .set({ usedAt: new Date() })
            .where(and(
              eq(claimPrefills.id, validatedPrefill.id),
              isNull(claimPrefills.usedAt)
            ))
            .returning();
          
          if (!marked) {
            // Race condition: another request consumed this prefill first
            throw { type: 'PREFILL_CONSUMED', message: 'Deze aanvraag is zojuist door een andere sessie ingediend.' };
          }
          console.log(`[StartFlow] Consumed prefill ${validatedPrefill.id} in transaction`);
        }
        
        // Create or update advertiser
        let txAdvertiserId: string;
        
        if (existingAdvertiser) {
          const preservedCompetitorGroup = existingAdvertiser.competitorGroup || data.businessCategory;
          
          await tx.update(advertisers)
            .set({
              companyName: data.companyName,
              contactName: data.contactName,
              email: normalizedEmail,
              phone: data.phone,
              kvkNumber: normalizedKvk,
              vatNumber: normalizedVat,
              street: data.addressLine1,
              zipcode: data.postalCode.toUpperCase(),
              city: data.city,
              country: "NL",
              businessCategory: data.businessCategory,
              competitorGroup: preservedCompetitorGroup,
              targetRegionCodes: data.targetRegionCodes,
              packageType: data.packageType,
              screensIncluded: pkgInfo.screens,
              packagePrice: pkgInfo.price.toString(),
              videoDurationSeconds: 15,
              onboardingStatus: existingAdvertiser.onboardingStatus === "INVITED" ? "DETAILS_SUBMITTED" : existingAdvertiser.onboardingStatus,
              source: "Website /start",
              updatedAt: new Date(),
            })
            .where(eq(advertisers.id, existingAdvertiser.id));
          txAdvertiserId = existingAdvertiser.id;
          console.log(`[StartFlow] Updated existing advertiser ${txAdvertiserId}`);
        } else {
          const linkKey = generateLinkKey(data.companyName);
          const [newAdvertiser] = await tx.insert(advertisers)
            .values({
              companyName: data.companyName,
              contactName: data.contactName,
              email: normalizedEmail,
              phone: data.phone,
              kvkNumber: normalizedKvk,
              vatNumber: normalizedVat,
              street: data.addressLine1,
              zipcode: data.postalCode.toUpperCase(),
              city: data.city,
              country: "NL",
              businessCategory: data.businessCategory,
              competitorGroup: data.businessCategory,
              targetRegionCodes: data.targetRegionCodes,
              packageType: data.packageType,
              screensIncluded: pkgInfo.screens,
              packagePrice: pkgInfo.price.toString(),
              videoDurationSeconds: 15,
              onboardingStatus: "DETAILS_SUBMITTED",
              assetStatus: "none",
              linkKey,
              linkKeyGeneratedAt: new Date(),
              source: "Website /start",
            })
            .returning();
          txAdvertiserId = newAdvertiser.id;
          console.log(`[StartFlow] Created new advertiser ${txAdvertiserId} with linkKey ${linkKey}`);
        }
        
        return { advertiserId: txAdvertiserId };
      });
      
      advertiserId = txResult.advertiserId;
      
      const existingTokens = await storage.getPortalTokensForAdvertiser(advertiserId);
      const activeToken = existingTokens.find(t => !t.usedAt && new Date(t.expiresAt) > new Date());
      
      let portalToken: string;
      if (activeToken) {
        const allTokens = await db.query.portalTokens.findMany({
          where: eq(portalTokens.advertiserId, advertiserId),
        });
        const validToken = allTokens.find(t => !t.usedAt && new Date(t.expiresAt) > new Date());
        portalToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(portalToken).digest("hex");
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        await db.insert(portalTokens).values({
          advertiserId,
          tokenHash,
          expiresAt,
        });
        console.log(`[StartFlow] Created new portal token for ${advertiserId}`);
      } else {
        portalToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(portalToken).digest("hex");
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        await db.insert(portalTokens).values({
          advertiserId,
          tokenHash,
          expiresAt,
        });
        console.log(`[StartFlow] Created new portal token for ${advertiserId}`);
      }
      
      try {
        const moneybirdClient = await getMoneybirdClient();
        if (moneybirdClient) {
          const advertiserRecord = await storage.getAdvertiser(advertiserId);
          if (advertiserRecord) {
            const mappedData = {
              company_name: advertiserRecord.companyName,
              firstname: advertiserRecord.contactName?.split(" ")[0] || "",
              lastname: advertiserRecord.contactName?.split(" ").slice(1).join(" ") || "",
              address1: advertiserRecord.street || "",
              zipcode: advertiserRecord.zipcode || "",
              city: advertiserRecord.city || "",
              country: "NL",
              email: advertiserRecord.email,
              phone: advertiserRecord.phone || "",
              chamber_of_commerce: advertiserRecord.kvkNumber || "",
              tax_number: advertiserRecord.vatNumber || "",
            };
            
            const { contact } = await moneybirdClient.createOrUpdateContact(
              advertiserRecord.moneybirdContactId || null,
              mappedData
            );
            
            await db.update(advertisers)
              .set({
                moneybirdContactId: contact.id,
                moneybirdSyncStatus: "synced",
                moneybirdLastSyncAt: new Date(),
              })
              .where(eq(advertisers.id, advertiserId));
            console.log(`[StartFlow] Moneybird contact synced for ${advertiserId}: ${contact.id}`);
          }
        }
      } catch (mbError: any) {
        console.error(`[StartFlow] Moneybird sync failed for ${advertiserId}:`, mbError.message);
        await db.update(advertisers)
          .set({
            moneybirdSyncStatus: "failed",
            moneybirdSyncError: mbError.message?.substring(0, 255) || "Unknown error",
          })
          .where(eq(advertisers.id, advertiserId));
      }
      
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const redirectUrl = `${baseUrl}/advertiser-onboarding/${portalToken}`;
      
      // Note: prefillId was atomically marked as used inside the transaction
      // along with advertiser creation for full transactional consistency
      
      res.json({ 
        success: true, 
        advertiserId,
        redirectUrl,
      });
    } catch (error: any) {
      // Handle PREFILL_CONSUMED error from transaction
      if (error?.type === 'PREFILL_CONSUMED') {
        return res.status(410).json({ 
          message: error.message,
          prefillExpired: true
        });
      }
      console.error("[StartFlow] Error:", error);
      res.status(500).json({ message: "Er ging iets mis. Probeer het later opnieuw." });
    }
  });

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

  app.get("/api/advertisers/:id/mail-history", async (req, res) => {
    try {
      const { getEmailHistoryForEntity, getLastEmailForEntity } = await import("./services/mailEventService");
      const [history, lastEmail] = await Promise.all([
        getEmailHistoryForEntity("advertiser", req.params.id),
        getLastEmailForEntity("advertiser", req.params.id),
      ]);
      res.json({ history, lastEmail });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get latest asset info for an advertiser (for approval status display)
  app.get("/api/advertisers/:id/latest-asset", async (req, res) => {
    try {
      const [latestAsset] = await db.select()
        .from(adAssets)
        .where(eq(adAssets.advertiserId, req.params.id))
        .orderBy(desc(adAssets.createdAt))
        .limit(1);
      
      if (!latestAsset) {
        return res.json(null);
      }
      
      res.json({
        id: latestAsset.id,
        fileName: latestAsset.storedFileName || latestAsset.originalFileName,
        approvalStatus: latestAsset.approvalStatus,
        validationStatus: latestAsset.validationStatus,
        rejectedReason: latestAsset.rejectedReason,
        rejectedDetails: latestAsset.rejectedDetails,
        rejectedAt: latestAsset.rejectedAt,
        approvedAt: latestAsset.approvedAt,
        createdAt: latestAsset.createdAt,
        durationSeconds: latestAsset.durationSeconds,
        width: latestAsset.width,
        height: latestAsset.height,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
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
      
      // Send welcome email (non-blocking, failure doesn't affect create)
      if (advertiser.email) {
        const { sendStepEmail } = await import("./emailSteps");
        sendStepEmail({
          step: "advertiser_created",
          toEmail: advertiser.email,
          entityType: "advertiser",
          entityId: advertiser.id,
          meta: {
            companyName: advertiser.companyName,
            contactName: advertiser.contactName,
          },
        }).catch(err => console.error("[Email] advertiser_created failed:", err));
      }
      
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
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      await storage.deleteAdvertiser(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      // Handle FK constraint errors
      if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('constraint')) {
        return res.status(409).json({ 
          message: "Kan niet verwijderen: er zijn nog gekoppelde items (plaatsingen/ads/facturatie)." 
        });
      }
      res.status(500).json({ message: error.message || "Fout bij verwijderen" });
    }
  });

  // SEPA Mandate PDF download
  app.get("/api/advertisers/:id/sepa-mandate-pdf", async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      if (!advertiser.sepaMandate || !advertiser.iban) {
        return res.status(400).json({ message: "Geen SEPA mandaat beschikbaar" });
      }
      
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        const filename = `SEPA-mandaat-${advertiser.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
      });
      
      // Generate PDF content
      doc.fontSize(20).font('Helvetica-Bold').text('SEPA Incasso Machtiging', { align: 'center' });
      doc.moveDown(2);
      
      doc.fontSize(12).font('Helvetica');
      doc.text('Door ondertekening van dit formulier geeft u toestemming aan Elevizion B.V. om doorlopende incasso-opdrachten te sturen naar uw bank om een bedrag van uw rekening af te schrijven.');
      doc.moveDown(1.5);
      
      doc.font('Helvetica-Bold').text('Gegevens incassant:');
      doc.font('Helvetica').text('Naam: Elevizion B.V.');
      doc.text('Incassant-ID: NL00ZZZ000000000000');
      doc.moveDown(1);
      
      doc.font('Helvetica-Bold').text('Gegevens betaler:');
      doc.font('Helvetica').text(`Bedrijfsnaam: ${advertiser.companyName}`);
      doc.text(`Rekeninghouder: ${advertiser.ibanAccountHolder || advertiser.contactName || advertiser.companyName}`);
      doc.text(`IBAN: ${advertiser.iban}`);
      if (advertiser.street) doc.text(`Adres: ${advertiser.street}`);
      if (advertiser.zipcode && advertiser.city) doc.text(`${advertiser.zipcode} ${advertiser.city}`);
      doc.moveDown(1);
      
      doc.font('Helvetica-Bold').text('Mandaatgegevens:');
      doc.font('Helvetica');
      doc.text(`Mandaatreferentie: ${advertiser.sepaMandateReference || 'N.v.t.'}`);
      doc.text(`Datum akkoord: ${advertiser.sepaMandateDate ? new Date(advertiser.sepaMandateDate).toLocaleDateString('nl-NL') : new Date().toLocaleDateString('nl-NL')}`);
      doc.moveDown(1.5);
      
      doc.font('Helvetica-Bold').text('Verklaring:');
      doc.font('Helvetica').text('Ondergetekende geeft hierbij toestemming voor automatische incasso van verschuldigde bedragen door Elevizion B.V. conform de SEPA Europese incassorichtlijnen.');
      doc.moveDown(2);
      
      doc.text(`Datum: ${new Date().toLocaleDateString('nl-NL')}`);
      doc.moveDown(2);
      doc.text('Handtekening: ____________________________');
      
      doc.end();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // ADVERTISER PORTAL (Quick Create + Self-Service Onboarding)
  // ============================================================================

  // Quick create advertiser with minimal fields + generate portal link
  app.post("/api/advertisers/quick-create", async (req, res) => {
    try {
      const quickCreateSchema = z.object({
        companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
        email: z.string().email("Geldig e-mailadres is verplicht"),
        contactName: z.string().optional(),
      });
      
      const data = quickCreateSchema.parse(req.body);
      
      // Create advertiser with draft status (use placeholder for contactName if not provided)
      const advertiser = await storage.createAdvertiser({
        companyName: data.companyName,
        email: data.email,
        contactName: data.contactName || "(in te vullen via portal)",
        onboardingStatus: "draft",
        source: "quick_create",
      });
      
      // Generate portal token (valid for 7 days)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await storage.createPortalToken({
        advertiserId: advertiser.id,
        tokenHash,
        expiresAt,
      });
      
      // Build portal URL using request origin for correct absolute URL
      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (req.headers.host ? `https://${req.headers.host}` : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const portalUrl = `${baseUrl}/portal/${rawToken}`;
      
      // NOTE: No email is sent here - user must explicitly click "Send Email" button
      console.log(`[Portal] Link created for advertiser ${advertiser.id}, NO email sent (awaiting explicit action)`);
      
      res.status(201).json({
        advertiser,
        portalUrl,
        expiresAt,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Send portal invite email (explicit action - idempotent)
  app.post("/api/advertisers/:id/send-portal-email", async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }

      if (!advertiser.email) {
        return res.status(400).json({ message: "Adverteerder heeft geen e-mailadres" });
      }

      // Check if already sent (idempotent)
      if (advertiser.inviteEmailSentAt) {
        return res.status(200).json({ 
          message: "Uitnodigingsmail was al eerder verstuurd",
          alreadySent: true,
          sentAt: advertiser.inviteEmailSentAt 
        });
      }

      // Get active portal token
      const tokens = await storage.getPortalTokensForAdvertiser(advertiser.id);
      const activeToken = tokens.find(t => !t.usedAt && new Date(t.expiresAt) > new Date());
      
      if (!activeToken) {
        return res.status(400).json({ message: "Geen actieve portal link gevonden. Maak eerst een nieuwe link aan." });
      }

      // Reconstruct portal URL (we need to find the raw token - but we only have hash)
      // Generate new token for email
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await storage.createPortalToken({
        advertiserId: advertiser.id,
        tokenHash,
        expiresAt,
      });

      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (req.headers.host ? `https://${req.headers.host}` : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const portalUrl = `${baseUrl}/portal/${rawToken}`;

      // Send the email
      const contactName = advertiser.contactName || advertiser.companyName || "Klant";
      await sendEmail({
        to: advertiser.email,
        subject: "Vul je gegevens in voor Elevizion",
        templateKey: "portal_invite",
        entityType: "advertiser",
        entityId: advertiser.id,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
              <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
              <h2 style="color: #1e3a5f; margin-top: 0;">Welkom bij Elevizion!</h2>
              <p>Beste ${contactName},</p>
              <p>Om uw schermreclame te activeren hebben wij enkele gegevens van u nodig. Klik op onderstaande knop om uw gegevens in te vullen:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Gegevens Invullen</a>
              </div>
              <p style="font-size: 12px; color: #666;">Deze link is 7 dagen geldig.</p>
              <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
            </div>
          </div>
        `,
        text: `Beste ${contactName},\n\nOm uw schermreclame te activeren hebben wij enkele gegevens van u nodig.\n\nKlik op deze link om uw gegevens in te vullen: ${portalUrl}\n\nDeze link is 7 dagen geldig.\n\nMet vriendelijke groet,\nTeam Elevizion`,
      });

      // Mark as sent
      await storage.updateAdvertiser(advertiser.id, {
        inviteEmailSentAt: new Date(),
        onboardingStatus: "invited",
      });

      console.log(`[Portal] Invite email sent to advertiser ${advertiser.id} at ${advertiser.email}`);

      res.json({ 
        message: "Uitnodigingsmail verstuurd",
        sentAt: new Date(),
        portalUrl,
      });
    } catch (error: any) {
      console.error(`[Portal] Send invite email failed:`, error.message);
      res.status(500).json({ message: error.message });
    }
  });

  // Get advertiser data via portal token (public endpoint)
  app.get("/api/portal/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken) {
        return res.status(404).json({ message: "Link niet gevonden of verlopen" });
      }
      
      if (portalToken.usedAt) {
        return res.status(410).json({ message: "Deze link is al gebruikt" });
      }
      
      if (new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Deze link is verlopen" });
      }
      
      const advertiser = await storage.getAdvertiser(portalToken.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      // Return only fields needed for portal form
      res.json({
        id: advertiser.id,
        companyName: advertiser.companyName,
        contactName: advertiser.contactName,
        email: advertiser.email,
        phone: advertiser.phone,
        street: advertiser.street,
        zipcode: advertiser.zipcode,
        city: advertiser.city,
        country: advertiser.country,
        kvkNumber: advertiser.kvkNumber,
        vatNumber: advertiser.vatNumber,
        iban: advertiser.iban,
        ibanAccountHolder: advertiser.ibanAccountHolder,
        sepaMandate: advertiser.sepaMandate,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Submit portal form (public endpoint)
  app.post("/api/portal/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken) {
        return res.status(404).json({ message: "Link niet gevonden of verlopen" });
      }
      
      if (portalToken.usedAt) {
        return res.status(410).json({ message: "Deze link is al gebruikt" });
      }
      
      if (new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Deze link is verlopen" });
      }
      
      // Mark token as used FIRST to prevent race conditions (optimistic locking)
      await storage.markPortalTokenUsed(portalToken.id);
      
      const portalSubmitSchema = z.object({
        companyName: z.string().min(1),
        contactName: z.string().optional().nullable(),
        email: z.string().email(),
        phone: z.string().optional().nullable(),
        street: z.string().optional().nullable(),
        zipcode: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        country: z.string().optional().nullable(),
        kvkNumber: z.string().optional().nullable(),
        vatNumber: z.string().optional().nullable(),
        iban: z.string().optional().nullable(),
        ibanAccountHolder: z.string().optional().nullable(),
        sepaMandate: z.boolean().optional().nullable(),
      });
      
      const data = portalSubmitSchema.parse(req.body);
      
      // Update advertiser with portal data
      const updatedAdvertiser = await storage.updateAdvertiser(portalToken.advertiserId, {
        ...data,
        onboardingStatus: "completed",
      });
      
      // Auto-link to Moneybird if all required fields are present
      let moneybirdLinked = false;
      if (updatedAdvertiser && 
          updatedAdvertiser.companyName && 
          updatedAdvertiser.email && 
          updatedAdvertiser.street && 
          updatedAdvertiser.zipcode && 
          updatedAdvertiser.city) {
        try {
          const moneybirdClient = await getMoneybirdClient();
          if (moneybirdClient) {
            const contactData = {
              company_name: updatedAdvertiser.companyName,
              firstname: updatedAdvertiser.contactName?.split(' ')[0] || undefined,
              lastname: updatedAdvertiser.contactName?.split(' ').slice(1).join(' ') || undefined,
              address1: updatedAdvertiser.street || undefined,
              zipcode: updatedAdvertiser.zipcode || undefined,
              city: updatedAdvertiser.city || undefined,
              country: updatedAdvertiser.country || 'NL',
              phone: updatedAdvertiser.phone || undefined,
              email: updatedAdvertiser.email,
              chamber_of_commerce: updatedAdvertiser.kvkNumber || undefined,
              tax_number: updatedAdvertiser.vatNumber || undefined,
            };
            
            const { contact } = await moneybirdClient.createOrUpdateContact(
              updatedAdvertiser.moneybirdContactId || null,
              contactData
            );
            
            // Update advertiser with Moneybird contact ID
            await storage.updateAdvertiser(updatedAdvertiser.id, {
              moneybirdContactId: contact.id,
              moneybirdSyncStatus: 'synced',
            });
            moneybirdLinked = true;
          }
        } catch (mbError: any) {
          console.error('[Portal] Moneybird auto-link failed:', mbError.message);
          // Log error to advertiser but don't fail the request
          await storage.updateAdvertiser(updatedAdvertiser.id, {
            moneybirdSyncStatus: 'failed',
            moneybirdSyncError: mbError.message?.substring(0, 255) || 'Unknown error',
          });
        }
      }
      
      // Send emails (idempotent using timestamps)
      let confirmationEmailSent = false;
      let whatnowEmailSent = false;
      const contactName = updatedAdvertiser?.contactName || updatedAdvertiser?.companyName || "Klant";
      
      if (updatedAdvertiser && updatedAdvertiser.email) {
        // 1. Send confirmation email (if not already sent)
        if (!updatedAdvertiser.confirmationEmailSentAt) {
          try {
            await sendEmail({
              to: updatedAdvertiser.email,
              subject: "Gegevens ontvangen – Elevizion",
              templateKey: "onboarding_confirmation",
              entityType: "advertiser",
              entityId: updatedAdvertiser.id,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
                    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
                  </div>
                  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
                    <h2 style="color: #1e3a5f; margin-top: 0;">Bedankt!</h2>
                    <p>Beste ${contactName},</p>
                    <p>Wij hebben uw gegevens in goede orde ontvangen en opgeslagen.</p>
                    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
                  </div>
                  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                    <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
                  </div>
                </div>
              `,
              text: `Beste ${contactName},\n\nWij hebben uw gegevens in goede orde ontvangen en opgeslagen.\n\nMet vriendelijke groet,\nTeam Elevizion`,
            });
            await storage.updateAdvertiser(updatedAdvertiser.id, { confirmationEmailSentAt: new Date() });
            confirmationEmailSent = true;
            console.log(`[Portal] Confirmation email sent to advertiser ${updatedAdvertiser.id}`);
          } catch (emailError: any) {
            console.error('[Portal] Confirmation email failed:', emailError.message);
          }
        }

        // 2. Send "What Now" email with instructions (if not already sent)
        if (!updatedAdvertiser.whatnowEmailSentAt) {
          try {
            await sendEmail({
              to: updatedAdvertiser.email,
              subject: "Wat nu? Stuur je bestanden naar Elevizion",
              templateKey: "onboarding_whatnow",
              entityType: "advertiser",
              entityId: updatedAdvertiser.id,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
                    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
                  </div>
                  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
                    <h2 style="color: #1e3a5f; margin-top: 0;">Wat nu?</h2>
                    <p>Beste ${contactName},</p>
                    <p>Om uw advertentie te kunnen maken hebben wij de volgende bestanden van u nodig:</p>
                    <ul style="padding-left: 20px; margin: 15px 0;">
                      <li>Uw bedrijfsvideo (indien beschikbaar)</li>
                      <li>Uw logo (hoge resolutie)</li>
                      <li>Teksten voor de advertentie</li>
                      <li>Eventuele specifieke wensen of opmerkingen</li>
                    </ul>
                    <div style="background: #fff; border: 2px solid #f8a12f; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                      <p style="margin: 0; font-weight: bold; color: #1e3a5f;">Mail uw bestanden naar:</p>
                      <a href="mailto:info@elevizion.nl" style="color: #f8a12f; font-size: 18px; text-decoration: none; font-weight: bold;">info@elevizion.nl</a>
                      <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">Vermeld uw bedrijfsnaam in het onderwerp</p>
                    </div>
                    <p>Zodra we alles binnen hebben, maken we de advertentie en nemen we contact op als er vragen zijn.</p>
                    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
                  </div>
                  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                    <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
                  </div>
                </div>
              `,
              text: `Beste ${contactName},\n\nOm uw advertentie te kunnen maken hebben wij de volgende bestanden van u nodig:\n- Uw bedrijfsvideo (indien beschikbaar)\n- Uw logo (hoge resolutie)\n- Teksten voor de advertentie\n- Eventuele specifieke wensen of opmerkingen\n\nMail uw bestanden naar: info@elevizion.nl\nVermeld uw bedrijfsnaam in het onderwerp.\n\nZodra we alles binnen hebben, maken we de advertentie en nemen we contact op als er vragen zijn.\n\nMet vriendelijke groet,\nTeam Elevizion`,
            });
            await storage.updateAdvertiser(updatedAdvertiser.id, { whatnowEmailSentAt: new Date() });
            whatnowEmailSent = true;
            console.log(`[Portal] What-now email sent to advertiser ${updatedAdvertiser.id}`);
          } catch (emailError: any) {
            console.error('[Portal] What-now email failed:', emailError.message);
          }
        }
      }
      
      res.json({
        message: "Gegevens succesvol opgeslagen",
        advertiser: updatedAdvertiser,
        moneybirdLinked,
        confirmationEmailSent,
        whatnowEmailSent,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Resend portal link (generate new token)
  app.post("/api/advertisers/:id/resend-portal", async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      // Generate new portal token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await storage.createPortalToken({
        advertiserId: advertiser.id,
        tokenHash,
        expiresAt,
      });
      
      // Update status to invited
      await storage.updateAdvertiser(advertiser.id, {
        onboardingStatus: "invited",
      });
      
      // Build portal URL using request origin for correct absolute URL
      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (req.headers.host ? `https://${req.headers.host}` : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const portalUrl = `${baseUrl}/portal/${rawToken}`;
      
      res.json({
        portalUrl,
        expiresAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Regenerate upload link for advertiser
  app.post("/api/advertisers/:id/regenerate-upload-link", isAuthenticated, async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      // Check if advertiser has a linkKey (required for upload portal)
      if (!advertiser.linkKey) {
        return res.status(400).json({ message: "Adverteerder heeft geen linkKey. Upload portal niet beschikbaar." });
      }
      
      // Generate new portal token with extended TTL in TEST_MODE
      const testModeEnabled = isTestMode();
      const ttlDays = getTokenTtlDays();
      
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
      
      await storage.createPortalToken({
        advertiserId: advertiser.id,
        tokenHash,
        expiresAt,
      });
      
      // Build upload portal URL
      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (req.headers.host ? `https://${req.headers.host}` : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const uploadUrl = `${baseUrl}/upload/${rawToken}`;
      
      console.log(`[Admin] Regenerated upload link for advertiser ${advertiser.id}:`, {
        advertiserId: advertiser.id,
        companyName: advertiser.companyName,
        expiresAt: expiresAt.toISOString(),
        testMode: testModeEnabled,
      });
      
      res.json({
        uploadUrl,
        expiresAt,
        ttlDays,
        testMode: testModeEnabled,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // ADVERTISER ONBOARDING (New Multi-Step Flow)
  // ============================================================================

  app.post("/api/advertiser-onboarding/invite", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        companyName: z.string().min(1),
        email: z.string().email(),
      });
      const { companyName, email } = schema.parse(req.body);
      
      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      
      const result = await advertiserOnboarding.inviteAdvertiser(companyName, email, baseUrl);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/advertiser-onboarding/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken) {
        return res.status(404).json({ message: "Link niet gevonden" });
      }
      
      if (portalToken.usedAt) {
        return res.status(410).json({ message: "Deze link is al gebruikt" });
      }
      
      if (new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Deze link is verlopen" });
      }
      
      const advertiser = await storage.getAdvertiser(portalToken.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      res.json({
        advertiserId: advertiser.id,
        companyName: advertiser.companyName,
        contactName: advertiser.contactName,
        email: advertiser.email,
        phone: advertiser.phone,
        street: advertiser.street,
        zipcode: advertiser.zipcode,
        city: advertiser.city,
        country: advertiser.country,
        kvkNumber: advertiser.kvkNumber,
        vatNumber: advertiser.vatNumber,
        iban: advertiser.iban,
        ibanAccountHolder: advertiser.ibanAccountHolder,
        onboardingStatus: advertiser.onboardingStatus,
        packageType: advertiser.packageType,
        screensIncluded: advertiser.screensIncluded,
        packagePrice: advertiser.packagePrice,
        linkKey: advertiser.linkKey,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/advertiser-onboarding/:token/details", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken || portalToken.usedAt || new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Ongeldige of verlopen link" });
      }

      const schema = z.object({
        companyName: z.string().min(1),
        contactName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        street: z.string().optional(),
        zipcode: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        vatNumber: z.string().optional(),
        kvkNumber: z.string().optional(),
        iban: z.string().optional(),
        ibanAccountHolder: z.string().optional(),
      });

      const details = schema.parse(req.body);
      const result = await advertiserOnboarding.submitAdvertiserDetails(portalToken.advertiserId, details);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/advertiser-onboarding/:token/package", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken || portalToken.usedAt || new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Ongeldige of verlopen link" });
      }

      const schema = z.object({
        packageType: z.enum(["SINGLE", "TRIPLE", "TEN", "CUSTOM"]),
        customNotes: z.string().optional(),
      });

      const { packageType, customNotes } = schema.parse(req.body);
      const result = await advertiserOnboarding.selectPackage(
        portalToken.advertiserId,
        packageType as advertiserOnboarding.PackageType,
        customNotes
      );
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/advertiser-onboarding/:token/send-otp", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken || portalToken.usedAt || new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Ongeldige of verlopen link" });
      }

      const result = await advertiserOnboarding.sendAcceptanceOtp(portalToken.advertiserId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true, message: "Bevestigingscode verzonden per e-mail" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/advertiser-onboarding/:token/verify-otp", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const portalToken = await storage.getPortalTokenByHash(tokenHash);
      
      if (!portalToken || new Date() > new Date(portalToken.expiresAt)) {
        return res.status(410).json({ message: "Ongeldige of verlopen link" });
      }

      const schema = z.object({
        otpCode: z.string().length(6),
        acceptedTerms: z.boolean(),
        acceptedPrivacy: z.boolean(),
        acceptedSepa: z.boolean(),
      });

      const { otpCode, acceptedTerms, acceptedPrivacy, acceptedSepa } = schema.parse(req.body);
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await advertiserOnboarding.verifyAcceptanceOtp(
        portalToken.advertiserId,
        otpCode,
        ip,
        userAgent,
        acceptedTerms,
        acceptedPrivacy,
        acceptedSepa
      );
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      await storage.markPortalTokenUsed(portalToken.id);

      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      
      await advertiserOnboarding.transitionToReadyForAsset(portalToken.advertiserId, baseUrl);

      res.json({ success: true, message: "Akkoord bevestigd!" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/advertisers/:id/onboarding-progress", isAuthenticated, async (req, res) => {
    try {
      const progress = await advertiserOnboarding.getOnboardingProgress(req.params.id);
      if (!progress) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      res.json(progress);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/advertisers/:id/mark-asset-received", isAuthenticated, async (req, res) => {
    try {
      const result = await advertiserOnboarding.markAssetReceived(req.params.id);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/advertisers/:id/mark-live", isAuthenticated, async (req, res) => {
    try {
      const result = await advertiserOnboarding.markLive(req.params.id);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Bundled PDF download endpoint for advertisers
  app.get("/api/advertisers/:id/bundle.pdf", isAuthenticated, async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      if (!advertiser.bundledPdfUrl) {
        return res.status(404).json({ message: "Bundel-PDF niet beschikbaar" });
      }
      res.redirect(advertiser.bundledPdfUrl);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate bundled PDF for advertiser (manual trigger)
  app.post("/api/advertisers/:id/generate-bundle", isAuthenticated, async (req, res) => {
    try {
      const { generateContractBundle, getAdvertiserBundleContext } = await import("./services/contractBundleService");
      const context = await getAdvertiserBundleContext(req.params.id);
      if (!context) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      const result = await generateContractBundle(context);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true, bundledPdfUrl: result.bundledPdfUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // AD ASSET UPLOAD ENDPOINTS
  // ============================================================================

  // Get video specs for advertiser (dashboard)
  app.get("/api/advertisers/:id/video-specs", isAuthenticated, async (req, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      const { getVideoSpecsForDuration, formatVideoSpecsForDisplay, DEFAULT_VIDEO_SPECS } = await import("./services/videoMetadataService");
      const duration = advertiser.videoDurationSeconds || 15;
      const specs = getVideoSpecsForDuration(duration);
      res.json({
        specs,
        duration,
        displayText: formatVideoSpecsForDisplay(specs, duration),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get ad assets for advertiser (dashboard)
  app.get("/api/advertisers/:id/ad-assets", isAuthenticated, async (req, res) => {
    try {
      const { getAdAssetsByAdvertiser } = await import("./services/adAssetUploadService");
      const assets = await getAdAssetsByAdvertiser(req.params.id);
      res.json(assets);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark ad asset as ready for Yodeck (admin action)
  app.post("/api/ad-assets/:id/mark-ready", isAuthenticated, async (req, res) => {
    try {
      const { markAssetAsReady } = await import("./services/adAssetUploadService");
      const user = req.user as any;
      const success = await markAssetAsReady(req.params.id, user?.id, req.body.notes);
      if (!success) {
        return res.status(400).json({ message: "Kon asset niet klaarzetten" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete ad asset (admin action)
  app.delete("/api/ad-assets/:id", isAuthenticated, async (req, res) => {
    try {
      const { deleteAdAsset } = await import("./services/adAssetUploadService");
      const success = await deleteAdAsset(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Asset niet gevonden" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Stream video asset (admin only) - supports byte-range for video player seeking
  app.get("/api/ad-assets/:id/stream", isAuthenticated, async (req, res) => {
    try {
      const { getAdAssetById } = await import("./services/adAssetUploadService");
      const { ObjectStorageService } = await import("./objectStorage");
      
      const asset = await getAdAssetById(req.params.id);
      if (!asset) {
        console.log(`[AssetStream] Asset not found: ${req.params.id}`);
        return res.status(404).json({ message: "Asset niet gevonden" });
      }
      
      if (!asset.storagePath) {
        console.log(`[AssetStream] No storagePath for asset ${req.params.id}`);
        return res.status(404).json({ message: "Bestand niet gevonden in storage" });
      }
      
      console.log(`[AssetStream] assetId=${req.params.id} storagePath=${asset.storagePath} range=${req.headers.range || 'none'}`);
      
      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getFileByPath(asset.storagePath);
      
      if (!file) {
        console.log(`[AssetStream] File not found in storage: ${asset.storagePath}`);
        return res.status(404).json({ message: "Bestand niet gevonden" });
      }
      
      const [metadata] = await file.getMetadata();
      console.log(`[AssetStream] Streaming: size=${metadata.size} type=${metadata.contentType}`);
      
      await objectStorage.streamVideoWithRange(file, req, res);
    } catch (error: any) {
      console.error("[AssetStream] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Download video asset (admin only)
  app.get("/api/ad-assets/:id/download", isAuthenticated, async (req, res) => {
    try {
      const { getAdAssetById } = await import("./services/adAssetUploadService");
      const { ObjectStorageService } = await import("./objectStorage");
      
      const asset = await getAdAssetById(req.params.id);
      if (!asset) {
        return res.status(404).json({ message: "Asset niet gevonden" });
      }
      
      if (!asset.storagePath) {
        return res.status(404).json({ message: "Bestand niet gevonden in storage" });
      }
      
      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getFileByPath(asset.storagePath);
      
      if (!file) {
        return res.status(404).json({ message: "Bestand niet gevonden" });
      }
      
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Disposition": `attachment; filename="${asset.originalFileName}"`,
        "Content-Type": metadata.contentType || "video/mp4",
        "Content-Length": String(metadata.size),
      });
      
      const stream = file.createReadStream();
      stream.pipe(res);
    } catch (error: any) {
      console.error("[AdAsset] Download error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get single ad asset details (admin only)
  app.get("/api/ad-assets/:id", isAuthenticated, async (req, res) => {
    try {
      const { getAdAssetById } = await import("./services/adAssetUploadService");
      const asset = await getAdAssetById(req.params.id);
      if (!asset) {
        return res.status(404).json({ message: "Asset niet gevonden" });
      }
      res.json(asset);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // VIDEO REVIEW QUEUE (ADMIN APPROVAL WORKFLOW)
  // ============================================================================

  // Get pending video review queue (ADMIN ONLY)
  app.get("/api/admin/video-review", requireAdminAccess, async (req: any, res) => {
    try {
      const { getPendingReviewAssets } = await import("./services/adAssetUploadService");
      const queue = await getPendingReviewAssets();
      res.json(queue);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Approve video asset (ADMIN ONLY)
  app.post("/api/admin/video-review/:id/approve", requireAdminAccess, async (req: any, res) => {
    try {
      const { approveAsset } = await import("./services/adAssetUploadService");
      const user = req.currentUser as any;
      const result = await approveAsset(req.params.id, user?.id || 'admin', req.body.notes);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Reject video asset (ADMIN ONLY)
  app.post("/api/admin/video-review/:id/reject", requireAdminAccess, async (req: any, res) => {
    try {
      const { rejectAsset, REJECTION_REASONS } = await import("./services/adAssetUploadService");
      const user = req.currentUser as any;
      const { reason, details } = req.body;
      
      if (!reason || !(reason in REJECTION_REASONS)) {
        return res.status(400).json({ 
          message: "Ongeldige afkeuringsreden",
          validReasons: Object.keys(REJECTION_REASONS),
        });
      }
      
      const result = await rejectAsset(req.params.id, user?.id || 'admin', reason, details);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get rejection reasons (for dropdown, ADMIN ONLY)
  app.get("/api/admin/video-review/rejection-reasons", requireAdminAccess, async (_req: any, res) => {
    const { REJECTION_REASONS } = await import("./services/adAssetUploadService");
    res.json(REJECTION_REASONS);
  });

  // Get proposal/preview of screens before approval (dry-run, no DB changes)
  // Includes auto-provisioning: if screens lack playlists, attempts to create them and re-simulates
  app.get("/api/admin/assets/:assetId/proposal", requireAdminAccess, async (req: any, res) => {
    try {
      const { getAdAssetById } = await import("./services/adAssetUploadService");
      const { placementEngine } = await import("./services/placementEngineService");
      const { ensureSellablePlaylistsForLocations } = await import("./services/playlistProvisioningService");
      
      const asset = await getAdAssetById(req.params.assetId);
      if (!asset) {
        return res.status(404).json({ message: "Asset niet gevonden" });
      }
      
      const advertiser = await storage.getAdvertiser(asset.advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      // Use actual asset duration for accurate capacity calculation
      const assetDuration = asset.durationSeconds 
        ? parseFloat(String(asset.durationSeconds)) 
        : (advertiser.videoDurationSeconds || 15);
      
      const simulationParams = {
        packageType: advertiser.packageType || "STARTER",
        businessCategory: advertiser.businessCategory || advertiser.category || "algemeen",
        competitorGroup: advertiser.competitorGroup || undefined,
        targetRegionCodes: advertiser.targetRegionCodes || [],
        videoDurationSeconds: assetDuration,
      };
      
      // First simulation pass
      let simulation = await placementEngine.dryRunSimulate(simulationParams);
      
      // Check if we have NO_PLAYLIST rejections that might be fixable
      // Run auto-provisioning whenever there are ANY NO_PLAYLIST rejections (not just when simulation fails)
      // This ensures all screens get proper playlists even when some matches already exist
      
      // provisioningReport is NEVER null - always provide diagnostic info
      interface ProvisioningAction {
        locationId: string;
        locationName: string;
        action: string;
        playlistId?: string;
        playlistName?: string;
        status: 'ok' | 'skipped' | 'failed';
        reason?: string;
      }
      
      const provisioningReport = {
        attempted: false,
        locationsChecked: 0,
        screensChecked: 0,
        actions: [] as ProvisioningAction[],
        summary: { created: 0, renamed: 0, fixed: 0, failed: 0, skipped: 0 },
      };
      
      const noPlaylistRejects = simulation.rejectedLocations.filter(r => r.reason === 'NO_PLAYLIST');
      
      // Get all active locations for diagnostics
      const allActiveLocations = await storage.getActiveLocations();
      const targetRegions = advertiser.targetRegionCodes || [];
      const anyRegion = targetRegions.length === 0;
      
      // Also get screens to check yodeckPlayerId availability
      const allScreens = await storage.getScreens();
      const screensWithYodeckId = allScreens.filter(s => s.yodeckPlayerId && s.isActive);
      
      provisioningReport.locationsChecked = allActiveLocations.length;
      provisioningReport.screensChecked = screensWithYodeckId.length;
      
      if (noPlaylistRejects.length > 0) {
        provisioningReport.attempted = true;
        console.log(`[Proposal] Found ${noPlaylistRejects.length} locations with NO_PLAYLIST, attempting auto-provisioning...`);
        
        // Check for locations that might need yodeckDeviceId synced from screens
        for (const loc of allActiveLocations) {
          if (!loc.yodeckDeviceId && loc.readyForAds) {
            // Try to find a screen linked to this location
            const linkedScreens = allScreens.filter(s => s.locationId === loc.id && s.yodeckPlayerId);
            if (linkedScreens.length > 0) {
              // Sync yodeckDeviceId from screen
              const screen = linkedScreens[0];
              console.log(`[Proposal] Syncing yodeckDeviceId from screen ${screen.screenId} to location ${loc.name}`);
              await storage.updateLocation(loc.id, { 
                yodeckDeviceId: screen.yodeckPlayerId,
                yodeckStatus: 'linked'
              });
              // Update local reference
              loc.yodeckDeviceId = screen.yodeckPlayerId;
              
              provisioningReport.actions.push({
                locationId: loc.id,
                locationName: loc.name,
                action: 'SYNCED_DEVICE_ID',
                status: 'ok',
                reason: `Synced from screen ${screen.screenId}`,
              });
              provisioningReport.summary.fixed++;
            } else {
              provisioningReport.actions.push({
                locationId: loc.id,
                locationName: loc.name,
                action: 'NO_SCREEN_FOR_LOCATION',
                status: 'skipped',
                reason: 'Geen gekoppeld scherm met Yodeck ID gevonden',
              });
              provisioningReport.summary.skipped++;
            }
          }
        }
        
        // Now find candidate locations that need playlist provisioning
        const candidateLocationIds = allActiveLocations
          .filter(loc => {
            if (!loc.yodeckDeviceId) {
              // Already handled above, skip
              return false;
            }
            if (!loc.yodeckPlaylistId) return true; // Needs provisioning
            const effectiveRegion = loc.regionCode || (loc.city ? loc.city.toLowerCase() : null);
            return anyRegion || (effectiveRegion && targetRegions.includes(effectiveRegion));
          })
          .map(loc => loc.id);
        
        console.log(`[Proposal] Found ${candidateLocationIds.length} candidates for playlist provisioning`);
        
        if (candidateLocationIds.length > 0) {
          const provisionResult = await ensureSellablePlaylistsForLocations(candidateLocationIds);
          
          for (const [locId, result] of provisionResult.results) {
            const loc = allActiveLocations.find(l => l.id === locId);
            provisioningReport.actions.push({
              locationId: locId,
              locationName: loc?.name || locId,
              action: result.actionTaken,
              playlistId: result.playlistId || undefined,
              playlistName: result.playlistName || undefined,
              status: result.success ? 'ok' : 'failed',
              reason: result.error || result.warnings.join(', ') || undefined,
            });
            
            if (result.success) {
              if (result.actionTaken === 'PLAYLIST_CREATED') {
                provisioningReport.summary.created++;
              } else if (result.actionTaken === 'PLAYLIST_RENAMED') {
                provisioningReport.summary.renamed++;
              } else if (result.actionTaken !== 'NONE') {
                provisioningReport.summary.fixed++;
              }
            } else {
              provisioningReport.summary.failed++;
            }
          }
          
          // Re-run simulation after provisioning
          const totalActions = provisionResult.totalCreated + provisionResult.totalFixed;
          if (totalActions > 0) {
            console.log(`[Proposal] Re-running simulation after provisioning ${provisionResult.totalCreated} created, ${provisionResult.totalFixed} fixed`);
            simulation = await placementEngine.dryRunSimulate(simulationParams);
          }
        }
      }
      
      // Build response - fetch actual playlist names from Yodeck for accuracy
      const { getYodeckClient } = await import("./services/yodeckClient");
      const yodeckClient = await getYodeckClient();
      
      // Fetch playlist names for all selected locations with playlist IDs
      const playlistNameMap = new Map<string, string>();
      if (yodeckClient) {
        const playlistIds = simulation.selectedLocations
          .filter(loc => loc.yodeckPlaylistId)
          .map(loc => parseInt(loc.yodeckPlaylistId!, 10))
          .filter(id => !isNaN(id));
        
        // Fetch playlists in parallel (batch)
        const playlistPromises = playlistIds.map(async (id) => {
          try {
            const playlist = await yodeckClient.getPlaylist(id);
            if (playlist) {
              playlistNameMap.set(String(id), playlist.name);
            }
          } catch (e) {
            // Silently ignore fetch errors - graceful degradation
          }
        });
        await Promise.all(playlistPromises);
      }
      
      // Helper: compute effective playlist name with auto-playlist convention
      const getEffectivePlaylistName = (loc: typeof simulation.selectedLocations[0], actualName: string | null): string | null => {
        if (!loc.yodeckPlaylistId) return null;
        
        // If we have an actual name from Yodeck
        if (actualName) {
          // Check if it's a generic name that should be replaced with convention
          const lowerName = actualName.toLowerCase().trim();
          const genericPatterns = ['test', 'playlist', 'default', 'new playlist', 'untitled', 'demo'];
          const isGeneric = genericPatterns.some(g => 
            lowerName === g || 
            lowerName.startsWith(g + ' ') || 
            lowerName.endsWith(' ' + g) ||
            /^playlist\s*\d*$/i.test(lowerName) ||  // "Playlist 123"
            /^test\s*\d*$/i.test(lowerName)         // "Test 1"
          );
          
          if (isGeneric) {
            // Use auto-playlist convention
            const deviceId = (loc as any).yodeckDeviceId || loc.yodeckPlaylistId;
            return `${loc.name} (auto-playlist-${deviceId}-fit)`;
          }
          return actualName;
        }
        
        // Fallback: use auto-playlist naming convention
        const deviceId = (loc as any).yodeckDeviceId || loc.yodeckPlaylistId;
        return `${loc.name} (auto-playlist-${deviceId}-fit)`;
      };
      
      const matches = simulation.selectedLocations.map(loc => {
        const actualPlaylistName = loc.yodeckPlaylistId 
          ? (playlistNameMap.get(loc.yodeckPlaylistId) || null) 
          : null;
        
        return {
          locationId: loc.id,
          locationName: loc.name,
          city: loc.city || null,
          playlistId: loc.yodeckPlaylistId || null,
          playlistName: actualPlaylistName,
          effectivePlaylistName: getEffectivePlaylistName(loc, actualPlaylistName),
          score: loc.score,
          estimatedImpressionsPerMonth: Math.round((loc.expectedImpressionsPerWeek || 0) * 4.33),
          reasons: [
            loc.city ? `Stad: ${loc.city}` : null,
            `Capaciteit vrij`,
          ].filter(Boolean),
        };
      });
      
      // Determine failure reason if no matches - use provisioningReport for specific diagnostics
      let noCapacityReason: string | null = null;
      let nextSteps: string[] = [];
      
      if (!simulation.success || matches.length === 0) {
        const rejectionReasons = simulation.rejectedLocations.map(r => r.reason);
        const reasonCounts = rejectionReasons.reduce((acc, r) => {
          acc[r] = (acc[r] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        if (reasonCounts.NO_PLAYLIST > 0) {
          // Use provisioningReport to give more specific feedback
          const noScreenActions = provisioningReport.actions.filter(a => a.action === 'NO_SCREEN_FOR_LOCATION');
          const failedActions = provisioningReport.actions.filter(a => a.status === 'failed');
          
          if (noScreenActions.length > 0) {
            noCapacityReason = "Locaties zonder gekoppeld scherm in de database";
            nextSteps.push("Koppel schermen aan locaties in het Schermen-beheer");
          } else if (failedActions.length > 0) {
            noCapacityReason = "Playlist provisioning mislukt";
            const firstFail = failedActions[0];
            if (firstFail.reason) {
              nextSteps.push(`Fout: ${firstFail.reason}`);
            }
            nextSteps.push("Controleer Yodeck-integratie in Systeemstatus");
          } else if (provisioningReport.screensChecked === 0) {
            noCapacityReason = "Geen actieve schermen met Yodeck-koppeling";
            nextSteps.push("Synchroniseer schermen via Yodeck Sync in Systeemstatus");
          } else {
            noCapacityReason = "Locaties zonder playlist-mapping";
            nextSteps.push("Controleer of locaties yodeckDeviceId hebben ingesteld");
          }
        } else if (reasonCounts.REGION_MISMATCH > 0) {
          noCapacityReason = "Geen schermen in geselecteerde regio's";
          nextSteps.push("Voeg locaties toe in de doelregio's");
        } else if (reasonCounts.NO_CAPACITY > 0) {
          noCapacityReason = "Alle schermen zitten vol";
          nextSteps.push("Wacht tot er capaciteit vrijkomt");
        } else if (reasonCounts.COMPETITOR_CONFLICT > 0) {
          noCapacityReason = "Exclusiviteitsconflict met concurrent";
          nextSteps.push("Pas exclusiviteitsregels aan of kies andere regio's");
        } else {
          noCapacityReason = simulation.message || "Geen geschikte schermen gevonden";
          nextSteps.push("Controleer locatie-instellingen");
        }
      }
      
      // Derive unique cities from matches for region display
      const matchedCities = [...new Set(matches.map(m => m.city).filter(Boolean))];
      
      // Add debug info for admin diagnosis
      const locationsWithDeviceId = allActiveLocations.filter(l => l.yodeckDeviceId).length;
      const locationsWithPlaylistId = allActiveLocations.filter(l => l.yodeckPlaylistId).length;
      const readyForAdsLocations = allActiveLocations.filter(l => l.readyForAds).length;
      
      const debugInfo = {
        targetRegionCodes: targetRegions,
        candidateLocations: allActiveLocations.length,
        candidateScreens: screensWithYodeckId.length,
        readyForAdsLocations,
        locationsWithYodeckDeviceId: locationsWithDeviceId,
        locationsWithPlaylistMapping: locationsWithPlaylistId,
        rejectionReasons: simulation.rejectedLocations.reduce((acc, r) => {
          acc[r.reason] = (acc[r.reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
      
      res.json({
        success: simulation.success,
        proposal: {
          requestedScreens: advertiser.screensIncluded || 1,
          matches,
          summary: {
            totalMatches: matches.length,
            estimatedImpressionsPerMonth: Math.round(simulation.totalExpectedImpressions * 4.33),
            videoDurationSeconds: assetDuration,
            packageType: advertiser.packageType || "STARTER",
            targetRegionCodes: advertiser.targetRegionCodes || [],
            matchedCities,
          },
          noCapacityReason,
          nextSteps: nextSteps.length > 0 ? nextSteps : null,
          // provisioningReport is NEVER null - always provide full diagnostic info
          provisioningReport,
          // Debug info for admin diagnosis (collapsible in UI)
          debug: debugInfo,
        },
      });
    } catch (error: any) {
      console.error("[Proposal] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // PLACEMENT PLANS API (AUTO-PUBLISH)
  // ============================================================================

  // Get all placement plans (admin queue)
  app.get("/api/placement-plans", isAuthenticated, async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const status = req.query.status as string | undefined;
      const plans = await placementEngine.getPlans(status);
      
      const enrichedPlans = await Promise.all(plans.map(async (plan) => {
        const advertiser = await placementEngine.getPlanAdvertiser(plan.id);
        const asset = await placementEngine.getPlanAsset(plan.id);
        return {
          ...plan,
          advertiserName: advertiser?.companyName,
          assetFileName: asset?.originalFileName,
        };
      }));
      
      res.json(enrichedPlans);
    } catch (error: any) {
      console.error("[PlacementPlans] Error getting plans:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create new placement plan from ad asset
  app.post("/api/placement-plans", isAuthenticated, async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const { advertiserId, adAssetId } = req.body;
      
      if (!advertiserId || !adAssetId) {
        return res.status(400).json({ message: "advertiserId en adAssetId zijn vereist" });
      }
      
      const result = await placementEngine.createPlan(advertiserId, adAssetId);
      if (!result) {
        return res.status(400).json({ message: "Kon plan niet aanmaken" });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("[PlacementPlans] Error creating plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get single placement plan
  app.get("/api/placement-plans/:id", isAuthenticated, async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const plan = await placementEngine.getPlan(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: "Plan niet gevonden" });
      }
      
      const advertiser = await placementEngine.getPlanAdvertiser(plan.id);
      const asset = await placementEngine.getPlanAsset(plan.id);
      const targets = await placementEngine.getPlanTargets(plan.id);
      
      res.json({
        ...plan,
        advertiser,
        asset,
        targets,
      });
    } catch (error: any) {
      console.error("[PlacementPlans] Error getting plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Re-run simulation for a plan
  app.post("/api/placement-plans/:id/simulate", isAuthenticated, async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const result = await placementEngine.simulate(req.params.id);
      res.json(result);
    } catch (error: any) {
      console.error("[PlacementPlans] Error simulating plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Approve a placement plan
  app.post("/api/placement-plans/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const user = (req as any).user;
      const success = await placementEngine.approve(req.params.id, user?.id || "admin");
      if (!success) {
        return res.status(400).json({ message: "Kon plan niet goedkeuren. Status moet SIMULATED_OK zijn." });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[PlacementPlans] Error approving plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Publish an approved placement plan to Yodeck
  app.post("/api/placement-plans/:id/publish", isAuthenticated, async (req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const { placementEngine } = await import("./services/placementEngineService");
      const planId = req.params.id;
      
      // Get current plan
      const plan = await placementEngine.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan niet gevonden" });
      }
      if (plan.status !== "APPROVED") {
        return res.status(400).json({ message: "Plan moet status APPROVED hebben om te publiceren" });
      }
      
      // RE-SIMULATE before publish for safety (detect capacity/exclusivity changes)
      console.log(`[Publish] Re-simulating plan ${planId} before publish...`);
      const simResult = await placementEngine.simulate(planId);
      
      if (!simResult.success) {
        // Re-simulation failed - revert to WAITING so plan can be re-simulated
        console.log(`[Publish] Re-simulation failed for plan ${planId}, reverting to WAITING`);
        const { db } = await import("./db");
        const { placementPlans } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(placementPlans).set({ status: "WAITING" }).where(eq(placementPlans.id, planId));
        
        return res.status(400).json({ 
          message: "Plan kon niet worden gepubliceerd: capaciteit of exclusiviteit is gewijzigd sinds goedkeuring. Plan is teruggezet naar WAITING.",
          resimulationFailed: true,
          reason: simResult.message || "Onvoldoende capaciteit beschikbaar",
          newStatus: "WAITING",
        });
      }
      
      // Re-approve after successful re-simulation
      const user = (req as any).user;
      await placementEngine.approve(planId, user?.id || "admin");
      
      // Now publish
      const report = await yodeckPublishService.publishPlan(planId);
      res.json({ success: true, report, resimulated: true });
    } catch (error: any) {
      console.error("[PlacementPlans] Error publishing plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Rollback a published plan
  app.post("/api/placement-plans/:id/rollback", isAuthenticated, async (req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const result = await yodeckPublishService.rollbackPlan(req.params.id);
      if (!result.ok) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[PlacementPlans] Error rolling back plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Retry a failed plan
  // Returns 200 always (except 404/400/409), with success: true/false based on publish result
  app.post("/api/placement-plans/:id/retry", isAuthenticated, async (req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const { placementEngine } = await import("./services/placementEngineService");
      const planId = req.params.id;
      
      // Normalize first to ensure error fields are populated from legacy data
      await placementEngine.normalizePublishState(planId);
      
      // Get current plan (after normalize)
      const plan = await placementEngine.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan niet gevonden" });
      }
      if (plan.status !== "FAILED" && plan.status !== "APPROVED") {
        return res.status(400).json({ message: "Alleen FAILED of APPROVED plans kunnen opnieuw worden geprobeerd" });
      }
      
      // Check if already being processed (PUBLISHING status)
      if (plan.status === "PUBLISHING") {
        return res.status(409).json({ 
          message: "Publicatie is al bezig, ververs de pagina over 10 seconden",
          alreadyProcessing: true
        });
      }
      
      // === RETRY POLICY ===
      const MAX_RETRIES = 5;
      const currentRetryCount = (plan as any)?.retryCount || 0;
      
      // Force retry option: ?force=1 or X-Force-Retry header
      const forceRetry = req.query.force === '1' || req.headers['x-force-retry'] === '1';
      
      // Dev/test mode bypasses retry limits
      const isDevMode = process.env.NODE_ENV === 'development' || process.env.TEST_MODE?.toUpperCase() === 'TRUE';
      const bypassGuards = forceRetry || isDevMode;
      
      // Check max retries (skip if force/dev mode)
      if (currentRetryCount >= MAX_RETRIES && !bypassGuards) {
        return res.status(400).json({
          success: false,
          message: `Maximum aantal retries bereikt (${MAX_RETRIES}). Neem contact op met support.`,
          retryCount: currentRetryCount,
          maxRetries: MAX_RETRIES,
          permanentFailure: true,
        });
      }
      
      // Check for permanent errors (don't retry 400/401/403/404) - skip if force/dev mode
      const lastErrorCode = (plan as any)?.lastErrorCode;
      const lastErrorMessage = (plan as any)?.lastErrorMessage || '';
      const permanentErrorPatterns = [
        'status=400', 'status=401', 'status=403', 'status=404',
        'Invalid or empty authentication token',
        'ASSET_NOT_FOUND',
        'PERMANENT_FAILURE',
      ];
      
      const isPermanentError = permanentErrorPatterns.some(pattern => 
        lastErrorMessage.includes(pattern) || lastErrorCode === pattern
      );
      
      if (isPermanentError && currentRetryCount > 0 && !bypassGuards) {
        return res.status(400).json({
          success: false,
          message: `Permanente fout gedetecteerd: ${lastErrorCode || 'onbekend'}. Retry niet mogelijk.`,
          lastErrorCode,
          lastErrorMessage: lastErrorMessage.substring(0, 200),
          permanentFailure: true,
        });
      }
      
      // Log bypass if used
      if (bypassGuards && (currentRetryCount >= MAX_RETRIES || isPermanentError)) {
        console.log(`[PlacementPlans] Retry guard bypassed: force=${forceRetry}, devMode=${isDevMode}, retryCount=${currentRetryCount}, isPermanentError=${isPermanentError}`);
      }
      
      // Reset retryCount if force retry
      if (forceRetry) {
        const { db } = await import("./db");
        const { placementPlans } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(placementPlans)
          .set({ retryCount: 0 })
          .where(eq(placementPlans.id, planId));
        console.log(`[PlacementPlans] Force retry: reset retryCount to 0 for plan ${planId}`);
      }
      
      // Reset status to APPROVED for retry (publishPlan will increment retryCount on failure)
      // Note: db/placementPlans/eq may be imported above for forceRetry, use dynamic import pattern for safety
      const dbMod = await import("./db");
      const schemaMod = await import("@shared/schema");
      const ormMod = await import("drizzle-orm");
      
      await dbMod.db.update(schemaMod.placementPlans)
        .set({ 
          status: "APPROVED",
          lastAttemptAt: new Date(),
        })
        .where(ormMod.eq(schemaMod.placementPlans.id, planId));
      
      // Publish (the service will update status to PUBLISHING -> PUBLISHED/FAILED and increment retryCount on failure)
      // Service uses upsert for outbox records, so duplicate key errors are handled gracefully
      let report: any;
      try {
        report = await yodeckPublishService.publishPlan(planId);
      } catch (publishError: any) {
        // Publish failed - get updated plan to show current state
        const failedPlan = await placementEngine.getPlan(planId);
        
        // Check if error is ALREADY_PROCESSING
        if (publishError.message?.includes("ALREADY_PROCESSING")) {
          return res.status(409).json({ 
            message: "Publicatie is al bezig, ververs de pagina over 10 seconden",
            alreadyProcessing: true
          });
        }
        
        // Return 200 with success: false and the error details
        return res.json({ 
          success: false, 
          plan: failedPlan,
          message: "Publish mislukt, zie fout in wachtrij",
          error: publishError.message,
          retryCount: failedPlan?.retryCount || 0,
          buildId: global.BUILD_ID,
          uploadMethodUsed: 'two-step',
        });
      }
      
      // Check if any upload/add returned ALREADY_PROCESSING
      const hasAlreadyProcessing = report.targets?.some((t: any) => t.error?.includes("ALREADY_PROCESSING"));
      if (hasAlreadyProcessing) {
        return res.status(409).json({ 
          message: "Een of meer publicatie jobs zijn al bezig, ververs de pagina over 10 seconden",
          alreadyProcessing: true,
          report,
          buildId: global.BUILD_ID,
        });
      }
      
      // Get updated plan to return current retryCount
      const updatedPlan = await placementEngine.getPlan(planId);
      const success = updatedPlan?.status === "PUBLISHED";
      
      // Extract tag-based publishing details from report
      const tagsApplied = report.tagsApplied || [];
      const missingTags = report.missingTags || [];
      const perLocation = report.perLocation || [];
      
      res.json({ 
        success, 
        report, 
        plan: updatedPlan,
        retryCount: updatedPlan?.retryCount || 0,
        message: success ? "Publicatie geslaagd" : "Publish mislukt, zie fout in wachtrij",
        buildId: global.BUILD_ID,
        uploadMethodUsed: 'two-step',
        yodeckMediaId: report.yodeckMediaId,
        tagsAppliedCount: tagsApplied.length,
        missingTags,
        perLocation,
        errorCode: report.failedCount > 0 ? (report.targets?.[0]?.error || 'UNKNOWN') : null,
        errorMessage: report.failedCount > 0 ? (report.targets?.find((t: any) => t.error)?.error || 'Unknown error') : null,
      });
    } catch (error: any) {
      console.error("[PlacementPlans] Error retrying plan:", error);
      
      // Check if error is ALREADY_PROCESSING
      if (error.message?.includes("ALREADY_PROCESSING")) {
        return res.status(409).json({ 
          message: "Publicatie is al bezig, ververs de pagina over 10 seconden",
          alreadyProcessing: true,
          buildId: global.BUILD_ID,
        });
      }
      
      // For unexpected errors (not publish failures), return the error details
      // Get plan state if possible
      try {
        const { placementEngine } = await import("./services/placementEngineService");
        const planId = req.params.id;
        const plan = await placementEngine.getPlan(planId);
        return res.json({ 
          success: false, 
          plan,
          message: "Onverwachte fout bij retry",
          error: error.message,
          retryCount: plan?.retryCount || 0,
          buildId: global.BUILD_ID,
          uploadMethodUsed: 'two-step',
        });
      } catch {
        // Can't even get plan - return minimal error
        res.status(500).json({ message: error.message, buildId: global.BUILD_ID });
      }
    }
  });
  
  // Normalize all FAILED plans - admin endpoint for data consistency fix
  app.post("/api/admin/publish-queue/normalize", isAuthenticated, requirePermission("manage_system"), async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const result = await placementEngine.normalizeAllFailedPlans();
      res.json({ 
        success: true, 
        message: `${result.updatedCount} van ${result.processedCount} plannen genormaliseerd`,
        ...result
      });
    } catch (error: any) {
      console.error("[PublishQueue] Error normalizing plans:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel a failed/pending plan
  app.post("/api/placement-plans/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const { placementEngine } = await import("./services/placementEngineService");
      const planId = req.params.id;
      
      const plan = await placementEngine.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan niet gevonden" });
      }
      if (!["FAILED", "PROPOSED", "SIMULATED_OK", "SIMULATED_FAIL", "APPROVED"].includes(plan.status)) {
        return res.status(400).json({ message: "Dit plan kan niet worden geannuleerd" });
      }
      
      const { db } = await import("./db");
      const { placementPlans } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(placementPlans)
        .set({ status: "CANCELED" })
        .where(eq(placementPlans.id, planId));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("[PlacementPlans] Error canceling plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk simulate multiple placement plans
  app.post("/api/placement-plans/bulk-simulate", isAuthenticated, async (req, res) => {
    try {
      const { planIds } = req.body;
      if (!Array.isArray(planIds) || planIds.length === 0) {
        return res.status(400).json({ message: "planIds array is verplicht" });
      }
      if (planIds.length > 50) {
        return res.status(400).json({ message: "Maximaal 50 plans per keer" });
      }
      
      const { placementEngine } = await import("./services/placementEngineService");
      const results: Array<{ planId: string; success: boolean; result?: any; error?: string }> = [];
      
      for (const planId of planIds) {
        try {
          const plan = await placementEngine.getPlan(planId);
          if (!plan || !["PROPOSED", "SIMULATED_FAIL"].includes(plan.status)) {
            results.push({ planId, success: false, error: "Ongeldige status voor simulatie" });
            continue;
          }
          const result = await placementEngine.simulate(planId);
          results.push({ planId, success: result.success, result });
        } catch (err: any) {
          results.push({ planId, success: false, error: err.message });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      res.json({ 
        success: successCount === planIds.length,
        total: planIds.length,
        successCount,
        failCount: planIds.length - successCount,
        results 
      });
    } catch (error: any) {
      console.error("[PlacementPlans] Error bulk simulating:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk publish multiple approved placement plans (with re-simulate safety)
  app.post("/api/placement-plans/bulk-publish", isAuthenticated, async (req, res) => {
    try {
      const { planIds } = req.body;
      if (!Array.isArray(planIds) || planIds.length === 0) {
        return res.status(400).json({ message: "planIds array is verplicht" });
      }
      if (planIds.length > 20) {
        return res.status(400).json({ message: "Maximaal 20 plans per keer publiceren" });
      }
      
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const { placementEngine } = await import("./services/placementEngineService");
      const user = (req as any).user;
      const results: Array<{ planId: string; success: boolean; report?: any; error?: string; resimulationFailed?: boolean }> = [];
      
      for (const planId of planIds) {
        try {
          const plan = await placementEngine.getPlan(planId);
          if (!plan || plan.status !== "APPROVED") {
            results.push({ planId, success: false, error: "Plan moet status APPROVED hebben om te publiceren" });
            continue;
          }
          
          // RE-SIMULATE before publish for safety
          console.log(`[BulkPublish] Re-simulating plan ${planId} before publish...`);
          const simResult = await placementEngine.simulate(planId);
          
          if (!simResult.success) {
            // Revert to WAITING so plan can be re-simulated
            console.log(`[BulkPublish] Re-simulation failed for plan ${planId}, reverting to WAITING`);
            const { db } = await import("./db");
            const { placementPlans } = await import("@shared/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(placementPlans).set({ status: "WAITING" }).where(eq(placementPlans.id, planId));
            
            results.push({ 
              planId, 
              success: false, 
              error: "Re-simulatie gefaald: capaciteit of exclusiviteit gewijzigd. Plan teruggezet naar WAITING.",
              resimulationFailed: true
            });
            continue;
          }
          
          // Re-approve after successful re-simulation
          await placementEngine.approve(planId, user?.id || "admin");
          
          // Now publish
          const report = await yodeckPublishService.publishPlan(planId);
          results.push({ planId, success: true, report });
        } catch (err: any) {
          results.push({ planId, success: false, error: err.message });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const resimFailCount = results.filter(r => r.resimulationFailed).length;
      res.json({
        success: successCount === planIds.length,
        total: planIds.length,
        successCount,
        failCount: planIds.length - successCount,
        resimulationFailures: resimFailCount,
        results
      });
    } catch (error: any) {
      console.error("[PlacementPlans] Error bulk publishing:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk approve multiple simulated placement plans
  app.post("/api/placement-plans/bulk-approve", isAuthenticated, async (req, res) => {
    try {
      const { planIds } = req.body;
      if (!Array.isArray(planIds) || planIds.length === 0) {
        return res.status(400).json({ message: "planIds array is verplicht" });
      }
      if (planIds.length > 50) {
        return res.status(400).json({ message: "Maximaal 50 plans per keer" });
      }
      
      const { placementEngine } = await import("./services/placementEngineService");
      const user = (req as any).user;
      const results: Array<{ planId: string; success: boolean; error?: string }> = [];
      
      for (const planId of planIds) {
        try {
          const plan = await placementEngine.getPlan(planId);
          if (!plan || plan.status !== "SIMULATED_OK") {
            results.push({ planId, success: false, error: "Plan moet status SIMULATED_OK hebben om goed te keuren" });
            continue;
          }
          const success = await placementEngine.approve(planId, user?.id || "admin");
          results.push({ planId, success });
        } catch (err: any) {
          results.push({ planId, success: false, error: err.message });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      res.json({
        success: successCount === planIds.length,
        total: planIds.length,
        successCount,
        failCount: planIds.length - successCount,
        results
      });
    } catch (error: any) {
      console.error("[PlacementPlans] Error bulk approving:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // AVAILABILITY PREVIEW API (PUBLIC, READ-ONLY)
  // ============================================================================
  
  // In-memory cache for availability preview (30 second TTL)
  const availabilityPreviewCache = new Map<string, { data: any; timestamp: number }>();
  const AVAILABILITY_CACHE_TTL = 30 * 1000; // 30 seconds
  
  // Buffer counts for "bijna vol" detection per package type
  const NEAR_FULL_BUFFER: Record<string, number> = {
    SINGLE: 2,
    TRIPLE: 2,
    TEN: 3,
    CUSTOM: 2,
  };
  
  app.get("/api/availability/preview", async (req, res) => {
    try {
      const { packageType, businessCategory, competitorGroup } = req.query;
      const regions = req.query["regions[]"] || req.query.regions;
      
      // Validate required params
      if (!packageType || !businessCategory) {
        return res.status(400).json({ message: "packageType en businessCategory zijn verplicht" });
      }
      
      // Parse regions
      const targetRegionCodes: string[] = Array.isArray(regions) 
        ? regions as string[] 
        : (regions ? [regions as string] : []);
      
      // Build cache key
      const cacheKey = `${packageType}:${businessCategory}:${competitorGroup || businessCategory}:${targetRegionCodes.sort().join(",")}`;
      
      // Check cache
      const cached = availabilityPreviewCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < AVAILABILITY_CACHE_TTL) {
        return res.json(cached.data);
      }
      
      // Use capacityGateService for consistent logic
      const { capacityGateService } = await import("./services/capacityGateService");
      const result = await capacityGateService.checkCapacity({
        packageType: packageType as string,
        businessCategory: businessCategory as string,
        competitorGroup: (competitorGroup as string) || (businessCategory as string),
        targetRegionCodes,
        videoDurationSeconds: 15,
      });
      
      // Determine nearFull status
      const bufferCount = NEAR_FULL_BUFFER[packageType as string] || 2;
      const nearFull = result.isAvailable && 
        result.availableSlotCount < result.requiredCount + bufferCount;
      
      // Determine suggested action
      let suggestedAction: "EXPAND_REGIONS" | "WAITLIST" | "OK" = "OK";
      if (!result.isAvailable) {
        suggestedAction = targetRegionCodes.length < 3 ? "EXPAND_REGIONS" : "WAITLIST";
      }
      
      const response = {
        isAvailable: result.isAvailable,
        requiredCount: result.requiredCount,
        availableCount: result.availableSlotCount,
        nearFull,
        bufferCount,
        reasonsTop: result.topReasons,
        suggestedAction,
        updatedAt: new Date().toISOString(),
      };
      
      // Store in cache
      availabilityPreviewCache.set(cacheKey, { data: response, timestamp: Date.now() });
      
      res.json(response);
    } catch (error: any) {
      console.error("[AvailabilityPreview] Error:", error);
      res.status(500).json({ message: "Kan beschikbaarheid niet ophalen" });
    }
  });

  // ============================================================================
  // WAITLIST API ENDPOINTS
  // ============================================================================

  // Join the waitlist (when capacity is not available)
  app.post("/api/waitlist/join", async (req, res) => {
    try {
      const { 
        companyName, contactName, email, phone,
        kvkNumber, vatNumber,
        packageType, businessCategory, targetRegionCodes
      } = req.body;
      
      if (!companyName || !contactName || !email || !packageType || !businessCategory) {
        return res.status(400).json({ message: "Verplichte velden ontbreken" });
      }
      
      const PACKAGE_SCREENS: Record<string, number> = {
        SINGLE: 1, TRIPLE: 3, TEN: 10, CUSTOM: 1
      };
      const requiredCount = PACKAGE_SCREENS[packageType] || 1;
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if already on waitlist (by email + package + businessCategory)
      // De-duplication: UPDATE existing WAITING entries instead of rejecting
      const existingActive = await storage.getActiveWaitlistRequest(normalizedEmail, packageType);
      
      if (existingActive) {
        // If INVITED, tell user to check email
        if (existingActive.status === "INVITED") {
          return res.status(400).json({ 
            message: "Je hebt al een uitnodiging ontvangen - check je email!",
            waitlistId: existingActive.id,
            status: "existing"
          });
        }
        
        // If WAITING, update the existing entry with new details
        const updated = await storage.updateWaitlistRequest(existingActive.id, {
          companyName,
          contactName,
          phone,
          kvkNumber,
          vatNumber,
          businessCategory,
          competitorGroup: businessCategory,
          targetRegionCodes,
          requiredCount,
        });
        
        console.log(`[Waitlist] Updated existing request ${existingActive.id} for ${normalizedEmail}`);
        return res.json({ 
          status: "updated",
          waitlistId: existingActive.id,
          message: "Je gegevens zijn bijgewerkt. We houden je op de hoogte!"
        });
      }
      
      // Create new waitlist entry
      const waitlistRequest = await storage.createWaitlistRequest({
        companyName,
        contactName,
        email: normalizedEmail,
        phone,
        kvkNumber,
        vatNumber,
        packageType,
        businessCategory,
        competitorGroup: businessCategory, // Default to businessCategory
        targetRegionCodes,
        requiredCount,
        status: "WAITING",
      });
      
      // Send confirmation email
      try {
        const { sendWaitlistConfirmationEmail } = await import("./services/waitlistEmailService");
        await sendWaitlistConfirmationEmail({
          contactName,
          companyName,
          email,
          packageType,
          businessCategory,
          targetRegionCodes: targetRegionCodes || [],
        });
      } catch (emailError: any) {
        console.error("[Waitlist] Failed to send confirmation email:", emailError);
      }
      
      console.log(`[Waitlist] Created waitlist request ${waitlistRequest.id} for ${normalizedEmail}`);
      res.json({ 
        status: "created",
        waitlistId: waitlistRequest.id,
        message: "Je staat op de wachtlijst. We sturen een e-mail zodra er plek is."
      });
    } catch (error: any) {
      console.error("[Waitlist] Error joining waitlist:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Check claim token and proceed to onboarding (public)
  app.get("/api/claim/:token", async (req, res) => {
    try {
      const crypto = await import("crypto");
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      
      const request = await storage.getWaitlistRequestByTokenHash(tokenHash);
      if (!request) {
        return res.status(404).json({ message: "Ongeldige of verlopen claim link" });
      }
      
      if (request.status !== "INVITED") {
        if (request.status === "CLAIMED") {
          return res.status(400).json({ message: "Deze uitnodiging is al geclaimd" });
        }
        if (request.status === "EXPIRED") {
          return res.status(400).json({ message: "Deze uitnodiging is verlopen" });
        }
        return res.status(400).json({ message: "Ongeldige status voor claim" });
      }
      
      // Check expiry
      if (request.inviteExpiresAt && new Date(request.inviteExpiresAt) < new Date()) {
        await storage.updateWaitlistRequest(request.id, { status: "EXPIRED" });
        return res.status(400).json({ message: "Deze uitnodiging is verlopen. Neem contact met ons op." });
      }
      
      // Re-check capacity before allowing claim
      const { capacityGateService } = await import("./services/capacityGateService");
      const capacityCheck = await capacityGateService.checkCapacity({
        packageType: request.packageType,
        businessCategory: request.businessCategory,
        competitorGroup: request.competitorGroup || request.businessCategory,
        targetRegionCodes: request.targetRegionCodes || [],
        videoDurationSeconds: 15,
      });
      
      if (!capacityCheck.isAvailable) {
        // Capacity no longer available - back to waiting
        await storage.updateWaitlistRequest(request.id, { 
          status: "WAITING",
          inviteTokenHash: null,
          inviteSentAt: null,
          inviteExpiresAt: null,
        });
        return res.status(400).json({ 
          message: "Helaas is de plek alweer bezet. Je staat weer op de wachtlijst en we laten het weten zodra er weer plek is."
        });
      }
      
      const { REGIONS, BUSINESS_CATEGORIES } = await import("@shared/regions");
      const regionsLabel = (request.targetRegionCodes || [])
        .map(code => REGIONS.find(r => r.code === code)?.label || code)
        .join(", ");
      
      res.json({
        valid: true,
        available: true,
        companyName: request.companyName,
        contactName: request.contactName,
        packageType: request.packageType,
        businessCategory: request.businessCategory,
        regionsLabel,
        videoDurationSeconds: 15,
      });
    } catch (error: any) {
      console.error("[Claim] Error checking claim:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Confirm claim and proceed to onboarding
  app.post("/api/claim/:token/confirm", async (req, res) => {
    try {
      const crypto = await import("crypto");
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      
      const request = await storage.getWaitlistRequestByTokenHash(tokenHash);
      if (!request || request.status !== "INVITED") {
        return res.status(400).json({ message: "Ongeldige claim" });
      }
      
      // Final capacity check
      const { capacityGateService } = await import("./services/capacityGateService");
      const capacityCheck = await capacityGateService.checkCapacity({
        packageType: request.packageType,
        businessCategory: request.businessCategory,
        competitorGroup: request.competitorGroup || request.businessCategory,
        targetRegionCodes: request.targetRegionCodes || [],
        videoDurationSeconds: 15,
      });
      
      if (!capacityCheck.isAvailable) {
        await storage.updateWaitlistRequest(request.id, { 
          status: "WAITING", 
          inviteTokenHash: null,
          inviteSentAt: null,
          inviteExpiresAt: null,
        });
        
        // Send unavailable email
        try {
          const { sendWaitlistUnavailableEmail } = await import("./services/waitlistEmailService");
          await sendWaitlistUnavailableEmail({
            contactName: request.contactName,
            companyName: request.companyName,
            email: request.email,
            packageType: request.packageType,
            businessCategory: request.businessCategory,
            targetRegionCodes: request.targetRegionCodes || [],
          });
        } catch (emailError: any) {
          console.error("[Claim] Failed to send unavailable email:", emailError);
        }
        
        // 409 Conflict: capacity no longer available
        return res.status(409).json({ 
          message: "Helaas, er is net iemand anders voor. Je staat weer op de wachtlijst en ontvangt automatisch een nieuwe uitnodiging zodra er plek is.",
          capacityGone: true
        });
      }
      
      // Mark as claimed
      await storage.updateWaitlistRequest(request.id, { 
        status: "CLAIMED",
        claimedAt: new Date()
      });
      
      // Create server-side prefill record for cross-device support
      const formData = {
        companyName: request.companyName,
        contactName: request.contactName,
        email: request.email,
        phone: request.phone,
        kvkNumber: request.kvkNumber,
        vatNumber: request.vatNumber,
        packageType: request.packageType,
        businessCategory: request.businessCategory,
        targetRegionCodes: request.targetRegionCodes,
      };
      
      const prefill = await storage.createClaimPrefill({
        waitlistRequestId: request.id,
        formData: JSON.stringify(formData),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 minutes
      });
      
      res.json({ 
        success: true, 
        message: "Plek geclaimd! Ga door met de aanmelding.",
        prefillId: prefill.id,
      });
    } catch (error: any) {
      console.error("[Claim] Error confirming claim:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get prefill data for /start form (cross-device claim flow)
  app.get("/api/prefill/:id", async (req, res) => {
    try {
      const prefill = await storage.getClaimPrefill(req.params.id);
      
      if (!prefill) {
        return res.status(404).json({ 
          message: "Prefill niet gevonden", 
          expired: true 
        });
      }
      
      // Check expiration
      if (new Date() > new Date(prefill.expiresAt)) {
        return res.status(410).json({ 
          message: "Deze link is verlopen. Je staat weer op de wachtlijst en ontvangt automatisch een nieuwe uitnodiging zodra er plek is.",
          expired: true 
        });
      }
      
      // Check if already used
      if (prefill.usedAt) {
        return res.status(410).json({ 
          message: "Deze link is al gebruikt.",
          expired: true 
        });
      }
      
      // Return the form data (don't mark as used yet - mark on /api/start success)
      const formData = JSON.parse(prefill.formData);
      res.json({ 
        success: true,
        formData,
        prefillId: prefill.id
      });
    } catch (error: any) {
      console.error("[Prefill] Error fetching prefill:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: List waitlist requests
  app.get("/api/admin/waitlist", isAuthenticated, async (_req, res) => {
    try {
      const requests = await storage.getWaitlistRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Cancel a waitlist request
  app.post("/api/admin/waitlist/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const request = await storage.getWaitlistRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "Wachtlijst verzoek niet gevonden" });
      }
      
      await storage.updateWaitlistRequest(req.params.id, { 
        status: "CANCELLED",
        cancelledAt: new Date()
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Manual check for a waitlist request
  app.post("/api/admin/waitlist/:id/check", isAuthenticated, async (req, res) => {
    try {
      const request = await storage.getWaitlistRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "Wachtlijst verzoek niet gevonden" });
      }
      
      const { capacityGateService } = await import("./services/capacityGateService");
      const capacityCheck = await capacityGateService.checkCapacity({
        packageType: request.packageType,
        businessCategory: request.businessCategory,
        competitorGroup: request.competitorGroup || request.businessCategory,
        targetRegionCodes: request.targetRegionCodes || [],
        videoDurationSeconds: 15,
      });
      
      await storage.updateWaitlistRequest(req.params.id, { lastCheckedAt: new Date() });
      
      res.json({
        isAvailable: capacityCheck.isAvailable,
        availableSlotCount: capacityCheck.availableSlotCount,
        requiredCount: capacityCheck.requiredCount,
        topReasons: capacityCheck.topReasons,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Reset a waitlist request back to WAITING
  app.post("/api/admin/waitlist/:id/reset", isAuthenticated, async (req, res) => {
    try {
      const request = await storage.getWaitlistRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "Wachtlijst verzoek niet gevonden" });
      }
      
      if (request.status !== "EXPIRED" && request.status !== "CANCELLED") {
        return res.status(400).json({ message: "Alleen verlopen of geannuleerde aanvragen kunnen worden gereset" });
      }
      
      await storage.updateWaitlistRequest(req.params.id, { 
        status: "WAITING",
        inviteTokenHash: null,
        inviteSentAt: null,
        inviteExpiresAt: null,
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Trigger capacity check for all waiting requests
  app.post("/api/admin/waitlist/trigger-check", isAuthenticated, async (_req, res) => {
    try {
      const { triggerCapacityCheck } = await import("./services/capacityWatcherWorker");
      const result = await triggerCapacityCheck();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public upload portal - get advertiser info
  app.get("/api/upload-portal/:token", async (req, res) => {
    try {
      const { validatePortalTokenWithDetails } = await import("./services/adAssetUploadService");
      const { getVideoSpecsForDuration, formatVideoSpecsForDisplay } = await import("./services/videoMetadataService");
      
      const result = await validatePortalTokenWithDetails(req.params.token);
      if (!result.success || !result.context) {
        // Return user-friendly error messages based on reason
        const errorMessages: Record<string, string> = {
          'not_found': 'Ongeldige toegangslink. Neem contact op met Elevizion voor een nieuwe link.',
          'expired': 'Deze toegangslink is verlopen. Neem contact op met Elevizion voor een nieuwe link.',
          'no_advertiser': 'Account niet gevonden. Neem contact op met Elevizion.',
          'no_linkkey': 'Account configuratie onvolledig. Neem contact op met Elevizion.',
          'error': 'Er is een fout opgetreden. Probeer het later opnieuw.',
        };
        const message = errorMessages[result.reason || 'error'] || 'Ongeldige of verlopen toegangslink';
        return res.status(401).json({ message, reason: result.reason });
      }
      
      const specs = getVideoSpecsForDuration(result.context.contractDuration);
      
      res.json({
        companyName: result.context.companyName,
        linkKey: result.context.linkKey,
        duration: result.context.contractDuration,
        specs,
        displaySpecs: formatVideoSpecsForDisplay(specs, result.context.contractDuration),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Public upload portal - upload video file
  app.post("/api/upload-portal/:token/upload", async (req, res) => {
    const fs = await import("fs");
    let tempFilePath: string | null = null;
    
    try {
      // Memory safety check - reject uploads if RSS exceeds threshold (platform enforces RSS)
      const mem = process.memoryUsage();
      const RSS_LIMIT_MB = 180; // Platform limit is ~200MB, leave buffer
      const rssMB = mem.rss / 1024 / 1024;
      if (rssMB > RSS_LIMIT_MB) {
        console.warn(`[UploadPortal] RSS memory high (${rssMB.toFixed(1)}MB > ${RSS_LIMIT_MB}MB), rejecting upload`);
        logMemoryUsage();
        return res.status(503).json({ 
          message: "Server druk, probeer het over een minuut opnieuw.",
          retryAfter: 60
        });
      }
      
      const multer = (await import("multer")).default;
      const { cleanupTempFiles } = await import("./services/videoMetadataService");
      
      // Note: We no longer block uploads based on a global availability flag.
      // ffprobe availability is checked lazily when actually processing each file.
      // This ensures the check is accurate per-request rather than based on startup state.
      
      const upload = multer({
        dest: "/tmp/uploads",
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
      });
      
      upload.single("video")(req, res, async (err) => {
        if (err) {
          console.error("[UploadPortal] Multer error:", err);
          return res.status(400).json({ message: "Upload mislukt: " + err.message });
        }
        
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "Geen bestand geüpload" });
        }
        
        tempFilePath = file.path;
        
        try {
          // Verify the uploaded file exists and has content BEFORE processing
          if (!fs.existsSync(file.path)) {
            console.error("[UploadPortal] Multer temp file does not exist:", file.path);
            return res.status(500).json({ 
              message: "Uploadbestand kon niet worden opgeslagen. Probeer opnieuw." 
            });
          }
          
          const fileStats = fs.statSync(file.path);
          if (fileStats.size === 0) {
            console.error("[UploadPortal] Multer temp file is empty:", file.path, "expected:", file.size);
            cleanupTempFiles(tempFilePath);
            return res.status(400).json({ 
              message: "Het geüploade bestand is leeg. Controleer je video en probeer opnieuw." 
            });
          }
          
          console.log("[UploadPortal] Temp file verified:", file.path, "size:", fileStats.size);
          
          const { validatePortalTokenWithDetails, processAdAssetUpload } = await import("./services/adAssetUploadService");
          
          const result = await validatePortalTokenWithDetails(req.params.token, true);
          if (!result.success || !result.context) {
            cleanupTempFiles(tempFilePath);
            const errorMessages: Record<string, string> = {
              'not_found': 'Ongeldige toegangslink. Neem contact op met Elevizion voor een nieuwe link.',
              'expired': 'Deze toegangslink is verlopen. Neem contact op met Elevizion voor een nieuwe link.',
              'no_advertiser': 'Account niet gevonden.',
              'no_linkkey': 'Account configuratie onvolledig.',
              'error': 'Er is een fout opgetreden.',
            };
            return res.status(401).json({ 
              message: errorMessages[result.reason || 'error'] || 'Ongeldige of verlopen toegangslink',
              reason: result.reason 
            });
          }
          const context = result.context;
          
          const uploadResult = await processAdAssetUpload(
            file.path,
            file.originalname,
            file.mimetype,
            context
          );
          
          // Clean up temp file AFTER processing is complete
          cleanupTempFiles(tempFilePath);
          tempFilePath = null;
          
          if (!uploadResult.success) {
            return res.status(400).json({
              success: false,
              ok: false,
              code: uploadResult.errorCode || 'VALIDATION_ERROR',
              message: uploadResult.message,
              details: uploadResult.errorDetails || {
                validationErrors: uploadResult.validation?.errors || [],
              },
              validation: uploadResult.validation,
            });
          }
          
          res.json({
            success: true,
            message: uploadResult.message,
            assetId: uploadResult.assetId,
            storedFilename: uploadResult.storedFilename,
            validation: uploadResult.validation,
          });
        } catch (error: any) {
          console.error("[UploadPortal] Processing error:", error);
          // Clean up on error
          if (tempFilePath) {
            cleanupTempFiles(tempFilePath);
          }
          res.status(500).json({ message: "Fout bij verwerken: " + error.message });
        }
      });
    } catch (error: any) {
      // Clean up on outer error
      if (tempFilePath) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      res.status(500).json({ message: error.message });
    }
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

  app.get("/api/locations/:id/mail-history", async (req, res) => {
    try {
      const { getEmailHistoryForEntity, getLastEmailForEntity } = await import("./services/mailEventService");
      const [history, lastEmail] = await Promise.all([
        getEmailHistoryForEntity("location", req.params.id),
        getLastEmailForEntity("location", req.params.id),
      ]);
      res.json({ history, lastEmail });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
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
    try {
      const { readyForAds, pausedByAdmin, city, regionCode, yodeckDeviceId, status, ...otherUpdates } = req.body;
      
      // Get existing location first
      const existingLocation = await storage.getLocation(req.params.id);
      if (!existingLocation) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      // Build updates object
      const updates: Record<string, any> = { ...otherUpdates };
      if (city !== undefined) updates.city = city;
      if (regionCode !== undefined) updates.regionCode = regionCode;
      if (yodeckDeviceId !== undefined) updates.yodeckDeviceId = yodeckDeviceId;
      if (status !== undefined) updates.status = status;
      
      // ==========================================
      // AUTO-LIVE LOGIC
      // ==========================================
      // Auto-live conditions:
      // 1. status === "active"
      // 2. city OR regionCode is filled
      // 3. yodeckDeviceId IS NOT NULL (Yodeck connected)
      // 
      // If admin explicitly pauses (pausedByAdmin=true), do NOT auto-enable.
      // If admin explicitly unpauses (pausedByAdmin=false), allow auto-live again.
      // ==========================================
      
      // Calculate final values after this update
      const finalStatus = status !== undefined ? status : existingLocation.status;
      const finalCity = city !== undefined ? city : existingLocation.city;
      const finalRegionCode = regionCode !== undefined ? regionCode : existingLocation.regionCode;
      const finalYodeckDeviceId = yodeckDeviceId !== undefined ? yodeckDeviceId : existingLocation.yodeckDeviceId;
      const finalPausedByAdmin = pausedByAdmin !== undefined ? pausedByAdmin : (existingLocation.pausedByAdmin || false);
      
      // Check if auto-live conditions are met
      const hasLocationData = (finalCity && finalCity.trim() !== "") || (finalRegionCode && finalRegionCode.trim() !== "");
      const hasYodeck = finalYodeckDeviceId != null && String(finalYodeckDeviceId).trim() !== "";
      const isStatusActive = finalStatus === "active";
      const autoLiveConditionsMet = isStatusActive && hasLocationData && hasYodeck;
      
      // Handle pausedByAdmin logic
      if (pausedByAdmin !== undefined) {
        updates.pausedByAdmin = pausedByAdmin;
        
        if (pausedByAdmin === true) {
          // Admin is explicitly pausing - set readyForAds to false
          updates.readyForAds = false;
        } else if (pausedByAdmin === false && autoLiveConditionsMet) {
          // Admin is unpausing - re-enable if conditions are met
          updates.readyForAds = true;
        }
      } else if (readyForAds !== undefined) {
        // Manual readyForAds override (legacy support)
        // If setting to false, treat as admin pause
        if (readyForAds === false) {
          updates.pausedByAdmin = true;
          updates.readyForAds = false;
        } else if (readyForAds === true) {
          // Validate conditions before enabling
          if (!hasLocationData) {
            return res.status(400).json({ 
              message: "Vul eerst een plaats (city) of regio (regionCode) in." 
            });
          }
          updates.readyForAds = true;
          updates.pausedByAdmin = false;
        }
      } else {
        // No explicit readyForAds or pausedByAdmin in request - apply auto-live logic
        // Only auto-enable if NOT paused by admin
        if (!finalPausedByAdmin && autoLiveConditionsMet && !existingLocation.readyForAds) {
          // Auto-enable: all conditions met and currently not live
          updates.readyForAds = true;
          console.log(`[Auto-Live] Screen ${req.params.id} auto-enabled: status=${finalStatus}, city=${finalCity}, yodeck=${finalYodeckDeviceId}`);
        } else if (!autoLiveConditionsMet && existingLocation.readyForAds && !finalPausedByAdmin) {
          // Auto-disable: conditions no longer met (but NOT if admin paused - keep that flag)
          updates.readyForAds = false;
          console.log(`[Auto-Live] Screen ${req.params.id} auto-disabled: conditions no longer met`);
        }
      }
      
      const location = await storage.updateLocation(req.params.id, updates);
      if (!location) return res.status(404).json({ message: "Location not found" });
      
      // Invalidate availability cache when sellable fields change
      if (readyForAds !== undefined || pausedByAdmin !== undefined || city !== undefined || 
          regionCode !== undefined || status !== undefined || yodeckDeviceId !== undefined) {
        invalidateAvailabilityCache();
      }
      
      res.json(location);
    } catch (error: any) {
      console.error("Error updating location:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    await storage.deleteLocation(req.params.id);
    res.status(204).send();
  });

  // ============================================================================
  // LOCATION ONBOARDING (Quick Create + Self-Service Portal)
  // ============================================================================

  // Get next available location code
  app.get("/api/locations/next-code", async (_req, res) => {
    try {
      const nextCode = await storage.getNextLocationCode();
      res.json({ locationCode: nextCode });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Quick create location with auto-generated code + portal token
  app.post("/api/locations/quick-create", async (req, res) => {
    try {
      const quickCreateSchema = z.object({
        name: z.string().min(1, "Locatienaam is verplicht"),
        email: z.string().email("Geldig e-mailadres is verplicht"),
        street: z.string().optional(),
        houseNumber: z.string().optional(),
        zipcode: z.string().optional(),
        city: z.string().optional(),
      });
      
      const data = quickCreateSchema.parse(req.body);
      
      // Generate next location code (EVZ-LOC-###)
      const locationCode = await storage.getNextLocationCode();
      
      // Create location with pending_details status
      const location = await storage.createLocation({
        name: data.name,
        email: data.email,
        street: data.street || null,
        houseNumber: data.houseNumber || null,
        zipcode: data.zipcode || null,
        city: data.city || null,
        locationCode,
        status: "pending_details",
        onboardingStatus: "draft",
        piStatus: "not_installed",
        yodeckStatus: "not_linked",
      });
      
      // Generate portal token (valid for 7 days)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await storage.createLocationToken({
        locationId: location.id,
        tokenHash,
        expiresAt,
      });
      
      // Log onboarding event
      await storage.createLocationOnboardingEvent({
        locationId: location.id,
        eventType: "location_created",
        eventData: { method: "quick_create", email: data.email },
      });
      
      // Build portal URL
      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (req.headers.host ? `https://${req.headers.host}` : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const portalUrl = `${baseUrl}/locatie-portal/${rawToken}`;
      
      console.log(`[Location Portal] Link created for location ${location.id} (${locationCode}), NO email sent (awaiting explicit action)`);
      
      res.status(201).json({
        location,
        portalUrl,
        expiresAt,
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Send location portal invite email (explicit action - idempotent)
  app.post("/api/locations/:id/send-portal-email", async (req, res) => {
    try {
      const location = await storage.getLocation(req.params.id);
      if (!location) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }

      if (!location.email) {
        return res.status(400).json({ message: "Locatie heeft geen e-mailadres" });
      }

      // Check if already sent (idempotent)
      if (location.inviteEmailSentAt) {
        return res.status(200).json({ 
          message: "Uitnodigingsmail was al eerder verstuurd",
          alreadySent: true,
          sentAt: location.inviteEmailSentAt 
        });
      }

      // Generate new token for email
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await storage.createLocationToken({
        locationId: location.id,
        tokenHash,
        expiresAt,
      });

      const baseUrl = process.env.PUBLIC_PORTAL_URL 
        || (req.headers.origin ? req.headers.origin : null)
        || (req.headers.host ? `https://${req.headers.host}` : null)
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      const portalUrl = `${baseUrl}/locatie-portal/${rawToken}`;

      // Send the email
      const contactName = location.name || "Locatiebeheerder";
      const locationCode = location.locationCode || "N/A";
      await sendEmail({
        to: location.email,
        subject: "Vul de locatiegegevens in voor Elevizion",
        templateKey: "location_portal_invite",
        entityType: "location",
        entityId: location.id,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
              <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
              <h2 style="color: #1e3a5f; margin-top: 0;">Nieuwe Schermlocatie: ${locationCode}</h2>
              <p>Beste ${contactName},</p>
              <p>We zijn bijna klaar om uw digitale scherm te installeren! Voordat we verder kunnen gaan, hebben wij nog enkele locatiegegevens van u nodig.</p>
              <p>Klik op onderstaande knop om de gegevens in te vullen:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalUrl}" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Locatiegegevens Invullen</a>
              </div>
              <p style="font-size: 12px; color: #666;">Deze link is 7 dagen geldig.</p>
              <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
            </div>
          </div>
        `,
        text: `Beste ${contactName},\n\nWe zijn bijna klaar om uw digitale scherm (${locationCode}) te installeren!\n\nKlik op deze link om uw locatiegegevens in te vullen: ${portalUrl}\n\nDeze link is 7 dagen geldig.\n\nMet vriendelijke groet,\nTeam Elevizion`,
      });

      // Update location with sent timestamp
      await storage.updateLocation(location.id, { 
        inviteEmailSentAt: new Date(),
        onboardingStatus: "invited",
      });

      // Log event
      await storage.createLocationOnboardingEvent({
        locationId: location.id,
        eventType: "invite_email_sent",
        eventData: { email: location.email, portalUrl },
      });

      console.log(`[Location Portal] Invite email sent to ${location.email} for location ${location.id}`);
      
      res.json({ 
        message: "Uitnodigingsmail verstuurd",
        sentAt: new Date(),
        portalUrl,
      });
    } catch (error: any) {
      console.error("[Location Portal] Error sending invite:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get location onboarding events
  app.get("/api/locations/:id/onboarding-events", async (req, res) => {
    try {
      const events = await storage.getLocationOnboardingEvents(req.params.id);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bundled PDF download endpoint for locations
  app.get("/api/locations/:id/bundle.pdf", isAuthenticated, async (req, res) => {
    try {
      const location = await storage.getLocation(req.params.id);
      if (!location) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }
      if (!location.bundledPdfUrl) {
        return res.status(404).json({ message: "Bundel-PDF niet beschikbaar" });
      }
      res.redirect(location.bundledPdfUrl);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate bundled PDF for location (manual trigger)
  app.post("/api/locations/:id/generate-bundle", isAuthenticated, async (req, res) => {
    try {
      const { generateContractBundle, getLocationBundleContext } = await import("./services/contractBundleService");
      const context = await getLocationBundleContext(req.params.id);
      if (!context) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }
      const result = await generateContractBundle(context);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ success: true, bundledPdfUrl: result.bundledPdfUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // PUBLIC LOCATION PORTAL (No auth required)
  // ============================================================================

  // Validate location portal token
  app.get("/api/public/location-portal/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const tokenRecord = await storage.getLocationTokenByHash(tokenHash);
      
      if (!tokenRecord) {
        return res.status(404).json({ message: "Ongeldige of verlopen link" });
      }
      
      // Check expiry
      if (new Date(tokenRecord.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Deze link is verlopen" });
      }
      
      // Check if already used
      if (tokenRecord.usedAt) {
        return res.status(410).json({ message: "Deze link is al gebruikt" });
      }
      
      // Get location
      const location = await storage.getLocation(tokenRecord.locationId);
      if (!location) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }
      
      // Return location info for form pre-fill
      res.json({
        locationCode: location.locationCode,
        name: location.name,
        email: location.email,
        street: location.street,
        houseNumber: location.houseNumber,
        zipcode: location.zipcode,
        city: location.city,
        visitorsPerWeek: location.visitorsPerWeek,
        openingHours: location.openingHours,
        branche: location.branche,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Submit location details via portal
  app.post("/api/public/location-portal/:token", async (req, res) => {
    try {
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const tokenRecord = await storage.getLocationTokenByHash(tokenHash);
      
      if (!tokenRecord) {
        return res.status(404).json({ message: "Ongeldige of verlopen link" });
      }
      
      // Check expiry
      if (new Date(tokenRecord.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Deze link is verlopen" });
      }
      
      // Check if already used
      if (tokenRecord.usedAt) {
        return res.status(410).json({ message: "Deze link is al gebruikt" });
      }
      
      // Mark token as used BEFORE update (race condition prevention)
      await storage.markLocationTokenUsed(tokenRecord.id);
      
      // Validate submission data - visitorsPerWeek is required
      const portalDataSchema = z.object({
        name: z.string().min(1, "Locatienaam is verplicht"),
        contactName: z.string().optional(),
        phone: z.string().optional(),
        street: z.string().min(1, "Straat is verplicht"),
        houseNumber: z.string().min(1, "Huisnummer is verplicht"),
        zipcode: z.string().min(1, "Postcode is verplicht"),
        city: z.string().min(1, "Plaats is verplicht"),
        visitorsPerWeek: z.number().min(1, "Bezoekers per week is verplicht"),
        openingHours: z.string().optional(),
        branche: z.string().optional(),
      });
      
      const data = portalDataSchema.parse(req.body);
      
      // Get current location for locationCode
      const existingLocation = await storage.getLocation(tokenRecord.locationId);
      
      // Update location with submitted data
      const location = await storage.updateLocation(tokenRecord.locationId, {
        name: data.name,
        contactName: data.contactName,
        phone: data.phone,
        street: data.street,
        houseNumber: data.houseNumber,
        zipcode: data.zipcode,
        city: data.city,
        visitorsPerWeek: data.visitorsPerWeek,
        openingHours: data.openingHours,
        branche: data.branche,
        status: "pending_pi",
        onboardingStatus: "details_completed",
      });
      
      // Log event
      await storage.createLocationOnboardingEvent({
        locationId: tokenRecord.locationId,
        eventType: "details_submitted",
        eventData: { submittedFields: Object.keys(data) },
      });
      
      console.log(`[Location Portal] Details submitted for location ${tokenRecord.locationId}`);
      
      // Send internal notification email to info@elevizion.nl
      try {
        const locationCode = existingLocation?.locationCode || location?.locationCode || "Unknown";
        await sendEmail({
          to: "info@elevizion.nl",
          subject: `[Locatie Onboarding] ${data.name} (${locationCode}) heeft gegevens ingevuld`,
          html: `
            <h2>Nieuwe locatie onboarding voltooid</h2>
            <p>Een klant heeft de locatiegegevens ingevuld via de portal.</p>
            <hr>
            <h3>Locatie Details</h3>
            <ul>
              <li><strong>Locatiecode:</strong> ${locationCode}</li>
              <li><strong>Naam:</strong> ${data.name}</li>
              <li><strong>Contactpersoon:</strong> ${data.contactName || "-"}</li>
              <li><strong>Telefoon:</strong> ${data.phone || "-"}</li>
            </ul>
            <h3>Adres</h3>
            <p>${data.street} ${data.houseNumber}<br>${data.zipcode} ${data.city}</p>
            <h3>Extra Info</h3>
            <ul>
              <li><strong>Bezoekers per week:</strong> ${data.visitorsPerWeek}</li>
              <li><strong>Openingstijden:</strong> ${data.openingHours || "-"}</li>
              <li><strong>Branche:</strong> ${data.branche || "-"}</li>
            </ul>
            <hr>
            <p>De locatie staat nu op status <strong>pending_pi</strong> (wacht op installatie).</p>
            <p><a href="https://elevizion.nl/locations/${tokenRecord.locationId}">Bekijk in dashboard</a></p>
          `,
          templateKey: "location_onboarding_completed",
          entityType: "location",
          entityId: tokenRecord.locationId,
        });
        console.log(`[Location Portal] Internal notification sent to info@elevizion.nl`);
      } catch (emailError) {
        console.error(`[Location Portal] Failed to send internal notification:`, emailError);
        // Don't fail the request if email fails
      }
      
      res.json({ 
        message: "Gegevens succesvol opgeslagen",
        location,
      });
    } catch (error: any) {
      console.error("[Location Portal] Error submitting details:", error);
      res.status(400).json({ message: error.message });
    }
  });

  // ============================================================================
  // LOCATION ONBOARDING 2.0 (Two-phase: Intake + Contract)
  // ============================================================================

  // Admin: Create new location invite
  app.post("/api/location-onboarding/invite", async (req, res) => {
    try {
      const { companyName, email } = req.body;
      if (!companyName || !email) {
        return res.status(400).json({ error: "Bedrijfsnaam en email zijn verplicht" });
      }

      const { createLocationInvite } = await import("./services/locationOnboarding");
      const result = await createLocationInvite(companyName, email, req.user?.username || "system");
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ 
        success: true, 
        locationId: result.locationId,
        intakeUrl: result.intakeUrl,
        message: "Uitnodiging verzonden"
      });
    } catch (error: any) {
      console.error("[LocationOnboarding] Invite error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Approve location
  app.post("/api/location-onboarding/:id/approve", async (req, res) => {
    try {
      const { approveLocation } = await import("./services/locationOnboarding");
      const result = await approveLocation(req.params.id, req.user?.username || "admin");
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ 
        success: true, 
        contractUrl: result.contractUrl,
        message: "Locatie goedgekeurd"
      });
    } catch (error: any) {
      console.error("[LocationOnboarding] Approve error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Reject location
  app.post("/api/location-onboarding/:id/reject", async (req, res) => {
    try {
      const { rejectLocation } = await import("./services/locationOnboarding");
      const result = await rejectLocation(req.params.id, req.user?.username || "admin", req.body.reason);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, message: "Locatie afgewezen" });
    } catch (error: any) {
      console.error("[LocationOnboarding] Reject error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Resend intake link
  app.post("/api/location-onboarding/:id/resend-intake", async (req, res) => {
    try {
      const { resendIntakeLink } = await import("./services/locationOnboarding");
      const result = await resendIntakeLink(req.params.id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, message: "Intake link opnieuw verzonden" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Resend contract link
  app.post("/api/location-onboarding/:id/resend-contract", async (req, res) => {
    try {
      const { resendContractLink } = await import("./services/locationOnboarding");
      const result = await resendContractLink(req.params.id);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, message: "Contract link opnieuw verzonden" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUBLIC: Validate intake token
  app.get("/api/public/location-intake/:token", async (req, res) => {
    try {
      const { validateIntakeToken } = await import("./services/locationOnboarding");
      const result = await validateIntakeToken(req.params.token);
      
      if (!result.valid) {
        return res.status(403).json({ error: result.error });
      }
      
      res.json({
        name: result.location.name,
        email: result.location.email,
        contactName: result.location.contactName,
        phone: result.location.phone,
        street: result.location.street,
        houseNumber: result.location.houseNumber,
        zipcode: result.location.zipcode,
        city: result.location.city,
        locationType: result.location.locationType,
        visitorsPerWeek: result.location.visitorsPerWeek,
        openingHours: result.location.openingHours,
        notes: result.location.notes,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUBLIC: Submit intake form
  app.post("/api/public/location-intake/:token", async (req, res) => {
    try {
      const { submitIntake } = await import("./services/locationOnboarding");
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      
      const result = await submitIntake(req.params.token, req.body, ip, userAgent);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, message: "Gegevens opgeslagen" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUBLIC: Validate contract token
  app.get("/api/public/location-contract/:token", async (req, res) => {
    try {
      const { validateContractToken } = await import("./services/locationOnboarding");
      const result = await validateContractToken(req.params.token);
      
      if (!result.valid) {
        return res.status(403).json({ error: result.error });
      }
      
      res.json({
        name: result.location.name,
        email: result.location.email,
        contactName: result.location.contactName,
        address: result.location.address,
        city: result.location.city,
        visitorsPerWeek: result.location.visitorsPerWeek,
        hasIban: !!result.location.bankAccountIban,
        onboardingStatus: result.location.onboardingStatus,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUBLIC: Submit contract details (IBAN + checkboxes)
  app.post("/api/public/location-contract/:token/details", async (req, res) => {
    try {
      const { submitContractDetails } = await import("./services/locationOnboarding");
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      
      const result = await submitContractDetails(req.params.token, req.body, ip, userAgent);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUBLIC: Send OTP
  app.post("/api/public/location-contract/:token/send-otp", async (req, res) => {
    try {
      const { sendLocationOtp } = await import("./services/locationOnboarding");
      const result = await sendLocationOtp(req.params.token);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, message: "Bevestigingscode verzonden" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PUBLIC: Verify OTP and finalize
  app.post("/api/public/location-contract/:token/verify-otp", async (req, res) => {
    try {
      const { verifyLocationOtp } = await import("./services/locationOnboarding");
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";
      
      const result = await verifyLocationOtp(req.params.token, req.body.otpCode, ip, userAgent);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ success: true, message: "Akkoord succesvol bevestigd" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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

  // Contract auto-draft endpoint
  app.post("/api/contracts/draft", async (req, res) => {
    try {
      const { createContractDraft } = await import("./services/contractDraftService");
      const result = await createContractDraft(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating contract draft:", error);
      res.status(400).json({ message: error.message || "Fout bij aanmaken concept contract" });
    }
  });

  // Create new contract version
  app.post("/api/contracts/:id/new-version", async (req, res) => {
    try {
      const { createContractVersion } = await import("./services/contractDraftService");
      const result = await createContractVersion(req.params.id, req.body);
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating contract version:", error);
      res.status(400).json({ message: error.message || "Fout bij aanmaken nieuwe versie" });
    }
  });

  // Get all contract versions for an advertiser
  app.get("/api/advertisers/:advertiserId/contract-versions", async (req, res) => {
    try {
      const { getContractVersions } = await import("./services/contractDraftService");
      const versions = await getContractVersions(req.params.advertiserId);
      res.json(versions);
    } catch (error: any) {
      console.error("Error fetching contract versions:", error);
      res.status(500).json({ message: error.message || "Fout bij ophalen contractversies" });
    }
  });

  // Contract PDF download
  app.get("/api/contracts/:id/pdf", requirePermission("view_finance"), async (req, res) => {
    try {
      const contract = await storage.getContract(req.params.id);
      if (!contract) {
        return res.status(404).json({ message: "Contract niet gevonden" });
      }

      const advertiser = contract.advertiserId 
        ? await storage.getAdvertiser(contract.advertiserId) 
        : null;
      
      const placements = await storage.getPlacementsByContract(contract.id);
      const screenNames: string[] = [];
      for (const p of placements) {
        if (p.screenId) {
          const screen = await storage.getScreen(p.screenId);
          if (screen) screenNames.push(screen.name || screen.screenId);
        }
      }

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        const filename = `Contract-${contract.name?.replace(/[^a-zA-Z0-9]/g, "_") || contract.id}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
      });

      doc.fontSize(20).font("Helvetica-Bold").text("Reclamecontract", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#f8a12f").text("Elevizion - See Your Business Grow", { align: "center" });
      doc.fillColor("#000000");
      doc.moveDown(2);

      doc.fontSize(14).font("Helvetica-Bold").text("Partijen");
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica");
      doc.text(`Leverancier: Elevizion B.V.`);
      doc.text(`Klant: ${advertiser?.companyName || "Onbekend"}`);
      if (advertiser?.contactName) doc.text(`T.a.v.: ${advertiser.contactName}`);
      doc.moveDown(1);

      doc.fontSize(14).font("Helvetica-Bold").text("Contractgegevens");
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica");
      doc.text(`Contractnaam: ${contract.name || contract.title}`);
      doc.text(`Startdatum: ${contract.startDate ? new Date(contract.startDate).toLocaleDateString("nl-NL") : "N.v.t."}`);
      if (contract.endDate) doc.text(`Einddatum: ${new Date(contract.endDate).toLocaleDateString("nl-NL")}`);
      doc.text(`Prijs per maand: € ${contract.monthlyPriceExVat || "0.00"} excl. BTW`);
      doc.text(`BTW: ${contract.vatPercent || "21"}%`);
      doc.text(`Status: ${contract.status}`);
      doc.moveDown(1);

      if (screenNames.length > 0) {
        doc.fontSize(14).font("Helvetica-Bold").text("Toegewezen schermen");
        doc.moveDown(0.5);
        doc.fontSize(11).font("Helvetica");
        screenNames.forEach((name, i) => doc.text(`${i + 1}. ${name}`));
        doc.moveDown(1);
      }

      doc.fontSize(14).font("Helvetica-Bold").text("Voorwaarden");
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica");
      doc.text("1. Dit contract wordt aangegaan voor de overeengekomen periode.");
      doc.text("2. Facturering vindt maandelijks vooraf plaats via automatische incasso.");
      doc.text("3. Opzegging dient schriftelijk te gebeuren met een termijn van 1 maand.");
      doc.text("4. Op dit contract zijn de Algemene Voorwaarden van Elevizion B.V. van toepassing.");
      doc.moveDown(2);

      doc.fontSize(10).text(`Gegenereerd op: ${new Date().toLocaleDateString("nl-NL")}`, { align: "right" });

      doc.end();
    } catch (error: any) {
      console.error("[Contract PDF] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // PLACEMENTS
  // ============================================================================

  app.get("/api/placements", async (_req, res) => {
    const placements = await storage.getPlacements();
    res.json(placements);
  });

  // Get all ads (from Yodeck media) with linked/unlinked/archived status
  // Supports filtering: ?status=UNLINKED|LINKED|ARCHIVED&includeArchived=true&q=search
  app.get("/api/placements/ads-view", async (req, res) => {
    try {
      const { status: statusFilter, includeArchived, q: searchQuery, playlistId } = req.query;
      
      const mediaLinks = await storage.getYodeckMediaLinks();
      const screens = await storage.getScreens();
      const advertisers = await storage.getAdvertisers();
      const screenContentItems = await storage.getAllScreenContentItems();
      
      // Filter to only show ads (not non_ad content)
      let ads = mediaLinks.filter(m => m.category === 'ad');
      
      // By default, hide archived unless explicitly requested
      if (includeArchived !== 'true') {
        ads = ads.filter(m => (m as any).status !== 'ARCHIVED');
      }
      
      // Filter by status if specified
      if (statusFilter && typeof statusFilter === 'string') {
        ads = ads.filter(m => (m as any).status === statusFilter.toUpperCase());
      }
      
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
      
      // Import matching service
      const { findBestMatch } = await import("./services/adMatchingService");
      
      // Map advertisers with name fallback for matching
      const advertiserData = advertisers.map(a => ({ 
        id: a.id, 
        companyName: a.companyName || "", 
        name: (a as any).name || "" 
      }));
      
      // Build response with all ads + suggestions
      let result = ads.map(ad => {
        const advertiser = ad.advertiserId ? advertisers.find(a => a.id === ad.advertiserId) : null;
        const screensPlaying = adScreenMap[ad.yodeckMediaId] || [];
        // Use database status field, fall back to computed status for backwards compat
        const dbStatus = (ad as any).status || (ad.advertiserId || ad.placementId ? 'LINKED' : 'UNLINKED');
        
        // Calculate suggestion for unlinked ads (or ads without manual match)
        let suggestedAdvertiserId: string | null = null;
        let suggestedAdvertiserName: string | null = null;
        let suggestedConfidence: number | null = null;
        let matchStatus: 'none' | 'suggested' | 'auto' | 'manual' = 'none';
        
        // Only calculate suggestions for unlinked ads or ads without existing manual match
        const existingMatchType = (ad as any).matchType;
        if (!ad.advertiserId && existingMatchType !== 'manual') {
          const match = findBestMatch(ad.name, advertiserData);
          if (match.advertiserId) {
            suggestedAdvertiserId = match.advertiserId;
            suggestedAdvertiserName = match.advertiserName || null;
            suggestedConfidence = Math.round(match.confidence * 100);
            matchStatus = match.matchType === 'auto' ? 'auto' : 'suggested';
          }
        } else if (ad.advertiserId) {
          matchStatus = existingMatchType === 'manual' ? 'manual' : (existingMatchType || 'manual');
        }
        
        return {
          yodeckMediaId: ad.yodeckMediaId,
          name: ad.name,
          mediaType: ad.mediaType,
          duration: ad.duration,
          // Linking status
          advertiserId: ad.advertiserId,
          advertiserName: advertiser?.companyName || null,
          placementId: ad.placementId,
          status: dbStatus.toLowerCase() as 'linked' | 'unlinked' | 'archived',
          // Match metadata (from DB for linked ads)
          matchType: (ad as any).matchType || null,
          matchConfidence: (ad as any).matchConfidence ? parseFloat((ad as any).matchConfidence) : null,
          // Suggested match (computed on-the-fly for unlinked ads)
          suggestedAdvertiserId,
          suggestedAdvertiserName,
          suggestedConfidence,
          matchStatus,
          // Where it's playing
          screensCount: screensPlaying.length,
          screens: screensPlaying,
          // Timestamps
          lastSeenAt: ad.lastSeenAt,
          updatedAt: ad.updatedAt,
          archivedAt: (ad as any).archivedAt || null,
        };
      });
      
      // Apply search filter
      if (searchQuery && typeof searchQuery === 'string') {
        const query = searchQuery.toLowerCase();
        result = result.filter(r => 
          r.name.toLowerCase().includes(query) ||
          r.advertiserName?.toLowerCase().includes(query) ||
          r.screens.some(s => s.locationName.toLowerCase().includes(query) || s.screenDisplayId.toLowerCase().includes(query))
        );
      }
      
      // Sort: unlinked first, then by name
      result.sort((a, b) => {
        if (a.status === 'unlinked' && b.status !== 'unlinked') return -1;
        if (a.status !== 'unlinked' && b.status === 'unlinked') return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Count all statuses (before filtering for summary)
      const allAds = mediaLinks.filter(m => m.category === 'ad');
      const summary = {
        total: allAds.filter(m => (m as any).status !== 'ARCHIVED').length,
        linked: allAds.filter(m => (m as any).status === 'LINKED').length,
        unlinked: allAds.filter(m => (m as any).status === 'UNLINKED' || !(m as any).status).length,
        archived: allAds.filter(m => (m as any).status === 'ARCHIVED').length,
      };
      
      res.json({ 
        items: result,
        summary,
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
  // YODECK MEDIA LINKS - Link/Unlink/Archive endpoints
  // ============================================================================

  // Link a Yodeck media item to an advertiser
  // Get match suggestions for a Yodeck media item
  app.get("/api/yodeck-media/:yodeckMediaId/match-suggestions", async (req, res) => {
    try {
      const yodeckMediaId = parseInt(req.params.yodeckMediaId);
      const { db } = await import("./db");
      const { findBestMatch, getSuggestedMatches } = await import("./services/adMatchingService");
      
      // Get the media item
      const mediaResult = await db.execute(sql`
        SELECT * FROM yodeck_media_links WHERE yodeck_media_id = ${yodeckMediaId}
      `);
      
      if (mediaResult.rowCount === 0) {
        return res.status(404).json({ message: "Media item niet gevonden" });
      }
      
      const media = mediaResult.rows[0] as { name: string };
      const advertisers = await storage.getAdvertisers();
      
      // Map advertisers with fallback name support
      const advertiserData = advertisers.map(a => ({ 
        id: a.id, 
        companyName: a.companyName || "", 
        name: a.name || "" 
      }));
      
      // Get best match
      const bestMatch = findBestMatch(media.name, advertiserData);
      
      // Get top 5 suggestions
      const suggestions = getSuggestedMatches(media.name, advertiserData);
      
      res.json({
        mediaName: media.name,
        bestMatch,
        suggestions: suggestions.map(s => ({
          advertiserId: s.advertiser.id,
          advertiserName: s.advertiser.companyName || s.advertiser.name,
          score: Math.round(s.score * 100),
        })),
      });
    } catch (error: any) {
      console.error("Error getting match suggestions:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/yodeck-media/:yodeckMediaId/link", async (req, res) => {
    try {
      const yodeckMediaId = parseInt(req.params.yodeckMediaId);
      const { advertiserId, matchType = 'manual', matchConfidence } = req.body;
      
      if (!advertiserId) {
        return res.status(400).json({ message: "advertiserId is vereist" });
      }
      
      // Check if advertiser exists
      const advertiser = await storage.getAdvertiser(advertiserId);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      // Update the media link with matchType and matchConfidence
      const { db } = await import("./db");
      const confidenceValue = matchConfidence !== undefined ? matchConfidence : null;
      const result = await db.execute(sql`
        UPDATE yodeck_media_links 
        SET advertiser_id = ${advertiserId}, 
            status = 'LINKED',
            match_type = ${matchType},
            match_confidence = ${confidenceValue},
            updated_at = NOW()
        WHERE yodeck_media_id = ${yodeckMediaId}
        RETURNING *
      `);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Media item niet gevonden" });
      }
      
      res.json({ 
        success: true, 
        message: `Gekoppeld aan ${advertiser.companyName}`,
        data: result.rows[0]
      });
    } catch (error: any) {
      console.error("Error linking media:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Unlink a Yodeck media item from its advertiser
  app.post("/api/yodeck-media/:yodeckMediaId/unlink", async (req, res) => {
    try {
      const yodeckMediaId = parseInt(req.params.yodeckMediaId);
      
      const { db } = await import("./db");
      const result = await db.execute(sql`
        UPDATE yodeck_media_links 
        SET advertiser_id = NULL, 
            status = 'UNLINKED',
            updated_at = NOW()
        WHERE yodeck_media_id = ${yodeckMediaId}
        RETURNING *
      `);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Media item niet gevonden" });
      }
      
      res.json({ 
        success: true, 
        message: "Koppeling verwijderd",
        data: result.rows[0]
      });
    } catch (error: any) {
      console.error("Error unlinking media:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Archive a Yodeck media item
  app.post("/api/yodeck-media/:yodeckMediaId/archive", async (req, res) => {
    try {
      const yodeckMediaId = parseInt(req.params.yodeckMediaId);
      
      const { db } = await import("./db");
      const result = await db.execute(sql`
        UPDATE yodeck_media_links 
        SET status = 'ARCHIVED',
            archived_at = NOW(),
            updated_at = NOW()
        WHERE yodeck_media_id = ${yodeckMediaId}
        RETURNING *
      `);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Media item niet gevonden" });
      }
      
      res.json({ 
        success: true, 
        message: "Gearchiveerd",
        data: result.rows[0]
      });
    } catch (error: any) {
      console.error("Error archiving media:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Unarchive a Yodeck media item
  app.post("/api/yodeck-media/:yodeckMediaId/unarchive", async (req, res) => {
    try {
      const yodeckMediaId = parseInt(req.params.yodeckMediaId);
      
      const { db } = await import("./db");
      const result = await db.execute(sql`
        UPDATE yodeck_media_links 
        SET status = CASE WHEN advertiser_id IS NULL THEN 'UNLINKED' ELSE 'LINKED' END,
            archived_at = NULL,
            updated_at = NOW()
        WHERE yodeck_media_id = ${yodeckMediaId}
        RETURNING *
      `);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Media item niet gevonden" });
      }
      
      res.json({ 
        success: true, 
        message: "Uit archief gehaald",
        data: result.rows[0]
      });
    } catch (error: any) {
      console.error("Error unarchiving media:", error);
      res.status(500).json({ message: error.message });
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
  // REVENUE ALLOCATIONS & PAYOUTS
  // ============================================================================

  // Revenue allocation endpoints
  app.post("/api/revenue-allocations/calculate", async (req, res) => {
    try {
      const { calculateRevenueAllocations } = await import("./services/revenueAllocationService");
      const { periodYear, periodMonth, advertiserId, dryRun } = req.body;
      
      if (!periodYear || !periodMonth) {
        return res.status(400).json({ message: "periodYear en periodMonth zijn verplicht" });
      }
      
      const result = await calculateRevenueAllocations({
        periodYear: parseInt(periodYear),
        periodMonth: parseInt(periodMonth),
        advertiserId,
        dryRun: dryRun === true,
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error calculating revenue allocations:", error);
      res.status(500).json({ message: error.message || "Fout bij berekenen omzetverdeling" });
    }
  });

  app.get("/api/revenue-allocations", async (req, res) => {
    try {
      const { getAllocationsForPeriod } = await import("./services/revenueAllocationService");
      const { periodYear, periodMonth } = req.query;
      
      if (!periodYear || !periodMonth) {
        return res.status(400).json({ message: "periodYear en periodMonth zijn verplicht" });
      }
      
      const allocations = await getAllocationsForPeriod(
        parseInt(periodYear as string),
        parseInt(periodMonth as string)
      );
      
      res.json(allocations);
    } catch (error: any) {
      console.error("Error fetching revenue allocations:", error);
      res.status(500).json({ message: error.message || "Fout bij ophalen omzetverdeling" });
    }
  });

  app.post("/api/location-payouts/calculate", async (req, res) => {
    try {
      const { calculateLocationPayouts } = await import("./services/revenueAllocationService");
      const { periodYear, periodMonth, dryRun } = req.body;
      
      if (!periodYear || !periodMonth) {
        return res.status(400).json({ message: "periodYear en periodMonth zijn verplicht" });
      }
      
      const payouts = await calculateLocationPayouts(
        parseInt(periodYear),
        parseInt(periodMonth),
        dryRun === true
      );
      
      res.json(payouts);
    } catch (error: any) {
      console.error("Error calculating location payouts:", error);
      res.status(500).json({ message: error.message || "Fout bij berekenen locatie payouts" });
    }
  });

  app.get("/api/visitor-weight-staffels", async (_req, res) => {
    const { getVisitorWeightStaffels } = await import("./services/revenueAllocationService");
    res.json(getVisitorWeightStaffels());
  });

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
  // EMAIL DELIVERABILITY
  // ============================================================================

  app.get("/api/email/config", isAuthenticated, async (_req, res) => {
    const { getEmailConfig, getDeliverabilityInfo } = await import("./email");
    const config = getEmailConfig();
    const deliverability = getDeliverabilityInfo();
    res.json({ config, deliverability });
  });

  // ============================================================================
  // INTEGRATIONS
  // ============================================================================

  app.get("/api/integrations/status", async (_req, res) => {
    const status = getIntegrationStatus();
    res.json(status);
  });

  // Yodeck config-status endpoint - checks all auth options with token validation
  app.get("/api/integrations/yodeck/config-status", async (_req, res) => {
    const { getYodeckConfigStatus: getConfigStatus } = await import("./services/yodeckClient");
    const config = await getConfigStatus();
    
    res.json({
      ok: config.ok,
      activeSource: config.activeSource,
      parsedLabelPresent: config.parsedLabelPresent,
      parsedValuePresent: config.parsedValuePresent,
      tokenFormatValid: config.tokenFormatValid,
      formatError: config.formatError,
      baseUrl: config.baseUrl,
      authFormatExample: config.authFormatExample,
      envPriority: config.envPriority,
    });
  });
  
  // Yodeck capabilities probe endpoint
  app.get("/api/integrations/yodeck/capabilities", isAuthenticated, async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true";
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const capabilities = await yodeckPublishService.getCapabilities(forceRefresh);
      res.json({ ok: true, capabilities });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Batch ensure tag-based playlists for all locations
  app.post("/api/sync/yodeck/ensure-tag-playlists", isAuthenticated, requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const result = await yodeckPublishService.ensureAllTagBasedPlaylists();
      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Location Yodeck status endpoint
  app.get("/api/locations/:id/yodeck-status", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const location = await db.query.locations.findFirst({
        where: eq(locations.id, id),
      });
      
      if (!location) {
        return res.status(404).json({ ok: false, error: "Location not found" });
      }
      
      res.json({
        ok: true,
        locationId: location.id,
        playlistId: location.yodeckPlaylistId,
        playlistTag: location.playlistTag || `elevizion:location:${location.id}`,
        playlistMode: location.playlistMode,
        verifyStatus: location.yodeckPlaylistVerifyStatus,
        verifiedAt: location.yodeckPlaylistVerifiedAt,
        lastError: location.lastYodeckVerifyError,
        screenId: location.yodeckDeviceId,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  console.log("[routes] Yodeck routes registered: GET /api/integrations/yodeck/config-status, POST /api/integrations/yodeck/test, GET /api/integrations/yodeck/capabilities");
  console.log("[routes] Sync routes registered: POST /api/sync/yodeck/run, POST /api/sync/yodeck/ensure-tag-playlists");

  // ============================================================================
  // INTEGRATION OUTBOX ROUTES (SSOT Pattern)
  // ============================================================================

  const { getOutboxStats, retryFailedJobs, getEntitySyncStatus, enqueueMoneybirdContactSync, enqueueYodeckDeviceLink } = await import("./services/outboxService");
  const { processOutboxBatch, getWorkerStatus } = await import("./services/outboxWorker");

  app.get("/api/sync/outbox/status", isAuthenticated, async (_req, res) => {
    try {
      const stats = await getOutboxStats();
      const workerStatus = getWorkerStatus();
      res.json({ 
        ok: true, 
        queued: stats.queued,
        processing: stats.processing,
        failed: stats.failed,
        completed: stats.succeeded,
        total: stats.total,
        worker: workerStatus 
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.post("/api/sync/outbox/run", isAuthenticated, requirePermission("manage_system"), async (_req, res) => {
    try {
      const result = await processOutboxBatch(20);
      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.post("/api/sync/outbox/retry-failed", isAuthenticated, requirePermission("manage_system"), async (req, res) => {
    try {
      const provider = req.body.provider as "moneybird" | "yodeck" | undefined;
      const retriedCount = await retryFailedJobs(provider);
      res.json({ ok: true, retriedCount });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.get("/api/sync/entity/:entityType/:entityId", isAuthenticated, async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const status = await getEntitySyncStatus(entityType as any, entityId);
      res.json({ ok: true, ...status });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.post("/api/sync/entity/:entityType/:entityId/resync", isAuthenticated, requirePermission("manage_system"), async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const { provider } = req.body;

      if (provider === "moneybird" || !provider) {
        await enqueueMoneybirdContactSync(entityType as any, entityId);
      }
      if (provider === "yodeck" || !provider) {
        if (entityType === "screen") {
          await enqueueYodeckDeviceLink(entityId);
        }
      }

      res.json({ ok: true, message: "Resync job queued" });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  app.get("/api/sync/outbox/failed", isAuthenticated, async (req, res) => {
    try {
      const provider = req.query.provider as string | undefined;
      const failedJobs = await storage.getFailedOutboxJobs(provider);
      res.json({ ok: true, jobs: failedJobs.slice(0, 50) });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  console.log("[routes] Outbox sync routes registered: /api/sync/outbox/*");

  // Data Health endpoint - summary of sync status across all entities
  app.get("/api/sync/data-health", isAuthenticated, async (_req, res) => {
    try {
      const [screens, locations, advertisers] = await Promise.all([
        storage.getScreens(),
        storage.getLocations(),
        storage.getAdvertisers(),
      ]);
      
      const outboxStats = await getOutboxStats();
      
      const screenStats = {
        total: screens.length,
        synced: screens.filter(s => s.yodeckSyncStatus === "synced").length,
        pending: screens.filter(s => s.yodeckSyncStatus === "pending").length,
        failed: screens.filter(s => s.yodeckSyncStatus === "failed").length,
        notLinked: screens.filter(s => !s.yodeckSyncStatus || s.yodeckSyncStatus === "not_linked").length,
      };
      
      const locationStats = {
        total: locations.length,
        synced: locations.filter(l => l.moneybirdSyncStatus === "synced").length,
        pending: locations.filter(l => l.moneybirdSyncStatus === "pending").length,
        failed: locations.filter(l => l.moneybirdSyncStatus === "failed").length,
        notLinked: locations.filter(l => !l.moneybirdSyncStatus || l.moneybirdSyncStatus === "not_linked").length,
      };
      
      const advertiserStats = {
        total: advertisers.length,
        synced: advertisers.filter(a => a.moneybirdSyncStatus === "synced").length,
        pending: advertisers.filter(a => a.moneybirdSyncStatus === "pending").length,
        failed: advertisers.filter(a => a.moneybirdSyncStatus === "failed").length,
        notLinked: advertisers.filter(a => !a.moneybirdSyncStatus || a.moneybirdSyncStatus === "not_linked").length,
      };
      
      const healthScore = Math.round(
        ((screenStats.synced + locationStats.synced + advertiserStats.synced) /
        Math.max(screenStats.total + locationStats.total + advertiserStats.total, 1)) * 100
      );
      
      res.json({
        ok: true,
        healthScore,
        screens: screenStats,
        locations: locationStats,
        advertisers: advertiserStats,
        outbox: {
          queued: outboxStats.queued,
          processing: outboxStats.processing,
          failed: outboxStats.failed,
          completed: outboxStats.succeeded,
        },
        failedItems: {
          screens: screens.filter(s => s.yodeckSyncStatus === "failed").map(s => ({ id: s.id, screenId: s.screenId, error: s.yodeckSyncError })),
          locations: locations.filter(l => l.moneybirdSyncStatus === "failed").map(l => ({ id: l.id, name: l.name, error: l.moneybirdSyncError })),
          advertisers: advertisers.filter(a => a.moneybirdSyncStatus === "failed").map(a => ({ id: a.id, name: a.companyName, error: a.moneybirdSyncError })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });
  
  console.log("[routes] Data health endpoint registered: /api/sync/data-health");

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
  // Also tests upload functionality with diagnostic details
  app.post("/api/integrations/yodeck/test", async (req, res) => {
    console.log("[YODECK TEST] handler hit");
    try {
      // Step 0: Check token format before making API calls
      const { getYodeckToken } = await import("./services/yodeckClient");
      const token = await getYodeckToken();
      
      if (!token.isValid) {
        console.log(`[YODECK TEST] Token invalid: ${token.error}`);
        return res.status(400).json({
          ok: false,
          success: false,
          screensOk: false,
          uploadOk: false,
          error: token.error || 'Yodeck token must be label:apikey',
          activeSource: token.source,
          parsedLabelPresent: Boolean(token.label),
          parsedValuePresent: Boolean(token.value),
          tokenFormatValid: false,
        });
      }
      
      // Step 1: Test API connection (list screens)
      const result = await testYodeckConnection();
      console.log(`[YODECK TEST] screens result: ok=${result.ok}, count=${(result as any).count || 0}`);
      
      // If Yodeck returned non-JSON or non-2xx, return 502 Bad Gateway
      if (!result.ok) {
        const httpStatus = (result.contentType && !result.contentType.includes("application/json")) ? 502 : (result.statusCode || 400);
        return res.status(httpStatus).json({
          ok: false,
          success: false,
          screensOk: false,
          uploadOk: false,
          message: result.message,
          status: result.statusCode,
          requestedUrl: result.requestedUrl,
          contentType: result.contentType,
          bodyPreview: result.bodyPreview,
        });
      }
      
      // Step 2: Test upload only if explicitly requested via ?testUpload=true
      // Upload test requires ffmpeg and creates a test file in Yodeck (cleaned up after)
      const wantUploadTest = req.query.testUpload === 'true';
      let uploadResult: any = null;
      
      if (wantUploadTest) {
        console.log("[YODECK TEST] Testing upload (testUpload=true requested)...");
        const { yodeckPublishService } = await import("./services/yodeckPublishService");
        uploadResult = await yodeckPublishService.testUpload();
        console.log(`[YODECK TEST] upload result: uploadOk=${uploadResult.uploadOk}, method=${uploadResult.uploadMethodUsed}`);
      }
      
      res.json({
        ok: true,
        success: true,
        screensOk: true,
        // Upload results with full diagnostics
        uploadOk: uploadResult?.uploadOk ?? null,
        uploadMethodUsed: uploadResult?.uploadMethodUsed ?? null,
        // Detailed step diagnostics from new format
        metadata: uploadResult?.metadata ?? null,
        binaryUpload: uploadResult?.binaryUpload ?? null,
        confirm: uploadResult?.confirm ?? null,
        lastError: uploadResult?.lastError ?? null,
        yodeckMediaId: uploadResult?.yodeckMediaId ?? null,
        // Screen test results
        message: result.message,
        count: (result as any).count,
        sampleFields: (result as any).sampleFields,
        status: result.statusCode,
        requestedUrl: result.requestedUrl,
        // Build info for deploy mismatch debugging
        buildId: BUILD_ID,
        builtAt: BUILD_TIME,
      });
    } catch (error: any) {
      console.error("[YODECK TEST] error:", error.message);
      res.status(500).json({
        ok: false,
        success: false,
        screensOk: false,
        uploadOk: false,
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
  
  // ============================================================================
  // YODECK PLAYLIST MAPPING (Bulk update for admin page)
  // ============================================================================
  
  // Bulk update location Yodeck mappings
  app.post("/api/locations/bulk-yodeck-mapping", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const bodySchema = z.object({
        mappings: z.array(z.object({
          locationId: z.string(),
          yodeckPlayerId: z.string().nullable().optional(),
          yodeckPlaylistId: z.string().nullable().optional(),
        })),
      });
      
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Ongeldige invoer", errors: parsed.error.errors });
      }
      
      const mappings = parsed.data.mappings;
      let updated = 0;
      let errors: string[] = [];
      
      for (const mapping of mappings) {
        try {
          const location = await storage.getLocation(mapping.locationId);
          if (!location) {
            errors.push(`Locatie ${mapping.locationId} niet gevonden`);
            continue;
          }
          
          await storage.updateLocation(mapping.locationId, {
            yodeckPlayerId: mapping.yodeckPlayerId || null,
            yodeckPlaylistId: mapping.yodeckPlaylistId || null,
          });
          updated++;
        } catch (err: any) {
          errors.push(`Fout bij ${mapping.locationId}: ${err.message}`);
        }
      }
      
      console.log(`[Bulk Yodeck Mapping] ${updated} locaties bijgewerkt, ${errors.length} fouten`);
      
      res.json({
        success: true,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        message: `${updated} locatie(s) bijgewerkt${errors.length > 0 ? `, ${errors.length} fout(en)` : ""}`,
      });
    } catch (error: any) {
      console.error("[Bulk Yodeck Mapping] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Auto-match locations to Yodeck screens/playlists
  app.post("/api/locations/auto-match-yodeck", requirePermission("manage_integrations"), async (_req, res) => {
    try {
      const locations = await storage.getLocations();
      const { getYodeckClient } = await import("./services/yodeckClient");
      const client = await getYodeckClient();
      
      if (!client) {
        return res.status(503).json({ message: "Yodeck API niet geconfigureerd" });
      }
      
      const [screens, playlists] = await Promise.all([
        client.getScreens(),
        client.getPlaylists()
      ]);
      
      const normalize = (str: string | null | undefined): string => {
        if (!str) return "";
        return str.toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      };
      
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
      
      const suggestions: Array<{
        locationId: string;
        locationName: string;
        suggestedScreenId: number | null;
        suggestedScreenName: string | null;
        suggestedPlaylistId: number | null;
        suggestedPlaylistName: string | null;
        screenScore: number;
        playlistScore: number;
      }> = [];
      
      for (const location of locations) {
        let bestScreen: { id: number; name: string; score: number } | null = null;
        let bestPlaylist: { id: number; name: string; score: number } | null = null;
        
        // Match screens
        for (const screen of screens) {
          const similarity = tokenSimilarity(location.name, screen.name);
          if (similarity > 0.5 && (!bestScreen || similarity > bestScreen.score)) {
            bestScreen = { id: screen.id, name: screen.name, score: similarity };
          }
        }
        
        // Match playlists - look for "{location} ads" or exact match
        for (const playlist of playlists) {
          const playlistName = playlist.name || "";
          const similarity = tokenSimilarity(location.name, playlistName);
          
          // Boost score if playlist name contains "ads" pattern
          const adsPatternBoost = 
            playlistName.toLowerCase().includes("ads") || 
            playlistName.toLowerCase().includes("advertenties") ? 0.1 : 0;
          
          const totalScore = similarity + adsPatternBoost;
          if (totalScore > 0.5 && (!bestPlaylist || totalScore > bestPlaylist.score)) {
            bestPlaylist = { id: playlist.id, name: playlistName, score: totalScore };
          }
        }
        
        // Only add to suggestions if at least one match found
        if (bestScreen || bestPlaylist) {
          suggestions.push({
            locationId: location.id,
            locationName: location.name,
            suggestedScreenId: bestScreen?.id || null,
            suggestedScreenName: bestScreen?.name || null,
            suggestedPlaylistId: bestPlaylist?.id || null,
            suggestedPlaylistName: bestPlaylist?.name || null,
            screenScore: bestScreen?.score || 0,
            playlistScore: bestPlaylist?.score || 0,
          });
        }
      }
      
      res.json({
        success: true,
        suggestions,
        totalLocations: locations.length,
        totalScreens: screens.length,
        totalPlaylists: playlists.length,
      });
    } catch (error: any) {
      console.error("[Auto-match Yodeck] Error:", error);
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
      
      // Invalidate availability cache (signed = reserved capacity)
      invalidateAvailabilityCache();

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

  // Monthly reporting endpoints
  app.post("/api/monthly-reports/generate", async (req, res) => {
    try {
      const { 
        generateAdvertiserReports, 
        generateLocationReports 
      } = await import("./services/monthlyReportingService");
      
      const { periodYear, periodMonth, reportType, sendEmails } = req.body;
      
      if (!periodYear || !periodMonth) {
        return res.status(400).json({ message: "periodYear en periodMonth zijn verplicht" });
      }
      
      const results = {
        advertiser: { generated: 0, sent: 0, errors: [] as string[] },
        location: { generated: 0, sent: 0, errors: [] as string[] },
      };
      
      if (!reportType || reportType === "advertiser") {
        results.advertiser = await generateAdvertiserReports(
          { year: parseInt(periodYear), month: parseInt(periodMonth) },
          sendEmails === true
        );
      }
      
      if (!reportType || reportType === "location") {
        results.location = await generateLocationReports(
          { year: parseInt(periodYear), month: parseInt(periodMonth) },
          sendEmails === true
        );
      }
      
      res.json(results);
    } catch (error: any) {
      console.error("Error generating monthly reports:", error);
      res.status(500).json({ message: error.message || "Fout bij genereren rapporten" });
    }
  });

  app.get("/api/monthly-reports", async (req, res) => {
    try {
      const { getReportsForPeriod } = await import("./services/monthlyReportingService");
      const { periodYear, periodMonth, reportType } = req.query;
      
      if (!periodYear || !periodMonth) {
        return res.status(400).json({ message: "periodYear en periodMonth zijn verplicht" });
      }
      
      const reports = await getReportsForPeriod(
        { year: parseInt(periodYear as string), month: parseInt(periodMonth as string) },
        reportType as "advertiser" | "location" | undefined
      );
      
      res.json(reports);
    } catch (error: any) {
      console.error("Error fetching monthly reports:", error);
      res.status(500).json({ message: error.message || "Fout bij ophalen rapporten" });
    }
  });

  app.post("/api/monthly-reports/:id/resend", async (req, res) => {
    try {
      const { resendReport } = await import("./services/monthlyReportingService");
      const success = await resendReport(req.params.id);
      
      if (success) {
        res.json({ message: "Rapport opnieuw verzonden" });
      } else {
        res.status(404).json({ message: "Rapport niet gevonden of geen e-mailadres" });
      }
    } catch (error: any) {
      console.error("Error resending report:", error);
      res.status(500).json({ message: error.message || "Fout bij verzenden rapport" });
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

  app.get("/api/leads", async (req, res) => {
    const { q, type, status, onlyNew, dateRange, sortBy, sortDir, page, pageSize, isHandled, isDeleted } = req.query;
    
    // If any pagination/filter params provided, use paginated endpoint
    if (q || type || status || onlyNew || dateRange || sortBy || sortDir || page || pageSize || isHandled !== undefined || isDeleted !== undefined) {
      const result = await storage.getLeadsPaginated({
        q: q as string,
        type: type as string,
        status: status as string,
        onlyNew: onlyNew === "true",
        dateRange: dateRange as "7" | "30" | "all",
        sortBy: sortBy as "createdAt" | "companyName" | "status" | "handledAt" | "deletedAt",
        sortDir: sortDir as "asc" | "desc",
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 25,
        isHandled: isHandled === "true" ? true : isHandled === "false" ? false : undefined,
        isDeleted: isDeleted === "true",
      });
      return res.json(result);
    }
    
    // Legacy: return all leads as array for backwards compatibility (excludes deleted)
    const result = await storage.getLeadsPaginated({ isDeleted: false });
    res.json(result.items);
  });

  app.get("/api/leads/:id", async (req, res) => {
    const lead = await storage.getLead(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead niet gevonden" });
    res.json(lead);
  });

  const websiteLeadSchema = z.object({
    leadType: z.enum(["ADVERTEREN", "SCHERM"]),
    companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
    contactPerson: z.string().min(1, "Contactpersoon is verplicht"),
    email: z.string().email("Ongeldig e-mailadres"),
    phone: z.string().min(6, "Telefoonnummer is verplicht"),
    honeypot: z.string().optional(),
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      if (!checkLeadRateLimit(ip)) {
        return res.status(429).json({ message: "Te veel aanvragen. Probeer het later opnieuw." });
      }
      
      const result = websiteLeadSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const data = result.data;
      
      if (data.honeypot) {
        return res.status(200).json({ success: true });
      }
      
      const leadType = data.leadType === "ADVERTEREN" ? "advertiser" : "location";
      const lead = await storage.createLead({
        type: leadType,
        companyName: data.companyName,
        contactName: data.contactPerson,
        email: data.email,
        phone: data.phone,
        status: "nieuw",
        source: "website",
      });
      
      const typeLabel = data.leadType === "ADVERTEREN" ? "Adverteren" : "Scherm";
      const now = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
      
      try {
        await sendEmail({
          to: "info@elevizion.nl",
          subject: `Nieuwe lead: ${typeLabel} - ${data.companyName}`,
          html: `
            <h2>Nieuwe lead via website</h2>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${typeLabel}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Bedrijfsnaam:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.companyName}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Contactpersoon:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.contactPerson}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>E-mail:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.email}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Telefoon:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.phone}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Datum/tijd:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${now}</td></tr>
            </table>
          `,
          templateKey: "lead_notification",
        });
        
        await sendEmail({
          to: data.email,
          subject: "We hebben je aanvraag ontvangen – Elevizion",
          html: `
            <h2>Hallo ${data.contactPerson},</h2>
            <p>Bedankt! We hebben je aanvraag ontvangen.</p>
            <p>We nemen binnen 1 werkdag contact met je op om de mogelijkheden te bespreken.</p>
            <p>Met vriendelijke groet,<br>Team Elevizion</p>
          `,
          templateKey: "lead_confirmation",
        });
      } catch (emailError) {
        console.warn("Email verzenden mislukt, lead is wel opgeslagen:", emailError);
      }
      
      res.status(201).json({ success: true, id: lead.id });
    } catch (error: any) {
      console.error("Error creating lead:", error);
      res.status(500).json({ message: "Er ging iets mis. Probeer het later opnieuw." });
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

  app.patch("/api/leads/:id/handle", async (req, res) => {
    try {
      const { isHandled } = req.body;
      if (typeof isHandled !== "boolean") {
        return res.status(400).json({ message: "isHandled (boolean) is verplicht" });
      }
      const { db } = await import("./db");
      const [lead] = await db.update(leads)
        .set({
          isHandled,
          handledAt: isHandled ? new Date() : null,
          handledBy: isHandled ? (req.user?.username || null) : null,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, req.params.id))
        .returning();
      if (!lead) return res.status(404).json({ message: "Lead niet gevonden" });
      res.json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/leads/:id/delete", async (req, res) => {
    try {
      const { db } = await import("./db");
      const [lead] = await db.update(leads)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user?.username || null,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, req.params.id))
        .returning();
      if (!lead) return res.status(404).json({ message: "Lead niet gevonden" });
      res.json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/leads/:id/restore", async (req, res) => {
    try {
      const { db } = await import("./db");
      const [lead] = await db.update(leads)
        .set({
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, req.params.id))
        .returning();
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

  // Create test lead endpoint for demo/testing
  app.post("/api/leads/create-test", async (_req, res) => {
    try {
      const { inferLeadCategory } = await import("./services/leadCategoryService");
      const testCompanyName = "Basil's Barbershop";
      const { category, confidence } = inferLeadCategory(testCompanyName);
      
      const lead = await storage.createLead({
        type: "advertiser",
        companyName: testCompanyName,
        contactName: "Basil van der Berg",
        email: "basil@barbershop-test.nl",
        phone: "06-12345678",
        status: "nieuw",
        source: "test",
        category: category,
        inferredCategory: category,
        inferredConfidence: String(confidence),
        notes: `Auto-categorisatie: ${category} (${Math.round(confidence * 100)}% zekerheid) - Dit is een testlead`,
      });
      
      res.status(201).json({ 
        success: true, 
        id: lead.id,
        category,
        confidence: Math.round(confidence * 100),
      });
    } catch (error: any) {
      console.error("Error creating test lead:", error);
      res.status(500).json({ message: error.message || "Fout bij aanmaken testlead" });
    }
  });

  // Advertiser leads endpoints
  app.get("/api/advertiser-leads", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const result = await db.execute(sql`
        SELECT * FROM advertiser_leads ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching advertiser leads:", error);
      res.status(500).json({ message: "Fout bij ophalen leads" });
    }
  });

  app.patch("/api/advertiser-leads/:id/category", async (req, res) => {
    try {
      const { category } = req.body;
      const { LEAD_CATEGORIES } = await import("@shared/schema");
      if (!LEAD_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Ongeldige categorie" });
      }
      const { db } = await import("./db");
      await db.execute(sql`
        UPDATE advertiser_leads 
        SET final_category = ${category} 
        WHERE id = ${parseInt(req.params.id)}
      `);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating advertiser lead category:", error);
      res.status(500).json({ message: "Fout bij updaten categorie" });
    }
  });

  // Screen leads endpoints
  app.get("/api/screen-leads", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const result = await db.execute(sql`
        SELECT * FROM screen_leads ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching screen leads:", error);
      res.status(500).json({ message: "Fout bij ophalen leads" });
    }
  });

  app.patch("/api/screen-leads/:id/category", async (req, res) => {
    try {
      const { category } = req.body;
      const { LEAD_CATEGORIES } = await import("@shared/schema");
      if (!LEAD_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Ongeldige categorie" });
      }
      const { db } = await import("./db");
      await db.execute(sql`
        UPDATE screen_leads 
        SET final_category = ${category} 
        WHERE id = ${parseInt(req.params.id)}
      `);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating screen lead category:", error);
      res.status(500).json({ message: "Fout bij updaten categorie" });
    }
  });

  // Lead categories helper endpoint
  app.get("/api/lead-categories", async (_req, res) => {
    const { LEAD_CATEGORIES } = await import("@shared/schema");
    const { getCategoryLabel } = await import("./services/leadCategoryService");
    const categories = LEAD_CATEGORIES.map(cat => ({
      value: cat,
      label: getCategoryLabel(cat)
    }));
    res.json(categories);
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
    const debugInfo = {
      templateId: req.params.id,
      advertiserId: req.body?.advertiserId,
      screenId: req.body?.screenId,
      timestamp: new Date().toISOString(),
    };
    
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ 
          success: false,
          message: "Template niet gevonden",
          debugInfo,
        });
      }
      
      // Ensure template body is not null/undefined
      if (!template.body) {
        return res.status(200).json({
          success: false,
          message: "Template body is leeg",
          debugInfo: { ...debugInfo, templateName: template.name },
        });
      }
      
      const { advertiserId, screenId } = req.body || {};
      let data: Record<string, string> = {};
      
      // Demo data als geen adverteerder/scherm geselecteerd (zowel camelCase als snake_case)
      const demoData: Record<string, string> = {
        // Contact/Adverteerder - beide varianten
        contactName: "Jan de Vries",
        contact_name: "Jan de Vries",
        advertiserName: "Demo Bedrijf B.V.",
        advertiser_name: "Demo Bedrijf B.V.",
        companyName: "Demo Bedrijf B.V.",
        company_name: "Demo Bedrijf B.V.",
        phone: "06-12345678",
        email: "jan@demobedrijf.nl",
        // Scherm/Locatie - beide varianten
        screenId: "EVZ-001",
        screen_id: "EVZ-001",
        screenName: "Fitness Centrum Maastricht",
        screen_name: "Fitness Centrum Maastricht",
        locationName: "Sportcentrum Limburg",
        location_name: "Sportcentrum Limburg",
        // Onboarding
        onboardingLink: "https://elevizion.nl/onboarding/demo-token",
        onboarding_link: "https://elevizion.nl/onboarding/demo-token",
        nextSteps: "1. Log in op je dashboard\n2. Upload je eerste advertentie\n3. Selecteer schermen",
        next_steps: "1. Log in op je dashboard\n2. Upload je eerste advertentie\n3. Selecteer schermen",
        step1: "Log in op je dashboard",
        step2: "Upload je eerste advertentie", 
        step3: "Selecteer schermen",
        // Maandrapport
        month: "januari 2026",
        reportContent: "Dit is een voorbeeld maandrapport met statistieken.",
        report_content: "Dit is een voorbeeld maandrapport met statistieken.",
        // Contract specifiek - locatie revenue share
        revSharePct: "25",
        rev_share_pct: "25",
        revenueSharePercentage: "25",
        // Contract specifiek - locatie vast bedrag
        fixedAmount: "75",
        fixed_amount: "75",
        fixedMonthly: "75",
        // Contract data
        startDate: "1 februari 2026",
        start_date: "1 februari 2026",
        signDate: "15 januari 2026",
        sign_date: "15 januari 2026",
        termMonths: "12",
        term_months: "12",
        city: "Maastricht",
        // Adverteerder contract
        monthlyAmount: "199",
        monthly_amount: "199",
        screensCount: "3",
        screens_count: "3",
        packageName: "Standaard",
        package_name: "Standaard",
      };

      if (advertiserId) {
        const advertiser = await storage.getAdvertiser(advertiserId);
        if (advertiser) {
          // Derive contact name with fallback chain
          const contactName = 
            advertiser.primaryContactName || 
            advertiser.contactName || 
            advertiser.attentionOf || 
            (advertiser.firstName && advertiser.lastName 
              ? `${advertiser.firstName} ${advertiser.lastName}`.trim()
              : null) ||
            advertiser.companyName;
          
          // Set both camelCase and snake_case variants
          data.contactName = contactName;
          data.contact_name = contactName;
          data.advertiserName = advertiser.companyName;
          data.advertiser_name = advertiser.companyName;
          data.companyName = advertiser.companyName;
          data.company_name = advertiser.companyName;
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

      // Merge demo data with actual data (actual data overwrites demo data)
      const mergedData = { ...demoData, ...data };
      
      let renderedBody = template.body;
      let renderedSubject = template.subject || "";
      
      for (const [key, value] of Object.entries(mergedData)) {
        const placeholder = `{{${key}}}`;
        renderedBody = renderedBody.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value);
        renderedSubject = renderedSubject.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value);
      }
      
      // Determine format and build full preview using renderEngine
      const isEmailTemplate = template.category === "email" || template.category === "whatsapp";
      const isContractTemplate = template.category === "contract";
      
      if (isEmailTemplate) {
        // Build email using centralized render engine (single source of truth)
        try {
          const emailResult = await renderEmail({
            subject: renderedSubject,
            body: renderedBody,
            data: mergedData,
            contactName: mergedData.contactName || mergedData.contact_name,
          });
          
          res.json({
            success: true,
            subject: emailResult.subjectRendered,
            body: emailResult.bodyRendered,
            fullHtml: emailResult.finalHtmlRendered,
            plainText: emailResult.textRendered,
            format: "email",
            placeholdersUsed: template.placeholders,
            dataProvided: mergedData,
            isDemo: Object.keys(data).length === 0,
          });
        } catch (renderError: any) {
          console.error("[Template Preview] Email render error:", renderError);
          res.json({
            success: false,
            message: `Email rendering mislukt: ${renderError.message}`,
            debugInfo: { ...debugInfo, templateName: template.name, renderStage: "email" },
          });
        }
      } else if (isContractTemplate) {
        // Build contract using centralized render engine
        try {
          const contractResult = await renderContract({
            title: renderedSubject,
            body: renderedBody,
            data: mergedData,
          });
          
          res.json({
            success: true,
            subject: contractResult.title,
            body: contractResult.bodyRendered,
            fullHtml: contractResult.finalHtmlRendered,
            format: "contract",
            placeholdersUsed: template.placeholders,
            dataProvided: mergedData,
            isDemo: Object.keys(data).length === 0,
          });
        } catch (renderError: any) {
          console.error("[Template Preview] Contract render error:", renderError);
          res.json({
            success: false,
            message: `Contract rendering mislukt: ${renderError.message}`,
            debugInfo: { ...debugInfo, templateName: template.name, renderStage: "contract" },
          });
        }
      } else {
        // Other template types (internal, invoice, etc) - render as plain text
        res.json({
          success: true,
          subject: renderedSubject,
          body: renderedBody,
          format: "text",
          placeholdersUsed: template.placeholders,
          dataProvided: mergedData,
          isDemo: Object.keys(data).length === 0,
        });
      }
    } catch (error: any) {
      console.error("[Template Preview] Error:", error);
      // Never return 500 - always return structured error response
      res.status(200).json({ 
        success: false,
        message: error.message || "Onbekende fout bij preview genereren",
        errorType: error.name || "Error",
        debugInfo: {
          ...debugInfo,
          stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        },
      });
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

  // Seed default templates
  app.post("/api/templates/seed-defaults", async (_req, res) => {
    try {
      const existingTemplates = await storage.getTemplates();
      const existingKeys = existingTemplates.map(t => t.name);
      
      const defaultTemplates = [
        // === EMAIL TEMPLATES (professionele structuur) ===
        { 
          name: "lead_confirmation", 
          category: "email", 
          subject: "Bedankt voor je interesse", 
          body: `Beste {{contactName}},

Bedankt voor je interesse in Elevizion!

We hebben je aanvraag ontvangen en zijn blij dat je overweegt om deel uit te maken van ons digitale netwerk.

Wat gebeurt er nu?
- Binnen 24 uur neemt een van onze accountmanagers contact met je op
- We bespreken de mogelijkheden die het beste bij jouw situatie passen
- Je ontvangt een vrijblijvende offerte op maat

Heb je in de tussentijd vragen? Neem gerust contact met ons op via info@elevizion.nl of bel naar 043-123 4567.` 
        },
        { 
          name: "onboarding_link", 
          category: "email", 
          subject: "Voltooi je registratie", 
          body: `Beste {{contactName}},

Welkom bij Elevizion!

Fijn dat je bent begonnen met je registratie. Om je account te activeren en toegang te krijgen tot het dashboard, dien je nog enkele gegevens in te vullen.

Klik op onderstaande link om je registratie te voltooien:
{{onboardingLink}}

Let op: deze link is 7 dagen geldig.

Wat heb je nodig?
- Bedrijfsgegevens (KvK-nummer, BTW-nummer)
- Contactgegevens
- IBAN voor betalingen

Het invullen duurt ongeveer 5 minuten. Na voltooiing heb je direct toegang tot je dashboard.` 
        },
        { 
          name: "onboarding_reminder", 
          category: "email", 
          subject: "Herinnering: Voltooi je registratie", 
          body: `Beste {{contactName}},

We zagen dat je registratie nog niet is voltooid.

Je bent al begonnen, maar we missen nog enkele gegevens om je account te activeren. Klik op onderstaande link om verder te gaan waar je gebleven was:

{{onboardingLink}}

Geen zorgen - je eerder ingevulde gegevens zijn bewaard.

Heb je hulp nodig of loop je ergens tegenaan? Neem gerust contact met ons op via info@elevizion.nl. We helpen je graag verder!` 
        },
        { 
          name: "onboarding_completed", 
          category: "email", 
          subject: "Registratie voltooid - Welkom!", 
          body: `Beste {{contactName}},

Gefeliciteerd! Je registratie is succesvol afgerond.

Je bent nu officieel onderdeel van het Elevizion netwerk. Hieronder vind je de volgende stappen om aan de slag te gaan:

Volgende stappen:
1. Log in op je dashboard via app.elevizion.nl
2. Upload je eerste advertentie of content
3. Selecteer de schermen waarop je wilt adverteren
4. Plan je campagne en ga live!

Heb je vragen over het dashboard of de mogelijkheden? Ons supportteam staat voor je klaar via info@elevizion.nl.

Nogmaals welkom bij Elevizion!` 
        },
        { 
          name: "monthly_report", 
          category: "email", 
          subject: "Maandrapport {{month}}", 
          body: `Beste {{contactName}},

Hierbij ontvang je het maandrapport voor {{month}}.

In dit rapport vind je een overzicht van:
- Je actieve advertenties en vertoningen
- Bereik per schermlocatie
- Facturatie en betalingsstatus

Rapport Samenvatting:
{{reportContent}}

Wil je meer weten over de prestaties van je campagnes of heb je vragen over dit rapport? Neem gerust contact met ons op.

We wensen je een succesvolle maand!` 
        },
        // === CONTRACT TEMPLATES (professionele A4 structuur) ===
        { 
          name: "location_revshare", 
          category: "contract", 
          subject: "Samenwerkingsovereenkomst - Revenue Share Model", 
          body: `<h2>Artikel 1 - Partijen</h2>
<p>Deze overeenkomst wordt aangegaan tussen:</p>
<ol>
<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>
<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>
</ol>

<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>
<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>

<h2>Artikel 3 - Locatiegegevens</h2>
<ul>
<li><strong>Locatienaam:</strong> {{locationName}}</li>
<li><strong>Adres:</strong> {{address}}, {{city}}</li>
</ul>

<h2>Artikel 4 - Commerciële Voorwaarden</h2>
<ul>
<li><strong>Vergoedingsmodel:</strong> Revenue Share</li>
<li><strong>Percentage:</strong> {{revSharePct}}% van de netto advertentie-inkomsten</li>
<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>
<li><strong>Minimumgarantie:</strong> Geen</li>
</ul>

<h2>Artikel 5 - Looptijd en Opzegging</h2>
<ul>
<li><strong>Ingangsdatum:</strong> {{startDate}}</li>
<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>
<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>
</ul>

<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>
<p>De Locatiepartner zorgt voor:</p>
<ul>
<li>Geschikte plaatsingslocatie met stroomaansluiting</li>
<li>Stabiele internetverbinding (WiFi of ethernet)</li>
<li>Toegang voor onderhoud en service</li>
</ul>

<h2>Artikel 7 - Aansprakelijkheid</h2>
<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>

<h2>Artikel 8 - Toepasselijk Recht</h2>
<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>` 
        },
        { 
          name: "location_fixed", 
          category: "contract", 
          subject: "Samenwerkingsovereenkomst - Vaste Vergoeding", 
          body: `<h2>Artikel 1 - Partijen</h2>
<p>Deze overeenkomst wordt aangegaan tussen:</p>
<ol>
<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>
<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>
</ol>

<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>
<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties en content van derden.</p>

<h2>Artikel 3 - Locatiegegevens</h2>
<ul>
<li><strong>Locatienaam:</strong> {{locationName}}</li>
<li><strong>Adres:</strong> {{address}}, {{city}}</li>
</ul>

<h2>Artikel 4 - Commerciële Voorwaarden</h2>
<ul>
<li><strong>Vergoedingsmodel:</strong> Vaste maandelijkse vergoeding</li>
<li><strong>Maandbedrag:</strong> €{{fixedAmount}} (excl. BTW)</li>
<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>
</ul>

<h2>Artikel 5 - Looptijd en Opzegging</h2>
<ul>
<li><strong>Ingangsdatum:</strong> {{startDate}}</li>
<li><strong>Looptijd:</strong> {{termMonths}} maanden</li>
<li><strong>Opzegtermijn:</strong> 2 maanden voor het einde van de lopende periode</li>
</ul>

<h2>Artikel 6 - Verplichtingen Locatiepartner</h2>
<p>De Locatiepartner zorgt voor:</p>
<ul>
<li>Geschikte plaatsingslocatie met stroomaansluiting</li>
<li>Stabiele internetverbinding (WiFi of ethernet)</li>
<li>Toegang voor onderhoud en service</li>
</ul>

<h2>Artikel 7 - Aansprakelijkheid</h2>
<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De aansprakelijkheid van Elevizion is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>

<h2>Artikel 8 - Toepasselijk Recht</h2>
<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>` 
        },
        { 
          name: "advertiser_standard", 
          category: "contract", 
          subject: "Advertentieovereenkomst - Standaard Pakket", 
          body: `<h2>Artikel 1 - Partijen</h2>
<p>Deze overeenkomst wordt aangegaan tussen:</p>
<ol>
<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>
<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>
</ol>

<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>
<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>

<h2>Artikel 3 - Pakketgegevens</h2>
<ul>
<li><strong>Pakket:</strong> Standaard</li>
<li><strong>Aantal schermen:</strong> {{screensCount}}</li>
<li><strong>Vertoningen per dag:</strong> 480 (gemiddeld per scherm)</li>
<li><strong>Advertentieduur:</strong> 15 seconden</li>
</ul>

<h2>Artikel 4 - Commerciële Voorwaarden</h2>
<ul>
<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>
<li><strong>Facturatie:</strong> Maandelijks vooraf</li>
<li><strong>Betaaltermijn:</strong> 14 dagen</li>
</ul>

<h2>Artikel 5 - Looptijd en Opzegging</h2>
<ul>
<li><strong>Ingangsdatum:</strong> {{startDate}}</li>
<li><strong>Minimale looptijd:</strong> 3 maanden</li>
<li><strong>Opzegtermijn:</strong> 1 maand</li>
</ul>

<h2>Artikel 6 - Content Richtlijnen</h2>
<p>De Adverteerder levert content aan die voldoet aan de Elevizion content richtlijnen. Elevizion behoudt zich het recht voor om content te weigeren die niet voldoet aan deze richtlijnen.</p>

<h2>Artikel 7 - Aansprakelijkheid</h2>
<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij langdurige storingen (>24 uur) wordt een pro-rata creditering toegepast.</p>

<h2>Artikel 8 - Toepasselijk Recht</h2>
<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>` 
        },
        { 
          name: "advertiser_premium", 
          category: "contract", 
          subject: "Advertentieovereenkomst - Premium Pakket", 
          body: `<h2>Artikel 1 - Partijen</h2>
<p>Deze overeenkomst wordt aangegaan tussen:</p>
<ol>
<li><strong>Elevizion B.V.</strong>, gevestigd te Maastricht, ingeschreven bij de Kamer van Koophandel onder nummer 12345678, hierna te noemen "Elevizion";</li>
<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>
</ol>

<h2>Artikel 2 - Onderwerp van de Overeenkomst</h2>
<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk conform de voorwaarden in deze overeenkomst.</p>

<h2>Artikel 3 - Premium Pakketgegevens</h2>
<ul>
<li><strong>Pakket:</strong> Premium (Exclusief)</li>
<li><strong>Aantal schermen:</strong> {{screensCount}}</li>
<li><strong>Vertoningen per dag:</strong> 720 (gemiddeld per scherm)</li>
<li><strong>Advertentieduur:</strong> 15-30 seconden</li>
<li><strong>Exclusiviteit:</strong> Geen concurrerende advertenties in dezelfde branche</li>
</ul>

<h2>Artikel 4 - Premium Voordelen</h2>
<ul>
<li>Prioriteit bij schermtoewijzing</li>
<li>Dedicated accountmanager</li>
<li>Maandelijkse performance rapportages</li>
<li>Mogelijkheid tot real-time content updates</li>
</ul>

<h2>Artikel 5 - Commerciële Voorwaarden</h2>
<ul>
<li><strong>Maandbedrag:</strong> €{{monthlyAmount}} (excl. BTW)</li>
<li><strong>Facturatie:</strong> Maandelijks vooraf</li>
<li><strong>Betaaltermijn:</strong> 14 dagen</li>
</ul>

<h2>Artikel 6 - Looptijd en Opzegging</h2>
<ul>
<li><strong>Ingangsdatum:</strong> {{startDate}}</li>
<li><strong>Minimale looptijd:</strong> 6 maanden</li>
<li><strong>Opzegtermijn:</strong> 2 maanden</li>
</ul>

<h2>Artikel 7 - Aansprakelijkheid</h2>
<p>Elevizion is niet aansprakelijk voor technische storingen of onderbrekingen in de vertoning. Bij storingen wordt prioriteit gegeven aan Premium klanten en geldt een pro-rata creditering bij storingen >12 uur.</p>

<h2>Artikel 8 - Toepasselijk Recht</h2>
<p>Op deze overeenkomst is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>` 
        },
        // === VERPLICHTE TEMPLATES VOOR SYSTEM HEALTH CHECK ===
        { 
          name: "algemene_voorwaarden", 
          category: "contract", 
          subject: "Algemene Voorwaarden Elevizion", 
          body: `<h1>Algemene Voorwaarden</h1>
<p><strong>Douven Services h/o Elevizion</strong><br>
KvK: 90982541 | BTW: NL004857473B37</p>

<h2>Artikel 1 - Definities</h2>
<p>In deze algemene voorwaarden wordt verstaan onder:</p>
<ol>
<li><strong>Elevizion:</strong> de handelsnaam waaronder Douven Services, ingeschreven bij KvK onder nummer 90982541, haar diensten aanbiedt.</li>
<li><strong>Klant:</strong> de natuurlijke of rechtspersoon die met Elevizion een overeenkomst aangaat.</li>
<li><strong>Diensten:</strong> alle door Elevizion aangeboden digitale signage en advertentiediensten.</li>
<li><strong>Overeenkomst:</strong> de overeenkomst tussen Elevizion en Klant.</li>
</ol>

<h2>Artikel 2 - Toepasselijkheid</h2>
<p>Deze algemene voorwaarden zijn van toepassing op alle aanbiedingen, offertes en overeenkomsten tussen Elevizion en Klant.</p>

<h2>Artikel 3 - Aanbieding en Totstandkoming</h2>
<p>Alle aanbiedingen van Elevizion zijn vrijblijvend tenzij uitdrukkelijk anders aangegeven. Een overeenkomst komt tot stand na digitale ondertekening door beide partijen.</p>

<h2>Artikel 4 - Prijzen en Betaling</h2>
<ul>
<li>Alle prijzen zijn exclusief BTW tenzij anders vermeld.</li>
<li>Betaling dient te geschieden binnen 14 dagen na factuurdatum.</li>
<li>Bij automatische incasso (SEPA) wordt het bedrag rond de 1e van de maand afgeschreven.</li>
</ul>

<h2>Artikel 5 - Looptijd en Opzegging</h2>
<p>Overeenkomsten worden aangegaan voor de in het contract vermelde periode. Opzegging dient schriftelijk te geschieden met inachtneming van de overeengekomen opzegtermijn.</p>

<h2>Artikel 6 - Aansprakelijkheid</h2>
<p>Elevizion is niet aansprakelijk voor indirecte schade of gevolgschade. De totale aansprakelijkheid is beperkt tot het bedrag van de vergoedingen over de laatste 3 maanden.</p>

<h2>Artikel 7 - Privacy</h2>
<p>Elevizion verwerkt persoonsgegevens conform de AVG. Zie ons privacybeleid voor meer informatie.</p>

<h2>Artikel 8 - Toepasselijk Recht</h2>
<p>Op alle overeenkomsten is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde rechter te Maastricht.</p>

<p><em>Versie 1.0 - Laatste update: {{currentDate}}</em></p>` 
        },
        { 
          name: "adverteerder_overeenkomst", 
          category: "contract", 
          subject: "Adverteerderovereenkomst", 
          body: `<h1>Adverteerderovereenkomst</h1>
<p><strong>Douven Services h/o Elevizion</strong><br>
KvK: 90982541 | BTW: NL004857473B37</p>

<h2>Artikel 1 - Partijen</h2>
<p>Deze overeenkomst wordt aangegaan tussen:</p>
<ol>
<li><strong>Douven Services h/o Elevizion</strong>, ingeschreven bij de Kamer van Koophandel onder nummer 90982541, hierna te noemen "Elevizion";</li>
<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Adverteerder".</li>
</ol>

<h2>Artikel 2 - Onderwerp</h2>
<p>Elevizion biedt de Adverteerder de mogelijkheid om advertenties te tonen op het Elevizion digitale schermen netwerk.</p>

<h2>Artikel 3 - Pakketgegevens</h2>
<ul>
<li><strong>Pakket:</strong> {{packageName}}</li>
<li><strong>Aantal schermen:</strong> {{screenCount}}</li>
<li><strong>Prijs per scherm:</strong> €{{pricePerScreen}} per maand (excl. BTW)</li>
<li><strong>Minimale looptijd:</strong> {{minimumTermMonths}} maanden</li>
</ul>

<h2>Artikel 4 - Content Aanlevering</h2>
<p>De Adverteerder levert zelf video content aan die voldoet aan de volgende specificaties:</p>
<ul>
<li>Formaat: MP4 (H.264 codec)</li>
<li>Resolutie: 1920x1080 pixels</li>
<li>Duur: 10-15 seconden</li>
<li>Aspectratio: 16:9</li>
<li>Geen audio</li>
</ul>
<p><strong>Let op:</strong> Elevizion maakt geen advertenties voor klanten. De Adverteerder is verantwoordelijk voor het aanleveren van content.</p>

<h2>Artikel 5 - Betalingswijze</h2>
<ul>
<li><strong>Facturatie:</strong> Maandelijks vooraf</li>
<li><strong>Betaaltermijn:</strong> 14 dagen of via SEPA automatische incasso</li>
</ul>

<h2>Artikel 6 - Looptijd en Opzegging</h2>
<ul>
<li><strong>Ingangsdatum:</strong> {{startDate}}</li>
<li><strong>Minimale looptijd:</strong> {{minimumTermMonths}} maanden</li>
<li><strong>Opzegtermijn:</strong> 1 maand voor het einde van de lopende periode</li>
</ul>

<h2>Artikel 7 - Algemene Voorwaarden</h2>
<p>Op deze overeenkomst zijn de Algemene Voorwaarden van Elevizion van toepassing, welke separaat zijn opgenomen in dit document.</p>

<p><em>Versie 1.0</em></p>` 
        },
        { 
          name: "locatie_overeenkomst", 
          category: "contract", 
          subject: "Schermlocatieovereenkomst", 
          body: `<h1>Schermlocatieovereenkomst</h1>
<p><strong>Douven Services h/o Elevizion</strong><br>
KvK: 90982541 | BTW: NL004857473B37</p>

<h2>Artikel 1 - Partijen</h2>
<p>Deze overeenkomst wordt aangegaan tussen:</p>
<ol>
<li><strong>Douven Services h/o Elevizion</strong>, ingeschreven bij de Kamer van Koophandel onder nummer 90982541, hierna te noemen "Elevizion";</li>
<li><strong>{{companyName}}</strong>, vertegenwoordigd door {{contactName}}, hierna te noemen "Locatiepartner".</li>
</ol>

<h2>Artikel 2 - Onderwerp</h2>
<p>Elevizion plaatst één of meerdere digitale schermen op de locatie van de Locatiepartner ten behoeve van het tonen van advertenties van derden.</p>

<h2>Artikel 3 - Locatiegegevens</h2>
<ul>
<li><strong>Locatienaam:</strong> {{locationName}}</li>
<li><strong>Adres:</strong> {{address}}, {{zipcode}} {{city}}</li>
</ul>

<h2>Artikel 4 - Vergoeding</h2>
<ul>
<li><strong>Vergoedingsmodel:</strong> Revenue Share</li>
<li><strong>Percentage:</strong> {{revenueSharePercent}}% van de netto advertentie-inkomsten</li>
<li><strong>Uitbetaling:</strong> Maandelijks, uiterlijk op de 15e van de volgende maand</li>
<li><strong>Minimum uitbetaling:</strong> €{{minimumPayout}}</li>
</ul>

<h2>Artikel 5 - Verplichtingen Locatiepartner</h2>
<p>De Locatiepartner zorgt voor:</p>
<ul>
<li>Geschikte plaatsingslocatie met stroomaansluiting</li>
<li>Stabiele internetverbinding (WiFi of ethernet)</li>
<li>Toegang voor onderhoud en service</li>
</ul>

<h2>Artikel 6 - Looptijd en Opzegging</h2>
<ul>
<li><strong>Ingangsdatum:</strong> Na ondertekening en installatie</li>
<li><strong>Opzegtermijn:</strong> 2 maanden</li>
</ul>

<h2>Artikel 7 - Algemene Voorwaarden</h2>
<p>Op deze overeenkomst zijn de Algemene Voorwaarden van Elevizion van toepassing, welke separaat zijn opgenomen in dit document.</p>

<p><em>Versie 1.0</em></p>` 
        },
        { 
          name: "sepa_machtiging", 
          category: "contract", 
          subject: "SEPA Machtiging", 
          body: `<h1>SEPA Incassomachtiging</h1>
<p><strong>Douven Services h/o Elevizion</strong><br>
KvK: 90982541 | BTW: NL004857473B37</p>

<h2>Crediteurgegevens</h2>
<table>
<tr><td><strong>Naam:</strong></td><td>Douven Services h/o Elevizion</td></tr>
<tr><td><strong>Incassant ID:</strong></td><td>{{incassantId}}</td></tr>
<tr><td><strong>IBAN:</strong></td><td>{{creditorIban}}</td></tr>
</table>

<h2>Machtiging</h2>
<p>Door ondertekening van deze machtiging geeft u toestemming aan Douven Services h/o Elevizion om doorlopende incasso-opdrachten te sturen naar uw bank om een bedrag van uw rekening af te schrijven wegens de overeengekomen diensten.</p>

<h2>Debiteurgegevens (betaler)</h2>
<table>
<tr><td><strong>Bedrijfsnaam:</strong></td><td>{{companyName}}</td></tr>
<tr><td><strong>Naam rekeninghouder:</strong></td><td>{{accountHolderName}}</td></tr>
<tr><td><strong>IBAN:</strong></td><td>{{debiteurIban}}</td></tr>
<tr><td><strong>Adres:</strong></td><td>{{address}}, {{zipcode}} {{city}}</td></tr>
</table>

<h2>Machtigingsreferentie</h2>
<p><strong>{{mandateReference}}</strong></p>

<h2>Type machtiging</h2>
<p>☑ Doorlopende machtiging (voor terugkerende betalingen)</p>

<h2>Voorwaarden</h2>
<ul>
<li>U heeft het recht om binnen 8 weken na afschrijving het bedrag terug te vorderen bij uw bank (storneren).</li>
<li>Als u het niet eens bent met een afschrijving kunt u dit melden aan uw bank.</li>
<li>Bij onterechte afschrijving kunt u tot 13 maanden na afschrijving reclameren.</li>
</ul>

<p><strong>Datum ondertekening:</strong> {{signatureDate}}</p>
<p><strong>Plaats:</strong> {{signatureCity}}</p>

<p><em>Versie 1.0</em></p>` 
        },
      ];
      
      let created = 0;
      let updated = 0;
      for (const tpl of defaultTemplates) {
        const existing = existingTemplates.find(t => t.name === tpl.name);
        if (!existing) {
          await storage.createTemplate({
            name: tpl.name,
            category: tpl.category,
            subject: tpl.subject,
            body: tpl.body,
            isEnabled: true,
          });
          created++;
        } else {
          // Update existing template with new defaults
          await storage.updateTemplate(existing.id, {
            subject: tpl.subject,
            body: tpl.body,
          });
          updated++;
        }
      }
      
      res.json({ message: `${created} templates aangemaakt, ${updated} templates bijgewerkt`, created, updated });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // COMPANY PROFILE (SINGLETON)
  // ============================================================================

  app.get("/api/company-profile", async (req, res) => {
    try {
      const profile = await storage.getCompanyProfile();
      if (!profile) {
        return res.status(404).json({ message: "Bedrijfsprofiel niet gevonden" });
      }
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/company-profile", async (req, res) => {
    try {
      const profile = await storage.updateCompanyProfile(req.body);
      if (!profile) {
        return res.status(404).json({ message: "Bedrijfsprofiel niet gevonden" });
      }
      // Clear branding cache so services pick up new values
      clearBrandingCache();
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // System config endpoint (for frontend to check TEST_MODE etc.)
  app.get("/api/system-config", async (_req, res) => {
    res.json({
      testMode: isTestMode(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Debug endpoint for TEST_MODE visibility (privileged users only)
  app.get("/api/debug/test-mode", isAuthenticated, async (req: any, res) => {
    // Allow access for eigenaar, admins, or users with system/integration permissions
    const user = req.user;
    const isPrivileged = 
      user?.rolePreset === "eigenaar" ||
      user?.role === "ADMIN" ||
      user?.permissions?.manage_integrations ||
      user?.permissions?.edit_system_settings ||
      user?.permissions?.manage_users;
    
    if (!isPrivileged) {
      return res.status(403).json({ message: "Alleen voor beheerders" });
    }
    res.json({
      nodeEnv: process.env.NODE_ENV ?? null,
      testModeRaw: process.env.TEST_MODE ?? null,
      isTestMode: isTestMode(),
    });
  });

  // Generate or reuse upload portal URL for an advertiser
  // If encryption is enabled and valid token exists, reuses it; otherwise generates new
  // Sets uploadEnabled=true for persistent access bypassing onboarding gates
  app.post("/api/advertisers/:id/open-upload-portal", isAuthenticated, async (req: any, res) => {
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      if (!advertiser.linkKey) {
        return res.status(400).json({ message: "Adverteerder heeft geen linkKey. Upload portal niet beschikbaar." });
      }
      
      const testMode = isTestMode();
      const now = new Date();
      
      // Check for existing valid unexpired token that we can reuse
      const tokens = await storage.getPortalTokensForAdvertiser(advertiser.id);
      const validToken = tokens.find(t => {
        const isExpired = new Date(t.expiresAt) < now;
        const isUsed = t.usedAt !== null;
        // In TEST_MODE, allow used tokens as long as not expired
        if (testMode) {
          return !isExpired && t.tokenCiphertext; // Must have ciphertext for reuse
        }
        return !isExpired && !isUsed && t.tokenCiphertext;
      });
      
      let rawToken: string;
      let expiresAt: Date;
      let reusedToken = false;
      
      if (validToken && validToken.tokenCiphertext) {
        // Try to decrypt and reuse existing token
        const decrypted = decryptToken(validToken.tokenCiphertext);
        if (decrypted) {
          rawToken = decrypted;
          expiresAt = new Date(validToken.expiresAt);
          reusedToken = true;
          console.log(`[Upload Portal] Reusing existing token for advertiser ${advertiser.id}`);
        } else {
          // Decryption failed (key changed?) - expire old and generate new
          await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
          rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const tokenCiphertext = encryptToken(rawToken);
          const ttlDays = getTokenTtlDays();
          expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
          
          await storage.createPortalToken({
            tokenHash,
            tokenCiphertext: tokenCiphertext || undefined,
            advertiserId: advertiser.id,
            expiresAt,
          });
        }
      } else {
        // No valid token with ciphertext, expire old tokens and generate new
        const expiredCount = await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
        if (expiredCount > 0) {
          console.log(`[Upload Portal] Expired ${expiredCount} old token(s) for advertiser ${advertiser.id}`);
        }
        
        const ttlDays = getTokenTtlDays();
        rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const tokenCiphertext = encryptToken(rawToken);
        expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
        
        await storage.createPortalToken({
          tokenHash,
          tokenCiphertext: tokenCiphertext || undefined,
          advertiserId: advertiser.id,
          expiresAt,
        });
      }
      
      // Enable upload portal access for this advertiser (persistent state)
      await storage.updateAdvertiser(advertiser.id, {
        uploadEnabled: true,
        lastUploadTokenGeneratedAt: now,
      });
      
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
      const uploadUrl = `${baseUrl}/upload/${rawToken}`;
      
      const encryptionEnabled = isTokenEncryptionEnabled();
      console.log(`[Upload Portal] ${reusedToken ? 'Reused' : 'Generated'} token for advertiser ${advertiser.id} (${advertiser.companyName}), testMode=${testMode}, encryption=${encryptionEnabled}`);
      
      res.json({
        uploadUrl,
        expiresAt,
        testMode,
        reusedToken,
        encryptionEnabled,
        uploadEnabled: true,
      });
    } catch (error: any) {
      console.error("[Upload Portal] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Upload portal link endpoint for admin Test Tools
  // Admin-only: generates linkKey if missing (in TEST_MODE), sets uploadEnabled=true
  // In TEST_MODE: auto-generates linkKey, always returns working URL
  // Outside TEST_MODE: requires existing linkKey
  // Returns: { url, reused, expiresAt, linkKey, uploadEnabled }
  app.post("/api/advertisers/:id/upload-portal-link", isAuthenticated, async (req: any, res) => {
    try {
      const testMode = isTestMode();
      const isAdmin = req.user?.role === "ADMIN";
      
      // In TEST_MODE + admin, always allow. Otherwise require admin role.
      if (!isAdmin) {
        return res.status(403).json({ message: "Alleen voor admins" });
      }
      
      let advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      const now = new Date();
      
      // Generate linkKey if missing (in TEST_MODE, we can auto-generate)
      if (!advertiser.linkKey) {
        if (!testMode) {
          return res.status(400).json({ message: "Adverteerder heeft geen linkKey. Upload portal niet beschikbaar." });
        }
        // In TEST_MODE, generate a linkKey automatically
        const baseName = (advertiser.companyName || "test")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 12);
        const randomSuffix = crypto.randomBytes(3).toString("hex");
        const newLinkKey = `${baseName}${randomSuffix}`;
        
        await storage.updateAdvertiser(advertiser.id, { linkKey: newLinkKey });
        advertiser = { ...advertiser, linkKey: newLinkKey };
        console.log(`[Upload Portal Link] Generated linkKey "${newLinkKey}" for advertiser ${advertiser.id}`);
      }
      
      // Check for existing valid token that can be reused
      const tokens = await storage.getPortalTokensForAdvertiser(advertiser.id);
      const validToken = tokens.find(t => {
        const isExpired = new Date(t.expiresAt) < now;
        const isUsed = t.usedAt !== null;
        if (testMode) {
          return !isExpired && t.tokenCiphertext;
        }
        return !isExpired && !isUsed && t.tokenCiphertext;
      });
      
      let rawToken: string;
      let expiresAt: Date;
      let reusedToken = false;
      
      if (validToken && validToken.tokenCiphertext) {
        const decrypted = decryptToken(validToken.tokenCiphertext);
        if (decrypted) {
          rawToken = decrypted;
          expiresAt = new Date(validToken.expiresAt);
          reusedToken = true;
        } else {
          // Decryption failed - generate new
          await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
          rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const tokenCiphertext = encryptToken(rawToken);
          const ttlDays = getTokenTtlDays();
          expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
          
          await storage.createPortalToken({
            tokenHash,
            tokenCiphertext: tokenCiphertext || undefined,
            advertiserId: advertiser.id,
            expiresAt,
          });
        }
      } else {
        // No valid token - expire old and generate new
        await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
        rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const tokenCiphertext = encryptToken(rawToken);
        const ttlDays = getTokenTtlDays();
        expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
        
        await storage.createPortalToken({
          tokenHash,
          tokenCiphertext: tokenCiphertext || undefined,
          advertiserId: advertiser.id,
          expiresAt,
        });
      }
      
      // Enable upload portal access
      await storage.updateAdvertiser(advertiser.id, {
        uploadEnabled: true,
        lastUploadTokenGeneratedAt: now,
      });
      
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000');
      const url = `${baseUrl}/upload/${rawToken}`;
      
      console.log(`[Upload Portal Link] ${reusedToken ? 'Reused' : 'Generated'} token for advertiser ${advertiser.id}, testMode=${testMode}`);
      
      res.json({
        url,
        reused: reusedToken,
        expiresAt,
        linkKey: advertiser.linkKey,
        uploadEnabled: true,
      });
    } catch (error: any) {
      console.error("[Upload Portal Link] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Reset upload status for testing (admin + TEST_MODE only)
  // Clears asset-related fields so upload can be re-tested
  app.post("/api/advertisers/:id/reset-upload-status", isAuthenticated, async (req: any, res) => {
    // Security: must be admin AND in TEST_MODE
    if (req.user?.role !== "ADMIN" || !isTestMode()) {
      return res.status(404).json({ message: "Not found" });
    }
    
    try {
      const advertiser = await storage.getAdvertiser(req.params.id);
      if (!advertiser) {
        return res.status(404).json({ message: "Adverteerder niet gevonden" });
      }
      
      // Reset only upload-related fields
      await storage.updateAdvertiser(advertiser.id, {
        assetStatus: "none",
        // uploadEnabled stays true - advertiser can still access upload portal
      });
      
      // Delete all ad assets for this advertiser (test cleanup)
      await db.delete(adAssets).where(eq(adAssets.advertiserId, advertiser.id));
      
      console.log(`[Test Tools] Reset upload status for advertiser ${advertiser.id} (${advertiser.companyName})`);
      
      res.json({
        success: true,
        message: "Upload status gereset - klaar voor nieuwe test",
        assetStatus: "none",
      });
    } catch (error: any) {
      console.error("[Test Tools] Reset upload error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin shortcut: /upload?advertiserId=... (TEST_MODE only)
  // Reuses existing token if available, otherwise generates new
  app.get("/upload", async (req: any, res, next) => {
    const advertiserId = req.query.advertiserId as string;
    
    // If no advertiserId query param, let frontend handle the route
    if (!advertiserId) {
      return next();
    }
    
    // Security: must be admin AND in TEST_MODE for this shortcut
    if (!req.isAuthenticated?.() || req.user?.role !== "ADMIN" || !isTestMode()) {
      return res.status(404).send("Not found");
    }
    
    try {
      const advertiser = await storage.getAdvertiser(advertiserId);
      if (!advertiser || !advertiser.linkKey) {
        return res.status(404).send("Adverteerder niet gevonden of heeft geen linkKey");
      }
      
      const now = new Date();
      
      // Check for existing valid token with ciphertext
      const tokens = await storage.getPortalTokensForAdvertiser(advertiser.id);
      const validToken = tokens.find(t => {
        const isExpired = new Date(t.expiresAt) < now;
        return !isExpired && t.tokenCiphertext;
      });
      
      let rawToken: string;
      
      if (validToken && validToken.tokenCiphertext) {
        const decrypted = decryptToken(validToken.tokenCiphertext);
        if (decrypted) {
          rawToken = decrypted;
          console.log(`[Admin Shortcut] Reusing token for advertiser ${advertiser.id}`);
        } else {
          // Decryption failed, generate new
          await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
          rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const tokenCiphertext = encryptToken(rawToken);
          const ttlDays = getTokenTtlDays();
          const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
          
          await storage.createPortalToken({
            tokenHash,
            tokenCiphertext: tokenCiphertext || undefined,
            advertiserId: advertiser.id,
            expiresAt,
          });
        }
      } else {
        // No valid token, generate new
        await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
        const ttlDays = getTokenTtlDays();
        rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const tokenCiphertext = encryptToken(rawToken);
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
        
        await storage.createPortalToken({
          tokenHash,
          tokenCiphertext: tokenCiphertext || undefined,
          advertiserId: advertiser.id,
          expiresAt,
        });
      }
      
      // Set uploadEnabled for this advertiser
      await storage.updateAdvertiser(advertiser.id, {
        uploadEnabled: true,
        lastUploadTokenGeneratedAt: now,
      });
      
      console.log(`[Admin Shortcut] Upload redirect for advertiser ${advertiser.id} (${advertiser.companyName})`);
      
      res.redirect(`/upload/${rawToken}`);
    } catch (error: any) {
      console.error("[Admin Shortcut] Error:", error);
      res.status(500).send("Fout bij genereren upload link");
    }
  });

  // Admin-only test upload shortcut (TEST_MODE only)
  // Reuses existing token if available, otherwise generates new
  app.get("/admin/test/upload", isAuthenticated, async (req: any, res) => {
    // Security: must be admin AND in TEST_MODE
    if (req.user?.role !== "ADMIN" || !isTestMode()) {
      console.log(`[Admin Test] Unauthorized access attempt by user ${req.user?.id || 'unknown'} (role: ${req.user?.role || 'none'})`);
      return res.status(404).send("Not found");
    }
    
    try {
      // Find the most recent advertiser with a linkKey (sorted by createdAt desc)
      const advertisers = await storage.getAdvertisers();
      const sortedAdvertisers = advertisers
        .filter(a => a.linkKey)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      const advertiser = sortedAdvertisers[0] || advertisers[0];
      
      if (!advertiser) {
        return res.status(404).send("Geen adverteerders gevonden. Maak eerst een adverteerder aan.");
      }
      
      if (!advertiser.linkKey) {
        return res.status(404).send("Adverteerder heeft geen linkKey. Configureer eerst een linkKey.");
      }
      
      const now = new Date();
      
      // Check for existing valid token with ciphertext
      const tokens = await storage.getPortalTokensForAdvertiser(advertiser.id);
      const validToken = tokens.find(t => {
        const isExpired = new Date(t.expiresAt) < now;
        return !isExpired && t.tokenCiphertext;
      });
      
      let rawToken: string;
      
      if (validToken && validToken.tokenCiphertext) {
        const decrypted = decryptToken(validToken.tokenCiphertext);
        if (decrypted) {
          rawToken = decrypted;
          console.log(`[Admin Test] Reusing token for advertiser ${advertiser.id}`);
        } else {
          // Decryption failed, generate new
          await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
          rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const tokenCiphertext = encryptToken(rawToken);
          const ttlDays = getTokenTtlDays();
          const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
          
          await storage.createPortalToken({
            tokenHash,
            tokenCiphertext: tokenCiphertext || undefined,
            advertiserId: advertiser.id,
            expiresAt,
          });
        }
      } else {
        // No valid token, generate new
        await storage.expireOldPortalTokensForAdvertiser(advertiser.id);
        const ttlDays = getTokenTtlDays();
        rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const tokenCiphertext = encryptToken(rawToken);
        const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
        
        await storage.createPortalToken({
          tokenHash,
          tokenCiphertext: tokenCiphertext || undefined,
          advertiserId: advertiser.id,
          expiresAt,
        });
      }
      
      // Set uploadEnabled for this advertiser
      await storage.updateAdvertiser(advertiser.id, {
        uploadEnabled: true,
        lastUploadTokenGeneratedAt: now,
      });
      
      console.log(`[Admin Test] Quick upload redirect for advertiser ${advertiser.id} (${advertiser.companyName})`);
      
      // Redirect to upload portal
      res.redirect(`/upload/${rawToken}`);
    } catch (error: any) {
      console.error("[Admin Test] Upload shortcut error:", error);
      res.status(500).send("Fout bij genereren test upload link");
    }
  });

  // Public endpoint - only returns non-sensitive fields
  // Public status endpoint - returns only non-sensitive system status
  // This replaces client calls to /api/debug/test-mode which requires auth
  app.get("/api/public/status", (_req, res) => {
    res.json({
      testMode: isTestMode(),
      buildId: BUILD_ID,
      builtAt: BUILD_TIME,
    });
  });

  // Public UI config endpoint - controls operator/admin mode
  // Default: "operator" for clean, minimal interface
  app.get("/api/public/ui-config", async (_req, res) => {
    try {
      const setting = await storage.getSystemSetting("ui.mode");
      const uiMode = setting?.value === "admin" ? "admin" : "operator";
      res.json({ uiMode });
    } catch {
      res.json({ uiMode: "operator" });
    }
  });

  app.get("/api/public/company-profile", async (req, res) => {
    try {
      const profile = await storage.getCompanyProfile();
      if (!profile) {
        return res.status(404).json({ message: "Bedrijfsprofiel niet gevonden" });
      }
      // Return only public fields (no banking, no full address if disabled)
      const publicProfile: Record<string, any> = {
        legalName: profile.legalName,
        tradeName: profile.tradeName,
        kvkNumber: profile.kvkNumber,
        vatNumber: profile.vatNumber,
        email: profile.email,
        phone: profile.phone,
        website: profile.website,
      };
      // Only include address if public address is enabled
      if (profile.publicAddressEnabled) {
        publicProfile.addressLine1 = profile.addressLine1;
        publicProfile.postalCode = profile.postalCode;
        publicProfile.city = profile.city;
        publicProfile.country = profile.country;
      }
      res.json(publicProfile);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SYSTEM HEALTH CHECK
  // ============================================================================
  
  app.get("/api/system-health", async (req, res) => {
    try {
      const { runFullHealthCheck, getOverallStatus, countChecksByStatus } = await import("./services/healthCheck");
      const groups = await runFullHealthCheck();
      const overall = getOverallStatus(groups);
      const counts = countChecksByStatus(groups);
      
      res.json({
        overall,
        counts,
        groups,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[HealthCheck] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/system-health/test/email", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "E-mailadres is verplicht" });
      }
      
      const { testSendEmail } = await import("./services/healthCheck");
      const result = await testSendEmail(email);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/system-health/test/moneybird", async (req, res) => {
    try {
      const { testMoneybirdCreateContact } = await import("./services/healthCheck");
      const result = await testMoneybirdCreateContact();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/system-health/test/yodeck", async (req, res) => {
    try {
      const { testYodeckSync } = await import("./services/healthCheck");
      const result = await testYodeckSync();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.post("/api/system-health/test/lead", async (req, res) => {
    try {
      const { testCreateLead } = await import("./services/healthCheck");
      const result = await testCreateLead();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Workflow smoke test (ffprobe, storage, Yodeck connectivity)
  app.post("/api/system-health/test/workflow", requireAdminAccess, async (req: any, res) => {
    try {
      const results: { check: string; status: "ok" | "error"; message: string }[] = [];
      
      // 1. Check ffprobe/ffmpeg availability
      try {
        const { promisify } = await import("util");
        const { exec } = await import("child_process");
        const execAsync = promisify(exec);
        
        const ffprobeResult = await execAsync("ffprobe -version 2>&1 | head -1");
        results.push({ 
          check: "ffprobe", 
          status: "ok", 
          message: ffprobeResult.stdout.trim().split("\n")[0] || "Beschikbaar"
        });
      } catch (e: any) {
        results.push({ check: "ffprobe", status: "error", message: e.message });
      }
      
      try {
        const { promisify } = await import("util");
        const { exec } = await import("child_process");
        const execAsync = promisify(exec);
        
        const ffmpegResult = await execAsync("ffmpeg -version 2>&1 | head -1");
        results.push({ 
          check: "ffmpeg", 
          status: "ok", 
          message: ffmpegResult.stdout.trim().split("\n")[0] || "Beschikbaar"
        });
      } catch (e: any) {
        results.push({ check: "ffmpeg", status: "error", message: e.message });
      }
      
      // 2. Check object storage read access
      try {
        const { ObjectStorageService } = await import("./objectStorage");
        const storage = new ObjectStorageService();
        const files = await storage.listFiles("public/");
        results.push({ 
          check: "object_storage", 
          status: "ok", 
          message: `${files?.length || 0} bestanden in public/`
        });
      } catch (e: any) {
        results.push({ check: "object_storage", status: "error", message: e.message });
      }
      
      // 3. Check Yodeck API connectivity
      try {
        const token = process.env.YODECK_AUTH_TOKEN;
        if (!token) {
          results.push({ check: "yodeck_api", status: "error", message: "YODECK_AUTH_TOKEN niet geconfigureerd" });
        } else {
          const response = await fetch("https://app.yodeck.com/api/v2/playlists/", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const data = await response.json() as any;
            results.push({ 
              check: "yodeck_api", 
              status: "ok", 
              message: `${data.results?.length || 0} playlists gevonden`
            });
          } else {
            results.push({ check: "yodeck_api", status: "error", message: `HTTP ${response.status}` });
          }
        }
      } catch (e: any) {
        results.push({ check: "yodeck_api", status: "error", message: e.message });
      }
      
      // 4. Check database connectivity
      try {
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        const result = await db.execute(sql`SELECT COUNT(*) as count FROM advertisers`);
        const count = result.rows?.[0]?.count ?? 0;
        results.push({ 
          check: "database", 
          status: "ok", 
          message: `${count} adverteerders in database`
        });
      } catch (e: any) {
        results.push({ check: "database", status: "error", message: e.message });
      }
      
      const allOk = results.every(r => r.status === "ok");
      res.json({ 
        success: allOk, 
        message: allOk ? "Alle checks geslaagd" : "Sommige checks gefaald",
        results 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ============================================================================
  // AUDIT EVENTS API
  // ============================================================================
  
  // Get audit events for an advertiser
  app.get("/api/admin/audit/advertiser/:advertiserId", requireAdminAccess, async (req: any, res) => {
    try {
      const { getAuditEventsForAdvertiser } = await import("./services/auditService");
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await getAuditEventsForAdvertiser(req.params.advertiserId, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get audit events for a placement plan
  app.get("/api/admin/audit/plan/:planId", requireAdminAccess, async (req: any, res) => {
    try {
      const { getAuditEventsForPlan } = await import("./services/auditService");
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await getAuditEventsForPlan(req.params.planId, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get recent audit events (for admin dashboard)
  app.get("/api/admin/audit/recent", requireAdminAccess, async (req: any, res) => {
    try {
      const { getRecentAuditEvents } = await import("./services/auditService");
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await getRecentAuditEvents(limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Admin: Manual trigger monthly report worker
  app.post("/api/admin/reports/run", requirePermission("manage_users"), async (req, res) => {
    try {
      const { periodKey } = req.body;
      const { runMonthlyReportWorker } = await import("./services/monthlyReportWorker");
      const result = await runMonthlyReportWorker({ 
        force: true, 
        periodKey: periodKey || undefined 
      });
      res.json({ 
        message: "Rapportage worker uitgevoerd (handmatig)",
        ...result 
      });
    } catch (error: any) {
      console.error("[Reports] Manual run error:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Admin: Get recent report logs
  app.get("/api/admin/reports/logs", requirePermission("manage_users"), async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const logs = await storage.getRecentReportLogs(Number(days));
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // SYSTEM SETTINGS (Admin configurable values)
  // ============================================================================

  // IMPORTANT: Specific routes MUST come BEFORE parametric routes
  // Otherwise /api/admin/settings/baseline-status gets matched by /api/admin/settings/:key

  /**
   * GET /api/admin/settings/baseline-status
   * Get baseline playlist status for settings UI
   */
  app.get("/api/admin/settings/baseline-status", requireAdminAccess, async (req, res) => {
    try {
      const { getBaselinePlaylistStatus } = await import("./services/screenPlaylistService");
      const status = await getBaselinePlaylistStatus();
      res.json(status);
    } catch (error: any) {
      console.error("[BaselineStatus] Error:", error);
      res.status(500).json({ 
        configured: false, 
        playlistId: null, 
        playlistName: null,
        itemCount: 0,
        items: [],
        lastCheckedAt: new Date().toISOString(),
        error: error.message 
      });
    }
  });

  /**
   * POST /api/admin/settings/baseline-playlist
   * Set baseline playlist ID
   */
  app.post("/api/admin/settings/baseline-playlist", requireAdminAccess, async (req, res) => {
    try {
      const { playlistId } = req.body;
      
      if (!playlistId) {
        return res.status(400).json({ ok: false, error: "playlistId is required" });
      }
      
      const { setBaselinePlaylistId, getBaselinePlaylistStatus } = await import("./services/screenPlaylistService");
      
      await setBaselinePlaylistId(String(playlistId));
      
      // Return updated status
      const status = await getBaselinePlaylistStatus();
      res.json({ ok: true, ...status });
    } catch (error: any) {
      console.error("[SetBaselinePlaylist] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/settings/baseline-playlist/test
   * Test a baseline playlist ID without saving
   */
  app.post("/api/admin/settings/baseline-playlist/test", requireAdminAccess, async (req, res) => {
    try {
      const { playlistId } = req.body;
      
      if (!playlistId) {
        return res.status(400).json({ ok: false, error: "playlistId is required" });
      }
      
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      
      const result = await yodeckRequest<any>(`/playlists/${playlistId}/`);
      
      if (!result.ok || !result.data) {
        return res.json({ 
          ok: false, 
          playlistId,
          playlistName: null,
          itemCount: 0,
          error: `Playlist ${playlistId} niet gevonden: ${result.error}` 
        });
      }
      
      const itemCount = Array.isArray(result.data.items) ? result.data.items.length : 0;
      
      res.json({
        ok: itemCount > 0,
        playlistId,
        playlistName: result.data.name,
        itemCount,
        warning: itemCount === 0 ? "Playlist is LEEG - vul eerst content toe in Yodeck!" : null,
      });
    } catch (error: any) {
      console.error("[TestBaselinePlaylist] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  app.get("/api/admin/settings", requirePermission("manage_users"), async (req, res) => {
    try {
      const { category } = req.query;
      const settings = category 
        ? await storage.getSystemSettingsByCategory(String(category))
        : await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.get("/api/admin/settings/:key", requirePermission("manage_users"), async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ message: "Instelling niet gevonden" });
      }
      res.json(setting);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  app.put("/api/admin/settings/:key", requirePermission("manage_users"), async (req, res) => {
    try {
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ message: "Waarde is verplicht" });
      }
      const currentUser = (req as any).currentUser;
      const setting = await storage.upsertSystemSetting(
        req.params.key, 
        String(value),
        currentUser?.username || "admin"
      );
      res.json(setting);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get locations that need review (suspicious visitor counts)
  app.get("/api/admin/locations/needs-review", requirePermission("manage_placements"), async (req, res) => {
    try {
      const flaggedLocations = await db.select()
        .from(locations)
        .where(eq(locations.needsReview, true))
        .orderBy(desc(locations.updatedAt));
      res.json(flaggedLocations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
  
  // Clear needsReview flag on a location (after manual review)
  app.post("/api/admin/locations/:id/clear-review", requirePermission("manage_placements"), async (req, res) => {
    try {
      const [updated] = await db.update(locations)
        .set({ 
          needsReview: false, 
          needsReviewReason: null,
          updatedAt: new Date()
        })
        .where(eq(locations.id, req.params.id))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "Locatie niet gevonden" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // EMAIL LOGS
  // ============================================================================

  app.get("/api/email-logs", async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const logs = await db.select().from(emailLogs)
        .orderBy(desc(emailLogs.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/email-logs/:id", async (req, res) => {
    try {
      const [log] = await db.select().from(emailLogs).where(eq(emailLogs.id, req.params.id));
      if (!log) return res.status(404).json({ message: "Email log niet gevonden" });
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get email log with full HTML preview (rebuilds email wrapper from stored body)
  app.get("/api/email-logs/:id/preview", async (req, res) => {
    try {
      const [log] = await db.select().from(emailLogs).where(eq(emailLogs.id, req.params.id));
      if (!log) return res.status(404).json({ message: "Email log niet gevonden" });
      
      // Rebuild full HTML from stored body using centralized render engine (same as send path)
      let fullHtml = "";
      if (log.bodyRendered) {
        const emailResult = await renderEmail({
          subject: log.subjectRendered || "",
          body: log.bodyRendered,
          contactName: log.contactName || "klant",
        });
        fullHtml = emailResult.finalHtmlRendered;
      }
      
      res.json({
        ...log,
        fullHtml,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================================================
  // CONTRACT DOCUMENTS
  // ============================================================================

  app.get("/api/contract-documents", async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const docs = await db.select().from(contractDocuments)
        .orderBy(desc(contractDocuments.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contract-documents/:id", async (req, res) => {
    try {
      const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, req.params.id));
      if (!doc) return res.status(404).json({ message: "Contract document niet gevonden" });
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate contract document from template
  app.post("/api/contract-documents/generate", async (req, res) => {
    try {
      const { templateKey, entityType, entityId, data } = req.body;
      
      if (!templateKey || !entityType || !entityId) {
        return res.status(400).json({ message: "templateKey, entityType, en entityId zijn verplicht" });
      }
      
      const { generateContractDocument } = await import("./services/contractTemplateService");
      const result = await generateContractDocument({ templateKey, entityType, entityId, data: data || {} });
      
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update contract document status
  app.patch("/api/contract-documents/:id/status", async (req, res) => {
    try {
      const { status, signedAt } = req.body;
      
      if (!["draft", "sent", "signed"].includes(status)) {
        return res.status(400).json({ message: "Status moet 'draft', 'sent', of 'signed' zijn" });
      }
      
      const { updateContractDocumentStatus } = await import("./services/contractTemplateService");
      await updateContractDocumentStatus(
        req.params.id, 
        status, 
        signedAt ? new Date(signedAt) : undefined
      );
      
      res.json({ message: "Status bijgewerkt" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get contract documents by entity
  app.get("/api/contract-documents/entity/:entityType/:entityId", async (req, res) => {
    try {
      const { getContractDocuments } = await import("./services/contractTemplateService");
      const docs = await getContractDocuments(req.params.entityType, req.params.entityId);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Check terms acceptance for entity
  app.get("/api/terms-acceptance/:entityType/:entityId", async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const [acceptance] = await db.select().from(termsAcceptance)
        .where(sql`entity_type = ${entityType} AND entity_id = ${entityId}`)
        .orderBy(desc(termsAcceptance.acceptedAt))
        .limit(1);
      
      res.json({ 
        accepted: !!acceptance, 
        acceptance: acceptance || null 
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Record terms acceptance
  app.post("/api/terms-acceptance", async (req, res) => {
    try {
      const { entityType, entityId, termsVersion, termsHash, source } = req.body;
      
      if (!entityType || !entityId || !termsVersion) {
        return res.status(400).json({ message: "entityType, entityId en termsVersion zijn verplicht" });
      }

      const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const [acceptance] = await db.insert(termsAcceptance).values({
        entityType,
        entityId,
        termsVersion,
        termsHash: termsHash || null,
        source: source || "onboarding_checkbox",
        ip: String(ip),
        userAgent: String(userAgent),
      }).returning();

      res.status(201).json(acceptance);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send contract for signing via internal OTP engine
  app.post("/api/contract-documents/:id/send-for-signing", async (req, res) => {
    try {
      const { id } = req.params;
      
      const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, id));
      if (!doc) {
        return res.status(404).json({ message: "Contract document niet gevonden" });
      }
      
      if (doc.status !== "draft") {
        return res.status(400).json({ message: "Contract is al verzonden of ondertekend" });
      }

      let customerEmail = "";
      let customerName = "";
      
      if (doc.entityType === "advertiser") {
        const advertiser = await storage.getAdvertiser(doc.entityId);
        if (!advertiser) {
          return res.status(404).json({ message: "Adverteerder niet gevonden" });
        }
        customerEmail = advertiser.email || advertiser.contactEmail || "";
        customerName = advertiser.primaryContactName || advertiser.contactName || advertiser.companyName || "";
      } else if (doc.entityType === "location") {
        const location = await storage.getLocation(doc.entityId);
        if (!location) {
          return res.status(404).json({ message: "Locatie niet gevonden" });
        }
        customerEmail = location.email || "";
        customerName = location.contactName || location.name || "";
      }

      if (!customerEmail) {
        return res.status(400).json({ message: "Klant heeft geen e-mailadres" });
      }

      const { sendContractForSigning } = await import("./services/contractEngine");
      const result = await sendContractForSigning(id, customerEmail, customerName);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: result.message });
    } catch (error: any) {
      console.error("[send-for-signing] Error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Verify OTP code for contract signing
  app.post("/api/contract-documents/:id/verify-otp", async (req, res) => {
    try {
      const { id } = req.params;
      const { code } = req.body;

      if (!code || code.length !== 6) {
        return res.status(400).json({ message: "Voer een 6-cijferige code in" });
      }

      const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
      const userAgent = String(req.headers["user-agent"] || "unknown");

      const { verifyContractOtp } = await import("./services/contractEngine");
      const result = await verifyContractOtp(id, code, ip, userAgent);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: result.message, verified: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Finalize contract signature after OTP verification
  app.post("/api/contract-documents/:id/finalize-signature", async (req, res) => {
    try {
      const { id } = req.params;

      const { finalizeContractSignature } = await import("./services/contractEngine");
      const result = await finalizeContractSignature(id);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Contract succesvol ondertekend", pdfUrl: result.pdfUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Resend OTP code for contract
  app.post("/api/contract-documents/:id/resend-otp", async (req, res) => {
    try {
      const { id } = req.params;

      const { resendContractOtp } = await import("./services/contractEngine");
      const result = await resendContractOtp(id);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: result.message });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get signing status for a contract
  app.get("/api/contract-documents/:id/signing-status", async (req, res) => {
    try {
      const { getContractSigningStatus } = await import("./services/contractEngine");
      const status = await getContractSigningStatus(req.params.id);

      if (!status) {
        return res.status(404).json({ message: "Contract document niet gevonden" });
      }

      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Download signed PDF
  app.get("/api/contract-documents/:id/signed-pdf", async (req, res) => {
    try {
      const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, req.params.id));
      if (!doc) {
        return res.status(404).json({ message: "Contract document niet gevonden" });
      }

      if (!doc.signedPdfUrl) {
        return res.status(404).json({ message: "Geen getekende PDF beschikbaar" });
      }

      const objectStorage = new ObjectStorageService();
      const pdfBuffer = await objectStorage.read(doc.signedPdfUrl);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="contract-${doc.id}-signed.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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

  const VALID_SERVICES = ["yodeck", "moneybird"];

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

  // ============================================================================
  // DEV / TEST ENDPOINTS
  // ============================================================================

  // Test email endpoint
  app.post("/api/dev/test-email", async (req, res) => {
    try {
      const { to } = req.body;
      if (!to || typeof to !== 'string') {
        return res.status(400).json({ ok: false, error: "E-mailadres (to) is verplicht" });
      }
      
      const result = await sendEmail({
        to,
        subject: "Elevizion testmail ✅",
        templateKey: "test_email",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #1e3a5f;">Elevizion Test E-mail ✅</h2>
            <p>Dit is een test e-mail om te verifiëren dat de Postmark integratie correct werkt.</p>
            <p>Verzonden op: ${new Date().toLocaleString('nl-NL')}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">© ${new Date().getFullYear()} Elevizion B.V.</p>
          </div>
        `,
        text: `Elevizion Test E-mail ✅\n\nDit is een test e-mail om te verifiëren dat de Postmark integratie correct werkt.\n\nVerzonden op: ${new Date().toLocaleString('nl-NL')}`,
      });
      
      res.json({ ok: result.success, messageId: result.messageId, logId: result.logId, error: result.success ? undefined : result.message });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Email config health check
  app.get("/api/dev/email-config", async (_req, res) => {
    const { getEmailConfig } = await import("./email");
    const config = getEmailConfig();
    res.json(config);
  });

  // ============================================================================
  // EMAIL LOGS (Admin read-only)
  // ============================================================================

  app.get("/api/email/logs", requirePermission("view_finance"), async (req, res) => {
    try {
      const filters = {
        limit: Math.min(parseInt(req.query.limit as string) || 200, 500),
        status: req.query.status as string | undefined,
        templateKey: req.query.templateKey as string | undefined,
        entityType: req.query.entityType as string | undefined,
        entityId: req.query.entityId as string | undefined,
        search: req.query.search as string | undefined,
      };
      
      const logs = await storage.getEmailLogsWithFilters(filters);
      res.json(logs.map(log => ({
        id: log.id,
        toEmail: log.toEmail,
        templateKey: log.templateKey,
        entityType: log.entityType,
        entityId: log.entityId,
        status: log.status,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt,
        sentAt: log.sentAt,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single email log detail
  app.get("/api/email/logs/:id", requirePermission("view_finance"), async (req, res) => {
    try {
      const log = await storage.getEmailLogById(req.params.id);
      if (!log) {
        return res.status(404).json({ message: "Email log niet gevonden" });
      }
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Resend failed email
  app.post("/api/email/resend/:id", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const originalLog = await storage.getEmailLogById(req.params.id);
      if (!originalLog) {
        return res.status(404).json({ message: "Email log niet gevonden" });
      }
      
      if (originalLog.status !== "failed") {
        return res.status(400).json({ message: "Alleen mislukte emails kunnen opnieuw verzonden worden" });
      }
      
      const { sendStepEmail, availableSteps } = await import("./emailSteps");
      
      // Check if templateKey is a valid step
      const step = availableSteps.find(s => s === originalLog.templateKey);
      if (!step) {
        return res.status(400).json({ message: `Onbekende email step: ${originalLog.templateKey}` });
      }
      
      const result = await sendStepEmail({
        step,
        toEmail: originalLog.toEmail,
        entityType: originalLog.entityType || undefined,
        entityId: originalLog.entityId || undefined,
        skipIdempotencyCheck: true, // Allow resend
      });
      
      res.json({
        ok: result.success,
        message: result.message,
        logId: result.logId,
        originalLogId: originalLog.id,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send email using step system (dev/admin endpoint)
  app.post("/api/dev/email/send", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { to, step, entityType, entityId, meta } = req.body;
      
      if (!to || !step) {
        return res.status(400).json({ ok: false, error: "to en step zijn verplicht" });
      }
      
      const { sendStepEmail, availableSteps } = await import("./emailSteps");
      
      if (!availableSteps.includes(step)) {
        return res.status(400).json({ 
          ok: false, 
          error: `Ongeldige step. Beschikbaar: ${availableSteps.join(", ")}` 
        });
      }
      
      const result = await sendStepEmail({
        step,
        toEmail: to,
        entityType,
        entityId,
        meta,
        skipIdempotencyCheck: true,
      });
      
      res.json({
        ok: result.success,
        message: result.message,
        skipped: result.skipped,
        logId: result.logId,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get available email steps
  app.get("/api/email/steps", requirePermission("view_finance"), async (_req, res) => {
    const { availableSteps } = await import("./emailSteps");
    res.json(availableSteps);
  });

  // ============================================================================
  // VERIFICATION CODE FLOW
  // ============================================================================
  const crypto = await import("crypto");

  // Send verification code
  app.post("/api/auth/send-verification", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ ok: false, error: "E-mail is verplicht" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Rate limit: max 3 codes per 15 min
      const recentCount = await storage.getRecentVerificationCodeCount(normalizedEmail, 15);
      if (recentCount >= 3) {
        return res.status(429).json({ ok: false, error: "Te veel verificatiecodes aangevraagd. Wacht 15 minuten." });
      }
      
      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      
      // Store hashed code (expires in 10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createVerificationCode({
        email: normalizedEmail,
        codeHash,
        expiresAt,
        attempts: 0,
      });
      
      // Send email
      const result = await sendEmail({
        to: normalizedEmail,
        subject: "Je verificatiecode voor Elevizion",
        templateKey: "verification_code",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto;">
            <h2 style="color: #1e3a5f; text-align: center;">Verificatiecode</h2>
            <p style="text-align: center;">Gebruik deze code om je e-mailadres te verifiëren:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; border-radius: 8px;">
              ${code}
            </div>
            <p style="text-align: center; color: #666; font-size: 14px;">Deze code is 10 minuten geldig.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} Elevizion B.V.</p>
          </div>
        `,
        text: `Je verificatiecode voor Elevizion: ${code}\n\nDeze code is 10 minuten geldig.`,
      });
      
      if (!result.success) {
        return res.status(500).json({ ok: false, error: "Kon verificatiemail niet verzenden" });
      }
      
      res.json({ ok: true, message: "Verificatiecode verzonden" });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Verify code
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ ok: false, error: "E-mail en code zijn verplicht" });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      const codeHash = crypto.createHash("sha256").update(code.toString()).digest("hex");
      
      // Get active verification code
      const verificationCode = await storage.getActiveVerificationCode(normalizedEmail);
      
      if (!verificationCode) {
        return res.status(400).json({ ok: false, error: "Geen geldige verificatiecode gevonden" });
      }
      
      // Check attempts
      if (verificationCode.attempts >= 5) {
        return res.status(400).json({ ok: false, error: "Te veel pogingen. Vraag een nieuwe code aan." });
      }
      
      // Verify code
      if (verificationCode.codeHash !== codeHash) {
        await storage.incrementVerificationAttempts(verificationCode.id);
        return res.status(400).json({ ok: false, error: "Ongeldige code" });
      }
      
      // Mark as used
      await storage.markVerificationCodeUsed(verificationCode.id);
      
      res.json({ ok: true, message: "E-mail geverifieerd" });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================================================
  // ONBOARDING INVITE FLOW
  // ============================================================================

  // Send onboarding invite
  app.post("/api/onboarding/send-invite", requirePermission("manage_integrations"), async (req, res) => {
    try {
      const { email, entityType, entityId } = req.body;
      
      if (!email || !entityType || !entityId) {
        return res.status(400).json({ ok: false, error: "email, entityType en entityId zijn verplicht" });
      }
      
      if (!["screen", "advertiser", "location"].includes(entityType)) {
        return res.status(400).json({ ok: false, error: "entityType moet screen, advertiser of location zijn" });
      }
      
      // Generate single-use token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Store token
      await storage.createOnboardingInviteToken({
        tokenHash,
        entityType,
        entityId,
        expiresAt,
      });
      
      // Build onboarding URL
      const baseUrl = process.env.ONBOARDING_BASE_URL || `https://${req.get("host")}`;
      const onboardingUrl = `${baseUrl}/onboarding?token=${token}`;
      
      // Send email
      const result = await sendEmail({
        to: email,
        subject: "Vul je gegevens aan voor Elevizion",
        templateKey: "onboarding_invite",
        entityType,
        entityId,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
              <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
              <h2 style="color: #1e3a5f; margin-top: 0;">Welkom bij Elevizion!</h2>
              <p>Om uw schermreclame te activeren, hebben wij nog wat gegevens van u nodig.</p>
              <p>Klik op de onderstaande knop om uw gegevens aan te vullen:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${onboardingUrl}" style="background: #1e3a5f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Gegevens aanvullen
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">Deze link is 7 dagen geldig en kan slechts 1x worden gebruikt.</p>
              <p>Heeft u vragen? Neem gerust contact met ons op via info@elevizion.nl</p>
              <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
            </div>
          </div>
        `,
        text: `Welkom bij Elevizion!\n\nOm uw schermreclame te activeren, hebben wij nog wat gegevens van u nodig.\n\nKlik hier om uw gegevens aan te vullen:\n${onboardingUrl}\n\nDeze link is 7 dagen geldig en kan slechts 1x worden gebruikt.\n\nMet vriendelijke groet,\nTeam Elevizion`,
      });
      
      if (!result.success) {
        return res.status(500).json({ ok: false, error: result.message });
      }
      
      res.json({ ok: true, message: "Uitnodiging verzonden", onboardingUrl });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================================================
  // DEBUG ENDPOINTS (admin only)
  // ============================================================================

  // Debug: Get onboarding status for any entity
  app.get("/api/debug/onboarding/:entityType/:id", requirePermission("manage_users"), async (req, res) => {
    try {
      const { entityType, id } = req.params;
      
      if (!["advertiser", "screen", "location"].includes(entityType)) {
        return res.status(400).json({ error: "entityType moet advertiser, screen of location zijn" });
      }

      const { getOnboardingDebugInfo } = await import("./services/onboarding");
      const debugInfo = await getOnboardingDebugInfo(entityType as any, id);
      
      res.json(debugInfo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Debug: Get Moneybird mapping info for entity
  app.get("/api/debug/moneybird/:entityType/:id", requirePermission("manage_users"), async (req, res) => {
    try {
      const { entityType, id } = req.params;
      
      let entity: any = null;
      let moneybirdContactId: string | null = null;
      let mappedFields: Record<string, any> = {};

      if (entityType === "advertiser") {
        entity = await storage.getAdvertiser(id);
        moneybirdContactId = entity?.moneybirdContactId || null;
        mappedFields = {
          company_name: entity?.companyName,
          firstname: entity?.contactName?.split(" ")[0],
          lastname: entity?.contactName?.split(" ").slice(1).join(" "),
          email: entity?.email,
          phone: entity?.phone,
          address1: entity?.street,
          zipcode: entity?.zipcode,
          city: entity?.city,
          country: entity?.country || "NL",
          chamber_of_commerce: entity?.kvkNumber,
          tax_number: entity?.vatNumber,
          sepa_iban: entity?.iban,
          sepa_iban_account_name: entity?.ibanAccountHolder,
        };
      } else if (entityType === "location") {
        entity = await storage.getLocation(id);
        moneybirdContactId = entity?.moneybirdContactId || null;
        mappedFields = {
          company_name: entity?.name,
          email: entity?.email,
          phone: entity?.phone,
          address1: entity?.street || entity?.address,
          zipcode: entity?.zipcode,
          city: entity?.city,
        };
      } else if (entityType === "screen") {
        const screen = await storage.getScreen(id);
        if (screen?.locationId) {
          entity = await storage.getLocation(screen.locationId);
          moneybirdContactId = entity?.moneybirdContactId || null;
        }
        mappedFields = {
          note: `Via locatie: ${entity?.name || "geen locatie"}`,
          screenId: screen?.screenId,
          screenName: screen?.name,
        };
      }

      res.json({
        entityType,
        entityId: id,
        found: !!entity,
        moneybirdContactId,
        syncStatus: moneybirdContactId ? "linked" : "not_linked",
        mappedFields: Object.fromEntries(
          Object.entries(mappedFields).filter(([_, v]) => v != null)
        ),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Debug: Get Yodeck mapping info for screen
  app.get("/api/debug/yodeck/:screenId", requirePermission("manage_users"), async (req, res) => {
    try {
      const { screenId } = req.params;
      
      // Try to find by DB id first, then by screenId
      let screen = await storage.getScreen(screenId);
      if (!screen) {
        screen = await storage.getScreenByScreenId(screenId);
      }

      if (!screen) {
        return res.status(404).json({ error: "Scherm niet gevonden" });
      }

      const location = screen.locationId ? await storage.getLocation(screen.locationId) : null;

      res.json({
        dbId: screen.id,
        screenId: screen.screenId,
        name: screen.name,
        status: screen.status,
        yodeck: {
          playerId: screen.yodeckPlayerId,
          uuid: screen.yodeckUuid,
          playerName: screen.yodeckPlayerName,
          workspaceName: screen.yodeckWorkspaceName,
          screenshotUrl: screen.yodeckScreenshotUrl,
          contentStatus: screen.yodeckContentStatus,
          contentCount: screen.yodeckContentCount,
          lastContentFetch: screen.yodeckContentLastFetchedAt,
        },
        location: location ? {
          id: location.id,
          name: location.name,
          city: location.city,
          moneybirdContactId: location.moneybirdContactId,
        } : null,
        syncStatus: screen.yodeckPlayerId ? "linked" : "not_linked",
        matchConfidence: screen.matchConfidence,
        matchReason: screen.matchReason,
        lastSeenAt: screen.lastSeenAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADMIN: YODECK SETUP CHECKLIST
  // ============================================================================
  
  app.get("/api/admin/yodeck-setup", requireAdminAccess, async (req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const { PREDEFINED_TAGS } = await import("./services/yodeckPublishService");
      
      const checklist = [];
      
      // 1. Check Yodeck API connectivity
      const caps = await yodeckPublishService.getCapabilities(true);
      checklist.push({
        id: "api_connectivity",
        name: "Yodeck API bereikbaar",
        status: caps.canListPlaylists ? "ok" : "error",
        message: caps.canListPlaylists ? "API is bereikbaar" : "Kan Yodeck API niet bereiken",
      });
      
      // 2. Check playlists endpoint
      checklist.push({
        id: "playlists_endpoint",
        name: "Playlists ophalen",
        status: caps.canListPlaylists ? "ok" : "error",
        message: caps.canListPlaylists ? "GET /playlists werkt" : "GET /playlists faalt",
      });
      
      // 3. Check screens endpoint
      checklist.push({
        id: "screens_endpoint",
        name: "Screens ophalen",
        status: caps.canAssignPlaylistToScreen ? "ok" : "error",
        message: caps.canAssignPlaylistToScreen ? "GET /screens werkt" : "GET /screens faalt",
      });
      
      // 4. Predefined tags notice
      checklist.push({
        id: "predefined_tags",
        name: "Predefined tags",
        status: "warning",
        message: `Maak deze tags 1x handmatig aan in Yodeck UI: ${PREDEFINED_TAGS.join(', ')}`,
        action: "Ga naar Yodeck > Tags > New Tag",
      });
      
      // 5. Check for at least one location with playlist
      const locationCount = await db.select({ count: sql<number>`count(*)` }).from(locations);
      const locationsWithPlaylist = await db.select({ count: sql<number>`count(*)` })
        .from(locations)
        .where(sql`yodeck_playlist_id IS NOT NULL`);
      
      checklist.push({
        id: "locations_setup",
        name: "Locaties met playlists",
        status: Number(locationsWithPlaylist[0]?.count) > 0 ? "ok" : "warning",
        message: `${locationsWithPlaylist[0]?.count || 0} van ${locationCount[0]?.count || 0} locaties hebben een playlist`,
      });
      
      // 6. Layout support check
      const { yodeckLayoutService } = await import("./services/yodeckLayoutService");
      const layoutsSupported = await yodeckLayoutService.probeLayoutsSupport();
      
      checklist.push({
        id: "layouts_support",
        name: "Layouts ondersteuning",
        status: layoutsSupported ? "ok" : "warning",
        message: layoutsSupported 
          ? "Layout API beschikbaar - 2-zone layout mogelijk" 
          : "Layout API niet beschikbaar - fallback schedule wordt gebruikt",
      });
      
      // 7. Locations with layout configured
      const locationsWithLayout = await db.select({ count: sql<number>`count(*)` })
        .from(locations)
        .where(sql`layout_mode = 'LAYOUT' AND yodeck_layout_id IS NOT NULL`);
      
      checklist.push({
        id: "layouts_configured",
        name: "Locaties met layout",
        status: Number(locationsWithLayout[0]?.count) > 0 ? "ok" : "info",
        message: `${locationsWithLayout[0]?.count || 0} locaties hebben layout mode actief`,
      });
      
      const overallStatus = checklist.every(c => c.status === "ok") ? "ok" : 
                            checklist.some(c => c.status === "error") ? "error" : "warning";
      
      res.json({
        overallStatus,
        checklist,
        predefinedTags: PREDEFINED_TAGS,
        capabilities: caps,
        layoutsSupported,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADMIN: TAG POLICIES
  // ============================================================================
  
  app.get("/api/admin/tag-policies", requireAdminAccess, async (req, res) => {
    try {
      const policies = await db.select().from(tagPolicies).orderBy(tagPolicies.tagType, tagPolicies.tagName);
      const { ALLOWED_TAG_PREFIXES, PREDEFINED_TAGS } = await import("@shared/schema");
      
      res.json({
        policies,
        allowedPrefixes: ALLOWED_TAG_PREFIXES,
        predefinedTags: PREDEFINED_TAGS,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/admin/tag-policies", requireAdminAccess, async (req, res) => {
    try {
      const { tagName, tagType, description } = req.body;
      
      if (!tagName) {
        return res.status(400).json({ error: "Tag naam is verplicht" });
      }
      
      // Validate tag prefix
      const { ALLOWED_TAG_PREFIXES } = await import("@shared/schema");
      const hasValidPrefix = ALLOWED_TAG_PREFIXES.some(prefix => tagName.startsWith(prefix));
      if (!hasValidPrefix) {
        return res.status(400).json({ 
          error: `Tag moet beginnen met: ${ALLOWED_TAG_PREFIXES.join(', ')}` 
        });
      }
      
      const [policy] = await db.insert(tagPolicies).values({
        tagName,
        tagType: tagType || "custom",
        description,
      }).returning();
      
      res.json({ 
        success: true, 
        policy,
        message: `Tag '${tagName}' toegevoegd. Vergeet niet om deze ook in Yodeck UI aan te maken!`
      });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ error: "Tag bestaat al" });
      }
      res.status(500).json({ error: error.message });
    }
  });
  
  app.delete("/api/admin/tag-policies/:id", requireAdminAccess, async (req, res) => {
    try {
      await db.delete(tagPolicies).where(eq(tagPolicies.id, req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADMIN: LAYOUTS (Baseline + Ads separation)
  // ============================================================================
  
  app.get("/api/admin/layouts", requireAdminAccess, async (req, res) => {
    try {
      const { yodeckLayoutService } = await import("./services/yodeckLayoutService");
      const result = await yodeckLayoutService.getLayoutStatusForLocations();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/admin/layouts/apply", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.body;
      
      if (!locationId) {
        return res.status(400).json({ error: "locationId is verplicht" });
      }
      
      const { yodeckLayoutService } = await import("./services/yodeckLayoutService");
      const result = await yodeckLayoutService.applyLayoutToLocation(locationId);
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get("/api/admin/layouts/probe", requireAdminAccess, async (req, res) => {
    try {
      const { yodeckLayoutService } = await import("./services/yodeckLayoutService");
      const supported = await yodeckLayoutService.probeLayoutsSupport(true);
      const status = yodeckLayoutService.getLayoutSupportStatus();
      
      res.json({
        layoutsSupported: supported,
        lastCheck: status.lastCheck,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/admin/layouts/:locationId/seed-baseline", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { yodeckLayoutService } = await import("./services/yodeckLayoutService");
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ error: "Locatie niet gevonden" });
      }
      
      if (!location.yodeckBaselinePlaylistId) {
        return res.status(400).json({ error: "Baseline playlist niet geconfigureerd" });
      }
      
      const result = await yodeckLayoutService.seedBaselinePlaylist(location.yodeckBaselinePlaylistId);
      
      res.json({
        ok: result.ok,
        seeded: result.seeded,
        error: result.error,
        logs: result.logs,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.get("/api/admin/layouts/:locationId/baseline-status", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { yodeckLayoutService } = await import("./services/yodeckLayoutService");
      
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(404).json({ error: "Locatie niet gevonden" });
      }
      
      if (!location.yodeckBaselinePlaylistId) {
        return res.json({ hasPlaylist: false, isEmpty: true });
      }
      
      const isEmpty = await yodeckLayoutService.checkPlaylistEmpty(location.yodeckBaselinePlaylistId);
      
      res.json({
        hasPlaylist: true,
        playlistId: location.yodeckBaselinePlaylistId,
        isEmpty,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Force Elevizion layout on screen (detect wrong layout, fix, push, verify)
  app.post("/api/admin/layouts/:locationId/force", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureScreenUsesElevizionLayout } = await import("./services/yodeckLayoutService");
      
      console.log(`[ForceLayout] API called for location ${locationId}`);
      const result = await ensureScreenUsesElevizionLayout(locationId);
      
      result.logs.forEach(log => console.log(log));
      
      if (!result.ok) {
        return res.status(400).json({ 
          success: false, 
          error: result.error,
          verified: false,
          logs: result.logs,
        });
      }
      
      res.json({
        success: true,
        verified: result.verified,
        layoutId: result.layoutId,
        layoutName: result.layoutName,
        logs: result.logs,
      });
    } catch (error: any) {
      console.error(`[ForceLayout] Error: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get detailed layout status for all locations (includes screen current config)
  app.get("/api/admin/layouts/detailed", requireAdminAccess, async (req, res) => {
    try {
      const { getDetailedLayoutStatus } = await import("./services/yodeckLayoutService");
      const status = await getDetailedLayoutStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Check screen layout config for a single location
  app.get("/api/admin/layouts/:locationId/screen-status", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { checkScreenLayoutConfig } = await import("./services/yodeckLayoutService");
      const status = await checkScreenLayoutConfig(locationId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADMIN: MONITORING & ALERTS
  // ============================================================================
  
  app.get("/api/admin/monitoring", requireAdminAccess, async (req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      
      // Count publish failures in last 24h
      const failuresLast24h = await db.select({ count: sql<number>`count(*)` })
        .from(placementPlans)
        .where(and(
          eq(placementPlans.status, "FAILED"),
          sql`failed_at > NOW() - INTERVAL '24 hours'`
        ));
      
      // Get last successful publish
      const lastSuccessfulPublish = await db.select()
        .from(placementPlans)
        .where(eq(placementPlans.status, "PUBLISHED"))
        .orderBy(sql`published_at DESC`)
        .limit(1);
      
      // Get outbox backlog
      const outboxBacklog = await db.select({ count: sql<number>`count(*)` })
        .from(integrationOutbox)
        .where(eq(integrationOutbox.status, "pending"));
      
      // Check Yodeck auth
      const caps = await yodeckPublishService.getCapabilities();
      const yodeckAuthOk = caps.canListPlaylists;
      
      const failureCount = Number(failuresLast24h[0]?.count) || 0;
      const backlogCount = Number(outboxBacklog[0]?.count) || 0;
      
      const alerts = [];
      if (failureCount > 0) {
        alerts.push({
          type: "error",
          message: `${failureCount} publish failures in de laatste 24 uur`,
        });
      }
      if (!yodeckAuthOk) {
        alerts.push({
          type: "error",
          message: "Yodeck API is niet bereikbaar",
        });
      }
      if (backlogCount > 10) {
        alerts.push({
          type: "warning",
          message: `${backlogCount} jobs in de outbox wachtrij`,
        });
      }
      
      res.json({
        status: alerts.length === 0 ? "healthy" : alerts.some(a => a.type === "error") ? "critical" : "warning",
        publishFailuresLast24h: failureCount,
        lastSuccessfulPublish: lastSuccessfulPublish[0]?.publishedAt || null,
        outboxBacklog: backlogCount,
        yodeckAuthOk,
        alerts,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADMIN: E2E CHAIN TEST
  // ============================================================================
  
  app.get("/api/admin/e2e-tests", requireAdminAccess, async (req, res) => {
    try {
      const tests = await db.select()
        .from(e2eTestRuns)
        .orderBy(sql`started_at DESC`)
        .limit(20);
      
      res.json({ tests });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/admin/e2e-tests/run", requireAdminAccess, async (req: any, res) => {
    try {
      const { locationId } = req.body;
      const { yodeckPublishService, PREDEFINED_TAGS } = await import("./services/yodeckPublishService");
      
      const steps: { step: string; status: "ok" | "failed" | "skipped"; message: string; timestamp: string }[] = [];
      let testMediaId: string | null = null;
      
      const addStep = (step: string, status: "ok" | "failed" | "skipped", message: string) => {
        steps.push({ step, status, message, timestamp: new Date().toISOString() });
      };
      
      // Create test run record
      const [testRun] = await db.insert(e2eTestRuns).values({
        testType: "YODECK_CHAIN",
        testLocationId: locationId || null,
        triggeredBy: req.user?.id,
      }).returning();
      
      try {
        // Step 1: Check Yodeck connectivity
        const caps = await yodeckPublishService.getCapabilities(true);
        if (caps.canListPlaylists) {
          addStep("yodeck_connectivity", "ok", "Yodeck API bereikbaar");
        } else {
          addStep("yodeck_connectivity", "failed", "Yodeck API niet bereikbaar");
          throw new Error("Yodeck API niet bereikbaar");
        }
        
        // Step 2: Ensure tagbased playlist for location (if provided)
        if (locationId) {
          const ensureResult = await yodeckPublishService.ensureTagBasedPlaylist(locationId);
          if (ensureResult.ok) {
            addStep("ensure_playlist", "ok", `Playlist ${ensureResult.playlistId} verified/created`);
          } else {
            addStep("ensure_playlist", "failed", ensureResult.error || "Playlist ensure failed");
          }
        } else {
          addStep("ensure_playlist", "skipped", "Geen locatie opgegeven");
        }
        
        // Step 3: Verify predefined tags info
        addStep("predefined_tags", "ok", `Tags die moeten bestaan in Yodeck: ${PREDEFINED_TAGS.join(', ')}`);
        
        // Step 4: Check tag update capability
        if (caps.canUpdateMediaTags) {
          addStep("tag_capability", "ok", "Media tag update capability aanwezig");
        } else {
          addStep("tag_capability", "failed", "Media tag update niet ondersteund");
        }
        
        // Update test run with success
        await db.update(e2eTestRuns)
          .set({
            completedAt: new Date(),
            ok: steps.every(s => s.status !== "failed"),
            stepsJson: steps,
            testMediaId,
          })
          .where(eq(e2eTestRuns.id, testRun.id));
        
        res.json({
          success: steps.every(s => s.status !== "failed"),
          testRunId: testRun.id,
          steps,
        });
      } catch (error: any) {
        // Update test run with failure
        await db.update(e2eTestRuns)
          .set({
            completedAt: new Date(),
            ok: false,
            stepsJson: steps,
            error: error.message,
          })
          .where(eq(e2eTestRuns.id, testRun.id));
        
        res.json({
          success: false,
          testRunId: testRun.id,
          steps,
          error: error.message,
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // PLACEMENT PLAN DETAILS WITH YODECK URLS
  // ============================================================================
  
  app.get("/api/placement-plans/:id/yodeck-info", requireAdminAccess, async (req, res) => {
    try {
      const { generateResourceUrls } = await import("./utils/yodeckUrls");
      
      const plan = await db.select().from(placementPlans).where(eq(placementPlans.id, req.params.id)).limit(1);
      if (!plan[0]) {
        return res.status(404).json({ error: "Plan niet gevonden" });
      }
      
      const targets = await db.select()
        .from(placementTargets)
        .where(eq(placementTargets.planId, req.params.id));
      
      // Get location info for each target
      const targetDetails = await Promise.all(targets.map(async (target) => {
        const location = await db.select().from(locations).where(eq(locations.id, target.locationId)).limit(1);
        const loc = location[0];
        
        return {
          locationId: target.locationId,
          locationName: loc?.name || target.locationId,
          status: target.status,
          yodeckMediaId: target.yodeckMediaId,
          yodeckPlaylistId: target.yodeckPlaylistId,
          yodeckScreenId: loc?.yodeckScreenId || loc?.yodeckDeviceId,
          urls: generateResourceUrls({
            mediaId: target.yodeckMediaId,
            playlistId: target.yodeckPlaylistId,
            screenId: loc?.yodeckScreenId || loc?.yodeckDeviceId,
          }),
          publishedAt: target.publishedAt,
          errorMessage: target.errorMessage,
        };
      }));
      
      // Get asset info
      const asset = plan[0].adAssetId 
        ? await db.select().from(adAssets).where(eq(adAssets.id, plan[0].adAssetId)).limit(1)
        : [];
      
      res.json({
        planId: plan[0].id,
        status: plan[0].status,
        yodeckMediaId: (plan[0].publishReport as any)?.yodeckMediaId,
        tagsApplied: ["elevizion:ad", "elevizion:advertiser", "elevizion:plan", "elevizion:location"],
        publishReport: plan[0].publishReport,
        publishedAt: plan[0].publishedAt,
        asset: asset[0] ? {
          id: asset[0].id,
          fileName: asset[0].fileName,
        } : null,
        targets: targetDetails,
        urls: generateResourceUrls({
          mediaId: (plan[0].publishReport as any)?.yodeckMediaId,
        }),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ADMIN: YODECK DEBUG & FIX
  // ============================================================================
  
  // Get list of all screens for dropdown
  app.get("/api/admin/yodeck-debug/screens", requireAdminAccess, async (req, res) => {
    try {
      const locs = await db.select({
        id: locations.id,
        name: locations.name,
        yodeckDeviceId: locations.yodeckDeviceId,
      }).from(locations).where(sql`yodeck_device_id IS NOT NULL`);
      
      res.json({ screens: locs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get current screen status from Yodeck API
  app.get("/api/admin/yodeck-debug/status/:screenId", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      const { mapYodeckScreen, logYodeckScreenStructure } = await import("./services/yodeckScreenMapper");
      
      const fetchedAt = new Date().toISOString();
      const result = await yodeckRequest<any>(`/screens/${screenId}`);
      
      if (!result.ok) {
        return res.json({ 
          ok: false, 
          mode: "unknown", 
          isElevizionLayout: false, 
          error: result.error,
          fetchedAt,
        });
      }

      const raw = result.data;
      logYodeckScreenStructure(raw, `[DebugStatus] Screen ${screenId}`);
      const mapped = mapYodeckScreen(raw);
      
      // If mode is layout but layoutName is missing, fetch it
      let layoutName = mapped.layoutName;
      if (mapped.contentMode === "layout" && mapped.layoutId && !layoutName) {
        const layoutResult = await yodeckRequest<{ id: number; name: string }>(`/layouts/${mapped.layoutId}`);
        if (layoutResult.ok && layoutResult.data) {
          layoutName = layoutResult.data.name;
        }
      }
      
      // Convert to existing response format for compatibility
      const isElevizionLayout = layoutName?.startsWith("Elevizion") || false;
      
      res.json({
        ok: true,
        mode: mapped.contentMode,
        rawContentType: mapped.rawKeysUsed.contentModeValue,
        layoutId: mapped.layoutId,
        layoutName,
        playlistId: mapped.playlistId,
        playlistName: mapped.playlistName,
        isElevizionLayout,
        isOnline: mapped.isOnline,
        lastSeenOnline: mapped.lastSeenOnline,
        lastScreenshotAt: mapped.lastScreenshotAt,
        rawKeysUsed: mapped.rawKeysUsed,
        warnings: mapped.warnings,
        fetchedAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Force-fix endpoint: reuses existing logic with detailed action log
  app.post("/api/admin/yodeck-debug/force-fix", requireAdminAccess, async (req, res) => {
    try {
      const { screenId, locationId } = req.body;
      
      if (!screenId && !locationId) {
        return res.status(400).json({ error: "screenId or locationId is required" });
      }
      
      const { getScreenContentStatus, ensureScreenUsesElevizionLayout } = await import("./services/yodeckLayoutService");
      
      // Find locationId from screenId if not provided
      let locId = locationId;
      if (!locId && screenId) {
        const loc = await db.select({ id: locations.id })
          .from(locations)
          .where(eq(locations.yodeckDeviceId, screenId))
          .limit(1);
        if (!loc[0]) {
          return res.status(404).json({ error: "Screen not linked to any location" });
        }
        locId = loc[0].id;
      }
      
      // Get BEFORE state
      const loc = await db.select({
        yodeckDeviceId: locations.yodeckDeviceId,
        name: locations.name,
      }).from(locations).where(eq(locations.id, locId)).limit(1);
      
      if (!loc[0]?.yodeckDeviceId) {
        return res.status(404).json({ error: "Location has no linked screen" });
      }
      
      const actualScreenId = loc[0].yodeckDeviceId;
      const beforeState = await getScreenContentStatus(actualScreenId);
      
      console.log(`[YodeckDebug] Force-fix started for location ${locId}, screen ${actualScreenId}`);
      console.log(`[YodeckDebug] BEFORE: ${JSON.stringify(beforeState)}`);
      
      // Execute the fix (reuses existing logic)
      const result = await ensureScreenUsesElevizionLayout(locId);
      
      // Get AFTER state
      const afterState = await getScreenContentStatus(actualScreenId);
      
      console.log(`[YodeckDebug] AFTER: ${JSON.stringify(afterState)}`);
      console.log(`[YodeckDebug] Result: ok=${result.ok}, verified=${result.verified}`);
      
      // Determine final status
      let finalStatus: "PASS" | "FAIL" = "FAIL";
      let failReason: string | undefined;
      
      if (result.ok && result.verified) {
        if (afterState.mode === "layout" && afterState.isElevizionLayout) {
          finalStatus = "PASS";
        } else {
          failReason = `Mode=${afterState.mode}, Layout=${afterState.layoutName}, IsElevizion=${afterState.isElevizionLayout}`;
        }
      } else {
        failReason = result.error || "Unknown error";
      }
      
      res.json({
        locationId: locId,
        screenId: actualScreenId,
        locationName: loc[0].name,
        before: {
          mode: beforeState.mode,
          playlistName: beforeState.mode === "playlist" ? beforeState.layoutName : undefined,
          layoutName: beforeState.mode === "layout" ? beforeState.layoutName : undefined,
          layoutId: beforeState.layoutId,
          isElevizion: beforeState.isElevizionLayout,
          fetchedAt: new Date().toISOString(),
        },
        after: {
          mode: afterState.mode,
          playlistName: afterState.mode === "playlist" ? afterState.layoutName : undefined,
          layoutName: afterState.mode === "layout" ? afterState.layoutName : undefined,
          layoutId: afterState.layoutId,
          isElevizion: afterState.isElevizionLayout,
          fetchedAt: new Date().toISOString(),
        },
        actionLog: result.logs,
        finalStatus,
        failReason,
        screenshotTimestamp: result.screenshotTimestamp,
      });
    } catch (error: any) {
      console.error(`[YodeckDebug] Force-fix error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Sync endpoint: force refresh from Yodeck API and update screen status in DB
  app.post("/api/admin/yodeck-debug/sync", requireAdminAccess, async (req, res) => {
    try {
      const { yodeckPublishService } = await import("./services/yodeckPublishService");
      const { probeLayoutsSupport } = await import("./services/yodeckLayoutService");
      const { mapYodeckScreen } = await import("./services/yodeckScreenMapper");
      
      console.log("[YodeckDebug] Starting Yodeck sync...");
      
      // Force refresh layouts support probe
      await probeLayoutsSupport(true);
      
      // Get fresh screen/playlist counts from Yodeck
      const caps = await yodeckPublishService.getCapabilities();
      
      const token = process.env.YODECK_AUTH_TOKEN;
      let screenCount = 0;
      let layoutCount = 0;
      let playlistCount = 0;
      let screensUpdated = 0;
      
      if (token) {
        // Fetch all screens with full data
        const screensRes = await fetch("https://app.yodeck.com/api/v2/screens", {
          headers: { "Authorization": `Token ${token}` },
        });
        if (screensRes.ok) {
          const data = await screensRes.json() as { 
            count: number; 
            results: Array<{ 
              id: number; 
              name: string;
              state?: { online?: boolean; last_seen?: string };
              screen_content?: { source_type?: string; source_id?: number; source_name?: string };
            }> 
          };
          screenCount = data.count || 0;
          
          // Update each screen in our DB
          if (data.results) {
            const dbScreens = await storage.getScreens();
            
            for (const yodeckScreen of data.results) {
              const yodeckId = String(yodeckScreen.id);
              
              // Find matching screen in our DB
              const dbScreen = dbScreens.find(s => 
                s.yodeckPlayerId === yodeckId || 
                String(s.yodeckPlayerId) === yodeckId
              );
              
              if (dbScreen) {
                // Map Yodeck screen to get parsed status
                const mapped = mapYodeckScreen(yodeckScreen);
                
                // Determine online status
                const newStatus = mapped.isOnline === true ? "online" 
                  : mapped.isOnline === false ? "offline" 
                  : "unknown";
                
                // Parse lastSeen
                let lastSeenAt: Date | null = null;
                if (mapped.lastSeenOnline) {
                  try {
                    lastSeenAt = new Date(mapped.lastSeenOnline);
                  } catch {}
                }
                
                // Update screen in DB
                await storage.updateScreen(dbScreen.id, {
                  status: newStatus,
                  lastSeenAt: lastSeenAt || undefined,
                });
                screensUpdated++;
                
                console.log(`[YodeckDebug] Updated ${dbScreen.screenId}: status=${newStatus}, lastSeen=${lastSeenAt?.toISOString() || "-"}`);
              }
            }
          }
        }
        
        const layoutsRes = await fetch("https://app.yodeck.com/api/v2/layouts", {
          headers: { "Authorization": `Token ${token}` },
        });
        if (layoutsRes.ok) {
          const data = await layoutsRes.json() as { count: number };
          layoutCount = data.count || 0;
        }
        
        const playlistsRes = await fetch("https://app.yodeck.com/api/v2/playlists", {
          headers: { "Authorization": `Token ${token}` },
        });
        if (playlistsRes.ok) {
          const data = await playlistsRes.json() as { count: number };
          playlistCount = data.count || 0;
        }
      }
      
      const syncedAt = new Date().toISOString();
      console.log(`[YodeckDebug] Sync complete: ${screenCount} screens (${screensUpdated} updated), ${layoutCount} layouts, ${playlistCount} playlists`);
      
      res.json({
        syncedAt,
        screenCount,
        screensUpdated,
        layoutCount,
        playlistCount,
        capabilities: caps,
      });
    } catch (error: any) {
      console.error(`[YodeckDebug] Sync error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

  // Get last sync timestamp (stored in memory for now)
  app.get("/api/admin/yodeck-debug/last-sync", requireAdminAccess, async (req, res) => {
    try {
      // Return current time as placeholder - real impl would track actual sync
      res.json({ lastSyncAt: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // CANONICAL SCREEN STATUS ENDPOINT - Single source of truth for all UI pages
  // ============================================================================
  
  /**
   * GET /api/admin/canonical-screens
   * Returns live CanonicalScreenStatus for all screens from Yodeck API.
   * For cached DB data, UI pages should use /api/screens/with-business instead.
   */
  app.get("/api/admin/canonical-screens", requireAdminAccess, async (req, res) => {
    try {
      const { mapYodeckScreen } = await import("./services/yodeckScreenMapper");
      // Uses CanonicalScreenStatus interface from @shared/schema
      
      // Get all locations with Yodeck device IDs
      const locs = await db.select({
        id: locations.id,
        name: locations.name,
        yodeckDeviceId: locations.yodeckDeviceId,
      }).from(locations).where(sql`yodeck_device_id IS NOT NULL`);
      
      const token = process.env.YODECK_AUTH_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "No Yodeck token configured" });
      }
      
      // Fetch all screens from Yodeck
      const screensRes = await fetch("https://app.yodeck.com/api/v2/screens", {
        headers: { "Authorization": `Token ${token}` },
      });
      
      if (!screensRes.ok) {
        return res.status(500).json({ error: "Failed to fetch screens from Yodeck" });
      }
      
      const screensData = await screensRes.json();
      const yodeckScreens = Array.isArray(screensData) ? screensData : (screensData.results || []);
      
      // Create lookup from yodeck ID to location
      const yodeckIdToLocation = new Map<string, { id: string; name: string }>();
      for (const loc of locs) {
        if (loc.yodeckDeviceId) {
          yodeckIdToLocation.set(String(loc.yodeckDeviceId), { id: loc.id, name: loc.name });
        }
      }
      
      // Convert each screen to CanonicalScreenStatus
      // Type import for documentation - actual validation is structural
      type CanonicalScreenStatus = import("@shared/schema").CanonicalScreenStatus;
      const canonicalScreens: CanonicalScreenStatus[] = [];
      
      for (const raw of yodeckScreens) {
        const mapped = mapYodeckScreen(raw);
        const loc = yodeckIdToLocation.get(mapped.screenId);
        
        // Determine isElevizion based on sourceName
        const sourceName = mapped.layoutName || mapped.playlistName || null;
        const isElevizion = sourceName?.startsWith("Elevizion") || false;
        
        // Convert online status
        let onlineStatus: "online" | "offline" | "unknown" = "unknown";
        if (mapped.isOnline === true) onlineStatus = "online";
        else if (mapped.isOnline === false) onlineStatus = "offline";
        
        // Determine sourceId based on content mode
        // CRITICAL: Use mapped.playlistId when mode is playlist (fixes sourceId=null bug)
        let sourceId: string | null = null;
        if (mapped.contentMode === "layout") {
          sourceId = mapped.layoutId;
        } else if (mapped.contentMode === "playlist") {
          sourceId = mapped.playlistId;
        }
        
        // Log raw vs derived for debugging (one-time diagnostic)
        const rawSourceType = raw.screen_content?.source_type || null;
        const rawSourceId = raw.screen_content?.source_id || null;
        const rawSourceName = raw.screen_content?.source_name || null;
        console.log(`[CanonicalParse] player=${mapped.screenId} raw={source_type=${rawSourceType}, source_id=${rawSourceId}, source_name="${rawSourceName}"} derived={sourceType=${mapped.contentMode}, sourceId=${sourceId}, playlistId=${mapped.playlistId}, layoutId=${mapped.layoutId}}`);
        
        canonicalScreens.push({
          // locationId: Elevizion's location UUID or YODECK-{id} if not linked
          locationId: loc?.id || `YODECK-${mapped.screenId}`,
          // yodeckDeviceId: The numeric Yodeck screen ID
          yodeckDeviceId: mapped.screenId,
          screenName: loc?.name || mapped.screenName,
          sourceType: mapped.contentMode,
          sourceId,
          sourceName,
          isElevizion,
          onlineStatus,
          lastSeenAt: mapped.lastSeenOnline,
          _debug: {
            rawContentModeField: mapped.rawKeysUsed.contentModeValue || undefined,
            warnings: mapped.warnings.length > 0 ? mapped.warnings : undefined,
          },
        });
      }
      
      res.json({
        screens: canonicalScreens,
        total: canonicalScreens.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[CanonicalScreens] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // UNIFIED SCREEN CONTROL ENDPOINTS (Single control path)
  // ============================================================================
  
  /**
   * POST /api/admin/screens/:locationId/ensure-compliance
   * Ensures baseline + ads + Elevizion layout for a location
   */
  app.post("/api/admin/screens/:locationId/ensure-compliance", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureComplianceForLocation } = await import("./services/yodeckScreenContentService");
      
      console.log(`[EnsureCompliance] Starting for location: ${locationId}`);
      const result = await ensureComplianceForLocation(locationId);
      
      console.log(`[EnsureCompliance] Result: ${result.finalStatus}, fallbackUsed: ${result.fallbackUsed}`);
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[EnsureCompliance] Error:", error);
      res.status(500).json({ ok: false, error: error.message, logs: [] });
    }
  });

  /**
   * POST /api/admin/screens/:locationId/force-reset
   * Resets screen to empty playlist
   */
  app.post("/api/admin/screens/:locationId/force-reset", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { forceResetScreen } = await import("./services/yodeckScreenContentService");
      
      console.log(`[ForceReset] Starting for location: ${locationId}`);
      const result = await forceResetScreen(locationId);
      
      console.log(`[ForceReset] Result: ${result.finalStatus}, fallbackUsed: ${result.fallbackUsed}`);
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[ForceReset] Error:", error);
      res.status(500).json({ ok: false, error: error.message, logs: [] });
    }
  });

  /**
   * GET /api/admin/screens/:locationId/verify
   * Verify current screen state
   */
  app.get("/api/admin/screens/:locationId/verify", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { verifyLocation } = await import("./services/yodeckScreenContentService");
      
      const result = await verifyLocation(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[Verify] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================================================
  // PLAYLIST ITEMS MANAGEMENT - Make videos visible on screens
  // ============================================================================
  
  /**
   * GET /api/admin/locations/:locationId/playlist-summary
   * Get summary of BASE and ADS playlist items for a location
   */
  app.get("/api/admin/locations/:locationId/playlist-summary", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { getLocationPlaylistsSummary } = await import("./services/yodeckPlaylistItemsService");
      
      const result = await getLocationPlaylistsSummary(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[PlaylistSummary] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  /**
   * POST /api/admin/locations/:locationId/attach-media
   * Attach media to the ADS playlist for a location (makes video visible)
   */
  app.post("/api/admin/locations/:locationId/attach-media", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { mediaId } = req.body;
      
      if (!mediaId) {
        return res.status(400).json({ ok: false, error: "mediaId is required" });
      }
      
      const { ensureMediaUsedByLocation } = await import("./services/yodeckPlaylistItemsService");
      const result = await ensureMediaUsedByLocation(locationId, mediaId);
      res.json(result);
    } catch (error: any) {
      console.error("[AttachMedia] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  /**
   * POST /api/admin/screens/:locationId/push
   * Push screen content (trigger reload)
   */
  app.post("/api/admin/screens/:locationId/push", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      
      // Get location to find yodeckDeviceId
      const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
      
      if (!location || !location.yodeckDeviceId) {
        return res.status(404).json({ ok: false, error: "Location or device not found" });
      }
      
      const { pushScreen } = await import("./services/yodeckPlaylistItemsService");
      const result = await pushScreen(location.yodeckDeviceId);
      res.json(result);
    } catch (error: any) {
      console.error("[PushScreen] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ============================================================================
  // CANONICAL COMPLIANCE ENDPOINTS
  // ============================================================================
  
  /**
   * POST /api/admin/locations/:locationId/ensure-compliance
   * Ensure location is fully compliant with canonical model
   */
  app.post("/api/admin/locations/:locationId/ensure-compliance", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureLocationCompliance } = await import("./services/yodeckCanonicalService");
      const result = await ensureLocationCompliance(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[EnsureCompliance] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  /**
   * GET /api/admin/locations/:locationId/playlist-items
   * Get normalized playlist items for a location's playlists
   */
  app.get("/api/admin/locations/:locationId/playlist-items", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      
      const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
      if (!location) {
        return res.status(404).json({ ok: false, error: "Location not found" });
      }
      
      const { getPlaylistItems } = await import("./services/yodeckCanonicalService");
      
      const baseItems = location.yodeckBaselinePlaylistId 
        ? await getPlaylistItems(location.yodeckBaselinePlaylistId)
        : { ok: false, items: [], error: "No BASE playlist" };
      
      const adsItems = location.yodeckPlaylistId
        ? await getPlaylistItems(location.yodeckPlaylistId)
        : { ok: false, items: [], error: "No ADS playlist" };
      
      res.json({
        ok: true,
        locationId,
        locationName: location.name,
        base: {
          playlistId: location.yodeckBaselinePlaylistId,
          ok: baseItems.ok,
          items: baseItems.items,
          itemCount: baseItems.items.length,
          error: baseItems.error,
        },
        ads: {
          playlistId: location.yodeckPlaylistId,
          ok: adsItems.ok,
          items: adsItems.items,
          itemCount: adsItems.items.length,
          error: adsItems.error,
        },
      });
    } catch (error: any) {
      console.error("[PlaylistItems] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  /**
   * POST /api/admin/locations/:locationId/force-reset
   * Reset screen to empty, then restore to canonical settings
   */
  app.post("/api/admin/locations/:locationId/force-reset", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { forceResetScreen } = await import("./services/yodeckScreenContentService");
      
      console.log(`[ForceReset] Starting for location: ${locationId}`);
      const result = await forceResetScreen(locationId);
      
      console.log(`[ForceReset] Result: ${result.finalStatus}`);
      res.json(result);
    } catch (error: any) {
      console.error("[ForceReset] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  /**
   * POST /api/admin/locations/:locationId/ensure-content
   * MAIN CONTENT PIPELINE - ensures complete content including approved ads
   */
  app.post("/api/admin/locations/:locationId/ensure-content", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureLocationContent } = await import("./services/yodeckCanonicalService");
      
      console.log(`[EnsureContent] Starting for location: ${locationId}`);
      const result = await ensureLocationContent(locationId);
      
      console.log(`[EnsureContent] Result: ok=${result.ok}`);
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[EnsureContent] Error:", error);
      res.status(500).json({ ok: false, error: error.message, logs: [] });
    }
  });
  
  /**
   * POST /api/admin/locations/:locationId/link-latest-ad
   * Force link the most recent approved ad to ADS playlist
   */
  app.post("/api/admin/locations/:locationId/link-latest-ad", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { forceAppendLatestApprovedAd } = await import("./services/yodeckCanonicalService");
      
      console.log(`[LinkLatestAd] Starting for location: ${locationId}`);
      const result = await forceAppendLatestApprovedAd(locationId);
      
      console.log(`[LinkLatestAd] Result: ok=${result.ok}, added=${result.added}`);
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[LinkLatestAd] Error:", error);
      res.status(500).json({ ok: false, error: error.message, logs: [] });
    }
  });
  
  /**
   * GET /api/admin/locations/:locationId/approved-ads
   * Get list of approved ads for a location
   */
  app.get("/api/admin/locations/:locationId/approved-ads", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { findApprovedAdsForLocation } = await import("./services/yodeckCanonicalService");
      
      const result = await findApprovedAdsForLocation(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[ApprovedAds] Error:", error);
      res.status(500).json({ ok: false, ads: [], error: error.message, logs: [] });
    }
  });

  /**
   * GET /api/admin/ads-debug
   * Get all recent approved ads (global) for debugging
   */
  app.get("/api/admin/ads-debug", requireAdminAccess, async (req, res) => {
    try {
      const { getRecentApprovedAds } = await import("./services/yodeckCanonicalService");
      const result = await getRecentApprovedAds(20);
      res.json(result);
    } catch (error: any) {
      console.error("[AdsDebug] Error:", error);
      res.status(500).json({ ok: false, ads: [], error: error.message, logs: [] });
    }
  });

  /**
   * POST /api/admin/locations/:locationId/link-ad
   * Manually link a specific ad to a location's ADS playlist
   * Body: { adId: string }
   */
  app.post("/api/admin/locations/:locationId/link-ad", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { adId } = req.body;
      
      if (!adId) {
        return res.status(400).json({ ok: false, error: "adId is verplicht" });
      }
      
      const { linkAdToLocation } = await import("./services/yodeckCanonicalService");
      
      console.log(`[LinkAd] Koppelen ad ${adId} aan locatie ${locationId}...`);
      const result = await linkAdToLocation(adId, locationId);
      
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[LinkAd] Error:", error);
      res.status(500).json({ ok: false, error: error.message, logs: [] });
    }
  });
  
  /**
   * GET /api/admin/locations/:locationId/content-status
   * Get content status for a location (autopilot UI)
   */
  app.get("/api/admin/locations/:locationId/content-status", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { getContentStatus } = await import("./services/yodeckCanonicalService");
      
      const result = await getContentStatus(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[ContentStatus] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/autopilot/inspect/:locationId
   * Full diagnostic endpoint for autopilot troubleshooting
   * Returns complete state from DB + live Yodeck data
   */
  app.get("/api/admin/autopilot/inspect/:locationId", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { inspectLocationPlayback } = await import("./services/yodeckCanonicalService");
      
      const result = await inspectLocationPlayback(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[AutopilotInspect] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/cleanup-duplicates/:locationId
   * Find and cleanup duplicate playlists for a location
   */
  app.post("/api/admin/autopilot/cleanup-duplicates/:locationId", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { cleanupDuplicatePlaylists } = await import("./services/yodeckCanonicalService");
      
      const result = await cleanupDuplicatePlaylists(locationId);
      res.json(result);
    } catch (error: any) {
      console.error("[DuplicateCleanup] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/locations/:locationId/autopilot-repair
   * Run autopilot repair for a location
   */
  app.post("/api/admin/locations/:locationId/autopilot-repair", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureCanonicalSetupForLocation } = await import("./services/yodeckCanonicalService");
      
      console.log(`[AutopilotRepair] Starting for location: ${locationId}`);
      const result = await ensureCanonicalSetupForLocation(locationId);
      
      console.log(`[AutopilotRepair] Result: ok=${result.ok}, layoutAssigned=${result.layoutAssigned}, adsRepaired=${result.adsRepaired}`);
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[AutopilotRepair] Error:", error);
      res.status(500).json({ ok: false, error: error.message, logs: [] });
    }
  });

  /**
   * GET /api/admin/locations/needs-repair
   * Get all live locations that need autopilot repair
   */
  app.get("/api/admin/locations/needs-repair", requireAdminAccess, async (req, res) => {
    try {
      const { getLiveLocationsNeedingRepair } = await import("./services/yodeckCanonicalService");
      const result = await getLiveLocationsNeedingRepair();
      res.json({ ok: true, locations: result, count: result.length });
    } catch (error: any) {
      console.error("[NeedsRepair] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/yodeck/migrate-canonical
   * Migrate all linked locations to canonical model
   */
  app.post("/api/admin/yodeck/migrate-canonical", requireAdminAccess, async (req, res) => {
    try {
      const { migrateAllToCanonical } = await import("./services/yodeckCanonicalService");
      const result = await migrateAllToCanonical();
      res.json(result);
    } catch (error: any) {
      console.error("[MigrateCanonical] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // ============================================================================
  // RAW YODECK DEBUG ENDPOINTS - Direct API response for debugging
  // ============================================================================
  
  app.get("/api/admin/yodeck/raw/screens/:screenId", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      const { mapYodeckScreen, logYodeckScreenStructure } = await import("./services/yodeckScreenMapper");
      
      const fetchedAt = new Date().toISOString();
      const urlUsed = `/screens/${screenId}`;
      
      const result = await yodeckRequest<any>(urlUsed);
      
      if (!result.ok) {
        return res.status(502).json({ 
          ok: false, 
          fetchedAt, 
          urlUsed, 
          error: result.error 
        });
      }

      const raw = result.data;
      logYodeckScreenStructure(raw, `[RawDebug] Screen ${screenId}`);
      const mapped = mapYodeckScreen(raw);

      res.json({ 
        ok: true, 
        fetchedAt, 
        urlUsed,
        raw,
        mapped,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/admin/yodeck/raw/layouts/:layoutId", requireAdminAccess, async (req, res) => {
    try {
      const { layoutId } = req.params;
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      
      const fetchedAt = new Date().toISOString();
      const urlUsed = `/layouts/${layoutId}`;
      
      const result = await yodeckRequest<any>(urlUsed);
      
      if (!result.ok) {
        return res.status(502).json({ 
          ok: false, 
          fetchedAt, 
          urlUsed, 
          error: result.error 
        });
      }

      res.json({ 
        ok: true, 
        fetchedAt, 
        urlUsed,
        raw: result.data,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/admin/yodeck/raw/playlists/:playlistId", requireAdminAccess, async (req, res) => {
    try {
      const { playlistId } = req.params;
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      
      const fetchedAt = new Date().toISOString();
      const urlUsed = `/playlists/${playlistId}`;
      
      const result = await yodeckRequest<any>(urlUsed);
      
      if (!result.ok) {
        return res.status(502).json({ 
          ok: false, 
          fetchedAt, 
          urlUsed, 
          error: result.error 
        });
      }

      res.json({ 
        ok: true, 
        fetchedAt, 
        urlUsed,
        raw: result.data,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // =========================================================================
  // AUTOPILOT CONFIG ENDPOINTS
  // =========================================================================

  /**
   * GET /api/admin/autopilot/baseline-status
   * Alias for /api/admin/settings/baseline-status - Get baseline playlist status
   */
  app.get("/api/admin/autopilot/baseline-status", requireAdminAccess, async (req, res) => {
    try {
      const { getBaselinePlaylistStatus } = await import("./services/screenPlaylistService");
      const status = await getBaselinePlaylistStatus();
      res.json(status);
    } catch (error: any) {
      console.error("[AutopilotBaselineStatus] Error:", error);
      res.status(500).json({ 
        configured: false, 
        playlistId: null, 
        playlistName: null,
        itemCount: 0,
        items: [],
        lastCheckedAt: new Date().toISOString(),
        error: error.message 
      });
    }
  });

  /**
   * GET /api/admin/autopilot/config
   * Get all Yodeck autopilot configuration
   */
  app.get("/api/admin/autopilot/config", requireAdminAccess, async (req, res) => {
    try {
      const { getAllYodeckConfig, getSelfAdMediaId } = await import("./services/yodeckAutopilotConfig");
      const config = await getAllYodeckConfig();
      res.json({ ok: true, config });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/config/self-ad
   * Set the self-ad media ID
   */
  app.post("/api/admin/autopilot/config/self-ad", requireAdminAccess, async (req, res) => {
    try {
      const { mediaId } = req.body;
      if (!mediaId || isNaN(parseInt(mediaId))) {
        return res.status(400).json({ ok: false, error: "Valid mediaId required" });
      }
      
      const { setSelfAdMediaId } = await import("./services/yodeckAutopilotConfig");
      await setSelfAdMediaId(parseInt(mediaId));
      res.json({ ok: true, message: `Self-ad media ID set to ${mediaId}` });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/config/layout-region
   * Set the ADS region ID for a layout
   */
  app.post("/api/admin/autopilot/config/layout-region", requireAdminAccess, async (req, res) => {
    try {
      const { layoutId, regionId } = req.body;
      if (!layoutId || isNaN(parseInt(layoutId))) {
        return res.status(400).json({ ok: false, error: "Valid layoutId required" });
      }
      if (regionId === undefined || isNaN(parseInt(regionId))) {
        return res.status(400).json({ ok: false, error: "Valid regionId required" });
      }
      
      const { setLayoutAdsRegionId } = await import("./services/yodeckAutopilotConfig");
      await setLayoutAdsRegionId(parseInt(layoutId), parseInt(regionId));
      res.json({ ok: true, message: `Layout ${layoutId} ADS region set to ${regionId}` });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/autopilot/layout/:layoutId/regions
   * Get layout regions for mapping configuration
   */
  app.get("/api/admin/autopilot/layout/:layoutId/regions", requireAdminAccess, async (req, res) => {
    try {
      const { layoutId } = req.params;
      const { getLayoutRegions } = await import("./services/yodeckAutopilotHelpers");
      const result = await getLayoutRegions(parseInt(layoutId));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/ensure-ads-region/:layoutId
   * Ensure ADS region is bound to a playlist
   */
  app.post("/api/admin/autopilot/ensure-ads-region/:layoutId", requireAdminAccess, async (req, res) => {
    try {
      const { layoutId } = req.params;
      const { playlistId } = req.body;
      
      if (!playlistId || isNaN(parseInt(playlistId))) {
        return res.status(400).json({ ok: false, error: "Valid playlistId required" });
      }
      
      const { ensureAdsRegionBound } = await import("./services/yodeckAutopilotHelpers");
      const result = await ensureAdsRegionBound(parseInt(layoutId), parseInt(playlistId));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/seed-playlist/:playlistId
   * Seed an empty playlist with self-ad
   */
  app.post("/api/admin/autopilot/seed-playlist/:playlistId", requireAdminAccess, async (req, res) => {
    try {
      const { playlistId } = req.params;
      const { ensureAdsPlaylistSeeded } = await import("./services/yodeckAutopilotHelpers");
      const result = await ensureAdsPlaylistSeeded(parseInt(playlistId));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/verify-screen/:screenId
   * Full verification of screen content setup
   */
  app.post("/api/admin/autopilot/verify-screen/:screenId", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      const { verifyScreenSetup } = await import("./services/yodeckAutopilotHelpers");
      const result = await verifyScreenSetup(parseInt(screenId));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/full-repair/:locationId
   * Full autopilot repair for a location
   */
  app.post("/api/admin/autopilot/full-repair/:locationId", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { performFullLocationRepair } = await import("./services/yodeckAutopilotService");
      const result = await performFullLocationRepair(locationId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // =========================================================================
  // COMBINED PLAYLIST MODE ENDPOINTS (NEW ARCHITECTURE)
  // =========================================================================

  /**
   * GET /api/admin/autopilot/combined-config
   * Get combined playlist autopilot configuration
   */
  app.get("/api/admin/autopilot/combined-config", requireAdminAccess, async (req, res) => {
    try {
      const { getBasePlaylistId } = await import("./services/combinedPlaylistService");
      const basePlaylistId = await getBasePlaylistId();
      res.json({ 
        ok: true, 
        config: {
          basePlaylistId,
          mode: "combined_playlist",
        }
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/combined-config
   * Set combined playlist configuration
   */
  app.post("/api/admin/autopilot/combined-config", requireAdminAccess, async (req, res) => {
    try {
      const { basePlaylistId } = req.body;
      if (!basePlaylistId) {
        return res.status(400).json({ ok: false, error: "basePlaylistId required" });
      }
      
      const { setBasePlaylistId } = await import("./services/combinedPlaylistService");
      await setBasePlaylistId(String(basePlaylistId));
      res.json({ ok: true, message: `Base playlist ID set to ${basePlaylistId}` });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/repair/:locationId
   * Force combined playlist sync + assign for a location
   */
  app.post("/api/admin/autopilot/repair/:locationId", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureCombinedPlaylistForLocation } = await import("./services/combinedPlaylistService");
      const result = await ensureCombinedPlaylistForLocation(locationId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/locations/:id/content-status
   * Get combined playlist content status for a location
   */
  app.get("/api/admin/locations/:id/content-status", requireAdminAccess, async (req, res) => {
    try {
      const { id } = req.params;
      const { getLocationContentStatus } = await import("./services/combinedPlaylistService");
      const status = await getLocationContentStatus(id);
      res.json({ ok: true, ...status });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // =========================================================================
  // AUTOPILOT: BASELINE FROM TEMPLATE
  // =========================================================================

  /**
   * GET /api/admin/autopilot/config
   * Get full autopilot configuration including baseTemplatePlaylistId
   */
  app.get("/api/admin/autopilot/config", requireAdminAccess, async (req, res) => {
    try {
      const { getAutopilotConfigStatus } = await import("./services/combinedPlaylistService");
      const config = await getAutopilotConfigStatus();
      res.json({ ok: true, config });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/config
   * Set autopilot configuration (baseTemplatePlaylistId)
   */
  app.post("/api/admin/autopilot/config", requireAdminAccess, async (req, res) => {
    try {
      const { baseTemplatePlaylistId } = req.body;
      
      if (!baseTemplatePlaylistId) {
        return res.status(400).json({ ok: false, error: "baseTemplatePlaylistId required" });
      }
      
      const { setBaseTemplatePlaylistId, getPlaylistById } = await import("./services/combinedPlaylistService");
      const { getPlaylistById: fetchPlaylist } = await import("./services/yodeckPlaylistItemsService");
      
      // Validate the playlist exists
      const validateResult = await fetchPlaylist(String(baseTemplatePlaylistId));
      if (!validateResult.ok) {
        return res.status(400).json({ ok: false, error: `Playlist ${baseTemplatePlaylistId} not found in Yodeck` });
      }
      
      await setBaseTemplatePlaylistId(String(baseTemplatePlaylistId));
      res.json({ 
        ok: true, 
        message: `Base template playlist ID set to ${baseTemplatePlaylistId}`,
        playlistName: validateResult.playlist?.name,
        itemCount: validateResult.playlist?.items?.length || 0,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/sync-baseline/:locationId
   * Sync a location's baseline playlist from template (if empty)
   */
  app.post("/api/admin/autopilot/sync-baseline/:locationId", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { ensureBaselineFromTemplate } = await import("./services/combinedPlaylistService");
      const result = await ensureBaselineFromTemplate(locationId);
      
      // Log to console for visibility
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/admin/yodeck/debug/template-baseline/:locationId
   * Debug endpoint: compare template items vs baseline items for a location
   */
  app.get("/api/admin/yodeck/debug/template-baseline/:locationId", requireAdminAccess, async (req, res) => {
    try {
      const { locationId } = req.params;
      const { getTemplateBaselineDiff } = await import("./services/combinedPlaylistService");
      const diff = await getTemplateBaselineDiff(locationId);
      res.json(diff);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/admin/autopilot/sync-all-baselines
   * Sync all live locations' baselines from template
   */
  app.post("/api/admin/autopilot/sync-all-baselines", requireAdminAccess, async (req, res) => {
    try {
      const { ensureBaselineFromTemplate } = await import("./services/combinedPlaylistService");
      
      // Get all live locations
      const liveLocations = await db.select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(
          sql`(${locations.status} = 'active' OR ${locations.readyForAds} = true)`
        );
      
      const results: Array<{ locationId: string; locationName: string; ok: boolean; itemsSynced: boolean; baselineItemCount: number; error?: string }> = [];
      
      for (const loc of liveLocations) {
        const result = await ensureBaselineFromTemplate(loc.id);
        result.logs.forEach(log => console.log(log));
        results.push({
          locationId: loc.id,
          locationName: loc.name,
          ok: result.ok,
          itemsSynced: result.itemsSynced,
          baselineItemCount: result.baselineItemCount,
          error: result.error,
        });
      }
      
      const syncedCount = results.filter(r => r.itemsSynced).length;
      const okCount = results.filter(r => r.ok).length;
      
      res.json({
        ok: true,
        message: `Synced ${syncedCount} baselines, ${okCount}/${liveLocations.length} locations OK`,
        results,
      });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // =========================================================================
  // SCREEN REPAIR & NOW PLAYING (PER-SCREEN PLAYLIST ARCHITECTURE)
  // =========================================================================

  /**
   * POST /api/admin/screens/:screenId/repair
   * Full repair cycle: ensureScreenPlaylist → assignAndPush → verify
   */
  app.post("/api/admin/screens/:screenId/repair", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      const { repairScreen } = await import("./services/screenPlaylistService");
      
      console.log(`[ScreenRepair] Starting repair for screen: ${screenId}`);
      const result = await repairScreen(screenId);
      
      result.logs.forEach(log => console.log(log));
      console.log(`[ScreenRepair] Result: ok=${result.ok}, publishOk=${result.publishOk}, verificationOk=${result.verificationOk}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("[ScreenRepair] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/screens/:screenId/now-playing
   * Get what's currently playing on a screen
   */
  app.get("/api/screens/:screenId/now-playing", requirePermission("view_screens"), async (req, res) => {
    try {
      const { screenId } = req.params;
      const { getScreenNowPlaying } = await import("./services/screenPlaylistService");
      const result = await getScreenNowPlaying(screenId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /api/screens/:screenId/device-status
   * Get unified device status (single source of truth for online/offline)
   */
  app.get("/api/screens/:screenId/device-status", requirePermission("view_screens"), async (req, res) => {
    try {
      const { screenId } = req.params;
      const { getYodeckDeviceStatus } = await import("./services/unifiedDeviceStatusService");
      const status = await getYodeckDeviceStatus(screenId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message, status: "OFFLINE" });
    }
  });

  /**
   * POST /api/screens/:screenId/refresh-screenshot
   * Force refresh screenshot from Yodeck and store hash/size
   */
  app.post("/api/screens/:screenId/refresh-screenshot", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      
      // Get screen with Yodeck player ID
      const [screen] = await db.select({
        id: screens.id,
        yodeckPlayerId: screens.yodeckPlayerId,
        yodeckScreenshotUrl: screens.yodeckScreenshotUrl,
        yodeckScreenshotHash: screens.yodeckScreenshotHash,
      }).from(screens).where(eq(screens.id, screenId));
      
      if (!screen || !screen.yodeckPlayerId) {
        return res.status(404).json({ ok: false, error: "Screen not found or not linked to Yodeck" });
      }
      
      // Fetch fresh screenshot URL from Yodeck
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      const yodeckScreen = await yodeckRequest<any>(`/screens/${screen.yodeckPlayerId}/`);
      
      if (!yodeckScreen.ok || !yodeckScreen.data) {
        return res.json({ ok: false, error: "Could not fetch Yodeck screen data" });
      }
      
      const screenshotUrl = yodeckScreen.data.screenshot_url;
      
      if (!screenshotUrl) {
        return res.json({ ok: false, error: "No screenshot URL available from Yodeck" });
      }
      
      // Fetch screenshot and compute hash
      let byteSize = 0;
      let newHash: string | null = null;
      
      try {
        const response = await fetch(screenshotUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          byteSize = buffer.byteLength;
          
          // Compute simple hash
          const crypto = await import("crypto");
          newHash = crypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex").substring(0, 16);
        }
      } catch (fetchErr: any) {
        console.error("[RefreshScreenshot] Fetch error:", fetchErr.message);
      }
      
      const previousHash = screen.yodeckScreenshotHash;
      const hashChanged = previousHash !== newHash && newHash !== null;
      
      // Update DB
      await db.update(screens).set({
        yodeckScreenshotUrl: screenshotUrl,
        yodeckScreenshotByteSize: byteSize,
        yodeckScreenshotHash: newHash,
        yodeckScreenshotLastOkAt: byteSize > 0 ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(screens.id, screenId));
      
      res.json({
        ok: true,
        screenshotUrl,
        byteSize,
        hash: newHash,
        previousHash,
        hashChanged,
        lastOkAt: byteSize > 0 ? new Date().toISOString() : null,
      });
    } catch (error: any) {
      console.error("[RefreshScreenshot] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/screens/:screenId/repair-and-proof
   * Force repair screen + verify + refresh screenshot = complete proof cycle
   */
  app.post("/api/screens/:screenId/repair-and-proof", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      const logs: string[] = [];
      
      logs.push(`[RepairAndProof] Starting repair cycle for screen ${screenId}`);
      
      // 1. Run repair (sync combined playlist)
      const { syncScreenCombinedPlaylist, getScreenNowPlaying } = await import("./services/screenPlaylistService");
      const repairResult = await syncScreenCombinedPlaylist(screenId);
      logs.push(`[RepairAndProof] Repair completed: ok=${repairResult.ok}, items=${repairResult.itemCount}`);
      
      if (!repairResult.ok) {
        return res.json({
          ok: false,
          phase: "repair",
          error: repairResult.errorReason,
          logs,
        });
      }
      
      // 2. Wait briefly for Yodeck to process (3 seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 3. Verify content
      const nowPlaying = await getScreenNowPlaying(screenId);
      logs.push(`[RepairAndProof] Verification: ok=${nowPlaying.ok}, items=${nowPlaying.itemCount}`);
      
      // 4. Get screen for screenshot data
      const [screen] = await db.select({
        yodeckPlayerId: screens.yodeckPlayerId,
        yodeckScreenshotUrl: screens.yodeckScreenshotUrl,
        yodeckScreenshotHash: screens.yodeckScreenshotHash,
      }).from(screens).where(eq(screens.id, screenId));
      
      // 5. Refresh screenshot
      let screenshotResult = { ok: false as boolean, hash: null as string | null, hashChanged: false, byteSize: 0 };
      
      if (screen?.yodeckPlayerId) {
        const { yodeckRequest } = await import("./services/yodeckLayoutService");
        const yodeckScreen = await yodeckRequest<any>(`/screens/${screen.yodeckPlayerId}/`);
        
        if (yodeckScreen.ok && yodeckScreen.data?.screenshot_url) {
          try {
            const response = await fetch(yodeckScreen.data.screenshot_url);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              const byteSize = buffer.byteLength;
              const crypto = await import("crypto");
              const newHash = crypto.createHash("sha256").update(Buffer.from(buffer)).digest("hex").substring(0, 16);
              
              const previousHash = screen.yodeckScreenshotHash;
              screenshotResult = {
                ok: true,
                hash: newHash,
                hashChanged: previousHash !== newHash && newHash !== null,
                byteSize,
              };
              
              // Update DB
              await db.update(screens).set({
                yodeckScreenshotUrl: yodeckScreen.data.screenshot_url,
                yodeckScreenshotByteSize: byteSize,
                yodeckScreenshotHash: newHash,
                yodeckScreenshotLastOkAt: byteSize > 0 ? new Date() : null,
                updatedAt: new Date(),
              }).where(eq(screens.id, screenId));
              
              logs.push(`[RepairAndProof] Screenshot: hash=${newHash}, changed=${screenshotResult.hashChanged}, size=${byteSize}bytes`);
            }
          } catch (fetchErr: any) {
            logs.push(`[RepairAndProof] Screenshot fetch error: ${fetchErr.message}`);
          }
        }
      }
      
      // 6. Determine proof status
      const isOnline = nowPlaying.deviceStatus?.isOnline ?? false;
      const hasContent = nowPlaying.itemCount > 0;
      const hasScreenshot = screenshotResult.ok && screenshotResult.byteSize > 5000;
      
      const proofOk = isOnline && hasContent && hasScreenshot;
      
      res.json({
        ok: proofOk,
        repair: {
          ok: repairResult.ok,
          playlistId: repairResult.activePlaylistId,
          itemCount: repairResult.itemCount,
          baselineCount: repairResult.baselineCount,
          adsCount: repairResult.adsCount,
        },
        verification: {
          ok: nowPlaying.ok,
          playlistId: nowPlaying.playlistId,
          itemCount: nowPlaying.itemCount,
          baselineCount: nowPlaying.baselineCount,
          adsCount: nowPlaying.adsCount,
          verificationOk: nowPlaying.verificationOk,
        },
        screenshot: screenshotResult,
        proof: {
          ok: proofOk,
          isOnline,
          hasContent,
          hasScreenshot,
          reason: !proofOk 
            ? (!isOnline ? "Device offline" : !hasContent ? "Playlist empty" : "Screenshot not available")
            : "All checks passed",
        },
        logs,
      });
    } catch (error: any) {
      console.error("[RepairAndProof] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * POST /api/screens/:screenId/force-repair-proof
   * PRODUCTION-GRADE Force Repair + Proof - Complete E2E cycle with polling
   * 
   * Guarantees:
   * 1. Screen is set to PLAYLIST mode (not layout/schedule)
   * 2. Active playlist contains baseline + ads
   * 3. Polls for screenshot proof up to 6 times with backoff
   * 4. Detects "NO CONTENT TO PLAY" in screenshot
   * 
   * Returns complete diagnostics object
   */
  app.post("/api/screens/:screenId/force-repair-proof", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      console.log(`[ForceRepairProof] Starting full E2E cycle for screen ${screenId}`);
      
      const { forceRepairAndProof } = await import("./services/screenPlaylistService");
      const result = await forceRepairAndProof(screenId);
      
      // Log result
      console.log(`[ForceRepairProof] Result: ok=${result.ok}, proof=${result.proofStatus.ok}, reason=${result.proofStatus.reason}`);
      result.logs.forEach(log => console.log(log));
      
      res.json(result);
    } catch (error: any) {
      console.error("[ForceRepairProof] Error:", error);
      res.status(500).json({ 
        ok: false, 
        proofStatus: {
          ok: false,
          isOnline: false,
          hasContent: false,
          hasScreenshot: false,
          detectedNoContent: false,
          reason: `ERROR: ${error.message}`,
        },
        error: error.message 
      });
    }
  });

  /**
   * POST /api/screens/:screenId/push-to-screen
   * PRODUCTION-GRADE Push To Screen - Ensures player has assigned playlist with content
   * 
   * NON-NEGOTIABLE OUTCOME:
   * 1. Yodeck player MUST have screen_content.source_type="playlist"
   * 2. Yodeck player MUST have screen_content.source_id = correct Elevizion loop playlist id
   * 3. Player refreshes/syncs so it starts playing
   * 4. Screenshot proof updates and shows actual content (not "NO CONTENT TO PLAY")
   * 
   * Returns complete diagnostics with verification
   */
  app.post("/api/screens/:screenId/push-to-screen", requireAdminAccess, async (req, res) => {
    try {
      const { screenId } = req.params;
      console.log(`[PushToScreen] ═══════════════════════════════════════════════`);
      console.log(`[PushToScreen] Starting push for screen ${screenId}`);
      console.log(`[PushToScreen] Timestamp: ${new Date().toISOString()}`);
      
      // Import required functions
      const { 
        getActiveSourceFromYodeck, 
        ensureScreenPlaysPlaylist, 
        syncScreenCombinedPlaylist,
        refreshScreenPlayback,
        fetchScreenshotProof 
      } = await import("./services/screenPlaylistService");
      
      // Resolve screen to get yodeckPlayerId
      const [screen] = await db.select({ 
        id: screens.id, 
        name: screens.name,
        yodeckPlayerId: screens.yodeckPlayerId 
      })
      .from(screens)
      .where(eq(screens.id, screenId));
      
      if (!screen) {
        return res.status(404).json({ ok: false, error: "Screen not found" });
      }
      
      if (!screen.yodeckPlayerId) {
        return res.status(400).json({ ok: false, error: "Screen has no Yodeck player linked" });
      }
      
      const playerId = screen.yodeckPlayerId;
      console.log(`[PushToScreen] Screen "${screen.name}" -> Player ${playerId}`);
      
      const logs: string[] = [];
      logs.push(`[PushToScreen] Screen: ${screen.name}, Player: ${playerId}`);
      
      // STEP 1: Get current source (BEFORE)
      console.log(`[PushToScreen] STEP 1: Reading current source (BEFORE)...`);
      const beforeSource = await getActiveSourceFromYodeck(playerId);
      logs.push(`[PushToScreen] BEFORE: source_type=${beforeSource.data?.sourceType}, source_id=${beforeSource.data?.sourceId}`);
      
      // STEP 2: Ensure playlist is assigned
      console.log(`[PushToScreen] STEP 2: Ensuring playlist is assigned...`);
      const enforceResult = await ensureScreenPlaysPlaylist(playerId, screenId);
      logs.push(...enforceResult.logs);
      
      if (!enforceResult.ok) {
        console.log(`[PushToScreen] FAILED at enforce: ${enforceResult.error}`);
        return res.json({
          ok: false,
          playerId,
          beforeSource: beforeSource.data,
          afterSource: null,
          activePlaylistId: null,
          playlistItemCount: 0,
          baselineCount: 0,
          adsCount: 0,
          refreshMethodUsed: null,
          screenshot: null,
          proofStatus: { ok: false, reason: `ENFORCE_FAILED: ${enforceResult.error}` },
          logs,
        });
      }
      
      const activePlaylistId = enforceResult.playlistId;
      logs.push(`[PushToScreen] Playlist assigned: ${activePlaylistId}`);
      
      // STEP 3: Fill playlist with baseline + ads
      console.log(`[PushToScreen] STEP 3: Filling playlist with content...`);
      const syncResult = await syncScreenCombinedPlaylist(screenId);
      logs.push(...syncResult.logs);
      
      // STEP 4: Refresh player to force sync
      console.log(`[PushToScreen] STEP 4: Refreshing player...`);
      const refreshResult = await refreshScreenPlayback(playerId, activePlaylistId);
      logs.push(...refreshResult.logs);
      
      // STEP 5: Get current source (AFTER)
      console.log(`[PushToScreen] STEP 5: Reading current source (AFTER)...`);
      const afterSource = await getActiveSourceFromYodeck(playerId);
      logs.push(`[PushToScreen] AFTER: source_type=${afterSource.data?.sourceType}, source_id=${afterSource.data?.sourceId}`);
      
      // STEP 6: Poll for screenshot proof (max 6 attempts over ~60s)
      console.log(`[PushToScreen] STEP 6: Polling for screenshot proof...`);
      const pollDelays = [5000, 5000, 10000, 10000, 15000, 15000];
      let screenshotResult: Awaited<ReturnType<typeof fetchScreenshotProof>> | null = null;
      let pollAttempts = 0;
      
      // Get screenshot URL from Yodeck API
      const yodeckRequest = (await import("./services/yodeckLayoutService")).yodeckRequest;
      const screenData = await yodeckRequest<any>(`/screens/${playerId}/`);
      let screenshotUrl = screenData.data?.screenshot_path || null;
      logs.push(`[PushToScreen] Screenshot URL: ${screenshotUrl || "NOT AVAILABLE"}`);
      
      for (let i = 0; i < pollDelays.length; i++) {
        pollAttempts++;
        logs.push(`[ProofPoll] Attempt ${pollAttempts}/${pollDelays.length}, waiting ${pollDelays[i]}ms...`);
        await new Promise(r => setTimeout(r, pollDelays[i]));
        
        if (screenshotUrl) {
          screenshotResult = await fetchScreenshotProof(screenId, screenshotUrl);
          logs.push(`[ProofPoll] Result: ok=${screenshotResult?.ok}, size=${screenshotResult?.byteSize}, noContent=${screenshotResult?.detectedNoContent}`);
          
          // Stop early if we got a valid screenshot that doesn't show NO CONTENT
          if (screenshotResult?.ok && screenshotResult?.byteSize && screenshotResult.byteSize > 3000 && !screenshotResult.detectedNoContent) {
            logs.push(`[ProofPoll] ✓ Valid screenshot proof obtained!`);
            break;
          }
        } else {
          logs.push(`[ProofPoll] ✗ No screenshot URL available`);
        }
      }
      
      // Build proof status
      const hasScreenshot = screenshotResult?.ok && screenshotResult?.byteSize ? screenshotResult.byteSize > 0 : false;
      const detectedNoContent = screenshotResult?.detectedNoContent || false;
      const sourceOk = afterSource.data?.sourceType === "playlist" && afterSource.data?.sourceId != null;
      
      const proofStatus = {
        ok: sourceOk && hasScreenshot && !detectedNoContent,
        sourceType: afterSource.data?.sourceType || null,
        sourceId: afterSource.data?.sourceId || null,
        hasScreenshot,
        detectedNoContent,
        reason: !sourceOk 
          ? `SOURCE_NOT_PLAYLIST: source_type=${afterSource.data?.sourceType}, source_id=${afterSource.data?.sourceId}`
          : detectedNoContent
            ? "Yodeck shows NO CONTENT TO PLAY"
            : !hasScreenshot
              ? "No screenshot available"
              : "All checks passed",
      };
      
      console.log(`[PushToScreen] ═══════════════════════════════════════════════`);
      console.log(`[PushToScreen] RESULT: ok=${proofStatus.ok}, reason=${proofStatus.reason}`);
      console.log(`[PushToScreen] Items: ${syncResult.itemCount} (baseline: ${syncResult.baselineCount}, ads: ${syncResult.adsCount})`);
      
      res.json({
        ok: proofStatus.ok,
        playerId,
        beforeSource: {
          sourceType: beforeSource.data?.sourceType,
          sourceId: beforeSource.data?.sourceId,
          sourceName: beforeSource.data?.sourceName,
        },
        afterSource: {
          sourceType: afterSource.data?.sourceType,
          sourceId: afterSource.data?.sourceId,
          sourceName: afterSource.data?.sourceName,
        },
        activePlaylistId,
        playlistItemCount: syncResult.itemCount,
        baselineCount: syncResult.baselineCount,
        adsCount: syncResult.adsCount,
        refreshMethodUsed: refreshResult.method,
        pollAttempts,
        screenshot: screenshotResult ? {
          url: screenshotResult.url,
          byteSize: screenshotResult.byteSize,
          hash: screenshotResult.hash,
          detectedNoContent: screenshotResult.detectedNoContent,
          lastOkAt: screenshotResult.lastOkAt,
        } : null,
        proofStatus,
        logs,
      });
    } catch (error: any) {
      console.error("[PushToScreen] Error:", error);
      res.status(500).json({ 
        ok: false, 
        proofStatus: {
          ok: false,
          reason: `ERROR: ${error.message}`,
        },
        error: error.message 
      });
    }
  });

  /**
   * POST /api/screens/:screenId/force-push
   * PRODUCTION-GRADE Force Push & Verify - Guarantees Yodeck player plays the intended playlist
   * 
   * This is a SURGICAL fix for playback mismatch issues. Steps:
   * A) Resolve player and targetPlaylistId
   * B) Hard-assert Yodeck player's active source (PATCH if needed)
   * C) Ensure playlist is not empty (seed if needed)
   * D) Trigger player refresh/sync
   * E) Fetch screenshot BYTES with cache busting and store metadata
   */
  app.post("/api/screens/:screenId/force-push", requireAdminAccess, async (req, res) => {
    const logs: string[] = [];
    const log = (msg: string) => {
      console.log(msg);
      logs.push(msg);
    };
    
    try {
      const { screenId } = req.params;
      log(`[ForcePush] ═══════════════════════════════════════════════════════════`);
      log(`[ForcePush] Starting force-push for screen ${screenId}`);
      log(`[ForcePush] Timestamp: ${new Date().toISOString()}`);
      
      const { yodeckRequest } = await import("./services/yodeckLayoutService");
      const crypto = await import("crypto");
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP A: Resolve player and targetPlaylistId
      // ═══════════════════════════════════════════════════════════════════════
      log(`[ForcePush] STEP A: Resolving player and target playlist...`);
      
      const [screen] = await db.select({
        id: screens.id,
        name: screens.name,
        yodeckPlayerId: screens.yodeckPlayerId,
        yodeckContentSummary: screens.yodeckContentSummary,
        yodeckScreenshotUrl: screens.yodeckScreenshotUrl,
      })
      .from(screens)
      .where(eq(screens.id, screenId));
      
      if (!screen) {
        return res.status(404).json({ ok: false, error: "Screen not found", logs });
      }
      
      const playerId = screen.yodeckPlayerId;
      if (!playerId) {
        return res.status(400).json({ ok: false, error: "Screen has no Yodeck player linked", logs });
      }
      
      log(`[ForcePush] Screen: "${screen.name}" -> Player: ${playerId}`);
      
      // Extract cached sourceId from yodeckContentSummary if available
      const cachedSourceId = (screen.yodeckContentSummary as any)?.sourceId 
        ? String((screen.yodeckContentSummary as any).sourceId) 
        : null;
      
      // Determine targetPlaylistId:
      // 1. First try to get from current Yodeck screen config (LIVE)
      // 2. Fallback to cached sourceId from yodeckContentSummary
      let targetPlaylistId: string | null = null;
      
      // Fetch current player config from Yodeck (fresh, not cache)
      const playerResult = await yodeckRequest<any>(`/screens/${playerId}/`);
      if (!playerResult.ok || !playerResult.data) {
        return res.status(500).json({ ok: false, error: `Failed to fetch player: ${playerResult.error}`, logs });
      }
      
      const rawPlayer = playerResult.data;
      const screenContent = rawPlayer.screen_content || {};
      const currentSourceType = screenContent.source_type || null;
      const currentSourceId = screenContent.source_id ? String(screenContent.source_id) : null;
      
      log(`[ForcePush] Current player config: source_type=${currentSourceType}, source_id=${currentSourceId}`);
      
      // Prefer yodeck source_id if it's playlist mode, else fallback to cached
      if (currentSourceType === "playlist" && currentSourceId) {
        targetPlaylistId = currentSourceId;
        log(`[ForcePush] Using Yodeck source_id as target: ${targetPlaylistId}`);
      } else if (cachedSourceId) {
        targetPlaylistId = cachedSourceId;
        log(`[ForcePush] Using cached sourceId from yodeckContentSummary: ${targetPlaylistId}`);
      }
      
      if (!targetPlaylistId) {
        return res.status(400).json({ 
          ok: false, 
          error: "No target playlist found (neither Yodeck source_id nor cached yodeckContentSummary.sourceId)", 
          logs 
        });
      }
      
      log(`[ForcePush] Target playlist ID resolved: ${targetPlaylistId}`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP B: Hard-assert Yodeck player's active source (PATCH if needed)
      // ═══════════════════════════════════════════════════════════════════════
      log(`[ForcePush] STEP B: Hard-asserting player source...`);
      
      const beforeSource = { type: currentSourceType, id: currentSourceId };
      let afterSource = { type: currentSourceType, id: currentSourceId };
      let sourceUpdateNeeded = false;
      
      // Check if update needed
      if (currentSourceType !== "playlist" || currentSourceId !== targetPlaylistId) {
        sourceUpdateNeeded = true;
        log(`[ForcePush] Source update needed: current(${currentSourceType}/${currentSourceId}) → target(playlist/${targetPlaylistId})`);
        
        // PATCH the player to set correct source
        const patchPayload = {
          screen_content: {
            source_type: "playlist",
            source_id: Number(targetPlaylistId),
          }
        };
        
        log(`[ForcePush] PATCHing player ${playerId} with: ${JSON.stringify(patchPayload)}`);
        
        const patchResult = await yodeckRequest<any>(`/screens/${playerId}/`, {
          method: "PATCH",
          body: JSON.stringify(patchPayload),
        });
        
        if (!patchResult.ok) {
          return res.status(500).json({ 
            ok: false, 
            error: `Failed to PATCH player source: ${patchResult.error}`, 
            logs 
          });
        }
        
        // Immediately re-fetch to verify
        const verifyResult = await yodeckRequest<any>(`/screens/${playerId}/`);
        if (verifyResult.ok && verifyResult.data) {
          const newContent = verifyResult.data.screen_content || {};
          afterSource = {
            type: newContent.source_type || null,
            id: newContent.source_id ? String(newContent.source_id) : null,
          };
        }
        
        // Assert it matches
        if (afterSource.type !== "playlist" || afterSource.id !== targetPlaylistId) {
          log(`[ForcePush] WARNING: Source mismatch after PATCH! Expected playlist/${targetPlaylistId}, got ${afterSource.type}/${afterSource.id}`);
        } else {
          log(`[ForcePush] ✓ Source verified: ${afterSource.type}/${afterSource.id}`);
        }
      } else {
        log(`[ForcePush] ✓ Source already correct: ${currentSourceType}/${currentSourceId}`);
      }
      
      log(`[ForcePush] player=${playerId} desiredPlaylist=${targetPlaylistId} before={${beforeSource.type},${beforeSource.id}} after={${afterSource.type},${afterSource.id}} ok=${afterSource.type === "playlist" && afterSource.id === targetPlaylistId}`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP C: Ensure playlist is not empty (defensive)
      // ═══════════════════════════════════════════════════════════════════════
      log(`[ForcePush] STEP C: Checking playlist is not empty...`);
      
      const playlistResult = await yodeckRequest<any>(`/playlists/${targetPlaylistId}/`);
      if (!playlistResult.ok || !playlistResult.data) {
        return res.status(500).json({ 
          ok: false, 
          error: `Failed to fetch playlist ${targetPlaylistId}: ${playlistResult.error}`, 
          logs 
        });
      }
      
      const playlistData = playlistResult.data;
      const itemCountBefore = (playlistData.items || []).length;
      let itemCountAfter = itemCountBefore;
      
      log(`[ForcePush] Playlist "${playlistData.name}" has ${itemCountBefore} items`);
      
      if (itemCountBefore === 0) {
        log(`[ForcePush] Playlist is empty! Attempting to seed with baseline items...`);
        
        // Get baseline playlist items
        const { getBaselinePlaylistId } = await import("./services/screenPlaylistService");
        const baselineId = await getBaselinePlaylistId();
        
        if (baselineId) {
          const baselineResult = await yodeckRequest<any>(`/playlists/${baselineId}/`);
          if (baselineResult.ok && baselineResult.data?.items?.length > 0) {
            const baselineItems = baselineResult.data.items;
            log(`[ForcePush] Found ${baselineItems.length} baseline items to seed`);
            
            // Build items for PATCH
            const itemsToAdd = baselineItems.slice(0, 10).map((item: any) => ({
              media_id: item.media?.id || item.media_id,
              duration: item.duration || 15,
            })).filter((i: any) => i.media_id);
            
            if (itemsToAdd.length > 0) {
              const patchResult = await yodeckRequest<any>(`/playlists/${targetPlaylistId}/`, {
                method: "PATCH",
                body: JSON.stringify({ items: itemsToAdd }),
              });
              
              if (patchResult.ok) {
                // Re-fetch to get updated count
                const refetchResult = await yodeckRequest<any>(`/playlists/${targetPlaylistId}/`);
                if (refetchResult.ok) {
                  itemCountAfter = (refetchResult.data?.items || []).length;
                }
                log(`[ForcePush] Seeded playlist: ${itemCountBefore} → ${itemCountAfter} items`);
              } else {
                log(`[ForcePush] WARNING: Failed to seed playlist: ${patchResult.error}`);
              }
            }
          }
        } else {
          log(`[ForcePush] WARNING: No baseline playlist configured, cannot seed`);
        }
      }
      
      log(`[ForcePush] playlist=${targetPlaylistId} itemCountBefore=${itemCountBefore} itemCountAfter=${itemCountAfter}`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP D: Trigger player refresh/sync
      // ═══════════════════════════════════════════════════════════════════════
      log(`[ForcePush] STEP D: Triggering player refresh...`);
      
      let refreshMethod: "api_restart" | "toggle" = "toggle";
      let refreshOk = false;
      
      // Try API restart first
      const restartResult = await yodeckRequest<any>(`/screens/${playerId}/restart/`, {
        method: "POST",
      });
      
      if (restartResult.ok || restartResult.status === 204) {
        refreshMethod = "api_restart";
        refreshOk = true;
        log(`[ForcePush] ✓ Player restarted via API`);
      } else {
        // Fallback: toggle nudge (set source_id again, wait 2s)
        log(`[ForcePush] API restart failed (${restartResult.error}), using toggle nudge fallback...`);
        
        const togglePatch = {
          screen_content: {
            source_type: "playlist",
            source_id: Number(targetPlaylistId),
          }
        };
        
        await yodeckRequest<any>(`/screens/${playerId}/`, {
          method: "PATCH",
          body: JSON.stringify(togglePatch),
        });
        
        await new Promise(r => setTimeout(r, 2000));
        refreshOk = true;
        log(`[ForcePush] ✓ Toggle nudge complete`);
      }
      
      log(`[ForcePush] refresh method=${refreshMethod} ok=${refreshOk}`);
      
      // ═══════════════════════════════════════════════════════════════════════
      // STEP E: Fetch screenshot BYTES with cache busting and store metadata
      // ═══════════════════════════════════════════════════════════════════════
      log(`[ForcePush] STEP E: Fetching screenshot with cache busting...`);
      
      // Wait a bit for player to refresh
      await new Promise(r => setTimeout(r, 3000));
      
      // Re-fetch player to get latest screenshot URL
      const finalPlayerResult = await yodeckRequest<any>(`/screens/${playerId}/`);
      // Use Yodeck API screenshot_path, or fallback to cached URL from database
      let screenshotUrl = finalPlayerResult.data?.screenshot_path || screen.yodeckScreenshotUrl || null;
      
      let screenshot: {
        urlWithBuster: string | null;
        byteSize: number | null;
        hash: string | null;
        lastOkAt: string | null;
      } = {
        urlWithBuster: null,
        byteSize: null,
        hash: null,
        lastOkAt: null,
      };
      
      if (screenshotUrl) {
        // Add cache buster
        const cacheBuster = Date.now();
        const urlWithBuster = screenshotUrl.includes("?") 
          ? `${screenshotUrl}&t=${cacheBuster}`
          : `${screenshotUrl}?t=${cacheBuster}`;
        
        log(`[ForcePush] Fetching screenshot: ${urlWithBuster}`);
        
        try {
          const response = await fetch(urlWithBuster);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const bytes = Buffer.from(arrayBuffer);
            const byteSize = bytes.length;
            const hash = crypto.createHash("sha256").update(bytes).digest("hex");
            const lastOkAt = new Date().toISOString();
            
            screenshot = {
              urlWithBuster,
              byteSize,
              hash,
              lastOkAt,
            };
            
            log(`[ForcePush] Screenshot fetched: ${byteSize} bytes, hash=${hash.substring(0, 16)}...`);
            
            // Store metadata in database
            if (byteSize >= 10000) { // Only store if > 10KB
              await db.update(screens)
                .set({
                  yodeckScreenshotUrl: screenshotUrl,
                  yodeckScreenshotLastOkAt: new Date(),
                  yodeckScreenshotByteSize: byteSize,
                  yodeckScreenshotHash: hash,
                })
                .where(eq(screens.id, screenId));
              log(`[ForcePush] ✓ Screenshot metadata stored in DB`);
            } else {
              log(`[ForcePush] ⚠ Screenshot < 10KB (${byteSize}), may be placeholder - not storing`);
            }
          } else {
            log(`[ForcePush] ⚠ Screenshot fetch failed: HTTP ${response.status}`);
          }
        } catch (fetchError: any) {
          log(`[ForcePush] ⚠ Screenshot fetch error: ${fetchError.message}`);
        }
      } else {
        log(`[ForcePush] ⚠ No screenshot URL available`);
      }
      
      log(`[ForcePush] ═══════════════════════════════════════════════════════════`);
      
      // Core success: Steps A-D passed (source verified + playlist has items)
      const playbackOk = afterSource.type === "playlist" && 
                         afterSource.id === targetPlaylistId && 
                         itemCountAfter > 0;
      
      // Screenshot status: separate from playback success
      const screenshotOk = screenshot.byteSize !== null && screenshot.byteSize >= 10000;
      const screenshotMayBePlaceholder = screenshot.byteSize !== null && screenshot.byteSize < 10000;
      
      // Overall ok = playback verified (screenshot is informational, not blocking)
      const ok = playbackOk;
      
      const notes: string[] = [];
      if (playbackOk) {
        notes.push("player source verified");
        notes.push(`playlist has ${itemCountAfter} items`);
      }
      if (screenshotOk) {
        notes.push("screenshot fetched fresh");
      }
      if (screenshotMayBePlaceholder) {
        notes.push("screenshot may be placeholder (< 10KB)");
      }
      if (!screenshot.byteSize) {
        notes.push("screenshot not available");
      }
      
      res.json({
        ok,
        playerId,
        targetPlaylistId,
        playlistItemCount: itemCountAfter,
        refreshMethod,
        screenshot: {
          ...screenshot,
          ok: screenshotOk,
          mayBePlaceholder: screenshotMayBePlaceholder,
        },
        notes,
        logs,
      });
      
    } catch (error: any) {
      console.error("[ForcePush] Error:", error);
      res.status(500).json({ 
        ok: false, 
        error: error.message,
        logs 
      });
    }
  });

  /**
   * POST /api/admin/autopilot/repair-all
   * Repair all linked screens
   */
  app.post("/api/admin/autopilot/repair-all", requireAdminAccess, async (req, res) => {
    try {
      const { syncScreenCombinedPlaylist } = await import("./services/screenPlaylistService");
      
      // Get all screens with Yodeck player linked
      const linkedScreens = await db.select({ id: screens.id, name: screens.name })
        .from(screens)
        .where(and(
          eq(screens.isActive, true),
          sql`${screens.yodeckPlayerId} IS NOT NULL`
        ));
      
      console.log(`[RepairAll] Repairing ${linkedScreens.length} screens...`);
      
      const results = [];
      for (const screen of linkedScreens) {
        console.log(`[RepairAll] Processing: ${screen.name}`);
        const result = await syncScreenCombinedPlaylist(screen.id);
        results.push({
          screenId: screen.id,
          screenName: screen.name,
          ok: result.ok,
          itemCount: result.itemCount,
          baselineCount: result.baselineCount,
          adsCount: result.adsCount,
          error: result.errorReason,
        });
      }
      
      const successful = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).length;
      
      console.log(`[RepairAll] Complete: ${successful} success, ${failed} failed`);
      
      res.json({ 
        ok: failed === 0,
        total: linkedScreens.length,
        successful,
        failed,
        results 
      });
    } catch (error: any) {
      console.error("[RepairAll] Error:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return httpServer;
}
