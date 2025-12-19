import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MessageCircle, 
  Pause, 
  Play, 
  ExternalLink,
  Monitor,
  MapPin,
  Calendar,
  Copy,
  Check,
  AlertCircle
} from "lucide-react";
import { useState } from "react";
import type { Advertiser } from "@shared/schema";

type EnrichedPlacement = {
  id: string;
  contractId: string;
  screenId: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  secondsPerLoop: number;
  playsPerHour: number;
  screenId_display: string;
  screenName: string;
  screenStatus: string;
  locationName: string;
  contractName: string;
};

export default function AdvertiserDetail() {
  const { id } = useParams<{ id: string }>();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: advertiser, isLoading: advLoading } = useQuery<Advertiser>({
    queryKey: ["/api/advertisers", id],
    queryFn: async () => {
      const res = await fetch(`/api/advertisers/${id}`);
      if (!res.ok) throw new Error("Adverteerder niet gevonden");
      return res.json();
    },
  });

  const { data: placements = [], isLoading: placementsLoading } = useQuery<EnrichedPlacement[]>({
    queryKey: ["/api/advertisers", id, "placements"],
    queryFn: async () => {
      const res = await fetch(`/api/advertisers/${id}/placements`);
      if (!res.ok) throw new Error("Plaatsingen niet gevonden");
      return res.json();
    },
    enabled: !!id,
  });

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openWhatsApp = () => {
    if (advertiser?.phone) {
      const phone = advertiser.phone.replace(/\D/g, "");
      window.open(`https://wa.me/${phone}`, "_blank");
    }
  };

  const openEmail = () => {
    if (advertiser?.email) {
      window.open(`mailto:${advertiser.email}`, "_blank");
    }
  };

  if (advLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!advertiser) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Adverteerder niet gevonden</h2>
        <Link href="/advertisers">
          <Button variant="link">Terug naar overzicht</Button>
        </Link>
      </div>
    );
  }

  const activePlacements = placements.filter(p => p.isActive);
  const holdPlacements = placements.filter(p => !p.isActive);
  const screenGroups = activePlacements.reduce((acc, p) => {
    if (!acc[p.screenId]) {
      acc[p.screenId] = {
        screenId_display: p.screenId_display,
        screenName: p.screenName,
        screenStatus: p.screenStatus,
        locationName: p.locationName,
        placements: [],
      };
    }
    acc[p.screenId].placements.push(p);
    return acc;
  }, {} as Record<string, { screenId_display: string; screenName: string; screenStatus: string; locationName: string; placements: EnrichedPlacement[] }>);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Actief</Badge>;
      case "paused":
        return <Badge className="bg-amber-100 text-amber-800">Gepauzeerd</Badge>;
      case "churned":
        return <Badge className="bg-red-100 text-red-800">Gestopt</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4">
        <Link href="/advertisers">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-advertiser-name">
              {advertiser.companyName}
            </h1>
            {getStatusBadge(advertiser.status)}
          </div>
          <p className="text-muted-foreground">{advertiser.contactName}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openWhatsApp} disabled={!advertiser.phone} data-testid="button-whatsapp">
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
          <Button variant="outline" onClick={openEmail} disabled={!advertiser.email} data-testid="button-email">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </Button>
          <Button variant="outline" data-testid="button-pause-all">
            <Pause className="h-4 w-4 mr-2" />
            Pauzeer Alles
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Contactgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{advertiser.phone || "Geen telefoon"}</span>
              </div>
              {advertiser.phone && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => copyToClipboard(advertiser.phone!, "phone")}
                  data-testid="button-copy-phone"
                >
                  {copiedField === "phone" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{advertiser.email}</span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => copyToClipboard(advertiser.email, "email")}
                data-testid="button-copy-email"
              >
                {copiedField === "email" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            
            <Separator />
            
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Moneybird</p>
              {advertiser.moneybirdContactId ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700">Gekoppeld</Badge>
                  <span className="text-xs text-muted-foreground">ID: {advertiser.moneybirdContactId}</span>
                </div>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700">Niet gekoppeld</Badge>
              )}
            </div>

            {advertiser.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Notities</p>
                  <p className="text-sm">{advertiser.notes}</p>
                </div>
              </>
            )}

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">SEPA Incasso</p>
              {advertiser.sepaMandate && advertiser.iban ? (
                <div className="space-y-1">
                  <Badge variant="outline" className="bg-green-50 text-green-700">Actief mandaat</Badge>
                  <p className="text-xs text-muted-foreground">IBAN: {advertiser.iban}</p>
                  {advertiser.sepaMandateReference && (
                    <p className="text-xs text-muted-foreground">Ref: {advertiser.sepaMandateReference}</p>
                  )}
                </div>
              ) : advertiser.iban ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-700">IBAN bekend, geen mandaat</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Niet ingesteld</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Waar draaien mijn ads?
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{activePlacements.length} actief</Badge>
              {holdPlacements.length > 0 && (
                <Badge variant="outline" className="text-amber-600">{holdPlacements.length} gepauzeerd</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {placementsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : Object.keys(screenGroups).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Geen actieve plaatsingen</p>
                <Link href="/onboarding">
                  <Button variant="link" className="mt-2">+ Eerste plaatsing toevoegen</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(screenGroups).map(([screenId, group]) => (
                  <div 
                    key={screenId} 
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    data-testid={`card-screen-${group.screenId_display}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${group.screenStatus === "online" ? "bg-green-500" : "bg-red-500"}`} />
                        <div>
                          <p className="font-semibold">{group.screenId_display}</p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {group.locationName}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline">{group.placements.length} plaatsing(en)</Badge>
                    </div>
                    <div className="ml-6 space-y-2">
                      {group.placements.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.contractName}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{p.secondsPerLoop}s × {p.playsPerHour}/uur</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {p.startDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(p.startDate).toLocaleDateString("nl-NL")}
                                {p.endDate && ` - ${new Date(p.endDate).toLocaleDateString("nl-NL")}`}
                              </span>
                            )}
                            <Badge variant={p.isActive ? "default" : "secondary"} className="text-xs">
                              {p.isActive ? "Actief" : "Gepauzeerd"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Betaalstatus</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {advertiser.moneybirdContactId ? (
                <>
                  <Badge className="bg-green-100 text-green-800">Betaald</Badge>
                  <span className="text-sm text-muted-foreground">Alle facturen voldaan</span>
                </>
              ) : (
                <>
                  <Badge variant="outline" className="text-muted-foreground">Onbekend</Badge>
                  <span className="text-sm text-muted-foreground">Koppel Moneybird voor betaalstatus</span>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" data-testid="button-copy-reminder">
              <Copy className="h-4 w-4 mr-2" />
              Kopieer betalingsherinnering
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
