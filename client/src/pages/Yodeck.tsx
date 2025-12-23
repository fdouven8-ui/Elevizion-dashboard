import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Monitor, Film, Image, Music, Package, ChevronRight, Loader2, FileText, Globe, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MediaItem {
  media_id: number;
  name?: string;
  type?: string;
  from: string;
}

interface ScreenSummary {
  screen_id: number;
  screen_name: string;
  workspace_id?: number;
  workspace_name?: string;
  source_type: string | null;
  source_id: number | null;
  source_name?: string;
  media_count: number;
  unique_media_count: number;
  media: MediaItem[];
  warnings: string[];
}

interface ScreenDetails extends ScreenSummary {
  raw_screen_content: any;
  timings_ms?: {
    screen_fetch: number;
    content_resolve: number;
    total: number;
  };
}

interface SummaryResponse {
  mode: string;
  screens: ScreenSummary[];
  total: number;
  generated_at?: string;
  timing_ms?: number;
}

interface StatsResponse {
  mode: string;
  stats: {
    total_screens: number;
    total_media_in_use: number;
    total_unique_media_in_use: number;
    top_media: Array<{ media_id: number; name: string; screen_count: number }>;
    top_playlists: Array<{ source_type: string; source_name: string; screen_count: number }>;
    errors_count: number;
    warnings_count: number;
  };
  generated_at?: string;
  timing_ms?: number;
}

interface HealthResponse {
  ok: boolean;
  yodeck: boolean;
  mode: string;
  screens_found?: number;
  message?: string;
  error?: string;
}

function formatSourceType(type: string | null): string {
  if (!type) return "-";
  switch (type.toLowerCase()) {
    case "playlist": return "Playlist";
    case "layout": return "Layout";
    case "schedule": return "Schedule";
    case "tagbased-playlist": return "Tag Playlist";
    default: return type;
  }
}

function MediaTypeIcon({ type }: { type?: string }) {
  switch (type) {
    case "video": return <Film className="h-4 w-4 text-purple-500" />;
    case "image": return <Image className="h-4 w-4 text-blue-500" />;
    case "audio": return <Music className="h-4 w-4 text-green-500" />;
    case "document": return <FileText className="h-4 w-4 text-orange-500" />;
    case "webpage": return <Globe className="h-4 w-4 text-cyan-500" />;
    default: return <Package className="h-4 w-4 text-gray-500" />;
  }
}

export default function YodeckPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedScreen, setSelectedScreen] = useState<ScreenSummary | null>(null);
  const [screenDetails, setScreenDetails] = useState<ScreenDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["/api/yodeck/health"],
  });

  const { data: summary, isLoading: loadingSummary, isFetching } = useQuery<SummaryResponse>({
    queryKey: ["/api/yodeck/screens/summary"],
    enabled: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["/api/yodeck/stats"],
    enabled: !!summary,
  });

  const loadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/yodeck/screens/summary");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to load screens");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/yodeck/screens/summary"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/yodeck/stats"] });
      toast({
        title: "Schermen geladen",
        description: `${data.total} schermen gevonden${data.timing_ms ? ` (${data.timing_ms}ms)` : ""}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fout bij laden",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/yodeck/screens/summary?refresh=1");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to refresh screens");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/yodeck/screens/summary"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/yodeck/stats"] });
      toast({
        title: "Schermen vernieuwd",
        description: `${data.total} schermen opgehaald (cache gewist)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fout bij vernieuwen",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchDetails = async (screenId: number) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/yodeck/screens/${screenId}/details`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch details");
      }
      const data = await res.json();
      setScreenDetails(data.screen);
    } catch (error: any) {
      toast({
        title: "Fout bij laden details",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleScreenClick = (screen: ScreenSummary) => {
    setSelectedScreen(screen);
    setScreenDetails(null);
    fetchDetails(screen.screen_id);
  };

  const isLoadingData = loadingSummary || isFetching || loadMutation.isPending || refreshMutation.isPending;

  return (
    <div className="space-y-6 p-6" data-testid="yodeck-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Yodeck Overzicht</h1>
          <p className="text-muted-foreground">
            Bekijk schermen, content bronnen en media items vanuit Yodeck
          </p>
        </div>
        <div className="flex items-center gap-4">
          {health && (
            <Badge variant={health.yodeck ? "default" : "secondary"} className="gap-1">
              {health.yodeck ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {health.mode === "mock" ? "Mock Mode" : `${health.screens_found || 0} schermen`}
            </Badge>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => loadMutation.mutate()}
              disabled={isLoadingData}
              data-testid="button-load-yodeck"
            >
              {loadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Laden
            </Button>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={isLoadingData}
              data-testid="button-refresh-yodeck"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Vernieuwen
            </Button>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Schermen</CardTitle>
              <Monitor className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-screens">
                {stats.stats.total_screens}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Media In Gebruik</CardTitle>
              <Film className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-media">
                {stats.stats.total_media_in_use}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unieke Media</CardTitle>
              <Image className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-unique-media">
                {stats.stats.total_unique_media_in_use}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Waarschuwingen</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-warnings">
                {stats.stats.warnings_count}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {stats?.stats.top_media && stats.stats.top_media.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Media (meest gebruikt)</CardTitle>
            <CardDescription>Media items die op de meeste schermen voorkomen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.stats.top_media.map((media) => (
                <Badge key={media.media_id} variant="secondary" className="text-sm">
                  {media.name} ({media.screen_count} schermen)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Schermen Overzicht</CardTitle>
            <CardDescription>
              {summary.total} schermen gevonden • Klik voor details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scherm</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Content Type</TableHead>
                  <TableHead>Content Naam</TableHead>
                  <TableHead className="text-right">Media</TableHead>
                  <TableHead className="text-right">Uniek</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.screens.map((screen) => (
                  <TableRow
                    key={screen.screen_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleScreenClick(screen)}
                    data-testid={`row-screen-${screen.screen_id}`}
                  >
                    <TableCell className="font-medium">{screen.screen_name}</TableCell>
                    <TableCell>{screen.workspace_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatSourceType(screen.source_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {screen.source_name || "-"}
                    </TableCell>
                    <TableCell className="text-right">{screen.media_count}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {screen.unique_media_count}
                    </TableCell>
                    <TableCell>
                      {screen.warnings.length > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {screen.warnings.length}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!summary && !isLoadingData && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Geen data geladen</h3>
            <p className="text-muted-foreground text-center mb-4">
              Klik op "Laden" om schermen op te halen van Yodeck
            </p>
            <Button onClick={() => loadMutation.mutate()} data-testid="button-load-empty">
              <RefreshCw className="mr-2 h-4 w-4" />
              Laden
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedScreen} onOpenChange={() => setSelectedScreen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedScreen && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  {selectedScreen.screen_name}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Content Type</p>
                    <Badge variant="outline">
                      {formatSourceType(selectedScreen.source_type)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Content Naam</p>
                    <p className="font-medium">{selectedScreen.source_name || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Workspace</p>
                    <p className="font-medium">{selectedScreen.workspace_name || "-"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedScreen.media_count}</p>
                    <p className="text-xs text-muted-foreground">Media Items</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedScreen.unique_media_count}</p>
                    <p className="text-xs text-muted-foreground">Unieke Media</p>
                  </div>
                </div>

                {selectedScreen.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-medium text-yellow-800 mb-1">Waarschuwingen</p>
                    <ul className="text-sm text-yellow-700 list-disc list-inside">
                      {selectedScreen.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {loadingDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : screenDetails ? (
                  <>
                    {screenDetails.media.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">
                          Media Items ({screenDetails.media.length})
                        </h4>
                        <ScrollArea className="h-[200px] rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[40px]">Type</TableHead>
                                <TableHead>ID</TableHead>
                                <TableHead>Naam</TableHead>
                                <TableHead>Bron</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {screenDetails.media.map((media, idx) => (
                                <TableRow key={`${media.media_id}-${idx}`}>
                                  <TableCell>
                                    <MediaTypeIcon type={media.type} />
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {media.media_id}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {media.name || "-"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {media.from}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    )}

                    {screenDetails.timings_ms && (
                      <div className="text-xs text-muted-foreground">
                        Timings: screen fetch {screenDetails.timings_ms.screen_fetch}ms,
                        content resolve {screenDetails.timings_ms.content_resolve}ms,
                        totaal {screenDetails.timings_ms.total}ms
                      </div>
                    )}

                    {screenDetails.raw_screen_content && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Raw screen_content (debug)
                        </summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                          {JSON.stringify(screenDetails.raw_screen_content, null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
