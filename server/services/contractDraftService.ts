/**
 * Contract Draft Service
 * Auto-generate draft contracts from advertiser and placement data
 */

import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { format, addMonths, addYears } from "date-fns";
import { nl } from "date-fns/locale";

interface ContractDraftInput {
  advertiserId: string;
  packagePlanId?: string;
  screens?: string[]; // Screen IDs to include in placement
  durationMonths?: number; // 3, 6, 12
  billingCycle?: "monthly" | "quarterly" | "yearly";
  customMonthlyPrice?: string; // Override package price
  startDate?: string; // ISO date string
  notes?: string;
}

interface ContractDraftResult {
  contractId: string;
  name: string;
  htmlContent: string;
  monthlyPriceExVat: string;
  startDate: string;
  endDate: string | null;
  screens: string[];
}

/**
 * Generate contract name based on advertiser and date
 */
function generateContractName(advertiserName: string, startDate: Date): string {
  const monthYear = format(startDate, "MMM yyyy", { locale: nl });
  return `${advertiserName} - ${monthYear}`;
}

/**
 * Calculate end date based on duration
 */
function calculateEndDate(startDate: Date, durationMonths: number): Date | null {
  if (!durationMonths || durationMonths <= 0) return null; // Ongoing
  return addMonths(startDate, durationMonths);
}

/**
 * Generate contract HTML content
 */
function generateContractHtml(params: {
  advertiserName: string;
  contactName: string;
  contactEmail: string;
  packageName: string;
  screens: { screenId: string; name: string; location: string }[];
  monthlyPriceExVat: string;
  vatPercent: string;
  startDate: Date;
  endDate: Date | null;
  billingCycle: string;
}): string {
  const {
    advertiserName,
    contactName,
    contactEmail,
    packageName,
    screens,
    monthlyPriceExVat,
    vatPercent,
    startDate,
    endDate,
    billingCycle,
  } = params;

  const monthlyTotal = parseFloat(monthlyPriceExVat);
  const vat = parseFloat(vatPercent);
  const vatAmount = monthlyTotal * (vat / 100);
  const totalInclVat = monthlyTotal + vatAmount;

  const billingLabel = billingCycle === "monthly" ? "maandelijks" : 
    billingCycle === "quarterly" ? "per kwartaal" : "jaarlijks";

  const durationText = endDate 
    ? `van ${format(startDate, "d MMMM yyyy", { locale: nl })} tot ${format(endDate, "d MMMM yyyy", { locale: nl })}`
    : `vanaf ${format(startDate, "d MMMM yyyy", { locale: nl })} (doorlopend)`;

  const screensHtml = screens.length > 0 
    ? screens.map(s => `<li>${s.screenId} - ${s.name} (${s.location})</li>`).join("")
    : "<li>Nog geen schermen geselecteerd</li>";

  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>Advertentiecontract - ${advertiserName}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 800px; margin: 40px auto; padding: 40px; }
    h1 { color: #0d7377; border-bottom: 2px solid #0d7377; padding-bottom: 10px; }
    h2 { color: #1a1a2e; margin-top: 30px; }
    .info-box { background: #f8f9fa; border-left: 4px solid #0d7377; padding: 15px 20px; margin: 20px 0; }
    .price-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .price-table th, .price-table td { padding: 12px; border: 1px solid #ddd; text-align: left; }
    .price-table th { background: #f0f4f4; }
    .price-table .total { font-weight: bold; background: #e8f4f4; }
    .screens-list { background: #f8f9fa; padding: 15px 20px; border-radius: 8px; }
    .signature-block { margin-top: 60px; border-top: 1px solid #ddd; padding-top: 30px; }
    .signature-line { display: inline-block; width: 250px; border-bottom: 1px solid #333; margin-right: 50px; margin-top: 40px; }
    .small { font-size: 0.85em; color: #666; }
  </style>
</head>
<body>
  <h1>Advertentiecontract</h1>
  
  <div class="info-box">
    <strong>Adverteerder:</strong> ${advertiserName}<br>
    <strong>Contactpersoon:</strong> ${contactName}<br>
    <strong>E-mail:</strong> ${contactEmail}
  </div>

  <h2>1. Pakket & Voorwaarden</h2>
  <p><strong>Pakket:</strong> ${packageName}</p>
  <p><strong>Looptijd:</strong> ${durationText}</p>
  <p><strong>Facturatie:</strong> ${billingLabel}</p>

  <h2>2. Schermlocaties</h2>
  <div class="screens-list">
    <p>Dit contract omvat de volgende schermlocaties:</p>
    <ul>
      ${screensHtml}
    </ul>
  </div>

  <h2>3. Tarieven</h2>
  <table class="price-table">
    <tr>
      <th>Omschrijving</th>
      <th>Bedrag</th>
    </tr>
    <tr>
      <td>Maandelijks tarief (excl. BTW)</td>
      <td>€ ${monthlyTotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td>BTW (${vat}%)</td>
      <td>€ ${vatAmount.toFixed(2)}</td>
    </tr>
    <tr class="total">
      <td>Totaal per maand (incl. BTW)</td>
      <td>€ ${totalInclVat.toFixed(2)}</td>
    </tr>
  </table>

  <h2>4. Betalingsvoorwaarden</h2>
  <ul>
    <li>Facturatie vindt ${billingLabel} plaats, vooraf.</li>
    <li>Betaling dient binnen 14 dagen na factuurdatum te geschieden.</li>
    <li>Bij niet-tijdige betaling wordt het advertentiemateriaal tijdelijk stopgezet.</li>
  </ul>

  <h2>5. Algemene Voorwaarden</h2>
  <ul>
    <li>Elevizion behoudt het recht om advertentiemateriaal te weigeren dat in strijd is met de wet of goede zeden.</li>
    <li>De adverteerder vrijwaart Elevizion voor alle aanspraken van derden met betrekking tot het aangeleverde materiaal.</li>
    <li>Opzegging dient minimaal 30 dagen voor het einde van de lopende periode schriftelijk te geschieden.</li>
  </ul>

  <div class="signature-block">
    <h2>Ondertekening</h2>
    <p>Door ondertekening van dit contract gaat de adverteerder akkoord met bovenstaande voorwaarden.</p>
    
    <p>
      <span class="signature-line"></span>
      <span class="signature-line"></span>
    </p>
    <p>
      <span class="small">Naam: ___________________________</span>
      <span class="small" style="margin-left: 80px;">Datum: ___________________________</span>
    </p>
  </div>

  <p class="small" style="margin-top: 60px; color: #999;">
    Dit document is automatisch gegenereerd door Elevizion Dashboard op ${format(new Date(), "d MMMM yyyy 'om' HH:mm", { locale: nl })}.
  </p>
</body>
</html>`;
}

/**
 * Create a draft contract from advertiser data
 */
export async function createContractDraft(input: ContractDraftInput): Promise<ContractDraftResult> {
  const {
    advertiserId,
    packagePlanId,
    screens = [],
    durationMonths = 12,
    billingCycle = "monthly",
    customMonthlyPrice,
    startDate: startDateStr,
    notes,
  } = input;

  // Get advertiser info
  const [advertiser] = await db.select().from(schema.advertisers).where(eq(schema.advertisers.id, advertiserId));
  if (!advertiser) {
    throw new Error("Adverteerder niet gevonden");
  }

  // Get package plan if specified
  let packagePlan: typeof schema.packagePlans.$inferSelect | undefined;
  if (packagePlanId) {
    const [plan] = await db.select().from(schema.packagePlans).where(eq(schema.packagePlans.id, packagePlanId));
    packagePlan = plan;
  }

  // Determine monthly price
  const monthlyPriceExVat = customMonthlyPrice || packagePlan?.baseMonthlyPriceExVat || "0.00";

  // Calculate dates
  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  const endDate = calculateEndDate(startDate, durationMonths);

  // Get screen info for the contract
  const screenInfos: { screenId: string; name: string; location: string }[] = [];
  if (screens.length > 0) {
    const screenRecords = await db.select().from(schema.entities)
      .where(sql`${schema.entities.id} = ANY(${screens})`);
    
    for (const screen of screenRecords) {
      const contactData = screen.contactData as { city?: string } | null;
      screenInfos.push({
        screenId: screen.entityCode || screen.id,
        name: screen.displayName || screen.entityCode || "Onbekend",
        location: contactData?.city || "Onbekende locatie",
      });
    }
  }

  // Generate contract name and HTML
  const contractName = generateContractName(advertiser.companyName, startDate);
  const htmlContent = generateContractHtml({
    advertiserName: advertiser.companyName,
    contactName: advertiser.contactName || advertiser.companyName,
    contactEmail: advertiser.email || "",
    packageName: packagePlan?.name || "Op maat",
    screens: screenInfos,
    monthlyPriceExVat,
    vatPercent: "21.00",
    startDate,
    endDate,
    billingCycle,
  });

  // Create the contract record
  const [contract] = await db.insert(schema.contracts).values({
    advertiserId,
    packagePlanId: packagePlanId || null,
    name: contractName,
    version: 1,
    title: `Advertentiecontract ${advertiser.companyName}`,
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: endDate ? format(endDate, "yyyy-MM-dd") : null,
    monthlyPriceExVat,
    vatPercent: "21.00",
    billingCycle,
    status: "draft",
    htmlContent,
    notes,
  }).returning();

  // Log the creation event
  await db.insert(schema.contractEvents).values({
    contractId: contract.id,
    eventType: "created",
    actorType: "system",
    actorName: "Auto-draft",
    metadata: { screens, durationMonths },
  });

  return {
    contractId: contract.id,
    name: contract.name,
    htmlContent,
    monthlyPriceExVat,
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: endDate ? format(endDate, "yyyy-MM-dd") : null,
    screens,
  };
}

/**
 * Create a new version of an existing contract
 * Used when a signed contract needs to be modified
 */
export async function createContractVersion(contractId: string, changes: {
  monthlyPriceExVat?: string;
  endDate?: string | null;
  screens?: string[];
  notes?: string;
}): Promise<{ newContractId: string; version: number }> {
  // Get the existing contract
  const [existingContract] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, contractId));
  if (!existingContract) {
    throw new Error("Contract niet gevonden");
  }

  // Get advertiser
  const [advertiser] = await db.select().from(schema.advertisers).where(eq(schema.advertisers.id, existingContract.advertiserId));
  if (!advertiser) {
    throw new Error("Adverteerder niet gevonden");
  }

  // Calculate new version number
  const [{ maxVersion }] = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(version), 0)` })
    .from(schema.contracts)
    .where(eq(schema.contracts.advertiserId, existingContract.advertiserId));
  
  const newVersion = (maxVersion || existingContract.version) + 1;

  // Get screen info for new version
  const screens = changes.screens || [];
  const screenInfos: { screenId: string; name: string; location: string }[] = [];
  if (screens.length > 0) {
    const screenRecords = await db.select().from(schema.entities)
      .where(sql`${schema.entities.id} = ANY(${screens})`);
    
    for (const screen of screenRecords) {
      const contactData = screen.contactData as { city?: string } | null;
      screenInfos.push({
        screenId: screen.entityCode || screen.id,
        name: screen.displayName || screen.entityCode || "Onbekend",
        location: contactData?.city || "Onbekende locatie",
      });
    }
  }

  // Generate new HTML content
  const startDate = new Date(existingContract.startDate);
  const endDate = changes.endDate ? new Date(changes.endDate) : 
    (existingContract.endDate ? new Date(existingContract.endDate) : null);

  const htmlContent = generateContractHtml({
    advertiserName: advertiser.companyName,
    contactName: advertiser.contactName || advertiser.companyName,
    contactEmail: advertiser.email || "",
    packageName: "Op maat (gewijzigd)",
    screens: screenInfos,
    monthlyPriceExVat: changes.monthlyPriceExVat || existingContract.monthlyPriceExVat,
    vatPercent: existingContract.vatPercent,
    startDate,
    endDate,
    billingCycle: existingContract.billingCycle,
  });

  // Create new version
  const [newContract] = await db.insert(schema.contracts).values({
    advertiserId: existingContract.advertiserId,
    packagePlanId: existingContract.packagePlanId,
    name: `${existingContract.name.split(" v")[0]} v${newVersion}`,
    version: newVersion,
    title: existingContract.title,
    startDate: existingContract.startDate,
    endDate: changes.endDate !== undefined ? changes.endDate : existingContract.endDate,
    monthlyPriceExVat: changes.monthlyPriceExVat || existingContract.monthlyPriceExVat,
    vatPercent: existingContract.vatPercent,
    billingCycle: existingContract.billingCycle,
    status: "draft",
    htmlContent,
    notes: changes.notes || existingContract.notes,
  }).returning();

  // Log the version creation
  await db.insert(schema.contractEvents).values({
    contractId: newContract.id,
    eventType: "version_created",
    actorType: "system",
    actorName: "Versie-update",
    metadata: { previousContractId: contractId, previousVersion: existingContract.version, changes },
  });

  return {
    newContractId: newContract.id,
    version: newVersion,
  };
}

/**
 * Get all versions of a contract for an advertiser
 */
export async function getContractVersions(advertiserId: string): Promise<{
  id: string;
  name: string;
  version: number;
  status: string;
  createdAt: Date;
}[]> {
  const contracts = await db.select({
    id: schema.contracts.id,
    name: schema.contracts.name,
    version: schema.contracts.version,
    status: schema.contracts.status,
    createdAt: schema.contracts.createdAt,
  })
    .from(schema.contracts)
    .where(eq(schema.contracts.advertiserId, advertiserId))
    .orderBy(sql`${schema.contracts.version} DESC`);

  return contracts;
}
