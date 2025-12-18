import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MoreHorizontal, CreditCard, Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { Advertiser } from "@shared/schema";

export default function Advertisers() {
  const { advertisers, addAdvertiser, updateAdvertiser } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAdvertiser, setEditingAdvertiser] = useState<Advertiser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const filteredAdvertisers = advertisers.filter(adv => 
    adv.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    adv.contactName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditSepa = (adv: Advertiser) => {
    setEditingAdvertiser(adv);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">Adverteerders</h1>
          <p className="text-muted-foreground">Beheer uw reclamepartners en hun abonnementen.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-sm" data-testid="button-add-advertiser">
              <Plus className="mr-2 h-4 w-4" /> Adverteerder Toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nieuwe Adverteerder Toevoegen</DialogTitle>
              <DialogDescription>Voer de bedrijfsgegevens en SEPA incasso informatie in.</DialogDescription>
            </DialogHeader>
            <AdvertiserForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoek adverteerders..." 
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
              <TableHead>Bedrijf</TableHead>
              <TableHead>Contactpersoon</TableHead>
              <TableHead>Incasso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAdvertisers.map((adv) => (
              <TableRow key={adv.id} data-testid={`row-advertiser-${adv.id}`}>
                <TableCell className="font-medium">{adv.companyName}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{adv.contactName}</span>
                    <span className="text-xs text-muted-foreground">{adv.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {adv.sepaMandate && adv.iban ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <div className="flex flex-col">
                        <span className="text-xs text-green-700 font-medium">Actief</span>
                        <span className="text-xs text-muted-foreground">
                          {adv.iban?.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  ) : adv.iban ? (
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-amber-600">IBAN bekend, geen mandaat</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <X className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Niet ingesteld</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={adv.status === 'active' ? 'default' : 'secondary'}>
                    {adv.status === 'active' ? 'Actief' : adv.status === 'paused' ? 'Gepauzeerd' : adv.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-menu-${adv.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acties</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEditSepa(adv)}>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Incasso instellen
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => updateAdvertiser(adv.id, { status: adv.status === 'active' ? 'paused' : 'active' })}>
                        Status Wijzigen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredAdvertisers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Geen adverteerders gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Automatisch Incasso Instellen</DialogTitle>
            <DialogDescription>
              {editingAdvertiser?.companyName} - SEPA machtiging en bankgegevens
            </DialogDescription>
          </DialogHeader>
          {editingAdvertiser && (
            <SepaForm 
              advertiser={editingAdvertiser} 
              onSuccess={() => {
                setIsEditDialogOpen(false);
                setEditingAdvertiser(null);
              }} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdvertiserForm({ onSuccess }: { onSuccess: () => void }) {
  const { addAdvertiser } = useAppData();
  const { register, handleSubmit, watch, setValue } = useForm<Omit<Advertiser, "id" | "createdAt">>();
  const [hasSepaMandate, setHasSepaMandate] = useState(false);

  const onSubmit = (data: any) => {
    const advertiserData: any = {
      ...data,
      sepaMandate: hasSepaMandate,
      status: "active"
    };
    
    // Only set mandate date if mandate is active
    if (hasSepaMandate) {
      advertiserData.sepaMandateDate = new Date().toISOString().split('T')[0];
      // Generate mandate reference if not provided
      if (!data.sepaMandateReference) {
        advertiserData.sepaMandateReference = `ELEVIZ-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      }
    }
    
    addAdvertiser(advertiserData);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="companyName">Bedrijfsnaam *</Label>
        <Input id="companyName" {...register("companyName", { required: true })} data-testid="input-company-name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="contactName">Contactpersoon *</Label>
        <Input id="contactName" {...register("contactName", { required: true })} data-testid="input-contact-name" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail *</Label>
          <Input id="email" type="email" {...register("email", { required: true })} data-testid="input-email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Telefoon</Label>
          <Input id="phone" {...register("phone")} data-testid="input-phone" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="vatNumber">BTW-nummer</Label>
          <Input id="vatNumber" placeholder="NL123456789B01" {...register("vatNumber")} data-testid="input-vat" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="address">Adres</Label>
          <Input id="address" {...register("address")} data-testid="input-address" />
        </div>
      </div>

      <Separator className="my-4" />
      
      <div className="space-y-4">
        <h4 className="font-medium flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Automatisch Incasso (SEPA)
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="iban">IBAN Rekeningnummer</Label>
            <Input 
              id="iban" 
              placeholder="NL00BANK0123456789" 
              {...register("iban")} 
              data-testid="input-iban"
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ibanAccountHolder">Tenaamstelling</Label>
            <Input id="ibanAccountHolder" {...register("ibanAccountHolder")} data-testid="input-iban-holder" />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="sepaMandate" 
            checked={hasSepaMandate}
            onCheckedChange={(checked) => setHasSepaMandate(checked === true)}
            data-testid="checkbox-sepa-mandate"
          />
          <Label htmlFor="sepaMandate" className="text-sm font-normal cursor-pointer">
            Machtiging voor automatisch incasso is getekend
          </Label>
        </div>

        {hasSepaMandate && (
          <div className="grid gap-2">
            <Label htmlFor="sepaMandateReference">Mandaat Kenmerk</Label>
            <Input 
              id="sepaMandateReference" 
              placeholder="ELEVIZ-2024-001" 
              {...register("sepaMandateReference")} 
              data-testid="input-mandate-ref"
            />
            <p className="text-xs text-muted-foreground">
              Uniek kenmerk voor deze incasso machtiging (wordt automatisch gegenereerd indien leeg)
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" data-testid="button-submit">Adverteerder Aanmaken</Button>
      </div>
    </form>
  );
}

function SepaForm({ advertiser, onSuccess }: { advertiser: Advertiser; onSuccess: () => void }) {
  const { updateAdvertiser } = useAppData();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      iban: advertiser.iban || "",
      ibanAccountHolder: advertiser.ibanAccountHolder || "",
      sepaMandateReference: advertiser.sepaMandateReference || `ELEVIZ-${new Date().getFullYear()}-${advertiser.id.slice(0, 4).toUpperCase()}`,
    }
  });
  const [hasSepaMandate, setHasSepaMandate] = useState(advertiser.sepaMandate || false);

  const onSubmit = (data: any) => {
    const updateData: any = {
      ...data,
      sepaMandate: hasSepaMandate,
    };
    
    // Set mandate date if activating mandate for the first time
    if (hasSepaMandate && !advertiser.sepaMandateDate) {
      updateData.sepaMandateDate = new Date().toISOString().split('T')[0];
    }
    
    updateAdvertiser(advertiser.id, updateData);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="iban">IBAN Rekeningnummer *</Label>
          <Input 
            id="iban" 
            placeholder="NL00BANK0123456789" 
            {...register("iban", { required: true })} 
            data-testid="input-iban"
            className="font-mono text-lg"
          />
          <p className="text-xs text-muted-foreground">
            Het rekeningnummer waarvan automatisch geïncasseerd wordt
          </p>
        </div>
        
        <div className="grid gap-2">
          <Label htmlFor="ibanAccountHolder">Tenaamstelling Rekening *</Label>
          <Input 
            id="ibanAccountHolder" 
            placeholder={advertiser.companyName}
            {...register("ibanAccountHolder", { required: true })} 
            data-testid="input-iban-holder"
          />
        </div>

        <Separator />

        <div className="flex items-center space-x-2">
          <Checkbox 
            id="sepaMandate" 
            checked={hasSepaMandate}
            onCheckedChange={(checked) => setHasSepaMandate(checked === true)}
            data-testid="checkbox-sepa-mandate"
          />
          <div>
            <Label htmlFor="sepaMandate" className="text-sm font-medium cursor-pointer">
              SEPA Incasso Machtiging Getekend
            </Label>
            <p className="text-xs text-muted-foreground">
              Vink aan wanneer de klant de machtiging heeft ondertekend
            </p>
          </div>
        </div>

        {hasSepaMandate && (
          <div className="grid gap-2 bg-muted/50 p-3 rounded-lg">
            <Label htmlFor="sepaMandateReference">Mandaat Kenmerk</Label>
            <Input 
              id="sepaMandateReference" 
              {...register("sepaMandateReference")} 
              data-testid="input-mandate-ref"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Dit kenmerk komt op de bankafschriften van de klant te staan
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" data-testid="button-save-sepa">
          {hasSepaMandate ? "Incasso Activeren" : "Opslaan"}
        </Button>
      </div>
    </form>
  );
}
