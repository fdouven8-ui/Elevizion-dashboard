import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Zap, 
  MessageSquare,
  Users,
  Link2,
  Wallet,
  Save,
  Monitor,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  Plus,
  Search,
  Eye,
  History,
  Trash2,
  FileText,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  threshold?: number;
}

interface DbTemplate {
  id: string;
  name: string;
  category: string;
  subject?: string | null;
  body: string;
  language?: string | null;
  isEnabled: boolean;
  version: number;
  placeholders?: string[] | null;
  eSignTemplateId?: string | null;
  moneybirdStyleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  subject?: string | null;
  body: string;
  createdAt: string;
}

interface Advertiser {
  id: string;
  companyName: string;
  contactName: string;
}

interface Screen {
  id: string;
  screenId?: string | null;
  name: string;
}

interface UserRole {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface SyncStatus {
  yodeck: { lastSync: string; status: string; itemsProcessed: number };
  moneybird: { lastSync: string; status: string; itemsProcessed: number };
}

interface OverdueAdvertiser {
  id: string;
  companyName: string;
  daysOverdue: number;
  amount: number;
}

const defaultRules: AutomationRule[] = [
  {
    id: "screen_offline_30",
    name: "Scherm offline > 30 min",
    description: "Maak automatisch een Issue aan",
    trigger: "screen_offline",
    enabled: true,
    threshold: 30,
  },
  {
    id: "screen_offline_120",
    name: "Scherm offline > 2 uur",
    description: "Escaleer alert naar eigenaar",
    trigger: "screen_offline",
    enabled: true,
    threshold: 120,
  },
  {
    id: "empty_inventory",
    name: "Lege inventaris (< 20 plaatsingen)",
    description: "Alert + checklist item aanmaken",
    trigger: "empty_inventory",
    enabled: true,
    threshold: 20,
  },
  {
    id: "placement_expiring",
    name: "Plaatsing verloopt in 14 dagen",
    description: "Alert tonen in Control Room",
    trigger: "placement_expiring",
    enabled: true,
    threshold: 14,
  },
  {
    id: "overdue_hold",
    name: "Achterstallig > 14 dagen → HOLD",
    description: "Zet plaatsingen automatisch op HOLD (UIT voor V1)",
    trigger: "overdue_payment",
    enabled: false,
    threshold: 14,
  },
];

const TEMPLATE_CATEGORIES = [
  { value: "all", label: "Alle" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "contract", label: "Contracten" },
  { value: "invoice", label: "Factuur/Offerte" },
  { value: "internal", label: "Intern" },
];

const FIELD_NAMES: Record<string, string> = {
  "advertiser_name": "Bedrijfsnaam",
  "contact_name": "Contactpersoon",
  "phone": "Telefoon",
  "email": "Email",
  "screen_id": "Scherm ID",
  "location_name": "Locatie",
  "price": "Prijs",
  "start_date": "Startdatum",
  "bedrijfsnaam": "Bedrijfsnaam",
  "contactpersoon": "Contactpersoon",
  "telefoon": "Telefoon"
};

function formatTemplateBody(body: string): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
    const friendlyName = FIELD_NAMES[varName.trim()] || varName;
    return `[${friendlyName}]`;
  });
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<AutomationRule[]>(defaultRules);
  const [templateCategory, setTemplateCategory] = useState("all");
  const [templateSearch, setTemplateSearch] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<DbTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<DbTemplate | null>(null);
  const [previewAdvertiserId, setPreviewAdvertiserId] = useState("");
  const [previewScreenId, setPreviewScreenId] = useState("");
  const [previewResult, setPreviewResult] = useState<{ subject: string; body: string } | null>(null);
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [isNewTemplateOpen, setIsNewTemplateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", category: "whatsapp", subject: "", body: "" });

  const { data: users = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/users");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ["/api/sync/status"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/sync/status");
        return res.json();
      } catch {
        return {
          yodeck: { lastSync: "-", status: "unknown", itemsProcessed: 0 },
          moneybird: { lastSync: "-", status: "unknown", itemsProcessed: 0 },
        };
      }
    },
    refetchInterval: 60000,
  });

  const { data: overdueAdvertisers = [] } = useQuery<OverdueAdvertiser[]>({
    queryKey: ["/api/finance/overdue"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/finance/overdue");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<DbTemplate[]>({
    queryKey: ["/api/templates", templateCategory],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/templates?category=${templateCategory}`);
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

  const { data: screens = [] } = useQuery<Screen[]>({
    queryKey: ["/api/screens"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/screens");
      return res.json();
    },
  });

  const { data: templateVersions = [] } = useQuery<TemplateVersion[]>({
    queryKey: ["/api/templates", showVersions, "versions"],
    queryFn: async () => {
      if (!showVersions) return [];
      const res = await apiRequest("GET", `/api/templates/${showVersions}/versions`);
      return res.json();
    },
    enabled: !!showVersions,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof newTemplate) => {
      const res = await apiRequest("POST", "/api/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsNewTemplateOpen(false);
      setNewTemplate({ name: "", category: "whatsapp", subject: "", body: "" });
      toast({ title: "Template aangemaakt" });
    },
    onError: () => {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DbTemplate> }) => {
      const res = await apiRequest("PATCH", `/api/templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setEditingTemplate(null);
      toast({ title: "Template bijgewerkt" });
    },
    onError: () => {
      toast({ title: "Fout bij bijwerken", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template verwijderd" });
    },
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/templates/${id}/duplicate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template gedupliceerd" });
    },
  });

  const previewTemplateMutation = useMutation({
    mutationFn: async ({ id, advertiserId, screenId }: { id: string; advertiserId?: string; screenId?: string }) => {
      const res = await apiRequest("POST", `/api/templates/${id}/preview`, { advertiserId, screenId });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewResult(data);
    },
  });

  const toggleRule = (ruleId: string) => {
    setRules(rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
    toast({ title: "Automatisering bijgewerkt" });
  };

  const updateThreshold = (ruleId: string, threshold: number) => {
    setRules(rules.map(r => 
      r.id === ruleId ? { ...r, threshold } : r
    ));
  };

  const copyTemplate = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Gekopieerd naar klembord" });
  };

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.body.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const getCategoryLabel = (category: string) => {
    const cat = TEMPLATE_CATEGORIES.find(c => c.value === category);
    return cat?.label || category;
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      whatsapp: "bg-green-100 text-green-800",
      email: "bg-blue-100 text-blue-800",
      contract: "bg-purple-100 text-purple-800",
      invoice: "bg-amber-100 text-amber-800",
      internal: "bg-gray-100 text-gray-800",
    };
    return <Badge className={colors[category] || "bg-gray-100"}>{getCategoryLabel(category)}</Badge>;
  };

  const saveSettings = () => {
    toast({ title: "Instellingen opgeslagen" });
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-purple-100 text-purple-800",
      ops: "bg-blue-100 text-blue-800",
      sales: "bg-green-100 text-green-800",
      finance: "bg-amber-100 text-amber-800",
      viewer: "bg-gray-100 text-gray-800",
    };
    const labels: Record<string, string> = {
      admin: "Eigenaar",
      ops: "Operatie",
      sales: "Sales",
      finance: "Financieel",
      viewer: "Viewer",
    };
    return <Badge className={colors[role] || ""}>{labels[role] || role}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Instellingen</h1>
          <p className="text-muted-foreground">Automatiseringen, templates en systeemconfiguratie</p>
        </div>
        <Button onClick={saveSettings} data-testid="button-save">
          <Save className="h-4 w-4 mr-2" />
          Opslaan
        </Button>
      </div>

      <Tabs defaultValue="automations">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="automations" className="gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Automatiseringen</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Gebruikers</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Integraties</span>
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Financieel</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Automatiseringen
              </CardTitle>
              <CardDescription>
                OPS-first regels die automatisch acties uitvoeren
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Scherm Monitoring
                </h3>
                <div className="space-y-4">
                  {rules.filter(r => r.trigger === "screen_offline").map((rule) => (
                    <div 
                      key={rule.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`rule-${rule.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleRule(rule.id)}
                        />
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-sm text-muted-foreground">{rule.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-20"
                          disabled={!rule.enabled}
                        />
                        <span className="text-sm text-muted-foreground">min</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Inventaris & Plaatsingen
                </h3>
                <div className="space-y-4">
                  {rules.filter(r => r.trigger === "empty_inventory" || r.trigger === "placement_expiring").map((rule) => (
                    <div 
                      key={rule.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleRule(rule.id)}
                        />
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-sm text-muted-foreground">{rule.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-20"
                          disabled={!rule.enabled}
                        />
                        <span className="text-sm text-muted-foreground">
                          {rule.trigger === "empty_inventory" ? "plaatsingen" : "dagen"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  Betaling (secundair in V1)
                </h3>
                <div className="space-y-4">
                  {rules.filter(r => r.trigger === "overdue_payment").map((rule) => (
                    <div 
                      key={rule.id} 
                      className="flex items-center justify-between p-4 border rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleRule(rule.id)}
                        />
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-sm text-muted-foreground">{rule.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-20"
                          disabled={!rule.enabled}
                        />
                        <span className="text-sm text-muted-foreground">dagen</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Template Center
                  </CardTitle>
                  <CardDescription>
                    Beheer alle berichten en document templates
                  </CardDescription>
                </div>
                <Dialog open={isNewTemplateOpen} onOpenChange={setIsNewTemplateOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-template">
                      <Plus className="h-4 w-4 mr-2" />
                      Nieuwe Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Nieuwe Template Aanmaken</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Naam</Label>
                          <Input
                            value={newTemplate.name}
                            onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                            placeholder="Template naam..."
                            data-testid="input-template-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Categorie</Label>
                          <Select value={newTemplate.category} onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}>
                            <SelectTrigger data-testid="select-template-category">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMPLATE_CATEGORIES.filter(c => c.value !== "all").map((cat) => (
                                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {(newTemplate.category === "email" || newTemplate.category === "contract") && (
                        <div className="space-y-2">
                          <Label>Onderwerp</Label>
                          <Input
                            value={newTemplate.subject}
                            onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                            placeholder="Email onderwerp..."
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Bericht samenstellen</Label>
                        <div className="border rounded-lg p-3 min-h-[120px] bg-white">
                          {newTemplate.body ? (
                            <p className="text-sm whitespace-pre-wrap">
                              {formatTemplateBody(newTemplate.body)}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              Klik op de velden hieronder om je bericht op te bouwen, of typ direct in het tekstveld.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-medium mb-2">Klik om een veld toe te voegen:</p>
                        <div className="flex flex-wrap gap-2">
                          {["Bedrijfsnaam", "Contactpersoon", "Telefoon", "Email", "Scherm ID", "Locatie", "Prijs", "Startdatum"].map((field) => {
                            const varName = {
                              "Bedrijfsnaam": "advertiser_name",
                              "Contactpersoon": "contact_name", 
                              "Telefoon": "phone",
                              "Email": "email",
                              "Scherm ID": "screen_id",
                              "Locatie": "location_name",
                              "Prijs": "price",
                              "Startdatum": "start_date"
                            }[field];
                            return (
                              <Button
                                key={field}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => setNewTemplate({ ...newTemplate, body: newTemplate.body + `{{${varName}}}` })}
                              >
                                + {field}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Bewerk tekst direct</summary>
                        <Textarea
                          value={newTemplate.body}
                          onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                          placeholder="Typ hier je bericht..."
                          rows={5}
                          className="mt-2 font-mono text-xs"
                          data-testid="textarea-template-body"
                        />
                      </details>
                      <Button 
                        className="w-full" 
                        onClick={() => createTemplateMutation.mutate(newTemplate)}
                        disabled={!newTemplate.name || !newTemplate.body || createTemplateMutation.isPending}
                        data-testid="button-create-template"
                      >
                        Template Aanmaken
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Zoeken..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-template-search"
                  />
                </div>
                <div className="flex gap-1">
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <Button
                      key={cat.value}
                      variant={templateCategory === cat.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTemplateCategory(cat.value)}
                      data-testid={`filter-category-${cat.value}`}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>

              {templatesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Geen templates gevonden</p>
                  <p className="text-sm">Maak een nieuwe template aan om te beginnen</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <div key={template.id} className="border rounded-lg p-4" data-testid={`template-${template.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getCategoryBadge(template.category)}
                            <span className="font-medium">{template.name}</span>
                            {!template.isEnabled && (
                              <Badge variant="secondary" className="text-xs">Uitgeschakeld</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">v{template.version}</span>
                          </div>
                          {template.subject && (
                            <p className="text-sm text-muted-foreground mb-1">
                              <span className="font-medium">Onderwerp:</span> {template.subject}
                            </p>
                          )}
                          <p className="text-sm bg-muted p-3 rounded whitespace-pre-wrap max-h-32 overflow-auto">
                            {formatTemplateBody(template.body)}
                          </p>
                          {template.placeholders && template.placeholders.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              <span className="text-xs text-muted-foreground">Velden:</span>
                              {template.placeholders.map(p => (
                                <Badge key={p} variant="secondary" className="text-xs">
                                  {FIELD_NAMES[p] || p}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="icon" onClick={() => copyTemplate(template.body)} title="Kopiëren" data-testid={`button-copy-${template.id}`}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setPreviewTemplate(template); setPreviewResult(null); }} title="Preview" data-testid={`button-preview-${template.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingTemplate(template)} title="Bewerken" data-testid={`button-edit-${template.id}`}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setShowVersions(template.id)} title="Versies" data-testid={`button-versions-${template.id}`}>
                            <History className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => duplicateTemplateMutation.mutate(template.id)} title="Dupliceren">
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => updateTemplateMutation.mutate({ id: template.id, data: { isEnabled: !template.isEnabled } })}
                            title={template.isEnabled ? "Uitschakelen" : "Inschakelen"}
                          >
                            {template.isEnabled ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteTemplateMutation.mutate(template.id)} title="Verwijderen" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Template Dialog */}
          <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Template Bewerken</DialogTitle>
              </DialogHeader>
              {editingTemplate && (
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Naam</Label>
                      <Input
                        value={editingTemplate.name}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Categorie</Label>
                      <Select value={editingTemplate.category} onValueChange={(v) => setEditingTemplate({ ...editingTemplate, category: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_CATEGORIES.filter(c => c.value !== "all").map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(editingTemplate.category === "email" || editingTemplate.category === "contract") && (
                    <div className="space-y-2">
                      <Label>Onderwerp</Label>
                      <Input
                        value={editingTemplate.subject || ""}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Inhoud</Label>
                    <Textarea
                      value={editingTemplate.body}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                      rows={10}
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => updateTemplateMutation.mutate({ id: editingTemplate.id, data: { name: editingTemplate.name, category: editingTemplate.category, subject: editingTemplate.subject, body: editingTemplate.body } })}
                    disabled={updateTemplateMutation.isPending}
                  >
                    Opslaan
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Preview Template Dialog */}
          <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Template Preview: {previewTemplate?.name}</DialogTitle>
              </DialogHeader>
              {previewTemplate && (
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Adverteerder (optioneel)</Label>
                      <Select value={previewAdvertiserId} onValueChange={setPreviewAdvertiserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer adverteerder..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Geen</SelectItem>
                          {advertisers.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.companyName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Scherm (optioneel)</Label>
                      <Select value={previewScreenId} onValueChange={setPreviewScreenId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecteer scherm..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Geen</SelectItem>
                          {screens.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.screenId || s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button 
                    onClick={() => previewTemplateMutation.mutate({ id: previewTemplate.id, advertiserId: previewAdvertiserId || undefined, screenId: previewScreenId || undefined })}
                    disabled={previewTemplateMutation.isPending}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Genereren
                  </Button>
                  {previewResult && (
                    <div className="space-y-2 mt-4">
                      {previewResult.subject && (
                        <div>
                          <Label>Onderwerp:</Label>
                          <p className="bg-muted p-2 rounded text-sm">{previewResult.subject}</p>
                        </div>
                      )}
                      <div>
                        <Label>Inhoud:</Label>
                        <p className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">{previewResult.body}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Version History Dialog */}
          <Dialog open={!!showVersions} onOpenChange={(open) => !open && setShowVersions(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Versiegeschiedenis</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-4 max-h-96 overflow-auto">
                {templateVersions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">Geen eerdere versies beschikbaar</p>
                ) : (
                  templateVersions.map((v) => (
                    <div key={v.id} className="border rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">Versie {v.version}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString("nl-NL")}
                        </span>
                      </div>
                      <p className="text-sm bg-muted p-2 rounded max-h-20 overflow-auto">{v.body}</p>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Gebruikers & Rollen
              </CardTitle>
              <CardDescription>
                Wie heeft toegang en met welke rol
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nog geen gebruikers</p>
                  <p className="text-sm">Gebruikers worden automatisch toegevoegd na inloggen</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.isActive ? (
                            <Badge className="bg-green-100 text-green-800">Actief</Badge>
                          ) : (
                            <Badge variant="secondary">Inactief</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Separator className="my-6" />

              <div>
                <h4 className="font-medium mb-3">Beschikbare rollen</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 border rounded-lg">
                    {getRoleBadge("admin")}
                    <p className="text-xs text-muted-foreground mt-1">Volledige toegang</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    {getRoleBadge("ops")}
                    <p className="text-xs text-muted-foreground mt-1">Schermen & issues</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    {getRoleBadge("sales")}
                    <p className="text-xs text-muted-foreground mt-1">Adverteerders</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    {getRoleBadge("finance")}
                    <p className="text-xs text-muted-foreground mt-1">Alleen-lezen</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Integraties
              </CardTitle>
              <CardDescription>
                API koppelingen en sync status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-5 w-5" />
                      <span className="font-medium">Yodeck</span>
                    </div>
                    {syncStatus?.yodeck?.status === "success" ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Laatste sync</span>
                      <span>{syncStatus?.yodeck?.lastSync || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Items verwerkt</span>
                      <span>{syncStatus?.yodeck?.itemsProcessed || 0}</span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full mt-4" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" /> Sync Nu
                  </Button>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      <span className="font-medium">Moneybird</span>
                    </div>
                    {syncStatus?.moneybird?.status === "success" ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Laatste sync</span>
                      <span>{syncStatus?.moneybird?.lastSync || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Items verwerkt</span>
                      <span>{syncStatus?.moneybird?.itemsProcessed || 0}</span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full mt-4" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" /> Sync Nu
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> API keys worden beheerd via environment variables. 
                  Polling gebeurt elke 5-10 minuten. UI leest uit database, niet live API.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Financieel Overzicht
              </CardTitle>
              <CardDescription>
                Read-only data - secundair in V1
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end">
                <Button variant="outline" asChild>
                  <a href="https://moneybird.com" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" /> Open Moneybird
                  </a>
                </Button>
              </div>

              {overdueAdvertisers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>Geen achterstallige adverteerders</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Dagen achterstallig</TableHead>
                      <TableHead>Bedrag</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueAdvertisers.map((adv) => (
                      <TableRow key={adv.id}>
                        <TableCell className="font-medium">{adv.companyName}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{adv.daysOverdue}d</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(adv.amount)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
