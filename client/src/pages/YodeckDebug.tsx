/**
 * Scherm Beheer - Vereenvoudigde Nederlandse versie
 * Één waarheid: Canonical live status + playlists + layout + approved ads
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Monitor, ExternalLink, Wrench, RotateCcw, Tv, HelpCircle, Info, Link as LinkIcon, PlayCircle } from "lucide-react";
import { useCanonicalScreens } from "@/hooks/useCanonicalScreens";
import { apiRequest } from "@/lib/queryClient";

interface NormalizedItem {
  id: number;
  mediaId: number;
  name: string;
  type: string;
  duration: number;
  order: number;
}

interface ApprovedAd {
  id: string;
  advertiserId: string;
  advertiserName: string;
  filename: string;
  storedFilename: string | null;
  storageUrl: string | null;
  yodeckMediaId: number | null;
  approvalStatus: string;
  approvedAt: string | null;
}

interface PlaylistItemsResponse {
  ok: boolean;
  locationId: string;
  locationName: string;
  base: {
    playlistId: string | null;
    ok: boolean;
    items: NormalizedItem[];
    itemCount: number;
    error?: string;
  };
  ads: {
    playlistId: string | null;
    ok: boolean;
    items: NormalizedItem[];
    itemCount: number;
    error?: string;
  };
  error?: string;
}

interface RepareerResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  basePlaylist: {
    id: string | null;
    name: string | null;
    itemCount: number;
    appsFromLegacy?: number;
    hasBaselineMedia?: boolean;
    isNew?: boolean;
  };
  adsPlaylist: {
    id: string | null;
    name: string | null;
    itemCount: number;
    approvedAdsLinked?: number;
    hasSelfAd?: boolean;
    isNew?: boolean;
  };
  approvedAds?: ApprovedAd[];
  layout: {
    id: string | null;
    isNew?: boolean;
    bound?: boolean;
    bindingsVerified?: boolean;
  };
  pushed: boolean;
  verified?: boolean;
  logs: string[];
  error?: string;
}

interface ApprovedAdsResponse {
  ok: boolean;
  ads: ApprovedAd[];
  logs: string[];
}

export default function YodeckDebug() {
  const queryClient = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [repareerResult, setRepareerResult] = useState<RepareerResult | null>(null);
  const [showTechnisch, setShowTechnisch] = useState(false);

  const { 
    screens, 
    isLoading: screensLoading, 
    isRefetching,
    refresh,
    generatedAt,
  } = useCanonicalScreens();

  const selectedScreen = screens.find(s => s.locationId === selectedLocation);

  // Playlist items ophalen
  const { data: playlistItems, refetch: refetchPlaylist, isLoading: playlistLoading } = useQuery<PlaylistItemsResponse>({
    queryKey: ["/api/admin/locations/playlist-items", selectedLocation],
    queryFn: async () => {
      const res = await fetch(`/api/admin/locations/${selectedLocation}/playlist-items`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedLocation,
    refetchInterval: false,
  });

  // Goedgekeurde ads ophalen
  const { data: approvedAdsData, refetch: refetchApprovedAds } = useQuery<ApprovedAdsResponse>({
    queryKey: ["/api/admin/locations/approved-ads", selectedLocation],
    queryFn: async () => {
      const res = await fetch(`/api/admin/locations/${selectedLocation}/approved-ads`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!selectedLocation,
    refetchInterval: false,
  });

  // Repareer scherm - hoofdactie (nu met volledige content pipeline)
  const repareerMutation = useMutation({
    mutationFn: async (locationId: string) => {
      // Gebruik de nieuwe ensure-content endpoint die approved ads koppelt
      const res = await apiRequest("POST", `/api/admin/locations/${locationId}/ensure-content`, {});
      return await res.json() as RepareerResult;
    },
    onSuccess: (data) => {
      setRepareerResult(data);
      refetchPlaylist();
      refetchApprovedAds();
      refresh();
    },
  });

  // Scherm resetten - leegmaken + opnieuw instellen
  const resetMutation = useMutation({
    mutationFn: async (locationId: string) => {
      // Eerst resetten naar leeg, dan opnieuw canonical instellen
      const resetRes = await apiRequest("POST", `/api/admin/locations/${locationId}/force-reset`, {});
      await resetRes.json();
      // Direct daarna weer repareren met volledige content pipeline
      const repairRes = await apiRequest("POST", `/api/admin/locations/${locationId}/ensure-content`, {});
      return await repairRes.json() as RepareerResult;
    },
    onSuccess: (data) => {
      setRepareerResult(data);
      refetchPlaylist();
      refetchApprovedAds();
      refresh();
    },
  });

  // Nu verversen op TV
  const pushMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("POST", `/api/admin/screens/${locationId}/push`, {});
      return await res.json();
    },
    onSuccess: () => {
      refresh();
      refetchPlaylist();
    },
  });

  // Koppel laatste goedgekeurde advertentie
  const linkAdMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await apiRequest("POST", `/api/admin/locations/${locationId}/link-latest-ad`, {});
      return await res.json();
    },
    onSuccess: () => {
      refetchPlaylist();
      refetchApprovedAds();
      refresh();
    },
  });

  // Bepaal status
  const baseOk = playlistItems?.base?.items && playlistItems.base.items.length > 0;
  const adsOk = playlistItems?.ads?.items && playlistItems.ads.items.length > 0;
  const contentOk = baseOk && adsOk;
  const isElevizionLayout = selectedScreen?.sourceType === "layout" && 
    (selectedScreen?.sourceName?.toLowerCase().includes("elevizion") || false);
  const isOnline = selectedScreen?.onlineStatus === "online";

  const handleRepareer = () => {
    if (!selectedLocation) return;
    repareerMutation.mutate(selectedLocation);
  };

  const handleReset = () => {
    if (!selectedLocation) return;
    resetMutation.mutate(selectedLocation);
  };

  const handlePush = () => {
    if (!selectedLocation) return;
    pushMutation.mutate(selectedLocation);
  };

  const handleLinkAd = () => {
    if (!selectedLocation) return;
    linkAdMutation.mutate(selectedLocation);
  };

  const isAnyLoading = repareerMutation.isPending || resetMutation.isPending || pushMutation.isPending || linkAdMutation.isPending;

  return (
    <div className="space-y-6" data-testid="scherm-beheer-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Scherm Beheer</h1>
          <p className="text-muted-foreground">
            Beheer je Yodeck schermen
            {generatedAt && <span className="ml-2 text-xs">({new Date(generatedAt).toLocaleTimeString()})</span>}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refresh()}
          disabled={isRefetching}
          data-testid="ververs-button"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Ververs
        </Button>
      </div>

      {/* Scherm selectie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Selecteer Scherm
          </CardTitle>
          <CardDescription>
            {screens.length} scherm{screens.length !== 1 ? "en" : ""} beschikbaar
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
                  {screen.screenName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 3 Hoofdknoppen */}
          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={!selectedLocation || isAnyLoading}
              onClick={handleRepareer}
              data-testid="repareer-button"
            >
              {repareerMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4 mr-2" />
              )}
              Repareer scherm
            </Button>

            <Button
              size="lg"
              variant="destructive"
              disabled={!selectedLocation || isAnyLoading}
              onClick={handleReset}
              data-testid="reset-button"
            >
              {resetMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Scherm resetten
            </Button>

            <Button
              size="lg"
              variant="secondary"
              disabled={!selectedLocation || isAnyLoading}
              onClick={handlePush}
              data-testid="push-button"
            >
              {pushMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Tv className="h-4 w-4 mr-2" />
              )}
              Nu verversen op TV
            </Button>
          </div>

          {/* Uitleg link */}
          <div className="flex justify-end">
            <button 
              onClick={() => setShowTechnisch(!showTechnisch)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <HelpCircle className="h-3 w-3" />
              Wat doen deze knoppen?
            </button>
          </div>

          {showTechnisch && (
            <div className="bg-muted p-4 rounded-lg text-sm space-y-2">
              <p><strong>Repareer scherm:</strong> Zet het scherm naar de standaard Elevizion layout met basis- en advertentie content.</p>
              <p><strong>Scherm resetten:</strong> Maakt het scherm eerst leeg en stelt het daarna opnieuw in met standaard content.</p>
              <p><strong>Nu verversen op TV:</strong> Stuurt de huidige instellingen direct naar het fysieke scherm.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status melding */}
      {selectedScreen && playlistItems && !playlistLoading && (
        <>
          {contentOk && isElevizionLayout ? (
            <Card className="border-green-500 bg-green-50">
              <CardContent className="pt-4">
                <p className="text-green-800 flex items-center gap-2 font-medium">
                  <CheckCircle className="h-5 w-5" />
                  Scherm is goed ingesteld
                </p>
                <p className="text-green-700 text-sm mt-1">
                  Basis content: {playlistItems.base.items.length} item{playlistItems.base.items.length !== 1 ? "s" : ""} • 
                  Advertenties: {playlistItems.ads.items.length} item{playlistItems.ads.items.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-500 bg-red-50">
              <CardContent className="pt-4">
                <p className="text-red-800 flex items-center gap-2 font-medium">
                  <AlertCircle className="h-5 w-5" />
                  Scherm heeft geen content of verkeerde instellingen
                </p>
                <p className="text-red-700 text-sm mt-1">
                  {!baseOk && "Geen basis content. "}
                  {!adsOk && "Geen advertenties. "}
                  {!isElevizionLayout && "Niet op Elevizion layout. "}
                  Klik op "Repareer scherm" om standaard content te plaatsen.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Live status scherm */}
      {selectedScreen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedScreen.screenName}
              <Badge 
                variant={isOnline ? "default" : "destructive"}
                className={isOnline ? "bg-green-600" : ""}
              >
                {isOnline ? "Online" : "Offline"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Wat draait er nu:</span>
                <Badge variant="outline" className="ml-2">
                  {selectedScreen.sourceType === "layout" ? "Layout" : 
                   selectedScreen.sourceType === "playlist" ? "Playlist" : 
                   selectedScreen.sourceType}
                </Badge>
              </div>
              <div>
                <span className="font-medium">Naam:</span>
                <span className="ml-2">{selectedScreen.sourceName || "—"}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
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

      {/* Content overzicht */}
      {playlistItems && playlistItems.ok && (
        <Card>
          <CardHeader>
            <CardTitle>Content op dit scherm</CardTitle>
            <CardDescription>
              Overzicht van basis- en advertentie content
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* BASIS Content */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  Basis content
                  <Badge variant={baseOk ? "outline" : "destructive"}>
                    {playlistItems.base.items.length} item{playlistItems.base.items.length !== 1 ? "s" : ""}
                  </Badge>
                </h4>
                {playlistItems.base.items.length > 0 ? (
                  <ul className="text-sm space-y-1">
                    {playlistItems.base.items.slice(0, 5).map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{item.type}</Badge>
                        <span className="truncate">{item.name}</span>
                      </li>
                    ))}
                    {playlistItems.base.items.length > 5 && (
                      <li className="text-muted-foreground text-xs">... en {playlistItems.base.items.length - 5} meer</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-orange-600">⚠️ Geen basis content</p>
                )}
              </div>

              {/* ADVERTENTIES */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  Advertenties
                  <Badge variant={adsOk ? "default" : "destructive"}>
                    {playlistItems.ads.items.length} item{playlistItems.ads.items.length !== 1 ? "s" : ""}
                  </Badge>
                </h4>
                {playlistItems.ads.items.length > 0 ? (
                  <ul className="text-sm space-y-1">
                    {playlistItems.ads.items.slice(0, 5).map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{item.type}</Badge>
                        <span className="truncate">{item.name}</span>
                      </li>
                    ))}
                    {playlistItems.ads.items.length > 5 && (
                      <li className="text-muted-foreground text-xs">... en {playlistItems.ads.items.length - 5} meer</li>
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-orange-600">⚠️ Geen advertenties</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goedgekeurde ads uit database */}
      {selectedLocation && approvedAdsData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5" />
              Goedgekeurde advertenties in database
            </CardTitle>
            <CardDescription>
              Ads die via het upload portaal zijn goedgekeurd voor deze locatie
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {approvedAdsData.ads.length > 0 ? (
              <>
                <div className="space-y-2">
                  {approvedAdsData.ads.map((ad) => (
                    <div key={ad.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium text-sm">{ad.advertiserName}</p>
                          <p className="text-xs text-muted-foreground">{ad.filename}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ad.approvalStatus === "PUBLISHED" ? "default" : "secondary"}>
                          {ad.approvalStatus === "APPROVED" ? "Goedgekeurd" : 
                           ad.approvalStatus === "PUBLISHED" ? "Gepubliceerd" : ad.approvalStatus}
                        </Badge>
                        {ad.yodeckMediaId ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            <LinkIcon className="h-3 w-3 mr-1" />
                            Gekoppeld #{ad.yodeckMediaId}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700">
                            Niet gekoppeld
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isAnyLoading}
                  onClick={handleLinkAd}
                  data-testid="link-ad-button"
                >
                  {linkAdMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-2" />
                  )}
                  Koppel laatste goedgekeurde advertentie
                </Button>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p>Geen goedgekeurde advertenties gevonden</p>
                <p className="text-xs mt-1">
                  Advertenties worden hier getoond nadat ze via het upload portaal zijn goedgekeurd.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resultaat melding */}
      {repareerResult && (
        <Card className={repareerResult.ok ? "border-green-500" : "border-red-500"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {repareerResult.ok ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {repareerResult.ok ? "Scherm succesvol ingesteld" : "Er ging iets mis"}
            </CardTitle>
            <CardDescription>{repareerResult.locationName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {repareerResult.ok ? (
              <div className="space-y-2 text-sm">
                <p>✓ Basis content: {repareerResult.basePlaylist.itemCount} items
                  {repareerResult.basePlaylist.appsFromLegacy && repareerResult.basePlaylist.appsFromLegacy > 0 && (
                    <span className="text-muted-foreground"> ({repareerResult.basePlaylist.appsFromLegacy} apps uit oude playlist)</span>
                  )}
                </p>
                <p>✓ Advertenties: {repareerResult.adsPlaylist.itemCount} items
                  {repareerResult.adsPlaylist.approvedAdsLinked && repareerResult.adsPlaylist.approvedAdsLinked > 0 && (
                    <span className="text-green-600 font-medium"> ({repareerResult.adsPlaylist.approvedAdsLinked} nieuwe ads gekoppeld)</span>
                  )}
                </p>
                <p>✓ Layout: {repareerResult.layout.bindingsVerified || repareerResult.layout.bound ? "Correct ingesteld" : "Ingesteld"}</p>
                {repareerResult.pushed && <p>✓ Ververs naar TV gestuurd</p>}
              </div>
            ) : (
              <div className="p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-700">{repareerResult.error || "Onbekende fout"}</p>
              </div>
            )}

            {/* Technische details (verborgen) */}
            <Accordion type="single" collapsible>
              <AccordionItem value="details">
                <AccordionTrigger>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3 w-3" />
                    Technische details
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto max-h-64">
                    {repareerResult.logs.join("\n")}
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
