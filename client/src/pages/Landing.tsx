import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Monitor, MapPin, Calendar, ArrowRight, Mail
} from "lucide-react";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/elevizion-logo.png" 
              alt="Elevizion" 
              className="h-10 w-auto"
              data-testid="logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const textEl = e.currentTarget.nextElementSibling as HTMLElement;
                if (textEl) textEl.style.display = 'block';
              }}
            />
            <span className="text-2xl font-bold text-slate-900 hidden" data-testid="logo-text">Elevizion</span>
          </div>
          <Link href="/login">
            <Button variant="outline" data-testid="button-login">Inloggen</Button>
          </Link>
        </div>
      </header>

      <section className="py-20 md:py-32 bg-gradient-to-br from-slate-50 to-emerald-50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-4" data-testid="hero-title">
              Elevizion
            </h1>
            <p className="text-xl md:text-2xl text-slate-600 mb-10">
              Schermreclame in lokale zaken.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="mailto:info@elevizion.nl?subject=Adverteren%20via%20Elevizion">
                <Button size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 px-8 w-full sm:w-auto" data-testid="button-cta-adverteren">
                  <Mail className="h-4 w-4" />
                  Adverteren
                </Button>
              </a>
              <a href="mailto:info@elevizion.nl?subject=Scherm%20beschikbaar%20stellen">
                <Button size="lg" variant="outline" className="gap-2 border-2 border-emerald-200 hover:bg-emerald-50 px-8 w-full sm:w-auto" data-testid="button-cta-partner">
                  <MapPin className="h-4 w-4" />
                  Scherm beschikbaar stellen
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="text-center border-0 shadow-none">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <Monitor className="h-6 w-6 text-emerald-600" />
                </div>
                <p className="text-slate-600">
                  Wij plaatsen schermen in drukbezochte lokale zaken
                </p>
              </CardContent>
            </Card>
            
            <Card className="text-center border-0 shadow-none">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-slate-600">
                  Lokale bedrijven adverteren per week of maand
                </p>
              </CardContent>
            </Card>
            
            <Card className="text-center border-0 shadow-none">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                  <ArrowRight className="h-6 w-6 text-purple-600" />
                </div>
                <p className="text-slate-600">
                  Wij regelen planning, plaatsing en rapportage
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-12">Zo werkt het</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Neem contact op</h3>
              <p className="text-sm text-slate-600">Stuur een mail naar info@elevizion.nl</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">Wij maken je advertentie</h3>
              <p className="text-sm text-slate-600">Stuur je video, logo en teksten</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-4 font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Je advertentie draait</h3>
              <p className="text-sm text-slate-600">Op schermen in jouw regio</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-8 bg-slate-900 text-slate-400">
        <div className="container mx-auto px-4 text-center">
          <a href="mailto:info@elevizion.nl" className="text-emerald-400 hover:text-emerald-300 font-medium">
            info@elevizion.nl
          </a>
          <p className="mt-4 text-sm">&copy; {new Date().getFullYear()} Elevizion</p>
        </div>
      </footer>
    </div>
  );
}
