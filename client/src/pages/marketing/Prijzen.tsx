import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Monitor, Check, Megaphone, MessageSquare, Info
} from "lucide-react";
import { Link } from "wouter";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { PRICING_PACKAGES, PRICING_CONSTANTS, type PricingPackage } from "@/lib/pricing";

function getPackageStartParam(pkgId: string): string {
  const mapping: Record<string, string> = {
    starter: "single",
    "local-plus": "triple",
    premium: "ten",
  };
  return mapping[pkgId] || "single";
}

function PricingCard({ pkg }: { pkg: PricingPackage }) {
  const isPopular = pkg.isPopular;
  const isCustom = pkg.isCustom;

  return (
    <Card className={`border-2 transition-all ${
      isPopular 
        ? "border-emerald-600 bg-gradient-to-b from-emerald-50 to-white shadow-xl relative" 
        : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-lg"
    }`}>
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-sm font-bold px-5 py-1.5 rounded-full shadow-lg">
          {pkg.badge}
        </div>
      )}
      <CardHeader className={`text-center pb-2 ${isPopular ? "pt-8" : "pt-6"}`}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
          isPopular 
            ? "bg-emerald-600 text-white" 
            : isCustom 
              ? "bg-slate-200 text-slate-600"
              : "bg-emerald-100 text-emerald-600"
        }`}>
          {isCustom ? <MessageSquare className="h-6 w-6" /> : <Monitor className="h-6 w-6" />}
        </div>
        <CardTitle className="text-xl font-bold text-slate-800">{pkg.name}</CardTitle>
        <p className={`text-sm mt-1 ${isPopular ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
          {isCustom ? "Op maat" : `${pkg.screens} scherm${pkg.screens > 1 ? "en" : ""}`}
        </p>
      </CardHeader>
      <CardContent className="text-center">
        <div className="mb-4">
          {isCustom ? (
            <span className="text-2xl font-bold text-slate-800">Op aanvraag</span>
          ) : (
            <>
              <div className="mb-1">
                <span className="text-3xl font-bold text-slate-800">€{pkg.perScreenPrice.toFixed(2).replace('.', ',')}</span>
                <span className="text-slate-500 text-sm"> per scherm / maand</span>
              </div>
              {pkg.screens > 1 && (
                <p className="text-xs text-slate-400">
                  Totaal €{pkg.totalPrice.toFixed(2).replace('.', ',')} p/m · {pkg.screens} schermen
                </p>
              )}
            </>
          )}
        </div>
        <ul className="space-y-2.5 text-sm text-slate-700 mb-6 text-left">
          {pkg.features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span className={index === 0 && isPopular ? "font-medium" : ""}>{feature}</span>
            </li>
          ))}
        </ul>
        {isCustom ? (
          <Button 
            variant="outline"
            className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white font-semibold"
            asChild
            data-testid="button-pricing-custom"
          >
            <Link href="/contact">
              {pkg.ctaText}
            </Link>
          </Button>
        ) : (
          <Button 
            className={`w-full bg-emerald-600 hover:bg-emerald-700 font-semibold ${isPopular ? "text-base py-5" : ""}`}
            asChild
            data-testid={`button-pricing-${pkg.screens}`}
          >
            <Link href={`/start?package=${getPackageStartParam(pkg.id)}`}>
              {pkg.ctaText}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Prijzen() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingHeader />

      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-slate-800">
              Duidelijke prijzen per scherm
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-4">
              Meer schermen = lagere prijs per scherm. 
              Alle prijzen zijn exclusief BTW.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Info className="h-4 w-4" />
              <span>{PRICING_CONSTANTS.minTermText}, {PRICING_CONSTANTS.afterTermText}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {PRICING_PACKAGES.map((pkg) => (
              <PricingCard 
                key={pkg.id} 
                pkg={pkg}
              />
            ))}
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
              <p className="text-sm text-slate-600">{PRICING_CONSTANTS.minTermText}, {PRICING_CONSTANTS.afterTermText}</p>
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
                asChild
              >
                <Link href="/start?package=triple">
                  <Megaphone className="h-5 w-5" />
                  Start vanaf €30 per scherm
                </Link>
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
    </div>
  );
}
