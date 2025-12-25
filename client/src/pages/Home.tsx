import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpandableCard } from "@/components/ui/expandable-card";
import { ExpandableKpiCard } from "@/components/ui/expandable-kpi-card";
import { 
  Wifi,
  WifiOff,
  Target,
  Users,
  ChevronRight,
  LinkIcon,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface AdViewItem {
  yodeckMediaId: number;
  name: string;
  status: 'linked' | 'unlinked';
}

interface AdsViewResponse {
  items: AdViewItem[];
  summary: { total: number; linked: number; unlinked: number };
}

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

  const { data: adsViewData } = useQuery<AdsViewResponse>({
    queryKey: ["/api/placements/ads-view"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/placements/ads-view");
        return res.json();
      } catch {
        return { items: [], summary: { total: 0, linked: 0, unlinked: 0 } };
      }
    },
    refetchInterval: 60000,
  });

  // Top 5 unlinked ads voor Acties panel
  const topUnlinkedAds = (adsViewData?.items || [])
    .filter(ad => ad.status === 'unlinked')
    .slice(0, 5);

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

      {/* KPI Cards - 3 uitklapbare kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* SCHERMEN (uitklapbaar) */}
        {statsLoading ? (
          <Card><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : (
          <ExpandableKpiCard
            title="Schermen"
            icon={<Wifi className="h-5 w-5 text-emerald-600" />}
            mainValue={
              <div className="flex items-baseline gap-2">
                <span className="text-emerald-600">{screensOnline}</span>
                <span className="text-lg text-muted-foreground font-normal">/ {screensTotal}</span>
              </div>
            }
            summary={screensOffline > 0 ? `${screensOffline} offline` : "Alles online"}
            accentColor="bg-emerald-500"
            data-testid="kpi-schermen"
          >
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Online</span>
                <span className="font-medium text-emerald-600">{screensOnline}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Offline</span>
                <span className={`font-medium ${screensOffline > 0 ? 'text-red-600' : ''}`}>{screensOffline}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Totaal</span>
                <span className="font-medium">{screensTotal}</span>
              </div>
              <Link href="/screens">
                <Button variant="outline" size="sm" className="w-full mt-2" data-testid="link-schermen">
                  Bekijk schermen
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </ExpandableKpiCard>
        )}

        {/* PLAATSINGEN & ADS (uitklapbaar) */}
        {statsLoading ? (
          <Card><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : (
          <ExpandableKpiCard
            title="Plaatsingen & Ads"
            icon={<Target className="h-5 w-5 text-blue-600" />}
            mainValue={activePlacements}
            summary={adsUnlinked > 0 ? `${adsUnlinked} ads niet gekoppeld` : `${adsTotal} ads totaal`}
            accentColor="bg-blue-500"
            className={adsUnlinked > 0 ? 'border-amber-300' : ''}
            data-testid="kpi-plaatsingen-ads"
          >
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Actieve plaatsingen</span>
                <span className="font-medium">{activePlacements}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ads totaal</span>
                <span className="font-medium">{adsTotal}</span>
              </div>
              {adsUnlinked > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Niet gekoppeld</span>
                  <span className="font-medium text-amber-600">{adsUnlinked}</span>
                </div>
              )}
              <Link href="/placements">
                <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-bekijk-details">
                  Bekijk plaatsingen
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </ExpandableKpiCard>
        )}

        {/* BETALENDE ADVERTEERDERS (uitklapbaar) */}
        {statsLoading ? (
          <Card><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : (
          <ExpandableKpiCard
            title="Betalende adverteerders"
            icon={<Users className="h-5 w-5 text-purple-600" />}
            mainValue={payingAdvertisers}
            summary="Actieve klanten"
            accentColor="bg-purple-500"
            data-testid="kpi-adverteerders"
          >
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Betalend</span>
                <span className="font-medium">{payingAdvertisers}</span>
              </div>
              <Link href="/advertisers?filter=paying">
                <Button variant="outline" size="sm" className="w-full mt-2" data-testid="link-adverteerders">
                  Bekijk adverteerders
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </ExpandableKpiCard>
        )}
      </div>

      {/* Acties & Alerts Panel */}
      <div data-testid="acties-alerts-panel">
        <h2 className="text-base font-medium mb-3">Acties & Alerts</h2>
        {actionsLoading || statsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : !hasIssues ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
            <p className="text-sm font-medium">Geen acties nodig — alles loopt.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            {/* Offline Schermen */}
            {offlineScreens.length > 0 && (
              <ExpandableCard
                title="Offline schermen"
                icon={<WifiOff className="h-4 w-4 text-red-600" />}
                countBadge={offlineScreens.length}
                variant="danger"
                summaryLine={offlineScreens.length > 0 
                  ? `${offlineScreens.slice(0, 2).map(s => s.itemName).join(", ")}${offlineScreens.length > 2 ? ` +${offlineScreens.length - 2}` : ""}`
                  : "Geen offline schermen"
                }
                data-testid="alert-offline-screens"
              >
                <div className="space-y-1.5">
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
              </ExpandableCard>
            )}

            {/* Ads niet gekoppeld */}
            {adsUnlinked > 0 && (
              <ExpandableCard
                title="Ads niet gekoppeld"
                icon={<LinkIcon className="h-4 w-4 text-amber-600" />}
                countBadge={adsUnlinked}
                variant="warning"
                summaryLine={topUnlinkedAds.length > 0 
                  ? `${topUnlinkedAds.slice(0, 2).map(a => a.name).join(", ")}${adsUnlinked > 2 ? ` +${adsUnlinked - 2}` : ""}`
                  : `${adsUnlinked} ads te koppelen`
                }
                data-testid="alert-unlinked-ads"
              >
                {topUnlinkedAds.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {topUnlinkedAds.map((ad) => (
                      <div 
                        key={ad.yodeckMediaId} 
                        className="flex items-center gap-2 py-1 px-2 rounded bg-amber-50/50 text-sm"
                      >
                        <Target className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="truncate text-muted-foreground">{ad.name}</span>
                      </div>
                    ))}
                    {adsUnlinked > 5 && (
                      <div className="text-xs text-muted-foreground text-center pt-1">
                        +{adsUnlinked - 5} meer ads
                      </div>
                    )}
                  </div>
                )}
                <Link href="/placements">
                  <Button variant="outline" size="sm" className="w-full text-amber-600 border-amber-300 hover:bg-amber-50" data-testid="link-koppelen">
                    Koppelen
                    <ChevronRight className="h-3 w-3 ml-2" />
                  </Button>
                </Link>
              </ExpandableCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
