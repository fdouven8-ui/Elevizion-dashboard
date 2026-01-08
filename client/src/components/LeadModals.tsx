import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle, Megaphone, MapPin } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

interface LeadFormData {
  leadType: "ADVERTEREN" | "SCHERM";
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  honeypot: string;
}

function LeadFormModal({ 
  open, 
  onOpenChange, 
  leadType,
  title,
  description,
  icon: Icon,
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  leadType: "ADVERTEREN" | "SCHERM";
  title: string;
  description: string;
  icon: typeof Megaphone;
}) {
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<LeadFormData>({
    leadType,
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    honeypot: "",
  });

  const mutation = useMutation({
    mutationFn: async (data: LeadFormData) => {
      const res = await fetch("/api/leads", {
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
          leadType,
          companyName: "",
          contactPerson: "",
          email: "",
          phone: "",
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
            <DialogDescription className="text-base">
              We hebben je aanvraag ontvangen en nemen binnen 1 werkdag contact met je op.
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Icon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
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
            <Label htmlFor="companyName">Bedrijfsnaam *</Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
              required
              placeholder="Bijv. Kapsalon Janssen"
              data-testid="input-company-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contactpersoon *</Label>
            <Input
              id="contactPerson"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              required
              placeholder="Je naam"
              data-testid="input-contact-person"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mailadres *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              placeholder="email@voorbeeld.nl"
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefoonnummer *</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="06-12345678"
              data-testid="input-phone"
            />
          </div>

          {mutation.error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md" data-testid="error-message">
              {mutation.error.message}
            </p>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={mutation.isPending}
            data-testid="button-submit-lead"
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

interface LeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdvertiserLeadModal({ open, onOpenChange }: LeadModalProps) {
  return (
    <LeadFormModal
      open={open}
      onOpenChange={onOpenChange}
      leadType="ADVERTEREN"
      title="Ik wil adverteren"
      description="Vul je gegevens in en we nemen contact op."
      icon={Megaphone}
    />
  );
}

export function ScreenLeadModal({ open, onOpenChange }: LeadModalProps) {
  return (
    <LeadFormModal
      open={open}
      onOpenChange={onOpenChange}
      leadType="SCHERM"
      title="Ik wil een scherm"
      description="Vul je gegevens in en we nemen contact op."
      icon={MapPin}
    />
  );
}
