import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  CreditCard,
  User,
  MapPin,
  FileText
} from "lucide-react";

interface PortalData {
  advertiserId: string;
  companyName: string;
  email: string;
  contactName?: string;
  phone?: string;
  street?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  vatNumber?: string;
  kvkNumber?: string;
  iban?: string;
  ibanAccountHolder?: string;
  sepaMandate?: boolean;
  sepaMandateReference?: string;
  notes?: string;
  paymentTermDays?: number;
}

type PortalStatus = "loading" | "valid" | "expired" | "used" | "not_found" | "error" | "submitted";

export default function AdvertiserPortal() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PortalStatus>("loading");
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSepaMandate, setHasSepaMandate] = useState(false);
  const [invoiceDeliveryMethod, setInvoiceDeliveryMethod] = useState("email");
  const [language, setLanguage] = useState("nl");
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<PortalData>();

  useEffect(() => {
    if (!token) {
      setStatus("not_found");
      return;
    }

    fetch(`/api/portal/${token}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setPortalData(data);
          Object.entries(data).forEach(([key, value]) => {
            if (value) setValue(key as keyof PortalData, value as any);
          });
          setStatus("valid");
        } else if (res.status === 410) {
          setStatus("used");
        } else if (res.status === 404) {
          setStatus("not_found");
        } else {
          const error = await res.json();
          if (error.message?.includes("expired") || error.message?.includes("verlopen")) {
            setStatus("expired");
          } else {
            setStatus("error");
          }
        }
      })
      .catch(() => setStatus("error"));
  }, [token, setValue]);

  const onSubmit = async (data: PortalData) => {
    if (!token) return;
    
    setIsSubmitting(true);
    try {
      const submitData = {
        ...data,
        sepaMandate: hasSepaMandate,
        invoiceDeliveryMethod,
        language,
        paymentTermDays: data.paymentTermDays ? parseInt(String(data.paymentTermDays)) : 14,
      };
      
      const response = await fetch(`/api/portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        setStatus("submitted");
      } else if (response.status === 410) {
        setStatus("used");
      } else {
        const error = await response.json();
        throw new Error(error.message || "Er is een fout opgetreden");
      }
    } catch (error) {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Gegevens laden...</p>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-orange-500 mx-auto mb-2" />
            <CardTitle>Link Verlopen</CardTitle>
            <CardDescription>
              Deze uitnodigingslink is helaas verlopen.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Neem contact op met Elevizion om een nieuwe uitnodiging te ontvangen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "used") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Formulier Al Ingevuld</CardTitle>
            <CardDescription>
              Uw gegevens zijn al eerder ingevuld en opgeslagen.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Neem contact op met Elevizion als u wijzigingen wilt doorvoeren.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "not_found" || status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>Link Niet Gevonden</CardTitle>
            <CardDescription>
              Deze link is ongeldig of niet meer beschikbaar.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Controleer of u de juiste link heeft ontvangen, of neem contact op met Elevizion.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Bedankt!</CardTitle>
            <CardDescription>
              Uw gegevens zijn succesvol opgeslagen.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Wij nemen contact met u op zodra alles is verwerkt.
            </p>
            <Alert>
              <Building2 className="h-4 w-4" />
              <AlertTitle>Wat gebeurt er nu?</AlertTitle>
              <AlertDescription>
                Uw bedrijfsgegevens worden verwerkt in ons systeem. 
                U ontvangt binnenkort een bevestiging per e-mail.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Building2 className="h-12 w-12 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Welkom bij Elevizion</h1>
          <p className="text-muted-foreground mt-2">
            Vul uw bedrijfsgegevens in om uw advertentieaccount te voltooien.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {portalData?.companyName || "Bedrijfsgegevens"}
            </CardTitle>
            <CardDescription>
              De velden met * zijn verplicht
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Bedrijfsinformatie
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="companyName">Bedrijfsnaam *</Label>
                    <Input 
                      id="companyName" 
                      {...register("companyName", { required: true })} 
                      data-testid="portal-input-company"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="contactName">Contactpersoon *</Label>
                    <Input 
                      id="contactName" 
                      {...register("contactName", { required: true })} 
                      data-testid="portal-input-contact"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">E-mailadres *</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      {...register("email", { required: true })} 
                      data-testid="portal-input-email"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefoonnummer</Label>
                    <Input 
                      id="phone" 
                      type="tel" 
                      placeholder="+31 6 12345678"
                      {...register("phone")} 
                      data-testid="portal-input-phone"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Adresgegevens
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="street">Straat + huisnummer</Label>
                    <Input 
                      id="street" 
                      placeholder="Hoofdstraat 123"
                      {...register("street")} 
                      data-testid="portal-input-street"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="zipcode">Postcode</Label>
                      <Input 
                        id="zipcode" 
                        placeholder="1234 AB"
                        {...register("zipcode")} 
                        data-testid="portal-input-zipcode"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="city">Plaats</Label>
                      <Input 
                        id="city" 
                        placeholder="Amsterdam"
                        {...register("city")} 
                        data-testid="portal-input-city"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="country">Land</Label>
                    <Select 
                      value={watch("country") || "Nederland"} 
                      onValueChange={(v) => setValue("country", v)}
                    >
                      <SelectTrigger data-testid="portal-select-country">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Nederland">Nederland</SelectItem>
                        <SelectItem value="België">België</SelectItem>
                        <SelectItem value="Duitsland">Duitsland</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Bedrijfsregistratie
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="kvkNumber">KvK-nummer</Label>
                    <Input 
                      id="kvkNumber" 
                      placeholder="12345678"
                      {...register("kvkNumber")} 
                      data-testid="portal-input-kvk"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="vatNumber">BTW-nummer</Label>
                    <Input 
                      id="vatNumber" 
                      placeholder="NL123456789B01"
                      {...register("vatNumber")} 
                      data-testid="portal-input-vat"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  SEPA Automatische Incasso (optioneel)
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="enableSepa" 
                    checked={hasSepaMandate}
                    onCheckedChange={(checked) => setHasSepaMandate(checked === true)}
                    data-testid="portal-checkbox-sepa"
                  />
                  <Label htmlFor="enableSepa" className="text-sm cursor-pointer">
                    Ik wil betalen via automatische incasso
                  </Label>
                </div>

                {hasSepaMandate && (
                  <div className="space-y-4 pl-6 border-l-2 border-muted">
                    <div className="grid gap-2">
                      <Label htmlFor="iban">IBAN *</Label>
                      <Input 
                        id="iban" 
                        placeholder="NL91 ABNA 0417 1643 00"
                        className="font-mono"
                        {...register("iban")} 
                        data-testid="portal-input-iban"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ibanAccountHolder">Tenaamstelling rekening *</Label>
                      <Input 
                        id="ibanAccountHolder" 
                        placeholder="Bedrijfsnaam B.V."
                        {...register("ibanAccountHolder")} 
                        data-testid="portal-input-account-holder"
                      />
                    </div>
                    <Alert>
                      <AlertDescription className="text-xs">
                        Door automatische incasso in te schakelen, geeft u Elevizion toestemming 
                        om facturen automatisch van uw rekening af te schrijven. U ontvangt 
                        vooraf altijd een factuur per e-mail.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  Facturatie voorkeuren
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="invoiceDeliveryMethod">Factuur ontvangen via</Label>
                    <Select value={invoiceDeliveryMethod} onValueChange={setInvoiceDeliveryMethod}>
                      <SelectTrigger data-testid="portal-select-delivery">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="post">Post</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="language">Taalvoorkeur</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger data-testid="portal-select-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nl">Nederlands</SelectItem>
                        <SelectItem value="en">Engels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Opmerkingen (optioneel)</Label>
                <Input 
                  id="notes" 
                  placeholder="Eventuele opmerkingen of bijzonderheden..."
                  {...register("notes")} 
                  data-testid="portal-input-notes"
                />
              </div>
            </CardContent>

            <CardFooter className="flex justify-end">
              <Button 
                type="submit" 
                disabled={isSubmitting}
                size="lg"
                data-testid="portal-button-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bezig met opslaan...
                  </>
                ) : (
                  "Gegevens Opslaan"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by Elevizion • Digital Signage Network
        </p>
      </div>
    </div>
  );
}
