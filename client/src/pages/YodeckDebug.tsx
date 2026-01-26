/**
 * Yodeck Debug Page - UNIFIED VERSION with Playlist Items
 * Uses ONLY useCanonicalScreens hook for live data (per HARDEN+UNIFY spec)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw, Zap, CheckCircle, XCircle, AlertCircle, Monitor, ExternalLink, Code, Shield, Play, Upload, List } from "lucide-react";
import { useCanonicalScreens } from "@/hooks/useCanonicalScreens";
import { apiRequest } from "@/lib/queryClient";

interface RawScreenData {
  ok: boolean;
  fetchedAt: string;
  urlUsed: string;
  raw: any;
  mapped: any;
  error?: string;
}

interface PlaylistSummary {
  ok: boolean;
  locationId: string;
  locationName: string;
  base: {
    playlistId: string | null;
    playlistName: string | null;
    itemCount: number;
    items: { id: number; name: string; type: string }[];
  };
  ads: {
    playlistId: string | null;
    playlistName: string | null;
    itemCount: number;
    items: { id: number; name: string; type: string }[];
  };
  error?: string;
}

interface ComplianceResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  before: {
    sourceType: string;
    sourceName: string | null;
    isElevizion: boolean;
  };
  after: {
    sourceType: string;
    sourceName: string | null;
    isElevizion: boolean;
  };
  logs: string[];
  verifyAttempts: number;
  finalStatus: "PASS" | "FAIL";
  fallbackUsed: boolean;
  error?: string;
}

interface AttachMediaResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  adsPlaylistId: string | null;
  mediaId: string;
  appended: boolean;
  pushed: boolean;
  verified: boolean;
  logs: string[];
  error?: string;
}

export default function YodeckDebug() {
  const queryClient = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [lastResult, setLastResult] = useState<ComplianceResult | null>(null);
  const [mediaIdInput, setMediaIdInput] = useState<string>("");
  const [lastAttachResult, setLastAttachResult] = useState<AttachMediaResult | null>(null);

  console.debug("[YodeckDebug] Using unified canonical screens hook");

  const { 
    screens, 
    isLoading: screensLoading, 
    isRefetching,
    refresh,
    ensureCompliance,
    forceReset,
    isEnsuringCompliance,
    isResetting,
    generatedAt,
  } = useCanonicalScreens();

  const selectedScreen = screens.find(s => s.locationId === selectedLocation);

  // Playlist summary query
  const { data: playlistSummary, refetch: refetchPlaylist } = useQuery<PlaylistSummary>({
    queryKey: ["/api/admin/locations/playlist-summary", selectedLocation],
    queryFn: async () => {
      const res = await fetch(`/api/admin/locations/${selectedLocation}/playlist-summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedLocation,
    refetchInterval: false,
  });

  // Raw data query
  const { data: rawData } = useQuery<RawScreenData>({
    queryKey: ["/api/admin/yodeck/raw/screens", selectedScreen?.yodeckDeviceId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/yodeck/raw/screens/${selectedScreen?.yodeckDeviceId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedScreen?.yodeckDeviceId,
    refetchInterval: false,
  });

  // Attach media mutation
  const attachMediaMutation = useMutation({
    mutationFn: async ({ locationId, mediaId }: { locationId: string; mediaId: string }) => {
      const res = await apiRequest("POST", `/api/admin/locations/${locationId}/attach-media`, { mediaId });
      return await res.json() as AttachMediaResult;
    },
    onSuccess: (data) => {
      setLastAttachResult(data);
      refetchPlaylist();
      refresh();
    },
  });

  // Push screen mutation
  const pushScreenMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("POST", `/api/admin/screens/${locationId}/push`, {});
      return await res.json();
    },
    onSuccess: () => {
      refresh();
    },
  });

  const handleEnsureCompliance = async () => {
    if (!selectedLocation) return;
    try {
      const result = await ensureCompliance(selectedLocation) as ComplianceResult;
      setLastResult(result);
      refresh();
    } catch (error: any) {
      setLastResult({
        ok: false,
        locationId: selectedLocation,
        locationName: selectedScreen?.screenName || "Unknown",
        before: { sourceType: "unknown", sourceName: null, isElevizion: false },
        after: { sourceType: "unknown", sourceName: null, isElevizion: false },
        logs: [error.message],
        verifyAttempts: 0,
        finalStatus: "FAIL",
        fallbackUsed: false,
        error: error.message,
      });
    }
  };

  const handleForceReset = async () => {
    if (!selectedLocation) return;
    try {
      const result = await forceReset(selectedLocation) as ComplianceResult;
      setLastResult(result);
      refresh();
    } catch (error: any) {
      setLastResult({
        ok: false,
        locationId: selectedLocation,
        locationName: selectedScreen?.screenName || "Unknown",
        before: { sourceType: "unknown", sourceName: null, isElevizion: false },
        after: { sourceType: "unknown", sourceName: null, isElevizion: false },
        logs: [error.message],
        verifyAttempts: 0,
        finalStatus: "FAIL",
        fallbackUsed: false,
        error: error.message,
      });
    }
  };

  const handleAttachMedia = () => {
    if (!selectedLocation || !mediaIdInput.trim()) return;
    attachMediaMutation.mutate({ locationId: selectedLocation, mediaId: mediaIdInput.trim() });
  };

  return (
    <div className="space-y-6" data-testid="yodeck-debug-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Yodeck Debug & Force Tools</h1>
          <p className="text-muted-foreground">
            UNIFIED: Live data via canonical endpoint
            {generatedAt && <span className="ml-2 text-xs">({new Date(generatedAt).toLocaleTimeString()})</span>}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refresh()}
          disabled={isRefetching}
          data-testid="refresh-canonical-button"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Ververs
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Selecteer Scherm
          </CardTitle>
          <CardDescription>
            {screens.length} schermen beschikbaar (live van Yodeck API)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select 
            value={selectedLocation} 
            onValueChange={setSelectedLocation}
            data-testid="screen-select"
          >
            <SelectTrigger className="w-full" data-testid="screen-select-trigger">
              <SelectValue placeholder="Kies een scherm..." />
            </SelectTrigger>
            <SelectContent>
              {screensLoading && <SelectItem value="_loading" disabled>Laden...</SelectItem>}
              {screens.map((screen) => (
                <SelectItem key={screen.locationId} value={screen.locationId} data-testid={`screen-option-${screen.locationId}`}>
                  {screen.screenName} (YDK: {screen.yodeckDeviceId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1"
              disabled={!selectedLocation || isEnsuringCompliance}
              onClick={handleEnsureCompliance}
              data-testid="ensure-compliance-button"
            >
              {isEnsuringCompliance ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Ensure Compliance
            </Button>

            <Button
              size="lg"
              variant="destructive"
              disabled={!selectedLocation || isResetting}
              onClick={handleForceReset}
              data-testid="force-reset-button"
            >
              {isResetting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Force Reset
            </Button>

            <Button
              size="lg"
              variant="secondary"
              disabled={!selectedLocation || pushScreenMutation.isPending}
              onClick={() => selectedLocation && pushScreenMutation.mutate(selectedLocation)}
              data-testid="push-screen-button"
            >
              {pushScreenMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Push Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedScreen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Live Status: {selectedScreen.screenName}
              {selectedScreen.isElevizion ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Elevizion
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Niet Elevizion
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Online Status:</span>
                <Badge 
                  variant={selectedScreen.onlineStatus === "online" ? "default" : "destructive"} 
                  className="ml-2"
                >
                  {selectedScreen.onlineStatus === "online" ? "Online" : 
                   selectedScreen.onlineStatus === "offline" ? "Offline" : "Onbekend"}
                </Badge>
              </div>
              <div>
                <span className="font-medium">Content:</span>
                <Badge variant="outline" className="ml-2">
                  {selectedScreen.sourceType.toUpperCase()}
                </Badge>
              </div>
              <div>
                <span className="font-medium">Bron:</span>
                <span className="ml-2">{selectedScreen.sourceName || "—"}</span>
              </div>
              <div>
                <span className="font-medium">Source ID:</span>
                <span className="ml-2">{selectedScreen.sourceId || "—"}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <a
                href={`https://app.yodeck.com/index.html#monitors/${selectedScreen.yodeckDeviceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Yodeck
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {playlistSummary && playlistSummary.ok && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Playlist Items
            </CardTitle>
            <CardDescription>
              Content in BASE en ADS playlists voor {playlistSummary.locationName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  BASE Playlist
                  <Badge variant="outline">{playlistSummary.base.itemCount} items</Badge>
                </h4>
                {playlistSummary.base.playlistId ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      ID: {playlistSummary.base.playlistId} • {playlistSummary.base.playlistName}
                    </p>
                    {playlistSummary.base.items.length > 0 ? (
                      <ul className="text-xs space-y-1">
                        {playlistSummary.base.items.slice(0, 5).map((item, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
                            <span className="truncate">{item.name}</span>
                          </li>
                        ))}
                        {playlistSummary.base.items.length > 5 && (
                          <li className="text-muted-foreground">... en {playlistSummary.base.items.length - 5} meer</li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Geen items</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Geen BASE playlist geconfigureerd</p>
                )}
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  ADS Playlist
                  <Badge variant="default">{playlistSummary.ads.itemCount} items</Badge>
                </h4>
                {playlistSummary.ads.playlistId ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      ID: {playlistSummary.ads.playlistId} • {playlistSummary.ads.playlistName}
                    </p>
                    {playlistSummary.ads.items.length > 0 ? (
                      <ul className="text-xs space-y-1">
                        {playlistSummary.ads.items.slice(0, 5).map((item, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
                            <span className="truncate">{item.name}</span>
                          </li>
                        ))}
                        {playlistSummary.ads.items.length > 5 && (
                          <li className="text-muted-foreground">... en {playlistSummary.ads.items.length - 5} meer</li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Geen items</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Geen ADS playlist geconfigureerd</p>
                )}
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Attach Media to ADS Playlist
              </h4>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="mediaId" className="sr-only">Media ID</Label>
                  <Input
                    id="mediaId"
                    placeholder="Yodeck Media ID (bijv. 123456)"
                    value={mediaIdInput}
                    onChange={(e) => setMediaIdInput(e.target.value)}
                    data-testid="media-id-input"
                  />
                </div>
                <Button
                  onClick={handleAttachMedia}
                  disabled={!selectedLocation || !mediaIdInput.trim() || attachMediaMutation.isPending}
                  data-testid="attach-media-button"
                >
                  {attachMediaMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Attach & Push
                </Button>
              </div>
              {lastAttachResult && (
                <div className={`mt-3 p-3 rounded text-sm ${lastAttachResult.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {lastAttachResult.ok ? (
                    <p><CheckCircle className="h-4 w-4 inline mr-1" /> Media toegevoegd aan ADS playlist!</p>
                  ) : (
                    <p><XCircle className="h-4 w-4 inline mr-1" /> Fout: {lastAttachResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card className={lastResult.finalStatus === "PASS" ? "border-green-500" : "border-red-500"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastResult.finalStatus === "PASS" ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Laatste Actie: {lastResult.finalStatus}
              {lastResult.fallbackUsed && (
                <Badge variant="outline" className="ml-2 text-yellow-600">FALLBACK_USED</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Locatie:</p>
                <p>{lastResult.locationName}</p>
              </div>
              <div>
                <p className="font-medium">Verify Attempts:</p>
                <p>{lastResult.verifyAttempts}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-medium text-sm mb-2">Before:</p>
                <p className="text-xs">Type: {lastResult.before.sourceType}</p>
                <p className="text-xs">Name: {lastResult.before.sourceName || "—"}</p>
                <p className="text-xs">Elevizion: {lastResult.before.isElevizion ? "Ja" : "Nee"}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-medium text-sm mb-2">After:</p>
                <p className="text-xs">Type: {lastResult.after.sourceType}</p>
                <p className="text-xs">Name: {lastResult.after.sourceName || "—"}</p>
                <p className="text-xs">Elevizion: {lastResult.after.isElevizion ? "Ja" : "Nee"}</p>
              </div>
            </div>

            {lastResult.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded">
                <p className="font-medium text-red-800">Error:</p>
                <p className="text-sm text-red-700">{lastResult.error}</p>
              </div>
            )}

            <Accordion type="single" collapsible>
              <AccordionItem value="logs">
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Action Logs ({lastResult.logs.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-64">
                    {lastResult.logs.join("\n")}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {rawData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Raw Yodeck API Response (Debug)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="raw">
                <AccordionTrigger>Raw JSON</AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-96">
                    {JSON.stringify(rawData.raw, null, 2)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="mapped">
                <AccordionTrigger>Mapped (yodeckScreenMapper)</AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-96">
                    {JSON.stringify(rawData.mapped, null, 2)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
