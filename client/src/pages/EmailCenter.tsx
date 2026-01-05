import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, Mail, RefreshCw, Send, AlertCircle } from "lucide-react";
import { useState } from "react";

interface EmailLog {
  id: string;
  toEmail: string;
  templateKey: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "sent":
      return (
        <Badge variant="default" className="bg-green-500" data-testid={`badge-status-${status}`}>
          <CheckCircle className="h-3 w-3 mr-1" />
          Verzonden
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" data-testid={`badge-status-${status}`}>
          <XCircle className="h-3 w-3 mr-1" />
          Mislukt
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800" data-testid={`badge-status-${status}`}>
          <Clock className="h-3 w-3 mr-1" />
          In wachtrij
        </Badge>
      );
    default:
      return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
}

function TemplateBadge({ templateKey }: { templateKey: string }) {
  const labels: Record<string, string> = {
    "test_email": "Test",
    "verification_code": "Verificatie",
    "advertiser_created": "Welkom",
    "advertiser_invite_sent": "Uitnodiging",
    "onboarding_completed": "Onboarding klaar",
    "screen_created": "Nieuw scherm",
    "contract_sent": "Contract verstuurd",
    "contract_signed": "Contract getekend",
  };
  return (
    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200" data-testid={`badge-template-${templateKey}`}>
      {labels[templateKey] || templateKey}
    </Badge>
  );
}

function formatDate(date: string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmailCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [templateFilter, setTemplateFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [testEmail, setTestEmail] = useState("");
  const [testStep, setTestStep] = useState("test_email");

  const { data: emailLogs = [], isLoading, error } = useQuery<EmailLog[]>({
    queryKey: ["email-logs", statusFilter, templateFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (templateFilter !== "ALL") params.set("templateKey", templateFilter);
      if (searchTerm) params.set("search", searchTerm);
      
      const response = await fetch(`/api/email/logs?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Kon email logs niet laden");
      return response.json();
    },
    refetchInterval: 15000,
  });

  const { data: availableSteps = [] } = useQuery<string[]>({
    queryKey: ["email-steps"],
    queryFn: async () => {
      const response = await fetch("/api/email/steps", { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async ({ to, step }: { to: string; step: string }) => {
      const response = await fetch("/api/dev/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to, step }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fout bij verzenden");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.ok ? "Email verzonden" : "Fout",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["email-logs"] });
      setTestEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (logId: string) => {
      const response = await fetch(`/api/email/resend/${logId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Fout bij opnieuw verzenden");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.ok ? "Email opnieuw verzonden" : "Fout",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uniqueTemplates = Array.from(new Set(emailLogs.map(log => log.templateKey)));

  const stats = {
    total: emailLogs.length,
    sent: emailLogs.filter(l => l.status === "sent").length,
    failed: emailLogs.filter(l => l.status === "failed").length,
    queued: emailLogs.filter(l => l.status === "queued").length,
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">Fout bij laden: {(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-email-center">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Email Center</h1>
          <p className="text-gray-500">Beheer en monitor alle verzonden emails</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Mail className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">Totaal</p>
                <p className="text-2xl font-bold" data-testid="text-stat-total">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Verzonden</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-stat-sent">{stats.sent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-gray-500">Mislukt</p>
                <p className="text-2xl font-bold text-red-600" data-testid="text-stat-failed">{stats.failed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-gray-500">In wachtrij</p>
                <p className="text-2xl font-bold text-amber-600" data-testid="text-stat-queued">{stats.queued}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Test Email Versturen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm text-gray-500 mb-1 block">E-mailadres</label>
              <Input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                data-testid="input-test-email"
              />
            </div>
            <div className="w-48">
              <label className="text-sm text-gray-500 mb-1 block">Template</label>
              <Select value={testStep} onValueChange={setTestStep}>
                <SelectTrigger data-testid="select-test-step">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSteps.map((step) => (
                    <SelectItem key={step} value={step}>{step}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => sendTestMutation.mutate({ to: testEmail, step: testStep })}
              disabled={!testEmail || sendTestMutation.isPending}
              data-testid="button-send-test"
            >
              {sendTestMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Versturen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder="Status filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle statussen</SelectItem>
                  <SelectItem value="sent">Verzonden</SelectItem>
                  <SelectItem value="failed">Mislukt</SelectItem>
                  <SelectItem value="queued">In wachtrij</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger data-testid="select-filter-template">
                  <SelectValue placeholder="Template filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle templates</SelectItem>
                  {uniqueTemplates.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input
                placeholder="Zoek op e-mailadres..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-email"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Ontvanger</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Error</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailLogs.map((log) => (
                <TableRow key={log.id} data-testid={`row-email-${log.id}`}>
                  <TableCell className="text-sm text-gray-600">
                    {formatDate(log.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium" data-testid={`text-email-${log.id}`}>
                    {log.toEmail}
                  </TableCell>
                  <TableCell>
                    <TemplateBadge templateKey={log.templateKey} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {log.entityType && log.entityId ? (
                      <span>{log.entityType}: {log.entityId.slice(0, 8)}...</span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-red-500 max-w-[200px] truncate" title={log.errorMessage || ""}>
                    {log.errorMessage || "-"}
                  </TableCell>
                  <TableCell>
                    {log.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resendMutation.mutate(log.id)}
                        disabled={resendMutation.isPending}
                        data-testid={`button-resend-${log.id}`}
                      >
                        <RefreshCw className={`h-4 w-4 ${resendMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {emailLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    Geen email logs gevonden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
