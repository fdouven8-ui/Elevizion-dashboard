import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlacementItem = {
  id: string;
  screenId: string;
  status: string;
  screenName: string;
  screenCity: string | null;
  liveAt: string | null;
  lastReason: string | null;
};

type MeData = {
  advertiser: {
    id: string;
    companyName: string;
    onboardingComplete: boolean;
    planId: string | null;
    assetStatus: string | null;
  };
  plan: { name: string; maxScreens: number } | null;
  placements: { total: number; selected: number; queued: number; live: number; paused: number };
};

const statusLabels: Record<string, string> = {
  selected: "Geselecteerd",
  queued: "In wachtrij",
  live: "Live",
  paused: "Gepauzeerd",
};

const statusColors: Record<string, string> = {
  selected: "bg-yellow-100 text-yellow-800",
  queued: "bg-orange-100 text-orange-800",
  live: "bg-green-100 text-green-800",
  paused: "bg-gray-100 text-gray-800",
};

export default function PortalStatus() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<MeData | null>(null);
  const [placements, setPlacements] = useState<PlacementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then(r => r.json()),
      fetch("/api/portal/placements").then(r => r.json()),
    ]).then(([meData, placData]) => {
      if (!meData.ok) { navigate("/portal/login"); return; }
      setMe(meData);
      if (placData.ok) setPlacements(placData.placements);
      setLoading(false);
    });
  }, []);

  async function handleUpload() {
    try {
      const res = await fetch("/api/portal/upload/open", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      }
    } catch { }
  }

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    navigate("/portal/login");
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Laden...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-status-title">Mijn advertenties</h1>
            <p className="text-muted-foreground">{me?.advertiser.companyName}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">Uitloggen</Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Plan</div>
              <div className="font-semibold" data-testid="text-plan">{me?.plan?.name || "Geen plan"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Schermen</div>
              <div className="font-semibold" data-testid="text-screen-count">
                {me?.placements.live || 0} live / {me?.placements.total || 0} totaal
              </div>
            </CardContent>
          </Card>
        </div>

        {me?.advertiser.onboardingComplete && (
          <Card>
            <CardContent className="pt-4 flex gap-3">
              <Button onClick={handleUpload} data-testid="button-upload" className="flex-1">
                Video uploaden
              </Button>
              <Button variant="outline" onClick={() => navigate("/portal/onboarding")} data-testid="button-edit-screens">
                Schermen wijzigen
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Plaatsingen</CardTitle></CardHeader>
          <CardContent>
            {placements.length === 0 ? (
              <p className="text-muted-foreground text-sm">Geen plaatsingen</p>
            ) : (
              <div className="space-y-2">
                {placements.map(p => (
                  <div key={p.id} className="p-3 border rounded-lg flex justify-between items-center" data-testid={`placement-${p.id}`}>
                    <div>
                      <div className="font-medium">{p.screenName}</div>
                      <div className="text-xs text-muted-foreground">{p.screenCity || "Onbekend"}</div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[p.status] || "bg-gray-100"}`}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
