/**
 * Email Steps - Central mapping for all system email triggers
 * Each step defines templateKey, subject, and idempotency rules
 */

import { sendEmail, baseEmailTemplate as centralEmailTemplate } from "./email";
import { storage } from "./storage";
import { DEFAULT_COMPANY } from "./companyBranding";

const COMPANY = DEFAULT_COMPANY;

export type EmailStep = 
  | "advertiser_created"
  | "advertiser_invite_sent"
  | "advertiser_onboarding_completed"
  | "screen_created"
  | "screen_invite_sent"
  | "screen_onboarding_completed"
  | "location_invite_sent"
  | "location_onboarding_completed"
  | "contract_sent"
  | "contract_signed"
  | "verification_code"
  | "test_email";

interface StepConfig {
  templateKey: string;
  getSubject: (meta?: Record<string, any>) => string;
  getHtml: (meta?: Record<string, any>) => string;
}

const stepConfigs: Record<EmailStep, StepConfig> = {
  advertiser_created: {
    templateKey: "advertiser_created",
    getSubject: (meta) => `Welkom bij ${COMPANY.tradeName} - ${meta?.companyName || "Nieuwe Adverteerder"}`,
    getHtml: (meta) => generateAdvertiserCreatedHtml(meta),
  },
  advertiser_invite_sent: {
    templateKey: "advertiser_invite_sent",
    getSubject: () => `Voltooi uw registratie bij ${COMPANY.tradeName}`,
    getHtml: (meta) => generateInviteHtml(meta),
  },
  advertiser_onboarding_completed: {
    templateKey: "onboarding_completed",
    getSubject: (meta) => `Onboarding voltooid - ${meta?.companyName || "Adverteerder"}`,
    getHtml: (meta) => generateOnboardingCompletedHtml(meta),
  },
  screen_created: {
    templateKey: "screen_created",
    getSubject: (meta) => `Nieuw scherm geregistreerd - ${meta?.screenName || "Scherm"}`,
    getHtml: (meta) => generateScreenCreatedHtml(meta),
  },
  screen_invite_sent: {
    templateKey: "screen_invite_sent",
    getSubject: (meta) => `Voltooi registratie - ${meta?.screenName || "Scherm"}`,
    getHtml: (meta) => generateScreenInviteHtml(meta),
  },
  screen_onboarding_completed: {
    templateKey: "screen_onboarding_completed",
    getSubject: (meta) => `Scherm onboarding voltooid - ${meta?.screenName || "Scherm"}`,
    getHtml: (meta) => generateScreenOnboardingCompletedHtml(meta),
  },
  location_invite_sent: {
    templateKey: "location_invite_sent",
    getSubject: (meta) => `Voltooi registratie - ${meta?.locationName || "Locatie"}`,
    getHtml: (meta) => generateLocationInviteHtml(meta),
  },
  location_onboarding_completed: {
    templateKey: "location_onboarding_completed",
    getSubject: (meta) => `Locatie onboarding voltooid - ${meta?.locationName || "Locatie"}`,
    getHtml: (meta) => generateLocationOnboardingCompletedHtml(meta),
  },
  contract_sent: {
    templateKey: "contract_sent",
    getSubject: (meta) => `Contract ter ondertekening - ${meta?.contractName || "Contract"}`,
    getHtml: (meta) => generateContractSentHtml(meta),
  },
  contract_signed: {
    templateKey: "contract_signed",
    getSubject: (meta) => `Contract ondertekend - ${meta?.contractName || "Contract"}`,
    getHtml: (meta) => generateContractSignedHtml(meta),
  },
  verification_code: {
    templateKey: "verification_code",
    getSubject: () => `Uw verificatiecode - ${COMPANY.tradeName}`,
    getHtml: (meta) => generateVerificationCodeHtml(meta),
  },
  test_email: {
    templateKey: "test_email",
    getSubject: () => `Test Email - ${COMPANY.tradeName}`,
    getHtml: () => generateTestEmailHtml(),
  },
};

interface SendStepEmailParams {
  step: EmailStep;
  toEmail: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, any>;
  skipIdempotencyCheck?: boolean;
}

export async function sendStepEmail(params: SendStepEmailParams): Promise<{
  success: boolean;
  message: string;
  skipped?: boolean;
  logId?: string;
}> {
  const { step, toEmail, entityType, entityId, meta, skipIdempotencyCheck } = params;
  const config = stepConfigs[step];
  
  if (!config) {
    return { success: false, message: `Onbekende email step: ${step}` };
  }

  if (!toEmail || !toEmail.includes("@")) {
    return { success: false, message: "Geen geldig e-mailadres" };
  }

  if (!skipIdempotencyCheck && entityType && entityId) {
    const existingLog = await storage.getEmailLogByTemplateAndEntity(
      config.templateKey,
      entityType,
      entityId
    );
    if (existingLog) {
      return { 
        success: true, 
        message: "Email al eerder verzonden", 
        skipped: true,
        logId: existingLog.id,
      };
    }
  }

  try {
    const result = await sendEmail({
      to: toEmail,
      subject: config.getSubject(meta),
      html: config.getHtml(meta),
      templateKey: config.templateKey,
      entityType,
      entityId,
    });

    return {
      success: result.success,
      message: result.message,
      logId: result.logId,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Onbekende fout bij verzenden email",
    };
  }
}

// Wrapper voor emailSteps die de centrale template uit email.ts gebruikt
interface EmailTemplateOptions {
  preheader?: string;
  showUnsubscribe?: boolean;
}

export function baseEmailTemplate(content: string, options: EmailTemplateOptions = {}): string {
  // Gebruik de centrale template uit email.ts
  const result = centralEmailTemplate({
    subject: "Elevizion",
    preheader: options.preheader,
    bodyHtml: content,
    showUnsubscribe: options.showUnsubscribe,
  });
  return result.html;
}

// Genereer plain-text versie van email content
export function generatePlainText(content: string, meta?: Record<string, any>): string {
  const lines = [
    "ELEVIZION - See Your Business Grow",
    "=" .repeat(40),
    "",
  ];
  
  // Strip HTML tags en converteer naar plain text
  const textContent = content
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n$1\n" + "-".repeat(30) + "\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<strong>(.*?)<\/strong>/gi, "*$1*")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
  lines.push(textContent);
  lines.push("");
  lines.push("-".repeat(40));
  lines.push("Elevizion");
  lines.push("E-mail: info@elevizion.nl");
  lines.push("Telefoon: +31 6 12 34 56 78");
  lines.push("Web: https://elevizion.nl");
  lines.push("");
  lines.push(`© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.`);
  
  return lines.join("\n");
}

function generateAdvertiserCreatedHtml(meta?: Record<string, any>): string {
  const companyName = meta?.companyName || "uw bedrijf";
  const contactName = meta?.contactName || "Geachte klant";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Welkom bij ${COMPANY.tradeName}!</h2>
    <p>Beste ${contactName},</p>
    <p>Hartelijk welkom! Uw bedrijf <strong>${companyName}</strong> is succesvol geregistreerd bij ${COMPANY.tradeName}.</p>
    <p>Wij nemen spoedig contact met u op om de volgende stappen te bespreken.</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateInviteHtml(meta?: Record<string, any>): string {
  const portalUrl = meta?.portalUrl || "#";
  const companyName = meta?.companyName || "uw bedrijf";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Voltooi uw registratie</h2>
    <p>Beste klant,</p>
    <p>Om uw account voor <strong>${companyName}</strong> te activeren, vragen wij u enkele gegevens in te vullen.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Gegevens invullen</a>
    </div>
    <p style="color: #666; font-size: 12px;">Deze link is 7 dagen geldig.</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateOnboardingCompletedHtml(meta?: Record<string, any>): string {
  const companyName = meta?.companyName || "uw bedrijf";
  const contactName = meta?.contactName || "Geachte klant";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Onboarding Voltooid!</h2>
    <p>Beste ${contactName},</p>
    <p>Bedankt voor het invullen van uw gegevens. De onboarding voor <strong>${companyName}</strong> is nu voltooid.</p>
    <p>Wij gaan aan de slag om uw reclame live te zetten. U hoort spoedig van ons!</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateScreenCreatedHtml(meta?: Record<string, any>): string {
  const screenName = meta?.screenName || "Nieuw scherm";
  const locationName = meta?.locationName || "";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Nieuw Scherm Geregistreerd</h2>
    <p>Er is een nieuw scherm geregistreerd in het ${COMPANY.tradeName} netwerk:</p>
    <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <p><strong>Scherm:</strong> ${screenName}</p>
      ${locationName ? `<p><strong>Locatie:</strong> ${locationName}</p>` : ""}
    </div>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateScreenInviteHtml(meta?: Record<string, any>): string {
  const portalUrl = meta?.portalUrl || "#";
  const screenName = meta?.screenName || "uw scherm";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Voltooi uw scherm registratie</h2>
    <p>Beste klant,</p>
    <p>Om het scherm <strong>${screenName}</strong> te activeren, vragen wij u enkele gegevens in te vullen.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Gegevens invullen</a>
    </div>
    <p style="color: #666; font-size: 12px;">Deze link is 7 dagen geldig.</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateScreenOnboardingCompletedHtml(meta?: Record<string, any>): string {
  const screenName = meta?.screenName || "uw scherm";
  const locationName = meta?.locationName || "";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Scherm Onboarding Voltooid!</h2>
    <p>Beste klant,</p>
    <p>De onboarding voor scherm <strong>${screenName}</strong>${locationName ? ` op locatie <strong>${locationName}</strong>` : ""} is nu voltooid.</p>
    <p>Wij gaan aan de slag om het scherm live te zetten. U hoort spoedig van ons!</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateLocationInviteHtml(meta?: Record<string, any>): string {
  const portalUrl = meta?.portalUrl || "#";
  const locationName = meta?.locationName || "uw locatie";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Voltooi uw locatie registratie</h2>
    <p>Beste klant,</p>
    <p>Om de locatie <strong>${locationName}</strong> te activeren voor digitale signage, vragen wij u enkele gegevens in te vullen.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Gegevens invullen</a>
    </div>
    <p style="color: #666; font-size: 12px;">Deze link is 7 dagen geldig.</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateLocationOnboardingCompletedHtml(meta?: Record<string, any>): string {
  const locationName = meta?.locationName || "uw locatie";
  const companyName = meta?.companyName || "";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Locatie Onboarding Voltooid!</h2>
    <p>Beste klant,</p>
    <p>De onboarding voor locatie <strong>${locationName}</strong>${companyName ? ` (${companyName})` : ""} is nu voltooid.</p>
    <p>Wij gaan aan de slag met de installatie. U hoort spoedig van ons!</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateContractSentHtml(meta?: Record<string, any>): string {
  const contractName = meta?.contractName || "Contract";
  const contactName = meta?.contactName || "Geachte klant";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Contract ter ondertekening</h2>
    <p>Beste ${contactName},</p>
    <p>Het contract <strong>${contractName}</strong> is klaar voor ondertekening.</p>
    <p>U ontvangt separaat een uitnodiging om digitaal te tekenen.</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateContractSignedHtml(meta?: Record<string, any>): string {
  const contractName = meta?.contractName || "Contract";
  const contactName = meta?.contactName || "Geachte klant";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Contract Ondertekend!</h2>
    <p>Beste ${contactName},</p>
    <p>Het contract <strong>${contractName}</strong> is succesvol ondertekend.</p>
    <p>U ontvangt een kopie van het getekende document. Wij gaan direct aan de slag!</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateVerificationCodeHtml(meta?: Record<string, any>): string {
  const code = meta?.code || "------";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Uw Verificatiecode</h2>
    <p>Gebruik onderstaande code om uw e-mailadres te verifiëren:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: white; padding: 15px 30px; border-radius: 5px; border: 2px dashed #1e3a5f;">${code}</span>
    </div>
    <p style="color: #666; font-size: 12px;">Deze code is 10 minuten geldig.</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

function generateTestEmailHtml(): string {
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Test Email</h2>
    <p>Dit is een test email vanuit het ${COMPANY.tradeName} Dashboard.</p>
    <p>Als u deze email ontvangt, werkt de email configuratie correct!</p>
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  `);
}

export const availableSteps = Object.keys(stepConfigs) as EmailStep[];
