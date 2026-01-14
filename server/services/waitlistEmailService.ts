/**
 * Waitlist Email Service
 * Handles all email sending for the waitlist system
 */

import { sendEmail } from "../email";
import { REGIONS, BUSINESS_CATEGORIES } from "@shared/regions";

const PACKAGE_LABELS: Record<string, string> = {
  SINGLE: "Enkelvoudig (1 scherm)",
  TRIPLE: "Drievoudig (3 schermen)",
  TEN: "Tien (10 schermen)",
  CUSTOM: "Maatwerk",
};

interface WaitlistEmailData {
  contactName: string;
  companyName: string;
  email: string;
  packageType: string;
  businessCategory: string;
  targetRegionCodes: string[];
  videoDurationSeconds?: number;
  claimUrl?: string;
}

function getPackageLabel(packageType: string): string {
  return PACKAGE_LABELS[packageType] || packageType;
}

function getRegionsLabel(codes: string[]): string {
  return codes
    .map(code => REGIONS.find(r => r.code === code)?.label || code)
    .join(", ");
}

function getBusinessCategoryLabel(code: string): string {
  const cat = BUSINESS_CATEGORIES.find(c => c.code === code);
  return cat?.label || code;
}

export async function sendWaitlistConfirmationEmail(data: WaitlistEmailData): Promise<void> {
  const packageLabel = getPackageLabel(data.packageType);
  const regionsLabel = getRegionsLabel(data.targetRegionCodes);
  const businessCategoryLabel = getBusinessCategoryLabel(data.businessCategory);

  const html = `
    <p>Hallo ${data.contactName},</p>
    
    <p>We hebben je aanmelding ontvangen. Op dit moment is er nog niet genoeg ruimte in je gekozen gebieden om je pakket direct te plaatsen.</p>
    
    <p><strong>Jouw aanvraag</strong></p>
    <ul>
      <li>Pakket: ${packageLabel}</li>
      <li>Gebieden: ${regionsLabel}</li>
      <li>Branche: ${businessCategoryLabel}</li>
    </ul>
    
    <p>Zodra er plek vrijkomt, krijg je automatisch een e-mail waarmee je jouw plek kunt claimen. Daarna rond je in één keer alles af: akkoord + upload van je advertentie.</p>
    
    <p><strong>Belangrijk</strong></p>
    <ul>
      <li>Een uitnodiging is 48 uur geldig.</li>
      <li>Daarna komt je aanvraag automatisch terug op de wachtlijst.</li>
    </ul>
    
    <p>Vragen? Reageer op deze mail of mail naar info@elevizion.nl.</p>
    
    <p>Groet,<br>Elevizion (Douven Services)</p>
  `;

  const text = `Hallo ${data.contactName},

We hebben je aanmelding ontvangen. Op dit moment is er nog niet genoeg ruimte in je gekozen gebieden om je pakket direct te plaatsen.

Jouw aanvraag
- Pakket: ${packageLabel}
- Gebieden: ${regionsLabel}
- Branche: ${businessCategoryLabel}

Zodra er plek vrijkomt, krijg je automatisch een e-mail waarmee je jouw plek kunt claimen. Daarna rond je in één keer alles af: akkoord + upload van je advertentie.

Belangrijk
- Een uitnodiging is 48 uur geldig.
- Daarna komt je aanvraag automatisch terug op de wachtlijst.

Vragen? Reageer op deze mail of mail naar info@elevizion.nl.

Groet,
Elevizion (Douven Services)`;

  await sendEmail({
    to: data.email,
    subject: "Je staat op de wachtlijst bij Elevizion",
    html,
    text,
  });
  
  console.log(`[WaitlistEmail] Sent confirmation email to ${data.email}`);
}

export async function sendWaitlistClaimInviteEmail(data: WaitlistEmailData): Promise<void> {
  if (!data.claimUrl) {
    throw new Error("claimUrl is required for claim invite email");
  }

  const packageLabel = getPackageLabel(data.packageType);
  const regionsLabel = getRegionsLabel(data.targetRegionCodes);
  const businessCategoryLabel = getBusinessCategoryLabel(data.businessCategory);
  const videoDuration = data.videoDurationSeconds || 15;

  const html = `
    <p>Hallo ${data.contactName},</p>
    
    <p>Goed nieuws: er is plek vrijgekomen binnen je gekozen gebieden.</p>
    
    <p><strong>Jouw plek staat klaar</strong></p>
    <ul>
      <li>Pakket: ${packageLabel}</li>
      <li>Gebieden: ${regionsLabel}</li>
      <li>Branche: ${businessCategoryLabel}</li>
    </ul>
    
    <p>👉 <a href="${data.claimUrl}" style="color: #2563EB; font-weight: bold;">Claim je plek via deze link (48 uur geldig)</a></p>
    
    <p>Na het claimen rond je direct alles af:</p>
    <ol>
      <li>bedrijfsgegevens bevestigen</li>
      <li>akkoord + verificatie</li>
      <li>upload je advertentie (standaard ${videoDuration} sec, tenzij anders overeengekomen)</li>
    </ol>
    
    <p>Als je niet op tijd claimt, komt je aanvraag automatisch terug op de wachtlijst.</p>
    
    <p>Groet,<br>Elevizion (Douven Services)</p>
  `;

  const text = `Hallo ${data.contactName},

Goed nieuws: er is plek vrijgekomen binnen je gekozen gebieden.

Jouw plek staat klaar
- Pakket: ${packageLabel}
- Gebieden: ${regionsLabel}
- Branche: ${businessCategoryLabel}

Claim je plek via deze link (48 uur geldig):
${data.claimUrl}

Na het claimen rond je direct alles af:
1) bedrijfsgegevens bevestigen
2) akkoord + verificatie
3) upload je advertentie (standaard ${videoDuration} sec, tenzij anders overeengekomen)

Als je niet op tijd claimt, komt je aanvraag automatisch terug op de wachtlijst.

Groet,
Elevizion (Douven Services)`;

  await sendEmail({
    to: data.email,
    subject: "Er is plek vrijgekomen — claim je pakket (48 uur)",
    html,
    text,
  });
  
  console.log(`[WaitlistEmail] Sent claim invite email to ${data.email}`);
}

export async function sendWaitlistUnavailableEmail(data: WaitlistEmailData): Promise<void> {
  const packageLabel = getPackageLabel(data.packageType);
  const regionsLabel = getRegionsLabel(data.targetRegionCodes);

  const html = `
    <p>Hallo ${data.contactName},</p>
    
    <p>Net op dit moment is er (weer) te weinig plek beschikbaar in de gekozen gebieden om je pakket te starten. Geen zorgen — je staat nog steeds op de wachtlijst en we mailen je automatisch zodra er weer plek is.</p>
    
    <p><strong>Jouw aanvraag</strong></p>
    <ul>
      <li>Pakket: ${packageLabel}</li>
      <li>Gebieden: ${regionsLabel}</li>
    </ul>
    
    <p>Groet,<br>Elevizion (Douven Services)</p>
  `;

  const text = `Hallo ${data.contactName},

Net op dit moment is er (weer) te weinig plek beschikbaar in de gekozen gebieden om je pakket te starten. Geen zorgen — je staat nog steeds op de wachtlijst en we mailen je automatisch zodra er weer plek is.

Jouw aanvraag
- Pakket: ${packageLabel}
- Gebieden: ${regionsLabel}

Groet,
Elevizion (Douven Services)`;

  await sendEmail({
    to: data.email,
    subject: "Je plek is (nog) niet beschikbaar — we houden je op de hoogte",
    html,
    text,
  });
  
  console.log(`[WaitlistEmail] Sent unavailable email to ${data.email}`);
}
