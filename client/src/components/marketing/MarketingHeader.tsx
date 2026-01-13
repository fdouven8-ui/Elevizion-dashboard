import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "Adverteren", href: "/adverteren" },
  { label: "Scherm op locatie", href: "/scherm-locatie" },
  { label: "Prijzen", href: "/prijzen" },
  { label: "Werkwijze", href: "/werkwijze" },
  { label: "FAQ", href: "/veelgestelde-vragen" },
  { label: "Contact", href: "/contact" },
];

export default function MarketingHeader() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="border-b border-slate-100 bg-white/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img 
            src="/elevizion-logo.png" 
            alt="Elevizion - Digital Signage" 
            className="h-9 w-auto"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const textEl = e.currentTarget.nextElementSibling as HTMLElement;
              if (textEl) textEl.style.display = 'block';
            }}
          />
          <span className="text-xl font-bold text-slate-900 hidden">Elevizion</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <Button 
              key={item.href}
              variant="ghost" 
              size="sm" 
              className={`transition-colors ${
                location === item.href 
                  ? "text-emerald-600 bg-emerald-50" 
                  : "text-slate-500 hover:text-slate-900"
              }`}
              asChild
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-100 bg-white">
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <Button 
                key={item.href}
                variant="ghost" 
                className={`justify-start ${
                  location === item.href 
                    ? "text-emerald-600 bg-emerald-50" 
                    : "text-slate-600"
                }`}
                asChild
                onClick={() => setMobileMenuOpen(false)}
              >
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
