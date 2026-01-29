/**
 * Content Pipeline Configuration
 * 
 * KILL-SWITCHES for legacy content systems.
 * 
 * CONTENT_PIPELINE_MODE:
 * - "SCREEN_PLAYLIST_ONLY" (default): Only per-screen playlists, no location/autopilot/combined
 * - "LEGACY": Legacy combined playlist + location systems (deprecated)
 * 
 * When SCREEN_PLAYLIST_ONLY:
 * - AutopilotWorker does NOT start
 * - Location autopilot/combined checks are DISABLED
 * - Only Screen.yodeckPlaylistId is used as source of truth
 * - No BASELINE_NOT_CONFIGURED or Combined Playlist Mode errors
 * 
 * BASELINE ARCHITECTURE:
 * - One central baseline playlist "EVZ | BASELINE" is the source of truth
 * - Per-screen playlists "EVZ | SCREEN | {playerId}" contain baseline + ads
 * - Changing baseline auto-propagates to all screen playlists
 */

export type ContentPipelineMode = "SCREEN_PLAYLIST_ONLY" | "LEGACY";

export const CONTENT_PIPELINE_MODE: ContentPipelineMode = 
  (process.env.CONTENT_PIPELINE_MODE as ContentPipelineMode) || "SCREEN_PLAYLIST_ONLY";

export const ENABLE_AUTOPILOT_WORKER = 
  process.env.ENABLE_AUTOPILOT_WORKER === "true" || false;

export const ENABLE_LOCATION_AUTOPILOT = 
  process.env.ENABLE_LOCATION_AUTOPILOT === "true" || false;

export const YODECK_TEMPLATE_PLAYLIST_ID = 
  process.env.YODECK_TEMPLATE_PLAYLIST_ID || "30400683";

// =============================================================================
// BASELINE CONFIGURATION - Central source of truth for all screens
// =============================================================================

export const BASELINE_PLAYLIST_NAME = "EVZ | BASELINE";

export function getScreenPlaylistName(yodeckPlayerId: string | number): string {
  return `EVZ | SCREEN | ${yodeckPlayerId}`;
}

export const BASELINE_MEDIA_IDS: number[] = [27478716, 27476141, 27477130, 27476083];

export const MIN_BASELINE_COUNT = 3;

export function isScreenPlaylistOnlyMode(): boolean {
  return CONTENT_PIPELINE_MODE === "SCREEN_PLAYLIST_ONLY";
}

export function shouldStartAutopilotWorker(): boolean {
  if (CONTENT_PIPELINE_MODE === "SCREEN_PLAYLIST_ONLY") {
    return false;
  }
  return ENABLE_AUTOPILOT_WORKER;
}

export function shouldRunLocationAutopilot(): boolean {
  if (CONTENT_PIPELINE_MODE === "SCREEN_PLAYLIST_ONLY") {
    return false;
  }
  return ENABLE_LOCATION_AUTOPILOT;
}

export function logContentPipelineConfig(): void {
  console.log(`[ContentPipeline] Mode: ${CONTENT_PIPELINE_MODE}`);
  console.log(`[ContentPipeline] AutopilotWorker: ${shouldStartAutopilotWorker() ? "ENABLED" : "DISABLED"}`);
  console.log(`[ContentPipeline] LocationAutopilot: ${shouldRunLocationAutopilot() ? "ENABLED" : "DISABLED"}`);
  console.log(`[ContentPipeline] Template: ${YODECK_TEMPLATE_PLAYLIST_ID}`);
}
