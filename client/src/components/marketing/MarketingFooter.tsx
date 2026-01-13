import { Link } from "wouter";

export default function MarketingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <img 
              src="/elevizion-logo.png" 
              alt="Elevizion" 
              className="h-8 w-auto mb-4 brightness-0 invert opacity-80"
              loading="lazy"
            />
            <p className="text-sm">
              Digital signage en narrowcasting in Limburg. 
              Lokale schermreclame bij kappers, sportscholen en horeca.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Voor adverteerders</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/adverteren">
                  <a className="hover:text-emerald-400 transition-colors">Adverteren</a>
                </Link>
              </li>
              <li>
                <Link href="/prijzen">
                  <a className="hover:text-emerald-400 transition-colors">Prijzen</a>
                </Link>
              </li>
              <li>
                <Link href="/werkwijze">
                  <a className="hover:text-emerald-400 transition-colors">Werkwijze</a>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Voor locaties</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/scherm-locatie">
                  <a className="hover:text-emerald-400 transition-colors">Scherm op locatie</a>
                </Link>
              </li>
              <li>
                <Link href="/werkwijze">
                  <a className="hover:text-emerald-400 transition-colors">Hoe werkt het</a>
                </Link>
              </li>
              <li>
                <Link href="/veelgestelde-vragen">
                  <a className="hover:text-emerald-400 transition-colors">Veelgestelde vragen</a>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href="mailto:info@elevizion.nl" 
                  className="hover:text-emerald-400 transition-colors"
                >
                  info@elevizion.nl
                </a>
              </li>
              <li>
                <Link href="/contact">
                  <a className="hover:text-emerald-400 transition-colors">Contactformulier</a>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm">
            &copy; {new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.
          </p>
          <div className="flex items-center gap-4 text-sm">
            <span>Limburg, Nederland</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
