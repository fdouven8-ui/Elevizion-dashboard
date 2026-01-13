import { db } from "../db";
import { locations, locationOnboardingEvents, verificationCodes } from "@shared/schema";
import { eq, desc, sql, and, or } from "drizzle-orm";
import crypto from "crypto";
import { sendEmail } from "../email";
import { generateContractPdf } from "./contractPdfService";
import { ObjectStorageService } from "../objectStorage";
import { DEFAULT_COMPANY } from "../companyBranding";

const COMPANY = DEFAULT_COMPANY;

const INTAKE_TOKEN_EXPIRY_DAYS = 30;
const CONTRACT_TOKEN_EXPIRY_DAYS = 30;
const OTP_EXPIRY_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_SENDS_PER_HOUR = 3;

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateLocationKey(companyName: string): string {
  const sanitized = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 12);
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LOC-${sanitized}-${random}`;
}

function getBaseUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : "";
}

export async function createLocationInvite(
  companyName: string,
  email: string,
  createdBy: string
): Promise<{ success: boolean; locationId?: string; intakeUrl?: string; error?: string }> {
  try {
    const intakeToken = generateSecureToken();
    const locationKey = generateLocationKey(companyName);
    const expiresAt = new Date(Date.now() + INTAKE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const [location] = await db.insert(locations).values({
      name: companyName,
      email,
      source: "onboarding",
      onboardingStatus: "INVITED_INTAKE",
      intakeToken,
      intakeTokenExpiresAt: expiresAt,
      locationKey,
    }).returning();

    await db.insert(locationOnboardingEvents).values({
      locationId: location.id,
      eventType: "created",
      eventData: { createdBy, email },
    });

    const intakeUrl = `${getBaseUrl()}/onboarding/location/intake/${intakeToken}`;

    await sendEmail({
      to: email,
      subject: `Uitnodiging schermlocatie aanmelding - ${COMPANY.tradeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Welkom bij ${COMPANY.tradeName}</h2>
          <p>Beste ${companyName},</p>
          <p>Je bent uitgenodigd om je aan te melden als schermlocatie bij ${COMPANY.tradeName}. Via het scherm in jouw zaak bereiken adverteerders hun doelgroep én verdien jij een deel van de advertentie-inkomsten.</p>
          <p>Klik op de onderstaande link om je gegevens in te vullen:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${intakeUrl}" style="background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Gegevens invullen</a>
          </p>
          <p style="color: #666; font-size: 14px;">Deze link is ${INTAKE_TOKEN_EXPIRY_DAYS} dagen geldig.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    await db.update(locations)
      .set({ inviteEmailSentAt: new Date(), updatedAt: new Date() })
      .where(eq(locations.id, location.id));

    await db.insert(locationOnboardingEvents).values({
      locationId: location.id,
      eventType: "invite_sent",
      eventData: { email, intakeUrl },
    });

    console.log(`[LocationOnboarding] Invite sent to ${email} for location ${location.id}`);
    return { success: true, locationId: location.id, intakeUrl };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error creating invite:", error);
    return { success: false, error: error.message };
  }
}

export async function validateIntakeToken(
  token: string
): Promise<{ valid: boolean; location?: any; error?: string }> {
  try {
    const [location] = await db.select()
      .from(locations)
      .where(eq(locations.intakeToken, token))
      .limit(1);

    if (!location) {
      return { valid: false, error: "Ongeldige link" };
    }

    if (location.intakeTokenExpiresAt && new Date(location.intakeTokenExpiresAt) < new Date()) {
      return { valid: false, error: "Deze link is verlopen" };
    }

    if (location.intakeTokenUsedAt) {
      return { valid: false, error: "Deze link is al gebruikt" };
    }

    const validStatuses = ["INVITED_INTAKE", "INTAKE_SUBMITTED", "PENDING_REVIEW"];
    if (!validStatuses.includes(location.onboardingStatus || "")) {
      return { valid: false, error: "Je kunt je gegevens niet meer aanpassen" };
    }

    return { valid: true, location };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error validating intake token:", error);
    return { valid: false, error: "Er is een fout opgetreden" };
  }
}

export async function submitIntake(
  token: string,
  data: {
    name: string;
    contactName: string;
    email: string;
    phone: string;
    street: string;
    houseNumber: string;
    zipcode: string;
    city: string;
    locationType: string;
    visitorsPerWeek: number;
    openingHours?: string;
    notes?: string;
  },
  ip: string,
  userAgent: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = await validateIntakeToken(token);
    if (!validation.valid || !validation.location) {
      return { success: false, error: validation.error };
    }

    const location = validation.location;

    await db.update(locations)
      .set({
        name: data.name,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        street: data.street,
        houseNumber: data.houseNumber,
        address: `${data.street} ${data.houseNumber}, ${data.zipcode} ${data.city}`,
        zipcode: data.zipcode,
        city: data.city,
        locationType: data.locationType,
        visitorsPerWeek: data.visitorsPerWeek,
        openingHours: data.openingHours || null,
        notes: data.notes || null,
        onboardingStatus: "PENDING_REVIEW",
        intakeTokenUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(locations.id, location.id));

    await db.insert(locationOnboardingEvents).values({
      locationId: location.id,
      eventType: "intake_submitted",
      eventData: { ip, userAgent, ...data },
    });

    await sendEmail({
      to: data.email,
      subject: "Bedankt – we beoordelen je schermlocatie",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Bedankt voor je aanmelding</h2>
          <p>Beste ${data.contactName},</p>
          <p>We hebben je aanmelding voor <strong>${data.name}</strong> goed ontvangen.</p>
          <p>Ons team beoordeelt nu je locatie. Je hoort snel van ons of je locatie geschikt is voor een ${COMPANY.tradeName} scherm.</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px;"><strong>Ingediende gegevens:</strong></p>
            <p style="margin: 8px 0 0 0; font-size: 14px;">${data.street} ${data.houseNumber}, ${data.zipcode} ${data.city}</p>
            <p style="margin: 4px 0 0 0; font-size: 14px;">Bezoekers per week: ~${data.visitorsPerWeek}</p>
          </div>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    await db.update(locations)
      .set({ intakeConfirmationSentAt: new Date() })
      .where(eq(locations.id, location.id));

    await sendEmail({
      to: "info@elevizion.nl",
      subject: `Nieuwe locatie intake: ${data.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Nieuwe locatie ter beoordeling</h2>
          <p><strong>Bedrijf:</strong> ${data.name}</p>
          <p><strong>Contact:</strong> ${data.contactName}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Telefoon:</strong> ${data.phone}</p>
          <p><strong>Adres:</strong> ${data.street} ${data.houseNumber}, ${data.zipcode} ${data.city}</p>
          <p><strong>Type:</strong> ${data.locationType}</p>
          <p><strong>Bezoekers/week:</strong> ${data.visitorsPerWeek}</p>
          <p style="text-align: center; margin: 20px 0;">
            <a href="${getBaseUrl()}/locations/${location.id}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Bekijk in dashboard</a>
          </p>
        </div>
      `,
    });

    console.log(`[LocationOnboarding] Intake submitted for location ${location.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error submitting intake:", error);
    return { success: false, error: error.message };
  }
}

export async function approveLocation(
  locationId: string,
  reviewedBy: string
): Promise<{ success: boolean; contractUrl?: string; error?: string }> {
  try {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    if (!location) {
      return { success: false, error: "Locatie niet gevonden" };
    }

    if (location.onboardingStatus !== "PENDING_REVIEW") {
      return { success: false, error: "Locatie is niet in review status" };
    }

    const contractToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + CONTRACT_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.update(locations)
      .set({
        onboardingStatus: "APPROVED_AWAITING_CONTRACT",
        reviewedAt: new Date(),
        reviewedBy,
        reviewDecision: "APPROVED",
        contractToken,
        contractTokenExpiresAt: expiresAt,
        intakeToken: null,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));

    await db.insert(locationOnboardingEvents).values({
      locationId,
      eventType: "approved",
      eventData: { reviewedBy },
    });

    const contractUrl = `${getBaseUrl()}/onboarding/location/contract/${contractToken}`;

    await sendEmail({
      to: location.email!,
      subject: "Goedgekeurd – rond je schermlocatie aanmelding af",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">🎉 Je locatie is goedgekeurd!</h2>
          <p>Beste ${location.contactName || location.name},</p>
          <p>Goed nieuws! Na beoordeling hebben we besloten dat <strong>${location.name}</strong> een geschikte locatie is voor een ${COMPANY.tradeName} scherm.</p>
          <p>Er rest nog één stap: je akkoord geven op de voorwaarden en je uitbetalingsgegevens invullen.</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${contractUrl}" style="background: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Aanmelding afronden</a>
          </p>
          <p style="color: #666; font-size: 14px;">Deze link is ${CONTRACT_TOKEN_EXPIRY_DAYS} dagen geldig.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    await db.update(locations)
      .set({ contractEmailSentAt: new Date() })
      .where(eq(locations.id, locationId));

    await db.insert(locationOnboardingEvents).values({
      locationId,
      eventType: "contract_link_sent",
      eventData: { email: location.email },
    });

    console.log(`[LocationOnboarding] Location ${locationId} approved by ${reviewedBy}`);
    return { success: true, contractUrl };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error approving location:", error);
    return { success: false, error: error.message };
  }
}

export async function rejectLocation(
  locationId: string,
  reviewedBy: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    if (!location) {
      return { success: false, error: "Locatie niet gevonden" };
    }

    await db.update(locations)
      .set({
        onboardingStatus: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy,
        reviewDecision: "REJECTED",
        intakeToken: null,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));

    await db.insert(locationOnboardingEvents).values({
      locationId,
      eventType: "rejected",
      eventData: { reviewedBy, reason },
    });

    await sendEmail({
      to: location.email!,
      subject: "Update over je schermlocatie aanmelding",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Update over je aanmelding</h2>
          <p>Beste ${location.contactName || location.name},</p>
          <p>Bedankt voor je interesse in ${COMPANY.tradeName}. Na zorgvuldige beoordeling hebben we helaas besloten dat <strong>${location.name}</strong> op dit moment niet geschikt is voor ons netwerk.</p>
          ${reason ? `<p style="background: #f5f5f5; padding: 12px; border-radius: 6px;">${reason}</p>` : ""}
          <p>Mocht er in de toekomst iets veranderen, neem dan gerust opnieuw contact met ons op.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    console.log(`[LocationOnboarding] Location ${locationId} rejected by ${reviewedBy}`);
    return { success: true };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error rejecting location:", error);
    return { success: false, error: error.message };
  }
}

export async function validateContractToken(
  token: string
): Promise<{ valid: boolean; location?: any; error?: string }> {
  try {
    const [location] = await db.select()
      .from(locations)
      .where(eq(locations.contractToken, token))
      .limit(1);

    if (!location) {
      return { valid: false, error: "Ongeldige link" };
    }

    if (location.contractTokenExpiresAt && new Date(location.contractTokenExpiresAt) < new Date()) {
      return { valid: false, error: "Deze link is verlopen" };
    }

    if (location.contractTokenUsedAt) {
      return { valid: false, error: "Deze link is al gebruikt" };
    }

    const validStatuses = ["APPROVED_AWAITING_CONTRACT", "CONTRACT_PENDING_OTP"];
    if (!validStatuses.includes(location.onboardingStatus || "")) {
      return { valid: false, error: "Je kunt deze link niet meer gebruiken" };
    }

    return { valid: true, location };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error validating contract token:", error);
    return { valid: false, error: "Er is een fout opgetreden" };
  }
}

export async function submitContractDetails(
  token: string,
  data: {
    bankAccountIban: string;
    bankAccountName: string;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    acceptedPayout: boolean;
  },
  ip: string,
  userAgent: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = await validateContractToken(token);
    if (!validation.valid || !validation.location) {
      return { success: false, error: validation.error };
    }

    if (!data.acceptedTerms || !data.acceptedPrivacy || !data.acceptedPayout) {
      return { success: false, error: "Je moet alle voorwaarden accepteren" };
    }

    const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/;
    const cleanIban = data.bankAccountIban.replace(/\s/g, "").toUpperCase();
    if (!ibanRegex.test(cleanIban)) {
      return { success: false, error: "Ongeldig IBAN formaat" };
    }

    const location = validation.location;

    await db.update(locations)
      .set({
        bankAccountIban: cleanIban,
        bankAccountName: data.bankAccountName,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, location.id));

    await db.insert(locationOnboardingEvents).values({
      locationId: location.id,
      eventType: "contract_details_submitted",
      eventData: { 
        ip, 
        userAgent,
        ibanLast4: cleanIban.slice(-4),
        accountName: data.bankAccountName,
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error submitting contract details:", error);
    return { success: false, error: error.message };
  }
}

export async function sendLocationOtp(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = await validateContractToken(token);
    if (!validation.valid || !validation.location) {
      return { success: false, error: validation.error };
    }

    const location = validation.location;

    if (!location.bankAccountIban || !location.bankAccountName) {
      return { success: false, error: "Vul eerst je uitbetalingsgegevens in" };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCodes = await db.select()
      .from(verificationCodes)
      .where(sql`email = ${location.email} AND created_at > ${oneHourAgo}`)
      .limit(MAX_OTP_SENDS_PER_HOUR + 1);

    if (recentCodes.length >= MAX_OTP_SENDS_PER_HOUR) {
      return { success: false, error: "Te veel verzoeken. Probeer het over een uur opnieuw." };
    }

    const otpCode = generateOtpCode();
    const codeHash = hashToken(otpCode);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.insert(verificationCodes).values({
      email: location.email!,
      codeHash,
      expiresAt,
    });

    await db.update(locations)
      .set({
        onboardingStatus: "CONTRACT_PENDING_OTP",
        updatedAt: new Date(),
      })
      .where(eq(locations.id, location.id));

    await sendEmail({
      to: location.email!,
      subject: `Je bevestigingscode - ${COMPANY.tradeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Bevestigingscode</h2>
          <p>Beste ${location.contactName || location.name},</p>
          <p>Gebruik de onderstaande code om je akkoord te bevestigen:</p>
          <div style="background: #f5f5f5; padding: 24px; text-align: center; margin: 24px 0; border-radius: 8px;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otpCode}</span>
          </div>
          <p style="color: #666; font-size: 14px;">Deze code is ${OTP_EXPIRY_MINUTES} minuten geldig.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    await db.insert(locationOnboardingEvents).values({
      locationId: location.id,
      eventType: "otp_sent",
      eventData: { email: location.email },
    });

    console.log(`[LocationOnboarding] OTP sent to ${location.email} for location ${location.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error sending OTP:", error);
    return { success: false, error: error.message };
  }
}

export async function verifyLocationOtp(
  token: string,
  otpCode: string,
  ip: string,
  userAgent: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = await validateContractToken(token);
    if (!validation.valid || !validation.location) {
      return { success: false, error: validation.error };
    }

    const location = validation.location;
    const codeHash = hashToken(otpCode);

    const [codeRecord] = await db.select()
      .from(verificationCodes)
      .where(sql`email = ${location.email} AND code_hash = ${codeHash} AND used_at IS NULL AND expires_at > NOW()`)
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (!codeRecord) {
      const [existingCode] = await db.select()
        .from(verificationCodes)
        .where(sql`email = ${location.email} AND used_at IS NULL AND expires_at > NOW()`)
        .orderBy(desc(verificationCodes.createdAt))
        .limit(1);

      if (existingCode) {
        await db.update(verificationCodes)
          .set({ attempts: existingCode.attempts + 1 })
          .where(eq(verificationCodes.id, existingCode.id));

        if (existingCode.attempts >= MAX_OTP_ATTEMPTS) {
          return { success: false, error: "Teveel pogingen. Vraag een nieuwe code aan." };
        }
      }
      return { success: false, error: "Ongeldige of verlopen code" };
    }

    await db.update(verificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(verificationCodes.id, codeRecord.id));

    // Update status first
    await db.update(locations)
      .set({
        onboardingStatus: "CONTRACT_ACCEPTED",
        status: "ready_for_pi",
        contractTokenUsedAt: new Date(),
        contractToken: null,
        acceptedTermsAt: new Date(),
        acceptedTermsIp: ip,
        acceptedTermsUserAgent: userAgent,
        acceptedTermsVersion: "1.0",
        updatedAt: new Date(),
      })
      .where(eq(locations.id, location.id));

    // Generate bundled contract PDF
    let bundledPdfUrl = "";
    try {
      const { generateContractBundle, getLocationBundleContext } = await import("./contractBundleService");
      const context = await getLocationBundleContext(location.id);
      if (context) {
        // Override audit data with current values
        context.auditData = {
          acceptedAt: new Date(),
          ip,
          userAgent,
          acceptedTerms: true,
          acceptedPrivacy: true,
        };
        const result = await generateContractBundle(context);
        if (result.success && result.bundledPdfUrl) {
          bundledPdfUrl = result.bundledPdfUrl;
        }
      }
    } catch (bundleErr) {
      console.error("[LocationOnboarding] Error generating bundle PDF:", bundleErr);
    }

    // Re-fetch to get updated bundledPdfUrl
    const [updatedLocation] = await db.select().from(locations).where(eq(locations.id, location.id));
    const pdfUrl = bundledPdfUrl || updatedLocation?.bundledPdfUrl;

    // Update with PDF URL
    if (pdfUrl) {
      await db.update(locations)
        .set({ acceptedTermsPdfUrl: pdfUrl })
        .where(eq(locations.id, location.id));
    }

    await db.insert(locationOnboardingEvents).values({
      locationId: location.id,
      eventType: "contract_accepted",
      eventData: { ip, userAgent, bundledPdfUrl: pdfUrl },
    });

    const pdfLink = pdfUrl 
      ? `<div style="background: #eff6ff; border: 1px solid #2563eb; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-weight: 600; color: #1e40af;">📄 Jouw contractbundel</p>
          <p style="margin: 8px 0 0 0;"><a href="${pdfUrl}" style="color: #2563eb;">Download je contractdocumenten (PDF)</a></p>
        </div>`
      : "";

    await sendEmail({
      to: location.email!,
      subject: "Bevestiging – je schermlocatie is afgerond",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">🎉 Je aanmelding is compleet!</h2>
          <p>Beste ${location.contactName || location.name},</p>
          <p>Bedankt voor je akkoord! De aanmelding van <strong>${location.name}</strong> is nu volledig afgerond.</p>
          ${pdfLink}
          <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #86efac;">
            <p style="margin: 0; font-weight: bold; color: #166534;">Wat gebeurt er nu?</p>
            <p style="margin: 8px 0 0 0; color: #166534;">We nemen binnenkort contact met je op om de installatie van het scherm te plannen.</p>
          </div>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    await db.update(locations)
      .set({ completionEmailSentAt: new Date() })
      .where(eq(locations.id, location.id));

    await sendEmail({
      to: "info@elevizion.nl",
      subject: `Schermlocatie akkoord afgerond: ${location.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Schermlocatie akkoord voltooid</h2>
          <p><strong>Bedrijf:</strong> ${location.name}</p>
          <p><strong>Contact:</strong> ${location.contactName}</p>
          <p><strong>Adres:</strong> ${location.address || `${location.street} ${location.houseNumber}, ${location.zipcode} ${location.city}`}</p>
          <p><strong>IBAN:</strong> ****${location.bankAccountIban?.slice(-4) || "****"}</p>
          <p><strong>Bezoekers/week:</strong> ${location.visitorsPerWeek}</p>
          ${pdfUrl ? `<p><a href="${pdfUrl}">Download contractbundel (PDF)</a></p>` : ""}
          <p style="text-align: center; margin: 20px 0;">
            <a href="${getBaseUrl()}/locations/${location.id}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Bekijk in dashboard</a>
          </p>
        </div>
      `,
    });

    console.log(`[LocationOnboarding] Contract accepted for location ${location.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("[LocationOnboarding] Error verifying OTP:", error);
    return { success: false, error: error.message };
  }
}

async function generateLocationContractPdf(
  location: any,
  ip: string,
  userAgent: string
): Promise<Buffer> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        h1 { color: #1a1a1a; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
        .section { margin: 20px 0; padding: 15px; background: #f9fafb; border-radius: 8px; }
        .label { font-weight: bold; color: #374151; }
        .value { margin-left: 10px; }
        .audit { margin-top: 40px; padding: 20px; background: #fef3c7; border-radius: 8px; font-size: 12px; }
        .footer { margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>Akkoordverklaring Schermlocatie</h1>
      
      <div class="section">
        <h2>Locatiegegevens</h2>
        <p><span class="label">Bedrijfsnaam:</span><span class="value">${location.name}</span></p>
        <p><span class="label">Contactpersoon:</span><span class="value">${location.contactName}</span></p>
        <p><span class="label">E-mail:</span><span class="value">${location.email}</span></p>
        <p><span class="label">Telefoon:</span><span class="value">${location.phone || "-"}</span></p>
        <p><span class="label">Adres:</span><span class="value">${location.street} ${location.houseNumber}, ${location.zipcode} ${location.city}</span></p>
        <p><span class="label">Type locatie:</span><span class="value">${location.locationType || "-"}</span></p>
        <p><span class="label">Bezoekers/week:</span><span class="value">${location.visitorsPerWeek}</span></p>
      </div>

      <div class="section">
        <h2>Uitbetalingsgegevens</h2>
        <p><span class="label">IBAN:</span><span class="value">****${location.bankAccountIban?.slice(-4) || "****"}</span></p>
        <p><span class="label">Tenaamstelling:</span><span class="value">${location.bankAccountName}</span></p>
      </div>

      <div class="section">
        <h2>Akkoord</h2>
        <p>✓ Akkoord met Algemene Voorwaarden Schermlocatie (v1.0)</p>
        <p>✓ Akkoord met Privacyverklaring</p>
        <p>✓ Akkoord met uitbetalingsvoorwaarden</p>
      </div>

      <div class="audit">
        <h3>Audit Trail</h3>
        <p><span class="label">Datum/tijd:</span> ${new Date().toLocaleString("nl-NL")}</p>
        <p><span class="label">E-mail:</span> ${location.email}</p>
        <p><span class="label">IP-adres:</span> ${ip}</p>
        <p><span class="label">Browser:</span> ${userAgent.substring(0, 100)}</p>
        <p><span class="label">LocationKey:</span> ${location.locationKey || "-"}</p>
      </div>

      <div class="footer">
        <p>${COMPANY.legalName} h/o ${COMPANY.tradeName} | Dit document is digitaal ondertekend</p>
        <p>Gegenereerd op ${new Date().toLocaleString("nl-NL")}</p>
      </div>
    </body>
    </html>
  `;

  try {
    const pdfBuffer = await generateContractPdf(html);
    return pdfBuffer;
  } catch (error) {
    console.error("[LocationOnboarding] Error generating PDF, using fallback:", error);
    return Buffer.from(html, "utf-8");
  }
}

export async function resendIntakeLink(locationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    if (!location) {
      return { success: false, error: "Locatie niet gevonden" };
    }

    if (!["INVITED_INTAKE", "INTAKE_SUBMITTED", "PENDING_REVIEW"].includes(location.onboardingStatus || "")) {
      return { success: false, error: "Kan intake link niet meer versturen" };
    }

    const intakeToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + INTAKE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.update(locations)
      .set({
        intakeToken,
        intakeTokenExpiresAt: expiresAt,
        intakeTokenUsedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));

    const intakeUrl = `${getBaseUrl()}/onboarding/location/intake/${intakeToken}`;

    await sendEmail({
      to: location.email!,
      subject: "Herinnering: Vul je schermlocatie gegevens in - ${COMPANY.tradeName}",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Herinnering: Gegevens invullen</h2>
          <p>Beste ${location.contactName || location.name},</p>
          <p>Je hebt je aanmelding als schermlocatie nog niet afgerond. Klik op de link om je gegevens in te vullen:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${intakeUrl}" style="background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Gegevens invullen</a>
          </p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resendContractLink(locationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
    if (!location) {
      return { success: false, error: "Locatie niet gevonden" };
    }

    if (!["APPROVED_AWAITING_CONTRACT", "CONTRACT_PENDING_OTP"].includes(location.onboardingStatus || "")) {
      return { success: false, error: "Kan contract link niet versturen" };
    }

    const contractToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + CONTRACT_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.update(locations)
      .set({
        contractToken,
        contractTokenExpiresAt: expiresAt,
        contractTokenUsedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));

    const contractUrl = `${getBaseUrl()}/onboarding/location/contract/${contractToken}`;

    await sendEmail({
      to: location.email!,
      subject: "Herinnering: Rond je schermlocatie aanmelding af - ${COMPANY.tradeName}",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Herinnering: Aanmelding afronden</h2>
          <p>Beste ${location.contactName || location.name},</p>
          <p>Je schermlocatie is goedgekeurd, maar je hebt je akkoord nog niet gegeven. Klik op de link om af te ronden:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${contractUrl}" style="background: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Aanmelding afronden</a>
          </p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Team ${COMPANY.tradeName}</p>
        </div>
      `,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
