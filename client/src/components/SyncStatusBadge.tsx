import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, Link2Off } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SyncStatusBadgeProps {
  status: string | null | undefined;
  provider: "moneybird" | "yodeck";
  entityType: "screen" | "location" | "advertiser";
  entityId: string;
  error?: string | null;
  lastSyncAt?: string | Date | null;
  showResyncButton?: boolean;
}

export function SyncStatusBadge({ 
  status, 
  provider, 
  entityType, 
  entityId, 
  error,
  lastSyncAt,
  showResyncButton = true 
}: SyncStatusBadgeProps) {
  const queryClient = useQueryClient();

  const resyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sync/entity/${entityType}/${entityId}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("Failed to queue resync");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Resync in wachtrij gezet");
      queryClient.invalidateQueries({ queryKey: [entityType] });
    },
    onError: () => toast.error("Fout bij resync aanvraag"),
  });

  const providerLabel = provider === "moneybird" ? "Moneybird" : "Yodeck";
  const syncStatus = status || "not_linked";

  const getBadgeContent = () => {
    switch (syncStatus) {
      case "synced":
        return {
          icon: <CheckCircle2 className="w-3 h-3 mr-1" />,
          label: `${providerLabel} ✓`,
          className: "bg-green-100 text-green-800 border-green-200",
        };
      case "pending":
        return {
          icon: <Clock className="w-3 h-3 mr-1 animate-pulse" />,
          label: `${providerLabel} pending`,
          className: "bg-yellow-100 text-yellow-800 border-yellow-200",
        };
      case "failed":
        return {
          icon: <XCircle className="w-3 h-3 mr-1" />,
          label: `${providerLabel} fout`,
          className: "bg-red-100 text-red-800 border-red-200",
        };
      default:
        return {
          icon: <Link2Off className="w-3 h-3 mr-1" />,
          label: `${providerLabel} niet gekoppeld`,
          className: "bg-gray-100 text-gray-600 border-gray-200",
        };
    }
  };

  const { icon, label, className } = getBadgeContent();

  const formatLastSync = () => {
    if (!lastSyncAt) return null;
    const date = typeof lastSyncAt === "string" ? new Date(lastSyncAt) : lastSyncAt;
    return date.toLocaleString("nl-NL", { 
      day: "2-digit", 
      month: "short", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={className} data-testid={`sync-badge-${provider}`}>
              {icon}
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              <p><strong>Provider:</strong> {providerLabel}</p>
              <p><strong>Status:</strong> {syncStatus}</p>
              {lastSyncAt && <p><strong>Laatst gesynchroniseerd:</strong> {formatLastSync()}</p>}
              {error && <p className="text-red-600"><strong>Fout:</strong> {error}</p>}
            </div>
          </TooltipContent>
        </Tooltip>

        {showResyncButton && (syncStatus === "failed" || syncStatus === "not_linked") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => resyncMutation.mutate()}
            disabled={resyncMutation.isPending}
            data-testid={`resync-button-${provider}`}
          >
            <RefreshCw className={`w-3 h-3 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

export function SyncStatusIndicator({ 
  moneybirdStatus, 
  yodeckStatus,
  entityType,
  entityId,
  moneybirdError,
  yodeckError,
  moneybirdLastSync,
  yodeckLastSync,
}: {
  moneybirdStatus?: string | null;
  yodeckStatus?: string | null;
  entityType: "screen" | "location" | "advertiser";
  entityId: string;
  moneybirdError?: string | null;
  yodeckError?: string | null;
  moneybirdLastSync?: string | Date | null;
  yodeckLastSync?: string | Date | null;
}) {
  const showMoneybird = entityType !== "screen";
  const showYodeck = entityType === "screen";

  return (
    <div className="flex flex-wrap gap-2">
      {showMoneybird && (
        <SyncStatusBadge
          status={moneybirdStatus}
          provider="moneybird"
          entityType={entityType}
          entityId={entityId}
          error={moneybirdError}
          lastSyncAt={moneybirdLastSync}
        />
      )}
      {showYodeck && (
        <SyncStatusBadge
          status={yodeckStatus}
          provider="yodeck"
          entityType={entityType}
          entityId={entityId}
          error={yodeckError}
          lastSyncAt={yodeckLastSync}
        />
      )}
    </div>
  );
}
