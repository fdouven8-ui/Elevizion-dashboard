/**
 * Centralized Region Configuration
 * 
 * Used consistently across:
 * - /start UI (region selection)
 * - Dashboard advertiser detail
 * - Placement engine hard constraints
 */

export interface RegionOption {
  code: string;
  label: string;
}

export const REGIONS: RegionOption[] = [
  { code: "LB", label: "Limburg" },
  { code: "NB", label: "Noord-Brabant" },
  { code: "GE", label: "Gelderland" },
  { code: "ZH", label: "Zuid-Holland" },
  { code: "NH", label: "Noord-Holland" },
  { code: "UT", label: "Utrecht" },
  { code: "OV", label: "Overijssel" },
  { code: "DR", label: "Drenthe" },
  { code: "GR", label: "Groningen" },
  { code: "FR", label: "Friesland" },
  { code: "FL", label: "Flevoland" },
  { code: "ZE", label: "Zeeland" },
];

export const REGION_CODES = REGIONS.map(r => r.code);

export function getRegionLabel(code: string): string {
  const region = REGIONS.find(r => r.code === code);
  return region?.label || code;
}

export function getRegionLabels(codes: string[]): string[] {
  return codes.map(getRegionLabel);
}

/**
 * Business Categories for advertiser classification
 * Used for:
 * - Placement engine category matching
 * - Default competitor group
 */
export interface BusinessCategory {
  code: string;
  label: string;
  description?: string;
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { code: "barber", label: "Kapper / Barbershop", description: "Kapperszaken en barbershops" },
  { code: "gym", label: "Sportschool / Fitness", description: "Fitnesscentra en sportscholen" },
  { code: "horeca", label: "Horeca", description: "Restaurants, cafés en eetgelegenheden" },
  { code: "retail", label: "Retail / Winkel", description: "Winkels en detailhandel" },
  { code: "beauty", label: "Schoonheidssalon", description: "Schoonheids- en nagelsalons" },
  { code: "auto", label: "Auto / Garage", description: "Autobedrijven en garages" },
  { code: "medical", label: "Medisch / Zorg", description: "Huisarts, tandarts, fysiotherapie" },
  { code: "financial", label: "Financieel", description: "Accountants, verzekeringen, hypotheken" },
  { code: "real_estate", label: "Vastgoed / Makelaardij", description: "Makelaars en vastgoedbedrijven" },
  { code: "food", label: "Food / Afhaal", description: "Pizzeria, snackbar, afhaalrestaurants" },
  { code: "services", label: "Dienstverlening", description: "Overige zakelijke diensten" },
  { code: "other", label: "Overig", description: "Overige categorieën" },
];

export const BUSINESS_CATEGORY_CODES = BUSINESS_CATEGORIES.map(c => c.code);

export function getBusinessCategoryLabel(code: string): string {
  const cat = BUSINESS_CATEGORIES.find(c => c.code === code);
  return cat?.label || code;
}
