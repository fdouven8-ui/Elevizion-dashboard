import { useState, useMemo } from "react";
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
  ExternalLink
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

export default function Placements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);
  const [advertiserPopoverOpen, setAdvertiserPopoverOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Ads & Plaatsingen</h1>
          <p className="text-muted-foreground">Wie adverteert waar en is alles in orde?</p>
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

      {/* Operational KPIs - only 2 cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Actieve Plaatsingen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="kpi-active">
              {activePlacements.length}
            </div>
          </CardContent>
        </Card>
        <Card className={offlineScreenPlacements.length > 0 ? "border-destructive" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${offlineScreenPlacements.length > 0 ? "text-destructive" : ""}`} />
              Op Offline Schermen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${offlineScreenPlacements.length > 0 ? "text-destructive" : ""}`} data-testid="kpi-offline">
              {offlineScreenPlacements.length}
            </div>
            {offlineScreenPlacements.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Actieve plaatsingen op offline schermen
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
