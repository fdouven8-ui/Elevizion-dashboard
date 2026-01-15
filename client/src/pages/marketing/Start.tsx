import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Monitor, Check, ArrowRight, ArrowLeft, Loader2, AlertCircle, Video, Info,
  Clock, MapPin, ChevronDown, Search, X
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import FlowHeader from "@/components/marketing/FlowHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { PRICING_PACKAGES, PRICING_CONSTANTS, type PricingPackage } from "@/lib/pricing";
import { BUSINESS_CATEGORIES } from "@shared/regions";
import { useToast } from "@/hooks/use-toast";

interface ActiveRegion {
  code: string;
  label: string;
  screensTotal: number;
  screensWithSpace: number;
  screensFull: number;
  maxAdsPerScreen: number;
}

interface FormData {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  kvkNumber: string;
  vatNumber: string;
  businessCategory: string;
  targetRegionCodes: string[];
  addressLine1: string;
  postalCode: string;
  city: string;
}

interface FormErrors {
  [key: string]: string;
}

interface NoCapacityResponse {
  noCapacity: true;
  message: string;
  availableSlotCount: number;
  requiredCount: number;
  topReasons: string[];
  formData: {
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    kvkNumber: string;
    vatNumber: string;
    packageType: string;
    businessCategory: string;
    targetRegionCodes: string[];
    addressLine1: string;
    postalCode: string;
    city: string;
  };
}

const PACKAGE_LABELS: Record<string, string> = {
  SINGLE: "Enkelvoudig (1 scherm)",
  TRIPLE: "Drievoudig (3 schermen)",
  TEN: "Tien (10 schermen)",
  CUSTOM: "Maatwerk",
};

const REASON_TRANSLATIONS: Record<string, string> = {
  insufficient_capacity: "Te weinig beschikbare plekken",
  capacity_full: "Alle schermen zijn vol",
  insufficient_locations_in_region: "Niet genoeg schermen in deze regio",
  competitor_exclusivity: "Concurrentie-exclusiviteit",
  screens_offline: "Schermen offline",
  sync_pending: "Wacht op synchronisatie",
  no_locations_in_region: "Geen schermen in deze regio",
};

function getPackageByQueryParam(param: string | null): PricingPackage | null {
  if (!param) return null;
  const mapping: Record<string, string> = {
    single: "starter",
    triple: "local-plus",
    ten: "premium",
  };
  const id = mapping[param.toLowerCase()] || param.toLowerCase();
  return PRICING_PACKAGES.find(p => p.id === id) || null;
}

function PackageTypeFromPackageId(pkgId: string): string {
  const mapping: Record<string, string> = {
    starter: "SINGLE",
    "local-plus": "TRIPLE",
    premium: "TEN",
  };
  return mapping[pkgId] || "SINGLE";
}

export default function Start() {
  const searchParams = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(searchParams);
  const packageParam = urlParams.get("package");
  const selectedPackage = getPackageByQueryParam(packageParam);

  const [step, setStep] = useState(0);
  
  // Scroll to top when step changes (wizard navigation)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);
  
  const [noCapacityData, setNoCapacityData] = useState<NoCapacityResponse | null>(null);
  const [formData, setFormData] = useState<FormData>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    kvkNumber: "",
    vatNumber: "",
    businessCategory: "",
    targetRegionCodes: [],
    addressLine1: "",
    postalCode: "",
    city: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!selectedPackage || selectedPackage.isCustom) {
      navigate("/prijzen");
    }
  }, [selectedPackage, navigate]);

  // State for prefill loading and errors
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillId, setPrefillId] = useState<string | null>(null);
  
  // Dynamic regions from actual screen locations
  const [regionSearch, setRegionSearch] = useState("");
  
  const { data: activeRegions = [], isLoading: regionsLoading } = useQuery<ActiveRegion[]>({
    queryKey: ["active-regions"],
    queryFn: async () => {
      const res = await fetch("/api/regions/active");
      if (!res.ok) throw new Error("Failed to fetch regions");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  // Filter regions based on search
  const filteredRegions = activeRegions.filter(r => 
    r.label.toLowerCase().includes(regionSearch.toLowerCase())
  );

  // Pre-fill form from server-side prefill API (cross-device claim flow)
  useEffect(() => {
    const prefillParam = urlParams.get("prefill");
    if (prefillParam) {
      setPrefillId(prefillParam);
      setPrefillLoading(true);
      
      fetch(`/api/prefill/${prefillParam}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            setPrefillError(data.message || "Prefill niet gevonden");
            return;
          }
          
          const claimData = data.formData;
          setFormData((prev) => ({
            ...prev,
            companyName: claimData.companyName || prev.companyName,
            contactName: claimData.contactName || prev.contactName,
            email: claimData.email || prev.email,
            phone: claimData.phone || prev.phone,
            kvkNumber: claimData.kvkNumber || prev.kvkNumber,
            vatNumber: claimData.vatNumber || prev.vatNumber,
            businessCategory: claimData.businessCategory || prev.businessCategory,
            targetRegionCodes: claimData.targetRegionCodes || prev.targetRegionCodes,
          }));
        })
        .catch((err) => {
          console.error("Failed to fetch prefill data:", err);
          setPrefillError("Kon gegevens niet ophalen");
        })
        .finally(() => {
          setPrefillLoading(false);
        });
    }
  }, []);
  
  // Compute availability preview locally using screensWithSpace data from activeRegions
  // This ensures the indicator matches the city cards exactly (no server-side calculation needed)
  const availabilityPreview = useMemo(() => {
    if (!selectedPackage || formData.targetRegionCodes.length === 0) {
      return null;
    }
    
    // Sum screensWithSpace for all selected cities
    const availableScreens = formData.targetRegionCodes.reduce((sum, code) => {
      const region = activeRegions.find(r => r.code === code);
      return sum + (region?.screensWithSpace || 0);
    }, 0);
    
    // Required screens based on package
    const requiredScreens = selectedPackage.screens || 1;
    const isAvailable = availableScreens >= requiredScreens;
    const nearFull = isAvailable && availableScreens <= requiredScreens * 1.5;
    
    return {
      isAvailable,
      requiredCount: requiredScreens,
      availableCount: availableScreens,
      nearFull,
      suggestedAction: isAvailable ? "OK" : (formData.targetRegionCodes.length < 3 ? "EXPAND_REGIONS" : "WAITLIST"),
    };
  }, [selectedPackage, formData.targetRegionCodes, activeRegions]);

  const submitMutation = useMutation({
    mutationFn: async (data: FormData & { packageType: string }) => {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Er is een fout opgetreden");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.noCapacity) {
        setNoCapacityData(data as NoCapacityResponse);
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const waitlistMutation = useMutation({
    mutationFn: async () => {
      if (!noCapacityData) throw new Error("Geen gegevens beschikbaar");
      const response = await fetch("/api/waitlist/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noCapacityData.formData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Er is een fout opgetreden");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Op de wachtlijst",
        description: "Je staat nu op de wachtlijst. We mailen je zodra er plek is.",
      });
      setNoCapacityData(null);
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function updateField(field: keyof FormData, value: string | string[]) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }

  function validateStep0(): boolean {
    return !!selectedPackage && !selectedPackage.isCustom;
  }

  function validateStep1(): boolean {
    const newErrors: FormErrors = {};
    
    if (!formData.companyName.trim()) newErrors.companyName = "Bedrijfsnaam is verplicht";
    if (!formData.contactName.trim()) newErrors.contactName = "Contactpersoon is verplicht";
    if (!formData.email.trim()) {
      newErrors.email = "E-mailadres is verplicht";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Ongeldig e-mailadres";
    }
    if (!formData.phone.trim()) newErrors.phone = "Telefoonnummer is verplicht";
    
    if (!formData.kvkNumber.trim()) {
      newErrors.kvkNumber = "KvK-nummer is verplicht";
    } else if (!/^\d{8}$/.test(formData.kvkNumber.replace(/\s/g, ""))) {
      newErrors.kvkNumber = "KvK-nummer moet 8 cijfers zijn";
    }
    
    if (!formData.vatNumber.trim()) {
      newErrors.vatNumber = "BTW-nummer is verplicht";
    } else {
      const normalizedVat = formData.vatNumber.toUpperCase().replace(/\s/g, "");
      if (!/^NL\d{9}B\d{2}$/.test(normalizedVat)) {
        newErrors.vatNumber = "BTW-nummer moet formaat NL123456789B01 hebben";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateStep2(): boolean {
    const newErrors: FormErrors = {};
    
    if (!formData.businessCategory) {
      newErrors.businessCategory = "Type bedrijf is verplicht";
    }
    if (formData.targetRegionCodes.length === 0) {
      newErrors.targetRegionCodes = "Selecteer minimaal één regio";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateStep3(): boolean {
    const newErrors: FormErrors = {};
    
    if (!formData.addressLine1.trim()) newErrors.addressLine1 = "Adres is verplicht";
    if (!formData.postalCode.trim()) {
      newErrors.postalCode = "Postcode is verplicht";
    } else if (!/^\d{4}\s?[A-Za-z]{2}$/.test(formData.postalCode)) {
      newErrors.postalCode = "Ongeldige postcode (bijv. 1234 AB)";
    }
    if (!formData.city.trim()) newErrors.city = "Plaats is verplicht";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (step === 0 && validateStep0()) setStep(1);
    else if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) {
      // Check capacity before advancing to billing step
      // If insufficient capacity, show waitlist UI directly (client-side)
      if (availabilityPreview && !availabilityPreview.isAvailable && selectedPackage) {
        const packageType = PackageTypeFromPackageId(selectedPackage.id);
        setNoCapacityData({
          noCapacity: true,
          message: "Op dit moment is er niet genoeg plek in de gekozen regio's voor dit pakket.",
          availableSlotCount: availabilityPreview.availableCount,
          requiredCount: availabilityPreview.requiredCount,
          topReasons: availabilityPreview.availableCount === 0 
            ? ["capacity_full"] 
            : ["insufficient_locations_in_region"],
          formData: {
            companyName: formData.companyName,
            contactName: formData.contactName,
            email: formData.email.toLowerCase().trim(),
            phone: formData.phone,
            kvkNumber: formData.kvkNumber.replace(/\s/g, ""),
            vatNumber: formData.vatNumber.toUpperCase().replace(/\s/g, ""),
            packageType,
            businessCategory: formData.businessCategory,
            targetRegionCodes: formData.targetRegionCodes,
            addressLine1: formData.addressLine1,
            postalCode: formData.postalCode,
            city: formData.city,
          },
        });
      } else {
        setStep(3);
      }
    }
    else if (step === 3 && validateStep3()) handleSubmit();
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function handleSubmit() {
    if (!selectedPackage) return;
    
    submitMutation.mutate({
      ...formData,
      kvkNumber: formData.kvkNumber.replace(/\s/g, ""),
      vatNumber: formData.vatNumber.toUpperCase().replace(/\s/g, ""),
      email: formData.email.toLowerCase().trim(),
      packageType: PackageTypeFromPackageId(selectedPackage.id),
      // Include prefillId if this was a claim flow (for server to mark as used)
      ...(prefillId ? { prefillId } : {}),
    });
  }

  function toggleRegion(code: string) {
    const current = formData.targetRegionCodes;
    if (current.includes(code)) {
      updateField("targetRegionCodes", current.filter(c => c !== code));
    } else {
      updateField("targetRegionCodes", [...current, code]);
    }
  }

  function selectAllRegions() {
    updateField("targetRegionCodes", activeRegions.map(r => r.code));
  }

  function clearAllRegions() {
    updateField("targetRegionCodes", []);
    setRegionSearch("");
  }

  // Prefill loading state
  if (prefillLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <FlowHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-slate-200">
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto text-emerald-600 animate-spin mb-4" />
              <p className="text-slate-600">Gegevens worden opgehaald...</p>
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  // Prefill error state (link expired or already used)
  if (prefillError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <FlowHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <CardTitle className="text-xl text-slate-800">
                  Link verlopen of al gebruikt
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                {prefillError}
              </p>
              <Button 
                onClick={() => window.location.href = "/"}
                variant="outline"
                className="w-full"
                data-testid="button-prefill-error-ok"
              >
                Terug naar home
              </Button>
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  if (!selectedPackage) return null;

  const steps = [
    { title: "Pakket", description: "Bevestig je keuze" },
    { title: "Bedrijfsgegevens", description: "Je bedrijf & contact" },
    { title: "Type & Regio", description: "Branche & schermen" },
    { title: "Factuurgegevens", description: "Adres & betaling" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <FlowHeader />

      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i < step 
                  ? "bg-emerald-600 text-white" 
                  : i === step 
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-200" 
                    : "bg-slate-200 text-slate-500"
              }`}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? "bg-emerald-600" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>

        {noCapacityData ? (
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-800">Op dit moment is deze regio vol</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-slate-600">
                We willen je advertentie niet verkopen als we 'm niet direct kunnen plaatsen. 
                Kies een extra gebied of zet jezelf op de wachtlijst.
              </p>
              <p className="text-sm text-slate-600 font-medium">
                Je krijgt automatisch een e-mail zodra er weer plek is.
              </p>

              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Monitor className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-600">Pakket:</span>
                  <span className="font-medium">{PACKAGE_LABELS[noCapacityData.formData.packageType] || noCapacityData.formData.packageType}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-600">Gekozen gebieden:</span>
                  <span className="font-medium">
                    {noCapacityData.formData.targetRegionCodes
                      .map(code => activeRegions.find(r => r.code === code)?.label || code)
                      .join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-slate-600">Beschikbaar:</span>
                  <span className="font-medium text-amber-600">
                    {noCapacityData.availableSlotCount} van {noCapacityData.requiredCount} {noCapacityData.requiredCount === 1 ? "scherm" : "schermen"}
                  </span>
                </div>
              </div>

              {noCapacityData.topReasons && noCapacityData.topReasons.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="reasons" className="border-slate-200">
                    <AccordionTrigger className="text-sm text-slate-600 hover:no-underline">
                      Waarom geen plek?
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-1">
                        {noCapacityData.topReasons.map((reason, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            {REASON_TRANSLATIONS[reason] || reason}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => waitlistMutation.mutate()}
                  disabled={waitlistMutation.isPending}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-join-waitlist"
                >
                  {waitlistMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Bezig...
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 mr-2" />
                      Zet mij op de wachtlijst
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNoCapacityData(null);
                    setStep(2);
                  }}
                  disabled={waitlistMutation.isPending}
                  className="flex-1"
                  data-testid="button-adjust-regions"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Gebieden aanpassen
                </Button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                Je hebt 48 uur om je plek te claimen zodra je een uitnodiging krijgt.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-slate-200">
          <CardHeader>
            <CardTitle className="text-xl">{steps[step].title}</CardTitle>
            <CardDescription>{steps[step].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 0 && (
              <div className="space-y-6">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                      <Monitor className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-slate-800">{selectedPackage.name}</h3>
                      <p className="text-emerald-600 font-medium">
                        {selectedPackage.screens} scherm{selectedPackage.screens > 1 ? "en" : ""} • €{selectedPackage.perScreenPrice.toFixed(2).replace(".", ",")} per scherm/maand
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Totaal: €{selectedPackage.totalPrice.toFixed(2).replace(".", ",")} per maand excl. BTW
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                  <Video className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-800">Je levert zelf een video aan</p>
                    <p className="text-sm text-slate-600">
                      Na aanmelding kun je via ons uploadportaal je video uploaden. Wij plaatsen deze op de schermen.
                    </p>
                  </div>
                </div>

                <ul className="space-y-2 text-sm text-slate-700">
                  {selectedPackage.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Info className="h-4 w-4" />
                  <span>{PRICING_CONSTANTS.minTermText}, {PRICING_CONSTANTS.afterTermText}</span>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Bedrijfsnaam *</Label>
                  <Input
                    id="companyName"
                    data-testid="input-companyName"
                    value={formData.companyName}
                    onChange={(e) => updateField("companyName", e.target.value)}
                    placeholder="Jouw Bedrijf B.V."
                    className={errors.companyName ? "border-red-500" : ""}
                  />
                  {errors.companyName && <p className="text-sm text-red-500">{errors.companyName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactName">Contactpersoon *</Label>
                  <Input
                    id="contactName"
                    data-testid="input-contactName"
                    value={formData.contactName}
                    onChange={(e) => updateField("contactName", e.target.value)}
                    placeholder="Jan Jansen"
                    className={errors.contactName ? "border-red-500" : ""}
                  />
                  {errors.contactName && <p className="text-sm text-red-500">{errors.contactName}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mailadres *</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="input-email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="info@jouwbedrijf.nl"
                      className={errors.email ? "border-red-500" : ""}
                    />
                    {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefoonnummer *</Label>
                    <Input
                      id="phone"
                      data-testid="input-phone"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="06-12345678"
                      className={errors.phone ? "border-red-500" : ""}
                    />
                    {errors.phone && <p className="text-sm text-red-500">{errors.phone}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="kvkNumber">KvK-nummer *</Label>
                    <Input
                      id="kvkNumber"
                      data-testid="input-kvkNumber"
                      value={formData.kvkNumber}
                      onChange={(e) => updateField("kvkNumber", e.target.value)}
                      placeholder="12345678"
                      maxLength={8}
                      className={errors.kvkNumber ? "border-red-500" : ""}
                    />
                    {errors.kvkNumber && <p className="text-sm text-red-500">{errors.kvkNumber}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="vatNumber">BTW-nummer *</Label>
                    <Input
                      id="vatNumber"
                      data-testid="input-vatNumber"
                      value={formData.vatNumber}
                      onChange={(e) => updateField("vatNumber", e.target.value.toUpperCase())}
                      placeholder="NL123456789B01"
                      className={errors.vatNumber ? "border-red-500" : ""}
                    />
                    {errors.vatNumber && <p className="text-sm text-red-500">{errors.vatNumber}</p>}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Type bedrijf / branche *</Label>
                  <Select
                    value={formData.businessCategory}
                    onValueChange={(v) => updateField("businessCategory", v)}
                  >
                    <SelectTrigger data-testid="select-businessCategory" className={errors.businessCategory ? "border-red-500" : ""}>
                      <SelectValue placeholder="Selecteer type bedrijf" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.code} value={cat.code}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.businessCategory && <p className="text-sm text-red-500">{errors.businessCategory}</p>}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Gewenste plaatsen *</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={selectAllRegions} disabled={regionsLoading}>
                        Selecteer alles
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearAllRegions}>
                        Wis selectie
                      </Button>
                    </div>
                  </div>
                  
                  {regionsLoading ? (
                    <div className="flex items-center gap-2 text-slate-600 p-4 bg-slate-50 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Plaatsen laden...</span>
                    </div>
                  ) : activeRegions.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <p className="text-amber-800">
                        Nog geen actieve schermen beschikbaar. Laat je gegevens achter zodat we contact kunnen opnemen.
                      </p>
                      <Button 
                        variant="outline" 
                        onClick={() => navigate("/contact")}
                        className="border-amber-300 text-amber-700 hover:bg-amber-100"
                      >
                        Naar contact
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="Zoek plaats..."
                          value={regionSearch}
                          onChange={(e) => setRegionSearch(e.target.value)}
                          className="pl-9 pr-8"
                          data-testid="input-region-search"
                        />
                        {regionSearch && (
                          <button
                            type="button"
                            onClick={() => setRegionSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      
                      {formData.targetRegionCodes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {formData.targetRegionCodes.map(code => {
                            const region = activeRegions.find(r => r.code === code);
                            return (
                              <span 
                                key={code}
                                className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-1 rounded-full"
                              >
                                {region?.label || code}
                                <button
                                  type="button"
                                  onClick={() => toggleRegion(code)}
                                  className="hover:text-emerald-900"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                        {filteredRegions.map((region) => (
                          <label
                            key={region.code}
                            className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                              formData.targetRegionCodes.includes(region.code)
                                ? "bg-emerald-50 border-emerald-300"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <Checkbox
                              checked={formData.targetRegionCodes.includes(region.code)}
                              onCheckedChange={() => toggleRegion(region.code)}
                              data-testid={`checkbox-region-${region.code}`}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium block truncate">{region.label}</span>
                              <span className={`text-xs ${region.screensWithSpace === 0 ? "text-red-500 font-medium" : "text-slate-500"}`}>
                                {region.screensWithSpace === 0 
                                  ? "vol" 
                                  : `${region.screensWithSpace} ${region.screensWithSpace === 1 ? "scherm" : "schermen"} met plek`}
                              </span>
                            </div>
                          </label>
                        ))}
                        {filteredRegions.length === 0 && regionSearch && (
                          <p className="col-span-full text-sm text-slate-500 text-center py-4">
                            Geen plaatsen gevonden voor "{regionSearch}"
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  {errors.targetRegionCodes && <p className="text-sm text-red-500">{errors.targetRegionCodes}</p>}
                  
                  {formData.targetRegionCodes.length > 0 && (
                    <p className="text-sm text-slate-600">
                      {formData.targetRegionCodes.length} plaats{formData.targetRegionCodes.length !== 1 ? "en" : ""} geselecteerd
                    </p>
                  )}
                </div>

                {/* Availability Indicator - computed locally from screensWithSpace data */}
                {availabilityPreview && (
                  <div 
                    data-testid="availability-indicator"
                    className={`rounded-lg p-4 border ${
                      availabilityPreview.isAvailable
                        ? availabilityPreview.nearFull
                          ? "bg-amber-50 border-amber-300"
                          : "bg-emerald-50 border-emerald-300"
                        : "bg-red-50 border-red-300"
                    }`}
                  >
                    {availabilityPreview.isAvailable ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-emerald-600" />
                          <span className="font-medium text-emerald-700">
                            Voldoende plek ({availabilityPreview.availableCount}/{availabilityPreview.requiredCount})
                          </span>
                          {availabilityPreview.nearFull && (
                            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                              Bijna vol
                            </span>
                          )}
                        </div>
                        {availabilityPreview.nearFull && (
                          <p className="text-sm text-amber-700">
                            Tip: selecteer extra gebieden voor meer zekerheid.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-600" />
                          <span className="font-medium text-red-700">
                            Op dit moment onvoldoende plek ({availabilityPreview.availableCount}/{availabilityPreview.requiredCount})
                          </span>
                        </div>
                        <p className="text-sm text-red-600">
                          {availabilityPreview.suggestedAction === "EXPAND_REGIONS"
                            ? "Tip: selecteer extra regio's om meer opties te krijgen."
                            : "Je kunt je aanmelden voor de wachtlijst. We mailen je zodra er plek is."}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
                  <p>We plaatsen geen concurrerende advertenties direct naast elkaar op hetzelfde scherm.</p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Deze gegevens gebruiken we voor de facturatie via automatische incasso.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="addressLine1">Adres (straat + huisnummer) *</Label>
                  <Input
                    id="addressLine1"
                    data-testid="input-addressLine1"
                    value={formData.addressLine1}
                    onChange={(e) => updateField("addressLine1", e.target.value)}
                    placeholder="Hoofdstraat 123"
                    className={errors.addressLine1 ? "border-red-500" : ""}
                  />
                  {errors.addressLine1 && <p className="text-sm text-red-500">{errors.addressLine1}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postcode *</Label>
                    <Input
                      id="postalCode"
                      data-testid="input-postalCode"
                      value={formData.postalCode}
                      onChange={(e) => updateField("postalCode", e.target.value.toUpperCase())}
                      placeholder="1234 AB"
                      className={errors.postalCode ? "border-red-500" : ""}
                    />
                    {errors.postalCode && <p className="text-sm text-red-500">{errors.postalCode}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">Plaats *</Label>
                    <Input
                      id="city"
                      data-testid="input-city"
                      value={formData.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      placeholder="Amsterdam"
                      className={errors.city ? "border-red-500" : ""}
                    />
                    {errors.city && <p className="text-sm text-red-500">{errors.city}</p>}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-slate-600">
                  <p>Land: Nederland (NL). Voor buitenlandse bedrijven, neem contact met ons op.</p>
                </div>
              </div>
            )}

            <div className="flex justify-between mt-8 pt-4 border-t">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={handleBack} disabled={submitMutation.isPending}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Terug
                </Button>
              ) : (
                <div />
              )}
              
              <Button 
                onClick={handleNext} 
                disabled={submitMutation.isPending}
                data-testid="button-next"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Bezig...
                  </>
                ) : step === 3 ? (
                  <>
                    Doorgaan naar akkoord
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Volgende
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        <p className="text-center text-sm text-slate-500 mt-6">
          Vragen? Neem <a href="/contact" className="underline hover:text-emerald-600">contact</a> op.
        </p>
      </div>

      <MarketingFooter />
    </div>
  );
}
