import { useAppData } from "@/hooks/use-app-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Monitor, 
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
  BarChart3,
  AlertTriangle,
  TrendingUp,
  MessageCircle,
  RefreshCw,
  Calendar,
  Camera,
  Share2,
  Play
} from "lucide-react";
import { Link, useRoute, useLocation, useSearch } from "wouter";
import { placementsApi } from "@/lib/api";
import { formatDistanceToNow, format, subDays } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

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

interface ScreenWithContent {
  id: string;
  screenId: string;
  currentContent?: ScreenContentItem[];
  [key: string]: any;
}

export default function ScreenDetail() {
  const [, params] = useRoute("/screens/:id");
  const [, navigate] = useLocation();
  const { screens, locations, placements, advertisers, contracts } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const screenId = params?.id;
  const screen = screens.find(s => s.id === screenId);
  const location = screen ? locations.find(l => l.id === screen.locationId) : null;
  
  // Fetch screen detail with currentContent
  const { data: screenDetail } = useQuery<ScreenWithContent>({
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

  // Get all placements for this screen (active and paused)
  const screenPlacements = placements.filter(p => p.screenId === screenId);
  const activePlacements = screenPlacements.filter(p => p.isActive);

  // Get advertiser and contract info for a placement
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

  const handlePausePlacement = async (placementId: string) => {
    try {
      await updatePlacementMutation.mutateAsync({ id: placementId, data: { isActive: false } });
      toast({ title: "Plaatsing gepauzeerd" });
    } catch (error) {
      toast({ title: "Fout bij pauzeren", variant: "destructive" });
    }
  };

  const handlePauseAll = async () => {
    let successCount = 0;
    let failCount = 0;
    
    for (const placement of activePlacements) {
      try {
        await updatePlacementMutation.mutateAsync({ id: placement.id, data: { isActive: false } });
        successCount++;
      } catch (error) {
        failCount++;
      }
    }
    
    if (failCount === 0) {
      toast({ title: `${successCount} plaatsingen gepauzeerd` });
    } else if (successCount === 0) {
      toast({ title: "Kon geen plaatsingen pauzeren", variant: "destructive" });
    } else {
      toast({ 
        title: `${successCount} gepauzeerd, ${failCount} mislukt`, 
        variant: "destructive" 
      });
    }
  };

  const openInYodeck = () => {
    if (screen?.yodeckPlayerId) {
      window.open(`https://app.yodeck.com/player/${screen.yodeckPlayerId}`, "_blank");
    } else {
      toast({ 
        title: "Geen Yodeck ID gekoppeld", 
        description: "Dit scherm is niet gekoppeld aan een Yodeck player.",
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
        description: "Deze locatie heeft geen telefoon of email.",
        variant: "destructive" 
      });
    }
  };

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

      {/* A) Header Section */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
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
              <h1 className="text-2xl font-bold" data-testid="screen-id">
                {screen.screenId}
              </h1>
              <Badge 
                variant={screen.status === "online" ? "default" : "destructive"} 
                data-testid="screen-status"
              >
                {screen.status === "online" ? "Online" : "Offline"}
              </Badge>
            </div>
            <p className="text-lg text-muted-foreground">{location?.name || "Geen locatie"}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              Laatst gezien: {formatLastSeen(screen.lastSeenAt)}
            </p>
          </div>
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openInYodeck} data-testid="button-yodeck">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Yodeck
          </Button>
          <Button variant="outline" onClick={contactLocation} data-testid="button-contact-location">
            <MessageCircle className="h-4 w-4 mr-2" />
            Contact locatie
          </Button>
          <Button asChild data-testid="button-place-ad">
            <Link href={`/onboarding/placement?screenId=${screen.id}`}>
              <Target className="h-4 w-4 mr-2" />
              Plaats Ad
            </Link>
          </Button>
        </div>
      </div>

      {/* B) Location/Contact Block */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Locatie & Contact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Address */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Adres</p>
              <p className="text-sm">{location?.address || "Geen adres"}</p>
            </div>
            
            {/* Contact Person */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Contactpersoon</p>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{location?.contactName || "-"}</p>
              </div>
            </div>
            
            {/* Phone */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {location?.phone ? (
                  <a 
                    href={`tel:${location.phone}`} 
                    className="text-sm text-primary hover:underline"
                    data-testid="link-phone"
                  >
                    {location.phone}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>
            
            {/* Email */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {location?.email ? (
                  <a 
                    href={`mailto:${location.email}`} 
                    className="text-sm text-primary hover:underline truncate"
                    data-testid="link-email"
                  >
                    {location.email}
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>
          </div>
          
          {/* Notes */}
          {location?.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium text-muted-foreground mb-1">Notities</p>
              <p className="text-sm bg-muted/50 rounded p-3">{location.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yodeck Content Card */}
      <YodeckContentCard screen={screen} />

      {/* C) What is running on this screen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Wat draait er op dit scherm?
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{screenPlacements.length} plaatsing(en)</Badge>
            {activePlacements.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePauseAll} 
                data-testid="button-pause-all"
              >
                <PauseCircle className="h-4 w-4 mr-1" />
                Alles pauzeren
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {screenPlacements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Geen plaatsingen op dit scherm</p>
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
                  <TableHead>Adverteerder</TableHead>
                  <TableHead>Creative</TableHead>
                  <TableHead>Startdatum</TableHead>
                  <TableHead>Einddatum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screenPlacements.map((placement) => {
                  const { advertiser, contract } = getPlacementInfo(placement.contractId);
                  const status = getPlacementStatus(placement);
                  
                  return (
                    <TableRow key={placement.id} data-testid={`placement-row-${placement.id}`}>
                      <TableCell className="font-medium">
                        {advertiser ? (
                          <Link 
                            href={`/advertisers/${advertiser.id}`}
                            className="text-primary hover:underline"
                          >
                            {advertiser.companyName}
                          </Link>
                        ) : (
                          "Onbekend"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {placement.notes?.includes("video") ? (
                            <Video className="h-4 w-4 text-muted-foreground" />
                          ) : placement.notes?.includes("image") ? (
                            <Image className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-sm text-muted-foreground">
                            {contract?.name || "Geen creative"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(placement.startDate)}</TableCell>
                      <TableCell>{formatDate(placement.endDate)}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className={status.color}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            asChild
                            data-testid={`button-open-placement-${placement.id}`}
                          >
                            <Link href={`/placements/${placement.id}`}>
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Open
                            </Link>
                          </Button>
                          {placement.isActive && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handlePausePlacement(placement.id)}
                              disabled={updatePlacementMutation.isPending}
                              data-testid={`button-pause-${placement.id}`}
                            >
                              <PauseCircle className="h-4 w-4 mr-1" />
                              Pauzeer
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

      {/* D) Detected Content from Yodeck (Inferred Placements) */}
      <Card data-testid="detected-content-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Play className="h-5 w-5" />
            Gedetecteerde content
          </CardTitle>
          <div className="flex items-center gap-2">
            {currentContent.length > 0 && (
              <>
                <Badge variant="default" className="bg-green-600">
                  {currentContent.filter(c => c.category === 'ad').length} ads
                </Badge>
                <Badge variant="secondary">
                  {currentContent.filter(c => c.category === 'non_ad').length} overig
                </Badge>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {currentContent.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Play className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nog geen content gedetecteerd</p>
              <p className="text-sm mt-1">Sync het scherm om content te laden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Duur</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentContent.map((item) => (
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
                        <span className="truncate max-w-[200px]">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {item.mediaType || "Onbekend"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.category === 'ad' ? (
                        <Badge variant="default" className="bg-blue-600">Advertentie</Badge>
                      ) : (
                        <Badge variant="secondary">Overig</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.duration ? `${item.duration}s` : "-"}
                    </TableCell>
                    <TableCell>
                      {item.linkedAdvertiserId || item.linkedPlacementId ? (
                        <Badge variant="default" className="bg-green-600">Gekoppeld</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Niet gekoppeld
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* E) Statistics Section (Accordion) */}
      <ScreenStatistics screenId={screen.id} yodeckPlayerId={screen.yodeckPlayerId} openInYodeck={openInYodeck} />
    </div>
  );
}

interface ScreenStatsData {
  screenId: string;
  screenIdDisplay: string;
  yodeckPlayerId: string | null;
  available: boolean;
  unavailableReason?: string;
  uptime: {
    current: "online" | "offline" | "unknown";
    lastSeen: string | null;
    uptimePercent: number;
    timeline: { timestamp: string; status: "online" | "offline"; duration: number }[];
  };
  playback: {
    totalPlays: number;
    totalDurationMs: number;
    topCreatives: { name: string; plays: number; durationMs: number }[];
  };
  dateRange: { startDate: string; endDate: string };
}

function ScreenStatistics({ screenId, yodeckPlayerId, openInYodeck }: { screenId: string; yodeckPlayerId: string | null; openInYodeck: () => void }) {
  const { toast } = useToast();
  const chartRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getInitialDates = () => {
    const params = new URLSearchParams(window.location.search);
    const urlStartDate = params.get("startDate");
    const urlEndDate = params.get("endDate");
    
    if (urlStartDate && urlEndDate) {
      return { startDate: urlStartDate, endDate: urlEndDate };
    }
    
    const end = new Date();
    const start = subDays(end, 7);
    return { startDate: format(start, "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd") };
  };

  const getInitialPreset = (startDate: string, endDate: string): "today" | "7d" | "30d" => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 1) return "today";
    if (daysDiff <= 7) return "7d";
    return "30d";
  };

  const getInitialGranularity = (): "hour" | "day" | "week" => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("granularity");
    if (g === "hour" || g === "day" || g === "week") return g;
    return "day";
  };

  const initialDates = getInitialDates();
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [datePreset, setDatePreset] = useState<"today" | "7d" | "30d">(getInitialPreset(initialDates.startDate, initialDates.endDate));
  const [granularity, setGranularityState] = useState<"hour" | "day" | "week">(getInitialGranularity);

  const updateUrlParams = (newStartDate: string, newEndDate: string, newGranularity: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("startDate", newStartDate);
    url.searchParams.set("endDate", newEndDate);
    url.searchParams.set("granularity", newGranularity);
    window.history.replaceState({}, "", url.toString());
  };

  const setDateRange = (newPreset: "today" | "7d" | "30d") => {
    const end = new Date();
    let start: Date;
    switch (newPreset) {
      case "today": start = new Date(); start.setHours(0, 0, 0, 0); break;
      case "7d": start = subDays(end, 7); break;
      case "30d": start = subDays(end, 30); break;
      default: start = subDays(end, 7);
    }
    const newStartDate = format(start, "yyyy-MM-dd");
    const newEndDate = format(end, "yyyy-MM-dd");
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    setDatePreset(newPreset);
    updateUrlParams(newStartDate, newEndDate, granularity);
  };

  const setGranularity = (newValue: "hour" | "day" | "week") => {
    setGranularityState(newValue);
    updateUrlParams(startDate, endDate, newValue);
  };

  const { data: stats, isLoading, refetch } = useQuery<ScreenStatsData>({
    queryKey: ["/api/screens", screenId, "stats", startDate, endDate, granularity],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        granularity,
      });
      const res = await fetch(`/api/screens/${screenId}/stats?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fout bij ophalen statistieken");
      return res.json();
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({ title: "Statistieken vernieuwd" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSnapshot = async () => {
    if (!chartRef.current) return;
    
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(chartRef.current, { backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `screen-stats-${screenId}-${format(new Date(), "yyyy-MM-dd")}.png`;
      link.href = canvas.toDataURL();
      link.click();
      toast({ title: "Snapshot opgeslagen" });
    } catch (error) {
      toast({ title: "Snapshot mislukt", variant: "destructive" });
    }
  };

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    url.searchParams.set("granularity", granularity);
    navigator.clipboard.writeText(url.toString());
    toast({ title: "Link gekopieerd" });
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}u ${minutes}m`;
    return `${minutes}m`;
  };

  const uptimeChartData = stats?.uptime?.timeline?.map((point) => ({
    time: format(new Date(point.timestamp), granularity === "hour" ? "HH:mm" : "d MMM", { locale: nl }),
    value: point.status === "online" ? 100 : 0,
    status: point.status,
  })) || [];

  const playbackChartData = stats?.playback?.topCreatives?.map((c) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
    plays: c.plays,
    duration: Math.round(c.durationMs / 1000 / 60),
  })) || [];

  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="statistics">
      <AccordionItem value="statistics" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline" data-testid="toggle-statistics">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <span className="font-semibold">Statistieken</span>
            {stats?.uptime?.uptimePercent !== undefined && (
              <Badge variant={stats.uptime.uptimePercent >= 95 ? "default" : "secondary"} className="ml-2">
                {stats.uptime.uptimePercent}% uptime
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {!yodeckPlayerId ? (
            <div className="py-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">Dit scherm is niet gekoppeld aan Yodeck</p>
              <p className="text-xs text-muted-foreground mb-4">
                Koppel dit scherm aan een Yodeck player om statistieken te bekijken
              </p>
              <Button variant="outline" size="sm" onClick={openInYodeck}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Koppel aan Yodeck
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-4 py-4">
              <div className="flex gap-4">
                <Skeleton className="h-20 flex-1" />
                <Skeleton className="h-20 flex-1" />
                <Skeleton className="h-20 flex-1" />
              </div>
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !stats?.available ? (
            <div className="py-8 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-amber-500 opacity-50" />
              <p className="text-muted-foreground mb-2">{stats?.unavailableReason || "Statistieken niet beschikbaar"}</p>
              <p className="text-xs text-muted-foreground">
                Controleer of de Yodeck API correct is geconfigureerd in Instellingen
              </p>
            </div>
          ) : (
            <div ref={chartRef} className="space-y-6 py-4">
              <div className="flex flex-wrap items-center gap-3 bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Select value={datePreset} onValueChange={(v: any) => setDateRange(v)}>
                    <SelectTrigger className="w-32 h-8" data-testid="select-date-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Vandaag</SelectItem>
                      <SelectItem value="7d">7 dagen</SelectItem>
                      <SelectItem value="30d">30 dagen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Select value={granularity} onValueChange={(v: any) => setGranularity(v)}>
                    <SelectTrigger className="w-28 h-8" data-testid="select-granularity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Per uur</SelectItem>
                      <SelectItem value="day">Per dag</SelectItem>
                      <SelectItem value="week">Per week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing} data-testid="button-refresh-stats">
                  <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                  Vernieuwen
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSnapshot} data-testid="button-snapshot">
                  <Camera className="h-4 w-4 mr-1" />
                  Snapshot
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopyLink} data-testid="button-share-link">
                  <Share2 className="h-4 w-4 mr-1" />
                  Link
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${stats.uptime.current === "online" ? "bg-green-500" : "bg-red-500"}`}>
                        {stats.uptime.current === "online" ? (
                          <Wifi className="h-4 w-4 text-white" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Uptime</p>
                        <p className="text-2xl font-bold">{stats.uptime.uptimePercent}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-500">
                        <Play className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Totaal plays</p>
                        <p className="text-2xl font-bold">{stats.playback.totalPlays.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-purple-500">
                        <Clock className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Speeltijd</p>
                        <p className="text-2xl font-bold">{formatDuration(stats.playback.totalDurationMs)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Uptime Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {uptimeChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={uptimeChartData}>
                        <defs>
                          <linearGradient id="uptimeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-background border rounded-lg p-2 shadow-lg">
                                  <p className="text-sm font-medium">{data.time}</p>
                                  <p className={`text-sm ${data.status === "online" ? "text-green-600" : "text-red-600"}`}>
                                    {data.status === "online" ? "Online" : "Offline"}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="stepAfter"
                          dataKey="value"
                          stroke="#22c55e"
                          fill="url(#uptimeGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                      Geen uptime data beschikbaar
                    </div>
                  )}
                </CardContent>
              </Card>

              {playbackChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Top Creatives
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={playbackChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-background border rounded-lg p-2 shadow-lg">
                                  <p className="text-sm font-medium">{data.name}</p>
                                  <p className="text-sm text-muted-foreground">{data.plays} plays</p>
                                  <p className="text-sm text-muted-foreground">{data.duration} min</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="plays" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface MediaItemDisplay {
  id: number;
  name: string;
  type?: string;
  duration?: number;
  category?: 'ad' | 'non_ad';
}

interface ContentSummaryData {
  items: Array<{ type: string; name: string; id?: number }>;
  topItems: string[];
  lastFetchedAt: string;
  mediaItems?: MediaItemDisplay[];
  uniqueMediaCount?: number;
  sourceType?: string;
  sourceName?: string;
}

function YodeckContentCard({ screen }: { screen: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const contentSummary = screen.yodeckContentSummary as ContentSummaryData | null;
  const contentCount = screen.yodeckContentCount;
  const contentStatus = screen.yodeckContentStatus;
  const lastFetchedAt = screen.yodeckContentLastFetchedAt;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/sync/yodeck/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Sync failed");
      
      await queryClient.invalidateQueries({ queryKey: ["screens"] });
      toast({ title: "Content gesynchroniseerd" });
    } catch (error) {
      toast({ title: "Sync mislukt", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = () => {
    switch (contentStatus) {
      case "has_content":
        return <Badge variant="default" className="bg-green-600">Actieve content</Badge>;
      case "empty":
        return <Badge variant="secondary">Geen content</Badge>;
      case "error":
        return <Badge variant="destructive">Fout</Badge>;
      default:
        return <Badge variant="outline">Onbekend</Badge>;
    }
  };

  const formatLastFetched = () => {
    if (!lastFetchedAt) return "Nooit gesynchroniseerd";
    try {
      const date = new Date(lastFetchedAt);
      return formatDistanceToNow(date, { addSuffix: true, locale: nl });
    } catch {
      return "Onbekend";
    }
  };

  return (
    <Card data-testid="yodeck-content-card">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Yodeck Content
        </CardTitle>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            data-testid="button-sync-content"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
            Synchroniseren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {contentStatus === "unknown" && !contentSummary ? (
          <div className="text-center py-6 text-muted-foreground">
            <Share2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Nog niet gesynchroniseerd</p>
            <p className="text-sm mt-1">Klik op "Sync" om content te laden</p>
          </div>
        ) : contentStatus === "empty" ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
            <p>Geen content toegewezen in Yodeck</p>
          </div>
        ) : contentStatus === "error" ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-500" />
            <p>Kon content niet ophalen</p>
            {screen.yodeckContentError && (
              <p className="text-sm mt-1">{screen.yodeckContentError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Bron:</span>
              <span className="font-medium">
                {contentSummary?.sourceType === "playlist" ? "Playlist" : contentSummary?.sourceType || "-"}
                {contentSummary?.sourceName && `: ${contentSummary.sourceName}`}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Aantal items:</span>
              <span className="font-medium">{contentCount ?? "-"}</span>
            </div>

            {contentSummary?.mediaItems && contentSummary.mediaItems.length > 0 && (() => {
              // Use server-provided category, fallback to 'ad' if not provided
              const classifiedItems = contentSummary.mediaItems.map(item => ({
                ...item,
                category: item.category || 'ad'
              }));
              const adsCount = classifiedItems.filter(i => i.category === 'ad').length;
              const nonAdsCount = classifiedItems.filter(i => i.category === 'non_ad').length;
              
              return (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Media items:</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                        {adsCount} Ads
                      </Badge>
                      <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                        {nonAdsCount} Overig
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {classifiedItems.map((item, index) => (
                      <div
                        key={item.id || index}
                        className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/50"
                        data-testid={`media-item-${item.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={`h-5 text-[10px] px-1 ${
                              item.category === 'ad' 
                                ? 'bg-orange-50 text-orange-600 border-orange-200' 
                                : 'bg-blue-50 text-blue-600 border-blue-200'
                            }`}
                          >
                            {item.category === 'ad' ? 'AD' : 'INFO'}
                          </Badge>
                          {item.type === "video" ? (
                            <Video className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Image className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="truncate max-w-[180px]">{item.name}</span>
                        </div>
                        {item.duration && item.duration > 0 && (
                          <span className="text-muted-foreground text-xs">{item.duration}s</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="text-xs text-muted-foreground pt-2 border-t">
              Laatst gesynchroniseerd: {formatLastFetched()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
