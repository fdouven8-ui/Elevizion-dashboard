import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Link2, Wand2, CheckCircle, AlertTriangle, Monitor, MapPin, Users, Database } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OntbrekendeGegevens {
  screensWithoutLocation: number;
  locationsWithoutMoneybird: number;
  screensWithUnlinkedLocation: number;
  totalMoneybirdContacts: number;
  details: {
    screensWithoutLocation: Array<{ id: string; screenId: string; name: string }>;
    locationsWithoutMoneybird: Array<{ id: string; name: string; city: string | null }>;
    screensWithUnlinkedLocation: Array<{ id: string; screenId: string; name: string; locationId: string; locationName: string | null }>;
  };
}

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  city: string | null;
  address1: string | null;
}

async function fetchOntbrekendeGegevens(): Promise<OntbrekendeGegevens> {
  const res = await fetch("/api/ontbrekende-gegevens", { credentials: "include" });
  if (!res.ok) throw new Error("Fout bij ophalen ontbrekende gegevens");
  return res.json();
}

async function fetchContacts(): Promise<MoneybirdContact[]> {
  const res = await fetch("/api/moneybird/contacts", { credentials: "include" });
  if (!res.ok) throw new Error("Fout bij ophalen contacten");
  return res.json();
}

async function syncMoneybird(): Promise<any> {
  const res = await fetch("/api/sync/moneybird/run", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fout bij synchroniseren");
  return res.json();
}

async function linkLocationToMoneybird(locationId: string, moneybirdContactId: string): Promise<any> {
  const res = await fetch(`/api/locations/${locationId}/link-moneybird`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ moneybirdContactId }),
  });
  if (!res.ok) throw new Error("Fout bij koppelen locatie");
  return res.json();
}

function getContactDisplayName(contact: MoneybirdContact): string {
  if (contact.companyName) return contact.companyName;
  if (contact.firstname && contact.lastname) return `${contact.firstname} ${contact.lastname}`;
  if (contact.firstname) return contact.firstname;
  if (contact.lastname) return contact.lastname;
  return contact.email || "Onbekend";
}

export default function Koppelingen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContactMap, setSelectedContactMap] = useState<Record<string, string>>({});

  const { data: gegevens, isLoading, refetch } = useQuery({
    queryKey: ["ontbrekende-gegevens"],
    queryFn: fetchOntbrekendeGegevens,
  });

  const { data: contacts } = useQuery({
    queryKey: ["moneybird-contacts"],
    queryFn: fetchContacts,
  });

  const syncMutation = useMutation({
    mutationFn: syncMoneybird,
    onSuccess: (data) => {
      toast({ 
        title: "Sync voltooid", 
        description: `${data.contacts?.total || 0} contacten, ${data.invoices?.total || 0} facturen gesynchroniseerd` 
      });
      queryClient.invalidateQueries({ queryKey: ["ontbrekende-gegevens"] });
      queryClient.invalidateQueries({ queryKey: ["moneybird-contacts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ locationId, moneybirdContactId }: { locationId: string; moneybirdContactId: string }) =>
      linkLocationToMoneybird(locationId, moneybirdContactId),
    onSuccess: (data) => {
      toast({ title: "Succes", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["ontbrekende-gegevens"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const handleLinkLocation = (locationId: string) => {
    const moneybirdContactId = selectedContactMap[locationId];
    if (!moneybirdContactId) {
      toast({ title: "Fout", description: "Selecteer eerst een Moneybird contact", variant: "destructive" });
      return;
    }
    linkMutation.mutate({ locationId, moneybirdContactId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalIssues = (gegevens?.screensWithoutLocation || 0) + (gegevens?.locationsWithoutMoneybird || 0);
  const hasContacts = (gegevens?.totalMoneybirdContacts || 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ontbrekende gegevens</h1>
          <p className="text-muted-foreground">
            Overzicht van schermen en locaties die nog gekoppeld moeten worden aan Moneybird
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-moneybird"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            Sync Moneybird
          </Button>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={totalIssues === 0 ? "border-green-500/50 bg-green-50/50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {totalIssues === 0 ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
              Te doen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalIssues === 0 ? "text-green-600" : "text-orange-600"}`} data-testid="stat-total-issues">
              {totalIssues}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Monitor className="h-4 w-4 text-blue-500" />
              Schermen zonder locatie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-screens-no-location">
              {gegevens?.screensWithoutLocation || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-500" />
              Locaties zonder Moneybird
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-locations-no-moneybird">
              {gegevens?.locationsWithoutMoneybird || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              Moneybird contacten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${hasContacts ? "text-green-600" : "text-gray-400"}`} data-testid="stat-moneybird-contacts">
              {gegevens?.totalMoneybirdContacts || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warning if no Moneybird contacts */}
      {!hasContacts && (
        <Card className="border-yellow-500/50 bg-yellow-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-5 w-5" />
              Geen Moneybird contacten gevonden
            </CardTitle>
            <CardDescription>
              Klik op "Sync Moneybird" om contacten op te halen uit Moneybird. 
              Zorg dat MONEYBIRD_API_TOKEN en MONEYBIRD_ADMINISTRATION_ID correct zijn ingesteld.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Locations without Moneybird contact */}
      {(gegevens?.locationsWithoutMoneybird || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              Locaties zonder Moneybird koppeling ({gegevens?.locationsWithoutMoneybird})
            </CardTitle>
            <CardDescription>
              Koppel deze locaties aan een Moneybird contact voor correcte adres- en factuurgegevens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Locatie</TableHead>
                  <TableHead>Stad</TableHead>
                  <TableHead>Koppel aan Moneybird contact</TableHead>
                  <TableHead className="w-[100px]">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gegevens?.details.locationsWithoutMoneybird.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell>{location.city || "-"}</TableCell>
                    <TableCell>
                      <Select
                        value={selectedContactMap[location.id] || ""}
                        onValueChange={(value) => setSelectedContactMap(prev => ({ ...prev, [location.id]: value }))}
                      >
                        <SelectTrigger className="w-[280px]" data-testid={`select-contact-${location.id}`}>
                          <SelectValue placeholder="Selecteer contact..." />
                        </SelectTrigger>
                        <SelectContent>
                          {contacts?.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              <div className="flex flex-col">
                                <span>{getContactDisplayName(contact)}</span>
                                {contact.city && (
                                  <span className="text-xs text-muted-foreground">{contact.city}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleLinkLocation(location.id)}
                        disabled={!selectedContactMap[location.id] || linkMutation.isPending}
                        data-testid={`button-link-${location.id}`}
                      >
                        {linkMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Screens without location */}
      {(gegevens?.screensWithoutLocation || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-500" />
              Schermen zonder locatie ({gegevens?.screensWithoutLocation})
            </CardTitle>
            <CardDescription>
              Deze schermen hebben nog geen locatie toegewezen. Wijs een locatie toe via de onboarding wizard of schermdetails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EVZ-ID</TableHead>
                  <TableHead>Naam</TableHead>
                  <TableHead>Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gegevens?.details.screensWithoutLocation.map((screen) => (
                  <TableRow key={screen.id}>
                    <TableCell>
                      <Badge variant="outline">{screen.screenId}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{screen.name}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.href = `/screens/${screen.id}`}
                        data-testid={`button-view-screen-${screen.id}`}
                      >
                        Bekijk scherm
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All done message */}
      {totalIssues === 0 && hasContacts && (
        <Card className="border-green-500/50 bg-green-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              Alles is gekoppeld!
            </CardTitle>
            <CardDescription className="text-green-600">
              Alle schermen en locaties zijn correct gekoppeld aan Moneybird contacten.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
