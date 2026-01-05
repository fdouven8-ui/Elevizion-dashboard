/**
 * Unified Onboarding Service
 * 
 * Provides consistent onboarding logic for advertisers, screens, and locations.
 * Handles status transitions, email triggers, and integration syncs.
 */

import crypto from "crypto";
import { storage } from "../storage";
import { sendStepEmail, EmailStep } from "../emailSteps";

export type OnboardingEntityType = "advertiser" | "screen" | "location";
export type OnboardingStatus = "draft" | "invited" | "in_progress" | "completed";

export interface OnboardingInviteResult {
  success: boolean;
  message: string;
  portalUrl?: string;
  tokenExpiresAt?: Date;
}

export interface OnboardingCompleteResult {
  success: boolean;
  message: string;
  moneybirdLinked?: boolean;
  emailSent?: boolean;
  alreadyCompleted?: boolean;
}

/**
 * Generate a unique onboarding invite URL with token
 */
export async function generateOnboardingInvite(
  entityType: OnboardingEntityType,
  entityId: string,
  email: string,
  baseUrl: string
): Promise<OnboardingInviteResult> {
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await storage.createOnboardingInviteToken({
      tokenHash,
      entityType,
      entityId,
      expiresAt,
    });

    const portalUrl = `${baseUrl}/onboarding?token=${token}&type=${entityType}`;

    const emailStep = getInviteEmailStep(entityType);
    const meta = await getEntityMeta(entityType, entityId, { portalUrl });

    await sendStepEmail({
      step: emailStep,
      toEmail: email,
      entityType,
      entityId,
      meta,
    }).catch((err) => console.error(`[Onboarding] ${entityType} invite email failed:`, err));

    return {
      success: true,
      message: "Uitnodiging verzonden",
      portalUrl,
      tokenExpiresAt: expiresAt,
    };
  } catch (error: any) {
    console.error(`[Onboarding] Failed to generate invite for ${entityType}:`, error);
    return {
      success: false,
      message: error.message || "Fout bij genereren uitnodiging",
    };
  }
}

/**
 * Mark onboarding as completed (idempotent - won't complete twice)
 */
export async function completeOnboarding(
  entityType: OnboardingEntityType,
  entityId: string,
  email?: string
): Promise<OnboardingCompleteResult> {
  try {
    const currentStatus = await getOnboardingStatus(entityType, entityId);

    if (currentStatus === "completed") {
      return {
        success: true,
        message: "Onboarding was al voltooid",
        alreadyCompleted: true,
      };
    }

    await setOnboardingStatus(entityType, entityId, "completed");

    let emailSent = false;
    if (email) {
      const emailStep = getCompletedEmailStep(entityType);
      const meta = await getEntityMeta(entityType, entityId);

      const result = await sendStepEmail({
        step: emailStep,
        toEmail: email,
        entityType,
        entityId,
        meta,
      }).catch((err) => {
        console.error(`[Onboarding] ${entityType} completion email failed:`, err);
        return { success: false };
      });

      emailSent = result?.success || false;
    }

    return {
      success: true,
      message: "Onboarding voltooid",
      emailSent,
    };
  } catch (error: any) {
    console.error(`[Onboarding] Failed to complete ${entityType}:`, error);
    return {
      success: false,
      message: error.message || "Fout bij voltooien onboarding",
    };
  }
}

/**
 * Resolve screen by ID (supports both UUID and SCREEN_ID format like EVZ-001)
 */
async function resolveScreen(idOrScreenId: string) {
  let screen = await storage.getScreen(idOrScreenId);
  if (!screen) {
    screen = await storage.getScreenByScreenId(idOrScreenId);
  }
  return screen;
}

/**
 * Get current onboarding status for an entity
 */
export async function getOnboardingStatus(
  entityType: OnboardingEntityType,
  entityId: string
): Promise<OnboardingStatus | null> {
  switch (entityType) {
    case "advertiser": {
      const advertiser = await storage.getAdvertiser(entityId);
      if (!advertiser) return null;
      return (advertiser.onboardingStatus as OnboardingStatus) || "draft";
    }
    case "screen": {
      const screen = await resolveScreen(entityId);
      if (!screen) return null;
      return (screen.onboardingStatus as OnboardingStatus) || "draft";
    }
    case "location": {
      const location = await storage.getLocation(entityId);
      if (!location) return null;
      return (location.onboardingStatus as OnboardingStatus) || "draft";
    }
    default:
      return null;
  }
}

/**
 * Set onboarding status for an entity (idempotent)
 * Returns the internal entity ID used for the update
 */
async function setOnboardingStatus(
  entityType: OnboardingEntityType,
  entityId: string,
  status: OnboardingStatus
): Promise<string | null> {
  switch (entityType) {
    case "advertiser": {
      const advertiser = await storage.getAdvertiser(entityId);
      if (!advertiser) return null;
      await storage.updateAdvertiser(advertiser.id, { onboardingStatus: status });
      return advertiser.id;
    }
    case "screen": {
      const screen = await resolveScreen(entityId);
      if (!screen) return null;
      await storage.updateScreen(screen.id, { onboardingStatus: status });
      return screen.id;
    }
    case "location": {
      const location = await storage.getLocation(entityId);
      if (!location) return null;
      await storage.updateLocation(location.id, { 
        onboardingStatus: status,
        status: status === "completed" ? "active" : undefined,
      });
      return location.id;
    }
    default:
      return null;
  }
}

/**
 * Get the appropriate email step for invite based on entity type
 */
function getInviteEmailStep(entityType: OnboardingEntityType): EmailStep {
  switch (entityType) {
    case "advertiser":
      return "advertiser_invite_sent";
    case "screen":
      return "screen_invite_sent";
    case "location":
      return "location_invite_sent";
  }
}

/**
 * Get the appropriate email step for completion based on entity type
 */
function getCompletedEmailStep(entityType: OnboardingEntityType): EmailStep {
  switch (entityType) {
    case "advertiser":
      return "advertiser_onboarding_completed";
    case "screen":
      return "screen_onboarding_completed";
    case "location":
      return "location_onboarding_completed";
  }
}

/**
 * Get entity metadata for email templates
 * Uses resolveScreen for screens to support SCREEN_ID format
 */
async function getEntityMeta(
  entityType: OnboardingEntityType,
  entityId: string,
  extra?: Record<string, any>
): Promise<Record<string, any>> {
  const base = { ...extra };

  switch (entityType) {
    case "advertiser": {
      const advertiser = await storage.getAdvertiser(entityId);
      return {
        ...base,
        companyName: advertiser?.companyName,
        contactName: advertiser?.contactName,
        email: advertiser?.email,
      };
    }
    case "screen": {
      const screen = await resolveScreen(entityId);
      const location = screen?.locationId ? await storage.getLocation(screen.locationId) : null;
      return {
        ...base,
        screenName: screen?.name || screen?.screenId,
        screenId: screen?.screenId,
        locationName: location?.name,
      };
    }
    case "location": {
      const location = await storage.getLocation(entityId);
      return {
        ...base,
        locationName: location?.name,
        companyName: location?.contactName,
        email: location?.email,
      };
    }
    default:
      return base;
  }
}

/**
 * Validate an onboarding invite token
 */
export async function validateOnboardingToken(
  token: string
): Promise<{
  valid: boolean;
  entityType?: OnboardingEntityType;
  entityId?: string;
  error?: string;
}> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const inviteToken = await storage.getOnboardingInviteTokenByHash(tokenHash);

  if (!inviteToken) {
    return { valid: false, error: "Token niet gevonden" };
  }

  if (inviteToken.usedAt) {
    return { valid: false, error: "Token is al gebruikt" };
  }

  if (new Date() > new Date(inviteToken.expiresAt)) {
    return { valid: false, error: "Token is verlopen" };
  }

  return {
    valid: true,
    entityType: inviteToken.entityType as OnboardingEntityType,
    entityId: inviteToken.entityId,
  };
}

/**
 * Mark an onboarding token as used
 */
export async function markTokenUsed(token: string): Promise<boolean> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const inviteToken = await storage.getOnboardingInviteTokenByHash(tokenHash);

  if (!inviteToken) {
    return false;
  }

  await storage.markOnboardingInviteTokenUsed(inviteToken.id);
  return true;
}

/**
 * Get debug info for an entity's onboarding status
 * Uses resolveScreen for screens to support SCREEN_ID format
 */
export async function getOnboardingDebugInfo(
  entityType: OnboardingEntityType,
  entityId: string
): Promise<Record<string, any>> {
  const status = await getOnboardingStatus(entityType, entityId);
  const meta = await getEntityMeta(entityType, entityId);

  const result: Record<string, any> = {
    entityType,
    entityId,
    onboardingStatus: status,
    ...meta,
    linkedIds: {},
  };

  switch (entityType) {
    case "advertiser": {
      const advertiser = await storage.getAdvertiser(entityId);
      result.linkedIds.moneybirdContactId = advertiser?.moneybirdContactId || null;
      result.source = advertiser?.source || "manual";
      break;
    }
    case "screen": {
      const screen = await resolveScreen(entityId);
      result.linkedIds.yodeckPlayerId = screen?.yodeckPlayerId || null;
      result.linkedIds.yodeckUuid = screen?.yodeckUuid || null;
      result.linkedIds.locationId = screen?.locationId || null;
      result.screenId = screen?.screenId;
      result.yodeckStatus = screen?.status;
      result.resolvedId = screen?.id;
      break;
    }
    case "location": {
      const location = await storage.getLocation(entityId);
      result.linkedIds.moneybirdContactId = location?.moneybirdContactId || null;
      result.source = location?.source || "manual";
      break;
    }
  }

  return result;
}
