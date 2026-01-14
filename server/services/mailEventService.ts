/**
 * Mail Event Service
 * Central, idempotent email dispatcher for status transitions
 * 
 * IMPORTANT: Only triggers on actual status transitions, never on page loads
 * Uses emailLogs table for idempotency check before sending
 */

import { db } from "../db";
import { emailLogs, advertisers, locations, adAssets, portalTokens, contracts, placementPlans } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { sendEmail, baseEmailTemplate, BodyBlock } from "../email";
import crypto from "crypto";

export type MailEventType = 
  | "ADVERTISER_CONTRACT_ACCEPTED"
  | "ADVERTISER_ASSET_UPLOADED_VALID"
  | "ADVERTISER_PUBLISHED"
  | "LOCATION_INTAKE_SUBMITTED"
  | "LOCATION_APPROVED"
  | "LOCATION_CONTRACT_ACCEPTED";

const INTERNAL_EMAIL = "info@elevizion.nl";

interface MailEventResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  logId?: string;
}

/**
 * Check if an email for this event+entity combination was already sent
 * This prevents duplicate emails on retries or page reloads
 */
async function wasEmailAlreadySent(eventType: MailEventType, entityId: string): Promise<boolean> {
  const [existing] = await db.select({ id: emailLogs.id })
    .from(emailLogs)
    .where(and(
      eq(emailLogs.templateKey, eventType),
      eq(emailLogs.entityId, entityId),
      sql`${emailLogs.status} IN ('sent', 'queued')`
    ))
    .limit(1);
  
  return !!existing;
}

/**
 * Get advertiser with all needed data for email templates
 */
async function getAdvertiserForEmail(advertiserId: string) {
  const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
  if (!advertiser) return null;
  
  const [portal] = await db.select()
    .from(portalTokens)
    .where(and(
      eq(portalTokens.advertiserId, advertiserId),
      sql`${portalTokens.usedAt} IS NULL AND ${portalTokens.expiresAt} > NOW()`
    ))
    .orderBy(desc(portalTokens.createdAt))
    .limit(1);
  
  const [contract] = await db.select()
    .from(contracts)
    .where(eq(contracts.advertiserId, advertiserId))
    .orderBy(desc(contracts.createdAt))
    .limit(1);
  
  const [validAsset] = await db.select()
    .from(adAssets)
    .where(and(
      eq(adAssets.advertiserId, advertiserId),
      eq(adAssets.validationStatus, "valid")
    ))
    .orderBy(desc(adAssets.uploadedAt))
    .limit(1);
  
  return { advertiser, portal, contract, validAsset };
}

/**
 * Get location with all needed data for email templates
 */
async function getLocationForEmail(locationId: string) {
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  return location;
}

/**
 * Get published plan info for advertiser
 */
async function getPublishedPlanInfo(advertiserId: string) {
  const [plan] = await db.select()
    .from(placementPlans)
    .where(and(
      eq(placementPlans.advertiserId, advertiserId),
      eq(placementPlans.status, "PUBLISHED")
    ))
    .orderBy(desc(placementPlans.publishedAt))
    .limit(1);
  
  if (!plan) return null;
  
  const targets = (plan.approvedTargets as Array<{ locationId: string; locationName: string; city?: string }>) || [];
  const locationCount = targets.length;
  const citySet = new Set(targets.map(t => t.city).filter(Boolean) as string[]);
  const cities = Array.from(citySet);
  
  return { locationCount, cities };
}

/**
 * Generate upload portal URL for advertiser
 */
function generateUploadUrl(baseUrl: string, advertiserId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  return `${baseUrl}/upload/${token}`;
}

/**
 * Build email content for ADVERTISER_CONTRACT_ACCEPTED
 * Sent when contract is accepted - includes upload link, linkKey, video specs
 */
async function buildContractAcceptedEmail(advertiserId: string, baseUrl: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const data = await getAdvertiserForEmail(advertiserId);
  if (!data) return null;
  
  const { advertiser } = data;
  const videoDuration = advertiser.videoDurationSeconds || 10;
  
  const uploadUrl = `${baseUrl}/upload/${advertiser.id}`;
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Bedankt voor uw akkoord! We zijn blij dat u voor Elevizion heeft gekozen.` },
    { type: "paragraph", content: `De volgende stap is het uploaden van uw advertentievideo. Hieronder vindt u alle informatie die u nodig heeft.` },
    { type: "divider" },
    { type: "infoCard", rows: [
      { label: "Uw LinkKey", value: `<strong style="font-family: monospace; font-size: 18px; color: #2563eb;">${advertiser.linkKey}</strong>` },
      { label: "Bestandsnaam", value: `<code>${advertiser.linkKey}_${advertiser.companyName?.replace(/[^a-zA-Z0-9]/g, "")}.mp4</code>` },
      { label: "Lengte", value: `Exact <strong>${videoDuration} seconden</strong> (±0.5s tolerantie)` },
      { label: "Formaat", value: "MP4 (1920×1080 aanbevolen)" },
    ]},
    { type: "warning", title: "Belangrijk", content: `Uw bestandsnaam <strong>moet beginnen met uw LinkKey</strong> (${advertiser.linkKey}_...) anders kan uw video niet worden herkend.` },
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: "Volgende stap: upload je advertentie voor Elevizion",
    preheader: "Upload uw advertentievideo met uw persoonlijke LinkKey",
    title: "Volgende stap: upload je advertentie",
    bodyBlocks,
    cta: { label: "Upload je advertentie", url: uploadUrl },
  });
  
  return { to: advertiser.email, subject: "Volgende stap: upload je advertentie voor Elevizion", html, text };
}

/**
 * Build email content for ADVERTISER_ASSET_UPLOADED_VALID (internal)
 * Sent to info@elevizion.nl when a valid video is uploaded
 */
async function buildAssetUploadedInternalEmail(advertiserId: string, baseUrl: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const data = await getAdvertiserForEmail(advertiserId);
  if (!data) return null;
  
  const { advertiser, validAsset } = data;
  if (!validAsset) return null;
  
  const dashboardUrl = `${baseUrl}/advertisers/${advertiserId}`;
  const publishQueueUrl = `${baseUrl}/publish-queue`;
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Er is een nieuwe gevalideerde advertentievideo ontvangen.` },
    { type: "infoCard", rows: [
      { label: "Bedrijf", value: advertiser.companyName },
      { label: "LinkKey", value: advertiser.linkKey || "-" },
      { label: "Bestandsnaam", value: validAsset.originalFileName },
      { label: "Duur", value: `${validAsset.durationSeconds}s` },
      { label: "Resolutie", value: `${validAsset.width}×${validAsset.height}` },
    ]},
    { type: "paragraph", content: `De video is klaar voor plaatsing via de publicatie wachtrij.` },
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: `Nieuwe advertentie klaar voor plaatsing — ${advertiser.companyName}`,
    preheader: `Video ontvangen van ${advertiser.companyName}`,
    title: "Nieuwe advertentie klaar voor plaatsing",
    bodyBlocks,
    cta: { label: "Bekijk in dashboard", url: dashboardUrl },
    secondaryCta: { label: "Naar publicatie wachtrij", url: publishQueueUrl },
  });
  
  return { to: INTERNAL_EMAIL, subject: `Nieuwe advertentie klaar voor plaatsing — ${advertiser.companyName}`, html, text };
}

/**
 * Build email content for ADVERTISER_PUBLISHED
 * Sent to customer when their ad goes live
 */
async function buildPublishedEmail(advertiserId: string, baseUrl: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const data = await getAdvertiserForEmail(advertiserId);
  if (!data) return null;
  
  const { advertiser } = data;
  const planInfo = await getPublishedPlanInfo(advertiserId);
  
  const locationCount = planInfo?.locationCount || 1;
  const regions = planInfo?.cities?.join(", ") || "Nederland";
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Geweldig nieuws! Uw advertentie is nu live bij Elevizion. 🎉` },
    { type: "infoCard", rows: [
      { label: "Aantal locaties", value: `<strong>${locationCount}</strong> schermen` },
      { label: "Regio's", value: regions },
    ]},
    { type: "paragraph", content: `Uw advertentie wordt nu getoond aan bezoekers op de actieve schermlocaties. De exacte zichtbaarheid hangt af van het aantal bezoekers per locatie.` },
    { type: "paragraph", content: `Heeft u vragen? Neem gerust contact met ons op via <a href="mailto:info@elevizion.nl">info@elevizion.nl</a>.` },
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: "Je advertentie staat live bij Elevizion 🎉",
    preheader: `Uw advertentie is nu zichtbaar op ${locationCount} locaties`,
    title: "Je advertentie staat live!",
    bodyBlocks,
  });
  
  return { to: advertiser.email, subject: "Je advertentie staat live bij Elevizion 🎉", html, text };
}

/**
 * Build email for LOCATION_INTAKE_SUBMITTED
 * Confirmation to location after intake form submission
 */
async function buildIntakeSubmittedEmail(locationId: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const location = await getLocationForEmail(locationId);
  if (!location || !location.email) return null;
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Bedankt voor uw aanmelding als schermlocatie bij Elevizion!` },
    { type: "paragraph", content: `We hebben uw gegevens ontvangen en gaan deze beoordelen. U hoort binnen enkele werkdagen van ons.` },
    { type: "infoCard", rows: [
      { label: "Locatienaam", value: location.name },
      { label: "Adres", value: [location.street, location.houseNumber, location.city].filter(Boolean).join(" ") || location.address || "-" },
    ]},
    { type: "paragraph", content: `U hoeft nu verder niets te doen. We nemen contact met u op zodra de beoordeling is afgerond.` },
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: "Aanmelding ontvangen — Elevizion schermlocatie",
    preheader: "Bedankt voor uw aanmelding als schermlocatie",
    title: "Aanmelding ontvangen",
    bodyBlocks,
  });
  
  return { to: location.email, subject: "Aanmelding ontvangen — Elevizion schermlocatie", html, text };
}

/**
 * Build email for LOCATION_APPROVED
 * Sent when location is approved, includes contract link
 */
async function buildLocationApprovedEmail(locationId: string, baseUrl: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const location = await getLocationForEmail(locationId);
  if (!location || !location.email) return null;
  
  const contractUrl = location.contractToken 
    ? `${baseUrl}/location-contract/${location.contractToken}`
    : `${baseUrl}/location-onboarding/${location.intakeToken}`;
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Goed nieuws! Uw locatie is goedgekeurd voor deelname aan het Elevizion schermnetwerk.` },
    { type: "paragraph", content: `De volgende stap is het bevestigen van uw deelname door de samenwerkingsovereenkomst te ondertekenen.` },
    { type: "infoCard", rows: [
      { label: "Locatie", value: location.name },
      { label: "Vergoeding", value: location.payoutType === "fixed" 
        ? `€${location.fixedPayoutAmount}/maand vast` 
        : `${location.revenueSharePercent}% van de advertentie-inkomsten` 
      },
    ]},
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: "Goedkeuring locatie — bevestig je deelname",
    preheader: "Uw locatie is goedgekeurd voor Elevizion",
    title: "Uw locatie is goedgekeurd!",
    bodyBlocks,
    cta: { label: "Bevestig deelname", url: contractUrl },
  });
  
  return { to: location.email, subject: "Goedkeuring locatie — bevestig je deelname", html, text };
}

/**
 * Build email for LOCATION_CONTRACT_ACCEPTED
 * Confirmation to location after contract is signed
 */
async function buildLocationContractAcceptedEmail(locationId: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const location = await getLocationForEmail(locationId);
  if (!location || !location.email) return null;
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Welkom bij Elevizion! Uw deelname is bevestigd.` },
    { type: "infoCard", rows: [
      { label: "Locatie", value: location.name },
      { label: "Vergoeding", value: location.payoutType === "fixed" 
        ? `€${location.fixedPayoutAmount}/maand vast` 
        : `${location.revenueSharePercent}% van de inkomsten` 
      },
      { label: "Minimum", value: `€${location.minimumPayoutAmount} per uitkering` },
    ]},
    { type: "paragraph", content: `<strong>Wat gebeurt er nu?</strong>` },
    { type: "bullets", items: [
      "Wij nemen contact met u op voor de installatie van het scherm",
      "Na installatie wordt uw scherm automatisch actief",
      "U ontvangt maandelijks een overzicht van uw inkomsten",
    ]},
    { type: "paragraph", content: `Heeft u vragen? Neem contact op via <a href="mailto:info@elevizion.nl">info@elevizion.nl</a>.` },
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: "Schermlocatie bevestigd — Elevizion",
    preheader: "Uw deelname aan Elevizion is bevestigd",
    title: "Schermlocatie bevestigd",
    bodyBlocks,
  });
  
  return { to: location.email, subject: "Schermlocatie bevestigd — Elevizion", html, text };
}

/**
 * Build internal notification for LOCATION_CONTRACT_ACCEPTED
 */
async function buildLocationContractInternalEmail(locationId: string, baseUrl: string): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  const location = await getLocationForEmail(locationId);
  if (!location) return null;
  
  const dashboardUrl = `${baseUrl}/locations/${locationId}`;
  
  const bodyBlocks: BodyBlock[] = [
    { type: "paragraph", content: `Een nieuwe schermlocatie heeft de overeenkomst geaccepteerd.` },
    { type: "infoCard", rows: [
      { label: "Locatie", value: location.name },
      { label: "Contact", value: location.contactName || "-" },
      { label: "Email", value: location.email || "-" },
      { label: "Adres", value: [location.street, location.houseNumber, location.city].filter(Boolean).join(" ") || "-" },
      { label: "Vergoeding", value: location.payoutType === "fixed" 
        ? `€${location.fixedPayoutAmount}/maand` 
        : `${location.revenueSharePercent}%` 
      },
    ]},
    { type: "paragraph", content: `Volgende stap: plan de installatie.` },
  ];
  
  const { html, text } = baseEmailTemplate({
    subject: `Nieuwe schermlocatie bevestigd — ${location.name}`,
    preheader: `${location.name} heeft de overeenkomst geaccepteerd`,
    title: "Nieuwe schermlocatie bevestigd",
    bodyBlocks,
    cta: { label: "Bekijk locatie", url: dashboardUrl },
  });
  
  return { to: INTERNAL_EMAIL, subject: `Nieuwe schermlocatie bevestigd — ${location.name}`, html, text };
}

/**
 * Main dispatch function - sends email for a specific event
 * Idempotent: checks if email was already sent before proceeding
 */
export async function dispatchMailEvent(
  eventType: MailEventType,
  entityId: string,
  baseUrl: string
): Promise<MailEventResult> {
  const alreadySent = await wasEmailAlreadySent(eventType, entityId);
  if (alreadySent) {
    console.log(`[MailEvent] Skipped ${eventType} for ${entityId} - already sent`);
    return { success: true, skipped: true, reason: "Email already sent for this event" };
  }
  
  let emailData: { to: string; subject: string; html: string; text: string } | null = null;
  let entityType: string = "";
  
  try {
    switch (eventType) {
      case "ADVERTISER_CONTRACT_ACCEPTED":
        emailData = await buildContractAcceptedEmail(entityId, baseUrl);
        entityType = "advertiser";
        break;
        
      case "ADVERTISER_ASSET_UPLOADED_VALID":
        emailData = await buildAssetUploadedInternalEmail(entityId, baseUrl);
        entityType = "advertiser";
        break;
        
      case "ADVERTISER_PUBLISHED":
        emailData = await buildPublishedEmail(entityId, baseUrl);
        entityType = "advertiser";
        break;
        
      case "LOCATION_INTAKE_SUBMITTED":
        emailData = await buildIntakeSubmittedEmail(entityId);
        entityType = "location";
        break;
        
      case "LOCATION_APPROVED":
        emailData = await buildLocationApprovedEmail(entityId, baseUrl);
        entityType = "location";
        break;
        
      case "LOCATION_CONTRACT_ACCEPTED":
        emailData = await buildLocationContractAcceptedEmail(entityId);
        entityType = "location";
        break;
        
      default:
        return { success: false, skipped: false, reason: `Unknown event type: ${eventType}` };
    }
    
    if (!emailData) {
      return { success: false, skipped: false, reason: "Could not build email - entity not found or missing data" };
    }
    
    const result = await sendEmail({
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      templateKey: eventType,
      entityType,
      entityId,
    });
    
    if (result.success) {
      console.log(`[MailEvent] Sent ${eventType} to ${emailData.to} for ${entityId}`);
      
      if (eventType === "LOCATION_CONTRACT_ACCEPTED") {
        const internalEmail = await buildLocationContractInternalEmail(entityId, baseUrl);
        if (internalEmail) {
          await sendEmail({
            to: internalEmail.to,
            subject: internalEmail.subject,
            html: internalEmail.html,
            text: internalEmail.text,
            templateKey: `${eventType}_INTERNAL`,
            entityType,
            entityId,
          });
        }
      }
      
      return { success: true, skipped: false, logId: result.logId };
    } else {
      console.error(`[MailEvent] Failed ${eventType} for ${entityId}:`, result.message);
      return { success: false, skipped: false, reason: result.message, logId: result.logId };
    }
    
  } catch (error: any) {
    console.error(`[MailEvent] Error dispatching ${eventType}:`, error);
    return { success: false, skipped: false, reason: error.message };
  }
}

/**
 * Get last email sent for a specific entity
 * Used to display "Laatste mail verstuurd op..." in UI
 */
export async function getLastEmailForEntity(entityType: string, entityId: string): Promise<{
  eventType: string;
  sentAt: Date | null;
  status: string;
} | null> {
  const [lastEmail] = await db.select({
    eventType: emailLogs.templateKey,
    sentAt: emailLogs.sentAt,
    status: emailLogs.status,
  })
  .from(emailLogs)
  .where(and(
    eq(emailLogs.entityType, entityType),
    eq(emailLogs.entityId, entityId)
  ))
  .orderBy(desc(emailLogs.createdAt))
  .limit(1);
  
  return lastEmail || null;
}

/**
 * Get all emails for an entity (for audit/history)
 */
export async function getEmailHistoryForEntity(entityType: string, entityId: string) {
  return await db.select({
    id: emailLogs.id,
    eventType: emailLogs.templateKey,
    toEmail: emailLogs.toEmail,
    status: emailLogs.status,
    sentAt: emailLogs.sentAt,
    createdAt: emailLogs.createdAt,
    errorMessage: emailLogs.errorMessage,
  })
  .from(emailLogs)
  .where(and(
    eq(emailLogs.entityType, entityType),
    eq(emailLogs.entityId, entityId)
  ))
  .orderBy(desc(emailLogs.createdAt));
}

/**
 * Check for duplicate mail logs (health check)
 */
export async function checkForDuplicateMailLogs(): Promise<{ hasDuplicates: boolean; count: number }> {
  const result = await db.execute(sql`
    SELECT template_key, entity_id, COUNT(*) as cnt
    FROM email_logs
    WHERE status = 'sent'
    GROUP BY template_key, entity_id
    HAVING COUNT(*) > 1
  `);
  
  const duplicates = result.rows as Array<{ template_key: string; entity_id: string; cnt: number }>;
  return {
    hasDuplicates: duplicates.length > 0,
    count: duplicates.length,
  };
}

/**
 * Event type labels in Dutch for UI display
 */
export const MAIL_EVENT_LABELS: Record<MailEventType, string> = {
  ADVERTISER_CONTRACT_ACCEPTED: "Contract geaccepteerd (upload instructies)",
  ADVERTISER_ASSET_UPLOADED_VALID: "Video ontvangen (intern)",
  ADVERTISER_PUBLISHED: "Advertentie live",
  LOCATION_INTAKE_SUBMITTED: "Intake ontvangen",
  LOCATION_APPROVED: "Locatie goedgekeurd",
  LOCATION_CONTRACT_ACCEPTED: "Contract bevestigd",
};
