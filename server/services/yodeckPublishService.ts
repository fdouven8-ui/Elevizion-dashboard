/**
 * YodeckPublishService - Idempotent media upload and playlist management
 * 
 * Features:
 * - Upload video from Object Storage to Yodeck
 * - Add media to playlists
 * - Idempotent operations using integration_outbox
 * - Rollback support for failed publishes
 */

import { db } from "../db";
import { integrationOutbox, placementPlans, adAssets, locations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { ObjectStorageService } from "../objectStorage";
import { dispatchMailEvent } from "./mailEventService";
import { logAudit } from "./auditService";
import { guardCanonicalWrite } from "./yodeckCanonicalService";
import axios from "axios";
import FormData from "form-data";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const REQUEST_TIMEOUT = 120000; // 120 seconds for uploads
const MAX_RETRIES = 3;
const BUFFER_FALLBACK_MAX_BYTES = 20 * 1024 * 1024; // 20MB max for buffer fallback

// Tag-based playlist configuration
// Media is tagged with location-specific tags; playlists auto-populate based on tags
const ELEVIZION_TAG_PREFIX = "elevizion";

// PREDEFINED_TAGS - These must be created manually in Yodeck UI before first publish
// The Yodeck API does NOT support creating tags programmatically (/api/v2/tags returns 404)
export const PREDEFINED_TAGS = [
  "elevizion:ad",
  "elevizion:advertiser", 
  "elevizion:plan",
  "elevizion:location"
] as const;

// Yodeck API Capabilities (probed at runtime)
// NOTE: Tag CRUD API is NOT available in Yodeck (/api/v2/tags returns 404)
// Tags must be pre-created manually in Yodeck UI
export interface YodeckCapabilities {
  canListPlaylists: boolean;
  canGetPlaylist: boolean;
  canCreatePlaylist: boolean;
  canUpdateMediaTags: boolean;
  canAssignPlaylistToScreen: boolean;
  tagUpdateMethod: "PATCH" | "PUT" | null;
  tagFieldName: "tags" | "tag_names" | null;
  playlistCreateSchemaHint: any;
  lastProbeAt: string | null;
  probeLogs: string[];
}

// Playlist verification status
export type PlaylistVerifyStatus = "OK" | "MISSING" | "MISCONFIGURED" | "UNKNOWN";

interface YodeckMediaUploadResponse {
  id: number;
  name: string;
  url?: string;
}

interface YodeckPlaylistItem {
  id?: number;
  media?: number;
  type: string;
  duration?: number;
  priority?: number;
}

interface PublishTarget {
  locationId: string;
  locationName: string;
  yodeckPlaylistId: number;
  mediaId?: number;
  status: "pending" | "uploaded" | "added_to_playlist" | "failed";
  error?: string;
}

interface PublishReport {
  planId: string;
  startedAt: string;
  completedAt?: string;
  totalTargets: number;
  successCount: number;
  failedCount: number;
  yodeckMediaId: string | null;
  targets: { locationId: string; status: string; error?: string }[];
  publishedAt?: string;
  rolledBackAt?: string;
}

interface TwoStepUploadDiagnostics {
  metadata: {
    ok: boolean;
    status?: number;
    mediaId?: number;
    rawKeysFound: string[];
    uploadUrlFoundAt: string;
    error?: string;
  };
  binaryUpload: {
    ok: boolean;
    method: 'presigned_put' | 'patch' | 'none';
    status?: number;
    contentTypeSent?: string;
    bytesSent?: number;
    error?: string;
  };
  confirm: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    error?: string;
  };
  mediaStatusPoll?: {
    attempted: boolean;
    finalStatus?: string;
    isAborted: boolean;
    shouldRetry: boolean;
  };
  lastError?: {
    message: string;
    status?: number;
    bodySnippet?: string;
  };
}

// Media status response from Yodeck
export interface YodeckMediaStatus {
  id: number;
  name: string;
  status: 'ready' | 'uploading' | 'encoding' | 'failed' | 'aborted' | string;
  duration?: number;
  file_size?: number;
  thumbnail_url?: string;
  created_at?: string;
  updated_at?: string;
  is_ready?: boolean;
  encoding_progress?: number;
}

// Media inspect result for debug endpoint
export interface MediaInspectResult {
  ok: boolean;
  mediaId: number;
  status: string;
  isValid: boolean;
  validationDetails: {
    hasFile: boolean;
    hasDuration: boolean;
    durationSeconds: number;
    encodingState: string;
    isAborted: boolean;
    isUploading: boolean;
    isReady: boolean;
  };
  rawResponse?: any;
  error?: string;
}

// Polling result for media status
interface MediaStatusPollResult {
  ok: boolean;
  finalStatus: string;
  isUsable: boolean;
  isAborted: boolean;
  pollAttempts: number;
  error?: string;
  mediaDetails?: YodeckMediaStatus;
}

class YodeckPublishService {
  private apiKey: string | null = null;
  private capabilities: YodeckCapabilities | null = null;

  // NOTE: Tag CRUD API (/api/v2/tags) is NOT available in Yodeck (returns 404)
  // Tags must be pre-created manually in Yodeck UI before first publish
  // Use PREDEFINED_TAGS constant for all tag operations

  /**
   * Get the predefined tags that must exist in Yodeck
   * NOTE: Tags cannot be created via API - they must be manually created in Yodeck UI
   */
  getPredefinedTags(): readonly string[] {
    return PREDEFINED_TAGS;
  }

  /**
   * Get media details from Yodeck API
   * Used for status checking and inspection
   */
  async getMediaDetails(mediaId: number, correlationId?: string): Promise<{ ok: boolean; media?: YodeckMediaStatus; error?: string }> {
    const corrId = correlationId || crypto.randomUUID().substring(0, 8);
    const apiKey = await this.getApiKey();
    
    try {
      const response = await axios.get(`${YODECK_BASE_URL}/media/${mediaId}/`, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
        timeout: 30000,
        validateStatus: () => true,
      });
      
      console.log(`[YodeckPublish][${corrId}] GET /media/${mediaId}/ status=${response.status}`);
      
      if (response.status === 200 && response.data) {
        const data = response.data;
        const media: YodeckMediaStatus = {
          id: data.id,
          name: data.name || 'unknown',
          status: data.status || data.media_status || data.encoding_status || 'unknown',
          duration: data.duration || data.file_duration || 0,
          file_size: data.file_size || data.size || 0,
          thumbnail_url: data.thumbnail_url || data.thumbnail,
          created_at: data.created_at,
          updated_at: data.updated_at,
          is_ready: data.is_ready ?? (data.status === 'ready'),
          encoding_progress: data.encoding_progress || data.progress,
        };
        return { ok: true, media };
      }
      
      return { ok: false, error: `HTTP ${response.status}: ${JSON.stringify(response.data).substring(0, 200)}` };
    } catch (err: any) {
      console.error(`[YodeckPublish][${corrId}] getMediaDetails error:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Poll media status until it's usable or fails/times out
   * Returns when media is 'ready' or encounters 'failed'/'aborted' status
   */
  async pollMediaStatus(mediaId: number, options?: {
    maxAttempts?: number;
    intervalMs?: number;
    correlationId?: string;
  }): Promise<MediaStatusPollResult> {
    const { maxAttempts = 30, intervalMs = 2000, correlationId } = options || {};
    const corrId = correlationId || crypto.randomUUID().substring(0, 8);
    
    console.log(`[YodeckPublish][${corrId}] Starting media status poll for ${mediaId} (max ${maxAttempts} attempts)`);
    
    let lastStatus = 'unknown';
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      const result = await this.getMediaDetails(mediaId, corrId);
      
      if (!result.ok) {
        console.log(`[YodeckPublish][${corrId}] Poll attempt ${attempts}: API error - ${result.error}`);
        await new Promise(r => setTimeout(r, intervalMs));
        continue;
      }
      
      const media = result.media!;
      lastStatus = media.status;
      
      console.log(`[YodeckPublish][${corrId}] Poll attempt ${attempts}: status="${lastStatus}" duration=${media.duration || 0}s`);
      
      // Check for terminal success states
      if (lastStatus === 'ready' || media.is_ready) {
        return {
          ok: true,
          finalStatus: lastStatus,
          isUsable: true,
          isAborted: false,
          pollAttempts: attempts,
          mediaDetails: media,
        };
      }
      
      // Check for terminal failure states
      if (['failed', 'aborted', 'error', 'deleted'].includes(lastStatus.toLowerCase())) {
        return {
          ok: false,
          finalStatus: lastStatus,
          isUsable: false,
          isAborted: lastStatus.toLowerCase() === 'aborted',
          pollAttempts: attempts,
          error: `Media reached terminal state: ${lastStatus}`,
          mediaDetails: media,
        };
      }
      
      // Still processing (uploading, encoding, etc.)
      await new Promise(r => setTimeout(r, intervalMs));
    }
    
    // Timeout - check if media is usable anyway (has duration > 0)
    const finalCheck = await this.getMediaDetails(mediaId, corrId);
    const finalMedia = finalCheck.media;
    const isUsable = finalMedia?.duration && finalMedia.duration > 0;
    
    return {
      ok: isUsable || false,
      finalStatus: lastStatus,
      isUsable: isUsable || false,
      isAborted: false,
      pollAttempts: attempts,
      error: isUsable ? undefined : `Poll timeout after ${attempts} attempts, last status: ${lastStatus}`,
      mediaDetails: finalMedia,
    };
  }

  /**
   * Delete a media item from Yodeck (for cleanup after failed uploads)
   */
  async deleteMedia(mediaId: number, correlationId?: string): Promise<{ ok: boolean; error?: string }> {
    const corrId = correlationId || crypto.randomUUID().substring(0, 8);
    const apiKey = await this.getApiKey();
    
    try {
      console.log(`[YodeckPublish][${corrId}] Deleting media ${mediaId}...`);
      
      const response = await axios.delete(`${YODECK_BASE_URL}/media/${mediaId}/`, {
        headers: {
          "Authorization": `Token ${apiKey}`,
        },
        timeout: 30000,
        validateStatus: () => true,
      });
      
      if ([200, 204].includes(response.status)) {
        console.log(`[YodeckPublish][${corrId}] Media ${mediaId} deleted successfully`);
        return { ok: true };
      }
      
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (err: any) {
      console.error(`[YodeckPublish][${corrId}] deleteMedia error:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Inspect a media item - returns validation details for debugging
   */
  async inspectMedia(mediaId: number): Promise<MediaInspectResult> {
    const corrId = crypto.randomUUID().substring(0, 8);
    
    const result = await this.getMediaDetails(mediaId, corrId);
    
    if (!result.ok || !result.media) {
      return {
        ok: false,
        mediaId,
        status: 'unknown',
        isValid: false,
        validationDetails: {
          hasFile: false,
          hasDuration: false,
          durationSeconds: 0,
          encodingState: 'unknown',
          isAborted: false,
          isUploading: false,
          isReady: false,
        },
        error: result.error,
      };
    }
    
    const media = result.media;
    const status = media.status.toLowerCase();
    
    return {
      ok: true,
      mediaId,
      status: media.status,
      isValid: (media.duration || 0) > 0 && !['failed', 'aborted', 'error'].includes(status),
      validationDetails: {
        hasFile: (media.file_size || 0) > 0,
        hasDuration: (media.duration || 0) > 0,
        durationSeconds: media.duration || 0,
        encodingState: status,
        isAborted: status === 'aborted',
        isUploading: ['uploading', 'encoding', 'processing'].includes(status),
        isReady: status === 'ready' || media.is_ready === true,
      },
      rawResponse: media,
    };
  }

  /**
   * Get cached capabilities or probe Yodeck API
   */
  async getCapabilities(forceRefresh = false): Promise<YodeckCapabilities> {
    if (this.capabilities && !forceRefresh) {
      return this.capabilities;
    }
    return this.probeCapabilities();
  }

  /**
   * Probe Yodeck API to detect available endpoints and capabilities
   */
  async probeCapabilities(): Promise<YodeckCapabilities> {
    const logs: string[] = [];
    const log = (msg: string) => {
      console.log(`[YodeckProbe] ${msg}`);
      logs.push(`${new Date().toISOString()} ${msg}`);
    };

    const capabilities: YodeckCapabilities = {
      canListPlaylists: false,
      canGetPlaylist: false,
      canCreatePlaylist: false,
      canUpdateMediaTags: false,
      canAssignPlaylistToScreen: false,
      tagUpdateMethod: null,
      tagFieldName: null,
      playlistCreateSchemaHint: null,
      lastProbeAt: new Date().toISOString(),
      probeLogs: logs,
    };

    try {
      log("Starting capability probe...");

      // 1. Test GET /playlists (list)
      const listResult = await this.makeRequest<any[]>("GET", "/playlists");
      capabilities.canListPlaylists = listResult.ok;
      log(`GET /playlists: ${listResult.ok ? 'OK' : 'FAIL'} status=${listResult.status}`);

      // 2. If list works, get first playlist to check structure
      if (listResult.ok && listResult.data && listResult.data.length > 0) {
        const firstPlaylist = listResult.data[0];
        const playlistId = firstPlaylist.id;
        
        const getResult = await this.makeRequest<any>("GET", `/playlists/${playlistId}`);
        capabilities.canGetPlaylist = getResult.ok;
        log(`GET /playlists/${playlistId}: ${getResult.ok ? 'OK' : 'FAIL'} status=${getResult.status}`);
        
        if (getResult.ok && getResult.data) {
          capabilities.playlistCreateSchemaHint = {
            sampleKeys: Object.keys(getResult.data),
            hasRules: 'rules' in getResult.data,
            hasFilters: 'filters' in getResult.data,
            hasTags: 'tags' in getResult.data,
            type: getResult.data.type,
          };
          log(`Playlist schema hint: ${JSON.stringify(capabilities.playlistCreateSchemaHint)}`);
        }
      }

      // 3. Check if POST /playlists is allowed (dry run - we don't actually create)
      // We'll infer from list capability + schema hint
      capabilities.canCreatePlaylist = capabilities.canListPlaylists;
      log(`canCreatePlaylist (inferred): ${capabilities.canCreatePlaylist}`);

      // 4. Test media tag update capability
      // Find any media item to test with
      const mediaListResult = await this.makeRequest<any[]>("GET", "/media?limit=1");
      if (mediaListResult.ok && mediaListResult.data && mediaListResult.data.length > 0) {
        const testMedia = mediaListResult.data[0];
        const mediaId = testMedia.id;
        
        // Check what tag field exists
        if ('tags' in testMedia) {
          capabilities.tagFieldName = 'tags';
        } else if ('tag_names' in testMedia) {
          capabilities.tagFieldName = 'tag_names';
        }
        log(`Media tag field detected: ${capabilities.tagFieldName || 'unknown'}`);

        // Test PATCH (read-only check via GET response structure)
        capabilities.canUpdateMediaTags = true; // Assume yes if media API works
        capabilities.tagUpdateMethod = "PATCH";
        log(`Tag update method: ${capabilities.tagUpdateMethod}`);
      }

      // 5. Check screen assignment capability
      const screenListResult = await this.makeRequest<any[]>("GET", "/screens");
      capabilities.canAssignPlaylistToScreen = screenListResult.ok;
      log(`GET /screens: ${screenListResult.ok ? 'OK' : 'FAIL'} status=${screenListResult.status}`);

      // NOTE: Tag CRUD API (/api/v2/tags) is NOT available in Yodeck (returns 404)
      // Tags must be pre-created manually in Yodeck UI
      log(`Tag CRUD API not used; using predefined tags only: ${PREDEFINED_TAGS.join(', ')}`);

      log("Capability probe complete");
    } catch (err: any) {
      log(`Probe error: ${err.message}`);
    }

    this.capabilities = capabilities;
    return capabilities;
  }

  /**
   * Ensure a location has a valid tag-based playlist configured
   */
  async ensureTagBasedPlaylist(locationId: string): Promise<{
    ok: boolean;
    playlistId?: number;
    verifyStatus: PlaylistVerifyStatus;
    action?: string;
    error?: string;
  }> {
    console.log(`[YodeckPublish] ENSURE_PLAYLIST locationId=${locationId}`);

    // Load location from DB
    const location = await db.query.locations.findFirst({
      where: eq(locations.id, locationId),
    });

    if (!location) {
      return { ok: false, verifyStatus: "UNKNOWN", error: "Location not found" };
    }

    // CRITICAL FIX: Always use "elevizion:ad" for tagbased playlist filter
    // Location-specific targeting is done via PLAYLIST ASSIGNMENT to screens, not via uuid-tags
    // This ensures all media with "elevizion:ad" tag shows on all Elevizion playlists
    const playlistFilterTag = "elevizion:ad"; // Must match PREDEFINED_TAGS[0]
    
    // Update location record if needed
    if (location.playlistTag !== playlistFilterTag) {
      await db.update(locations)
        .set({ playlistTag: playlistFilterTag, playlistMode: "TAG_BASED" })
        .where(eq(locations.id, locationId));
    }

    // NOTE: Tag CRUD API not available - tags must be pre-created in Yodeck UI
    console.log(`[YodeckPublish] ENSURE_PLAYLIST: Using predefined filter tag "${playlistFilterTag}" (not uuid-based)`);

    // Check capabilities
    const caps = await this.getCapabilities();
    if (!caps.canCreatePlaylist) {
      console.error(`[YodeckPublish] ENSURE_PLAYLIST HARD FAIL: canCreatePlaylist=false`);
      return {
        ok: false,
        verifyStatus: "UNKNOWN",
        error: "YODECK_PLAYLIST_CREATE_NOT_SUPPORTED: API does not support playlist creation"
      };
    }

    // If location already has a playlist, verify it
    if (location.yodeckPlaylistId) {
      const verifyResult = await this.verifyTagBasedPlaylist(
        parseInt(location.yodeckPlaylistId),
        playlistFilterTag
      );

      if (verifyResult.status === "OK") {
        console.log(`[YodeckPublish] ENSURE_PLAYLIST locationId=${locationId} playlistId=${location.yodeckPlaylistId} verify=OK`);
        
        // Update verification timestamp
        await db.update(locations)
          .set({
            yodeckPlaylistVerifiedAt: new Date(),
            yodeckPlaylistVerifyStatus: "OK",
            lastYodeckVerifyError: null,
          })
          .where(eq(locations.id, locationId));
        
        // Ensure playlist is assigned to screen
        const assignResult = await this.ensurePlaylistAssignedToScreen(location);
        if (!assignResult.ok) {
          await db.update(locations)
            .set({ lastYodeckVerifyError: assignResult.error })
            .where(eq(locations.id, locationId));
          return { ok: false, verifyStatus: verifyResult.status, error: assignResult.error };
        }
        
        return { ok: true, playlistId: parseInt(location.yodeckPlaylistId), verifyStatus: "OK" };
      }

      if (verifyResult.status === "MISCONFIGURED") {
        // Try to fix the playlist configuration
        const fixResult = await this.fixPlaylistTagFilter(
          parseInt(location.yodeckPlaylistId),
          playlistFilterTag
        );
        if (fixResult.ok) {
          console.log(`[YodeckPublish] ENSURE_PLAYLIST locationId=${locationId} playlistId=${location.yodeckPlaylistId} verify=FIXED`);
          
          // Update verification status
          await db.update(locations)
            .set({
              yodeckPlaylistVerifiedAt: new Date(),
              yodeckPlaylistVerifyStatus: "OK",
              lastYodeckVerifyError: null,
            })
            .where(eq(locations.id, locationId));
          
          return { ok: true, playlistId: parseInt(location.yodeckPlaylistId), verifyStatus: "OK", action: "FIXED" };
        }
        
        // Update error status
        await db.update(locations)
          .set({
            yodeckPlaylistVerifyStatus: "MISCONFIGURED",
            lastYodeckVerifyError: fixResult.error,
          })
          .where(eq(locations.id, locationId));
        
        return { ok: false, verifyStatus: "MISCONFIGURED", error: fixResult.error };
      }

      // Playlist is MISSING, need to create new one
    }

    // Create new tag-based playlist with predefined filter tag
    const createResult = await this.createTagBasedPlaylist(location, playlistFilterTag);
    if (!createResult.ok || !createResult.playlistId) {
      await db.update(locations)
        .set({
          yodeckPlaylistVerifyStatus: "MISSING",
          lastYodeckVerifyError: createResult.error,
        })
        .where(eq(locations.id, locationId));
      return { ok: false, verifyStatus: "MISSING", error: createResult.error };
    }

    // Save playlist ID to location
    await db.update(locations)
      .set({
        yodeckPlaylistId: String(createResult.playlistId),
        yodeckPlaylistVerifiedAt: new Date(),
        yodeckPlaylistVerifyStatus: "OK",
        lastYodeckVerifyError: null,
      })
      .where(eq(locations.id, locationId));

    console.log(`[YodeckPublish] ENSURE_PLAYLIST locationId=${locationId} playlistId=${createResult.playlistId} verify=CREATED`);

    // Assign to screen - use updated location with new playlistId
    const updatedLocation = { ...location, yodeckPlaylistId: String(createResult.playlistId) };
    const assignResult = await this.ensurePlaylistAssignedToScreen(updatedLocation);
    if (!assignResult.ok) {
      await db.update(locations)
        .set({ lastYodeckVerifyError: `Assignment failed: ${assignResult.error}` })
        .where(eq(locations.id, locationId));
      // Return ok: false when assignment fails - this ensures per-location failures are tracked
      return { ok: false, playlistId: createResult.playlistId, verifyStatus: "OK", action: "CREATED", error: assignResult.error };
    }

    return { ok: true, playlistId: createResult.playlistId, verifyStatus: "OK", action: "CREATED" };
  }

  /**
   * Verify a playlist is configured for tag-based filtering
   */
  private async verifyTagBasedPlaylist(
    playlistId: number,
    expectedTag: string
  ): Promise<{ status: PlaylistVerifyStatus; error?: string }> {
    const result = await this.makeRequest<any>("GET", `/playlists/${playlistId}`);
    
    if (!result.ok) {
      if (result.status === 404) {
        return { status: "MISSING" };
      }
      return { status: "UNKNOWN", error: result.error };
    }

    const playlist = result.data;
    
    // Check if playlist has tag-based filtering configured
    // Yodeck playlists may have different structures - check common patterns
    const hasTags = playlist.tags && Array.isArray(playlist.tags) && 
                   playlist.tags.includes(expectedTag);
    const hasTagFilter = playlist.tag_filter === expectedTag || 
                        playlist.filter_tag === expectedTag;
    const hasRulesWithTag = playlist.rules && JSON.stringify(playlist.rules).includes(expectedTag);

    if (hasTags || hasTagFilter || hasRulesWithTag) {
      return { status: "OK" };
    }

    // Check if name contains our prefix (auto-managed playlist)
    if (playlist.name && playlist.name.includes("EVZ ")) {
      return { status: "MISCONFIGURED" };
    }

    return { status: "MISCONFIGURED" };
  }

  /**
   * Fix a misconfigured playlist to use tag-based filtering
   */
  private async fixPlaylistTagFilter(
    playlistId: number,
    tag: string
  ): Promise<{ ok: boolean; error?: string }> {
    // Try different payload structures for tag filter
    const payloads = [
      { tags: [tag], tag_filter: tag },
      { filter_tag: tag },
      { rules: [{ type: "tag", value: tag }] },
    ];

    for (const payload of payloads) {
      const result = await this.makeRequest<any>("PATCH", `/playlists/${playlistId}`, payload);
      if (result.ok) {
        return { ok: true };
      }
    }

    return { ok: false, error: "Failed to update playlist tag filter" };
  }

  /**
   * Create a new tag-based playlist for a location
   */
  private async createTagBasedPlaylist(
    location: any,
    playlistTag: string
  ): Promise<{ ok: boolean; playlistId?: number; error?: string }> {
    const playlistName = `EVZ ${location.name || location.id}`;
    const description = `Auto-managed by Elevizion. Filter tag: ${playlistTag}`;

    // Try different payload structures based on capability hints
    const caps = await this.getCapabilities();
    
    const payloads = [
      // Standard format - items: [] is REQUIRED by Yodeck API
      {
        name: playlistName,
        description,
        tags: [playlistTag],
        type: "regular",
        items: [],
        add_gaps: false,
        shuffle_content: false,
      },
      // Alternative with tag_filter
      {
        name: playlistName,
        description,
        tag_filter: playlistTag,
        items: [],
        add_gaps: false,
        shuffle_content: false,
      },
      // With rules
      {
        name: playlistName,
        description,
        rules: [{ type: "tag", value: playlistTag }],
        items: [],
        add_gaps: false,
        shuffle_content: false,
      },
    ];

    for (const payload of payloads) {
      console.log(`[YodeckPublish] Creating playlist with payload: ${JSON.stringify(payload)}`);
      const result = await this.makeRequest<any>("POST", "/playlists", payload);
      
      if (result.ok && result.data) {
        const playlistId = result.data.id;
        console.log(`[YodeckPublish] Playlist created successfully: ${playlistId}`);
        return { ok: true, playlistId };
      }
      
      console.log(`[YodeckPublish] Playlist create attempt failed: ${result.error}`);
    }

    return { ok: false, error: "YODECK_PLAYLIST_CREATE_FAILED: All payload formats rejected" };
  }

  /**
   * Ensure a playlist is assigned to the location's screen
   * NOTE: This is a legacy path - use ensureLocationCompliance instead
   */
  private async ensurePlaylistAssignedToScreen(
    location: any
  ): Promise<{ ok: boolean; screenId?: number; error?: string }> {
    // Guard against legacy writes when canonical mode is enforced
    guardCanonicalWrite(`ensurePlaylistAssignedToScreen for location ${location.id}`);
    
    if (!location.yodeckScreenId && !location.yodeckDeviceId) {
      console.log(`[YodeckPublish] ENSURE_ASSIGN: No screen ID for location ${location.id}`);
      return { ok: true }; // Not a failure, just no screen to assign
    }

    const screenId = location.yodeckScreenId || location.yodeckDeviceId;
    const playlistId = location.yodeckPlaylistId;

    if (!playlistId) {
      return { ok: false, error: "No playlist ID to assign" };
    }

    // Check if screen already has this playlist
    const screenResult = await this.makeRequest<any>("GET", `/screens/${screenId}`);
    if (!screenResult.ok) {
      return { ok: false, error: `Failed to get screen: ${screenResult.error}` };
    }

    const screen = screenResult.data;
    const currentPlaylistId = screen?.playlist || screen?.playlist_id || screen?.default_playlist;
    
    if (String(currentPlaylistId) === String(playlistId)) {
      console.log(`[YodeckPublish] ENSURE_ASSIGN screenId=${screenId} playlistId=${playlistId} already assigned`);
      return { ok: true, screenId: parseInt(screenId) };
    }

    // Assign playlist to screen
    const assignResult = await this.makeRequest<any>("PATCH", `/screens/${screenId}`, {
      playlist: parseInt(playlistId),
    });

    if (!assignResult.ok) {
      // Try alternative field names
      const altResult = await this.makeRequest<any>("PATCH", `/screens/${screenId}`, {
        playlist_id: parseInt(playlistId),
      });
      
      if (!altResult.ok) {
        console.error(`[YodeckPublish] ENSURE_ASSIGN screenId=${screenId} playlistId=${playlistId} FAILED`);
        return { ok: false, error: "YODECK_PLAYLIST_ASSIGN_NOT_SUPPORTED" };
      }
    }

    console.log(`[YodeckPublish] ENSURE_ASSIGN screenId=${screenId} playlistId=${playlistId} ok=true`);
    return { ok: true, screenId: parseInt(screenId) };
  }

  /**
   * Verify media tags were applied correctly
   */
  async verifyMediaTags(
    mediaId: number,
    expectedTags: string[]
  ): Promise<{ ok: boolean; missing: string[]; found: string[]; error?: string }> {
    const result = await this.makeRequest<any>("GET", `/media/${mediaId}`);
    
    if (!result.ok) {
      return { ok: false, missing: expectedTags, found: [], error: result.error };
    }

    const media = result.data;
    const actualTags: string[] = media.tags || media.tag_names || [];
    
    const missing = expectedTags.filter(t => !actualTags.includes(t));
    const found = expectedTags.filter(t => actualTags.includes(t));

    console.log(`[YodeckPublish] MEDIA_TAG_VERIFY mediaId=${mediaId} found=${found.length} missing=${missing.length}`);

    if (missing.length > 0) {
      return {
        ok: false,
        missing,
        found,
        error: `YODECK_MEDIA_TAG_VERIFY_FAILED: Missing tags: ${missing.join(', ')}`
      };
    }

    return { ok: true, missing: [], found };
  }

  /**
   * Batch ensure tag-based playlists for all locations
   */
  async ensureAllTagBasedPlaylists(): Promise<{
    total: number;
    success: number;
    failed: number;
    results: Array<{ locationId: string; ok: boolean; action?: string; error?: string }>;
  }> {
    const allLocations = await db.query.locations.findMany({
      where: eq(locations.status, "active"),
    });

    const results: Array<{ locationId: string; ok: boolean; action?: string; error?: string }> = [];

    for (const location of allLocations) {
      const result = await this.ensureTagBasedPlaylist(location.id);
      results.push({
        locationId: location.id,
        ok: result.ok,
        action: result.action,
        error: result.error,
      });
    }

    return {
      total: allLocations.length,
      success: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    };
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    
    // Use centralized token parsing from yodeckClient
    const { getYodeckToken } = await import("./yodeckClient");
    const token = await getYodeckToken();
    
    if (!token.isValid) {
      throw new Error(token.error || "YODECK_AUTH_TOKEN not configured or invalid format");
    }
    
    // Construct label:value token
    this.apiKey = `${token.label}:${token.value}`;
    return this.apiKey;
  }

  private async makeRequest<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
    endpoint: string,
    body?: any,
    isFormData = false,
    retries = MAX_RETRIES
  ): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    try {
      const apiKey = await this.getApiKey();
      const url = `${YODECK_BASE_URL}${endpoint}`;

      const headers: Record<string, string> = {
        "Authorization": `Token ${apiKey}`,
      };

      if (!isFormData) {
        headers["Content-Type"] = "application/json";
        headers["Accept"] = "application/json";
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 429 && retries > 0) {
          const delay = 2000 * Math.pow(2, MAX_RETRIES - retries);
          console.log(`[YodeckPublish] Rate limited, waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          return this.makeRequest<T>(method, endpoint, body, isFormData, retries - 1);
        }

        if (!response.ok) {
          const errorText = await response.text();
          const contentType = response.headers.get('content-type') || 'unknown';
          return { ok: false, status: response.status, error: `HTTP ${response.status} [${contentType}]: ${errorText}` };
        }

        if (response.status === 204) {
          return { ok: true };
        }

        const data = await response.json() as T;
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError" && retries > 0) {
          return this.makeRequest<T>(method, endpoint, body, isFormData, retries - 1);
        }
        return { ok: false, error: err.message };
      }
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Helper to normalize MP4 filename - ensures exactly one .mp4 extension
   */
  private normalizeMp4Name(name: string): string {
    // Remove any existing .mp4 extension(s) and add exactly one
    const baseName = name.replace(/\.mp4$/gi, '');
    return `${baseName}.mp4`;
  }

  /**
   * Unified two-step upload function used by both testUpload() and production publish
   * Returns comprehensive diagnostics for debugging
   */
  async twoStepUploadMedia(params: {
    bytes: Buffer;
    name: string;
    contentType?: string;
  }): Promise<{
    ok: boolean;
    mediaId?: number;
    uploadMethodUsed: 'two-step' | 'unknown';
    diagnostics: TwoStepUploadDiagnostics;
  }> {
    const { bytes, name, contentType = 'video/mp4' } = params;
    const fileSize = bytes.length;
    
    // Generate correlation ID for this upload attempt
    const corrId = crypto.randomUUID().substring(0, 8);
    
    // Helper to log Yodeck API calls with masked sensitive data
    const logYodeckCall = (step: string, method: string, url: string, status: number, contentType: string | undefined, body: any) => {
      const safeBody = typeof body === 'string' 
        ? body.substring(0, 2000)
        : JSON.stringify(body || {}).substring(0, 2000);
      // Mask sensitive data
      const maskedBody = safeBody.replace(/[A-Za-z0-9]{20,}/g, '[MASKED]');
      console.log(`[YodeckPublish][${corrId}] ${step} ${method} ${url} status=${status} content-type=${contentType || 'unknown'} body=${maskedBody}`);
    };
    
    const diagnostics: TwoStepUploadDiagnostics = {
      metadata: { ok: false, rawKeysFound: [], uploadUrlFoundAt: 'none' },
      binaryUpload: { ok: false, method: 'none' },
      confirm: { attempted: false, ok: false },
    };
    
    // === STEP 1: Create media metadata ===
    const apiKey = await this.getApiKey();
    const metadataUrl = `${YODECK_BASE_URL}/media`;
    
    const payload = {
      name: name,
      media_origin: {
        type: "video",
        source: "local"
      }
    };
    
    console.log(`[YodeckPublish][${corrId}] Two-step upload: Creating metadata for "${name}" (${fileSize} bytes)`);
    
    let mediaId: number | undefined;
    let uploadUrl: string | undefined;
    
    try {
      const response = await axios.post(metadataUrl, payload, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 30000,
        validateStatus: () => true, // Don't throw on any status
      });
      
      const data = response.data;
      diagnostics.metadata.status = response.status;
      diagnostics.metadata.rawKeysFound = data ? Object.keys(data) : [];
      
      // Log with observability
      logYodeckCall('METADATA_CREATE', 'POST', metadataUrl, response.status, response.headers['content-type'], data);
      
      if (response.status >= 200 && response.status < 300 && data?.id) {
        mediaId = data.id;
        diagnostics.metadata.ok = true;
        diagnostics.metadata.mediaId = mediaId;
        
        // Search for upload URL in all plausible locations (case-insensitive)
        // IMPORTANT: Yodeck v2 API returns "get_upload_url" as the presigned URL field
        const urlSearchPaths = [
          { path: 'get_upload_url', value: data.get_upload_url },  // Yodeck v2 API standard field
          { path: 'upload_url', value: data.upload_url },
          { path: 'uploadUrl', value: data.uploadUrl },
          { path: 'presigned_url', value: data.presigned_url },
          { path: 'presignedUrl', value: data.presignedUrl },
          { path: 'file_upload_url', value: data.file_upload_url },
          { path: 'file.upload_url', value: data.file?.upload_url },
          { path: 'file.uploadUrl', value: data.file?.uploadUrl },
          { path: 'data.upload_url', value: data.data?.upload_url },
          { path: 'data.file.upload_url', value: data.data?.file?.upload_url },
          { path: 'upload.url', value: data.upload?.url },
          { path: 'upload.upload_url', value: data.upload?.upload_url },
          { path: 'getUploadUrl', value: data.getUploadUrl },  // camelCase variant
        ];
        
        for (const { path, value } of urlSearchPaths) {
          if (value && typeof value === 'string' && value.startsWith('http')) {
            uploadUrl = value;
            diagnostics.metadata.uploadUrlFoundAt = path;
            console.log(`[YodeckPublish] Found upload URL at "${path}"`);
            break;
          }
        }
        
        if (!uploadUrl) {
          console.log(`[YodeckPublish] No upload URL found in response. Available keys: ${diagnostics.metadata.rawKeysFound.join(', ')}`);
        }
      } else {
        diagnostics.metadata.ok = false;
        const errorMessage = data?.error?.message || data?.message || `HTTP ${response.status}`;
        diagnostics.metadata.error = errorMessage;
        diagnostics.lastError = {
          message: errorMessage,
          status: response.status,
          bodySnippet: JSON.stringify(data).substring(0, 500),
        };
        
        return { ok: false, uploadMethodUsed: 'unknown', diagnostics };
      }
    } catch (err: any) {
      diagnostics.metadata.ok = false;
      diagnostics.metadata.error = err.message;
      diagnostics.metadata.status = err.response?.status;
      diagnostics.lastError = {
        message: err.message,
        status: err.response?.status,
        bodySnippet: JSON.stringify(err.response?.data || {}).substring(0, 500),
      };
      
      return { ok: false, uploadMethodUsed: 'unknown', diagnostics };
    }
    
    // === STEP 2: Binary upload ===
    if (uploadUrl) {
      console.log(`[YodeckPublish] Two-step upload: Fetching presigned URL from ${uploadUrl}`);
      diagnostics.binaryUpload.contentTypeSent = contentType;
      diagnostics.binaryUpload.bytesSent = fileSize;
      
      try {
        // Step 2a: Get the actual presigned URL by calling the get_upload_url endpoint
        const getUrlResponse = await axios.get(uploadUrl, {
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Accept": "application/json",
          },
          timeout: 30000,
          validateStatus: () => true,
        });
        
        console.log(`[YodeckPublish] get_upload_url response (${getUrlResponse.status}):`, JSON.stringify(getUrlResponse.data, null, 2));
        
        const urlData = getUrlResponse.data;
        let presignedUrl: string | undefined;
        
        // Search for the actual presigned URL in the response
        const presignedSearchPaths = [
          { path: 'url', value: urlData?.url },
          { path: 'upload_url', value: urlData?.upload_url },
          { path: 'presigned_url', value: urlData?.presigned_url },
          { path: 'data.url', value: urlData?.data?.url },
        ];
        
        for (const { path, value } of presignedSearchPaths) {
          if (value && typeof value === 'string' && value.startsWith('http')) {
            presignedUrl = value;
            console.log(`[YodeckPublish] Found presigned URL at "${path}"`);
            break;
          }
        }
        
        if (!presignedUrl) {
          // No presigned URL found - try raw binary PUT to the upload URL
          console.log(`[YodeckPublish] No presigned URL in response, trying direct PUT with auth`);
          diagnostics.binaryUpload.method = 'presigned_put';
          
          const response = await axios.put(uploadUrl, bytes, {
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": contentType,
              "Content-Length": String(fileSize),
            },
            timeout: REQUEST_TIMEOUT,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true,
          });
          
          diagnostics.binaryUpload.status = response.status;
          
          if ([200, 201, 204].includes(response.status)) {
            diagnostics.binaryUpload.ok = true;
            console.log(`[YodeckPublish] Direct PUT succeeded: ${response.status}`);
          } else {
            diagnostics.binaryUpload.ok = false;
            diagnostics.binaryUpload.error = `HTTP ${response.status}`;
            diagnostics.lastError = {
              message: `Direct PUT failed with status ${response.status}`,
              status: response.status,
              bodySnippet: typeof response.data === 'string' ? response.data.substring(0, 500) : JSON.stringify(response.data || {}).substring(0, 500),
            };
          }
        } else {
          // Got presigned URL - PUT binary data to it (no auth needed for presigned)
          console.log(`[YodeckPublish] Uploading ${fileSize} bytes to presigned URL`);
          diagnostics.binaryUpload.method = 'presigned_put';
          
          const response = await axios.put(presignedUrl, bytes, {
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(fileSize),
              // NO Authorization header for presigned URLs (they have signature in URL)
            },
            timeout: REQUEST_TIMEOUT,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true,
          });
          
          diagnostics.binaryUpload.status = response.status;
          
          // 200, 201, 204 are all success for presigned uploads
          if ([200, 201, 204].includes(response.status)) {
            diagnostics.binaryUpload.ok = true;
            console.log(`[YodeckPublish] Presigned PUT succeeded: ${response.status}`);
          } else {
            diagnostics.binaryUpload.ok = false;
            diagnostics.binaryUpload.error = `HTTP ${response.status}`;
            diagnostics.lastError = {
              message: `Presigned PUT failed with status ${response.status}`,
              status: response.status,
              bodySnippet: typeof response.data === 'string' ? response.data.substring(0, 500) : JSON.stringify(response.data || {}).substring(0, 500),
            };
          }
        }
      } catch (err: any) {
        diagnostics.binaryUpload.ok = false;
        diagnostics.binaryUpload.error = err.message;
        diagnostics.binaryUpload.status = err.response?.status;
        diagnostics.lastError = {
          message: err.message,
          status: err.response?.status,
          bodySnippet: JSON.stringify(err.response?.data || {}).substring(0, 500),
        };
      }
    } else {
      // No upload URL - fail with clear error (don't silently try PATCH)
      // Per requirements: if no uploadUrl -> fail with clear error
      diagnostics.binaryUpload.ok = false;
      diagnostics.binaryUpload.method = 'none';
      diagnostics.binaryUpload.error = 'No upload URL provided in metadata response';
      diagnostics.lastError = {
        message: 'Yodeck did not return an upload URL in the metadata response. Binary upload cannot proceed.',
        status: undefined,
      };
      
      console.log(`[YodeckPublish] FAIL: No upload URL in metadata response. Cannot upload binary.`);
    }
    
    // === STEP 3: Optional confirm (non-blocking) ===
    // Only attempt if binary upload succeeded
    if (diagnostics.binaryUpload.ok && mediaId) {
      console.log(`[YodeckPublish] Two-step upload: Attempting optional confirm`);
      diagnostics.confirm.attempted = true;
      
      const confirmEndpoints = [
        `${YODECK_BASE_URL}/media/${mediaId}/confirm`,
        `${YODECK_BASE_URL}/media/${mediaId}/upload/complete`,
      ];
      
      for (const endpoint of confirmEndpoints) {
        try {
          const response = await axios.post(endpoint, {}, {
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": "application/json"
            },
            timeout: 10000,
            validateStatus: () => true,
          });
          
          diagnostics.confirm.status = response.status;
          
          if ([200, 201, 204].includes(response.status)) {
            diagnostics.confirm.ok = true;
            console.log(`[YodeckPublish] Confirm succeeded at ${endpoint}`);
            break;
          } else if ([404, 405].includes(response.status)) {
            // Endpoint doesn't exist, try next
            continue;
          }
        } catch (err: any) {
          diagnostics.confirm.error = err.message;
          continue;
        }
      }
      
      // If no confirm endpoint worked, that's OK - it's optional
      if (!diagnostics.confirm.ok) {
        console.log(`[YodeckPublish] No confirm endpoint available (this is OK)`);
        diagnostics.confirm.ok = true; // Mark as OK since it's optional
      }
    }
    
    // === STEP 4: Poll media status to verify upload succeeded ===
    // Only if binary upload returned success, verify media is actually usable
    if (diagnostics.metadata.ok && diagnostics.binaryUpload.ok && mediaId) {
      console.log(`[YodeckPublish][${corrId}] Polling media status to verify upload...`);
      
      const pollResult = await this.pollMediaStatus(mediaId, {
        maxAttempts: 15,  // 15 attempts * 2s = 30s max wait
        intervalMs: 2000,
        correlationId: corrId,
      });
      
      // Set structured poll status for retry logic
      diagnostics.mediaStatusPoll = {
        attempted: true,
        finalStatus: pollResult.finalStatus,
        isAborted: pollResult.isAborted || false,
        shouldRetry: (!pollResult.ok || pollResult.isAborted) && diagnostics.binaryUpload.ok,
      };
      
      if (!pollResult.ok || pollResult.isAborted) {
        console.log(`[YodeckPublish][${corrId}] Media status indicates failure: ${pollResult.finalStatus}`);
        
        // Media upload was aborted or failed - cleanup and report failure
        diagnostics.binaryUpload.ok = false;
        diagnostics.binaryUpload.error = `Media status: ${pollResult.finalStatus}`;
        diagnostics.lastError = {
          message: `Upload appeared to succeed but media status is ${pollResult.finalStatus}. This indicates the upload was interrupted or corrupted.`,
          status: undefined,
        };
        
        // Delete the failed media to clean up
        console.log(`[YodeckPublish][${corrId}] Cleaning up failed media ${mediaId}...`);
        await this.deleteMedia(mediaId, corrId);
        
        return {
          ok: false,
          mediaId: undefined,
          uploadMethodUsed: 'two-step',
          diagnostics,
        };
      }
      
      console.log(`[YodeckPublish][${corrId}] Media status verified OK: ${pollResult.finalStatus}`);
    }
    
    // === Final result ===
    // uploadOk = metadata.ok AND binaryUpload.ok (confirm is optional)
    const uploadOk = diagnostics.metadata.ok && diagnostics.binaryUpload.ok;
    
    console.log(`[YodeckPublish][${corrId}] Two-step upload complete: uploadOk=${uploadOk}, mediaId=${mediaId}`);
    
    return {
      ok: uploadOk,
      mediaId: uploadOk ? mediaId : undefined,
      uploadMethodUsed: uploadOk ? 'two-step' : 'unknown',
      diagnostics,
    };
  }

  /**
   * Upload media with single retry on failure/abort
   * Wraps twoStepUploadMedia with retry-once logic for resilience
   */
  async uploadMediaWithRetry(params: {
    bytes: Buffer;
    name: string;
    contentType?: string;
  }): Promise<{
    ok: boolean;
    mediaId?: number;
    uploadMethodUsed: 'two-step' | 'unknown';
    attempts: number;
    diagnostics: TwoStepUploadDiagnostics;
  }> {
    const { bytes, name, contentType } = params;
    const corrId = crypto.randomUUID().substring(0, 8);
    
    console.log(`[YodeckPublish][${corrId}] uploadMediaWithRetry: Starting upload for "${name}"`);
    
    // First attempt
    let result = await this.twoStepUploadMedia({ bytes, name, contentType });
    
    if (result.ok) {
      console.log(`[YodeckPublish][${corrId}] uploadMediaWithRetry: First attempt succeeded, mediaId=${result.mediaId}`);
      return {
        ...result,
        attempts: 1,
      };
    }
    
    // Check if we should retry using structured flag (media status failure, not API error)
    const shouldRetry = result.diagnostics.mediaStatusPoll?.shouldRetry === true;
    
    if (!shouldRetry) {
      const reason = result.diagnostics.mediaStatusPoll?.attempted 
        ? `media poll ok=${result.diagnostics.mediaStatusPoll.finalStatus}`
        : 'no media poll attempted (API error or early failure)';
      console.log(`[YodeckPublish][${corrId}] uploadMediaWithRetry: First attempt failed, not retryable: ${reason}`);
      return {
        ...result,
        attempts: 1,
      };
    }
    
    console.log(`[YodeckPublish][${corrId}] uploadMediaWithRetry: First attempt failed with media status ${result.diagnostics.mediaStatusPoll?.finalStatus}, retrying once...`);
    
    // Wait a moment before retry
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Retry with fresh metadata
    result = await this.twoStepUploadMedia({ bytes, name, contentType });
    
    if (result.ok) {
      console.log(`[YodeckPublish][${corrId}] uploadMediaWithRetry: Retry succeeded, mediaId=${result.mediaId}`);
    } else {
      console.log(`[YodeckPublish][${corrId}] uploadMediaWithRetry: Retry also failed`);
    }
    
    return {
      ...result,
      attempts: 2,
    };
  }

  /**
   * Perform single upload attempt to Yodeck
   * Supports different media_origin formats for API compatibility
   */
  private async attemptYodeckUpload(
    fileBuffer: Buffer,
    normalizedName: string,
    filename: string,
    fileSize: number,
    mediaOriginFormat: 'none' | 'json' | 'nested' = 'none'
  ): Promise<{ 
    ok: boolean; 
    mediaId?: number; 
    error?: string; 
    errorCode?: string; 
    errorDetails?: any;
    yodeckErrorCode?: string;
    yodeckMissingField?: string;
    yodeckInvalidField?: string;
  }> {
    const formData = new FormData();
    const uploadFields: string[] = ['name'];
    
    formData.append("name", normalizedName);
    
    // Add media_origin in the specified format
    if (mediaOriginFormat === 'json') {
      // JSON-stringified object format
      const mediaOriginObj = { source: "local", type: "video" };
      formData.append("media_origin", JSON.stringify(mediaOriginObj));
      uploadFields.push('media_origin (JSON object)');
    } else if (mediaOriginFormat === 'nested') {
      // Nested multipart fields format
      formData.append("media_origin[source]", "local");
      formData.append("media_origin[type]", "video");
      uploadFields.push('media_origin[source]', 'media_origin[type]');
    }
    // 'none' = no media_origin field
    
    formData.append("file", fileBuffer, { 
      filename,
      contentType: "video/mp4",
      knownLength: fileSize
    });
    uploadFields.push('file');
    
    console.log(`[YodeckPublish] Upload attempt (format=${mediaOriginFormat}): fields=[${uploadFields.join(', ')}] name="${normalizedName}" file="${filename}" size=${fileSize}`);
    
    const apiKey = await this.getApiKey();
    const url = `${YODECK_BASE_URL}/media`;
    
    let contentLength: number;
    try {
      contentLength = await new Promise<number>((resolve, reject) => {
        formData.getLength((err: Error | null, length: number) => {
          if (err) reject(err);
          else resolve(length);
        });
      });
    } catch (lengthErr) {
      return { ok: false, error: "Could not calculate Content-Length", errorCode: "CONTENT_LENGTH_FAILED" };
    }
    
    const headers: Record<string, string> = {
      "Authorization": `Token ${apiKey}`,
      "Content-Length": String(contentLength),
      ...formData.getHeaders()
    };
    
    try {
      const response = await axios.post<YodeckMediaUploadResponse>(url, formData, {
        headers,
        timeout: REQUEST_TIMEOUT,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      
      const data = response.data;
      if (!data?.id) {
        return { ok: false, error: "Upload response missing media ID", errorCode: "NO_MEDIA_ID" };
      }
      
      console.log(`[YodeckPublish] Upload successful, mediaId=${data.id}`);
      return { ok: true, mediaId: data.id };
    } catch (axiosError: any) {
      const statusCode = axiosError.response?.status || 'N/A';
      const responseData = axiosError.response?.data;
      
      let errorCode = "YODECK_UPLOAD_FAILED";
      let errorMessage = axiosError.message;
      let errorDetails: any = { 
        sentFields: uploadFields, 
        url, 
        statusCode, 
        format: mediaOriginFormat,
        requestHeaders: Object.keys(headers).filter(k => k !== 'Authorization'), // Log header keys (no secrets)
      };
      let yodeckErrorCode: string | undefined;
      let yodeckMissingField: string | undefined;
      let yodeckInvalidField: string | undefined;
      
      if (responseData) {
        // Capture full error structure from Yodeck
        errorDetails.yodeckError = responseData.error || responseData;
        
        // Try to parse structured error
        const yodeckErr = responseData.error || responseData;
        yodeckErrorCode = yodeckErr?.code;
        
        // Log full error details for debugging
        console.error(`[YodeckPublish] HTTP ${statusCode} | Full Yodeck error:`, JSON.stringify(responseData, null, 2));
        
        // Parse missing_key (err_1002) - could be any field, not just media_origin
        if (yodeckErr?.code === "err_1002") {
          const missingKey = yodeckErr?.details?.missing_key || yodeckErr?.message?.match(/Missing field[:\s]+(\w+)/i)?.[1];
          if (missingKey) {
            yodeckMissingField = missingKey;
            errorCode = "YODECK_MISSING_FIELD";
            errorMessage = `Yodeck API requires field: ${missingKey}`;
            errorDetails.missingField = missingKey;
          }
        }
        // Parse invalid_field (err_1003) - could be any field
        else if (yodeckErr?.code === "err_1003") {
          const invalidField = yodeckErr?.details?.invalid_field || yodeckErr?.message?.match(/Invalid field[:\s]+(\w+)/i)?.[1];
          if (invalidField) {
            yodeckInvalidField = invalidField;
            errorCode = "YODECK_INVALID_FIELD";
            errorMessage = `Yodeck API rejects field: ${invalidField}`;
            errorDetails.invalidField = invalidField;
          }
        }
        // Check for generic missing fields in message
        else if (typeof yodeckErr?.message === 'string' && yodeckErr.message.toLowerCase().includes('missing field')) {
          const match = yodeckErr.message.match(/Missing field[:\s]+(\w+)/i);
          if (match) {
            yodeckMissingField = match[1];
            errorCode = "YODECK_MISSING_FIELD";
            errorMessage = `Yodeck API requires field: ${match[1]}`;
            errorDetails.missingField = match[1];
          }
        }
        // Check for other required fields (e.g., workspace, media_type)
        else if (yodeckErr?.details?.required_fields) {
          errorDetails.requiredFields = yodeckErr.details.required_fields;
          errorMessage = `Yodeck requires fields: ${yodeckErr.details.required_fields.join(', ')}`;
        }
        // Fallback: use raw message
        else {
          errorMessage = yodeckErr?.message || (typeof responseData === 'string' ? responseData : JSON.stringify(responseData));
        }
      } else {
        console.error(`[YodeckPublish] HTTP ${statusCode} | URL: ${url} | Network error: ${errorMessage}`);
      }
      
      return { ok: false, error: errorMessage, errorCode, errorDetails, yodeckErrorCode, yodeckMissingField, yodeckInvalidField };
    }
  }

  /**
   * Upload a video file from Object Storage to Yodeck
   * Uses adaptive retry strategy:
   * 1. First attempt: name + file only
   * 2. If Yodeck says media_origin is missing (err_1002): retry with media_origin
   * 3. Never include media_origin if it was previously rejected (err_1003)
   */
  async uploadMediaFromStorage(
    storagePath: string,
    mediaName: string,
    idempotencyKey: string,
    advertiserId: string
  ): Promise<{ ok: boolean; mediaId?: number; error?: string; errorCode?: string; errorDetails?: any }> {
    console.log(`[YodeckPublish] Uploading media: ${mediaName} from ${storagePath}`);

    // Check if already uploaded via outbox (succeeded = skip re-upload)
    const existing = await db.query.integrationOutbox.findFirst({
      where: and(
        eq(integrationOutbox.idempotencyKey, idempotencyKey),
        eq(integrationOutbox.status, "succeeded")
      ),
    });

    if (existing?.externalId) {
      console.log(`[YodeckPublish] Already uploaded, mediaId=${existing.externalId}`);
      return { ok: true, mediaId: parseInt(existing.externalId) };
    }

    // Upsert outbox record for tracking (handles conflicts gracefully)
    const { storage: storageService } = await import("../storage");
    const upsertResult = await storageService.upsertOutboxJob({
      provider: "yodeck",
      actionType: "upload_media",
      entityType: "ad_asset",
      entityId: advertiserId,
      payloadJson: { storagePath, mediaName },
      idempotencyKey,
      status: "processing",
    });
    
    if (upsertResult.isLocked) {
      console.log(`[YodeckPublish] Upload job is already being processed`);
      return { ok: false, error: "ALREADY_PROCESSING" };
    }
    
    await db.update(integrationOutbox)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(integrationOutbox.id, upsertResult.job.id));

    try {
      // Get file from Object Storage
      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getFileByPath(storagePath);
      
      if (!file) {
        throw new Error("Could not get file from Object Storage");
      }
      
      // Download file to buffer (required for potential retry)
      const [fileBuffer] = await file.download();
      const fileSize = fileBuffer.length;
      
      if (fileSize > BUFFER_FALLBACK_MAX_BYTES) {
        throw new Error(`File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB > ${BUFFER_FALLBACK_MAX_BYTES / 1024 / 1024}MB)`);
      }
      
      console.log(`[YodeckPublish] File loaded: ${fileSize} bytes`);
      
      // Normalize name
      const normalizedName = this.normalizeMp4Name(mediaName);
      
      // === Use shared two-step upload with retry ===
      const uploadResult = await this.uploadMediaWithRetry({
        bytes: fileBuffer,
        name: normalizedName,
        contentType: 'video/mp4',
      });
      
      if (!uploadResult.ok || !uploadResult.mediaId) {
        await db.update(integrationOutbox)
          .set({ 
            status: "failed",
            lastError: JSON.stringify({ 
              code: "TWO_STEP_UPLOAD_FAILED", 
              diagnostics: uploadResult.diagnostics
            }),
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        const lastError = uploadResult.diagnostics.lastError;
        return { 
          ok: false, 
          error: lastError?.message || "Two-step upload failed", 
          errorCode: "TWO_STEP_UPLOAD_FAILED",
          errorDetails: uploadResult.diagnostics
        };
      }
      
      // Success!
      await db.update(integrationOutbox)
        .set({
          status: "succeeded",
          externalId: String(uploadResult.mediaId),
          responseJson: { 
            mediaId: uploadResult.mediaId, 
            method: uploadResult.uploadMethodUsed,
            diagnostics: uploadResult.diagnostics
          },
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
      
      console.log(`[YodeckPublish] Two-step upload SUCCESS: mediaId=${uploadResult.mediaId}`);
      return { ok: true, mediaId: uploadResult.mediaId };
    } catch (err: any) {
      console.error(`[YodeckPublish] Upload error:`, err.message);
      await db.update(integrationOutbox)
        .set({
          status: "failed",
          lastError: err.message,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: false, error: err.message };
    }
  }

  /**
   * Update media tags in Yodeck (for tag-based playlist publishing)
   * Tags associate media with specific locations/advertisers
   */
  async updateMediaTags(
    mediaId: number,
    tags: string[],
    idempotencyKey: string,
    entityId: string
  ): Promise<{ ok: boolean; error?: string }> {
    console.log(`[YodeckPublish] MEDIA_TAG_UPDATE starting mediaId=${mediaId} tags=${tags.join(',')}`);

    // Check if already succeeded via outbox
    const existing = await db.query.integrationOutbox.findFirst({
      where: and(
        eq(integrationOutbox.idempotencyKey, idempotencyKey),
        eq(integrationOutbox.status, "succeeded")
      ),
    });

    if (existing) {
      console.log(`[YodeckPublish] Tags already updated for media ${mediaId}`);
      return { ok: true };
    }

    // Upsert outbox record
    const { storage: storageService } = await import("../storage");
    const upsertResult = await storageService.upsertOutboxJob({
      provider: "yodeck",
      actionType: "update_media_tags",
      entityType: "placement",
      entityId,
      payloadJson: { mediaId, tags },
      idempotencyKey,
      status: "processing",
    });
    
    if (upsertResult.isLocked) {
      console.log(`[YodeckPublish] Tag update job is already being processed`);
      return { ok: false, error: "ALREADY_PROCESSING" };
    }
    
    await db.update(integrationOutbox)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(integrationOutbox.id, upsertResult.job.id));

    try {
      // Try different tag update endpoints/formats
      const tagPayloads = [
        { endpoint: `/media/${mediaId}`, method: "PATCH" as const, body: { tags } },
        { endpoint: `/media/${mediaId}`, method: "PATCH" as const, body: { tag_names: tags } },
        { endpoint: `/media/${mediaId}`, method: "PUT" as const, body: { tags } },
      ];
      
      let updateResult: { ok: boolean; data?: any; error?: string; status?: number } | null = null;
      let successEndpoint: string | null = null;
      
      for (const attempt of tagPayloads) {
        const fullUrl = `${YODECK_BASE_URL}${attempt.endpoint}`;
        console.log(`[YodeckPublish] MEDIA_TAG_UPDATE attempting ${attempt.method} url=${fullUrl} body=${JSON.stringify(attempt.body)}`);
        
        const result = await this.makeRequest<any>(attempt.method, attempt.endpoint, attempt.body);
        
        if (result.ok) {
          updateResult = result;
          successEndpoint = `${attempt.method} ${fullUrl}`;
          break;
        }
        
        const bodySnippet = result.error?.substring(0, 200) || 'unknown';
        console.log(`[YodeckPublish] MEDIA_TAG_UPDATE url=${fullUrl} status=${result.status} bodySnippet=${bodySnippet}`);
        
        // If not 404/405, this endpoint exists but failed
        if (result.status !== 404 && result.status !== 405) {
          updateResult = result;
          break;
        }
      }
      
      if (!updateResult || !updateResult.ok) {
        // Check for "does not exist" error - indicates tags need to be pre-created in Yodeck UI
        const errorBody = updateResult?.error || "";
        const isTagMissingError = 
          (updateResult?.status === 400 && errorBody.includes("does not exist")) ||
          errorBody.includes("Object with name=");
        
        let errorCode: string;
        let errorMsg: string;
        
        if (isTagMissingError) {
          // PERMANENT ERROR - tags must be pre-created in Yodeck UI
          errorCode = "YODECK_TAG_MISSING_PRECREATE_REQUIRED";
          errorMsg = `Maak deze tags 1x aan in Yodeck UI: ${PREDEFINED_TAGS.join(', ')}`;
          console.error(`[YodeckPublish] ${errorCode}: ${errorMsg}`);
          console.error(`[YodeckPublish] Original error: ${errorBody}`);
          
          await db.update(integrationOutbox)
            .set({
              status: "failed",
              lastError: `${errorCode}: ${errorMsg} [PERMANENT_ERROR]`,
              processedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
          
          // Return with error containing missingTags info in the error string
          return { 
            ok: false, 
            error: `${errorCode}: ${errorMsg} | missingTags=${PREDEFINED_TAGS.join(',')}`
          };
        }
        
        errorCode = "YODECK_MEDIA_TAG_UPDATE_FAILED";
        errorMsg = updateResult?.error || "Failed to update media tags";
        console.error(`[YodeckPublish] ${errorCode}: ${errorMsg}`);
        
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: `${errorCode}: ${errorMsg}`,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: `${errorCode}: ${errorMsg}` };
      }
      
      console.log(`[YodeckPublish] MEDIA_TAG_UPDATE success endpoint=${successEndpoint} mediaId=${mediaId}`);
      
      await db.update(integrationOutbox)
        .set({
          status: "succeeded",
          responseJson: { success: true, tags },
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
      
      return { ok: true };
    } catch (err: any) {
      console.error(`[YodeckPublish] Tag update error:`, err.message);
      await db.update(integrationOutbox)
        .set({
          status: "failed",
          lastError: `YODECK_MEDIA_TAG_UPDATE_FAILED: ${err.message}`,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: false, error: err.message };
    }
  }

  /**
   * Generate placement tags for media
   * Returns only the PREDEFINED_TAGS - no dynamic UUIDs
   * NOTE: These tags MUST be pre-created manually in Yodeck UI before first publish
   */
  generatePlacementTags(): string[] {
    // Only use predefined static tags - Yodeck Tag CRUD API is NOT available
    // UUIDs/IDs are tracked in our database, not as Yodeck tags
    return [...PREDEFINED_TAGS];
  }

  /**
   * Add media to a Yodeck playlist (DEPRECATED - use tag-based publishing instead)
   * @deprecated This method should NEVER be called. Use tag-based publishing instead.
   */
  async addMediaToPlaylist(
    playlistId: number,
    mediaId: number,
    durationSeconds: number,
    idempotencyKey: string,
    locationId: string
  ): Promise<{ ok: boolean; error?: string }> {
    // HARD GUARD: This legacy flow must NEVER be used
    throw new Error("LEGACY_PLAYLIST_FLOW_USED: addMediaToPlaylist is deprecated. Use tag-based publishing (updateMediaTags) instead.");
    
    // Legacy code below - unreachable
    console.log(`[YodeckPublish] Adding media ${mediaId} to playlist ${playlistId}`);

    // Check if already added via outbox (succeeded = skip)
    const existing = await db.query.integrationOutbox.findFirst({
      where: and(
        eq(integrationOutbox.idempotencyKey, idempotencyKey),
        eq(integrationOutbox.status, "succeeded")
      ),
    });

    if (existing) {
      console.log(`[YodeckPublish] Already added to playlist`);
      return { ok: true };
    }

    // Upsert outbox record (handles conflicts gracefully)
    const { storage: storageService } = await import("../storage");
    const upsertResult = await storageService.upsertOutboxJob({
      provider: "yodeck",
      actionType: "add_to_playlist",
      entityType: "location",
      entityId: locationId,
      payloadJson: { playlistId, mediaId, durationSeconds },
      idempotencyKey,
      status: "processing",
    });
    
    if (upsertResult.isLocked) {
      console.log(`[YodeckPublish] Playlist add job is already being processed`);
      return { ok: false, error: "ALREADY_PROCESSING" };
    }
    
    // Update to processing status
    await db.update(integrationOutbox)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(integrationOutbox.id, upsertResult.job.id));

    try {
      // First get current playlist items
      const getResult = await this.makeRequest<{ items: YodeckPlaylistItem[] }>(
        "GET",
        `/playlists/${playlistId}`
      );

      if (!getResult.ok) {
        throw new Error(`Could not get playlist: ${getResult.error}`);
      }

      // Get raw items from response - preserve ALL fields exactly as Yodeck returned them
      const rawData = getResult.data as any;
      const rawItems = rawData?.items || [];
      
      // Extract items_url if available for dynamic endpoint
      const itemsUrl = rawData?.items_url || rawData?.related?.items || null;
      
      // Log first item keys for debugging
      const firstItemKeys = rawItems.length > 0 ? Object.keys(rawItems[0]).join(',') : 'none';
      console.log(`[YodeckPublish] PLAYLIST_GET itemsCount=${rawItems.length} firstItemKeys=${firstItemKeys} itemsUrl=${itemsUrl || 'none'}`);
      
      // Check if media already exists in playlist (check both id and media fields)
      const alreadyExists = rawItems.some((item: any) => 
        (item.id === mediaId || item.media === mediaId) && item.type === "media"
      );
      if (alreadyExists) {
        console.log(`[YodeckPublish] Media already in playlist`);
        await db.update(integrationOutbox)
          .set({
            status: "succeeded",
            responseJson: { alreadyExists: true },
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        return { ok: true };
      }

      // Determine next priority: max of existing priorities + 1 (or 1 if no items)
      const existingPriorities = rawItems
        .map((item: any) => item.priority)
        .filter((p: any): p is number => typeof p === 'number');
      const nextPriority = existingPriorities.length > 0 
        ? Math.max(...existingPriorities) + 1 
        : 1;

      // Build new item payload for POST create endpoint
      const newItemPayload = { 
        media: mediaId, 
        type: "media", 
        duration: durationSeconds,
        priority: nextPriority
      };
      
      // Try multiple POST endpoints in order (stop when one works)
      // Include dynamic items_url from GET response if available
      const createEndpoints: Array<{ path: string; payload: any }> = [];
      
      // If items_url from GET response, try it first (most reliable)
      if (itemsUrl) {
        try {
          // Extract relative path from full URL if needed
          const relativePath = itemsUrl.startsWith('http') 
            ? new URL(itemsUrl).pathname.replace('/api/v2', '')
            : itemsUrl;
          createEndpoints.push({ path: relativePath, payload: newItemPayload });
        } catch (e) {
          // If URL parsing fails, skip this endpoint (fallbacks will still be tried)
          console.log(`[YodeckPublish] Could not parse items_url: ${itemsUrl}`);
        }
      }
      
      // Standard endpoints as fallback
      createEndpoints.push(
        { path: `/playlists/${playlistId}/items`, payload: newItemPayload },
        { path: `/playlists/${playlistId}/items/`, payload: newItemPayload },
        { path: `/playlist_items`, payload: { ...newItemPayload, playlist: playlistId } },
      );
      
      let createResult: { ok: boolean; data?: any; error?: string; status?: number } | null = null;
      let successEndpoint: string | null = null;
      
      const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
      
      for (const endpoint of createEndpoints) {
        const fullUrl = `${YODECK_API_BASE}${endpoint.path}`;
        console.log(`[YodeckPublish] PLAYLIST_ITEM_CREATE attempting POST url=${fullUrl} payload=${JSON.stringify(endpoint.payload)}`);
        
        const result = await this.makeRequest<any>("POST", endpoint.path, endpoint.payload);
        
        if (result.ok) {
          createResult = result;
          successEndpoint = fullUrl;
          break;
        }
        
        // Log the error with full URL
        const bodySnippet = result.error?.substring(0, 200) || 'unknown';
        console.log(`[YodeckPublish] PLAYLIST_ITEM_CREATE url=${fullUrl} status=${result.status} bodySnippet=${bodySnippet}`);
        
        // If not 404, this endpoint exists but request failed - use this result
        if (result.status !== 404) {
          createResult = result;
          break;
        }
      }
      
      // If POST create failed, report the error (no placeholder fallback - use tag-based publishing instead)
      if (createResult === null || !createResult.ok) {
        const errorCode = "YODECK_PLAYLIST_ITEM_CREATE_FAILED";
        const errorMsg = createResult?.error || "Playlist item create failed. Consider using tag-based publishing.";
        console.error(`[YodeckPublish] ${errorCode}: ${errorMsg}`);
        
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: `${errorCode}: ${errorMsg}`,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: `${errorCode}: ${errorMsg}` };
      }
      
      // POST create succeeded (createResult is guaranteed non-null here after the check above)
      const successResult = createResult!;
      const createdItemId = successResult.data?.id;
      console.log(`[YodeckPublish] PLAYLIST_ITEM_CREATE success endpoint=${successEndpoint} createdItemId=${createdItemId}`);

      // VERIFICATION: Re-fetch playlist to confirm media was added (hard requirement)
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for Yodeck to process
      
      const verifyResult = await this.makeRequest<{ items: YodeckPlaylistItem[] }>(
        "GET",
        `/playlists/${playlistId}`
      );

      if (!verifyResult.ok) {
        // Verification GET failed - cannot confirm media is in playlist, so we must fail
        console.error(`[YodeckPublish] VERIFICATION FAILED: Could not re-fetch playlist ${playlistId}: ${verifyResult.error}`);
        
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST",
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST: Could not verify playlist" };
      }
      
      const verifiedItems = verifyResult.data?.items || [];
      const mediaFound = verifiedItems.some(item => 
        (item.id === mediaId || item.media === mediaId) && item.type === "media"
      );
      
      if (!mediaFound) {
        console.error(`[YodeckPublish] VERIFICATION FAILED: Media ${mediaId} not found in playlist ${playlistId}`);
        
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST",
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST" };
      }
      
      console.log(`[YodeckPublish] VERIFIED: Media ${mediaId} confirmed in playlist ${playlistId}`);

      await db.update(integrationOutbox)
        .set({
          status: "succeeded",
          responseJson: { success: true, verified: true },
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: true };
    } catch (err: any) {
      await db.update(integrationOutbox)
        .set({
          status: "failed",
          lastError: err.message,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: false, error: err.message };
    }
  }

  /**
   * Remove media from a Yodeck playlist (for rollback)
   */
  async removeMediaFromPlaylist(
    playlistId: number,
    mediaId: number
  ): Promise<{ ok: boolean; error?: string }> {
    console.log(`[YodeckPublish] Removing media ${mediaId} from playlist ${playlistId}`);

    try {
      // Get current playlist items
      const getResult = await this.makeRequest<{ items: YodeckPlaylistItem[] }>(
        "GET",
        `/playlists/${playlistId}`
      );

      if (!getResult.ok) {
        return { ok: false, error: getResult.error };
      }

      const currentItems: YodeckPlaylistItem[] = getResult.data?.items || [];
      const filteredItems = currentItems.filter(item => 
        !((item.id === mediaId || item.media === mediaId) && item.type === "media")
      );

      if (filteredItems.length === currentItems.length) {
        // Media wasn't in playlist
        return { ok: true };
      }

      // Ensure priority is preserved for remaining items
      const itemsWithPriority = filteredItems.map((item, index) => ({
        ...item,
        priority: item.priority ?? (index + 1),
      }));

      const patchResult = await this.makeRequest(
        "PATCH",
        `/playlists/${playlistId}`,
        { items: itemsWithPriority }
      );

      if (!patchResult.ok) {
        return { ok: false, error: patchResult.error };
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Publish an approved placement plan to Yodeck
   */
  async publishPlan(planId: string): Promise<PublishReport> {
    console.log(`[YodeckPublish] Publishing plan ${planId}`);

    const report: PublishReport = {
      planId,
      startedAt: new Date().toISOString(),
      totalTargets: 0,
      successCount: 0,
      failedCount: 0,
      yodeckMediaId: null,
      targets: [],
    };

    try {
      // Get plan
      const plan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });

      if (!plan) {
        throw new Error("Plan not found");
      }

      if (plan.status !== "APPROVED" && plan.status !== "FAILED") {
        throw new Error(`Plan status must be APPROVED or FAILED, got ${plan.status}`);
      }

      // Get the ad asset
      const asset = await db.query.adAssets.findFirst({
        where: eq(adAssets.id, plan.adAssetId),
      });

      if (!asset?.storagePath) {
        throw new Error("Asset not found or no storage path");
      }

      // Update plan to PUBLISHING
      await db.update(placementPlans)
        .set({ status: "PUBLISHING" })
        .where(eq(placementPlans.id, planId));

      // Get approved targets
      const approvedTargets = plan.approvedTargets as any[] || [];
      report.totalTargets = approvedTargets.length;

      // Generate idempotency key for upload
      const uploadIdempotencyKey = crypto
        .createHash("sha256")
        .update(`upload:${planId}:${asset.id}`)
        .digest("hex");

      // Step 1: Upload media to Yodeck
      const uploadResult = await this.uploadMediaFromStorage(
        asset.storagePath,
        `${plan.linkKey}_${asset.originalFileName || "video"}`,
        uploadIdempotencyKey,
        plan.advertiserId
      );

      if (!uploadResult.ok || !uploadResult.mediaId) {
        throw new Error(`Upload failed: ${uploadResult.error}`);
      }

      report.yodeckMediaId = String(uploadResult.mediaId);

      // Step 2: Ensure tag-based playlists exist for all target locations
      const locationIds = approvedTargets.map(t => t.locationId);
      const perLocationResults: Array<{
        locationId: string;
        playlistId?: number;
        verifyStatus: string;
        assignStatus?: string;
        error?: string;
      }> = [];

      console.log(`[YodeckPublish] Ensuring tag-based playlists for ${locationIds.length} locations`);

      for (const locationId of locationIds) {
        const ensureResult = await this.ensureTagBasedPlaylist(locationId);
        perLocationResults.push({
          locationId,
          playlistId: ensureResult.playlistId,
          verifyStatus: ensureResult.verifyStatus,
          assignStatus: ensureResult.ok ? "OK" : "FAILED",
          error: ensureResult.error,
        });

        if (!ensureResult.ok) {
          console.error(`[YodeckPublish] Failed to ensure playlist for location ${locationId}: ${ensureResult.error}`);
        }
      }

      // Step 3: Tag-based publishing - tag media with all target locations at once
      // This is scalable (works for 100s of screens) and doesn't require playlist item management
      // NOTE: Using only predefined tags - these must be pre-created in Yodeck UI
      const tags = this.generatePlacementTags();
      
      console.log(`[YodeckPublish] Tag CRUD API not used; using predefined tags only: ${tags.join(', ')}`);
      console.log(`[YodeckPublish] (must pre-exist in Yodeck UI)`);
      
      const tagIdempotencyKey = crypto
        .createHash("sha256")
        .update(`tags:${planId}:${uploadResult.mediaId}:${locationIds.join(',')}`)
        .digest("hex");
      
      console.log(`[YodeckPublish] Using tag-based publishing for ${locationIds.length} locations`);
      
      const tagResult = await this.updateMediaTags(
        uploadResult.mediaId,
        tags,
        tagIdempotencyKey,
        planId
      );

      if (!tagResult.ok) {
        console.error(`[YodeckPublish] Tag update failed: ${tagResult.error}`);
      }

      // Step 4: Verify tags were applied
      let missingTags: string[] = [];
      if (tagResult.ok) {
        const verifyResult = await this.verifyMediaTags(uploadResult.mediaId, tags);
        missingTags = verifyResult.missing;
        
        if (!verifyResult.ok) {
          console.error(`[YodeckPublish] Tag verification failed: ${verifyResult.error}`);
        } else {
          console.log(`[YodeckPublish] MEDIA_TAG_VERIFY ok=true missing=[]`);
        }
      }
      
      // Update target reports based on tag result AND per-location ensure results
      for (const target of approvedTargets) {
        const locationResult = perLocationResults.find(r => r.locationId === target.locationId);
        // Check both assignStatus and absence of error to ensure any failure is tracked
        const ensureOk = locationResult?.assignStatus === "OK" && !locationResult?.error;
        const allOk = tagResult.ok && missingTags.length === 0 && ensureOk;
        
        const targetReport: { locationId: string; status: string; error?: string } = {
          locationId: target.locationId,
          status: allOk ? "tagged" : "failed",
        };
        
        // Collect all errors
        const errors: string[] = [];
        if (locationResult?.error) errors.push(locationResult.error);
        if (tagResult.error) errors.push(tagResult.error);
        if (missingTags.length > 0) errors.push(`Missing tags: ${missingTags.join(', ')}`);
        
        if (errors.length > 0) {
          targetReport.error = errors.join('; ');
        }
        
        if (allOk) {
          report.successCount++;
        } else {
          report.failedCount++;
        }
        
        report.targets.push(targetReport);
      }

      // Add extended info to report
      (report as any).tagsApplied = tags;
      (report as any).missingTags = missingTags;
      (report as any).perLocation = perLocationResults;

      // Step 5: Ensure ads surface is active on screens (layout or schedule)
      // This guarantees ads are visible, not just tagged
      console.log(`[YodeckPublish] Ensuring ads surface is active for ${locationIds.length} locations`);
      const surfaceResults: Array<{ locationId: string; surfaceActive: boolean; mode?: string; error?: string }> = [];
      
      for (const locationId of locationIds) {
        const locationResult = perLocationResults.find(r => r.locationId === locationId);
        if (!locationResult?.playlistId) continue;
        
        const loc = await db.query.locations.findFirst({
          where: eq(locations.id, locationId),
        });
        
        if (!loc?.yodeckDeviceId) {
          surfaceResults.push({ 
            locationId, 
            surfaceActive: false, 
            error: "No Yodeck screen linked" 
          });
          continue;
        }
        
        try {
          const { ensureAdsSurfaceActive } = await import("./yodeckLayoutService");
          const surfaceResult = await ensureAdsSurfaceActive({
            locationId,
            screenId: loc.yodeckDeviceId,
            adsPlaylistId: String(locationResult.playlistId),
          });
          
          surfaceResult.logs.forEach(log => console.log(log));
          
          surfaceResults.push({
            locationId,
            surfaceActive: surfaceResult.surfaceActive,
            mode: surfaceResult.mode,
            error: surfaceResult.error,
          });
          
          // Update target report if surface failed
          if (!surfaceResult.surfaceActive) {
            const targetIdx = report.targets.findIndex(t => t.locationId === locationId);
            if (targetIdx >= 0 && report.targets[targetIdx].status === "tagged") {
              report.targets[targetIdx].status = "failed";
              report.targets[targetIdx].error = surfaceResult.error || "ADS_SURFACE_NOT_ACTIVE";
              report.successCount--;
              report.failedCount++;
            }
          }
        } catch (e: any) {
          console.error(`[YodeckPublish] Surface check failed for ${locationId}: ${e.message}`);
          surfaceResults.push({ 
            locationId, 
            surfaceActive: false, 
            error: e.message 
          });
        }
      }
      
      (report as any).surfaceResults = surfaceResults;

      // Step 6: Verify screen is on Elevizion layout (not a demo/external layout)
      // This ensures ads are truly visible, not hidden behind "Visitors - Black Friday Deal" etc.
      console.log(`[YodeckPublish] Verifying Elevizion layout for ${locationIds.length} locations`);
      const layoutVerifyResults: Array<{ locationId: string; layoutVerified: boolean; layoutName?: string; error?: string }> = [];
      
      for (const locationId of locationIds) {
        const loc = await db.query.locations.findFirst({
          where: eq(locations.id, locationId),
        });
        
        if (!loc?.yodeckDeviceId) {
          layoutVerifyResults.push({ 
            locationId, 
            layoutVerified: false, 
            error: "No Yodeck screen linked" 
          });
          // Mark target as failed - no screen means no layout verification possible
          const targetIdx = report.targets.findIndex(t => t.locationId === locationId);
          if (targetIdx >= 0 && report.targets[targetIdx].status === "tagged") {
            report.targets[targetIdx].status = "failed";
            report.targets[targetIdx].error = "SCREEN_NOT_LINKED";
            report.successCount--;
            report.failedCount++;
          }
          continue;
        }
        
        try {
          const { getScreenContentStatus, isElevizionLayout, ensureScreenUsesElevizionLayout } = await import("./yodeckLayoutService");
          const screenStatus = await getScreenContentStatus(loc.yodeckDeviceId);
          
          if (screenStatus.ok && screenStatus.mode === "layout" && isElevizionLayout(screenStatus.layoutName)) {
            // Screen is on correct Elevizion layout
            layoutVerifyResults.push({
              locationId,
              layoutVerified: true,
              layoutName: screenStatus.layoutName,
            });
            console.log(`[YodeckPublish] Location ${locationId}: Elevizion layout OK (${screenStatus.layoutName})`);
          } else {
            // Screen is on wrong layout - attempt auto-fix
            console.log(`[YodeckPublish] Location ${locationId}: Wrong layout detected (${screenStatus.layoutName || screenStatus.mode}), attempting auto-fix...`);
            
            const forceResult = await ensureScreenUsesElevizionLayout(locationId);
            forceResult.logs.forEach(log => console.log(log));
            
            if (forceResult.ok && forceResult.verified) {
              layoutVerifyResults.push({
                locationId,
                layoutVerified: true,
                layoutName: forceResult.layoutName,
              });
              console.log(`[YodeckPublish] Location ${locationId}: Auto-fixed to Elevizion layout (${forceResult.layoutName})`);
            } else {
              // Failed to fix - mark target as failed
              layoutVerifyResults.push({
                locationId,
                layoutVerified: false,
                error: forceResult.error || "SCREEN_LAYOUT_NOT_APPLIED",
              });
              
              const targetIdx = report.targets.findIndex(t => t.locationId === locationId);
              if (targetIdx >= 0 && report.targets[targetIdx].status === "tagged") {
                report.targets[targetIdx].status = "failed";
                report.targets[targetIdx].error = forceResult.error || "SCREEN_LAYOUT_NOT_APPLIED";
                report.successCount--;
                report.failedCount++;
              }
              console.log(`[YodeckPublish] Location ${locationId}: FAILED - could not apply Elevizion layout`);
            }
          }
        } catch (e: any) {
          console.error(`[YodeckPublish] Layout verify failed for ${locationId}: ${e.message}`);
          layoutVerifyResults.push({ 
            locationId, 
            layoutVerified: false, 
            error: e.message 
          });
          // Mark target as failed on verification error
          const targetIdx = report.targets.findIndex(t => t.locationId === locationId);
          if (targetIdx >= 0 && report.targets[targetIdx].status === "tagged") {
            report.targets[targetIdx].status = "failed";
            report.targets[targetIdx].error = `LAYOUT_VERIFY_ERROR: ${e.message}`;
            report.successCount--;
            report.failedCount++;
          }
        }
      }
      
      (report as any).layoutVerifyResults = layoutVerifyResults;

      // Update plan status based on results
      report.completedAt = new Date().toISOString();
      report.publishedAt = new Date().toISOString();
      
      const finalStatus = report.failedCount === 0 
        ? "PUBLISHED" 
        : report.successCount > 0 
          ? "PUBLISHED" // Partial success still counts as published
          : "FAILED";

      // Get current plan to check retry count
      const currentPlan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });
      const wasRetry = (currentPlan as any)?.retryCount > 0;

      // Update plan status and clear error fields if this was a successful retry
      await db.update(placementPlans)
        .set({
          status: finalStatus,
          publishedAt: new Date(),
          publishReport: report,
          // Clear error fields after successful publish (cleanup after retry)
          ...(finalStatus === "PUBLISHED" && wasRetry ? {
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorDetails: null,
            failedAt: null,
          } : {}),
        })
        .where(eq(placementPlans.id, planId));

      console.log(`[YodeckPublish] Plan ${planId} ${finalStatus}: ${report.successCount}/${report.totalTargets} successful${wasRetry ? ` (retry #${(currentPlan as any)?.retryCount})` : ""}`);
      
      // Log audit event for successful retry resolution
      if (finalStatus === "PUBLISHED" && wasRetry) {
        await logAudit('PLAN_RETRY_RESOLVED', {
          planId: planId,
          advertiserId: plan.advertiserId,
          assetId: plan.adAssetId,
          metadata: {
            retryCount: (currentPlan as any)?.retryCount,
            previousErrorCode: (currentPlan as any)?.lastErrorCode,
          },
        });
      }
      
      // Log audit event - only log PLAN_PUBLISHED on success
      if (finalStatus === "PUBLISHED") {
        await logAudit('PLAN_PUBLISHED', {
          advertiserId: plan.advertiserId,
          assetId: plan.adAssetId,
          planId: planId,
          metadata: {
            status: finalStatus,
            successCount: report.successCount,
            totalTargets: report.totalTargets,
            yodeckMediaId: report.yodeckMediaId,
          },
        });
      }
      // Note: Partial failures are logged in the catch block with PLAN_FAILED or PLAN_PUBLISH_FAILED
      
      if (finalStatus === "PUBLISHED" && report.successCount > 0) {
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
          : '';
        dispatchMailEvent("ADVERTISER_PUBLISHED", plan.advertiserId, baseUrl)
          .then(result => {
            if (!result.success && !result.skipped) {
              console.warn('[YodeckPublish] Mail dispatch warning:', result.reason);
            }
          })
          .catch(err => console.error('[YodeckPublish] Mail dispatch error:', err));
      }
      
      return report;
    } catch (err: any) {
      report.completedAt = new Date().toISOString();
      console.error(`[YodeckPublish] Plan ${planId} failed:`, err.message);

      // Determine error code from message
      let errorCode = "PUBLISH_FAILED";
      let auditEventType: "PLAN_PUBLISH_FAILED" | "PLAN_PUBLISH_VERIFY_FAILED" = "PLAN_PUBLISH_FAILED";
      
      if (err.message?.includes("Upload failed")) {
        errorCode = "YODECK_UPLOAD_FAILED";
      } else if (err.message?.includes("UPLOAD_OK_BUT_NOT_IN_PLAYLIST")) {
        errorCode = "UPLOAD_OK_BUT_NOT_IN_PLAYLIST";
        auditEventType = "PLAN_PUBLISH_VERIFY_FAILED";
      } else if (err.message?.includes("playlist")) {
        errorCode = "PLAYLIST_ADD_FAILED";
      } else if (err.message?.includes("Asset not found")) {
        errorCode = "ASSET_NOT_FOUND";
      }

      // Get current retry count
      const currentPlan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });
      const currentRetryCount = (currentPlan as any)?.retryCount || 0;

      await db.update(placementPlans)
        .set({
          status: "FAILED",
          failedAt: new Date(),
          retryCount: currentRetryCount + 1,
          lastAttemptAt: new Date(),
          lastErrorCode: errorCode,
          lastErrorMessage: err.message?.substring(0, 500) || "Unknown error",
          lastErrorDetails: { 
            stack: err.stack?.substring(0, 2000),
            report: { ...report, error: err.message }
          },
          publishReport: { ...report, error: err.message } as any,
        })
        .where(eq(placementPlans.id, planId));

      // Log audit event for failure
      await logAudit(auditEventType, {
        planId: planId,
        metadata: {
          errorCode,
          error: err.message,
          failedCount: report.failedCount,
          totalTargets: report.totalTargets,
          retryCount: currentRetryCount + 1,
        },
      });

      throw err;
    }
  }

  /**
   * Rollback a published plan
   */
  async rollbackPlan(planId: string): Promise<{ ok: boolean; error?: string }> {
    console.log(`[YodeckPublish] Rolling back plan ${planId}`);

    try {
      const plan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });

      if (!plan) {
        return { ok: false, error: "Plan not found" };
      }

      const publishReport = plan.publishReport as PublishReport | null;
      if (!publishReport?.yodeckMediaId) {
        return { ok: false, error: "No publish report or media ID found" };
      }

      const mediaId = parseInt(publishReport.yodeckMediaId);

      // Remove media from all playlists where it was added
      for (const target of publishReport.targets) {
        if (target.status === "added_to_playlist") {
          const location = await db.query.locations.findFirst({
            where: eq(locations.id, target.locationId),
          });

          if (location?.yodeckPlaylistId) {
            await this.removeMediaFromPlaylist(parseInt(location.yodeckPlaylistId), mediaId);
          }
        }
      }

      // Update plan status
      await db.update(placementPlans)
        .set({ 
          status: "ROLLED_BACK",
          publishReport: { ...publishReport, rolledBackAt: new Date().toISOString() },
        })
        .where(eq(placementPlans.id, planId));

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Test upload to verify Yodeck API accepts our two-step upload flow
   * Creates a minimal test video and uses the shared twoStepUploadMedia function
   * Returns detailed diagnostics matching the required response format
   */
  async testUpload(): Promise<{
    screensOk: boolean;
    metadata: {
      ok: boolean;
      status?: number;
      mediaId?: number;
      rawKeysFound: string[];
      uploadUrlFoundAt: string;
      error?: string;
    };
    binaryUpload: {
      ok: boolean;
      method: 'presigned_put' | 'patch' | 'none';
      status?: number;
      contentTypeSent?: string;
      bytesSent?: number;
      error?: string;
    };
    confirm: {
      attempted: boolean;
      ok: boolean;
      status?: number;
      error?: string;
    };
    uploadOk: boolean;
    uploadMethodUsed: 'two-step' | 'unknown';
    lastError?: {
      message: string;
      status?: number;
      bodySnippet?: string;
    };
    yodeckMediaId?: number;
  }> {
    console.log(`[YodeckPublish] Running two-step upload test...`);
    
    // Create a minimal test video using ffmpeg (1 second, 100x100, black)
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const testFileName = `yodeck-test-${Date.now()}.mp4`;
    const testFilePath = path.join("/tmp", testFileName);
    
    try {
      // Generate a minimal test video (1 second, 100x100 black frame)
      await execAsync(
        `ffmpeg -y -f lavfi -i color=c=black:s=100x100:d=1 -c:v libx264 -pix_fmt yuv420p -t 1 "${testFilePath}"`,
        { timeout: 30000 }
      );
      
      const fileBuffer = await fs.readFile(testFilePath);
      console.log(`[YodeckPublish] Test video created: ${fileBuffer.length} bytes`);
      
      // Use the shared two-step upload function
      const result = await this.twoStepUploadMedia({
        bytes: fileBuffer,
        name: testFileName,
        contentType: 'video/mp4',
      });
      
      // Clean up test media from Yodeck if upload succeeded
      if (result.mediaId) {
        try {
          const apiKey = await this.getApiKey();
          await axios.delete(`${YODECK_BASE_URL}/media/${result.mediaId}`, {
            headers: { "Authorization": `Token ${apiKey}` },
            timeout: 10000,
          });
          console.log(`[YodeckPublish] Test media cleaned up from Yodeck`);
        } catch (cleanupErr: any) {
          console.log(`[YodeckPublish] Could not clean up test media: ${cleanupErr.message}`);
        }
      }
      
      // Clean up local test file
      await fs.unlink(testFilePath).catch(() => {});
      
      return {
        screensOk: true, // We already have screen access if we got this far
        metadata: result.diagnostics.metadata,
        binaryUpload: result.diagnostics.binaryUpload,
        confirm: result.diagnostics.confirm,
        uploadOk: result.ok,
        uploadMethodUsed: result.uploadMethodUsed,
        lastError: result.diagnostics.lastError,
        yodeckMediaId: result.mediaId,
      };
    } catch (err: any) {
      // Clean up on error
      const fs = await import("fs/promises");
      await fs.unlink(testFilePath).catch(() => {});
      
      console.error(`[YodeckPublish] Upload test error:`, err.message);
      return {
        screensOk: true,
        metadata: { ok: false, rawKeysFound: [], uploadUrlFoundAt: 'none', error: err.message },
        binaryUpload: { ok: false, method: 'none', error: err.message },
        confirm: { attempted: false, ok: false },
        uploadOk: false,
        uploadMethodUsed: 'unknown',
        lastError: { message: err.message },
      };
    }
  }
}

export const yodeckPublishService = new YodeckPublishService();
