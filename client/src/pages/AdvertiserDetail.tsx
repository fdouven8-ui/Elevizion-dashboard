import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
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
  Download,
  BarChart3,
  TrendingUp,
  Camera,
  Share2,
  AlertTriangle,
  XCircle
} from "lucide-react";
import { useState, useRef } from "react";
import { format, subDays } from "date-fns";
import { nl } from "date-fns/locale";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
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

  const { data: advertiser, isLoading: advLoading, refetch: refetchAdvertiser } = useQuery<Advertiser>({
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

  const { data: contractDocs = [], refetch: refetchContracts } = useQuery<any[]>({
    queryKey: ["/api/contract-documents/entity/advertiser", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contract-documents/entity/advertiser/${id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const { data: termsAcceptance } = useQuery<any>({
    queryKey: ["/api/terms-acceptance/advertiser", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/terms-acceptance/advertiser/${id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
  });

  const generateContractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contract-documents/generate", {
        templateKey: "contract_advertiser",
        entityType: "advertiser",
        entityId: id,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.id) {
        sendContractMutation.mutate(data.id);
      } else {
        toast({ title: "Fout", description: data.error || "Kon contract niet genereren", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const sendContractMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("POST", `/api/contract-documents/${docId}/send-for-signing`, {
        customerEmail: advertiser?.email,
        customerName: advertiser?.contactName || advertiser?.companyName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Contract verzonden", description: "OTP code is verzonden naar de adverteerder" });
        refetchContracts();
      } else {
        toast({ title: "Fout", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const handleSendContract = async () => {
    if (!advertiser?.email) {
      toast({ title: "Fout", description: "Adverteerder heeft geen e-mailadres", variant: "destructive" });
      return;
    }

    if (!termsAcceptance?.accepted) {
      toast({ 
        title: "Algemene voorwaarden vereist", 
        description: "Laat de adverteerder eerst de algemene voorwaarden accepteren via de portal", 
        variant: "destructive" 
      });
      return;
    }

    const latestDoc = contractDocs.find((d: any) => d.templateKey === "contract_advertiser" && d.status !== "signed");
    
    if (latestDoc) {
      sendContractMutation.mutate(latestDoc.id);
    } else {
      generateContractMutation.mutate();
    }
  };

  const latestAdvertiserContract = contractDocs.find((d: any) => d.templateKey === "contract_advertiser");
  const contractSignStatus = latestAdvertiserContract?.signStatus || "none";
  const isContractSigned = latestAdvertiserContract?.status === "signed";

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

  const getOnboardingBadge = (status: string | null | undefined) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      "INVITED": { label: "Uitgenodigd", className: "bg-blue-100 text-blue-800" },
      "DETAILS_SUBMITTED": { label: "Gegevens ingevuld", className: "bg-indigo-100 text-indigo-800" },
      "PACKAGE_SELECTED": { label: "Pakket gekozen", className: "bg-purple-100 text-purple-800" },
      "CONTRACT_PENDING_OTP": { label: "Wacht op OTP", className: "bg-amber-100 text-amber-800" },
      "CONTRACT_ACCEPTED": { label: "Akkoord gegeven", className: "bg-green-100 text-green-800" },
      "READY_FOR_ASSET": { label: "Klaar voor video", className: "bg-teal-100 text-teal-800" },
      "ASSET_RECEIVED": { label: "Video ontvangen", className: "bg-cyan-100 text-cyan-800" },
      "LIVE": { label: "Live", className: "bg-green-500 text-white" },
      "draft": { label: "Concept", className: "bg-gray-100 text-gray-700" },
      "invited": { label: "Uitgenodigd", className: "bg-blue-100 text-blue-800" },
      "completed": { label: "Voltooid", className: "bg-green-100 text-green-800" },
    };
    const config = statusMap[status || "draft"] || { label: status || "Onbekend", className: "bg-gray-100 text-gray-700" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getAssetBadge = (status: string | null | undefined) => {
    switch (status) {
      case "received":
        return <Badge className="bg-cyan-100 text-cyan-800"><Camera className="h-3 w-3 mr-1" />Ontvangen</Badge>;
      case "live":
        return <Badge className="bg-green-100 text-green-800"><Play className="h-3 w-3 mr-1" />Live</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Nog niet ontvangen</Badge>;
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
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <SyncStatusBadge
              status={advertiser.moneybirdSyncStatus}
              provider="moneybird"
              entityType="advertiser"
              entityId={advertiser.id}
              error={advertiser.moneybirdSyncError}
              lastSyncAt={advertiser.moneybirdLastSyncAt}
            />
            {getOnboardingBadge(advertiser.onboardingStatus)}
            {advertiser.assetStatus && getAssetBadge(advertiser.assetStatus)}
            {advertiser.linkKey && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-sm font-mono">
                <Share2 className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-slate-700">{advertiser.linkKey}</span>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => copyToClipboard(advertiser.linkKey!, "LinkKey")}
                  data-testid="button-copy-linkkey"
                >
                  {copiedField === "LinkKey" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            )}
          </div>
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
                {isContractSigned ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Getekend
                  </Badge>
                ) : contractSignStatus === "verified" ? (
                  <Badge className="bg-blue-100 text-blue-800">
                    <Check className="h-3 w-3 mr-1" />
                    OTP geverifieerd
                  </Badge>
                ) : contractSignStatus === "sent" ? (
                  <Badge className="bg-blue-100 text-blue-800">
                    <Clock className="h-3 w-3 mr-1" />
                    Verzonden
                  </Badge>
                ) : latestAdvertiserContract ? (
                  <Badge variant="outline" className="bg-gray-50 text-gray-700">
                    Concept
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">
                    <Clock className="h-3 w-3 mr-1" />
                    Niet verstuurd
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Advertentie-overeenkomst voor plaatsing op schermen
              </p>
              <div className="flex gap-2">
                {isContractSigned ? (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    data-testid="button-download-contract"
                    onClick={() => window.open(`/api/contract-documents/${latestAdvertiserContract?.id}/signed-pdf`, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    PDF downloaden
                  </Button>
                ) : (
                  <>
                    <Button 
                      size="sm" 
                      variant="default" 
                      data-testid="button-send-contract"
                      onClick={handleSendContract}
                      disabled={generateContractMutation.isPending || sendContractMutation.isPending || !advertiser.email}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {contractSignStatus === "sent" ? "Opnieuw versturen" : "Verstuur"}
                    </Button>
                    {latestAdvertiserContract && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        data-testid="button-copy-contract-link"
                        onClick={() => {
                          const link = `${window.location.origin}/contract-ondertekenen/${latestAdvertiserContract.id}`;
                          navigator.clipboard.writeText(link);
                          toast({ title: "Link gekopieerd" });
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Link kopiëren
                      </Button>
                    )}
                  </>
                )}
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
                  <Button 
                    size="sm" 
                    variant="outline" 
                    data-testid="button-download-sepa"
                    onClick={() => window.open(`/api/advertisers/${advertiser.id}/sepa-mandate-pdf`, '_blank')}
                  >
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
              Contracten: {(isContractSigned ? 1 : 0) + (advertiser.sepaMandate ? 1 : 0)}/2 getekend
            </span>
            <div className="flex gap-2">
              {(advertiser as any).bundledPdfUrl && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  data-testid="button-download-bundle"
                  onClick={() => window.open((advertiser as any).bundledPdfUrl, '_blank')}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Contractbundel
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                data-testid="button-refresh-contracts"
                onClick={() => refetchContracts()}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Status verversen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-orange-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Video Advertentie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-background rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Video Status</span>
                {advertiser.assetStatus === "live" ? (
                  <Badge className="bg-green-100 text-green-800">
                    <Play className="h-3 w-3 mr-1" />
                    Live op schermen
                  </Badge>
                ) : advertiser.assetStatus === "ready_for_yodeck" ? (
                  <Badge className="bg-blue-100 text-blue-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Klaar voor upload
                  </Badge>
                ) : advertiser.assetStatus === "uploaded_valid" ? (
                  <Badge className="bg-cyan-100 text-cyan-800">
                    <Camera className="h-3 w-3 mr-1" />
                    Ontvangen
                  </Badge>
                ) : advertiser.assetStatus === "uploaded_invalid" ? (
                  <Badge className="bg-red-100 text-red-800">
                    <XCircle className="h-3 w-3 mr-1" />
                    Ongeldige video
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">
                    <Clock className="h-3 w-3 mr-1" />
                    Wacht op video
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Duur: {advertiser.videoDurationSeconds || 15} seconden | Formaat: MP4 (H.264) | 1920x1080
              </p>
              <div className="flex gap-2 flex-wrap">
                {advertiser.linkKey && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    data-testid="button-copy-upload-link"
                    onClick={() => {
                      const uploadLink = `${window.location.origin}/upload/${advertiser.linkKey}`;
                      navigator.clipboard.writeText(uploadLink);
                      toast({ title: "Upload link gekopieerd" });
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Upload Link
                  </Button>
                )}
                {(advertiser.assetStatus === "uploaded_valid" || advertiser.assetStatus === "ready_for_yodeck") && (
                  <Button 
                    size="sm" 
                    variant="default"
                    data-testid="button-mark-ready-yodeck"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/advertisers/${advertiser.id}/ad-assets`);
                        const assets = await res.json();
                        const latestValid = assets.find((a: any) => a.validationStatus === "valid");
                        if (latestValid) {
                          await fetch(`/api/ad-assets/${latestValid.id}/mark-ready`, { method: "POST" });
                          refetchAdvertiser();
                          toast({ title: "Video klaargezet voor Yodeck" });
                        }
                      } catch (e) {
                        toast({ title: "Fout bij klaarzetten", variant: "destructive" });
                      }
                    }}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Klaarzetten
                  </Button>
                )}
              </div>
            </div>

            <div className="bg-background rounded-lg p-4 border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Video Specificaties</span>
                <Badge variant="secondary">LinkKey: {advertiser.linkKey || "Niet beschikbaar"}</Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Bestandsformaat: MP4 (H.264 codec)</li>
                <li>• Resolutie: 1920x1080 (Full HD)</li>
                <li>• Duur: exact {advertiser.videoDurationSeconds || 15} seconden</li>
                <li>• Beeldverhouding: 16:9</li>
                <li>• Audio: niet toegestaan</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Contactgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Contact Person */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Contactpersoon</p>
              <p className="text-sm font-medium">{advertiser.contactName}</p>
            </div>

            {/* Phone */}
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

            {/* Email */}
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

            {/* Address Section */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Adres</p>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  {advertiser.street || advertiser.address ? (
                    <>
                      <p>{advertiser.street || advertiser.address}</p>
                      {(advertiser.zipcode || advertiser.city) && (
                        <p>{[advertiser.zipcode, advertiser.city].filter(Boolean).join(" ")}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">Geen adres</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* VAT & KVK */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">BTW-nummer</p>
                <p className="text-sm font-mono">{advertiser.vatNumber || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">KVK-nummer</p>
                <p className="text-sm font-mono">{advertiser.kvkNumber || "-"}</p>
              </div>
            </div>
            
            <Separator />
            
            {/* Moneybird Status */}
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

            {/* Notes */}
            {advertiser.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Notities</p>
                  <p className="text-sm bg-muted/50 rounded p-2">{advertiser.notes}</p>
                </div>
              </>
            )}

            <Separator />

            {/* SEPA Incasso */}
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

      {/* Statistics Section */}
      <AdvertiserStatistics advertiserId={id!} />

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

interface AdvertiserStatsData {
  advertiserId: string;
  advertiserName: string;
  available: boolean;
  unavailableReason?: string;
  screens: {
    screenId: string;
    screenIdDisplay: string;
    city: string;
    locationName: string;
    status: "online" | "offline";
    plays: number;
    durationMs: number;
  }[];
  playback: {
    totalPlays: number;
    totalDurationMs: number;
    topCreatives: { name: string; plays: number; durationMs: number }[];
    playsByCity: { city: string; plays: number }[];
  };
  dateRange: { startDate: string; endDate: string };
}

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function AdvertiserStatistics({ advertiserId }: { advertiserId: string }) {
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

  const initialDates = getInitialDates();
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [datePreset, setDatePreset] = useState<"today" | "7d" | "30d">(getInitialPreset(initialDates.startDate, initialDates.endDate));

  const updateUrlParams = (newStartDate: string, newEndDate: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("startDate", newStartDate);
    url.searchParams.set("endDate", newEndDate);
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
    updateUrlParams(newStartDate, newEndDate);
  };

  const { data: stats, isLoading, refetch } = useQuery<AdvertiserStatsData>({
    queryKey: ["/api/advertisers", advertiserId, "stats", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/advertisers/${advertiserId}/stats?${params}`, { credentials: "include" });
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
      link.download = `advertiser-stats-${advertiserId}-${format(new Date(), "yyyy-MM-dd")}.png`;
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
    navigator.clipboard.writeText(url.toString());
    toast({ title: "Link gekopieerd" });
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}u ${minutes}m`;
    return `${minutes}m`;
  };

  const screenChartData = stats?.screens?.map((s) => ({
    name: s.screenIdDisplay,
    plays: s.plays,
    city: s.city,
    status: s.status,
  })) || [];

  const cityChartData = stats?.playback?.playsByCity?.map((c) => ({
    name: c.city,
    plays: c.plays,
  })) || [];

  const creativeChartData = stats?.playback?.topCreatives?.map((c) => ({
    name: c.name.length > 15 ? c.name.substring(0, 15) + "..." : c.name,
    plays: c.plays,
  })) || [];

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="statistics" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline" data-testid="toggle-advertiser-statistics">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <span className="font-semibold">Statistieken</span>
            {stats?.playback?.totalPlays !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {stats.playback.totalPlays.toLocaleString()} plays
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {isLoading ? (
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
                    <SelectTrigger className="w-32 h-8" data-testid="select-advertiser-date-range">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Vandaag</SelectItem>
                      <SelectItem value="7d">7 dagen</SelectItem>
                      <SelectItem value="30d">30 dagen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing} data-testid="button-refresh-advertiser-stats">
                  <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                  Vernieuwen
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSnapshot} data-testid="button-advertiser-snapshot">
                  <Camera className="h-4 w-4 mr-1" />
                  Snapshot
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopyLink} data-testid="button-advertiser-share-link">
                  <Share2 className="h-4 w-4 mr-1" />
                  Link
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        <p className="text-sm text-muted-foreground">Totale speeltijd</p>
                        <p className="text-2xl font-bold">{formatDuration(stats.playback.totalDurationMs)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-500">
                        <Monitor className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Schermen</p>
                        <p className="text-2xl font-bold">{stats.screens.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {screenChartData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Plays per Scherm
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={screenChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-background border rounded-lg p-2 shadow-lg">
                                  <p className="text-sm font-medium">{data.name}</p>
                                  <p className="text-sm text-muted-foreground">{data.city}</p>
                                  <p className="text-sm">{data.plays} plays</p>
                                  <Badge variant={data.status === "online" ? "default" : "secondary"} className="text-xs mt-1">
                                    {data.status}
                                  </Badge>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="plays" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cityChartData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Plays per Stad
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={cityChartData}
                            dataKey="plays"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={60}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {cityChartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {creativeChartData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Top Creatives
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={creativeChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 12 }} />
                          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="plays" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
