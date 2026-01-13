import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Monitor, Check, ArrowRight, Megaphone, MessageSquare
} from "lucide-react";
import { Link } from "wouter";
import { AdvertiserLeadModal } from "@/components/LeadModals";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function Prijzen() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-slate-800">
              Duidelijke prijzen, geen verrassingen
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Vaste maandprijzen inclusief plaatsing en onderhoud. 
              Alle prijzen zijn exclusief BTW.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <Card className="border-2 border-slate-200 bg-white hover:border-emerald-300 hover:shadow-lg transition-all">
              <CardHeader className="text-center pb-2 pt-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Monitor className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Starter</CardTitle>
                <p className="text-sm text-slate-500 mt-1">1 scherm</p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-4xl font-bold text-slate-800">€49,99</span>
                  <span className="text-slate-500 text-sm">/maand</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-700 mb-6 text-left">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>1 schermlocatie</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>4x per uur zichtbaar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>10-15 seconden spot</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Klant levert video aan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Minimale looptijd: 6 maanden</span>
                  </li>
                </ul>
                <Button 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold"
                  onClick={() => setModalOpen(true)}
                  data-testid="button-pricing-1"
                >
                  Start met 1 scherm
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-emerald-600 bg-gradient-to-b from-emerald-50 to-white shadow-xl relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-sm font-bold px-5 py-1.5 rounded-full shadow-lg">
                Populair
              </div>
              <CardHeader className="text-center pb-2 pt-8">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3">
                  <Monitor className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Local Plus</CardTitle>
                <p className="text-sm text-emerald-600 font-medium mt-1">3 schermen</p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-4xl font-bold text-slate-800">€129,99</span>
                  <span className="text-slate-500 text-sm">/maand</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-700 mb-6 text-left">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span className="font-medium">3 schermlocaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>6x per uur zichtbaar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>10-20 seconden spot</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Klant levert video aan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Minimale looptijd: 6 maanden</span>
                  </li>
                </ul>
                <Button 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold text-base py-5"
                  onClick={() => setModalOpen(true)}
                  data-testid="button-pricing-3"
                >
                  Start met 3 schermen
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200 bg-white hover:border-emerald-300 hover:shadow-lg transition-all">
              <CardHeader className="text-center pb-2 pt-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Monitor className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Premium</CardTitle>
                <p className="text-sm text-slate-500 mt-1">10 schermen</p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-4xl font-bold text-slate-800">€299,99</span>
                  <span className="text-slate-500 text-sm">/maand</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-700 mb-6 text-left">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>10 schermlocaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>8x per uur zichtbaar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Tot 30 seconden spot</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Klant levert video aan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Breed lokaal bereik</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Minimale looptijd: 6 maanden</span>
                  </li>
                </ul>
                <Button 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold"
                  onClick={() => setModalOpen(true)}
                  data-testid="button-pricing-10"
                >
                  Start met 10 schermen
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-300 bg-gradient-to-b from-slate-50 to-white hover:border-emerald-300 hover:shadow-lg transition-all">
              <CardHeader className="text-center pb-2 pt-6">
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-800">Custom</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Op maat</p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-2xl font-bold text-slate-800">Op aanvraag</span>
                </div>
                <ul className="space-y-3 text-sm text-slate-700 mb-6 text-left">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Meer dan 10 schermen</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Exclusieve locaties</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Volledige campagne</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Meerdere video's/ontwerpen</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <span>Persoonlijke begeleiding</span>
                  </li>
                </ul>
                <Button 
                  variant="outline"
                  className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white font-semibold"
                  asChild
                  data-testid="button-pricing-custom"
                >
                  <Link href="/contact">
                    Neem contact op
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-slate-500 mt-10">
            Alle prijzen zijn exclusief 21% BTW. Geen opstartkosten.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Wat zit er allemaal bij?
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-lg mx-auto">
            Bij elk pakket inbegrepen
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Plaatsing & beheer</h3>
              <p className="text-sm text-slate-600">Wij zorgen voor plaatsing op de schermen en monitoren alles 24/7</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Flexibel wijzigen</h3>
              <p className="text-sm text-slate-600">Video vervangen of locaties wisselen kan altijd</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Duidelijke voorwaarden</h3>
              <p className="text-sm text-slate-600">Minimaal 6 maanden, daarna maandelijks opzegbaar</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Vragen over de pakketten?
            </h2>
            <p className="text-slate-300 mb-8">
              We helpen je graag de beste keuze te maken voor jouw situatie.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2 bg-emerald-500 hover:bg-emerald-600 font-semibold py-6 px-8"
                onClick={() => setModalOpen(true)}
              >
                <Megaphone className="h-5 w-5" />
                Start nu
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="gap-2 border-white/30 text-white hover:bg-white/10 font-semibold py-6 px-8"
                asChild
              >
                <Link href="/contact">
                  Stel een vraag
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
      <AdvertiserLeadModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
