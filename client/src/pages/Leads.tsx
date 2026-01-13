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
  Calendar, Loader2, Search, X, ChevronLeft, ChevronRight, Plus,
  CheckCircle2, Archive, RotateCcw, Trash2, MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
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
  category: string | null;
  createdAt: string;
  isHandled: boolean;
  handledAt: string | null;
  handledBy: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
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

const CATEGORY_OPTIONS = [
  { value: "horeca", label: "Horeca", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "retail", label: "Retail", color: "bg-pink-50 text-pink-700 border-pink-200" },
  { value: "zorg", label: "Zorg & Welzijn", color: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "sport", label: "Sport & Fitness", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { value: "diensten", label: "Zakelijke Diensten", color: "bg-slate-50 text-slate-700 border-slate-200" },
  { value: "automotive", label: "Automotive", color: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  { value: "beauty", label: "Beauty & Wellness", color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { value: "overig", label: "Overig", color: "bg-gray-50 text-gray-700 border-gray-200" },
];

function getStatusBadge(status: string) {
  const option = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return <Badge variant="outline" className={`${option.color} text-xs font-medium`}>{option.label}</Badge>;
}

function getCategoryBadge(category: string | null | undefined) {
  if (!category) return null;
  const option = CATEGORY_OPTIONS.find(c => c.value === category.toLowerCase()) || CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
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
  const [categoryFilter, setCategoryFilter] = useState(params.get("category") || "all");
  const [onlyNew, setOnlyNew] = useState(params.get("onlyNew") === "true");
  const [dateRange, setDateRange] = useState(params.get("dateRange") || "all");
  const [sortBy, setSortBy] = useState(params.get("sortBy") || "createdAt");
  const [sortDir, setSortDir] = useState(params.get("sortDir") || "desc");
  const [page, setPage] = useState(parseInt(params.get("page") || "1"));
  const [pageSize, setPageSize] = useState(parseInt(params.get("pageSize") || "25"));
  
  // Drawer state
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Tab state for workflow status (open/handled/deleted)
  const [workflowTab, setWorkflowTab] = useState<"open" | "handled" | "deleted">(
    params.get("tab") as "open" | "handled" | "deleted" || "open"
  );
  
  // Delete confirmation dialog
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Debounce search input
  const debouncedSearch = useDebounce(searchInput, 400);

  // Build query string for API
  const buildQueryString = useCallback(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("q", debouncedSearch);
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (categoryFilter !== "all") p.set("category", categoryFilter);
    if (onlyNew) p.set("onlyNew", "true");
    if (dateRange !== "all") p.set("dateRange", dateRange);
    
    // Workflow tab filters
    let effectiveSortBy = sortBy;
    if (workflowTab === "open") {
      p.set("isHandled", "false");
      p.set("isDeleted", "false");
    } else if (workflowTab === "handled") {
      p.set("isHandled", "true");
      p.set("isDeleted", "false");
      if (sortBy === "createdAt") effectiveSortBy = "handledAt";
    } else if (workflowTab === "deleted") {
      p.set("isDeleted", "true");
      if (sortBy === "createdAt") effectiveSortBy = "deletedAt";
    }
    
    p.set("tab", workflowTab);
    p.set("sortBy", effectiveSortBy);
    p.set("sortDir", sortDir);
    p.set("page", page.toString());
    p.set("pageSize", pageSize.toString());
    return p.toString();
  }, [debouncedSearch, typeFilter, statusFilter, categoryFilter, onlyNew, dateRange, sortBy, sortDir, page, pageSize, workflowTab]);

  // Sync filters to URL
  useEffect(() => {
    const qs = buildQueryString();
    navigate(`/leads?${qs}`, { replace: true });
  }, [buildQueryString, navigate]);

  // Fetch leads with filters
  const { data, isLoading, isFetching, refetch } = useQuery<LeadQueryResult>({
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

  // Handle mutation (mark as handled/open)
  const handleMutation = useMutation({
    mutationFn: async ({ id, isHandled }: { id: string; isHandled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}/handle`, { isHandled });
      return res.json();
    },
    onSuccess: (_, { isHandled }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ 
        title: isHandled ? "Lead behandeld" : "Lead heropend", 
        description: isHandled ? "Lead is gemarkeerd als behandeld" : "Lead is teruggezet naar open",
        duration: 2000 
      });
      setIsDrawerOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  // Soft delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}/delete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead verwijderd", description: "Lead is verplaatst naar verwijderd", duration: 2000 });
      setIsDrawerOpen(false);
      setDeleteConfirmId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
      setDeleteConfirmId(null);
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}/restore`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead hersteld", description: "Lead is teruggeplaatst", duration: 2000 });
      setIsDrawerOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
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
    setCategoryFilter("all");
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

  const hasActiveFilters = searchInput || typeFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all" || onlyNew || dateRange !== "all";

  const createTestLeadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leads/create-test", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message || "Fout bij aanmaken");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Testlead aangemaakt", description: "Basil's Barbershop is toegevoegd als testlead" });
      refetch();
    },
    onError: (err: Error) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

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
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => createTestLeadMutation.mutate()}
            disabled={createTestLeadMutation.isPending}
            data-testid="button-create-test-lead"
          >
            {createTestLeadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Maak Testlead
          </Button>
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
      </div>

      {/* Workflow Tabs */}
      <Tabs value={workflowTab} onValueChange={(v) => { setWorkflowTab(v as "open" | "handled" | "deleted"); setPage(1); }}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="open" data-testid="tab-open" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Open
          </TabsTrigger>
          <TabsTrigger value="handled" data-testid="tab-handled" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Behandeld
          </TabsTrigger>
          <TabsTrigger value="deleted" data-testid="tab-deleted" className="gap-1.5">
            <Archive className="h-3.5 w-3.5" />
            Verwijderd
          </TabsTrigger>
        </TabsList>
      </Tabs>

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

            {/* Category filter */}
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px] h-9 text-sm" data-testid="select-category">
                <SelectValue placeholder="Categorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle categorieën</SelectItem>
                {CATEGORY_OPTIONS.map(opt => (
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
                  <TableHead className="w-[140px]">Categorie</TableHead>
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
                    <TableCell className="py-3">{getCategoryBadge(lead.category)}</TableCell>
                    <TableCell className="py-3 text-muted-foreground">{lead.contactName}</TableCell>
                    <TableCell className="py-3">{getStatusBadge(lead.status)}</TableCell>
                    <TableCell className="text-right py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`button-actions-${lead.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDrawer(lead); }}>
                            Bekijk details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {workflowTab === "open" && (
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); handleMutation.mutate({ id: lead.id, isHandled: true }); }}
                              data-testid={`button-handle-${lead.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                              Markeer als behandeld
                            </DropdownMenuItem>
                          )}
                          {workflowTab === "handled" && (
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); handleMutation.mutate({ id: lead.id, isHandled: false }); }}
                              data-testid={`button-reopen-${lead.id}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-2 text-blue-600" />
                              Zet terug naar open
                            </DropdownMenuItem>
                          )}
                          {workflowTab === "deleted" && (
                            <DropdownMenuItem 
                              onClick={(e) => { e.stopPropagation(); restoreMutation.mutate(lead.id); }}
                              data-testid={`button-restore-${lead.id}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-2 text-blue-600" />
                              Herstellen
                            </DropdownMenuItem>
                          )}
                          {workflowTab !== "deleted" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(lead.id); }}
                                className="text-red-600"
                                data-testid={`button-delete-${lead.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Verwijderen
                              </DropdownMenuItem>
                            </>
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

              {/* Workflow timestamps */}
              {selectedLead.handledAt && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Behandeld op</p>
                    <p className="font-medium">
                      {format(new Date(selectedLead.handledAt), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                      {selectedLead.handledBy && <span className="text-muted-foreground"> door {selectedLead.handledBy}</span>}
                    </p>
                  </div>
                </div>
              )}

              {/* Workflow actions */}
              <div className="pt-4 border-t space-y-2">
                <Label className="text-sm font-medium">Acties</Label>
                <div className="flex flex-wrap gap-2">
                  {!selectedLead.isHandled && !selectedLead.isDeleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMutation.mutate({ id: selectedLead.id, isHandled: true })}
                      disabled={handleMutation.isPending}
                      data-testid="button-drawer-handle"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" />
                      Markeer als behandeld
                    </Button>
                  )}
                  {selectedLead.isHandled && !selectedLead.isDeleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMutation.mutate({ id: selectedLead.id, isHandled: false })}
                      disabled={handleMutation.isPending}
                      data-testid="button-drawer-reopen"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5 text-blue-600" />
                      Zet terug naar open
                    </Button>
                  )}
                  {selectedLead.isDeleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreMutation.mutate(selectedLead.id)}
                      disabled={restoreMutation.isPending}
                      data-testid="button-drawer-restore"
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5 text-blue-600" />
                      Herstellen
                    </Button>
                  )}
                  {!selectedLead.isDeleted && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteConfirmId(selectedLead.id)}
                      data-testid="button-drawer-delete"
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Verwijderen
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lead verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze lead wilt verwijderen? De lead wordt verplaatst naar het archief en kan later worden hersteld.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
