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
  VideoErrorCode,
  VideoErrorDetails,
  DEFAULT_VIDEO_DURATION_SECONDS,
} from './videoMetadataService';
import { checkTranscodeRequired, startTranscodeJob } from './videoTranscodeService';
import { ObjectStorageService } from '../objectStorage';
import { dispatchMailEvent } from './mailEventService';
import { logAudit } from './auditService';

const objectStorage = new ObjectStorageService();

function logMemory(label: string) {
  const mem = process.memoryUsage();
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`[Memory:${label}] Heap: ${formatMB(mem.heapUsed)}/${formatMB(mem.heapTotal)}MB | RSS: ${formatMB(mem.rss)}MB`);
}

export interface UploadResult {
  success: boolean;
  assetId?: string;
  storedFilename?: string;
  validation: VideoValidationResult;
  message: string;
  errorCode?: VideoErrorCode;
  errorDetails?: VideoErrorDetails;
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
      errorCode: 'INVALID_MEDIA_READ' as VideoErrorCode,
      errorDetails: {
        ffprobeError: filenameValidation.error,
      },
    };
  }
  
  logMemory('before-ffprobe');
  const metadataResult = await extractVideoMetadataWithDetails(filePath);
  logMemory('after-ffprobe');
  
  if (!metadataResult.metadata) {
    // Return structured error code based on the failure type
    const errorCode = metadataResult.errorCode || 'INVALID_MEDIA_READ';
    const errorDetails = metadataResult.errorDetails || { 
      ffprobeError: metadataResult.ffprobeStderr 
    };
    
    console.error('[AdAssetUpload] Metadata extraction failed:', {
      errorCode,
      error: metadataResult.error,
      ffprobeStderr: metadataResult.ffprobeStderr?.substring(0, 200),
    });
    
    return {
      success: false,
      validation: {
        isValid: false,
        metadata: null,
        errors: [],
        warnings: [],
      },
      message: metadataResult.error || 'Ongeldig videobestand.',
      errorCode,
      errorDetails,
    };
  }
  
  const metadata = metadataResult.metadata;
  
  const validation = validateVideoMetadata(metadata, specs, { 
    strictResolution: portalContext.strictResolution 
  });
  
  // Check if codec is not H.264 - this is auto-transcodable if other validations pass
  const isH264 = metadata.codec.toLowerCase() === 'h264';
  const codecNeedsTranscode = !isH264;
  
  // Check duration errors (these cannot be auto-fixed)
  const durationTooShort = metadata.durationSeconds < specs.minDurationSeconds;
  const durationTooLong = metadata.durationSeconds > specs.maxDurationSeconds;
  
  // If duration is invalid, reject immediately with structured error
  if (durationTooShort || durationTooLong) {
    const errorCode: VideoErrorCode = 'UNSUPPORTED_DURATION';
    const errorDetails: VideoErrorDetails = {
      detectedDuration: metadata.durationSeconds,
      maxDuration: specs.maxDurationSeconds,
      minDuration: specs.minDurationSeconds,
    };
    
    console.log('[AdAssetUpload] Duration validation failed:', errorDetails);
    
    return {
      success: false,
      validation,
      message: durationTooShort 
        ? `Video te kort: ${metadata.durationSeconds.toFixed(1)}s (min ${specs.minDurationSeconds}s)`
        : `Video te lang: ${metadata.durationSeconds.toFixed(1)}s (max ${specs.maxDurationSeconds}s)`,
      errorCode,
      errorDetails,
    };
  }
  
  // Generate canonical filename for storage
  const storedFilename = generateCanonicalFilename(portalContext.companyName, portalContext.linkKey);
  
  // Use streaming upload to avoid loading entire video into memory
  const storagePath = `ad-assets/${portalContext.advertiserId}/${storedFilename}`;
  
  let storageUrl: string | null = null;
  try {
    // Stream directly from disk to object storage - no memory buffering
    logMemory('before-upload');
    storageUrl = await objectStorage.uploadFileFromPath(filePath, storagePath, mimeType);
    logMemory('after-upload');
    console.log('[AdAssetUpload] File streamed to storage:', storagePath, '(original:', originalFilename, ')');
  } catch (error: any) {
    console.error('[AdAssetUpload] Failed to upload to object storage:', {
      message: error.message,
      code: error.code,
      errors: error.errors,
    });
    return {
      success: false,
      validation,
      message: 'Upload naar opslag mislukt. Probeer het later opnieuw.',
      errorCode: 'STORAGE_UPLOAD_FAILED' as VideoErrorCode,
      errorDetails: {
        ffprobeError: error.message || 'Storage upload failed',
      },
    };
  }
  
  const validationStatus = validation.isValid ? 'valid' : 'invalid';
  
  // Check if transcoding is needed (non-H.264 codec or non-yuv420p pixel format)
  // Only transcode valid assets - invalid assets need to be rejected and re-uploaded
  const transcodeCheck = checkTranscodeRequired(metadata);
  let conversionStatus = 'NONE';
  
  if (validation.isValid && transcodeCheck.needsTranscode) {
    console.log('[AdAssetUpload] Transcoding required:', transcodeCheck.reason);
    conversionStatus = 'PENDING';
  } else if (transcodeCheck.needsTranscode) {
    console.log('[AdAssetUpload] Transcoding skipped (asset invalid):', transcodeCheck.reason);
  }
  
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
    pixelFormat: metadata.pixelFormat,
    validationStatus,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    requiredDurationSeconds: portalContext.contractDuration,
    approvalStatus: 'UPLOADED', // Always starts as UPLOADED, requires admin approval
    conversionStatus,
  }).returning();
  
  // Start background transcoding job if needed (only for valid assets)
  if (validation.isValid && transcodeCheck.needsTranscode && asset.id) {
    console.log('[AdAssetUpload] Starting background transcode job for:', asset.id);
    startTranscodeJob(asset.id);
  }
  
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
  
  // Return appropriate error code for invalid assets
  if (!validation.isValid) {
    // If codec needs transcode but asset is invalid for other reasons, inform user about codec
    if (codecNeedsTranscode) {
      return {
        success: false,
        assetId: asset.id,
        storedFilename,
        validation,
        message: 'Video geüpload maar voldoet niet aan de specificaties.',
        errorCode: 'UNSUPPORTED_CODEC' as VideoErrorCode,
        errorDetails: {
          detectedCodec: metadata.codec,
          expectedCodec: 'h264',
          detectedDuration: metadata.durationSeconds,
        },
      };
    }
    
    return {
      success: false,
      assetId: asset.id,
      storedFilename,
      validation,
      message: 'Video geüpload maar voldoet niet aan de specificaties. Corrigeer de fouten en upload opnieuw.',
    };
  }
  
  return {
    success: true,
    assetId: asset.id,
    storedFilename,
    validation,
    message: 'Bedankt! We controleren je video en zetten hem daarna live.',
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
  autoPlacement?: {
    success: boolean;
    placementsCreated: number;
    screensPublished: number;
    message: string;
  } | null;
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
    
    // Log audit event
    await logAudit('ASSET_APPROVED', {
      actorUserId: adminId,
      advertiserId: asset.advertiserId,
      assetId: assetId,
      metadata: { notes },
    });
    
    // AUTO-PLACEMENT: Create placements and publish to screens immediately
    let autoPlacementResult: { success: boolean; placementsCreated: number; screensPublished: number; message: string } | null = null;
    try {
      const { createAutoPlacementsForAsset } = await import('./autoPlacementService');
      autoPlacementResult = await createAutoPlacementsForAsset(assetId, asset.advertiserId);
      
      if (autoPlacementResult.success) {
        console.log(`[AdminReview] Auto-placement success: ${autoPlacementResult.placementsCreated} placements, ${autoPlacementResult.screensPublished} screens`);
      } else {
        console.warn('[AdminReview] Auto-placement failed:', autoPlacementResult.message);
      }
    } catch (autoPlacementError: any) {
      console.error('[AdminReview] Auto-placement error:', autoPlacementError.message);
    }
    
    // CANONICAL PLAYLIST PUBLISHING: Add to location canonical playlists
    let canonicalPublishResult: { success: boolean; locationsUpdated: number; errors: string[] } | null = null;
    try {
      const { publishApprovedVideoToLocations } = await import('./canonicalBroadcastService');
      
      // Only publish if the asset has a Yodeck media ID
      if (asset.yodeckMediaId) {
        canonicalPublishResult = await publishApprovedVideoToLocations(asset.yodeckMediaId, asset.advertiserId);
        
        if (canonicalPublishResult.success) {
          console.log(`[AdminReview] Canonical publish: ${canonicalPublishResult.locationsUpdated} locations updated`);
        } else {
          console.warn('[AdminReview] Canonical publish had errors:', canonicalPublishResult.errors);
        }
      } else {
        console.log('[AdminReview] Asset has no yodeckMediaId, skipping canonical publish');
      }
    } catch (canonicalError: any) {
      console.error('[AdminReview] Canonical publish error:', canonicalError.message);
    }
    
    // Legacy: Also trigger placement plan for backward compatibility
    let planId: string | undefined;
    try {
      const { PlacementEngineService } = await import('./placementEngineService');
      const placementEngine = new PlacementEngineService();
      const planResult = await placementEngine.createPlan(asset.advertiserId, assetId);
      
      if (planResult && planResult.planId) {
        console.log('[AdminReview] Placement plan created:', planResult.planId);
        planId = planResult.planId;
      }
    } catch (planError: any) {
      // This is now secondary, auto-placement is primary
      console.warn('[AdminReview] Placement plan error (secondary):', planError.message);
    }
    
    // Send approval email to advertiser
    try {
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : 'https://elevizion-dashboard.replit.app';
      await dispatchMailEvent('ADVERTISER_ASSET_APPROVED', asset.advertiserId, baseUrl);
      console.log('[AdminReview] Approval email dispatched for advertiser:', asset.advertiserId);
    } catch (emailError) {
      console.error('[AdminReview] Failed to send approval email:', emailError);
    }
    
    // Build success message with auto-placement and canonical publish info
    let message = 'Video goedgekeurd';
    if (canonicalPublishResult?.success && canonicalPublishResult.locationsUpdated > 0) {
      message += ` en gepubliceerd naar ${canonicalPublishResult.locationsUpdated} locatie(s)`;
    } else if (autoPlacementResult?.success && autoPlacementResult.placementsCreated > 0) {
      message += ` en automatisch geplaatst op ${autoPlacementResult.placementsCreated} scherm(en)`;
    } else if (autoPlacementResult?.success && autoPlacementResult.screensPublished > 0) {
      message += ` en ${autoPlacementResult.screensPublished} scherm(en) gesynchroniseerd`;
    }
    
    return { 
      success: true, 
      message,
      placementPlanId: planId,
      autoPlacement: autoPlacementResult,
      canonicalPublish: canonicalPublishResult,
    };
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
    
    // Log audit event
    await logAudit('ASSET_REJECTED', {
      actorUserId: adminId,
      advertiserId: asset.advertiserId,
      assetId: assetId,
      metadata: { reason, details, rejectionLabel: REJECTION_REASONS[reason] },
    });
    
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
