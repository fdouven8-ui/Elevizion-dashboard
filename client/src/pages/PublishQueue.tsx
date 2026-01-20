import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Eye,
  Send,
  Loader2,
  Monitor,
  MapPin,
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

function translateRejectionReason(reason: string): string {
  const translations: Record<string, string> = {
    REGION_MISMATCH: "Buiten regio",
    CATEGORY_MISMATCH: "Categorie uitgesloten",
    NO_CAPACITY: "Geen capaciteit",
    OFFLINE: "Offline",
    NO_PLAYLIST: "Geen Yodeck-koppeling",
    STALE_SYNC: "Sync verouderd",
    NOT_ACTIVE: "Niet actief",
    COMPETITOR_CONFLICT: "Concurrent op locatie",
  };
  return translations[reason] || reason;
}

interface PlacementPlan {
  id: string;
  advertiserId: string;
  adAssetId: string;
  linkKey: string;
  status: string;
  packageType: string;
  requiredTargetCount: number;
  proposedTargets: any[];
  approvedTargets: any[];
  simulationReport: {
    selectedCount: number;
    rejectedCount: number;
    totalExpectedImpressions: number;
    rejectedReasons: { locationId: string; locationName: string; reason: string }[];
    simulatedAt: string;
    isFresh: boolean;
  } | null;
  publishReport: any | null;
  createdAt: string;
  simulatedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  failedAt?: string | null;
  advertiserName?: string;
  assetFileName?: string;
  retryCount?: number;
  lastAttemptAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorDetails?: any;
}

interface PlanDetailData extends PlacementPlan {
  advertiser: any;
  asset: any;
  targets: any[];
}

export default function PublishQueue() {
  const { toast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());

  const { data: plans = [], isLoading, refetch } = useQuery<PlacementPlan[]>({
    queryKey: ["/api/placement-plans"],
    queryFn: async () => {
      const res = await fetch("/api/placement-plans");
      if (!res.ok) throw new Error("Kon plannen niet laden");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: planDetail, isLoading: detailLoading } = useQuery<PlanDetailData>({
    queryKey: ["/api/placement-plans", selectedPlanId],
    queryFn: async () => {
      const res = await fetch(`/api/placement-plans/${selectedPlanId}`);
      if (!res.ok) throw new Error("Kon plan details niet laden");
      return res.json();
    },
    enabled: !!selectedPlanId,
  });

  const simulateMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/simulate`, { method: "POST" });
      if (!res.ok) throw new Error("Simulatie mislukt");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Simulatie voltooid" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
    },
    onError: (err: any) => {
      toast({ title: "Fout bij simulatie", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Goedkeuring mislukt");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan goedgekeurd" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
    },
    onError: (err: any) => {
      toast({ title: "Fout bij goedkeuring", description: err.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Publiceren mislukt");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const report = data.report;
      if (report?.failedCount > 0) {
        toast({ 
          title: `Gepubliceerd met ${report.failedCount} fout(en)`,
          description: `${report.successCount}/${report.totalTargets} locaties succesvol`,
          variant: "destructive"
        });
      } else {
        toast({ title: "Succesvol gepubliceerd naar Yodeck" });
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
    },
    onError: (err: any) => {
      toast({ title: "Fout bij publiceren", description: err.message, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/rollback`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Rollback mislukt");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan teruggedraaid" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
    },
    onError: (err: any) => {
      toast({ title: "Fout bij rollback", description: err.message, variant: "destructive" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // Check for 409 Conflict (already processing)
        if (res.status === 409 && data.alreadyProcessing) {
          throw new Error("ALREADY_PROCESSING:" + (data.message || "Publicatie is al bezig"));
        }
        throw new Error(data.message || "Retry mislukt");
      }
      return data;
    },
    onSuccess: (data) => {
      // Check if publish actually succeeded (endpoint now returns 200 for both success and failure)
      if (data.success) {
        toast({ title: "Plan succesvol gepubliceerd" });
      } else {
        toast({ 
          title: "Publicatie mislukt", 
          description: data.message || "Zie details in de wachtrij",
          variant: "destructive"
        });
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
    },
    onError: (err: any) => {
      // Handle "already processing" as a warning, not an error
      if (err.message?.startsWith("ALREADY_PROCESSING:")) {
        toast({ 
          title: "Al bezig met publiceren", 
          description: "Ververs de pagina over 10 seconden",
        });
        // Auto-refresh after 10 seconds
        setTimeout(() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
        }, 10000);
      } else {
        toast({ title: "Retry mislukt", description: err.message, variant: "destructive" });
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Annuleren mislukt");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan geannuleerd" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans", selectedPlanId] });
    },
    onError: (err: any) => {
      toast({ title: "Annuleren mislukt", description: err.message, variant: "destructive" });
    },
  });

  const bulkSimulateMutation = useMutation({
    mutationFn: async (planIds: string[]) => {
      const res = await fetch("/api/placement-plans/bulk-simulate", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planIds }),
      });
      if (!res.ok) throw new Error("Bulk simulatie mislukt");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.successCount}/${data.total} gesimuleerd` });
      refetch();
      setSelectedPlanIds(new Set());
    },
    onError: (err: any) => {
      toast({ title: "Fout bij bulk simulatie", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (planIds: string[]) => {
      const res = await fetch("/api/placement-plans/bulk-approve", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planIds }),
      });
      if (!res.ok) throw new Error("Bulk goedkeuring mislukt");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.successCount}/${data.total} goedgekeurd` });
      refetch();
      setSelectedPlanIds(new Set());
    },
    onError: (err: any) => {
      toast({ title: "Fout bij bulk goedkeuring", description: err.message, variant: "destructive" });
    },
  });

  const bulkPublishMutation = useMutation({
    mutationFn: async (planIds: string[]) => {
      const res = await fetch("/api/placement-plans/bulk-publish", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planIds }),
      });
      if (!res.ok) throw new Error("Bulk publiceren mislukt");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: `${data.successCount}/${data.total} gepubliceerd`,
        variant: data.failCount > 0 ? "destructive" : "default"
      });
      refetch();
      setSelectedPlanIds(new Set());
    },
    onError: (err: any) => {
      toast({ title: "Fout bij bulk publiceren", description: err.message, variant: "destructive" });
    },
  });

  const togglePlanSelection = (planId: string) => {
    const newSet = new Set(selectedPlanIds);
    if (newSet.has(planId)) {
      newSet.delete(planId);
    } else {
      newSet.add(planId);
    }
    setSelectedPlanIds(newSet);
  };

  const selectAllPlans = () => {
    if (selectedPlanIds.size === plans.length) {
      setSelectedPlanIds(new Set());
    } else {
      setSelectedPlanIds(new Set(plans.map(p => p.id)));
    }
  };

  const getSelectedByStatus = (status: string) => 
    plans.filter(p => selectedPlanIds.has(p.id) && p.status === status);

  const getStatusBadge = (status: string, plan?: PlacementPlan) => {
    switch (status) {
      case "PROPOSED":
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Voorstel</Badge>;
      case "SIMULATED_OK":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Simulatie OK</Badge>;
      case "SIMULATED_FAIL":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Simulatie Gefaald</Badge>;
      case "APPROVED":
        return <Badge className="bg-blue-100 text-blue-800"><CheckCircle2 className="h-3 w-3 mr-1" />Goedgekeurd</Badge>;
      case "PUBLISHING":
        return <Badge className="bg-amber-100 text-amber-800"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Bezig...</Badge>;
      case "PUBLISHED":
        return <Badge className="bg-green-100 text-green-800"><Send className="h-3 w-3 mr-1" />Gepubliceerd</Badge>;
      case "FAILED":
        const retryCount = plan?.retryCount || 0;
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-red-100 text-red-800" title={plan?.lastErrorMessage}>
              <XCircle className="h-3 w-3 mr-1" />
              Mislukt{retryCount > 0 ? ` (${retryCount}x)` : ""}
            </Badge>
            {plan?.lastErrorCode && (
              <span className="text-xs text-muted-foreground">{plan.lastErrorCode}</span>
            )}
          </div>
        );
      case "CANCELED":
        return <Badge className="bg-gray-100 text-gray-600"><XCircle className="h-3 w-3 mr-1" />Geannuleerd</Badge>;
      case "ROLLED_BACK":
        return <Badge className="bg-orange-100 text-orange-800"><AlertTriangle className="h-3 w-3 mr-1" />Teruggedraaid</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCapacityIndicator = (before: number, after: number, max: number) => {
    const percentage = (after / max) * 100;
    if (percentage < 70) return <Badge className="bg-green-100 text-green-800">OK</Badge>;
    if (percentage < 90) return <Badge className="bg-amber-100 text-amber-800">Bijna vol</Badge>;
    return <Badge className="bg-red-100 text-red-800">Vol</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Publicatie Wachtrij</h1>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Publicatie Wachtrij</h1>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-queue">
          <RefreshCw className="h-4 w-4 mr-2" />
          Vernieuwen
        </Button>
      </div>

      {selectedPlanIds.size > 0 && (
        <Card className="bg-muted/50 border-primary/20">
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedPlanIds.size} geselecteerd</Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPlanIds(new Set())}>
                Deselecteer alles
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {getSelectedByStatus("PROPOSED").length > 0 && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => bulkSimulateMutation.mutate(getSelectedByStatus("PROPOSED").map(p => p.id))}
                  disabled={bulkSimulateMutation.isPending}
                  data-testid="button-bulk-simulate"
                >
                  {bulkSimulateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Simuleer ({getSelectedByStatus("PROPOSED").length})
                </Button>
              )}
              {getSelectedByStatus("SIMULATED_OK").length > 0 && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => bulkApproveMutation.mutate(getSelectedByStatus("SIMULATED_OK").map(p => p.id))}
                  disabled={bulkApproveMutation.isPending}
                  data-testid="button-bulk-approve"
                >
                  {bulkApproveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Keur goed ({getSelectedByStatus("SIMULATED_OK").length})
                </Button>
              )}
              {getSelectedByStatus("APPROVED").length > 0 && (
                <Button 
                  size="sm" 
                  onClick={() => bulkPublishMutation.mutate(getSelectedByStatus("APPROVED").map(p => p.id))}
                  disabled={bulkPublishMutation.isPending}
                  data-testid="button-bulk-publish"
                >
                  {bulkPublishMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Publiceer ({getSelectedByStatus("APPROVED").length})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Geen plannen in wachtrij</h3>
            <p className="text-muted-foreground mt-2">
              Wanneer adverteerders video's uploaden, verschijnen hier automatisch publicatie voorstellen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Publicatie Plannen ({plans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox 
                      checked={selectedPlanIds.size === plans.length && plans.length > 0}
                      onCheckedChange={selectAllPlans}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Adverteerder</TableHead>
                  <TableHead>Pakket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Locaties</TableHead>
                  <TableHead>Impressies</TableHead>
                  <TableHead>Aangemaakt</TableHead>
                  <TableHead>Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedPlanIds.has(plan.id)}
                        onCheckedChange={() => togglePlanSelection(plan.id)}
                        data-testid={`checkbox-plan-${plan.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{plan.advertiserName || plan.linkKey}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {plan.assetFileName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{plan.packageType} ({plan.requiredTargetCount})</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(plan.status, plan)}</TableCell>
                    <TableCell>
                      {plan.simulationReport ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {plan.simulationReport.selectedCount}/{plan.requiredTargetCount}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {plan.simulationReport?.totalExpectedImpressions 
                        ? `${plan.simulationReport.totalExpectedImpressions.toLocaleString()}/week`
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      {format(new Date(plan.createdAt), "d MMM HH:mm", { locale: nl })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPlanId(plan.id)}
                          data-testid={`button-view-${plan.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(plan.status === "PROPOSED" || plan.status === "SIMULATED_FAIL") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => simulateMutation.mutate(plan.id)}
                            disabled={simulateMutation.isPending}
                            data-testid={`button-simulate-${plan.id}`}
                          >
                            <RefreshCw className={`h-4 w-4 ${simulateMutation.isPending ? "animate-spin" : ""}`} />
                          </Button>
                        )}
                        {plan.status === "SIMULATED_OK" && (
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(plan.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-${plan.id}`}
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Akkoord
                              </>
                            )}
                          </Button>
                        )}
                        {plan.status === "APPROVED" && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => publishMutation.mutate(plan.id)}
                            disabled={publishMutation.isPending}
                            data-testid={`button-publish-${plan.id}`}
                          >
                            {publishMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-4 w-4 mr-1" />
                                Publiceer
                              </>
                            )}
                          </Button>
                        )}
                        {plan.status === "PUBLISHING" && (
                          <Button size="sm" variant="outline" disabled>
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </Button>
                        )}
                        {plan.status === "FAILED" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryMutation.mutate(plan.id)}
                              disabled={retryMutation.isPending}
                              data-testid={`button-retry-${plan.id}`}
                              title={plan.lastErrorMessage || "Opnieuw proberen"}
                            >
                              {retryMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelMutation.mutate(plan.id)}
                              disabled={cancelMutation.isPending}
                              data-testid={`button-cancel-${plan.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {plan.status === "PUBLISHED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rollbackMutation.mutate(plan.id)}
                            disabled={rollbackMutation.isPending}
                            data-testid={`button-rollback-${plan.id}`}
                          >
                            {rollbackMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <AlertTriangle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedPlanId} onOpenChange={() => setSelectedPlanId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plan Details</DialogTitle>
          </DialogHeader>
          
          {detailLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : planDetail ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Adverteerder</p>
                  <p className="font-medium">{planDetail.advertiser?.companyName || planDetail.linkKey}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(planDetail.status, planDetail)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pakket</p>
                  <p className="font-medium">{planDetail.packageType} ({planDetail.requiredTargetCount} locaties)</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Video</p>
                  <p className="font-medium truncate">{planDetail.asset?.originalFileName || "-"}</p>
                </div>
              </div>

              {planDetail.asset && (
                <div className="border rounded-lg overflow-hidden">
                  <video
                    src={`/api/ad-assets/${planDetail.asset.id}/stream`}
                    className="w-full aspect-video bg-black"
                    controls
                    data-testid="video-preview-modal"
                  />
                </div>
              )}

              {planDetail.simulationReport && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Simulatie Rapport</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-700">
                          {planDetail.simulationReport.selectedCount}
                        </p>
                        <p className="text-sm text-green-600">Geselecteerd</p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-2xl font-bold text-red-700">
                          {planDetail.simulationReport.rejectedCount}
                        </p>
                        <p className="text-sm text-red-600">Afgewezen</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-700">
                          {planDetail.simulationReport.totalExpectedImpressions.toLocaleString()}
                        </p>
                        <p className="text-sm text-blue-600">Impressies/week</p>
                      </div>
                    </div>

                    {planDetail.proposedTargets && planDetail.proposedTargets.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Geselecteerde Locaties</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Locatie</TableHead>
                              <TableHead>Impressies</TableHead>
                              <TableHead>Capacity</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {planDetail.proposedTargets.map((target: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell>{target.locationName}</TableCell>
                                <TableCell>{target.expectedImpressionsPerWeek}/week</TableCell>
                                <TableCell>
                                  {target.capacityBefore}s → {target.capacityAfter}s
                                </TableCell>
                                <TableCell>
                                  {getCapacityIndicator(target.capacityBefore, target.capacityAfter, 120)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {planDetail.simulationReport.rejectedReasons && planDetail.simulationReport.rejectedReasons.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Afgewezen Locaties</h4>
                        <div className="max-h-40 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Locatie</TableHead>
                                <TableHead>Reden</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {planDetail.simulationReport.rejectedReasons.slice(0, 10).map((item: any, idx: number) => (
                                <TableRow key={idx}>
                                  <TableCell>{item.locationName}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-red-600">
                                      {translateRejectionReason(item.reason)}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {planDetail.simulationReport.rejectedReasons.length > 10 && (
                            <p className="text-sm text-muted-foreground mt-2">
                              +{planDetail.simulationReport.rejectedReasons.length - 10} meer...
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {planDetail.status === "FAILED" && (
                <Card className="border-red-200 bg-red-50">
                  <CardHeader>
                    <CardTitle className="text-base text-red-800 flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      Foutdetails
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Foutcode</p>
                        <p className="font-mono font-medium text-red-700">{planDetail.lastErrorCode || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Retry pogingen</p>
                        <p className="font-medium">{planDetail.retryCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mislukt op</p>
                        <p className="font-medium">
                          {planDetail.failedAt 
                            ? format(new Date(planDetail.failedAt), "d MMM yyyy HH:mm", { locale: nl })
                            : "-"
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Laatste poging</p>
                        <p className="font-medium">
                          {planDetail.lastAttemptAt 
                            ? format(new Date(planDetail.lastAttemptAt), "d MMM yyyy HH:mm", { locale: nl })
                            : "-"
                          }
                        </p>
                      </div>
                    </div>
                    
                    {planDetail.lastErrorMessage && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Foutmelding</p>
                        <p className="p-2 bg-white rounded border text-sm">{planDetail.lastErrorMessage}</p>
                      </div>
                    )}
                    
                    {(planDetail.lastErrorDetails || planDetail.publishReport) && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                          <ChevronDown className="h-4 w-4" />
                          Technische details
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <pre className="p-2 bg-white rounded border text-xs overflow-auto max-h-48">
                            {JSON.stringify(planDetail.lastErrorDetails || planDetail.publishReport, null, 2)}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                {planDetail.status === "FAILED" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      retryMutation.mutate(planDetail.id);
                      setSelectedPlanId(null);
                    }}
                    disabled={retryMutation.isPending}
                    data-testid={`button-retry-modal-${planDetail.id}`}
                  >
                    {retryMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Opnieuw proberen
                  </Button>
                )}
                {planDetail.status === "SIMULATED_OK" && (
                  <Button
                    onClick={() => {
                      approveMutation.mutate(planDetail.id);
                      setSelectedPlanId(null);
                    }}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Goedkeuren
                  </Button>
                )}
                {(planDetail.status === "PROPOSED" || planDetail.status === "SIMULATED_FAIL") && (
                  <Button
                    variant="outline"
                    onClick={() => simulateMutation.mutate(planDetail.id)}
                    disabled={simulateMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${simulateMutation.isPending ? "animate-spin" : ""}`} />
                    Opnieuw Simuleren
                  </Button>
                )}
                {planDetail.status === "APPROVED" && (
                  <Button
                    onClick={() => {
                      publishMutation.mutate(planDetail.id);
                      setSelectedPlanId(null);
                    }}
                    disabled={publishMutation.isPending}
                  >
                    {publishMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Publiceren naar Yodeck
                  </Button>
                )}
                {planDetail.status === "PUBLISHED" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      rollbackMutation.mutate(planDetail.id);
                      setSelectedPlanId(null);
                    }}
                    disabled={rollbackMutation.isPending}
                  >
                    {rollbackMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 mr-2" />
                    )}
                    Terugdraaien
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
