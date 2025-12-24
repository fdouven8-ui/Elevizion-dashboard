import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Wifi,
  WifiOff,
  Target,
  Users,
  Monitor,
  Pause,
  ChevronRight,
  ChevronDown,
  ListMusic,
  Clock,
  ImageOff,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

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

interface ClassifiedMediaItem {
  id: number;
  name: string;
  type: string;
  mediaType?: string;
  duration?: number;
  category: 'ad' | 'non_ad';
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
  mediaItems?: ClassifiedMediaItem[];
}

function YodeckContentPreview({ item }: { item: ActionItem }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const mediaItems = item.mediaItems || [];
  const topAds = item.topAds || [];
  const topNonAds = item.topNonAds || [];
  const contentCount = item.contentCount || 0;
  
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds < 0) return null;
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
  };

  // Derive counts from mediaItems array for consistency with expanded view
  const ads = mediaItems.filter(m => m.category === 'ad');
  const nonAds = mediaItems.filter(m => m.category === 'non_ad');
  const adsCount = ads.length;
  const nonAdsCount = nonAds.length;

  return (
    <div className="mt-2 text-xs" onClick={(e) => e.preventDefault()}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5 flex-wrap">
        {item.sourceName && (
          <div className="flex items-center gap-1">
            <ListMusic className="h-3 w-3" />
            <span className="font-medium">Playlist:</span>
            <span className="truncate max-w-[150px]">{item.sourceName}</span>
          </div>
        )}
        {item.lastFetchedAt && (
          <div className="flex items-center gap-1 text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            <span>{formatDistanceToNow(new Date(item.lastFetchedAt), { addSuffix: true, locale: nl })}</span>
          </div>
        )}
      </div>
      
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Top Ads */}
        {topAds.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1 text-muted-foreground font-medium mb-1">
              <Target className="h-3 w-3 text-orange-500" />
              <span>Ads ({adsCount})</span>
            </div>
            <div className="space-y-0.5 text-muted-foreground pl-4">
              {topAds.slice(0, 3).map((name, idx) => (
                <div key={idx} className="flex items-center gap-1 truncate">
                  <Badge variant="outline" className="h-4 text-[10px] px-1 bg-orange-50 text-orange-600 border-orange-200">AD</Badge>
                  <span className="truncate">{name}</span>
                </div>
              ))}
              {adsCount > 3 && !isExpanded && (
                <span className="text-muted-foreground/70 italic">+{adsCount - 3} meer ads</span>
              )}
            </div>
          </div>
        )}
        
        {/* Top Non-Ads */}
        {topNonAds.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1 text-muted-foreground font-medium mb-1">
              <Monitor className="h-3 w-3 text-blue-500" />
              <span>Overig ({nonAdsCount})</span>
            </div>
            <div className="space-y-0.5 text-muted-foreground pl-4">
              {topNonAds.slice(0, 3).map((name, idx) => (
                <div key={idx} className="flex items-center gap-1 truncate">
                  <Badge variant="outline" className="h-4 text-[10px] px-1 bg-blue-50 text-blue-600 border-blue-200">INFO</Badge>
                  <span className="truncate">{name}</span>
                </div>
              ))}
              {nonAdsCount > 3 && !isExpanded && (
                <span className="text-muted-foreground/70 italic">+{nonAdsCount - 3} meer items</span>
              )}
            </div>
          </div>
        )}
        
        {/* Expanded: Show all media items with badges */}
        <CollapsibleContent className="space-y-2 mt-2 border-t pt-2">
          {ads.length > 0 && (
            <div>
              <div className="text-muted-foreground font-medium mb-1">Alle Ads ({ads.length})</div>
              <div className="space-y-0.5 pl-2">
                {ads.map((media, idx) => (
                  <div key={idx} className="flex items-center gap-1 truncate">
                    <Badge variant="outline" className="h-4 text-[10px] px-1 bg-orange-50 text-orange-600 border-orange-200">AD</Badge>
                    <span className="truncate">{media.name}</span>
                    {media.duration && media.duration > 0 && (
                      <Badge variant="secondary" className="h-4 text-[10px] px-1">
                        {formatDuration(media.duration)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {nonAds.length > 0 && (
            <div>
              <div className="text-muted-foreground font-medium mb-1">Alle Overig ({nonAds.length})</div>
              <div className="space-y-0.5 pl-2">
                {nonAds.map((media, idx) => (
                  <div key={idx} className="flex items-center gap-1 truncate">
                    <Badge variant="outline" className="h-4 text-[10px] px-1 bg-blue-50 text-blue-600 border-blue-200">INFO</Badge>
                    <span className="truncate">{media.name}</span>
                    {media.duration && media.duration > 0 && (
                      <Badge variant="secondary" className="h-4 text-[10px] px-1">
                        {formatDuration(media.duration)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
        
        {contentCount > 0 && (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1 mt-1 text-xs text-primary hover:text-primary"
            >
              <ChevronDown className={`h-3 w-3 mr-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              {isExpanded ? "Minder tonen" : `Toon alle ${contentCount} items`}
            </Button>
          </CollapsibleTrigger>
        )}
      </Collapsible>
    </div>
  );
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

  const kpiTiles = [
    {
      id: "online",
      title: "Schermen online",
      value: stats?.screensOnline || 0,
      subtitle: `/ ${stats?.screensTotal || 0}`,
      icon: Wifi,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
      accentBg: "bg-emerald-500",
      link: "/screens?status=online",
    },
    {
      id: "offline",
      title: "Schermen offline",
      value: stats?.screensOffline || 0,
      icon: WifiOff,
      iconColor: "text-slate-500",
      iconBg: "bg-slate-100",
      accentBg: "bg-slate-400",
      link: "/screens?status=offline",
    },
    {
      id: "ads",
      title: "Ads online",
      value: stats?.activePlacements || 0,
      icon: Target,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
      accentBg: "bg-blue-500",
      link: "/placements?status=active",
    },
    {
      id: "advertisers",
      title: "Actief betalende adverteerders",
      value: stats?.payingAdvertisers || 0,
      icon: Users,
      iconColor: "text-purple-600",
      iconBg: "bg-purple-50",
      accentBg: "bg-purple-500",
      link: "/advertisers?filter=paying",
    },
    ...(stats?.adsUnlinked && stats.adsUnlinked > 0 ? [{
      id: "unlinked-ads",
      title: "Ads niet gekoppeld",
      value: stats.adsUnlinked,
      subtitle: `/ ${stats.adsTotal || 0}`,
      icon: ImageOff,
      iconColor: "text-orange-600",
      iconBg: "bg-orange-50",
      accentBg: "bg-orange-500",
      link: "/yodeck-creatives?filter=unlinked",
    }] : []),
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "offline_screen": return WifiOff;
      case "onboarding_hint": return Target;
      case "unmanaged_content": return Monitor;
      case "paused_placement": return Pause;
      default: return Monitor;
    }
  };

  const getTypeLabel = (type: string, item?: ActionItem) => {
    switch (type) {
      case "offline_screen": return "Offline";
      case "onboarding_hint": return "Nog geen placements";
      case "unmanaged_content": 
        if (item?.contentCount && item.contentCount > 0) {
          return `Externe content (Yodeck) • ${item.contentCount} items`;
        }
        return "Externe content (Yodeck)";
      case "paused_placement": return "Gepauzeerd";
      default: return type;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error": return "text-red-600 bg-red-50";
      case "warning": return "text-amber-600 bg-amber-50";
      case "info": return "text-blue-600 bg-blue-50";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const getBadgeVariant = (severity: string): "destructive" | "secondary" | "outline" => {
    switch (severity) {
      case "error": return "destructive";
      case "warning": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Home</h1>
        <p className="text-muted-foreground">Overzicht van je Elevizion netwerk</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiTiles.map((tile) => (
          <Link key={tile.id} href={tile.link}>
            <div 
              className="bg-card rounded-lg shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] border border-border overflow-hidden"
              data-testid={`kpi-${tile.id}`}
            >
              <div className={`h-1 ${tile.accentBg}`} />
              <div className="p-5">
                {statsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">{tile.title}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          {tile.value}
                        </span>
                        {tile.subtitle && (
                          <span className="text-lg text-muted-foreground">{tile.subtitle}</span>
                        )}
                      </div>
                    </div>
                    <div className={`p-3 rounded-full ${tile.iconBg}`}>
                      <tile.icon className={`h-6 w-6 ${tile.iconColor}`} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Lightweight Action Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-muted-foreground">Actie Overzicht</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {actionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : actionItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Monitor className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Geen items om te tonen</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actionItems.map((item) => {
                const Icon = getTypeIcon(item.type);
                const colorClasses = getSeverityColor(item.severity);
                return (
                  <Link key={item.id} href={item.link}>
                    <div 
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                      data-testid={`action-item-${item.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`p-2 rounded-full ${colorClasses} shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{item.itemName}</span>
                            <Badge variant={getBadgeVariant(item.severity)} className="text-xs px-1.5 py-0">
                              {getTypeLabel(item.type, item)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                          {item.type === "unmanaged_content" && item.topItems && item.topItems.length > 0 && (
                            <YodeckContentPreview item={item} />
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        Open
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
