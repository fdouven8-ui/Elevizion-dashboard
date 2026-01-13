import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Megaphone, Monitor, FileCheck, Play, Building2, MapPin,
  ClipboardCheck, Wrench, CheckCircle, ArrowRight
} from "lucide-react";
import { Link } from "wouter";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

export default function Werkwijze() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-slate-800">
              Zo werkt het
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Of je nu wilt adverteren of een scherm wilt op je locatie, 
              wij maken het proces zo eenvoudig mogelijk.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                <Megaphone className="h-6 w-6" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-800">
                Voor adverteerders
              </h2>
            </div>

            <div className="space-y-6 mb-12">
              <Card className="border-2 border-slate-100 hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Aanmelden</h3>
                      <p className="text-slate-600">
                        Vul het contactformulier in met je bedrijfsgegevens en wensen. 
                        Wij nemen binnen 24 uur contact op om je situatie te bespreken.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-100 hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Pakket kiezen</h3>
                      <p className="text-slate-600">
                        Samen bepalen we welk pakket past bij je doelen en budget. 
                        We adviseren welke schermlocaties het beste aansluiten bij jouw doelgroep.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-100 hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 font-bold">
                      3
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Akkoord geven</h3>
                      <p className="text-slate-600">
                        Je ontvangt een duidelijke offerte. Na akkoord starten we direct met 
                        het maken van je advertentievideo. Je krijgt een preview ter goedkeuring.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-100 hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 font-bold">
                      4
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Content aanleveren</h3>
                      <p className="text-slate-600">
                        Stuur je logo, boodschap en eventuele beelden. Heb je zelf al een video? 
                        Prima! Anders maken wij een professioneel ontwerp voor je.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                      <Play className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Live!</h3>
                      <p className="text-slate-600">
                        Je advertentie draait op de gekozen schermen. Je krijgt toegang tot 
                        rapportages en kunt altijd je content laten aanpassen.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="text-center mb-16">
              <Button asChild size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <Link href="/adverteren">
                  Meer over adverteren
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center">
                <Building2 className="h-6 w-6" />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-800">
                Voor schermlocaties
              </h2>
            </div>

            <div className="space-y-6 mb-12">
              <Card className="border-2 border-slate-200 bg-white hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Intake</h3>
                      <p className="text-slate-600">
                        Je vult een kort formulier in met gegevens over je locatie: 
                        type zaak, aantal bezoekers per week, beschikbare plek voor het scherm.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-200 bg-white hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Beoordeling</h3>
                      <p className="text-slate-600">
                        Wij bekijken of je locatie geschikt is qua bezoekers en zichtbaarheid. 
                        Meestal hoor je binnen 2-3 werkdagen of we verder kunnen.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-200 bg-white hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 font-bold">
                      3
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Akkoord</h3>
                      <p className="text-slate-600">
                        Je ontvangt een eenvoudige overeenkomst met daarin de afspraken over 
                        het scherm, de vergoeding en de samenwerking. Digitaal ondertekenen kan direct.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-200 bg-white hover:border-emerald-200 transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0 font-bold">
                      4
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Installatie</h3>
                      <p className="text-slate-600">
                        Wij plannen een installatieafspraak. Het scherm wordt professioneel 
                        gemonteerd en aangesloten. Duurt meestal 30-60 minuten.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">Actief!</h3>
                      <p className="text-slate-600">
                        Het scherm draait automatisch met advertenties. Je ontvangt maandelijks 
                        een vergoeding. Bij problemen staan we direct klaar.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="text-center">
              <Button asChild size="lg" variant="outline" className="gap-2 border-2 border-slate-700 text-slate-700 hover:bg-slate-700 hover:text-white">
                <Link href="/scherm-locatie">
                  Meer over schermlocaties
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Nog vragen?
            </h2>
            <p className="text-slate-300 mb-8">
              Bekijk onze veelgestelde vragen of neem direct contact op.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2 bg-emerald-500 hover:bg-emerald-600 font-semibold py-6 px-8"
                asChild
              >
                <Link href="/veelgestelde-vragen">
                  Bekijk FAQ
                </Link>
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="gap-2 border-white/30 text-white hover:bg-white/10 font-semibold py-6 px-8"
                asChild
              >
                <Link href="/contact">
                  Contact opnemen
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
