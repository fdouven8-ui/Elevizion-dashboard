import { useState } from "react";
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
import { Link } from "wouter";
import { AdvertiserLeadModal, ScreenLeadModal } from "@/components/LeadModals";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function Landing() {
  const [advertiserModalOpen, setAdvertiserModalOpen] = useState(false);
  const [screenModalOpen, setScreenModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

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
              Digital signage die écht opvalt
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/80 mb-8 max-w-xl mx-auto leading-relaxed">
              Adverteer op digitale reclame schermen bij kappers, sportscholen en horeca in Limburg. Lokale zichtbaarheid voor jouw bedrijf.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-5">
              <Button 
                size="lg" 
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 px-8 py-6 w-full sm:w-auto text-base font-medium shadow-lg shadow-emerald-900/20 transition-colors" 
                data-testid="button-cta-adverteren"
                onClick={() => setAdvertiserModalOpen(true)}
              >
                <Megaphone className="h-5 w-5" />
                Ik wil adverteren
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="gap-2 border border-white/30 hover:bg-white/10 px-8 py-6 text-white text-base transition-colors"
                onClick={() => setScreenModalOpen(true)}
                data-testid="button-cta-partner"
              >
                <MapPin className="h-5 w-5" />
                Ik wil een scherm op mijn locatie
              </Button>
            </div>
            <p className="text-sm text-white/50 mb-12">
              Snelle reactie • Lokaal bereik • Duidelijke afspraken
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

      <section id="adverteren" className="py-20 md:py-28 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Voor wie?</h2>
          <p className="text-center text-slate-600 mb-14 max-w-md mx-auto">
            Elevizion verbindt adverteerders met lokale schermlocaties
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border-2 border-emerald-200 hover:border-emerald-400 bg-gradient-to-b from-emerald-50/50 to-white transition-all hover:shadow-lg">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mb-4 shadow-lg">
                  <Megaphone className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Voor adverteerders</CardTitle>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Lokaal groeien zonder verspilling aan online advertentiebudget.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-slate-700 text-sm">
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Bereik klanten in jouw regio</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Herhaling zorgt voor herkenning</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Zichtbaar waar je doelgroep komt</span>
                  </li>
                </ul>
                <Button 
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 mt-4 transition-colors font-semibold shadow-lg"
                  onClick={() => setAdvertiserModalOpen(true)}
                >
                  <Megaphone className="h-4 w-4" />
                  Ik wil adverteren
                </Button>
              </CardContent>
            </Card>
            
            <Card id="scherm-aanbieden" className="border-2 border-slate-200 hover:border-emerald-300 bg-white transition-all hover:shadow-lg">
              <CardHeader className="pb-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-4">
                  <Building2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Voor locaties</CardTitle>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  Scherm dat past bij jouw zaak, volledig verzorgd.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-slate-700 text-sm">
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Scherm en plaatsing vaak kosteloos</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Vergoeding of commissie</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Wij regelen content en onderhoud</span>
                  </li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full gap-2 border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white mt-4 transition-colors font-semibold"
                  onClick={() => setScreenModalOpen(true)}
                >
                  <MapPin className="h-4 w-4" />
                  Ik wil een scherm op mijn locatie
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-5 leading-tight text-white">
              Online advertenties worden weggeklikt. Onze schermen niet.
            </h2>
            <p className="text-white/80 mb-8 leading-relaxed text-lg">
              Je boodschap komt in beeld waar mensen wachten, kijken en besluiten.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-600 transition-colors font-semibold text-base py-6 px-8 shadow-lg shadow-emerald-500/20"
              onClick={() => setAdvertiserModalOpen(true)}
            >
              <Megaphone className="h-5 w-5" />
              Ik wil adverteren
            </Button>
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
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Video aanleveren</h3>
              <p className="text-sm text-slate-600 leading-relaxed">Je levert je video aan, wij plaatsen hem op de schermen.</p>
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
                    <span>Klant levert video aan</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Min. looptijd: 6 maanden</span>
                  </li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors font-semibold"
                  onClick={() => setAdvertiserModalOpen(true)}
                >
                  Meer info
                </Button>
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
                    <span className="font-medium">Klant levert video aan</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    <span className="font-medium">Min. looptijd: 6 maanden</span>
                  </li>
                </ul>
                <Button 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 transition-colors font-semibold text-base py-5 shadow-lg"
                  onClick={() => setAdvertiserModalOpen(true)}
                >
                  Meer info
                </Button>
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
                    <span>Klant levert video aan</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-emerald-600" />
                    </div>
                    <span>Min. looptijd: 6 maanden</span>
                  </li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-colors font-semibold"
                  onClick={() => setAdvertiserModalOpen(true)}
                >
                  Meer info
                </Button>
              </CardContent>
            </Card>
          </div>
          <p className="text-center text-sm text-slate-400 mt-10 max-w-md mx-auto">
            Je levert je eigen video aan. Prijs afhankelijk van locatie.
          </p>
          <div className="text-center mt-3">
            <Button 
              variant="link" 
              className="text-emerald-600 gap-1 transition-colors"
              onClick={() => setAdvertiserModalOpen(true)}
            >
              Start met adverteren
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Waar je ons tegenkomt</h2>
          <p className="text-center text-slate-600 mb-14 max-w-md mx-auto">
            Schermen op plekken waar mensen wachten en kijken
          </p>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border-2 border-slate-100 bg-gradient-to-b from-slate-50 to-white hover:border-emerald-300 hover:shadow-lg transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-1">Wachtruimtes & balies</h3>
                <p className="text-sm text-slate-500">Kappers, tandartsen, praktijken</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 bg-gradient-to-b from-slate-50 to-white hover:border-emerald-300 hover:shadow-lg transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Dumbbell className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-1">Sportscholen & studio's</h3>
                <p className="text-sm text-slate-500">Fitness, yoga, dansstudio's</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 bg-gradient-to-b from-slate-50 to-white hover:border-emerald-300 hover:shadow-lg transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Coffee className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-1">Horeca & retail</h3>
                <p className="text-sm text-slate-500">Cafés, winkels, restaurants</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-3">Veelgestelde vragen over digital signage</h2>
          <p className="text-center text-slate-600 mb-14 max-w-md mx-auto">
            Alles over narrowcasting en schermreclame
          </p>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-3">
              <AccordionItem value="item-1" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Wat is narrowcasting en digital signage?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Narrowcasting is het tonen van gerichte content op digitale schermen voor een specifieke doelgroep. 
                  In tegenstelling tot TV-reclame (broadcasting) bereik je met narrowcasting precies de mensen die relevant zijn voor jouw business - 
                  bijvoorbeeld bezoekers van een kapsalon of sportschool in jouw regio.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Wat kost adverteren op digitale reclame schermen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Onze pakketten beginnen bij €49,99 per maand. Prijzen zijn afhankelijk van het aantal schermen. 
                  Je levert je eigen video aan. Neem contact op voor een vrijblijvende offerte.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  In welke regio's zijn jullie actief?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  We zijn actief in Limburg met schermen in Sittard-Geleen, Maastricht, Heerlen, Roermond en Venlo. 
                  Onze schermen hangen bij kappers, sportscholen, horeca en winkels in deze regio's.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Hoe lang loopt een campagne?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Minimale looptijd is 6 maanden. Daarna kun je maandelijks opzeggen. 
                  Je advertentie draait de hele dag, met herhaling voor maximale herkenning.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Maken jullie de advertentie ook op?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Nee, je levert je advertentievideo zelf aan. Wij sturen je na akkoord duidelijke aanleverspecificaties 
                  (MP4, 1080p, 10-15 sec). Wij plaatsen de video vervolgens op de schermen.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-6" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Hoeveel mensen zien mijn advertentie?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Bereik varieert per locatie. Een drukbezochte kapsalon heeft 50-100 bezoekers per week, 
                  een sportschool tot 200+ per dag. Je advertentie wordt meerdere keren per uur getoond voor maximale zichtbaarheid.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-7" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Kan ik meerdere locaties kiezen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Zeker. Je kunt specifieke schermlocaties kiezen of een hele regio selecteren. 
                  Ideaal voor lokale ondernemers die meerdere wijken of steden willen bereiken.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-8" className="bg-white rounded-xl border-2 border-slate-100 px-5 hover:border-emerald-200 transition-colors shadow-sm">
                <AccordionTrigger className="text-left hover:no-underline text-base font-semibold text-slate-800 py-5">
                  Hoe kan ik een scherm op mijn locatie krijgen?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 text-sm pb-5">
                  Heb je een kapsalon, sportschool, café of winkel? Wij plaatsen het scherm kosteloos en regelen het onderhoud. 
                  Jij krijgt een deel van de advertentieinkomsten. Mail naar info@elevizion.nl voor meer informatie.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-emerald-400/30 via-transparent to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-5 text-white">Klaar om lokaal zichtbaar te worden?</h2>
            <p className="text-white/90 mb-8 leading-relaxed text-lg">
              Wij regelen de schermen en planning. Jij levert de video, en wordt gezien.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2 bg-white text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto transition-colors font-semibold text-base py-6 px-8 shadow-xl"
                onClick={() => setAdvertiserModalOpen(true)}
              >
                <Megaphone className="h-5 w-5" />
                Ik wil adverteren
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="gap-2 border-2 border-white/40 hover:bg-white/20 text-white w-full sm:w-auto transition-colors font-semibold text-base py-6 px-8"
                onClick={() => setScreenModalOpen(true)}
              >
                <MapPin className="h-5 w-5" />
                Ik wil een scherm op mijn locatie
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="py-20 md:py-28 bg-gradient-to-b from-slate-900 to-slate-950 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
              <Mail className="h-7 w-7" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">Contact</h2>
            <p className="text-slate-400 mb-8 text-lg">
              Mail ons en we reageren snel.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-600 transition-colors font-semibold text-base py-6 px-8 shadow-lg shadow-emerald-500/20"
              onClick={() => setAdvertiserModalOpen(true)}
            >
              <Megaphone className="h-5 w-5" />
              Neem contact op
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />

      <AdvertiserLeadModal open={advertiserModalOpen} onOpenChange={setAdvertiserModalOpen} />
      <ScreenLeadModal open={screenModalOpen} onOpenChange={setScreenModalOpen} />
    </div>
  );
}
