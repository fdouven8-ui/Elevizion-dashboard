import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle, Megaphone, MapPin } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

const LIMBURG_CITIES = [
  "Sittard-Geleen",
  "Maastricht",
  "Heerlen",
  "Roermond",
  "Venlo",
  "Weert",
  "Kerkrade",
  "Landgraaf",
  "Brunssum",
  "Stein",
  "Beek",
  "Valkenburg",
  "Meerssen",
  "Anders",
];

interface AdvertiserLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdvertiserLeadModal({ open, onOpenChange }: AdvertiserLeadModalProps) {
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    goal: "",
    region: "",
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    budgetIndication: "",
    remarks: "",
    honeypot: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/leads/advertiser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Er ging iets mis");
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
        setFormData({
          goal: "",
          region: "",
          companyName: "",
          contactName: "",
          phone: "",
          email: "",
          budgetIndication: "",
          remarks: "",
          honeypot: "",
        });
      }, 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl mb-2">Bedankt!</DialogTitle>
            <DialogDescription>
              We hebben je aanvraag ontvangen en nemen zo snel mogelijk contact met je op.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Megaphone className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <DialogTitle>Ik wil adverteren</DialogTitle>
              <DialogDescription>
                Vul je gegevens in en we nemen contact op.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <input
            type="text"
            name="honeypot"
            value={formData.honeypot}
            onChange={(e) => setFormData({ ...formData, honeypot: e.target.value })}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          <div className="space-y-2">
            <Label htmlFor="goal">Wat is je doel? *</Label>
            <Select
              value={formData.goal}
              onValueChange={(value) => setFormData({ ...formData, goal: value })}
              required
            >
              <SelectTrigger id="goal" data-testid="select-goal">
                <SelectValue placeholder="Kies je doel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Meer klanten">Meer klanten</SelectItem>
                <SelectItem value="Naamsbekendheid">Naamsbekendheid</SelectItem>
                <SelectItem value="Actie promoten">Actie promoten</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Regio / plaats *</Label>
            <Select
              value={formData.region}
              onValueChange={(value) => setFormData({ ...formData, region: value })}
              required
            >
              <SelectTrigger id="region" data-testid="select-region">
                <SelectValue placeholder="Kies een regio" />
              </SelectTrigger>
              <SelectContent>
                {LIMBURG_CITIES.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Bedrijfsnaam *</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Je naam *</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                required
                data-testid="input-contact-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefoon</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                data-testid="input-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-email"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">* Vul minstens telefoon of e-mail in</p>

          <div className="space-y-2">
            <Label htmlFor="budget">Budget indicatie</Label>
            <Select
              value={formData.budgetIndication}
              onValueChange={(value) => setFormData({ ...formData, budgetIndication: value })}
            >
              <SelectTrigger id="budget" data-testid="select-budget">
                <SelectValue placeholder="Kies een budget" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="€50 per maand">€50 per maand</SelectItem>
                <SelectItem value="€100 per maand">€100 per maand</SelectItem>
                <SelectItem value="€250 per maand">€250 per maand</SelectItem>
                <SelectItem value="€500+ per maand">€500+ per maand</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Opmerking (optioneel)</Label>
            <Textarea
              id="remarks"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="Eventuele opmerkingen of wensen..."
              rows={3}
              data-testid="textarea-remarks"
            />
          </div>

          {mutation.error && (
            <p className="text-sm text-red-600" data-testid="error-message">
              {mutation.error.message}
            </p>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={mutation.isPending}
            data-testid="button-submit-advertiser"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Versturen...
              </>
            ) : (
              "Verstuur aanvraag"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ScreenLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScreenLeadModal({ open, onOpenChange }: ScreenLeadModalProps) {
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    businessType: "",
    city: "",
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    visitorsPerWeek: "",
    remarks: "",
    honeypot: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/leads/screen-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Er ging iets mis");
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
        setFormData({
          businessType: "",
          city: "",
          companyName: "",
          contactName: "",
          phone: "",
          email: "",
          visitorsPerWeek: "",
          remarks: "",
          honeypot: "",
        });
      }, 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl mb-2">Bedankt!</DialogTitle>
            <DialogDescription>
              We hebben je aanvraag ontvangen en nemen zo snel mogelijk contact met je op.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <DialogTitle>Ik wil een scherm op mijn locatie</DialogTitle>
              <DialogDescription>
                Vul je gegevens in en we nemen contact op.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <input
            type="text"
            name="honeypot"
            value={formData.honeypot}
            onChange={(e) => setFormData({ ...formData, honeypot: e.target.value })}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />

          <div className="space-y-2">
            <Label htmlFor="businessType">Type zaak *</Label>
            <Select
              value={formData.businessType}
              onValueChange={(value) => setFormData({ ...formData, businessType: value })}
              required
            >
              <SelectTrigger id="businessType" data-testid="select-business-type">
                <SelectValue placeholder="Kies een type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Kapper/Barbershop">Kapper / Barbershop</SelectItem>
                <SelectItem value="Gym/Sportschool">Gym / Sportschool</SelectItem>
                <SelectItem value="Horeca">Horeca</SelectItem>
                <SelectItem value="Retail">Retail / Winkel</SelectItem>
                <SelectItem value="Overig">Overig</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">Plaats *</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Bijv. Sittard"
              required
              data-testid="input-city"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Bedrijfsnaam *</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required
                data-testid="input-screen-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Contactpersoon *</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                required
                data-testid="input-screen-contact-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefoon *</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                data-testid="input-screen-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail (optioneel)</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                data-testid="input-screen-email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visitors">Gemiddeld bezoekers per week</Label>
            <Select
              value={formData.visitorsPerWeek}
              onValueChange={(value) => setFormData({ ...formData, visitorsPerWeek: value })}
            >
              <SelectTrigger id="visitors" data-testid="select-visitors">
                <SelectValue placeholder="Kies een indicatie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0-250">0 - 250</SelectItem>
                <SelectItem value="250-500">250 - 500</SelectItem>
                <SelectItem value="500-1000">500 - 1000</SelectItem>
                <SelectItem value="1000+">1000+</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="remarks">Opmerking (optioneel)</Label>
            <Textarea
              id="remarks"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="Eventuele opmerkingen of wensen..."
              rows={3}
              data-testid="textarea-screen-remarks"
            />
          </div>

          {mutation.error && (
            <p className="text-sm text-red-600" data-testid="screen-error-message">
              {mutation.error.message}
            </p>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={mutation.isPending}
            data-testid="button-submit-screen"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Versturen...
              </>
            ) : (
              "Vraag scherm aan"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
