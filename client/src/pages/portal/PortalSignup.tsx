import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalSignup() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      navigate("/portal/onboarding");
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
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
