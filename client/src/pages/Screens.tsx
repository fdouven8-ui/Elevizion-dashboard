import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Monitor, Filter, X, Rows3, Rows4, LayoutGrid, Search, ExternalLink, AlertCircle, AlertTriangle, CheckCircle, Link2, RefreshCw, Shield } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCanonicalScreens } from "@/hooks/useCanonicalScreens";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { useLocation, Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

type RowDensity = "compact" | "normal" | "comfortable";

function getScreenDisplayName(screen: any, location: any): string {
  // Priority: effectiveName (from Moneybird) > Moneybird company > Yodeck player name > screen name > screenId
  // NOTE: Do NOT use location.name as fallback - that causes grouping issues!
  if (screen?.effectiveName && screen.effectiveName.trim()) {
    return screen.effectiveName;
  }
  // Check Moneybird snapshot company name (schema uses 'companyName')
  const snapshot = screen?.moneybirdContactSnapshot as { companyName?: string } | null;
  if (snapshot?.companyName && snapshot.companyName.trim()) {
    return snapshot.companyName;
  }
  // Use Yodeck player name (device name)
  if (screen?.yodeckPlayerName && screen.yodeckPlayerName.trim()) {
    return screen.yodeckPlayerName;
  }
  // Use screen name
  if (screen?.name && screen.name.trim()) {
    return screen.name;
  }
  // Final fallback: screenId
  if (screen?.screenId) {
    return `Scherm ${screen.screenId}`;
  }
  return "Onbekend scherm";
}

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstname: string | null;
  lastname: string | null;
  city: string | null;
}

// ScreenWithBusiness type van het nieuwe endpoint
// Moneybird locatie velden: city (plaats), address1 (straat), zipcode (postcode)
interface ScreenWithBusiness {
  id: string;
  screenId: string;
  yodeck: {
    deviceId: string | null;
    screenName: string;
    tags: string[];
    uuid: string | null;
    status: string;
    lastSeenAt: string | null;
    screenshotUrl: string | null;
  };
  moneybirdContact: {
    id: string;
    name: string | null;
    address1: string | null;
    zipcode: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
    kvk: string | null;
    btw: string | null;
  } | null;
  linkStatus: "linked" | "unlinked" | "missing_data";
  locationLabel: string; // Plaats (city) als primaire locatie
  locationSubLabel: string | null; // address1 • zipcode (secundair)
  isActive: boolean;
  createdAt: string;
}

export default function Screens() {
  const { screens, locations, placements } = useAppData();
  const [location, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [rowDensity, setRowDensity] = useState<RowDensity>("normal");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const initialStatus = urlParams.get('status');
  const initialMoneybirdFilter = urlParams.get('moneybird') === 'missing';

  // UNIFIED: Canonical hook for LIVE Yodeck status
  const { 
    screens: canonicalScreens, 
    refresh: refreshCanonical, 
    isRefetching: isRefetchingCanonical,
    isError: isCanonicalError,
    isStale: isCanonicalStale,
    ensureCompliance,
    isEnsuringCompliance,
    getScreenByYodeckId,
  } = useCanonicalScreens();

  // Fetch screens with business data (consolidated endpoint for DB/Moneybird info)
  const { data: screensWithBusiness = [] } = useQuery<ScreenWithBusiness[]>({
    queryKey: ["/api/screens/with-business"],
  });

  const { data: moneybirdContacts = [] } = useQuery<MoneybirdContact[]>({
    queryKey: ["/api/moneybird/contacts"],
  });

  // Direct screen-to-Moneybird linking (also updates location automatically)
  const linkScreenMutation = useMutation({
    mutationFn: async ({ screenId, moneybirdContactId }: { screenId: string; moneybirdContactId: string }) => {
      const response = await fetch(`/api/screens/${screenId}/link-moneybird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moneybirdContactId }),
      });
      if (!response.ok) throw new Error("Koppeling mislukt");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screens/with-business"] });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
      const displayName = data.contact?.displayName || "Moneybird contact";
      toast({ title: "Moneybird gekoppeld", description: `Scherm gekoppeld aan ${displayName}` });
    },
    onError: () => {
      toast({ title: "Fout", description: "Koppeling mislukt", variant: "destructive" });
    },
  });

  // Yodeck sync mutation
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const syncYodeck = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/yodeck-debug/sync", {});
      return await res.json();
    },
    onSuccess: (data) => {
      setLastSyncAt(data.syncedAt);
      queryClient.invalidateQueries({ queryKey: ["/api/screens/with-business"] });
      toast({ title: "Yodeck gesynchroniseerd", description: `${data.screenCount} screens, ${data.layoutCount} layouts, ${data.playlistCount} playlists` });
    },
    onError: (error: Error) => {
      toast({ title: "Sync mislukt", description: error.message, variant: "destructive" });
    },
  });

  const [cityFilter, setCityFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string[]>(
    initialStatus ? [initialStatus] : []
  );
  const [moneybirdMissingFilter, setMoneybirdMissingFilter] = useState(initialMoneybirdFilter);
  const [minPlacements, setMinPlacements] = useState<string>("");
  const [maxPlacements, setMaxPlacements] = useState<string>("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [linkPopoverOpen, setLinkPopoverOpen] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");

  // Check screen-level Moneybird link using screensWithBusiness data
  const screensWithoutMoneybird = useMemo(() => {
    return screensWithBusiness.filter(scr => scr.linkStatus === "unlinked");
  }, [screensWithBusiness]);

  const screensWithoutMoneybirdCount = screensWithoutMoneybird.length;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim().toLowerCase());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Get unique cities from screensWithBusiness (Moneybird data)
  const uniqueCities = useMemo(() => {
    const cities = screensWithBusiness
      .map(scr => scr.locationLabel)
      .filter((city): city is string => !!city && city !== "—" && city.trim() !== "");
    return Array.from(new Set(cities)).sort();
  }, [screensWithBusiness]);

  const getActivePlacementsCount = (screenId: string) => {
    return placements.filter(p => 
      p.screenId === screenId && p.isActive
    ).length;
  };

  const getLocation = (locationId: string | null) => {
    if (!locationId) return undefined;
    return locations.find(l => l.id === locationId);
  };

  // Filter screensWithBusiness based on filters
  const filteredScreens = useMemo(() => {
    return screensWithBusiness.filter(scr => {
      // City filter: check locationLabel (Moneybird city)
      if (cityFilter && scr.locationLabel !== cityFilter) {
        return false;
      }

      // Status filter: check Yodeck status
      if (statusFilter.length > 0 && !statusFilter.includes(scr.yodeck.status)) {
        return false;
      }

      // Moneybird filter: check linkStatus
      if (moneybirdMissingFilter && scr.linkStatus !== "unlinked") {
        return false;
      }

      const placementCount = getActivePlacementsCount(scr.id);
      const minVal = minPlacements ? parseInt(minPlacements, 10) : NaN;
      const maxVal = maxPlacements ? parseInt(maxPlacements, 10) : NaN;
      if (!isNaN(minVal) && placementCount < minVal) {
        return false;
      }
      if (!isNaN(maxVal) && placementCount > maxVal) {
        return false;
      }

      if (searchQuery) {
        const yodeckName = scr.yodeck.screenName.toLowerCase();
        const screenId = (scr.screenId || "").toLowerCase();
        const deviceId = (scr.yodeck.deviceId || "").toLowerCase();
        const deviceIdPrefixed = scr.yodeck.deviceId ? `ydk-${scr.yodeck.deviceId}`.toLowerCase() : "";
        const city = scr.locationLabel.toLowerCase();
        const company = (scr.moneybirdContact?.name || "").toLowerCase();
        
        const searchMatch = 
          yodeckName.includes(searchQuery) ||
          screenId.includes(searchQuery) ||
          deviceId.includes(searchQuery) ||
          deviceIdPrefixed.includes(searchQuery) ||
          city.includes(searchQuery) ||
          company.includes(searchQuery);
        
        if (!searchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [screensWithBusiness, cityFilter, statusFilter, moneybirdMissingFilter, minPlacements, maxPlacements, placements, searchQuery]);

  const filteredLocations = useMemo(() => {
    if (!cityFilter) return locations;
    return locations.filter(loc => loc.city === cityFilter);
  }, [locations, cityFilter]);

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Onbekend";
  const selectedLocationName = locationFilter ? getLocationName(locationFilter) : "";

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearFilters = () => {
    setCityFilter("");
    setLocationFilter("");
    setStatusFilter([]);
    setMoneybirdMissingFilter(false);
    setMinPlacements("");
    setMaxPlacements("");
    setSearchInput("");
  };

  const hasActiveFilters = cityFilter || locationFilter || statusFilter.length > 0 || moneybirdMissingFilter || minPlacements || maxPlacements || searchInput;

  const getRowClasses = () => {
    switch (rowDensity) {
      case "compact":
        return "text-sm";
      case "comfortable":
        return "text-base";
      default:
        return "text-sm";
    }
  };

  const getCellPadding = () => {
    switch (rowDensity) {
      case "compact":
        return "py-1.5 px-3";
      case "comfortable":
        return "py-4 px-4";
      default:
        return "py-2.5 px-4";
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">Schermen</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Monitor en beheer je digital signage displays</span>
            {lastSyncAt && (
              <span className="text-xs" data-testid="last-sync-timestamp">
                Laatste sync: {new Date(lastSyncAt).toLocaleString("nl-NL")}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                syncYodeck.mutate();
                refreshCanonical();
              }}
              disabled={syncYodeck.isPending || isRefetchingCanonical}
              data-testid="sync-yodeck-button"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${syncYodeck.isPending || isRefetchingCanonical ? 'animate-spin' : ''}`} />
              Ververs
            </Button>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm" data-testid="button-add-screen">
              <Plus className="mr-2 h-4 w-4" /> Scherm Toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw Scherm Toevoegen</DialogTitle>
            </DialogHeader>
            <ScreenForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Canonical live status warning banner */}
      {isCanonicalError && (
        <div 
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between"
          data-testid="canonical-error-banner"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">
              Yodeck live status onbeschikbaar - status is mogelijk verouderd
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="border-red-300 text-red-700 hover:bg-red-100"
            onClick={() => refreshCanonical()}
            disabled={isRefetchingCanonical}
            data-testid="button-retry-canonical"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefetchingCanonical ? 'animate-spin' : ''}`} />
            Opnieuw proberen
          </Button>
        </div>
      )}

      {/* Moneybird koppeling banner */}
      {screensWithoutMoneybirdCount > 0 && !moneybirdMissingFilter && (
        <div 
          className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center justify-between"
          data-testid="moneybird-missing-banner"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-orange-700">
              <strong>{screensWithoutMoneybirdCount} schermen</strong> zonder Moneybird koppeling
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="border-orange-300 text-orange-700 hover:bg-orange-100"
            onClick={() => setMoneybirdMissingFilter(true)}
            data-testid="button-filter-moneybird-missing"
          >
            <Filter className="h-3 w-3 mr-1" />
            Toon alleen deze
          </Button>
        </div>
      )}

      {moneybirdMissingFilter && (
        <div 
          className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between"
          data-testid="moneybird-filter-active"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-blue-700">
              Filter actief: alleen schermen zonder Moneybird koppeling ({filteredScreens.length})
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
            onClick={() => setMoneybirdMissingFilter(false)}
            data-testid="button-clear-moneybird-filter"
          >
            <X className="h-3 w-3 mr-1" />
            Filter wissen
          </Button>
        </div>
      )}

      {/* Compact Filters */}
      <Card className="border-muted">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap flex-1">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Zoek op scherm, locatie, plaats, ID…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-8 w-[220px] pl-8 text-sm"
                  data-testid="filter-search"
                />
              </div>
              
              <div className="flex items-center gap-2 border-l pl-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
              </div>
              
              {/* City filter */}
              <Popover open={cityPopoverOpen} onOpenChange={setCityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 font-normal"
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

              {/* Location filter */}
              <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 font-normal"
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

              {/* Status filter */}
              <div className="flex items-center gap-2 border-l pl-3">
                <div className="flex items-center gap-1.5">
                  <Checkbox 
                    id="status-online"
                    checked={statusFilter.includes("online")}
                    onCheckedChange={() => toggleStatusFilter("online")}
                    className="h-4 w-4"
                    data-testid="filter-status-online"
                  />
                  <Label htmlFor="status-online" className="text-sm cursor-pointer">Online</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox 
                    id="status-offline"
                    checked={statusFilter.includes("offline")}
                    onCheckedChange={() => toggleStatusFilter("offline")}
                    className="h-4 w-4"
                    data-testid="filter-status-offline"
                  />
                  <Label htmlFor="status-offline" className="text-sm cursor-pointer">Offline</Label>
                </div>
              </div>

              {/* Placements range */}
              <div className="flex items-center gap-1 border-l pl-3">
                <span className="text-xs text-muted-foreground mr-1">Plaatsingen:</span>
                <Input 
                  type="number" 
                  placeholder="Min" 
                  className="h-8 w-14 text-xs"
                  value={minPlacements}
                  onChange={(e) => setMinPlacements(e.target.value)}
                  data-testid="filter-min-placements"
                />
                <span className="text-muted-foreground">-</span>
                <Input 
                  type="number" 
                  placeholder="Max" 
                  className="h-8 w-14 text-xs"
                  value={maxPlacements}
                  onChange={(e) => setMaxPlacements(e.target.value)}
                  data-testid="filter-max-placements"
                />
              </div>

              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2 text-xs"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Wissen
                </Button>
              )}
            </div>

            {/* Right side: count + density toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {filteredScreens.length} / {screensWithBusiness.length}
              </span>
              
              <ToggleGroup 
                type="single" 
                value={rowDensity} 
                onValueChange={(val) => val && setRowDensity(val as RowDensity)}
                className="border rounded-md"
                data-testid="toggle-row-density"
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="compact" size="sm" className="h-8 px-2" data-testid="density-compact">
                        <Rows4 className="h-4 w-4" />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>Compact</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="normal" size="sm" className="h-8 px-2" data-testid="density-normal">
                        <Rows3 className="h-4 w-4" />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>Normaal</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="comfortable" size="sm" className="h-8 px-2" data-testid="density-comfortable">
                        <LayoutGrid className="h-4 w-4" />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>Ruim</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </ToggleGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screens Table - Vereenvoudigd: Yodeck naam, Bedrijf, Plaats */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={getCellPadding()}>Scherm</TableHead>
              <TableHead className={getCellPadding()}>Status</TableHead>
              <TableHead className={`${getCellPadding()} w-[120px] text-right`}>Actie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={getRowClasses()}>
            {filteredScreens.map((scr) => {
              const placementCount = getActivePlacementsCount(scr.id);
              
              // Data uit ScreenWithBusiness formaat
              // Moneybird locatie: city (plaats), address1 + zipcode (straat + postcode)
              const yodeckName = scr.yodeck.screenName;
              const hasMoneybird = scr.linkStatus === "linked";
              const companyName = scr.moneybirdContact?.name || null;
              const cityName = scr.locationLabel !== "—" ? scr.locationLabel : null;
              const addressInfo = scr.locationSubLabel; // straat • postcode
              
              // UNIFIED: Get LIVE status from canonical data
              const liveScreen = scr.yodeck.deviceId 
                ? getScreenByYodeckId(scr.yodeck.deviceId) 
                : undefined;
              const liveStatus = liveScreen?.onlineStatus || scr.yodeck.status;
              const isElevizion = liveScreen?.isElevizion ?? false;
              
              return (
                <TableRow 
                  key={scr.id} 
                  data-testid={`screen-row-${scr.id}`}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setLocation(`/screens/${scr.id}`)}
                >
                  {/* Scherm kolom: Yodeck naam (titel) + Bedrijf + Plaats */}
                  <TableCell className={getCellPadding()}>
                    <div className="flex items-start gap-3">
                      <Monitor className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        {/* Titel: Yodeck schermnaam */}
                        <div className="font-medium truncate text-base" data-testid={`screen-name-${scr.id}`}>
                          {yodeckName}
                        </div>
                        
                        {/* Subtitel: Bedrijf (links) + Plaats (rechts) */}
                        <div className="flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          {hasMoneybird && companyName ? (
                            <span className="text-sm text-foreground/80 truncate" data-testid={`company-name-${scr.id}`}>
                              {companyName}
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Badge 
                                variant="outline" 
                                className="text-orange-600 border-orange-300 text-xs"
                                data-testid={`badge-unlinked-${scr.id}`}
                              >
                                Niet gekoppeld
                              </Badge>
                              <Popover 
                                open={linkPopoverOpen === scr.id} 
                                onOpenChange={(open) => {
                                  setLinkPopoverOpen(open ? scr.id : null);
                                  if (!open) setLinkSearch("");
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                    data-testid={`button-link-moneybird-${scr.id}`}
                                  >
                                    <Link2 className="h-3 w-3 mr-1" />
                                    Koppel
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0" align="start">
                                  <Command>
                                    <CommandInput 
                                      placeholder="Zoek Moneybird contact..." 
                                      value={linkSearch}
                                      onValueChange={setLinkSearch}
                                    />
                                    <CommandList>
                                      <CommandEmpty>Geen contact gevonden</CommandEmpty>
                                      <CommandGroup>
                                        {moneybirdContacts
                                          .filter(c => {
                                            if (!linkSearch) return true;
                                            const search = linkSearch.toLowerCase();
                                            const name = (c.companyName || `${c.firstname || ''} ${c.lastname || ''}`).toLowerCase();
                                            const city = (c.city || '').toLowerCase();
                                            return name.includes(search) || city.includes(search);
                                          })
                                          .slice(0, 10)
                                          .map((contact) => (
                                            <CommandItem
                                              key={contact.id}
                                              value={contact.companyName || `${contact.firstname} ${contact.lastname}`}
                                              onSelect={() => {
                                                linkScreenMutation.mutate({
                                                  screenId: scr.id,
                                                  moneybirdContactId: contact.moneybirdId,
                                                });
                                                setLinkPopoverOpen(null);
                                                setLinkSearch("");
                                              }}
                                              className="cursor-pointer"
                                            >
                                              <div className="flex flex-col">
                                                <span className="font-medium text-sm">
                                                  {contact.companyName || `${contact.firstname || ''} ${contact.lastname || ''}`}
                                                </span>
                                                {contact.city && (
                                                  <span className="text-xs text-muted-foreground">{contact.city}</span>
                                                )}
                                              </div>
                                            </CommandItem>
                                          ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                          
                          {/* Plaats (rechts van bedrijfsnaam) */}
                          {cityName && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-sm font-medium text-foreground" data-testid={`location-city-${scr.id}`}>
                                {cityName}
                              </span>
                            </>
                          )}
                          {/* Locatie onbekend: gekoppeld maar geen city in Moneybird */}
                          {!cityName && hasMoneybird && (
                            <>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-sm text-orange-500 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Locatie onbekend
                              </span>
                            </>
                          )}
                        </div>
                        
                        {/* Adres info (straat + postcode) - klein onder subtitel */}
                        {hasMoneybird && addressInfo && (
                          <div className="text-xs text-muted-foreground mt-0.5" data-testid={`location-address-${scr.id}`}>
                            {addressInfo}
                          </div>
                        )}
                        
                        {/* EVZ ID (klein, onder adres) */}
                        {scr.screenId && (
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            {scr.screenId}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  {/* Status kolom: LIVE Yodeck status from canonical hook */}
                  <TableCell className={getCellPadding()}>
                    <div className="flex flex-col gap-1">
                      {scr.yodeck.deviceId ? (
                        <>
                          <Badge 
                            variant={liveStatus === "online" ? "default" : "destructive"}
                            className="font-medium w-fit"
                          >
                            {liveStatus === "online" ? "Online" : liveStatus === "offline" ? "Offline" : "Onbekend"}
                          </Badge>
                          {liveScreen && (
                            <Badge 
                              variant={isElevizion ? "outline" : "destructive"}
                              className={`text-xs w-fit ${isElevizion ? "text-green-600 border-green-400" : ""}`}
                            >
                              {isElevizion ? "Elevizion" : "Niet EVZ"}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <Badge 
                          variant="outline"
                          className="font-medium w-fit text-orange-600 border-orange-300"
                        >
                          Geen Yodeck
                        </Badge>
                      )}
                      {placementCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {placementCount} plaatsing{placementCount !== 1 ? "en" : ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  
                  {/* Actie kolom */}
                  <TableCell className={`${getCellPadding()} text-right`} onClick={(e) => e.stopPropagation()}>
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="h-9 px-3 font-medium shadow-sm"
                      asChild 
                      data-testid={`button-open-${scr.id}`}
                    >
                      <Link href={`/screens/${scr.id}`}>
                        Open
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredScreens.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  Geen schermen gevonden
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ScreenForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<{
    screenId: string;
    company: string;
    city: string;
    address: string;
    zipcode: string;
    email: string;
    phone: string;
    kvk: string;
    btw: string;
    yodeckPlayerId: string;
    createMoneybird: boolean;
  }>({
    defaultValues: {
      createMoneybird: true,
    }
  });

  const createMoneybird = watch("createMoneybird");

  const onSubmit = async (data: any) => {
    try {
      const response = await fetch("/api/screens/with-moneybird", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Scherm aanmaken mislukt");
      }

      const result = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["screens"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
      
      toast({ 
        title: "Scherm aangemaakt", 
        description: result.moneybirdContactCreated 
          ? `${data.screenId} met Moneybird contact aangemaakt`
          : `${data.screenId} aangemaakt (zonder Moneybird)`,
      });
      
      onSuccess();
    } catch (error: any) {
      toast({ 
        title: "Fout", 
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="screenId">Scherm ID *</Label>
          <Input 
            id="screenId" 
            placeholder="EVZ-001" 
            {...register("screenId", { required: true })} 
            data-testid="input-screen-id"
          />
          <p className="text-xs text-muted-foreground">Uniek ID in EVZ-XXX formaat</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="yodeckPlayerId">Yodeck Player ID</Label>
          <Input 
            id="yodeckPlayerId" 
            placeholder="12345" 
            {...register("yodeckPlayerId")} 
            data-testid="input-yodeck-id"
          />
          <p className="text-xs text-muted-foreground">Optioneel, later te koppelen</p>
        </div>
      </div>

      <div className="border-t pt-4 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <Checkbox 
            id="createMoneybird" 
            checked={createMoneybird}
            onCheckedChange={(checked) => {
              const event = { target: { name: "createMoneybird", value: checked } };
              register("createMoneybird").onChange(event as any);
            }}
            data-testid="checkbox-create-moneybird"
          />
          <Label htmlFor="createMoneybird" className="font-medium">
            Maak Moneybird contact aan
          </Label>
        </div>

        {createMoneybird && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="grid gap-2">
              <Label htmlFor="company">Bedrijfsnaam *</Label>
              <Input 
                id="company" 
                placeholder="Bakkerij De Groot" 
                {...register("company", { required: createMoneybird })} 
                data-testid="input-company"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="address">Adres</Label>
                <Input 
                  id="address" 
                  placeholder="Hoofdstraat 123" 
                  {...register("address")} 
                  data-testid="input-address"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="zipcode">Postcode</Label>
                <Input 
                  id="zipcode" 
                  placeholder="1234 AB" 
                  {...register("zipcode")} 
                  data-testid="input-zipcode"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="city">Plaats</Label>
              <Input 
                id="city" 
                placeholder="Amsterdam" 
                {...register("city")} 
                data-testid="input-city"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input 
                  id="email" 
                  type="email"
                  placeholder="info@bedrijf.nl" 
                  {...register("email")} 
                  data-testid="input-email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefoon</Label>
                <Input 
                  id="phone" 
                  placeholder="020-1234567" 
                  {...register("phone")} 
                  data-testid="input-phone"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="kvk">KvK-nummer</Label>
                <Input 
                  id="kvk" 
                  placeholder="12345678" 
                  {...register("kvk")} 
                  data-testid="input-kvk"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="btw">BTW-nummer</Label>
                <Input 
                  id="btw" 
                  placeholder="NL123456789B01" 
                  {...register("btw")} 
                  data-testid="input-btw"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button type="submit" disabled={isSubmitting} data-testid="button-submit-screen">
          {isSubmitting ? "Bezig..." : "Scherm Aanmaken"}
        </Button>
      </div>
    </form>
  );
}
