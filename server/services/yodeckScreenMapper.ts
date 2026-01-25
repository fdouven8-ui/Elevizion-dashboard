/**
 * Yodeck Screen Mapper
 * 
 * Robust mapping utility that handles all known Yodeck API response variants.
 * This is the SINGLE SOURCE OF TRUTH for interpreting Yodeck screen status.
 * 
 * Handles both:
 * - Top-level fields (legacy/simple API responses)
 * - Nested structures (screen_content, player_status, state)
 * 
 * Usage:
 *   import { mapYodeckScreen, MappedScreen } from "./yodeckScreenMapper";
 *   const mapped = mapYodeckScreen(rawApiResponse);
 */

export interface MappedScreen {
  screenId: string;
  screenName: string;
  
  isOnline: boolean | "unknown";
  lastSeenOnline: string | null;
  lastScreenshotAt: string | null;
  
  contentMode: "playlist" | "layout" | "media" | "schedule" | "app" | "unknown";
  
  playlistId: string | null;
  playlistName: string | null;
  
  layoutId: string | null;
  layoutName: string | null;
  
  rawKeysUsed: {
    contentModeField: string | null;
    contentModeValue: string | null;
    playlistIdField: string | null;
    layoutIdField: string | null;
    layoutNameField: string | null;
    onlineField: string | null;
  };
  
  debugInfo: {
    availableTopKeys: string[];
    screenContentKeys: string[];
    playerStatusKeys: string[];
    stateKeys: string[];
  };
  
  warnings: string[];
}

/**
 * Safely get a nested value from an object
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Extract ID from a value that could be a number, string, or object with .id
 */
function extractId(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && val.id !== undefined) {
    return String(val.id);
  }
  if (typeof val === "number" || typeof val === "string") {
    return String(val);
  }
  return null;
}

/**
 * Extract name from a value that could be a string or object with .name
 */
function extractName(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && val.name !== undefined) {
    return String(val.name);
  }
  if (typeof val === "string") {
    return val;
  }
  return null;
}

/**
 * Maps a raw Yodeck screen API response to a normalized structure.
 * Handles all known field name variants including nested structures.
 */
export function mapYodeckScreen(raw: any): MappedScreen {
  const warnings: string[] = [];
  const rawKeysUsed: MappedScreen["rawKeysUsed"] = {
    contentModeField: null,
    contentModeValue: null,
    playlistIdField: null,
    layoutIdField: null,
    layoutNameField: null,
    onlineField: null,
  };

  // Collect debug info about available keys
  const debugInfo: MappedScreen["debugInfo"] = {
    availableTopKeys: [],
    screenContentKeys: [],
    playerStatusKeys: [],
    stateKeys: [],
  };

  if (!raw || typeof raw !== "object") {
    return {
      screenId: "unknown",
      screenName: "unknown",
      isOnline: "unknown",
      lastSeenOnline: null,
      lastScreenshotAt: null,
      contentMode: "unknown",
      playlistId: null,
      playlistName: null,
      layoutId: null,
      layoutName: null,
      rawKeysUsed,
      debugInfo,
      warnings: ["Raw response is null or not an object"],
    };
  }

  // Collect available keys for debugging
  debugInfo.availableTopKeys = Object.keys(raw);
  debugInfo.screenContentKeys = raw.screen_content ? Object.keys(raw.screen_content) : [];
  debugInfo.playerStatusKeys = raw.player_status ? Object.keys(raw.player_status) : [];
  debugInfo.stateKeys = raw.state ? Object.keys(raw.state) : [];

  // Screen ID - try multiple fields
  const screenId = String(raw.id || raw.screen_id || raw.uuid || "unknown");
  const screenName = raw.name || raw.screen_name || "Unknown Screen";

  // ========== ONLINE STATUS ==========
  // Check nested structures FIRST, then fall back to top-level
  let isOnline: boolean | "unknown" = "unknown";
  const onlineCheckOrder = [
    // Nested in player_status (most common)
    { path: "player_status.is_online", type: "bool" },
    { path: "player_status.online", type: "bool" },
    { path: "player_status.status", type: "string_online" },
    // Nested in state
    { path: "state.is_online", type: "bool" },
    { path: "state.online", type: "bool" },
    { path: "state.status", type: "string_online" },
    { path: "state.status_text", type: "string_contains_online" },
    // Top-level fallback
    { path: "status", type: "string_online" },
    { path: "is_online", type: "bool" },
    { path: "online", type: "bool" },
  ];

  for (const check of onlineCheckOrder) {
    const val = getNestedValue(raw, check.path);
    if (val !== undefined && val !== null) {
      if (check.type === "bool") {
        isOnline = val === true;
        rawKeysUsed.onlineField = check.path;
        break;
      } else if (check.type === "string_online") {
        isOnline = String(val).toLowerCase() === "online";
        rawKeysUsed.onlineField = check.path;
        break;
      } else if (check.type === "string_contains_online") {
        isOnline = String(val).toLowerCase().includes("online");
        rawKeysUsed.onlineField = check.path;
        break;
      }
    }
  }

  if (isOnline === "unknown") {
    warnings.push(`No online status field found. Checked: ${onlineCheckOrder.map(c => c.path).join(", ")}`);
  }

  // Timestamps
  const lastSeenOnline = raw.last_seen_online || raw.lastSeenOnline || raw.last_online || 
    getNestedValue(raw, "player_status.last_seen") || null;
  const lastScreenshotAt = raw.last_screenshot_at || raw.lastScreenshotAt || raw.screenshot_at || 
    raw.screenshot_url || null;

  // ========== CONTENT MODE ==========
  // Check multiple nested structures, then fall back to top-level
  let contentMode: MappedScreen["contentMode"] = "unknown";
  let contentModeValue: string | null = null;
  
  const contentModeCheckOrder = [
    // Nested in screen_content - actual API fields
    "screen_content.source_type",  // Actual field found in API
    "screen_content.default_playlist_type",
    "screen_content.content_type",
    "screen_content.type",
    "screen_content.mode",
    // Nested in state
    "state.default_playlist_type",
    "state.content_type",
    "state.mode",
    // Top-level fallback
    "default_playlist_type",
    "content_type",
    "playlist_type",
    "mode",
    "display_mode",
  ];
  
  for (const path of contentModeCheckOrder) {
    const val = getNestedValue(raw, path);
    if (val !== undefined && val !== null) {
      contentModeValue = String(val).toLowerCase();
      rawKeysUsed.contentModeField = path;
      rawKeysUsed.contentModeValue = contentModeValue;
      break;
    }
  }

  if (contentModeValue) {
    // Normalize the content mode value
    if (contentModeValue === "layout" || contentModeValue === "layouts") {
      contentMode = "layout";
    } else if (contentModeValue === "playlist" || contentModeValue === "playlists") {
      contentMode = "playlist";
    } else if (contentModeValue === "media" || contentModeValue === "single_media") {
      contentMode = "media";
    } else if (contentModeValue === "schedule" || contentModeValue === "schedules") {
      contentMode = "schedule";
    } else if (contentModeValue === "app" || contentModeValue === "apps") {
      contentMode = "app";
    } else {
      // Don't warn for known values that don't map to content types (like player_type values)
      if (!["raspberry_pi", "android", "webplayer", "other"].includes(contentModeValue)) {
        warnings.push(`Unknown content mode value: "${contentModeValue}" from field "${rawKeysUsed.contentModeField}"`);
      }
      // If it was from player_type, reset as we can't determine content mode from it
      if (rawKeysUsed.contentModeField === "player_type") {
        rawKeysUsed.contentModeField = null;
        rawKeysUsed.contentModeValue = null;
        contentModeValue = null;
      }
    }
  }

  // If still no content mode, try to infer from default_playlist structure
  if (!contentModeValue) {
    // Check if default_playlist exists and has type info
    const defaultPlaylist = raw.default_playlist;
    if (defaultPlaylist !== undefined && defaultPlaylist !== null) {
      if (typeof defaultPlaylist === "object") {
        // Check for type field within the object
        if (defaultPlaylist.type) {
          contentModeValue = String(defaultPlaylist.type).toLowerCase();
          rawKeysUsed.contentModeField = "default_playlist.type";
          rawKeysUsed.contentModeValue = contentModeValue;
          if (contentModeValue === "layout" || contentModeValue === "layouts") {
            contentMode = "layout";
          } else if (contentModeValue === "playlist" || contentModeValue === "playlists") {
            contentMode = "playlist";
          }
        }
        // Check for is_layout flag
        if (contentMode === "unknown" && defaultPlaylist.is_layout !== undefined) {
          contentMode = defaultPlaylist.is_layout ? "layout" : "playlist";
          rawKeysUsed.contentModeField = "default_playlist.is_layout";
          rawKeysUsed.contentModeValue = String(defaultPlaylist.is_layout);
        }
        // If object has name that starts with layout indicators
        if (contentMode === "unknown" && typeof defaultPlaylist.name === "string") {
          const name = defaultPlaylist.name.toLowerCase();
          if (name.includes("layout")) {
            contentMode = "layout";
            rawKeysUsed.contentModeField = "default_playlist.name (inferred)";
            rawKeysUsed.contentModeValue = "layout";
          }
        }
      } else {
        // default_playlist is just an ID - we'll need to infer later when we check layouts
        warnings.push(`default_playlist is ID only (${defaultPlaylist}), cannot infer type without API lookup`);
      }
    }
  }
  
  // Final fallback - if we still don't know, check if layout fields exist
  if (contentMode === "unknown") {
    // If layout or current_layout exists, assume layout mode
    if (raw.layout || raw.current_layout || raw.assigned_layout) {
      contentMode = "layout";
      rawKeysUsed.contentModeField = "layout (presence inferred)";
      rawKeysUsed.contentModeValue = "layout";
    }
  }
  
  if (contentMode === "unknown") {
    warnings.push(`No content mode field found. Checked: ${contentModeCheckOrder.join(", ")}`);
    warnings.push(`Top-level keys: ${debugInfo.availableTopKeys.slice(0, 15).join(", ")}${debugInfo.availableTopKeys.length > 15 ? "..." : ""}`);
    if (debugInfo.screenContentKeys.length > 0) {
      warnings.push(`screen_content keys: ${debugInfo.screenContentKeys.join(", ")}`);
    }
    if (debugInfo.stateKeys.length > 0) {
      warnings.push(`state keys: ${debugInfo.stateKeys.join(", ")}`);
    }
  }

  // ========== PLAYLIST ID AND NAME ==========
  let playlistId: string | null = null;
  let playlistName: string | null = null;
  
  if (contentMode === "playlist" || contentMode === "unknown") {
    // Check nested screen_content FIRST
    const playlistCheckOrder = [
      "screen_content.default_playlist",
      "screen_content.playlist",
      "screen_content.item",
      "screen_content.content",
      // Top-level fallback
      "default_playlist",
      "playlist_id",
      "playlist",
      "assigned_playlist",
    ];
    
    for (const path of playlistCheckOrder) {
      const val = getNestedValue(raw, path);
      if (val !== undefined && val !== null) {
        playlistId = extractId(val);
        if (playlistId) {
          rawKeysUsed.playlistIdField = typeof val === "object" && val.id ? `${path}.id` : path;
          playlistName = extractName(val);
          break;
        }
      }
    }
    
    // Try to get playlist name from separate fields
    if (!playlistName) {
      playlistName = raw.default_playlist_name || raw.playlist_name || 
        getNestedValue(raw, "screen_content.default_playlist_name") || null;
    }
  }

  // ========== LAYOUT ID AND NAME ==========
  // Always try to extract layout info - useful for verification even when contentMode is unknown
  let layoutId: string | null = null;
  let layoutName: string | null = null;
  
  // Check nested screen_content FIRST - include source_id which is the actual API field
  const layoutCheckOrder = [
    "screen_content.source_id",  // Actual field found in API
    "screen_content.layout",
    "screen_content.default_playlist",
    "screen_content.item",
    "screen_content.content",
    // Nested in state
    "state.layout",
    "state.default_playlist",
    // Top-level fallback
    "layout",
    "current_layout",
    "assigned_layout",
    "default_layout",
    "default_playlist",
  ];
  
  for (const path of layoutCheckOrder) {
    const val = getNestedValue(raw, path);
    if (val !== undefined && val !== null) {
      const extractedId = extractId(val);
      if (extractedId) {
        layoutId = extractedId;
        rawKeysUsed.layoutIdField = typeof val === "object" && val.id ? `${path}.id` : path;
        const extractedName = extractName(val);
        if (extractedName && typeof val === "object") {
          layoutName = extractedName;
          rawKeysUsed.layoutNameField = `${path}.name`;
        }
        break;
      }
    }
  }
  
  // If we found source_id but no name, check source_name separately
  if (layoutId && !layoutName) {
    const sourceName = getNestedValue(raw, "screen_content.source_name");
    if (sourceName && typeof sourceName === "string") {
      layoutName = sourceName;
      rawKeysUsed.layoutNameField = "screen_content.source_name";
    }
  }
  
  // If mode is layout but we found no ID yet, try additional fallback fields
  if (!layoutId && contentMode === "layout") {
    const dpFields = ["layout_id"];
    for (const path of dpFields) {
      const val = getNestedValue(raw, path);
      const id = extractId(val);
      if (id) {
        layoutId = id;
        rawKeysUsed.layoutIdField = path;
        break;
      }
    }
  }

  return {
    screenId,
    screenName,
    isOnline,
    lastSeenOnline,
    lastScreenshotAt,
    contentMode,
    playlistId,
    playlistName,
    layoutId,
    layoutName,
    rawKeysUsed,
    debugInfo,
    warnings,
  };
}

/**
 * Log available keys from a Yodeck screen response for debugging.
 * Call this once per sync to understand the API structure.
 */
export function logYodeckScreenStructure(raw: any, prefix: string = "[YodeckMapper]"): void {
  if (!raw || typeof raw !== "object") {
    console.log(`${prefix} Cannot log structure: raw is null or not an object`);
    return;
  }

  const topLevelKeys = Object.keys(raw);
  console.log(`${prefix} Top-level keys (${topLevelKeys.length}): ${topLevelKeys.join(", ")}`);

  // Log nested structures that contain content info
  const nestedStructures = ["screen_content", "player_status", "state"];
  for (const struct of nestedStructures) {
    const nested = raw[struct];
    if (nested && typeof nested === "object") {
      const nestedKeys = Object.keys(nested);
      console.log(`${prefix} ${struct} keys (${nestedKeys.length}): ${nestedKeys.join(", ")}`);
    }
  }

  // Log nested objects that might contain content info
  const nestedHints: string[] = [];
  for (const key of ["layout", "current_layout", "assigned_layout", "playlist", "default_playlist"]) {
    const val = raw[key];
    if (val && typeof val === "object") {
      const nestedKeys = Object.keys(val).slice(0, 5);
      nestedHints.push(`${key}: {${nestedKeys.join(", ")}...}`);
    } else if (val !== undefined) {
      nestedHints.push(`${key}: ${typeof val} = ${String(val).slice(0, 30)}`);
    }
  }
  
  if (nestedHints.length > 0) {
    console.log(`${prefix} Nested hints: ${nestedHints.join(" | ")}`);
  }

  // Check screen_content for content mode
  const screenContent = raw.screen_content;
  if (screenContent && typeof screenContent === "object") {
    const modeFields = ["default_playlist_type", "content_type", "type", "mode"];
    const modeValues: string[] = [];
    for (const field of modeFields) {
      if (screenContent[field] !== undefined) {
        modeValues.push(`screen_content.${field}="${screenContent[field]}"`);
      }
    }
    if (modeValues.length > 0) {
      console.log(`${prefix} Mode fields found: ${modeValues.join(", ")}`);
    }
  }

  // Log top-level content mode fields
  const modeFields = ["default_playlist_type", "content_type", "playlist_type", "mode"];
  const modeValues: string[] = [];
  for (const field of modeFields) {
    if (raw[field] !== undefined) {
      modeValues.push(`${field}="${raw[field]}"`);
    }
  }
  if (modeValues.length > 0) {
    console.log(`${prefix} Top-level mode fields: ${modeValues.join(", ")}`);
  } else if (!screenContent) {
    console.log(`${prefix} WARNING: No mode fields found at top level or in screen_content!`);
  }
}

/**
 * Fetch and map a screen in one call.
 * Uses yodeckRequest internally.
 */
export async function fetchAndMapScreen(
  screenId: string,
  yodeckRequest: <T>(endpoint: string, method?: string, body?: any) => Promise<{ ok: boolean; data?: T; error?: string }>
): Promise<{ ok: boolean; mapped?: MappedScreen; raw?: any; error?: string }> {
  console.log(`[YodeckMapper] Fetching screen ${screenId}`);
  
  const result = await yodeckRequest<any>(`/screens/${screenId}`);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || "Failed to fetch screen" };
  }

  const raw = result.data;
  
  // Log structure on first fetch for debugging
  logYodeckScreenStructure(raw, `[YodeckMapper] Screen ${screenId}`);
  
  const mapped = mapYodeckScreen(raw);
  
  if (mapped.warnings.length > 0) {
    console.log(`[YodeckMapper] Warnings for screen ${screenId}: ${mapped.warnings.join("; ")}`);
  }

  return { ok: true, mapped, raw };
}

/**
 * Generate Yodeck resource URLs for linking to their web UI
 */
export function generateYodeckUrls(screenId: string, layoutId?: string | null, playlistId?: string | null): {
  screenUrl: string;
  layoutUrl: string | null;
  playlistUrl: string | null;
} {
  const baseUrl = "https://app.yodeck.com";
  
  return {
    screenUrl: `${baseUrl}/screens/${screenId}`,
    layoutUrl: layoutId ? `${baseUrl}/layouts/${layoutId}` : null,
    playlistUrl: playlistId ? `${baseUrl}/playlists/${playlistId}` : null,
  };
}

// Layout name cache (5 minute TTL)
const layoutNameCache = new Map<string, { name: string; timestamp: number }>();
const LAYOUT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve layout name by ID via secondary lookup if not available in screen response.
 * Caches results for 5 minutes.
 */
export async function resolveLayoutName(
  layoutId: string,
  yodeckRequest: <T>(endpoint: string, method?: string, body?: any) => Promise<{ ok: boolean; data?: T; error?: string }>
): Promise<string | null> {
  // Check cache
  const cached = layoutNameCache.get(layoutId);
  if (cached && Date.now() - cached.timestamp < LAYOUT_CACHE_TTL) {
    return cached.name;
  }

  // Fetch layout details
  const result = await yodeckRequest<{ id: number; name: string }>(`/layouts/${layoutId}`);
  
  if (result.ok && result.data?.name) {
    layoutNameCache.set(layoutId, { name: result.data.name, timestamp: Date.now() });
    return result.data.name;
  }

  return null;
}
