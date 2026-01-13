import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  CreditCard,
  FileCheck,
  Send,
  ShieldCheck
} from "lucide-react";

type PageStatus = "loading" | "valid" | "expired" | "error" | "completed";
type Step = "details" | "otp";

interface LocationData {
  name: string;
  email: string;
  contactName: string;
  address: string;
  city: string;
  visitorsPerWeek: number;
  hasIban: boolean;
  onboardingStatus: string;
}

interface ContractForm {
  bankAccountIban: string;
  bankAccountName: string;
}

export default function LocationContract() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [step, setStep] = useState<Step>("details");
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedPayout, setAcceptedPayout] = useState(false);

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<ContractForm>();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`/api/public/location-contract/${token}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setLocationData(data);
          
          if (data.onboardingStatus === "CONTRACT_PENDING_OTP") {
            setStep("otp");
            setOtpSent(true);
          }
          
          setStatus("valid");
        } else {
          const err = await res.json();
          setError(err.error || "Ongeldige link");
          setStatus("expired");
        }
      })
      .catch(() => {
        setError("Er is een fout opgetreden");
        setStatus("error");
      });
  }, [token]);

  const handleSubmitDetails = async (data: ContractForm) => {
    if (!acceptedTerms || !acceptedPrivacy || !acceptedPayout) {
      setError("Je moet alle voorwaarden accepteren");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/location-contract/${token}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          acceptedTerms,
          acceptedPrivacy,
          acceptedPayout,
        }),
      });

      if (res.ok) {
        await sendOtp();
      } else {
        const err = await res.json();
        setError(err.error || "Er is een fout opgetreden");
      }
    } catch (e) {
      setError("Er is een fout opgetreden");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendOtp = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/location-contract/${token}/send-otp`, {
        method: "POST",
      });

      if (res.ok) {
        setOtpSent(true);
        setStep("otp");
      } else {
        const err = await res.json();
        setError(err.error || "Kon bevestigingscode niet versturen");
      }
    } catch (e) {
      setError("Er is een fout opgetreden");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== 6) {
      setError("Voer de volledige 6-cijferige code in");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/location-contract/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpCode }),
      });

      if (res.ok) {
        setStatus("completed");
      } else {
        const err = await res.json();
        setError(err.error || "Ongeldige code");
      }
    } catch (e) {
      setError("Er is een fout opgetreden");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Laden...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "expired" || status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Link niet geldig</h2>
            <p className="text-muted-foreground text-center">{error || "Deze link is verlopen of al gebruikt."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-center">Aanmelding voltooid!</h2>
            <p className="text-muted-foreground text-center">
              Je akkoord is bevestigd. We nemen binnenkort contact met je op om de installatie van het scherm te plannen.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full text-center">
              <p className="text-green-800 text-sm">
                Je ontvangt een bevestiging per email met je akkoordverklaring.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">Elevizion</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Aanmelding Afronden</h1>
          <p className="text-muted-foreground">
            {locationData?.name} - {locationData?.city}
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "details" ? "bg-primary text-primary-foreground" : "bg-green-500 text-white"}`}>
              {step === "otp" ? <CheckCircle2 className="h-5 w-5" /> : "1"}
            </div>
            <div className="w-16 h-1 bg-muted rounded">
              <div className={`h-full rounded transition-all ${step === "otp" ? "bg-primary w-full" : "w-0"}`} />
            </div>
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${step === "otp" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              2
            </div>
          </div>
        </div>

        {step === "details" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Uitbetalingsgegevens & Akkoord
              </CardTitle>
              <CardDescription>
                Vul je bankgegevens in en geef akkoord op de voorwaarden
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit(handleSubmitDetails)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Bankrekening voor uitbetaling
                  </h3>
                  
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="bankAccountIban">IBAN *</Label>
                      <Input
                        id="bankAccountIban"
                        {...register("bankAccountIban", { 
                          required: "IBAN is verplicht",
                          pattern: {
                            value: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/,
                            message: "Ongeldig IBAN formaat (bijv. NL91ABNA0417164300)"
                          }
                        })}
                        placeholder="NL91ABNA0417164300"
                        className="uppercase"
                        data-testid="input-iban"
                      />
                      {errors.bankAccountIban && <p className="text-sm text-destructive">{errors.bankAccountIban.message}</p>}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="bankAccountName">Tenaamstelling rekening *</Label>
                      <Input
                        id="bankAccountName"
                        {...register("bankAccountName", { required: "Tenaamstelling is verplicht" })}
                        placeholder="Bedrijfsnaam B.V."
                        data-testid="input-account-name"
                      />
                      {errors.bankAccountName && <p className="text-sm text-destructive">{errors.bankAccountName.message}</p>}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    Voorwaarden accepteren
                  </h3>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="terms"
                        checked={acceptedTerms}
                        onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                        data-testid="checkbox-terms"
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label htmlFor="terms" className="text-sm font-medium cursor-pointer">
                          Ik ga akkoord met de Algemene Voorwaarden Schermlocatie *
                        </label>
                        <p className="text-xs text-muted-foreground">
                          <a href="/voorwaarden-schermlocatie" target="_blank" className="text-primary hover:underline">
                            Bekijk voorwaarden
                          </a>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="privacy"
                        checked={acceptedPrivacy}
                        onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)}
                        data-testid="checkbox-privacy"
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label htmlFor="privacy" className="text-sm font-medium cursor-pointer">
                          Ik ga akkoord met de Privacyverklaring *
                        </label>
                        <p className="text-xs text-muted-foreground">
                          <a href="/privacy" target="_blank" className="text-primary hover:underline">
                            Bekijk privacyverklaring
                          </a>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="payout"
                        checked={acceptedPayout}
                        onCheckedChange={(checked) => setAcceptedPayout(checked === true)}
                        data-testid="checkbox-payout"
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label htmlFor="payout" className="text-sm font-medium cursor-pointer">
                          Ik ga akkoord met de uitbetalingsvoorwaarden *
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Uitbetaling vindt maandelijks plaats bij een minimum van €25
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isSubmitting || !acceptedTerms || !acceptedPrivacy || !acceptedPayout}
                  data-testid="button-continue"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Bezig...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Doorgaan naar bevestiging
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "otp" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Bevestig je akkoord
              </CardTitle>
              <CardDescription>
                We hebben een 6-cijferige code naar {locationData?.email} gestuurd
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col items-center gap-6">
                <div className="bg-slate-50 p-6 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-4">
                    Voer de bevestigingscode in die we naar je email hebben gestuurd
                  </p>
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
                  onClick={verifyOtp}
                  className="w-full"
                  disabled={isSubmitting || otpCode.length !== 6}
                  data-testid="button-verify"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Bezig met verifiëren...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Bevestig akkoord
                    </>
                  )}
                </Button>

                <Button 
                  variant="link" 
                  onClick={sendOtp}
                  disabled={isSubmitting}
                  data-testid="button-resend-otp"
                >
                  Geen code ontvangen? Opnieuw versturen
                </Button>
              </div>
            </CardContent>
            <CardFooter className="justify-center">
              <p className="text-xs text-muted-foreground text-center">
                De code is 15 minuten geldig
              </p>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
