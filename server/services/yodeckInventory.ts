/**
 * Yodeck Content Inventory Service
 * 
 * Resolves the full content hierarchy for all Yodeck screens:
 * - Screens → screen_content (playlist/layout/schedule/tagbased-playlist)
 * - Playlists → items (media/widget/nested playlists/layouts)
 * - Layouts → regions (media/widget/playlists)
 * - Schedules → events + filler_content
 * - Tagbased Playlists → media by tags filter
 * 
 * Uses the YodeckClient for all API calls with caching, rate limiting, and pagination.
 */

import {
  YodeckClient,
  YodeckScreen,
  YodeckMedia,
  getYodeckClient,
  clearYodeckClient,
} from "./yodeckClient";

export interface ResolvedContent {
  mediaIds: number[];
  widgetCount: number;
  totalPlaylistItems: number;
  nestedPlaylistCount: number;
  nestedLayoutCount: number;
}

export interface MediaDetail {
  id: number;
  name: string;
  type: "image" | "video" | "audio" | "document" | "webpage" | "other";
  file_extension?: string;
  folder?: string;
  tags?: string[];
}

export interface ScreenInventory {
  screenId: number;
  name: string;
  tags?: string[];
  workspaceId?: number;
  workspaceName?: string;
  screen_content: {
    source_type: string | null;
    source_id: number | null;
    source_name: string | null;
  } | null;
  counts: {
    totalPlaylistItems: number;
    mediaItemsTotal: number;
    uniqueMediaIds: number;
    widgetItemsTotal: number;
  };
  mediaBreakdown: {
    video: number;
    image: number;
    audio: number;
    document: number;
    webpage: number;
    other: number;
  };
  topMedia: MediaDetail[];
}

export interface InventoryResult {
  generatedAt: string;
  screens: ScreenInventory[];
  totals: {
    screens: number;
    totalItemsAllScreens: number;
    totalMediaAllScreens: number;
    uniqueMediaAcrossAllScreens: number;
    topMediaByScreens: Array<{ mediaId: number; name: string; screenCount: number }>;
    topSourcesByUsage: Array<{ sourceType: string; sourceName: string; screenCount: number }>;
  };
}

function normalizeMediaType(media: YodeckMedia): MediaDetail["type"] {
  const type = media.media_origin?.type?.toLowerCase();
  switch (type) {
    case "image": return "image";
    case "video": return "video";
    case "audio": return "audio";
    case "document": return "document";
    case "webpage": return "webpage";
    default: return "other";
  }
}

function mediaToDetail(media: YodeckMedia): MediaDetail {
  return {
    id: media.id,
    name: media.name,
    type: normalizeMediaType(media),
    file_extension: media.file_extension,
    folder: media.parent_folder?.name,
    tags: media.tags,
  };
}

class InventoryResolver {
  private client: YodeckClient;
  private mediaIndex: Map<number, YodeckMedia> = new Map();
  private visitedPlaylists = new Set<number>();
  private visitedLayouts = new Set<number>();

  constructor(client: YodeckClient) {
    this.client = client;
  }

  async initialize(): Promise<void> {
    this.mediaIndex = await this.client.getMediaIndex();
  }

  resetVisited(): void {
    this.visitedPlaylists.clear();
    this.visitedLayouts.clear();
  }

  private getMediaDetail(mediaId: number): MediaDetail | null {
    const media = this.mediaIndex.get(mediaId);
    if (!media) return null;
    return mediaToDetail(media);
  }

  async resolvePlaylist(playlistId: number): Promise<ResolvedContent> {
    if (this.visitedPlaylists.has(playlistId)) {
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }
    this.visitedPlaylists.add(playlistId);

    const playlist = await this.client.getPlaylist(playlistId);
    if (!playlist) {
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }

    const result: ResolvedContent = {
      mediaIds: [],
      widgetCount: 0,
      totalPlaylistItems: playlist.items?.length || 0,
      nestedPlaylistCount: 0,
      nestedLayoutCount: 0,
    };

    for (const item of playlist.items || []) {
      const itemType = item.type?.toLowerCase();

      switch (itemType) {
        case "media":
          if (item.id) result.mediaIds.push(item.id);
          break;
        case "widget":
          result.widgetCount++;
          break;
        case "playlist":
          if (item.id) {
            result.nestedPlaylistCount++;
            const nested = await this.resolvePlaylist(item.id);
            result.mediaIds.push(...nested.mediaIds);
            result.widgetCount += nested.widgetCount;
            result.totalPlaylistItems += nested.totalPlaylistItems;
          }
          break;
        case "layout":
          if (item.id) {
            result.nestedLayoutCount++;
            const layoutContent = await this.resolveLayout(item.id);
            result.mediaIds.push(...layoutContent.mediaIds);
            result.widgetCount += layoutContent.widgetCount;
          }
          break;
        case "tagbased-playlist":
        case "tagbased_playlist":
          if (item.id) {
            const tagbasedContent = await this.resolveTagbasedPlaylist(item.id);
            result.mediaIds.push(...tagbasedContent.mediaIds);
          }
          break;
        default:
          console.log(`[InventoryResolver] Unknown playlist item type: ${itemType}`);
      }
    }

    return result;
  }

  async resolveLayout(layoutId: number): Promise<ResolvedContent> {
    if (this.visitedLayouts.has(layoutId)) {
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }
    this.visitedLayouts.add(layoutId);

    const layout = await this.client.getLayout(layoutId);
    if (!layout) {
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }

    const result: ResolvedContent = {
      mediaIds: [],
      widgetCount: 0,
      totalPlaylistItems: 0,
      nestedPlaylistCount: 0,
      nestedLayoutCount: 0,
    };

    for (const region of layout.regions || []) {
      if (!region.item) continue;

      const itemType = region.item.type?.toLowerCase();
      const resourceId = region.item.id;

      switch (itemType) {
        case "media":
          result.mediaIds.push(resourceId);
          break;
        case "widget":
          result.widgetCount++;
          break;
        case "playlist":
          const playlistContent = await this.resolvePlaylist(resourceId);
          result.mediaIds.push(...playlistContent.mediaIds);
          result.widgetCount += playlistContent.widgetCount;
          result.totalPlaylistItems += playlistContent.totalPlaylistItems;
          result.nestedPlaylistCount++;
          break;
        case "layout":
          const nestedLayout = await this.resolveLayout(resourceId);
          result.mediaIds.push(...nestedLayout.mediaIds);
          result.widgetCount += nestedLayout.widgetCount;
          result.nestedLayoutCount++;
          break;
        case "tagbased-playlist":
        case "tagbased_playlist":
          const tagbasedContent = await this.resolveTagbasedPlaylist(resourceId);
          result.mediaIds.push(...tagbasedContent.mediaIds);
          break;
      }
    }

    if (layout.background_audio?.item) {
      const bgItem = layout.background_audio.item;
      if (bgItem.type === "widget") {
        result.widgetCount++;
      } else if (bgItem.type === "media") {
        result.mediaIds.push(bgItem.id);
      }
    }

    return result;
  }

  async resolveSchedule(scheduleId: number): Promise<ResolvedContent> {
    const schedule = await this.client.getSchedule(scheduleId);
    if (!schedule) {
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }

    const result: ResolvedContent = {
      mediaIds: [],
      widgetCount: 0,
      totalPlaylistItems: 0,
      nestedPlaylistCount: 0,
      nestedLayoutCount: 0,
    };

    for (const event of schedule.events || []) {
      if (!event.source) continue;

      const sourceType = event.source.source_type?.toLowerCase();
      const sourceId = event.source.source_id;

      if (sourceType === "playlist" && sourceId) {
        const playlistContent = await this.resolvePlaylist(sourceId);
        result.mediaIds.push(...playlistContent.mediaIds);
        result.widgetCount += playlistContent.widgetCount;
        result.totalPlaylistItems += playlistContent.totalPlaylistItems;
      } else if (sourceType === "layout" && sourceId) {
        const layoutContent = await this.resolveLayout(sourceId);
        result.mediaIds.push(...layoutContent.mediaIds);
        result.widgetCount += layoutContent.widgetCount;
      }
    }

    if (schedule.filler_content) {
      const fillerType = schedule.filler_content.source_type?.toLowerCase();
      const fillerId = schedule.filler_content.source_id;

      if (fillerType === "playlist" && fillerId) {
        const playlistContent = await this.resolvePlaylist(fillerId);
        result.mediaIds.push(...playlistContent.mediaIds);
        result.widgetCount += playlistContent.widgetCount;
        result.totalPlaylistItems += playlistContent.totalPlaylistItems;
      } else if (fillerType === "layout" && fillerId) {
        const layoutContent = await this.resolveLayout(fillerId);
        result.mediaIds.push(...layoutContent.mediaIds);
        result.widgetCount += layoutContent.widgetCount;
      }
    }

    return result;
  }

  async resolveTagbasedPlaylist(tagbasedId: number, fallbackWorkspaceId?: number): Promise<ResolvedContent> {
    const tagbased = await this.client.getTagbasedPlaylist(tagbasedId);
    if (!tagbased) {
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }

    const result: ResolvedContent = {
      mediaIds: [],
      widgetCount: 0,
      totalPlaylistItems: 0,
      nestedPlaylistCount: 0,
      nestedLayoutCount: 0,
    };

    const tagNames = (tagbased.tags || []).map(t => t.name);
    if (tagNames.length === 0) {
      return result;
    }

    const workspaceIds = (tagbased.workspaces || []).map(w => w.id);
    if (workspaceIds.length === 0 && fallbackWorkspaceId) {
      workspaceIds.push(fallbackWorkspaceId);
    }

    for (const workspaceId of workspaceIds) {
      const mediaList = await this.client.getMediaByTags(workspaceId, tagNames);
      for (const media of mediaList) {
        const isExcluded = tagbased.excludes?.media?.includes(media.id);
        if (!isExcluded) {
          result.mediaIds.push(media.id);
        }
      }
    }

    return result;
  }

  async resolveScreenContent(
    sourceType: string,
    sourceId: number,
    workspaceId?: number
  ): Promise<ResolvedContent> {
    this.resetVisited();

    const type = sourceType.toLowerCase().replace("_", "-");

    switch (type) {
      case "playlist":
        return this.resolvePlaylist(sourceId);
      case "layout":
        return this.resolveLayout(sourceId);
      case "schedule":
        return this.resolveSchedule(sourceId);
      case "tagbased-playlist":
        return this.resolveTagbasedPlaylist(sourceId, workspaceId);
      default:
        console.log(`[InventoryResolver] Unknown source type: ${sourceType}`);
        return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
    }
  }

  getMediaDetails(mediaIds: number[]): MediaDetail[] {
    const details: MediaDetail[] = [];
    for (const id of mediaIds) {
      const detail = this.getMediaDetail(id);
      if (detail) details.push(detail);
    }
    return details;
  }
}

export async function buildContentInventory(workspaceId?: number): Promise<InventoryResult> {
  const client = await getYodeckClient();
  if (!client) {
    throw new Error("Yodeck API key not configured");
  }

  console.log("[YodeckInventory] Starting inventory build...");

  const resolver = new InventoryResolver(client);
  await resolver.initialize();

  let screens = await client.getScreens();

  if (workspaceId) {
    screens = screens.filter(s => s.workspace?.id === workspaceId);
  }

  const screenInventories: ScreenInventory[] = [];
  const allMediaIds = new Set<number>();
  const mediaScreenCount = new Map<number, number>();
  const sourceUsage = new Map<string, { name: string; type: string; count: number }>();

  for (const screen of screens) {
    const screenDetail = await client.getScreen(screen.id);
    const screenContent = screenDetail?.screen_content || screen.screen_content || null;

    let resolved: ResolvedContent = {
      mediaIds: [],
      widgetCount: 0,
      totalPlaylistItems: 0,
      nestedPlaylistCount: 0,
      nestedLayoutCount: 0,
    };

    if (screenContent?.source_type && screenContent?.source_id) {
      resolved = await resolver.resolveScreenContent(
        screenContent.source_type,
        screenContent.source_id,
        screen.workspace?.id
      );

      const sourceKey = `${screenContent.source_type}:${screenContent.source_id}`;
      const existing = sourceUsage.get(sourceKey);
      if (existing) {
        existing.count++;
      } else {
        sourceUsage.set(sourceKey, {
          name: screenContent.source_name || `${screenContent.source_type} ${screenContent.source_id}`,
          type: screenContent.source_type,
          count: 1,
        });
      }
    }

    const uniqueMediaIds = Array.from(new Set(resolved.mediaIds));

    for (const mediaId of uniqueMediaIds) {
      allMediaIds.add(mediaId);
      mediaScreenCount.set(mediaId, (mediaScreenCount.get(mediaId) || 0) + 1);
    }

    const mediaDetails = resolver.getMediaDetails(uniqueMediaIds);
    const mediaBreakdown = { video: 0, image: 0, audio: 0, document: 0, webpage: 0, other: 0 };

    for (const detail of mediaDetails) {
      mediaBreakdown[detail.type]++;
    }

    const topMedia = mediaDetails.slice(0, 10);

    screenInventories.push({
      screenId: screen.id,
      name: screen.name,
      tags: screenDetail?.tags || screen.tags,
      workspaceId: screen.workspace?.id,
      workspaceName: screen.workspace?.name,
      screen_content: screenContent ? {
        source_type: screenContent.source_type,
        source_id: screenContent.source_id,
        source_name: screenContent.source_name,
      } : null,
      counts: {
        totalPlaylistItems: resolved.totalPlaylistItems,
        mediaItemsTotal: resolved.mediaIds.length,
        uniqueMediaIds: uniqueMediaIds.length,
        widgetItemsTotal: resolved.widgetCount,
      },
      mediaBreakdown,
      topMedia,
    });

    console.log(`[YodeckInventory] Screen "${screen.name}": ${uniqueMediaIds.length} unique media, ${resolved.widgetCount} widgets`);
  }

  const totalItemsAllScreens = screenInventories.reduce((sum, s) => sum + s.counts.totalPlaylistItems, 0);
  const totalMediaAllScreens = screenInventories.reduce((sum, s) => sum + s.counts.mediaItemsTotal, 0);

  const topMediaByScreens = Array.from(mediaScreenCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([mediaId, screenCount]) => {
      const details = resolver.getMediaDetails([mediaId]);
      return {
        mediaId,
        name: details[0]?.name || `Media ${mediaId}`,
        screenCount,
      };
    });

  const topSourcesByUsage = Array.from(sourceUsage.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(s => ({
      sourceType: s.type,
      sourceName: s.name,
      screenCount: s.count,
    }));

  const result: InventoryResult = {
    generatedAt: new Date().toISOString(),
    screens: screenInventories,
    totals: {
      screens: screenInventories.length,
      totalItemsAllScreens,
      totalMediaAllScreens,
      uniqueMediaAcrossAllScreens: allMediaIds.size,
      topMediaByScreens,
      topSourcesByUsage,
    },
  };

  console.log(`[YodeckInventory] Inventory complete: ${result.totals.screens} screens, ${result.totals.uniqueMediaAcrossAllScreens} unique media`);

  return result;
}

export async function refreshInventory(): Promise<InventoryResult> {
  console.log("[YodeckInventory] Refreshing inventory (clearing caches)...");
  clearYodeckClient();
  return buildContentInventory();
}
