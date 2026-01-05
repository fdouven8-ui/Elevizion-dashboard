/**
 * Email Steps - Central mapping for all system email triggers
 * Each step defines templateKey, subject, and idempotency rules
 */

import { sendEmail } from "./email";
import { storage } from "./storage";

export type EmailStep = 
  | "advertiser_created"
  | "advertiser_invite_sent"
  | "advertiser_onboarding_completed"
  | "screen_created"
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
    getSubject: (meta) => `Welkom bij Elevizion - ${meta?.companyName || "Nieuwe Adverteerder"}`,
    getHtml: (meta) => generateAdvertiserCreatedHtml(meta),
  },
  advertiser_invite_sent: {
    templateKey: "advertiser_invite_sent",
    getSubject: () => "Voltooi uw registratie bij Elevizion",
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
    getSubject: () => "Uw verificatiecode - Elevizion",
    getHtml: (meta) => generateVerificationCodeHtml(meta),
  },
  test_email: {
    templateKey: "test_email",
    getSubject: () => "Test Email - Elevizion",
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

function baseEmailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Elevizion</h1>
    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">See Your Business Grow</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
    ${content}
  </div>
  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
  </div>
</body>
</html>`;
}

function generateAdvertiserCreatedHtml(meta?: Record<string, any>): string {
  const companyName = meta?.companyName || "uw bedrijf";
  const contactName = meta?.contactName || "Geachte klant";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Welkom bij Elevizion!</h2>
    <p>Beste ${contactName},</p>
    <p>Hartelijk welkom! Uw bedrijf <strong>${companyName}</strong> is succesvol geregistreerd bij Elevizion.</p>
    <p>Wij nemen spoedig contact met u op om de volgende stappen te bespreken.</p>
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
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
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
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
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
  `);
}

function generateScreenCreatedHtml(meta?: Record<string, any>): string {
  const screenName = meta?.screenName || "Nieuw scherm";
  const locationName = meta?.locationName || "";
  
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Nieuw Scherm Geregistreerd</h2>
    <p>Er is een nieuw scherm geregistreerd in het Elevizion netwerk:</p>
    <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <p><strong>Scherm:</strong> ${screenName}</p>
      ${locationName ? `<p><strong>Locatie:</strong> ${locationName}</p>` : ""}
    </div>
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
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
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
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
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
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
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
  `);
}

function generateTestEmailHtml(): string {
  return baseEmailTemplate(`
    <h2 style="color: #1e3a5f; margin-top: 0;">Test Email</h2>
    <p>Dit is een test email vanuit het Elevizion Dashboard.</p>
    <p>Als u deze email ontvangt, werkt de email configuratie correct!</p>
    <p>Met vriendelijke groet,<br><strong>Team Elevizion</strong></p>
  `);
}

export const availableSteps = Object.keys(stepConfigs) as EmailStep[];
