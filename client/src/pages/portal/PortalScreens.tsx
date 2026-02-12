import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

type Plan = { id: string; code: string; name: string; maxScreens: number; priceMonthlyCents: number; minCommitMonths: number };
type Screen = { id: string; screenId: string; name: string; city: string | null };

function formatPrice(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function PortalScreens() {
  const [, navigate] = useLocation();
  const [userPlanCode, setUserPlanCode] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [screens, setScreens] = useState<Screen[]>([]);
  const [selectedScreens, setSelectedScreens] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then(r => r.json()),
      fetch("/api/portal/plans").then(r => r.json()),
      fetch("/api/portal/cities").then(r => r.json()),
    ]).then(([meData, plansData, citiesData]) => {
      if (!meData.ok) { navigate("/portal/login"); return; }
      setUserPlanCode(meData.user.planCode);
      setCurrentPlan(meData.plan);
      if (plansData.ok) setAllPlans(plansData.plans);
      if (citiesData.ok) setCities(citiesData.cities);
      if (meData.user.planCode) setSelectedPlanCode(meData.user.planCode);
      if (meData.selectedScreenIds?.length > 0) {
        setSelectedScreens(new Set(meData.selectedScreenIds));
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const url = selectedCity
      ? `/api/portal/screens?city=${encodeURIComponent(selectedCity)}`
      : "/api/portal/screens";
    fetch(url).then(r => r.json()).then(d => d.ok && setScreens(d.screens));
  }, [selectedCity]);

  const activePlan = allPlans.find(p => p.code === selectedPlanCode) || currentPlan;
  const maxScreens = activePlan?.maxScreens ?? 0;
  const needsPlan = !userPlanCode && !selectedPlanCode;

  function toggleScreen(id: string) {
    const next = new Set(selectedScreens);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= maxScreens) {
        setError(`Je plan staat maximaal ${maxScreens} scherm${maxScreens > 1 ? "en" : ""} toe.`);
        return;
      }
      next.add(id);
    }
    setError("");
    setSelectedScreens(next);
  }

  async function handleSave() {
    if (selectedScreens.size === 0) { setError("Selecteer minstens 1 scherm."); return; }
    setError("");
    setSaving(true);
    try {
      if (!userPlanCode && selectedPlanCode) {
        const res = await fetch("/api/portal/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planCode: selectedPlanCode }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { setError(data.message || "Fout bij plan opslaan"); setSaving(false); return; }
      }

      const res = await fetch("/api/portal/screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenIds: Array.from(selectedScreens) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.message || "Fout bij opslaan"); setSaving(false); return; }
      navigate("/portal");
    } catch { setError("Fout bij opslaan"); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="text-muted-foreground">Laden...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-screens-title">Schermen</h1>
        <p className="text-muted-foreground">Kies je plan en selecteer schermen</p>
      </div>

      {(!userPlanCode || needsPlan) && (
        <Card>
          <CardHeader><CardTitle>Kies je plan</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {allPlans.map(p => (
                <button
                  key={p.id}
                  data-testid={`button-plan-${p.code}`}
                  onClick={() => { setSelectedPlanCode(p.code); setError(""); }}
                  className={`p-4 border rounded-lg text-left transition relative ${
                    selectedPlanCode === p.code
                      ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {selectedPlanCode === p.code && (
                    <Check className="w-4 h-4 text-blue-600 absolute top-3 right-3" />
                  )}
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{p.maxScreens} scherm{p.maxScreens > 1 ? "en" : ""}</div>
                  <div className="font-semibold text-blue-700 mt-1">{formatPrice(p.priceMonthlyCents)}/mnd</div>
                  <div className="text-xs text-muted-foreground">Min. {p.minCommitMonths} maanden</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {userPlanCode && activePlan && (
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Huidig plan</div>
            <div className="font-semibold">{activePlan.name} — {formatPrice(activePlan.priceMonthlyCents)}/mnd</div>
            <div className="text-xs text-muted-foreground">Max {activePlan.maxScreens} scherm{activePlan.maxScreens > 1 ? "en" : ""}</div>
          </CardContent>
        </Card>
      )}

      {(selectedPlanCode || userPlanCode) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Beschikbare schermen</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {selectedScreens.size}/{maxScreens} geselecteerd
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cities.length > 0 && (
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
              )}
              {screens.length === 0 ? (
                <p className="text-muted-foreground text-sm">Geen schermen beschikbaar</p>
              ) : (
                <div className="grid gap-2">
                  {screens.map(s => (
                    <button
                      key={s.id}
                      data-testid={`button-screen-${s.id}`}
                      onClick={() => toggleScreen(s.id)}
                      className={`p-3 border rounded-lg text-left transition flex items-center justify-between ${
                        selectedScreens.has(s.id) ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.city || "Onbekend"}</div>
                      </div>
                      {selectedScreens.has(s.id) && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {error && <p className="text-red-600 text-sm" data-testid="text-error">{error}</p>}
          <Button
            data-testid="button-save-screens"
            onClick={handleSave}
            disabled={selectedScreens.size === 0 || saving || (!selectedPlanCode && !userPlanCode)}
            className="w-full"
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </>
      )}
    </div>
  );
}
