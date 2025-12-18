import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Phone, Mail, MapPin, Calendar, ArrowRight, Building2, Store, Check, X, Edit, Trash2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Lead } from "@shared/schema";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useLocation } from "wouter";

const statusStages = [
  { value: "nieuw", label: "Nieuw", color: "bg-gray-100 text-gray-800" },
  { value: "contact", label: "Contact", color: "bg-blue-100 text-blue-800" },
  { value: "schouw_gepland", label: "Schouw Gepland", color: "bg-purple-100 text-purple-800" },
  { value: "voorstel", label: "Voorstel", color: "bg-amber-100 text-amber-800" },
  { value: "onderhandeling", label: "Onderhandeling", color: "bg-orange-100 text-orange-800" },
  { value: "gewonnen", label: "Gewonnen", color: "bg-green-100 text-green-800" },
  { value: "verloren", label: "Verloren", color: "bg-red-100 text-red-800" },
];

const sourceOptions = [
  { value: "website", label: "Website" },
  { value: "cold_call", label: "Cold Call" },
  { value: "referral", label: "Doorverwijzing" },
  { value: "beurs", label: "Beurs/Evenement" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "anders", label: "Anders" },
];

function LeadCard({ lead, onEdit, onDelete, onConvert }: { 
  lead: Lead; 
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
}) {
  const [, navigate] = useLocation();
  const statusInfo = statusStages.find(s => s.value === lead.status) || statusStages[0];
  
  return (
    <Card className="mb-3 hover:shadow-md transition-shadow" data-testid={`card-lead-${lead.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {lead.type === "advertiser" ? (
              <Building2 className="h-4 w-4 text-blue-600" />
            ) : (
              <Store className="h-4 w-4 text-green-600" />
            )}
            <span className="font-medium text-sm">{lead.companyName}</span>
          </div>
          <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
            {statusInfo.label}
          </Badge>
        </div>
        
        <p className="text-sm text-muted-foreground mb-2">{lead.contactName}</p>
        
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-primary">
              <Phone className="h-3 w-3" /> {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-primary">
              <Mail className="h-3 w-3" /> {lead.email}
            </a>
          )}
        </div>
        
        {lead.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <MapPin className="h-3 w-3" /> {lead.address}
          </p>
        )}
        
        {lead.followUpDate && (
          <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
            <Calendar className="h-3 w-3" /> 
            Follow-up: {format(new Date(lead.followUpDate), "d MMM yyyy", { locale: nl })}
          </p>
        )}
        
        {lead.expectedValue && (
          <p className="text-sm font-medium text-green-600 mb-2">
            €{Number(lead.expectedValue).toLocaleString("nl-NL")}
          </p>
        )}
        
        <div className="flex gap-1 mt-3 pt-2 border-t">
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex-1"
            onClick={() => onEdit(lead)}
            data-testid={`button-edit-lead-${lead.id}`}
          >
            <Edit className="h-3 w-3 mr-1" /> Bewerk
          </Button>
          
          {lead.type === "location" && lead.status !== "gewonnen" && lead.status !== "verloren" && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate(`/sales/survey/${lead.id}`)}
              data-testid={`button-survey-lead-${lead.id}`}
            >
              <ClipboardList className="h-3 w-3 mr-1" /> Schouw
            </Button>
          )}
          
          {lead.status !== "gewonnen" && lead.status !== "verloren" && (
            <Button 
              variant="ghost" 
              size="sm"
              className="text-green-600"
              onClick={() => onConvert(lead.id)}
              data-testid={`button-convert-lead-${lead.id}`}
            >
              <Check className="h-3 w-3 mr-1" /> Klant
            </Button>
          )}
          
          <Button 
            variant="ghost" 
            size="sm"
            className="text-red-600"
            onClick={() => onDelete(lead.id)}
            data-testid={`button-delete-lead-${lead.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LeadForm({ 
  lead, 
  onSave, 
  onCancel,
  isLoading 
}: { 
  lead?: Lead | null;
  onSave: (data: any) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    type: lead?.type || "advertiser",
    companyName: lead?.companyName || "",
    contactName: lead?.contactName || "",
    email: lead?.email || "",
    phone: lead?.phone || "",
    address: lead?.address || "",
    status: lead?.status || "nieuw",
    source: lead?.source || "",
    expectedValue: lead?.expectedValue || "",
    followUpDate: lead?.followUpDate || "",
    notes: lead?.notes || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      expectedValue: formData.expectedValue ? formData.expectedValue.toString() : null,
      followUpDate: formData.followUpDate || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
            <SelectTrigger data-testid="select-lead-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="advertiser">Adverteerder</SelectItem>
              <SelectItem value="location">Locatie Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
            <SelectTrigger data-testid="select-lead-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusStages.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Bedrijfsnaam *</Label>
        <Input 
          value={formData.companyName}
          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
          required
          data-testid="input-lead-company"
        />
      </div>

      <div className="space-y-2">
        <Label>Contactpersoon *</Label>
        <Input 
          value={formData.contactName}
          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
          required
          data-testid="input-lead-contact"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input 
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            data-testid="input-lead-email"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Telefoon</Label>
          <Input 
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            data-testid="input-lead-phone"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Adres</Label>
        <Input 
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          data-testid="input-lead-address"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Bron</Label>
          <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
            <SelectTrigger data-testid="select-lead-source">
              <SelectValue placeholder="Selecteer..." />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label>Verwachte waarde (€)</Label>
          <Input 
            type="number"
            value={formData.expectedValue}
            onChange={(e) => setFormData({ ...formData, expectedValue: e.target.value })}
            data-testid="input-lead-value"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Follow-up datum</Label>
        <Input 
          type="date"
          value={formData.followUpDate}
          onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
          data-testid="input-lead-followup"
        />
      </div>

      <div className="space-y-2">
        <Label>Notities</Label>
        <Textarea 
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          data-testid="input-lead-notes"
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuleren
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1" data-testid="button-save-lead">
          {isLoading ? "Opslaan..." : (lead ? "Bijwerken" : "Toevoegen")}
        </Button>
      </div>
    </form>
  );
}

export default function Sales() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/leads", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setIsDialogOpen(false);
      toast({ title: "Lead toegevoegd" });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/leads/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      setIsDialogOpen(false);
      setEditingLead(null);
      toast({ title: "Lead bijgewerkt" });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Lead verwijderd" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/leads/${id}/convert`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      const typeLabel = data.type === "advertiser" ? "adverteerder" : "locatie partner";
      toast({ title: `Lead omgezet naar ${typeLabel}!` });
    },
    onError: (error: any) => {
      toast({ title: "Fout bij omzetten", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = (data: any) => {
    if (editingLead) {
      updateMutation.mutate({ id: editingLead.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (lead: Lead) => {
    setEditingLead(lead);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Weet je zeker dat je deze lead wilt verwijderen?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleConvert = (id: string) => {
    if (confirm("Lead omzetten naar klant? Dit maakt een adverteerder of locatie aan.")) {
      convertMutation.mutate(id);
    }
  };

  const filteredLeads = filterType === "all" 
    ? leads 
    : leads.filter(l => l.type === filterType);

  const activeStages = statusStages.filter(s => s.value !== "gewonnen" && s.value !== "verloren");
  const completedStages = statusStages.filter(s => s.value === "gewonnen" || s.value === "verloren");

  const getLeadsByStatus = (status: string) => 
    filteredLeads.filter(l => l.status === status);

  const totalExpectedValue = filteredLeads
    .filter(l => l.status !== "verloren" && l.status !== "gewonnen")
    .reduce((sum, l) => sum + (Number(l.expectedValue) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Acquisitie</h1>
          <p className="text-muted-foreground">Beheer leads en prospects voor adverteerders en locaties</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingLead(null); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-lead">
              <Plus className="h-4 w-4 mr-2" /> Nieuwe Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingLead ? "Lead Bewerken" : "Nieuwe Lead"}</DialogTitle>
            </DialogHeader>
            <LeadForm 
              lead={editingLead}
              onSave={handleSave}
              onCancel={() => { setIsDialogOpen(false); setEditingLead(null); }}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <Button 
            variant={filterType === "all" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilterType("all")}
          >
            Alles ({leads.length})
          </Button>
          <Button 
            variant={filterType === "advertiser" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilterType("advertiser")}
          >
            <Building2 className="h-4 w-4 mr-1" />
            Adverteerders ({leads.filter(l => l.type === "advertiser").length})
          </Button>
          <Button 
            variant={filterType === "location" ? "default" : "outline"} 
            size="sm"
            onClick={() => setFilterType("location")}
          >
            <Store className="h-4 w-4 mr-1" />
            Locaties ({leads.filter(l => l.type === "location").length})
          </Button>
        </div>
        
        <div className="ml-auto text-right">
          <p className="text-sm text-muted-foreground">Verwachte waarde pipeline</p>
          <p className="text-xl font-bold text-green-600">
            €{totalExpectedValue.toLocaleString("nl-NL")}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 pb-4 md:pb-0 overflow-x-auto">
            {activeStages.map((stage) => {
              const stageLeads = getLeadsByStatus(stage.value);
              return (
                <div key={stage.value} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">{stage.label}</h3>
                    <Badge variant="secondary" className="text-xs">{stageLeads.length}</Badge>
                  </div>
                  <div className="min-h-[200px] bg-gray-50 rounded-lg p-2">
                    {stageLeads.map(lead => (
                      <LeadCard 
                        key={lead.id} 
                        lead={lead} 
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onConvert={handleConvert}
                      />
                    ))}
                    {stageLeads.length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-8">
                        Geen leads
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
            {completedStages.map((stage) => {
              const stageLeads = getLeadsByStatus(stage.value);
              return (
                <Card key={stage.value}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {stage.value === "gewonnen" ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                      {stage.label} ({stageLeads.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[300px] overflow-y-auto">
                      {stageLeads.slice(0, 5).map(lead => (
                        <div key={lead.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <p className="font-medium text-sm">{lead.companyName}</p>
                            <p className="text-xs text-muted-foreground">{lead.contactName}</p>
                          </div>
                          {lead.expectedValue && (
                            <span className={`text-sm font-medium ${stage.value === "gewonnen" ? "text-green-600" : "text-muted-foreground line-through"}`}>
                              €{Number(lead.expectedValue).toLocaleString("nl-NL")}
                            </span>
                          )}
                        </div>
                      ))}
                      {stageLeads.length === 0 && (
                        <p className="text-muted-foreground text-sm py-4 text-center">Geen leads</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
