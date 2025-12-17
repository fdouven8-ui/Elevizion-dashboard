import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Send, RefreshCw, MoreHorizontal, History, Eye, XCircle, CheckCircle, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Contracts() {
  const { contracts, advertisers, addContract } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const filteredContracts = contracts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAdvertiserName = (id: string) => advertisers.find(a => a.id === id)?.companyName || "Onbekend";

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'active': return 'default';
      case 'signed': return 'default';
      case 'sent': return 'secondary';
      case 'ended': return 'secondary';
      case 'paused': return 'outline';
      case 'expired': return 'outline';
      case 'draft': return 'outline';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Concept';
      case 'sent': return 'Verzonden';
      case 'viewed': return 'Bekeken';
      case 'signed': return 'Ondertekend';
      case 'active': return 'Actief';
      case 'expired': return 'Verlopen';
      case 'ended': return 'Beëindigd';
      case 'paused': return 'Gepauzeerd';
      case 'cancelled': return 'Geannuleerd';
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'signed': return <CheckCircle className="h-3 w-3" />;
      case 'sent': return <Clock className="h-3 w-3" />;
      case 'expired': return <XCircle className="h-3 w-3" />;
      default: return null;
    }
  };

  const sendMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await fetch(`/api/contracts/${contractId}/send`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Contract verzonden", 
        description: data.emailSent ? "E-mail succesvol verzonden" : "Ondertekeningslink gegenereerd" 
      });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await fetch(`/api/contracts/${contractId}/resend`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract opnieuw verzonden" });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await fetch(`/api/contracts/${contractId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract geannuleerd" });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const openHistory = (contractId: string) => {
    setSelectedContractId(contractId);
    setHistoryDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">Contracten</h1>
          <p className="text-muted-foreground">Beheer reclamecontracten en schermplaatsingen.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm" data-testid="button-create-contract">
              <Plus className="mr-2 h-4 w-4" /> Nieuw Contract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nieuw Contract Aanmaken</DialogTitle>
            </DialogHeader>
            <ContractForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek contracten..." 
            className="pl-8" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search"
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractnaam</TableHead>
              <TableHead>Adverteerder</TableHead>
              <TableHead>Maandprijs</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContracts.map((contract) => (
              <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {contract.name}
                  </div>
                </TableCell>
                <TableCell>{getAdvertiserName(contract.advertiserId)}</TableCell>
                <TableCell className="font-medium">€{parseFloat(contract.monthlyPriceExVat).toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {contract.startDate} <span className="mx-1">→</span> {contract.endDate || 'Doorlopend'}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(contract.status)} className="flex items-center gap-1 w-fit">
                    {getStatusIcon(contract.status)}
                    {getStatusLabel(contract.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-actions-${contract.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(contract.status === "draft" || contract.status === "active") && (
                        <DropdownMenuItem 
                          onClick={() => sendMutation.mutate(contract.id)}
                          disabled={sendMutation.isPending}
                          data-testid={`action-send-${contract.id}`}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Verzenden ter ondertekening
                        </DropdownMenuItem>
                      )}
                      {contract.status === "sent" && (
                        <>
                          <DropdownMenuItem 
                            onClick={() => resendMutation.mutate(contract.id)}
                            disabled={resendMutation.isPending}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Opnieuw verzenden
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => cancelMutation.mutate(contract.id)}
                            disabled={cancelMutation.isPending}
                            className="text-destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Annuleren
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openHistory(contract.id)}>
                        <History className="mr-2 h-4 w-4" />
                        Bekijk geschiedenis
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredContracts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Geen contracten gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Contract Geschiedenis</DialogTitle>
            <DialogDescription>Overzicht van alle activiteiten voor dit contract</DialogDescription>
          </DialogHeader>
          {selectedContractId && <ContractHistory contractId={selectedContractId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContractHistory({ contractId }: { contractId: string }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["contract-events", contractId],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}/events`);
      if (!res.ok) throw new Error("Fout bij ophalen geschiedenis");
      return res.json();
    },
  });

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case "created": return "Aangemaakt";
      case "sent": return "Verzonden";
      case "viewed": return "Bekeken";
      case "signed": return "Ondertekend";
      case "expired": return "Verlopen";
      case "cancelled": return "Geannuleerd";
      default: return eventType;
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "signed": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "sent": return <Send className="h-4 w-4 text-blue-600" />;
      case "viewed": return <Eye className="h-4 w-4 text-orange-600" />;
      case "expired": return <XCircle className="h-4 w-4 text-red-600" />;
      case "cancelled": return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Laden...</div>;
  }

  if (!events || events.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">Geen geschiedenis beschikbaar</div>;
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="space-y-4 pr-4">
        {events.map((event: any) => (
          <div key={event.id} className="flex gap-3 border-l-2 border-muted pl-4 pb-4">
            <div className="mt-1">{getEventIcon(event.eventType)}</div>
            <div className="flex-1">
              <div className="font-medium">{getEventLabel(event.eventType)}</div>
              <div className="text-sm text-muted-foreground">
                {new Date(event.createdAt).toLocaleString("nl-NL")}
              </div>
              {event.actorName && (
                <div className="text-sm text-muted-foreground">
                  Door: {event.actorName}
                </div>
              )}
              {event.ipAddress && (
                <div className="text-xs text-muted-foreground">
                  IP: {event.ipAddress}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ContractForm({ onSuccess }: { onSuccess: () => void }) {
  const { addContract, advertisers, screens } = useAppData();
  const { register, handleSubmit, setValue, watch } = useForm<any>({
    defaultValues: {
      vatPercent: "21.00",
      billingCycle: "monthly",
    }
  });
  const [selectedScreens, setSelectedScreens] = useState<string[]>([]);

  const toggleScreen = (id: string) => {
    setSelectedScreens(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const onSubmit = (data: any) => {
    addContract({
      ...data,
      status: "active"
    }, { screenIds: selectedScreens });
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Contractnaam</Label>
          <Input id="name" placeholder="bijv. Bedrijf Q1 2025" {...register("name", { required: true })} data-testid="input-name" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="advertiser">Adverteerder</Label>
          <Select onValueChange={(val) => setValue("advertiserId", val)}>
            <SelectTrigger data-testid="select-advertiser">
              <SelectValue placeholder="Selecteer adverteerder" />
            </SelectTrigger>
            <SelectContent>
              {advertisers.map((adv) => (
                <SelectItem key={adv.id} value={adv.id}>
                  {adv.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="monthlyPriceExVat">Maandprijs (ex BTW)</Label>
          <Input id="monthlyPriceExVat" type="number" step="0.01" placeholder="500.00" {...register("monthlyPriceExVat", { required: true })} data-testid="input-price" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vatPercent">BTW %</Label>
          <Input id="vatPercent" type="number" step="0.01" defaultValue="21.00" {...register("vatPercent")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="billingCycle">Facturatiecyclus</Label>
          <Select defaultValue="monthly" onValueChange={(val) => setValue("billingCycle", val)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Maandelijks</SelectItem>
              <SelectItem value="quarterly">Per Kwartaal</SelectItem>
              <SelectItem value="yearly">Jaarlijks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Startdatum</Label>
          <Input id="startDate" type="date" {...register("startDate", { required: true })} data-testid="input-start-date" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endDate">Einddatum (optioneel)</Label>
          <Input id="endDate" type="date" {...register("endDate")} data-testid="input-end-date" />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Toewijzen aan Schermen</Label>
        <div className="grid grid-cols-2 gap-2 border rounded-md p-4 max-h-48 overflow-y-auto">
          {screens.map(screen => (
            <div key={screen.id} className="flex items-center space-x-2">
              <Checkbox 
                id={screen.id} 
                checked={selectedScreens.includes(screen.id)}
                onCheckedChange={() => toggleScreen(screen.id)}
              />
              <Label htmlFor={screen.id} className="cursor-pointer text-sm">{screen.name}</Label>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{selectedScreens.length} scherm(en) geselecteerd</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" data-testid="button-submit">Contract Aanmaken</Button>
      </div>
    </form>
  );
}
