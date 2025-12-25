import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, RefreshCw, Loader2, Link2, Unlink } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface IntegrationStatus {
  yodeck: { isConfigured: boolean };
  moneybird: { isConfigured: boolean };
}

interface MoneybirdStatus {
  configured: boolean;
  connected: boolean;
  hasApiToken: boolean;
  hasAdministrationId: boolean;
  administrationId: string | null;
  lastSyncAt: string | null;
  lastSyncItemsProcessed: number | null;
  stats: {
    totalContacts: number;
    linkedContacts: number;
    totalInvoices: number;
    openInvoices: number;
    paidInvoices: number;
    totalUnpaid: string;
  };
}

interface MoneybirdSyncResult {
  ok: boolean;
  message: string;
  contacts?: { total: number; created: number; updated: number };
  invoices?: { total: number; created: number; updated: number };
  payments?: { synced: number };
  duration?: number;
}

interface YodeckConfigStatus {
  configured: boolean;
}

interface Advertiser {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  moneybirdContactId: string | null;
}

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  advertiserId: string | null;
}

interface YodeckTestResult {
  ok: boolean;
  success: boolean;
  message: string;
  count?: number;
  sampleFields?: string[];
  statusCode?: number;
  requestedUrl?: string;
  contentType?: string;
  bodyPreview?: string;
}

async function fetchIntegrationStatus(): Promise<IntegrationStatus> {
  const res = await fetch("/api/integrations/status");
  return res.json();
}

async function fetchYodeckConfigStatus(): Promise<YodeckConfigStatus> {
  const res = await fetch("/api/integrations/yodeck/config-status");
  return res.json();
}

async function testYodeck(): Promise<YodeckTestResult> {
  const res = await fetch("/api/integrations/yodeck/test", { method: "POST" });
  return res.json();
}

async function testMoneybird() {
  const res = await fetch("/api/integrations/moneybird/test", { method: "POST" });
  return res.json();
}

async function fetchMoneybirdStatus(): Promise<MoneybirdStatus> {
  const res = await fetch("/api/integrations/moneybird/status", { credentials: "include" });
  return res.json();
}

async function syncMoneybird(): Promise<MoneybirdSyncResult> {
  const res = await fetch("/api/sync/moneybird/run", { method: "POST", credentials: "include" });
  return res.json();
}

async function syncYodeck() {
  const res = await fetch("/api/integrations/yodeck/sync", { method: "POST" });
  return res.json();
}

async function fetchAdvertisers(): Promise<Advertiser[]> {
  const res = await fetch("/api/advertisers", { credentials: "include" });
  return res.json();
}

async function fetchMoneybirdContacts(): Promise<MoneybirdContact[]> {
  const res = await fetch("/api/moneybird/contacts", { credentials: "include" });
  return res.json();
}

async function linkAdvertiserToContact(advertiserId: string, moneybirdContactId: string): Promise<void> {
  const res = await fetch(`/api/moneybird/contacts/${moneybirdContactId}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ advertiserId }),
  });
  if (!res.ok) throw new Error("Koppelen mislukt");
}

async function runYodeckSync() {
  const res = await fetch("/api/sync/yodeck/run", { method: "POST", credentials: "include" });
  return res.json();
}

export default function Integrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testingYodeck, setTestingYodeck] = useState(false);
  const [testingMoneybird, setTestingMoneybird] = useState(false);
  const [syncingYodeck, setSyncingYodeck] = useState(false);
  const [syncingMoneybird, setSyncingMoneybird] = useState(false);
  const [runningSyncYodeck, setRunningSyncYodeck] = useState(false);
  const [syncRunResult, setSyncRunResult] = useState<any>(null);
  const [moneybirdSyncResult, setMoneybirdSyncResult] = useState<MoneybirdSyncResult | null>(null);
  const [showGetFallback, setShowGetFallback] = useState(false);
  const [yodeckTestResult, setYodeckTestResult] = useState<YodeckTestResult | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: fetchIntegrationStatus,
  });

  const { data: yodeckConfig, refetch: refetchYodeckConfig } = useQuery({
    queryKey: ["yodeck-config-status"],
    queryFn: fetchYodeckConfigStatus,
    refetchInterval: 10000,
  });

  const { data: moneybirdStatus, refetch: refetchMoneybirdStatus } = useQuery({
    queryKey: ["moneybird-status"],
    queryFn: fetchMoneybirdStatus,
    refetchInterval: 30000,
  });

  const { data: advertisers } = useQuery({
    queryKey: ["advertisers"],
    queryFn: fetchAdvertisers,
  });

  const { data: moneybirdContacts, refetch: refetchContacts } = useQuery({
    queryKey: ["moneybird-contacts"],
    queryFn: fetchMoneybirdContacts,
    enabled: !!moneybirdStatus?.configured,
  });

  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});

  const linkMutation = useMutation({
    mutationFn: ({ advertiserId, contactId }: { advertiserId: string; contactId: string }) =>
      linkAdvertiserToContact(advertiserId, contactId),
    onSuccess: () => {
      toast({ title: "Gekoppeld", description: "Adverteerder is gekoppeld aan Moneybird contact" });
      refetchContacts();
      queryClient.invalidateQueries({ queryKey: ["advertisers"] });
      queryClient.invalidateQueries({ queryKey: ["moneybird-status"] });
    },
    onError: () => {
      toast({ title: "Fout", description: "Koppelen mislukt", variant: "destructive" });
    },
  });

  const yodeckConfigured = yodeckConfig?.configured ?? status?.yodeck?.isConfigured ?? false;
  const moneybirdConfigured = moneybirdStatus?.configured ?? status?.moneybird?.isConfigured ?? false;

  const handleTestYodeck = async () => {
    setTestingYodeck(true);
    setYodeckTestResult(null);
    try {
      const result = await testYodeck();
      setYodeckTestResult(result);
      if (result.ok || result.success) {
        toast({
          title: "Verbonden met Yodeck",
          description: `${result.count ?? 0} schermen gevonden`,
        });
      } else {
        toast({
          title: "Verbinding Mislukt",
          description: `${result.message}${result.statusCode ? ` (status ${result.statusCode})` : ""}`,
          variant: "destructive",
        });
      }
      refetchYodeckConfig();
    } catch (error) {
      toast({ title: "Fout", description: "Kan verbinding niet testen", variant: "destructive" });
    }
    setTestingYodeck(false);
  };

  const handleTestMoneybird = async () => {
    setTestingMoneybird(true);
    try {
      const result = await testMoneybird();
      toast({
        title: result.success ? "Moneybird Verbonden" : "Verbinding Mislukt",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      refetchMoneybirdStatus();
    } catch (error) {
      toast({ title: "Fout", description: "Kan verbinding niet testen", variant: "destructive" });
    }
    setTestingMoneybird(false);
  };

  const handleSyncMoneybird = async () => {
    setSyncingMoneybird(true);
    setMoneybirdSyncResult(null);
    toast({ title: "Synchroniseren...", description: "Contacten en facturen worden opgehaald van Moneybird" });
    try {
      const result = await syncMoneybird();
      setMoneybirdSyncResult(result);
      if (result.ok) {
        toast({ 
          title: "Synchronisatie Voltooid", 
          description: `${result.contacts?.total || 0} contacten, ${result.invoices?.total || 0} facturen gesynchroniseerd` 
        });
        refetchMoneybirdStatus();
      } else {
        toast({ title: "Synchronisatie Mislukt", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Fout", description: "Kan niet synchroniseren met Moneybird", variant: "destructive" });
    }
    setSyncingMoneybird(false);
  };

  const handleSyncYodeck = async () => {
    setSyncingYodeck(true);
    toast({ title: "Synchroniseren...", description: "Schermen worden opgehaald van Yodeck" });
    try {
      const result = await syncYodeck();
      if (result.success) {
        toast({ title: "Synchronisatie Voltooid", description: `${result.screens?.length || 0} schermen gesynchroniseerd vanuit Yodeck` });
        queryClient.invalidateQueries({ queryKey: ["screens"] });
        refetchYodeckConfig();
      } else {
        toast({ title: "Synchronisatie Mislukt", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Fout", description: "Kan schermen niet synchroniseren", variant: "destructive" });
    }
    setSyncingYodeck(false);
  };

  const handleRunYodeckSync = async () => {
    console.log("[UI] clicked yodeck sync (POST)");
    setRunningSyncYodeck(true);
    setSyncRunResult(null);
    setShowGetFallback(false);
    try {
      const response = await fetch("/api/sync/yodeck/run", { 
        method: "POST", 
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      const result = await response.json();
      console.log("[UI] sync response:", result);
      setSyncRunResult(result);
      if (result.ok) {
        toast({ title: "Sync Voltooid", description: `Verwerkt: ${result.processed} schermen` });
        queryClient.invalidateQueries({ queryKey: ["screens"] });
        queryClient.invalidateQueries({ queryKey: ["control-room-stats"] });
      } else {
        toast({ title: "Sync Mislukt", description: result.message, variant: "destructive" });
        setShowGetFallback(true);
      }
    } catch (error: any) {
      console.error("[UI] sync error:", error);
      setSyncRunResult({ ok: false, message: error.message, error: String(error) });
      toast({ title: "Fout", description: "Sync mislukt - gebruik GET fallback link", variant: "destructive" });
      setShowGetFallback(true);
    }
    setRunningSyncYodeck(false);
  };

  const handleOpenGetFallback = () => {
    console.log("[UI] opening GET fallback");
    window.open("/api/sync/yodeck/run", "_blank");
  };

  if (isLoading) {
    return <div className="p-6">Laden...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Integraties</h1>
          <p className="text-muted-foreground">Verbind externe diensten voor facturatie en schermbeheer.</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Yodeck
              <Badge variant={yodeckConfigured ? "default" : "secondary"} data-testid="badge-yodeck-status">
                {yodeckConfigured ? (
                  <><Check className="h-3 w-3 mr-1" /> Geconfigureerd</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Niet Geconfigureerd</>
                )}
              </Badge>
            </CardTitle>
            <CardDescription>
              Verbind uw Yodeck-account om schermstatus te synchroniseren en spelergezondheid te monitoren.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {yodeckConfigured ? (
                <div className="space-y-2">
                  <p>Uw Yodeck API-key is geconfigureerd. U kunt de verbinding testen of schermgegevens synchroniseren.</p>
                  {yodeckTestResult && (
                    <div className={`p-3 rounded-md ${yodeckTestResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                      {yodeckTestResult.ok ? (
                        <p className="text-green-700">Verbonden met Yodeck - {yodeckTestResult.count ?? 0} schermen</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-red-700">{yodeckTestResult.message} {yodeckTestResult.statusCode ? `(status ${yodeckTestResult.statusCode})` : ""}</p>
                          {yodeckTestResult.requestedUrl && (
                            <p className="text-xs text-red-500">URL: {yodeckTestResult.requestedUrl}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p>Om Yodeck te verbinden, voeg deze omgevingsvariabele toe in de Deployment secrets:</p>
                  <code className="block bg-muted p-3 rounded-md text-xs">
                    YODECK_API_KEY=uw_api_key_hier
                  </code>
                  <p className="text-xs">Haal uw API-key op van Yodeck: Instellingen → Geavanceerd → API Tokens</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handleTestYodeck}
                disabled={!yodeckConfigured || testingYodeck}
                data-testid="button-test-yodeck"
              >
                {testingYodeck && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Test Verbinding
              </Button>
              <Button 
                onClick={handleSyncYodeck}
                disabled={!yodeckConfigured || syncingYodeck}
                data-testid="button-sync-yodeck"
              >
                {syncingYodeck ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Nu
              </Button>
              <Button 
                variant="default"
                onClick={handleRunYodeckSync}
                style={{ pointerEvents: "auto", position: "relative", zIndex: 10 }}
                data-testid="button-run-yodeck-sync"
              >
                {runningSyncYodeck && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Run Yodeck Sync (POST)
              </Button>
              <Button 
                variant="outline"
                onClick={handleOpenGetFallback}
                style={{ pointerEvents: "auto" }}
                data-testid="button-get-fallback"
              >
                Open Yodeck Sync (GET fallback)
              </Button>
            </div>
            {showGetFallback && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                POST mislukt. <a href="/api/sync/yodeck/run" target="_blank" className="underline text-blue-600">Klik hier voor GET fallback</a>
              </div>
            )}
            {syncRunResult && (
              <div className={`p-3 rounded-md text-sm ${syncRunResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(syncRunResult, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Moneybird
              <Badge variant={moneybirdConfigured ? "default" : "secondary"} data-testid="badge-moneybird-status">
                {moneybirdConfigured ? (
                  <><Check className="h-3 w-3 mr-1" /> Geconfigureerd</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Niet Geconfigureerd</>
                )}
              </Badge>
            </CardTitle>
            <CardDescription>
              Verbind Moneybird om automatisch contacten, facturen en betalingen te synchroniseren.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {moneybirdConfigured ? (
                <div className="space-y-3">
                  <p>Uw Moneybird API is geconfigureerd. U kunt de verbinding testen of gegevens synchroniseren.</p>
                  
                  {moneybirdStatus?.stats && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-muted/50 rounded-md">
                      <div>
                        <p className="text-xs text-muted-foreground">Contacten</p>
                        <p className="font-semibold" data-testid="text-moneybird-contacts">{moneybirdStatus.stats.totalContacts}</p>
                        <p className="text-xs text-muted-foreground">{moneybirdStatus.stats.linkedContacts} gekoppeld</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Facturen</p>
                        <p className="font-semibold" data-testid="text-moneybird-invoices">{moneybirdStatus.stats.totalInvoices}</p>
                        <p className="text-xs text-muted-foreground">{moneybirdStatus.stats.openInvoices} open, {moneybirdStatus.stats.paidInvoices} betaald</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Openstaand</p>
                        <p className="font-semibold" data-testid="text-moneybird-unpaid">€{moneybirdStatus.stats.totalUnpaid}</p>
                      </div>
                    </div>
                  )}
                  
                  {moneybirdStatus?.lastSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Laatste sync: {new Date(moneybirdStatus.lastSyncAt).toLocaleString("nl-NL")}
                      {moneybirdStatus.lastSyncItemsProcessed && ` (${moneybirdStatus.lastSyncItemsProcessed} items)`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p>Om Moneybird te verbinden, voeg deze omgevingsvariabelen toe:</p>
                  <code className="block bg-muted p-3 rounded-md text-xs">
                    MONEYBIRD_API_TOKEN=uw_api_token_hier<br />
                    MONEYBIRD_ADMINISTRATION_ID=uw_admin_id
                  </code>
                  <p className="text-xs">Haal uw API-token op van: moneybird.com/user/applications/new</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handleTestMoneybird}
                disabled={!moneybirdConfigured || testingMoneybird}
                data-testid="button-test-moneybird"
              >
                {testingMoneybird && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Test Verbinding
              </Button>
              <Button 
                onClick={handleSyncMoneybird}
                disabled={!moneybirdConfigured || syncingMoneybird}
                data-testid="button-sync-moneybird"
              >
                {syncingMoneybird ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Nu
              </Button>
            </div>
            {moneybirdSyncResult && (
              <div className={`p-3 rounded-md text-sm ${moneybirdSyncResult.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {moneybirdSyncResult.ok ? (
                  <div className="space-y-1">
                    <p className="text-green-700 font-medium">Synchronisatie voltooid</p>
                    <p className="text-xs text-green-600">
                      Contacten: {moneybirdSyncResult.contacts?.total} ({moneybirdSyncResult.contacts?.created} nieuw, {moneybirdSyncResult.contacts?.updated} bijgewerkt)
                    </p>
                    <p className="text-xs text-green-600">
                      Facturen: {moneybirdSyncResult.invoices?.total} ({moneybirdSyncResult.invoices?.created} nieuw, {moneybirdSyncResult.invoices?.updated} bijgewerkt)
                    </p>
                    <p className="text-xs text-green-600">
                      Betalingen: {moneybirdSyncResult.payments?.synced} gesynchroniseerd
                    </p>
                  </div>
                ) : (
                  <p className="text-red-700">{moneybirdSyncResult.message}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {moneybirdConfigured && moneybirdContacts && moneybirdContacts.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Link2 className="h-5 w-5" />
                Adverteerder Koppelingen
              </CardTitle>
              <CardDescription>
                Koppel uw adverteerders aan Moneybird contacten om facturen en betalingen te synchroniseren.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {advertisers?.map((advertiser) => {
                  const linkedContact = moneybirdContacts?.find(c => c.advertiserId === advertiser.id);
                  const availableContacts = moneybirdContacts?.filter(c => !c.advertiserId || c.advertiserId === advertiser.id) || [];
                  
                  return (
                    <div key={advertiser.id} className="flex items-center gap-4 p-3 border rounded-lg" data-testid={`mapping-row-${advertiser.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" data-testid={`text-advertiser-name-${advertiser.id}`}>{advertiser.companyName}</p>
                        <p className="text-xs text-muted-foreground truncate">{advertiser.email || advertiser.contactName || "Geen contact"}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {linkedContact ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="whitespace-nowrap" data-testid={`badge-linked-${advertiser.id}`}>
                              <Check className="h-3 w-3 mr-1" />
                              {linkedContact.companyName || `${linkedContact.firstname || ''} ${linkedContact.lastname || ''}`.trim() || linkedContact.email}
                            </Badge>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Select
                              value={selectedMappings[advertiser.id] || ""}
                              onValueChange={(value) => setSelectedMappings(prev => ({ ...prev, [advertiser.id]: value }))}
                            >
                              <SelectTrigger className="w-[200px]" data-testid={`select-contact-${advertiser.id}`}>
                                <SelectValue placeholder="Selecteer contact..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableContacts.map((contact) => (
                                  <SelectItem key={contact.id} value={contact.id}>
                                    {contact.companyName || `${contact.firstname || ''} ${contact.lastname || ''}`.trim() || contact.email || contact.moneybirdId}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              disabled={!selectedMappings[advertiser.id] || linkMutation.isPending}
                              onClick={() => {
                                const contactId = selectedMappings[advertiser.id];
                                if (contactId) {
                                  linkMutation.mutate({ advertiserId: advertiser.id, contactId });
                                  setSelectedMappings(prev => {
                                    const next = { ...prev };
                                    delete next[advertiser.id];
                                    return next;
                                  });
                                }
                              }}
                              data-testid={`button-link-${advertiser.id}`}
                            >
                              {linkMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Link2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {(!advertisers || advertisers.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Geen adverteerders gevonden om te koppelen.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
