import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, RefreshCw, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface IntegrationStatus {
  yodeck: { isConfigured: boolean };
  moneybird: { isConfigured: boolean };
}

async function fetchIntegrationStatus(): Promise<IntegrationStatus> {
  const res = await fetch("/api/integrations/status");
  return res.json();
}

async function testYodeck() {
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

  const { data: status, isLoading } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: fetchIntegrationStatus,
  });

  const handleTestYodeck = async () => {
    setTestingYodeck(true);
    try {
      const result = await testYodeck();
      toast({
        title: result.success ? "Yodeck Connected" : "Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to test connection", variant: "destructive" });
    }
    setTestingYodeck(false);
  };

  const handleTestMoneybird = async () => {
    setTestingMoneybird(true);
    try {
      const result = await testMoneybird();
      toast({
        title: result.success ? "Moneybird Connected" : "Connection Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to test connection", variant: "destructive" });
    }
    setTestingMoneybird(false);
  };

  const handleSyncYodeck = async () => {
    setSyncingYodeck(true);
    try {
      const result = await syncYodeck();
      if (result.success) {
        toast({ title: "Sync Complete", description: `Synced ${result.screens?.length || 0} screens from Yodeck` });
        queryClient.invalidateQueries({ queryKey: ["screens"] });
      } else {
        toast({ title: "Sync Failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to sync screens", variant: "destructive" });
    }
    setSyncingYodeck(false);
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Integrations</h1>
          <p className="text-muted-foreground">Connect external services for billing and display management.</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Yodeck
              <Badge variant={status?.yodeck.isConfigured ? "default" : "secondary"}>
                {status?.yodeck.isConfigured ? (
                  <><Check className="h-3 w-3 mr-1" /> Configured</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Not Configured</>
                )}
              </Badge>
            </CardTitle>
            <CardDescription>
              Connect your Yodeck account to sync screen status and monitor player health.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {status?.yodeck.isConfigured ? (
                <p>Your Yodeck API token is configured. You can test the connection or sync screen data.</p>
              ) : (
                <div className="space-y-2">
                  <p>To connect Yodeck, add these environment variables:</p>
                  <code className="block bg-muted p-3 rounded-md text-xs">
                    YODECK_API_TOKEN=your_api_token_here
                  </code>
                  <p className="text-xs">Get your API token from Yodeck: Settings → Advanced → API Tokens</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleTestYodeck}
                disabled={!status?.yodeck.isConfigured || testingYodeck}
              >
                {testingYodeck && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Test Connection
              </Button>
              <Button 
                onClick={handleSyncYodeck}
                disabled={!status?.yodeck.isConfigured || syncingYodeck}
              >
                {syncingYodeck ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync Screens
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
                  <><Check className="h-3 w-3 mr-1" /> Configured</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Not Configured</>
                )}
              </Badge>
            </CardTitle>
            <CardDescription>
              Connect Moneybird to automatically sync invoices and payments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {status?.moneybird.isConfigured ? (
                <p>Your Moneybird API is configured. You can test the connection or create invoices.</p>
              ) : (
                <div className="space-y-2">
                  <p>To connect Moneybird, add these environment variables:</p>
                  <code className="block bg-muted p-3 rounded-md text-xs">
                    MONEYBIRD_API_TOKEN=your_api_token_here<br />
                    MONEYBIRD_ADMINISTRATION_ID=your_admin_id
                  </code>
                  <p className="text-xs">Get your API token from: moneybird.com/user/applications/new</p>
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
                Test Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
