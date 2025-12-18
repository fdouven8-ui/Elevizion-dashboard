import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Monitor, MapPin, Building2, TrendingUp, 
  CheckCircle, ArrowRight, Play, BarChart3,
  Shield, Clock, Users, Zap
} from "lucide-react";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/elevizion-logo.png" 
              alt="Elevizion" 
              className="h-10 w-auto"
              data-testid="logo"
            />
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#diensten" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Diensten</a>
            <a href="#voordelen" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Voordelen</a>
            <a href="#locaties" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Voor Locaties</a>
            <a href="#contact" className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="outline" className="border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300" data-testid="button-login">Inloggen</Button>
            </Link>
            <a href="#contact">
              <Button className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-200" data-testid="button-contact">Contact opnemen</Button>
            </a>
          </div>
        </div>
      </header>

      <section className="py-20 md:py-32 bg-gradient-to-br from-slate-50 via-white to-emerald-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-100/40 via-transparent to-transparent" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-gradient-to-br from-emerald-200/30 to-teal-200/30 rounded-full blur-3xl" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 px-4 py-1.5 text-sm shadow-lg">Digital Signage Reclame</Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="hero-title">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">Bereik jouw doelgroep op </span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600">de beste locaties</span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Elevizion beheert een netwerk van digitale reclameschermen op strategische locaties. 
              Maximale zichtbaarheid voor adverteerders, extra inkomsten voor locatiepartners.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="#contact">
                <Button size="lg" className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-xl shadow-emerald-200 px-8" data-testid="button-cta-adverteren">
                  Start met adverteren
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="#locaties">
                <Button size="lg" variant="outline" className="gap-2 border-2 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 px-8" data-testid="button-cta-partner">
                  Word locatiepartner
                  <MapPin className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />
        <div className="container mx-auto px-4 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="group">
              <p className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300" data-testid="stat-screens">50+</p>
              <p className="text-slate-400 mt-2 group-hover:text-slate-300 transition-colors">Actieve schermen</p>
            </div>
            <div className="group">
              <p className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400" data-testid="stat-locations">25+</p>
              <p className="text-slate-400 mt-2 group-hover:text-slate-300 transition-colors">Locaties</p>
            </div>
            <div className="group">
              <p className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400" data-testid="stat-views">500K+</p>
              <p className="text-slate-400 mt-2 group-hover:text-slate-300 transition-colors">Views per maand</p>
            </div>
            <div className="group">
              <p className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-blue-400" data-testid="stat-advertisers">30+</p>
              <p className="text-slate-400 mt-2 group-hover:text-slate-300 transition-colors">Adverteerders</p>
            </div>
          </div>
        </div>
      </section>

      <section id="diensten" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Wat wij doen</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Elevizion verbindt adverteerders met hoogwaardige digitale schermen op drukbezochte locaties
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 hover:border-emerald-200 transition-colors">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                  <Monitor className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Digital Signage Netwerk</h3>
                <p className="text-slate-600">
                  Professionele HD-schermen op strategisch gekozen locaties met hoge voetgangersstromen
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-2 hover:border-emerald-200 transition-colors">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-6">
                  <Play className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Content Management</h3>
                <p className="text-slate-600">
                  Volledig beheer van je advertenties inclusief planning, rotatie en rapportage
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-2 hover:border-emerald-200 transition-colors">
              <CardContent className="pt-8 pb-6 text-center">
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-6">
                  <BarChart3 className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Inzicht & Rapportage</h3>
                <p className="text-slate-600">
                  Real-time statistieken over bereik, afspeelmomenten en prestaties van je campagnes
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="voordelen" className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Waarom kiezen voor Elevizion?
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Geen lange contracten</h4>
                    <p className="text-slate-600">Flexibele maandelijkse abonnementen zonder jarenlange verplichtingen</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Snel online</h4>
                    <p className="text-slate-600">Je campagne draait binnen 24 uur na goedkeuring van je content</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Transparante prijzen</h4>
                    <p className="text-slate-600">Vaste maandprijs per scherm, geen verborgen kosten of verrassingen</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">24/7 monitoring</h4>
                    <p className="text-slate-600">Alle schermen worden continu gemonitord voor maximale uptime</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-8 text-white">
              <h3 className="text-2xl font-bold mb-6">Populaire pakketten</h3>
              <div className="space-y-4">
                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Starter</span>
                    <span className="text-emerald-200">vanaf €99/maand</span>
                  </div>
                  <p className="text-sm text-emerald-100">1 scherm, 10 sec per loop, 6x per uur</p>
                </div>
                <div className="bg-white/10 rounded-lg p-4 border-2 border-white/30">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Professional</span>
                    <Badge className="bg-white text-emerald-700">Populair</Badge>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span></span>
                    <span className="text-emerald-200">vanaf €249/maand</span>
                  </div>
                  <p className="text-sm text-emerald-100">3 schermen, 15 sec per loop, 10x per uur</p>
                </div>
                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Enterprise</span>
                    <span className="text-emerald-200">op maat</span>
                  </div>
                  <p className="text-sm text-emerald-100">Onbeperkt schermen, premium locaties</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="locaties" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="outline">Voor Locatiepartners</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Verdien extra met jouw locatie
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Heb je een winkel, horecazaak of ander pand met veel bezoekers? 
              Word locatiepartner en ontvang een deel van de reclame-inkomsten.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                  <Monitor className="h-6 w-6 text-blue-600" />
                </div>
                <h4 className="font-semibold mb-2">Gratis scherm</h4>
                <p className="text-sm text-slate-600">Wij plaatsen en onderhouden het scherm kosteloos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
                <h4 className="font-semibold mb-2">Passief inkomen</h4>
                <p className="text-sm text-slate-600">Ontvang maandelijks een percentage van de omzet</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
                <h4 className="font-semibold mb-2">Aantrekkelijker voor klanten</h4>
                <p className="text-sm text-slate-600">Moderne uitstraling trekt meer bezoekers aan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
                  <Building2 className="h-6 w-6 text-amber-600" />
                </div>
                <h4 className="font-semibold mb-2">Geen gedoe</h4>
                <p className="text-sm text-slate-600">Wij regelen alles, jij ontvangt alleen de uitbetaling</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="contact" className="py-20 bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Klaar om te starten?</h2>
            <p className="text-lg text-slate-300 mb-8">
              Neem contact met ons op voor een vrijblijvend gesprek over de mogelijkheden
            </p>
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="pt-6 text-center">
                  <h4 className="font-semibold text-white mb-2">Voor adverteerders</h4>
                  <p className="text-slate-400 mb-4">Wil je adverteren op ons netwerk?</p>
                  <a href="mailto:adverteren@elevizion.nl" className="text-emerald-400 hover:text-emerald-300 font-medium">
                    adverteren@elevizion.nl
                  </a>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="pt-6 text-center">
                  <h4 className="font-semibold text-white mb-2">Voor locaties</h4>
                  <p className="text-slate-400 mb-4">Interesse in een scherm op jouw locatie?</p>
                  <a href="mailto:locaties@elevizion.nl" className="text-emerald-400 hover:text-emerald-300 font-medium">
                    locaties@elevizion.nl
                  </a>
                </CardContent>
              </Card>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="mailto:info@elevizion.nl">
                <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  Stuur ons een bericht
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="tel:+31612345678">
                <Button size="lg" variant="outline" className="border-slate-600 text-white hover:bg-slate-800">
                  Bel ons: 06-12345678
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 bg-slate-950 text-slate-400">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <img 
                src="/elevizion-logo.png" 
                alt="Elevizion" 
                className="h-8 w-auto mb-4 brightness-0 invert opacity-80"
              />
              <p className="text-sm">
                Digital signage reclame op de beste locaties in Nederland
              </p>
            </div>
            <div>
              <h5 className="font-semibold text-white mb-4">Diensten</h5>
              <ul className="space-y-2 text-sm">
                <li><a href="#diensten" className="hover:text-white">Adverteren</a></li>
                <li><a href="#locaties" className="hover:text-white">Locatiepartner worden</a></li>
                <li><a href="#voordelen" className="hover:text-white">Pakketten</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold text-white mb-4">Bedrijf</h5>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Over ons</a></li>
                <li><a href="#contact" className="hover:text-white">Contact</a></li>
                <li><Link href="/dashboard" className="hover:text-white">Partner login</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold text-white mb-4">Contact</h5>
              <ul className="space-y-2 text-sm">
                <li>info@elevizion.nl</li>
                <li>06-12345678</li>
                <li>KvK: 12345678</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">&copy; {new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
            <div className="flex gap-6 text-sm">
              <a href="#" className="hover:text-white">Privacybeleid</a>
              <a href="#" className="hover:text-white">Algemene voorwaarden</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
