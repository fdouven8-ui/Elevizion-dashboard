import { db } from '../db';
import { adAssets, advertisers, portalTokens } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  extractVideoMetadata,
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

export function validateFilename(filename: string, linkKey: string): { valid: boolean; error?: string } {
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
  
  const baseName = path.basename(filename);
  const expectedPrefix = `${linkKey.toLowerCase()}_`;
  const baseNameLower = baseName.toLowerCase();
  
  if (!baseNameLower.startsWith(expectedPrefix)) {
    return {
      valid: false,
      error: `Bestandsnaam moet beginnen met: ${linkKey}_\nVoorbeeld: ${linkKey}_Bedrijfsnaam.mp4`,
    };
  }
  
  const afterPrefix = baseName.substring(linkKey.length + 1);
  const nameWithoutExt = afterPrefix.replace(/\.mp4$/i, '');
  if (nameWithoutExt.length < 1) {
    return {
      valid: false,
      error: `Bestandsnaam moet beginnen met: ${linkKey}_ gevolgd door uw bedrijfsnaam.\nVoorbeeld: ${linkKey}_Bedrijfsnaam.mp4`,
    };
  }
  
  return { valid: true };
}

export async function processAdAssetUpload(
  filePath: string,
  originalFilename: string,
  mimeType: string,
  portalContext: PortalContext
): Promise<UploadResult> {
  const specs = getVideoSpecsForDuration(portalContext.contractDuration);
  
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
  
  const metadata = await extractVideoMetadata(filePath);
  
  if (!metadata) {
    return {
      success: false,
      validation: {
        isValid: false,
        metadata: null,
        errors: ['Kan video metadata niet uitlezen. Controleer of het bestand een geldig MP4 videobestand is.'],
        warnings: [],
      },
      message: 'Ongeldig videobestand.',
    };
  }
  
  const validation = validateVideoMetadata(metadata, specs, { 
    strictResolution: portalContext.strictResolution 
  });
  
  const fileBuffer = fs.readFileSync(filePath);
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const storagePath = `ad-assets/${portalContext.advertiserId}/${uniqueId}_${originalFilename}`;
  
  let storageUrl: string | null = null;
  try {
    storageUrl = await objectStorage.uploadFile(fileBuffer, storagePath, mimeType);
    console.log('[AdAssetUpload] File uploaded to storage:', storagePath);
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
    validation,
    message: validation.isValid
      ? 'Video succesvol geüpload en goedgekeurd!'
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
