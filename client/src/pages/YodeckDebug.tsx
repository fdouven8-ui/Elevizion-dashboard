import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw, Zap, CheckCircle, XCircle, AlertCircle, Monitor, ExternalLink, Code } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ScreenOption {
  id: string;
  name: string;
  yodeckDeviceId: string;
}

interface ScreenStatus {
  ok: boolean;
  mode: string;
  rawContentType?: string;
  layoutId?: string;
  layoutName?: string;
  playlistId?: string;
  playlistName?: string;
  isElevizionLayout: boolean;
  lastSeenOnline?: string;
  lastScreenshotAt?: string;
  isOnline?: boolean;
  error?: string;
  rawKeysUsed?: {
    contentModeField: string | null;
    contentModeValue: string | null;
    playlistIdField: string | null;
    layoutIdField: string | null;
    layoutNameField: string | null;
    onlineField: string | null;
  };
  warnings?: string[];
  fetchedAt?: string;
}

interface RawScreenData {
  ok: boolean;
  fetchedAt: string;
  urlUsed: string;
  raw: any;
  mapped: any;
  error?: string;
}

interface ForceFixResult {
  locationId: string;
  screenId: string;
  locationName: string;
  before: {
    mode: string;
    playlistName?: string;
    layoutName?: string;
    layoutId?: string;
    isElevizion: boolean;
    fetchedAt: string;
  };
  after: {
    mode: string;
    playlistName?: string;
    layoutName?: string;
    layoutId?: string;
    isElevizion: boolean;
    fetchedAt: string;
  };
  actionLog: string[];
  finalStatus: "PASS" | "FAIL";
  failReason?: string;
  screenshotTimestamp?: string;
}

interface SyncResult {
  syncedAt: string;
  screenCount: number;
  layoutCount: number;
  playlistCount: number;
}

export default function YodeckDebug() {
  const queryClient = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [lastResult, setLastResult] = useState<ForceFixResult | null>(null);

  const { data: screensData, isLoading: screensLoading } = useQuery<{ screens: ScreenOption[] }>({
    queryKey: ["/api/admin/yodeck-debug/screens"],
  });

  const selectedScreen = screensData?.screens.find((s: ScreenOption) => s.id === selectedLocation);

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<ScreenStatus>({
    queryKey: ["/api/admin/yodeck-debug/status", selectedScreen?.yodeckDeviceId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/yodeck-debug/status/${selectedScreen?.yodeckDeviceId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedScreen?.yodeckDeviceId,
    refetchInterval: false,
  });

  const { data: rawData, isLoading: rawLoading, refetch: refetchRaw } = useQuery<RawScreenData>({
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

  const forceFix = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("POST", "/api/admin/yodeck-debug/force-fix", { locationId });
      return await res.json() as ForceFixResult;
    },
    onSuccess: (data) => {
      setLastResult(data);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/yodeck-debug/status"] });
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/yodeck-debug/sync", {});
      return await res.json() as SyncResult;
    },
    onSuccess: () => {
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/yodeck-debug/screens"] });
    },
  });

  return (
    <div className="space-y-6" data-testid="yodeck-debug-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Yodeck Debug & Force Tools</h1>
          <p className="text-muted-foreground">If you can see this page, routing is fixed.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Selecteer Scherm
          </CardTitle>
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
              {screensData?.screens.map((screen) => (
                <SelectItem key={screen.id} value={screen.id} data-testid={`screen-option-${screen.id}`}>
                  {screen.name} (ID: {screen.yodeckDeviceId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1"
              disabled={!selectedLocation || forceFix.isPending}
              onClick={() => forceFix.mutate(selectedLocation)}
              data-testid="force-elevizion-button"
            >
              {forceFix.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Force Elevizion Layout op dit Scherm
            </Button>

            <Button
              variant="outline"
              size="lg"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
              data-testid="sync-button"
            >
              {sync.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Status
            </Button>
          </div>

          {sync.data && (
            <p className="text-sm text-muted-foreground" data-testid="sync-result">
              Laatste sync: {new Date(sync.data.syncedAt).toLocaleString("nl-NL")} — 
              {sync.data.screenCount} screens, {sync.data.layoutCount} layouts, {sync.data.playlistCount} playlists
            </p>
          )}
        </CardContent>
      </Card>

      {selectedScreen && (
        <Card data-testid="current-state-panel">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>A) Huidige Yodeck Status (Live)</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => refetchStatus()}
                disabled={statusLoading}
                data-testid="refresh-status-button"
              >
                <RefreshCw className={`h-4 w-4 ${statusLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <p className="text-muted-foreground">Laden...</p>
            ) : statusData ? (
              <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="status-grid">
                <div>
                  <p className="text-sm text-muted-foreground">Screen ID</p>
                  <p className="font-mono text-sm" data-testid="status-screen-id">{selectedScreen.yodeckDeviceId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Mode (parsed)</p>
                  <Badge variant={statusData.mode === "layout" ? "default" : "secondary"} data-testid="status-mode">
                    {statusData.mode}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Raw Content Type</p>
                  <p className="font-mono text-xs" data-testid="status-raw-content-type">{statusData.rawContentType || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Online Status</p>
                  {statusData.isOnline ? (
                    <Badge variant="default" className="bg-green-600" data-testid="status-online">
                      <CheckCircle className="h-3 w-3 mr-1" /> Online
                    </Badge>
                  ) : (
                    <Badge variant="secondary" data-testid="status-online">
                      Offline/Onbekend
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Layout/Playlist Naam</p>
                  <p className="font-medium" data-testid="status-layout-name">{statusData.layoutName || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Layout ID</p>
                  <p className="font-mono text-sm" data-testid="status-layout-id">{statusData.layoutId || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Is Elevizion Layout?</p>
                  {statusData.isElevizionLayout ? (
                    <Badge variant="default" className="bg-green-600" data-testid="status-is-elevizion">
                      <CheckCircle className="h-3 w-3 mr-1" /> Ja
                    </Badge>
                  ) : (
                    <Badge variant="destructive" data-testid="status-is-elevizion">
                      <XCircle className="h-3 w-3 mr-1" /> Nee
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Laatst Online</p>
                  <p className="font-medium text-sm" data-testid="status-last-seen">
                    {statusData.lastSeenOnline 
                      ? new Date(statusData.lastSeenOnline).toLocaleString("nl-NL")
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Laatste Screenshot</p>
                  <p className="font-medium text-sm" data-testid="status-last-screenshot">
                    {statusData.lastScreenshotAt 
                      ? new Date(statusData.lastScreenshotAt).toLocaleString("nl-NL")
                      : "-"}
                  </p>
                </div>
                {statusData.error && (
                  <div className="col-span-full">
                    <p className="text-sm text-muted-foreground">Error</p>
                    <p className="text-red-500" data-testid="status-error">{statusData.error}</p>
                  </div>
                )}
                {statusData.warnings && statusData.warnings.length > 0 && (
                  <div className="col-span-full">
                    <p className="text-sm text-muted-foreground">Mapper Warnings</p>
                    <ul className="text-yellow-600 text-sm list-disc list-inside">
                      {statusData.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Yodeck Links */}
              <div className="flex gap-2 mt-4 flex-wrap" data-testid="yodeck-links">
                <a 
                  href={`https://app.yodeck.com/screens/${selectedScreen.yodeckDeviceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  data-testid="link-yodeck-screen"
                >
                  <ExternalLink className="h-3 w-3" /> Open Screen in Yodeck
                </a>
                {statusData.layoutId && (
                  <a 
                    href={`https://app.yodeck.com/layouts/${statusData.layoutId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    data-testid="link-yodeck-layout"
                  >
                    <ExternalLink className="h-3 w-3" /> Open Layout in Yodeck
                  </a>
                )}
                {statusData.playlistId && (
                  <a 
                    href={`https://app.yodeck.com/playlists/${statusData.playlistId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    data-testid="link-yodeck-playlist"
                  >
                    <ExternalLink className="h-3 w-3" /> Open Playlist in Yodeck
                  </a>
                )}
              </div>

              {/* Raw Keys Used - debugging info */}
              {statusData.rawKeysUsed && (
                <div className="mt-4 p-3 bg-slate-100 rounded text-xs font-mono" data-testid="raw-keys-used">
                  <p className="font-semibold mb-1">Parsed Fields:</p>
                  <p>Mode: {statusData.rawKeysUsed.contentModeField || "-"} = "{statusData.rawKeysUsed.contentModeValue || "-"}"</p>
                  <p>Online: {statusData.rawKeysUsed.onlineField || "-"}</p>
                  <p>Layout ID: {statusData.rawKeysUsed.layoutIdField || "-"}</p>
                  <p>Layout Name: {statusData.rawKeysUsed.layoutNameField || "-"}</p>
                </div>
              )}

              {/* Raw JSON Accordion */}
              <Accordion type="single" collapsible className="mt-4">
                <AccordionItem value="raw-json">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      RAW JSON (Yodeck API Response)
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {rawLoading ? (
                      <p className="text-muted-foreground">Laden...</p>
                    ) : rawData?.raw ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Fetched: {rawData.fetchedAt} | Endpoint: {rawData.urlUsed}
                        </p>
                        <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs max-h-96" data-testid="raw-json-content">
                          {JSON.stringify(rawData.raw, null, 2)}
                        </pre>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refetchRaw()}
                          className="mt-2"
                          data-testid="button-refresh-raw"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Refresh Raw
                        </Button>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Geen raw data beschikbaar</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              </>
            ) : (
              <p className="text-muted-foreground">Geen data beschikbaar</p>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <>
          <Card data-testid="action-log-panel">
            <CardHeader>
              <CardTitle>B) Actie Log (Laatste Run)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 text-slate-50 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-xs" data-testid="action-log-content">
                {lastResult.actionLog.map((log, i) => (
                  <div key={i} className="py-0.5">
                    <span className="text-slate-500">{String(i + 1).padStart(3, '0')}</span>{" "}
                    <span className={
                      log.includes("ERROR") || log.includes("FAILED") ? "text-red-400" :
                      log.includes("SUCCESS") || log.includes("OK") ? "text-green-400" :
                      log.includes("STEP") || log.includes("===") ? "text-yellow-400" :
                      "text-slate-200"
                    }>{log}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="result-panel">
            <CardHeader>
              <CardTitle>C) Resultaat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4" data-testid="before-state">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    VOOR
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Mode:</span> {lastResult.before.mode}</p>
                    <p><span className="text-muted-foreground">Layout:</span> {lastResult.before.layoutName || "-"}</p>
                    <p><span className="text-muted-foreground">Playlist:</span> {lastResult.before.playlistName || "-"}</p>
                    <p><span className="text-muted-foreground">Is Elevizion:</span> {lastResult.before.isElevizion ? "Ja" : "Nee"}</p>
                    <p className="text-xs text-muted-foreground">Opgehaald: {new Date(lastResult.before.fetchedAt).toLocaleString("nl-NL")}</p>
                  </div>
                </div>

                <div className="border rounded-lg p-4" data-testid="after-state">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-500" />
                    NA
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Mode:</span> {lastResult.after.mode}</p>
                    <p><span className="text-muted-foreground">Layout:</span> {lastResult.after.layoutName || "-"}</p>
                    <p><span className="text-muted-foreground">Playlist:</span> {lastResult.after.playlistName || "-"}</p>
                    <p><span className="text-muted-foreground">Is Elevizion:</span> {lastResult.after.isElevizion ? "Ja" : "Nee"}</p>
                    <p className="text-xs text-muted-foreground">Opgehaald: {new Date(lastResult.after.fetchedAt).toLocaleString("nl-NL")}</p>
                  </div>
                </div>
              </div>

              <div className={`rounded-lg p-6 text-center ${
                lastResult.finalStatus === "PASS" 
                  ? "bg-green-50 border-2 border-green-500" 
                  : "bg-red-50 border-2 border-red-500"
              }`} data-testid="final-status">
                {lastResult.finalStatus === "PASS" ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700" data-testid="status-pass">PASS</p>
                      <p className="text-green-600">Layout succesvol toegepast en actief</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <XCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-2xl font-bold text-red-700" data-testid="status-fail">FAIL</p>
                      <p className="text-red-600" data-testid="fail-reason">{lastResult.failReason}</p>
                    </div>
                  </div>
                )}
              </div>

              {lastResult.screenshotTimestamp && (
                <p className="text-xs text-muted-foreground text-center" data-testid="screenshot-timestamp">
                  Screenshot timestamp: {lastResult.screenshotTimestamp}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedLocation && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Selecteer een scherm om de status te bekijken en te repareren</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
