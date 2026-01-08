import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  UserPlus, Megaphone, MapPin, Phone, Mail, Building2, User, 
  Calendar, Loader2, Search, X, ChevronLeft, ChevronRight 
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Lead {
  id: string;
  type: string;
  companyName: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  createdAt: string;
}

interface LeadQueryResult {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  newCount: number;
}

const STATUS_OPTIONS = [
  { value: "nieuw", label: "Nieuw", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "contact", label: "Contact", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "gekwalificeerd", label: "Gekwalificeerd", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "gewonnen", label: "Gewonnen", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "verloren", label: "Verloren", color: "bg-red-50 text-red-700 border-red-200" },
];

function getStatusBadge(status: string) {
  const option = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return <Badge variant="outline" className={`${option.color} text-xs font-medium`}>{option.label}</Badge>;
}

function getTypeBadge(type: string) {
  if (type === "advertiser") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-emerald-200 text-emerald-700 bg-emerald-50">
        <Megaphone className="h-3 w-3" />
        Adverteren
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs border-blue-200 text-blue-700 bg-blue-50">
      <MapPin className="h-3 w-3" />
      Scherm
    </Badge>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function Leads() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Parse URL params
  const params = new URLSearchParams(searchString);
  
  // Local state for filters
  const [searchInput, setSearchInput] = useState(params.get("q") || "");
  const [typeFilter, setTypeFilter] = useState(params.get("type") || "all");
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "all");
  const [onlyNew, setOnlyNew] = useState(params.get("onlyNew") === "true");
  const [dateRange, setDateRange] = useState(params.get("dateRange") || "all");
  const [sortBy, setSortBy] = useState(params.get("sortBy") || "createdAt");
  const [sortDir, setSortDir] = useState(params.get("sortDir") || "desc");
  const [page, setPage] = useState(parseInt(params.get("page") || "1"));
  const [pageSize, setPageSize] = useState(parseInt(params.get("pageSize") || "25"));
  
  // Drawer state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Debounce search input
  const debouncedSearch = useDebounce(searchInput, 400);

  // Build query string for API
  const buildQueryString = useCallback(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("q", debouncedSearch);
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (onlyNew) p.set("onlyNew", "true");
    if (dateRange !== "all") p.set("dateRange", dateRange);
    p.set("sortBy", sortBy);
    p.set("sortDir", sortDir);
    p.set("page", page.toString());
    p.set("pageSize", pageSize.toString());
    return p.toString();
  }, [debouncedSearch, typeFilter, statusFilter, onlyNew, dateRange, sortBy, sortDir, page, pageSize]);

  // Sync filters to URL
  useEffect(() => {
    const qs = buildQueryString();
    navigate(`/leads?${qs}`, { replace: true });
  }, [buildQueryString, navigate]);

  // Fetch leads with filters
  const { data, isLoading, isFetching } = useQuery<LeadQueryResult>({
    queryKey: ["/api/leads", buildQueryString()],
    queryFn: async () => {
      const res = await fetch(`/api/leads?${buildQueryString()}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });

  const leads = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const newCount = data?.newCount || 0;

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update mislukt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Status bijgewerkt", duration: 2000 });
    },
  });

  const handleStatusChange = (id: string, status: string) => {
    updateMutation.mutate({ id, status });
    if (selectedLead && selectedLead.id === id) {
      setSelectedLead({ ...selectedLead, status });
    }
  };

  const openDrawer = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDrawerOpen(true);
  };

  const resetFilters = () => {
    setSearchInput("");
    setTypeFilter("all");
    setStatusFilter("all");
    setOnlyNew(false);
    setDateRange("all");
    setSortBy("createdAt");
    setSortDir("desc");
    setPage(1);
  };

  const handleNewLeadsBadgeClick = () => {
    setOnlyNew(true);
    setSortBy("createdAt");
    setSortDir("desc");
    setPage(1);
  };

  const hasActiveFilters = searchInput || typeFilter !== "all" || statusFilter !== "all" || onlyNew || dateRange !== "all";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-600" />
            Leads
          </h1>
          <p className="text-sm text-muted-foreground">Website aanvragen beheren</p>
        </div>
        {newCount > 0 && (
          <Badge 
            className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors"
            onClick={handleNewLeadsBadgeClick}
            data-testid="badge-new-leads"
          >
            {newCount} nieuwe
          </Badge>
        )}
      </div>

      {/* Toolbar */}
      <Card className="border-muted">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek bedrijf, contact, e-mail..."
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                className="pl-8 h-9 text-sm"
                data-testid="input-search"
              />
            </div>

            {/* Type filter */}
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px] h-9 text-sm" data-testid="select-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle types</SelectItem>
                <SelectItem value="advertiser">Adverteren</SelectItem>
                <SelectItem value="location">Scherm</SelectItem>
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-9 text-sm" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Only new checkbox */}
            <div className="flex items-center gap-1.5">
              <Checkbox 
                id="onlyNew" 
                checked={onlyNew} 
                onCheckedChange={(checked) => { setOnlyNew(!!checked); setPage(1); }}
                data-testid="checkbox-only-new"
              />
              <Label htmlFor="onlyNew" className="text-sm cursor-pointer">Alleen nieuwe</Label>
            </div>

            {/* Date range */}
            <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setPage(1); }}>
              <SelectTrigger className="w-[130px] h-9 text-sm" data-testid="select-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle tijd</SelectItem>
                <SelectItem value="7">Laatste 7 dagen</SelectItem>
                <SelectItem value="30">Laatste 30 dagen</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={`${sortBy}-${sortDir}`} onValueChange={(v) => {
              const [by, dir] = v.split("-");
              setSortBy(by);
              setSortDir(dir);
            }}>
              <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt-desc">Datum (nieuw → oud)</SelectItem>
                <SelectItem value="createdAt-asc">Datum (oud → nieuw)</SelectItem>
                <SelectItem value="companyName-asc">Bedrijf (A → Z)</SelectItem>
                <SelectItem value="companyName-desc">Bedrijf (Z → A)</SelectItem>
                <SelectItem value="status-asc">Status</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 text-muted-foreground">
                <X className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}

            {/* Loading indicator */}
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Geen leads gevonden</p>
              <p className="text-sm">
                {hasActiveFilters ? "Pas de filters aan of reset ze." : "Leads verschijnen hier wanneer bezoekers het formulier invullen."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px]">Datum</TableHead>
                  <TableHead className="w-[110px]">Type</TableHead>
                  <TableHead>Bedrijf</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[80px] text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-muted/40 transition-colors" 
                    onClick={() => openDrawer(lead)}
                    data-testid={`row-lead-${lead.id}`}
                  >
                    <TableCell className="text-sm text-muted-foreground py-3">
                      {format(new Date(lead.createdAt), "d MMM HH:mm", { locale: nl })}
                    </TableCell>
                    <TableCell className="py-3">{getTypeBadge(lead.type)}</TableCell>
                    <TableCell className="font-medium py-3">{lead.companyName}</TableCell>
                    <TableCell className="py-3 text-muted-foreground">{lead.contactName}</TableCell>
                    <TableCell className="py-3">{getStatusBadge(lead.status)}</TableCell>
                    <TableCell className="text-right py-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); openDrawer(lead); }}
                        data-testid={`button-view-${lead.id}`}
                      >
                        Bekijk
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{total} resultaten</span>
            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8 text-sm" data-testid="select-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-8"
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
              Vorige
            </Button>
            <span className="px-2">Pagina {page} van {totalPages}</span>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="h-8"
              data-testid="button-next-page"
            >
              Volgende
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-emerald-600" />
              {selectedLead?.companyName}
            </SheetTitle>
          </SheetHeader>
          {selectedLead && (
            <div className="mt-6 space-y-6">
              {/* Badges */}
              <div className="flex items-center gap-2">
                {getTypeBadge(selectedLead.type)}
                {getStatusBadge(selectedLead.status)}
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Contactpersoon</p>
                    <p className="font-medium">{selectedLead.contactName}</p>
                  </div>
                </div>

                {selectedLead.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">E-mail</p>
                      <a 
                        href={`mailto:${selectedLead.email}`} 
                        className="font-medium text-emerald-600 hover:underline"
                        data-testid="link-email"
                      >
                        {selectedLead.email}
                      </a>
                    </div>
                  </div>
                )}

                {selectedLead.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefoon</p>
                      <a 
                        href={`tel:${selectedLead.phone}`} 
                        className="font-medium text-emerald-600 hover:underline"
                        data-testid="link-phone"
                      >
                        {selectedLead.phone}
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Aangemaakt</p>
                    <p className="font-medium">
                      {format(new Date(selectedLead.createdAt), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status change */}
              <div className="pt-4 border-t space-y-2">
                <Label className="text-sm font-medium">Status wijzigen</Label>
                <Select
                  value={selectedLead.status}
                  onValueChange={(value) => handleStatusChange(selectedLead.id, value)}
                >
                  <SelectTrigger data-testid="select-status-change">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
