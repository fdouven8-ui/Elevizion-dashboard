import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertCircle, Building2, Users, ArrowRight, ArrowLeft, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ResolveWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstname: string | null;
  lastname: string | null;
  city: string | null;
  email: string | null;
}

interface LocationIssue {
  id: string;
  name: string;
  city: string | null;
}

interface AdvertiserIssue {
  id: string;
  companyName: string;
  city: string | null;
}

type WizardStep = "locations" | "advertisers" | "complete";

export function ResolveWizard({ open, onOpenChange }: ResolveWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<WizardStep>("locations");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedContact, setSelectedContact] = useState<string>("");
  const [skippedItems, setSkippedItems] = useState<Set<string>>(new Set());

  const { data: moneybirdContacts = [] } = useQuery<MoneybirdContact[]>({
    queryKey: ["/api/moneybird/contacts"],
    enabled: open,
  });

  const { data: locationsData } = useQuery<{ id: string; name: string; city: string | null; moneybirdContactId: string | null }[]>({
    queryKey: ["/api/locations"],
    enabled: open,
  });

  const { data: advertisersData } = useQuery<{ id: string; companyName: string; city: string | null; moneybirdContactId: string | null }[]>({
    queryKey: ["/api/advertisers"],
    enabled: open,
  });

  const unlinkedLocations = useMemo(() => {
    return (locationsData || []).filter(l => !l.moneybirdContactId);
  }, [locationsData]);

  const unlinkedAdvertisers = useMemo(() => {
    return (advertisersData || []).filter(a => !a.moneybirdContactId);
  }, [advertisersData]);

  const linkLocationMutation = useMutation({
    mutationFn: async ({ locationId, moneybirdContactId }: { locationId: string; moneybirdContactId: string }) => {
      const res = await fetch(`/api/locations/${locationId}/link-moneybird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moneybirdContactId }),
      });
      if (!res.ok) throw new Error("Koppeling mislukt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      toast({ title: "Locatie gekoppeld", description: "Moneybird contact succesvol gekoppeld" });
    },
  });

  const linkAdvertiserMutation = useMutation({
    mutationFn: async ({ advertiserId, moneybirdContactId }: { advertiserId: string; moneybirdContactId: string }) => {
      const res = await fetch(`/api/advertisers/${advertiserId}/link-moneybird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moneybirdContactId }),
      });
      if (!res.ok) throw new Error("Koppeling mislukt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertisers"] });
      toast({ title: "Adverteerder gekoppeld", description: "Moneybird contact succesvol gekoppeld" });
    },
  });

  const currentItems = currentStep === "locations" ? unlinkedLocations : unlinkedAdvertisers;
  const currentItem = currentItems[currentIndex];
  const totalItems = unlinkedLocations.length + unlinkedAdvertisers.length;
  const resolvedItems = currentStep === "locations" 
    ? currentIndex 
    : unlinkedLocations.length + currentIndex;
  const progress = totalItems > 0 ? (resolvedItems / totalItems) * 100 : 100;

  const getContactDisplayName = (contact: MoneybirdContact) => {
    if (contact.companyName) return contact.companyName;
    return [contact.firstname, contact.lastname].filter(Boolean).join(" ") || "Onbekend";
  };

  const handleLink = async () => {
    if (!selectedContact || !currentItem) return;
    
    const contact = moneybirdContacts.find(c => c.id === selectedContact);
    if (!contact) return;

    try {
      if (currentStep === "locations") {
        await linkLocationMutation.mutateAsync({ 
          locationId: currentItem.id, 
          moneybirdContactId: contact.moneybirdId 
        });
      } else {
        await linkAdvertiserMutation.mutateAsync({ 
          advertiserId: currentItem.id, 
          moneybirdContactId: contact.moneybirdId 
        });
      }
      handleNext();
    } catch (error) {
      toast({ title: "Fout", description: "Koppeling mislukt", variant: "destructive" });
    }
  };

  const handleSkip = () => {
    if (currentItem) {
      setSkippedItems(prev => new Set(prev).add(currentItem.id));
    }
    handleNext();
  };

  const handleNext = () => {
    setSelectedContact("");
    
    if (currentIndex < currentItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (currentStep === "locations" && unlinkedAdvertisers.length > 0) {
      setCurrentStep("advertisers");
      setCurrentIndex(0);
    } else {
      setCurrentStep("complete");
    }
  };

  const handlePrevious = () => {
    setSelectedContact("");
    
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (currentStep === "advertisers" && unlinkedLocations.length > 0) {
      setCurrentStep("locations");
      setCurrentIndex(unlinkedLocations.length - 1);
    }
  };

  const handleClose = () => {
    setCurrentStep("locations");
    setCurrentIndex(0);
    setSelectedContact("");
    setSkippedItems(new Set());
    onOpenChange(false);
  };

  const canGoPrevious = currentIndex > 0 || (currentStep === "advertisers" && unlinkedLocations.length > 0);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" data-testid="resolve-wizard-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Moneybird Koppelingen
          </DialogTitle>
          <DialogDescription>
            Koppel locaties en adverteerders aan Moneybird contacten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Voortgang</span>
              <span className="font-medium">{resolvedItems} / {totalItems}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {currentStep === "complete" ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold mb-2">Klaar!</h3>
              <p className="text-muted-foreground">
                Alle items zijn behandeld.
                {skippedItems.size > 0 && ` (${skippedItems.size} overgeslagen)`}
              </p>
            </div>
          ) : currentItem ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {currentStep === "locations" ? (
                  <>
                    <Building2 className="h-4 w-4" />
                    <span>Locatie {currentIndex + 1} van {unlinkedLocations.length}</span>
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4" />
                    <span>Adverteerder {currentIndex + 1} van {unlinkedAdvertisers.length}</span>
                  </>
                )}
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-orange-100">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {currentStep === "locations" 
                        ? (currentItem as LocationIssue).name 
                        : (currentItem as AdvertiserIssue).companyName}
                    </p>
                    {currentItem.city && (
                      <p className="text-sm text-muted-foreground">{currentItem.city}</p>
                    )}
                    <Badge variant="outline" className="mt-2 text-orange-600 border-orange-600">
                      Niet gekoppeld aan Moneybird
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Selecteer Moneybird contact</label>
                <Select value={selectedContact} onValueChange={setSelectedContact}>
                  <SelectTrigger data-testid="select-moneybird-contact">
                    <SelectValue placeholder="Kies een contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {moneybirdContacts.map(contact => (
                      <SelectItem key={contact.id} value={contact.id}>
                        <div className="flex items-center gap-2">
                          <span>{getContactDisplayName(contact)}</span>
                          {contact.city && (
                            <span className="text-xs text-muted-foreground">({contact.city})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
              Geen items om te koppelen
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {currentStep !== "complete" && currentItem && (
            <>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={handlePrevious}
                  disabled={!canGoPrevious}
                  data-testid="button-previous"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Vorige
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleSkip}
                  data-testid="button-skip"
                >
                  Later
                </Button>
              </div>
              <Button 
                onClick={handleLink}
                disabled={!selectedContact || linkLocationMutation.isPending || linkAdvertiserMutation.isPending}
                data-testid="button-link"
              >
                Koppelen
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {(currentStep === "complete" || !currentItem) && (
            <Button onClick={handleClose} data-testid="button-close">
              <X className="h-4 w-4 mr-1" />
              Sluiten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
