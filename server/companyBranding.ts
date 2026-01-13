/**
 * Company Branding - Centralized source for all company information
 * 
 * This module provides a single source of truth for company branding
 * that can be loaded from the database CompanyProfile singleton.
 * 
 * All modules should import from here rather than defining their own constants.
 */

import { storage } from "./storage";

export interface CompanyBranding {
  legalName: string;
  tradeName: string;
  email: string;
  website: string;
  kvkNumber: string;
  vatNumber: string;
  address: string;
  phone: string;
  iban: string;
  tagline: string;
  logoUrl: string;
}

// Default company info - used as fallback when database is unavailable
export const DEFAULT_COMPANY: CompanyBranding = {
  legalName: "Douven Services",
  tradeName: "Elevizion",
  email: "info@elevizion.nl",
  website: "elevizion.nl",
  kvkNumber: "90982541",
  vatNumber: "NL004857473B37",
  address: "Engelenkampstraat 11, 6131 JD Sittard",
  phone: "",
  iban: "",
  tagline: "See Your Business Grow",
  logoUrl: "https://elevizion.nl/logo-email.png",
};

// In-memory cache with TTL (1 hour)
let cachedBranding: CompanyBranding | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get company branding from database with fallback to defaults.
 * Results are cached for 1 hour to minimize database calls.
 */
export async function getCompanyBranding(): Promise<CompanyBranding> {
  const now = Date.now();
  
  // Return cached value if still valid
  if (cachedBranding && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedBranding;
  }
  
  try {
    const profile = await storage.getCompanyProfile();
    if (profile) {
      cachedBranding = {
        legalName: profile.legalName || DEFAULT_COMPANY.legalName,
        tradeName: profile.tradeName || DEFAULT_COMPANY.tradeName,
        email: profile.email || DEFAULT_COMPANY.email,
        website: profile.website || DEFAULT_COMPANY.website,
        kvkNumber: profile.kvkNumber || DEFAULT_COMPANY.kvkNumber,
        vatNumber: profile.vatNumber || DEFAULT_COMPANY.vatNumber,
        address: [
          profile.addressLine1,
          [profile.postalCode, profile.city].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ") || DEFAULT_COMPANY.address,
        phone: profile.phone || DEFAULT_COMPANY.phone,
        iban: profile.iban || DEFAULT_COMPANY.iban,
        tagline: DEFAULT_COMPANY.tagline,
        logoUrl: DEFAULT_COMPANY.logoUrl,
      };
      cacheTimestamp = now;
      return cachedBranding;
    }
  } catch (error) {
    console.error("[CompanyBranding] Error loading from database:", error);
  }
  
  // Return defaults if database unavailable
  return DEFAULT_COMPANY;
}

/**
 * Synchronous version for use in template literals.
 * Returns cached branding or defaults (does not trigger database call).
 */
export function getCompanyBrandingSync(): CompanyBranding {
  return cachedBranding || DEFAULT_COMPANY;
}

/**
 * Clear the cached branding (e.g., after admin updates the profile).
 */
export function clearBrandingCache(): void {
  cachedBranding = null;
  cacheTimestamp = 0;
}

/**
 * Pre-warm the cache (call during server startup).
 */
export async function warmBrandingCache(): Promise<void> {
  try {
    await getCompanyBranding();
  } catch {
    // Fallback to defaults on error
  }
}
