import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Video, AlertCircle } from "lucide-react";

export default function PortalVideo() {
  const [, navigate] = useLocation();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    fetch("/api/portal/me").then(r => r.json()).then(d => {
      if (!d.ok) { navigate("/portal/login"); return; }
      setOnboardingComplete(!!d.advertiser?.onboardingComplete);
      setLoading(false);
    }).catch(() => navigate("/portal/login"));
  }, []);

  async function handleUpload() {
    setOpening(true);
    try {
      const res = await fetch("/api/portal/upload/open", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      }
    } catch { }
    finally { setOpening(false); }
  }

  if (loading) return <p className="text-muted-foreground">Laden...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-video-title">Video</h1>
        <p className="text-muted-foreground">Upload je advertentievideo</p>
      </div>

      {!onboardingComplete ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800" data-testid="text-video-blocked">Kies eerst je plan en schermen</p>
              <p className="text-sm text-amber-700 mt-1">Je moet eerst de onboarding afronden voordat je een video kunt uploaden.</p>
              <Button variant="outline" className="mt-3" onClick={() => navigate("/portal/screens")} data-testid="button-goto-screens">
                Naar schermen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <Video className="w-12 h-12 text-blue-600 mx-auto" />
            <div>
              <p className="font-medium">Upload een nieuwe video</p>
              <p className="text-sm text-muted-foreground">Je wordt doorgestuurd naar het uploadportaal</p>
            </div>
            <Button onClick={handleUpload} disabled={opening} data-testid="button-upload-video" size="lg">
              {opening ? "Bezig..." : "Upload nieuwe video"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
