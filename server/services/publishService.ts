/**
 * PUBLISH SERVICE
 * 
 * Single path for publishing an approved advertiser's ad to all target screens.
 * Uses the canonical playlist-only architecture.
 */

import { db } from "../db";
import { screens } from "@shared/schema";
import { eq } from "drizzle-orm";
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
