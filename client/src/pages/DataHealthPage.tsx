import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle, PlayCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface DataHealthResponse {
  ok: boolean;
  healthScore: number;
  screens: { total: number; synced: number; pending: number; failed: number; notLinked: number };
  locations: { total: number; synced: number; pending: number; failed: number; notLinked: number };
  advertisers: { total: number; synced: number; pending: number; failed: number; notLinked: number };
  outbox: { queued: number; processing: number; failed: number; completed: number };
  failedItems: {
    screens: Array<{ id: string; screenId: string; error?: string }>;
    locations: Array<{ id: string; name: string; error?: string }>;
    advertisers: Array<{ id: string; name: string; error?: string }>;
  };
}

interface OutboxStatusResponse {
  ok: boolean;
  queued: number;
  processing: number;
  failed: number;
  completed: number;
  worker: { running: boolean; lastRunAt?: string; processedInLastRun?: number };
}

function SyncStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "synced":
      return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Synced</Badge>;
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "failed":
      return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="outline">Niet gekoppeld</Badge>;
  }
}

function EntityCard({ title, stats, provider }: { 
  title: string; 
  stats: { total: number; synced: number; pending: number; failed: number; notLinked: number };
  provider: string;
}) {
  const percentage = stats.total > 0 ? Math.round((stats.synced / stats.total) * 100) : 0;
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          {title}
          <Badge variant="outline">{provider}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sync voortgang</span>
            <span className="font-medium">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>{stats.synced} synced</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span>{stats.pending} pending</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span>{stats.failed} failed</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              <span>{stats.notLinked} niet gekoppeld</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground border-t pt-2">
            Totaal: {stats.total} items
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataHealthPage() {
  const queryClient = useQueryClient();

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<DataHealthResponse>({
    queryKey: ["/api/sync/data-health"],
    refetchInterval: 30000,
  });

  const { data: outboxStatus, isLoading: outboxLoading } = useQuery<OutboxStatusResponse>({
    queryKey: ["/api/sync/outbox/status"],
    refetchInterval: 10000,
  });

  const runOutboxMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sync/outbox/run", { method: "POST" });
      if (!res.ok) throw new Error("Failed to run outbox");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Outbox verwerkt: ${data.processed || 0} jobs`);
      queryClient.invalidateQueries({ queryKey: ["/api/sync"] });
      refetchHealth();
    },
    onError: () => toast.error("Fout bij verwerken outbox"),
  });

  const retryFailedMutation = useMutation({
    mutationFn: async (provider?: string) => {
      const res = await fetch("/api/sync/outbox/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("Failed to retry");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`${data.retriedCount || 0} jobs opnieuw in wachtrij`);
      queryClient.invalidateQueries({ queryKey: ["/api/sync"] });
      refetchHealth();
    },
    onError: () => toast.error("Fout bij retry"),
  });

  if (healthLoading || outboxLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const health = healthData || {
    healthScore: 0,
    screens: { total: 0, synced: 0, pending: 0, failed: 0, notLinked: 0 },
    locations: { total: 0, synced: 0, pending: 0, failed: 0, notLinked: 0 },
    advertisers: { total: 0, synced: 0, pending: 0, failed: 0, notLinked: 0 },
    outbox: { queued: 0, processing: 0, failed: 0, completed: 0 },
    failedItems: { screens: [], locations: [], advertisers: [] },
  };

  const outbox = outboxStatus || { queued: 0, processing: 0, failed: 0, completed: 0, worker: { running: false } };
  const totalFailed = (health.failedItems?.screens?.length || 0) + 
                      (health.failedItems?.locations?.length || 0) + 
                      (health.failedItems?.advertisers?.length || 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Data Gezondheid</h1>
          <p className="text-muted-foreground">Overzicht van externe integratie synchronisatie</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetchHealth()}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Vernieuwen
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className={health.healthScore >= 80 ? "border-green-200" : health.healthScore >= 50 ? "border-yellow-200" : "border-red-200"}>
          <CardHeader className="pb-2">
            <CardDescription>Health Score</CardDescription>
            <CardTitle className="text-4xl" data-testid="health-score">{health.healthScore}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={health.healthScore} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              {health.healthScore >= 80 ? "Uitstekend" : health.healthScore >= 50 ? "Aandacht nodig" : "Kritiek"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Outbox Wachtrij</CardDescription>
            <CardTitle className="text-2xl">{outbox.queued}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={() => runOutboxMutation.mutate()}
                disabled={runOutboxMutation.isPending || outbox.queued === 0}
                data-testid="button-run-outbox"
              >
                <PlayCircle className="w-4 h-4 mr-1" />
                Nu verwerken
              </Button>
            </div>
            {outbox.worker?.running && (
              <p className="text-xs text-green-600 mt-2">Worker actief</p>
            )}
          </CardContent>
        </Card>

        <Card className={outbox.failed > 0 ? "border-red-200" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Gefaalde Jobs</CardDescription>
            <CardTitle className="text-2xl text-red-600">{outbox.failed}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => retryFailedMutation.mutate(undefined)}
              disabled={retryFailedMutation.isPending || outbox.failed === 0}
              data-testid="button-retry-failed"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Allemaal opnieuw
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Totaal Gefaalde Entities</CardDescription>
            <CardTitle className="text-2xl">{totalFailed}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Entities met sync fouten
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <EntityCard title="Schermen" stats={health.screens} provider="Yodeck" />
        <EntityCard title="Locaties" stats={health.locations} provider="Moneybird" />
        <EntityCard title="Adverteerders" stats={health.advertisers} provider="Moneybird" />
      </div>

      {totalFailed > 0 && (
        <Tabs defaultValue="screens" className="space-y-4">
          <TabsList>
            <TabsTrigger value="screens">
              Schermen ({health.failedItems?.screens?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="locations">
              Locaties ({health.failedItems?.locations?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="advertisers">
              Adverteerders ({health.failedItems?.advertisers?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="screens">
            <Card>
              <CardHeader>
                <CardTitle>Gefaalde Scherm Syncs</CardTitle>
              </CardHeader>
              <CardContent>
                {health.failedItems?.screens?.length === 0 ? (
                  <p className="text-muted-foreground">Geen gefaalde schermen</p>
                ) : (
                  <div className="space-y-2">
                    {health.failedItems?.screens?.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                        <span className="font-medium">{s.screenId}</span>
                        <span className="text-sm text-red-600 truncate max-w-md">{s.error || "Onbekende fout"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="locations">
            <Card>
              <CardHeader>
                <CardTitle>Gefaalde Locatie Syncs</CardTitle>
              </CardHeader>
              <CardContent>
                {health.failedItems?.locations?.length === 0 ? (
                  <p className="text-muted-foreground">Geen gefaalde locaties</p>
                ) : (
                  <div className="space-y-2">
                    {health.failedItems?.locations?.map((l) => (
                      <div key={l.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                        <span className="font-medium">{l.name}</span>
                        <span className="text-sm text-red-600 truncate max-w-md">{l.error || "Onbekende fout"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advertisers">
            <Card>
              <CardHeader>
                <CardTitle>Gefaalde Adverteerder Syncs</CardTitle>
              </CardHeader>
              <CardContent>
                {health.failedItems?.advertisers?.length === 0 ? (
                  <p className="text-muted-foreground">Geen gefaalde adverteerders</p>
                ) : (
                  <div className="space-y-2">
                    {health.failedItems?.advertisers?.map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-sm text-red-600 truncate max-w-md">{a.error || "Onbekende fout"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
