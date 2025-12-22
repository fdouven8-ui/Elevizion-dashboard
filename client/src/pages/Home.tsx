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
  Pause,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ControlRoomStats {
  screensOnline: number;
  screensTotal: number;
  screensOffline: number;
  activePlacements: number;
  payingAdvertisers: number;
}

interface ActionItem {
  id: string;
  type: "offline_screen" | "no_placements" | "paused_placement";
  itemName: string;
  description: string;
  severity: "error" | "warning" | "info";
  link: string;
  statusText?: string;
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
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "offline_screen": return WifiOff;
      case "no_placements": return Monitor;
      case "paused_placement": return Pause;
      default: return Monitor;
    }
  };

  const getTypeLabel = (type: string, statusText?: string) => {
    if (statusText) return statusText;
    switch (type) {
      case "offline_screen": return "Offline";
      case "no_placements": return "Geen placements ingesteld in Elevizion";
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
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${colorClasses}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{item.itemName}</span>
                            <Badge variant={getBadgeVariant(item.severity)} className="text-xs px-1.5 py-0">
                              {getTypeLabel(item.type, item.statusText)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
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
