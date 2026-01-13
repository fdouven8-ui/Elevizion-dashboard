export interface PricingPackage {
  id: string;
  name: string;
  screens: number;
  totalPrice: number;
  perScreenPrice: number;
  badge?: string;
  features: string[];
  ctaText: string;
  ctaVariant: 'primary' | 'outline';
  isPopular?: boolean;
  isCustom?: boolean;
}

export const PRICING_PACKAGES: PricingPackage[] = [
  {
    id: 'starter',
    name: 'Starter',
    screens: 1,
    totalPrice: 49.99,
    perScreenPrice: 49.99,
    features: [
      '1 schermlocatie',
      '4x per uur zichtbaar',
      '10-15 seconden spot',
      'Klant levert video aan',
      'Min. looptijd: 6 maanden',
    ],
    ctaText: 'Start met 1 scherm',
    ctaVariant: 'primary',
  },
  {
    id: 'local-plus',
    name: 'Local Plus',
    screens: 3,
    totalPrice: 129.99,
    perScreenPrice: 43.33,
    badge: 'Populair',
    isPopular: true,
    features: [
      '3 schermlocaties',
      '6x per uur zichtbaar',
      '10-20 seconden spot',
      'Klant levert video aan',
      'Min. looptijd: 6 maanden',
    ],
    ctaText: 'Start met 3 schermen',
    ctaVariant: 'primary',
  },
  {
    id: 'premium',
    name: 'Premium',
    screens: 10,
    totalPrice: 299.99,
    perScreenPrice: 30.00,
    features: [
      '10 schermlocaties',
      '8x per uur zichtbaar',
      'Tot 30 seconden spot',
      'Klant levert video aan',
      'Breed lokaal bereik',
      'Min. looptijd: 6 maanden',
    ],
    ctaText: 'Start met 10 schermen',
    ctaVariant: 'primary',
  },
  {
    id: 'custom',
    name: 'Custom',
    screens: 0,
    totalPrice: 0,
    perScreenPrice: 0,
    isCustom: true,
    features: [
      'Meer dan 10 schermen',
      'Exclusieve locaties',
      'Volledige campagne',
      'Meerdere video\'s/ontwerpen',
      'Persoonlijke begeleiding',
    ],
    ctaText: 'Neem contact op',
    ctaVariant: 'outline',
  },
];

export function formatPriceEUR(price: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price).replace('€', '€ ').trim();
}

export function formatPerScreenPrice(pkg: PricingPackage): string {
  if (pkg.isCustom) return 'Op aanvraag';
  return formatPriceEUR(pkg.perScreenPrice);
}

export function formatTotalPrice(pkg: PricingPackage): string {
  if (pkg.isCustom) return 'Op aanvraag';
  return formatPriceEUR(pkg.totalPrice);
}

export const PRICING_CONSTANTS = {
  minTermMonths: 6,
  minTermText: 'Min. looptijd: 6 maanden',
  afterTermText: 'daarna maandelijks opzegbaar',
  videoDeliveryText: 'Klant levert video aan',
  videoDeliveryLong: 'Je levert je advertentievideo zelf aan — wij plaatsen \'m op de schermen.',
  startingPrice: 30.00,
  startingPriceText: 'Vanaf €30 per scherm / maand',
};

export function getPackageById(id: string): PricingPackage | undefined {
  return PRICING_PACKAGES.find(pkg => pkg.id === id);
}
