import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Camera, 
  Receipt, 
  Banknote, 
  Download,
  AlertCircle,
  Calendar,
  Lock,
  ArrowRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MONTHS = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December"
];

interface Snapshot {
  id: string;
  year: number;
  month: number;
  status: string;
  snapshotData: any;
  createdAt: string;
  lockedAt: string | null;
}

type Step = "snapshot" | "invoices" | "payouts" | "locked";

export default function MonthClose() {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: snapshots, isLoading } = useQuery<Snapshot[]>({
    queryKey: ["snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/snapshots");
      if (!res.ok) throw new Error("Fout bij ophalen snapshots");
      return res.json();
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const res = await fetch("/api/contracts");
      if (!res.ok) throw new Error("Fout bij ophalen contracten");
      return res.json();
    },
  });

  const { data: placements } = useQuery({
    queryKey: ["placements"],
    queryFn: async () => {
      const res = await fetch("/api/placements");
      if (!res.ok) throw new Error("Fout bij ophalen placements");
      return res.json();
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices");
      if (!res.ok) throw new Error("Fout bij ophalen facturen");
      return res.json();
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      if (!res.ok) throw new Error("Fout bij ophalen locaties");
      return res.json();
    },
  });

  const currentSnapshot = snapshots?.find(
    (s) => s.year === selectedYear && s.month === selectedMonth + 1
  );

  const activeContracts = contracts?.filter((c: any) => {
    if (c.status !== "active" && c.status !== "signed") return false;
    const start = new Date(c.startDate);
    const selectedDate = new Date(selectedYear, selectedMonth, 1);
    if (start > selectedDate) return false;
    if (c.endDate) {
      const end = new Date(c.endDate);
      if (end < selectedDate) return false;
    }
    return true;
  }) || [];

  const monthInvoices = invoices?.filter((inv: any) => {
    const periodStart = new Date(inv.periodStart);
    return periodStart.getFullYear() === selectedYear && periodStart.getMonth() === selectedMonth;
  }) || [];

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth + 1,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Snapshot aangemaakt", description: "Maandgegevens zijn bevroren" });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const generateInvoicesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/snapshots/${currentSnapshot?.id}/generate-invoices`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Facturen gegenereerd", 
        description: `${data.count} facturen aangemaakt` 
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const generatePayoutsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/snapshots/${currentSnapshot?.id}/generate-payouts`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Uitbetalingen berekend", 
        description: `${data.count} uitbetalingen aangemaakt` 
      });
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const lockSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/snapshots/${currentSnapshot?.id}/lock`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Maand afgesloten", description: "De maand is definitief afgesloten" });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const getCurrentStep = (): Step => {
    if (!currentSnapshot) return "snapshot";
    if (currentSnapshot.status === "locked") return "locked";
    if (monthInvoices.length === 0) return "invoices";
    return "payouts";
  };

  const currentStep = getCurrentStep();
  const isLocked = currentSnapshot?.status === "locked";

  const getStepProgress = () => {
    if (isLocked) return 100;
    if (currentStep === "payouts") return 66;
    if (currentStep === "invoices") return 33;
    return 0;
  };

  const years = Array.from({ length: 3 }, (_, i) => currentDate.getFullYear() - 1 + i);

  const totalRevenue = activeContracts.reduce((sum: number, c: any) => 
    sum + parseFloat(c.monthlyPriceExVat || 0), 0
  );

  const calculateLocationShare = (locationId: string) => {
    const location = locations?.find((l: any) => l.id === locationId);
    if (!location) return 0;
    const sharePercent = parseFloat(location.revenueSharePercent || "0");
    return (totalRevenue * sharePercent) / 100;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">
            Maandafsluiting
          </h1>
          <p className="text-muted-foreground">
            Sluit de maand af en genereer facturen en uitbetalingen.
          </p>
        </div>
        <div className="flex gap-2">
          <Select 
            value={selectedMonth.toString()} 
            onValueChange={(v) => setSelectedMonth(parseInt(v))}
          >
            <SelectTrigger className="w-40" data-testid="select-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={i.toString()}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={selectedYear.toString()} 
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-28" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {MONTHS[selectedMonth]} {selectedYear}
              </CardTitle>
              <CardDescription>
                {activeContracts.length} actieve contracten • €{totalRevenue.toFixed(2)} omzet ex BTW
              </CardDescription>
            </div>
            {isLocked && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Afgesloten
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={getStepProgress()} className="mb-6" />
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StepCard
              icon={Camera}
              title="1. Snapshot"
              description="Bevries contractgegevens"
              isActive={currentStep === "snapshot"}
              isCompleted={!!currentSnapshot}
              isLocked={isLocked}
            >
              {!currentSnapshot ? (
                <Button 
                  onClick={() => createSnapshotMutation.mutate()}
                  disabled={createSnapshotMutation.isPending}
                  className="w-full mt-3"
                  data-testid="button-create-snapshot"
                >
                  {createSnapshotMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  Maak Snapshot
                </Button>
              ) : (
                <p className="text-sm text-green-600 flex items-center gap-1 mt-3">
                  <CheckCircle2 className="h-4 w-4" />
                  Snapshot aangemaakt
                </p>
              )}
            </StepCard>

            <StepCard
              icon={Receipt}
              title="2. Facturen"
              description="Genereer maandfacturen"
              isActive={currentStep === "invoices"}
              isCompleted={monthInvoices.length > 0}
              isLocked={isLocked}
            >
              {currentSnapshot && monthInvoices.length === 0 ? (
                <Button 
                  onClick={() => generateInvoicesMutation.mutate()}
                  disabled={generateInvoicesMutation.isPending}
                  className="w-full mt-3"
                  data-testid="button-generate-invoices"
                >
                  {generateInvoicesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Receipt className="h-4 w-4 mr-2" />
                  )}
                  Genereer Facturen
                </Button>
              ) : monthInvoices.length > 0 ? (
                <p className="text-sm text-green-600 flex items-center gap-1 mt-3">
                  <CheckCircle2 className="h-4 w-4" />
                  {monthInvoices.length} facturen
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-3">
                  Eerst snapshot nodig
                </p>
              )}
            </StepCard>

            <StepCard
              icon={Banknote}
              title="3. Uitbetalingen"
              description="Bereken locatie-uitbetalingen"
              isActive={currentStep === "payouts"}
              isCompleted={isLocked}
              isLocked={isLocked}
            >
              {monthInvoices.length > 0 && !isLocked ? (
                <Button 
                  onClick={() => generatePayoutsMutation.mutate()}
                  disabled={generatePayoutsMutation.isPending}
                  variant="outline"
                  className="w-full mt-3"
                  data-testid="button-generate-payouts"
                >
                  {generatePayoutsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Banknote className="h-4 w-4 mr-2" />
                  )}
                  Bereken Uitbetalingen
                </Button>
              ) : monthInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-3">
                  Eerst facturen nodig
                </p>
              ) : (
                <p className="text-sm text-green-600 flex items-center gap-1 mt-3">
                  <CheckCircle2 className="h-4 w-4" />
                  Uitbetalingen berekend
                </p>
              )}
            </StepCard>

            <StepCard
              icon={Lock}
              title="4. Afsluiten"
              description="Definitief afsluiten"
              isActive={false}
              isCompleted={isLocked}
              isLocked={isLocked}
            >
              {monthInvoices.length > 0 && !isLocked ? (
                <Button 
                  onClick={() => lockSnapshotMutation.mutate()}
                  disabled={lockSnapshotMutation.isPending}
                  variant="destructive"
                  className="w-full mt-3"
                  data-testid="button-lock-month"
                >
                  {lockSnapshotMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  Sluit Maand Af
                </Button>
              ) : isLocked ? (
                <p className="text-sm text-green-600 flex items-center gap-1 mt-3">
                  <CheckCircle2 className="h-4 w-4" />
                  Definitief afgesloten
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-3">
                  Eerst facturen nodig
                </p>
              )}
            </StepCard>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actieve Contracten</CardTitle>
            <CardDescription>Contracten voor deze maand</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead className="text-right">Maandprijs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeContracts.map((contract: any) => (
                  <TableRow key={contract.id}>
                    <TableCell>{contract.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      €{parseFloat(contract.monthlyPriceExVat).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {activeContracts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Geen actieve contracten
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Locatie Uitbetalingen</CardTitle>
            <CardDescription>Geschatte uitkeringen aan locatiepartners</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Locatie</TableHead>
                  <TableHead className="text-right">Aandeel</TableHead>
                  <TableHead className="text-right">Bedrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations?.map((location: any) => {
                  const share = calculateLocationShare(location.id);
                  if (share === 0) return null;
                  return (
                    <TableRow key={location.id}>
                      <TableCell>{location.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {location.revenueSharePercent}%
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        €{share.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {isLocked && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Maand Afgesloten</AlertTitle>
          <AlertDescription>
            Deze maand is definitief afgesloten op {currentSnapshot?.lockedAt 
              ? new Date(currentSnapshot.lockedAt).toLocaleString("nl-NL")
              : "-"
            }. Gegevens kunnen niet meer worden gewijzigd.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function StepCard({ 
  icon: Icon, 
  title, 
  description, 
  isActive, 
  isCompleted, 
  isLocked,
  children 
}: { 
  icon: any; 
  title: string; 
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`
      relative p-4 rounded-lg border transition-all
      ${isActive && !isLocked ? "border-primary bg-primary/5 shadow-sm" : "border-muted"}
      ${isCompleted ? "bg-green-50/50" : ""}
    `}>
      <div className="flex items-center gap-2 mb-2">
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : isActive ? (
          <div className="h-5 w-5 rounded-full border-2 border-primary flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-primary" />
          </div>
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
        <span className={`font-medium ${isActive && !isLocked ? "text-primary" : ""}`}>
          {title}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      {children}
    </div>
  );
}
