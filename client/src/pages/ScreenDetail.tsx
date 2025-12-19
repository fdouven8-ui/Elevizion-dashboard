import { useAppData } from "@/hooks/use-app-data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Monitor, 
  Wifi, 
  WifiOff, 
  ExternalLink, 
  Target, 
  PauseCircle, 
  ArrowLeft,
  Clock
} from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { placementsApi } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function ScreenDetail() {
  const [, params] = useRoute("/screens/:id");
  const [, navigate] = useLocation();
  const { screens, locations, placements, advertisers, contracts } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const screenId = params?.id;
  const screen = screens.find(s => s.id === screenId);
  const location = screen ? locations.find(l => l.id === screen.locationId) : null;

  // Get active placements for this screen
  const activePlacements = placements.filter(p => 
    p.screenId === screenId && p.isActive
  );

  // Get advertiser name from placement through contract
  const getAdvertiserName = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return "Onbekend";
    const advertiser = advertisers.find(a => a.id === contract.advertiserId);
    return advertiser?.companyName || "Onbekend";
  };

  const formatLastSeen = (dateValue: Date | string | null) => {
    if (!dateValue) return "Nooit";
    try {
      const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
      return formatDistanceToNow(date, { addSuffix: true, locale: nl });
    } catch {
      return "Onbekend";
    }
  };

  const updatePlacementMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: { isActive: boolean } }) => {
      return await placementsApi.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["placements"] });
    },
  });

  const handlePausePlacement = async (placementId: string) => {
    try {
      await updatePlacementMutation.mutateAsync({ id: placementId, data: { isActive: false } });
      toast({ title: "Plaatsing gepauzeerd" });
    } catch (error) {
      toast({ title: "Fout bij pauzeren", variant: "destructive" });
    }
  };

  const handlePauseAll = async () => {
    for (const placement of activePlacements) {
      await updatePlacementMutation.mutateAsync({ id: placement.id, data: { isActive: false } });
    }
    toast({ title: `${activePlacements.length} plaatsingen gepauzeerd` });
  };

  const openInYodeck = () => {
    if (screen?.yodeckPlayerId) {
      window.open(`https://app.yodeck.com/player/${screen.yodeckPlayerId}`, "_blank");
    } else {
      toast({ 
        title: "Geen Yodeck ID gekoppeld", 
        description: "Dit scherm is niet gekoppeld aan een Yodeck player.",
        variant: "destructive" 
      });
    }
  };

  if (!screen) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/screens">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar Schermen
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Scherm niet gevonden</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild data-testid="button-back">
        <Link href="/screens">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Terug naar Schermen
        </Link>
      </Button>

      {/* Header with status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${screen.status === "online" ? "bg-green-100" : "bg-red-100"}`}>
            {screen.status === "online" ? (
              <Wifi className="h-6 w-6 text-green-600" />
            ) : (
              <WifiOff className="h-6 w-6 text-red-600" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="screen-id">{screen.screenId || screen.name}</h1>
            <p className="text-muted-foreground">{location?.name || "Geen locatie"}</p>
          </div>
          <Badge 
            variant={screen.status === "online" ? "default" : "destructive"} 
            className="ml-2"
            data-testid="screen-status"
          >
            {screen.status === "online" ? "Online" : "Offline"}
          </Badge>
        </div>

        {/* Primary actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={openInYodeck} data-testid="button-yodeck">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Yodeck
          </Button>
          <Button asChild data-testid="button-place-ad">
            <Link href={`/onboarding/placement?screenId=${screen.id}`}>
              <Target className="h-4 w-4 mr-2" />
              Plaats Ad
            </Link>
          </Button>
          {activePlacements.length > 0 && (
            <Button variant="outline" onClick={handlePauseAll} data-testid="button-pause-all">
              <PauseCircle className="h-4 w-4 mr-2" />
              Pauzeer Alles
            </Button>
          )}
        </div>
      </div>

      {/* Status card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold flex items-center gap-2">
                {screen.status === "online" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Online
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Offline
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Laatst gezien</p>
              <p className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {formatLastSeen(screen.lastSeenAt)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Yodeck Player ID</p>
              <p className="text-lg font-semibold font-mono">
                {screen.yodeckPlayerId || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Actieve plaatsingen</p>
              <p className="text-lg font-semibold">{activePlacements.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Placements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Actieve Plaatsingen ({activePlacements.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activePlacements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Geen actieve plaatsingen op dit scherm</p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href={`/onboarding/placement?screenId=${screen.id}`}>
                  Plaats een advertentie
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adverteerder</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Einde</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePlacements.map((placement) => (
                  <TableRow key={placement.id} data-testid={`placement-row-${placement.id}`}>
                    <TableCell className="font-medium">
                      {getAdvertiserName(placement.contractId)}
                    </TableCell>
                    <TableCell>
                      {placement.startDate ? new Date(placement.startDate).toLocaleDateString("nl-NL") : "-"}
                    </TableCell>
                    <TableCell>
                      {placement.endDate ? new Date(placement.endDate).toLocaleDateString("nl-NL") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">Actief</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handlePausePlacement(placement.id)}
                        disabled={updatePlacementMutation.isPending}
                        data-testid={`button-pause-${placement.id}`}
                      >
                        <PauseCircle className="h-4 w-4 mr-1" />
                        Pauzeer
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
