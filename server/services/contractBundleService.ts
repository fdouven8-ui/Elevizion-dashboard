/**
 * Contract Bundle Service
 * Generates bundled PDFs combining multiple contract templates:
 * - Cover page with contract details
 * - Sections for each template (AV, Overeenkomst, SEPA)
 * - Audit trail page
 */

import { db } from "../db";
import { eq, and } from "drizzle-orm";
import * as schema from "@shared/schema";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { generateContractPdf } from "./contractPdfService";
import { ObjectStorageService } from "../objectStorage";
import { getRequiredTemplatesForContext, WorkflowContext } from "./contractTemplateService";
import { getCompanyBranding } from "../companyBranding";

interface BundleContext {
  entityType: "advertiser" | "location";
  entityId: string;
  entityData: {
    companyName: string;
    contactName: string;
    email: string;
    phone?: string;
    street?: string;
    houseNumber?: string;
    zipcode?: string;
    city?: string;
    kvkNumber?: string;
    vatNumber?: string;
    iban?: string;
    ibanAccountHolder?: string;
    packageType?: string;
    packagePrice?: string;
    screensIncluded?: number;
    revenueSharePercent?: string;
    locationName?: string;
  };
  auditData: {
    acceptedAt: Date;
    ip: string;
    userAgent: string;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    acceptedSepa?: boolean;
  };
}

interface BundleResult {
  success: boolean;
  bundledPdfUrl?: string;
  error?: string;
}

interface TemplateSection {
  name: string;
  version: number;
  content: string;
}

function getWorkflowContext(entityType: "advertiser" | "location"): WorkflowContext {
  return entityType === "advertiser" ? "advertiser_onboarding" : "location_onboarding";
}

async function getTemplatesForBundle(context: WorkflowContext): Promise<TemplateSection[]> {
  const required = getRequiredTemplatesForContext(context);
  const sections: TemplateSection[] = [];

  for (const req of required) {
    const [template] = await db.select()
      .from(schema.templates)
      .where(and(
        eq(schema.templates.name, req.key),
        eq(schema.templates.category, "contract"),
        eq(schema.templates.isEnabled, true)
      ));

    if (template) {
      sections.push({
        name: req.name,
        version: template.version || 1,
        content: template.body,
      });
    }
  }

  return sections;
}

function renderPlaceholders(content: string, data: Record<string, any>): string {
  let result = content;
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
      result = result.replace(placeholder, String(value));
    }
  }
  
  result = result.replace(/\{\{[^}]+\}\}/g, "");
  
  return result;
}

function generateBundleHtml(
  context: BundleContext,
  sections: TemplateSection[],
  branding: any
): string {
  const bundleDate = format(context.auditData.acceptedAt, "d MMMM yyyy 'om' HH:mm", { locale: nl });
  const contractType = context.entityType === "advertiser" ? "Adverteerder" : "Schermlocatie";
  const contractId = `EVZ-${context.entityType.toUpperCase().slice(0, 3)}-${format(context.auditData.acceptedAt, "yyyyMMdd")}-${context.entityId.slice(0, 8).toUpperCase()}`;

  const placeholderData: Record<string, string> = {
    companyName: context.entityData.companyName,
    contactName: context.entityData.contactName,
    email: context.entityData.email,
    phone: context.entityData.phone || "",
    address: `${context.entityData.street || ""} ${context.entityData.houseNumber || ""}`.trim(),
    street: context.entityData.street || "",
    houseNumber: context.entityData.houseNumber || "",
    zipcode: context.entityData.zipcode || "",
    city: context.entityData.city || "",
    kvkNumber: context.entityData.kvkNumber || "",
    vatNumber: context.entityData.vatNumber || "",
    packageName: context.entityData.packageType || "",
    pricePerScreen: context.entityData.packagePrice || "",
    screenCount: String(context.entityData.screensIncluded || 1),
    revenueSharePercent: context.entityData.revenueSharePercent || "10",
    locationName: context.entityData.locationName || context.entityData.companyName,
    startDate: format(new Date(), "d MMMM yyyy", { locale: nl }),
    minimumTermMonths: "3",
    minimumPayout: "25",
    debiteurIban: context.entityData.iban || "",
    accountHolderName: context.entityData.ibanAccountHolder || context.entityData.companyName,
    mandateReference: `EVZ-${format(context.auditData.acceptedAt, "yyyyMMdd")}-${context.entityId.slice(0, 6).toUpperCase()}`,
    signatureDate: format(context.auditData.acceptedAt, "d MMMM yyyy", { locale: nl }),
    signatureCity: context.entityData.city || "Sittard",
    incassantId: branding.incassantId || "NL00XXX0000000000",
    creditorIban: branding.iban || "[IBAN nog in te vullen]",
  };

  const versionsText = sections.map(s => `${s.name} v${s.version}`).join(", ");

  const coverPage = `
    <div class="cover-page">
      <div class="cover-logo">
        <h1 style="color: #2563eb; font-size: 48px; margin: 0;">ELEVIZION</h1>
      </div>
      <h2 class="cover-title">Contractbundel</h2>
      <p class="cover-subtitle">${branding.legalName} h/o ${branding.tradeName}</p>
      
      <div class="cover-details">
        <table class="cover-table">
          <tr>
            <td class="label">Contract ID:</td>
            <td class="value">${contractId}</td>
          </tr>
          <tr>
            <td class="label">Type:</td>
            <td class="value">${contractType}</td>
          </tr>
          <tr>
            <td class="label">Voor:</td>
            <td class="value">${context.entityData.companyName}</td>
          </tr>
          <tr>
            <td class="label">Datum akkoord:</td>
            <td class="value">${bundleDate}</td>
          </tr>
          <tr>
            <td class="label">Template versies:</td>
            <td class="value">${versionsText}</td>
          </tr>
        </table>
      </div>
      
      <div class="cover-footer">
        <p>${branding.tradeName} | KvK: ${branding.kvkNumber} | BTW: ${branding.vatNumber}</p>
        <p>${branding.address}, ${branding.zipcode} ${branding.city}</p>
      </div>
    </div>
  `;

  const sectionPages = sections.map((section, index) => {
    const renderedContent = renderPlaceholders(section.content, placeholderData);
    return `
      <div class="section-header">
        <h2>${section.name}</h2>
        <p class="version-tag">Versie ${section.version}</p>
      </div>
      <div class="section-content">
        ${renderedContent}
      </div>
      ${index < sections.length - 1 ? '<div class="page-break"></div>' : ''}
    `;
  }).join("\n");

  const acceptanceItems = [
    context.auditData.acceptedTerms ? "✓ Algemene Voorwaarden geaccepteerd" : null,
    context.auditData.acceptedPrivacy ? "✓ Privacyverklaring geaccepteerd" : null,
    context.auditData.acceptedSepa ? "✓ SEPA Machtiging verleend" : null,
  ].filter(Boolean);

  const auditPage = `
    <div class="audit-page">
      <h2>Audit Trail</h2>
      <p class="audit-subtitle">Digitale handtekening & verificatiegegevens</p>
      
      <div class="audit-section">
        <h3>Ondertekenaar</h3>
        <table class="audit-table">
          <tr>
            <td class="label">E-mail:</td>
            <td class="value">${context.entityData.email}</td>
          </tr>
          <tr>
            <td class="label">Naam:</td>
            <td class="value">${context.entityData.contactName}</td>
          </tr>
          <tr>
            <td class="label">Bedrijf:</td>
            <td class="value">${context.entityData.companyName}</td>
          </tr>
        </table>
      </div>
      
      <div class="audit-section">
        <h3>Verificatie</h3>
        <table class="audit-table">
          <tr>
            <td class="label">Datum/tijd OTP geverifieerd:</td>
            <td class="value">${bundleDate}</td>
          </tr>
          <tr>
            <td class="label">IP-adres:</td>
            <td class="value">${context.auditData.ip}</td>
          </tr>
          <tr>
            <td class="label">Browser:</td>
            <td class="value">${context.auditData.userAgent.slice(0, 100)}${context.auditData.userAgent.length > 100 ? '...' : ''}</td>
          </tr>
        </table>
      </div>
      
      <div class="audit-section">
        <h3>Geaccepteerde voorwaarden</h3>
        <ul class="acceptance-list">
          ${acceptanceItems.map(item => `<li>${item}</li>`).join("\n")}
        </ul>
      </div>
      
      <div class="audit-section">
        <h3>Documenten in bundel</h3>
        <ul class="template-list">
          ${sections.map(s => `<li>${s.name} (versie ${s.version})</li>`).join("\n")}
        </ul>
      </div>
      
      <div class="audit-footer">
        <p>Dit document is elektronisch ondertekend via OTP-verificatie per e-mail.</p>
        <p>Contract ID: ${contractId}</p>
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>Contractbundel - ${context.entityData.companyName}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    @media print {
      .page-break { page-break-before: always; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    
    /* Cover Page Styles */
    .cover-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 40px;
      page-break-after: always;
    }
    .cover-logo { margin-bottom: 40px; }
    .cover-title { font-size: 32pt; font-weight: bold; color: #1a1a1a; margin: 0 0 10px 0; }
    .cover-subtitle { font-size: 14pt; color: #666; margin: 0 0 60px 0; }
    .cover-details { width: 100%; max-width: 500px; margin: 40px 0; }
    .cover-table { width: 100%; border-collapse: collapse; text-align: left; }
    .cover-table td { padding: 12px 16px; border-bottom: 1px solid #eee; }
    .cover-table td.label { font-weight: 600; color: #666; width: 45%; }
    .cover-table td.value { color: #1a1a1a; }
    .cover-footer { margin-top: 80px; font-size: 10pt; color: #999; }
    .cover-footer p { margin: 4px 0; }
    
    /* Section Styles */
    .section-header {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      padding: 20px 30px;
      margin: 0 -20px 20px -20px;
      page-break-after: avoid;
    }
    .section-header h2 { margin: 0; font-size: 18pt; }
    .version-tag { margin: 5px 0 0 0; font-size: 10pt; opacity: 0.8; }
    .section-content {
      padding: 20px;
      page-break-inside: auto;
    }
    .section-content h1 { font-size: 16pt; color: #1a1a1a; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-top: 0; }
    .section-content h2 { font-size: 13pt; color: #1a1a1a; margin-top: 24px; }
    .section-content p { margin: 10px 0; text-align: justify; }
    .section-content ul, .section-content ol { margin: 10px 0; padding-left: 24px; }
    .section-content li { margin-bottom: 6px; }
    .section-content table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .section-content th, .section-content td { padding: 10px; border: 1px solid #ddd; text-align: left; }
    .section-content th { background: #f5f5f5; }
    
    /* Audit Page Styles */
    .audit-page {
      padding: 40px;
      page-break-before: always;
    }
    .audit-page h2 { font-size: 20pt; color: #1a1a1a; margin: 0 0 5px 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
    .audit-subtitle { color: #666; margin: 0 0 30px 0; }
    .audit-section { margin-bottom: 30px; }
    .audit-section h3 { font-size: 12pt; color: #2563eb; margin: 0 0 10px 0; }
    .audit-table { width: 100%; border-collapse: collapse; }
    .audit-table td { padding: 8px 12px; border-bottom: 1px solid #eee; vertical-align: top; }
    .audit-table td.label { font-weight: 600; color: #666; width: 40%; }
    .audit-table td.value { color: #1a1a1a; word-break: break-word; }
    .acceptance-list, .template-list { margin: 10px 0; padding-left: 0; list-style: none; }
    .acceptance-list li, .template-list li { padding: 8px 12px; background: #f0fdf4; border-left: 4px solid #22c55e; margin-bottom: 6px; }
    .template-list li { background: #eff6ff; border-left-color: #2563eb; }
    .audit-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10pt; color: #666; text-align: center; }
    .audit-footer p { margin: 4px 0; }
    
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  ${coverPage}
  <div class="page-break"></div>
  ${sectionPages}
  ${auditPage}
</body>
</html>`;
}

export async function generateContractBundle(context: BundleContext): Promise<BundleResult> {
  try {
    console.log(`[ContractBundle] Generating bundle for ${context.entityType} ${context.entityId}`);
    
    const branding = await getCompanyBranding();
    const workflowContext = getWorkflowContext(context.entityType);
    const sections = await getTemplatesForBundle(workflowContext);
    
    if (sections.length === 0) {
      return { success: false, error: "Geen templates gevonden voor bundel" };
    }
    
    console.log(`[ContractBundle] Found ${sections.length} templates for bundle`);
    
    const bundleHtml = generateBundleHtml(context, sections, branding);
    const pdfBuffer = await generateContractPdf(bundleHtml);
    
    console.log(`[ContractBundle] PDF generated, size: ${pdfBuffer.length} bytes`);
    
    let bundledPdfUrl = "";
    try {
      const objectStorage = new ObjectStorageService();
      const timestamp = Date.now();
      const folder = context.entityType === "advertiser" ? "advertiser-bundles" : "location-bundles";
      const fileName = `${folder}/${context.entityId}-bundle-${timestamp}.pdf`;
      bundledPdfUrl = await objectStorage.uploadFile(pdfBuffer, fileName, "application/pdf");
      console.log(`[ContractBundle] PDF uploaded to: ${bundledPdfUrl}`);
    } catch (uploadError) {
      console.error("[ContractBundle] Failed to upload PDF:", uploadError);
    }
    
    if (context.entityType === "advertiser") {
      await db.update(schema.advertisers)
        .set({
          bundledPdfUrl,
          bundledPdfGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.advertisers.id, context.entityId));
    } else {
      await db.update(schema.locations)
        .set({
          bundledPdfUrl,
          bundledPdfGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.locations.id, context.entityId));
    }
    
    console.log(`[ContractBundle] Bundle complete for ${context.entityType} ${context.entityId}`);
    return { success: true, bundledPdfUrl };
  } catch (error: any) {
    console.error("[ContractBundle] Error generating bundle:", error);
    return { success: false, error: error.message };
  }
}

export async function getAdvertiserBundleContext(advertiserId: string): Promise<BundleContext | null> {
  const [advertiser] = await db.select()
    .from(schema.advertisers)
    .where(eq(schema.advertisers.id, advertiserId));
  
  if (!advertiser) return null;
  
  return {
    entityType: "advertiser",
    entityId: advertiser.id,
    entityData: {
      companyName: advertiser.companyName,
      contactName: advertiser.contactName || "",
      email: advertiser.email,
      phone: advertiser.phone || undefined,
      street: advertiser.street || undefined,
      zipcode: advertiser.zipcode || undefined,
      city: advertiser.city || undefined,
      kvkNumber: advertiser.kvkNumber || undefined,
      vatNumber: advertiser.vatNumber || undefined,
      iban: advertiser.iban || undefined,
      ibanAccountHolder: advertiser.ibanAccountHolder || undefined,
      packageType: advertiser.packageType || undefined,
      packagePrice: advertiser.packagePrice?.toString() || undefined,
      screensIncluded: advertiser.screensIncluded || undefined,
    },
    auditData: {
      acceptedAt: advertiser.acceptedTermsAt || new Date(),
      ip: advertiser.acceptedTermsIp || "unknown",
      userAgent: advertiser.acceptedTermsUserAgent || "unknown",
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedSepa: advertiser.sepaMandate || false,
    },
  };
}

export async function getLocationBundleContext(locationId: string): Promise<BundleContext | null> {
  const [location] = await db.select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId));
  
  if (!location) return null;
  
  return {
    entityType: "location",
    entityId: location.id,
    entityData: {
      companyName: location.name,
      contactName: location.contactName || "",
      email: location.email || "",
      phone: location.phone || undefined,
      street: location.street || undefined,
      houseNumber: location.houseNumber || undefined,
      zipcode: location.zipcode || undefined,
      city: location.city || undefined,
      iban: location.bankAccountIban || undefined,
      ibanAccountHolder: location.bankAccountName || undefined,
      locationName: location.name,
      revenueSharePercent: location.revenueSharePercent?.toString() || "10",
    },
    auditData: {
      acceptedAt: location.acceptedTermsAt || new Date(),
      ip: location.acceptedTermsIp || "unknown",
      userAgent: location.acceptedTermsUserAgent || "unknown",
      acceptedTerms: true,
      acceptedPrivacy: true,
    },
  };
}
