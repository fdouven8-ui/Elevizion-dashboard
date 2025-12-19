import { useAppData } from "@/hooks/use-app-data";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MoreHorizontal, Monitor, AlertTriangle, CheckCircle, Clock, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Screen } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Incident {
  id: string;
  incidentType: string;
  severity: string;
  screenId: string | null;
  status: string;
  title: string;
  description?: string;
  openedAt: string;
  resolvedAt?: string;
}

export default function Screens() {
  const { screens, locations, addScreen, updateScreen } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: incidents = [], isLoading: incidentsLoading } = useQuery<Incident[]>({
    queryKey: ["/api/incidents"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/incidents");
      return res.json();
    },
  });

  const resolveIncidentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/incidents/${id}`, { 
        status: "resolved",
        resolvedAt: new Date().toISOString()
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      toast({ title: "Issue opgelost" });
    },
    onError: () => {
      toast({ title: "Fout bij oplossen", variant: "destructive" });
    },
  });

  const openIncidents = incidents.filter(i => i.status === "open" || i.status === "acknowledged");
  const getScreenId = (screenId: string | null) => {
    if (!screenId) return "Onbekend";
    const screen = screens.find(s => s.id === screenId);
    return screen?.screenId || screen?.name || "Onbekend";
  };

  const filteredScreens = screens.filter(scr => 
    scr.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Onbekend";

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'default';
      case 'offline': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Schermen</h1>
          <p className="text-muted-foreground">Monitor en beheer uw digital signage displays.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" /> Scherm Toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw Scherm Toevoegen</DialogTitle>
            </DialogHeader>
            <ScreenForm onSuccess={() => setIsDialogOpen(false)} locations={locations} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek schermen..." 
            className="pl-8" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Schermnaam</TableHead>
              <TableHead>Locatie</TableHead>
              <TableHead>Yodeck ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScreens.map((scr) => (
              <TableRow key={scr.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  {scr.name}
                </TableCell>
                <TableCell>{getLocationName(scr.locationId)}</TableCell>
                <TableCell className="font-mono text-xs">{scr.yodeckPlayerId || 'Niet Gekoppeld'}</TableCell>
                <TableCell>
                  <Badge variant={getStatusColor(scr.status) as any}>
                    {getStatusLabel(scr.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acties</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => updateScreen(scr.id, { status: 'online' })}>Markeer als Online</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateScreen(scr.id, { status: 'offline' })}>Markeer als Offline</DropdownMenuItem>
                      <DropdownMenuItem>Details Bewerken</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredScreens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Geen schermen gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Open Issues
            {openIncidents.length > 0 && (
              <Badge variant="destructive">{openIncidents.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>Problemen en storingen die aandacht nodig hebben</CardDescription>
        </CardHeader>
        <CardContent>
          {incidentsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : openIncidents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">Geen openstaande issues</p>
              <p className="text-sm">Alle schermen werken naar behoren</p>
            </div>
          ) : (
            <div className="space-y-3">
              {openIncidents.map((incident) => (
                <div 
                  key={incident.id}
                  className={`p-4 rounded-lg border ${
                    incident.severity === "high" 
                      ? "border-red-300 bg-red-50" 
                      : incident.severity === "medium"
                      ? "border-amber-300 bg-amber-50"
                      : "border-blue-300 bg-blue-50"
                  }`}
                  data-testid={`incident-${incident.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`h-5 w-5 mt-0.5 ${
                        incident.severity === "high" ? "text-red-600" : "text-amber-600"
                      }`} />
                      <div>
                        <p className="font-medium">{incident.title}</p>
                        {incident.description && (
                          <p className="text-sm text-muted-foreground">{incident.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {getScreenId(incident.screenId)}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(incident.openedAt).toLocaleString("nl-NL")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => resolveIncidentMutation.mutate(incident.id)}
                        disabled={resolveIncidentMutation.isPending}
                        data-testid={`button-resolve-${incident.id}`}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Oplossen
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScreenForm({ onSuccess, locations }: { onSuccess: () => void, locations: any[] }) {
  const { addScreen } = useAppData();
  const { register, handleSubmit, setValue } = useForm<any>();

  const onSubmit = (data: any) => {
    addScreen(data);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Schermnaam</Label>
        <Input id="name" {...register("name", { required: true })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="location">Locatie</Label>
        <Select onValueChange={(val) => setValue("locationId", val)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecteer locatie" />
          </SelectTrigger>
          <SelectContent>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="yodeckId">Yodeck Player ID (Optioneel)</Label>
        <Input id="yodeckId" {...register("yodeckPlayerId")} />
      </div>
      <div className="flex justify-end pt-4">
        <Button type="submit">Scherm Aanmaken</Button>
      </div>
    </form>
  );
}
