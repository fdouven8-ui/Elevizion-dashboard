import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Wifi,
  WifiOff,
  Target,
  Users,
  Monitor,
  ChevronRight,
  LinkIcon,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ControlRoomStats {
  screensOnline: number;
  screensTotal: number;
  screensOffline: number;
  activePlacements: number;
  payingAdvertisers: number;
  screensWithPlacements: number;
  screensWithoutPlacements: number;
  screensWithScreenshot: number;
  screensWithYodeckContent: number;
  screensYodeckEmpty: number;
  contentUnknown: number;
  adsTotal: number;
  adsUnlinked: number;
  nonAdsTotal: number;
}

interface ActionItem {
  id: string;
  type: "offline_screen" | "onboarding_hint" | "unmanaged_content" | "paused_placement";
  itemName: string;
  description: string;
  severity: "error" | "warning" | "info";
  link: string;
  statusText?: string;
  contentCount?: number;
  adsCount?: number;
  nonAdsCount?: number;
  adsUnlinkedCount?: number;
  topAds?: string[];
  topNonAds?: string[];
  topItems?: string[];
  sourceType?: string;
  sourceName?: string;
  lastFetchedAt?: string;
}

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useQuery<ControlRoomStats>({
    queryKey: ["/api/control-room/stats"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/control-room/stats");
        return res.json();
      } catch {
        return {
          screensOnline: 0,
          screensTotal: 0,
          screensOffline: 0,
          activePlacements: 0,
          payingAdvertisers: 0,
          adsTotal: 0,
          adsUnlinked: 0,
        };
      }
    },
    refetchInterval: 30000,
  });

  const { data: actionItems = [], isLoading: actionsLoading } = useQuery<ActionItem[]>({
    queryKey: ["/api/control-room/actions"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/control-room/actions");
        return res.json();
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
  });

  // Bereken KPI waarden
  const screensOnline = stats?.screensOnline || 0;
  const screensTotal = stats?.screensTotal || 0;
  const screensOffline = stats?.screensOffline || 0;
  const activePlacements = stats?.activePlacements || 0;
  const adsTotal = stats?.adsTotal || 0;
  const adsUnlinked = stats?.adsUnlinked || 0;
  const payingAdvertisers = stats?.payingAdvertisers || 0;

  // Acties filteren
  const offlineScreens = actionItems.filter(item => item.type === 'offline_screen');
  const hasIssues = offlineScreens.length > 0 || adsUnlinked > 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Home</h1>
        <p className="text-muted-foreground">Overzicht van je Elevizion netwerk</p>
      </div>

      {/* KPI Cards - 3 samengevoegde kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* SCHERMEN (samengevoegd) */}
        <Link href="/screens">
          <Card className="hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer h-full" data-testid="kpi-schermen">
            <div className="h-1 bg-emerald-500" />
            <CardContent className="pt-4 pb-4">
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Schermen</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-emerald-600">{screensOnline}</span>
                      <span className="text-lg text-muted-foreground">/ {screensTotal}</span>
                      <span className="text-sm text-muted-foreground">online</span>
                    </div>
                    {screensOffline > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <WifiOff className="h-3 w-3 text-red-500" />
                        <span className="text-sm text-red-600 font-medium">{screensOffline} offline</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2 rounded-full bg-emerald-50 flex-shrink-0">
                    <Wifi className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* PLAATSINGEN & ADS (samengevoegd) */}
        <Card className={`h-full ${adsUnlinked > 0 ? 'border-amber-300' : ''}`} data-testid="kpi-plaatsingen-ads">
          <div className="h-1 bg-blue-500" />
          <CardContent className="pt-4 pb-4">
            {statsLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Plaatsingen & Ads</p>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-bold">{activePlacements}</span>
                    <span className="text-sm text-muted-foreground">actieve plaatsingen</span>
                  </div>
                  <div className="space-y-0.5 text-sm">
                    <div className="text-muted-foreground">
                      Ads totaal: <span className="font-medium text-foreground">{adsTotal}</span>
                    </div>
                    {adsUnlinked > 0 && (
                      <div className="text-amber-600">
                        Niet gekoppeld: <span className="font-medium">{adsUnlinked}</span>
                      </div>
                    )}
                  </div>
                  <Link href="/placements">
                    <Button variant="outline" size="sm" className="mt-3" data-testid="button-bekijk-details">
                      Bekijk details
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
                <div className="p-2 rounded-full bg-blue-50 flex-shrink-0">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* BETALENDE ADVERTEERDERS */}
        <Link href="/advertisers?filter=paying">
          <Card className="hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer h-full" data-testid="kpi-adverteerders">
            <div className="h-1 bg-purple-500" />
            <CardContent className="pt-4 pb-4">
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Betalende adverteerders</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{payingAdvertisers}</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-full bg-purple-50 flex-shrink-0">
                    <Users className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Acties & Alerts Panel */}
      <Card data-testid="acties-alerts-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Acties & Alerts</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {actionsLoading || statsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !hasIssues ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
              <p className="text-sm font-medium">Geen acties nodig — alles loopt.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Offline Schermen */}
              {offlineScreens.length > 0 && (
                <div className="border rounded-lg p-4" data-testid="alert-offline-screens">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-full bg-red-50">
                      <WifiOff className="h-4 w-4 text-red-600" />
                    </div>
                    <span className="font-medium text-sm">Offline schermen</span>
                    <Badge variant="destructive" className="ml-auto">{offlineScreens.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {offlineScreens.slice(0, 5).map((screen) => (
                      <Link key={screen.id} href={screen.link}>
                        <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer text-sm">
                          <span className="truncate">{screen.itemName}</span>
                          <Badge variant="destructive" className="text-xs shrink-0 ml-2">Offline</Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {offlineScreens.length > 5 && (
                    <div className="text-xs text-muted-foreground mt-2 text-center">
                      +{offlineScreens.length - 5} meer
                    </div>
                  )}
                  <Link href="/screens?status=offline">
                    <Button variant="outline" size="sm" className="w-full mt-3" data-testid="link-alle-offline">
                      Bekijk alle offline schermen
                      <ExternalLink className="h-3 w-3 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}

              {/* Ads niet gekoppeld */}
              {adsUnlinked > 0 && (
                <div className="border rounded-lg p-4 border-amber-200" data-testid="alert-unlinked-ads">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-full bg-amber-50">
                      <LinkIcon className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="font-medium text-sm">Ads niet gekoppeld</span>
                    <Badge className="ml-auto bg-amber-100 text-amber-800">{adsUnlinked}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Er zijn {adsUnlinked} ads die nog niet aan een adverteerder of plaatsing gekoppeld zijn.
                  </p>
                  <Link href="/placements">
                    <Button variant="outline" size="sm" className="w-full text-amber-600 border-amber-300 hover:bg-amber-50" data-testid="link-koppelen">
                      Koppelen
                      <ChevronRight className="h-3 w-3 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
