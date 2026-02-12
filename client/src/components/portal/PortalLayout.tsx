import { useLocation } from "wouter";
import { useState } from "react";
import { LayoutDashboard, Monitor, Video, Receipt, User, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { path: "/portal", label: "Overzicht", icon: LayoutDashboard },
  { path: "/portal/screens", label: "Schermen", icon: Monitor },
  { path: "/portal/video", label: "Video", icon: Video },
  { path: "/portal/account", label: "Gegevens", icon: User },
  { path: "/portal/billing", label: "Facturatie", icon: Receipt },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    navigate("/portal/login");
  }

  function isActive(path: string) {
    if (path === "/portal") return location === "/portal";
    return location.startsWith(path);
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 bg-white border-r flex flex-col transition-transform md:translate-x-0 md:static ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-bold text-lg" data-testid="text-portal-brand">Elevizion</span>
          <button className="md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1" data-testid="nav-portal-sidebar">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              data-testid={`nav-${item.path.replace("/portal", "portal").replace(/\//g, "-") || "portal"}`}
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive(item.path)
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            data-testid="button-portal-logout"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="w-4 h-4" />
            Uitloggen
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-white border-b p-3 flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} data-testid="button-open-menu">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold">Elevizion</span>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-4xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
