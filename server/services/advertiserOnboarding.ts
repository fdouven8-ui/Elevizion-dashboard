import crypto from "crypto";
import { db } from "../db";
import { advertisers, portalTokens, verificationCodes } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { sendEmail } from "../email";
import { storage } from "../storage";
import { DEFAULT_COMPANY } from "../companyBranding";
import { dispatchMailEvent } from "./mailEventService";

const COMPANY = DEFAULT_COMPANY;

export type AdvertiserOnboardingStatus = 
  | "INVITED"
  | "DETAILS_SUBMITTED"
  | "PACKAGE_SELECTED"
  | "CONTRACT_PENDING_OTP"
  | "CONTRACT_ACCEPTED"
  | "READY_FOR_ASSET"
  | "ASSET_RECEIVED"
  | "LIVE";

export type PackageType = "SINGLE" | "TRIPLE" | "TEN" | "CUSTOM";

export const PACKAGE_OPTIONS: Record<PackageType, { screens: number; price: number }> = {
  SINGLE: { screens: 1, price: 49.99 },
  TRIPLE: { screens: 3, price: 129.99 },
  TEN: { screens: 10, price: 299.99 },
  CUSTOM: { screens: 0, price: 0 },
};

function generateLinkKey(companyName: string): string {
  const sanitized = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 20);
  const randomChars = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `ADV-${sanitized}-${randomChars}`;
}

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function inviteAdvertiser(
  companyName: string,
  email: string,
  baseUrl: string
): Promise<{ success: boolean; advertiserId?: string; portalUrl?: string; error?: string }> {
  try {
    const linkKey = generateLinkKey(companyName);
    
    const [advertiser] = await db.insert(advertisers).values({
      companyName,
      contactName: "",
      email,
      onboardingStatus: "INVITED",
      linkKey,
      linkKeyGeneratedAt: new Date(),
    }).returning();

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await db.insert(portalTokens).values({
      advertiserId: advertiser.id,
      tokenHash,
      expiresAt,
    });

    const portalUrl = `${baseUrl}/advertiser-onboarding/${token}`;

    await sendEmail({
      to: email,
      subject: "Welkom bij Elevizion - Vul uw gegevens in",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Welkom bij Elevizion!</h2>
          <p>Beste ${companyName},</p>
          <p>U bent uitgenodigd om adverteerder te worden bij Elevizion. Klik op onderstaande link om uw gegevens in te vullen en uw pakket te kiezen:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" style="background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">Start uw aanmelding</a>
          </p>
          <p style="color: #666; font-size: 14px;">Deze link is 14 dagen geldig.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Elevizion</p>
        </div>
      `,
    });

    await db.update(advertisers)
      .set({ inviteEmailSentAt: new Date() })
      .where(eq(advertisers.id, advertiser.id));

    return {
      success: true,
      advertiserId: advertiser.id,
      portalUrl,
    };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error inviting:", error);
    return { success: false, error: error.message };
  }
}

export async function submitAdvertiserDetails(
  advertiserId: string,
  details: {
    companyName: string;
    contactName: string;
    email: string;
    phone?: string;
    street?: string;
    zipcode?: string;
    city?: string;
    country?: string;
    vatNumber?: string;
    kvkNumber?: string;
    iban?: string;
    ibanAccountHolder?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
    if (!advertiser) {
      return { success: false, error: "Adverteerder niet gevonden" };
    }

    await db.update(advertisers)
      .set({
        ...details,
        onboardingStatus: "DETAILS_SUBMITTED",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error submitting details:", error);
    return { success: false, error: error.message };
  }
}

export async function selectPackage(
  advertiserId: string,
  packageType: PackageType,
  customNotes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
    if (!advertiser) {
      return { success: false, error: "Adverteerder niet gevonden" };
    }

    const packageInfo = PACKAGE_OPTIONS[packageType];

    await db.update(advertisers)
      .set({
        packageType,
        screensIncluded: packageType === "CUSTOM" ? null : packageInfo.screens,
        packagePrice: packageType === "CUSTOM" ? null : packageInfo.price.toString(),
        packageNotes: packageType === "CUSTOM" ? customNotes : null,
        onboardingStatus: "PACKAGE_SELECTED",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error selecting package:", error);
    return { success: false, error: error.message };
  }
}

export async function sendAcceptanceOtp(
  advertiserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
    if (!advertiser) {
      return { success: false, error: "Adverteerder niet gevonden" };
    }

    if (advertiser.onboardingStatus !== "PACKAGE_SELECTED") {
      return { success: false, error: "Selecteer eerst een pakket" };
    }

    const otpCode = generateOtpCode();
    const codeHash = hashCode(otpCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(verificationCodes).values({
      email: advertiser.email,
      codeHash,
      expiresAt,
    });

    await db.update(advertisers)
      .set({
        onboardingStatus: "CONTRACT_PENDING_OTP",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    await sendEmail({
      to: advertiser.email,
      subject: "Uw bevestigingscode - Elevizion",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Bevestigingscode</h2>
          <p>Beste ${advertiser.contactName || advertiser.companyName},</p>
          <p>Gebruik onderstaande code om uw akkoord te bevestigen:</p>
          <div style="background: #f5f5f5; padding: 24px; text-align: center; margin: 24px 0; border-radius: 12px;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #2563eb;">${otpCode}</span>
          </div>
          <p style="color: #666;">Deze code is 15 minuten geldig.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Elevizion</p>
        </div>
      `,
    });

    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error sending OTP:", error);
    return { success: false, error: error.message };
  }
}

export async function verifyAcceptanceOtp(
  advertiserId: string,
  otpCode: string,
  ip: string,
  userAgent: string,
  acceptedTerms: boolean,
  acceptedPrivacy: boolean,
  acceptedSepa: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!acceptedTerms || !acceptedPrivacy || !acceptedSepa) {
      return { success: false, error: "Alle voorwaarden moeten geaccepteerd worden" };
    }

    const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
    if (!advertiser) {
      return { success: false, error: "Adverteerder niet gevonden" };
    }

    const codeHash = hashCode(otpCode);
    const [codeRecord] = await db.select().from(verificationCodes)
      .where(sql`email = ${advertiser.email} AND code_hash = ${codeHash} AND used_at IS NULL AND expires_at > NOW()`)
      .limit(1);

    if (!codeRecord) {
      return { success: false, error: "Ongeldige of verlopen code" };
    }

    await db.update(verificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(verificationCodes.id, codeRecord.id));

    await db.update(advertisers)
      .set({
        onboardingStatus: "CONTRACT_ACCEPTED",
        sepaMandate: true,
        sepaMandateDate: new Date().toISOString().split("T")[0],
        sepaMandateReference: `EVZ-${new Date().toISOString().slice(0,10).replace(/-/g, "")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
        acceptedTermsAt: new Date(),
        acceptedTermsIp: ip,
        acceptedTermsUserAgent: userAgent,
        acceptedTermsVersion: "v1.0",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    console.log(`[AdvertiserOnboarding] Acceptance verified for ${advertiserId}`);
    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error verifying OTP:", error);
    return { success: false, error: error.message };
  }
}

export async function transitionToReadyForAsset(
  advertiserId: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
    if (!advertiser) {
      return { success: false, error: "Adverteerder niet gevonden" };
    }

    if (advertiser.onboardingStatus !== "CONTRACT_ACCEPTED") {
      return { success: false, error: "Contract moet eerst geaccepteerd worden" };
    }

    // Generate bundled PDF asynchronously (don't block)
    try {
      const { generateContractBundle, getAdvertiserBundleContext } = await import("./contractBundleService");
      const context = await getAdvertiserBundleContext(advertiserId);
      if (context) {
        await generateContractBundle(context);
      }
    } catch (bundleError) {
      console.error("[AdvertiserOnboarding] Error generating bundle PDF:", bundleError);
    }

    // Use centralized mail event service (idempotent)
    const mailResult = await dispatchMailEvent("ADVERTISER_CONTRACT_ACCEPTED", advertiserId, baseUrl);
    if (!mailResult.success && !mailResult.skipped) {
      console.warn("[AdvertiserOnboarding] Mail dispatch warning:", mailResult.reason);
    }

    await db.update(advertisers)
      .set({
        onboardingStatus: "READY_FOR_ASSET",
        whatnowEmailSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error transitioning to ready:", error);
    return { success: false, error: error.message };
  }
}

export async function markAssetReceived(
  advertiserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.update(advertisers)
      .set({
        onboardingStatus: "ASSET_RECEIVED",
        assetStatus: "received",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error marking asset received:", error);
    return { success: false, error: error.message };
  }
}

export async function markLive(
  advertiserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.update(advertisers)
      .set({
        onboardingStatus: "LIVE",
        assetStatus: "live",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    return { success: true };
  } catch (error: any) {
    console.error("[AdvertiserOnboarding] Error marking live:", error);
    return { success: false, error: error.message };
  }
}

export async function getOnboardingProgress(
  advertiserId: string
): Promise<{
  status: AdvertiserOnboardingStatus | null;
  linkKey: string | null;
  package: { type: string | null; screens: number | null; price: string | null } | null;
  accepted: boolean;
  assetStatus: string | null;
} | null> {
  try {
    const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
    if (!advertiser) return null;

    return {
      status: advertiser.onboardingStatus as AdvertiserOnboardingStatus,
      linkKey: advertiser.linkKey,
      package: {
        type: advertiser.packageType,
        screens: advertiser.screensIncluded,
        price: advertiser.packagePrice,
      },
      accepted: !!advertiser.acceptedTermsAt,
      assetStatus: advertiser.assetStatus,
    };
  } catch (error) {
    console.error("[AdvertiserOnboarding] Error getting progress:", error);
    return null;
  }
}

export async function findAdvertiserByLinkKey(
  linkKey: string
): Promise<{ id: string; companyName: string } | null> {
  try {
    const [advertiser] = await db.select({
      id: advertisers.id,
      companyName: advertisers.companyName,
    }).from(advertisers).where(eq(advertisers.linkKey, linkKey));
    
    return advertiser || null;
  } catch (error) {
    console.error("[AdvertiserOnboarding] Error finding by linkKey:", error);
    return null;
  }
}
