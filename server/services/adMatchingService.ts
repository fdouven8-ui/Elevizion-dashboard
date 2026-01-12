/**
 * Ad Matching Service
 * Automatically matches ads (yodeck creatives) to advertisers based on name similarity
 */

export interface MatchResult {
  advertiserId: string | null;
  matchType: 'auto' | 'suggested' | 'manual' | 'none';
  confidence: number;
  advertiserName?: string;
}

/**
 * Normalize a string for matching:
 * - lowercase
 * - remove file extensions
 * - remove common suffixes/prefixes
 * - remove numbers and special characters
 * - trim whitespace
 */
function normalizeForMatching(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.(mp4|mov|avi|mkv|webm|jpg|jpeg|png|gif|webp)$/i, '') // Remove file extensions
    .replace(/[-_]+/g, ' ') // Replace dashes/underscores with spaces
    .replace(/\b(video|ad|commercial|reclame|advertentie|v\d+|final|draft)\b/gi, '') // Remove common terms
    .replace(/\d+/g, '') // Remove numbers
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses a combination of techniques for robust matching
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeForMatching(str1);
  const s2 = normalizeForMatching(str2);
  
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer * 0.95; // High confidence but not perfect
  }
  
  // Check word overlap
  const words1 = new Set(s1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(s2.split(' ').filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let matchingWords = 0;
  for (const word of words1) {
    for (const word2 of words2) {
      if (word === word2 || word.includes(word2) || word2.includes(word)) {
        matchingWords++;
        break;
      }
    }
  }
  
  const overlapScore = matchingWords / Math.max(words1.size, words2.size);
  return overlapScore * 0.85; // Cap at 0.85 for word overlap matches
}

interface Advertiser {
  id: string;
  companyName: string;
  name?: string; // Fallback if companyName is empty
}

/**
 * Get the display name for an advertiser (prefers companyName, falls back to name)
 */
function getAdvertiserDisplayName(advertiser: Advertiser): string {
  return advertiser.companyName || advertiser.name || '';
}

/**
 * Find the best matching advertiser for an ad name
 */
export function findBestMatch(adName: string, advertisers: Advertiser[]): MatchResult {
  if (!adName || advertisers.length === 0) {
    return { advertiserId: null, matchType: 'none', confidence: 0 };
  }
  
  const matches: Array<{ advertiser: Advertiser; score: number }> = [];
  
  for (const advertiser of advertisers) {
    const displayName = getAdvertiserDisplayName(advertiser);
    if (!displayName) continue; // Skip advertisers without a name
    const score = calculateSimilarity(adName, displayName);
    if (score > 0.3) { // Minimum threshold
      matches.push({ advertiser, score });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  if (matches.length === 0) {
    return { advertiserId: null, matchType: 'none', confidence: 0 };
  }
  
  const bestMatch = matches[0];
  
  // Auto-match if confidence > 0.75 and clear winner
  if (bestMatch.score >= 0.75) {
    const hasCloseSecond = matches.length > 1 && matches[1].score > bestMatch.score * 0.9;
    if (!hasCloseSecond) {
      return {
        advertiserId: bestMatch.advertiser.id,
        matchType: 'auto',
        confidence: bestMatch.score,
        advertiserName: bestMatch.advertiser.companyName,
      };
    }
  }
  
  // Suggested match if score > 0.5
  if (bestMatch.score >= 0.5) {
    return {
      advertiserId: null, // Not auto-linked
      matchType: 'suggested',
      confidence: bestMatch.score,
      advertiserName: bestMatch.advertiser.companyName,
    };
  }
  
  // No confident match
  return { advertiserId: null, matchType: 'none', confidence: 0 };
}

/**
 * Get suggested matches for an ad (returns top 5 candidates)
 */
export function getSuggestedMatches(adName: string, advertisers: Advertiser[]): Array<{ advertiser: Advertiser; score: number }> {
  const matches: Array<{ advertiser: Advertiser; score: number }> = [];
  
  for (const advertiser of advertisers) {
    const displayName = getAdvertiserDisplayName(advertiser);
    if (!displayName) continue;
    const score = calculateSimilarity(adName, displayName);
    if (score > 0.2) {
      matches.push({ advertiser, score });
    }
  }
  
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}
