import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Clock, Monitor, Bell, Settings, RefreshCw, Eye } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";

interface Incident {
  id: string;
  incidentType: string;
  severity: string;
  screenId: string | null;
  locationId: string | null;
  status: string;
  title: string;
  description: string | null;
  metadata: any;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  lastSeenAt: string | null;
}

interface AlertRule {
  id: string;
  alertType: string;
  thresholdMinutes: number;
  notifyEmails: string;
  isEnabled: boolean;
}

interface Screen {
  id: string;
  name: string;
  locationId: string;
  status: string;
  lastSeenAt: string | null;
}

interface Location {
  id: string;
  name: string;
}

interface JobRun {
  id: string;
  jobId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  resultSummary: any;
}

export default function Monitoring() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showRulesDialog, setShowRulesDialog] = useState(false);

  const { data: incidents = [], isLoading: incidentsLoading } = useQuery<Incident[]>({
    queryKey: ["/api/incidents"],
  });

  const { data: alertRules = [] } = useQuery<AlertRule[]>({
    queryKey: ["/api/alert-rules"],
  });

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: availableJobs = [] } = useQuery<{ name: string; description: string }[]>({
    queryKey: ["/api/jobs/available"],
  });

  const updateIncidentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Incident> }) => {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Fout bij bijwerken incident");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      toast({ title: "Incident bijgewerkt" });
    },
  });

  const runJobMutation = useMutation({
    mutationFn: async (jobName: string) => {
      const res = await fetch(`/api/jobs/${jobName}/run`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fout bij uitvoeren job");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      toast({ 
        title: "Job uitgevoerd", 
        description: `Verwerkt: ${data.processed}, Fouten: ${data.errors}` 
      });
    },
    onError: () => {
      toast({ title: "Fout", description: "Kon job niet uitvoeren.", variant: "destructive" });
    },
  });

  const getScreenName = (screenId: string | null) => {
    if (!screenId) return "-";
    const screen = screens.find(s => s.id === screenId);
    return screen?.name || "Onbekend";
  };

  const getLocationName = (locationId: string | null) => {
    if (!locationId) return "-";
    const location = locations.find(l => l.id === locationId);
    return location?.name || "Onbekend";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "bg-red-500/10 text-red-600";
      case "medium": return "bg-yellow-500/10 text-yellow-600";
      case "low": return "bg-blue-500/10 text-blue-600";
      default: return "bg-gray-500/10 text-gray-600";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "acknowledged": return <Eye className="h-4 w-4 text-yellow-500" />;
      case "resolved": return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getIncidentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      screen_offline: "Scherm Offline",
      sync_failed: "Sync Mislukt",
      playlist_mismatch: "Playlist Mismatch",
      storage_issue: "Opslag Probleem",
    };
    return labels[type] || type;
  };

  const openIncidents = incidents.filter(i => i.status === "open");
  const acknowledgedIncidents = incidents.filter(i => i.status === "acknowledged");
  const resolvedIncidents = incidents.filter(i => i.status === "resolved");

  const offlineScreens = screens.filter(s => s.status === "offline");

  return (
    <div className="space-y-6" data-testid="monitoring-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring</h1>
          <p className="text-muted-foreground">
            Systeem status, incidents en alerts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowRulesDialog(true)} data-testid="button-alert-rules">
            <Bell className="mr-2 h-4 w-4" />
            Alert Regels
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-open-incidents">
              {openIncidents.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Vereist actie
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Behandeling</CardTitle>
            <Eye className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-acknowledged-incidents">
              {acknowledgedIncidents.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opgelost (30d)</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-resolved-incidents">
              {resolvedIncidents.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline Schermen</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-offline-screens">
              {offlineScreens.length}
            </div>
            <p className="text-xs text-muted-foreground">
              van {screens.length} totaal
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="incidents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="incidents" data-testid="tab-incidents">
            Incidents
            {openIncidents.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {openIncidents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="screens" data-testid="tab-screens">Scherm Status</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Achtergrondtaken</TabsTrigger>
        </TabsList>

        <TabsContent value="incidents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actieve Incidents</CardTitle>
              <CardDescription>
                Problemen die aandacht vereisen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incidentsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : [...openIncidents, ...acknowledgedIncidents].length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                  Geen actieve incidents
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Titel</TableHead>
                      <TableHead>Scherm</TableHead>
                      <TableHead>Locatie</TableHead>
                      <TableHead>Ernst</TableHead>
                      <TableHead>Geopend</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...openIncidents, ...acknowledgedIncidents].map(incident => (
                      <TableRow key={incident.id} data-testid={`row-incident-${incident.id}`}>
                        <TableCell>{getStatusIcon(incident.status)}</TableCell>
                        <TableCell>{getIncidentTypeLabel(incident.incidentType)}</TableCell>
                        <TableCell className="font-medium">{incident.title}</TableCell>
                        <TableCell>{getScreenName(incident.screenId)}</TableCell>
                        <TableCell>{getLocationName(incident.locationId)}</TableCell>
                        <TableCell>
                          <Badge className={getSeverityColor(incident.severity)}>
                            {incident.severity === "high" ? "Hoog" : 
                             incident.severity === "medium" ? "Gemiddeld" : "Laag"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(incident.openedAt), { 
                            addSuffix: true, 
                            locale: nl 
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {incident.status === "open" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateIncidentMutation.mutate({
                                  id: incident.id,
                                  data: { 
                                    status: "acknowledged",
                                    acknowledgedAt: new Date().toISOString(),
                                  },
                                })}
                                data-testid={`button-acknowledge-${incident.id}`}
                              >
                                Bevestigen
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateIncidentMutation.mutate({
                                id: incident.id,
                                data: { 
                                  status: "resolved",
                                  resolvedAt: new Date().toISOString(),
                                },
                              })}
                              data-testid={`button-resolve-${incident.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Oplossen
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="screens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scherm Status</CardTitle>
              <CardDescription>
                Real-time status van alle schermen in het netwerk
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scherm</TableHead>
                    <TableHead>Locatie</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Laatst Gezien</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {screens.map(screen => {
                    const location = locations.find(l => l.id === screen.locationId);
                    return (
                      <TableRow key={screen.id} data-testid={`row-screen-${screen.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4" />
                            {screen.name}
                          </div>
                        </TableCell>
                        <TableCell>{location?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge className={
                            screen.status === "online" 
                              ? "bg-green-500/10 text-green-600"
                              : screen.status === "offline"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-gray-500/10 text-gray-600"
                          }>
                            {screen.status === "online" ? "Online" : 
                             screen.status === "offline" ? "Offline" : "Onbekend"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {screen.lastSeenAt 
                            ? formatDistanceToNow(new Date(screen.lastSeenAt), { 
                                addSuffix: true, 
                                locale: nl 
                              })
                            : "Nooit"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Achtergrondtaken</CardTitle>
              <CardDescription>
                Handmatig uitvoeren van systeem taken
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {availableJobs.map(job => (
                  <Card key={job.name} className="border-dashed">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{job.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {job.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runJobMutation.mutate(job.name)}
                        disabled={runJobMutation.isPending}
                        data-testid={`button-run-${job.name}`}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${runJobMutation.isPending ? "animate-spin" : ""}`} />
                        Uitvoeren
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alert Regels</DialogTitle>
            <DialogDescription>
              Configureer wanneer en hoe alerts worden verstuurd
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {alertRules.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Geen alert regels geconfigureerd
              </p>
            ) : (
              alertRules.map(rule => (
                <Card key={rule.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {rule.alertType === "screen_offline" ? "Scherm Offline" :
                           rule.alertType === "sync_failed" ? "Sync Mislukt" :
                           rule.alertType === "invoice_overdue" ? "Factuur Achterstallig" :
                           rule.alertType}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Threshold: {rule.thresholdMinutes} minuten
                        </p>
                        <p className="text-xs text-muted-foreground">
                          E-mail: {rule.notifyEmails}
                        </p>
                      </div>
                      <Switch checked={rule.isEnabled} disabled />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRulesDialog(false)}>
              Sluiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
