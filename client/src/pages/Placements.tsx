import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Target, 
  Monitor, 
  Building2, 
  Calendar, 
  Euro,
  Pause,
  Play,
  MoreHorizontal,
  Search,
  ImageIcon,
  Video,
  CheckCircle,
  XCircle,
  Clock,
  Eye
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Placement {
  id: string;
  advertiserId: string;
  advertiserName: string;
  screenId: string;
  screenName: string;
  locationName: string;
  creativeName?: string;
  startDate: string;
  endDate?: string;
  monthlyPrice: string;
  status: string;
  secondsPerLoop: number;
  playsPerHour: number;
}

interface Screen {
  id: string;
  name: string;
  locationName: string;
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
  durationSeconds?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function Placements() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [screenFilter, setScreenFilter] = useState<string>("all");
  const [advertiserFilter, setAdvertiserFilter] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: placements = [], isLoading } = useQuery<Placement[]>({
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

  const { data: advertisers = [] } = useQuery<Advertiser[]>({
    queryKey: ["/api/advertisers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/advertisers");
      return res.json();
    },
  });

  const { data: creatives = [], isLoading: creativesLoading } = useQuery<Creative[]>({
    queryKey: ["/api/creatives"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/creatives");
      return res.json();
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const res = await apiRequest("PATCH", `/api/placements/${id}`, { status: newStatus });
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

  const approveCreativeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/creatives/${id}/approve`, { notes: "Goedgekeurd" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creatives"] });
      toast({ title: "Creative goedgekeurd" });
    },
    onError: () => {
      toast({ title: "Fout bij goedkeuren", variant: "destructive" });
    },
  });

  const rejectCreativeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/creatives/${id}/reject`, { notes: reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creatives"] });
      toast({ title: "Creative afgekeurd" });
    },
    onError: () => {
      toast({ title: "Fout bij afkeuren", variant: "destructive" });
    },
  });

  const filteredPlacements = placements.filter((p) => {
    const matchesSearch = 
      p.advertiserName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.screenName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.locationName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesScreen = screenFilter === "all" || p.screenId === screenFilter;
    const matchesAdvertiser = advertiserFilter === "all" || p.advertiserId === advertiserFilter;
    return matchesSearch && matchesStatus && matchesScreen && matchesAdvertiser;
  });

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(Number(amount));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("nl-NL");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Actief</Badge>;
      case "hold":
        return <Badge className="bg-amber-100 text-amber-800">Gepauzeerd</Badge>;
      case "ended":
        return <Badge className="bg-gray-100 text-gray-800">Beëindigd</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCreativeStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Goedgekeurd</Badge>;
      case "pending_approval":
        return <Badge className="bg-amber-100 text-amber-800"><Clock className="h-3 w-3 mr-1" />Wacht op goedkeuring</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Afgekeurd</Badge>;
      case "draft":
        return <Badge variant="secondary">Concept</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCreatives = creatives.filter(c => c.status === "pending_approval");
  const getAdvertiserName = (advertiserId: string) => {
    const adv = advertisers.find(a => a.id === advertiserId);
    return adv?.companyName || adv?.name || "Onbekend";
  };

  const totalMonthlyRevenue = filteredPlacements
    .filter(p => p.status === "active")
    .reduce((sum, p) => sum + Number(p.monthlyPrice || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Ads & Plaatsingen</h1>
          <p className="text-muted-foreground">Beheer creatives en plaatsingen op schermen</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-placement">
              <Plus className="h-4 w-4 mr-2" />
              Nieuwe Plaatsing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe Plaatsing</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Adverteerder</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer adverteerder..." />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scherm</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer scherm..." />
                  </SelectTrigger>
                  <SelectContent>
                    {screens.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} - {s.locationName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Startdatum</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Einddatum (optioneel)</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Maandprijs (€)</Label>
                <Input type="number" step="0.01" placeholder="0.00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Seconden per loop</Label>
                  <Input type="number" defaultValue="10" />
                </div>
                <div className="space-y-2">
                  <Label>Afspeelmomenten/uur</Label>
                  <Input type="number" defaultValue="6" />
                </div>
              </div>
              <Button className="w-full">Plaatsing aanmaken</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Actieve Plaatsingen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {placements.filter(p => p.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gepauzeerd</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {placements.filter(p => p.status === "hold").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Maandomzet Actief</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalMonthlyRevenue)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <CardTitle>Alle Plaatsingen</CardTitle>
              <CardDescription>
                De single source of truth: welke ad draait waar
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoeken..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[160px]"
                  data-testid="input-search"
                />
              </div>
              <Select value={screenFilter} onValueChange={setScreenFilter}>
                <SelectTrigger className="w-[150px]" data-testid="filter-screen">
                  <Monitor className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Scherm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle schermen</SelectItem>
                  {screens.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={advertiserFilter} onValueChange={setAdvertiserFilter}>
                <SelectTrigger className="w-[150px]" data-testid="filter-advertiser">
                  <Building2 className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Adverteerder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle adverteerders</SelectItem>
                  {advertisers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.companyName || a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="hold">Gepauzeerd</SelectItem>
                  <SelectItem value="ended">Beëindigd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredPlacements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Geen plaatsingen gevonden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adverteerder</TableHead>
                  <TableHead>Scherm / Locatie</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Prijs/maand</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlacements.map((placement) => (
                  <TableRow key={placement.id} data-testid={`row-placement-${placement.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{placement.advertiserName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p>{placement.screenName}</p>
                          <p className="text-xs text-muted-foreground">{placement.locationName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3" />
                        {formatDate(placement.startDate)}
                        {placement.endDate && ` - ${formatDate(placement.endDate)}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Euro className="h-3 w-3" />
                        {formatCurrency(placement.monthlyPrice)}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(placement.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {placement.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() => toggleStatusMutation.mutate({ id: placement.id, newStatus: "hold" })}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pauzeren
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => toggleStatusMutation.mutate({ id: placement.id, newStatus: "active" })}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Activeren
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Creatives
                {pendingCreatives.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-800">{pendingCreatives.length} wacht</Badge>
                )}
              </CardTitle>
              <CardDescription>Advertentie-bestanden met goedkeuringsstatus</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {creativesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : creatives.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Geen creatives gevonden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creative</TableHead>
                  <TableHead>Adverteerder</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[150px]">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatives.map((creative) => (
                  <TableRow key={creative.id} data-testid={`row-creative-${creative.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {creative.creativeType === "video" ? (
                          <Video className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{creative.title}</p>
                          {creative.durationSeconds && (
                            <p className="text-xs text-muted-foreground">{creative.durationSeconds}s</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getAdvertiserName(creative.advertiserId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {creative.creativeType === "video" ? "Video" : "Afbeelding"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getCreativeStatusBadge(creative.status)}</TableCell>
                    <TableCell>
                      {creative.status === "pending_approval" ? (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-green-600 hover:text-green-700"
                            onClick={() => approveCreativeMutation.mutate(creative.id)}
                            disabled={approveCreativeMutation.isPending}
                            data-testid={`button-approve-${creative.id}`}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-red-600 hover:text-red-700"
                            onClick={() => rejectCreativeMutation.mutate({ id: creative.id, reason: "Niet goedgekeurd" })}
                            disabled={rejectCreativeMutation.isPending}
                            data-testid={`button-reject-${creative.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" data-testid={`button-view-${creative.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
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
