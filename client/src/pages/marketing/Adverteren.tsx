import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Megaphone, Check, ArrowRight, Monitor, Clock, Eye, 
  FileVideo, Zap, Users, Target
} from "lucide-react";
import { Link } from "wouter";
import { AdvertiserLeadModal } from "@/components/LeadModals";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function Adverteren() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section className="py-20 md:py-28 bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-600 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">
              Adverteren op digitale schermen
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed max-w-2xl mx-auto">
              Bereik lokale klanten bij kappers, sportscholen en horeca in Limburg. 
              Jouw boodschap op het juiste moment, op de juiste plek.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-semibold py-6 px-8 shadow-xl"
              onClick={() => setModalOpen(true)}
              data-testid="button-cta-adverteren-hero"
            >
              <Megaphone className="h-5 w-5" />
              Start met adverteren
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Wat is Elevizion?
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            Elevizion plaatst digitale reclameschermen bij lokale ondernemers in Limburg. 
            Denk aan kapsalons, sportscholen, cafés en winkels. Jouw advertentie draait meerdere 
            keren per uur op een scherm waar mensen wachten en kijken.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Target className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Lokaal bereik</h3>
                <p className="text-sm text-slate-500">Bereik klanten in jouw regio die daadwerkelijk naar je zaak kunnen komen</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Eye className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Geen adblockers</h3>
                <p className="text-sm text-slate-500">Digitale schermen worden niet geblokkeerd, je advertentie wordt altijd gezien</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Herhaling = herkenning</h3>
                <p className="text-sm text-slate-500">Door regelmatige herhaling onthouden mensen jouw merk en boodschap</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Hoe werkt adverteren?
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-lg mx-auto">
            In drie eenvoudige stappen naar zichtbaarheid
          </p>
          
          <div className="grid md:grid-cols-3 gap-12 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
                <span className="text-2xl font-bold">1</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Aanmelden</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Vul het formulier in met je gegevens en wensen. Wij nemen binnen 24 uur contact op.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
                <span className="text-2xl font-bold">2</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Kies pakket & locaties</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Samen bepalen we welke schermlocaties passen bij jouw doelgroep en budget.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
                <span className="text-2xl font-bold">3</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-2 text-lg">Video aanleveren & Live!</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Je levert je video aan volgens onze specs. Wij plaatsen hem en je advertentie draait binnen 48 uur.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Aanleverspecificaties
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-lg mx-auto">
            Je levert je advertentievideo zelf aan. Wij plaatsen hem op de schermen.
          </p>
          
          <div className="max-w-2xl mx-auto">
            <Card className="border-2 border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-6 pb-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                    <FileVideo className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 mb-3">Video aanleveren</h3>
                    <ul className="space-y-2 text-sm text-slate-600">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <span>Formaat: MP4 (H.264)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <span>Resolutie: 1920x1080 (Full HD, liggend 16:9)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <span>Duur: 10-15 seconden</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <span>Zonder audio (schermen staan op mute)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <span>Bestandsnaam: [linkKey]_Bedrijfsnaam.mp4</span>
                      </li>
                    </ul>
                    <p className="text-sm text-slate-500 mt-4">
                      Na akkoord ontvang je een unieke linkKey (bijv. ADV-001). Gebruik deze in je bestandsnaam. Aanleveren via e-mail naar info@elevizion.nl.
                    </p>
                    <p className="text-sm text-amber-600 mt-3 font-medium">
                      Let op: geen ontwerp/maakservice inbegrepen. Je levert de video zelf aan.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Bekijk onze pakketten
          </h2>
          <p className="text-center text-slate-600 mb-8 max-w-lg mx-auto">
            Vanaf €30 per scherm / maand. Meer schermen = lagere prijs per scherm.
          </p>
          <div className="text-center">
            <Button asChild size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Link href="/prijzen">
                Bekijk prijzen per scherm
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Klaar om te starten?
            </h2>
            <p className="text-slate-300 mb-8">
              Vraag vrijblijvend informatie aan. Wij nemen binnen 24 uur contact op.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-600 font-semibold py-6 px-8"
              onClick={() => setModalOpen(true)}
              data-testid="button-cta-adverteren-bottom"
            >
              <Megaphone className="h-5 w-5" />
              Ik wil adverteren
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />
      <AdvertiserLeadModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
