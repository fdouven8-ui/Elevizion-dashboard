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
  Database,
  MapPin,
  Monitor,
  Building2,
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
  locationsTotal: number;
  locationsWithMoneybird: number;
  locationsWithoutMoneybird: number;
  locationsAddressComplete: number;
  locationsAddressIncomplete: number;
  screensWithoutLocation: number;
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
  
  // Data compleetheid
  const locationsTotal = stats?.locationsTotal || 0;
  const locationsWithMoneybird = stats?.locationsWithMoneybird || 0;
  const locationsWithoutMoneybird = stats?.locationsWithoutMoneybird || 0;
  const locationsAddressIncomplete = stats?.locationsAddressIncomplete || 0;
  const screensWithoutLocation = stats?.screensWithoutLocation || 0;
  
  const dataIssues = locationsWithoutMoneybird + locationsAddressIncomplete + screensWithoutLocation;
  const dataComplete = dataIssues === 0 && locationsTotal > 0;

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title">Home</h1>
        <p className="text-sm text-muted-foreground mt-1">Overzicht van je netwerk</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* SCHERMEN */}
        {statsLoading ? (
          <Card className="border-border/50"><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : (
          <ExpandableKpiCard
            title="Schermen"
            icon={<Wifi className="h-5 w-5 text-teal-600" />}
            mainValue={
              <div className="flex items-baseline gap-2">
                <span className="text-teal-600">{screensOnline}</span>
                <span className="text-lg text-muted-foreground/70 font-normal">/ {screensTotal}</span>
              </div>
            }
            summary={screensOffline > 0 ? `${screensOffline} offline` : "Alles online"}
            accentColor="bg-teal-500"
            data-testid="kpi-schermen"
          >
            <div className="space-y-2.5 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Online</span>
                <span className="font-medium text-teal-600">{screensOnline}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Offline</span>
                <span className={`font-medium ${screensOffline > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{screensOffline}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Totaal</span>
                <span className="font-medium">{screensTotal}</span>
              </div>
              <Link href="/screens">
                <Button variant="outline" size="sm" className="w-full mt-3 h-8" data-testid="link-schermen">
                  Bekijk schermen
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </ExpandableKpiCard>
        )}

        {/* PLAATSINGEN & ADS */}
        {statsLoading ? (
          <Card className="border-border/50"><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : (
          <ExpandableKpiCard
            title="Plaatsingen"
            icon={<Target className="h-5 w-5 text-sky-600" />}
            mainValue={activePlacements}
            summary={adsUnlinked > 0 ? `${adsUnlinked} niet gekoppeld` : `${adsTotal} ads`}
            accentColor="bg-sky-500"
            className={adsUnlinked > 0 ? 'border-orange-200' : ''}
            data-testid="kpi-plaatsingen-ads"
          >
            <div className="space-y-2.5 pt-1">
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
                  <span className="text-orange-600">Niet gekoppeld</span>
                  <span className="font-medium text-orange-600">{adsUnlinked}</span>
                </div>
              )}
              <Link href="/placements">
                <Button variant="outline" size="sm" className="w-full mt-3 h-8" data-testid="button-bekijk-details">
                  Bekijk plaatsingen
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </ExpandableKpiCard>
        )}

        {/* BETALENDE ADVERTEERDERS */}
        {statsLoading ? (
          <Card className="border-border/50"><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ) : (
          <ExpandableKpiCard
            title="Adverteerders"
            icon={<Users className="h-5 w-5 text-violet-600" />}
            mainValue={payingAdvertisers}
            summary="Betalend"
            accentColor="bg-violet-500"
            data-testid="kpi-adverteerders"
          >
            <div className="space-y-2.5 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Betalend</span>
                <span className="font-medium">{payingAdvertisers}</span>
              </div>
              <Link href="/advertisers?filter=paying">
                <Button variant="outline" size="sm" className="w-full mt-3 h-8" data-testid="link-adverteerders">
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
        <h2 className="text-lg font-medium mb-4">Acties</h2>
        {actionsLoading || statsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : !hasIssues ? (
          <div className="text-center py-10 text-muted-foreground border border-border/50 rounded-xl bg-card">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-teal-500/60" />
            <p className="text-sm">Alles loopt</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
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
                icon={<LinkIcon className="h-4 w-4 text-orange-500" />}
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
                        className="flex items-center gap-2 py-1.5 px-2 rounded bg-orange-50/50 text-sm"
                      >
                        <Target className="h-3 w-3 text-orange-400 shrink-0" />
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
                  <Button variant="outline" size="sm" className="w-full h-8 text-orange-600 border-orange-200 hover:bg-orange-50" data-testid="link-koppelen">
                    Koppelen
                    <ChevronRight className="h-3 w-3 ml-2" />
                  </Button>
                </Link>
              </ExpandableCard>
            )}
          </div>
        )}
      </div>

      {/* Data Compleetheid Widget */}
      <div data-testid="data-compleetheid-panel">
        <h2 className="text-lg font-medium mb-4">Data Compleetheid</h2>
        {statsLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : dataComplete ? (
          <div className="text-center py-8 text-muted-foreground border border-border/50 rounded-xl bg-card">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-teal-500/60" />
            <p className="text-sm">Alle data compleet</p>
          </div>
        ) : (
          <Card className="border-border/50">
            <CardContent className="pt-5 pb-4">
              <div className="space-y-4">
                {/* Locaties zonder Moneybird */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${locationsWithoutMoneybird > 0 ? 'bg-orange-50' : 'bg-teal-50'}`}>
                      <Database className={`h-4 w-4 ${locationsWithoutMoneybird > 0 ? 'text-orange-500' : 'text-teal-600'}`} />
                    </div>
                    <span className="text-sm">Locaties zonder Moneybird</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {locationsWithoutMoneybird > 0 ? (
                      <>
                        <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50/50">{locationsWithoutMoneybird}</Badge>
                        <Link href="/locations">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50/50">OK</Badge>
                    )}
                  </div>
                </div>

                {/* Locaties met onvolledig adres */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${locationsAddressIncomplete > 0 ? 'bg-orange-50' : 'bg-teal-50'}`}>
                      <MapPin className={`h-4 w-4 ${locationsAddressIncomplete > 0 ? 'text-orange-500' : 'text-teal-600'}`} />
                    </div>
                    <span className="text-sm">Locaties onvolledig adres</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {locationsAddressIncomplete > 0 ? (
                      <>
                        <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50/50">{locationsAddressIncomplete}</Badge>
                        <Link href="/locations">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50/50">OK</Badge>
                    )}
                  </div>
                </div>

                {/* Schermen zonder locatie */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${screensWithoutLocation > 0 ? 'bg-orange-50' : 'bg-teal-50'}`}>
                      <Monitor className={`h-4 w-4 ${screensWithoutLocation > 0 ? 'text-orange-500' : 'text-teal-600'}`} />
                    </div>
                    <span className="text-sm">Schermen zonder locatie</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {screensWithoutLocation > 0 ? (
                      <>
                        <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50/50">{screensWithoutLocation}</Badge>
                        <Link href="/screens">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </Link>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50/50">OK</Badge>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Link naar Schermen met filter */}
              {locationsWithoutMoneybird > 0 && (
                <div className="pt-3 border-t mt-3">
                  <Link href="/screens?moneybird=missing">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      data-testid="button-link-schermen-filter"
                    >
                      <Monitor className="h-4 w-4 mr-2" />
                      Bekijk schermen zonder Moneybird
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
