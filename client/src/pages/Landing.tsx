import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Monitor, MapPin, Eye, Clock, CheckCircle, Mail, 
  ArrowRight, Building2, Megaphone, Handshake, Play,
  Scissors, Dumbbell, Coffee
} from "lucide-react";

export default function Landing() {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white/95 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src="/elevizion-logo.png" 
              alt="Elevizion" 
              className="h-9 w-auto"
              data-testid="logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const textEl = e.currentTarget.nextElementSibling as HTMLElement;
                if (textEl) textEl.style.display = 'block';
              }}
            />
            <span className="text-xl font-bold text-slate-900 hidden" data-testid="logo-text">Elevizion</span>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-emerald-600 hidden sm:inline-flex"
              onClick={() => scrollToSection('adverteren')}
            >
              Adverteren
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-emerald-600 hidden sm:inline-flex"
              onClick={() => scrollToSection('scherm-aanbieden')}
            >
              Scherm aanbieden
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-emerald-600 hidden sm:inline-flex"
              onClick={() => scrollToSection('contact')}
            >
              Contact
            </Button>
          </nav>
        </div>
      </header>

      <section className="py-16 md:py-24 bg-gradient-to-br from-slate-50 via-white to-emerald-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-100/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-100/50 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-4 leading-tight" data-testid="hero-title">
              Lokale schermreclame die écht opvalt.
            </h1>
            <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
              Elevizion plaatst digitale schermen op drukbezochte locaties en helpt lokale bedrijven zichtbaar worden bij hun eigen doelgroep — precies waar aandacht is.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
              <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
                <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 px-6 w-full sm:w-auto shadow-lg shadow-emerald-200" data-testid="button-cta-mediakit">
                  <Mail className="h-4 w-4" />
                  Vraag mediakit aan
                </Button>
              </a>
              <Button 
                size="lg" 
                variant="outline" 
                className="gap-2 border-2 border-slate-200 hover:bg-slate-50 px-6"
                onClick={() => scrollToSection('scherm-aanbieden')}
                data-testid="button-cta-partner"
              >
                <MapPin className="h-4 w-4" />
                Scherm aanbieden
              </Button>
            </div>
            <p className="text-sm text-slate-500 mb-10">
              Snel reactie • We regelen ontwerp & planning • Duidelijke afspraken
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-emerald-600" />
                <span>Zichtbaar bij lokaal publiek</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-600" />
                <span>Vaste prijs & looptijd (geen verrassingen)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>Volledig verzorgd: planning & plaatsing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="adverteren" className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4">Voor wie?</h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            Elevizion verbindt adverteerders met lokale schermlocaties
          </p>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Card className="border-2 hover:border-emerald-200 transition-colors">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
                  <Megaphone className="h-6 w-6 text-emerald-600" />
                </div>
                <CardTitle className="text-xl">Voor adverteerders</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Ideaal voor ondernemers die lokaal willen groeien zonder verspilling aan online advertentiebudget.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Bereik klanten in jouw regio op drukke locaties</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Herhaling zorgt voor herkenning en actie</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Zichtbaar waar je doelgroep écht komt</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Adverteren%20via%20Elevizion">
                  <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 mt-4">
                    <Mail className="h-4 w-4" />
                    Start met adverteren
                  </Button>
                </a>
              </CardContent>
            </Card>
            
            <Card id="scherm-aanbieden" className="border-2 hover:border-blue-200 transition-colors">
              <CardHeader className="pb-2">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Voor locaties</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Wij plaatsen een scherm dat past bij jouw zaak en regelen alles van content tot onderhoud.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Scherm en plaatsing vaak kosteloos (afhankelijk van model)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Maandelijkse vergoeding of commissie op inkomsten</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Wij regelen content, updates en onderhoud</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Scherm%20beschikbaar%20stellen">
                  <Button variant="outline" className="w-full gap-2 border-2 border-blue-200 hover:bg-blue-50 mt-4">
                    <MapPin className="h-4 w-4" />
                    Scherm aanbieden
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-14 md:py-16 bg-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Online advertenties worden weggeklikt. Onze schermen niet.
            </h2>
            <p className="text-slate-300 mb-6 max-w-xl mx-auto">
              Je boodschap komt in beeld op plekken waar mensen wachten, kijken en besluiten.
            </p>
            <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Mail className="h-4 w-4" />
                Vraag mediakit aan
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4">Zo werkt het</h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            In drie stappen naar zichtbaarheid
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
                <Handshake className="h-6 w-6" />
              </div>
              <div className="text-sm text-emerald-600 font-medium mb-1">Stap 1</div>
              <h3 className="font-semibold text-lg mb-2">Kennismaken</h3>
              <p className="text-sm text-slate-600">We bespreken je doelen en adviseren welke locaties passen (vrijblijvend).</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
                <Monitor className="h-6 w-6" />
              </div>
              <div className="text-sm text-emerald-600 font-medium mb-1">Stap 2</div>
              <h3 className="font-semibold text-lg mb-2">Plaatsing & planning</h3>
              <p className="text-sm text-slate-600">Wij maken of optimaliseren de content en plannen de campagne.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
                <Play className="h-6 w-6" />
              </div>
              <div className="text-sm text-emerald-600 font-medium mb-1">Stap 3</div>
              <h3 className="font-semibold text-lg mb-2">Live + rapportage</h3>
              <p className="text-sm text-slate-600">Live op scherm + inzicht in plaatsing en bereik (rapportage).</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4">Pakketten</h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            Deze pakketten zijn een indicatie. We stemmen de campagne altijd af op locatie, doelgroep en budget.
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border-2">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">Starter</CardTitle>
                <p className="text-sm text-slate-500">Perfect om te beginnen</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>1 schermlocatie</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Je advertentie verschijnt meerdere keren per uur</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Maandelijkse looptijd</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Basis rapportage</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Starter%20pakket">
                  <Button variant="outline" className="w-full">Meer info</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border-2 border-emerald-300 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                Populair
              </div>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">Local Plus</CardTitle>
                <p className="text-sm text-slate-500">Meest gekozen</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>3 schermlocaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Meer zendtijd per uur, langere spots</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Flexibele looptijd</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Ontwerp inbegrepen</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Local%20Plus%20pakket">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">Meer info</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">Premium</CardTitle>
                <p className="text-sm text-slate-500">Maximaal bereik</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Meerdere schermen naar wens</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Voorrang op premium locaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Volledige ontwerp service</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span>Uitgebreide rapportage</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Premium%20pakket">
                  <Button variant="outline" className="w-full">Meer info</Button>
                </a>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-sm text-slate-500 mt-8 max-w-lg mx-auto">
            Prijs afhankelijk van locatie en looptijd. Vraag de mediakit aan voor actuele tarieven.
          </p>
          <div className="text-center mt-4">
            <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
              <Button variant="link" className="text-emerald-600 gap-1">
                Vraag mediakit aan
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white border-y">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4">Waar je ons tegenkomt</h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            Onze schermen staan op plekken waar mensen wachten en kijken
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border bg-slate-50">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="h-6 w-6 text-emerald-600" />
                </div>
                <h3 className="font-semibold mb-1">Wachtruimtes & balies</h3>
                <p className="text-sm text-slate-600">Kappers, tandartsen, praktijken</p>
              </CardContent>
            </Card>
            <Card className="border bg-slate-50">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mx-auto mb-4">
                  <Dumbbell className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-1">Sportscholen & studio's</h3>
                <p className="text-sm text-slate-600">Fitness, yoga, dansstudio's</p>
              </CardContent>
            </Card>
            <Card className="border bg-slate-50">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center mx-auto mb-4">
                  <Coffee className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="font-semibold mb-1">Horeca & retail</h3>
                <p className="text-sm text-slate-600">Cafés, winkels, restaurants</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-4">Veelgestelde vragen</h2>
          <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">
            Antwoord op de meest gestelde vragen
          </p>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="item-1" className="bg-white rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                  In welke regio zijn jullie actief?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600">
                  We zijn voornamelijk actief in de Randstad en groeien gestaag. Neem contact op om te kijken of we actief zijn in jouw regio.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="bg-white rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                  Hoe lang loopt een campagne?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600">
                  De minimale looptijd is één maand. Langere campagnes zijn mogelijk met korting op het maandtarief.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="bg-white rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                  Maken jullie de advertentie ook op?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600">
                  Ja, wij kunnen je advertentie ontwerpen op basis van je logo, video en teksten. Dit is bij sommige pakketten inbegrepen.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="bg-white rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                  Kan ik meerdere locaties kiezen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600">
                  Zeker! Je kunt specifieke locaties kiezen of een regio selecteren. Hoe meer locaties, hoe groter je bereik.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5" className="bg-white rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                  Wat als ik mijn content wil aanpassen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600">
                  Content aanpassen kan altijd. Stuur je nieuwe materiaal en wij zorgen dat het snel wordt bijgewerkt.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-6" className="bg-white rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline">
                  Hoe kan ik een schermlocatie aanbieden?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600">
                  Stuur een mail naar info@elevizion.nl met je locatiegegevens. We nemen contact op om de mogelijkheden te bespreken.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Klaar om lokaal zichtbaar te worden?</h2>
            <p className="text-emerald-100 mb-8">
              Wij regelen de schermen, planning en content. Jij wordt gezien.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
                <Button size="lg" className="gap-2 bg-white text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto">
                  <Mail className="h-4 w-4" />
                  Vraag mediakit aan
                </Button>
              </a>
              <a href="mailto:info@elevizion.nl?subject=Scherm%20beschikbaar%20stellen">
                <Button size="lg" variant="outline" className="gap-2 border-2 border-white/30 hover:bg-white/10 text-white w-full sm:w-auto">
                  <MapPin className="h-4 w-4" />
                  Scherm aanbieden
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="py-16 md:py-20 bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Contact</h2>
            <p className="text-slate-300 mb-8">
              Mail ons en we reageren snel.
            </p>
            <a href="mailto:info@elevizion.nl">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg">
                <Mail className="h-4 w-4" />
                info@elevizion.nl
              </Button>
            </a>
          </div>
        </div>
      </section>

      <footer className="py-8 bg-slate-950 text-slate-400">
        <div className="container mx-auto px-4 text-center">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <span className="text-sm">&copy; {new Date().getFullYear()} Elevizion</span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <a href="mailto:info@elevizion.nl" className="text-sm hover:text-white">
              info@elevizion.nl
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
