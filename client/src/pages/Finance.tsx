import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  startDate?: string;
  endDate?: string;
}

interface Screen {
  id: string;
  screenId: string;
  locationId: string;
  groupId?: string;
}

interface Location {
  id: string;
  city?: string;
}

interface ScreenGroup {
  id: string;
  name: string;
}

type TimeRange = "3" | "6" | "12";
type ViewMode = "total" | "average";
type ScopeType = "all" | "city" | "group";

export default function Finance() {
  const [timeRange, setTimeRange] = useState<TimeRange>("12");
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  const [scopeType, setScopeType] = useState<ScopeType>("all");
  const [scopeValue, setScopeValue] = useState<string>("all");

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

  const { data: screens = [], isLoading: screensLoading } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/screens");
      return res.json();
    },
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/locations");
      return res.json();
    },
  });

  const { data: screenGroups = [] } = useQuery<ScreenGroup[]>({
    queryKey: ["/api/screen-groups"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/screen-groups");
      return res.json();
    },
  });

  const isLoading = contractsLoading || placementsLoading || screensLoading || locationsLoading;

  // Get unique cities from locations
  const cities = useMemo(() => {
    const uniqueCities = new Set<string>();
    locations.forEach(loc => {
      if (loc.city) uniqueCities.add(loc.city);
    });
    return Array.from(uniqueCities).sort();
  }, [locations]);

  // Map public screenId (EVZ-001) to their locations for city filtering
  const screenLocationMap = useMemo(() => {
    const map = new Map<string, Location>();
    screens.forEach(screen => {
      const location = locations.find(l => l.id === screen.locationId);
      if (location) map.set(screen.screenId, location);
    });
    return map;
  }, [screens, locations]);

  // Map public screenId (EVZ-001) to their groups
  const screenGroupMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    screens.forEach(screen => {
      map.set(screen.screenId, screen.groupId);
    });
    return map;
  }, [screens]);

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

  // Filter placements based on scope (placement.screenId is the public ID like EVZ-001)
  const getFilteredPlacements = useMemo(() => {
    if (scopeType === "all" || scopeValue === "all") {
      return placements;
    }
    
    return placements.filter(placement => {
      // placement.screenId is the public screen ID (EVZ-001)
      const publicScreenId = placement.screenId;
      
      if (scopeType === "city") {
        const location = screenLocationMap.get(publicScreenId);
        return location?.city === scopeValue;
      }
      
      if (scopeType === "group") {
        const groupId = screenGroupMap.get(publicScreenId);
        return groupId === scopeValue;
      }
      
      return true;
    });
  }, [placements, screenLocationMap, screenGroupMap, scopeType, scopeValue]);

  // Helper to check if a placement was active during a given month
  const wasPlacementActiveInMonth = (placement: Placement, monthStart: Date, monthEnd: Date): boolean => {
    // If placement has start/end dates, use them for historical accuracy
    if (placement.startDate) {
      const placementStart = new Date(placement.startDate);
      const placementEnd = placement.endDate ? new Date(placement.endDate) : null;
      
      const startedBeforeMonthEnd = placementStart <= monthEnd;
      const endedAfterMonthStart = !placementEnd || placementEnd >= monthStart;
      
      return startedBeforeMonthEnd && endedAfterMonthStart;
    }
    
    // Fallback: if no dates, use current isActive status
    return placement.isActive;
  };

  // Generate monthly revenue trend data based on filters
  const monthlyTrendData = useMemo(() => {
    const months: { month: string; monthLabel: string; revenue: number; payingCount: number }[] = [];
    const now = new Date();
    const monthCount = parseInt(timeRange);
    
    for (let i = monthCount - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = date.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" });
      
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      // Get contract IDs with active placements during this specific month (with scope filter)
      const activeContractIdsInMonth = new Set<string>();
      getFilteredPlacements.forEach(placement => {
        if (wasPlacementActiveInMonth(placement, monthStart, monthEnd)) {
          activeContractIdsInMonth.add(placement.contractId);
        }
      });
      
      const activeContractsInMonth = contracts.filter(c => {
        if (c.status !== "signed" && c.status !== "active") return false;
        
        // Apply scope filter: only include contracts with placements in scope during this month
        if (scopeType !== "all" && scopeValue !== "all") {
          if (!activeContractIdsInMonth.has(c.id)) return false;
        }
        
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
      
      // Count unique paying advertisers for this month
      const payingAdvertiserIds = new Set<string>();
      activeContractsInMonth.forEach(c => payingAdvertiserIds.add(c.advertiserId));
      const payingCount = payingAdvertiserIds.size;
      
      months.push({ 
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, 
        monthLabel, 
        revenue,
        payingCount
      });
    }
    
    return months;
  }, [contracts, timeRange, scopeType, scopeValue, getFilteredPlacements]);

  // Calculate display data based on view mode
  const chartData = useMemo(() => {
    if (viewMode === "average") {
      return monthlyTrendData.map(m => ({
        ...m,
        displayValue: m.payingCount > 0 ? Math.round(m.revenue / m.payingCount) : 0
      }));
    }
    return monthlyTrendData.map(m => ({ ...m, displayValue: m.revenue }));
  }, [monthlyTrendData, viewMode]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleScopeTypeChange = (value: ScopeType) => {
    setScopeType(value);
    setScopeValue("all");
  };

  const hasCities = cities.length > 0;
  const hasGroups = screenGroups.length > 0;
  const hasScopes = hasCities || hasGroups;

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
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Omzet Trend
            </CardTitle>
            
            {/* Filters - compact inline layout */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Time range buttons */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={timeRange === "3" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange("3")}
                  className="h-7 px-3 text-xs"
                  data-testid="filter-time-3"
                >
                  3 maanden
                </Button>
                <Button
                  variant={timeRange === "6" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange("6")}
                  className="h-7 px-3 text-xs"
                  data-testid="filter-time-6"
                >
                  6 maanden
                </Button>
                <Button
                  variant={timeRange === "12" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange("12")}
                  className="h-7 px-3 text-xs"
                  data-testid="filter-time-12"
                >
                  12 maanden
                </Button>
              </div>

              {/* View mode toggle */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={viewMode === "total" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("total")}
                  className="h-7 px-3 text-xs"
                  data-testid="filter-view-total"
                >
                  Totaal
                </Button>
                <Button
                  variant={viewMode === "average" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("average")}
                  className="h-7 px-3 text-xs"
                  data-testid="filter-view-average"
                >
                  Gem. per klant
                </Button>
              </div>

              {/* Scope filter - only show if data exists */}
              {hasScopes && (
                <div className="flex items-center gap-2">
                  <Select value={scopeType} onValueChange={(v) => handleScopeTypeChange(v as ScopeType)}>
                    <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="filter-scope-type">
                      <SelectValue placeholder="Bereik" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alles</SelectItem>
                      {hasCities && <SelectItem value="city">Per Plaats</SelectItem>}
                      {hasGroups && <SelectItem value="group">Per Groep</SelectItem>}
                    </SelectContent>
                  </Select>

                  {scopeType === "city" && hasCities && (
                    <Select value={scopeValue} onValueChange={setScopeValue}>
                      <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="filter-scope-city">
                        <SelectValue placeholder="Kies plaats" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle plaatsen</SelectItem>
                        {cities.map(city => (
                          <SelectItem key={city} value={city}>{city}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {scopeType === "group" && hasGroups && (
                    <Select value={scopeValue} onValueChange={setScopeValue}>
                      <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="filter-scope-group">
                        <SelectValue placeholder="Kies groep" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle groepen</SelectItem>
                        {screenGroups.map(group => (
                          <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
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
                    formatter={(value: number) => [
                      formatCurrency(value), 
                      viewMode === "average" ? "Gem. per klant" : "Omzet"
                    ]}
                    labelFormatter={(label) => `Maand: ${label}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="displayValue"
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
            {viewMode === "average" 
              ? `Gemiddelde omzet per betalende klant (laatste ${timeRange} maanden)`
              : `Maandelijkse omzet gebaseerd op actieve contracten (laatste ${timeRange} maanden)`
            }
            {scopeType !== "all" && scopeValue !== "all" && (
              <span className="font-medium">
                {scopeType === "city" ? ` — ${scopeValue}` : ` — ${screenGroups.find(g => g.id === scopeValue)?.name || scopeValue}`}
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
