import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Play, Eye, Clock, Monitor, MapPin, Package, RefreshCw, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Link } from "wouter";

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

  const { data: queue = [], isLoading } = useQuery<ReviewQueueItem[]>({
    queryKey: ["/api/admin/video-review"],
  });

  const approveMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(`/api/admin/video-review/${assetId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Fout bij goedkeuren");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Goedgekeurd", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/video-review"] });
      setPreviewAsset(null);
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
    approveMutation.mutate(item.asset.id);
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
              disabled={approveMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Goedkeuren
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
    </div>
  );
}
