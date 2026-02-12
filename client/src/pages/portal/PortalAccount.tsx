import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

type UserData = {
  id: string;
  email: string;
  emailVerified: boolean;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  kvk: string | null;
  vat: string | null;
  address: string | null;
};

export default function PortalAccount() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [kvk, setKvk] = useState("");
  const [vat, setVat] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");

  useEffect(() => {
    fetch("/api/portal/me").then(r => r.json()).then(d => {
      if (!d.ok) { navigate("/portal/login"); return; }
      setUser(d.user);
      setCompanyName(d.user.companyName || "");
      setContactName(d.user.contactName || "");
      setPhone(d.user.phone || "");
      setKvk(d.user.kvk || "");
      setVat(d.user.vat || "");
      setAddress(d.user.address || "");
      setLoading(false);
    }).catch(() => navigate("/portal/login"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/portal/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, contactName, phone, kvk, vat, address }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.message || "Fout bij opslaan"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Fout bij opslaan"); }
    finally { setSaving(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage("");
    setPwSaving(true);
    try {
      const res = await fetch("/api/portal/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setPwMessage(data.message || "Fout"); return; }
      setPwMessage("Wachtwoord gewijzigd!");
      setCurrentPassword("");
      setNewPassword("");
    } catch { setPwMessage("Fout bij wijzigen"); }
    finally { setPwSaving(false); }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMessage("");
    setEmailSaving(true);
    try {
      const res = await fetch("/api/portal/change-email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setEmailMessage(data.message || "Fout"); return; }
      setEmailMessage("Verificatie-email verstuurd naar " + newEmail);
      setNewEmail("");
    } catch { setEmailMessage("Fout bij wijzigen"); }
    finally { setEmailSaving(false); }
  }

  if (loading || !user) return <p className="text-muted-foreground">Laden...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-account-title">Gegevens</h1>
        <p className="text-muted-foreground">Beheer je bedrijfsgegevens en account</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Bedrijfsgegevens</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Bedrijfsnaam *</label>
                <Input data-testid="input-company" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Contactpersoon *</label>
                <Input data-testid="input-contact" value={contactName} onChange={e => setContactName(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">Telefoonnummer *</label>
                <Input data-testid="input-phone" value={phone} onChange={e => setPhone(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">KvK-nummer *</label>
                <Input data-testid="input-kvk" value={kvk} onChange={e => setKvk(e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium">BTW-nummer</label>
                <Input data-testid="input-vat" value={vat} onChange={e => setVat(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Adres</label>
                <Input data-testid="input-address" value={address} onChange={e => setAddress(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-red-600 text-sm" data-testid="text-error">{error}</p>}
            {saved && (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" /> Opgeslagen
              </div>
            )}
            <Button data-testid="button-save-profile" type="submit" disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>E-mailadres</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Huidig e-mailadres: <strong data-testid="text-current-email">{user.email}</strong>
            {user.emailVerified && <span className="text-green-600 ml-2">(geverifieerd)</span>}
          </p>
          <form onSubmit={handleChangeEmail} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">Nieuw e-mailadres</label>
              <Input data-testid="input-new-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="nieuw@email.nl" required />
            </div>
            <Button data-testid="button-change-email" type="submit" variant="outline" disabled={emailSaving}>
              {emailSaving ? "Bezig..." : "Wijzigen"}
            </Button>
          </form>
          {emailMessage && <p className="text-sm mt-2 text-muted-foreground" data-testid="text-email-message">{emailMessage}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Wachtwoord wijzigen</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-sm font-medium">Huidig wachtwoord</label>
              <Input data-testid="input-current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">Nieuw wachtwoord</label>
              <Input data-testid="input-new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} placeholder="Minimaal 6 tekens" />
            </div>
            {pwMessage && <p className="text-sm text-muted-foreground" data-testid="text-pw-message">{pwMessage}</p>}
            <Button data-testid="button-change-password" type="submit" variant="outline" disabled={pwSaving}>
              {pwSaving ? "Bezig..." : "Wachtwoord wijzigen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
