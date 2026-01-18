import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Play, Eye, Clock, Monitor, MapPin, Package, RefreshCw, AlertTriangle, Send, Rocket, Tv, Loader2, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Link } from "wouter";

interface ApprovalResult {
  success: boolean;
  message: string;
  placementPlanId?: string;
}

interface ProposalMatch {
  locationId: string;
  locationName: string;
  city: string | null;
  playlistId: string | null;
  playlistName: string | null;
  score: number;
  estimatedImpressionsPerMonth: number;
  reasons: string[];
}

interface ProposalResponse {
  success: boolean;
  proposal: {
    requestedScreens: number;
    matches: ProposalMatch[];
    summary: {
      totalMatches: number;
      estimatedImpressionsPerMonth: number;
      videoDurationSeconds: number;
      packageType: string;
      targetRegionCodes: string[];
      matchedCities: string[];
    };
    noCapacityReason: string | null;
    nextSteps: string[] | null;
  };
}

interface ReviewQueueItem {
  asset: {
    id: string;
    advertiserId: string;
    storedFilename: string | null;
    originalFileName: string;
    durationSeconds: string | null;
    width: number | null;
    height: number | null;
    codec: string | null;
    pixelFormat: string | null;
    validationStatus: string;
    uploadedAt: string;
    sizeBytes: number;
    conversionStatus: string | null;
    conversionError: string | null;
  };
  advertiser: {
    id: string;
    companyName: string;
    packageType: string | null;
    targetRegionCodes: string[] | null;
    linkKey: string | null;
  };
}

const REJECTION_REASONS: Record<string, string> = {
  quality: "Onleesbare tekst / slechte kwaliteit",
  duration: "Verkeerde duur",
  content: "Niet toegestane inhoud",
  other: "Anders",
};

export default function VideoReview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [previewAsset, setPreviewAsset] = useState<ReviewQueueItem | null>(null);
  const [rejectAsset, setRejectAsset] = useState<ReviewQueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectDetails, setRejectDetails] = useState<string>("");
  const [approvedPlan, setApprovedPlan] = useState<{ planId: string; companyName: string } | null>(null);
  const [proposal, setProposal] = useState<ProposalResponse | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Fetch proposal when preview modal opens
  useEffect(() => {
    if (previewAsset) {
      setProposalLoading(true);
      setProposal(null);
      setProposalError(null);
      fetch(`/api/admin/assets/${previewAsset.asset.id}/proposal`)
        .then(res => {
          if (!res.ok) throw new Error("Kon voorstel niet ophalen");
          return res.json();
        })
        .then(data => {
          setProposal(data);
          setProposalLoading(false);
        })
        .catch((err) => {
          setProposalError(err.message || "Onbekende fout");
          setProposalLoading(false);
        });
    } else {
      setProposal(null);
      setProposalError(null);
    }
  }, [previewAsset]);

  // Determine if approval is allowed
  // Block only when proposal loaded successfully but has 0 matches
  // Allow approval when proposal errors (transient issue) or when matches exist
  const hasMatches = proposal?.proposal?.matches && proposal.proposal.matches.length > 0;
  const canApprove = !proposalLoading && (proposalError || hasMatches);

  const { data: queue = [], isLoading } = useQuery<ReviewQueueItem[]>({
    queryKey: ["/api/admin/video-review"],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ assetId, companyName }: { assetId: string; companyName: string }): Promise<ApprovalResult & { companyName: string }> => {
      const res = await fetch(`/api/admin/video-review/${assetId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Fout bij goedkeuren");
      }
      const result = await res.json();
      return { ...result, companyName };
    },
    onSuccess: (data) => {
      toast({ title: "Goedgekeurd", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/video-review"] });
      setPreviewAsset(null);
      if (data.placementPlanId) {
        setApprovedPlan({ planId: data.placementPlanId, companyName: data.companyName });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/placement-plans/${planId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Fout bij goedkeuren plan");
      }
      const approveRes = await fetch(`/api/placement-plans/${planId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!approveRes.ok) {
        const data = await approveRes.json();
        throw new Error(data.message || "Fout bij publiceren");
      }
      return approveRes.json();
    },
    onSuccess: () => {
      toast({ title: "Gepubliceerd", description: "Advertentie is live op de schermen" });
      setApprovedPlan(null);
      queryClient.invalidateQueries({ queryKey: ["/api/placement-plans"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ assetId, reason, details }: { assetId: string; reason: string; details: string }) => {
      const res = await fetch(`/api/admin/video-review/${assetId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Fout bij afkeuren");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Afgekeurd", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/video-review"] });
      setRejectAsset(null);
      setRejectReason("");
      setRejectDetails("");
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleApprove = (item: ReviewQueueItem) => {
    approveMutation.mutate({ assetId: item.asset.id, companyName: item.advertiser.companyName });
  };

  const handlePublish = () => {
    if (!approvedPlan) return;
    publishMutation.mutate(approvedPlan.planId);
  };

  const handleReject = () => {
    if (!rejectAsset || !rejectReason) return;
    rejectMutation.mutate({
      assetId: rejectAsset.asset.id,
      reason: rejectReason,
      details: rejectDetails,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Video Review</h1>
          <p className="text-muted-foreground">Beoordeel geüploade advertentievideo's</p>
        </div>
        <Badge variant={queue.length > 0 ? "destructive" : "secondary"} className="text-lg px-3 py-1">
          {queue.length} wachtend
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Laden...</div>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <p className="text-lg font-medium">Geen video's te beoordelen</p>
            <p className="text-muted-foreground">Alle geüploade video's zijn beoordeeld</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {queue.map((item) => (
            <Card key={item.asset.id} data-testid={`review-item-${item.asset.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-32 h-20 bg-gray-900 rounded flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors"
                       onClick={() => setPreviewAsset(item)}
                       data-testid={`preview-btn-${item.asset.id}`}>
                    <Play className="h-8 w-8 text-white" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/advertisers/${item.advertiser.id}`} className="font-semibold hover:underline">
                        {item.advertiser.companyName}
                      </Link>
                      <Badge variant="outline">{item.advertiser.packageType || "CUSTOM"}</Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDistanceToNow(new Date(item.asset.uploadedAt), { addSuffix: true, locale: nl })}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {item.advertiser.targetRegionCodes?.join(", ") || "Alle regio's"}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">
                        {item.asset.durationSeconds ? `${parseFloat(item.asset.durationSeconds).toFixed(1)}s` : "?s"}
                      </Badge>
                      <Badge variant="secondary">
                        {item.asset.width}x{item.asset.height}
                      </Badge>
                      <Badge variant="secondary">
                        {item.asset.codec || "?"}{item.asset.pixelFormat ? ` (${item.asset.pixelFormat})` : ""}
                      </Badge>
                      <Badge variant="secondary">
                        {formatBytes(item.asset.sizeBytes)}
                      </Badge>
                      <Badge variant={item.asset.validationStatus === "valid" ? "default" : "destructive"}>
                        {item.asset.validationStatus === "valid" ? "Technisch OK" : "Technische fout"}
                      </Badge>
                      {item.asset.conversionStatus === "PENDING" && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600" data-testid={`conversion-status-pending-${item.asset.id}`}>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Wacht op conversie
                        </Badge>
                      )}
                      {item.asset.conversionStatus === "CONVERTING" && (
                        <Badge variant="outline" className="text-blue-600 border-blue-600" data-testid={`conversion-status-converting-${item.asset.id}`}>
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Converteren...
                        </Badge>
                      )}
                      {item.asset.conversionStatus === "COMPLETED" && (
                        <Badge variant="outline" className="text-green-600 border-green-600" data-testid={`conversion-status-completed-${item.asset.id}`}>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Geconverteerd
                        </Badge>
                      )}
                      {item.asset.conversionStatus === "FAILED" && (
                        <Badge variant="destructive" data-testid={`conversion-status-failed-${item.asset.id}`}>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Conversie mislukt
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewAsset(item)}
                      data-testid={`view-btn-${item.asset.id}`}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Bekijk
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprove(item)}
                      disabled={approveMutation.isPending}
                      data-testid={`approve-btn-${item.asset.id}`}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Goedkeuren
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejectAsset(item)}
                      data-testid={`reject-btn-${item.asset.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Afkeuren
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewAsset?.advertiser.companyName}</DialogTitle>
            <DialogDescription>
              {previewAsset?.asset.storedFilename || previewAsset?.asset.originalFileName}
            </DialogDescription>
          </DialogHeader>
          
          {previewAsset && (
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded overflow-hidden">
                <video
                  controls
                  autoPlay
                  className="w-full h-full"
                  src={`/api/ad-assets/${previewAsset.asset.id}/stream`}
                  data-testid="video-preview"
                >
                  Je browser ondersteunt geen video playback
                </video>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Duur</Label>
                  <p>{previewAsset.asset.durationSeconds ? `${parseFloat(previewAsset.asset.durationSeconds).toFixed(1)}s` : "Onbekend"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Resolutie</Label>
                  <p>{previewAsset.asset.width}x{previewAsset.asset.height}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Codec / Pixel Format</Label>
                  <p>{previewAsset.asset.codec || "Onbekend"} / {previewAsset.asset.pixelFormat || "Onbekend"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Bestandsgrootte</Label>
                  <p>{formatBytes(previewAsset.asset.sizeBytes)}</p>
                </div>
              </div>
              
              {previewAsset.asset.conversionStatus && previewAsset.asset.conversionStatus !== "NONE" && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted" data-testid="conversion-status-info">
                  {previewAsset.asset.conversionStatus === "PENDING" && (
                    <>
                      <RefreshCw className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm" data-testid="status-text-pending">Wacht op conversie naar H.264...</span>
                    </>
                  )}
                  {previewAsset.asset.conversionStatus === "CONVERTING" && (
                    <>
                      <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                      <span className="text-sm" data-testid="status-text-converting">Video wordt geconverteerd naar H.264...</span>
                    </>
                  )}
                  {previewAsset.asset.conversionStatus === "COMPLETED" && (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm" data-testid="status-text-completed">Video is geconverteerd naar H.264</span>
                    </>
                  )}
                  {previewAsset.asset.conversionStatus === "FAILED" && (
                    <>
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-destructive" data-testid="status-text-failed">Conversie mislukt: {previewAsset.asset.conversionError || "Onbekende fout"}</span>
                    </>
                  )}
                </div>
              )}

              {/* Proposal Section - Shows screens where ad will be placed */}
              <div className="border rounded-lg p-4 space-y-3" data-testid="proposal-section">
                <div className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Voorgestelde schermen</span>
                  {proposalLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {/* Summary Card - Always visible with tooltips */}
                <TooltipProvider>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 border" data-testid="proposal-summary">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="text-xs text-muted-foreground">Voorstel</div>
                          <div className="font-medium">
                            {proposalLoading ? (
                              <span className="text-muted-foreground">...</span>
                            ) : proposalError ? (
                              <span className="text-red-600">Fout</span>
                            ) : (
                              <span className={proposal?.proposal?.matches?.length === 0 ? "text-amber-600" : "text-green-600"}>
                                {proposal?.proposal?.summary?.totalMatches || 0} van {proposal?.proposal?.requestedScreens || 0} schermen
                              </span>
                            )}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Aantal schermen dat bij adverteerder past, gebaseerd op pakket ({proposal?.proposal?.summary?.packageType || "onbekend"}) en capaciteit</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="text-xs text-muted-foreground">Regio</div>
                          <div className="font-medium text-sm truncate">
                            {proposalLoading ? "..." : 
                              proposal?.proposal?.summary?.matchedCities?.length 
                                ? proposal.proposal.summary.matchedCities.slice(0, 3).join(", ") + (proposal.proposal.summary.matchedCities.length > 3 ? ` +${proposal.proposal.summary.matchedCities.length - 3}` : "")
                                : proposal?.proposal?.summary?.targetRegionCodes?.slice(0, 2).join(", ") || "-"
                            }
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Steden: {proposal?.proposal?.summary?.matchedCities?.join(", ") || "geen"}</p>
                        {proposal?.proposal?.summary?.targetRegionCodes?.length ? (
                          <p className="text-muted-foreground text-xs">Regio's: {proposal.proposal.summary.targetRegionCodes.join(", ")}</p>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="text-xs text-muted-foreground">Views/maand</div>
                          <div className="font-medium">
                            {proposalLoading ? "..." : 
                              proposal?.proposal?.summary?.estimatedImpressionsPerMonth 
                                ? `~${Math.round(proposal.proposal.summary.estimatedImpressionsPerMonth).toLocaleString()}`
                                : "-"
                            }
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Geschatte views per maand, gebaseerd op schermlocatie-statistieken</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="text-xs text-muted-foreground">Video duur</div>
                          <div className="font-medium">
                            {proposalLoading ? "..." : 
                              proposal?.proposal?.summary?.videoDurationSeconds 
                                ? `${proposal.proposal.summary.videoDurationSeconds.toFixed(1)}s`
                                : previewAsset.asset.durationSeconds 
                                  ? `${parseFloat(previewAsset.asset.durationSeconds).toFixed(1)}s`
                                  : "-"
                            }
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Werkelijke duur uit ffprobe (max 15 seconden toegestaan)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                {/* Status indicator row */}
                <div className="flex items-center gap-2 text-sm">
                  {proposalLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">Voorstel wordt berekend...</span>
                    </>
                  ) : proposalError ? (
                    <>
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                      <span className="text-red-600">Fout bij ophalen (goedkeuren kan alsnog)</span>
                    </>
                  ) : proposal?.proposal?.matches?.length === 0 ? (
                    <>
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                      <span className="text-amber-600">Geen matches</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span className="text-green-600">Voorstel ok</span>
                    </>
                  )}
                </div>
                
                {proposalLoading ? (
                  null
                ) : proposalError ? (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                      <div>
                        <p className="text-sm text-red-800">{proposalError}</p>
                        <p className="text-xs text-red-600 mt-1">Je kunt de video nog steeds goedkeuren. Het voorstel wordt dan opnieuw berekend.</p>
                      </div>
                    </div>
                  </div>
                ) : proposal?.proposal?.noCapacityReason ? (
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">{proposal.proposal.noCapacityReason}</p>
                          {proposal.proposal.nextSteps && proposal.proposal.nextSteps.length > 0 && (
                            <ul className="mt-2 text-xs text-amber-700 list-disc list-inside">
                              {proposal.proposal.nextSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-2 text-xs text-amber-700 italic">
                            Goedkeuren is niet mogelijk zonder beschikbare schermen.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : proposal?.proposal?.matches && proposal.proposal.matches.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      {proposal.proposal.matches.length} van {proposal.proposal.requestedScreens} scherm(en) gevonden
                    </div>
                    <div className="grid gap-2 max-h-40 overflow-y-auto">
                      {proposal.proposal.matches.map((match) => (
                        <div key={match.locationId} className="p-2 rounded bg-muted/50 text-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4 text-muted-foreground" />
                              <span>{match.locationName}</span>
                              {match.city && <Badge variant="outline" className="text-xs">{match.city}</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              ~{Math.round(match.estimatedImpressionsPerMonth).toLocaleString()} views/mnd
                            </span>
                          </div>
                          {match.playlistName && (
                            <div className="text-xs text-muted-foreground mt-1 pl-6">
                              Playlist: {match.playlistName}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground pt-1">
                      Totaal: ~{Math.round(proposal.proposal.summary.estimatedImpressionsPerMonth).toLocaleString()} views/maand
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Geen schermen gevonden</div>
                )}
              </div>

              {/* Info box explaining the workflow */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-800">
                  Bij "Goedkeuren" wordt de video inhoudelijk goedgekeurd en het voorstel vastgezet. 
                  De advertentie gaat pas live na "Akkoord & publiceer".
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewAsset(null)}>
              Sluiten
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRejectAsset(previewAsset);
                setPreviewAsset(null);
              }}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Afkeuren
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => previewAsset && handleApprove(previewAsset)}
              disabled={approveMutation.isPending || !canApprove}
              title={
                proposalLoading ? "Schermen worden geladen..." :
                !canApprove ? "Kan niet goedkeuren: geen schermen beschikbaar" : 
                proposalError ? "Goedkeuren ondanks fout bij ophalen voorstel" :
                "Keur video goed en zet voorstel klaar"
              }
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {approveMutation.isPending ? "Goedkeuren..." : "Goedkeuren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectAsset} onOpenChange={() => setRejectAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Video afkeuren</DialogTitle>
            <DialogDescription>
              Video van {rejectAsset?.advertiser.companyName} afkeuren. De adverteerder ontvangt een melding.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reden *</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger data-testid="reject-reason-select">
                  <SelectValue placeholder="Selecteer een reden" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REJECTION_REASONS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Toelichting (optioneel)</Label>
              <Textarea
                value={rejectDetails}
                onChange={(e) => setRejectDetails(e.target.value)}
                placeholder="Voeg een toelichting toe voor de adverteerder..."
                rows={3}
                data-testid="reject-details-input"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectAsset(null)}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason || rejectMutation.isPending}
              data-testid="confirm-reject-btn"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Afkeuren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approvedPlan} onOpenChange={() => setApprovedPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-green-600" />
              Plaatsingsvoorstel aangemaakt
            </DialogTitle>
            <DialogDescription>
              Video van {approvedPlan?.companyName} is goedgekeurd. Er is automatisch een plaatsingsvoorstel aangemaakt.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-800">
                De adverteerder ontvangt een e-mail dat de video is goedgekeurd. 
                Klik op "Akkoord & publiceer" om de advertentie direct live te zetten.
              </p>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApprovedPlan(null)}>
              Later
            </Button>
            <Link href={`/publish-queue`}>
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-1" />
                Bekijk voorstel
              </Button>
            </Link>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              data-testid="publish-btn"
            >
              {publishMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Publiceren...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" />
                  Akkoord & publiceer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
