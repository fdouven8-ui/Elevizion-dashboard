import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useState } from "react";
import { format, subMonths } from "date-fns";
import { nl } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Calculator, Euro, TrendingUp, Users, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface VisitorStaffel {
  minVisitors: number;
  maxVisitors: number | null;
  weight: number;
  label: string;
}

interface RevenueAllocation {
  id: string;
  advertiserId: string;
  advertiserName?: string;
  screenId: string;
  screenName?: string;
  locationId: string | null;
  locationName?: string;
  invoiceId: string | null;
  invoiceNumber?: string;
  periodYear: number;
  periodMonth: number;
  screenDays: number;
  visitorWeight: string;
  allocationScore: string;
  allocatedRevenue: string;
  createdAt: string;
}

interface LocationPayout {
  id: string;
  locationId: string;
  locationName?: string;
  periodYear: number;
  periodMonth: number;
  grossRevenue: string;
  revenueSharePercent: string;
  calculatedPayout: string;
  carryOverAmount: string;
  payoutAmount: string;
  carriedOver: boolean;
  status: string;
  createdAt: string;
}

export default function Payouts() {
  const { payouts, locations, generatePayouts } = useAppData();
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const currentDate = new Date();
  const lastMonth = subMonths(currentDate, 1);
  const [selectedYear, setSelectedYear] = useState(lastMonth.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(lastMonth.getMonth() + 1);

  const { data: staffels = [] } = useQuery<VisitorStaffel[]>({
    queryKey: ["/api/visitor-weight-staffels"],
  });

  const { data: allocations = [], isLoading: allocationsLoading, refetch: refetchAllocations } = useQuery<RevenueAllocation[]>({
    queryKey: ["/api/revenue-allocations", selectedYear, selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/revenue-allocations?periodYear=${selectedYear}&periodMonth=${selectedMonth}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const calculateMutation = useMutation({
    mutationFn: async ({ type, dryRun }: { type: "allocations" | "payouts"; dryRun: boolean }) => {
      const endpoint = type === "allocations" 
        ? "/api/revenue-allocations/calculate" 
        : "/api/location-payouts/calculate";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          periodYear: selectedYear, 
          periodMonth: selectedMonth, 
          dryRun 
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Berekening mislukt");
      }
      return res.json();
    },
    onSuccess: (data, { type }) => {
      toast({
        title: type === "allocations" ? "Omzetverdeling berekend" : "Payouts berekend",
        description: `Succesvol verwerkt voor ${format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: nl })}`,
      });
      refetchAllocations();
      queryClient.invalidateQueries({ queryKey: ["/api/payouts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generatePayouts(format(new Date(), "yyyy-MM"));
    setTimeout(() => setIsGenerating(false), 500);
  };

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Onbekend";

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'paid': return 'Betaald';
      case 'pending': return 'In Afwachting';
      case 'approved': return 'Goedgekeurd';
      case 'carried_over': return 'Overgedragen';
      default: return status;
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    switch(status) {
      case 'paid': return 'default';
      case 'carried_over': return 'outline';
      default: return 'secondary';
    }
  };

  const periodLabel = format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: nl });
  
  const totalAllocated = allocations.reduce((sum, a) => sum + parseFloat(a.allocatedRevenue || "0"), 0);
  const uniqueLocations = new Set(allocations.map(a => a.locationId).filter(Boolean)).size;

  const years = [2024, 2025, 2026];
  const months = [
    { value: 1, label: "Januari" },
    { value: 2, label: "Februari" },
    { value: 3, label: "Maart" },
    { value: 4, label: "April" },
    { value: 5, label: "Mei" },
    { value: 6, label: "Juni" },
    { value: 7, label: "Juli" },
    { value: 8, label: "Augustus" },
    { value: 9, label: "September" },
    { value: 10, label: "Oktober" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="payouts-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Uitbetalingen & Omzetverdeling</h1>
          <p className="text-muted-foreground">Revenue allocation per scherm en locatie payouts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-32" data-testid="select-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Euro className="h-4 w-4 text-muted-foreground" />
              Toegerekende Omzet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalAllocated.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Locaties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueLocations}</div>
            <p className="text-xs text-muted-foreground">Met actieve schermen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              Allocaties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allocations.length}</div>
            <p className="text-xs text-muted-foreground">Scherm-adverteerder combinaties</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Openstaand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              €{payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.payoutAmountExVat), 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Nog uit te betalen</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="allocations">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="allocations" data-testid="tab-allocations">Omzetverdeling</TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts">Locatie Payouts</TabsTrigger>
            <TabsTrigger value="staffels" data-testid="tab-staffels">Bezoeker Staffels</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => calculateMutation.mutate({ type: "allocations", dryRun: false })}
              disabled={calculateMutation.isPending}
              data-testid="button-calculate-allocations"
            >
              {calculateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4 mr-2" />
              )}
              Bereken Allocaties
            </Button>
            <Button 
              onClick={() => calculateMutation.mutate({ type: "payouts", dryRun: false })}
              disabled={calculateMutation.isPending}
              data-testid="button-calculate-payouts"
            >
              {calculateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Bereken Payouts
            </Button>
          </div>
        </div>

        <TabsContent value="allocations">
          <Card>
            <CardHeader>
              <CardTitle>Omzetverdeling per Scherm</CardTitle>
              <CardDescription>
                Weighted allocation op basis van actieve dagen × bezoekersgewicht
              </CardDescription>
            </CardHeader>
            <CardContent>
              {allocationsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allocations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mb-2" />
                  <p>Geen allocaties gevonden voor {periodLabel}.</p>
                  <p className="text-sm">Klik op "Bereken Allocaties" om de verdeling te berekenen.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Scherm</TableHead>
                      <TableHead>Locatie</TableHead>
                      <TableHead className="text-right">Dagen</TableHead>
                      <TableHead className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>Gewicht</TooltipTrigger>
                            <TooltipContent>
                              <p>Bezoekersgewicht op basis van staffels</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Omzet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((alloc) => (
                      <TableRow key={alloc.id} data-testid={`allocation-row-${alloc.id}`}>
                        <TableCell className="font-medium">{alloc.advertiserName || alloc.advertiserId}</TableCell>
                        <TableCell>{alloc.screenName || alloc.screenId}</TableCell>
                        <TableCell>{alloc.locationName || alloc.locationId || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{alloc.screenDays}</TableCell>
                        <TableCell className="text-right font-mono">×{parseFloat(alloc.visitorWeight).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono">{parseFloat(alloc.allocationScore).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">€{parseFloat(alloc.allocatedRevenue).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Locatie Uitbetalingen</CardTitle>
                <CardDescription>
                  Per locatie berekende payouts met minimum €25 drempel
                </CardDescription>
              </div>
              <Button onClick={handleGenerate} disabled={isGenerating} variant="outline" data-testid="button-generate-payouts">
                {isGenerating ? "Verwerken..." : "Legacy Payouts Genereren"}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Locatie</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Bruto Omzet</TableHead>
                    <TableHead className="text-right">Deel %</TableHead>
                    <TableHead className="text-right">Uitbetaling</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((pay) => (
                    <TableRow key={pay.id} data-testid={`payout-row-${pay.id}`}>
                      <TableCell className="font-medium">{getLocationName(pay.locationId)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {pay.periodStart}
                      </TableCell>
                      <TableCell className="text-right font-mono">€{parseFloat(pay.grossRevenueExVat).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{pay.sharePercent}%</TableCell>
                      <TableCell className="text-right font-mono font-bold">€{parseFloat(pay.payoutAmountExVat).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(pay.status)}>
                          {getStatusLabel(pay.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payouts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                        Nog geen uitbetalingen gegenereerd.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staffels">
          <Card>
            <CardHeader>
              <CardTitle>Bezoeker Gewicht Staffels</CardTitle>
              <CardDescription>
                Locaties met meer bezoekers krijgen een hoger gewicht bij de omzetverdeling
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {staffels.map((staffel, index) => (
                  <Card key={index} className="border-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{staffel.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-3xl font-bold text-primary">×{staffel.weight}</span>
                        <span className="text-sm text-muted-foreground">gewicht</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {staffel.minVisitors.toLocaleString("nl-NL")}
                        {staffel.maxVisitors ? ` – ${staffel.maxVisitors.toLocaleString("nl-NL")}` : "+"} bezoekers/week
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Hoe werkt de weighted allocation?</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Per scherm wordt het aantal actieve dagen in de periode bepaald</li>
                  <li>Dit wordt vermenigvuldigd met het bezoekersgewicht van de locatie</li>
                  <li>De totale omzet van de adverteerder wordt verdeeld op basis van de scores</li>
                  <li>Locaties ontvangen hun revenue share percentage van de toegedeelde omzet</li>
                  <li>Bedragen onder €25 worden overgedragen naar de volgende maand</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
