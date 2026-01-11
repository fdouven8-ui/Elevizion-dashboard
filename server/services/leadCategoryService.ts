/**
 * Lead Category Service
 * Auto-determine category from company name using keyword matching
 */

import { LEAD_CATEGORIES, type LeadCategory } from "@shared/schema";

// Keyword mappings for each category
const CATEGORY_KEYWORDS: Record<LeadCategory, string[]> = {
  horeca: [
    "restaurant", "café", "cafe", "bar", "eetcafe", "eetcafé", "bistro", "brasserie",
    "pizzeria", "trattoria", "lunchroom", "koffiehuis", "snackbar", "friet", "frites",
    "grill", "wok", "sushi", "hotel", "hostel", "b&b", "bed and breakfast",
    "terras", "pub", "kroeg", "disco", "club", "lounge", "kitchen", "eten", "food",
    "catering", "bakker", "bakkerij", "patisserie", "ijssalon", "gelateria"
  ],
  retail: [
    "winkel", "shop", "store", "supermarkt", "albert heijn", "ah", "jumbo", "lidl",
    "aldi", "plus", "deen", "coop", "spar", "boekhandel", "kledingwinkel", "mode",
    "fashion", "boutique", "juwelier", "optiek", "opticien", "drogist", "parfumerie",
    "speelgoed", "electronica", "mediamarkt", "coolblue", "sport", "decathlon",
    "action", "hema", "kruidvat", "trekpleister", "blokker", "xenos", "flying tiger",
    "slagerij", "vishandel", "bloemen", "plant", "tuincentrum", "bouwmarkt", "gamma",
    "praxis", "hornbach", "karwei", "meubel", "wonen", "ikea", "leen bakker"
  ],
  zorg: [
    "apotheek", "huisarts", "tandarts", "fysiotherapie", "fysio", "ziekenhuis",
    "kliniek", "praktijk", "gezondheid", "health", "care", "zorg", "verpleeg",
    "thuiszorg", "mantelzorg", "psycholoog", "therapeut", "dietist", "logopedist",
    "orthodontist", "pedicure", "podoloog", "osteopaat", "chiropractor", "acupunctuur",
    "massage", "wellness", "spa", "dierenarts", "veterinair", "huisdier"
  ],
  sport: [
    "gym", "fitness", "sportschool", "basic-fit", "anytime fitness", "fit for free",
    "sportcentrum", "zwembad", "tennisclub", "voetbal", "hockey", "basketbal",
    "volleybal", "handbal", "badminton", "squash", "padel", "golf", "bowling",
    "klimhal", "yoga", "pilates", "crossfit", "boksen", "martial arts", "kickboksen",
    "judo", "karate", "taekwondo", "dans", "ballet", "sportvereniging", "club"
  ],
  diensten: [
    "kantoor", "office", "administratie", "boekhouder", "accountant", "belasting",
    "adviseur", "consultant", "advies", "juridisch", "advocaat", "notaris",
    "makelaar", "vastgoed", "verzekering", "bank", "financieel", "hypotheek",
    "uitzendbureau", "recruitment", "hr", "it", "ict", "software", "webdesign",
    "marketing", "reclame", "media", "communicatie", "drukkerij", "print",
    "schoonmaak", "cleaning", "beveiliging", "security", "logistiek", "transport",
    "installatie", "loodgieter", "elektricien", "schilder", "aannemer", "bouw"
  ],
  automotive: [
    "garage", "auto", "autohandel", "autobedrijf", "dealer", "occasioncentrum",
    "autoservice", "apk", "bandencentrale", "band", "carwash", "wasstraat",
    "motor", "scooter", "fiets", "tweewieler", "lease", "verhuur", "rent",
    "taxi", "chauffeur", "rijschool", "rijbewijs", "bmw", "mercedes", "volkswagen",
    "audi", "toyota", "kia", "hyundai", "ford", "opel", "peugeot", "renault",
    "citroen", "fiat", "skoda", "seat", "volvo", "mazda", "honda", "nissan"
  ],
  beauty: [
    "kapper", "kapsalon", "hair", "haar", "coiffeur", "barbershop", "barber",
    "schoonheid", "beauty", "salon", "nagel", "nail", "manicure", "pedicure",
    "huid", "skin", "gezicht", "facial", "wax", "laser", "epilatie", "tattoo",
    "piercing", "permanent makeup", "wimper", "lash", "brow", "wenkbrauw",
    "zonnebank", "solarium", "tanning", "styling", "visagie", "makeup"
  ],
  overig: []
};

// Normalize text for matching
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9\s]/g, " ") // Keep only alphanumeric
    .replace(/\s+/g, " ")
    .trim();
}

interface CategoryResult {
  category: LeadCategory;
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Determine lead category from company name
 * Returns category with confidence score (0-1)
 */
export function inferLeadCategory(companyName: string, notes?: string | null): CategoryResult {
  const searchText = normalizeText(`${companyName} ${notes || ""}`);
  
  let bestMatch: CategoryResult = {
    category: "overig",
    confidence: 0.3, // Default low confidence for overig
    matchedKeywords: []
  };

  for (const category of LEAD_CATEGORIES) {
    if (category === "overig") continue;
    
    const keywords = CATEGORY_KEYWORDS[category];
    const matchedKeywords: string[] = [];
    
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (searchText.includes(normalizedKeyword)) {
        matchedKeywords.push(keyword);
      }
    }
    
    if (matchedKeywords.length > 0) {
      // Calculate confidence based on number of matches and keyword specificity
      const matchScore = Math.min(matchedKeywords.length / 3, 1); // More matches = higher confidence
      const confidence = 0.5 + (matchScore * 0.5); // Range: 0.5 - 1.0
      
      if (matchedKeywords.length > bestMatch.matchedKeywords.length ||
          (matchedKeywords.length === bestMatch.matchedKeywords.length && confidence > bestMatch.confidence)) {
        bestMatch = {
          category,
          confidence: Math.round(confidence * 100) / 100,
          matchedKeywords
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Get all available categories
 */
export function getCategories(): LeadCategory[] {
  return [...LEAD_CATEGORIES];
}

/**
 * Get display label for category (Dutch)
 */
export function getCategoryLabel(category: LeadCategory): string {
  const labels: Record<LeadCategory, string> = {
    horeca: "Horeca",
    retail: "Retail",
    zorg: "Zorg & Welzijn",
    sport: "Sport & Fitness",
    diensten: "Zakelijke Diensten",
    automotive: "Automotive",
    beauty: "Beauty & Wellness",
    overig: "Overig"
  };
  return labels[category] || category;
}
