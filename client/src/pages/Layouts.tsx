import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Layout, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  ExternalLink,
  Loader2,
  Monitor,
  List
} from "lucide-react";

interface LocationLayout {
  id: string;
  name: string;
  screenId: string | null;
  layoutMode: string;
  layoutId: string | null;
  baselinePlaylistId: string | null;
  adsPlaylistId: string | null;
  status: "complete" | "partial" | "none";
}

interface LayoutsResponse {
  locations: LocationLayout[];
  layoutsSupported: boolean;
}

interface ApplyResult {
  ok: boolean;
  mode: string;
  layoutId?: string;
  baselinePlaylistId?: string;
  adsPlaylistId?: string;
  error?: string;
  logs: string[];
}

const statusBadge = (status: string) => {
  switch (status) {
    case "complete":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Volledig</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Gedeeltelijk</Badge>;
    case "none":
    default:
      return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Niet geconfigureerd</Badge>;
  }
};

const modeBadge = (mode: string) => {
  switch (mode) {
    case "LAYOUT":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Layout Mode</Badge>;
    case "FALLBACK_SCHEDULE":
    default:
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Fallback Schedule</Badge>;
  }
};

export default function Layouts() {
  const queryClient = useQueryClient();
  const [applyingLocation, setApplyingLocation] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<LayoutsResponse>({
    queryKey: ["admin-layouts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/layouts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch layouts");
      return res.json();
    },
  });

  const { data: probeData, refetch: refetchProbe, isFetching: isProbing } = useQuery({
    queryKey: ["layouts-probe"],
    queryFn: async () => {
      const res = await fetch("/api/admin/layouts/probe", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to probe layouts");
      return res.json();
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const res = await fetch("/api/admin/layouts/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ locationId }),
      });
      if (!res.ok) throw new Error("Failed to apply layout");
      return res.json() as Promise<ApplyResult>;
    },
    onMutate: (locationId) => {
      setApplyingLocation(locationId);
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Layout toegepast (${result.mode})`);
        result.logs.forEach(log => console.log("[Layout]", log));
      } else {
        toast.error(result.error || "Layout toepassen mislukt");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-layouts"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setApplyingLocation(null);
    },
  });

  const yodeckUrl = (type: string, id: string | null) => {
    if (!id) return null;
    const base = "https://app.yodeck.com";
    switch (type) {
      case "layout":
        return `${base}/layouts/${id}`;
      case "playlist":
        return `${base}/playlists/${id}`;
      case "screen":
        return `${base}/screens/${id}`;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layout className="h-6 w-6" />
            Layouts Beheer
          </h1>
          <p className="text-muted-foreground">
            Configureer baseline + ads scheiding per locatie
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => { refetch(); refetchProbe(); }}
            disabled={isFetching || isProbing}
            data-testid="button-refresh-layouts"
          >
            {(isFetching || isProbing) ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Vernieuwen
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Layout API Status
          </CardTitle>
          <CardDescription>
            Yodeck layout endpoint beschikbaarheid
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {probeData?.layoutsSupported ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-green-700">
                  Layout API beschikbaar - 2-zone layouts kunnen worden aangemaakt
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <span className="text-orange-700">
                  Layout API niet beschikbaar - fallback schedule mode wordt gebruikt
                </span>
              </>
            )}
            {probeData?.lastCheck && (
              <span className="text-sm text-muted-foreground ml-auto">
                Laatst gecontroleerd: {new Date(probeData.lastCheck).toLocaleTimeString("nl-NL")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <List className="h-5 w-5" />
            Locaties
          </CardTitle>
          <CardDescription>
            Overzicht van layout configuratie per locatie
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Locatie</TableHead>
                  <TableHead>Screen ID</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.locations.map((loc) => (
                  <TableRow key={loc.id} data-testid={`row-location-${loc.id}`}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {loc.screenId || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>{modeBadge(loc.layoutMode)}</TableCell>
                    <TableCell>{statusBadge(loc.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {loc.layoutId && (
                          <a 
                            href={yodeckUrl("layout", loc.layoutId) || "#"} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Layout <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {loc.baselinePlaylistId && (
                          <a 
                            href={yodeckUrl("playlist", loc.baselinePlaylistId) || "#"} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Baseline <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {loc.adsPlaylistId && (
                          <a 
                            href={yodeckUrl("playlist", loc.adsPlaylistId) || "#"} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Ads <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {!loc.layoutId && !loc.baselinePlaylistId && !loc.adsPlaylistId && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={loc.status === "complete" ? "outline" : "default"}
                        onClick={() => applyMutation.mutate(loc.id)}
                        disabled={!loc.screenId || applyingLocation === loc.id}
                        data-testid={`button-apply-layout-${loc.id}`}
                      >
                        {applyingLocation === loc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        {loc.status === "complete" ? "Opnieuw" : "Toepassen"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.locations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Geen locaties gevonden
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hoe werkt het?</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none text-muted-foreground">
          <ul className="space-y-2">
            <li>
              <strong>Layout Mode:</strong> Scherm krijgt een 2-zone layout met baseline content (30% links) 
              en advertenties (70% rechts). Vereist dat Yodeck Layout API beschikbaar is.
            </li>
            <li>
              <strong>Fallback Schedule:</strong> Als layouts niet beschikbaar zijn, wordt alleen de 
              ads tagbased playlist toegewezen. Baseline content moet handmatig in Yodeck worden geconfigureerd.
            </li>
            <li>
              <strong>Toepassen:</strong> Klik op "Toepassen" om automatisch baseline playlist, 
              ads playlist en (indien mogelijk) layout aan te maken en toe te wijzen.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
