import crypto from "crypto";
import { storage } from "../storage";
import { db } from "../db";
import { uploadJobs, screens, advertisers, locations, contracts, placements, adAssets } from "@shared/schema";
import { sql, eq, desc, and, isNotNull } from "drizzle-orm";
import { getR2Config } from "../objectStorage";
import { YodeckClient, getYodeckConfigStatus } from "./yodeckClient";
import { yodeckRequest, getScreenPlaybackState } from "./simplePlaylistModel";

const LOG_PREFIX = "[AI_DUMP_V2]";

interface AiDumpV2Options {
  includeYodeck?: boolean;
  includePlaylists?: boolean;
  includePlaylistItems?: boolean;
  includeMediaDetails?: boolean;
  includeNowPlaying?: boolean;
  includeStorageChecks?: boolean;
  yodeckPlayerIds?: number[];
  screenIds?: string[];
  maxPlaylistItemsPerPlaylist?: number;
  maxMediaDetails?: number;
}

interface AiDumpV2Result {
  meta: {
    correlationId: string;
    generatedAt: string;
    durationMs: number;
    filters: AiDumpV2Options;
  };
  env: Record<string, any>;
  db: Record<string, any>;
  yodeck: Record<string, any>;
  checks: Record<string, any>;
  summary: Record<string, any>;
  errors: Array<{ layer: string; message: string; detail?: string }>;
}

function maskSecret(val: string | undefined | null, showChars = 4): string {
  if (!val) return "(not set)";
  if (val.length <= showChars) return "****";
  return val.substring(0, showChars) + "****";
}

export async function buildAiDumpV2(options: AiDumpV2Options): Promise<AiDumpV2Result> {
  const startTime = Date.now();
  const correlationId = `dump-${crypto.randomUUID().substring(0, 8)}`;
  const errors: AiDumpV2Result["errors"] = [];

  const maxPlaylistItems = options.maxPlaylistItemsPerPlaylist || 200;
  const maxMedia = options.maxMediaDetails || 200;

  console.log(`${LOG_PREFIX} [${correlationId}] Starting AI Dump V2 build...`);

  // ── A) ENV & BUILD CONTEXT ──────────────────────────────────────────
  let envLayer: Record<string, any> = {};
  try {
    const r2 = getR2Config();
    const yodeckConfig = await getYodeckConfigStatus().catch(() => null);
    let appVersion = "unknown";
    try {
      const pkg = await import("../../package.json");
      appVersion = pkg.version || "unknown";
    } catch {}

    envLayer = {
      appVersion,
      nodeEnv: process.env.NODE_ENV || "not_set",
      testMode: process.env.TEST_MODE === "true",
      contentPipelineMode: process.env.CONTENT_PIPELINE_MODE || "default",
      adsRequireContract: process.env.ADS_REQUIRE_CONTRACT !== "false",
      legacyUploadDisabled: process.env.LEGACY_UPLOAD_DISABLED !== "false",
      storage: {
        provider: r2.provider,
        bucket: r2.bucket || "(not set)",
        endpointHost: r2.endpointHost ? maskSecret(r2.endpointHost, 15) : "(not set)",
        r2Configured: r2.r2Configured,
        hasAccessKey: r2.hasAccessKey,
        hasSecretKey: r2.hasSecretKey,
      },
      yodeck: yodeckConfig ? {
        configured: yodeckConfig.ok,
        tokenSource: yodeckConfig.activeSource,
        tokenFormatValid: yodeckConfig.tokenFormatValid,
        parsedLabelPresent: yodeckConfig.parsedLabelPresent,
        parsedValuePresent: yodeckConfig.parsedValuePresent,
        formatError: yodeckConfig.formatError || null,
      } : { configured: false, error: "Could not fetch yodeck config" },
    };
  } catch (e: any) {
    errors.push({ layer: "env", message: e.message });
  }

  // ── B) DB SNAPSHOT ──────────────────────────────────────────────────
  let dbLayer: Record<string, any> = {};
  try {
    const allScreens = await storage.getScreens();
    const allLocations = await storage.getLocations();
    const allAdvertisers = await storage.getAdvertisers();
    const allContracts = await storage.getContracts();
    const allPlacements = await storage.getPlacements();

    const uploadJobRows = await db.select().from(uploadJobs)
      .orderBy(desc(uploadJobs.createdAt))
      .limit(50);

    const filteredScreens = options.screenIds?.length
      ? allScreens.filter(s => options.screenIds!.includes(s.id) || options.screenIds!.includes(s.screenId))
      : allScreens;

    const screenSnapshots = filteredScreens.map(s => {
      const loc = allLocations.find(l => l.id === s.locationId);
      const screenPlacements = allPlacements.filter(p => p.screenId === s.id);
      return {
        id: s.id,
        screenId: s.screenId,
        name: s.name,
        locationId: s.locationId,
        locationName: loc?.name || null,
        locationCity: loc?.city || null,
        yodeckPlayerId: s.yodeckPlayerId,
        status: s.status,
        isActive: s.isActive,
        dbPlaylistId: s.playlistId,
        dbPlaylistName: s.playlistName,
        combinedPlaylistId: s.combinedPlaylistId,
        lastPushAt: s.lastPushAt,
        lastPushResult: s.lastPushResult,
        lastPushError: s.lastPushError,
        lastSeenAt: s.lastSeenAt,
        onboardingStatus: s.onboardingStatus,
        placementsCount: screenPlacements.length,
        placementsSummary: screenPlacements.map(p => ({
          id: p.id,
          contractId: p.contractId,
          isActive: p.isActive,
          startDate: p.startDate,
          endDate: p.endDate,
        })),
      };
    });

    const locationSnapshots = allLocations.map(l => ({
      id: l.id,
      locationCode: l.locationCode,
      name: l.name,
      city: l.city,
      status: l.status,
      readyForAds: l.readyForAds,
      screensLinked: allScreens.filter(s => s.locationId === l.id).length,
    }));

    const advertiserSnapshots = allAdvertisers.map(a => ({
      id: a.id,
      companyName: a.companyName,
      status: a.status,
      assetStatus: a.assetStatus,
      yodeckMediaIdCanonical: a.yodeckMediaIdCanonical,
      onboardingStatus: a.onboardingStatus,
      contractsCount: allContracts.filter(c => c.advertiserId === a.id).length,
      activeContracts: allContracts.filter(c => c.advertiserId === a.id && c.status === "active").length,
      targetRegionCodes: a.targetRegionCodes,
      targetCities: a.targetCities,
    }));

    const uploadJobPending = uploadJobRows.filter(j => j.status === "QUEUED" || j.status === "UPLOADING" || j.status === "POLLING");
    const uploadJobFailed = uploadJobRows.filter(j => j.status === "PERMANENT_FAIL" || j.status === "RETRYABLE_FAIL");
    const uploadJobReady = uploadJobRows.filter(j => j.status === "READY");

    dbLayer = {
      counts: {
        screens: allScreens.length,
        locations: allLocations.length,
        advertisers: allAdvertisers.length,
        contracts: allContracts.length,
        placements: allPlacements.length,
        uploadJobsTotal: uploadJobRows.length,
      },
      screens: screenSnapshots,
      locations: locationSnapshots,
      advertisers: advertiserSnapshots,
      uploadQueue: {
        pending: uploadJobPending.length,
        failed: uploadJobFailed.length,
        ready: uploadJobReady.length,
        recentJobs: uploadJobRows.slice(0, 10).map(j => ({
          id: j.id,
          advertiserId: j.advertiserId,
          status: j.status,
          finalState: j.finalState,
          yodeckMediaId: j.yodeckMediaId,
          attempt: j.attempt,
          lastError: j.lastError,
          createdAt: j.createdAt,
          completedAt: j.completedAt,
        })),
      },
      mappings: screenSnapshots.map(s => ({
        screenId: s.screenId,
        locationName: s.locationName,
        locationCity: s.locationCity,
        dbPlaylistId: s.dbPlaylistId,
        yodeckPlayerId: s.yodeckPlayerId,
      })),
    };
  } catch (e: any) {
    errors.push({ layer: "db", message: e.message, detail: e.stack?.substring(0, 300) });
  }

  // ── C) YODECK LIVE SNAPSHOT ─────────────────────────────────────────
  let yodeckLayer: Record<string, any> = { enabled: false };

  if (options.includeYodeck !== false) {
    try {
      const client = await YodeckClient.create();
      if (!client) {
        errors.push({ layer: "yodeck", message: "YodeckClient could not be created (token missing or invalid)" });
        yodeckLayer = { enabled: true, available: false };
      } else {
        yodeckLayer = { enabled: true, available: true, players: [], playlists: [], mediaDetails: [] };

        const screensForYodeck = (dbLayer.screens || []) as any[];
        const playerIds = options.yodeckPlayerIds?.length
          ? options.yodeckPlayerIds
          : screensForYodeck
              .filter((s: any) => s.yodeckPlayerId)
              .map((s: any) => parseInt(s.yodeckPlayerId, 10))
              .filter((id: number) => !isNaN(id));

        const playerSnapshots: any[] = [];
        const allPlaylistIds = new Set<number>();
        const allMediaIds = new Set<number>();

        for (const playerId of playerIds) {
          try {
            const screenResult = await yodeckRequest<any>(`/screens/${playerId}/`);
            if (!screenResult.ok) {
              playerSnapshots.push({ playerId, error: screenResult.error, online: null });
              continue;
            }
            const data = screenResult.data;
            const sc = data?.screen_content || data?.screencontent;
            const sourceType = sc?.source_type || sc?.sourcetype || null;
            const sourceId = sc?.source_id || sc?.sourceid || null;

            const dbScreen = screensForYodeck.find((s: any) => String(s.yodeckPlayerId) === String(playerId));
            const expectedPlaylistId = dbScreen?.dbPlaylistId ? parseInt(dbScreen.dbPlaylistId, 10) : null;
            const actualPlaylistId = sourceType === "playlist" ? sourceId : null;
            const mismatch = expectedPlaylistId !== null && actualPlaylistId !== expectedPlaylistId;

            if (actualPlaylistId) allPlaylistIds.add(actualPlaylistId);
            if (expectedPlaylistId) allPlaylistIds.add(expectedPlaylistId);

            playerSnapshots.push({
              playerId,
              name: data.name || null,
              online: data.status === "online" || data.is_online === true,
              lastSeen: data.last_seen || data.lastSeen || null,
              currentSourceType: sourceType,
              currentSourceId: sourceId,
              currentSourceName: data.screen_content?.source_name || null,
              expectedPlaylistId,
              actualPlaylistId,
              mismatch,
              dbScreenId: dbScreen?.screenId || null,
            });
          } catch (e: any) {
            playerSnapshots.push({ playerId, error: e.message, online: null });
            errors.push({ layer: "yodeck", message: `Player ${playerId}: ${e.message}` });
          }
        }
        yodeckLayer.players = playerSnapshots;

        // Playlists
        if (options.includePlaylists !== false && allPlaylistIds.size > 0) {
          const playlistSnapshots: any[] = [];
          for (const plId of Array.from(allPlaylistIds)) {
            try {
              const plResult = await yodeckRequest<any>(`/playlists/${plId}/`);
              if (!plResult.ok) {
                playlistSnapshots.push({ id: plId, error: plResult.error });
                continue;
              }
              const plData = plResult.data;
              const items = plData.items || [];
              const limitedItems = options.includePlaylistItems
                ? items.slice(0, maxPlaylistItems).map((item: any) => {
                    if (item.id) allMediaIds.add(item.id);
                    return {
                      id: item.id,
                      name: item.name || item.title || null,
                      type: item.type || "media",
                      duration: item.duration || null,
                      mediaId: item.id,
                    };
                  })
                : undefined;

              playlistSnapshots.push({
                id: plId,
                name: plData.name,
                itemCount: items.length,
                items: limitedItems,
              });
            } catch (e: any) {
              playlistSnapshots.push({ id: plId, error: e.message });
              errors.push({ layer: "yodeck", message: `Playlist ${plId}: ${e.message}` });
            }
          }
          yodeckLayer.playlists = playlistSnapshots;
        }

        // Media details
        if (options.includeMediaDetails && allMediaIds.size > 0) {
          const mediaSnapshots: any[] = [];
          const mediaIdsToCheck = Array.from(allMediaIds).slice(0, maxMedia);
          for (const mediaId of mediaIdsToCheck) {
            try {
              const mResult = await yodeckRequest<any>(`/media/${mediaId}/`);
              if (!mResult.ok) {
                mediaSnapshots.push({ id: mediaId, error: mResult.error });
                continue;
              }
              const m = mResult.data;
              const origin = m.media_origin || {};
              const args = m.arguments || {};
              const isLocalOk = (origin.source === "local" || !origin.source) &&
                (m.status === "ready" || m.status === "ok" || m.status === "finished");

              mediaSnapshots.push({
                id: mediaId,
                name: m.name || m.title || null,
                status: m.status,
                fileSize: m.file_size || m.filesize || null,
                mediaOrigin: origin,
                playFromUrl: args.play_from_url || null,
                downloadFromUrl: args.download_from_url || null,
                bufferSettings: args.buffer || null,
                fileExtension: m.file_extension || null,
                LOCAL_OK: isLocalOk,
              });
            } catch (e: any) {
              mediaSnapshots.push({ id: mediaId, error: e.message });
            }
          }
          yodeckLayer.mediaDetails = mediaSnapshots;
        }

        // Shared playlist detection
        const playlistOwnership = new Map<number, string[]>();
        for (const ps of playerSnapshots) {
          if (ps.actualPlaylistId) {
            const owners = playlistOwnership.get(ps.actualPlaylistId) || [];
            owners.push(String(ps.playerId));
            playlistOwnership.set(ps.actualPlaylistId, owners);
          }
        }
        const sharedPlaylists: any[] = [];
        for (const [plId, owners] of Array.from(playlistOwnership.entries())) {
          if (owners.length > 1) {
            sharedPlaylists.push({ playlistId: plId, sharedByPlayerIds: owners });
          }
        }
        yodeckLayer.sharedPlaylistsDetected = sharedPlaylists;
      }
    } catch (e: any) {
      errors.push({ layer: "yodeck", message: e.message, detail: e.stack?.substring(0, 300) });
      yodeckLayer = { enabled: true, available: false, error: e.message };
    }
  }

  // ── D) VERIFICATION & SUMMARY ──────────────────────────────────────
  let checksLayer: Record<string, any> = {};
  let summaryLayer: Record<string, any> = {};

  try {
    const playerSnapshots = yodeckLayer.players || [];
    const screensDb = (dbLayer.screens || []) as any[];
    const advertisersDb = (dbLayer.advertisers || []) as any[];
    const mediaDetails = yodeckLayer.mediaDetails || [];

    const mismatches: any[] = [];
    for (const ps of playerSnapshots) {
      if (ps.mismatch) {
        mismatches.push({
          playerId: ps.playerId,
          dbScreenId: ps.dbScreenId,
          expectedPlaylistId: ps.expectedPlaylistId,
          actualPlaylistId: ps.actualPlaylistId,
          issue: "PLAYLIST_MISMATCH",
          detail: `DB expects playlist ${ps.expectedPlaylistId} but Yodeck reports ${ps.actualPlaylistId}`,
        });
      }
      if (ps.currentSourceType && ps.currentSourceType !== "playlist") {
        mismatches.push({
          playerId: ps.playerId,
          dbScreenId: ps.dbScreenId,
          issue: "NOT_IN_PLAYLIST_MODE",
          detail: `Player source is "${ps.currentSourceType}" instead of "playlist"`,
        });
      }
    }

    const sharedPlaylists = yodeckLayer.sharedPlaylistsDetected || [];
    for (const sp of sharedPlaylists) {
      mismatches.push({
        issue: "SHARED_PLAYLIST_DETECTED",
        playlistId: sp.playlistId,
        sharedByPlayerIds: sp.sharedByPlayerIds,
        detail: `Playlist ${sp.playlistId} is shared by players: ${sp.sharedByPlayerIds.join(", ")}`,
      });
    }

    const connectionRisks: any[] = [];
    for (const md of mediaDetails) {
      if (!md.LOCAL_OK && md.playFromUrl) {
        connectionRisks.push({
          mediaId: md.id,
          name: md.name,
          issue: "CONNECTION_ERROR_RISK",
          detail: `Media ${md.id} uses play_from_url and is not LOCAL_OK (status: ${md.status})`,
        });
      }
    }

    const pushNotVerified: any[] = [];
    for (const s of screensDb) {
      if (s.lastPushResult === "ok" && s.dbPlaylistId) {
        const ps = playerSnapshots.find((p: any) => String(p.playerId) === String(s.yodeckPlayerId));
        if (ps && ps.actualPlaylistId !== parseInt(s.dbPlaylistId, 10)) {
          pushNotVerified.push({
            screenId: s.screenId,
            playerId: s.yodeckPlayerId,
            issue: "PUSH_NOT_VERIFIED",
            detail: `Push was "ok" but Yodeck shows playlist ${ps.actualPlaylistId} instead of ${s.dbPlaylistId}`,
          });
        }
      }
    }

    const allIssues = [...mismatches, ...connectionRisks, ...pushNotVerified];
    checksLayer = {
      totalIssues: allIssues.length,
      topIssues: allIssues.slice(0, 10),
      connectionRisks,
      pushNotVerified,
    };

    const onlineCount = playerSnapshots.filter((p: any) => p.online === true).length;
    const mismatchCount = mismatches.filter((m: any) => m.issue === "PLAYLIST_MISMATCH").length;
    const adsPublished = advertisersDb.filter((a: any) => a.assetStatus === "live").length;
    const mediaNotReady = mediaDetails.filter((m: any) => !m.LOCAL_OK && m.status !== "ready").length;

    const nextActions: string[] = [];
    if (sharedPlaylists.length > 0) nextActions.push("Run fix-shared-playlists to resolve shared playlist conflicts");
    if (mismatchCount > 0) nextActions.push(`Rebuild playlists for ${mismatchCount} mismatched screen(s)`);
    if (connectionRisks.length > 0) nextActions.push(`Investigate ${connectionRisks.length} media item(s) with connection risk`);
    if (pushNotVerified.length > 0) nextActions.push(`Re-push ${pushNotVerified.length} screen(s) with unverified push`);
    if (mediaNotReady.length > 0) nextActions.push(`Check ${mediaNotReady.length} media item(s) not in ready state`);

    summaryLayer = {
      quickFacts: {
        screensOnline: onlineCount,
        screensTotal: playerSnapshots.length,
        screensMismatch: mismatchCount,
        sharedPlaylists: sharedPlaylists.length,
        adsPublished,
        mediaNotReady,
        uploadsPending: (dbLayer.uploadQueue as any)?.pending || 0,
        uploadsFailed: (dbLayer.uploadQueue as any)?.failed || 0,
      },
      nextActions,
    };
  } catch (e: any) {
    errors.push({ layer: "checks", message: e.message });
  }

  const durationMs = Date.now() - startTime;

  const result: AiDumpV2Result = {
    meta: {
      correlationId,
      generatedAt: new Date().toISOString(),
      durationMs,
      filters: options,
    },
    env: envLayer,
    db: dbLayer,
    yodeck: yodeckLayer,
    checks: checksLayer,
    summary: summaryLayer,
    errors,
  };

  console.log(`${LOG_PREFIX} [${correlationId}] AI Dump V2 complete in ${durationMs}ms, ${errors.length} errors`);

  try {
    const serialized = JSON.stringify(result);
    console.log(`${LOG_PREFIX} ${serialized}`);
  } catch {
    console.log(`${LOG_PREFIX} [${correlationId}] (could not serialize full dump to log)`);
  }

  return result;
}
