import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MeData = {
  advertiser: {
    id: string;
    companyName: string;
    contactName: string;
    onboardingComplete: boolean;
    planId: string | null;
  };
  plan: { name: string; maxScreens: number; priceMonthlyCents: number } | null;
  placements: { total: number; selected: number; queued: number; live: number; paused: number };
};

const statusLabels: Record<string, string> = {
  selected: "Geselecteerd",
  queued: "In wachtrij",
  live: "Live",
  paused: "Gepauzeerd",
};

export default function PortalOverview() {
  const [, navigate] = useLocation();
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/me").then(r => r.json()).then(d => {
      if (!d.ok) { navigate("/portal/login"); return; }
      setMe(d);
      setLoading(false);
    }).catch(() => navigate("/portal/login"));
  }, []);

  if (loading || !me) {
    return <p className="text-muted-foreground">Laden...</p>;
  }

  const { advertiser, plan, placements } = me;
  const statusSummary = (["live", "queued", "selected", "paused"] as const)
    .filter(k => placements[k] > 0)
    .map(k => `${placements[k]} ${statusLabels[k]?.toLowerCase()}`)
    .join(", ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-overview-title">Overzicht</h1>
        <p className="text-muted-foreground">{advertiser.companyName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Plan</div>
            <div className="font-semibold text-lg" data-testid="text-plan-name">{plan?.name || "Geen plan"}</div>
            {plan && <div className="text-xs text-muted-foreground">Max {plan.maxScreens} scherm{plan.maxScreens > 1 ? "en" : ""}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Schermen</div>
            <div className="font-semibold text-lg" data-testid="text-screen-count">{placements.total}</div>
            {statusSummary && <div className="text-xs text-muted-foreground">{statusSummary}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="font-semibold text-lg" data-testid="text-onboarding-status">
              {advertiser.onboardingComplete ? "Actief" : "Onboarding"}
            </div>
          </CardContent>
        </Card>
      </div>

      {!advertiser.onboardingComplete && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <p className="text-sm text-blue-800 mb-3">Je onboarding is nog niet afgerond. Kies je plan en schermen om te beginnen.</p>
            <Button onClick={() => navigate("/portal/screens")} data-testid="button-finish-onboarding">
              Onboarding afronden
            </Button>
          </CardContent>
        </Card>
      )}

      {advertiser.onboardingComplete && (
        <Card>
          <CardContent className="pt-4 flex gap-3 flex-wrap">
            <Button onClick={() => navigate("/portal/video")} data-testid="button-goto-video">
              Upload nieuwe video
            </Button>
            <Button variant="outline" onClick={() => navigate("/portal/screens")} data-testid="button-goto-screens">
              Schermen beheren
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
