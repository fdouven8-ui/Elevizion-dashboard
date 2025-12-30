import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, PlayCircle, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { SyncJob } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "SUCCESS":
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle className="h-3 w-3 mr-1" />
          Gelukt
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Mislukt
        </Badge>
      );
    case "RUNNING":
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <PlayCircle className="h-3 w-3 mr-1" />
          Bezig
        </Badge>
      );
    case "PENDING":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
          <Clock className="h-3 w-3 mr-1" />
          Wachtend
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ProviderBadge({ provider }: { provider: string }) {
  switch (provider) {
    case "MONEYBIRD":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Moneybird</Badge>;
    case "YODECK":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Yodeck</Badge>;
    default:
      return <Badge variant="outline">{provider}</Badge>;
  }
}

function ActionBadge({ action }: { action: string }) {
  const labels: Record<string, string> = {
    "CREATE_CONTACT": "Contact aanmaken",
    "UPDATE_CONTACT": "Contact bijwerken",
    "LINK_DEVICE": "Device koppelen",
    "SYNC_STATUS": "Status sync",
  };
  return <span className="text-sm">{labels[action] || action}</span>;
}

function formatDate(date: Date | string | null): string {
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

export default function SyncLogs() {
  const [providerFilter, setProviderFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: syncJobs = [], isLoading, error } = useQuery<SyncJob[]>({
    queryKey: ["sync-jobs"],
    queryFn: async () => {
      const response = await fetch("/api/sync-jobs", { credentials: "include" });
      if (!response.ok) throw new Error("Kon sync logs niet laden");
      return response.json();
    },
    refetchInterval: 10000,
  });

  const filteredJobs = syncJobs.filter((job) => {
    if (providerFilter !== "ALL" && job.provider !== providerFilter) return false;
    if (statusFilter !== "ALL" && job.status !== statusFilter) return false;
    if (searchTerm && !job.entityId?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: syncJobs.length,
    success: syncJobs.filter(j => j.status === "SUCCESS").length,
    failed: syncJobs.filter(j => j.status === "FAILED").length,
    pending: syncJobs.filter(j => j.status === "PENDING" || j.status === "RUNNING").length,
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">
          Sync Logs
        </h1>
        <p className="text-muted-foreground">
          Overzicht van alle synchronisatie taken met Moneybird en Yodeck.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-4" data-testid="stat-total">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Totaal</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4" data-testid="stat-success">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Gelukt</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-green-600">{stats.success}</p>
        </div>
        <div className="rounded-lg border bg-card p-4" data-testid="stat-failed">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-muted-foreground">Mislukt</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="rounded-lg border bg-card p-4" data-testid="stat-pending">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <span className="text-sm text-muted-foreground">In behandeling</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{stats.pending}</p>
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <Input
          placeholder="Zoek op entity ID..."
          className="max-w-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="input-search"
        />
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-40" data-testid="select-provider">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle providers</SelectItem>
            <SelectItem value="MONEYBIRD">Moneybird</SelectItem>
            <SelectItem value="YODECK">Yodeck</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Alle statussen</SelectItem>
            <SelectItem value="SUCCESS">Gelukt</SelectItem>
            <SelectItem value="FAILED">Mislukt</SelectItem>
            <SelectItem value="PENDING">Wachtend</SelectItem>
            <SelectItem value="RUNNING">Bezig</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Laden...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">Fout bij laden: {(error as Error).message}</div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Geen sync logs gevonden.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Actie</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Foutmelding</TableHead>
                <TableHead>Voltooid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
                <TableRow key={job.id} data-testid={`row-sync-${job.id}`}>
                  <TableCell className="text-sm">{formatDate(job.startedAt)}</TableCell>
                  <TableCell><ProviderBadge provider={job.provider} /></TableCell>
                  <TableCell><ActionBadge action={job.action} /></TableCell>
                  <TableCell><StatusBadge status={job.status} /></TableCell>
                  <TableCell className="text-sm text-red-600 max-w-xs truncate">
                    {job.errorMessage || "-"}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(job.finishedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
