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
              className="text-slate-600 hover:text-emerald-600 hidden sm:inline-flex transition-colors"
              onClick={() => scrollToSection('adverteren')}
            >
              Adverteren
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-emerald-600 hidden sm:inline-flex transition-colors"
              onClick={() => scrollToSection('scherm-aanbieden')}
            >
              Scherm aanbieden
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-emerald-600 hidden sm:inline-flex transition-colors"
              onClick={() => scrollToSection('contact')}
            >
              Contact
            </Button>
          </nav>
        </div>
      </header>

      <section className="py-24 md:py-36 relative overflow-hidden min-h-[75vh] flex items-center">
        <video 
          autoPlay 
          muted 
          loop 
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-900/50 to-slate-900/60" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-lg" data-testid="hero-title">
              Lokale schermreclame die écht opvalt.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/90 mb-8 max-w-xl mx-auto leading-relaxed">
              Digitale schermen op drukbezochte locaties. Zichtbaar bij jouw doelgroep, precies waar aandacht is.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-5">
              <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
                <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 px-8 py-6 w-full sm:w-auto text-base font-medium shadow-lg transition-colors" data-testid="button-cta-mediakit">
                  <Mail className="h-5 w-5" />
                  Vraag mediakit aan
                </Button>
              </a>
              <Button 
                size="lg" 
                variant="outline" 
                className="gap-2 border-2 border-white/40 hover:bg-white/10 px-8 py-6 text-white text-base font-medium transition-colors"
                onClick={() => scrollToSection('scherm-aanbieden')}
                data-testid="button-cta-partner"
              >
                <MapPin className="h-5 w-5" />
                Scherm aanbieden
              </Button>
            </div>
            <p className="text-sm text-white/70 mb-12">
              Snel reactie • Ontwerp inbegrepen • Duidelijke afspraken
            </p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/80">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-emerald-400" />
                <span>Lokaal publiek</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                <span>Vaste prijs & looptijd</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>Volledig verzorgd</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="adverteren" className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-3">Voor wie?</h2>
          <p className="text-center text-slate-500 mb-14 max-w-md mx-auto">
            Elevizion verbindt adverteerders met lokale schermlocaties
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border hover:border-emerald-200 transition-colors shadow-sm">
              <CardHeader className="pb-3">
                <div className="w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                  <Megaphone className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-lg font-semibold">Voor adverteerders</CardTitle>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Lokaal groeien zonder verspilling aan online advertentiebudget.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-slate-600 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Bereik klanten in jouw regio</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Herhaling zorgt voor herkenning</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Zichtbaar waar je doelgroep komt</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
                  <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 mt-4 transition-colors">
                    <Mail className="h-4 w-4" />
                    Vraag mediakit aan
                  </Button>
                </a>
              </CardContent>
            </Card>
            
            <Card id="scherm-aanbieden" className="border hover:border-slate-300 transition-colors shadow-sm">
              <CardHeader className="pb-3">
                <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                  <Building2 className="h-5 w-5 text-slate-600" />
                </div>
                <CardTitle className="text-lg font-semibold">Voor locaties</CardTitle>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Scherm dat past bij jouw zaak, volledig verzorgd.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-slate-600 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Scherm en plaatsing vaak kosteloos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Vergoeding of commissie</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Wij regelen content en onderhoud</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Scherm%20aanbieden">
                  <Button variant="outline" className="w-full gap-2 border hover:bg-slate-50 mt-4 transition-colors">
                    <MapPin className="h-4 w-4" />
                    Scherm aanbieden
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight">
              Online advertenties worden weggeklikt. Onze schermen niet.
            </h2>
            <p className="text-slate-300 mb-8 leading-relaxed">
              Je boodschap komt in beeld waar mensen wachten, kijken en besluiten.
            </p>
            <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 transition-colors">
                <Mail className="h-4 w-4" />
                Vraag mediakit aan
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-3">Zo werkt het</h2>
          <p className="text-center text-slate-500 mb-14 max-w-md mx-auto">
            In drie stappen naar zichtbaarheid
          </p>
          <div className="grid md:grid-cols-3 gap-10 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
                <Handshake className="h-5 w-5" />
              </div>
              <div className="text-xs text-emerald-600 font-medium mb-1 uppercase tracking-wide">Stap 1</div>
              <h3 className="font-semibold text-base mb-2">Kennismaken</h3>
              <p className="text-sm text-slate-500 leading-relaxed">We bespreken je doelen en adviseren welke locaties passen.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
                <Monitor className="h-5 w-5" />
              </div>
              <div className="text-xs text-emerald-600 font-medium mb-1 uppercase tracking-wide">Stap 2</div>
              <h3 className="font-semibold text-base mb-2">Plaatsing & planning</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Wij maken de content en plannen de campagne.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
                <Play className="h-5 w-5" />
              </div>
              <div className="text-xs text-emerald-600 font-medium mb-1 uppercase tracking-wide">Stap 3</div>
              <h3 className="font-semibold text-base mb-2">Live + rapportage</h3>
              <p className="text-sm text-slate-500 leading-relaxed">Je advertentie draait en je krijgt inzicht in bereik.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-3">Pakketten</h2>
          <p className="text-center text-slate-500 mb-14 max-w-lg mx-auto">
            Indicatiepakketten. We stemmen altijd af op locatie, doelgroep en budget.
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border shadow-sm">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-base font-semibold">Starter</CardTitle>
                <p className="text-sm text-slate-500">Om te beginnen</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>1 schermlocatie</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Meerdere keren per uur zichtbaar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Maandelijkse looptijd</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Basis rapportage</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Starter%20pakket">
                  <Button variant="outline" className="w-full transition-colors">Meer info</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border-2 border-emerald-200 relative shadow-sm">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                Populair
              </div>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-base font-semibold">Local Plus</CardTitle>
                <p className="text-sm text-slate-500">Meest gekozen</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>3 schermlocaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Meer zendtijd, langere spots</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Flexibele looptijd</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Ontwerp inbegrepen</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Local%20Plus%20pakket">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors">Meer info</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-base font-semibold">Premium</CardTitle>
                <p className="text-sm text-slate-500">Maximaal bereik</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Meerdere schermen naar wens</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Voorrang op toplocaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Volledige ontwerp service</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>Uitgebreide rapportage</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Premium%20pakket">
                  <Button variant="outline" className="w-full transition-colors">Meer info</Button>
                </a>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-sm text-slate-500 mt-10 max-w-md mx-auto">
            Prijs afhankelijk van locatie en looptijd.
          </p>
          <div className="text-center mt-3">
            <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
              <Button variant="link" className="text-emerald-600 gap-1 transition-colors">
                Vraag mediakit aan
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-3">Waar je ons tegenkomt</h2>
          <p className="text-center text-slate-500 mb-14 max-w-md mx-auto">
            Schermen op plekken waar mensen wachten en kijken
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border bg-white shadow-sm">
              <CardContent className="pt-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Wachtruimtes & balies</h3>
                <p className="text-sm text-slate-500">Kappers, tandartsen, praktijken</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="pt-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <Dumbbell className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Sportscholen & studio's</h3>
                <p className="text-sm text-slate-500">Fitness, yoga, dansstudio's</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="pt-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <Coffee className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-sm mb-1">Horeca & retail</h3>
                <p className="text-sm text-slate-500">Cafés, winkels, restaurants</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-900 mb-3">Veelgestelde vragen</h2>
          <p className="text-center text-slate-500 mb-14 max-w-md mx-auto">
            Antwoord op de meest gestelde vragen
          </p>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="item-1" className="bg-slate-50 rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium">
                  In welke regio zijn jullie actief?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm">
                  Voornamelijk in de Randstad. Neem contact op om te kijken of we actief zijn in jouw regio.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="bg-slate-50 rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium">
                  Hoe lang loopt een campagne?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm">
                  Minimaal één maand. Langere campagnes zijn mogelijk met korting.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="bg-slate-50 rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium">
                  Maken jullie de advertentie ook op?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm">
                  Ja, wij ontwerpen je advertentie op basis van je logo, video en teksten. Bij sommige pakketten inbegrepen.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="bg-slate-50 rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium">
                  Kan ik meerdere locaties kiezen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm">
                  Zeker. Je kunt specifieke locaties kiezen of een regio selecteren.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5" className="bg-slate-50 rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium">
                  Wat als ik mijn content wil aanpassen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm">
                  Content aanpassen kan altijd. Stuur nieuw materiaal en wij zorgen dat het snel wordt bijgewerkt.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-6" className="bg-slate-50 rounded-lg border px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium">
                  Hoe kan ik een schermlocatie aanbieden?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm">
                  Mail naar info@elevizion.nl met je locatiegegevens. We nemen contact op.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-emerald-600 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Klaar om lokaal zichtbaar te worden?</h2>
            <p className="text-emerald-100 mb-8 leading-relaxed">
              Wij regelen de schermen, planning en content. Jij wordt gezien.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
                <Button size="lg" className="gap-2 bg-white text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto transition-colors">
                  <Mail className="h-4 w-4" />
                  Vraag mediakit aan
                </Button>
              </a>
              <a href="mailto:info@elevizion.nl?subject=Scherm%20aanbieden">
                <Button size="lg" variant="outline" className="gap-2 border-2 border-white/40 hover:bg-white/10 text-white w-full sm:w-auto transition-colors">
                  <MapPin className="h-4 w-4" />
                  Scherm aanbieden
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="py-20 md:py-28 bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Contact</h2>
            <p className="text-slate-400 mb-8">
              Mail ons en we reageren snel.
            </p>
            <a href="mailto:info@elevizion.nl">
              <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 transition-colors">
                <Mail className="h-4 w-4" />
                info@elevizion.nl
              </Button>
            </a>
          </div>
        </div>
      </section>

      <footer className="py-8 bg-slate-950 text-slate-500">
        <div className="container mx-auto px-4 text-center">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <span className="text-sm">&copy; {new Date().getFullYear()} Elevizion</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <a href="mailto:info@elevizion.nl" className="text-sm hover:text-white transition-colors">
              info@elevizion.nl
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
