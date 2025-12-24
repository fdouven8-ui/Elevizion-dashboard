/**
 * Media Classifier Service
 * Classifies Yodeck media items as 'ad' or 'non_ad' based on name patterns and media type
 */

// Default patterns for non-ad content (case-insensitive)
const NON_AD_NAME_PATTERNS = [
  'nos',
  'nieuws',
  'weer',
  'weather',
  'buienradar',
  'radar',
  'forecast',
  'clock',
  'klok',
  'tijd',
  'rss',
  'feed',
  'sport',
  'widget',
  'temperature',
  'date',
  'time',
  'countdown',
  'kalender',
  'calendar',
  'agenda',
  'tv guide',
  'menu',
  'openingstijden',
  'opening hours',
  'logo',
  'branding',
];

// Media types that are ALWAYS non-ad content (utility widgets only)
const NON_AD_MEDIA_TYPES = [
  'clock',
  'rss',
  'weather',
  'text',
  'ticker',
  'playlist', // playlists themselves are containers, not ads
];

// Media types that COULD be ads (wrappers that often contain ads)
const POTENTIAL_AD_MEDIA_TYPES = [
  'app',
  'webview',
  'web',
  'html',
  'widget', // widgets can be either ads or utility - check name patterns
];

export type MediaCategory = 'ad' | 'non_ad';

export interface ClassifiedMediaItem {
  id: number;
  name: string;
  type: string;
  mediaType?: string;
  duration?: number;
  category: MediaCategory;
}

export interface ClassificationResult {
  adsCount: number;
  nonAdsCount: number;
  adsTopItems: string[];
  classifiedMediaItems: ClassifiedMediaItem[];
}

/**
 * Classify a single media item based on its name and media type
 * @param name - The name of the media item
 * @param mediaType - Optional media type (video, image, widget, app, etc.)
 * 
 * Classification priority:
 * 1. Check name patterns first (most reliable)
 * 2. Check if media type is ALWAYS non-ad (clock, rss, weather, etc.)
 * 3. For video/image/app/webview, assume ad unless name matches non-ad pattern
 * 4. Unknown types default to 'ad' (safer for tracking)
 */
export function classifyMediaItem(name: string, mediaType?: string): MediaCategory {
  const lowerName = name.toLowerCase();
  const lowerType = (mediaType || '').toLowerCase();
  
  // First check name patterns - this is the most reliable signal
  for (const pattern of NON_AD_NAME_PATTERNS) {
    if (lowerName.includes(pattern)) {
      return 'non_ad';
    }
  }
  
  // Check if media type is ALWAYS non-ad (utility widgets)
  for (const pattern of NON_AD_MEDIA_TYPES) {
    if (lowerType.includes(pattern)) {
      return 'non_ad';
    }
  }
  
  // For video, image, or potential ad types (app/webview/widget) - treat as ad
  // These are likely commercial content
  const adTypes = ['video', 'image', 'media', ...POTENTIAL_AD_MEDIA_TYPES];
  for (const adType of adTypes) {
    if (lowerType.includes(adType)) {
      return 'ad';
    }
  }
  
  // Unknown type - default to 'ad' to avoid missing potential ads
  // This is safer as unlinked ads will show in the dashboard for review
  return 'ad';
}

/**
 * Classify all media items in a content summary
 */
export function classifyMediaItems(
  mediaItems: Array<{ id?: number; name: string; type?: string; mediaType?: string; duration?: number }>
): ClassificationResult {
  const classifiedItems: ClassifiedMediaItem[] = mediaItems.map(item => ({
    id: item.id || 0,
    name: item.name,
    type: item.type || 'media',
    mediaType: item.mediaType,
    duration: item.duration,
    category: classifyMediaItem(item.name, item.type || item.mediaType),
  }));

  const ads = classifiedItems.filter(item => item.category === 'ad');
  const nonAds = classifiedItems.filter(item => item.category === 'non_ad');

  return {
    adsCount: ads.length,
    nonAdsCount: nonAds.length,
    adsTopItems: ads.slice(0, 5).map(item => item.name),
    classifiedMediaItems: classifiedItems,
  };
}

/**
 * Get ads and non-ads counts from a content summary
 */
export function getAdsCounts(
  contentSummary: any
): { adsCount: number; nonAdsCount: number; adsTopItems: string[] } {
  if (!contentSummary?.mediaItems || !Array.isArray(contentSummary.mediaItems)) {
    return { adsCount: 0, nonAdsCount: 0, adsTopItems: [] };
  }

  const result = classifyMediaItems(contentSummary.mediaItems);
  return {
    adsCount: result.adsCount,
    nonAdsCount: result.nonAdsCount,
    adsTopItems: result.adsTopItems,
  };
}
