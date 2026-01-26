/**
 * Yodeck Debug Page - UNIFIED VERSION
 * Uses ONLY useCanonicalScreens hook for live data (per HARDEN+UNIFY spec)
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw, Zap, CheckCircle, XCircle, AlertCircle, Monitor, ExternalLink, Code, Shield } from "lucide-react";
import { useCanonicalScreens } from "@/hooks/useCanonicalScreens";

interface RawScreenData {
  ok: boolean;
  fetchedAt: string;
  urlUsed: string;
  raw: any;
  mapped: any;
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

export default function YodeckDebug() {
  const queryClient = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [lastResult, setLastResult] = useState<ComplianceResult | null>(null);

  // DEV ASSERTION: Using canonical hook
  console.debug("[YodeckDebug] Using unified canonical screens hook");

  // UNIFIED: Use canonical screens hook for ALL live data
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
    getScreenByLocationId,
  } = useCanonicalScreens();

  const selectedScreen = screens.find(s => s.locationId === selectedLocation);

  // Raw data query (for debug view only)
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
              <div>
                <span className="font-medium">Yodeck Device ID:</span>
                <span className="ml-2">{selectedScreen.yodeckDeviceId}</span>
              </div>
              <div>
                <span className="font-medium">Last Seen:</span>
                <span className="ml-2">
                  {selectedScreen.lastSeenAt 
                    ? new Date(selectedScreen.lastSeenAt).toLocaleString() 
                    : "—"}
                </span>
              </div>
            </div>

            {selectedScreen._debug?.warnings && selectedScreen._debug.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="font-medium text-yellow-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Warnings:
                </p>
                <ul className="list-disc list-inside text-sm text-yellow-700 mt-1">
                  {selectedScreen._debug.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

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
