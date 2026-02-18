/**
 * PUBLISH SERVICE
 * 
 * Single path for publishing an approved advertiser's ad to all target screens.
 * Uses the canonical playlist-only architecture.
 */

import { db } from "../db";
import { screens, locations } from "@shared/schema";
import { eq, ne, and, sql } from "drizzle-orm";
import { getCanonicalApprovedAsset } from "./adAssetService";
import { resolveTargetScreensForAdvertiser } from "./placementResolver";
import { 
  ensureScreenPlaylists, 
  seedBaselineIfEmpty, 
  rebuildCombinedPlaylist, 
  assignCombinedPlaylistToScreen, 
  verifyScreenPlayback,
  addAdToScreen,
  selfHealIfLayout,
} from "./yodeckPlaybackEngine";

export interface PublishTargetResult {
  screenId: string;
  yodeckPlayerId: string;
  baselinePlaylistId: string | null;
  adsPlaylistId: string | null;
  combinedPlaylistId: string | null;
  baselineCount: number;
  adsCount: number;
  totalCount: number;
  assignedToScreen: boolean;
  pushed: boolean;
  verified: boolean;
  yodeck?: {
    source_type: string;
    source_id: string | null;
  };
  error?: string;
}

export interface PublishResult {
  ok: boolean;
  advertiserId: string;
  correlationId: string;
  asset?: {
    assetId: string;
    yodeckMediaId: string;
  };
  targets: PublishTargetResult[];
  error?: string;
  errorCode?: string;
}

/**
 * Publish an approved advertiser's ad to all target screens.
 */
export async function publishApprovedAdvertiser(advertiserId: string): Promise<PublishResult> {
  const correlationId = `pub-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
  
  console.log(`[Publish] ${correlationId} START advertiserId=${advertiserId}`);

  const assetResult = await getCanonicalApprovedAsset(advertiserId);
  if (!assetResult.ok || !assetResult.asset) {
    console.error(`[Publish] ${correlationId} ASSET_FAILED: ${assetResult.error}`);
    return {
      ok: false,
      advertiserId,
      correlationId,
      targets: [],
      error: assetResult.error,
      errorCode: assetResult.errorCode,
    };
  }

  const asset = assetResult.asset;
  console.log(`[Publish] ${correlationId} ASSET assetId=${asset.assetId} yodeckMediaId=${asset.yodeckMediaId}`);

  const targetsResult = await resolveTargetScreensForAdvertiser(advertiserId);
  if (!targetsResult.ok || !targetsResult.targets) {
    console.error(`[Publish] ${correlationId} TARGETS_FAILED: ${targetsResult.error}`);
    return {
      ok: false,
      advertiserId,
      correlationId,
      asset: { assetId: asset.assetId, yodeckMediaId: asset.yodeckMediaId },
      targets: [],
      error: targetsResult.error,
      errorCode: targetsResult.errorCode,
    };
  }

  console.log(`[Publish] ${correlationId} TARGETS count=${targetsResult.targets.length}`);

  const targetResults: PublishTargetResult[] = [];

  for (const target of targetsResult.targets) {
    console.log(`[Publish] ${correlationId} TARGET screen=${target.id} player=${target.yodeckPlayerId}`);

    const screen = await db.select().from(screens).where(eq(screens.id, target.id)).then(r => r[0]);
    if (!screen) {
      targetResults.push({
        screenId: target.id,
        yodeckPlayerId: target.yodeckPlayerId,
        baselinePlaylistId: null,
        adsPlaylistId: null,
        combinedPlaylistId: null,
        baselineCount: 0,
        adsCount: 0,
        totalCount: 0,
        assignedToScreen: false,
        pushed: false,
        verified: false,
        error: "Screen not found",
      });
      continue;
    }

    try {
      // Step 0: Self-heal if screen is in layout mode (LAYOUT_FORBIDDEN)
      if (screen.yodeckPlayerId) {
        const healResult = await selfHealIfLayout(screen);
        if (healResult.wasOnLayout) {
          console.log(`[Publish] ${correlationId} LAYOUT_FORBIDDEN detected, healed=${healResult.healed}`);
          if (!healResult.ok) {
            console.error(`[Publish] ${correlationId} SELF_HEAL_FAILED: ${healResult.error}`);
            // HARD FAIL: Cannot publish to screen stuck in layout mode
            targetResults.push({
              screenId: target.id,
              yodeckPlayerId: target.yodeckPlayerId,
              baselinePlaylistId: null,
              adsPlaylistId: null,
              combinedPlaylistId: null,
              baselineCount: 0,
              adsCount: 0,
              totalCount: 0,
              assignedToScreen: false,
              pushed: false,
              verified: false,
              error: `LAYOUT_FORBIDDEN: Screen stuck in layout mode, self-heal failed: ${healResult.error}`,
            });
            continue;
          }
        }
      }

      const ensureResult = await ensureScreenPlaylists(screen);
      if (!ensureResult.ok) {
        console.error(`[Playback] ${correlationId} ENSURE failed: ${ensureResult.error}`);
        targetResults.push({
          screenId: target.id,
          yodeckPlayerId: target.yodeckPlayerId,
          baselinePlaylistId: null,
          adsPlaylistId: null,
          combinedPlaylistId: null,
          baselineCount: 0,
          adsCount: 0,
          totalCount: 0,
          assignedToScreen: false,
          pushed: false,
          verified: false,
          error: ensureResult.error,
        });
        continue;
      }
      console.log(`[Playback] ${correlationId} ENSURE playlists ok`);

      const refreshedScreen = await db.select().from(screens).where(eq(screens.id, target.id)).then(r => r[0]);
      if (!refreshedScreen) {
        targetResults.push({
          screenId: target.id,
          yodeckPlayerId: target.yodeckPlayerId,
          baselinePlaylistId: null,
          adsPlaylistId: null,
          combinedPlaylistId: null,
          baselineCount: 0,
          adsCount: 0,
          totalCount: 0,
          assignedToScreen: false,
          pushed: false,
          verified: false,
          error: "Screen lost after ensure",
        });
        continue;
      }

      const seedResult = await seedBaselineIfEmpty(refreshedScreen);
      if (!seedResult.ok) {
        console.error(`[Playback] ${correlationId} SEED failed: ${seedResult.error}`);
      }

      const addResult = await addAdToScreen(refreshedScreen, asset.yodeckMediaId);
      if (!addResult.ok) {
        console.error(`[Playback] ${correlationId} ADD AD failed: ${addResult.error}`);
        targetResults.push({
          screenId: target.id,
          yodeckPlayerId: target.yodeckPlayerId,
          baselinePlaylistId: refreshedScreen.baselinePlaylistId,
          adsPlaylistId: refreshedScreen.adsPlaylistId,
          combinedPlaylistId: refreshedScreen.combinedPlaylistId,
          baselineCount: 0,
          adsCount: 0,
          totalCount: 0,
          assignedToScreen: false,
          pushed: false,
          verified: false,
          error: addResult.error,
        });
        continue;
      }
      console.log(`[Playback] ${correlationId} ADS add ok (alreadyPresent=${addResult.alreadyPresent})`);

      const rebuildResult = await rebuildCombinedPlaylist(refreshedScreen);
      if (!rebuildResult.ok) {
        console.error(`[Playback] ${correlationId} REBUILD failed: ${rebuildResult.error}`);
        targetResults.push({
          screenId: target.id,
          yodeckPlayerId: target.yodeckPlayerId,
          baselinePlaylistId: refreshedScreen.baselinePlaylistId,
          adsPlaylistId: refreshedScreen.adsPlaylistId,
          combinedPlaylistId: refreshedScreen.combinedPlaylistId,
          baselineCount: 0,
          adsCount: 0,
          totalCount: 0,
          assignedToScreen: false,
          pushed: false,
          verified: false,
          error: rebuildResult.error,
        });
        continue;
      }
      console.log(`[Playback] ${correlationId} COMBINED rebuild baseline=${rebuildResult.baselineCount} ads=${rebuildResult.adsCount}`);

      const assignResult = await assignCombinedPlaylistToScreen(refreshedScreen);
      if (!assignResult.ok) {
        console.error(`[Playback] ${correlationId} ASSIGN failed: ${assignResult.error}`);
        targetResults.push({
          screenId: target.id,
          yodeckPlayerId: target.yodeckPlayerId,
          baselinePlaylistId: refreshedScreen.baselinePlaylistId,
          adsPlaylistId: refreshedScreen.adsPlaylistId,
          combinedPlaylistId: refreshedScreen.combinedPlaylistId,
          baselineCount: rebuildResult.baselineCount,
          adsCount: rebuildResult.adsCount,
          totalCount: rebuildResult.totalCount,
          assignedToScreen: false,
          pushed: false,
          verified: false,
          error: assignResult.error,
        });
        continue;
      }
      console.log(`[Playback] ${correlationId} ASSIGN ok pushed=${assignResult.pushed}`);

      const verifyResult = await verifyScreenPlayback(refreshedScreen);
      console.log(`[Playback] ${correlationId} VERIFY ${verifyResult.ok ? "ok" : "FAILED"}`);

      targetResults.push({
        screenId: target.id,
        yodeckPlayerId: target.yodeckPlayerId,
        baselinePlaylistId: refreshedScreen.baselinePlaylistId,
        adsPlaylistId: refreshedScreen.adsPlaylistId,
        combinedPlaylistId: refreshedScreen.combinedPlaylistId,
        baselineCount: rebuildResult.baselineCount,
        adsCount: rebuildResult.adsCount,
        totalCount: rebuildResult.totalCount,
        assignedToScreen: true,
        pushed: assignResult.pushed,
        verified: verifyResult.ok,
        yodeck: {
          source_type: verifyResult.sourceType,
          source_id: verifyResult.sourceId,
        },
        error: verifyResult.ok ? undefined : `Verification failed: ${verifyResult.sourceType}:${verifyResult.sourceId}`,
      });

    } catch (err: any) {
      console.error(`[Publish] ${correlationId} ERROR for screen ${target.id}: ${err.message}`);
      targetResults.push({
        screenId: target.id,
        yodeckPlayerId: target.yodeckPlayerId,
        baselinePlaylistId: null,
        adsPlaylistId: null,
        combinedPlaylistId: null,
        baselineCount: 0,
        adsCount: 0,
        totalCount: 0,
        assignedToScreen: false,
        pushed: false,
        verified: false,
        error: err.message,
      });
    }
  }

  const successCount = targetResults.filter(t => t.verified).length;
  const failCount = targetResults.filter(t => !t.verified).length;

  console.log(`[Publish] ${correlationId} END success=${successCount} fail=${failCount}`);

  return {
    ok: failCount === 0,
    advertiserId,
    correlationId,
    asset: { assetId: asset.assetId, yodeckMediaId: asset.yodeckMediaId },
    targets: targetResults,
  };
}

import { adAssets, advertisers, uploadJobs, screenContentItems, contracts, placements } from "@shared/schema";
import { desc, inArray, isNotNull } from "drizzle-orm";

export interface PublishStep {
  step: string;
  ok: boolean;
  ts: string;
  details: string;
}

export interface PublishTraceResult {
  asset: {
    id: string;
    approvalStatus: string;
    publishStatus: string | null;
    publishAttempts: number;
    lastPublishAttemptAt: string | null;
    publishError: string | null;
    storagePath: string | null;
    normalizedStoragePath: string | null;
    yodeckReadinessStatus: string;
  };
  targeting: {
    advertiserId: string;
    advertiserName: string | null;
    targetRegionCodes: string[] | null;
    selectedScreenIds: string[];
    selectedYodeckPlayerIds: (number | null)[];
  };
  playlist: {
    baselinePlaylistId: string | null;
    screenPlaylists: {
      screenId: string;
      screenName: string;
      playlistId: string | null;
      yodeckMediaPresent: boolean;
    }[];
  };
  yodeck: {
    mediaId: number | null;
    uploadedAt: string | null;
    lastUploadJob: {
      id: string;
      status: string;
      finalState: string | null;
      correlationId: string | null;
      yodeckMediaId: number | null;
      yodeckStatus: string | null;
      yodeckFileSize: number | null;
      lastError: string | null;
      errorCode: string | null;
      attempt: number;
      createdAt: string;
    } | null;
  };
  lastSteps: PublishStep[];
  recommendation: string;
}

export async function getPublishTrace(assetId: string): Promise<PublishTraceResult | null> {
  const asset = await db.query.adAssets.findFirst({
    where: eq(adAssets.id, assetId),
  });

  if (!asset) return null;

  const advertiser = await db.query.advertisers.findFirst({
    where: eq(advertisers.id, asset.advertiserId),
  });

  let relevantScreens: any[] = [];
  let targetingError: string | null = null;
  try {
    const targetsResult = await resolveTargetScreensForAdvertiser(asset.advertiserId);
    if (targetsResult.ok && targetsResult.targets) {
      const targetIds = new Set(targetsResult.targets.map((t: any) => t.id));
      const allScreens = await db.select().from(screens).catch(() => [] as any[]);
      relevantScreens = allScreens.filter((s: any) => targetIds.has(s.id));
    } else {
      targetingError = targetsResult.error || targetsResult.errorCode || null;
      relevantScreens = await db.select().from(screens).catch(() => [] as any[]);
    }
  } catch {
    relevantScreens = await db.select().from(screens).catch(() => [] as any[]);
    targetingError = "Targeting resolver fout";
  }
  const relevantScreenIds = relevantScreens.map((s: any) => s.id);

  let contentItems: any[] = [];
  if (asset.yodeckMediaId && relevantScreenIds.length > 0) {
    contentItems = await db.select().from(screenContentItems)
      .where(
        and(
          eq(screenContentItems.yodeckMediaId, asset.yodeckMediaId),
          inArray(screenContentItems.screenId, relevantScreenIds)
        )
      ).catch(() => []);
  }

  const contentScreenIds = new Set(contentItems.map((c: any) => c.screenId));

  const latestUploadJob = await db.query.uploadJobs.findFirst({
    where: eq(uploadJobs.advertiserId, asset.advertiserId),
    orderBy: [desc(uploadJobs.createdAt)],
  }).catch(() => null);

  const baselinePlaylistId = process.env.BASELINE_PLAYLIST_ID || null;

  const steps: PublishStep[] = [];
  const now = new Date().toISOString();

  const hasTargeting = relevantScreenIds.length > 0 && !targetingError;
  steps.push({
    step: "resolve_targeting",
    ok: hasTargeting,
    ts: asset.approvedAt?.toISOString() || now,
    details: targetingError
      ? `Targeting fout: ${targetingError} (fallback: ${relevantScreenIds.length} schermen)`
      : hasTargeting
        ? `${relevantScreenIds.length} scherm(en) gevonden via targeting resolver`
        : "Geen schermen gevonden voor targeting",
  });

  const hasMedia = !!asset.yodeckMediaId;
  steps.push({
    step: "ensure_yodeck_media",
    ok: hasMedia,
    ts: asset.yodeckUploadedAt?.toISOString() || now,
    details: hasMedia
      ? `yodeckMediaId=${asset.yodeckMediaId}`
      : asset.publishError || "Geen Yodeck media ID",
  });

  if (hasMedia) {
    const presentCount = contentItems.length;
    steps.push({
      step: "ensure_playlist_items",
      ok: presentCount > 0,
      ts: now,
      details: presentCount > 0
        ? `Media aanwezig op ${presentCount}/${relevantScreenIds.length} scherm(en)`
        : `Media niet gevonden op schermplaylists`,
    });
  }

  const isLive = asset.approvalStatus === 'LIVE' && asset.publishStatus === 'PUBLISHED';
  steps.push({
    step: "publish_status",
    ok: isLive,
    ts: asset.lastPublishAttemptAt?.toISOString() || now,
    details: isLive
      ? "Asset is LIVE en gepubliceerd"
      : `approvalStatus=${asset.approvalStatus} publishStatus=${asset.publishStatus}`,
  });

  if (latestUploadJob) {
    steps.push({
      step: "upload_job_status",
      ok: latestUploadJob.status === 'READY',
      ts: latestUploadJob.createdAt?.toISOString() || now,
      details: `job=${latestUploadJob.id} status=${latestUploadJob.status} finalState=${latestUploadJob.finalState} yodeckStatus=${latestUploadJob.yodeckStatus}`,
    });
  }

  let recommendation = "UNKNOWN";
  if (isLive) {
    recommendation = "NONE - Asset is live en werkend";
  } else if (!hasTargeting) {
    recommendation = "FIX_TARGETING - Geen schermen gevonden. Controleer locatie-koppeling en regio-instellingen.";
  } else if (!hasMedia && asset.yodeckReadinessStatus === 'NEEDS_NORMALIZATION') {
    recommendation = "WAIT_PROCESSING - Video wordt nog genormaliseerd.";
  } else if (!hasMedia && asset.yodeckReadinessStatus === 'NORMALIZING') {
    recommendation = "WAIT_PROCESSING - Normalisatie is bezig.";
  } else if (!hasMedia && (asset.publishStatus === 'PUBLISH_FAILED' || !asset.publishStatus)) {
    recommendation = "RETRY_PUBLISH - Geen Yodeck media. Gebruik 'Opnieuw publiceren'.";
  } else if (hasMedia && contentItems.length === 0) {
    recommendation = "PLAYLIST_REBUILD - Media bestaat in Yodeck maar is niet op playlists. Gebruik baseline sync.";
  } else if (asset.publishStatus === 'PUBLISH_FAILED') {
    recommendation = "RETRY_PUBLISH - Publicatie eerder mislukt. Gebruik 'Opnieuw publiceren'.";
  } else if (asset.publishStatus === 'PENDING') {
    recommendation = "WAIT_PROCESSING - Publicatie is bezig.";
  } else {
    recommendation = `CHECK_MANUALLY - approvalStatus=${asset.approvalStatus} publishStatus=${asset.publishStatus}`;
  }

  return {
    asset: {
      id: asset.id,
      approvalStatus: asset.approvalStatus,
      publishStatus: asset.publishStatus,
      publishAttempts: asset.publishAttempts || 0,
      lastPublishAttemptAt: asset.lastPublishAttemptAt?.toISOString() || null,
      publishError: asset.publishError,
      storagePath: asset.storagePath,
      normalizedStoragePath: asset.normalizedStoragePath,
      yodeckReadinessStatus: asset.yodeckReadinessStatus,
    },
    targeting: {
      advertiserId: asset.advertiserId,
      advertiserName: advertiser?.companyName || null,
      targetRegionCodes: (advertiser as any)?.targetRegionCodes || null,
      selectedScreenIds: relevantScreenIds,
      selectedYodeckPlayerIds: relevantScreens.map((s: any) => s.yodeckPlayerId || null),
    },
    playlist: {
      baselinePlaylistId,
      screenPlaylists: relevantScreens.map((s: any) => ({
        screenId: s.id,
        screenName: s.name || s.id,
        playlistId: s.playlistId || null,
        yodeckMediaPresent: contentScreenIds.has(s.id),
      })),
    },
    yodeck: {
      mediaId: asset.yodeckMediaId,
      uploadedAt: asset.yodeckUploadedAt?.toISOString() || null,
      lastUploadJob: latestUploadJob ? {
        id: latestUploadJob.id,
        status: latestUploadJob.status,
        finalState: latestUploadJob.finalState,
        correlationId: latestUploadJob.correlationId,
        yodeckMediaId: latestUploadJob.yodeckMediaId,
        yodeckStatus: latestUploadJob.yodeckStatus,
        yodeckFileSize: latestUploadJob.yodeckFileSize,
        lastError: latestUploadJob.lastError,
        errorCode: latestUploadJob.errorCode,
        attempt: latestUploadJob.attempt,
        createdAt: latestUploadJob.createdAt?.toISOString() || '',
      } : null,
    },
    lastSteps: steps,
    recommendation,
  };
}

export interface ScreenAssignmentResult {
  screenId: number;
  before: { source_type: string | null; source_id: number | null } | null;
  after: { source_type: string | null; source_id: number | null } | null;
  verified: boolean;
  error?: string;
}

export interface ResolveDebugInfo {
  reviewId: string;
  hasAdvertiserId: boolean;
  advertiserId: string | null;
  contractsFoundCount: number;
  placementsFoundCount: number;
  locationsFoundCount: number;
  locationsWithPlaylistCount: number;
  screensFoundCount: number;
  screenMappingsFoundCount: number;
  notes: string[];
}

export interface PublishAssetResult {
  ok: boolean;
  correlationId: string;
  yodeckMediaId?: number | null;
  locationsUpdated?: number;
  error?: string;
  message?: string;
  alreadyProcessing?: boolean;
  intendedPlaylistId?: number | null;
  targetScreenIds?: number[];
  screenAssignment?: ScreenAssignmentResult[];
  debug?: ResolveDebugInfo;
}

export async function verifyScreenAssignment(
  screenId: number,
  intendedPlaylistId: number,
): Promise<ScreenAssignmentResult> {
  const LOG = `[ScreenVerify]`;
  try {
    const { getYodeckClient } = await import('./yodeckClient');
    const client = await getYodeckClient();
    if (!client) throw new Error('Yodeck client not configured');

    const before = await client.getScreen(screenId);
    const beforeContent = before?.screen_content
      ? { source_type: before.screen_content.source_type || null, source_id: before.screen_content.source_id || null }
      : null;

    const alreadyCorrect = beforeContent?.source_type === "playlist" && beforeContent?.source_id === intendedPlaylistId;
    if (alreadyCorrect) {
      console.log(`${LOG} screen ${screenId} already assigned to playlist ${intendedPlaylistId}`);
      return { screenId, before: beforeContent, after: beforeContent, verified: true };
    }

    console.log(`${LOG} screen ${screenId} before: ${JSON.stringify(beforeContent)} → patching screen_content to playlist ${intendedPlaylistId}`);
    const patchResult = await client.patchScreenContent(screenId, intendedPlaylistId);
    if (!patchResult.ok) {
      return { screenId, before: beforeContent, after: null, verified: false, error: patchResult.error };
    }

    await new Promise(r => setTimeout(r, 1500));

    const after1 = await client.getScreen(screenId);
    const after1Content = after1?.screen_content
      ? { source_type: after1.screen_content.source_type || null, source_id: after1.screen_content.source_id || null }
      : null;

    if (after1Content?.source_type === "playlist" && after1Content?.source_id === intendedPlaylistId) {
      console.log(`${LOG} screen ${screenId} VERIFIED on first check`);
      return { screenId, before: beforeContent, after: after1Content, verified: true };
    }

    console.log(`${LOG} screen ${screenId} first check FAILED, retrying patch...`);
    await client.patchScreenContent(screenId, intendedPlaylistId);
    await new Promise(r => setTimeout(r, 2500));

    const after2 = await client.getScreen(screenId);
    const after2Content = after2?.screen_content
      ? { source_type: after2.screen_content.source_type || null, source_id: after2.screen_content.source_id || null }
      : null;

    const verified = after2Content?.source_type === "playlist" && after2Content?.source_id === intendedPlaylistId;
    console.log(`${LOG} screen ${screenId} ${verified ? 'VERIFIED' : 'FAILED'} on retry check`);
    return {
      screenId,
      before: beforeContent,
      after: after2Content,
      verified,
      error: verified ? undefined : `SCREEN_ASSIGNMENT_FAILED: expected playlist ${intendedPlaylistId}, got ${JSON.stringify(after2Content)}`,
    };
  } catch (err: any) {
    console.error(`${LOG} screen ${screenId} exception: ${err.message}`);
    return { screenId, before: null, after: null, verified: false, error: err.message };
  }
}

export async function resolveAndVerifyScreens(
  advertiserId: string,
  correlationId: string,
  assetId?: string,
): Promise<{ intendedPlaylistId: number | null; targetScreenIds: number[]; screenAssignment: ScreenAssignmentResult[]; debug: ResolveDebugInfo }> {
  const LOG = `[ScreenVerifyPhase]`;
  let intendedPlaylistId: number | null = null;
  const targetScreenIds: number[] = [];
  const screenAssignment: ScreenAssignmentResult[] = [];
  const notes: string[] = [];

  const debug: ResolveDebugInfo = {
    reviewId: assetId || 'unknown',
    hasAdvertiserId: !!advertiserId,
    advertiserId: advertiserId || null,
    contractsFoundCount: 0,
    placementsFoundCount: 0,
    locationsFoundCount: 0,
    locationsWithPlaylistCount: 0,
    screensFoundCount: 0,
    screenMappingsFoundCount: 0,
    notes,
  };

  if (!advertiserId) {
    notes.push('advertiserId is missing on asset');
    return { intendedPlaylistId, targetScreenIds, screenAssignment, debug };
  }

  const advertiserContracts = await db.select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.advertiserId, advertiserId), eq(contracts.status, "signed")));
  debug.contractsFoundCount = advertiserContracts.length;

  if (advertiserContracts.length === 0) {
    notes.push(`No signed contracts for advertiser ${advertiserId}`);
  }

  const contractIds = advertiserContracts.map(c => c.id);
  if (contractIds.length > 0) {
    const contractPlacements = await db.select({ screenId: placements.screenId })
      .from(placements)
      .where(inArray(placements.contractId, contractIds));
    debug.placementsFoundCount = contractPlacements.length;

    if (contractPlacements.length === 0) {
      notes.push(`No placements for ${contractIds.length} contract(s)`);
    }

    const screenIds = Array.from(new Set(contractPlacements.map(p => p.screenId).filter(Boolean)));
    debug.screensFoundCount = screenIds.length;

    if (screenIds.length === 0) {
      notes.push('No screenIds from placements');
    }

    if (screenIds.length > 0) {
      const screenLocations = await db.select({ locationId: screens.locationId })
        .from(screens)
        .where(and(inArray(screens.id, screenIds), isNotNull(screens.locationId)));

      const locationIds = Array.from(new Set(screenLocations.map(s => s.locationId).filter(Boolean))) as string[];
      debug.locationsFoundCount = locationIds.length;

      if (locationIds.length === 0) {
        notes.push(`${screenIds.length} screen(s) found but none have locationId`);
      }

      for (const locId of locationIds) {
        const [loc] = await db.select().from(locations).where(eq(locations.id, locId));
        if (!loc) {
          notes.push(`Location ${locId} not found in DB`);
          continue;
        }

        const playlistId = loc.yodeckPlaylistId ? parseInt(loc.yodeckPlaylistId) : null;
        if (!playlistId || isNaN(playlistId)) {
          notes.push(`Location ${locId} (${loc.name}) has no yodeckPlaylistId`);
          continue;
        }

        debug.locationsWithPlaylistCount++;
        if (!intendedPlaylistId) intendedPlaylistId = playlistId;

        let yodeckScreenId: number | null = null;
        if (loc.yodeckDeviceId) {
          yodeckScreenId = parseInt(loc.yodeckDeviceId);
        } else {
          const linkedScreens = await db.select({ yodeckPlayerId: screens.yodeckPlayerId })
            .from(screens)
            .where(eq(screens.locationId, locId));
          if (linkedScreens.length > 0 && linkedScreens[0].yodeckPlayerId) {
            yodeckScreenId = parseInt(linkedScreens[0].yodeckPlayerId);
          }
        }

        if (!yodeckScreenId || isNaN(yodeckScreenId)) {
          notes.push(`Location ${locId} (${loc.name}) has playlist ${playlistId} but no yodeckScreenId/yodeckDeviceId`);
          continue;
        }

        debug.screenMappingsFoundCount++;
        targetScreenIds.push(yodeckScreenId);
        console.log(`${LOG} ${correlationId} verifying screen ${yodeckScreenId} → playlist ${playlistId}`);
        const result = await verifyScreenAssignment(yodeckScreenId, playlistId);
        screenAssignment.push(result);
      }
    }
  }

  if (targetScreenIds.length === 0) {
    notes.push(`Resolution chain: advertiser(${advertiserId}) → contracts(${debug.contractsFoundCount}) → placements(${debug.placementsFoundCount}) → screens(${debug.screensFoundCount}) → locations(${debug.locationsFoundCount}) → withPlaylist(${debug.locationsWithPlaylistCount}) → mappings(${debug.screenMappingsFoundCount}) = 0 targets`);
  }

  console.log(`${LOG} ${correlationId} resolve complete: ${targetScreenIds.length} targets, ${notes.length} notes`);

  return { intendedPlaylistId, targetScreenIds, screenAssignment, debug };
}

export async function publishAsset(
  assetId: string,
  opts: { actor: string; isRetry?: boolean }
): Promise<PublishAssetResult> {
  const correlationId = `publish-${assetId}-${Date.now()}`;
  const LOG = `[PublishAsset]`;

  const asset = await db.query.adAssets.findFirst({
    where: eq(adAssets.id, assetId),
  });

  if (!asset) {
    return { ok: false, correlationId, error: "Asset niet gevonden" };
  }

  if (asset.publishStatus === 'PUBLISHED' && asset.approvalStatus === 'LIVE') {
    console.log(`${LOG} ${correlationId} ALREADY_PUBLISHED assetId=${assetId} — running screen verification`);
    try {
      const { intendedPlaylistId, targetScreenIds, screenAssignment, debug } =
        await resolveAndVerifyScreens(asset.advertiserId, correlationId, assetId);

      if (targetScreenIds.length === 0) {
        return {
          ok: false, correlationId, yodeckMediaId: asset.yodeckMediaId,
          alreadyProcessing: true, error: "NO_TARGET_RESOLVED",
          intendedPlaylistId, targetScreenIds, screenAssignment, debug,
        };
      }

      const allVerified = screenAssignment.every(s => s.verified);
      return {
        ok: allVerified,
        correlationId,
        yodeckMediaId: asset.yodeckMediaId,
        alreadyProcessing: true,
        message: allVerified ? "Publicatie voltooid en geverifieerd" : undefined,
        error: allVerified ? undefined : `SCREEN_ASSIGNMENT_FAILED: ${screenAssignment.filter(s => !s.verified).map(s => `screen ${s.screenId}`).join(', ')}`,
        intendedPlaylistId,
        targetScreenIds,
        screenAssignment,
        debug,
      };
    } catch (err: any) {
      console.error(`${LOG} ${correlationId} screen verification error for LIVE asset: ${err.message}`);
      return {
        ok: false, correlationId, yodeckMediaId: asset.yodeckMediaId,
        alreadyProcessing: true, error: err.message,
        intendedPlaylistId: null, targetScreenIds: [], screenAssignment: [],
      };
    }
  }

  const allowedStatuses = ['APPROVED', 'APPROVED_PENDING_PUBLISH'];
  if (!allowedStatuses.includes(asset.approvalStatus)) {
    return { ok: false, correlationId, error: `Asset heeft status ${asset.approvalStatus}, moet APPROVED of APPROVED_PENDING_PUBLISH zijn` };
  }

  const atomicResult = await db.update(adAssets).set({
    publishStatus: 'PENDING',
    publishAttempts: sql`COALESCE(${adAssets.publishAttempts}, 0) + 1`,
    lastPublishAttemptAt: new Date(),
    publishError: null,
  }).where(
    and(
      eq(adAssets.id, assetId),
      ne(adAssets.publishStatus, 'PENDING')
    )
  ).returning({ id: adAssets.id });

  if (atomicResult.length === 0) {
    console.log(`${LOG} ${correlationId} CONCURRENT_PENDING assetId=${assetId} — running screen verification anyway`);
    try {
      const { intendedPlaylistId, targetScreenIds, screenAssignment, debug } =
        await resolveAndVerifyScreens(asset.advertiserId, correlationId, assetId);

      if (targetScreenIds.length === 0) {
        return {
          ok: false, correlationId, alreadyProcessing: true, error: "NO_TARGET_RESOLVED",
          intendedPlaylistId, targetScreenIds, screenAssignment, debug,
        };
      }

      const allVerified = screenAssignment.every(s => s.verified);
      return {
        ok: allVerified,
        correlationId,
        alreadyProcessing: true,
        message: allVerified ? "Publicatie voltooid en geverifieerd" : undefined,
        error: allVerified ? undefined : `SCREEN_ASSIGNMENT_FAILED: ${screenAssignment.filter(s => !s.verified).map(s => `screen ${s.screenId}`).join(', ')}`,
        intendedPlaylistId,
        targetScreenIds,
        screenAssignment,
        debug,
      };
    } catch (err: any) {
      return {
        ok: false, correlationId, alreadyProcessing: true, error: err.message,
        intendedPlaylistId: null, targetScreenIds: [], screenAssignment: [],
      };
    }
  }

  console.log(`${LOG} ${correlationId} START assetId=${assetId} actor=${opts.actor} approvalStatus=${asset.approvalStatus} publishStatus=${asset.publishStatus}`);

  let effectiveYodeckMediaId = asset.yodeckMediaId;

  if (!effectiveYodeckMediaId) {
    console.log(`${LOG} ${correlationId} no yodeckMediaId, running publishSingleAsset`);
    try {
      const { publishSingleAsset } = await import('./mediaPipelineService');
      const result = await publishSingleAsset({
        assetId,
        correlationId,
        actor: opts.actor,
      });

      if (result.ok && result.yodeckMediaId) {
        effectiveYodeckMediaId = result.yodeckMediaId;
        console.log(`${LOG} ${correlationId} publishSingleAsset OK yodeckMediaId=${effectiveYodeckMediaId}`);
      } else {
        console.warn(`${LOG} ${correlationId} publishSingleAsset FAILED: ${result.error}`);
        await db.update(adAssets).set({
          publishStatus: 'PUBLISH_FAILED',
          publishError: result.error || 'Yodeck upload mislukt',
        }).where(eq(adAssets.id, assetId));
        return { ok: false, correlationId, error: result.error || 'Yodeck upload mislukt' };
      }
    } catch (err: any) {
      console.error(`${LOG} ${correlationId} publishSingleAsset EXCEPTION: ${err.message}`);
      await db.update(adAssets).set({
        publishStatus: 'PUBLISH_FAILED',
        publishError: err.message,
      }).where(eq(adAssets.id, assetId));
      return { ok: false, correlationId, error: err.message };
    }
  } else {
    console.log(`${LOG} ${correlationId} existing yodeckMediaId=${effectiveYodeckMediaId}`);
  }

  if (effectiveYodeckMediaId) {
    try {
      const { getYodeckClient } = await import('./yodeckClient');
      const client = await getYodeckClient();
      if (client) {
        const assetForName = await db.query.adAssets.findFirst({ where: eq(adAssets.id, assetId) });
        const nameSearches: string[] = [];
        if (assetForName?.storedFilename) {
          nameSearches.push(assetForName.storedFilename.replace(/\.[^/.]+$/, ""));
          nameSearches.push(assetForName.storedFilename);
        }
        if (assetForName?.advertiserId) {
          const adv = await db.query.advertisers.findFirst({ where: eq(advertisers.id, assetForName.advertiserId) });
          if (adv?.linkKey) {
            nameSearches.push(adv.linkKey);
            const prefix = adv.linkKey.split('-').slice(0, 2).join('-');
            if (prefix !== adv.linkKey) nameSearches.push(prefix);
          }
        }

        const resolution = await client.ensureMediaReadyAndExists({
          mediaId: effectiveYodeckMediaId,
          searchNames: nameSearches,
        });
        console.log(`${LOG} ${correlationId} ensureMedia: method=${resolution.method} resolved=${resolution.resolvedId} original=${resolution.originalId}`);

        if (resolution.resolvedId && resolution.resolvedId !== effectiveYodeckMediaId) {
          console.log(`${LOG} ${correlationId} DB self-heal: yodeckMediaId ${effectiveYodeckMediaId} → ${resolution.resolvedId}`);
          await db.update(adAssets).set({ yodeckMediaId: resolution.resolvedId }).where(eq(adAssets.id, assetId));
          effectiveYodeckMediaId = resolution.resolvedId;
        } else if (!resolution.resolvedId) {
          console.warn(`${LOG} ${correlationId} MEDIA_UNRESOLVABLE: yodeckMediaId=${effectiveYodeckMediaId} could not be verified (proceeding — may be transient)`);
        }
      }
    } catch (verifyErr: any) {
      console.warn(`${LOG} ${correlationId} media verification error (continuing): ${verifyErr.message}`);
    }
  }

  let locationsUpdated = 0;
  let canonicalPublishOk = false;
  let canonicalPublishError: string | null = null;
  try {
    const { publishApprovedAdToAllLocations } = await import('./yodeckAutopilotService');
    console.log(`${LOG} ${correlationId} starting canonical publish yodeckMediaId=${effectiveYodeckMediaId}`);
    const autopilotResult = await publishApprovedAdToAllLocations(assetId);
    locationsUpdated = autopilotResult.locationsSuccess;
    canonicalPublishOk = autopilotResult.ok;

    if (autopilotResult.ok) {
      console.log(`${LOG} ${correlationId} canonical publish OK locations=${locationsUpdated}`);
    } else {
      canonicalPublishError = `${autopilotResult.locationsFailed} locatie(s) mislukt`;
      console.warn(`${LOG} ${correlationId} canonical publish PARTIAL_FAIL failed=${autopilotResult.locationsFailed}`);
    }
  } catch (err: any) {
    canonicalPublishError = err.message;
    console.warn(`${LOG} ${correlationId} canonical publish ERROR: ${err.message}`);
  }

  let intendedPlaylistId: number | null = null;
  let targetScreenIds: number[] = [];
  let screenAssignment: ScreenAssignmentResult[] = [];
  let resolveDebug: ResolveDebugInfo | undefined;

  try {
    const verifyResult = await resolveAndVerifyScreens(asset.advertiserId, correlationId, assetId);
    intendedPlaylistId = verifyResult.intendedPlaylistId;
    targetScreenIds = verifyResult.targetScreenIds;
    screenAssignment = verifyResult.screenAssignment;
    resolveDebug = verifyResult.debug;
  } catch (err: any) {
    console.warn(`${LOG} ${correlationId} screen verification phase error: ${err.message}`);
  }

  const allScreensVerified = screenAssignment.length > 0
    ? screenAssignment.every(s => s.verified)
    : true;
  const screenVerifyError = !allScreensVerified
    ? `SCREEN_ASSIGNMENT_FAILED: ${screenAssignment.filter(s => !s.verified).map(s => `screen ${s.screenId}`).join(', ')}`
    : null;

  const publishSuccess = !!effectiveYodeckMediaId && canonicalPublishOk && allScreensVerified;
  const publishErrorMsg = !effectiveYodeckMediaId
    ? 'Geen Yodeck media ID verkregen'
    : !canonicalPublishOk
      ? (canonicalPublishError || 'Publicatie naar schermen mislukt')
      : screenVerifyError
        ? screenVerifyError
        : null;

  await db.update(adAssets).set({
    approvalStatus: publishSuccess ? 'LIVE' : 'APPROVED',
    publishStatus: publishSuccess ? 'PUBLISHED' : 'PUBLISH_FAILED',
    publishError: publishErrorMsg,
    yodeckMediaId: effectiveYodeckMediaId || asset.yodeckMediaId,
    yodeckUploadedAt: effectiveYodeckMediaId ? new Date() : asset.yodeckUploadedAt,
  }).where(eq(adAssets.id, assetId));

  console.log(`${LOG} ${correlationId} DONE approvalStatus=${publishSuccess ? 'LIVE' : 'APPROVED'} publishStatus=${publishSuccess ? 'PUBLISHED' : 'PUBLISH_FAILED'} yodeckMediaId=${effectiveYodeckMediaId} screensVerified=${allScreensVerified}`);

  return {
    ok: publishSuccess,
    correlationId,
    yodeckMediaId: effectiveYodeckMediaId,
    locationsUpdated,
    error: publishErrorMsg || undefined,
    intendedPlaylistId,
    targetScreenIds,
    screenAssignment,
    debug: resolveDebug,
  };
}
