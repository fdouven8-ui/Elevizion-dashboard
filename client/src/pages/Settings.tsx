import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Settings as SettingsIcon, 
  Zap, 
  Bell, 
  Clock,
  MessageSquare,
  Pause,
  AlertTriangle,
  Monitor,
  Save,
  Users
} from "lucide-react";

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  enabled: boolean;
  threshold?: number;
}

interface UserRole {
  id: string;
  name: string;
  email: string;
  role: string;
}

const defaultRules: AutomationRule[] = [
  {
    id: "invoice_reminder_3",
    name: "Vriendelijke herinnering (3 dagen)",
    description: "Stuur een vriendelijke herinnering als factuur 3 dagen achterstallig is",
    trigger: "invoice_overdue",
    action: "send_reminder",
    enabled: true,
    threshold: 3,
  },
  {
    id: "invoice_reminder_7",
    name: "Tweede herinnering + belactie (7 dagen)",
    description: "Stuur herinnering en maak een belactie aan bij 7 dagen achterstallig",
    trigger: "invoice_overdue",
    action: "send_reminder_create_task",
    enabled: true,
    threshold: 7,
  },
  {
    id: "invoice_pause_14",
    name: "Ads pauzeren (14 dagen)",
    description: "Zet alle plaatsingen van adverteerder automatisch op HOLD",
    trigger: "invoice_overdue",
    action: "pause_placements",
    enabled: true,
    threshold: 14,
  },
  {
    id: "screen_offline_60",
    name: "Scherm offline alert (60 min)",
    description: "Maak ops-alert aan als scherm langer dan 60 minuten offline is",
    trigger: "screen_offline",
    action: "create_ops_alert",
    enabled: true,
    threshold: 60,
  },
  {
    id: "screen_offline_240",
    name: "Escalatie naar eigenaar (4 uur)",
    description: "Stuur melding naar eigenaar als scherm langer dan 4 uur offline is",
    trigger: "screen_offline",
    action: "escalate_owner",
    enabled: true,
    threshold: 240,
  },
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<AutomationRule[]>(defaultRules);

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

  const toggleRule = (ruleId: string) => {
    setRules(rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
    toast({ title: "Instelling bijgewerkt" });
  };

  const updateThreshold = (ruleId: string, threshold: number) => {
    setRules(rules.map(r => 
      r.id === ruleId ? { ...r, threshold } : r
    ));
  };

  const saveSettings = () => {
    toast({ title: "Instellingen opgeslagen" });
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "Eigenaar";
      case "ops": return "Operatie";
      case "sales": return "Sales";
      case "finance": return "Financieel";
      default: return role;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-100 text-purple-800">Eigenaar</Badge>;
      case "ops":
        return <Badge className="bg-blue-100 text-blue-800">Operatie</Badge>;
      case "sales":
        return <Badge className="bg-green-100 text-green-800">Sales</Badge>;
      case "finance":
        return <Badge className="bg-amber-100 text-amber-800">Financieel</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Instellingen</h1>
          <p className="text-muted-foreground">Automatiseringen en systeemconfiguratie</p>
        </div>
        <Button onClick={saveSettings} data-testid="button-save">
          <Save className="h-4 w-4 mr-2" />
          Opslaan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Automatiseringen
          </CardTitle>
          <CardDescription>
            Regels die automatisch acties uitvoeren. Zet aan of uit per regel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Factuur herinneringen
            </h3>
            <div className="space-y-4">
              {rules.filter(r => r.trigger === "invoice_overdue").map((rule) => (
                <div 
                  key={rule.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`rule-${rule.id}`}
                >
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                      data-testid={`switch-${rule.id}`}
                    />
                    <div>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Na</Label>
                    <Input
                      type="number"
                      value={rule.threshold}
                      onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                      className="w-16"
                      disabled={!rule.enabled}
                    />
                    <span className="text-sm text-muted-foreground">dagen</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Scherm monitoring
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
                      data-testid={`switch-${rule.id}`}
                    />
                    <div>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Na</Label>
                    <Input
                      type="number"
                      value={rule.threshold}
                      onChange={(e) => updateThreshold(rule.id, parseInt(e.target.value) || 0)}
                      className="w-16"
                      disabled={!rule.enabled}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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
            <div className="space-y-3">
              {users.map((user) => (
                <div 
                  key={user.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  {getRoleBadge(user.role)}
                </div>
              ))}
            </div>
          )}

          <Separator className="my-6" />

          <div>
            <h4 className="font-medium mb-3">Beschikbare rollen</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {getRoleBadge("admin")}
                </div>
                <p className="text-sm text-muted-foreground">Volledige toegang</p>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {getRoleBadge("ops")}
                </div>
                <p className="text-sm text-muted-foreground">Schermen & issues</p>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {getRoleBadge("sales")}
                </div>
                <p className="text-sm text-muted-foreground">Adverteerders & plaatsingen</p>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {getRoleBadge("finance")}
                </div>
                <p className="text-sm text-muted-foreground">Alleen-lezen facturen</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
