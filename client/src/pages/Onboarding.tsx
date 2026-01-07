import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { 
  Monitor, 
  Users, 
  Target,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Wifi,
  WifiOff,
  Upload,
  Building2,
  Plus,
  MapPin,
  Copy,
  ExternalLink
} from "lucide-react";

type WizardType = "screen" | "advertiser" | "ad" | "location" | null;

interface Location {
  id: string;
  name: string;
  address: string;
  contactName: string;
}

interface Screen {
  id: string;
  screenId: string;
  name: string;
  status: string;
  locationId: string;
}

interface Advertiser {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
}

function WizardCard({ 
  title, 
  description, 
  icon: Icon, 
  onClick,
  color
}: { 
  title: string; 
  description: string; 
  icon: React.ElementType;
  onClick: () => void;
  color: string;
}) {
  return (
    <Card 
      className={`cursor-pointer hover:shadow-lg transition-all border-2 hover:border-${color}-300`}
      onClick={onClick}
      data-testid={`wizard-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className={`p-4 rounded-full bg-${color}-100`}>
            <Icon className={`h-8 w-8 text-${color}-600`} />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <Button className="w-full">
            Start <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Yodeck scherm type uit cache
interface YodeckScreen {
  yodeckScreenId: string;
  name: string;
  uuid: string | null;
  status: string;
  lastSeen: string | null;
  screenshotUrl: string | null;
}

// Moneybird contact type
interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstname: string | null;
  lastname: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
}

function NewScreenWizard({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  
  // Stap 1: Yodeck scherm selectie
  const [selectedYodeckScreen, setSelectedYodeckScreen] = useState<YodeckScreen | null>(null);
  const [yodeckSearch, setYodeckSearch] = useState("");
  
  // Stap 2: Moneybird contact (bestaand of nieuw)
  const [isNewContact, setIsNewContact] = useState(false);
  const [selectedMoneybirdContact, setSelectedMoneybirdContact] = useState<MoneybirdContact | null>(null);
  const [moneybirdSearch, setMoneybirdSearch] = useState("");
  const [newContactData, setNewContactData] = useState({
    company: "",
    address: "",
    zipcode: "",
    city: "",
    email: "",
    phone: "",
  });
  
  const [createdScreenId, setCreatedScreenId] = useState("");

  // Fetch Yodeck schermen uit cache
  const { data: yodeckScreens = [], isLoading: yodeckLoading } = useQuery<YodeckScreen[]>({
    queryKey: ["/api/yodeck/screens-cache"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/yodeck/screens-cache");
      return res.json();
    },
  });

  // Fetch Moneybird contacten
  const { data: moneybirdContacts = [], isLoading: moneybirdLoading } = useQuery<MoneybirdContact[]>({
    queryKey: ["/api/moneybird/contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/moneybird/contacts");
      return res.json();
    },
  });

  // Filter Yodeck schermen op zoekterm
  const filteredYodeckScreens = yodeckScreens.filter(s => {
    if (!yodeckSearch) return true;
    const search = yodeckSearch.toLowerCase();
    return (s.name || '').toLowerCase().includes(search) ||
           (s.yodeckScreenId || '').toLowerCase().includes(search);
  });

  // Filter Moneybird contacten op zoekterm
  const filteredMoneybirdContacts = moneybirdContacts.filter(c => {
    if (!moneybirdSearch) return true;
    const search = moneybirdSearch.toLowerCase();
    const name = (c.companyName || `${c.firstname || ''} ${c.lastname || ''}`).toLowerCase();
    const city = (c.city || '').toLowerCase();
    return name.includes(search) || city.includes(search);
  });

  // Genereer Screen ID op basis van Yodeck device
  const generateScreenId = () => {
    if (selectedYodeckScreen) {
      return `YDK-${selectedYodeckScreen.yodeckScreenId}`;
    }
    const nextNum = Math.floor(Math.random() * 900) + 100;
    return `EVZ-${String(nextNum).padStart(3, '0')}`;
  };

  // Link Yodeck screen to Moneybird contact
  const createScreenMutation = useMutation({
    mutationFn: async () => {
      // VALIDATIE: Blokkeer zonder geldig Yodeck device
      if (!selectedYodeckScreen?.yodeckScreenId) {
        throw new Error("Selecteer eerst een Yodeck scherm");
      }
      
      // VALIDATIE: Blokkeer zonder geldig Moneybird contact
      if (!isNewContact && !selectedMoneybirdContact?.moneybirdId) {
        throw new Error("Selecteer eerst een Moneybird contact");
      }
      if (isNewContact && (!newContactData.company || !newContactData.city)) {
        throw new Error("Bedrijfsnaam en plaats zijn verplicht");
      }

      const screenId = generateScreenId();
      setCreatedScreenId(screenId);

      // Gebruik bestaand endpoint met Moneybird integratie
      const res = await apiRequest("POST", "/api/screens/with-moneybird", {
        screenId,
        name: selectedYodeckScreen.name || screenId,
        yodeckPlayerId: selectedYodeckScreen.yodeckScreenId,
        // Moneybird: bestaand contact of nieuw contact aanmaken
        moneybirdContactId: !isNewContact ? selectedMoneybirdContact!.moneybirdId : undefined,
        createMoneybird: isNewContact,
        company: isNewContact ? newContactData.company : undefined,
        address: isNewContact ? newContactData.address : undefined,
        zipcode: isNewContact ? newContactData.zipcode : undefined,
        city: isNewContact ? newContactData.city : undefined,
        email: isNewContact ? newContactData.email : undefined,
        phone: isNewContact ? newContactData.phone : undefined,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Fout bij aanmaken scherm");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      queryClient.invalidateQueries({ queryKey: ["/api/screens/with-business"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
      toast({ title: "Scherm toegevoegd!", description: "Moneybird contact gekoppeld" });
      setStep(4); // Succes stap
    },
    onError: (error: Error) => {
      toast({ title: "Fout bij aanmaken", description: error.message, variant: "destructive" });
    },
  });

  // Validatie: kan naar volgende stap?
  const canProceedStep1 = selectedYodeckScreen !== null;
  const canProceedStep2 = isNewContact 
    ? (newContactData.company.trim() !== "" && newContactData.city.trim() !== "")
    : (selectedMoneybirdContact !== null);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Terug
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Nieuw Scherm Toevoegen
          </CardTitle>
          <CardDescription>{step <= 3 ? `Stap ${step} van 3` : "Voltooid"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* STAP 1: Selecteer Yodeck scherm */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                Selecteer Scherm (Yodeck)
              </h3>
              
              <div className="space-y-2">
                <Label>Zoek scherm</Label>
                <div className="relative">
                  <Input 
                    value={yodeckSearch}
                    onChange={(e) => setYodeckSearch(e.target.value)}
                    placeholder="Zoek op naam of device ID..."
                  />
                </div>
              </div>

              {yodeckLoading ? (
                <div className="py-8 text-center text-muted-foreground">Laden...</div>
              ) : filteredYodeckScreens.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  Geen Yodeck schermen gevonden
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-2">
                  {filteredYodeckScreens.map((screen) => (
                    <div
                      key={screen.yodeckScreenId}
                      onClick={() => setSelectedYodeckScreen(screen)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                        selectedYodeckScreen?.yodeckScreenId === screen.yodeckScreenId
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-muted border-transparent"
                      }`}
                      data-testid={`yodeck-screen-${screen.yodeckScreenId}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{screen.name || `Scherm ${screen.yodeckScreenId}`}</p>
                            <p className="text-xs text-muted-foreground">ID: {screen.yodeckScreenId}</p>
                          </div>
                        </div>
                        <Badge variant={screen.status === "online" ? "default" : "destructive"}>
                          {screen.status === "online" ? (
                            <><Wifi className="h-3 w-3 mr-1" /> Online</>
                          ) : (
                            <><WifiOff className="h-3 w-3 mr-1" /> Offline</>
                          )}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button 
                className="w-full" 
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                data-testid="button-next-step1"
              >
                Volgende <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* STAP 2: Koppel Bedrijf (Moneybird) */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Koppel Bedrijf (Moneybird)
              </h3>
              
              {/* Geselecteerd Yodeck scherm tonen */}
              <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{selectedYodeckScreen?.name}</p>
                  <p className="text-xs text-muted-foreground">Yodeck ID: {selectedYodeckScreen?.yodeckScreenId}</p>
                </div>
              </div>

              {/* Keuze: bestaand of nieuw contact */}
              <div className="flex gap-2">
                <Button 
                  variant={!isNewContact ? "default" : "outline"}
                  onClick={() => setIsNewContact(false)}
                  data-testid="button-existing-contact"
                >
                  Bestaand contact
                </Button>
                <Button 
                  variant={isNewContact ? "default" : "outline"}
                  onClick={() => setIsNewContact(true)}
                  data-testid="button-new-contact"
                >
                  <Plus className="mr-1 h-4 w-4" /> Nieuw contact
                </Button>
              </div>

              {!isNewContact ? (
                /* Selecteer bestaand Moneybird contact */
                <div className="space-y-2">
                  <Label>Zoek Moneybird contact</Label>
                  <Input 
                    value={moneybirdSearch}
                    onChange={(e) => setMoneybirdSearch(e.target.value)}
                    placeholder="Zoek op bedrijfsnaam of plaats..."
                  />
                  
                  {moneybirdLoading ? (
                    <div className="py-4 text-center text-muted-foreground">Laden...</div>
                  ) : filteredMoneybirdContacts.length === 0 ? (
                    <div className="py-4 text-center text-muted-foreground">
                      Geen contacten gevonden
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-lg p-2">
                      {filteredMoneybirdContacts.slice(0, 20).map((contact) => (
                        <div
                          key={contact.id}
                          onClick={() => setSelectedMoneybirdContact(contact)}
                          className={`p-3 rounded-lg cursor-pointer transition-colors border ${
                            selectedMoneybirdContact?.id === contact.id
                              ? "bg-primary/10 border-primary"
                              : "hover:bg-muted border-transparent"
                          }`}
                          data-testid={`moneybird-contact-${contact.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                {contact.companyName || `${contact.firstname || ''} ${contact.lastname || ''}`}
                              </p>
                              {contact.city && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {contact.city}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Nieuw Moneybird contact aanmaken */
                <div className="space-y-4 border p-4 rounded-lg">
                  <div className="space-y-2">
                    <Label>Bedrijfsnaam *</Label>
                    <Input 
                      value={newContactData.company}
                      onChange={(e) => setNewContactData({ ...newContactData, company: e.target.value })}
                      placeholder="Bedrijfsnaam BV"
                      data-testid="input-company"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Adres (straat + nr)</Label>
                    <Input 
                      value={newContactData.address}
                      onChange={(e) => setNewContactData({ ...newContactData, address: e.target.value })}
                      placeholder="Hoofdstraat 1"
                      data-testid="input-address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Postcode</Label>
                      <Input 
                        value={newContactData.zipcode}
                        onChange={(e) => setNewContactData({ ...newContactData, zipcode: e.target.value })}
                        placeholder="1234 AB"
                        data-testid="input-zipcode"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Plaats *</Label>
                      <Input 
                        value={newContactData.city}
                        onChange={(e) => setNewContactData({ ...newContactData, city: e.target.value })}
                        placeholder="Amsterdam"
                        data-testid="input-city"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>E-mail</Label>
                      <Input 
                        type="email"
                        value={newContactData.email}
                        onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                        placeholder="info@bedrijf.nl"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefoon</Label>
                      <Input 
                        value={newContactData.phone}
                        onChange={(e) => setNewContactData({ ...newContactData, phone: e.target.value })}
                        placeholder="06-12345678"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => setStep(3)}
                  disabled={!canProceedStep2}
                  data-testid="button-next-step2"
                >
                  Volgende <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STAP 3: Bevestiging */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Bevestig koppeling</h3>
              
              <div className="space-y-3">
                {/* Yodeck scherm */}
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Scherm (Yodeck)</p>
                  <p className="font-semibold">{selectedYodeckScreen?.name}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    Yodeck ID: {selectedYodeckScreen?.yodeckScreenId}
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {selectedYodeckScreen?.status === "online" ? "Online" : "Offline"}
                  </Badge>
                </div>
                
                {/* Bedrijf (Moneybird) */}
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Bedrijf (Moneybird)</p>
                  {isNewContact ? (
                    <>
                      <p className="font-semibold">{newContactData.company}</p>
                      <p className="text-sm text-muted-foreground">
                        {newContactData.city}
                        {newContactData.address && ` • ${newContactData.address}`}
                      </p>
                      <Badge variant="secondary" className="mt-2">Nieuw contact</Badge>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">
                        {selectedMoneybirdContact?.companyName || 
                         `${selectedMoneybirdContact?.firstname || ''} ${selectedMoneybirdContact?.lastname || ''}`}
                      </p>
                      {selectedMoneybirdContact?.city && (
                        <p className="text-sm text-muted-foreground">{selectedMoneybirdContact.city}</p>
                      )}
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        Moneybird ID: {selectedMoneybirdContact?.moneybirdId}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => createScreenMutation.mutate()}
                  disabled={createScreenMutation.isPending}
                  data-testid="button-confirm"
                >
                  {createScreenMutation.isPending ? "Bezig..." : "Scherm Toevoegen"}
                </Button>
              </div>
            </div>
          )}

          {/* STAP 4: Succes */}
          {step === 4 && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
              <h3 className="text-xl font-bold">Scherm Toegevoegd!</h3>
              <p className="text-muted-foreground">
                {createdScreenId} is nu actief en wordt gemonitord.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={onBack}>
                  Terug naar Onboarding
                </Button>
                <Button asChild>
                  <a href="/schermen">
                    <Monitor className="mr-2 h-4 w-4" /> Bekijk Schermen
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewAdvertiserWizard({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portalLink, setPortalLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [formData, setFormData] = useState({
    companyName: "",
    email: "",
    contactName: "",
  });

  const onQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.email) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/advertisers/quick-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName,
          email: formData.email,
          contactName: formData.contactName || undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Fout bij aanmaken");
      }
      
      const result = await response.json();
      setPortalLink({ url: result.portalUrl, expiresAt: result.expiresAt });
      queryClient.invalidateQueries({ queryKey: ["/api/advertisers"] });
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

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Terug
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Nieuwe Adverteerder
          </CardTitle>
          <CardDescription>
            {portalLink ? "Klaar! Stuur de link naar de klant." : "Snelle aanmaak met invul-link"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {portalLink ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
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
                <p className="text-xs text-muted-foreground">
                  Geldig tot {new Date(portalLink.expiresAt).toLocaleDateString("nl-NL")}
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={onBack}>
                  Terug naar Onboarding
                </Button>
                <Button onClick={() => window.open(portalLink.url, '_blank')}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Link Openen
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onQuickSubmit} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium">Snelle aanmaak met invul-link</p>
                <p className="mt-1 text-blue-700">
                  Vul alleen bedrijfsnaam en e-mail in. De klant ontvangt een link om zelf de rest in te vullen.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Bedrijfsnaam *</Label>
                <Input 
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="ABC Fitness"
                  required
                  data-testid="input-company-name"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="info@abcfitness.nl"
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Contactpersoon (optioneel)</Label>
                <Input 
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="Jan Jansen"
                  data-testid="input-contact-name"
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting || !formData.companyName || !formData.email}
                data-testid="button-submit"
              >
                {isSubmitting ? "Aanmaken..." : "Aanmaken + Link Genereren"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewAdWizard({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    advertiserId: "",
    creativeName: "",
    creativeType: "image",
    durationSeconds: 10,
    selectedScreens: [] as string[],
    startDate: "",
    endDate: "",
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

  const toggleScreen = (screenId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedScreens: prev.selectedScreens.includes(screenId)
        ? prev.selectedScreens.filter(id => id !== screenId)
        : [...prev.selectedScreens, screenId]
    }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Terug
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Nieuwe Ad + Plaatsing
          </CardTitle>
          <CardDescription>Stap {step} van 4</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">Creative Uploaden</h3>
              
              <div className="space-y-2">
                <Label>Adverteerder</Label>
                <Select 
                  value={formData.advertiserId} 
                  onValueChange={(v) => setFormData({ ...formData, advertiserId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer adverteerder..." />
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

              <div className="space-y-2">
                <Label>Creative Naam</Label>
                <Input 
                  value={formData.creativeName}
                  onChange={(e) => setFormData({ ...formData, creativeName: e.target.value })}
                  placeholder="Zomer Actie 2025"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select 
                    value={formData.creativeType} 
                    onValueChange={(v) => setFormData({ ...formData, creativeType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">Afbeelding</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duur (seconden)</Label>
                  <Input 
                    type="number"
                    value={formData.durationSeconds}
                    onChange={(e) => setFormData({ ...formData, durationSeconds: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>

              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Sleep bestand hierheen of klik om te uploaden
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, MP4 - Max 50MB
                </p>
              </div>

              <Button 
                className="w-full" 
                onClick={() => setStep(2)}
                disabled={!formData.advertiserId || !formData.creativeName}
              >
                Volgende <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Selecteer Schermen</h3>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {screens.map((screen) => (
                  <div
                    key={screen.id}
                    className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.selectedScreens.includes(screen.id) 
                        ? "border-blue-500 bg-blue-50" 
                        : "hover:bg-muted"
                    }`}
                    onClick={() => toggleScreen(screen.id)}
                  >
                    <div className="flex items-center gap-3">
                      {screen.status === "online" ? (
                        <Wifi className="h-4 w-4 text-green-600" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-red-600" />
                      )}
                      <div>
                        <p className="font-mono font-medium">{screen.screenId}</p>
                        <p className="text-sm text-muted-foreground">{screen.name}</p>
                      </div>
                    </div>
                    {formData.selectedScreens.includes(screen.id) && (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                {formData.selectedScreens.length} scherm(en) geselecteerd
              </p>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => setStep(3)}
                  disabled={formData.selectedScreens.length === 0}
                >
                  Volgende <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Planning</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Startdatum</Label>
                  <Input 
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Einddatum (optioneel)</Label>
                  <Input 
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Samenvatting</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formData.creativeName} wordt geplaatst op {formData.selectedScreens.length} scherm(en)
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button className="flex-1" onClick={() => setStep(4)}>
                  Plaatsing Aanmaken
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
              <h3 className="text-xl font-bold">Plaatsing Aangemaakt!</h3>
              <p className="text-muted-foreground">
                Nu draaiend op: {formData.selectedScreens.map(id => 
                  screens.find(s => s.id === id)?.screenId
                ).join(", ")}
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={onBack}>
                  Terug naar Onboarding
                </Button>
                <Button asChild>
                  <a href="/placements">
                    <Target className="mr-2 h-4 w-4" /> Bekijk Plaatsingen
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewLocationOnboardingWizard({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [portalLink, setPortalLink] = useState<{ url: string; expiresAt: string; locationCode: string; locationId: string } | null>(null);

  const onQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await apiRequest("POST", "/api/locations/quick-create", formData);
      const data = await res.json();
      
      if (res.ok) {
        setPortalLink({
          url: data.portalUrl,
          expiresAt: data.expiresAt,
          locationCode: data.location.locationCode,
          locationId: data.location.id,
        });
        toast({
          title: "Locatie aangemaakt!",
          description: `${data.location.locationCode} is aangemaakt. Stuur de link naar de klant.`,
        });
      } else {
        throw new Error(data.message || "Er is iets misgegaan");
      }
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
      toast({ title: "Link gekopieerd!" });
    }
  };

  const sendEmail = async () => {
    if (!portalLink) return;
    setIsSendingEmail(true);
    
    try {
      const res = await apiRequest("POST", `/api/locations/${portalLink.locationId}/send-portal-email`);
      const data = await res.json();
      
      if (res.ok) {
        setEmailSent(true);
        toast({
          title: "E-mail verstuurd!",
          description: `De portal link is verstuurd naar ${formData.email}`,
        });
      } else {
        throw new Error(data.message || "Kon e-mail niet versturen");
      }
    } catch (error: any) {
      toast({
        title: "Fout bij versturen",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Terug
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Nieuwe Schermlocatie
          </CardTitle>
          <CardDescription>
            Alleen bedrijfsnaam en e-mail nodig. Klant vult rest in via portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portalLink ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-semibold text-lg text-emerald-800">Locatie Aangemaakt!</h3>
                <p className="text-emerald-700 font-mono text-lg mt-1">{portalLink.locationCode}</p>
                <p className="text-sm text-emerald-600 mt-1">Status: Wacht op gegevens</p>
              </div>

              <div className="space-y-2">
                <Label>Portal Link</Label>
                <div className="flex gap-2">
                  <Input 
                    value={portalLink.url} 
                    readOnly 
                    className="font-mono text-xs"
                    data-testid="input-portal-link"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="icon"
                    onClick={copyPortalLink}
                    data-testid="button-copy-link"
                    title="Kopieer link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Geldig tot {new Date(portalLink.expiresAt).toLocaleDateString("nl-NL")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={copyPortalLink}
                  data-testid="button-copy-link-large"
                >
                  <Copy className="mr-2 h-4 w-4" /> Kopieer Link
                </Button>
                <Button 
                  onClick={sendEmail}
                  disabled={isSendingEmail || emailSent}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-send-email"
                >
                  {isSendingEmail ? (
                    "Versturen..."
                  ) : emailSent ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" /> Verstuurd
                    </>
                  ) : (
                    "Verstuur E-mail"
                  )}
                </Button>
              </div>

              {emailSent && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  <CheckCircle className="inline h-4 w-4 mr-1" />
                  E-mail verstuurd naar {formData.email}
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={onBack}>
                  Terug naar Onboarding
                </Button>
                <Button variant="outline" onClick={() => window.open(portalLink.url, '_blank')}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Link Openen
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onQuickSubmit} className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                <p className="font-medium">Ultra-snelle aanmaak</p>
                <p className="mt-1 text-emerald-700">
                  Alleen bedrijfsnaam + e-mail. De klant vult de rest in via de portal-link.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Bedrijfsnaam *</Label>
                <Input 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Sportschool FitLife"
                  required
                  data-testid="input-location-name"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail contactpersoon *</Label>
                <Input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="info@fitlife.nl"
                  required
                  data-testid="input-location-email"
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700" 
                disabled={isSubmitting || !formData.name || !formData.email}
                data-testid="button-submit-location"
              >
                {isSubmitting ? "Aanmaken..." : "Locatie Aanmaken"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Onboarding() {
  const [activeWizard, setActiveWizard] = useState<WizardType>(null);

  if (activeWizard === "screen") {
    return <NewScreenWizard onBack={() => setActiveWizard(null)} />;
  }

  if (activeWizard === "advertiser") {
    return <NewAdvertiserWizard onBack={() => setActiveWizard(null)} />;
  }

  if (activeWizard === "ad") {
    return <NewAdWizard onBack={() => setActiveWizard(null)} />;
  }

  if (activeWizard === "location") {
    return <NewLocationOnboardingWizard onBack={() => setActiveWizard(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Onboarding</h1>
        <p className="text-muted-foreground">Snel nieuwe items toevoegen met guided wizards</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <WizardCard
          title="Nieuwe Locatie"
          description="Start onboarding voor nieuwe schermlocatie met portal-link"
          icon={MapPin}
          onClick={() => setActiveWizard("location")}
          color="emerald"
        />
        <WizardCard
          title="Nieuwe Adverteerder"
          description="Registreer een nieuwe adverteerder in het systeem"
          icon={Users}
          onClick={() => setActiveWizard("advertiser")}
          color="green"
        />
        <WizardCard
          title="Nieuwe Ad + Plaatsing"
          description="Upload creative en plaats op schermen - meest gebruikt"
          icon={Target}
          onClick={() => setActiveWizard("ad")}
          color="purple"
        />
      </div>

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Building2 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-medium">Tip: Meest gebruikte flow</h3>
              <p className="text-sm text-muted-foreground mt-1">
                De meeste dagelijkse onboarding is: <strong>Nieuwe Ad + Plaatsing</strong>. 
                Hiermee upload je snel een creative en plaats je deze op één of meerdere schermen.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
