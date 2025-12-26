import { useAppData } from "@/hooks/use-app-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  Building2,
  Monitor,
  CheckCircle,
  AlertCircle,
  Database,
  RefreshCw,
  Link2,
  ExternalLink,
  Clock
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
  country: string | null;
  lastSyncedAt: string | null;
}

export default function LocationDetail() {
  const [, params] = useRoute("/locations/:id");
  const { locations, screens } = useAppData();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const locationId = params?.id;
  const location = locations.find(l => l.id === locationId);
  const locationScreens = screens.filter(s => s.locationId === locationId);

  const { data: moneybirdContacts, isLoading: contactsLoading } = useQuery<MoneybirdContact[]>({
    queryKey: ["moneybird-contacts"],
    queryFn: async () => {
      const response = await fetch("/api/moneybird/contacts", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
    staleTime: 60000,
  });

  const linkedContact = moneybirdContacts?.find(c => c.moneybirdId === location?.moneybirdContactId);

  const linkMutation = useMutation({
    mutationFn: async (moneybirdId: string) => {
      const response = await fetch(`/api/locations/${locationId}/link-moneybird`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moneybirdContactId: moneybirdId }),
      });
      if (!response.ok) throw new Error("Failed to link contact");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Moneybird contact gekoppeld" });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["app-data"] });
    },
    onError: () => {
      toast({ title: "Fout bij koppelen", variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sync/moneybird/run", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Sync failed");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Moneybird sync voltooid" });
      queryClient.invalidateQueries({ queryKey: ["moneybird-contacts"] });
    },
    onError: () => {
      toast({ title: "Sync mislukt", variant: "destructive" });
    },
  });

  if (!location) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/locations">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Terug naar Locaties
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Locatie niet gevonden</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAddress = Boolean(location.address && location.address.trim());
  const hasCity = Boolean(location.city && location.city.trim());
  const hasZipcode = Boolean(location.zipcode && location.zipcode.trim());
  const addressComplete = hasAddress && hasCity && hasZipcode;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" size="sm" asChild data-testid="button-back">
        <Link href="/locations">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Terug naar Locaties
        </Link>
      </Button>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-4 border-b">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full shrink-0 bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="location-name">
              {location.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              {location.city || "Geen plaats"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button 
            variant="secondary" 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Moneybird
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Moneybird
              {location.moneybirdContactId ? (
                <Badge variant="outline" className="text-green-600 border-green-600 ml-auto">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Gekoppeld
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600 ml-auto">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Niet gekoppeld
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {location.moneybirdContactId && linkedContact ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Gekoppelde contact</p>
                  <p className="font-medium">{linkedContact.companyName || `${linkedContact.firstName || ""} ${linkedContact.lastName || ""}`.trim() || "Onbekend"}</p>
                  <p className="text-xs text-muted-foreground">ID: {linkedContact.moneybirdId}</p>
                </div>
                
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Adres (uit Moneybird)</p>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <p>{linkedContact.address || "-"}</p>
                    <p>{[linkedContact.zipcode, linkedContact.city].filter(Boolean).join(" ") || "-"}</p>
                    {linkedContact.country && <p>{linkedContact.country}</p>}
                  </div>
                </div>

                {linkedContact.email && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                    <a href={`mailto:${linkedContact.email}`} className="text-sm text-primary hover:underline">
                      {linkedContact.email}
                    </a>
                  </div>
                )}

                {linkedContact.phone && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
                    <a href={`tel:${linkedContact.phone}`} className="text-sm text-primary hover:underline">
                      {linkedContact.phone}
                    </a>
                  </div>
                )}

                {linkedContact.lastSyncedAt && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 pt-2 border-t">
                    <Clock className="h-3 w-3" />
                    Laatst gesynchroniseerd: {formatDistanceToNow(new Date(linkedContact.lastSyncedAt), { addSuffix: true, locale: nl })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Deze locatie is nog niet gekoppeld aan een Moneybird contact. Selecteer een contact om te koppelen.
                </p>
                
                {contactsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <div className="flex gap-2">
                    <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecteer een Moneybird contact..." />
                      </SelectTrigger>
                      <SelectContent>
                        {moneybirdContacts?.map((contact) => (
                          <SelectItem key={contact.id} value={contact.moneybirdId}>
                            {contact.companyName || `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email || "Onbekend"}
                            {contact.city && ` (${contact.city})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={() => selectedContactId && linkMutation.mutate(selectedContactId)}
                      disabled={!selectedContactId || linkMutation.isPending}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Koppelen
                    </Button>
                  </div>
                )}

                {moneybirdContacts?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Geen Moneybird contacten beschikbaar. Klik op "Sync Moneybird" om contacten op te halen.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Adresgegevens
              {addressComplete ? (
                <Badge variant="outline" className="text-green-600 border-green-600 ml-auto">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Compleet
                </Badge>
              ) : (
                <Badge variant="outline" className="text-orange-600 border-orange-600 ml-auto">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Onvolledig
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Straat</p>
                <p className={!hasAddress ? "text-orange-600" : ""}>{location.address || "Ontbreekt"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Postcode</p>
                  <p className={!hasZipcode ? "text-orange-600" : ""}>{location.zipcode || "Ontbreekt"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Plaats</p>
                  <p className={!hasCity ? "text-orange-600" : ""}>{location.city || "Ontbreekt"}</p>
                </div>
              </div>
              
              {location.moneybirdContactId && (
                <p className="text-xs text-green-600 flex items-center gap-1 pt-2 border-t">
                  <Database className="h-3 w-3" />
                  Bron: Moneybird
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Contactpersoon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Naam</p>
                <p>{location.contactName || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                {location.email ? (
                  <a href={`mailto:${location.email}`} className="text-primary hover:underline flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {location.email}
                  </a>
                ) : (
                  <p className="text-muted-foreground">-</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Telefoon</p>
                {location.phone ? (
                  <a href={`tel:${location.phone}`} className="text-primary hover:underline flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {location.phone}
                  </a>
                ) : (
                  <p className="text-muted-foreground">-</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Schermen op deze locatie
              <Badge variant="secondary" className="ml-auto">{locationScreens.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {locationScreens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen schermen op deze locatie.</p>
            ) : (
              <div className="space-y-2">
                {locationScreens.map(screen => (
                  <Link 
                    key={screen.id} 
                    href={`/screens/${screen.id}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{screen.name || screen.screenId}</span>
                    </div>
                    <Badge variant={screen.status === "online" ? "default" : "destructive"}>
                      {screen.status === "online" ? "Online" : "Offline"}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
