import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Building2,
  Monitor,
  MapPin,
  Calendar,
  Play,
  Pause,
  ExternalLink,
  ImageIcon,
  Video,
  AlertTriangle,
  WifiOff,
  FileWarning,
  ArrowRightLeft
} from "lucide-react";

interface Placement {
  id: string;
  advertiserId: string;
  screenId: string;
  contractId?: string;
  creativeId?: string;
  startDate: string;
  endDate?: string;
  monthlyPrice: string;
  isActive: boolean;
  status: string;
  secondsPerLoop: number;
  playsPerHour: number;
  notes?: string;
}

interface Screen {
  id: string;
  screenId: string;
  name: string;
  locationId: string;
  status: string;
  yodeckPlayerId?: string;
}

interface Location {
  id: string;
  name: string;
  city?: string;
  address: string;
  street?: string;
  zipcode?: string;
}

interface Advertiser {
  id: string;
  name: string;
  companyName: string;
}

interface Creative {
  id: string;
  advertiserId: string;
  creativeType: string;
  title: string;
  status: string;
  fileUrl?: string;
}

interface Contract {
  id: string;
  advertiserId: string;
  status: string;
}

export default function PlacementDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: placements = [] } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/placements");
      return res.json();
    },
  });

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/screens");
      return res.json();
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/locations");
      return res.json();
    },
  });

  const { data: advertisers = [] } = useQuery<Advertiser[]>({
    queryKey: ["/api/advertisers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/advertisers");
      return res.json();
    },
  });

  const { data: creatives = [] } = useQuery<Creative[]>({
    queryKey: ["/api/creatives"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/creatives");
      return res.json();
    },
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contracts");
      return res.json();
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newActive }: { id: string; newActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/placements/${id}`, { isActive: newActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/placements"] });
      toast({ title: "Status bijgewerkt" });
    },
    onError: () => {
      toast({ title: "Fout bij bijwerken", variant: "destructive" });
    },
  });

  const placement = placements.find(p => p.id === id);
  const screen = placement ? screens.find(s => s.id === placement.screenId) : undefined;
  const location = screen ? locations.find(l => l.id === screen.locationId) : undefined;
  const advertiser = placement ? advertisers.find(a => a.id === placement.advertiserId) : undefined;
  const creative = placement?.creativeId ? creatives.find(c => c.id === placement.creativeId) : undefined;
  const contract = placement?.contractId ? contracts.find(c => c.id === placement.contractId) : undefined;

  const isScreenOffline = screen?.status === "offline";
  const isContractUnsigned = contract && contract.status !== "signed";

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("nl-NL", { 
      weekday: "long",
      day: "numeric", 
      month: "long", 
      year: "numeric" 
    });
  };

  const getYodeckUrl = () => {
    if (!screen?.yodeckPlayerId) return null;
    return `https://app.yodeck.com/players/${screen.yodeckPlayerId}`;
  };

  if (!placement) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/placements">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Terug
            </Link>
          </Button>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Plaatsing niet gevonden</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/placements">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug
          </Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Plaatsing Details</h1>
          <p className="text-muted-foreground">
            {advertiser?.companyName || advertiser?.name} op {screen?.screenId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {placement.isActive ? (
            <Badge className="bg-green-100 text-green-800 text-sm px-3 py-1">Actief</Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 text-sm px-3 py-1">Gepauzeerd</Badge>
          )}
          {isScreenOffline && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              <WifiOff className="h-3 w-3 mr-1" />
              Scherm Offline
            </Badge>
          )}
          {isContractUnsigned && (
            <Badge className="bg-orange-100 text-orange-800 text-sm px-3 py-1">
              <FileWarning className="h-3 w-3 mr-1" />
              Contract Niet Getekend
            </Badge>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      {(isScreenOffline || isContractUnsigned) && (
        <Card className="border-destructive bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Aandachtspunten</p>
                <ul className="text-sm text-destructive/80 mt-1 list-disc list-inside">
                  {isScreenOffline && <li>Het scherm is momenteel offline - de advertentie wordt niet getoond</li>}
                  {isContractUnsigned && <li>Het bijbehorende contract is nog niet getekend</li>}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Advertiser Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Adverteerder
            </CardTitle>
          </CardHeader>
          <CardContent>
            {advertiser ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xl font-semibold">{advertiser.companyName || advertiser.name}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/advertisers/${advertiser.id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Bekijk Adverteerder
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Adverteerder niet gevonden</p>
            )}
          </CardContent>
        </Card>

        {/* Screen + Location Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Scherm & Locatie
            </CardTitle>
          </CardHeader>
          <CardContent>
            {screen && location ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${screen.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-mono font-semibold">{screen.screenId}</span>
                  <Badge variant={screen.status === 'online' ? 'default' : 'destructive'}>
                    {screen.status === 'online' ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium">{location.name}</span>
                  </div>
                  <p className="ml-6">{location.city && `${location.city}, `}{location.address}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/screens/${screen.id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Bekijk Scherm
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Scherm niet gevonden</p>
            )}
          </CardContent>
        </Card>

        {/* Creative Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {creative?.creativeType === 'video' ? (
                <Video className="h-5 w-5" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
              Creative
            </CardTitle>
          </CardHeader>
          <CardContent>
            {creative ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                    {creative.creativeType === 'video' ? (
                      <Video className="h-8 w-8 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold">{creative.title}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {creative.creativeType === 'video' ? 'Video' : 'Afbeelding'}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      {creative.status === 'approved' ? 'Goedgekeurd' : 
                       creative.status === 'pending_approval' ? 'Wacht op goedkeuring' : 
                       creative.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Geen creative gekoppeld</p>
            )}
          </CardContent>
        </Card>

        {/* Period Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Periode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Startdatum</p>
                <p className="font-semibold">{formatDate(placement.startDate)}</p>
              </div>
              {placement.endDate ? (
                <div>
                  <p className="text-sm text-muted-foreground">Einddatum</p>
                  <p className="font-semibold">{formatDate(placement.endDate)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">Einddatum</p>
                  <p className="text-muted-foreground">Doorlopend</p>
                </div>
              )}
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">Weergave</p>
                <p className="text-sm">
                  {placement.secondsPerLoop}s per loop, {placement.playsPerHour}x per uur
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {placement.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notities</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{placement.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Acties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {placement.isActive ? (
              <Button 
                variant="outline" 
                onClick={() => toggleStatusMutation.mutate({ id: placement.id, newActive: false })}
                disabled={toggleStatusMutation.isPending}
                data-testid="button-pause"
              >
                <Pause className="h-4 w-4 mr-2" />
                Pauzeren
              </Button>
            ) : (
              <Button 
                onClick={() => toggleStatusMutation.mutate({ id: placement.id, newActive: true })}
                disabled={toggleStatusMutation.isPending}
                data-testid="button-resume"
              >
                <Play className="h-4 w-4 mr-2" />
                Hervatten
              </Button>
            )}
            
            <Button variant="outline" disabled data-testid="button-move">
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Verplaatsen
            </Button>

            {getYodeckUrl() && (
              <Button variant="outline" asChild data-testid="button-yodeck">
                <a href={getYodeckUrl()!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Yodeck
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
