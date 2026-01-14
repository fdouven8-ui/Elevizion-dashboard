import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { 
  Clock, CheckCircle2, XCircle, Send, Trash2, RotateCcw,
  Loader2, Users, Package, MapPin, Calendar, Mail, Building2,
  RefreshCw
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface WaitlistRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  packageType: string;
  businessCategory: string;
  competitorGroup: string | null;
  targetRegionCodes: string[] | null;
  requiredCount: number;
  status: string;
  inviteSentAt: string | null;
  inviteExpiresAt: string | null;
  claimedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "WAITING", label: "Wachtend", icon: Clock, color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "INVITED", label: "Uitgenodigd", icon: Send, color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "CLAIMED", label: "Geclaimed", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "EXPIRED", label: "Verlopen", icon: XCircle, color: "bg-gray-50 text-gray-700 border-gray-200" },
  { value: "CANCELLED", label: "Geannuleerd", icon: Trash2, color: "bg-red-50 text-red-700 border-red-200" },
];

const PACKAGE_LABELS: Record<string, string> = {
  SINGLE: "Enkelvoudig (1 scherm)",
  TRIPLE: "Drievoudig (3 schermen)",
  TEN: "Tien (10 schermen)",
  CUSTOM: "Maatwerk",
};

function getStatusBadge(status: string) {
  const option = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  const Icon = option.icon;
  return (
    <Badge variant="outline" className={`${option.color} text-xs font-medium gap-1`}>
      <Icon className="h-3 w-3" />
      {option.label}
    </Badge>
  );
}

export default function Wachtlijst() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string } | null>(null);

  const { data: requests = [], isLoading } = useQuery<WaitlistRequest[]>({
    queryKey: ["/api/admin/waitlist", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const response = await apiRequest("GET", `/api/admin/waitlist${params}`);
      return response.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/waitlist/${id}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Aanvraag geannuleerd" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/waitlist/${id}/reset`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Aanvraag teruggezet naar wachtend" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const triggerCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/waitlist/trigger-check");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Controle uitgevoerd", 
        description: `${data.checked} gecontroleerd, ${data.invited} uitgenodigd` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "cancel") {
      cancelMutation.mutate(confirmAction.id);
    } else if (confirmAction.type === "reset") {
      resetMutation.mutate(confirmAction.id);
    }
    setConfirmAction(null);
  };

  const statusCounts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Wachtlijst</h1>
          <p className="text-muted-foreground">Beheer aanvragen van adverteerders die wachten op capaciteit</p>
        </div>
        <Button 
          onClick={() => triggerCheckMutation.mutate()}
          disabled={triggerCheckMutation.isPending}
        >
          {triggerCheckMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Capaciteit controleren
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {STATUS_OPTIONS.map(status => {
          const count = statusCounts[status.value] || 0;
          const Icon = status.icon;
          return (
            <Card 
              key={status.value} 
              className={`cursor-pointer transition-all ${statusFilter === status.value ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter(statusFilter === status.value ? "all" : status.value)}
              data-testid={`status-card-${status.value.toLowerCase()}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{status.label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  <Icon className="h-8 w-8 text-muted-foreground/50" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {statusFilter === "all" ? "Alle aanvragen" : `${STATUS_OPTIONS.find(s => s.value === statusFilter)?.label || ""}`}
            <Badge variant="secondary">{requests.length}</Badge>
          </CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]" data-testid="status-filter">
              <SelectValue placeholder="Filter op status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              {STATUS_OPTIONS.map(status => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Geen aanvragen gevonden</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bedrijf</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Pakket</TableHead>
                  <TableHead>Branche</TableHead>
                  <TableHead>Regio's</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aangemaakt</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(request => (
                  <TableRow key={request.id} data-testid={`waitlist-row-${request.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{request.companyName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm">{request.contactName}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {request.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{PACKAGE_LABELS[request.packageType] || request.packageType}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {request.businessCategory}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs">
                          {request.targetRegionCodes?.length 
                            ? request.targetRegionCodes.join(", ")
                            : "Alle"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(request.createdAt), "d MMM yyyy", { locale: nl })}
                      </div>
                      {request.inviteSentAt && (
                        <div className="text-xs text-blue-600 mt-1">
                          Uitnodiging: {format(new Date(request.inviteSentAt), "d MMM HH:mm", { locale: nl })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(request.status === "EXPIRED" || request.status === "CANCELLED") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmAction({ type: "reset", id: request.id })}
                            data-testid={`reset-btn-${request.id}`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {(request.status === "WAITING" || request.status === "INVITED") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmAction({ type: "cancel", id: request.id })}
                            className="text-red-600 hover:text-red-700"
                            data-testid={`cancel-btn-${request.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "cancel" ? "Aanvraag annuleren?" : "Aanvraag resetten?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "cancel"
                ? "Deze aanvraag wordt geannuleerd en de adverteerder wordt niet meer uitgenodigd."
                : "Deze aanvraag wordt teruggezet naar 'Wachtend' en kan opnieuw worden uitgenodigd."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              {confirmAction?.type === "cancel" ? "Ja, annuleren" : "Ja, resetten"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
