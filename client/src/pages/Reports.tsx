import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Download, Send, Eye, Calendar, Building2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";

interface Report {
  id: string;
  advertiserId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  pdfUrl: string | null;
  generatedAt: string;
  sentAt: string | null;
  notes: string | null;
}

interface Advertiser {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
}

interface SnapshotPlacement {
  id: string;
  snapshotId: string;
  screenId: string;
  locationId: string;
  advertiserId: string;
  secondsPerLoop: number;
  playsPerHour: number;
  daysActive: number;
  weight: string;
}

interface Screen {
  id: string;
  name: string;
  locationId: string;
}

interface Location {
  id: string;
  name: string;
}

export default function Reports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [previewReport, setPreviewReport] = useState<Report | null>(null);

  const { data: reports = [], isLoading: reportsLoading } = useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });

  const { data: advertisers = [] } = useQuery<Advertiser[]>({
    queryKey: ["/api/advertisers"],
  });

  const { data: snapshots = [] } = useQuery<any[]>({
    queryKey: ["/api/snapshots"],
  });

  const { data: snapshotPlacements = [] } = useQuery<SnapshotPlacement[]>({
    queryKey: ["/api/snapshot-placements"],
  });

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: { advertiserId: string; periodStart: string; periodEnd: string }) => {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          reportType: "monthly",
        }),
      });
      if (!res.ok) throw new Error("Fout bij aanmaken rapport");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Rapport aangemaakt", description: "Het proof-of-play rapport is gegenereerd." });
      setIsDialogOpen(false);
      setSelectedAdvertiser("");
      setSelectedPeriod("");
    },
    onError: () => {
      toast({ title: "Fout", description: "Kon rapport niet aanmaken.", variant: "destructive" });
    },
  });

  const sendReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await fetch(`/api/reports/${reportId}/send`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fout bij verzenden rapport");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({ title: "Rapport verzonden", description: "Het rapport is per e-mail verzonden naar de adverteerder." });
    },
    onError: () => {
      toast({ title: "Fout", description: "Kon rapport niet verzenden.", variant: "destructive" });
    },
  });

  const getAdvertiserName = (advertiserId: string) => {
    const advertiser = advertisers.find(a => a.id === advertiserId);
    return advertiser?.companyName || "Onbekend";
  };

  const getScreenName = (screenId: string) => {
    const screen = screens.find(s => s.id === screenId);
    return screen?.name || "Onbekend";
  };

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.id === locationId);
    return location?.name || "Onbekend";
  };

  const getAvailablePeriods = () => {
    const lockedSnapshots = snapshots.filter(s => s.status === "locked");
    return lockedSnapshots.map(s => ({
      value: `${s.periodYear}-${String(s.periodMonth).padStart(2, "0")}`,
      label: format(new Date(s.periodYear, s.periodMonth - 1, 1), "MMMM yyyy", { locale: nl }),
      year: s.periodYear,
      month: s.periodMonth,
    }));
  };

  const handleCreateReport = () => {
    if (!selectedAdvertiser || !selectedPeriod) {
      toast({ title: "Vul alle velden in", variant: "destructive" });
      return;
    }
    
    const [year, month] = selectedPeriod.split("-").map(Number);
    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

    createReportMutation.mutate({
      advertiserId: selectedAdvertiser,
      periodStart,
      periodEnd,
    });
  };

  const getReportPlacements = (report: Report) => {
    const periodStart = new Date(report.periodStart);
    const year = periodStart.getFullYear();
    const month = periodStart.getMonth() + 1;
    
    const matchingSnapshot = snapshots.find(
      s => s.periodYear === year && s.periodMonth === month
    );
    
    if (!matchingSnapshot) return [];
    
    return snapshotPlacements.filter(
      sp => sp.advertiserId === report.advertiserId && sp.snapshotId === matchingSnapshot.id
    );
  };

  const calculateTotalPlays = (placements: SnapshotPlacement[]) => {
    return placements.reduce((sum, p) => sum + (p.playsPerHour * p.daysActive * 24), 0);
  };

  const calculateTotalSeconds = (placements: SnapshotPlacement[]) => {
    return placements.reduce((sum, p) => sum + (p.secondsPerLoop * p.playsPerHour * p.daysActive * 24), 0);
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rapportages</h1>
          <p className="text-muted-foreground">
            Proof-of-Play rapporten voor adverteerders
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-report">
              <Plus className="mr-2 h-4 w-4" />
              Nieuw Rapport
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw Proof-of-Play Rapport</DialogTitle>
              <DialogDescription>
                Genereer een rapport voor een adverteerder op basis van afgesloten maandgegevens.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Adverteerder</Label>
                <Select value={selectedAdvertiser} onValueChange={setSelectedAdvertiser}>
                  <SelectTrigger data-testid="select-advertiser">
                    <SelectValue placeholder="Selecteer adverteerder" />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.map(adv => (
                      <SelectItem key={adv.id} value={adv.id}>
                        {adv.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Periode</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger data-testid="select-period">
                    <SelectValue placeholder="Selecteer periode" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailablePeriods().map(period => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {getAvailablePeriods().length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Geen afgesloten periodes beschikbaar. Sluit eerst een maand af.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuleren
              </Button>
              <Button 
                onClick={handleCreateReport}
                disabled={createReportMutation.isPending || !selectedAdvertiser || !selectedPeriod}
                data-testid="button-confirm-create"
              >
                {createReportMutation.isPending ? "Bezig..." : "Rapport Genereren"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totaal Rapporten</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-reports">{reports.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verzonden</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-sent-reports">
              {reports.filter(r => r.sentAt).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nog Te Verzenden</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-reports">
              {reports.filter(r => !r.sentAt).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alle Rapporten</CardTitle>
          <CardDescription>
            Overzicht van alle gegenereerde proof-of-play rapporten
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Laden...</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nog geen rapporten gegenereerd
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adverteerder</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Gegenereerd</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map(report => (
                  <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {getAdvertiserName(report.advertiserId)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(new Date(report.periodStart), "d MMM", { locale: nl })} -{" "}
                      {format(new Date(report.periodEnd), "d MMM yyyy", { locale: nl })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {report.reportType === "monthly" ? "Maandelijks" : report.reportType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(report.generatedAt), "d MMM yyyy HH:mm", { locale: nl })}
                    </TableCell>
                    <TableCell>
                      {report.sentAt ? (
                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                          Verzonden
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Concept</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewReport(report)}
                          data-testid={`button-preview-${report.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {report.pdfUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={report.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {!report.sentAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendReportMutation.mutate(report.id)}
                            disabled={sendReportMutation.isPending}
                            data-testid={`button-send-${report.id}`}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Verzenden
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewReport} onOpenChange={() => setPreviewReport(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proof-of-Play Rapport</DialogTitle>
            <DialogDescription>
              {previewReport && (
                <>
                  {getAdvertiserName(previewReport.advertiserId)} -{" "}
                  {format(new Date(previewReport.periodStart), "MMMM yyyy", { locale: nl })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {previewReport && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Samenvatting</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Periode</p>
                      <p className="font-medium">
                        {format(new Date(previewReport.periodStart), "d MMMM", { locale: nl })} t/m{" "}
                        {format(new Date(previewReport.periodEnd), "d MMMM yyyy", { locale: nl })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Totaal Schermen</p>
                      <p className="font-medium">
                        {new Set(getReportPlacements(previewReport).map(p => p.screenId)).size}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Geschatte Vertoningen</p>
                      <p className="font-medium">
                        {calculateTotalPlays(getReportPlacements(previewReport)).toLocaleString("nl-NL")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Totaal Speeltijd</p>
                      <p className="font-medium">
                        {Math.round(calculateTotalSeconds(getReportPlacements(previewReport)) / 3600).toLocaleString("nl-NL")} uur
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Details per Scherm</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scherm</TableHead>
                        <TableHead>Locatie</TableHead>
                        <TableHead>Sec/Loop</TableHead>
                        <TableHead>Plays/Uur</TableHead>
                        <TableHead>Actieve Dagen</TableHead>
                        <TableHead>Est. Vertoningen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getReportPlacements(previewReport).map(placement => (
                        <TableRow key={placement.id}>
                          <TableCell>{getScreenName(placement.screenId)}</TableCell>
                          <TableCell>{getLocationName(placement.locationId)}</TableCell>
                          <TableCell>{placement.secondsPerLoop}s</TableCell>
                          <TableCell>{placement.playsPerHour}x</TableCell>
                          <TableCell>{placement.daysActive}</TableCell>
                          <TableCell>
                            {(placement.playsPerHour * placement.daysActive * 24).toLocaleString("nl-NL")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
