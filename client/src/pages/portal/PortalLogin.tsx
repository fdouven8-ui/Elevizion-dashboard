import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerify(false);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") {
          setNeedsVerify(true);
        } else {
          setError(data.message || "Inloggen mislukt");
        }
        return;
      }
      if (data.user?.onboardingComplete) {
        navigate("/portal");
      } else {
        navigate("/portal/screens");
      }
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    await fetch("/api/portal/resend-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setError("Verificatie-email opnieuw verstuurd. Check je inbox.");
    setNeedsVerify(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="text-portal-title">Klantportaal</CardTitle>
          <p className="text-sm text-muted-foreground">Log in om je advertenties te beheren</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium">E-mailadres</label>
              <Input
                data-testid="input-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jouw@email.nl"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Wachtwoord</label>
              <Input
                data-testid="input-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-red-600 text-sm" data-testid="text-error">{error}</p>}
            {needsVerify && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800" data-testid="text-needs-verify">
                  Je e-mailadres is nog niet geverifieerd. Check je inbox.
                </p>
                <button 
                  type="button" 
                  className="text-sm text-blue-600 underline mt-1" 
                  onClick={handleResend}
                  data-testid="button-resend-verify"
                >
                  Verstuur verificatie opnieuw
                </button>
              </div>
            )}
            <Button data-testid="button-login" type="submit" className="w-full" disabled={loading}>
              {loading ? "Bezig..." : "Inloggen"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Nog geen account?{" "}
            <a href="/portal/signup" className="text-blue-600 underline" data-testid="link-signup">
              Registreren
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
