/**
 * Yodeck API Routes
 * 
 * RESTful endpoints for Yodeck integration:
 * - GET /api/yodeck/health - Test Yodeck API connection
 * - GET /api/yodeck/screens/summary - Get all screens with media counts
 * - GET /api/yodeck/screens/:id/details - Get detailed info for single screen
 * - GET /api/yodeck/stats - Get aggregated statistics
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  YodeckClient,
  YodeckScreen,
  getYodeckClient,
  clearYodeckClient,
} from "../services/yodeckClient";
import {
  buildContentInventory,
  refreshInventory,
  ScreenInventory,
} from "../services/yodeckInventory";

const router = Router();

interface MediaItem {
  media_id: number;
  name?: string;
  type?: string;
  from: "playlist" | "layout" | "schedule" | "tagbased-playlist";
  playlist_id?: number;
  playlist_name?: string;
}

interface ScreenSummary {
  screen_id: number;
  screen_name: string;
  workspace_id?: number;
  workspace_name?: string;
  source_type: string | null;
  source_id: number | null;
  source_name?: string;
  media_count: number;
  unique_media_count: number;
  media: MediaItem[];
  playlists_resolved?: Array<{
    playlist_id: number;
    name?: string;
    media_count: number;
    unique_media_count: number;
  }>;
  warnings: string[];
}

interface ScreenDetails extends ScreenSummary {
  raw_screen_content: any;
  regions_found?: number;
  items_ignored?: string[];
  timings_ms: {
    screen_fetch: number;
    content_resolve: number;
    total: number;
  };
}

interface YodeckStats {
  total_screens: number;
  total_media_in_use: number;
  total_unique_media_in_use: number;
  top_media: Array<{ media_id: number; name: string; screen_count: number }>;
  top_playlists: Array<{ source_type: string; source_name: string; screen_count: number }>;
  errors_count: number;
  warnings_count: number;
}

const MOCK_SCREENS: ScreenSummary[] = [
  {
    screen_id: 1,
    screen_name: "Demo Screen 1",
    workspace_id: 1,
    workspace_name: "Demo Workspace",
    source_type: "playlist",
    source_id: 100,
    source_name: "Demo Playlist",
    media_count: 5,
    unique_media_count: 4,
    media: [
      { media_id: 1001, name: "Welcome Video", type: "video", from: "playlist", playlist_id: 100 },
      { media_id: 1002, name: "Promo Image 1", type: "image", from: "playlist", playlist_id: 100 },
      { media_id: 1003, name: "Promo Image 2", type: "image", from: "playlist", playlist_id: 100 },
      { media_id: 1001, name: "Welcome Video", type: "video", from: "playlist", playlist_id: 100 },
      { media_id: 1004, name: "Background Music", type: "audio", from: "playlist", playlist_id: 100 },
    ],
    playlists_resolved: [
      { playlist_id: 100, name: "Demo Playlist", media_count: 5, unique_media_count: 4 }
    ],
    warnings: [],
  },
  {
    screen_id: 2,
    screen_name: "Demo Screen 2",
    workspace_id: 1,
    workspace_name: "Demo Workspace",
    source_type: "layout",
    source_id: 200,
    source_name: "Demo Layout",
    media_count: 8,
    unique_media_count: 6,
    media: [
      { media_id: 2001, name: "Header Image", type: "image", from: "layout" },
      { media_id: 2002, name: "Main Video", type: "video", from: "layout" },
      { media_id: 2003, name: "Side Banner", type: "image", from: "layout" },
    ],
    warnings: ["region item type ignored: widget"],
  },
];

const MOCK_STATS: YodeckStats = {
  total_screens: 2,
  total_media_in_use: 13,
  total_unique_media_in_use: 10,
  top_media: [
    { media_id: 1001, name: "Welcome Video", screen_count: 1 },
    { media_id: 2002, name: "Main Video", screen_count: 1 },
  ],
  top_playlists: [
    { source_type: "playlist", source_name: "Demo Playlist", screen_count: 1 },
    { source_type: "layout", source_name: "Demo Layout", screen_count: 1 },
  ],
  errors_count: 0,
  warnings_count: 1,
};

function isMockMode(): boolean {
  return !process.env.YODECK_AUTH_TOKEN;
}

function convertInventoryToSummary(inventory: ScreenInventory): ScreenSummary {
  return {
    screen_id: inventory.screenId,
    screen_name: inventory.name,
    workspace_id: inventory.workspaceId,
    workspace_name: inventory.workspaceName,
    source_type: inventory.screen_content?.source_type || null,
    source_id: inventory.screen_content?.source_id || null,
    source_name: inventory.screen_content?.source_name || undefined,
    media_count: inventory.counts.mediaItemsTotal,
    unique_media_count: inventory.counts.uniqueMediaIds,
    media: inventory.topMedia.map(m => ({
      media_id: m.id,
      name: m.name,
      type: m.type,
      from: (inventory.screen_content?.source_type as MediaItem["from"]) || "playlist",
    })),
    warnings: [],
  };
}

/**
 * GET /api/yodeck/health
 * Test connection to Yodeck API
 */
router.get("/health", async (req: Request, res: Response) => {
  if (isMockMode()) {
    return res.json({
      ok: true,
      yodeck: true,
      mode: "mock",
      message: "Mock mode - no YODECK_AUTH_TOKEN configured",
    });
  }

  try {
    const client = await getYodeckClient();
    if (!client) {
      return res.status(503).json({
        ok: false,
        yodeck: false,
        error: "Yodeck API key not configured in integrations",
      });
    }

    const screens = await client.getScreens();
    
    return res.json({
      ok: true,
      yodeck: true,
      mode: "live",
      screens_found: screens.length,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      yodeck: false,
      error: error.message || "Failed to connect to Yodeck API",
    });
  }
});

/**
 * GET /api/yodeck/screens/summary
 * Get all screens with their media content summary
 * Query params:
 *   - refresh=1: bypass cache
 *   - workspace_id: filter by workspace
 */
router.get("/screens/summary", async (req: Request, res: Response) => {
  const refresh = req.query.refresh === "1";
  const workspaceId = req.query.workspace_id ? parseInt(req.query.workspace_id as string, 10) : undefined;

  if (isMockMode()) {
    let screens = MOCK_SCREENS;
    if (workspaceId) {
      screens = screens.filter(s => s.workspace_id === workspaceId);
    }
    return res.json({
      mode: "mock",
      screens,
      total: screens.length,
    });
  }

  try {
    const startTime = Date.now();
    
    let inventory;
    if (refresh) {
      inventory = await refreshInventory();
    } else {
      inventory = await buildContentInventory(workspaceId);
    }

    const screens: ScreenSummary[] = inventory.screens.map(convertInventoryToSummary);

    return res.json({
      mode: "live",
      screens,
      total: screens.length,
      generated_at: inventory.generatedAt,
      timing_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("[Yodeck Routes] Error fetching screens summary:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch screens",
    });
  }
});

/**
 * GET /api/yodeck/screens/:id/details
 * Get detailed info for a single screen including debug data
 */
router.get("/screens/:id/details", async (req: Request, res: Response) => {
  const screenId = parseInt(req.params.id, 10);
  
  if (isNaN(screenId) || screenId <= 0) {
    return res.status(400).json({ error: "Invalid screen ID - must be a positive number" });
  }

  if (isMockMode()) {
    const mockScreen = MOCK_SCREENS.find(s => s.screen_id === screenId);
    if (!mockScreen) {
      return res.status(404).json({ error: "Screen not found", mode: "mock" });
    }
    
    const details: ScreenDetails = {
      ...mockScreen,
      raw_screen_content: { source_type: mockScreen.source_type, source_id: mockScreen.source_id, source_name: mockScreen.source_name },
      regions_found: mockScreen.source_type === "layout" ? 3 : undefined,
      items_ignored: mockScreen.warnings.length > 0 ? ["widget"] : [],
      timings_ms: { screen_fetch: 50, content_resolve: 100, total: 150 },
    };
    
    return res.json({ mode: "mock", screen: details });
  }

  try {
    const startTime = Date.now();
    
    const client = await getYodeckClient();
    if (!client) {
      return res.status(503).json({ error: "Yodeck API not configured" });
    }

    const screenFetchStart = Date.now();
    const screen = await client.getScreen(screenId);
    const screenFetchTime = Date.now() - screenFetchStart;

    if (!screen) {
      return res.status(404).json({ error: "Screen not found in Yodeck" });
    }

    const contentResolveStart = Date.now();
    const inventory = await buildContentInventory();
    const screenInventory = inventory.screens.find(s => s.screenId === screenId);
    const contentResolveTime = Date.now() - contentResolveStart;

    if (!screenInventory) {
      return res.status(404).json({ error: "Screen not found in inventory" });
    }

    const summary = convertInventoryToSummary(screenInventory);
    
    const details: ScreenDetails = {
      ...summary,
      raw_screen_content: screen.screen_content,
      items_ignored: [],
      timings_ms: {
        screen_fetch: screenFetchTime,
        content_resolve: contentResolveTime,
        total: Date.now() - startTime,
      },
    };

    return res.json({ mode: "live", screen: details });
  } catch (error: any) {
    console.error(`[Yodeck Routes] Error fetching screen ${screenId} details:`, error);
    return res.status(500).json({ error: error.message || "Failed to fetch screen details" });
  }
});

/**
 * GET /api/yodeck/stats
 * Get aggregated statistics across all screens
 * Query params:
 *   - refresh=1: bypass cache
 */
router.get("/stats", async (req: Request, res: Response) => {
  const refresh = req.query.refresh === "1";

  if (isMockMode()) {
    return res.json({ mode: "mock", stats: MOCK_STATS });
  }

  try {
    const startTime = Date.now();
    
    let inventory;
    if (refresh) {
      inventory = await refreshInventory();
    } else {
      inventory = await buildContentInventory();
    }

    const stats: YodeckStats = {
      total_screens: inventory.totals.screens,
      total_media_in_use: inventory.totals.totalMediaAllScreens,
      total_unique_media_in_use: inventory.totals.uniqueMediaAcrossAllScreens,
      top_media: inventory.totals.topMediaByScreens.map(m => ({
        media_id: m.mediaId,
        name: m.name,
        screen_count: m.screenCount,
      })),
      top_playlists: inventory.totals.topSourcesByUsage.map(s => ({
        source_type: s.sourceType,
        source_name: s.sourceName,
        screen_count: s.screenCount,
      })),
      errors_count: 0,
      warnings_count: inventory.screens.reduce((count, s) => {
        if (!s.screen_content?.source_type) count++;
        return count;
      }, 0),
    };

    return res.json({
      mode: "live",
      stats,
      generated_at: inventory.generatedAt,
      timing_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("[Yodeck Routes] Error fetching stats:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch stats" });
  }
});

export default router;
