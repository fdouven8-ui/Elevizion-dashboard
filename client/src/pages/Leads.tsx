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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UserPlus, Megaphone, MapPin, Phone, Mail, Building2, User, Calendar, Loader2 } from "lucide-react";
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

const STATUS_OPTIONS = [
  { value: "nieuw", label: "Nieuw", color: "bg-blue-100 text-blue-800" },
  { value: "contact", label: "Contact gehad", color: "bg-yellow-100 text-yellow-800" },
  { value: "gekwalificeerd", label: "Gekwalificeerd", color: "bg-purple-100 text-purple-800" },
  { value: "gewonnen", label: "Gewonnen", color: "bg-emerald-100 text-emerald-800" },
  { value: "verloren", label: "Verloren", color: "bg-red-100 text-red-800" },
];

function getStatusBadge(status: string) {
  const option = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  return <Badge className={`${option.color} font-medium`}>{option.label}</Badge>;
}

function getTypeBadge(type: string) {
  if (type === "advertiser") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
        <Megaphone className="h-3 w-3" />
        Adverteren
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700">
      <MapPin className="h-3 w-3" />
      Scherm
    </Badge>
  );
}

export default function Leads() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

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
    },
  });

  const handleStatusChange = (id: string, status: string) => {
    updateMutation.mutate({ id, status });
    if (selectedLead && selectedLead.id === id) {
      setSelectedLead({ ...selectedLead, status });
    }
  };

  const openDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDetailOpen(true);
  };

  const sortedLeads = [...leads].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const newLeadsCount = leads.filter(l => l.status === "nieuw").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-emerald-600" />
            Leads
          </h1>
          <p className="text-muted-foreground">Website aanvragen beheren</p>
        </div>
        {newLeadsCount > 0 && (
          <Badge className="bg-emerald-600 text-white text-sm px-3 py-1">
            {newLeadsCount} nieuwe {newLeadsCount === 1 ? "lead" : "leads"}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Alle leads ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nog geen leads ontvangen.</p>
              <p className="text-sm">Leads verschijnen hier wanneer bezoekers het formulier invullen.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Bedrijf</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefoon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLeads.map((lead) => (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(lead)}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.createdAt), "d MMM HH:mm", { locale: nl })}
                    </TableCell>
                    <TableCell>{getTypeBadge(lead.type)}</TableCell>
                    <TableCell className="font-medium">{lead.companyName}</TableCell>
                    <TableCell>{lead.contactName}</TableCell>
                    <TableCell className="text-sm">{lead.email || "-"}</TableCell>
                    <TableCell className="text-sm">{lead.phone || "-"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={lead.status}
                        onValueChange={(value) => handleStatusChange(lead.id, value)}
                      >
                        <SelectTrigger className="w-[140px] h-8">
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
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(lead)}>
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

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              {selectedLead?.companyName}
            </DialogTitle>
            <DialogDescription>
              Lead details
            </DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                {getTypeBadge(selectedLead.type)}
                {getStatusBadge(selectedLead.status)}
              </div>

              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Contactpersoon</p>
                    <p className="font-medium">{selectedLead.contactName}</p>
                  </div>
                </div>

                {selectedLead.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">E-mail</p>
                      <a href={`mailto:${selectedLead.email}`} className="font-medium text-emerald-600 hover:underline">
                        {selectedLead.email}
                      </a>
                    </div>
                  </div>
                )}

                {selectedLead.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Telefoon</p>
                      <a href={`tel:${selectedLead.phone}`} className="font-medium text-emerald-600 hover:underline">
                        {selectedLead.phone}
                      </a>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Aangemaakt</p>
                    <p className="font-medium">
                      {format(new Date(selectedLead.createdAt), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label>Status wijzigen</Label>
                <Select
                  value={selectedLead.status}
                  onValueChange={(value) => handleStatusChange(selectedLead.id, value)}
                >
                  <SelectTrigger>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
