import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  AlertTriangle, 
  CheckCircle,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  TrendingUp,
  Users,
  AlertCircle,
  Calendar,
  CreditCard,
  Plus,
  Upload,
  Zap,
  ChevronDown,
  ChevronUp,
  PlayCircle
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

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
  const [, navigate] = useLocation();
  const [fixNowOpen, setFixNowOpen] = useState(true);
  const [previousAlertIds, setPreviousAlertIds] = useState<Set<string>>(new Set());
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const isInitialMount = useRef(true);

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

  // Track new alerts for animation
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      setPreviousAlertIds(new Set(alerts.map(a => a.id)));
      return;
    }

    const currentIds = new Set(alerts.map(a => a.id));
    const newIds = new Set<string>();
    
    currentIds.forEach(id => {
      if (!previousAlertIds.has(id)) {
        newIds.add(id);
      }
    });

    if (newIds.size > 0) {
      setNewAlertIds(newIds);
      // Clear new status after animation
      setTimeout(() => setNewAlertIds(new Set()), 2000);
    }

    setPreviousAlertIds(currentIds);
  }, [alerts]);

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

  const statusCards = [
    {
      id: "online",
      title: "Online",
      value: stats?.screensOnline || 0,
      subtitle: `/ ${stats?.screensTotal || 0}`,
      icon: Wifi,
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      valueColor: "text-green-600",
    },
    {
      id: "offline",
      title: "Offline",
      value: stats?.screensOffline || 0,
      icon: WifiOff,
      iconColor: "text-red-600",
      bgColor: (stats?.screensOffline || 0) > 0 ? "bg-red-50" : "",
      borderColor: (stats?.screensOffline || 0) > 0 ? "border-red-300" : "",
      valueColor: (stats?.screensOffline || 0) > 0 ? "text-red-600" : "text-green-600",
    },
    {
      id: "ads",
      title: "Ads Live",
      value: stats?.adsLiveToday || 0,
      icon: PlayCircle,
      iconColor: "text-primary",
      bgColor: "bg-primary/5",
      borderColor: "border-primary/20",
      valueColor: "text-primary",
    },
    {
      id: "empty",
      title: "Leeg (<20)",
      value: stats?.screensWithEmptySlots || 0,
      icon: Monitor,
      iconColor: "text-amber-600",
      bgColor: (stats?.screensWithEmptySlots || 0) > 0 ? "bg-amber-50" : "",
      borderColor: (stats?.screensWithEmptySlots || 0) > 0 ? "border-amber-300" : "",
      valueColor: (stats?.screensWithEmptySlots || 0) > 0 ? "text-amber-600" : "",
    },
    {
      id: "issues",
      title: "Issues",
      value: stats?.issuesOpen || 0,
      icon: AlertTriangle,
      iconColor: "text-red-600",
      bgColor: (stats?.issuesOpen || 0) > 0 ? "bg-red-50" : "",
      borderColor: (stats?.issuesOpen || 0) > 0 ? "border-red-300" : "",
      valueColor: (stats?.issuesOpen || 0) > 0 ? "text-red-600" : "",
    },
    {
      id: "overdue",
      title: "Betaalrisico",
      value: stats?.overdueAdvertisers || 0,
      icon: CreditCard,
      iconColor: "text-muted-foreground",
      bgColor: "",
      borderColor: "",
      valueColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header with Quick Actions Dropdown */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="page-title">Control Room</h1>
          <p className="text-sm text-muted-foreground">Real-time overzicht van je Elevizion netwerk</p>
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

      {/* Status Cards Grid - 2x3 with more spacing */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {statusCards.map((card) => (
          <Card 
            key={card.id}
            className={`${card.borderColor} ${card.bgColor} transition-all hover:shadow-md`}
            data-testid={`card-${card.id}`}
          >
            <CardContent className="pt-6">
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium mb-1">{card.title}</p>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-3xl font-bold ${card.valueColor}`}>{card.value}</span>
                      {card.subtitle && (
                        <span className="text-sm text-muted-foreground">{card.subtitle}</span>
                      )}
                    </div>
                  </div>
                  <div className={`p-3 rounded-full ${card.bgColor || 'bg-muted/50'}`}>
                    <card.icon className={`h-6 w-6 ${card.iconColor}`} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* FIX NOW Section - Collapsible */}
        <div className="lg:col-span-2">
          <Collapsible open={fixNowOpen} onOpenChange={setFixNowOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <CardTitle className="text-xl font-semibold">FIX NOW</CardTitle>
                      {alerts.length > 0 && (
                        <Badge variant="destructive" className="ml-2">{alerts.length}</Badge>
                      )}
                    </div>
                    {fixNowOpen ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <CardDescription className="text-sm text-muted-foreground">
                    Hoogste prioriteit acties - maximaal 5 items
                  </CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
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
                      <p className="text-sm text-muted-foreground">Geen openstaande alerts.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      <AnimatePresence>
                        {alerts.map((alert) => (
                          <motion.div
                            key={alert.id}
                            initial={newAlertIds.has(alert.id) ? { opacity: 0, x: -20, scale: 0.95 } : false}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)} ${
                              newAlertIds.has(alert.id) ? 'ring-2 ring-red-400 ring-opacity-50' : ''
                            }`}
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
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* Daily Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Dagelijkse Checklist
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Taken voor vandaag</CardDescription>
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

      {/* Network Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Netwerk Gezondheid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-muted-foreground mb-2">
                <span>Schermen Online</span>
                <span className="font-medium text-foreground">{onlinePercentage}%</span>
              </div>
              <Progress value={onlinePercentage} className="h-2" />
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-100">
                <p className="text-2xl font-bold text-green-600">{stats?.screensOnline || 0}</p>
                <p className="text-sm text-muted-foreground">Actief</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-100">
                <p className="text-2xl font-bold text-red-600">{stats?.screensOffline || 0}</p>
                <p className="text-sm text-muted-foreground">Offline</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg border">
                <p className="text-2xl font-bold">{stats?.adsLiveToday || 0}</p>
                <p className="text-sm text-muted-foreground">Plaatsingen</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
