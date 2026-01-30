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
  Info,
  Database,
  Settings,
  Zap,
  Link2,
  ChevronDown,
  Wrench,
  Upload
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

  // Source status - PLAYLIST-ONLY mode enforcement
  const { data: sourceStatus, isLoading: sourceStatusLoading, refetch: refetchSourceStatus } = useQuery<{
    ok: boolean;
    screenId: string;
    yodeckPlayerId: number;
    playlistOnlyMode: boolean;
    expected: { type: string; id: number; source: string } | null;
    actual: { type: string; id: number | null; name?: string };
    mismatch: boolean;
    mismatchReason?: string;
    needsRepair: boolean;
    error?: string;
  }>({
    queryKey: ["screen-source-status", screenId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/screens/${screenId}/source-status`, { credentials: "include" });
      if (!response.ok) return { ok: false, mismatch: false, needsRepair: false };
      return response.json();
    },
    enabled: !!screenId && isAdmin,
    staleTime: 30000,
  });

  // Fix playlist mode mutation
  const fixPlaylistModeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/screens/${screenId}/fix-playlist-mode`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || "Fout bij herstellen playlist mode");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast({
          title: "Playlist mode hersteld",
          description: `Scherm is nu in playlist mode (outcome: ${data.outcome})`,
        });
      } else {
        toast({
          title: "Herstel mislukt",
          description: data.error || "Kon playlist mode niet herstellen",
          variant: "destructive",
        });
      }
      refetchSourceStatus();
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-source-status", screenId] });
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  // Now playing data - single source of truth for what's actually on screen (simple model)
  const { data: nowPlaying, isLoading: nowPlayingLoading, refetch: refetchNowPlaying } = useQuery<{
    ok: boolean;
    screenId: string;
    playerId: string | null;
    expectedPlaylistId: string | null;
    actualSourceType: string | null;
    actualSourceId: number | null;
    actualSourceName: string | null;
    isCorrect: boolean;
    itemCount: number;
    topItems?: string[];
    error?: string;
  }>({
    queryKey: ["screen-now-playing", screenId],
    queryFn: async () => {
      const response = await fetch(`/api/screens/${screenId}/now-playing`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch now playing");
      return response.json();
    },
    enabled: !!screenId,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Screen repair mutation with extended observability
  const repairScreenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/screens/${screenId}/repair`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        let description = `Baseline: ${data.baselineCount || 0}, Ads: ${data.adsCount || 0}`;
        if (data.baselineFallbackUsed) {
          description += " (Fallback content)";
        }
        if (data.verificationOk) {
          description += " ✓ Verified";
        }
        toast({ title: "Reparatie voltooid", description });
      } else {
        let errorDesc = data.errorReason || "Onbekende fout";
        if (data.baselineError) {
          errorDesc = `Baseline: ${data.baselineError}. ${errorDesc}`;
        }
        if (data.verificationError) {
          errorDesc += ` Verificatie: ${data.verificationError}`;
        }
        toast({ title: "Reparatie mislukt", description: errorDesc, variant: "destructive" });
      }
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
      queryClient.invalidateQueries({ queryKey: ["location-content-status"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // Quick Repair + Proof mutation (fast cycle)
  const repairAndProofMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/screens/${screenId}/repair-and-proof`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast({ 
          title: "Repair + Proof succesvol", 
          description: `Items: ${data.verification?.itemCount || 0}, Screenshot: ${data.screenshot?.ok ? "OK" : "niet beschikbaar"}` 
        });
      } else {
        toast({ 
          title: "Proof onvolledig", 
          description: data.proof?.reason || "Onbekende fout",
          variant: "destructive" 
        });
      }
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // FORCE Repair + Proof mutation (FULL E2E cycle with polling + NO CONTENT detection)
  const forceRepairProofMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/screens/${screenId}/force-repair-proof`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.proofStatus?.ok) {
        toast({ 
          title: "✓ PROOF OK - Scherm speelt content af", 
          description: `Playlist: ${data.itemCount} items (${data.baselineCount} baseline + ${data.adsCount} ads). Polls: ${data.pollAttempts}` 
        });
      } else if (data.proofStatus?.detectedNoContent) {
        toast({ 
          title: "✗ NO CONTENT gedetecteerd", 
          description: "Screenshot toont nog steeds 'NO CONTENT TO PLAY'. Probeer later opnieuw.",
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "⚠️ Proof onvolledig", 
          description: data.proofStatus?.reason || "Controleer screenshot handmatig",
          variant: "destructive" 
        });
      }
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });
  
  // PUSH TO SCREEN mutation - Production-grade playlist assignment + content push
  const pushToScreenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/screens/${screenId}/push-to-screen`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.proofStatus?.ok) {
        toast({ 
          title: "✓ PUSH OK - Content gepusht naar scherm", 
          description: `source_id: ${data.afterSource?.sourceId}, ${data.playlistItemCount} items. Polls: ${data.pollAttempts}` 
        });
      } else if (data.afterSource?.sourceId) {
        toast({ 
          title: "✓ Playlist toegewezen", 
          description: `source_id: ${data.afterSource.sourceId}. ${data.proofStatus?.reason || "Screenshot niet beschikbaar"}`,
        });
      } else {
        toast({ 
          title: "⚠️ Push onvolledig", 
          description: data.proofStatus?.reason || "Controleer configuratie",
          variant: "destructive" 
        });
      }
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Fout bij push", description: error.message, variant: "destructive" });
    },
  });
  
  // FORCE BROADCAST mutation - Deterministic playback with known-good content
  const forceBroadcastMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/screens/${screenId}/force-broadcast`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.verificationOk) {
        toast({ 
          title: "✓ Uitzending geforceerd", 
          description: `Playlist ${data.effectivePlaylistId}: ${data.playlistItemCount} items. ${data.knownGoodPresent ? "KnownGood aanwezig." : ""}` 
        });
      } else {
        toast({ 
          title: "⚠️ Enforce onvolledig", 
          description: `Before: ${data.before?.sourceId}, After: ${data.after?.sourceId}. Items: ${data.playlistItemCount}`,
          variant: "destructive" 
        });
      }
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Fout bij forceren", description: error.message, variant: "destructive" });
    },
  });
  
  // FORCE PUSH mutation - Surgical fix that guarantees playback
  const forcePushMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/screens/${screenId}/force-push`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast({ 
          title: "✓ Force Push OK", 
          description: `Playlist ${data.targetPlaylistId} met ${data.playlistItemCount} items. Screenshot: ${data.screenshot?.byteSize ? `${Math.round(data.screenshot.byteSize/1024)}KB` : "n/a"}` 
        });
      } else {
        toast({ 
          title: "⚠️ Force Push onvolledig", 
          description: data.error || "Controleer logs",
          variant: "destructive" 
        });
      }
      refetchNowPlaying();
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Force Push fout", description: error.message, variant: "destructive" });
    },
  });
  
  // PROOF mutation - Fresh screenshot with full diagnostics
  const [proofResult, setProofResult] = useState<{
    valid: boolean;
    byteSize: number | null;
    reason: string | null;
    lastOkAt: string | null;
    urlWithBuster: string | null;
  } | null>(null);
  
  const proofMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/screens/${screenId}/proof`);
      return response.json();
    },
    onSuccess: (data) => {
      setProofResult({
        valid: data.valid,
        byteSize: data.byteSize,
        reason: data.reason,
        lastOkAt: data.lastOkAt,
        urlWithBuster: data.urlWithBuster,
      });
      if (data.valid) {
        toast({ 
          title: "✓ Bewijs vernieuwd", 
          description: `Screenshot ${Math.round((data.byteSize || 0)/1024)}KB - geldig` 
        });
      } else {
        toast({ 
          title: "⚠️ Screenshot ongeldig", 
          description: data.reason === "too_small" ? "Te klein (< 10KB)" : data.reason || "Onbekend",
          variant: "destructive" 
        });
      }
      queryClient.invalidateQueries({ queryKey: ["screen-now-playing", screenId] });
    },
    onError: (error: any) => {
      toast({ title: "Bewijs fout", description: error.message, variant: "destructive" });
    },
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
            {screen.status !== "online" && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Laatst gezien: {formatLastSeen(screen.lastSeenAt)}
              </p>
            )}
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

          {/* Wat draait nu? - Unified status panel */}
          <Card data-testid="card-wat-draait-nu" className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" />
                Wat draait nu?
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchNowPlaying()}
                  disabled={nowPlayingLoading}
                  className="ml-auto"
                  data-testid="btn-refresh-now-playing"
                >
                  <RefreshCw className={`h-4 w-4 ${nowPlayingLoading ? "animate-spin" : ""}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {nowPlayingLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              ) : (
                <>
                  {/* Playlist Connection Status */}
                  {nowPlaying?.ok && nowPlaying.actualSourceType === "playlist" ? (
                    <>
                      {/* Connected - Green status banner */}
                      <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                        nowPlaying.isCorrect 
                          ? "bg-green-50 border-green-200" 
                          : "bg-amber-50 border-amber-200"
                      }`} data-testid="connection-status">
                        {nowPlaying.isCorrect ? (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-800">Gekoppeld</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-5 w-5 text-amber-600" />
                            <span className="font-medium text-amber-800">Playlist mismatch</span>
                            <span className="text-sm text-amber-600 ml-2">
                              (verwacht: {nowPlaying.expectedPlaylistId})
                            </span>
                          </>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-sm text-muted-foreground">Actieve playlist</p>
                          <p className="font-medium truncate" title={nowPlaying.actualSourceName || undefined}>
                            {nowPlaying.actualSourceName || "Onbekend"}
                          </p>
                          <p className="text-xs text-muted-foreground">ID: {nowPlaying.actualSourceId}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-sm text-muted-foreground">Content</p>
                          <p className="font-medium">{nowPlaying.itemCount || 0} items</p>
                          {nowPlaying.itemCount === 0 && (
                            <Badge variant="destructive" className="mt-1 text-xs">LEEG!</Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Top Items List */}
                      {nowPlaying.topItems && nowPlaying.topItems.length > 0 && (
                        <div className="p-3 bg-muted/20 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-2">Eerste items:</p>
                          <ul className="text-sm space-y-1">
                            {nowPlaying.topItems.map((item, idx) => (
                              <li key={idx} className="flex items-center gap-2">
                                <span className="text-muted-foreground">{idx + 1}.</span>
                                <span className="truncate">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Not connected */
                    <div className="flex items-center gap-2 p-3 rounded-lg border bg-gray-50 border-gray-200" data-testid="connection-status">
                      <Link2 className="h-5 w-5 text-gray-500" />
                      <span className="font-medium text-gray-800">Niet gekoppeld</span>
                      {nowPlaying?.error && (
                        <span className="text-sm text-gray-600 ml-2">({nowPlaying.error})</span>
                      )}
                    </div>
                  )}

                  {/* Mismatch/Info Messages - differentiated by level */}
                  {nowPlaying?.mismatchReason && nowPlaying?.mismatchLevel === "error" && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="mismatch-error">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">Probleem gedetecteerd</p>
                        <p className="text-sm text-red-700">{nowPlaying.mismatchReason}</p>
                      </div>
                    </div>
                  )}
                  {nowPlaying?.mismatchReason && nowPlaying?.mismatchLevel === "warning" && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg" data-testid="mismatch-warning">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium text-amber-800">Let op</p>
                        <p className="text-sm text-amber-700">{nowPlaying.mismatchReason}</p>
                      </div>
                    </div>
                  )}
                  {nowPlaying?.mismatchReason && nowPlaying?.mismatchLevel === "info" && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg" data-testid="mismatch-info">
                      <Info className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-800">Info</p>
                        <p className="text-sm text-blue-700">{nowPlaying.mismatchReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {nowPlaying?.error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">Fout</p>
                        <p className="text-sm text-red-700">{nowPlaying.error}</p>
                      </div>
                    </div>
                  )}

                  {/* Layout Mode Warning - PLAYLIST-ONLY enforcement */}
                  {isAdmin && sourceStatus?.ok && sourceStatus?.actual?.type && sourceStatus.actual.type !== "playlist" && (
                    <div className="flex items-center justify-between gap-2 p-3 bg-red-100 border border-red-300 rounded-lg" data-testid="layout-mode-warning">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <div>
                          <p className="font-medium text-red-800">Scherm in {sourceStatus.actual.type.toUpperCase()} mode</p>
                          <p className="text-sm text-red-700">
                            Verwacht: playlist:{sourceStatus.expected?.id ?? "?"} | Werkelijk: {sourceStatus.actual.type}:{sourceStatus.actual.id ?? "?"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => fixPlaylistModeMutation.mutate()}
                        disabled={fixPlaylistModeMutation.isPending}
                        data-testid="btn-fix-playlist-mode"
                      >
                        {fixPlaylistModeMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Herstellen...
                          </>
                        ) : (
                          <>
                            <Wrench className="h-4 w-4 mr-2" />
                            Fix naar playlist
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Source Status Badge */}
                  {isAdmin && sourceStatus?.ok && !sourceStatusLoading && sourceStatus?.actual?.type === "playlist" && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg" data-testid="playlist-mode-ok">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-700">
                        Playlist mode OK (id: {sourceStatus.actual.id})
                      </span>
                    </div>
                  )}

                  {/* Repair Buttons */}
                  {isAdmin && nowPlaying?.deviceStatus?.status !== "UNLINKED" && (
                    <>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => repairScreenMutation.mutate()}
                          disabled={repairScreenMutation.isPending || repairAndProofMutation.isPending}
                          className="flex-1"
                          data-testid="btn-force-repair"
                        >
                          {repairScreenMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Repareren...
                            </>
                          ) : (
                            <>
                              <Wrench className="h-4 w-4 mr-2" />
                              Force repair
                            </>
                          )}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => forceRepairProofMutation.mutate()}
                          disabled={repairScreenMutation.isPending || forceRepairProofMutation.isPending || pushToScreenMutation.isPending}
                          className="flex-1"
                          data-testid="btn-force-repair-proof"
                        >
                          {forceRepairProofMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              E2E Proof (~60s)...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Force Repair + Proof
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pushToScreenMutation.mutate()}
                          disabled={repairScreenMutation.isPending || forceRepairProofMutation.isPending || pushToScreenMutation.isPending || forcePushMutation.isPending}
                          className="flex-1"
                          data-testid="btn-push-to-screen"
                        >
                          {pushToScreenMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Pushen...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Push to Screen
                            </>
                          )}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => forcePushMutation.mutate()}
                          disabled={repairScreenMutation.isPending || forceRepairProofMutation.isPending || pushToScreenMutation.isPending || forcePushMutation.isPending || forceBroadcastMutation.isPending}
                          className="flex-1"
                          data-testid="btn-force-push"
                        >
                          {forcePushMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Force Push...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Force Push
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => forceBroadcastMutation.mutate()}
                          disabled={repairScreenMutation.isPending || forceRepairProofMutation.isPending || pushToScreenMutation.isPending || forcePushMutation.isPending || forceBroadcastMutation.isPending}
                          className="flex-1"
                          data-testid="btn-force-broadcast"
                        >
                          {forceBroadcastMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Forceren...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Forceer uitzending (fix)
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => proofMutation.mutate()}
                          disabled={proofMutation.isPending}
                          className="flex-1"
                          data-testid="btn-refresh-proof"
                        >
                          {proofMutation.isPending ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Laden...
                            </>
                          ) : (
                            <>
                              <Image className="h-4 w-4 mr-2" />
                              Ververs bewijs
                            </>
                          )}
                        </Button>
                      </div>
                      {proofResult && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className={proofResult.valid ? "text-green-600" : "text-red-600"}>
                            {proofResult.valid ? "✓ Geldig" : `✗ Ongeldig: ${proofResult.reason}`}
                          </span>
                          {proofResult.byteSize && <span className="ml-2">{Math.round(proofResult.byteSize/1024)}KB</span>}
                          {proofResult.lastOkAt && <span className="ml-2">Laatst OK: {formatDistanceToNow(new Date(proofResult.lastOkAt), { addSuffix: true, locale: nl })}</span>}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

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
                              <div className="flex flex-col gap-1">
                                <Badge 
                                  variant="outline"
                                  className={isLinked ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}
                                >
                                  {isLinked ? "Gekoppeld" : "Niet gekoppeld"}
                                </Badge>
                                {!isLinked && activePlacements.length === 0 && (
                                  <span className="text-xs text-muted-foreground">Geen plaatsing</span>
                                )}
                                {!isLinked && activePlacements.length > 0 && (
                                  <span className="text-xs text-muted-foreground">Asset niet approved</span>
                                )}
                              </div>
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
                <div className="text-center py-8">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  {placementSearch ? (
                    <p className="text-muted-foreground">Geen resultaten voor "{placementSearch}"</p>
                  ) : (
                    <>
                      <h3 className="font-semibold text-lg mb-2">Geen plaatsingen</h3>
                      <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                        Er zijn nog geen advertenties gekoppeld aan dit scherm. 
                        Zodra je een plaatsing maakt, zal de advertentie automatisch worden gesynchroniseerd.
                      </p>
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <span>Dit is de reden waarom ads "Niet gekoppeld" kunnen tonen</span>
                      </div>
                      <Button variant="default" size="lg" asChild data-testid="btn-plaats-advertentie">
                        <Link href={`/onboarding/placement?screenId=${screen.id}`}>
                          <Target className="h-4 w-4 mr-2" />
                          Plaats een advertentie
                        </Link>
                      </Button>
                    </>
                  )}
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
