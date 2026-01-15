import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Logo from "@/components/Logo";

interface PublicCompanyProfile {
  legalName: string;
  tradeName: string;
  kvkNumber: string;
  vatNumber: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

export default function MarketingFooter() {
  const { data: company } = useQuery<PublicCompanyProfile>({
    queryKey: ["/api/public/company-profile"],
    queryFn: async () => {
      const res = await fetch("/api/public/company-profile");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
  });

  const currentYear = new Date().getFullYear();
  const tradeName = company?.tradeName || "Elevizion";
  const email = company?.email || "info@elevizion.nl";
  const kvkNumber = company?.kvkNumber;
  const vatNumber = company?.vatNumber;

  return (
    <footer className="bg-slate-900 text-slate-400 py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <Logo className="h-8 w-auto mb-4 brightness-0 invert opacity-80" alt={tradeName} />
            <p className="text-sm">
              Digital signage en narrowcasting in Limburg. 
              Lokale schermreclame bij kappers, sportscholen en horeca.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Voor adverteerders</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/adverteren" className="hover:text-emerald-400 transition-colors">
                  Adverteren
                </Link>
              </li>
              <li>
                <Link href="/prijzen" className="hover:text-emerald-400 transition-colors">
                  Prijzen
                </Link>
              </li>
              <li>
                <Link href="/werkwijze" className="hover:text-emerald-400 transition-colors">
                  Werkwijze
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Voor locaties</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/scherm-locatie" className="hover:text-emerald-400 transition-colors">
                  Scherm op locatie
                </Link>
              </li>
              <li>
                <Link href="/werkwijze" className="hover:text-emerald-400 transition-colors">
                  Hoe werkt het
                </Link>
              </li>
              <li>
                <Link href="/veelgestelde-vragen" className="hover:text-emerald-400 transition-colors">
                  Veelgestelde vragen
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href={`mailto:${email}`}
                  className="hover:text-emerald-400 transition-colors"
                >
                  {email}
                </a>
              </li>
              <li>
                <Link href="/contact" className="hover:text-emerald-400 transition-colors">
                  Contactformulier
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <p className="text-sm">
              &copy; {currentYear} {tradeName}. Alle rechten voorbehouden.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span>Limburg, Nederland</span>
            </div>
          </div>
          {(kvkNumber || vatNumber) && (
            <div className="text-center md:text-left text-xs text-slate-500">
              {kvkNumber && <span>KvK: {kvkNumber}</span>}
              {kvkNumber && vatNumber && <span className="mx-2">|</span>}
              {vatNumber && <span>BTW: {vatNumber}</span>}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
