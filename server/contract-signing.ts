/**
 * Contract Signing Service
 * Handles token generation, verification, and digital signature capture
 */

import crypto from "crypto";

// Generate a secure signing token
export function generateSigningToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = hashToken(token);
  return { token, hash };
}

// Hash a token for secure storage
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Verify a token against stored hash
export function verifyToken(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !token) {
    return false;
  }
  
  const inputHash = hashToken(token);
  
  // Ensure both hashes have the same length before comparison
  if (inputHash.length !== storedHash.length) {
    return false;
  }
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(inputHash),
      Buffer.from(storedHash)
    );
  } catch {
    return false;
  }
}

// Generate contract HTML content
export function generateContractHtml(data: {
  advertiserName: string;
  contactName: string;
  contractName: string;
  monthlyPrice: string;
  vatPercent: string;
  startDate: string;
  endDate?: string | null;
  billingCycle: string;
  screens: string[];
}): string {
  const billingCycleNL: Record<string, string> = {
    monthly: "Maandelijks",
    quarterly: "Per Kwartaal",
    yearly: "Jaarlijks",
  };

  const vatRate = parseFloat(data.vatPercent) / 100;
  const monthlyExVat = parseFloat(data.monthlyPrice);
  const monthlyIncVat = monthlyExVat * (1 + vatRate);

  const screensHtml = data.screens.length > 0
    ? `<ul>${data.screens.map(s => `<li>${s}</li>`).join("")}</ul>`
    : "<p>Nog geen schermen toegewezen</p>";

  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>Reclamecontract - ${data.contractName}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; line-height: 1.6; }
    h1 { color: #1e3a5f; border-bottom: 3px solid #f8a12f; padding-bottom: 10px; }
    h2 { color: #2d5a87; margin-top: 30px; }
    .header { text-align: center; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: bold; color: #1e3a5f; }
    .tagline { color: #f8a12f; font-size: 14px; }
    .section { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    td { padding: 10px; border-bottom: 1px solid #ddd; }
    td:first-child { font-weight: bold; width: 40%; }
    .terms { font-size: 14px; margin-top: 30px; }
    .terms h3 { color: #1e3a5f; }
    .signature-area { margin-top: 40px; padding: 20px; border: 2px dashed #ccc; border-radius: 8px; }
    .date { text-align: right; margin-bottom: 20px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Elevizion</div>
    <div class="tagline">See Your Business Grow</div>
  </div>

  <div class="date">Datum: ${new Date().toLocaleDateString("nl-NL")}</div>

  <h1>Reclamecontract</h1>

  <div class="section">
    <h2>Partijen</h2>
    <table>
      <tr>
        <td>Leverancier:</td>
        <td>Elevizion B.V.<br>KvK: [Te bepalen]<br>BTW: [Te bepalen]</td>
      </tr>
      <tr>
        <td>Klant:</td>
        <td>${data.advertiserName}<br>T.a.v. ${data.contactName}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Contractgegevens</h2>
    <table>
      <tr><td>Contractnaam:</td><td>${data.contractName}</td></tr>
      <tr><td>Startdatum:</td><td>${data.startDate}</td></tr>
      <tr><td>Einddatum:</td><td>${data.endDate || "Doorlopend"}</td></tr>
      <tr><td>Maandprijs (excl. BTW):</td><td>€${monthlyExVat.toFixed(2)}</td></tr>
      <tr><td>BTW (${data.vatPercent}%):</td><td>€${(monthlyExVat * vatRate).toFixed(2)}</td></tr>
      <tr><td>Maandprijs (incl. BTW):</td><td><strong>€${monthlyIncVat.toFixed(2)}</strong></td></tr>
      <tr><td>Facturatiecyclus:</td><td>${billingCycleNL[data.billingCycle] || data.billingCycle}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Toegewezen Schermen</h2>
    ${screensHtml}
  </div>

  <div class="terms">
    <h3>Algemene Voorwaarden</h3>
    <ol>
      <li><strong>Duur en Opzegging:</strong> Dit contract gaat in op de startdatum en loopt ${data.endDate ? `tot ${data.endDate}` : "voor onbepaalde tijd"}. Opzegging dient schriftelijk te geschieden met inachtneming van een opzegtermijn van 1 maand.</li>
      <li><strong>Betaling:</strong> Facturatie geschiedt ${billingCycleNL[data.billingCycle]?.toLowerCase() || "maandelijks"}. Betaling dient binnen 14 dagen na factuurdatum te geschieden.</li>
      <li><strong>Content:</strong> De klant is verantwoordelijk voor het aanleveren van reclamecontent die voldoet aan de technische specificaties en niet in strijd is met wet- of regelgeving.</li>
      <li><strong>Aansprakelijkheid:</strong> Elevizion is niet aansprakelijk voor schade voortvloeiend uit het niet of niet tijdig tonen van content door technische storingen.</li>
      <li><strong>Wijzigingen:</strong> Prijswijzigingen worden 30 dagen van tevoren schriftelijk aangekondigd.</li>
    </ol>
  </div>

  <div class="signature-area">
    <h3>Ondertekening</h3>
    <p>Door ondertekening verklaart de klant akkoord te gaan met bovenstaande voorwaarden.</p>
    <table style="border: none;">
      <tr><td style="border: none;">Naam:</td><td style="border: none; border-bottom: 1px solid #333; width: 300px;">&nbsp;</td></tr>
      <tr><td style="border: none;">Datum:</td><td style="border: none; border-bottom: 1px solid #333;">&nbsp;</td></tr>
      <tr><td style="border: none;">Handtekening:</td><td style="border: none; height: 60px; border-bottom: 1px solid #333;">&nbsp;</td></tr>
    </table>
  </div>
</body>
</html>
  `;
}

// Calculate expiration date (default 14 days)
export function calculateExpirationDate(daysValid: number = 14): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + daysValid);
  return expiration;
}

// Format IP address for storage
export function formatClientInfo(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): { ip: string; userAgent: string } {
  const ip = req.ip || 
    (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
    "unknown";
  const userAgent = (req.headers?.["user-agent"] as string) || "unknown";
  return { ip, userAgent };
}
