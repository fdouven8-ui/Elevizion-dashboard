import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalVerifyEmail() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Geen verificatietoken gevonden.");
      return;
    }

    fetch(`/api/portal/verify-email?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setStatus("success");
          const desiredPlan = localStorage.getItem("portal_desired_plan");
          if (desiredPlan) {
            localStorage.removeItem("portal_desired_plan");
            fetch("/api/portal/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ planCode: desiredPlan }),
            }).then(() => {
              setTimeout(() => navigate("/portal"), 2000);
            });
          } else {
            setTimeout(() => navigate(data.redirect || "/portal"), 2000);
          }
        } else {
          setStatus("error");
          setMessage(data.message || "Verificatie mislukt.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Er ging iets mis. Probeer het opnieuw.");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
              <h2 className="text-xl font-bold" data-testid="text-verify-loading">E-mail verifiëren...</h2>
              <p className="text-muted-foreground">Even geduld, we controleren je verificatielink.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold" data-testid="text-verify-success">E-mail geverifieerd!</h2>
              <p className="text-muted-foreground">Je account is geactiveerd. Je wordt doorgestuurd naar het portaal...</p>
              <Button onClick={() => navigate("/portal")} data-testid="button-goto-portal">
                Naar portaal
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold" data-testid="text-verify-error">Verificatie mislukt</h2>
              <p className="text-muted-foreground">{message}</p>
              <div className="flex gap-3 justify-center pt-2">
                <Button variant="outline" onClick={() => navigate("/portal/login")} data-testid="button-goto-login">
                  Naar inloggen
                </Button>
                <Button variant="outline" onClick={() => navigate("/portal/signup")} data-testid="button-goto-signup">
                  Opnieuw registreren
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
