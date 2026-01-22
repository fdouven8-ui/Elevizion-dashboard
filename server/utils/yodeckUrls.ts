/**
 * Utility functions for generating Yodeck dashboard URLs
 * These URLs allow users to open resources directly in the Yodeck web interface
 */

const YODECK_BASE_URL = "https://app.yodeck.com";

export function getMediaUrl(mediaId: number | string): string {
  return `${YODECK_BASE_URL}/main/media/${mediaId}`;
}

export function getPlaylistUrl(playlistId: number | string): string {
  return `${YODECK_BASE_URL}/main/playlists/${playlistId}`;
}

export function getScreenUrl(screenId: number | string): string {
  return `${YODECK_BASE_URL}/main/screens/${screenId}`;
}

export function getTagUrl(tagId: number | string): string {
  return `${YODECK_BASE_URL}/main/tags/${tagId}`;
}

export function getWorkspaceUrl(): string {
  return `${YODECK_BASE_URL}/main/dashboard`;
}

export interface YodeckResourceUrls {
  media?: string;
  playlist?: string;
  screen?: string;
}

export function generateResourceUrls(resources: {
  mediaId?: number | string | null;
  playlistId?: number | string | null;
  screenId?: number | string | null;
}): YodeckResourceUrls {
  const urls: YodeckResourceUrls = {};
  
  if (resources.mediaId) {
    urls.media = getMediaUrl(resources.mediaId);
  }
  if (resources.playlistId) {
    urls.playlist = getPlaylistUrl(resources.playlistId);
  }
  if (resources.screenId) {
    urls.screen = getScreenUrl(resources.screenId);
  }
  
  return urls;
}
