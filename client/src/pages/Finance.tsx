import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { Users, TrendingUp, Euro } from "lucide-react";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Contract {
  id: string;
  advertiserId: string;
  monthlyPriceExVat: string;
  status: string;
  startDate: string;
  endDate?: string;
}

interface Placement {
  id: string;
  contractId: string;
  screenId: string;
  isActive: boolean;
}

export default function Finance() {
  const { data: contracts = [], isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/contracts");
      return res.json();
    },
  });

  const { data: placements = [], isLoading: placementsLoading } = useQuery<Placement[]>({
    queryKey: ["/api/placements"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/placements");
      return res.json();
    },
  });

  const isLoading = contractsLoading || placementsLoading;

  // Calculate paying customers: advertisers with active contract AND active placements
  const payingCustomers = useMemo(() => {
    const activeContracts = contracts.filter(c => 
      c.status === "signed" || c.status === "active"
    );
    
    const activePlacementContractIds = new Set(
      placements.filter(p => p.isActive).map(p => p.contractId)
    );
    
    const payingAdvertiserIds = new Set<string>();
    activeContracts.forEach(contract => {
      if (activePlacementContractIds.has(contract.id)) {
        payingAdvertiserIds.add(contract.advertiserId);
      }
    });
    
    return payingAdvertiserIds.size;
  }, [contracts, placements]);

  // Calculate MRR from active contracts with active placements
  const monthlyRevenue = useMemo(() => {
    const activePlacementContractIds = new Set(
      placements.filter(p => p.isActive).map(p => p.contractId)
    );
    
    return contracts
      .filter(c => 
        (c.status === "signed" || c.status === "active") &&
        activePlacementContractIds.has(c.id)
      )
      .reduce((sum, contract) => sum + Number(contract.monthlyPriceExVat || 0), 0);
  }, [contracts, placements]);

  // Generate monthly revenue trend data (last 12 months)
  const monthlyTrendData = useMemo(() => {
    const months: { month: string; monthLabel: string; revenue: number }[] = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = date.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" });
      
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const activeContractsInMonth = contracts.filter(c => {
        if (c.status !== "signed" && c.status !== "active") return false;
        
        const contractStart = new Date(c.startDate);
        const contractEnd = c.endDate ? new Date(c.endDate) : null;
        
        const startedBeforeMonthEnd = contractStart <= monthEnd;
        const endedAfterMonthStart = !contractEnd || contractEnd >= monthStart;
        
        return startedBeforeMonthEnd && endedAfterMonthStart;
      });
      
      const revenue = activeContractsInMonth.reduce(
        (sum, c) => sum + Number(c.monthlyPriceExVat || 0), 
        0
      );
      
      months.push({ month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, monthLabel, revenue });
    }
    
    return months;
  }, [contracts]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Financieel</h1>
        <p className="text-muted-foreground">Hoeveel betalende klanten en wat komt er maandelijks binnen?</p>
      </div>

      {/* Two large KPI tiles */}
      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/advertisers?filter=paying" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2 text-muted-foreground">
                <Users className="h-5 w-5" />
                Betalende Klanten
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-12 w-24" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold" data-testid="kpi-paying-customers">
                    {payingCustomers}
                  </span>
                  <span className="text-muted-foreground text-sm">adverteerders</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Met actief contract en actieve plaatsing
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/advertisers?filter=paying" className="block">
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2 text-muted-foreground">
                <Euro className="h-5 w-5" />
                Maandomzet (MRR)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-12 w-32" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-green-600" data-testid="kpi-mrr">
                    {formatCurrency(monthlyRevenue)}
                  </span>
                  <span className="text-muted-foreground text-sm">/ maand</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Maandelijks terugkerende omzet (ex. BTW)
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Monthly revenue trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Omzet Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyTrendData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="monthLabel" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCurrency(value)}
                    width={80}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), "Omzet"]}
                    labelFormatter={(label) => `Maand: ${label}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center mt-4">
            Maandelijkse omzet gebaseerd op actieve contracten (laatste 12 maanden)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
