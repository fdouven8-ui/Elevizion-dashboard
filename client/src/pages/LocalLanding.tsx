import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Monitor, MapPin, Megaphone, ArrowLeft,
  Scissors, Dumbbell, Coffee, Check, Building2
} from "lucide-react";
import { Link } from "wouter";
import { AdvertiserLeadModal, ScreenLeadModal } from "@/components/LeadModals";

interface CityData {
  name: string;
  slug: string;
  description: string;
  locations: string[];
}

const cityData: Record<string, CityData> = {
  limburg: {
    name: "Limburg",
    slug: "limburg",
    description: "Digital signage en narrowcasting in de hele provincie Limburg. Van Maastricht tot Venlo, wij plaatsen digitale reclame schermen op strategische locaties.",
    locations: ["kapsalons", "sportscholen", "cafés", "winkels", "praktijken"]
  },
  sittard: {
    name: "Sittard-Geleen",
    slug: "sittard",
    description: "Lokale schermreclame in Sittard-Geleen en omgeving. Bereik inwoners van Sittard, Geleen en Born met digitale advertenties.",
    locations: ["kappers in Sittard", "sportscholen in Geleen", "horeca in Born"]
  },
  maastricht: {
    name: "Maastricht",
    slug: "maastricht",
    description: "Digital signage in Maastricht en omstreken. Adverteer op schermen bij drukbezochte locaties in de Limburgse hoofdstad.",
    locations: ["kappers in Wyck", "sportscholen", "cafés in het centrum"]
  },
  heerlen: {
    name: "Heerlen",
    slug: "heerlen",
    description: "Narrowcasting en schermreclame in Heerlen en Parkstad. Bereik de inwoners van Heerlen, Kerkrade en Landgraaf.",
    locations: ["kapsalons in Heerlen", "fitnesscentra in Parkstad", "winkels"]
  },
  roermond: {
    name: "Roermond",
    slug: "roermond",
    description: "Digitale reclame schermen in Roermond en Midden-Limburg. Zichtbaar bij lokale ondernemers en drukbezochte locaties.",
    locations: ["kappers", "sportscholen", "horeca nabij Designer Outlet"]
  },
  venlo: {
    name: "Venlo",
    slug: "venlo",
    description: "Schermreclame en digital signage in Venlo en Noord-Limburg. Adverteer lokaal in Venlo, Venray en omgeving.",
    locations: ["kapsalons in Venlo", "sportscholen", "winkels in het centrum"]
  }
};

export default function LocalLanding({ city }: { city: string }) {
  const data = cityData[city] || cityData.limburg;
  const [advertiserModalOpen, setAdvertiserModalOpen] = useState(false);
  const [screenModalOpen, setScreenModalOpen] = useState(false);
  
  useEffect(() => {
    document.title = `Digital Signage in ${data.name} | Schermreclame | Elevizion`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', `Adverteer op digitale schermen in ${data.name}. Lokale narrowcasting bij kappers, sportscholen en horeca. Vraag vrijblijvend info aan.`);
    }
  }, [data.name]);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 bg-white/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img 
                src="/elevizion-logo.png" 
                alt="Elevizion - Digital Signage Limburg" 
                className="h-9 w-auto"
                loading="lazy"
              />
            </a>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1 text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="py-16 md:py-24 bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-600 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">
              Digital Signage in {data.name}
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed max-w-2xl mx-auto">
              {data.description}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2 bg-white text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto font-semibold py-6 px-8 shadow-xl"
                onClick={() => setAdvertiserModalOpen(true)}
              >
                <Megaphone className="h-5 w-5" />
                Ik wil adverteren in {data.name}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Wat is narrowcasting?
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            Narrowcasting, ook wel digital signage genoemd, is het tonen van gerichte advertenties en content op digitale schermen. 
            In tegenstelling tot broadcasting (TV/radio) bereik je met narrowcasting een specifieke, lokale doelgroep op het juiste moment.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Kappers & Barbershops</h3>
                <p className="text-sm text-slate-500">Klanten wachten gemiddeld 15-30 minuten en kijken naar het scherm</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Dumbbell className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Sportscholen & Gyms</h3>
                <p className="text-sm text-slate-500">Actieve doelgroep met interesse in gezondheid en lifestyle</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Coffee className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Horeca & Cafés</h3>
                <p className="text-sm text-slate-500">Ontspannen sfeer waar mensen openstaan voor nieuwe informatie</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Voordelen van schermreclame in {data.name}
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            Waarom lokale ondernemers kiezen voor digitale reclame schermen
          </p>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Lokaal bereik</h3>
                <p className="text-sm text-slate-600">Bereik klanten in {data.name} die daadwerkelijk naar jouw zaak kunnen komen</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Geen adblockers</h3>
                <p className="text-sm text-slate-600">Digitale schermen worden niet geblokkeerd, je advertentie wordt altijd gezien</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Herhaling = herkenning</h3>
                <p className="text-sm text-slate-600">Door regelmatige herhaling onthouden mensen jouw merk en boodschap</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Vaste maandprijs</h3>
                <p className="text-sm text-slate-600">Geen verrassingen, duidelijke afspraken over kosten en looptijd</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Veelgestelde vragen over digital signage in {data.name}
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            Antwoorden op de meest gestelde vragen
          </p>
          
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-3">
              <AccordionItem value="item-1" className="bg-slate-50 rounded-xl border border-slate-200 px-5">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Wat kost adverteren op een digitaal scherm in {data.name}?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  De kosten voor schermreclame in {data.name} zijn afhankelijk van de locatie en looptijd. 
                  Gemiddeld betaal je tussen €75 en €150 per maand per scherm. Neem contact op voor een vrijblijvende offerte.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="bg-slate-50 rounded-xl border border-slate-200 px-5">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Waar hangen de schermen in {data.name}?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Onze digitale schermen hangen bij {data.locations.join(", ")} en andere drukbezochte locaties. 
                  We selecteren locaties op basis van bezoekers en zichtbaarheid.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="bg-slate-50 rounded-xl border border-slate-200 px-5">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Hoe snel kan mijn advertentie live?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Na aanmelding maken wij binnen 1-2 werkdagen een ontwerp. 
                  Zodra je akkoord geeft, staat je advertentie binnen 24 uur op het scherm.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Start met adverteren in {data.name}
            </h2>
            <p className="text-slate-300 mb-8">
              Vraag vrijblijvend informatie aan en ontdek welke schermlocaties beschikbaar zijn in {data.name}.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-600 font-semibold py-6 px-8"
              onClick={() => setAdvertiserModalOpen(true)}
            >
              <Megaphone className="h-5 w-5" />
              Neem contact op
            </Button>
          </div>
        </div>
      </section>

      <section className="py-12 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-lg font-semibold text-center text-slate-700 mb-6">
            Ook beschikbaar in andere regio's
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {Object.values(cityData).filter(c => c.slug !== city).map(c => (
              <Link key={c.slug} href={`/regio/${c.slug}`}>
                <Button variant="outline" size="sm" className="text-slate-600 hover:text-emerald-600 hover:border-emerald-300">
                  {c.name}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 bg-slate-900 text-slate-400">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">&copy; {new Date().getFullYear()} Elevizion. Digital signage & narrowcasting in Limburg.</p>
          <Link href="/">
            <a className="text-sm text-emerald-400 hover:text-emerald-300 mt-2 inline-block">
              Terug naar homepage
            </a>
          </Link>
        </div>
      </footer>

      <AdvertiserLeadModal open={advertiserModalOpen} onOpenChange={setAdvertiserModalOpen} />
      <ScreenLeadModal open={screenModalOpen} onOpenChange={setScreenModalOpen} />
    </div>
  );
}
