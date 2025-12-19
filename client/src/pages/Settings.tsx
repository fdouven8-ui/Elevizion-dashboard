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
import { Checkbox } from "@/components/ui/checkbox";
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
  ToggleRight,
  Target,
  Key,
  UserPlus,
  Shield,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PERMISSIONS, ROLE_PRESETS, type RolePreset } from "@shared/models/auth";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  threshold?: number;
  thresholdType?: "hours" | "days" | "percentage" | "count";
}

interface ActiveHoursSettings {
  startTime: string;
  endTime: string;
  enabled: boolean;
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
  username: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string;
  rolePreset: string | null;
  permissions: string[] | null;
  isActive: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
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
    id: "screen_offline_active",
    name: "Scherm offline tijdens actieve uren",
    description: "Toon melding wanneer scherm offline is tijdens openingstijden",
    trigger: "screen_offline_active",
    enabled: true,
    threshold: 2,
    thresholdType: "hours",
  },
  {
    id: "screen_offline_days",
    name: "Scherm meerdere dagen offline",
    description: "Toon melding wanneer scherm langere tijd niet gezien is",
    trigger: "screen_offline_days",
    enabled: true,
    threshold: 3,
    thresholdType: "days",
  },
  {
    id: "screen_mostly_empty",
    name: "Scherm grotendeels leeg",
    description: "Toon melding wanneer scherm weinig actieve ads heeft",
    trigger: "screen_mostly_empty",
    enabled: true,
    threshold: 50,
    thresholdType: "percentage",
  },
  {
    id: "placement_expiring",
    name: "Plaatsing loopt binnenkort af",
    description: "Toon melding bij naderende einddatum",
    trigger: "placement_expiring",
    enabled: true,
    threshold: 14,
    thresholdType: "days",
  },
  {
    id: "overdue_notice",
    name: "Betaling nog niet ontvangen",
    description: "Toon melding bij openstaande facturen (UIT voor V1)",
    trigger: "overdue_payment",
    enabled: false,
    threshold: 14,
    thresholdType: "days",
  },
];

const defaultActiveHours: ActiveHoursSettings = {
  startTime: "07:00",
  endTime: "23:00",
  enabled: true,
};

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

const PERMISSION_LABELS: Record<string, { label: string; category: string }> = {
  [PERMISSIONS.VIEW_HOME]: { label: "Home bekijken", category: "Core" },
  [PERMISSIONS.VIEW_SCREENS]: { label: "Schermen bekijken", category: "Core" },
  [PERMISSIONS.EDIT_SCREENS]: { label: "Schermen bewerken", category: "Core" },
  [PERMISSIONS.VIEW_ADVERTISERS]: { label: "Adverteerders bekijken", category: "Core" },
  [PERMISSIONS.EDIT_ADVERTISERS]: { label: "Adverteerders bewerken", category: "Core" },
  [PERMISSIONS.VIEW_PLACEMENTS]: { label: "Plaatsingen bekijken", category: "Core" },
  [PERMISSIONS.EDIT_PLACEMENTS]: { label: "Plaatsingen bewerken", category: "Core" },
  [PERMISSIONS.VIEW_FINANCE]: { label: "Financiën bekijken", category: "Core" },
  [PERMISSIONS.VIEW_ONBOARDING]: { label: "Onboarding bekijken", category: "Onboarding" },
  [PERMISSIONS.ONBOARD_ADVERTISERS]: { label: "Adverteerders onboarden", category: "Onboarding" },
  [PERMISSIONS.ONBOARD_SCREENS]: { label: "Schermen onboarden", category: "Onboarding" },
  [PERMISSIONS.MANAGE_TEMPLATES]: { label: "Templates beheren", category: "Admin" },
  [PERMISSIONS.MANAGE_INTEGRATIONS]: { label: "Integraties beheren", category: "Admin" },
  [PERMISSIONS.MANAGE_USERS]: { label: "Gebruikers beheren", category: "Admin" },
  [PERMISSIONS.EDIT_SYSTEM_SETTINGS]: { label: "Systeeminstellingen", category: "Admin" },
};

function UsersManagementTab({ users, queryClient, toast }: { users: UserRole[]; queryClient: any; toast: any }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRole | null>(null);
  const [newUser, setNewUser] = useState({
    username: "",
    displayName: "",
    email: "",
    password: "",
    rolePreset: "readonly" as RolePreset,
    forcePasswordChange: true,
  });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      const permissions = ROLE_PRESETS[data.rolePreset]?.permissions || [];
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...data,
          permissions,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Fout bij aanmaken gebruiker");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsCreateOpen(false);
      setNewUser({ username: "", displayName: "", email: "", password: "", rolePreset: "readonly", forcePasswordChange: true });
      toast({ title: "Gebruiker aangemaakt", description: "De nieuwe gebruiker kan nu inloggen." });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, permissions, rolePreset }: { userId: string; permissions: string[]; rolePreset: string | null }) => {
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ permissions, rolePreset }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Fout bij bijwerken rechten");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsEditOpen(false);
      setEditingUser(null);
      toast({ title: "Rechten bijgewerkt" });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Fout bij resetten wachtwoord");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setTempPassword(data.temporaryPassword);
      toast({ title: "Wachtwoord gereset", description: "Tijdelijk wachtwoord is gegenereerd." });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, activate }: { userId: string; activate: boolean }) => {
      const res = await fetch(`/api/users/${userId}/${activate ? "activate" : "deactivate"}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Fout bij wijzigen status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Status bijgewerkt" });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const openEditDialog = (user: UserRole) => {
    setEditingUser(user);
    setSelectedPermissions(user.permissions || []);
    setIsEditOpen(true);
  };

  const applyRolePreset = (preset: RolePreset) => {
    const presetData = ROLE_PRESETS[preset];
    if (presetData) {
      setSelectedPermissions([...presetData.permissions]);
    }
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  };

  const getMatchingPreset = (permissions: string[]): RolePreset | null => {
    for (const [key, preset] of Object.entries(ROLE_PRESETS)) {
      const presetPerms = [...preset.permissions].sort();
      const userPerms = [...permissions].sort();
      if (presetPerms.length === userPerms.length && presetPerms.every((p, i) => p === userPerms[i])) {
        return key as RolePreset;
      }
    }
    return null;
  };

  const getRolePresetBadge = (preset: string | null) => {
    if (!preset) return <Badge variant="outline">Aangepast</Badge>;
    const presetData = ROLE_PRESETS[preset as RolePreset];
    if (!presetData) return <Badge variant="outline">{preset}</Badge>;
    const colors: Record<string, string> = {
      eigenaar: "bg-purple-100 text-purple-800",
      operatie: "bg-blue-100 text-blue-800",
      sales: "bg-green-100 text-green-800",
      finance: "bg-yellow-100 text-yellow-800",
      readonly: "bg-gray-100 text-gray-800",
    };
    return <Badge className={colors[preset] || ""}>{presetData.name}</Badge>;
  };

  const permissionsByCategory = Object.entries(PERMISSION_LABELS).reduce(
    (acc, [permission, { label, category }]) => {
      if (!acc[category]) acc[category] = [];
      acc[category].push({ permission, label });
      return acc;
    },
    {} as Record<string, { permission: string; label: string }[]>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gebruikersbeheer
            </CardTitle>
            <CardDescription>Beheer wie toegang heeft en met welke rechten</CardDescription>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-user">
                <UserPlus className="h-4 w-4 mr-2" />
                Nieuwe gebruiker
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nieuwe gebruiker aanmaken</DialogTitle>
                <DialogDescription>Maak een nieuw account aan met inloggegevens</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-username">Gebruikersnaam *</Label>
                  <Input
                    id="new-username"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="bijv. jan.jansen"
                    data-testid="input-new-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-displayname">Weergavenaam</Label>
                  <Input
                    id="new-displayname"
                    value={newUser.displayName}
                    onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                    placeholder="bijv. Jan Jansen"
                    data-testid="input-new-displayname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email (optioneel)</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="jan@bedrijf.nl"
                    data-testid="input-new-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Wachtwoord *</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Minimaal 8 karakters"
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select
                    value={newUser.rolePreset}
                    onValueChange={(v) => setNewUser({ ...newUser, rolePreset: v as RolePreset })}
                  >
                    <SelectTrigger data-testid="select-role-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.name} - {preset.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="force-change"
                    checked={newUser.forcePasswordChange}
                    onCheckedChange={(checked) => setNewUser({ ...newUser, forcePasswordChange: checked as boolean })}
                  />
                  <Label htmlFor="force-change" className="text-sm">
                    Wachtwoord wijzigen bij eerste login
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Annuleren
                </Button>
                <Button
                  onClick={() => createUserMutation.mutate(newUser)}
                  disabled={!newUser.username || !newUser.password || createUserMutation.isPending}
                  data-testid="button-confirm-create-user"
                >
                  Aanmaken
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nog geen gebruikers</p>
            <p className="text-sm">Klik op "Nieuwe gebruiker" om te beginnen</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gebruiker</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Laatst ingelogd</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.displayName || user.username || "Onbekend"}</p>
                      <p className="text-sm text-muted-foreground">@{user.username || "-"}</p>
                      {user.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                    </div>
                  </TableCell>
                  <TableCell>{getRolePresetBadge(user.rolePreset)}</TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge className="bg-green-100 text-green-800">Actief</Badge>
                    ) : (
                      <Badge variant="secondary">Inactief</Badge>
                    )}
                    {user.forcePasswordChange && (
                      <Badge variant="outline" className="ml-1 text-xs">
                        Moet wachtwoord wijzigen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("nl-NL") : "Nooit"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        data-testid={`button-edit-user-${user.id}`}
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetPasswordMutation.mutate(user.id)}
                        disabled={resetPasswordMutation.isPending}
                        data-testid={`button-reset-password-${user.id}`}
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate({ userId: user.id, activate: !user.isActive })}
                        disabled={toggleActiveMutation.isPending}
                        data-testid={`button-toggle-active-${user.id}`}
                      >
                        {user.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={!!tempPassword} onOpenChange={() => setTempPassword(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tijdelijk wachtwoord</DialogTitle>
              <DialogDescription>Deel dit wachtwoord veilig met de gebruiker</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <code className="flex-1 font-mono text-lg">{tempPassword}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPassword || "");
                    toast({ title: "Gekopieerd!" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                De gebruiker moet dit wachtwoord wijzigen bij de volgende login.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setTempPassword(null)}>Sluiten</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Rechten bewerken: {editingUser?.displayName || editingUser?.username}</DialogTitle>
              <DialogDescription>Kies een preset of pas individuele rechten aan</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>Rol preset</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                    <Button
                      key={key}
                      variant={getMatchingPreset(selectedPermissions) === key ? "default" : "outline"}
                      size="sm"
                      onClick={() => applyRolePreset(key as RolePreset)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                  <div key={category}>
                    <h4 className="font-medium mb-2">{category}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {permissions.map(({ permission, label }) => (
                        <div key={permission} className="flex items-center gap-2">
                          <Checkbox
                            id={permission}
                            checked={selectedPermissions.includes(permission)}
                            onCheckedChange={() => togglePermission(permission)}
                          />
                          <Label htmlFor={permission} className="text-sm font-normal">
                            {label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Annuleren
              </Button>
              <Button
                onClick={() => {
                  if (editingUser) {
                    updatePermissionsMutation.mutate({
                      userId: editingUser.id,
                      permissions: selectedPermissions,
                      rolePreset: getMatchingPreset(selectedPermissions),
                    });
                  }
                }}
                disabled={updatePermissionsMutation.isPending}
              >
                Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Separator className="my-6" />

        <div>
          <h4 className="font-medium mb-3">Beschikbare rollen</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
              <div key={key} className="p-3 border rounded-lg">
                {getRolePresetBadge(key)}
                <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<AutomationRule[]>(defaultRules);
  const [activeHours, setActiveHours] = useState<ActiveHoursSettings>(defaultActiveHours);
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
  const updateRuleThresholdType = (ruleId: string, thresholdType: "percentage" | "count") => {
    setRules(rules.map(r => 
      r.id === ruleId ? { ...r, thresholdType } : r
    ));
  };

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
              {/* Active Hours Setting */}
              <div className="p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Actieve schermuren</p>
                      <p className="text-sm text-muted-foreground">
                        Schermen buiten deze uren worden niet als offline gemeld
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={activeHours.enabled}
                    onCheckedChange={(checked) => setActiveHours({ ...activeHours, enabled: checked })}
                    data-testid="switch-active-hours"
                  />
                </div>
                {activeHours.enabled && (
                  <div className="flex items-center gap-4 ml-8">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Van</Label>
                      <Input
                        type="time"
                        value={activeHours.startTime}
                        onChange={(e) => setActiveHours({ ...activeHours, startTime: e.target.value })}
                        className="w-28"
                        data-testid="input-start-time"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm text-muted-foreground">Tot</Label>
                      <Input
                        type="time"
                        value={activeHours.endTime}
                        onChange={(e) => setActiveHours({ ...activeHours, endTime: e.target.value })}
                        className="w-28"
                        data-testid="input-end-time"
                      />
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Scherm Monitoring
                </h3>
                <div className="space-y-4">
                  {rules.filter(r => r.trigger === "screen_offline_active" || r.trigger === "screen_offline_days").map((rule) => (
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
                        <span className="text-sm text-muted-foreground">langer dan</span>
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-16"
                          disabled={!rule.enabled}
                          min={1}
                        />
                        <span className="text-sm text-muted-foreground">
                          {rule.thresholdType === "hours" ? "uur" : "dagen"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Inventaris & Plaatsingen
                </h3>
                <div className="space-y-4">
                  {/* Screen mostly empty rule with flexible threshold */}
                  {rules.filter(r => r.trigger === "screen_mostly_empty").map((rule) => (
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
                        <span className="text-sm text-muted-foreground">minder dan</span>
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-16"
                          disabled={!rule.enabled}
                          min={1}
                        />
                        <Select 
                          value={rule.thresholdType || "percentage"} 
                          onValueChange={(v) => updateRuleThresholdType(rule.id, v as "percentage" | "count")}
                          disabled={!rule.enabled}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">% gevuld</SelectItem>
                            <SelectItem value="count">actieve ads</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  
                  {/* Placement expiring rule */}
                  {rules.filter(r => r.trigger === "placement_expiring").map((rule) => (
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
                        <span className="text-sm text-muted-foreground">binnen</span>
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-16"
                          disabled={!rule.enabled}
                          min={1}
                        />
                        <span className="text-sm text-muted-foreground">dagen</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  Betalingen (secundair in V1)
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
                        <span className="text-sm text-muted-foreground">na</span>
                        <Input
                          type="number"
                          value={rule.threshold}
                          onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                          className="w-16"
                          disabled={!rule.enabled}
                          min={1}
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
          <UsersManagementTab users={users} queryClient={queryClient} toast={toast} />
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
