import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Monitor, Filter, X } from "lucide-react";
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
import { useState, useMemo } from "react";
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

export default function Screens() {
  const { screens, locations, addScreen, placements } = useAppData();
  const [location] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Parse URL params for initial filter state
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const initialStatus = urlParams.get('status');

  // Filter state
  const [cityFilter, setCityFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string[]>(
    initialStatus ? [initialStatus] : []
  );
  const [minPlacements, setMinPlacements] = useState<string>("");
  const [maxPlacements, setMaxPlacements] = useState<string>("");
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);

  // Get unique cities from locations
  const uniqueCities = useMemo(() => {
    const cities = locations
      .map(loc => loc.city)
      .filter((city): city is string => !!city && city.trim() !== "");
    return [...new Set(cities)].sort();
  }, [locations]);

  // Count active placements per screen
  const getActivePlacementsCount = (screenId: string) => {
    return placements.filter(p => 
      p.screenId === screenId && p.isActive
    ).length;
  };

  // Get location for a screen
  const getLocation = (locationId: string) => {
    return locations.find(l => l.id === locationId);
  };

  // Filter logic
  const filteredScreens = useMemo(() => {
    return screens.filter(scr => {
      const loc = getLocation(scr.locationId);

      // City filter (Plaats)
      if (cityFilter && loc?.city !== cityFilter) {
        return false;
      }

      // Location filter (Locatie/Bedrijf)
      if (locationFilter && scr.locationId !== locationFilter) {
        return false;
      }

      // Status filter (multi-select)
      if (statusFilter.length > 0 && !statusFilter.includes(scr.status)) {
        return false;
      }

      // Active placements range
      const placementCount = getActivePlacementsCount(scr.id);
      const minVal = minPlacements ? parseInt(minPlacements, 10) : NaN;
      const maxVal = maxPlacements ? parseInt(maxPlacements, 10) : NaN;
      if (!isNaN(minVal) && placementCount < minVal) {
        return false;
      }
      if (!isNaN(maxVal) && placementCount > maxVal) {
        return false;
      }

      return true;
    });
  }, [screens, cityFilter, locationFilter, statusFilter, minPlacements, maxPlacements, placements, locations]);

  // Filter locations by selected city
  const filteredLocations = useMemo(() => {
    if (!cityFilter) return locations;
    return locations.filter(loc => loc.city === cityFilter);
  }, [locations, cityFilter]);

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Onbekend";
  const getLocationCity = (id: string) => locations.find(l => l.id === id)?.city || "-";
  const selectedLocationName = locationFilter ? getLocationName(locationFilter) : "";

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'default';
      case 'offline': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      default: return status;
    }
  };

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
  };

  const hasActiveFilters = cityFilter || locationFilter || statusFilter.length > 0 || minPlacements || maxPlacements;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

      {/* Inline Filters */}
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
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* City filter (Plaats) - PRIMARY */}
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
                            setLocationFilter(""); // Clear location when city changes
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
                              setLocationFilter(""); // Clear location when city changes
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

            {/* Location filter (Locatie/Bedrijf) - SECONDARY */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Locatie/Bedrijf</Label>
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

            {/* Status filter (multi-select) */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="flex gap-3 h-9 items-center">
                <div className="flex items-center gap-1.5">
                  <Checkbox 
                    id="status-online"
                    checked={statusFilter.includes("online")}
                    onCheckedChange={() => toggleStatusFilter("online")}
                    data-testid="filter-status-online"
                  />
                  <Label htmlFor="status-online" className="text-sm cursor-pointer">Online</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox 
                    id="status-offline"
                    checked={statusFilter.includes("offline")}
                    onCheckedChange={() => toggleStatusFilter("offline")}
                    data-testid="filter-status-offline"
                  />
                  <Label htmlFor="status-offline" className="text-sm cursor-pointer">Offline</Label>
                </div>
              </div>
            </div>

            {/* Active placements range */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Actieve plaatsingen</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  placeholder="Min" 
                  className="h-9 w-16"
                  value={minPlacements}
                  onChange={(e) => setMinPlacements(e.target.value)}
                  data-testid="filter-min-placements"
                />
                <span className="text-muted-foreground self-center">-</span>
                <Input 
                  type="number" 
                  placeholder="Max" 
                  className="h-9 w-16"
                  value={maxPlacements}
                  onChange={(e) => setMaxPlacements(e.target.value)}
                  data-testid="filter-max-placements"
                />
              </div>
            </div>

            {/* Results count */}
            <div className="flex items-end">
              <Badge variant="secondary" className="h-9 px-3">
                {filteredScreens.length} / {screens.length} schermen
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screens Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Screen ID</TableHead>
              <TableHead>Yodeck Naam</TableHead>
              <TableHead>Plaats</TableHead>
              <TableHead>Locatie/Bedrijf</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="text-center">Actieve plaatsingen</TableHead>
              <TableHead className="w-[100px] text-right">Actie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScreens.map((scr) => (
              <TableRow key={scr.id} data-testid={`screen-row-${scr.id}`}>
                <TableCell className="font-medium font-mono">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    {scr.screenId || scr.name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {scr.yodeckPlayerName || "-"}
                </TableCell>
                <TableCell>{getLocationCity(scr.locationId)}</TableCell>
                <TableCell>{getLocationName(scr.locationId)}</TableCell>
                <TableCell>
                  <Badge variant={getStatusColor(scr.status) as any}>
                    {getStatusLabel(scr.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm max-w-[200px] truncate" title={
                  scr.yodeckContentCount === null || scr.yodeckContentCount === undefined
                    ? "Onbekend"
                    : scr.yodeckContentCount === 0
                    ? "Leeg"
                    : (scr.yodeckContentSummary?.topItems?.join(" • ") || `${scr.yodeckContentCount} items`)
                }>
                  {scr.yodeckContentCount === null || scr.yodeckContentCount === undefined ? (
                    <span className="text-muted-foreground">Onbekend</span>
                  ) : scr.yodeckContentCount === 0 ? (
                    <span className="text-orange-500">Leeg</span>
                  ) : (
                    <span className="text-green-600">
                      {scr.yodeckContentSummary?.topItems?.slice(0, 2).join(" • ") || `${scr.yodeckContentCount} items`}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{getActivePlacementsCount(scr.id)}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild data-testid={`button-open-${scr.id}`}>
                    <Link href={`/screens/${scr.id}`}>
                      Open
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredScreens.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
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
