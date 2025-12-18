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
  RefreshCw
} from "lucide-react";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  threshold?: number;
}

interface Template {
  id: string;
  name: string;
  type: string;
  content: string;
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

const defaultTemplates: Template[] = [
  {
    id: "whatsapp_offline",
    name: "WhatsApp - Scherm Offline",
    type: "whatsapp",
    content: "Hoi! Scherm {screenId} bij {locationName} lijkt offline. Kun je even checken of de stroom en wifi werken? Bedankt!",
  },
  {
    id: "whatsapp_reminder",
    name: "WhatsApp - Betaalherinnering",
    type: "whatsapp",
    content: "Hoi {contactName}, factuur {invoiceNumber} van €{amount} staat nog open. Kun je de betaling in orde maken? Alvast bedankt!",
  },
  {
    id: "email_welcome",
    name: "Email - Welkom Adverteerder",
    type: "email",
    content: "Beste {contactName},\n\nWelkom bij Elevizion! Je advertentie is nu live op {screenCount} schermen.\n\nMet vriendelijke groet,\nTeam Elevizion",
  },
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<AutomationRule[]>(defaultRules);
  const [templates, setTemplates] = useState<Template[]>(defaultTemplates);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);

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

  const updateTemplate = (templateId: string, content: string) => {
    setTemplates(templates.map(t => 
      t.id === templateId ? { ...t, content } : t
    ));
  };

  const copyTemplate = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Gekopieerd naar klembord" });
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

        <TabsContent value="templates" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Berichten Templates
              </CardTitle>
              <CardDescription>
                Voorgedefinieerde WhatsApp en email berichten
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {templates.map((template) => (
                <div key={template.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {template.type === "whatsapp" ? "WhatsApp" : "Email"}
                      </Badge>
                      <span className="font-medium">{template.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => copyTemplate(template.content)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setEditingTemplate(
                          editingTemplate === template.id ? null : template.id
                        )}
                      >
                        {editingTemplate === template.id ? "Klaar" : "Bewerk"}
                      </Button>
                    </div>
                  </div>
                  {editingTemplate === template.id ? (
                    <Textarea
                      value={template.content}
                      onChange={(e) => updateTemplate(template.id, e.target.value)}
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
                      {template.content}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Variabelen: {"{screenId}"}, {"{locationName}"}, {"{contactName}"}, {"{invoiceNumber}"}, {"{amount}"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
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
