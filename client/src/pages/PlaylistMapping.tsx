import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  RefreshCw, Save, Wand2, Search, CheckCircle, AlertCircle, XCircle, Loader2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Location {
  id: string;
  name: string;
  city: string | null;
  status: string;
  yodeckPlayerId: string | null;
  yodeckPlaylistId: string | null;
}

interface YodeckScreen {
  id: number;
  name: string;
  status: string;
  workspace: string | null;
}

interface YodeckPlaylist {
  id: number;
  name: string;
  workspace: string | null;
}

interface AutoMatchSuggestion {
  locationId: string;
  locationName: string;
  suggestedScreenId: number | null;
  suggestedScreenName: string | null;
  suggestedPlaylistId: number | null;
  suggestedPlaylistName: string | null;
  screenScore: number;
  playlistScore: number;
}

interface MappingChange {
  locationId: string;
  yodeckPlayerId: string | null;
  yodeckPlaylistId: string | null;
}

export default function PlaylistMapping() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [changes, setChanges] = useState<Map<string, MappingChange>>(new Map());
  
  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      return res.json();
    },
  });
  
  const { data: screens = [], isLoading: screensLoading, refetch: refetchScreens } = useQuery<YodeckScreen[]>({
    queryKey: ["yodeck-mapping-screens"],
    queryFn: async () => {
      const res = await fetch("/api/yodeck/mapping/screens");
      if (!res.ok) throw new Error("Failed to fetch screens");
      return res.json();
    },
  });
  
  const { data: playlists = [], isLoading: playlistsLoading, refetch: refetchPlaylists } = useQuery<YodeckPlaylist[]>({
    queryKey: ["yodeck-mapping-playlists"],
    queryFn: async () => {
      const res = await fetch("/api/yodeck/mapping/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
  });
  
  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/locations/auto-match-yodeck", { method: "POST" });
      if (!res.ok) throw new Error("Auto-match failed");
      return res.json() as Promise<{ suggestions: AutoMatchSuggestion[] }>;
    },
    onSuccess: (data) => {
      const newChanges = new Map(changes);
      let applied = 0;
      
      for (const suggestion of data.suggestions) {
        const location = locations.find(l => l.id === suggestion.locationId);
        if (!location) continue;
        
        const change: MappingChange = {
          locationId: suggestion.locationId,
          yodeckPlayerId: location.yodeckPlayerId,
          yodeckPlaylistId: location.yodeckPlaylistId,
        };
        
        if (suggestion.suggestedScreenId && !location.yodeckPlayerId) {
          change.yodeckPlayerId = String(suggestion.suggestedScreenId);
          applied++;
        }
        if (suggestion.suggestedPlaylistId && !location.yodeckPlaylistId) {
          change.yodeckPlaylistId = String(suggestion.suggestedPlaylistId);
          applied++;
        }
        
        if (change.yodeckPlayerId !== location.yodeckPlayerId || 
            change.yodeckPlaylistId !== location.yodeckPlaylistId) {
          newChanges.set(suggestion.locationId, change);
        }
      }
      
      setChanges(newChanges);
      toast({
        title: "Auto-match voltooid",
        description: `${applied} suggesties toegepast. Controleer en sla op.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Auto-match mislukt",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  
  const bulkSaveMutation = useMutation({
    mutationFn: async (mappings: MappingChange[]) => {
      const res = await fetch("/api/locations/bulk-yodeck-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      if (!res.ok) throw new Error("Opslaan mislukt");
      return res.json();
    },
    onSuccess: (data) => {
      setChanges(new Map());
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["active-regions"] });
      toast({
        title: "Opgeslagen",
        description: data.message,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Opslaan mislukt",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  
  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/yodeck/mapping/clear-cache", { method: "POST" });
    },
    onSuccess: () => {
      refetchScreens();
      refetchPlaylists();
      toast({
        title: "Cache gewist",
        description: "Yodeck data wordt opnieuw geladen",
      });
    },
  });
  
  const filteredLocations = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return locations.filter(l => 
      l.name.toLowerCase().includes(query) ||
      (l.city && l.city.toLowerCase().includes(query))
    );
  }, [locations, searchQuery]);
  
  const getEffectiveValue = (locationId: string, field: "yodeckPlayerId" | "yodeckPlaylistId") => {
    const change = changes.get(locationId);
    if (change) return change[field];
    const location = locations.find(l => l.id === locationId);
    return location ? location[field] : null;
  };
  
  const handleChange = (locationId: string, field: "yodeckPlayerId" | "yodeckPlaylistId", value: string | null) => {
    const location = locations.find(l => l.id === locationId);
    if (!location) return;
    
    const existing = changes.get(locationId) || {
      locationId,
      yodeckPlayerId: location.yodeckPlayerId,
      yodeckPlaylistId: location.yodeckPlaylistId,
    };
    
    const updated = { ...existing, [field]: value };
    
    if (updated.yodeckPlayerId === location.yodeckPlayerId && 
        updated.yodeckPlaylistId === location.yodeckPlaylistId) {
      const newChanges = new Map(changes);
      newChanges.delete(locationId);
      setChanges(newChanges);
    } else {
      setChanges(new Map(changes).set(locationId, updated));
    }
  };
  
  const getStatusBadge = (location: Location) => {
    const playerId = getEffectiveValue(location.id, "yodeckPlayerId");
    const playlistId = getEffectiveValue(location.id, "yodeckPlaylistId");
    
    if (playlistId && playerId) {
      return <Badge variant="default" className="bg-emerald-500"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge>;
    }
    if (playlistId && !playerId) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><AlertCircle className="h-3 w-3 mr-1" />Geen scherm</Badge>;
    }
    if (location.status === "active" && !playlistId) {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Missend</Badge>;
    }
    return <Badge variant="outline">Inactief</Badge>;
  };
  
  const hasChanges = changes.size > 0;
  const isLoading = locationsLoading || screensLoading || playlistsLoading;
  
  const stats = useMemo(() => {
    const active = locations.filter(l => l.status === "active").length;
    const withPlaylist = locations.filter(l => l.yodeckPlaylistId).length;
    const withScreen = locations.filter(l => l.yodeckPlayerId).length;
    return { active, withPlaylist, withScreen };
  }, [locations]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Playlist Koppeling</h1>
          <p className="text-slate-600">Koppel locaties aan Yodeck schermen en playlists</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refreshCacheMutation.mutate()}
            disabled={refreshCacheMutation.isPending}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshCacheMutation.isPending ? "animate-spin" : ""}`} />
            Ververs Yodeck
          </Button>
          <Button 
            variant="outline" 
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending || isLoading}
            data-testid="button-auto-match"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {autoMatchMutation.isPending ? "Matchen..." : "Auto-match"}
          </Button>
          <Button
            onClick={() => bulkSaveMutation.mutate(Array.from(changes.values()))}
            disabled={!hasChanges || bulkSaveMutation.isPending}
            data-testid="button-bulk-save"
          >
            <Save className="h-4 w-4 mr-2" />
            {bulkSaveMutation.isPending ? "Opslaan..." : `Opslaan (${changes.size})`}
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Actieve locaties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-active-count">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Met playlist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600" data-testid="text-playlist-count">{stats.withPlaylist}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Yodeck schermen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600" data-testid="text-screens-count">{screens.length}</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Locatie Koppelingen</CardTitle>
          <CardDescription>
            Selecteer per locatie het juiste Yodeck scherm en playlist
          </CardDescription>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Zoek op naam of stad..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-500">Laden...</span>
            </div>
          ) : (
            <div className="rounded-md border max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-[200px]">Locatie</TableHead>
                    <TableHead className="w-[100px]">Stad</TableHead>
                    <TableHead className="w-[200px]">Yodeck Scherm</TableHead>
                    <TableHead className="w-[200px]">Yodeck Playlist</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLocations.map((location) => (
                    <TableRow 
                      key={location.id}
                      className={changes.has(location.id) ? "bg-amber-50" : ""}
                      data-testid={`row-location-${location.id}`}
                    >
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell className="text-slate-500">{location.city || "-"}</TableCell>
                      <TableCell>
                        <Select
                          value={getEffectiveValue(location.id, "yodeckPlayerId") || "none"}
                          onValueChange={(v) => handleChange(location.id, "yodeckPlayerId", v === "none" ? null : v)}
                        >
                          <SelectTrigger className="w-full" data-testid={`select-screen-${location.id}`}>
                            <SelectValue placeholder="Geen scherm" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Geen scherm</SelectItem>
                            {screens.map((screen) => (
                              <SelectItem key={screen.id} value={String(screen.id)}>
                                {screen.name} {screen.status === "online" ? "🟢" : "⚫"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={getEffectiveValue(location.id, "yodeckPlaylistId") || "none"}
                          onValueChange={(v) => handleChange(location.id, "yodeckPlaylistId", v === "none" ? null : v)}
                        >
                          <SelectTrigger className="w-full" data-testid={`select-playlist-${location.id}`}>
                            <SelectValue placeholder="Geen playlist" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Geen playlist</SelectItem>
                            {playlists.map((playlist) => (
                              <SelectItem key={playlist.id} value={String(playlist.id)}>
                                {playlist.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{getStatusBadge(location)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredLocations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        Geen locaties gevonden
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
