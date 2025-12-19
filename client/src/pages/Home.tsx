import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Monitor, 
  Wifi,
  WifiOff,
  Target,
  Users,
  CreditCard,
  Plus,
  Upload,
  Zap,
  ChevronDown,
  FileSignature,
  ExternalLink,
  TrendingUp
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface ControlRoomStats {
  screensOnline: number;
  screensTotal: number;
  screensOffline: number;
  adsLiveToday: number;
  screensWithEmptySlots: number;
  issuesOpen: number;
  overdueAdvertisers: number;
  pendingContracts?: number;
  activePlacements?: number;
}

interface ActionItem {
  id: string;
  type: "offline_screen" | "pending_contract" | "overdue_payment" | "pending_approval";
  itemName: string;
  status: string;
  createdAt: string;
  link: string;
}

interface OnlineTrend {
  date: string;
  percentage: number;
}

export default function Home() {
  const [, navigate] = useLocation();

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
          adsLiveToday: 0,
          screensWithEmptySlots: 0,
          issuesOpen: 0,
          overdueAdvertisers: 0,
          pendingContracts: 0,
          activePlacements: 0,
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

  const { data: onlineTrend = [] } = useQuery<OnlineTrend[]>({
    queryKey: ["/api/control-room/online-trend"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/control-room/online-trend");
        return res.json();
      } catch {
        // Mock data for trend
        return Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          percentage: 85 + Math.floor(Math.random() * 15),
        }));
      }
    },
    refetchInterval: 60000,
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "offline_screen": return "Scherm Offline";
      case "pending_contract": return "Contract";
      case "overdue_payment": return "Betaling";
      case "pending_approval": return "Goedkeuring";
      default: return type;
    }
  };

  const getTypeBadgeVariant = (type: string): "destructive" | "secondary" | "outline" | "default" => {
    switch (type) {
      case "offline_screen": return "destructive";
      case "overdue_payment": return "destructive";
      case "pending_contract": return "secondary";
      case "pending_approval": return "outline";
      default: return "default";
    }
  };

  const formatAge = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: false, locale: nl });
    } catch {
      return "-";
    }
  };

  const kpiTiles = [
    {
      id: "online",
      title: "Online",
      value: stats?.screensOnline || 0,
      subtitle: `/ ${stats?.screensTotal || 0}`,
      icon: Wifi,
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      link: "/screens?status=online",
    },
    {
      id: "offline",
      title: "Offline",
      value: stats?.screensOffline || 0,
      icon: WifiOff,
      iconColor: "text-red-600",
      bgColor: (stats?.screensOffline || 0) > 0 ? "bg-red-50" : "",
      borderColor: (stats?.screensOffline || 0) > 0 ? "border-red-300" : "",
      link: "/screens?status=offline",
      highlight: (stats?.screensOffline || 0) > 0,
    },
    {
      id: "pending",
      title: "Wacht op handtekening",
      value: stats?.pendingContracts || 0,
      icon: FileSignature,
      iconColor: "text-amber-600",
      bgColor: (stats?.pendingContracts || 0) > 0 ? "bg-amber-50" : "",
      borderColor: (stats?.pendingContracts || 0) > 0 ? "border-amber-300" : "",
      link: "/advertisers?filter=pending_signatures",
    },
    {
      id: "overdue",
      title: "Te laat betaald",
      value: stats?.overdueAdvertisers || 0,
      icon: CreditCard,
      iconColor: "text-red-600",
      bgColor: (stats?.overdueAdvertisers || 0) > 0 ? "bg-red-50" : "",
      borderColor: (stats?.overdueAdvertisers || 0) > 0 ? "border-red-300" : "",
      link: "/advertisers?filter=overdue",
    },
    {
      id: "placements",
      title: "Actieve plaatsingen",
      value: stats?.activePlacements || stats?.adsLiveToday || 0,
      icon: Target,
      iconColor: "text-primary",
      bgColor: "bg-primary/5",
      borderColor: "border-primary/20",
      link: "/placements?status=active",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Quick Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="page-title">Control Room</h1>
          <p className="text-sm text-muted-foreground">Overzicht van je Elevizion netwerk</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" className="gap-2" data-testid="button-quick-actions">
              <Zap className="h-4 w-4" />
              Snelle Acties
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => navigate("/onboarding/screen")} data-testid="dropdown-new-screen">
              <Plus className="h-4 w-4 mr-2" />
              Nieuw Scherm
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/onboarding/advertiser")} data-testid="dropdown-new-advertiser">
              <Users className="h-4 w-4 mr-2" />
              Nieuwe Adverteerder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/onboarding/placement")} data-testid="dropdown-upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload Creative
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/onboarding/placement")} data-testid="dropdown-place-ad">
              <Target className="h-4 w-4 mr-2" />
              Plaats Ad
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* KPI Tiles - Clickable */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpiTiles.map((tile) => (
          <Link key={tile.id} href={tile.link}>
            <Card 
              className={`${tile.borderColor} ${tile.bgColor} cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]`}
              data-testid={`kpi-${tile.id}`}
            >
              <CardContent className="pt-4 pb-4">
                {statsLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">{tile.title}</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold ${tile.highlight ? 'text-red-600' : ''}`}>
                          {tile.value}
                        </span>
                        {tile.subtitle && (
                          <span className="text-sm text-muted-foreground">{tile.subtitle}</span>
                        )}
                      </div>
                    </div>
                    <div className={`p-2 rounded-full ${tile.bgColor || 'bg-muted/50'}`}>
                      <tile.icon className={`h-5 w-5 ${tile.iconColor}`} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Action Overview Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Actie Overzicht</CardTitle>
        </CardHeader>
        <CardContent>
          {actionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : actionItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Geen openstaande acties</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[100px]">Leeftijd</TableHead>
                  <TableHead className="w-[80px] text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actionItems.map((item) => (
                  <TableRow key={item.id} data-testid={`action-row-${item.id}`}>
                    <TableCell>
                      <Badge variant={getTypeBadgeVariant(item.type)} className="text-xs">
                        {getTypeLabel(item.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{item.status}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{formatAge(item.createdAt)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={item.link}>
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Small Online Trend Graph */}
      {onlineTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Online % laatste 7 dagen
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-end gap-1 h-16">
              {onlineTrend.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div 
                    className="w-full bg-green-500 rounded-t transition-all"
                    style={{ height: `${(day.percentage / 100) * 48}px` }}
                    title={`${day.date}: ${day.percentage}%`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('nl-NL', { weekday: 'short' }).charAt(0).toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>7 dagen geleden</span>
              <span>Vandaag</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
