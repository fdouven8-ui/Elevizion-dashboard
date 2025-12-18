import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  MapPin, 
  Users, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  AlertTriangle,
  Wifi,
  Power,
  Camera,
  Monitor,
  FileSignature,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Plus,
  Trash2
} from "lucide-react";

type OnboardingType = "location" | "advertiser" | "both";

interface WizardState {
  onboardingType: OnboardingType;
  companyBasics: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postcode: string;
    kvkNumber: string;
    notes: string;
  };
  locationDetails: {
    locationDisplayName: string;
    revenueSharePercent: string;
  };
  advertiserDetails: {
    preferredPackagePlanId: string;
    customPriceExVat: string;
    startDate: string;
    endDate: string;
  };
  schouw: {
    surveyDate: string;
    hasWifiAvailable: boolean;
    wifiNetworkName: string;
    wifiPassword: string;
    hasPowerOutlet: boolean;
    powerOutletLocation: string;
    proposedScreenCount: number;
    proposedScreenLocations: string;
    wallMountPossible: boolean;
    ceilingMountPossible: boolean;
    standMountPossible: boolean;
    footTrafficEstimate: string;
    targetAudience: string;
    competingScreens: boolean;
    competingScreensNotes: string;
    installationNotes: string;
    estimatedInstallationCost: string;
    notes: string;
  };
  screens: Array<{
    name: string;
    yodeckPlayerId: string;
    orientation: string;
    installStatus: string;
  }>;
  signature: {
    signNow: boolean;
    signerName: string;
    signerEmail: string;
    signatureData: string;
  };
  createPlacementsForNewScreens: boolean;
}

const initialState: WizardState = {
  onboardingType: "location",
  companyBasics: {
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postcode: "",
    kvkNumber: "",
    notes: "",
  },
  locationDetails: {
    locationDisplayName: "",
    revenueSharePercent: "10.00",
  },
  advertiserDetails: {
    preferredPackagePlanId: "",
    customPriceExVat: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
  },
  schouw: {
    surveyDate: new Date().toISOString().split("T")[0],
    hasWifiAvailable: false,
    wifiNetworkName: "",
    wifiPassword: "",
    hasPowerOutlet: false,
    powerOutletLocation: "",
    proposedScreenCount: 1,
    proposedScreenLocations: "",
    wallMountPossible: true,
    ceilingMountPossible: false,
    standMountPossible: false,
    footTrafficEstimate: "gemiddeld",
    targetAudience: "",
    competingScreens: false,
    competingScreensNotes: "",
    installationNotes: "",
    estimatedInstallationCost: "",
    notes: "",
  },
  screens: [{ name: "Hoofdscherm", yodeckPlayerId: "", orientation: "landscape", installStatus: "planned" }],
  signature: {
    signNow: false,
    signerName: "",
    signerEmail: "",
    signatureData: "",
  },
  createPlacementsForNewScreens: true,
};

interface DuplicateCheck {
  type: "advertiser" | "location" | "lead";
  id: string;
  name: string;
  email?: string | null;
  matchReason: string;
}

interface PackagePlan {
  id: string;
  name: string;
  baseMonthlyPriceExVat: string;
  description?: string;
}

export default function AcquisitieWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(initialState);
  const [duplicates, setDuplicates] = useState<DuplicateCheck[]>([]);
  const [acknowledgedDuplicates, setAcknowledgedDuplicates] = useState(false);

  const { data: packagePlans = [] } = useQuery<PackagePlan[]>({
    queryKey: ["/api/package-plans"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/package-plans");
      return res.json();
    },
  });

  const checkDuplicatesMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({
        companyName: state.companyBasics.companyName,
        email: state.companyBasics.email || "",
        postcode: state.companyBasics.postcode || "",
      });
      const res = await apiRequest("GET", `/api/acquisitie/check-duplicates?${params}`);
      return res.json();
    },
    onSuccess: (data: DuplicateCheck[]) => {
      setDuplicates(data);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        onboardingType: state.onboardingType,
        companyBasics: state.companyBasics,
        locationDetails: state.onboardingType !== "advertiser" ? state.locationDetails : undefined,
        advertiserDetails: state.onboardingType !== "location" ? state.advertiserDetails : undefined,
        schouw: state.onboardingType !== "advertiser" ? state.schouw : undefined,
        screens: state.onboardingType !== "advertiser" ? state.screens : undefined,
        signature: state.onboardingType !== "location" ? state.signature : undefined,
        createPlacementsForNewScreens: state.createPlacementsForNewScreens,
      };
      const res = await apiRequest("POST", "/api/acquisitie/create", payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Onboarding succesvol!" });
        setStep(getStepCount());
      } else {
        toast({ title: "Fout", description: data.errors?.join(", "), variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const needsLocation = state.onboardingType === "location" || state.onboardingType === "both";
  const needsAdvertiser = state.onboardingType === "advertiser" || state.onboardingType === "both";

  const getSteps = () => {
    const steps = [
      { id: "type", label: "Type kiezen" },
      { id: "basics", label: "Bedrijfsgegevens" },
    ];
    if (needsLocation) {
      steps.push({ id: "schouw", label: "Schouw" });
      steps.push({ id: "screens", label: "Schermen" });
    }
    if (needsAdvertiser) {
      steps.push({ id: "contract", label: "Contract" });
    }
    steps.push({ id: "review", label: "Bevestigen" });
    return steps;
  };

  const steps = getSteps();
  const getStepCount = () => steps.length;
  const progress = ((step + 1) / getStepCount()) * 100;

  const updateBasics = (field: string, value: string) => {
    setState(s => ({
      ...s,
      companyBasics: { ...s.companyBasics, [field]: value }
    }));
  };

  const updateLocationDetails = (field: string, value: string) => {
    setState(s => ({
      ...s,
      locationDetails: { ...s.locationDetails, [field]: value }
    }));
  };

  const updateAdvertiserDetails = (field: string, value: string) => {
    setState(s => ({
      ...s,
      advertiserDetails: { ...s.advertiserDetails, [field]: value }
    }));
  };

  const updateSchouw = (field: string, value: any) => {
    setState(s => ({
      ...s,
      schouw: { ...s.schouw, [field]: value }
    }));
  };

  const updateScreen = (index: number, field: string, value: string) => {
    setState(s => {
      const screens = [...s.screens];
      screens[index] = { ...screens[index], [field]: value };
      return { ...s, screens };
    });
  };

  const addScreen = () => {
    setState(s => ({
      ...s,
      screens: [...s.screens, { name: `Scherm ${s.screens.length + 1}`, yodeckPlayerId: "", orientation: "landscape", installStatus: "planned" }]
    }));
  };

  const removeScreen = (index: number) => {
    setState(s => ({
      ...s,
      screens: s.screens.filter((_, i) => i !== index)
    }));
  };

  const canProceed = () => {
    switch (step) {
      case 0: return true;
      case 1: return state.companyBasics.companyName && state.companyBasics.contactName && (acknowledgedDuplicates || duplicates.length === 0);
      default: return true;
    }
  };

  const handleNext = async () => {
    if (step === 1 && !acknowledgedDuplicates && duplicates.length === 0) {
      try {
        const result = await checkDuplicatesMutation.mutateAsync();
        if (result && result.length > 0) {
          setDuplicates(result);
          return;
        }
      } catch (error) {
        console.warn("Duplicate check failed, proceeding anyway:", error);
      }
    }
    
    if (step < getStepCount() - 1) {
      setStep(step + 1);
    } else if (step === getStepCount() - 2) {
      createMutation.mutate();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const renderStep = () => {
    const currentStepId = steps[step]?.id;

    if (step === getStepCount()) {
      return (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-800 mb-2">Onboarding Voltooid!</h2>
            <p className="text-green-700 mb-6">Alle gegevens zijn succesvol aangemaakt.</p>
            
            <div className="flex flex-wrap gap-3 justify-center">
              {createMutation.data?.locationId && (
                <Button onClick={() => navigate(`/locations`)} data-testid="button-open-location">
                  <MapPin className="h-4 w-4 mr-2" /> Bekijk Locatie
                </Button>
              )}
              {createMutation.data?.advertiserId && (
                <Button onClick={() => navigate(`/advertisers`)} data-testid="button-open-advertiser">
                  <Building2 className="h-4 w-4 mr-2" /> Bekijk Adverteerder
                </Button>
              )}
              {createMutation.data?.contractId && (
                <Button variant="outline" onClick={() => navigate(`/contracts`)} data-testid="button-open-contract">
                  <FileSignature className="h-4 w-4 mr-2" /> Bekijk Contract
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate("/tasks")} data-testid="button-open-tasks">
                Bekijk Taken
              </Button>
              <Button variant="ghost" onClick={() => navigate("/sales")} data-testid="button-back-sales">
                Terug naar Acquisitie
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    switch (currentStepId) {
      case "type":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Wat wil je toevoegen?</CardTitle>
              <CardDescription>Kies het type onboarding voor deze cold walk-in</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup 
                value={state.onboardingType} 
                onValueChange={(v) => setState(s => ({ ...s, onboardingType: v as OnboardingType }))}
                className="space-y-4"
              >
                <label className="flex items-start gap-4 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="location" id="type-location" data-testid="radio-type-location" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">Locatie Partner</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Een bedrijf dat schermen host en een deel van de advertentie-inkomsten krijgt.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-4 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="advertiser" id="type-advertiser" data-testid="radio-type-advertiser" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-green-600" />
                      <span className="font-medium">Adverteerder</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Een bedrijf dat advertenties wil plaatsen op onze schermen.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-4 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="both" id="type-both" data-testid="radio-type-both" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-purple-600" />
                      <span className="font-medium">Beide (Locatie + Adverteerder)</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Dit bedrijf wordt zowel locatiepartner als adverteerder. Perfect voor een quick deal.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </CardContent>
          </Card>
        );

      case "basics":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Bedrijfsgegevens</CardTitle>
              <CardDescription>Basisinformatie over het bedrijf</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {duplicates.length > 0 && !acknowledgedDuplicates && (
                <Alert variant="destructive" className="border-amber-500 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription>
                    <p className="font-medium text-amber-800">Mogelijke duplicaten gevonden:</p>
                    <ul className="mt-2 space-y-1">
                      {duplicates.map((d, i) => (
                        <li key={i} className="text-sm text-amber-700">
                          <Badge variant="outline" className="mr-2">{d.type}</Badge>
                          {d.name} - {d.matchReason}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setAcknowledgedDuplicates(true)}
                        data-testid="button-acknowledge-duplicates"
                      >
                        Toch doorgaan (nieuw record aanmaken)
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bedrijfsnaam *</Label>
                  <Input 
                    value={state.companyBasics.companyName}
                    onChange={(e) => updateBasics("companyName", e.target.value)}
                    placeholder="Bakkerij De Hoek"
                    data-testid="input-company-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>KvK-nummer</Label>
                  <Input 
                    value={state.companyBasics.kvkNumber}
                    onChange={(e) => updateBasics("kvkNumber", e.target.value)}
                    placeholder="12345678"
                    data-testid="input-kvk"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contactpersoon *</Label>
                  <Input 
                    value={state.companyBasics.contactName}
                    onChange={(e) => updateBasics("contactName", e.target.value)}
                    placeholder="Jan de Bakker"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mailadres</Label>
                  <Input 
                    type="email"
                    value={state.companyBasics.email}
                    onChange={(e) => updateBasics("email", e.target.value)}
                    placeholder="jan@bakkerij.nl"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Telefoonnummer</Label>
                <Input 
                  value={state.companyBasics.phone}
                  onChange={(e) => updateBasics("phone", e.target.value)}
                  placeholder="06-12345678"
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label>Adres</Label>
                <Input 
                  value={state.companyBasics.address}
                  onChange={(e) => updateBasics("address", e.target.value)}
                  placeholder="Hoofdstraat 1"
                  data-testid="input-address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Postcode</Label>
                  <Input 
                    value={state.companyBasics.postcode}
                    onChange={(e) => updateBasics("postcode", e.target.value)}
                    placeholder="1234 AB"
                    data-testid="input-postcode"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plaats</Label>
                  <Input 
                    value={state.companyBasics.city}
                    onChange={(e) => updateBasics("city", e.target.value)}
                    placeholder="Amsterdam"
                    data-testid="input-city"
                  />
                </div>
              </div>

              {needsLocation && (
                <div className="pt-4 border-t space-y-4">
                  <h3 className="font-medium">Locatie Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Locatienaam (optioneel)</Label>
                      <Input 
                        value={state.locationDetails.locationDisplayName}
                        onChange={(e) => updateLocationDetails("locationDisplayName", e.target.value)}
                        placeholder="Laat leeg voor bedrijfsnaam"
                        data-testid="input-location-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Revenue Share %</Label>
                      <Input 
                        type="number"
                        step="0.01"
                        value={state.locationDetails.revenueSharePercent}
                        onChange={(e) => updateLocationDetails("revenueSharePercent", e.target.value)}
                        data-testid="input-revenue-share"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notities</Label>
                <Textarea 
                  value={state.companyBasics.notes}
                  onChange={(e) => updateBasics("notes", e.target.value)}
                  placeholder="Eventuele opmerkingen..."
                  data-testid="input-notes"
                />
              </div>
            </CardContent>
          </Card>
        );

      case "schouw":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" /> Schouw Details
              </CardTitle>
              <CardDescription>Technische informatie over de locatie</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Schouuw datum</Label>
                <Input 
                  type="date"
                  value={state.schouw.surveyDate}
                  onChange={(e) => updateSchouw("surveyDate", e.target.value)}
                  data-testid="input-survey-date"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Wifi className="h-4 w-4" /> WiFi
                  </h4>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={state.schouw.hasWifiAvailable}
                      onCheckedChange={(c) => updateSchouw("hasWifiAvailable", c)}
                      id="wifi-available"
                      data-testid="checkbox-wifi"
                    />
                    <Label htmlFor="wifi-available">WiFi beschikbaar</Label>
                  </div>
                  {state.schouw.hasWifiAvailable && (
                    <>
                      <div className="space-y-2">
                        <Label>Netwerknaam</Label>
                        <Input 
                          value={state.schouw.wifiNetworkName}
                          onChange={(e) => updateSchouw("wifiNetworkName", e.target.value)}
                          placeholder="WiFi-netwerk"
                          data-testid="input-wifi-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Wachtwoord</Label>
                        <Input 
                          type="password"
                          value={state.schouw.wifiPassword}
                          onChange={(e) => updateSchouw("wifiPassword", e.target.value)}
                          placeholder="Wordt versleuteld opgeslagen"
                          data-testid="input-wifi-password"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium flex items-center gap-2">
                    <Power className="h-4 w-4" /> Stroom
                  </h4>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={state.schouw.hasPowerOutlet}
                      onCheckedChange={(c) => updateSchouw("hasPowerOutlet", c)}
                      id="power-available"
                      data-testid="checkbox-power"
                    />
                    <Label htmlFor="power-available">Stopcontact beschikbaar</Label>
                  </div>
                  {state.schouw.hasPowerOutlet && (
                    <div className="space-y-2">
                      <Label>Locatie stopcontact</Label>
                      <Input 
                        value={state.schouw.powerOutletLocation}
                        onChange={(e) => updateSchouw("powerOutletLocation", e.target.value)}
                        placeholder="Bijv. achter de toonbank"
                        data-testid="input-power-location"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Montage mogelijkheden</h4>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={state.schouw.wallMountPossible}
                      onCheckedChange={(c) => updateSchouw("wallMountPossible", c)}
                      id="wall-mount"
                      data-testid="checkbox-wall-mount"
                    />
                    <Label htmlFor="wall-mount">Wandmontage</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={state.schouw.ceilingMountPossible}
                      onCheckedChange={(c) => updateSchouw("ceilingMountPossible", c)}
                      id="ceiling-mount"
                      data-testid="checkbox-ceiling-mount"
                    />
                    <Label htmlFor="ceiling-mount">Plafondmontage</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={state.schouw.standMountPossible}
                      onCheckedChange={(c) => updateSchouw("standMountPossible", c)}
                      id="stand-mount"
                      data-testid="checkbox-stand-mount"
                    />
                    <Label htmlFor="stand-mount">Standaard</Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Aantal schermen</Label>
                  <Input 
                    type="number"
                    min="1"
                    value={state.schouw.proposedScreenCount}
                    onChange={(e) => updateSchouw("proposedScreenCount", parseInt(e.target.value) || 1)}
                    data-testid="input-screen-count"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Drukte inschatting</Label>
                  <Select value={state.schouw.footTrafficEstimate} onValueChange={(v) => updateSchouw("footTrafficEstimate", v)}>
                    <SelectTrigger data-testid="select-foot-traffic">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laag">Laag</SelectItem>
                      <SelectItem value="gemiddeld">Gemiddeld</SelectItem>
                      <SelectItem value="hoog">Hoog</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Schermlocaties beschrijving</Label>
                <Textarea 
                  value={state.schouw.proposedScreenLocations}
                  onChange={(e) => updateSchouw("proposedScreenLocations", e.target.value)}
                  placeholder="Waar komen de schermen precies?"
                  data-testid="input-screen-locations"
                />
              </div>

              <div className="space-y-2">
                <Label>Doelgroep</Label>
                <Input 
                  value={state.schouw.targetAudience}
                  onChange={(e) => updateSchouw("targetAudience", e.target.value)}
                  placeholder="Bijv. winkelend publiek, 25-55 jaar"
                  data-testid="input-target-audience"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Geschatte installatiekosten</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={state.schouw.estimatedInstallationCost}
                    onChange={(e) => updateSchouw("estimatedInstallationCost", e.target.value)}
                    placeholder="0.00"
                    data-testid="input-installation-cost"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox 
                    checked={state.schouw.competingScreens}
                    onCheckedChange={(c) => updateSchouw("competingScreens", c)}
                    id="competing"
                    data-testid="checkbox-competing"
                  />
                  <Label htmlFor="competing">Concurrerende schermen aanwezig</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Installatie notities</Label>
                <Textarea 
                  value={state.schouw.installationNotes}
                  onChange={(e) => updateSchouw("installationNotes", e.target.value)}
                  placeholder="Bijzonderheden voor installatie..."
                  data-testid="input-installation-notes"
                />
              </div>
            </CardContent>
          </Card>
        );

      case "screens":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" /> Schermen
              </CardTitle>
              <CardDescription>Configureer de schermen voor deze locatie</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {state.screens.map((screen, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Scherm {index + 1}</h4>
                    {state.screens.length > 1 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => removeScreen(index)}
                        data-testid={`button-remove-screen-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Naam</Label>
                      <Input 
                        value={screen.name}
                        onChange={(e) => updateScreen(index, "name", e.target.value)}
                        placeholder="Hoofdscherm"
                        data-testid={`input-screen-name-${index}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Yodeck Player ID (optioneel)</Label>
                      <Input 
                        value={screen.yodeckPlayerId}
                        onChange={(e) => updateScreen(index, "yodeckPlayerId", e.target.value)}
                        placeholder="Wordt later gekoppeld"
                        data-testid={`input-yodeck-id-${index}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Oriëntatie</Label>
                      <Select value={screen.orientation} onValueChange={(v) => updateScreen(index, "orientation", v)}>
                        <SelectTrigger data-testid={`select-orientation-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="landscape">Liggend (Landscape)</SelectItem>
                          <SelectItem value="portrait">Staand (Portrait)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Installatie status</Label>
                      <Select value={screen.installStatus} onValueChange={(v) => updateScreen(index, "installStatus", v)}>
                        <SelectTrigger data-testid={`select-install-status-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Gepland</SelectItem>
                          <SelectItem value="installed">Geïnstalleerd</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              
              <Button variant="outline" onClick={addScreen} className="w-full" data-testid="button-add-screen">
                <Plus className="h-4 w-4 mr-2" /> Scherm toevoegen
              </Button>
            </CardContent>
          </Card>
        );

      case "contract":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" /> Contract Details
              </CardTitle>
              <CardDescription>Configureer het advertentiecontract</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Pakket</Label>
                <Select 
                  value={state.advertiserDetails.preferredPackagePlanId} 
                  onValueChange={(v) => updateAdvertiserDetails("preferredPackagePlanId", v)}
                >
                  <SelectTrigger data-testid="select-package">
                    <SelectValue placeholder="Selecteer een pakket..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packagePlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - €{plan.baseMonthlyPriceExVat}/maand
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Aangepaste prijs (optioneel)</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={state.advertiserDetails.customPriceExVat}
                  onChange={(e) => updateAdvertiserDetails("customPriceExVat", e.target.value)}
                  placeholder="Laat leeg voor pakketprijs"
                  data-testid="input-custom-price"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Startdatum</Label>
                  <Input 
                    type="date"
                    value={state.advertiserDetails.startDate}
                    onChange={(e) => updateAdvertiserDetails("startDate", e.target.value)}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Einddatum (optioneel)</Label>
                  <Input 
                    type="date"
                    value={state.advertiserDetails.endDate}
                    onChange={(e) => updateAdvertiserDetails("endDate", e.target.value)}
                    data-testid="input-end-date"
                  />
                </div>
              </div>

              {state.onboardingType === "both" && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      checked={state.createPlacementsForNewScreens}
                      onCheckedChange={(c) => setState(s => ({ ...s, createPlacementsForNewScreens: c as boolean }))}
                      id="create-placements"
                      data-testid="checkbox-create-placements"
                    />
                    <Label htmlFor="create-placements">
                      Start advertenties direct op de nieuwe schermen
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Maakt automatisch plaatsingen aan voor alle schermen van deze locatie.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case "review":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Bevestig Onboarding</CardTitle>
              <CardDescription>Controleer de gegevens en bevestig</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Type</h4>
                  <Badge>
                    {state.onboardingType === "location" && "Locatie Partner"}
                    {state.onboardingType === "advertiser" && "Adverteerder"}
                    {state.onboardingType === "both" && "Locatie + Adverteerder"}
                  </Badge>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Bedrijf</h4>
                  <p className="text-lg">{state.companyBasics.companyName}</p>
                  <p className="text-sm text-muted-foreground">{state.companyBasics.contactName}</p>
                </div>
              </div>

              {needsLocation && (
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Locatie
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Naam: {state.locationDetails.locationDisplayName || state.companyBasics.companyName}</div>
                    <div>Revenue share: {state.locationDetails.revenueSharePercent}%</div>
                    <div>Schermen: {state.screens.length}</div>
                    <div>WiFi: {state.schouw.hasWifiAvailable ? "Ja" : "Nee"}</div>
                  </div>
                </div>
              )}

              {needsAdvertiser && (
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Adverteerder
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Startdatum: {state.advertiserDetails.startDate}</div>
                    <div>Prijs: €{state.advertiserDetails.customPriceExVat || "pakketprijs"}/maand</div>
                    {state.onboardingType === "both" && (
                      <div className="col-span-2">
                        Plaatsingen: {state.createPlacementsForNewScreens ? `${state.screens.length} schermen` : "Geen"}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  Bij bevestiging worden alle records atomisch aangemaakt. Er worden automatisch taken aangemaakt voor installatie en inkoop.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Nieuwe Onboarding</h1>
        <p className="text-muted-foreground">Cold walk-in wizard voor snelle registratie</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div 
              className={`flex items-center gap-1 px-2 py-1 rounded ${
                i < step ? "text-green-600" : i === step ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-3 w-3" /> : null}
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
          </div>
        ))}
      </div>

      <Progress value={progress} className="h-2" />

      {renderStep()}

      {step < getStepCount() && (
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={handleBack} 
            disabled={step === 0}
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4 mr-2" /> Vorige
          </Button>
          
          <Button 
            onClick={handleNext}
            disabled={!canProceed() || createMutation.isPending}
            data-testid="button-next"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Bezig...
              </>
            ) : step === getStepCount() - 1 ? (
              <>
                <Check className="h-4 w-4 mr-2" /> Bevestigen
              </>
            ) : (
              <>
                Volgende <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
