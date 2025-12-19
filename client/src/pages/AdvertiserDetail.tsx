import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  AlertCircle,
  FileText,
  Send,
  FileSignature,
  Clock,
  Eye,
  CheckCircle2,
  RefreshCw,
  Download
} from "lucide-react";
import { useState } from "react";
import type { Advertiser } from "@shared/schema";

interface Template {
  id: string;
  name: string;
  category: string;
  subject?: string | null;
  body: string;
  isEnabled: boolean;
}

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
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState<"whatsapp" | "email" | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [renderedMessage, setRenderedMessage] = useState<{ subject: string; body: string } | null>(null);

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

  const { data: whatsappTemplates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates", "whatsapp"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates?category=whatsapp");
      return res.json();
    },
  });

  const { data: emailTemplates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates", "email"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/templates?category=email");
      return res.json();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/preview`, { advertiserId: id });
      return res.json();
    },
    onSuccess: (data) => {
      setRenderedMessage(data);
    },
  });

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    previewMutation.mutate(template.id);
  };

  const openWhatsAppWithTemplate = () => {
    if (advertiser?.phone && renderedMessage) {
      const phone = advertiser.phone.replace(/\D/g, "");
      const encodedMessage = encodeURIComponent(renderedMessage.body);
      window.open(`https://wa.me/${phone}?text=${encodedMessage}`, "_blank");
      setShowTemplateDialog(null);
      setSelectedTemplate(null);
      setRenderedMessage(null);
    }
  };

  const openEmailWithTemplate = () => {
    if (advertiser?.email && renderedMessage) {
      const subject = encodeURIComponent(renderedMessage.subject || "");
      const body = encodeURIComponent(renderedMessage.body);
      window.open(`mailto:${advertiser.email}?subject=${subject}&body=${body}`, "_blank");
      setShowTemplateDialog(null);
      setSelectedTemplate(null);
      setRenderedMessage(null);
    }
  };

  const copyAndClose = () => {
    if (renderedMessage) {
      navigator.clipboard.writeText(renderedMessage.body);
      toast({ title: "Gekopieerd naar klembord" });
      setShowTemplateDialog(null);
      setSelectedTemplate(null);
      setRenderedMessage(null);
    }
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
          <Button 
            variant="outline" 
            onClick={() => { setShowTemplateDialog("whatsapp"); setSelectedTemplate(null); setRenderedMessage(null); }} 
            disabled={!advertiser.phone} 
            data-testid="button-whatsapp"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
          <Button 
            variant="outline" 
            onClick={() => { setShowTemplateDialog("email"); setSelectedTemplate(null); setRenderedMessage(null); }} 
            disabled={!advertiser.email} 
            data-testid="button-email"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email
          </Button>
          <Button variant="outline" data-testid="button-pause-all">
            <Pause className="h-4 w-4 mr-2" />
            Pauzeer Alles
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Contract Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-background rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Reclame Contract</span>
                <Badge variant="outline" className="bg-amber-50 text-amber-700">
                  <Clock className="h-3 w-3 mr-1" />
                  Niet verstuurd
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Advertentie-overeenkomst voor plaatsing op schermen
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="default" data-testid="button-send-contract">
                  <Send className="h-4 w-4 mr-1" />
                  Verstuur
                </Button>
                <Button size="sm" variant="outline" data-testid="button-copy-contract-link">
                  <Copy className="h-4 w-4 mr-1" />
                  Link kopiëren
                </Button>
              </div>
            </div>

            <div className="bg-background rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">SEPA Machtiging</span>
                {advertiser.sepaMandate ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Getekend
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">
                    <Clock className="h-3 w-3 mr-1" />
                    Niet verstuurd
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Automatische incasso machtiging
              </p>
              <div className="flex gap-2">
                {advertiser.sepaMandate ? (
                  <Button size="sm" variant="outline" data-testid="button-download-sepa">
                    <Download className="h-4 w-4 mr-1" />
                    PDF downloaden
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="default" data-testid="button-send-sepa">
                      <Send className="h-4 w-4 mr-1" />
                      Verstuur
                    </Button>
                    <Button size="sm" variant="ghost" data-testid="button-skip-sepa">
                      Overslaan
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Contracten: {advertiser.sepaMandate ? "1" : "0"}/2 getekend
            </span>
            <Button variant="ghost" size="sm" data-testid="button-refresh-contracts">
              <RefreshCw className="h-4 w-4 mr-1" />
              Status verversen
            </Button>
          </div>
        </CardContent>
      </Card>

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

      <Dialog open={!!showTemplateDialog} onOpenChange={(open) => !open && setShowTemplateDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {showTemplateDialog === "whatsapp" ? "WhatsApp Template Kiezen" : "Email Template Kiezen"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!selectedTemplate ? (
              <div className="space-y-2">
                {(showTemplateDialog === "whatsapp" ? whatsappTemplates : emailTemplates)
                  .filter(t => t.isEnabled)
                  .map((template) => (
                    <div 
                      key={template.id}
                      className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleTemplateSelect(template)}
                      data-testid={`template-option-${template.id}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{template.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.body}</p>
                    </div>
                  ))}
                {(showTemplateDialog === "whatsapp" ? whatsappTemplates : emailTemplates).filter(t => t.isEnabled).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Geen templates beschikbaar</p>
                    <p className="text-sm">Maak eerst een template aan in Instellingen → Templates</p>
                  </div>
                )}
                <div className="pt-4 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={showTemplateDialog === "whatsapp" ? openWhatsApp : openEmail}
                  >
                    Zonder template verzenden
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>Template: {selectedTemplate.name}</span>
                </div>
                {renderedMessage ? (
                  <>
                    {renderedMessage.subject && (
                      <div>
                        <p className="text-sm font-medium mb-1">Onderwerp:</p>
                        <p className="bg-muted p-2 rounded text-sm">{renderedMessage.subject}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium mb-1">Bericht:</p>
                      <p className="bg-muted p-3 rounded text-sm whitespace-pre-wrap max-h-48 overflow-auto">
                        {renderedMessage.body}
                      </p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      {showTemplateDialog === "whatsapp" ? (
                        <Button className="flex-1" onClick={openWhatsAppWithTemplate} data-testid="button-send-whatsapp">
                          <Send className="h-4 w-4 mr-2" />
                          Stuur via WhatsApp
                        </Button>
                      ) : (
                        <Button className="flex-1" onClick={openEmailWithTemplate} data-testid="button-send-email">
                          <Send className="h-4 w-4 mr-2" />
                          Open in Email
                        </Button>
                      )}
                      <Button variant="outline" onClick={copyAndClose} data-testid="button-copy-message">
                        <Copy className="h-4 w-4 mr-2" />
                        Kopiëren
                      </Button>
                    </div>
                    <Button 
                      variant="ghost" 
                      className="w-full" 
                      onClick={() => { setSelectedTemplate(null); setRenderedMessage(null); }}
                    >
                      Andere template kiezen
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    <p className="text-sm text-muted-foreground mt-2">Bericht genereren...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
