import { useAppData } from "@/hooks/use-app-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Wifi, 
  WifiOff, 
  ExternalLink, 
  Target, 
  PauseCircle, 
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  Mail,
  User,
  FileText,
  Image,
  Video,
  RefreshCw,
  Play,
  Search,
  LayoutGrid,
  Building2,
  Monitor,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Database,
  Settings,
  Zap,
  Link2,
  ChevronDown,
  Wrench
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link, useRoute } from "wouter";
import { placementsApi } from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useUIMode } from "@/hooks/use-ui-mode";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface ScreenContentItem {
  id: string;
  screenId: string;
  yodeckMediaId: number;
  name: string;
  mediaType: string | null;
  category: string;
  duration: number | null;
  isActive: boolean;
  linkedAdvertiserId: string | null;
  linkedPlacementId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

interface MoneybirdContactSnapshot {
  companyName?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  chamberOfCommerce?: string | null;
  taxNumber?: string | null;
  syncedAt?: string | null;
}

interface ScreenWithContent {
  id: string;
  screenId: string;
  name: string;
  effectiveName?: string | null;
  yodeckPlayerId?: string;
  moneybirdContactId?: string | null;
  moneybirdContactSnapshot?: MoneybirdContactSnapshot | null;
  moneybirdSyncStatus?: string | null;
  currentContent?: ScreenContentItem[];
  [key: string]: any;
}

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
  // Final fallback: screenId or yodeckPlayerId
  if (screen?.screenId) {
    return `Scherm ${screen.screenId}`;
  }
  if (screen?.yodeckPlayerId) {
    return `YDK-${screen.yodeckPlayerId}`;
  }
  return "Onbekend scherm";
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function ScreenDetail() {
  const [, params] = useRoute("/screens/:id");
  const { screens, locations, placements, advertisers, contracts } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUIMode();

  const [activeTab, setActiveTab] = useState("overzicht");
  const [contentSearch, setContentSearch] = useState("");
  const [contentFilter, setContentFilter] = useState<"all" | "ads" | "other">("all");
  const [placementSearch, setPlacementSearch] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const screenId = params?.id;
  const screen = screens.find(s => s.id === screenId);
  const location = screen ? locations.find(l => l.id === screen.locationId) : null;
  
  const { data: screenDetail, isLoading: screenDetailLoading, refetch: refetchScreen } = useQuery<ScreenWithContent>({
    queryKey: ["screen-detail", screenId],
    queryFn: async () => {
      const response = await fetch(`/api/screens/${screenId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch screen detail");
      return response.json();
    },
    enabled: !!screenId,
    staleTime: 30000,
  });

  const { data: contentStatus } = useQuery<{
    ok: boolean;
    combinedPlaylistId: string | null;
    combinedPlaylistItemCount: number;
    needsRepair: boolean;
    lastSyncAt: string | null;
    error?: string;
  }>({
    queryKey: ["location-content-status", screen?.locationId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/locations/${screen?.locationId}/content-status`, { credentials: "include" });
      if (!response.ok) return { ok: false, combinedPlaylistId: null, combinedPlaylistItemCount: 0, needsRepair: true };
      return response.json();
    },
    enabled: !!screen?.locationId,
    staleTime: 60000,
  });
  
  const currentContent = screenDetail?.currentContent || [];
  const displayName = getScreenDisplayName(screen, location);

  const screenPlacements = placements.filter(p => p.screenId === screenId);
  const activePlacements = screenPlacements.filter(p => p.isActive);

  const getPlacementInfo = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return { advertiser: null, contract: null };
    const advertiser = advertisers.find(a => a.id === contract.advertiserId);
    return { advertiser, contract };
  };

  const formatLastSeen = (dateValue: Date | string | null) => {
    if (!dateValue) return "Nooit";
    try {
      const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
      return formatDistanceToNow(date, { addSuffix: true, locale: nl });
    } catch {
      return "Onbekend";
    }
  };

  const formatDate = (dateValue: Date | string | null) => {
    if (!dateValue) return "-";
    try {
      const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
      return format(date, "d MMM yyyy", { locale: nl });
    } catch {
      return "-";
    }
  };

  const getPlacementStatus = (placement: typeof placements[0]) => {
    if (!placement.isActive) {
      return { label: "Gepauzeerd", variant: "secondary" as const, color: "text-amber-600" };
    }
    const now = new Date();
    const start = placement.startDate ? new Date(placement.startDate) : null;
    const end = placement.endDate ? new Date(placement.endDate) : null;
    
    if (start && start > now) {
      return { label: "Gepland", variant: "outline" as const, color: "text-blue-600" };
    }
    if (end && end < now) {
      return { label: "Verlopen", variant: "outline" as const, color: "text-gray-500" };
    }
    return { label: "Actief", variant: "default" as const, color: "text-green-600" };
  };

  const updatePlacementMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: { isActive: boolean } }) => {
      return await placementsApi.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["placements"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync/yodeck/run");
      return res.json();
    },
    onSuccess: () => {
      refetchScreen();
      toast({ title: "Synchronisatie gestart", description: "Content wordt bijgewerkt..." });
    },
    onError: () => {
      toast({ title: "Synchronisatie mislukt", variant: "destructive" });
    }
  });

  const locationUpdateMutation = useMutation({
    mutationFn: async (data: { city?: string; pausedByAdmin?: boolean; status?: string }) => {
      if (!location) throw new Error("Geen locatie gevonden");
      const res = await apiRequest("PATCH", `/api/locations/${location.id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Fout bij opslaan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      refetchScreen();
      toast({ title: "Opgeslagen" });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    }
  });

  const handlePausePlacement = async (placementId: string) => {
    try {
      await updatePlacementMutation.mutateAsync({ id: placementId, data: { isActive: false } });
      toast({ title: "Plaatsing gepauzeerd" });
    } catch {
      toast({ title: "Fout bij pauzeren", variant: "destructive" });
    }
  };

  const openInYodeck = () => {
    if (screen?.yodeckPlayerId) {
      window.open(`https://app.yodeck.com/player/${screen.yodeckPlayerId}`, "_blank");
    } else {
      toast({ 
        title: "Geen Yodeck ID gekoppeld", 
        variant: "destructive" 
      });
    }
  };

  const contactLocation = () => {
    if (location?.phone) {
      window.open(`https://wa.me/${(location.phone ?? "").replace(/\D/g, "")}`, "_blank");
    } else if (location?.email) {
      window.open(`mailto:${location.email}`, "_blank");
    } else {
      toast({ 
        title: "Geen contactgegevens", 
        variant: "destructive" 
      });
    }
  };

  // Filter content
  const filteredContent = currentContent.filter(item => {
    const matchesSearch = contentSearch === "" || 
      item.name.toLowerCase().includes(contentSearch.toLowerCase());
    const matchesFilter = contentFilter === "all" ||
      (contentFilter === "ads" && item.category === "ad") ||
      (contentFilter === "other" && item.category === "non_ad");
    return matchesSearch && matchesFilter;
  });

  // Filter placements
  const filteredPlacements = screenPlacements.filter(p => {
    if (placementSearch === "") return true;
    const { advertiser, contract } = getPlacementInfo(p.contractId);
    const searchLower = placementSearch.toLowerCase();
    return (
      advertiser?.companyName?.toLowerCase().includes(searchLower) ||
      contract?.name?.toLowerCase().includes(searchLower)
    );
  });

  // Content stats
  const adsCount = currentContent.filter(c => c.category === 'ad').length;
  const nonAdsCount = currentContent.filter(c => c.category === 'non_ad').length;
  const adsLinkedCount = currentContent.filter(c => c.category === 'ad' && (c.linkedAdvertiserId || c.linkedPlacementId)).length;
  const adsUnlinkedCount = adsCount - adsLinkedCount;

  if (!screen) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/screens">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar Schermen
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Scherm niet gevonden</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild data-testid="button-back">
        <Link href="/screens">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Terug naar Schermen
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-4 border-b">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full shrink-0 ${screen.status === "online" ? "bg-green-100" : "bg-red-100"}`}>
            {screen.status === "online" ? (
              <Wifi className="h-6 w-6 text-green-600" />
            ) : (
              <WifiOff className="h-6 w-6 text-red-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="screen-name">
                {displayName}
              </h1>
              <Badge 
                variant={screen.status === "online" ? "default" : "destructive"} 
                data-testid="screen-status"
              >
                {screen.status === "online" ? "Online" : "Offline"}
              </Badge>
              {/* Auto-live status badge */}
              {(() => {
                const hasLocationData = !!(location?.city || location?.regionCode);
                const hasYodeck = !!(screen?.yodeckPlayerId || location?.yodeckDeviceId);
                const isStatusActive = location?.status === "active";
                const autoLiveConditionsMet = isStatusActive && hasLocationData && hasYodeck;
                const isPaused = location?.pausedByAdmin === true;
                
                if (location?.readyForAds) {
                  return (
                    <Badge className="bg-green-600" data-testid="screen-sellable-status">
                      Live voor advertenties
                    </Badge>
                  );
                } else if (isPaused) {
                  return (
                    <Badge variant="secondary" data-testid="screen-sellable-status">
                      Gepauzeerd
                    </Badge>
                  );
                } else {
                  return (
                    <Badge variant="outline" className="border-amber-500 text-amber-600" data-testid="screen-sellable-status">
                      Niet live — ontbrekende gegevens
                    </Badge>
                  );
                }
              })()}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {screen.yodeckPlayerId && (
                <span className="mr-3">Yodeck: YDK-{screen.yodeckPlayerId}</span>
              )}
              {screen.screenId && (
                <span>EVZ: {screen.screenId}</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              Laatst gezien: {formatLastSeen(screen.lastSeenAt)}
            </p>
            <div className="mt-2">
              <SyncStatusBadge
                status={screen.yodeckSyncStatus}
                provider="yodeck"
                entityType="screen"
                entityId={screen.id}
                error={screen.yodeckSyncError}
                lastSyncAt={screen.yodeckLastSyncAt}
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button asChild data-testid="button-place-ad">
            <Link href={`/onboarding/placement?screenId=${screen.id}`}>
              <Target className="h-4 w-4 mr-2" />
              Plaats Ad
            </Link>
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Synchroniseren
          </Button>
          <Button variant="outline" onClick={openInYodeck} data-testid="button-yodeck">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Yodeck
          </Button>
          <Button variant="ghost" onClick={contactLocation} data-testid="button-contact">
            <Phone className="h-4 w-4 mr-2" />
            Contact locatie
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overzicht" data-testid="tab-overzicht">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Overzicht
          </TabsTrigger>
          <TabsTrigger value="content" data-testid="tab-content">
            <Play className="h-4 w-4 mr-2" />
            Content
          </TabsTrigger>
          <TabsTrigger value="plaatsingen" data-testid="tab-plaatsingen">
            <Target className="h-4 w-4 mr-2" />
            Plaatsingen
          </TabsTrigger>
          <TabsTrigger value="contact" data-testid="tab-contact">
            <Building2 className="h-4 w-4 mr-2" />
            Contact
          </TabsTrigger>
        </TabsList>

        {/* TAB: Overzicht - Status tiles + Instellingen */}
        <TabsContent value="overzicht" className="space-y-6 mt-6">
          {/* Status overzicht - 3 status tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status: Scherm */}
            <Card data-testid="status-scherm">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${screen.status === "online" ? "bg-green-100" : "bg-red-100"}`}>
                    {screen.status === "online" ? (
                      <Wifi className="h-5 w-5 text-green-600" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Scherm</p>
                    <p className={`font-semibold ${screen.status === "online" ? "text-green-700" : "text-red-700"}`}>
                      {screen.status === "online" ? "Online" : "Offline"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status: Basiscontent */}
            <Card data-testid="status-basiscontent">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  {contentStatus?.ok && !contentStatus?.needsRepair ? (
                    <>
                      <div className="p-2 rounded-full bg-green-100">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Basiscontent</p>
                        <p className="font-semibold text-green-700">OK</p>
                      </div>
                    </>
                  ) : contentStatus?.needsRepair ? (
                    <>
                      <div className="p-2 rounded-full bg-amber-100">
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Basiscontent</p>
                        <p className="font-semibold text-amber-700">Wordt hersteld</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2 rounded-full bg-gray-100">
                        <AlertCircle className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Basiscontent</p>
                        <p className="font-semibold text-gray-600">Onbekend</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status: Advertenties */}
            <Card data-testid="status-advertenties">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  {activePlacements.length > 0 ? (
                    <>
                      <div className="p-2 rounded-full bg-green-100">
                        <Target className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Advertenties</p>
                        <p className="font-semibold text-green-700">{activePlacements.length} actief</p>
                      </div>
                    </>
                  ) : location?.readyForAds ? (
                    <>
                      <div className="p-2 rounded-full bg-blue-100">
                        <Target className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Advertenties</p>
                        <p className="font-semibold text-blue-700">Klaar voor ads</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2 rounded-full bg-gray-100">
                        <Target className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Advertenties</p>
                        <p className="font-semibold text-gray-600">Niet actief</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Snel beheer - altijd zichtbaar */}
          <Card data-testid="card-snel-beheer">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Beheer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                {/* Locatie */}
                <div>
                  <p className="text-sm text-muted-foreground">Locatie</p>
                  <p className="font-medium">{location?.city || location?.name || "—"}</p>
                </div>
                {/* Ads pauzeren */}
                <div className="flex items-center gap-3">
                  <Switch
                    id="pause-ads-toggle"
                    data-testid="switch-pause-ads"
                    checked={location?.pausedByAdmin === true}
                    onCheckedChange={(checked) => {
                      locationUpdateMutation.mutate({ pausedByAdmin: checked });
                    }}
                    disabled={locationUpdateMutation.isPending}
                  />
                  <Label htmlFor="pause-ads-toggle" className="text-sm">
                    {location?.pausedByAdmin ? "Ads gepauzeerd" : "Ads actief"}
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Geavanceerde instellingen - alleen voor admin */}
          {isAdmin && (
          <Card data-testid="card-advertentie-instellingen">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Geavanceerde instellingen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Plaats (city) input */}
                <div className="space-y-2">
                  <Label htmlFor="city-input">Plaats</Label>
                  <Input
                    id="city-input"
                    data-testid="input-city"
                    placeholder={location?.city || "bijv. Sittard"}
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    onBlur={() => {
                      if (cityInput.trim() && cityInput.trim() !== location?.city) {
                        locationUpdateMutation.mutate({ city: cityInput.trim() });
                      }
                    }}
                  />
                  {location?.city && !cityInput && (
                    <p className="text-xs text-muted-foreground">Huidige waarde: {location.city}</p>
                  )}
                </div>

                {/* Regio code (read-only display) */}
                <div className="space-y-2">
                  <Label>Regio code</Label>
                  <p className="text-sm py-2">{location?.regionCode || <span className="text-muted-foreground">—</span>}</p>
                </div>

                {/* Advertenties pauzeren toggle */}
                <div className="space-y-2">
                  <Label htmlFor="pause-ads-toggle-2">Advertenties pauzeren</Label>
                  <div className="flex items-center gap-3 py-1">
                    <Switch
                      id="pause-ads-toggle-2"
                      data-testid="switch-pause-ads-2"
                      checked={location?.pausedByAdmin === true}
                      onCheckedChange={(checked) => {
                        locationUpdateMutation.mutate({ pausedByAdmin: checked });
                      }}
                      disabled={locationUpdateMutation.isPending}
                    />
                    <span className="text-sm">
                      {location?.pausedByAdmin ? "Gepauzeerd" : "Actief"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Zet dit aan om advertenties tijdelijk te stoppen voor dit scherm.
                  </p>
                </div>

                {/* Auto-live checklist */}
                <div className="space-y-2">
                  <Label>Auto-live voorwaarden</Label>
                  <div className="space-y-1 text-sm">
                    {(() => {
                      const hasLocationData = !!(location?.city || location?.regionCode);
                      const hasYodeck = !!(screen?.yodeckPlayerId || location?.yodeckDeviceId);
                      const isStatusActive = location?.status === "active";
                      
                      return (
                        <>
                          <div className="flex items-center gap-2" data-testid="check-city">
                            {hasLocationData ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className={hasLocationData ? "" : "text-muted-foreground"}>
                              Plaats ingevuld
                            </span>
                          </div>
                          <div className="flex items-center gap-2" data-testid="check-yodeck">
                            {hasYodeck ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className={hasYodeck ? "" : "text-muted-foreground"}>
                              Yodeck gekoppeld
                            </span>
                          </div>
                          <div className="flex items-center gap-2" data-testid="check-status">
                            {isStatusActive ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className={isStatusActive ? "" : "text-muted-foreground"}>
                              Status actief
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Yodeck mapping link if missing */}
              {(!screen?.yodeckPlayerId && !location?.yodeckPlaylistId) && (
                <div className="flex items-center gap-2 text-sm text-amber-600 pt-2 border-t">
                  <Link2 className="h-4 w-4" />
                  <span>Yodeck koppeling ontbreekt.</span>
                  <Link href="/playlist-mapping" className="underline font-medium">
                    Yodeck koppelen →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Technische details - alleen voor admin */}
          {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SECTIE A: Scherm (Yodeck) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  Scherm (Yodeck)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Schermnaam (titel) */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Schermnaam</p>
                  <p className="text-lg font-semibold" data-testid="yodeck-screen-name">
                    {screen.yodeckPlayerName || screen.name || "—"}
                  </p>
                </div>
                
                {/* Screen ID */}
                {screen.screenId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Screen ID</p>
                    <p className="text-sm font-mono">{screen.screenId}</p>
                  </div>
                )}
                
                {/* Yodeck Device ID */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Yodeck Device ID</p>
                  <p className="text-sm font-mono">
                    {screen.yodeckPlayerId ? `YDK-${screen.yodeckPlayerId}` : "—"}
                  </p>
                </div>
                
                {/* Online status */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                  <div className="flex items-center gap-3">
                    <Badge variant={screen.status === "online" ? "default" : "destructive"}>
                      {screen.status === "online" ? "Online" : "Offline"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Laatst gezien: {formatLastSeen(screen.lastSeenAt)}
                    </span>
                  </div>
                </div>
                
                {/* Content summary */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Content</p>
                  {screenDetailLoading ? (
                    <Skeleton className="h-6 w-24" />
                  ) : currentContent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen content gedetecteerd</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm">
                        {adsCount} ads, {nonAdsCount} overig
                      </p>
                      {/* Ads sync status based on desired vs actual */}
                      {contentStatus && !contentStatus.needsRepair && adsCount === activePlacements.length && adsCount > 0 && (
                        <Badge className="bg-green-600 text-white text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ads gesynchroniseerd
                        </Badge>
                      )}
                      {contentStatus && contentStatus.needsRepair && (
                        <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Sync in behandeling
                        </Badge>
                      )}
                      {adsUnlinkedCount > 0 && (
                        <p className="text-xs text-amber-600">
                          {adsUnlinkedCount} ads niet in systeem bekend
                        </p>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Open in Yodeck button */}
                {screen.yodeckPlayerId && (
                  <Button variant="outline" size="sm" onClick={openInYodeck} className="mt-2">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Yodeck
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* SECTIE B: Bedrijf (Moneybird) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Bedrijf (Moneybird)
                  {screenDetail?.moneybirdContactId ? (
                    <Badge variant="outline" className="text-green-600 border-green-600 ml-2">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Gekoppeld
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-600 ml-2">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Niet gekoppeld
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const snapshot = screenDetail?.moneybirdContactSnapshot as MoneybirdContactSnapshot | null;
                  const hasMoneybird = Boolean(screenDetail?.moneybirdContactId);
                  
                  if (!hasMoneybird) {
                    return (
                      <div className="text-center py-6">
                        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-orange-400" />
                        <p className="text-muted-foreground mb-4">
                          Dit scherm is nog niet gekoppeld aan een Moneybird contact.
                        </p>
                        <Button variant="default" size="sm" onClick={() => setActiveTab("contact")}>
                          Koppel Moneybird contact
                        </Button>
                      </div>
                    );
                  }
                  
                  const companyName = snapshot?.companyName || 
                    (snapshot?.firstname && snapshot?.lastname ? `${snapshot.firstname} ${snapshot.lastname}` : null);
                  
                  return (
                    <>
                      {/* Bedrijfsnaam */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Bedrijfsnaam</p>
                        <p className="text-lg font-semibold" data-testid="moneybird-company-name">
                          {companyName || "—"}
                        </p>
                      </div>
                      
                      {/* Adres */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Adres</p>
                        {snapshot?.address1 || snapshot?.zipcode || snapshot?.city ? (
                          <div className="text-sm">
                            {snapshot.address1 && <p>{snapshot.address1}</p>}
                            {(snapshot.zipcode || snapshot.city) && (
                              <p>{[snapshot.zipcode, snapshot.city].filter(Boolean).join(" ")}</p>
                            )}
                            {snapshot.country && <p>{snapshot.country}</p>}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      
                      {/* Email */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">E-mail</p>
                        {snapshot?.email ? (
                          <a href={`mailto:${snapshot.email}`} className="text-sm text-primary hover:underline">
                            {snapshot.email}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      
                      {/* Telefoon */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
                        {snapshot?.phone ? (
                          <a href={`tel:${snapshot.phone}`} className="text-sm text-primary hover:underline">
                            {snapshot.phone}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      
                      {/* KVK/BTW */}
                      {(snapshot?.chamberOfCommerce || snapshot?.taxNumber) && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">KVK / BTW</p>
                          <div className="text-sm">
                            {snapshot.chamberOfCommerce && <p>KvK: {snapshot.chamberOfCommerce}</p>}
                            {snapshot.taxNumber && <p>BTW: {snapshot.taxNumber}</p>}
                          </div>
                        </div>
                      )}
                      
                      {/* Open in Moneybird button */}
                      {screenDetail?.moneybirdContactId && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => {
                            const mbId = screenDetail.moneybirdContactId;
                            if (mbId) {
                              window.open(`https://moneybird.com/contacts/${mbId}`, "_blank");
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in Moneybird
                        </Button>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
          )}

          {/* Quick stats row - alleen voor admin */}
          {isAdmin && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Actieve plaatsingen</span>
                </div>
                <p className="text-2xl font-bold">{activePlacements.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Play className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Content items</span>
                </div>
                <p className="text-2xl font-bold">{currentContent.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Status</span>
                </div>
                <Badge variant={screen.status === "online" ? "default" : "destructive"} className="mt-1">
                  {screen.status === "online" ? "Online" : "Offline"}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Moneybird</span>
                </div>
                <Badge 
                  variant="outline" 
                  className={screenDetail?.moneybirdContactId ? "text-green-600 border-green-600" : "text-orange-600 border-orange-600"}
                >
                  {screenDetail?.moneybirdContactId ? "Gekoppeld" : "Niet gekoppeld"}
                </Badge>
              </CardContent>
            </Card>
          </div>
          )}

          {/* Geavanceerd panel - alleen zichtbaar in admin mode of via toggle */}
          {isAdmin && (
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <Card className="border-dashed">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      Geavanceerd
                      <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Yodeck Device ID */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Yodeck Device ID</p>
                        <p className="text-sm font-mono">
                          {screen.yodeckPlayerId ? `YDK-${screen.yodeckPlayerId}` : "—"}
                        </p>
                      </div>
                      
                      {/* Screen ID */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Screen ID</p>
                        <p className="text-sm font-mono">{screen.screenId || "—"}</p>
                      </div>
                      
                      {/* Location ID */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Location ID</p>
                        <p className="text-sm font-mono">{screen.locationId || "—"}</p>
                      </div>
                      
                      {/* Yodeck Sync Status */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Sync Status</p>
                        <SyncStatusBadge
                          status={screen.yodeckSyncStatus}
                          provider="yodeck"
                          entityType="screen"
                          entityId={screen.id}
                          error={screen.yodeckSyncError}
                          lastSyncAt={screen.yodeckLastSyncAt}
                        />
                      </div>
                      
                      {/* Moneybird Contact ID */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Moneybird Contact ID</p>
                        <p className="text-sm font-mono">{screenDetail?.moneybirdContactId || "—"}</p>
                      </div>
                      
                      {/* Last Seen */}
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Laatst gezien</p>
                        <p className="text-sm">{formatLastSeen(screen.lastSeenAt)}</p>
                      </div>
                    </div>
                    
                    {/* Debug actions */}
                    <div className="pt-4 border-t flex gap-2">
                      <Button variant="outline" size="sm" onClick={openInYodeck} data-testid="button-open-yodeck-advanced">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in Yodeck
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                        data-testid="button-sync-advanced"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                        Force Sync
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </TabsContent>

        {/* TAB: Content */}
        <TabsContent value="content" className="space-y-4 mt-6">
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek content..."
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                className="pl-9"
                data-testid="input-content-search"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={contentFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setContentFilter("all")}
                data-testid="filter-all"
              >
                Alles ({currentContent.length})
              </Button>
              <Button
                variant={contentFilter === "ads" ? "default" : "outline"}
                size="sm"
                onClick={() => setContentFilter("ads")}
                data-testid="filter-ads"
              >
                Ads ({adsCount})
              </Button>
              <Button
                variant={contentFilter === "other" ? "default" : "outline"}
                size="sm"
                onClick={() => setContentFilter("other")}
                data-testid="filter-other"
              >
                Overig ({nonAdsCount})
              </Button>
            </div>
          </div>

          {/* Content List */}
          <Card>
            <CardContent className="pt-4">
              {screenDetailLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : filteredContent.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Play className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>{contentSearch ? `Geen resultaten voor "${contentSearch}"` : "Geen content gevonden"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Content</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Duur</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContent.map((item) => {
                      const isAd = item.category === 'ad';
                      const isLinked = item.linkedAdvertiserId || item.linkedPlacementId;
                      
                      return (
                        <TableRow key={item.id} data-testid={`content-row-${item.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.mediaType?.includes("video") ? (
                                <Video className="h-4 w-4 text-muted-foreground" />
                              ) : item.mediaType?.includes("image") ? (
                                <Image className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="truncate max-w-[300px]">{item.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={isAd ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-slate-50 text-slate-600"}
                            >
                              {isAd ? "AD" : "INFO"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isAd && (
                              <Badge 
                                variant="outline"
                                className={isLinked ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}
                              >
                                {isLinked ? "Gekoppeld" : "Niet gekoppeld"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatDuration(item.duration)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Plaatsingen */}
        <TabsContent value="plaatsingen" className="space-y-4 mt-6">
          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op ad / adverteerder..."
                value={placementSearch}
                onChange={(e) => setPlacementSearch(e.target.value)}
                className="pl-9"
                data-testid="input-placement-search"
              />
            </div>
            <Badge variant="secondary">{filteredPlacements.length} plaatsing(en)</Badge>
          </div>

          <Card>
            <CardContent className="pt-4">
              {filteredPlacements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>{placementSearch ? `Geen resultaten voor "${placementSearch}"` : "Geen plaatsingen op dit scherm"}</p>
                  <Button variant="outline" size="sm" className="mt-4" asChild>
                    <Link href={`/onboarding/placement?screenId=${screen.id}`}>
                      Plaats een advertentie
                    </Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ad</TableHead>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>Eind</TableHead>
                      <TableHead className="text-right">Actie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlacements.map((placement) => {
                      const { advertiser, contract } = getPlacementInfo(placement.contractId);
                      const status = getPlacementStatus(placement);
                      
                      return (
                        <TableRow key={placement.id} data-testid={`placement-row-${placement.id}`}>
                          <TableCell className="font-medium">
                            {contract?.name || "Geen ad"}
                          </TableCell>
                          <TableCell>
                            {advertiser ? (
                              <Link 
                                href={`/advertisers/${advertiser.id}`}
                                className="text-primary hover:underline"
                              >
                                {advertiser.companyName}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant} className={status.color}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(placement.startDate)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(placement.endDate)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                asChild
                              >
                                <Link href={`/placements/${placement.id}`}>
                                  Open
                                </Link>
                              </Button>
                              {placement.isActive && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handlePausePlacement(placement.id)}
                                  disabled={updatePlacementMutation.isPending}
                                >
                                  <PauseCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Contact */}
        <TabsContent value="contact" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Contactgegevens
                {(() => {
                  const isLinked = screenDetail?.moneybirdContactId || location?.moneybirdContactId;
                  return isLinked ? (
                    <Badge variant="outline" className="text-green-600 border-green-600 ml-2">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Moneybird gekoppeld
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-600 ml-2">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Moneybird ontbreekt
                    </Badge>
                  );
                })()}
                {screenDetail?.moneybirdContactId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      apiRequest("POST", `/api/screens/${screenId}/sync`)
                        .then(() => {
                          queryClient.invalidateQueries({ queryKey: [`/api/screens/${screenId}`] });
                          toast({ title: "Gesynchroniseerd", description: "Contact data bijgewerkt vanuit Moneybird" });
                        })
                        .catch(() => {
                          toast({ title: "Fout", description: "Synchronisatie mislukt", variant: "destructive" });
                        });
                    }}
                    data-testid="button-sync-moneybird"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Synchroniseren
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Use screen-level snapshot if available, otherwise fall back to location
                const snapshot = screenDetail?.moneybirdContactSnapshot as MoneybirdContactSnapshot | null;
                const hasSnapshot = snapshot && (snapshot.companyName || snapshot.firstname || snapshot.email);
                
                // Display name from snapshot or location
                const displayName = snapshot?.companyName || 
                  (snapshot?.firstname && snapshot?.lastname ? `${snapshot.firstname} ${snapshot.lastname}` : null) ||
                  location?.name || "-";
                  
                // Contact person from snapshot
                const contactPerson = snapshot?.firstname && snapshot?.lastname 
                  ? `${snapshot.firstname} ${snapshot.lastname}` 
                  : (location?.contactName || null);
                  
                // Email - filter out placeholder values
                const email = snapshot?.email || location?.email;
                const validEmail = email && !email.includes("noreply@") && !email.includes("example.com") ? email : null;
                
                // Phone
                const phone = snapshot?.phone || location?.phone || null;
                
                // Address from snapshot or location
                const address = snapshot?.address1 || location?.address || null;
                const zipcode = snapshot?.zipcode || location?.zipcode || null;
                const city = snapshot?.city || location?.city || null;
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Business/Location Name */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Bedrijfsnaam / Locatie</p>
                      <p className="text-lg font-medium">{displayName}</p>
                      {hasSnapshot && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          Bron: Moneybird
                          {snapshot?.syncedAt && (
                            <span className="ml-1 text-muted-foreground">
                              • {formatDistanceToNow(new Date(snapshot.syncedAt), { addSuffix: true, locale: nl })}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Address */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Adres</p>
                      {address || zipcode || city ? (
                        <>
                          {address && <p className="text-sm">{address}</p>}
                          {(zipcode || city) && (
                            <p className="text-sm">{[zipcode, city].filter(Boolean).join(" ")}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Niet ingesteld</p>
                      )}
                    </div>
                    
                    {/* Contact Person */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Contactpersoon</p>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm">{contactPerson || <span className="text-muted-foreground">Niet ingesteld</span>}</p>
                      </div>
                    </div>
                    
                    {/* Phone */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {phone ? (
                          <a href={`tel:${phone}`} className="text-sm text-primary hover:underline">
                            {phone}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">Niet ingesteld</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Email */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {validEmail ? (
                          <a href={`mailto:${validEmail}`} className="text-sm text-primary hover:underline truncate">
                            {validEmail}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">Niet ingesteld</p>
                        )}
                      </div>
                    </div>
                    
                    {/* KvK/BTW from snapshot */}
                    {(snapshot?.chamberOfCommerce || snapshot?.taxNumber) && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">KvK / BTW</p>
                        {snapshot.chamberOfCommerce && (
                          <p className="text-sm">KvK: {snapshot.chamberOfCommerce}</p>
                        )}
                        {snapshot.taxNumber && (
                          <p className="text-sm">BTW: {snapshot.taxNumber}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Notes */}
                    {location?.notes && (
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Notities</p>
                        <p className="text-sm bg-muted/50 rounded p-3">{location.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
