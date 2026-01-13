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
} from './videoMetadataService';
import { ObjectStorageService } from '../objectStorage';

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
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function validatePortalToken(token: string, recordAccess = false): Promise<PortalContext | null> {
  try {
    const tokenHash = hashToken(token);
    
    const portalToken = await db.query.portalTokens.findFirst({
      where: eq(portalTokens.tokenHash, tokenHash),
    });
    
    if (!portalToken) {
      console.log('[AdAssetUpload] Token not found:', token.slice(0, 8) + '...');
      return null;
    }
    
    if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) {
      console.log('[AdAssetUpload] Token expired:', token.slice(0, 8) + '...');
      return null;
    }
    
    const advertiser = await db.query.advertisers.findFirst({
      where: eq(advertisers.id, portalToken.advertiserId),
    });
    
    if (!advertiser) {
      console.log('[AdAssetUpload] Advertiser not found for token:', token.slice(0, 8) + '...');
      return null;
    }
    
    if (!advertiser.linkKey) {
      console.log('[AdAssetUpload] Advertiser has no linkKey:', advertiser.id);
      return null;
    }
    
    if (recordAccess) {
      await db.update(portalTokens)
        .set({ usedAt: new Date() })
        .where(eq(portalTokens.tokenHash, tokenHash));
      console.log('[AdAssetUpload] Token access recorded:', token.slice(0, 8) + '...');
    }
    
    return {
      advertiserId: advertiser.id,
      linkKey: advertiser.linkKey,
      contractDuration: advertiser.videoDurationSeconds || 15,
      companyName: advertiser.companyName,
    };
  } catch (error) {
    console.error('[AdAssetUpload] Error validating token:', error);
    return null;
  }
}

export function validateFilename(filename: string, linkKey: string): { valid: boolean; error?: string } {
  if (!filename) {
    return { valid: false, error: 'Bestandsnaam ontbreekt.' };
  }
  
  const filenameLower = filename.toLowerCase();
  const linkKeyLower = linkKey.toLowerCase();
  
  if (!filenameLower.includes(linkKeyLower)) {
    return {
      valid: false,
      error: `Bestandsnaam moet uw linkcode bevatten: "${linkKey}". Bijvoorbeeld: "${linkKey}_advertentie.mp4"`,
    };
  }
  
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.mp4') {
    return {
      valid: false,
      error: 'Alleen MP4 bestanden zijn toegestaan.',
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
  
  const validation = validateVideoMetadata(metadata, specs);
  
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
