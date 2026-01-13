import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  MapPin,
  Users,
  Clock,
  Send
} from "lucide-react";

type PageStatus = "loading" | "valid" | "expired" | "error" | "submitted";

interface IntakeForm {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  zipcode: string;
  city: string;
  locationType: string;
  visitorsPerWeek: number;
  openingHours?: string;
  notes?: string;
}

const LOCATION_TYPES = [
  "Sportschool / Fitness",
  "Café / Bar",
  "Restaurant",
  "Kapsalon / Barbershop",
  "Wachtruimte (Tandarts, Huisarts, etc.)",
  "Autobedrijf / Garage",
  "Winkel / Retail",
  "Hotel / B&B",
  "Kantoor / Lobby",
  "Overig",
];

export default function LocationIntake() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PageStatus>("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationType, setLocationType] = useState("");

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<IntakeForm>();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`/api/public/location-intake/${token}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          Object.entries(data).forEach(([key, value]) => {
            if (value) setValue(key as keyof IntakeForm, value as any);
          });
          if (data.locationType) setLocationType(data.locationType);
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
  }, [token, setValue]);

  const onSubmit = async (data: IntakeForm) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public/location-intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locationType }),
      });

      if (res.ok) {
        setStatus("submitted");
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

  if (status === "submitted") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-center">Bedankt!</h2>
            <p className="text-muted-foreground text-center">
              We hebben je aanmelding ontvangen en gaan je locatie beoordelen. 
              Je ontvangt binnenkort bericht van ons.
            </p>
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
          <h1 className="text-3xl font-bold mb-2">Schermlocatie Aanmelden</h1>
          <p className="text-muted-foreground">
            Vul je gegevens in om je aan te melden als schermlocatie
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Locatiegegevens
            </CardTitle>
            <CardDescription>
              Alle velden met * zijn verplicht
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Bedrijfsnaam *</Label>
                  <Input
                    id="name"
                    {...register("name", { required: "Bedrijfsnaam is verplicht" })}
                    placeholder="Jouw Bedrijf B.V."
                    data-testid="input-name"
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="contactName">Contactpersoon *</Label>
                    <Input
                      id="contactName"
                      {...register("contactName", { required: "Contactpersoon is verplicht" })}
                      placeholder="Jan Jansen"
                      data-testid="input-contact-name"
                    />
                    {errors.contactName && <p className="text-sm text-destructive">{errors.contactName.message}</p>}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="phone">Telefoon *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      {...register("phone", { required: "Telefoon is verplicht" })}
                      placeholder="06-12345678"
                      data-testid="input-phone"
                    />
                    {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email", { 
                      required: "Email is verplicht",
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Ongeldig email formaat" }
                    })}
                    placeholder="info@jouwbedrijf.nl"
                    data-testid="input-email"
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>

                <div className="border-t pt-4 mt-2">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Adres
                  </h3>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 grid gap-2">
                      <Label htmlFor="street">Straat *</Label>
                      <Input
                        id="street"
                        {...register("street", { required: "Straat is verplicht" })}
                        placeholder="Hoofdstraat"
                        data-testid="input-street"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="houseNumber">Huisnr *</Label>
                      <Input
                        id="houseNumber"
                        {...register("houseNumber", { required: "Huisnummer is verplicht" })}
                        placeholder="123"
                        data-testid="input-house-number"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="grid gap-2">
                      <Label htmlFor="zipcode">Postcode *</Label>
                      <Input
                        id="zipcode"
                        {...register("zipcode", { required: "Postcode is verplicht" })}
                        placeholder="1234 AB"
                        data-testid="input-zipcode"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="city">Plaats *</Label>
                      <Input
                        id="city"
                        {...register("city", { required: "Plaats is verplicht" })}
                        placeholder="Amsterdam"
                        data-testid="input-city"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 mt-2">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Over je locatie
                  </h3>

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="locationType">Type locatie *</Label>
                      <Select value={locationType} onValueChange={setLocationType}>
                        <SelectTrigger data-testid="select-location-type">
                          <SelectValue placeholder="Selecteer type locatie" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCATION_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="visitorsPerWeek">Gemiddeld aantal bezoekers per week *</Label>
                      <Input
                        id="visitorsPerWeek"
                        type="number"
                        {...register("visitorsPerWeek", { 
                          required: "Dit veld is verplicht",
                          min: { value: 1, message: "Minimaal 1 bezoeker" }
                        })}
                        placeholder="500"
                        data-testid="input-visitors"
                      />
                      <p className="text-xs text-muted-foreground">
                        Dit helpt ons bepalen of je locatie geschikt is
                      </p>
                      {errors.visitorsPerWeek && <p className="text-sm text-destructive">{errors.visitorsPerWeek.message}</p>}
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="openingHours" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Openingstijden (optioneel)
                      </Label>
                      <Input
                        id="openingHours"
                        {...register("openingHours")}
                        placeholder="Ma-Za 08:00-22:00, Zo 10:00-18:00"
                        data-testid="input-opening-hours"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="notes">Opmerkingen (optioneel)</Label>
                      <Textarea
                        id="notes"
                        {...register("notes")}
                        placeholder="Eventuele extra informatie over je locatie..."
                        data-testid="input-notes"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={isSubmitting || !locationType}
                data-testid="button-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Bezig met versturen...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Aanmelding versturen
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-xs text-muted-foreground text-center">
              Na het versturen beoordelen wij je locatie. Bij goedkeuring ontvang je een link om het contract af te ronden.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
