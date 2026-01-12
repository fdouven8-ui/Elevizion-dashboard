/**
 * Contract Template Service
 * Generates contracts from database templates
 */

import { db } from "../db";
import { eq, and } from "drizzle-orm";
import * as schema from "@shared/schema";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface ContractData {
  advertiserName?: string;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  packageName?: string;
  monthlyPrice?: string;
  vatPercent?: string;
  startDate?: string;
  endDate?: string;
  billingCycle?: string;
  screenList?: string;
  locationName?: string;
  revenueShare?: string;
  fixedMonthly?: string;
  visitorStaffel?: string;
  bankAccount?: string;
  kvkNumber?: string;
  address?: string;
  [key: string]: string | undefined;
}

interface GenerateContractOptions {
  templateKey: string;
  entityType: "advertiser" | "location";
  entityId: string;
  data: ContractData;
}

interface GeneratedContract {
  documentId: string;
  renderedContent: string;
  templateKey: string;
  versionNumber: number;
}

/**
 * Replace {{placeholders}} in template with actual values
 */
function renderTemplate(templateBody: string, data: ContractData): string {
  let result = templateBody;
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(placeholder, value);
    }
  }
  
  // Remove any remaining unfilled placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, "");
  
  return result;
}

/**
 * Wrap contract content in styled HTML
 */
function wrapInHtml(title: string, content: string, generatedDate: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.7; color: #1a1a2e; max-width: 800px; margin: 40px auto; padding: 40px; }
    h1 { color: #0d7377; border-bottom: 2px solid #0d7377; padding-bottom: 10px; font-size: 1.8em; }
    h2 { color: #1a1a2e; margin-top: 30px; font-size: 1.3em; }
    .info-box { background: #f8f9fa; border-left: 4px solid #0d7377; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .highlight { background: #e8f4f4; padding: 15px 20px; border-radius: 8px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
    th { background: #f0f4f4; }
    .total { font-weight: bold; background: #e8f4f4; }
    .signature-block { margin-top: 60px; border-top: 1px solid #ddd; padding-top: 30px; }
    .signature-line { display: inline-block; width: 250px; border-bottom: 1px solid #333; margin-right: 50px; margin-top: 40px; }
    .small { font-size: 0.85em; color: #666; }
    .footer { margin-top: 60px; font-size: 0.85em; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
    ul { margin: 15px 0; padding-left: 25px; }
    li { margin-bottom: 8px; }
  </style>
</head>
<body>
  ${content}
  
  <div class="signature-block">
    <h2>Ondertekening</h2>
    <p>Door ondertekening van dit document gaat u akkoord met bovenstaande voorwaarden.</p>
    
    <p>
      <span class="signature-line"></span>
      <span class="signature-line"></span>
    </p>
    <p>
      <span class="small">Naam: ___________________________</span>
      <span class="small" style="margin-left: 80px;">Datum: ___________________________</span>
    </p>
  </div>

  <div class="footer">
    Dit document is automatisch gegenereerd door Elevizion Dashboard op ${generatedDate}.
  </div>
</body>
</html>`;
}

/**
 * Generate a contract document from a database template
 */
export async function generateContractDocument(options: GenerateContractOptions): Promise<GeneratedContract> {
  const { templateKey, entityType, entityId, data } = options;

  // Get template from database
  const [template] = await db.select()
    .from(schema.templates)
    .where(and(
      eq(schema.templates.name, templateKey),
      eq(schema.templates.category, "contract")
    ));

  if (!template) {
    throw new Error(`Contract template '${templateKey}' niet gevonden`);
  }

  // Get the latest version number for this entity
  const existingDocs = await db.select({ versionNumber: schema.contractDocuments.versionNumber })
    .from(schema.contractDocuments)
    .where(and(
      eq(schema.contractDocuments.entityId, entityId),
      eq(schema.contractDocuments.templateKey, templateKey)
    ))
    .orderBy(schema.contractDocuments.versionNumber);

  const maxVersion = existingDocs.length > 0 
    ? Math.max(...existingDocs.map(d => d.versionNumber))
    : 0;
  const newVersion = maxVersion + 1;

  // Render template with data
  const renderedBody = renderTemplate(template.body, data);
  const renderedSubject = renderTemplate(template.subject || template.name, data);
  
  // Generate date for footer
  const generatedDate = format(new Date(), "d MMMM yyyy 'om' HH:mm", { locale: nl });
  
  // Wrap in full HTML document
  const fullHtml = wrapInHtml(renderedSubject, renderedBody, generatedDate);

  // Save to contract_documents
  const [doc] = await db.insert(schema.contractDocuments).values({
    templateKey,
    entityType,
    entityId,
    versionNumber: newVersion,
    renderedContent: fullHtml,
    status: "draft",
  }).returning();

  return {
    documentId: doc.id,
    renderedContent: fullHtml,
    templateKey,
    versionNumber: newVersion,
  };
}

/**
 * Get all contract documents for an entity
 */
export async function getContractDocuments(entityType: string, entityId: string): Promise<schema.ContractDocument[]> {
  return db.select()
    .from(schema.contractDocuments)
    .where(and(
      eq(schema.contractDocuments.entityType, entityType),
      eq(schema.contractDocuments.entityId, entityId)
    ))
    .orderBy(schema.contractDocuments.createdAt);
}

/**
 * Update contract document status
 */
export async function updateContractDocumentStatus(
  documentId: string, 
  status: "draft" | "sent" | "signed",
  signedAt?: Date
): Promise<void> {
  await db.update(schema.contractDocuments)
    .set({ 
      status,
      signedAt: signedAt || (status === "signed" ? new Date() : undefined),
      updatedAt: new Date()
    })
    .where(eq(schema.contractDocuments.id, documentId));
}

/**
 * Get a single contract document by ID
 */
export async function getContractDocument(documentId: string): Promise<schema.ContractDocument | null> {
  const [doc] = await db.select()
    .from(schema.contractDocuments)
    .where(eq(schema.contractDocuments.id, documentId));
  
  return doc || null;
}
