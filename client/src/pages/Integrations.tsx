import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, RefreshCw, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface IntegrationStatus {
  yodeck: { isConfigured: boolean };
  moneybird: { isConfigured: boolean };
}

interface YodeckConfigStatus {
  configured: boolean;
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

async function syncYodeck() {
  const res = await fetch("/api/integrations/yodeck/sync", { method: "POST" });
  return res.json();
}

export default function Integrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testingYodeck, setTestingYodeck] = useState(false);
  const [testingMoneybird, setTestingMoneybird] = useState(false);
  const [syncingYodeck, setSyncingYodeck] = useState(false);
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

  const yodeckConfigured = yodeckConfig?.configured ?? status?.yodeck?.isConfigured ?? false;

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
    } catch (error) {
      toast({ title: "Fout", description: "Kan verbinding niet testen", variant: "destructive" });
    }
    setTestingMoneybird(false);
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
            <div className="flex gap-2">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Moneybird
              <Badge variant={status?.moneybird.isConfigured ? "default" : "secondary"}>
                {status?.moneybird.isConfigured ? (
                  <><Check className="h-3 w-3 mr-1" /> Geconfigureerd</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Niet Geconfigureerd</>
                )}
              </Badge>
            </CardTitle>
            <CardDescription>
              Verbind Moneybird om automatisch facturen en betalingen te synchroniseren.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {status?.moneybird.isConfigured ? (
                <p>Uw Moneybird API is geconfigureerd. U kunt de verbinding testen of facturen aanmaken.</p>
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
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleTestMoneybird}
                disabled={!status?.moneybird.isConfigured || testingMoneybird}
              >
                {testingMoneybird && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Verbinding Testen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
