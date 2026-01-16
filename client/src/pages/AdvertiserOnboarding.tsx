import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  User,
  Package,
  FileCheck,
  ArrowRight,
  ArrowLeft,
  Tv,
  Send,
  ExternalLink
} from "lucide-react";

type OnboardingStatus = "loading" | "valid" | "expired" | "used" | "not_found" | "error" | "completed";
type Step = "details" | "package" | "acceptance";

interface OnboardingData {
  advertiserId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  street?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  kvkNumber?: string;
  vatNumber?: string;
  iban?: string;
  ibanAccountHolder?: string;
  onboardingStatus: string;
  packageType?: string;
  screensIncluded?: number;
  packagePrice?: string;
  linkKey?: string;
}

interface DetailsForm {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  street?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  kvkNumber?: string;
  vatNumber?: string;
  iban?: string;
  ibanAccountHolder?: string;
}

const PACKAGES = [
  { type: "SINGLE", name: "1 Scherm", screens: 1, price: 49.99, description: "Perfect voor één locatie" },
  { type: "TRIPLE", name: "3 Schermen", screens: 3, price: 129.99, description: "Meerdere locaties, meer bereik" },
  { type: "TEN", name: "10 Schermen", screens: 10, price: 299.99, description: "Maximaal bereik in de regio" },
  { type: "CUSTOM", name: "Op maat", screens: 0, price: 0, description: "Neem contact op voor maatwerk" },
];

export default function AdvertiserOnboarding() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const [currentStep, setCurrentStep] = useState<Step>("details");
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedSepa, setAcceptedSepa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<DetailsForm>();

  useEffect(() => {
    if (!token) {
      setStatus("not_found");
      return;
    }

    fetch(`/api/advertiser-onboarding/${token}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setOnboardingData(data);
          Object.entries(data).forEach(([key, value]) => {
            if (value) setValue(key as keyof DetailsForm, value as string);
          });
          
          if (data.onboardingStatus === "DETAILS_SUBMITTED") {
            setCurrentStep("package");
          } else if (data.onboardingStatus === "PACKAGE_SELECTED" || data.onboardingStatus === "CONTRACT_PENDING_OTP") {
            setCurrentStep("acceptance");
            setSelectedPackage(data.packageType);
          } else if (["CONTRACT_ACCEPTED", "READY_FOR_ASSET", "ASSET_RECEIVED", "LIVE"].includes(data.onboardingStatus)) {
            setStatus("completed");
            return;
          }
          
          setStatus("valid");
        } else if (res.status === 410) {
          const err = await res.json();
          setStatus(err.message?.includes("gebruikt") ? "used" : "expired");
        } else if (res.status === 404) {
          setStatus("not_found");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [token, setValue]);

  const submitDetails = async (data: DetailsForm) => {
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/advertiser-onboarding/${token}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setCurrentStep("package");
      } else {
        const err = await res.json();
        setError(err.message || "Er is een fout opgetreden");
      }
    } catch (e) {
      setError("Verbindingsfout, probeer opnieuw");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPackage = async () => {
    if (!token || !selectedPackage) return;
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/advertiser-onboarding/${token}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          packageType: selectedPackage,
          customNotes: selectedPackage === "CUSTOM" ? customNotes : undefined,
        }),
      });

      if (res.ok) {
        setCurrentStep("acceptance");
      } else {
        const err = await res.json();
        setError(err.message || "Er is een fout opgetreden");
      }
    } catch (e) {
      setError("Verbindingsfout, probeer opnieuw");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendOtp = async () => {
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/advertiser-onboarding/${token}/send-otp`, {
        method: "POST",
      });

      if (res.ok) {
        setOtpSent(true);
      } else {
        const err = await res.json();
        setError(err.message || "Er is een fout opgetreden");
      }
    } catch (e) {
      setError("Verbindingsfout, probeer opnieuw");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    if (!token || otpCode.length !== 6) return;
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/advertiser-onboarding/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otpCode,
          acceptedTerms,
          acceptedPrivacy,
          acceptedSepa,
        }),
      });

      if (res.ok) {
        setStatus("completed");
      } else {
        const err = await res.json();
        setError(err.message || "Er is een fout opgetreden");
      }
    } catch (e) {
      setError("Verbindingsfout, probeer opnieuw");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepProgress = () => {
    switch (currentStep) {
      case "details": return 33;
      case "package": return 66;
      case "acceptance": return 100;
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (status === "expired" || status === "used" || status === "not_found" || status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>
              {status === "expired" ? "Link Verlopen" : 
               status === "used" ? "Al Ingevuld" : 
               status === "not_found" ? "Link Niet Gevonden" : "Fout"}
            </CardTitle>
            <CardDescription>
              {status === "expired" ? "Deze uitnodigingslink is helaas verlopen." :
               status === "used" ? "U heeft deze aanmelding al afgerond." :
               status === "not_found" ? "Deze link is ongeldig of niet meer beschikbaar." :
               "Er is een fout opgetreden."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Neem contact op met Elevizion via info@elevizion.nl
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="max-w-lg w-full shadow-lg">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-2xl">Bedankt voor uw aanmelding!</CardTitle>
            <CardDescription className="text-base mt-2">
              Uw gegevens zijn succesvol verwerkt en uw akkoord is geregistreerd.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800">
                <strong>Wat nu?</strong><br />
                U ontvangt binnen enkele minuten een e-mail met instructies voor het aanleveren van uw advertentievideo.
              </AlertDescription>
            </Alert>
            <div className="text-center text-sm text-muted-foreground">
              <p>Heeft u vragen? Mail naar info@elevizion.nl</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Elevizion</h1>
          <p className="text-slate-600 mt-1">Aanmelding Adverteerder</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span className={currentStep === "details" ? "text-blue-600 font-medium" : ""}>1. Gegevens</span>
            <span className={currentStep === "package" ? "text-blue-600 font-medium" : ""}>2. Pakket</span>
            <span className={currentStep === "acceptance" ? "text-blue-600 font-medium" : ""}>3. Akkoord</span>
          </div>
          <Progress value={getStepProgress()} className="h-2" />
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {currentStep === "details" && (
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Uw gegevens</CardTitle>
                  <CardDescription>Vul uw bedrijfs- en contactgegevens in</CardDescription>
                </div>
              </div>
            </CardHeader>
            <form onSubmit={handleSubmit(submitDetails)}>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Bedrijfsnaam *</Label>
                    <Input 
                      id="companyName" 
                      {...register("companyName", { required: true })}
                      data-testid="input-company-name"
                    />
                    {errors.companyName && <p className="text-xs text-red-500">Verplicht veld</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Contactpersoon *</Label>
                    <Input 
                      id="contactName" 
                      {...register("contactName", { required: true })}
                      data-testid="input-contact-name"
                    />
                    {errors.contactName && <p className="text-xs text-red-500">Verplicht veld</p>}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mailadres *</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      {...register("email", { required: true })}
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefoonnummer</Label>
                    <Input 
                      id="phone" 
                      {...register("phone")}
                      data-testid="input-phone"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street">Straat + huisnummer</Label>
                  <Input 
                    id="street" 
                    {...register("street")}
                    data-testid="input-street"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="zipcode">Postcode</Label>
                    <Input 
                      id="zipcode" 
                      {...register("zipcode")}
                      data-testid="input-zipcode"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="city">Plaats</Label>
                    <Input 
                      id="city" 
                      {...register("city")}
                      data-testid="input-city"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="kvkNumber">KvK-nummer</Label>
                    <Input 
                      id="kvkNumber" 
                      {...register("kvkNumber")}
                      data-testid="input-kvk"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vatNumber">BTW-nummer</Label>
                    <Input 
                      id="vatNumber" 
                      {...register("vatNumber")}
                      data-testid="input-vat"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-3">Bankgegevens (voor automatische incasso)</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="iban">IBAN</Label>
                      <Input 
                        id="iban" 
                        placeholder="NL00BANK0123456789"
                        {...register("iban")}
                        data-testid="input-iban"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ibanAccountHolder">Tenaamstelling</Label>
                      <Input 
                        id="ibanAccountHolder" 
                        {...register("ibanAccountHolder")}
                        data-testid="input-iban-holder"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-next-step">
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Volgende stap
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {currentStep === "package" && (
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Kies uw pakket</CardTitle>
                  <CardDescription>Selecteer het aantal schermen waarop u wilt adverteren</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {PACKAGES.map((pkg) => (
                  <div
                    key={pkg.type}
                    onClick={() => setSelectedPackage(pkg.type)}
                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedPackage === pkg.type
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    data-testid={`package-${pkg.type.toLowerCase()}`}
                  >
                    {selectedPackage === pkg.type && (
                      <CheckCircle2 className="absolute top-2 right-2 h-5 w-5 text-blue-500" />
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <Tv className="h-6 w-6 text-slate-600" />
                      <span className="font-semibold">{pkg.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{pkg.description}</p>
                    {pkg.price > 0 ? (
                      <p className="text-lg font-bold text-blue-600">€{pkg.price.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/maand</span></p>
                    ) : (
                      <p className="text-lg font-bold text-slate-600">Op aanvraag</p>
                    )}
                  </div>
                ))}
              </div>

              {selectedPackage === "CUSTOM" && (
                <div className="space-y-2 pt-4">
                  <Label htmlFor="customNotes">Uw wensen of toelichting</Label>
                  <Textarea
                    id="customNotes"
                    placeholder="Beschrijf uw wensen, bijvoorbeeld het aantal schermen of specifieke locaties..."
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="textarea-custom-notes"
                  />
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep("details")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Terug
              </Button>
              <Button 
                className="flex-1" 
                disabled={!selectedPackage || isSubmitting}
                onClick={submitPackage}
                data-testid="button-next-step"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Volgende stap
              </Button>
            </CardFooter>
          </Card>
        )}

        {currentStep === "acceptance" && (
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Akkoord & Bevestiging</CardTitle>
                  <CardDescription>Bevestig uw akkoord met de voorwaarden</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                  <Checkbox 
                    id="terms" 
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                    data-testid="checkbox-terms"
                  />
                  <div>
                    <Label htmlFor="terms" className="cursor-pointer font-medium">
                      Ik ga akkoord met de{" "}
                      <a 
                        href="/docs/algemene-voorwaarden" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="link-terms"
                      >
                        Algemene Voorwaarden
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      De algemene voorwaarden zijn van toepassing op alle diensten van Elevizion.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                  <Checkbox 
                    id="privacy" 
                    checked={acceptedPrivacy}
                    onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
                    data-testid="checkbox-privacy"
                  />
                  <div>
                    <Label htmlFor="privacy" className="cursor-pointer font-medium">
                      Ik ga akkoord met de{" "}
                      <a 
                        href="/docs/privacy" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="link-privacy"
                      >
                        Privacyverklaring
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Uw gegevens worden verwerkt conform de AVG.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                  <Checkbox 
                    id="sepa" 
                    checked={acceptedSepa}
                    onCheckedChange={(checked) => setAcceptedSepa(checked === true)}
                    data-testid="checkbox-sepa"
                  />
                  <div>
                    <Label htmlFor="sepa" className="cursor-pointer font-medium">
                      Ik machtig Elevizion voor{" "}
                      <a 
                        href="/docs/sepa" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="link-sepa"
                      >
                        SEPA automatische incasso
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Door deze machtiging af te geven, geeft u toestemming aan Elevizion om maandelijks het factuurbedrag af te schrijven van uw rekening.
                    </p>
                  </div>
                </div>
              </div>

              {!otpSent ? (
                <Button 
                  className="w-full" 
                  disabled={!acceptedTerms || !acceptedPrivacy || !acceptedSepa || isSubmitting}
                  onClick={sendOtp}
                  data-testid="button-send-otp"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Verstuur bevestigingscode
                </Button>
              ) : (
                <div className="space-y-4">
                  <Alert className="bg-blue-50 border-blue-200">
                    <AlertDescription className="text-blue-800">
                      Er is een 6-cijferige code verzonden naar <strong>{onboardingData?.email}</strong>. 
                      Voer deze hieronder in om uw akkoord te bevestigen.
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-center">
                    <InputOTP 
                      maxLength={6} 
                      value={otpCode}
                      onChange={setOtpCode}
                      data-testid="input-otp"
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button 
                    className="w-full" 
                    disabled={otpCode.length !== 6 || isSubmitting}
                    onClick={verifyOtp}
                    data-testid="button-verify-otp"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Bevestig akkoord
                  </Button>

                  <div className="text-center">
                    <Button 
                      variant="link" 
                      onClick={sendOtp}
                      disabled={isSubmitting}
                      data-testid="button-resend-otp"
                    >
                      Code niet ontvangen? Verstuur opnieuw
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep("package")}
                disabled={otpSent}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Terug
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
