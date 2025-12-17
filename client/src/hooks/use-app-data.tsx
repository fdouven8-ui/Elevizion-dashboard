import React, { createContext, useContext, useState, useEffect } from "react";
import {
  Advertiser,
  Location,
  Screen,
  Campaign,
  Placement,
  Invoice,
  Payout,
  SEED_ADVERTISERS,
  SEED_LOCATIONS,
  SEED_SCREENS,
  SEED_CAMPAIGNS,
  SEED_PLACEMENTS,
  SEED_INVOICES,
} from "@/lib/types";

interface AppDataContextType {
  advertisers: Advertiser[];
  locations: Location[];
  screens: Screen[];
  campaigns: Campaign[];
  placements: Placement[];
  invoices: Invoice[];
  payouts: Payout[];
  
  // Actions
  addAdvertiser: (adv: Omit<Advertiser, "id" | "createdAt">) => void;
  updateAdvertiser: (id: string, adv: Partial<Advertiser>) => void;
  
  addLocation: (loc: Omit<Location, "id" | "createdAt">) => void;
  updateLocation: (id: string, loc: Partial<Location>) => void;
  
  addScreen: (scr: Omit<Screen, "id" | "createdAt" | "status" | "lastSeenAt">) => void;
  updateScreen: (id: string, scr: Partial<Screen>) => void;
  
  addCampaign: (cmp: Omit<Campaign, "id" | "createdAt">, placementData?: { screenIds: string[] }) => void;
  
  generatePayouts: (month: string) => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [advertisers, setAdvertisers] = useState<Advertiser[]>(SEED_ADVERTISERS);
  const [locations, setLocations] = useState<Location[]>(SEED_LOCATIONS);
  const [screens, setScreens] = useState<Screen[]>(SEED_SCREENS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [placements, setPlacements] = useState<Placement[]>(SEED_PLACEMENTS);
  const [invoices, setInvoices] = useState<Invoice[]>(SEED_INVOICES);
  const [payouts, setPayouts] = useState<Payout[]>([]);

  const addAdvertiser = (data: Omit<Advertiser, "id" | "createdAt">) => {
    const newAdv: Advertiser = {
      ...data,
      id: `adv_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setAdvertisers((prev) => [...prev, newAdv]);
  };

  const updateAdvertiser = (id: string, data: Partial<Advertiser>) => {
    setAdvertisers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
  };

  const addLocation = (data: Omit<Location, "id" | "createdAt">) => {
    const newLoc: Location = {
      ...data,
      id: `loc_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setLocations((prev) => [...prev, newLoc]);
  };

  const updateLocation = (id: string, data: Partial<Location>) => {
    setLocations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
  };

  const addScreen = (data: Omit<Screen, "id" | "createdAt" | "status" | "lastSeenAt">) => {
    const newScreen: Screen = {
      ...data,
      id: `scr_${Date.now()}`,
      status: "unknown",
      lastSeenAt: null,
      createdAt: new Date().toISOString(),
    };
    setScreens((prev) => [...prev, newScreen]);
  };

  const updateScreen = (id: string, data: Partial<Screen>) => {
    setScreens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
  };

  const addCampaign = (data: Omit<Campaign, "id" | "createdAt">, placementData?: { screenIds: string[] }) => {
    const newCmp: Campaign = {
      ...data,
      id: `cmp_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setCampaigns((prev) => [...prev, newCmp]);

    if (placementData?.screenIds) {
      const newPlacements = placementData.screenIds.map(screenId => ({
        id: `pl_${Date.now()}_${screenId}`,
        campaignId: newCmp.id,
        screenId: screenId,
        secondsPerLoop: 10, // Default
        playsPerHour: 6, // Default
        createdAt: new Date().toISOString()
      }));
      setPlacements(prev => [...prev, ...newPlacements]);
    }
  };

  const generatePayouts = (month: string) => {
    // Simple mock logic for payout generation
    // In a real app, this would filter invoices by month, sum revenue, and distribute.
    
    // 1. Calculate Total Revenue (active advertisers)
    const activeRevenue = advertisers
      .filter(a => a.status === 'active')
      .reduce((sum, a) => sum + a.monthlyPriceExVat, 0);

    // 2. Distribute to locations based on screen count for now (simplified MVP logic as per prompt)
    // "Distribute revenue to locations proportionally by how many active placements they had that month"
    
    // Find active placements
    // For MVP we just use all placements currently in store
    const totalPlacements = placements.length;
    
    if (totalPlacements === 0) return;

    const newPayouts: Payout[] = locations.map(loc => {
      // Find screens for this location
      const locScreenIds = screens.filter(s => s.locationId === loc.id).map(s => s.id);
      
      // Count placements on these screens
      const locPlacementCount = placements.filter(p => locScreenIds.includes(p.screenId)).length;
      
      const ratio = locPlacementCount / totalPlacements;
      const share = activeRevenue * ratio * (loc.revenueSharePercent / 100);

      return {
        id: `pay_${Date.now()}_${loc.id}`,
        locationId: loc.id,
        periodStart: `${month}-01`,
        periodEnd: `${month}-30`,
        grossRevenueExVat: activeRevenue * ratio,
        sharePercent: loc.revenueSharePercent,
        payoutAmountExVat: share,
        status: "pending",
        createdAt: new Date().toISOString()
      };
    });

    setPayouts(prev => [...prev, ...newPayouts]);
  };

  return (
    <AppDataContext.Provider
      value={{
        advertisers,
        locations,
        screens,
        campaigns,
        placements,
        invoices,
        payouts,
        addAdvertiser,
        updateAdvertiser,
        addLocation,
        updateLocation,
        addScreen,
        updateScreen,
        addCampaign,
        generatePayouts,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }
  return context;
}
