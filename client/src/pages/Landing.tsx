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
  Scissors, Dumbbell, Coffee, Check
} from "lucide-react";

export default function Landing() {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 bg-white/95 backdrop-blur-sm sticky top-0 z-50">
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
              className="text-slate-500 hover:text-slate-900 hidden sm:inline-flex transition-colors"
              onClick={() => scrollToSection('adverteren')}
            >
              Adverteren
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-500 hover:text-slate-900 hidden sm:inline-flex transition-colors"
              onClick={() => scrollToSection('scherm-aanbieden')}
            >
              Scherm aanbieden
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-500 hover:text-slate-900 hidden sm:inline-flex transition-colors"
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
            <p className="text-base sm:text-lg md:text-xl text-white/80 mb-8 max-w-xl mx-auto leading-relaxed">
              Digitale schermen op drukbezochte locaties. Zichtbaar bij jouw doelgroep, precies waar aandacht is.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-5">
              <a href="mailto:info@elevizion.nl?subject=Mediakit%20aanvragen">
                <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 px-8 py-6 w-full sm:w-auto text-base font-medium shadow-lg shadow-emerald-900/20 transition-colors" data-testid="button-cta-mediakit">
                  <Mail className="h-5 w-5" />
                  Vraag mediakit aan
                </Button>
              </a>
              <Button 
                size="lg" 
                variant="outline" 
                className="gap-2 border border-white/30 hover:bg-white/10 px-8 py-6 text-white text-base transition-colors"
                onClick={() => scrollToSection('scherm-aanbieden')}
                data-testid="button-cta-partner"
              >
                <MapPin className="h-5 w-5" />
                Scherm aanbieden
              </Button>
            </div>
            <p className="text-sm text-white/50 mb-12">
              Snel reactie • Ontwerp inbegrepen • Duidelijke afspraken
            </p>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-white/40" />
                <span>Lokaal publiek</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-white/40" />
                <span>Vaste prijs & looptijd</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-white/40" />
                <span>Volledig verzorgd</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="adverteren" className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Voor wie?</h2>
          <p className="text-center text-slate-400 mb-14 max-w-md mx-auto">
            Elevizion verbindt adverteerders met lokale schermlocaties
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border border-slate-100 hover:border-slate-200 transition-colors">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mb-3">
                  <Megaphone className="h-5 w-5 text-slate-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-slate-800">Voor adverteerders</CardTitle>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  Lokaal groeien zonder verspilling aan online advertentiebudget.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-slate-500 text-sm">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                    <span>Bereik klanten in jouw regio</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                    <span>Herhaling zorgt voor herkenning</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
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
            
            <Card id="scherm-aanbieden" className="border border-slate-100 hover:border-slate-200 transition-colors">
              <CardHeader className="pb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mb-3">
                  <Building2 className="h-5 w-5 text-slate-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-slate-800">Voor locaties</CardTitle>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  Scherm dat past bij jouw zaak, volledig verzorgd.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2.5 text-slate-500 text-sm">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                    <span>Scherm en plaatsing vaak kosteloos</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                    <span>Vergoeding of commissie</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                    <span>Wij regelen content en onderhoud</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Scherm%20aanbieden">
                  <Button variant="outline" className="w-full gap-2 border-slate-200 hover:bg-slate-50 mt-4 transition-colors">
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
            <h2 className="text-2xl md:text-3xl font-bold mb-4 leading-tight text-white">
              Online advertenties worden weggeklikt. Onze schermen niet.
            </h2>
            <p className="text-white/70 mb-8 leading-relaxed">
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

      <section className="py-20 md:py-28 bg-gradient-to-b from-emerald-50 to-emerald-100/50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Zo werkt het</h2>
          <p className="text-center text-slate-600 mb-14 max-w-md mx-auto">
            In drie stappen naar zichtbaarheid
          </p>
          <div className="grid md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-200">
                <Handshake className="h-7 w-7" />
              </div>
              <div className="text-xs text-emerald-600 font-bold mb-2 uppercase tracking-wider">Stap 1</div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Kennismaken</h3>
              <p className="text-sm text-slate-600 leading-relaxed">We bespreken je doelen en adviseren welke locaties passen.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-200">
                <Monitor className="h-7 w-7" />
              </div>
              <div className="text-xs text-emerald-600 font-bold mb-2 uppercase tracking-wider">Stap 2</div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Plaatsing & planning</h3>
              <p className="text-sm text-slate-600 leading-relaxed">Wij maken de content en plannen de campagne.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-200">
                <Play className="h-7 w-7" />
              </div>
              <div className="text-xs text-emerald-600 font-bold mb-2 uppercase tracking-wider">Stap 3</div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Live + rapportage</h3>
              <p className="text-sm text-slate-600 leading-relaxed">Je advertentie draait en je krijgt inzicht in bereik.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Pakketten</h2>
          <p className="text-center text-slate-600 mb-14 max-w-lg mx-auto">
            Indicatiepakketten. We stemmen altijd af op locatie, doelgroep en budget.
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border-2 border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md transition-all">
              <CardHeader className="text-center pb-2 pt-6">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Monitor className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-800">Starter</CardTitle>
                <p className="text-sm text-slate-500">Om te beginnen</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-700 mb-6">
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>1 schermlocatie</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Meerdere keren per uur zichtbaar</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Maandelijkse looptijd</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Basis rapportage</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Starter%20pakket">
                  <Button variant="outline" className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors font-semibold">Meer info</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border-2 border-emerald-600 relative bg-gradient-to-b from-emerald-50 to-white shadow-xl shadow-emerald-100 scale-105">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-sm font-bold px-5 py-1.5 rounded-full shadow-lg">
                Populair
              </div>
              <CardHeader className="text-center pb-2 pt-8">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <Monitor className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Local Plus</CardTitle>
                <p className="text-sm text-emerald-600 font-medium">Meest gekozen</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-700 mb-6">
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium">3 schermlocaties</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium">Meer zendtijd, langere spots</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium">Flexibele looptijd</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium">Ontwerp inbegrepen</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Local%20Plus%20pakket">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors font-semibold text-base py-5 shadow-lg">Meer info</Button>
                </a>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md transition-all">
              <CardHeader className="text-center pb-2 pt-6">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Monitor className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-800">Premium</CardTitle>
                <p className="text-sm text-slate-500">Maximaal bereik</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-slate-700 mb-6">
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Meerdere schermen naar wens</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Voorrang op toplocaties</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Volledige ontwerp service</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Uitgebreide rapportage</span>
                  </li>
                </ul>
                <a href="mailto:info@elevizion.nl?subject=Interesse%20in%20Premium%20pakket">
                  <Button variant="outline" className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors font-semibold">Meer info</Button>
                </a>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-sm text-slate-400 mt-10 max-w-md mx-auto">
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

      <section className="py-20 md:py-28 bg-slate-50/50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Waar je ons tegenkomt</h2>
          <p className="text-center text-slate-400 mb-14 max-w-md mx-auto">
            Schermen op plekken waar mensen wachten en kijken
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border border-slate-100 bg-white">
              <CardContent className="pt-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="h-5 w-5 text-slate-400" />
                </div>
                <h3 className="font-semibold text-sm text-slate-700 mb-1">Wachtruimtes & balies</h3>
                <p className="text-sm text-slate-400">Kappers, tandartsen, praktijken</p>
              </CardContent>
            </Card>
            <Card className="border border-slate-100 bg-white">
              <CardContent className="pt-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-4">
                  <Dumbbell className="h-5 w-5 text-slate-400" />
                </div>
                <h3 className="font-semibold text-sm text-slate-700 mb-1">Sportscholen & studio's</h3>
                <p className="text-sm text-slate-400">Fitness, yoga, dansstudio's</p>
              </CardContent>
            </Card>
            <Card className="border border-slate-100 bg-white">
              <CardContent className="pt-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-4">
                  <Coffee className="h-5 w-5 text-slate-400" />
                </div>
                <h3 className="font-semibold text-sm text-slate-700 mb-1">Horeca & retail</h3>
                <p className="text-sm text-slate-400">Cafés, winkels, restaurants</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Veelgestelde vragen</h2>
          <p className="text-center text-slate-400 mb-14 max-w-md mx-auto">
            Antwoord op de meest gestelde vragen
          </p>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="item-1" className="bg-slate-50/70 rounded-lg border border-slate-100 px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium text-slate-700">
                  In welke regio zijn jullie actief?
                </AccordionTrigger>
                <AccordionContent className="text-slate-500 text-sm">
                  Voornamelijk in de Randstad. Neem contact op om te kijken of we actief zijn in jouw regio.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="bg-slate-50/70 rounded-lg border border-slate-100 px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium text-slate-700">
                  Hoe lang loopt een campagne?
                </AccordionTrigger>
                <AccordionContent className="text-slate-500 text-sm">
                  Minimaal één maand. Langere campagnes zijn mogelijk met korting.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="bg-slate-50/70 rounded-lg border border-slate-100 px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium text-slate-700">
                  Maken jullie de advertentie ook op?
                </AccordionTrigger>
                <AccordionContent className="text-slate-500 text-sm">
                  Ja, wij ontwerpen je advertentie op basis van je logo, video en teksten. Bij sommige pakketten inbegrepen.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="bg-slate-50/70 rounded-lg border border-slate-100 px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium text-slate-700">
                  Kan ik meerdere locaties kiezen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-500 text-sm">
                  Zeker. Je kunt specifieke locaties kiezen of een regio selecteren.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5" className="bg-slate-50/70 rounded-lg border border-slate-100 px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium text-slate-700">
                  Wat als ik mijn content wil aanpassen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-500 text-sm">
                  Content aanpassen kan altijd. Stuur nieuw materiaal en wij zorgen dat het snel wordt bijgewerkt.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-6" className="bg-slate-50/70 rounded-lg border border-slate-100 px-4">
                <AccordionTrigger className="text-left hover:no-underline text-sm font-medium text-slate-700">
                  Hoe kan ik een schermlocatie aanbieden?
                </AccordionTrigger>
                <AccordionContent className="text-slate-500 text-sm">
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
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Klaar om lokaal zichtbaar te worden?</h2>
            <p className="text-white/80 mb-8 leading-relaxed">
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
                <Button size="lg" variant="outline" className="gap-2 border border-white/30 hover:bg-white/10 text-white w-full sm:w-auto transition-colors">
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
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Contact</h2>
            <p className="text-slate-500 mb-8">
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

      <footer className="py-8 bg-slate-950 text-slate-600">
        <div className="container mx-auto px-4 text-center">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <span className="text-sm">&copy; {new Date().getFullYear()} Elevizion</span>
            <span className="hidden sm:inline text-slate-800">•</span>
            <a href="mailto:info@elevizion.nl" className="text-sm hover:text-white transition-colors">
              info@elevizion.nl
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
