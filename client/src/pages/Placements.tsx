import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Target, 
  Monitor, 
  Building2, 
  Filter,
  X,
  AlertTriangle,
  Wifi,
  WifiOff,
  FileWarning,
  ImageIcon,
  Video,
  ExternalLink,
  LinkIcon,
  Archive,
  ArchiveRestore,
  Unlink,
  Check,
  RefreshCw
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "wouter";

// Types for Ads View
interface AdViewItem {
  yodeckMediaId: number;
  name: string;
  mediaType: string | null;
  duration: number | null;
  advertiserId: string | null;
  advertiserName: string | null;
  placementId: string | null;
  status: 'linked' | 'unlinked' | 'archived';
  screensCount: number;
  screens: Array<{ screenId: string; screenDisplayId: string; screenName: string; locationName: string; isOnline: boolean }>;
  lastSeenAt: string;
  updatedAt: string;
  archivedAt: string | null;
  matchType?: 'auto' | 'suggested' | 'manual' | null;
  matchConfidence?: number | null;
  // Suggested match (computed on-the-fly)
  suggestedAdvertiserId: string | null;
  suggestedAdvertiserName: string | null;
  suggestedConfidence: number | null;
  matchStatus: 'none' | 'suggested' | 'auto' | 'manual';
  // Computed for filtering
  hasOfflineScreen?: boolean;
}

interface MatchSuggestion {
  advertiserId: string;
  advertiserName: string;
  score: number;
}

interface AdsViewResponse {
  items: AdViewItem[];
  summary: {
    total: number;
    linked: number;
    unlinked: number;
    archived: number;
  };
}

interface Placement {
  id: string;
  advertiserId: string;
  screenId: string;
  contractId?: string;
  creativeId?: string;
  startDate: string;
  endDate?: string;
  monthlyPrice: string;
  isActive: boolean;
  status: string;
  secondsPerLoop: number;
  playsPerHour: number;
  notes?: string;
}

interface Screen {
  id: string;
  screenId: string;
  name: string;
  locationId: string;
  status: string;
}

interface Location {
  id: string;
  name: string;
  city?: string;
}

interface Advertiser {
  id: string;
  name: string;
  companyName: string;
}

interface Creative {
  id: string;
  advertiserId: string;
  creativeType: string;
  title: string;
  status: string;
}

interface Contract {
  id: string;
  advertiserId: string;
  status: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

export default function Placements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"ads" | "placements">("ads");
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [adsStatusFilter, setAdsStatusFilter] = useState<"all" | "linked" | "unlinked" | "offline">("all");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);
  const [advertiserPopoverOpen, setAdvertiserPopoverOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  // Ads tab specific filters
  const [adsSearchTerm, setAdsSearchTerm] = useState("");
  const [adsAdvertiserFilter, setAdsAdvertiserFilter] = useState<string>("");
  const [adsScreenFilter, setAdsScreenFilter] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const debouncedAdsSearch = useDebounce(adsSearchTerm, 250);
  
  // Drawer state for ad detail/linking
  const [selectedAd, setSelectedAd] = useState<AdViewItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [linkAdvertiserId, setLinkAdvertiserId] = useState<string>("");
  const [advertiserSearchTerm, setAdvertiserSearchTerm] = useState("");
  const [advertiserSearchOpen, setAdvertiserSearchOpen] = useState(false);
  
  // Query for match suggestions when a media item is selected
  const { data: matchSuggestions } = useQuery<{ mediaName: string; bestMatch: any; suggestions: MatchSuggestion[] }>({
    queryKey: ["/api/yodeck-media", selectedAd?.yodeckMediaId, "match-suggestions"],
    queryFn: async () => {
      if (!selectedAd) return { mediaName: "", bestMatch: null, suggestions: [] };
      const res = await apiRequest("GET", `/api/yodeck-media/${selectedAd.yodeckMediaId}/match-suggestions`);
      return res.json();
    },
    enabled: !!selectedAd && selectedAd.status !== 'archived',
  });

  // Ads View query with archived filter
  const { data: adsViewData, isLoading: adsViewLoading } = useQuery<AdsViewResponse>({
    queryKey: ["/api/placements/ads-view", showArchived],
    queryFn: async () => {
      const params = showArchived ? "?includeArchived=true" : "";
      const res = await apiRequest("GET", `/api/placements/ads-view${params}`);
      return res.json();
    },
  });
  
  // Link mutation
  const linkMutation = useMutation({
    mutationFn: async ({ yodeckMediaId, advertiserId, matchType = 'manual', matchConfidence }: { yodeckMediaId: number; advertiserId: string; matchType?: string; matchConfidence?: number }) => {
      const res = await apiRequest("POST", `/api/yodeck-media/${yodeckMediaId}/link`, { advertiserId, matchType, matchConfidence });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Gekoppeld", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/placements/ads-view"] });
      setIsDrawerOpen(false);
      setSelectedAd(null);
      setLinkAdvertiserId("");
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: async (yodeckMediaId: number) => {
      const res = await apiRequest("POST", `/api/yodeck-media/${yodeckMediaId}/unlink`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Ontkoppeld", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/placements/ads-view"] });
      setIsDrawerOpen(false);
      setSelectedAd(null);
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async (yodeckMediaId: number) => {
      const res = await apiRequest("POST", `/api/yodeck-media/${yodeckMediaId}/archive`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Gearchiveerd", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/placements/ads-view"] });
      setIsDrawerOpen(false);
      setSelectedAd(null);
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // Unarchive mutation
  const unarchiveMutation = useMutation({
    mutationFn: async (yodeckMediaId: number) => {
      const res = await apiRequest("POST", `/api/yodeck-media/${yodeckMediaId}/unarchive`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Uit archief gehaald", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/placements/ads-view"] });
      setIsDrawerOpen(false);
      setSelectedAd(null);
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // Check if any mutation is in progress (to disable conflicting buttons)
  const isAnyMutationPending = linkMutation.isPending || unlinkMutation.isPending || archiveMutation.isPending || unarchiveMutation.isPending;
  
  // Open drawer for ad
  const openAdDetail = (ad: AdViewItem) => {
    setSelectedAd(ad);
    setLinkAdvertiserId(ad.advertiserId || "");
    setIsDrawerOpen(true);
  };

  const { data: placements = [], isLoading } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/placements");
      return res.json();
    },
  });

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/screens");
      return res.json();
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/locations");
      return res.json();
    },
  });

  const { data: advertisers = [] } = useQuery<Advertiser[]>({
    queryKey: ["/api/advertisers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/advertisers");
      return res.json();
    },
  });

  const { data: creatives = [] } = useQuery<Creative[]>({
    queryKey: ["/api/creatives"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/creatives");
      return res.json();
    },
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contracts");
      return res.json();
    },
  });

  // Helper functions
  const getScreen = (screenId: string) => screens.find(s => s.id === screenId);
  const getLocation = (locationId: string) => locations.find(l => l.id === locationId);
  const getAdvertiser = (advertiserId: string) => advertisers.find(a => a.id === advertiserId);
  const getCreative = (creativeId: string | undefined) => creativeId ? creatives.find(c => c.id === creativeId) : undefined;
  const getContract = (contractId: string | undefined) => contractId ? contracts.find(c => c.id === contractId) : undefined;

  // Get unique cities from locations
  const uniqueCities = useMemo(() => {
    const cities = locations
      .map(loc => loc.city)
      .filter((city): city is string => !!city && city.trim() !== "");
    return Array.from(new Set(cities)).sort();
  }, [locations]);

  // Filter locations by city
  const filteredLocations = useMemo(() => {
    if (!cityFilter) return locations;
    return locations.filter(loc => loc.city === cityFilter);
  }, [locations, cityFilter]);

  // Enriched placement data
  const enrichedPlacements = useMemo(() => {
    return placements.map(p => {
      const screen = getScreen(p.screenId);
      const location = screen ? getLocation(screen.locationId) : undefined;
      const advertiser = getAdvertiser(p.advertiserId);
      const creative = getCreative(p.creativeId);
      const contract = getContract(p.contractId);
      
      const isScreenOffline = screen?.status === "offline";
      const isContractUnsigned = contract && contract.status !== "signed";
      
      return {
        ...p,
        screen,
        location,
        advertiser,
        creative,
        contract,
        city: location?.city || "",
        locationName: location?.name || "",
        screenName: screen?.name || "",
        screenDisplayId: screen?.screenId || "",
        advertiserName: advertiser?.companyName || advertiser?.name || "Onbekende adverteerder",
        creativeName: creative?.title || "",
        creativeType: creative?.creativeType || "",
        isScreenOffline,
        isContractUnsigned,
        hasWarning: isScreenOffline || isContractUnsigned
      };
    });
  }, [placements, screens, locations, advertisers, creatives, contracts]);

  // Filter logic
  const filteredPlacements = useMemo(() => {
    return enrichedPlacements.filter(p => {
      // Search filter - matches advertiser, screen ID, location name, city
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matches = 
          p.advertiserName.toLowerCase().includes(search) ||
          p.screenDisplayId.toLowerCase().includes(search) ||
          p.locationName.toLowerCase().includes(search) ||
          p.city.toLowerCase().includes(search);
        if (!matches) return false;
      }

      // City filter
      if (cityFilter && p.city !== cityFilter) {
        return false;
      }

      // Location filter
      if (locationFilter && p.screen?.locationId !== locationFilter) {
        return false;
      }

      // Advertiser filter
      if (advertiserFilter && p.advertiserId !== advertiserFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "active" && !p.isActive) return false;
        if (statusFilter === "hold" && p.isActive) return false;
      }

      return true;
    });
  }, [enrichedPlacements, searchTerm, cityFilter, locationFilter, advertiserFilter, statusFilter]);

  // KPI calculations
  const activePlacements = enrichedPlacements.filter(p => p.isActive);
  const offlineScreenPlacements = activePlacements.filter(p => p.isScreenOffline);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getStatusBadge = (placement: typeof enrichedPlacements[0]) => {
    const badges = [];
    
    // Main status badge
    if (placement.isActive) {
      badges.push(<Badge key="active" className="bg-green-100 text-green-800">Actief</Badge>);
    } else {
      badges.push(<Badge key="hold" className="bg-amber-100 text-amber-800">Gepauzeerd</Badge>);
    }
    
    // Warning badges (visible, not hidden behind clicks)
    if (placement.isScreenOffline) {
      badges.push(
        <Badge key="offline" variant="destructive" className="ml-1">
          <WifiOff className="h-3 w-3 mr-1" />
          Offline
        </Badge>
      );
    }
    
    if (placement.isContractUnsigned) {
      badges.push(
        <Badge key="unsigned" className="bg-orange-100 text-orange-800 ml-1">
          <FileWarning className="h-3 w-3 mr-1" />
          Contract
        </Badge>
      );
    }
    
    return <div className="flex flex-wrap gap-1">{badges}</div>;
  };

  const clearFilters = () => {
    setSearchTerm("");
    setCityFilter("");
    setLocationFilter("");
    setAdvertiserFilter("");
    setStatusFilter("all");
  };

  const hasActiveFilters = searchTerm || cityFilter || locationFilter || advertiserFilter || statusFilter !== "all";

  const selectedLocationName = locationFilter ? getLocation(locationFilter)?.name || "" : "";
  const selectedAdvertiserName = advertiserFilter ? getAdvertiser(advertiserFilter)?.companyName || getAdvertiser(advertiserFilter)?.name || "" : "";

  // Filter ads based on status filter
  // Get unique advertisers from ads data
  const adsUniqueAdvertisers = useMemo(() => {
    if (!adsViewData?.items) return [];
    const names = adsViewData.items
      .map(ad => ad.advertiserName)
      .filter((name): name is string => !!name);
    return Array.from(new Set(names)).sort();
  }, [adsViewData?.items]);

  // Get unique screen names from ads data
  const adsUniqueScreens = useMemo(() => {
    if (!adsViewData?.items) return [];
    const names = adsViewData.items
      .flatMap(ad => ad.screens.map(s => s.screenName))
      .filter((name): name is string => !!name);
    return Array.from(new Set(names)).sort();
  }, [adsViewData?.items]);

  // Count ads on offline screens
  const adsOnOfflineCount = useMemo(() => {
    if (!adsViewData?.items) return 0;
    return adsViewData.items.filter(ad => 
      ad.screens.some(s => !s.isOnline)
    ).length;
  }, [adsViewData?.items]);

  // Reset ads filters
  const resetAdsFilters = () => {
    setAdsSearchTerm("");
    setAdsAdvertiserFilter("");
    setAdsScreenFilter("");
    setAdsStatusFilter("all");
  };

  const hasAdsFilters = adsSearchTerm || adsAdvertiserFilter || adsScreenFilter || adsStatusFilter !== "all";

  const filteredAds = useMemo(() => {
    if (!adsViewData?.items) return [];
    
    return adsViewData.items.filter(ad => {
      // Search filter (debounced)
      if (debouncedAdsSearch) {
        const search = debouncedAdsSearch.toLowerCase();
        const matchesName = ad.name.toLowerCase().includes(search);
        const matchesAdvertiser = ad.advertiserName?.toLowerCase().includes(search) ?? false;
        const matchesScreen = ad.screens.some(s => 
          s.screenName.toLowerCase().includes(search) ||
          s.locationName.toLowerCase().includes(search)
        );
        if (!matchesName && !matchesAdvertiser && !matchesScreen) return false;
      }
      
      // Status filter
      if (adsStatusFilter === "linked" && ad.status !== "linked") return false;
      if (adsStatusFilter === "unlinked" && ad.status !== "unlinked") return false;
      if (adsStatusFilter === "offline" && !ad.screens.some(s => !s.isOnline)) return false;
      
      // Advertiser filter
      if (adsAdvertiserFilter && ad.advertiserName !== adsAdvertiserFilter) return false;
      
      // Screen filter
      if (adsScreenFilter && !ad.screens.some(s => s.screenName === adsScreenFilter)) return false;
      
      return true;
    });
  }, [adsViewData?.items, debouncedAdsSearch, adsStatusFilter, adsAdvertiserFilter, adsScreenFilter]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Ads & Plaatsingen</h1>
          <p className="text-muted-foreground">Alle ads en waar ze draaien</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-placement">
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe Plaatsing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe Plaatsing</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Adverteerder</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer adverteerder..." />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.companyName || a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scherm</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer scherm..." />
                  </SelectTrigger>
                  <SelectContent>
                    {screens.map((s) => {
                      const loc = getLocation(s.locationId);
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.screenId} - {loc?.name || s.name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Startdatum</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Einddatum (optioneel)</Label>
                  <Input type="date" />
                </div>
              </div>
              <Button className="w-full">Plaatsing aanmaken</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ads Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-600" />
              Totaal Ads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="kpi-total-ads">
              {adsViewData?.summary.total ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-green-600" />
              Gekoppeld
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="kpi-linked-ads">
              {adsViewData?.summary.linked ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className={(adsViewData?.summary.unlinked ?? 0) > 0 ? "border-amber-300 bg-amber-50/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${(adsViewData?.summary.unlinked ?? 0) > 0 ? "text-amber-600" : ""}`} />
              Niet Gekoppeld
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(adsViewData?.summary.unlinked ?? 0) > 0 ? "text-amber-600" : ""}`} data-testid="kpi-unlinked-ads">
              {adsViewData?.summary.unlinked ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className={offlineScreenPlacements.length > 0 ? "border-destructive" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <WifiOff className={`h-4 w-4 ${offlineScreenPlacements.length > 0 ? "text-destructive" : ""}`} />
              Op Offline Schermen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${offlineScreenPlacements.length > 0 ? "text-destructive" : ""}`} data-testid="kpi-offline">
              {offlineScreenPlacements.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Ads view and Plaatsingen view */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "ads" | "placements")}>
        <TabsList>
          <TabsTrigger value="ads" data-testid="tab-ads">
            Alle Ads ({adsViewData?.items.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="placements" data-testid="tab-placements">
            Plaatsingen ({enrichedPlacements.length})
          </TabsTrigger>
        </TabsList>

        {/* ADS VIEW TAB */}
        <TabsContent value="ads" className="mt-4 space-y-4">
          {/* Ads Filters - Search + Dropdowns */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
                {hasAdsFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={resetAdsFilters}
                    data-testid="button-reset-ads-filters"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Wissen
                  </Button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => adsViewQuery.refetch()}
                    disabled={adsViewLoading}
                    data-testid="button-recalculate-suggestions"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${adsViewLoading ? "animate-spin" : ""}`} />
                    Herbereken
                  </Button>
                  <Badge variant="secondary">
                    {filteredAds.length} / {adsViewData?.summary.total ?? 0} ads
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Search */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Zoeken</Label>
                  <div className="relative">
                    <Input
                      placeholder="Zoek op ad, adverteerder of scherm…"
                      value={adsSearchTerm}
                      onChange={(e) => setAdsSearchTerm(e.target.value)}
                      className="h-9 pr-8"
                      data-testid="input-ads-search"
                    />
                    {adsSearchTerm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setAdsSearchTerm("")}
                        data-testid="button-clear-ads-search"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Status filter */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={adsStatusFilter} onValueChange={(v) => setAdsStatusFilter(v as typeof adsStatusFilter)}>
                    <SelectTrigger className="h-9" data-testid="filter-ads-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle ({adsViewData?.summary.total ?? 0})</SelectItem>
                      <SelectItem value="linked">Gekoppeld ({adsViewData?.summary.linked ?? 0})</SelectItem>
                      <SelectItem value="unlinked">Niet gekoppeld ({adsViewData?.summary.unlinked ?? 0})</SelectItem>
                      <SelectItem value="offline">Op offline schermen ({adsOnOfflineCount})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Advertiser filter */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Adverteerder</Label>
                  <Select value={adsAdvertiserFilter || "__all__"} onValueChange={(v) => setAdsAdvertiserFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-9" data-testid="filter-ads-advertiser">
                      <SelectValue placeholder="Alle adverteerders" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Alle adverteerders</SelectItem>
                      {adsUniqueAdvertisers.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Screen filter */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Scherm</Label>
                  <Select value={adsScreenFilter || "__all__"} onValueChange={(v) => setAdsScreenFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-9" data-testid="filter-ads-screen">
                      <SelectValue placeholder="Alle schermen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Alle schermen</SelectItem>
                      {adsUniqueScreens.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Archive toggle row */}
              <div className="flex items-center justify-end mt-4 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <Switch 
                    id="showArchived" 
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    data-testid="toggle-show-archived"
                  />
                  <Label htmlFor="showArchived" className="text-sm cursor-pointer flex items-center gap-1">
                    <Archive className="h-3 w-3" />
                    Toon archief {(adsViewData?.summary.archived ?? 0) > 0 && `(${adsViewData?.summary.archived})`}
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ads Table */}
          <Card>
            <CardContent className="p-0">
              {adsViewLoading ? (
                <div className="p-8 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : filteredAds.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  {debouncedAdsSearch ? (
                    <p>Geen resultaten voor '{debouncedAdsSearch}'</p>
                  ) : (
                    <p>Geen ads gevonden</p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ad Naam</TableHead>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Schermen</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAds.map((ad) => (
                      <TableRow key={ad.yodeckMediaId} data-testid={`row-ad-${ad.yodeckMediaId}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {ad.mediaType?.includes("video") ? (
                              <Video className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="truncate max-w-[200px]">{ad.name}</div>
                              {ad.duration && (
                                <div className="text-xs text-muted-foreground">{ad.duration}s</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {ad.advertiserName ? (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-green-100 text-green-800">
                                <Check className="h-3 w-3 mr-1" />
                                {ad.advertiserName}
                              </Badge>
                            </div>
                          ) : ad.suggestedAdvertiserName ? (
                            <div className="flex items-center gap-2">
                              <Badge 
                                className={ad.suggestedConfidence && ad.suggestedConfidence >= 75 
                                  ? "bg-green-50 text-green-700 border border-green-200" 
                                  : "bg-amber-50 text-amber-700 border border-amber-200"}
                              >
                                Voorstel: {ad.suggestedAdvertiserName} ({ad.suggestedConfidence}%)
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  linkMutation.mutate({
                                    yodeckMediaId: ad.yodeckMediaId,
                                    advertiserId: ad.suggestedAdvertiserId!,
                                    matchType: 'suggested',
                                    matchConfidence: (ad.suggestedConfidence || 0) / 100
                                  });
                                }}
                                disabled={linkMutation.isPending}
                                data-testid={`button-accept-${ad.yodeckMediaId}`}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Geen voorstel
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {ad.screensCount > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {ad.screens.slice(0, 2).map((s, idx) => (
                                <Link key={idx} href={`/screens/${s.screenId}`}>
                                  <Badge 
                                    variant="outline" 
                                    className={`cursor-pointer hover:bg-muted ${!s.isOnline ? "border-destructive text-destructive" : ""}`}
                                    title={`${s.screenDisplayId} - ${s.locationName}`}
                                  >
                                    {s.screenName || `Onbekend scherm (${s.screenDisplayId})`}
                                    {!s.isOnline && <WifiOff className="h-3 w-3 ml-1" />}
                                  </Badge>
                                </Link>
                              ))}
                              {ad.screensCount > 2 && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Badge variant="secondary" className="cursor-pointer">
                                      +{ad.screensCount - 2} meer
                                    </Badge>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 p-2">
                                    <div className="space-y-1">
                                      {ad.screens.slice(2).map((s, idx) => (
                                        <Link key={idx} href={`/screens/${s.screenId}`}>
                                          <Badge 
                                            variant="outline" 
                                            className={`cursor-pointer hover:bg-muted w-full justify-start ${!s.isOnline ? "border-destructive text-destructive" : ""}`}
                                          >
                                            {s.screenName || `Onbekend scherm (${s.screenDisplayId})`}
                                            {!s.isOnline && <WifiOff className="h-3 w-3 ml-1" />}
                                          </Badge>
                                        </Link>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {ad.status === 'archived' ? (
                            <Badge className="bg-gray-100 text-gray-600">
                              <Archive className="h-3 w-3 mr-1" />
                              Archief
                            </Badge>
                          ) : ad.status === 'linked' ? (
                            <Badge className="bg-green-100 text-green-800">Gekoppeld</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Niet gekoppeld</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant={ad.status === 'unlinked' ? "outline" : "ghost"} 
                            size="sm"
                            className={ad.status === 'unlinked' ? "text-amber-600 border-amber-300 hover:bg-amber-50" : ""}
                            onClick={() => openAdDetail(ad)}
                            data-testid={`button-open-ad-${ad.yodeckMediaId}`}
                          >
                            {ad.status === 'unlinked' ? 'Koppelen' : 'Beheren'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PLAATSINGEN VIEW TAB */}
        <TabsContent value="placements" className="mt-4 space-y-4">

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-3 w-3 mr-1" />
                Wissen
              </Button>
            )}
            <Badge variant="secondary" className="ml-auto">
              {filteredPlacements.length} / {enrichedPlacements.length} plaatsingen
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Zoeken</Label>
              <Input
                placeholder="Adverteerder, scherm, locatie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
                data-testid="input-search"
              />
            </div>

            {/* City filter (Plaats) */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Plaats</Label>
              <Popover open={cityPopoverOpen} onOpenChange={setCityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 font-normal"
                    data-testid="filter-city"
                  >
                    {cityFilter || "Alle plaatsen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Zoek plaats..." />
                    <CommandList>
                      <CommandEmpty>Geen plaats gevonden</CommandEmpty>
                      <CommandGroup>
                        <CommandItem 
                          value="" 
                          onSelect={() => {
                            setCityFilter("");
                            setLocationFilter("");
                            setCityPopoverOpen(false);
                          }}
                        >
                          Alle plaatsen
                        </CommandItem>
                        {uniqueCities.map((city) => (
                          <CommandItem
                            key={city}
                            value={city}
                            onSelect={() => {
                              setCityFilter(city);
                              setLocationFilter("");
                              setCityPopoverOpen(false);
                            }}
                          >
                            {city}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Location filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Locatie / Scherm</Label>
              <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 font-normal"
                    data-testid="filter-location"
                  >
                    {selectedLocationName || "Alle locaties"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Zoek locatie..." />
                    <CommandList>
                      <CommandEmpty>Geen locatie gevonden</CommandEmpty>
                      <CommandGroup>
                        <CommandItem 
                          value="" 
                          onSelect={() => {
                            setLocationFilter("");
                            setLocationPopoverOpen(false);
                          }}
                        >
                          Alle locaties
                        </CommandItem>
                        {filteredLocations.map((loc) => (
                          <CommandItem
                            key={loc.id}
                            value={loc.name}
                            onSelect={() => {
                              setLocationFilter(loc.id);
                              setLocationPopoverOpen(false);
                            }}
                          >
                            {loc.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Advertiser filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Adverteerder</Label>
              <Popover open={advertiserPopoverOpen} onOpenChange={setAdvertiserPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 font-normal"
                    data-testid="filter-advertiser"
                  >
                    {selectedAdvertiserName || "Alle adverteerders"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Zoek adverteerder..." />
                    <CommandList>
                      <CommandEmpty>Geen adverteerder gevonden</CommandEmpty>
                      <CommandGroup>
                        <CommandItem 
                          value="" 
                          onSelect={() => {
                            setAdvertiserFilter("");
                            setAdvertiserPopoverOpen(false);
                          }}
                        >
                          Alle adverteerders
                        </CommandItem>
                        {advertisers.map((a) => (
                          <CommandItem
                            key={a.id}
                            value={a.companyName || a.name}
                            onSelect={() => {
                              setAdvertiserFilter(a.id);
                              setAdvertiserPopoverOpen(false);
                            }}
                          >
                            {a.companyName || a.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="hold">Gepauzeerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placements Table */}
      <div className="rounded-md border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredPlacements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Geen plaatsingen gevonden</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adverteerder</TableHead>
                <TableHead>Plaats</TableHead>
                <TableHead>Locatie / Scherm</TableHead>
                <TableHead>Creative</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px] text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlacements.map((placement) => (
                <TableRow 
                  key={placement.id} 
                  data-testid={`row-placement-${placement.id}`}
                  className={placement.hasWarning ? "bg-red-50/50" : ""}
                >
                  <TableCell>
                    <Link href={`/advertisers/${placement.advertiserId}`} className="hover:underline">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{placement.advertiserName}</span>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{placement.city || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Monitor className={`h-4 w-4 ${placement.isScreenOffline ? "text-destructive" : "text-muted-foreground"}`} />
                      <div>
                        <p className="font-medium">{placement.locationName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{placement.screenDisplayId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {placement.creative ? (
                      <div className="flex items-center gap-2">
                        {placement.creativeType === "video" ? (
                          <Video className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">{placement.creativeName}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {formatDate(placement.startDate)}
                      {placement.endDate && (
                        <>
                          <span className="text-muted-foreground"> – </span>
                          {formatDate(placement.endDate)}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(placement)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild data-testid={`button-open-${placement.id}`}>
                      <Link href={`/placements/${placement.id}`}>
                        Open
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
        </TabsContent>
      </Tabs>

      {/* Ad Detail Drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selectedAd?.mediaType?.includes("video") ? (
                <Video className="h-5 w-5" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
              {selectedAd?.name}
            </SheetTitle>
            <SheetDescription>
              Beheer de koppeling van deze ad met een adverteerder
            </SheetDescription>
          </SheetHeader>
          
          {selectedAd && (
            <div className="py-6 space-y-6">
              {/* Current Status */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Huidige status</Label>
                <div>
                  {selectedAd.status === 'archived' ? (
                    <Badge className="bg-gray-100 text-gray-600">
                      <Archive className="h-3 w-3 mr-1" />
                      Gearchiveerd
                    </Badge>
                  ) : selectedAd.status === 'linked' ? (
                    <Badge className="bg-green-100 text-green-800">
                      <Check className="h-3 w-3 mr-1" />
                      Gekoppeld aan {selectedAd.advertiserName}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Niet gekoppeld
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* Playing On Screens */}
              {selectedAd.screensCount > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">Draait op {selectedAd.screensCount} scherm{selectedAd.screensCount > 1 ? 'en' : ''}</Label>
                  <div className="flex flex-wrap gap-1">
                    {selectedAd.screens.map((s, idx) => (
                      <Link key={idx} href={`/screens/${s.screenId}`}>
                        <Badge 
                          variant="outline" 
                          className={`cursor-pointer hover:bg-muted ${!s.isOnline ? "border-destructive text-destructive" : ""}`}
                        >
                          {s.locationName}
                          {!s.isOnline && <WifiOff className="h-3 w-3 ml-1" />}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Link to Advertiser - only if not archived */}
              {selectedAd.status !== 'archived' && (
                <div className="space-y-3">
                  {/* Suggestion Block */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs">Voorstel</Label>
                    {selectedAd.suggestedAdvertiserName ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed bg-muted/30">
                        <Badge 
                          className={selectedAd.suggestedConfidence && selectedAd.suggestedConfidence >= 75 
                            ? "bg-green-100 text-green-800 border-green-200" 
                            : "bg-amber-100 text-amber-800 border-amber-200"}
                        >
                          {selectedAd.suggestedAdvertiserName} ({selectedAd.suggestedConfidence}%)
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto"
                          onClick={() => {
                            linkMutation.mutate({
                              yodeckMediaId: selectedAd.yodeckMediaId,
                              advertiserId: selectedAd.suggestedAdvertiserId!,
                              matchType: 'suggested',
                              matchConfidence: (selectedAd.suggestedConfidence || 0) / 100
                            });
                          }}
                          disabled={isAnyMutationPending}
                          data-testid="button-use-suggestion"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Gebruik voorstel
                        </Button>
                      </div>
                    ) : selectedAd.status === 'linked' ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50 border-green-200">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-800">Gekoppeld aan {selectedAd.advertiserName}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed bg-muted/30">
                        <Badge variant="outline" className="text-muted-foreground">
                          Geen voorstel gevonden
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-xs">Koppelen aan adverteerder</Label>
                    {selectedAd.matchType && (
                      <Badge variant="outline" className={
                        selectedAd.matchType === 'auto' ? "border-green-300 text-green-700 bg-green-50" :
                        selectedAd.matchType === 'suggested' ? "border-blue-300 text-blue-700 bg-blue-50" :
                        "border-gray-300 text-gray-700"
                      }>
                        {selectedAd.matchType === 'auto' ? 'Auto-match' : 
                         selectedAd.matchType === 'suggested' ? 'Suggestie' : 'Handmatig'}
                        {selectedAd.matchConfidence && ` (${Math.round(selectedAd.matchConfidence * 100)}%)`}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Searchable advertiser selector */}
                  <Popover open={advertiserSearchOpen} onOpenChange={setAdvertiserSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={advertiserSearchOpen}
                        className="w-full justify-between"
                        disabled={isAnyMutationPending}
                        data-testid="select-link-advertiser"
                      >
                        {linkAdvertiserId 
                          ? advertisers.find(a => a.id === linkAdvertiserId)?.companyName || "Geselecteerd"
                          : "Selecteer adverteerder..."}
                        <X className={`ml-2 h-4 w-4 shrink-0 opacity-50 ${linkAdvertiserId ? "visible" : "invisible"}`} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Zoek adverteerder..." 
                          value={advertiserSearchTerm}
                          onValueChange={setAdvertiserSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty>Geen adverteerder gevonden.</CommandEmpty>
                          
                          {/* Match suggestions section */}
                          {matchSuggestions?.suggestions && matchSuggestions.suggestions.length > 0 && (
                            <CommandGroup heading="Suggesties o.b.v. ad naam">
                              {matchSuggestions.suggestions.map((s) => (
                                <CommandItem
                                  key={`suggestion-${s.advertiserId}`}
                                  value={s.advertiserName}
                                  onSelect={() => {
                                    const matchType = s.score >= 75 ? 'auto' : 'suggested';
                                    const matchConfidence = s.score / 100; // Convert percentage to 0-1
                                    setLinkAdvertiserId(s.advertiserId);
                                    setAdvertiserSearchOpen(false);
                                    // Auto-link if high confidence match
                                    if (s.score >= 75) {
                                      linkMutation.mutate({ 
                                        yodeckMediaId: selectedAd.yodeckMediaId, 
                                        advertiserId: s.advertiserId,
                                        matchType,
                                        matchConfidence
                                      });
                                    }
                                  }}
                                  className="flex items-center justify-between"
                                >
                                  <span>{s.advertiserName}</span>
                                  <Badge 
                                    variant="secondary" 
                                    className={s.score >= 75 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}
                                  >
                                    {s.score}%
                                  </Badge>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          
                          {/* All advertisers */}
                          <CommandGroup heading="Alle adverteerders">
                            <CommandItem
                              value="__none__"
                              onSelect={() => {
                                setLinkAdvertiserId("");
                                setAdvertiserSearchOpen(false);
                              }}
                            >
                              <span className="text-muted-foreground">Niet gekoppeld</span>
                            </CommandItem>
                            {advertisers.map((a) => (
                              <CommandItem
                                key={a.id}
                                value={a.companyName || a.name}
                                onSelect={() => {
                                  setLinkAdvertiserId(a.id);
                                  setAdvertiserSearchOpen(false);
                                }}
                              >
                                {a.companyName || a.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  
                  {linkAdvertiserId && linkAdvertiserId !== selectedAd.advertiserId && (
                    <Button 
                      className="w-full"
                      onClick={() => linkMutation.mutate({ yodeckMediaId: selectedAd.yodeckMediaId, advertiserId: linkAdvertiserId, matchType: 'manual' })}
                      disabled={isAnyMutationPending}
                      data-testid="button-save-link"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {linkMutation.isPending ? "Opslaan..." : "Koppeling opslaan"}
                    </Button>
                  )}
                  
                  {selectedAd.status === 'linked' && !linkAdvertiserId && (
                    <Button 
                      variant="outline"
                      className="w-full text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() => unlinkMutation.mutate(selectedAd.yodeckMediaId)}
                      disabled={isAnyMutationPending}
                      data-testid="button-unlink"
                    >
                      <Unlink className="h-4 w-4 mr-2" />
                      {unlinkMutation.isPending ? "Ontkoppelen..." : "Koppeling verwijderen"}
                    </Button>
                  )}
                </div>
              )}

              <Separator />

              {/* Archive/Unarchive Actions */}
              <div className="space-y-3">
                <Label className="text-muted-foreground text-xs">Archief</Label>
                {selectedAd.status === 'archived' ? (
                  <Button 
                    variant="outline"
                    className="w-full"
                    onClick={() => unarchiveMutation.mutate(selectedAd.yodeckMediaId)}
                    disabled={isAnyMutationPending}
                    data-testid="button-unarchive"
                  >
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    {unarchiveMutation.isPending ? "Herstellen..." : "Uit archief halen"}
                  </Button>
                ) : (
                  <Button 
                    variant="outline"
                    className="w-full text-muted-foreground"
                    onClick={() => archiveMutation.mutate(selectedAd.yodeckMediaId)}
                    disabled={isAnyMutationPending}
                    data-testid="button-archive"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {archiveMutation.isPending ? "Archiveren..." : "Archiveren (verbergen)"}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Gearchiveerde ads zijn verborgen maar blijven beschikbaar via de "Toon archief" optie.
                </p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
