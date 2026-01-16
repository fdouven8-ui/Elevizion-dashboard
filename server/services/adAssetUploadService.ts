import { db } from '../db';
import { adAssets, advertisers, portalTokens } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  extractVideoMetadataWithDetails,
  validateVideoMetadata,
  getVideoSpecsForDuration,
  VideoValidationResult,
  DEFAULT_VIDEO_DURATION_SECONDS,
} from './videoMetadataService';
import { ObjectStorageService } from '../objectStorage';
import { dispatchMailEvent } from './mailEventService';

const objectStorage = new ObjectStorageService();

export interface UploadResult {
  success: boolean;
  assetId?: string;
  storedFilename?: string;
  validation: VideoValidationResult;
  message: string;
}

export interface PortalContext {
  advertiserId: string;
  linkKey: string;
  contractDuration: number;
  companyName: string;
  strictResolution: boolean;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface TokenValidationResult {
  success: boolean;
  context?: PortalContext;
  reason?: 'not_found' | 'expired' | 'already_used' | 'no_advertiser' | 'no_linkkey' | 'error';
  details?: {
    tokenCreatedAt?: Date | null;
    expiresAt?: Date | null;
    usedAt?: Date | null;
    now: Date;
  };
}

export async function validatePortalToken(token: string, recordAccess = false): Promise<PortalContext | null> {
  const result = await validatePortalTokenWithDetails(token, recordAccess);
  return result.context || null;
}

export async function validatePortalTokenWithDetails(token: string, recordAccess = false): Promise<TokenValidationResult> {
  const now = new Date();
  
  try {
    const tokenHash = hashToken(token);
    
    const portalToken = await db.query.portalTokens.findFirst({
      where: eq(portalTokens.tokenHash, tokenHash),
    });
    
    if (!portalToken) {
      console.log('[UploadToken] REJECTED - not_found:', {
        tokenPrefix: token.slice(0, 8) + '...',
        reason: 'not_found',
        now: now.toISOString(),
      });
      return { 
        success: false, 
        reason: 'not_found',
        details: { now }
      };
    }
    
    // Check if token is expired
    if (portalToken.expiresAt && new Date(portalToken.expiresAt) < now) {
      console.log('[UploadToken] REJECTED - expired:', {
        tokenPrefix: token.slice(0, 8) + '...',
        reason: 'expired',
        createdAt: portalToken.createdAt?.toISOString(),
        expiresAt: portalToken.expiresAt?.toISOString(),
        now: now.toISOString(),
        expiredAgo: Math.round((now.getTime() - new Date(portalToken.expiresAt).getTime()) / 1000 / 60) + ' minutes',
      });
      return { 
        success: false, 
        reason: 'expired',
        details: {
          tokenCreatedAt: portalToken.createdAt,
          expiresAt: portalToken.expiresAt,
          usedAt: portalToken.usedAt,
          now,
        }
      };
    }
    
    // Note: Upload tokens can be used multiple times (unlike one-time portal tokens)
    // The usedAt field tracks first access for analytics, not single-use
    
    const advertiser = await db.query.advertisers.findFirst({
      where: eq(advertisers.id, portalToken.advertiserId),
    });
    
    if (!advertiser) {
      console.log('[UploadToken] REJECTED - no_advertiser:', {
        tokenPrefix: token.slice(0, 8) + '...',
        reason: 'no_advertiser',
        advertiserId: portalToken.advertiserId,
        now: now.toISOString(),
      });
      return { 
        success: false, 
        reason: 'no_advertiser',
        details: {
          tokenCreatedAt: portalToken.createdAt,
          expiresAt: portalToken.expiresAt,
          now,
        }
      };
    }
    
    if (!advertiser.linkKey) {
      console.log('[UploadToken] REJECTED - no_linkkey:', {
        tokenPrefix: token.slice(0, 8) + '...',
        reason: 'no_linkkey',
        advertiserId: advertiser.id,
        companyName: advertiser.companyName,
        now: now.toISOString(),
      });
      return { 
        success: false, 
        reason: 'no_linkkey',
        details: {
          tokenCreatedAt: portalToken.createdAt,
          expiresAt: portalToken.expiresAt,
          now,
        }
      };
    }
    
    // Record first access for analytics
    if (recordAccess && !portalToken.usedAt) {
      await db.update(portalTokens)
        .set({ usedAt: now })
        .where(eq(portalTokens.tokenHash, tokenHash));
      console.log('[UploadToken] First access recorded:', token.slice(0, 8) + '...');
    }
    
    console.log('[UploadToken] VALID:', {
      tokenPrefix: token.slice(0, 8) + '...',
      advertiserId: advertiser.id,
      companyName: advertiser.companyName,
      expiresAt: portalToken.expiresAt?.toISOString(),
      now: now.toISOString(),
    });
    
    return {
      success: true,
      context: {
        advertiserId: advertiser.id,
        linkKey: advertiser.linkKey,
        contractDuration: advertiser.videoDurationSeconds || DEFAULT_VIDEO_DURATION_SECONDS,
        companyName: advertiser.companyName,
        strictResolution: advertiser.strictResolution || false,
      },
      details: {
        tokenCreatedAt: portalToken.createdAt,
        expiresAt: portalToken.expiresAt,
        usedAt: portalToken.usedAt,
        now,
      }
    };
  } catch (error) {
    console.error('[UploadToken] REJECTED - error:', error);
    return { 
      success: false, 
      reason: 'error',
      details: { now }
    };
  }
}

export function validateFilename(filename: string, _linkKey: string): { valid: boolean; error?: string } {
  if (!filename) {
    return { valid: false, error: 'Bestandsnaam ontbreekt.' };
  }
  
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.mp4') {
    return {
      valid: false,
      error: 'Alleen MP4 bestanden zijn toegestaan.',
    };
  }
  
  // Note: We no longer require the linkKey prefix in the filename.
  // The server generates a canonical filename automatically.
  
  return { valid: true };
}

/**
 * Generate a canonical filename for an ad asset.
 * Format: ADV-{COMPANYSLUG}-{LINKKEY}-{TIMESTAMP}.mp4
 * Example: ADV-BOUWSERVICEDOUVEN-BD5A3F-202601161530.mp4
 */
export function generateCanonicalFilename(companyName: string, linkKey: string): string {
  // Create company slug: uppercase, remove special chars and spaces
  const companySlug = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
  
  // Use linkKey (already unique identifier)
  const linkKeyPart = linkKey.toUpperCase().slice(0, 8);
  
  // Add timestamp for uniqueness (YYYYMMDDHHmm format)
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0');
  
  return `ADV-${companySlug}-${linkKeyPart}-${timestamp}.mp4`;
}

export async function processAdAssetUpload(
  filePath: string,
  originalFilename: string,
  mimeType: string,
  portalContext: PortalContext
): Promise<UploadResult> {
  const specs = getVideoSpecsForDuration(portalContext.contractDuration);
  
  // Validate file extension (we no longer require linkKey prefix)
  const filenameValidation = validateFilename(originalFilename, portalContext.linkKey);
  if (!filenameValidation.valid) {
    return {
      success: false,
      validation: {
        isValid: false,
        metadata: null,
        errors: [filenameValidation.error!],
        warnings: [],
      },
      message: filenameValidation.error!,
    };
  }
  
  const metadataResult = await extractVideoMetadataWithDetails(filePath);
  
  if (!metadataResult.metadata) {
    // Build user-friendly error message based on the failure type
    let errorMessage = 'We konden je video niet uitlezen. ';
    
    if (metadataResult.error === 'File does not exist') {
      errorMessage += 'Het bestand kon niet worden gevonden. Probeer opnieuw te uploaden.';
    } else if (metadataResult.error === 'File is empty') {
      errorMessage += 'Het bestand is leeg. Controleer je video en probeer opnieuw.';
    } else if (metadataResult.error === 'No video stream found in file') {
      errorMessage += 'Geen video-stream gevonden. Zorg dat het een geldig MP4-bestand (H.264) is.';
    } else if (metadataResult.error === 'ffprobe not available') {
      errorMessage += 'Er is een technisch probleem met de videoverwerking. Neem contact op met support.';
      console.error('[AdAssetUpload] ffprobe not available - system configuration issue');
    } else if (metadataResult.ffprobeStderr) {
      errorMessage += 'Probeer het bestand opnieuw te exporteren als MP4 (H.264 codec).';
      console.error('[AdAssetUpload] ffprobe stderr:', metadataResult.ffprobeStderr);
    } else {
      errorMessage += 'Probeer opnieuw of exporteer als MP4 (H.264 codec).';
    }
    
    return {
      success: false,
      validation: {
        isValid: false,
        metadata: null,
        errors: [errorMessage],
        warnings: [],
      },
      message: 'Ongeldig videobestand.',
    };
  }
  
  const metadata = metadataResult.metadata;
  
  const validation = validateVideoMetadata(metadata, specs, { 
    strictResolution: portalContext.strictResolution 
  });
  
  // Generate canonical filename for storage
  const storedFilename = generateCanonicalFilename(portalContext.companyName, portalContext.linkKey);
  
  const fileBuffer = fs.readFileSync(filePath);
  // Use canonical filename in storage path
  const storagePath = `ad-assets/${portalContext.advertiserId}/${storedFilename}`;
  
  let storageUrl: string | null = null;
  try {
    storageUrl = await objectStorage.uploadFile(fileBuffer, storagePath, mimeType);
    console.log('[AdAssetUpload] File uploaded to storage:', storagePath, '(original:', originalFilename, ')');
  } catch (error) {
    console.error('[AdAssetUpload] Failed to upload to object storage:', error);
    return {
      success: false,
      validation,
      message: 'Upload naar opslag mislukt. Probeer het later opnieuw.',
    };
  }
  
  const validationStatus = validation.isValid ? 'valid' : 'invalid';
  
  const [asset] = await db.insert(adAssets).values({
    advertiserId: portalContext.advertiserId,
    linkKey: portalContext.linkKey,
    originalFileName: originalFilename,
    storedFilename: storedFilename,
    mimeType,
    sizeBytes: metadata.fileSize,
    storageUrl,
    storagePath,
    durationSeconds: String(metadata.durationSeconds),
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.aspectRatio,
    codec: metadata.codec,
    validationStatus,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    requiredDurationSeconds: portalContext.contractDuration,
    approvalStatus: 'UPLOADED', // Always starts as UPLOADED, requires admin approval
  }).returning();
  
  if (validation.isValid) {
    await db.update(advertisers)
      .set({
        assetStatus: 'uploaded_valid',
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, portalContext.advertiserId));
    
    console.log('[AdAssetUpload] Valid asset uploaded, advertiser status updated:', portalContext.advertiserId);
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : '';
    dispatchMailEvent("ADVERTISER_ASSET_UPLOADED_VALID", portalContext.advertiserId, baseUrl)
      .then(result => {
        if (!result.success && !result.skipped) {
          console.warn('[AdAssetUpload] Mail dispatch warning:', result.reason);
        }
      })
      .catch(err => console.error('[AdAssetUpload] Mail dispatch error:', err));
  } else {
    await db.update(advertisers)
      .set({
        assetStatus: 'uploaded_invalid',
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, portalContext.advertiserId));
    
    console.log('[AdAssetUpload] Invalid asset uploaded:', portalContext.advertiserId);
  }
  
  return {
    success: validation.isValid,
    assetId: asset.id,
    storedFilename,
    validation,
    message: validation.isValid
      ? 'Bedankt! We controleren je video en zetten hem daarna live.'
      : 'Video geüpload maar voldoet niet aan de specificaties. Corrigeer de fouten en upload opnieuw.',
  };
}

export async function getAdAssetsByAdvertiser(advertiserId: string) {
  return await db.query.adAssets.findMany({
    where: eq(adAssets.advertiserId, advertiserId),
    orderBy: (adAssets, { desc }) => [desc(adAssets.uploadedAt)],
  });
}

export async function getAdAssetById(assetId: string) {
  return await db.query.adAssets.findFirst({
    where: eq(adAssets.id, assetId),
  });
}

export async function getLatestValidAsset(advertiserId: string) {
  return await db.query.adAssets.findFirst({
    where: and(
      eq(adAssets.advertiserId, advertiserId),
      eq(adAssets.validationStatus, 'valid')
    ),
    orderBy: (adAssets, { desc }) => [desc(adAssets.uploadedAt)],
  });
}

export async function deleteAdAsset(assetId: string): Promise<boolean> {
  try {
    const asset = await db.query.adAssets.findFirst({
      where: eq(adAssets.id, assetId),
    });
    
    if (!asset) {
      return false;
    }
    
    await db.delete(adAssets).where(eq(adAssets.id, assetId));
    
    console.log('[AdAssetUpload] Asset deleted:', assetId);
    return true;
  } catch (error) {
    console.error('[AdAssetUpload] Error deleting asset:', error);
    return false;
  }
}

export async function markAssetAsReady(assetId: string, adminId?: string, notes?: string): Promise<boolean> {
  try {
    const asset = await db.query.adAssets.findFirst({
      where: eq(adAssets.id, assetId),
    });
    
    if (!asset || asset.validationStatus !== 'valid') {
      return false;
    }
    
    await db.update(adAssets)
      .set({
        reviewedByAdminAt: new Date(),
        reviewedByAdminId: adminId,
        adminNotes: notes,
      })
      .where(eq(adAssets.id, assetId));
    
    await db.update(advertisers)
      .set({
        assetStatus: 'ready_for_yodeck',
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, asset.advertiserId));
    
    console.log('[AdAssetUpload] Asset marked as ready for Yodeck:', assetId);
    return true;
  } catch (error) {
    console.error('[AdAssetUpload] Error marking asset as ready:', error);
    return false;
  }
}

// ============================================================================
// ADMIN REVIEW QUEUE FUNCTIONS
// ============================================================================

export interface ReviewQueueItem {
  asset: typeof adAssets.$inferSelect;
  advertiser: {
    id: string;
    companyName: string;
    packageType: string | null;
    targetRegionCodes: string[] | null;
    linkKey: string | null;
  };
}

export async function getPendingReviewAssets(): Promise<ReviewQueueItem[]> {
  const pendingAssets = await db.query.adAssets.findMany({
    where: and(
      eq(adAssets.validationStatus, 'valid'),
      eq(adAssets.approvalStatus, 'UPLOADED')
    ),
    orderBy: (adAssets, { desc }) => [desc(adAssets.uploadedAt)],
  });
  
  const results: ReviewQueueItem[] = [];
  for (const asset of pendingAssets) {
    const advertiser = await db.query.advertisers.findFirst({
      where: eq(advertisers.id, asset.advertiserId),
    });
    if (advertiser) {
      results.push({
        asset,
        advertiser: {
          id: advertiser.id,
          companyName: advertiser.companyName,
          packageType: advertiser.packageType,
          targetRegionCodes: advertiser.targetRegionCodes,
          linkKey: advertiser.linkKey,
        },
      });
    }
  }
  return results;
}

export interface ApproveResult {
  success: boolean;
  message: string;
  placementPlanId?: string;
}

export async function approveAsset(
  assetId: string, 
  adminId: string, 
  notes?: string
): Promise<ApproveResult> {
  try {
    const asset = await db.query.adAssets.findFirst({
      where: eq(adAssets.id, assetId),
    });
    
    if (!asset) {
      return { success: false, message: 'Asset niet gevonden' };
    }
    
    if (asset.validationStatus !== 'valid') {
      return { success: false, message: 'Asset heeft technische validatiefouten' };
    }
    
    if (asset.approvalStatus !== 'UPLOADED' && asset.approvalStatus !== 'IN_REVIEW') {
      return { success: false, message: `Asset heeft status ${asset.approvalStatus}, kan niet goedkeuren` };
    }
    
    // Update asset status to APPROVED
    await db.update(adAssets)
      .set({
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: adminId,
        reviewedByAdminAt: new Date(),
        reviewedByAdminId: adminId,
        adminNotes: notes,
      })
      .where(eq(adAssets.id, assetId));
    
    // Update advertiser status
    await db.update(advertisers)
      .set({
        assetStatus: 'ready_for_yodeck',
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, asset.advertiserId));
    
    console.log('[AdminReview] Asset approved:', assetId, 'by admin:', adminId);
    
    // Trigger auto-publish workflow (create placement plan)
    try {
      const { PlacementEngineService } = await import('./placementEngineService');
      const placementEngine = new PlacementEngineService();
      const planResult = await placementEngine.createPlan(asset.advertiserId, assetId);
      
      if (planResult && planResult.planId) {
        console.log('[AdminReview] Placement plan created:', planResult.planId);
        return { 
          success: true, 
          message: 'Video goedgekeurd en plaatsingsplan aangemaakt',
          placementPlanId: planResult.planId,
        };
      } else {
        // Asset approved but placement plan failed - log warning but don't fail
        console.warn('[AdminReview] Asset approved but placement plan creation failed');
        return { 
          success: true, 
          message: 'Video goedgekeurd. Plaatsingsplan wordt handmatig aangemaakt.',
        };
      }
    } catch (planError: any) {
      console.warn('[AdminReview] Placement plan error:', planError.message);
      return { 
        success: true, 
        message: 'Video goedgekeurd. Plaatsingsplan kon niet automatisch worden aangemaakt.',
      };
    }
  } catch (error: any) {
    console.error('[AdminReview] Error approving asset:', error);
    return { success: false, message: 'Fout bij goedkeuren: ' + error.message };
  }
}

export interface RejectResult {
  success: boolean;
  message: string;
}

export const REJECTION_REASONS = {
  quality: 'Onleesbare tekst / slechte kwaliteit',
  duration: 'Verkeerde duur',
  content: 'Niet toegestane inhoud',
  other: 'Anders',
} as const;

export async function rejectAsset(
  assetId: string,
  adminId: string,
  reason: keyof typeof REJECTION_REASONS,
  details?: string
): Promise<RejectResult> {
  try {
    const asset = await db.query.adAssets.findFirst({
      where: eq(adAssets.id, assetId),
    });
    
    if (!asset) {
      return { success: false, message: 'Asset niet gevonden' };
    }
    
    if (asset.approvalStatus !== 'UPLOADED' && asset.approvalStatus !== 'IN_REVIEW') {
      return { success: false, message: `Asset heeft status ${asset.approvalStatus}, kan niet afkeuren` };
    }
    
    // Update asset status to REJECTED
    await db.update(adAssets)
      .set({
        approvalStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy: adminId,
        rejectedReason: reason,
        rejectedDetails: details,
        reviewedByAdminAt: new Date(),
        reviewedByAdminId: adminId,
      })
      .where(eq(adAssets.id, assetId));
    
    // Update advertiser status to prompt reupload
    await db.update(advertisers)
      .set({
        assetStatus: 'uploaded_invalid',
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, asset.advertiserId));
    
    console.log('[AdminReview] Asset rejected:', assetId, 'reason:', reason);
    
    // Send rejection email to advertiser
    try {
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'https://elevizion-dashboard.replit.app';
      await dispatchMailEvent('ADVERTISER_ASSET_REJECTED', asset.advertiserId, baseUrl);
      console.log('[AdminReview] Rejection email dispatched for advertiser:', asset.advertiserId);
    } catch (emailError) {
      console.error('[AdminReview] Failed to send rejection email:', emailError);
    }
    
    return { success: true, message: 'Video afgekeurd, adverteerder wordt op de hoogte gesteld' };
  } catch (error: any) {
    console.error('[AdminReview] Error rejecting asset:', error);
    return { success: false, message: 'Fout bij afkeuren: ' + error.message };
  }
}
