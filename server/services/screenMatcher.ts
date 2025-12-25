/**
 * Screen Matching Engine
 * 
 * Matches Yodeck screens to Moneybird contacts based on name similarity.
 * Used for auto-enriching screen/location data with contact details.
 */

import type { MoneybirdContact, Screen, Location } from "@shared/schema";

export interface MatchResult {
  moneybirdContactId: string;
  contactName: string;
  confidence: "auto_exact" | "auto_fuzzy" | "needs_review";
  score: number;
  reason: string;
}

export interface ScreenMatchSuggestion {
  screen: {
    id: string;
    screenId: string;
    name: string;
    yodeckPlayerName: string | null;
    locationId: string;
    locationName: string;
  };
  currentMatch: {
    confidence: string | null;
    reason: string | null;
    moneybirdContactId: string | null;
  } | null;
  suggestions: MatchResult[];
  status: "unmapped" | "auto_mapped" | "manually_mapped" | "needs_review";
}

/**
 * Normalize a name for matching:
 * - Lowercase
 * - Remove common suffixes (bv., B.V., B.V, etc.)
 * - Remove punctuation except spaces
 * - Remove "'s" possessive
 * - Remove city names from the end
 * - Trim whitespace
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  
  let normalized = name.toLowerCase();
  
  // Remove common business suffixes
  normalized = normalized.replace(/\s*(b\.?v\.?|bv|v\.?o\.?f\.?|vof|eenmanszaak|holding)\s*$/gi, "");
  
  // Remove possessive 's
  normalized = normalized.replace(/'s\b/g, "");
  normalized = normalized.replace(/[''']s\b/g, "");
  
  // Remove punctuation (keep letters, numbers, spaces)
  normalized = normalized.replace(/[^\w\s]/g, " ");
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ");
  
  // Trim
  normalized = normalized.trim();
  
  return normalized;
}

/**
 * Remove common city names from the end of a business name
 */
export function removeCitySuffix(name: string, cityName?: string): string {
  let result = name;
  
  // If we know the city, remove it
  if (cityName) {
    const cityNormalized = cityName.toLowerCase().trim();
    const cityPattern = new RegExp(`\\s+${cityNormalized}\\s*$`, "i");
    result = result.replace(cityPattern, "");
  }
  
  // Common Dutch city names that might appear in business names
  const commonCities = [
    "amsterdam", "rotterdam", "utrecht", "eindhoven", "tilburg",
    "groningen", "almere", "breda", "nijmegen", "enschede",
    "haarlem", "arnhem", "maastricht", "maasbracht", "roermond",
    "venlo", "sittard", "heerlen", "weert", "den haag", "den bosch"
  ];
  
  for (const city of commonCities) {
    const cityPattern = new RegExp(`\\s+${city}\\s*$`, "i");
    result = result.replace(cityPattern, "");
  }
  
  return result.trim();
}

/**
 * Calculate similarity score between two normalized names (0-100)
 */
export function calculateSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;
  if (name1 === name2) return 100;
  
  // Exact match after normalization
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  
  if (n1 === n2) return 100;
  
  // Remove city suffix and compare
  const n1NoCity = removeCitySuffix(n1);
  const n2NoCity = removeCitySuffix(n2);
  
  if (n1NoCity === n2NoCity && n1NoCity.length > 3) return 95;
  
  // One contains the other
  if (n1NoCity.includes(n2NoCity) && n2NoCity.length > 5) {
    return 85;
  }
  if (n2NoCity.includes(n1NoCity) && n1NoCity.length > 5) {
    return 85;
  }
  
  // Word-based matching
  const words1 = n1NoCity.split(" ").filter(w => w.length > 2);
  const words2 = n2NoCity.split(" ").filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Count matching words
  const matchingWords = words1.filter(w => words2.includes(w));
  const wordScore = (matchingWords.length * 2) / (words1.length + words2.length) * 100;
  
  // Check for key word matches (first significant word)
  const keyWord1 = words1[0];
  const keyWord2 = words2[0];
  const keyWordMatch = keyWord1 === keyWord2;
  
  if (keyWordMatch && wordScore >= 50) {
    return Math.min(90, wordScore + 20);
  }
  
  return Math.round(wordScore);
}

/**
 * Find matching Moneybird contacts for a screen
 */
export function findMatchesForScreen(
  screenName: string | null,
  yodeckPlayerName: string | null,
  contacts: MoneybirdContact[]
): MatchResult[] {
  const results: MatchResult[] = [];
  
  // Use yodeckPlayerName first, then screen name
  const primaryName = yodeckPlayerName || screenName || "";
  if (!primaryName) return results;
  
  const normalizedScreenName = normalizeName(primaryName);
  const screenNameNoCity = removeCitySuffix(normalizedScreenName);
  
  for (const contact of contacts) {
    const contactDisplayName = contact.companyName || 
      [contact.firstname, contact.lastname].filter(Boolean).join(" ") || 
      "";
    
    if (!contactDisplayName) continue;
    
    // Calculate similarity
    const score = calculateSimilarity(primaryName, contactDisplayName);
    
    if (score >= 70) {
      let confidence: "auto_exact" | "auto_fuzzy" | "needs_review";
      let reason: string;
      
      if (score >= 95) {
        confidence = "auto_exact";
        reason = `Exacte match: "${contactDisplayName}"`;
      } else if (score >= 85) {
        confidence = "auto_fuzzy";
        reason = `Sterke overeenkomst (${score}%): "${contactDisplayName}"`;
      } else {
        confidence = "needs_review";
        reason = `Mogelijke match (${score}%): "${contactDisplayName}"`;
      }
      
      results.push({
        moneybirdContactId: contact.moneybirdId,
        contactName: contactDisplayName,
        confidence,
        score,
        reason
      });
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Return top 5 matches
  return results.slice(0, 5);
}

/**
 * Determine the best automatic match for a screen
 * Returns null if no confident match found
 */
export function getBestAutoMatch(matches: MatchResult[]): MatchResult | null {
  if (matches.length === 0) return null;
  
  const best = matches[0];
  
  // Only auto-map if we have high confidence and it's significantly better than #2
  if (best.confidence === "auto_exact") {
    return best;
  }
  
  if (best.confidence === "auto_fuzzy") {
    // Check if there's ambiguity with second match
    if (matches.length >= 2 && matches[1].score >= best.score - 5) {
      // Too close, needs review
      return null;
    }
    return best;
  }
  
  return null;
}
