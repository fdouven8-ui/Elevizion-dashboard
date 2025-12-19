import { useAppData } from "@/hooks/use-app-data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  MessageCircle
} from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { placementsApi } from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function ScreenDetail() {
  const [, params] = useRoute("/screens/:id");
  const [, navigate] = useLocation();
  const { screens, locations, placements, advertisers, contracts } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const screenId = params?.id;
  const screen = screens.find(s => s.id === screenId);
  const location = screen ? locations.find(l => l.id === screen.locationId) : null;

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

      {/* D) Statistics Section (Accordion) */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="statistics" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline" data-testid="toggle-statistics">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              <span className="font-semibold">Statistieken</span>
              <Badge variant="outline" className="ml-2 text-xs">Binnenkort</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="py-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">Statistieken komen beschikbaar zodra Yodeck is gekoppeld</p>
              <p className="text-xs text-muted-foreground">
                Uptime trend, offline incidenten en duur worden automatisch verzameld via Yodeck-synchronisatie
              </p>
              {!screen.yodeckPlayerId && (
                <Button variant="outline" size="sm" className="mt-4" onClick={openInYodeck}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Koppel aan Yodeck
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
