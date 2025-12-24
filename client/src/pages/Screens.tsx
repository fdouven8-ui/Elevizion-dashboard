import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Monitor, Filter, X, Rows3, Rows4, LayoutGrid, Search, ExternalLink } from "lucide-react";
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
  if (screen?.name && screen.name.trim()) {
    return screen.name;
  }
  if (location?.name && location.name.trim()) {
    return location.name;
  }
  if (screen?.screenId) {
    return `Scherm ${screen.screenId}`;
  }
  return "Onbekend scherm";
}

export default function Screens() {
  const { screens, locations, placements } = useAppData();
  const [location, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [rowDensity, setRowDensity] = useState<RowDensity>("normal");

  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const initialStatus = urlParams.get('status');

  const [cityFilter, setCityFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string[]>(
    initialStatus ? [initialStatus] : []
  );
  const [minPlacements, setMinPlacements] = useState<string>("");
  const [maxPlacements, setMaxPlacements] = useState<string>("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim().toLowerCase());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const uniqueCities = useMemo(() => {
    const cities = locations
      .map(loc => loc.city)
      .filter((city): city is string => !!city && city.trim() !== "");
    return Array.from(new Set(cities)).sort();
  }, [locations]);

  const getActivePlacementsCount = (screenId: string) => {
    return placements.filter(p => 
      p.screenId === screenId && p.isActive
    ).length;
  };

  const getLocation = (locationId: string) => {
    return locations.find(l => l.id === locationId);
  };

  const filteredScreens = useMemo(() => {
    return screens.filter(scr => {
      const loc = getLocation(scr.locationId);

      if (cityFilter && loc?.city !== cityFilter) {
        return false;
      }

      if (locationFilter && scr.locationId !== locationFilter) {
        return false;
      }

      if (statusFilter.length > 0 && !statusFilter.includes(scr.status)) {
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
        const displayName = getScreenDisplayName(scr, loc).toLowerCase();
        const screenId = (scr.screenId || "").toLowerCase();
        const yodeckIdRaw = (scr.yodeckPlayerId || "").toLowerCase();
        const yodeckIdPrefixed = scr.yodeckPlayerId ? `ydk-${scr.yodeckPlayerId}`.toLowerCase() : "";
        const city = (loc?.city || "").toLowerCase();
        const locName = (loc?.name || "").toLowerCase();
        const summary = scr.yodeckContentSummary as { topItems?: string[] } | null;
        const contentStr = (summary?.topItems || []).join(" ").toLowerCase();
        
        const searchMatch = 
          displayName.includes(searchQuery) ||
          screenId.includes(searchQuery) ||
          yodeckIdRaw.includes(searchQuery) ||
          yodeckIdPrefixed.includes(searchQuery) ||
          city.includes(searchQuery) ||
          locName.includes(searchQuery) ||
          contentStr.includes(searchQuery);
        
        if (!searchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [screens, cityFilter, locationFilter, statusFilter, minPlacements, maxPlacements, placements, locations, searchQuery]);

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
    setMinPlacements("");
    setMaxPlacements("");
    setSearchInput("");
  };

  const hasActiveFilters = cityFilter || locationFilter || statusFilter.length > 0 || minPlacements || maxPlacements || searchInput;

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
          <p className="text-muted-foreground text-sm">Monitor en beheer je digital signage displays</p>
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
            <ScreenForm onSuccess={() => setIsDialogOpen(false)} locations={locations} />
          </DialogContent>
        </Dialog>
      </div>

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
                {filteredScreens.length} / {screens.length}
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

      {/* Screens Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={getCellPadding()}>Scherm</TableHead>
              <TableHead className={getCellPadding()}>Locatie / Bedrijf</TableHead>
              <TableHead className={getCellPadding()}>Status</TableHead>
              <TableHead className={getCellPadding()}>Content</TableHead>
              <TableHead className={`${getCellPadding()} text-center`}>Plaatsingen</TableHead>
              <TableHead className={`${getCellPadding()} w-[100px] text-right`}>Actie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={getRowClasses()}>
            {filteredScreens.map((scr) => {
              const loc = getLocation(scr.locationId);
              const displayName = getScreenDisplayName(scr, loc);
              const placementCount = getActivePlacementsCount(scr.id);
              
              const summary = scr.yodeckContentSummary as { topItems?: string[] } | null;
              const contentItems = summary?.topItems || [];
              const firstContentItem = contentItems[0] || null;
              const contentTooltip = contentItems.length > 0 
                ? contentItems.join(" • ") 
                : (scr.yodeckContentCount === 0 ? "Leeg" : "Onbekend");
              
              return (
                <TableRow 
                  key={scr.id} 
                  data-testid={`screen-row-${scr.id}`}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setLocation(`/screens/${scr.id}`)}
                >
                  {/* Scherm column: name + EVZ-ID + YDK subtitle */}
                  <TableCell className={getCellPadding()}>
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{displayName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {scr.screenId && <span>{scr.screenId}</span>}
                          {scr.yodeckPlayerId && <span>• YDK-{scr.yodeckPlayerId}</span>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  
                  {/* Locatie / Bedrijf */}
                  <TableCell className={getCellPadding()}>
                    <div className="min-w-0">
                      <div className="truncate">{loc?.name || "-"}</div>
                      {loc?.city && (
                        <div className="text-xs text-muted-foreground">{loc.city}</div>
                      )}
                    </div>
                  </TableCell>
                  
                  {/* Status */}
                  <TableCell className={getCellPadding()}>
                    <Badge 
                      variant={scr.status === "online" ? "default" : "destructive"}
                      className="font-medium"
                    >
                      {scr.status === "online" ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  
                  {/* Content */}
                  <TableCell className={getCellPadding()}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="max-w-[180px] truncate cursor-default">
                            {scr.yodeckContentCount === null || scr.yodeckContentCount === undefined ? (
                              <span className="text-muted-foreground">Onbekend</span>
                            ) : scr.yodeckContentCount === 0 ? (
                              <span className="text-orange-500">Leeg</span>
                            ) : firstContentItem ? (
                              <span className="text-muted-foreground">
                                media: {firstContentItem}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{scr.yodeckContentCount} items</span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[300px]">
                          <p className="text-sm">{contentTooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  
                  {/* Actieve plaatsingen */}
                  <TableCell className={`${getCellPadding()} text-center`}>
                    <Badge 
                      variant={placementCount > 0 ? "secondary" : "outline"}
                      className={placementCount === 0 ? "text-muted-foreground" : ""}
                    >
                      {placementCount}
                    </Badge>
                  </TableCell>
                  
                  {/* Actie */}
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
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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

function ScreenForm({ onSuccess, locations }: { onSuccess: () => void, locations: any[] }) {
  const { addScreen } = useAppData();
  const { register, handleSubmit, setValue } = useForm<any>();

  const onSubmit = (data: any) => {
    addScreen(data);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Schermnaam</Label>
        <Input id="name" {...register("name", { required: true })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="location">Locatie</Label>
        <Select onValueChange={(val) => setValue("locationId", val)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecteer locatie" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="yodeckId">Yodeck Player ID (Optioneel)</Label>
        <Input id="yodeckId" {...register("yodeckPlayerId")} />
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit">Scherm Aanmaken</Button>
      </div>
    </form>
  );
}
