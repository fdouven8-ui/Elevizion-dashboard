/**
 * Email Service for Elevizion Dashboard
 * Uses Postmark for transactional emails
 * 
 * Environment variables:
 * - POSTMARK_SERVER_TOKEN: Your Postmark server token
 * - EMAIL_FROM: From email address (default: no-reply@elevizion.nl)
 * - EMAIL_REPLY_TO: Reply-to email address (default: info@elevizion.nl)
 */

import * as postmark from "postmark";

interface EmailConfig {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
}

interface EmailResult {
  success: boolean;
  message: string;
  messageId?: string;
}

// Check if Postmark is configured
export function isEmailConfigured(): boolean {
  return !!process.env.POSTMARK_SERVER_TOKEN;
}

// Send email via Postmark
export async function sendEmail(config: EmailConfig): Promise<EmailResult> {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN;
  
  if (!serverToken) {
    return {
      success: false,
      message: "Postmark is niet geconfigureerd. Voeg POSTMARK_SERVER_TOKEN toe aan environment variables."
    };
  }

  const fromEmail = process.env.EMAIL_FROM || "no-reply@elevizion.nl";
  const replyTo = process.env.EMAIL_REPLY_TO || "info@elevizion.nl";

  try {
    const client = new postmark.ServerClient(serverToken);
    
    const result = await client.sendEmail({
      From: fromEmail,
      To: config.to,
      Subject: config.subject,
      HtmlBody: config.html,
      TextBody: config.text || "",
      ReplyTo: replyTo,
      MessageStream: "outbound",
    });

    return {
      success: true,
      message: "E-mail succesvol verzonden",
      messageId: result.MessageID,
    };
  } catch (error: any) {
    console.error("Postmark error:", error);
    return {
      success: false,
      message: `Fout bij verzenden: ${error.message}`,
    };
  }
}

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

interface ContractEmailData {
  advertiserName: string;
  contactName: string;
  contractName: string;
  monthlyPrice: string;
  vatPercent: string;
  startDate: string;
  endDate?: string | null;
  billingCycle: string;
  screens: string[];
}

export function generateContractEmailHtml(data: ContractEmailData): string {
  const billingCycleNL = {
    monthly: "Maandelijks",
    quarterly: "Per Kwartaal", 
    yearly: "Jaarlijks",
  }[data.billingCycle] || data.billingCycle;

  const screensHtml = data.screens.length > 0 
    ? `<ul>${data.screens.map(s => `<li>${s}</li>`).join("")}</ul>`
    : "<p>Nog geen schermen toegewezen</p>";

  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nieuw Contract - Elevizion</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
    <h2 style="color: #1e3a5f; margin-top: 0;">Welkom bij Elevizion!</h2>
    
    <p>Beste ${data.contactName},</p>
    
    <p>Hartelijk dank voor uw vertrouwen in Elevizion. Hieronder vindt u de details van uw nieuwe reclamecontract:</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #f8a12f; margin: 20px 0;">
      <h3 style="color: #1e3a5f; margin-top: 0;">Contractgegevens</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Bedrijf:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.advertiserName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Contract:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.contractName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Maandprijs:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">€${data.monthlyPrice} (excl. ${data.vatPercent}% BTW)</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Facturatie:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${billingCycleNL}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Startdatum:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.startDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Einddatum:</strong></td>
          <td style="padding: 8px 0;">${data.endDate || "Doorlopend"}</td>
        </tr>
      </table>
    </div>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1e3a5f; margin-top: 0;">Toegewezen Schermen</h3>
      ${screensHtml}
    </div>
    
    <p style="margin-top: 30px;">Heeft u vragen over uw contract? Neem gerust contact met ons op.</p>
    
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
  </div>
</body>
</html>
  `;
}

interface SepaEmailData {
  advertiserName: string;
  contactName: string;
  email: string;
  monthlyAmount: string;
  vatPercent: string;
  iban?: string;
  mandateReference?: string;
}

export function generateSepaEmailHtml(data: SepaEmailData): string {
  const mandateRef = data.mandateReference || `ELV-${Date.now()}`;
  
  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEPA Machtiging - Elevizion</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
    <h2 style="color: #1e3a5f; margin-top: 0;">SEPA Incassomachtiging</h2>
    
    <p>Beste ${data.contactName},</p>
    
    <p>Om de maandelijkse betalingen voor uw reclamecontract automatisch te verwerken, hebben wij een SEPA incassomachtiging nodig.</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #f8a12f; margin: 20px 0;">
      <h3 style="color: #1e3a5f; margin-top: 0;">Machtigingsgegevens</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Incassant ID:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">NL00ZZZ000000000000</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Naam incassant:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Elevizion B.V.</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Kenmerk machtiging:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${mandateRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Bedrijfsnaam:</strong></td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.advertiserName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Maandbedrag:</strong></td>
          <td style="padding: 8px 0;">€${data.monthlyAmount} (incl. ${data.vatPercent}% BTW)</td>
        </tr>
      </table>
    </div>
    
    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffc107;">
      <p style="margin: 0;"><strong>Actie vereist:</strong> Vul het bijgevoegde SEPA machtigingsformulier in en stuur het ondertekend retour naar <a href="mailto:administratie@elevizion.nl">administratie@elevizion.nl</a></p>
    </div>
    
    <p>Door ondertekening van dit formulier machtigt u Elevizion B.V. doorlopend incasso-opdrachten te sturen naar uw bank om een bedrag van uw rekening af te schrijven en aan uw bank om doorlopend een bedrag af te schrijven overeenkomstig de opdracht van Elevizion B.V.</p>
    
    <p style="margin-top: 30px;">Heeft u vragen? Neem gerust contact met ons op.</p>
    
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
  </div>
</body>
</html>
  `;
}

// Send contract confirmation email
export async function sendContractEmail(
  toEmail: string,
  data: ContractEmailData
): Promise<EmailResult> {
  return sendEmail({
    to: toEmail,
    subject: `Uw Elevizion Contract: ${data.contractName}`,
    html: generateContractEmailHtml(data),
  });
}

// Send SEPA mandate request email
export async function sendSepaEmail(
  toEmail: string,
  data: SepaEmailData
): Promise<EmailResult> {
  return sendEmail({
    to: toEmail,
    subject: "SEPA Incassomachtiging - Elevizion",
    html: generateSepaEmailHtml(data),
  });
}
