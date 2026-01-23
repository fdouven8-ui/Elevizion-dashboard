/**
 * Yodeck Screen Mapper
 * 
 * Robust mapping utility that handles all known Yodeck API response variants.
 * This is the SINGLE SOURCE OF TRUTH for interpreting Yodeck screen status.
 * 
 * Usage:
 *   import { mapYodeckScreen, MappedScreen } from "./yodeckScreenMapper";
 *   const mapped = mapYodeckScreen(rawApiResponse);
 */

export interface MappedScreen {
  screenId: string;
  screenName: string;
  
  isOnline: boolean;
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
  
  warnings: string[];
}

/**
 * Maps a raw Yodeck screen API response to a normalized structure.
 * Handles all known field name variants and logs which fields were used.
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

  if (!raw || typeof raw !== "object") {
    return {
      screenId: "unknown",
      screenName: "unknown",
      isOnline: false,
      lastSeenOnline: null,
      lastScreenshotAt: null,
      contentMode: "unknown",
      playlistId: null,
      playlistName: null,
      layoutId: null,
      layoutName: null,
      rawKeysUsed,
      warnings: ["Raw response is null or not an object"],
    };
  }

  // Screen ID - try multiple fields
  const screenId = String(raw.id || raw.screen_id || raw.uuid || "unknown");
  const screenName = raw.name || raw.screen_name || "Unknown Screen";

  // Online status - try multiple fields
  let isOnline = false;
  if (raw.status !== undefined) {
    isOnline = raw.status === "online";
    rawKeysUsed.onlineField = "status";
  } else if (raw.is_online !== undefined) {
    isOnline = raw.is_online === true;
    rawKeysUsed.onlineField = "is_online";
  } else if (raw.online !== undefined) {
    isOnline = raw.online === true;
    rawKeysUsed.onlineField = "online";
  } else {
    warnings.push("No online status field found (checked: status, is_online, online)");
  }

  // Timestamps
  const lastSeenOnline = raw.last_seen_online || raw.lastSeenOnline || raw.last_online || null;
  const lastScreenshotAt = raw.last_screenshot_at || raw.lastScreenshotAt || raw.screenshot_at || null;

  // Content Mode - the trickiest part
  // Yodeck uses "default_playlist_type" to indicate what type of content is assigned
  let contentMode: MappedScreen["contentMode"] = "unknown";
  let contentModeValue: string | null = null;
  
  // Try multiple field names for content type
  const contentTypeFields = [
    "default_playlist_type",
    "content_type",
    "playlist_type",
    "mode",
    "display_mode",
  ];
  
  for (const field of contentTypeFields) {
    if (raw[field] !== undefined && raw[field] !== null) {
      contentModeValue = String(raw[field]).toLowerCase();
      rawKeysUsed.contentModeField = field;
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
      warnings.push(`Unknown content mode value: "${contentModeValue}" from field "${rawKeysUsed.contentModeField}"`);
    }
  } else {
    warnings.push(`No content mode field found (checked: ${contentTypeFields.join(", ")})`);
    // Log available keys for debugging
    const topLevelKeys = Object.keys(raw).slice(0, 20);
    warnings.push(`Available top-level keys: ${topLevelKeys.join(", ")}`);
  }

  // Playlist ID and Name
  let playlistId: string | null = null;
  let playlistName: string | null = null;
  
  if (contentMode === "playlist" || contentMode === "unknown") {
    // Check multiple fields for playlist ID
    const playlistIdFields = ["default_playlist", "playlist_id", "playlist", "assigned_playlist"];
    for (const field of playlistIdFields) {
      const val = raw[field];
      if (val !== undefined && val !== null) {
        if (typeof val === "object" && val.id) {
          playlistId = String(val.id);
          playlistName = val.name || null;
          rawKeysUsed.playlistIdField = `${field}.id`;
        } else if (typeof val === "number" || typeof val === "string") {
          playlistId = String(val);
          rawKeysUsed.playlistIdField = field;
        }
        break;
      }
    }
    
    // Try to get playlist name from separate field
    if (!playlistName) {
      playlistName = raw.default_playlist_name || raw.playlist_name || null;
    }
  }

  // Layout ID and Name
  let layoutId: string | null = null;
  let layoutName: string | null = null;
  
  if (contentMode === "layout" || contentMode === "unknown") {
    // Check multiple fields for layout
    const layoutFields = ["layout", "current_layout", "assigned_layout", "default_layout"];
    for (const field of layoutFields) {
      const val = raw[field];
      if (val !== undefined && val !== null) {
        if (typeof val === "object" && val.id) {
          layoutId = String(val.id);
          layoutName = val.name || null;
          rawKeysUsed.layoutIdField = `${field}.id`;
          rawKeysUsed.layoutNameField = `${field}.name`;
        }
        break;
      }
    }
    
    // If no nested layout object, try default_playlist as layout ID (when mode is layout)
    if (!layoutId && contentMode === "layout") {
      const dpFields = ["default_playlist", "layout_id"];
      for (const field of dpFields) {
        const val = raw[field];
        if (val !== undefined && val !== null && (typeof val === "number" || typeof val === "string")) {
          layoutId = String(val);
          rawKeysUsed.layoutIdField = field;
          break;
        }
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

  // Log content mode fields specifically
  const modeFields = ["default_playlist_type", "content_type", "playlist_type", "mode"];
  const modeValues: string[] = [];
  for (const field of modeFields) {
    if (raw[field] !== undefined) {
      modeValues.push(`${field}="${raw[field]}"`);
    }
  }
  if (modeValues.length > 0) {
    console.log(`${prefix} Mode fields found: ${modeValues.join(", ")}`);
  } else {
    console.log(`${prefix} WARNING: No mode fields found!`);
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
