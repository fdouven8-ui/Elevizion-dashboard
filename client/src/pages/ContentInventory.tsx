import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Monitor, Film, Image, Music, Package, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MediaDetail {
  id: number;
  name: string;
  type: "image" | "video" | "audio" | "other";
  file_extension?: string;
  folder?: string;
  tags?: string[];
}

interface ScreenInventory {
  screenId: number;
  name: string;
  workspaceId?: number;
  workspaceName?: string;
  screen_content: {
    source_type: string | null;
    source_id: number | null;
    source_name: string | null;
  } | null;
  counts: {
    totalPlaylistItems: number;
    mediaItemsTotal: number;
    uniqueMediaIds: number;
    widgetItemsTotal: number;
  };
  mediaBreakdown: {
    video: number;
    image: number;
    audio: number;
    other: number;
  };
  media: MediaDetail[];
}

interface InventoryResult {
  generatedAt: string;
  screens: ScreenInventory[];
  totals: {
    screens: number;
    totalItemsAllScreens: number;
    totalMediaAllScreens: number;
    uniqueMediaAcrossAllScreens: number;
    topMediaByScreens: Array<{ mediaId: number; name: string; screenCount: number }>;
  };
}

function formatSourceType(type: string | null): string {
  if (!type) return "-";
  switch (type.toLowerCase()) {
    case "playlist": return "Playlist";
    case "layout": return "Layout";
    case "schedule": return "Schedule";
    default: return type;
  }
}

function MediaTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "video": return <Film className="h-4 w-4 text-purple-500" />;
    case "image": return <Image className="h-4 w-4 text-blue-500" />;
    case "audio": return <Music className="h-4 w-4 text-green-500" />;
    default: return <Package className="h-4 w-4 text-gray-500" />;
  }
}

export default function ContentInventory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedScreen, setSelectedScreen] = useState<ScreenInventory | null>(null);
  
  const { data: inventory, isLoading, isFetching, refetch } = useQuery<InventoryResult>({
    queryKey: ["/api/yodeck/inventory"],
    enabled: false,
    staleTime: 5 * 60 * 1000,
  });
  
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/yodeck/inventory");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch inventory");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/yodeck/inventory"], data);
      toast({
        title: "Inventaris geladen",
        description: `${data.totals.screens} schermen, ${data.totals.uniqueMediaAcrossAllScreens} unieke media items`,
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
  
  const isLoadingData = isLoading || isFetching || syncMutation.isPending;

  return (
    <div className="space-y-6 p-6" data-testid="content-inventory-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Inventaris</h1>
          <p className="text-muted-foreground">
            Bekijk welke media items op elk Yodeck scherm draaien
          </p>
        </div>
        <Button 
          onClick={() => syncMutation.mutate()} 
          disabled={isLoadingData}
          data-testid="button-sync-inventory"
        >
          {isLoadingData ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync from Yodeck
        </Button>
      </div>
      
      {inventory && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Schermen</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-screens">{inventory.totals.screens}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Totaal Items</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-items">{inventory.totals.totalItemsAllScreens}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Totaal Media</CardTitle>
                <Film className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-total-media">{inventory.totals.totalMediaAllScreens}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unieke Media</CardTitle>
                <Image className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-unique-media">{inventory.totals.uniqueMediaAcrossAllScreens}</div>
              </CardContent>
            </Card>
          </div>
          
          {inventory.totals.topMediaByScreens.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Media (meest gebruikt)</CardTitle>
                <CardDescription>Media items die op de meeste schermen voorkomen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {inventory.totals.topMediaByScreens.map((media) => (
                    <Badge key={media.mediaId} variant="secondary" className="text-sm">
                      {media.name} ({media.screenCount} schermen)
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Schermen Overzicht</CardTitle>
              <CardDescription>Klik op een scherm voor details</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scherm</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Content Type</TableHead>
                    <TableHead className="text-right"># Items</TableHead>
                    <TableHead className="text-right"># Media</TableHead>
                    <TableHead className="text-right"># Uniek</TableHead>
                    <TableHead className="text-right"># Widgets</TableHead>
                    <TableHead className="text-right">Breakdown</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.screens.map((screen) => (
                    <TableRow 
                      key={screen.screenId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedScreen(screen)}
                      data-testid={`row-screen-${screen.screenId}`}
                    >
                      <TableCell className="font-medium">{screen.name}</TableCell>
                      <TableCell>{screen.workspaceName || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatSourceType(screen.screen_content?.source_type || null)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{screen.counts.totalPlaylistItems}</TableCell>
                      <TableCell className="text-right">{screen.counts.mediaItemsTotal}</TableCell>
                      <TableCell className="text-right font-semibold">{screen.counts.uniqueMediaIds}</TableCell>
                      <TableCell className="text-right">{screen.counts.widgetItemsTotal}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {screen.mediaBreakdown.video > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Film className="mr-1 h-3 w-3" />{screen.mediaBreakdown.video}
                            </Badge>
                          )}
                          {screen.mediaBreakdown.image > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Image className="mr-1 h-3 w-3" />{screen.mediaBreakdown.image}
                            </Badge>
                          )}
                          {screen.mediaBreakdown.audio > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Music className="mr-1 h-3 w-3" />{screen.mediaBreakdown.audio}
                            </Badge>
                          )}
                        </div>
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
        </>
      )}
      
      {!inventory && !isLoadingData && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Geen inventaris geladen</h3>
            <p className="text-muted-foreground text-center mb-4">
              Klik op "Sync from Yodeck" om de content inventaris op te halen
            </p>
            <Button onClick={() => syncMutation.mutate()} data-testid="button-sync-empty">
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync from Yodeck
            </Button>
          </CardContent>
        </Card>
      )}
      
      <Dialog open={!!selectedScreen} onOpenChange={() => setSelectedScreen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          {selectedScreen && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Monitor className="h-5 w-5" />
                  {selectedScreen.name}
                </DialogTitle>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Content Type</p>
                    <Badge variant="outline">
                      {formatSourceType(selectedScreen.screen_content?.source_type || null)}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Content Naam</p>
                    <p className="font-medium">{selectedScreen.screen_content?.source_name || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Workspace</p>
                    <p className="font-medium">{selectedScreen.workspaceName || "-"}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedScreen.counts.totalPlaylistItems}</p>
                    <p className="text-xs text-muted-foreground">Playlist Items</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedScreen.counts.mediaItemsTotal}</p>
                    <p className="text-xs text-muted-foreground">Media Items</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedScreen.counts.uniqueMediaIds}</p>
                    <p className="text-xs text-muted-foreground">Unieke Media</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{selectedScreen.counts.widgetItemsTotal}</p>
                    <p className="text-xs text-muted-foreground">Widgets</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {selectedScreen.mediaBreakdown.video > 0 && (
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                      <Film className="mr-1 h-3 w-3" /> {selectedScreen.mediaBreakdown.video} video
                    </Badge>
                  )}
                  {selectedScreen.mediaBreakdown.image > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                      <Image className="mr-1 h-3 w-3" /> {selectedScreen.mediaBreakdown.image} image
                    </Badge>
                  )}
                  {selectedScreen.mediaBreakdown.audio > 0 && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      <Music className="mr-1 h-3 w-3" /> {selectedScreen.mediaBreakdown.audio} audio
                    </Badge>
                  )}
                  {selectedScreen.mediaBreakdown.other > 0 && (
                    <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
                      <Package className="mr-1 h-3 w-3" /> {selectedScreen.mediaBreakdown.other} other
                    </Badge>
                  )}
                </div>
                
                {selectedScreen.media.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Media Items ({selectedScreen.media.length})</h4>
                    <ScrollArea className="h-[200px] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">Type</TableHead>
                            <TableHead>Naam</TableHead>
                            <TableHead>Folder</TableHead>
                            <TableHead>Extensie</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedScreen.media.map((media) => (
                            <TableRow key={media.id}>
                              <TableCell>
                                <MediaTypeIcon type={media.type} />
                              </TableCell>
                              <TableCell className="font-medium">{media.name}</TableCell>
                              <TableCell className="text-muted-foreground">{media.folder || "-"}</TableCell>
                              <TableCell>
                                {media.file_extension && (
                                  <Badge variant="outline" className="text-xs">
                                    .{media.file_extension}
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
