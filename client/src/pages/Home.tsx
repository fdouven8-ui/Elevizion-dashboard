import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Monitor, 
  Wifi,
  WifiOff,
  Target,
  AlertTriangle, 
  CheckCircle,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Clock,
  TrendingUp,
  Users,
  Loader2,
  AlertCircle,
  Calendar,
  CreditCard,
  Plus,
  Upload,
  Zap
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ControlRoomStats {
  screensOnline: number;
  screensTotal: number;
  screensOffline: number;
  adsLiveToday: number;
  screensWithEmptySlots: number;
  issuesOpen: number;
  overdueAdvertisers: number;
}

interface Alert {
  id: string;
  type: "screen_offline" | "screen_never_seen" | "empty_inventory" | "placement_expiring" | "overdue_payment";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  screenId?: string;
  advertiserId?: string;
  createdAt: string;
  minutesOffline?: number;
}

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  link: string;
  count?: number;
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
          adsLiveToday: 0,
          screensWithEmptySlots: 0,
          issuesOpen: 0,
          overdueAdvertisers: 0,
        };
      }
    },
    refetchInterval: 30000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery<Alert[]>({
    queryKey: ["/api/control-room/alerts"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/control-room/alerts");
        return res.json();
      } catch {
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const { data: checklist = [], isLoading: checklistLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/control-room/checklist"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/control-room/checklist");
        return res.json();
      } catch {
        return [
          { id: "1", label: "Bevestig alle schermen online", completed: false, link: "/screens?status=offline" },
          { id: "2", label: "Vul lege schermen", completed: false, link: "/screens?empty=true" },
          { id: "3", label: "Keur wachtende creatives goed", completed: true, link: "/placements?pending=true" },
          { id: "4", label: "Verleng aflopende plaatsingen", completed: false, link: "/placements?expiring=true" },
        ];
      }
    },
  });

  const onlinePercentage = stats?.screensTotal ? Math.round((stats.screensOnline / stats.screensTotal) * 100) : 0;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "border-red-300 bg-red-50";
      case "medium": return "border-amber-300 bg-amber-50";
      default: return "border-blue-300 bg-blue-50";
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "screen_offline":
      case "screen_never_seen":
        return <WifiOff className="h-5 w-5 text-red-600" />;
      case "empty_inventory":
        return <Monitor className="h-5 w-5 text-amber-600" />;
      case "placement_expiring":
        return <Calendar className="h-5 w-5 text-blue-600" />;
      case "overdue_payment":
        return <CreditCard className="h-5 w-5 text-red-600" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Control Room</h1>
        <p className="text-muted-foreground">OPS-first overzicht van je Elevizion netwerk</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className={stats?.screensOffline ? "border-green-200" : ""} data-testid="card-screens-online">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Wifi className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {stats?.screensOnline || 0} / {stats?.screensTotal || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={stats?.screensOffline ? "border-red-200 bg-red-50" : ""} data-testid="card-screens-offline">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={`text-2xl font-bold ${(stats?.screensOffline || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                {stats?.screensOffline || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-ads-live">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ads Live</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.adsLiveToday || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className={stats?.screensWithEmptySlots ? "border-amber-200" : ""} data-testid="card-empty-slots">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leeg (&lt;20)</CardTitle>
            <Monitor className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={`text-2xl font-bold ${(stats?.screensWithEmptySlots || 0) > 0 ? "text-amber-600" : ""}`}>
                {stats?.screensWithEmptySlots || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={stats?.issuesOpen ? "border-red-200" : ""} data-testid="card-issues-open">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={`text-2xl font-bold ${(stats?.issuesOpen || 0) > 0 ? "text-red-600" : ""}`}>
                {stats?.issuesOpen || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200" data-testid="card-overdue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Betaalrisico</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">{stats?.overdueAdvertisers || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/onboarding/screen">
              <Button className="w-full h-14 text-left justify-start gap-3" variant="outline" data-testid="button-quick-new-screen">
                <Plus className="h-5 w-5" />
                <div>
                  <div className="font-medium">Nieuw Scherm</div>
                  <div className="text-xs text-muted-foreground">+ Screen toevoegen</div>
                </div>
              </Button>
            </Link>
            <Link href="/onboarding/advertiser">
              <Button className="w-full h-14 text-left justify-start gap-3" variant="outline" data-testid="button-quick-new-advertiser">
                <Users className="h-5 w-5" />
                <div>
                  <div className="font-medium">Nieuwe Adverteerder</div>
                  <div className="text-xs text-muted-foreground">+ Klant toevoegen</div>
                </div>
              </Button>
            </Link>
            <Link href="/onboarding/placement">
              <Button className="w-full h-14 text-left justify-start gap-3" variant="outline" data-testid="button-quick-upload">
                <Upload className="h-5 w-5" />
                <div>
                  <div className="font-medium">Upload Creative</div>
                  <div className="text-xs text-muted-foreground">+ Nieuwe advertentie</div>
                </div>
              </Button>
            </Link>
            <Link href="/onboarding/placement">
              <Button className="w-full h-14 text-left justify-start gap-3" variant="default" data-testid="button-quick-place-ad">
                <Target className="h-5 w-5" />
                <div>
                  <div className="font-medium">Plaats Ad</div>
                  <div className="text-xs text-muted-foreground">Meest gebruikte flow</div>
                </div>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              FIX NOW
            </CardTitle>
            <CardDescription>Hoogste prioriteit acties - maximaal 5 items</CardDescription>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="font-medium">Alles onder controle!</p>
                <p className="text-sm">Geen openstaande alerts.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}
                    data-testid={`alert-${alert.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {getAlertIcon(alert.type)}
                        <div>
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-sm text-muted-foreground">{alert.description}</p>
                          {alert.screenId && (
                            <Badge variant="outline" className="mt-1 font-mono text-xs">
                              {alert.screenId}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {alert.type === "screen_offline" && (
                          <>
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/screens?id=${alert.screenId}`}>
                                <Monitor className="h-4 w-4 mr-1" />
                                Open
                              </Link>
                            </Button>
                            <Button size="sm" variant="outline">
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Yodeck
                            </Button>
                          </>
                        )}
                        {alert.type === "overdue_payment" && (
                          <Button size="sm" variant="outline">
                            <MessageSquare className="h-4 w-4 mr-1" />
                            WhatsApp
                          </Button>
                        )}
                        <Button size="sm" variant="ghost">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Dagelijkse Checklist
            </CardTitle>
            <CardDescription>Taken voor vandaag</CardDescription>
          </CardHeader>
          <CardContent>
            {checklistLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {checklist.map((item) => (
                  <Link
                    key={item.id}
                    href={item.link}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors hover:bg-accent ${
                      item.completed ? "bg-green-50 border-green-200" : "bg-white"
                    }`}
                    data-testid={`checklist-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {item.completed ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <span className={item.completed ? "text-green-700 line-through" : ""}>
                        {item.label}
                      </span>
                      {item.count !== undefined && item.count > 0 && (
                        <Badge variant="secondary">{item.count}</Badge>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Netwerk Gezondheid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Schermen Online</span>
                <span className="font-medium">{onlinePercentage}%</span>
              </div>
              <Progress value={onlinePercentage} className="h-2" />
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{stats?.screensOnline || 0}</p>
                <p className="text-xs text-muted-foreground">Actief</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{stats?.screensOffline || 0}</p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{stats?.adsLiveToday || 0}</p>
                <p className="text-xs text-muted-foreground">Plaatsingen</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
