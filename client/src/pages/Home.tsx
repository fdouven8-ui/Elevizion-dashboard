import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Monitor, 
  Users, 
  Euro, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  MessageSquare,
  Pause,
  ExternalLink,
  TrendingUp,
  Wifi,
  WifiOff,
  Calendar,
  CreditCard
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface DashboardStats {
  monthlyRevenue: number;
  openAmount: number;
  overdueAmount: number;
  screensOnline: number;
  screensTotal: number;
  activeAdvertisers: number;
  freeAdSlots: number;
}

interface ActionItem {
  id: string;
  type: "offline_screen" | "overdue_invoice" | "ending_ad" | "empty_slots";
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  entityId?: string;
  entityType?: string;
  daysOverdue?: number;
  daysUntilEnd?: number;
}

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/dashboard/stats");
        return res.json();
      } catch {
        return {
          monthlyRevenue: 0,
          openAmount: 0,
          overdueAmount: 0,
          screensOnline: 0,
          screensTotal: 0,
          activeAdvertisers: 0,
          freeAdSlots: 0,
        };
      }
    },
  });

  const { data: actions = [], isLoading: actionsLoading } = useQuery<ActionItem[]>({
    queryKey: ["/api/dashboard/actions"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/dashboard/actions");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "border-red-200 bg-red-50";
      case "medium": return "border-amber-200 bg-amber-50";
      default: return "border-blue-200 bg-blue-50";
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "offline_screen": return <WifiOff className="h-5 w-5 text-red-600" />;
      case "overdue_invoice": return <CreditCard className="h-5 w-5 text-amber-600" />;
      case "ending_ad": return <Calendar className="h-5 w-5 text-blue-600" />;
      case "empty_slots": return <Monitor className="h-5 w-5 text-gray-600" />;
      default: return <AlertTriangle className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Cockpit</h1>
        <p className="text-muted-foreground">Jouw Elevizion netwerk in één oogopslag</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-monthly-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maandomzet</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats?.monthlyRevenue || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Deze maand</p>
          </CardContent>
        </Card>

        <Card data-testid="card-open-amount">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Openstaand</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(stats?.openAmount || 0)}
                </div>
                {(stats?.overdueAmount || 0) > 0 && (
                  <p className="text-xs text-red-600">
                    Waarvan {formatCurrency(stats?.overdueAmount || 0)} achterstallig
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-screens-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schermen</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold">{stats?.screensOnline || 0}</span>
                <span className="text-muted-foreground">/ {stats?.screensTotal || 0}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Online / Totaal</p>
          </CardContent>
        </Card>

        <Card data-testid="card-advertisers">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Adverteerders</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{stats?.activeAdvertisers || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Actief</p>
          </CardContent>
        </Card>
      </div>

      {(stats?.freeAdSlots || 0) > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-medium">Vrije advertentieruimte</p>
                  <p className="text-sm text-muted-foreground">
                    {stats?.freeAdSlots} schermen hebben minder dan 20 ads
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/screens">Bekijk schermen</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Actielijst
          </CardTitle>
          <CardDescription>
            Automatisch gegenereerde acties die aandacht nodig hebben
          </CardDescription>
        </CardHeader>
        <CardContent>
          {actionsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">Alles onder controle!</p>
              <p className="text-sm">Er zijn geen openstaande acties.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((action) => (
                <div
                  key={action.id}
                  className={`p-4 rounded-lg border ${getSeverityColor(action.severity)}`}
                  data-testid={`action-item-${action.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {getActionIcon(action.type)}
                      <div>
                        <p className="font-medium">{action.title}</p>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {action.type === "overdue_invoice" && (
                        <>
                          <Button size="sm" variant="outline">
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Herinnering
                          </Button>
                          {(action.daysOverdue || 0) > 14 && (
                            <Button size="sm" variant="destructive">
                              <Pause className="h-4 w-4 mr-1" />
                              Pauzeer ads
                            </Button>
                          )}
                        </>
                      )}
                      {action.type === "offline_screen" && (
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open Yodeck
                        </Button>
                      )}
                      {action.type === "ending_ad" && (
                        <Button size="sm" variant="outline">
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Contact
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
    </div>
  );
}
