import { useAppData } from "@/hooks/use-app-data";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, MoreHorizontal, CreditCard, Check, X, Eye, ChevronDown, ChevronRight, Building2, Globe, Mail, FileText, Zap, Send, Copy, Link, Loader2, Clock } from "lucide-react";
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
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Advertiser } from "@shared/schema";

export default function Advertisers() {
  const { advertisers, addAdvertiser, updateAdvertiser } = useAppData();
  const [, navigate] = useLocation();
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
              <TableRow 
                key={adv.id} 
                data-testid={`row-advertiser-${adv.id}`}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/advertisers/${adv.id}`)}
              >
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
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-menu-${adv.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acties</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => navigate(`/advertisers/${adv.id}`)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Bekijk details
                      </DropdownMenuItem>
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue } = useForm<Omit<Advertiser, "id" | "createdAt">>();
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [hasSepaMandate, setHasSepaMandate] = useState(false);
  const [showSepaSection, setShowSepaSection] = useState(false);
  const [showExtraSection, setShowExtraSection] = useState(false);
  const [invoiceDeliveryMethod, setInvoiceDeliveryMethod] = useState("email");
  const [language, setLanguage] = useState("nl");
  const [isBusiness, setIsBusiness] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portalLink, setPortalLink] = useState<{ url: string; expiresAt: string } | null>(null);

  // Quick create form
  const { register: registerQuick, handleSubmit: handleQuickSubmit, formState: { errors: quickErrors } } = useForm<{
    companyName: string;
    email: string;
    contactName?: string;
  }>();

  const onQuickSubmit = async (data: { companyName: string; email: string; contactName?: string }) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/advertisers/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Fout bij aanmaken");
      }
      
      const result = await response.json();
      setPortalLink({ url: result.portalUrl, expiresAt: result.expiresAt });
      queryClient.invalidateQueries({ queryKey: ["advertisers"] });
      
      toast({
        title: "Adverteerder aangemaakt",
        description: "Kopieer de link en stuur deze naar de klant.",
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPortalLink = () => {
    if (portalLink) {
      navigator.clipboard.writeText(portalLink.url);
      toast({
        title: "Link gekopieerd",
        description: "De portal link is naar je klembord gekopieerd.",
      });
    }
  };

  const onFullSubmit = (data: any) => {
    const advertiserData: any = {
      ...data,
      sepaMandate: hasSepaMandate,
      invoiceDeliveryMethod,
      language,
      isBusiness,
      status: "active",
      onboardingStatus: "completed",
      source: "full_create",
    };
    
    // Convert numeric fields from string to number
    if (data.paymentTermDays) {
      advertiserData.paymentTermDays = parseInt(data.paymentTermDays, 10);
    }
    if (data.discountPercentage) {
      advertiserData.discountPercentage = data.discountPercentage.toString();
    }
    
    if (hasSepaMandate) {
      advertiserData.sepaMandateDate = new Date().toISOString().split('T')[0];
      if (!data.sepaMandateReference) {
        const random4 = Math.random().toString(36).substring(2, 6).toUpperCase();
        advertiserData.sepaMandateReference = `EVZ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${random4}`;
      }
    }
    
    addAdvertiser(advertiserData);
    onSuccess();
  };

  // Show portal link result
  if (portalLink) {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-2 text-green-600">
          <Check className="h-5 w-5" />
          <span className="font-medium">Adverteerder aangemaakt!</span>
        </div>
        
        <div className="space-y-2">
          <Label>Invul-link voor klant</Label>
          <div className="flex items-center gap-2">
            <Input 
              value={portalLink.url} 
              readOnly 
              className="font-mono text-sm"
              data-testid="input-portal-link"
            />
            <Button 
              type="button" 
              variant="outline" 
              size="icon"
              onClick={copyPortalLink}
              data-testid="button-copy-link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Geldig tot {new Date(portalLink.expiresAt).toLocaleDateString("nl-NL")}
          </p>
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" onClick={onSuccess} data-testid="button-close-dialog">
            Sluiten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as "quick" | "full")} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="quick" className="flex items-center gap-2" data-testid="tab-quick">
          <Zap className="h-4 w-4" />
          Snel
        </TabsTrigger>
        <TabsTrigger value="full" className="flex items-center gap-2" data-testid="tab-full">
          <FileText className="h-4 w-4" />
          Volledig
        </TabsTrigger>
      </TabsList>

      {/* QUICK MODE */}
      <TabsContent value="quick" className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <p className="font-medium flex items-center gap-2">
            <Send className="h-4 w-4" />
            Snelle aanmaak met invul-link
          </p>
          <p className="mt-1 text-blue-700">
            Vul alleen bedrijfsnaam en e-mail in. De klant ontvangt een link om zelf de rest in te vullen.
          </p>
        </div>
        
        <form onSubmit={handleQuickSubmit(onQuickSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="quick-companyName">Bedrijfsnaam *</Label>
            <Input 
              id="quick-companyName" 
              {...registerQuick("companyName", { required: "Bedrijfsnaam is verplicht" })} 
              data-testid="input-quick-company-name" 
            />
            {quickErrors.companyName && (
              <p className="text-xs text-destructive">{quickErrors.companyName.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quick-email">E-mail *</Label>
            <Input 
              id="quick-email" 
              type="email" 
              {...registerQuick("email", { required: "E-mail is verplicht" })} 
              data-testid="input-quick-email" 
            />
            {quickErrors.email && (
              <p className="text-xs text-destructive">{quickErrors.email.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quick-contactName">Contactpersoon (optioneel)</Label>
            <Input 
              id="quick-contactName" 
              {...registerQuick("contactName")} 
              data-testid="input-quick-contact-name" 
            />
          </div>
          
          <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-quick-submit">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aanmaken...
              </>
            ) : (
              <>
                <Link className="mr-2 h-4 w-4" />
                Aanmaken + Link Genereren
              </>
            )}
          </Button>
        </form>
      </TabsContent>

      {/* FULL MODE */}
      <TabsContent value="full">
        <ScrollArea className="max-h-[60vh]">
          <form onSubmit={handleSubmit(onFullSubmit)} className="space-y-4 py-4 pr-4">
            {/* SECTIE 1: Basisgegevens */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4" />
                Basisgegevens
              </h4>
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
                  <Label htmlFor="kvkNumber">KvK-nummer</Label>
                  <Input id="kvkNumber" placeholder="12345678" {...register("kvkNumber")} data-testid="input-kvk" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="street">Straat + huisnummer</Label>
                  <Input id="street" placeholder="Hoofdstraat 1" {...register("street")} data-testid="input-street" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="zipcode">Postcode</Label>
                  <Input id="zipcode" placeholder="1234 AB" {...register("zipcode")} data-testid="input-zipcode" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">Plaats</Label>
                  <Input id="city" {...register("city")} data-testid="input-city" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Land</Label>
                  <Input id="country" defaultValue="NL" {...register("country")} data-testid="input-country" />
                </div>
              </div>
            </div>

            {/* SECTIE 2: SEPA Automatisch Incasso (toggle) */}
            <Separator className="my-4" />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2 text-sm">
                  <CreditCard className="h-4 w-4" />
                  SEPA Automatisch Incasso
                </h4>
                <Switch 
                  checked={showSepaSection} 
                  onCheckedChange={setShowSepaSection}
                  data-testid="switch-sepa-section"
                />
              </div>
              
              {showSepaSection && (
                <div className="space-y-3 pl-2 border-l-2 border-muted">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="iban">IBAN *</Label>
                      <Input 
                        id="iban" 
                        placeholder="NL00BANK0123456789" 
                        {...register("iban")} 
                        data-testid="input-iban"
                        className="font-mono"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ibanAccountHolder">Tenaamstelling *</Label>
                      <Input id="ibanAccountHolder" {...register("ibanAccountHolder")} data-testid="input-iban-holder" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sepaBic">BIC code (optioneel)</Label>
                    <Input id="sepaBic" placeholder="INGBNL2A" {...register("sepaBic")} data-testid="input-sepa-bic" className="font-mono" />
                    <p className="text-xs text-muted-foreground">Niet verplicht voor NL rekeningen</p>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox 
                      id="sepaMandate" 
                      checked={hasSepaMandate}
                      onCheckedChange={(checked) => setHasSepaMandate(checked === true)}
                      data-testid="checkbox-sepa-mandate"
                    />
                    <Label htmlFor="sepaMandate" className="text-sm font-normal cursor-pointer">
                      Machtiging getekend
                    </Label>
                  </div>
                  {hasSepaMandate && (
                    <div className="grid gap-2 bg-muted/30 p-3 rounded-lg">
                      <Label htmlFor="sepaMandateReference">Mandaat Kenmerk</Label>
                      <Input 
                        id="sepaMandateReference" 
                        placeholder="EVZ-YYYYMMDD-XXXX" 
                        {...register("sepaMandateReference")} 
                        data-testid="input-mandate-ref"
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Automatisch gegenereerd indien leeg
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTIE 3: Extra (Moneybird) - Collapsible */}
            <Separator className="my-4" />
            <Collapsible open={showExtraSection} onOpenChange={setShowExtraSection}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent" data-testid="button-toggle-extra">
                  <h4 className="font-medium flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    Extra (Moneybird)
                  </h4>
                  {showExtraSection ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-4">
                {/* Facturatie instellingen */}
                <div className="space-y-3 pl-2 border-l-2 border-muted">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Facturatie</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="invoiceDeliveryMethod">Verzendmethode</Label>
                      <Select value={invoiceDeliveryMethod} onValueChange={setInvoiceDeliveryMethod}>
                        <SelectTrigger data-testid="select-invoice-delivery">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="post">Post</SelectItem>
                          <SelectItem value="portal">Portal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="language">Taal</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger data-testid="select-language">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nl">Nederlands</SelectItem>
                          <SelectItem value="en">Engels</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="paymentTermDays">Betaaltermijn (dagen)</Label>
                      <Input 
                        id="paymentTermDays" 
                        type="number" 
                        min="0" 
                        max="90" 
                        defaultValue="14"
                        {...register("paymentTermDays")} 
                        data-testid="input-payment-term" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="discountPercentage">Korting (%)</Label>
                      <Input 
                        id="discountPercentage" 
                        type="number" 
                        min="0" 
                        max="100" 
                        step="0.01"
                        placeholder="0.00"
                        {...register("discountPercentage")} 
                        data-testid="input-discount" 
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invoiceEmail">Factuur e-mail (indien anders)</Label>
                    <Input 
                      id="invoiceEmail" 
                      type="email" 
                      placeholder="facturatie@bedrijf.nl"
                      {...register("invoiceEmail")} 
                      data-testid="input-invoice-email" 
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="isBusiness" 
                      checked={isBusiness}
                      onCheckedChange={(checked) => setIsBusiness(checked === true)}
                      data-testid="checkbox-is-business"
                    />
                    <Label htmlFor="isBusiness" className="text-sm font-normal cursor-pointer">
                      Zakelijke klant (BTW-plichtig)
                    </Label>
                  </div>
                </div>

                {/* Extra contactgegevens */}
                <div className="space-y-3 pl-2 border-l-2 border-muted">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Extra contact</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="attention">T.a.v.</Label>
                      <Input id="attention" placeholder="Afdeling administratie" {...register("attention")} data-testid="input-attention" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customerReference">Referentie / klantnummer</Label>
                      <Input id="customerReference" {...register("customerReference")} data-testid="input-customer-ref" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" type="url" placeholder="https://www.bedrijf.nl" {...register("website")} data-testid="input-website" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tags">Labels (max 5, komma-gescheiden)</Label>
                    <Input id="tags" placeholder="horeca, premium, regio-noord" {...register("tags")} data-testid="input-tags" />
                  </div>
                </div>

                {/* Notities */}
                <div className="space-y-3 pl-2 border-l-2 border-muted">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Notities</p>
                  <div className="grid gap-2">
                    <Label htmlFor="notes">Interne notities</Label>
                    <Input id="notes" placeholder="Max 500 karakters" {...register("notes")} data-testid="input-notes" />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex justify-end pt-4">
              <Button type="submit" data-testid="button-submit">Adverteerder Aanmaken</Button>
            </div>
          </form>
        </ScrollArea>
      </TabsContent>
    </Tabs>
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
