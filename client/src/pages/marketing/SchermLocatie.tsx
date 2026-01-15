import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  MapPin, Check, Building2, Monitor, Zap, Wallet,
  Users, Wrench, Shield
} from "lucide-react";
import { ScreenLeadModal } from "@/components/LeadModals";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import Logo from "@/components/Logo";

export default function SchermLocatie() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section 
        className="relative py-24 md:py-32 text-white overflow-hidden"
        style={{
          backgroundImage: "url('/hero-winkel.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="mb-10">
              <Logo className="h-16 md:h-20 w-auto mx-auto drop-shadow-lg brightness-0 invert" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight text-white drop-shadow-md">
              Digitaal scherm op jouw locatie
            </h1>
            <p className="text-lg md:text-xl text-white/85 mb-10 leading-relaxed max-w-2xl mx-auto">
              Bied je klanten een moderne ervaring en verdien mee aan lokale advertenties. 
              Wij regelen het scherm, de content en het onderhoud.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-6 px-10 shadow-xl hover:shadow-2xl transition-all w-full sm:w-auto text-base md:text-lg"
              onClick={() => setModalOpen(true)}
              data-testid="button-cta-scherm-hero"
            >
              <MapPin className="h-5 w-5" />
              Ik wil een scherm op mijn locatie
            </Button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Wat krijg je als locatie?
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            Wij zorgen voor alles. Jij geniet van een modern scherm en een maandelijkse vergoeding.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Monitor className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Professioneel scherm</h3>
                <p className="text-sm text-slate-500">Hoogwaardig digitaal scherm, inclusief montage en bedrading</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Automatische content</h3>
                <p className="text-sm text-slate-500">Wij beheren alle content en advertenties op afstand</p>
              </CardContent>
            </Card>
            <Card className="border-2 border-slate-100 hover:border-emerald-300 transition-all">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Wallet className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-base text-slate-800 mb-2">Maandelijkse vergoeding</h3>
                <p className="text-sm text-slate-500">Ontvang een deel van de advertentie-inkomsten</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Wat verwachten we van jou?
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-lg mx-auto">
            Eenvoudige voorwaarden voor een succesvolle samenwerking
          </p>
          
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-start gap-4 bg-white p-5 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Zap className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Stroomaansluiting</h3>
                <p className="text-sm text-slate-600">Een stopcontact in de buurt van de schermlocatie (ca. €2-3/maand stroomkosten)</p>
              </div>
            </div>
            <div className="flex items-start gap-4 bg-white p-5 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Geschikte plek</h3>
                <p className="text-sm text-slate-600">Een muur of standplaats waar klanten het scherm goed kunnen zien</p>
              </div>
            </div>
            <div className="flex items-start gap-4 bg-white p-5 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Voldoende bezoekers</h3>
                <p className="text-sm text-slate-600">Minimaal 100-150 bezoekers per week voor effectieve advertenties</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-slate-800 mb-4">
            Voordelen voor jou
          </h2>
          <p className="text-center text-slate-600 mb-12 max-w-lg mx-auto">
            Waarom ondernemers kiezen voor een Elevizion scherm
          </p>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Gratis scherm & installatie</h3>
                <p className="text-sm text-slate-600">Bij voldoende bezoekers is het scherm en de installatie vaak kosteloos</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Passief inkomen</h3>
                <p className="text-sm text-slate-600">Ontvang maandelijks een vergoeding zonder extra werk</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Moderne uitstraling</h3>
                <p className="text-sm text-slate-600">Een digitaal scherm geeft je zaak een professionele, moderne look</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1">Eigen content mogelijk</h3>
                <p className="text-sm text-slate-600">Toon je eigen promoties of berichten tussen de advertenties door</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-bold mb-6 text-white">
              Interesse in een scherm?
            </h2>
            <p className="text-white/80 text-lg mb-10 leading-relaxed">
              Laat je gegevens achter en wij nemen vrijblijvend contact op om de mogelijkheden te bespreken.
            </p>
            <Button 
              size="lg" 
              className="gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-6 px-10 shadow-xl hover:shadow-2xl transition-all w-full sm:w-auto text-base md:text-lg"
              onClick={() => setModalOpen(true)}
              data-testid="button-cta-scherm-bottom"
            >
              <Building2 className="h-5 w-5" />
              Aanmelden als locatie
            </Button>
          </div>
        </div>
      </section>

      <MarketingFooter />
      <ScreenLeadModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
