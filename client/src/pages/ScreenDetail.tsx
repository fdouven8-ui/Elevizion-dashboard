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
  AlertCircle,
  Database
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { placementsApi } from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
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

  const [activeTab, setActiveTab] = useState("overzicht");
  const [contentSearch, setContentSearch] = useState("");
  const [contentFilter, setContentFilter] = useState<"all" | "ads" | "other">("all");
  const [placementSearch, setPlacementSearch] = useState("");

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
      window.open(`https://wa.me/${location.phone.replace(/\D/g, "")}`, "_blank");
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

        {/* TAB: Overzicht */}
        <TabsContent value="overzicht" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={screen.status === "online" ? "default" : "destructive"}>
                    {screen.status === "online" ? "Online" : "Offline"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Laatst gezien: {formatLastSeen(screen.lastSeenAt)}
                </p>
              </CardContent>
            </Card>

            {/* Placements Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Actieve plaatsingen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{activePlacements.length}</div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setActiveTab("plaatsingen")}
                >
                  Bekijk plaatsingen
                </Button>
              </CardContent>
            </Card>

            {/* Content Summary Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Content samenvatting
                </CardTitle>
              </CardHeader>
              <CardContent>
                {screenDetailLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : currentContent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Geen content gedetecteerd</p>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Ads:</span>
                      <span className="font-medium">{adsCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Overig:</span>
                      <span className="font-medium">{nonAdsCount}</span>
                    </div>
                    {adsUnlinkedCount > 0 && (
                      <div className="flex justify-between text-sm text-amber-600">
                        <span>Niet gekoppeld:</span>
                        <span className="font-medium">{adsUnlinkedCount}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
