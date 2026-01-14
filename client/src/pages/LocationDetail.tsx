import { useAppData } from "@/hooks/use-app-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  Building2,
  Monitor,
  CheckCircle,
  AlertCircle,
  Database,
  RefreshCw,
  Link2,
  ExternalLink,
  Clock,
  FileCheck,
  XCircle,
  Send,
  Copy,
  Check,
  Download
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
  country: string | null;
  lastSyncedAt: string | null;
}

export default function LocationDetail() {
  const [, params] = useRoute("/locations/:id");
  const { locations, screens } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const locationId = params?.id;
  const location = locations.find(l => l.id === locationId);
  const locationScreens = screens.filter(s => s.locationId === locationId);

  const { data: moneybirdContacts, isLoading: contactsLoading } = useQuery<MoneybirdContact[]>({
    queryKey: ["moneybird-contacts"],
    queryFn: async () => {
      const response = await fetch("/api/moneybird/contacts", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
    staleTime: 60000,
  });

  const linkedContact = moneybirdContacts?.find(c => c.moneybirdId === location?.moneybirdContactId);

  const { data: mailHistory } = useQuery<{ lastEmail: { toEmail: string; templateKey: string; sentAt: string; status: string } | null }>({
    queryKey: ["/api/locations", locationId, "mail-history"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${locationId}/mail-history`);
      if (!res.ok) return { lastEmail: null };
      return res.json();
    },
    enabled: !!locationId,
  });

  const linkMutation = useMutation({
    mutationFn: async (moneybirdId: string) => {
      const response = await fetch(`/api/locations/${locationId}/link-moneybird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moneybirdContactId: moneybirdId }),
      });
      if (!response.ok) throw new Error("Failed to link contact");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Moneybird contact gekoppeld" });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
    },
    onError: () => {
      toast({ title: "Fout bij koppelen", variant: "destructive" });
    },
  });

  const updateExclusivityMutation = useMutation({
    mutationFn: async (exclusivityMode: string) => {
      const response = await fetch(`/api/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ exclusivityMode }),
      });
      if (!response.ok) throw new Error("Update failed");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Concurrent uitsluiting bijgewerkt" });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
    },
    onError: () => {
      toast({ title: "Fout bij bijwerken", variant: "destructive" });
    },
  });

  const clearReviewMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/locations/${locationId}/clear-review`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to clear review");
      return { success: true };
    },
    onSuccess: () => {
      toast({ title: "Review-markering verwijderd" });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
    },
    onError: () => {
      toast({ title: "Fout bij wissen review-markering", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sync/moneybird/run", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Sync failed");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Moneybird sync voltooid" });
      queryClient.invalidateQueries({ queryKey: ["moneybird-contacts"] });
    },
    onError: () => {
      toast({ title: "Sync mislukt", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/location-onboarding/${locationId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Goedkeuren mislukt");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Locatie goedgekeurd", description: "Contract-link is verzonden" });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/location-onboarding/${locationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Afwijzen mislukt");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Locatie afgewezen" });
      setShowRejectDialog(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const resendIntakeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/location-onboarding/${locationId}/resend-intake`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Versturen mislukt");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Intake link opnieuw verzonden" });
    },
    onError: () => {
      toast({ title: "Versturen mislukt", variant: "destructive" });
    },
  });

  const resendContractMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/location-onboarding/${locationId}/resend-contract`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Versturen mislukt");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contract link opnieuw verzonden" });
    },
    onError: () => {
      toast({ title: "Versturen mislukt", variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
      toast({ title: "Gekopieerd" });
    } catch {
      toast({ title: "Kopiëren mislukt", variant: "destructive" });
    }
  };

  const getOnboardingBadge = (status: string | null | undefined) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      "INVITED_INTAKE": { label: "Uitgenodigd", className: "bg-blue-100 text-blue-800" },
      "INTAKE_SUBMITTED": { label: "Intake ontvangen", className: "bg-indigo-100 text-indigo-800" },
      "PENDING_REVIEW": { label: "Te beoordelen", className: "bg-amber-100 text-amber-800" },
      "APPROVED_AWAITING_CONTRACT": { label: "Wacht op akkoord", className: "bg-purple-100 text-purple-800" },
      "CONTRACT_PENDING_OTP": { label: "Wacht op OTP", className: "bg-cyan-100 text-cyan-800" },
      "CONTRACT_ACCEPTED": { label: "Akkoord gegeven", className: "bg-green-100 text-green-800" },
      "READY_FOR_INSTALL": { label: "Klaar voor install", className: "bg-teal-100 text-teal-800" },
      "ACTIVE": { label: "Actief", className: "bg-green-500 text-white" },
      "REJECTED": { label: "Afgewezen", className: "bg-red-100 text-red-800" },
      "draft": { label: "Concept", className: "bg-gray-100 text-gray-700" },
    };
    const config = statusMap[status || "draft"] || { label: status || "Onbekend", className: "bg-gray-100 text-gray-700" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (!location) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/locations">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar Locaties
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Locatie niet gevonden</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAddress = Boolean(location.address && location.address.trim());
  const hasCity = Boolean(location.city && location.city.trim());
  const hasZipcode = Boolean(location.zipcode && location.zipcode.trim());
  const addressComplete = hasAddress && hasCity && hasZipcode;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" size="sm" asChild data-testid="button-back">
        <Link href="/locations">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Terug naar Locaties
        </Link>
      </Button>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-4 border-b">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full shrink-0 bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" data-testid="location-name">
                {location.name}
              </h1>
              {location.needsReview && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50" data-testid="needs-review-badge">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Review nodig
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              {location.city || "Geen plaats"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {getOnboardingBadge(location.onboardingStatus)}
          {(location as any).locationKey && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-sm font-mono">
              <span className="text-slate-700">{(location as any).locationKey}</span>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-5 w-5"
                onClick={() => copyToClipboard((location as any).locationKey!, "LocationKey")}
                data-testid="button-copy-locationkey"
              >
                {copiedField === "LocationKey" ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )}
          <Button 
            variant="secondary" 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Moneybird
          </Button>
        </div>
      </div>

      {location.needsReview && (
        <Alert className="border-amber-500 bg-amber-50" data-testid="needs-review-alert">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between w-full">
            <div>
              <span className="font-medium text-amber-700">Bezoekersaantal overschrijdt rapportage-limiet</span>
              {(location as any).needsReviewReason && (
                <span className="text-amber-600 ml-2">— {(location as any).needsReviewReason}</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500 text-amber-700 hover:bg-amber-100"
              onClick={() => clearReviewMutation.mutate()}
              disabled={clearReviewMutation.isPending}
              data-testid="button-clear-review"
            >
              {clearReviewMutation.isPending ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3 mr-1" />
              )}
              Markeer als gecontroleerd
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {location.onboardingStatus === "PENDING_REVIEW" && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-amber-600" />
              Beoordeling nodig
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Bezoekers/week</p>
                  <p className="font-medium">{location.visitorsPerWeek || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{(location as any).locationType || location.branche || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Stad</p>
                  <p className="font-medium">{location.city || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Contact</p>
                  <p className="font-medium">{location.contactName || "-"}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-approve-location"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Goedkeuren
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  data-testid="button-reject-location"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Afwijzen
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {["INVITED_INTAKE", "INTAKE_SUBMITTED"].includes(location.onboardingStatus || "") && (
        <Alert>
          <Send className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Wacht op intake van locatie</span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => resendIntakeMutation.mutate()}
              disabled={resendIntakeMutation.isPending}
              data-testid="button-resend-intake"
            >
              Herinnering sturen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {["APPROVED_AWAITING_CONTRACT", "CONTRACT_PENDING_OTP"].includes(location.onboardingStatus || "") && (
        <Alert className="border-purple-200 bg-purple-50">
          <FileCheck className="h-4 w-4 text-purple-600" />
          <AlertDescription className="flex items-center justify-between">
            <span>Wacht op akkoord van locatie</span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => resendContractMutation.mutate()}
              disabled={resendContractMutation.isPending}
              data-testid="button-resend-contract"
            >
              Contract-link opnieuw sturen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {location.onboardingStatus === "CONTRACT_ACCEPTED" && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="flex items-center justify-between">
            <span>Locatie heeft akkoord gegeven - klaar voor installatie</span>
            {((location as any).bundledPdfUrl || (location as any).acceptedTermsPdfUrl) && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open((location as any).bundledPdfUrl || (location as any).acceptedTermsPdfUrl, '_blank')}
                data-testid="button-download-pdf"
              >
                <Download className="h-4 w-4 mr-2" />
                Contractbundel
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {location.onboardingStatus === "REJECTED" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>Deze locatie is afgewezen</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Moneybird
              {location.moneybirdContactId ? (
                <Badge variant="outline" className="text-green-600 border-green-600 ml-auto">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Gekoppeld
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600 ml-auto">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Niet gekoppeld
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {location.moneybirdContactId && linkedContact ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Gekoppelde contact</p>
                  <p className="font-medium">{linkedContact.companyName || `${linkedContact.firstName || ""} ${linkedContact.lastName || ""}`.trim() || "Onbekend"}</p>
                  <p className="text-xs text-muted-foreground">ID: {linkedContact.moneybirdId}</p>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Adres (uit Moneybird)</p>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <p>{linkedContact.address || "-"}</p>
                    <p>{[linkedContact.zipcode, linkedContact.city].filter(Boolean).join(" ") || "-"}</p>
                    {linkedContact.country && <p>{linkedContact.country}</p>}
                  </div>
                </div>

                {linkedContact.email && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                    <a href={`mailto:${linkedContact.email}`} className="text-sm text-primary hover:underline">
                      {linkedContact.email}
                    </a>
                  </div>
                )}

                {linkedContact.phone && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
                    <a href={`tel:${linkedContact.phone}`} className="text-sm text-primary hover:underline">
                      {linkedContact.phone}
                    </a>
                  </div>
                )}

                {linkedContact.lastSyncedAt && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 pt-2 border-t">
                    <Clock className="h-3 w-3" />
                    Laatst gesynchroniseerd: {formatDistanceToNow(new Date(linkedContact.lastSyncedAt), { addSuffix: true, locale: nl })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Deze locatie is nog niet gekoppeld aan een Moneybird contact. Selecteer een contact om te koppelen.
                </p>
                
                {contactsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <div className="flex gap-2">
                    <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecteer een Moneybird contact..." />
                      </SelectTrigger>
                      <SelectContent>
                        {moneybirdContacts?.map((contact) => (
                          <SelectItem key={contact.id} value={contact.moneybirdId}>
                            {contact.companyName || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email || "Onbekend"}
                            {contact.city && ` (${contact.city})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={() => selectedContactId && linkMutation.mutate(selectedContactId)}
                      disabled={!selectedContactId || linkMutation.isPending}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Koppelen
                    </Button>
                  </div>
                )}

                {moneybirdContacts?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Geen Moneybird contacten beschikbaar. Klik op "Sync Moneybird" om contacten op te halen.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adresgegevens
              {addressComplete ? (
                <Badge variant="outline" className="text-green-600 border-green-600 ml-auto">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Compleet
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600 ml-auto">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Onvolledig
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Straat</p>
                <p className={!hasAddress ? "text-orange-600" : ""}>{location.address || "Ontbreekt"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Postcode</p>
                  <p className={!hasZipcode ? "text-orange-600" : ""}>{location.zipcode || "Ontbreekt"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Plaats</p>
                  <p className={!hasCity ? "text-orange-600" : ""}>{location.city || "Ontbreekt"}</p>
                </div>
              </div>
              
              {location.moneybirdContactId && (
                <p className="text-xs text-green-600 flex items-center gap-1 pt-2 border-t">
                  <Database className="h-3 w-3" />
                  Bron: Moneybird
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Contactpersoon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Naam</p>
                <p>{location.contactName || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                {location.email ? (
                  <a href={`mailto:${location.email}`} className="text-primary hover:underline flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {location.email}
                  </a>
                ) : (
                  <p className="text-muted-foreground">-</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
                {location.phone ? (
                  <a href={`tel:${location.phone}`} className="text-primary hover:underline flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {location.phone}
                  </a>
                ) : (
                  <p className="text-muted-foreground">-</p>
                )}
              </div>

              {/* Last Email */}
              {mailHistory?.lastEmail && (
                <div className="border-t pt-4" data-testid="card-last-email-location">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Laatste mail</p>
                  <div className="bg-muted/30 rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <Send className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{mailHistory.lastEmail.templateKey.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(mailHistory.lastEmail.sentAt), "d MMM yyyy 'om' HH:mm", { locale: nl })}
                      {mailHistory.lastEmail.status === "sent" && (
                        <Badge variant="outline" className="ml-2 text-xs bg-green-50 text-green-700">Verzonden</Badge>
                      )}
                      {mailHistory.lastEmail.status === "failed" && (
                        <Badge variant="outline" className="ml-2 text-xs bg-red-50 text-red-700">Mislukt</Badge>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Schermen op deze locatie
              <Badge variant="secondary" className="ml-auto">{locationScreens.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {locationScreens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen schermen op deze locatie.</p>
            ) : (
              <div className="space-y-2">
                {locationScreens.map(screen => (
                  <Link 
                    key={screen.id} 
                    href={`/screens/${screen.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{screen.name || screen.screenId}</span>
                    </div>
                    <Badge variant={screen.status === "online" ? "default" : "destructive"}>
                      {screen.status === "online" ? "Online" : "Offline"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Plaatsing Instellingen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Concurrent Uitsluiting</p>
                <Select 
                  value={(location as any).exclusivityMode || "STRICT"}
                  onValueChange={(value) => updateExclusivityMutation.mutate(value)}
                  disabled={updateExclusivityMutation.isPending}
                >
                  <SelectTrigger data-testid="select-exclusivity-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STRICT">
                      <div className="flex flex-col">
                        <span>STRICT</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="RELAXED">
                      <div className="flex flex-col">
                        <span>RELAXED</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  {((location as any).exclusivityMode || "STRICT") === "STRICT" 
                    ? "Max 1 concurrent per branchegroep op deze locatie"
                    : "Max 2 concurrenten per branchegroep op deze locatie"}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Regio</p>
                  <p>{(location as any).regionCode || "-"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Yodeck Playlist</p>
                  <p className={!(location as any).yodeckPlaylistId ? "text-orange-600" : ""}>
                    {(location as any).yodeckPlaylistId || "Niet ingesteld"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Ad Capaciteit</p>
                  <p>{(location as any).adSlotCapacitySecondsPerLoop || 120}s per loop</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Huidige Belasting</p>
                  <p>{(location as any).currentAdLoadSeconds || 0}s</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Locatie afwijzen</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je deze locatie wilt afwijzen? Voeg optioneel een reden toe.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reden voor afwijzing (optioneel)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowRejectDialog(false);
                setRejectReason("");
              }}
              data-testid="button-cancel-reject"
            >
              Annuleren
            </Button>
            <Button 
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Afwijzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
