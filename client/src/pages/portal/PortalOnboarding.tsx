import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Plan = { id: string; code: string; name: string; maxScreens: number };
type Screen = { id: string; screenId: string; name: string; city: string | null };

export default function PortalOnboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"plan" | "screens">("plan");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [screens, setScreens] = useState<Screen[]>([]);
  const [selectedScreens, setSelectedScreens] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/portal/plans").then(r => r.json()).then(d => d.ok && setPlans(d.plans));
    fetch("/api/portal/cities").then(r => r.json()).then(d => d.ok && setCities(d.cities));
    fetch("/api/portal/me").then(r => r.json()).then(d => {
      if (!d.ok) { navigate("/portal/login"); return; }
      if (d.advertiser?.companyName) setCompanyName(d.advertiser.companyName);
      if (d.advertiser?.contactName) setContactName(d.advertiser.contactName);
      if (d.advertiser?.onboardingComplete) navigate("/portal/status");
    });
  }, []);

  useEffect(() => {
    if (selectedCity) {
      fetch(`/api/portal/screens?city=${encodeURIComponent(selectedCity)}`)
        .then(r => r.json())
        .then(d => d.ok && setScreens(d.screens));
    } else {
      fetch("/api/portal/screens").then(r => r.json()).then(d => d.ok && setScreens(d.screens));
    }
  }, [selectedCity]);

  function toggleScreen(id: string) {
    const next = new Set(selectedScreens);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedScreens(next);
  }

  async function handlePlanSubmit() {
    if (!selectedPlan) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: selectedPlan.code,
          companyName: companyName || undefined,
          contactName: contactName || undefined,
          phone: phone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.message || "Fout"); return; }
      setStep("screens");
    } catch { setError("Fout bij opslaan"); }
    finally { setLoading(false); }
  }

  async function handleScreensSubmit() {
    if (selectedScreens.size === 0) { setError("Selecteer minstens 1 scherm"); return; }
    if (selectedPlan && selectedScreens.size > selectedPlan.maxScreens) {
      setError(`Je plan staat maximaal ${selectedPlan.maxScreens} schermen toe`);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenIds: Array.from(selectedScreens) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Fout");
        return;
      }
      navigate("/portal/status");
    } catch { setError("Fout bij opslaan"); }
    finally { setLoading(false); }
  }

  if (step === "plan") {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold" data-testid="text-onboarding-title">Onboarding</h1>
            <p className="text-muted-foreground">Stap 1: Kies je plan en vul je gegevens in</p>
          </div>

          <Card>
            <CardHeader><CardTitle>Gegevens</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium">Bedrijfsnaam</label>
                <Input data-testid="input-company" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Contactpersoon</label>
                <Input data-testid="input-contact" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Telefoonnummer</label>
                <Input data-testid="input-phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Kies je plan</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {plans.map(p => (
                  <button
                    key={p.id}
                    data-testid={`button-plan-${p.code}`}
                    onClick={() => setSelectedPlan(p)}
                    className={`p-4 border rounded-lg text-left transition ${
                      selectedPlan?.id === p.id ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600" : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-sm text-muted-foreground">Maximaal {p.maxScreens} scherm{p.maxScreens > 1 ? "en" : ""}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-red-600 text-sm" data-testid="text-error">{error}</p>}
          <Button data-testid="button-next" onClick={handlePlanSubmit} disabled={!selectedPlan || loading} className="w-full">
            {loading ? "Bezig..." : "Volgende: Schermen kiezen"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Schermen kiezen</h1>
          <p className="text-muted-foreground">
            Stap 2: Selecteer maximaal {selectedPlan?.maxScreens || "?"} scherm{(selectedPlan?.maxScreens || 0) > 1 ? "en" : ""}
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Filter op plaats</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCity("")}
                className={`px-3 py-1 rounded-full text-sm border ${!selectedCity ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"}`}
                data-testid="button-city-all"
              >
                Alle
              </button>
              {cities.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCity(c)}
                  className={`px-3 py-1 rounded-full text-sm border ${selectedCity === c ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"}`}
                  data-testid={`button-city-${c}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Beschikbare schermen ({screens.length})
              {selectedScreens.size > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {selectedScreens.size} geselecteerd
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {screens.length === 0 ? (
              <p className="text-muted-foreground text-sm">Geen schermen beschikbaar</p>
            ) : (
              <div className="grid gap-2">
                {screens.map(s => (
                  <button
                    key={s.id}
                    data-testid={`button-screen-${s.id}`}
                    onClick={() => toggleScreen(s.id)}
                    className={`p-3 border rounded-lg text-left transition ${
                      selectedScreens.has(s.id) ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.city || "Onbekend"} — {s.screenId}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-red-600 text-sm" data-testid="text-error">{error}</p>}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("plan")} className="flex-1">Terug</Button>
          <Button data-testid="button-save-screens" onClick={handleScreensSubmit} disabled={selectedScreens.size === 0 || loading} className="flex-1">
            {loading ? "Bezig..." : "Opslaan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
