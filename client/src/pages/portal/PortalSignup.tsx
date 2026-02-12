import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Mail } from "lucide-react";

export default function PortalSignup() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const planFromUrl = params.get("plan");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (planFromUrl) {
      localStorage.setItem("portal_desired_plan", planFromUrl);
    }
  }, [planFromUrl]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, companyName: companyName || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Registratie mislukt");
        return;
      }
      setEmailSent(true);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold" data-testid="text-check-email">Check je e-mail</h2>
            <p className="text-muted-foreground">
              We hebben een verificatielink gestuurd naar <strong>{email}</strong>. 
              Klik op de link om je account te activeren.
            </p>
            <p className="text-sm text-muted-foreground">
              Geen e-mail ontvangen? Check je spam-map of{" "}
              <button 
                className="text-blue-600 underline" 
                data-testid="button-resend"
                onClick={async () => {
                  await fetch("/api/portal/resend-verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                  });
                }}
              >
                verstuur opnieuw
              </button>
            </p>
            <div className="pt-2">
              <a href="/portal/login" className="text-sm text-blue-600 underline" data-testid="link-login">
                Naar inloggen
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="text-signup-title">Account aanmaken</CardTitle>
          <p className="text-sm text-muted-foreground">Maak een account aan om te adverteren</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Bedrijfsnaam</label>
              <Input
                data-testid="input-company"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Je bedrijfsnaam"
              />
            </div>
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
                placeholder="Minimaal 6 tekens"
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-red-600 text-sm" data-testid="text-error">{error}</p>}
            <Button data-testid="button-signup" type="submit" className="w-full" disabled={loading}>
              {loading ? "Bezig..." : "Registreren"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Al een account?{" "}
            <a href="/portal/login" className="text-blue-600 underline" data-testid="link-login">
              Inloggen
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
