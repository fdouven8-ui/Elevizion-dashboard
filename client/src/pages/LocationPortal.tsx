import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, MapPin, AlertCircle, Loader2 } from "lucide-react";

interface LocationData {
  locationCode: string;
  name: string;
  email: string;
  street?: string;
  houseNumber?: string;
  zipcode?: string;
  city?: string;
  visitorsPerWeek?: number;
  openingHours?: string;
  branche?: string;
}

export default function LocationPortal() {
  const [, params] = useRoute("/locatie-portal/:token");
  const token = params?.token;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    contactName: "",
    phone: "",
    street: "",
    houseNumber: "",
    zipcode: "",
    city: "",
    visitorsPerWeek: "",
    openingHours: "",
    branche: "",
  });

  useEffect(() => {
    if (!token) return;

    const fetchLocationData = async () => {
      try {
        const res = await fetch(`/api/public/location-portal/${token}`);
        
        if (res.status === 404) {
          setError("Deze link is ongeldig of verlopen.");
          return;
        }
        if (res.status === 410) {
          setError("Deze link is al gebruikt. De gegevens zijn al ingevuld.");
          return;
        }
        if (!res.ok) {
          setError("Er is een fout opgetreden. Probeer het later opnieuw.");
          return;
        }

        const data = await res.json();
        setLocationData(data);
        setFormData({
          name: data.name || "",
          contactName: "",
          phone: "",
          street: data.street || "",
          houseNumber: data.houseNumber || "",
          zipcode: data.zipcode || "",
          city: data.city || "",
          visitorsPerWeek: data.visitorsPerWeek?.toString() || "",
          openingHours: data.openingHours || "",
          branche: data.branche || "",
        });
      } catch (err) {
        setError("Kon geen verbinding maken met de server.");
      } finally {
        setLoading(false);
      }
    };

    fetchLocationData();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/public/location-portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          visitorsPerWeek: formData.visitorsPerWeek ? parseInt(formData.visitorsPerWeek) : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Er is iets misgegaan");
      }

      setIsSubmitted(true);
      toast({
        title: "Gegevens opgeslagen!",
        description: "Bedankt voor het invullen van de locatiegegevens.",
      });
    } catch (err: any) {
      toast({
        title: "Fout",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-muted-foreground">Locatiegegevens laden...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <div className="bg-red-100 p-4 rounded-full">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-red-800">Link Ongeldig</h2>
            <p className="text-red-600">{error}</p>
            <p className="text-sm text-muted-foreground mt-4">
              Neem contact op met Elevizion als je denkt dat dit een fout is.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <div className="bg-emerald-100 p-4 rounded-full">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-emerald-800">Gegevens Opgeslagen!</h2>
            <p className="text-emerald-700">
              Bedankt voor het invullen van de locatiegegevens voor <strong>{locationData?.locationCode}</strong>.
            </p>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-4 text-left w-full">
              <h3 className="font-medium text-emerald-800 mb-2">Wat gebeurt er nu?</h3>
              <ul className="text-sm text-emerald-700 space-y-1">
                <li>• Wij plannen de installatie van uw digitale scherm</li>
                <li>• U ontvangt bericht wanneer het scherm actief is</li>
                <li>• Heeft u vragen? Neem contact op met Elevizion</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium mb-4">
            <MapPin className="h-4 w-4 mr-2" />
            {locationData?.locationCode}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Locatiegegevens Invullen</h1>
          <p className="text-muted-foreground mt-2">
            Vul de onderstaande gegevens in voor uw schermlocatie
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-600" />
              Locatie Details
            </CardTitle>
            <CardDescription>
              Alle velden met * zijn verplicht
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Locatienaam *</Label>
                <Input 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Naam van de locatie"
                  required
                  data-testid="input-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Contactpersoon</Label>
                  <Input 
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    placeholder="Naam contactpersoon"
                    data-testid="input-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefoonnummer</Label>
                  <Input 
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="06-12345678"
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium mb-3">Adresgegevens</h3>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-3 space-y-2">
                    <Label>Straat *</Label>
                    <Input 
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      placeholder="Straatnaam"
                      required
                      data-testid="input-street"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nr. *</Label>
                    <Input 
                      value={formData.houseNumber}
                      onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
                      placeholder="123"
                      required
                      data-testid="input-house-number"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="space-y-2">
                    <Label>Postcode *</Label>
                    <Input 
                      value={formData.zipcode}
                      onChange={(e) => setFormData({ ...formData, zipcode: e.target.value })}
                      placeholder="1234 AB"
                      required
                      data-testid="input-zipcode"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Plaats *</Label>
                    <Input 
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Amsterdam"
                      required
                      data-testid="input-city"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium mb-3">Extra Informatie</h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Bezoekers per week (schatting) *</Label>
                    <Input 
                      type="number"
                      value={formData.visitorsPerWeek}
                      onChange={(e) => setFormData({ ...formData, visitorsPerWeek: e.target.value })}
                      placeholder="500"
                      required
                      min="1"
                      data-testid="input-visitors"
                    />
                    <p className="text-xs text-muted-foreground">
                      Dit helpt ons de juiste adverteerders te vinden voor uw locatie
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Openingstijden</Label>
                    <Input 
                      value={formData.openingHours}
                      onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })}
                      placeholder="Ma-Vr 9:00-18:00, Za 10:00-17:00"
                      data-testid="input-opening-hours"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Branche</Label>
                    <Input 
                      value={formData.branche}
                      onChange={(e) => setFormData({ ...formData, branche: e.target.value })}
                      placeholder="Fitness, Horeca, Retail, etc."
                      data-testid="input-branche"
                    />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-emerald-600 hover:bg-emerald-700 mt-6" 
                disabled={isSubmitting}
                data-testid="button-submit"
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
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>Powered by <strong>Elevizion</strong></p>
          <p className="text-xs mt-1">See Your Business Grow</p>
        </div>
      </div>
    </div>
  );
}
