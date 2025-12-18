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

type WizardType = "screen" | "advertiser" | "ad" | null;

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

function NewScreenWizard({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    locationId: "",
    newLocationName: "",
    newLocationAddress: "",
    newLocationContact: "",
    newLocationEmail: "",
    newLocationPhone: "",
    screenName: "",
    yodeckDeviceId: "",
  });
  const [generatedScreenId, setGeneratedScreenId] = useState("");
  const [isNewLocation, setIsNewLocation] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/locations");
      return res.json();
    },
  });

  const generateScreenId = () => {
    const nextNum = Math.floor(Math.random() * 900) + 100;
    const id = `EVZ-${String(nextNum).padStart(3, '0')}`;
    setGeneratedScreenId(id);
    return id;
  };

  const createScreenMutation = useMutation({
    mutationFn: async () => {
      let locationId = formData.locationId;
      
      if (isNewLocation) {
        const locRes = await apiRequest("POST", "/api/locations", {
          name: formData.newLocationName,
          address: formData.newLocationAddress,
          contactName: formData.newLocationContact,
          email: formData.newLocationEmail,
          phone: formData.newLocationPhone,
        });
        const newLoc = await locRes.json();
        locationId = newLoc.id;
      }

      const res = await apiRequest("POST", "/api/screens", {
        screenId: generatedScreenId,
        locationId,
        name: formData.screenName || generatedScreenId,
        yodeckPlayerId: formData.yodeckDeviceId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/screens"] });
      toast({ title: "Scherm toegevoegd!" });
      setStep(5);
    },
    onError: () => {
      toast({ title: "Fout bij aanmaken scherm", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Gekopieerd!" });
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
            <Monitor className="h-5 w-5" />
            Nieuw Scherm Toevoegen
          </CardTitle>
          <CardDescription>Stap {step} van 5</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">Selecteer of maak locatie</h3>
              
              <div className="flex gap-2">
                <Button 
                  variant={!isNewLocation ? "default" : "outline"}
                  onClick={() => setIsNewLocation(false)}
                >
                  Bestaande locatie
                </Button>
                <Button 
                  variant={isNewLocation ? "default" : "outline"}
                  onClick={() => setIsNewLocation(true)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Nieuwe locatie
                </Button>
              </div>

              {!isNewLocation ? (
                <div className="space-y-2">
                  <Label>Locatie</Label>
                  <Select 
                    value={formData.locationId} 
                    onValueChange={(v) => setFormData({ ...formData, locationId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer locatie..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name} - {loc.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-4 border p-4 rounded-lg">
                  <div className="space-y-2">
                    <Label>Bedrijfsnaam</Label>
                    <Input 
                      value={formData.newLocationName}
                      onChange={(e) => setFormData({ ...formData, newLocationName: e.target.value })}
                      placeholder="Café De Hoek"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Adres</Label>
                    <Input 
                      value={formData.newLocationAddress}
                      onChange={(e) => setFormData({ ...formData, newLocationAddress: e.target.value })}
                      placeholder="Hoofdstraat 1, 1234 AB Amsterdam"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contactpersoon</Label>
                      <Input 
                        value={formData.newLocationContact}
                        onChange={(e) => setFormData({ ...formData, newLocationContact: e.target.value })}
                        placeholder="Jan Jansen"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefoon</Label>
                      <Input 
                        value={formData.newLocationPhone}
                        onChange={(e) => setFormData({ ...formData, newLocationPhone: e.target.value })}
                        placeholder="06-12345678"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={formData.newLocationEmail}
                      onChange={(e) => setFormData({ ...formData, newLocationEmail: e.target.value })}
                      placeholder="info@cafedehoek.nl"
                    />
                  </div>
                </div>
              )}

              <Button 
                className="w-full" 
                onClick={() => {
                  generateScreenId();
                  setStep(2);
                }}
                disabled={!isNewLocation && !formData.locationId}
              >
                Volgende <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Screen ID gegenereerd</h3>
              
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-2">Jouw nieuwe Screen ID:</p>
                <p className="text-3xl font-mono font-bold text-green-700">{generatedScreenId}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => copyToClipboard(generatedScreenId)}
                >
                  <Copy className="mr-1 h-4 w-4" /> Kopieer
                </Button>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800">Belangrijke instructie:</p>
                <p className="text-sm text-amber-700 mt-1">
                  Stel de Yodeck device naam of tag in als <strong>{generatedScreenId}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Scherm naam (optioneel)</Label>
                <Input 
                  value={formData.screenName}
                  onChange={(e) => setFormData({ ...formData, screenName: e.target.value })}
                  placeholder={generatedScreenId}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Volgende <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Koppel Yodeck Device</h3>
              
              <div className="space-y-2">
                <Label>Yodeck Device ID (optioneel)</Label>
                <Input 
                  value={formData.yodeckDeviceId}
                  onChange={(e) => setFormData({ ...formData, yodeckDeviceId: e.target.value })}
                  placeholder="Device ID uit Yodeck dashboard"
                />
                <p className="text-xs text-muted-foreground">
                  Je kunt dit later ook koppelen vanuit het Schermen overzicht
                </p>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <a href="https://app.yodeck.com" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open Yodeck
                </a>
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button className="flex-1" onClick={() => setStep(4)}>
                  Volgende <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium">Bevestig & Valideer</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Screen ID</span>
                  <span className="font-mono font-bold">{generatedScreenId}</span>
                </div>
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Locatie</span>
                  <span>
                    {isNewLocation 
                      ? formData.newLocationName 
                      : locations.find(l => l.id === formData.locationId)?.name
                    }
                  </span>
                </div>
                {formData.yodeckDeviceId && (
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Yodeck Device</span>
                    <span className="font-mono">{formData.yodeckDeviceId}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => createScreenMutation.mutate()}
                  disabled={createScreenMutation.isPending}
                >
                  {createScreenMutation.isPending ? "Bezig..." : "Scherm Toevoegen"}
                </Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
              <h3 className="text-xl font-bold">Scherm Toegevoegd!</h3>
              <p className="text-muted-foreground">
                {generatedScreenId} is nu actief en wordt gemonitord.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={onBack}>
                  Terug naar Onboarding
                </Button>
                <Button asChild>
                  <a href={`/placements?screen=${generatedScreenId}`}>
                    <Target className="mr-2 h-4 w-4" /> Voeg Plaatsingen Toe
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
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    moneybirdContactId: "",
  });
  const [createdAdvertiser, setCreatedAdvertiser] = useState<Advertiser | null>(null);

  const createAdvertiserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/advertisers", {
        companyName: formData.companyName,
        contactName: formData.contactName,
        email: formData.email,
        phone: formData.phone || null,
        address: formData.address || null,
        moneybirdContactId: formData.moneybirdContactId || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertisers"] });
      setCreatedAdvertiser(data);
      setStep(4);
      toast({ title: "Adverteerder aangemaakt!" });
    },
    onError: () => {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    },
  });

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
          <CardDescription>Stap {step} van 4</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium">Bedrijfsgegevens</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Bedrijfsnaam *</Label>
                  <Input 
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="ABC Fitness"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contactpersoon *</Label>
                    <Input 
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="Jan Jansen"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefoon</Label>
                    <Input 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="06-12345678"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input 
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="info@abcfitness.nl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Adres</Label>
                  <Input 
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Sportlaan 1, 1234 AB Amsterdam"
                  />
                </div>
              </div>

              <Button 
                className="w-full" 
                onClick={() => setStep(2)}
                disabled={!formData.companyName || !formData.contactName || !formData.email}
              >
                Volgende <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium">Moneybird Koppeling (optioneel)</h3>
              
              <div className="space-y-2">
                <Label>Moneybird Contact ID</Label>
                <Input 
                  value={formData.moneybirdContactId}
                  onChange={(e) => setFormData({ ...formData, moneybirdContactId: e.target.value })}
                  placeholder="Contact ID uit Moneybird"
                />
                <p className="text-xs text-muted-foreground">
                  Je kunt dit later ook koppelen. Financiële integratie is secundair in V1.
                </p>
              </div>

              <Button variant="outline" className="w-full" asChild>
                <a href="https://moneybird.com" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open Moneybird
                </a>
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Volgende <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium">Bevestig Gegevens</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Bedrijf</span>
                  <span className="font-medium">{formData.companyName}</span>
                </div>
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Contact</span>
                  <span>{formData.contactName}</span>
                </div>
                <div className="flex justify-between p-3 bg-muted rounded-lg">
                  <span className="text-muted-foreground">Email</span>
                  <span>{formData.email}</span>
                </div>
                {formData.moneybirdContactId && (
                  <div className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-muted-foreground">Moneybird</span>
                    <Badge variant="secondary">{formData.moneybirdContactId}</Badge>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Terug
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => createAdvertiserMutation.mutate()}
                  disabled={createAdvertiserMutation.isPending}
                >
                  {createAdvertiserMutation.isPending ? "Bezig..." : "Adverteerder Aanmaken"}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && createdAdvertiser && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
              <h3 className="text-xl font-bold">Adverteerder Aangemaakt!</h3>
              <p className="text-muted-foreground">
                {createdAdvertiser.companyName} is nu actief.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={onBack}>
                  Terug naar Onboarding
                </Button>
                <Button asChild>
                  <a href={`/placements?advertiser=${createdAdvertiser.id}`}>
                    <Upload className="mr-2 h-4 w-4" /> Upload Creative
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Onboarding</h1>
        <p className="text-muted-foreground">Snel nieuwe items toevoegen met guided wizards</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <WizardCard
          title="Nieuw Scherm"
          description="Voeg een nieuw scherm toe met EVZ-ID en koppel aan Yodeck"
          icon={Monitor}
          onClick={() => setActiveWizard("screen")}
          color="blue"
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
