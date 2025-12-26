import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Link2, Wand2, CheckCircle, AlertTriangle, Monitor, MapPin, Database, HelpCircle, ExternalLink } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";

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

interface AutoMatchResult {
  success: boolean;
  autoLinked: number;
  matches: Array<{ locationId: string; locationName: string; contactId: string; contactName: string; matchType: string; score: number }>;
  suggestions: Array<{ locationId: string; locationName: string; contactId: string; contactName: string; matchType: string; score: number }>;
  totalUnlinked: number;
  totalContacts: number;
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

async function autoMatchLocations(): Promise<AutoMatchResult> {
  const res = await fetch("/api/locations/auto-match-moneybird", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fout bij auto-match");
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
  const [autoMatchResult, setAutoMatchResult] = useState<AutoMatchResult | null>(null);

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

  const autoMatchMutation = useMutation({
    mutationFn: autoMatchLocations,
    onSuccess: (data) => {
      setAutoMatchResult(data);
      if (data.autoLinked > 0) {
        toast({ 
          title: "Auto-match voltooid", 
          description: `${data.autoLinked} locaties automatisch gekoppeld` 
        });
      } else if (data.suggestions.length > 0) {
        toast({ 
          title: "Auto-match voltooid", 
          description: `Geen automatische koppelingen, ${data.suggestions.length} suggesties gevonden` 
        });
      } else {
        toast({ 
          title: "Auto-match voltooid", 
          description: "Geen overeenkomsten gevonden" 
        });
      }
      queryClient.invalidateQueries({ queryKey: ["ontbrekende-gegevens"] });
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
      setSelectedContactMap({});
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
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold">Ontbrekende gegevens</h1>
            <p className="text-muted-foreground">
              Overzicht van schermen en locaties die nog gekoppeld moeten worden
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Moneybird is de bron voor adres- en factuurgegevens. Door locaties te koppelen aan Moneybird contacten worden adresgegevens automatisch gesynchroniseerd.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
            variant="outline"
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
          <Button
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending || !hasContacts}
            data-testid="button-auto-match"
          >
            {autoMatchMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Auto-match locaties
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
              <Database className="h-4 w-4 text-green-500" />
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
            <CardDescription className="text-yellow-600">
              Klik op "Sync Moneybird" om contacten op te halen uit Moneybird. 
              Zorg dat MONEYBIRD_API_TOKEN en MONEYBIRD_ADMINISTRATION_ID correct zijn ingesteld in de secrets.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Auto-match results */}
      {autoMatchResult && autoMatchResult.suggestions.length > 0 && (
        <Card className="border-blue-500/50 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Wand2 className="h-5 w-5" />
              Auto-match suggesties ({autoMatchResult.suggestions.length})
            </CardTitle>
            <CardDescription className="text-blue-600">
              Deze locaties zijn niet automatisch gekoppeld, maar we hebben mogelijke overeenkomsten gevonden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Locatie</TableHead>
                  <TableHead>Gesuggereerd contact</TableHead>
                  <TableHead>Match type</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {autoMatchResult.suggestions.map((suggestion) => (
                  <TableRow key={suggestion.locationId}>
                    <TableCell className="font-medium">{suggestion.locationName}</TableCell>
                    <TableCell>{suggestion.contactName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{suggestion.matchType}</Badge>
                    </TableCell>
                    <TableCell>{Math.round(suggestion.score * 100)}%</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => linkMutation.mutate({ locationId: suggestion.locationId, moneybirdContactId: suggestion.contactId })}
                        disabled={linkMutation.isPending}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Koppel
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
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
                    <TableCell className="font-medium">
                      <Link href={`/locations/${location.id}`} className="hover:underline flex items-center gap-1">
                        {location.name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
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
              Deze schermen hebben nog geen locatie toegewezen. Wijs een locatie toe via de schermdetails.
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
                      <Link href={`/screens/${screen.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-view-screen-${screen.id}`}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Bekijk scherm
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Screens with unlinked location */}
      {(gegevens?.screensWithUnlinkedLocation || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Schermen met locatie zonder Moneybird ({gegevens?.screensWithUnlinkedLocation})
            </CardTitle>
            <CardDescription>
              Deze schermen hebben een locatie, maar de locatie is niet gekoppeld aan Moneybird.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EVZ-ID</TableHead>
                  <TableHead>Scherm</TableHead>
                  <TableHead>Locatie</TableHead>
                  <TableHead>Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gegevens?.details.screensWithUnlinkedLocation.map((screen) => (
                  <TableRow key={screen.id}>
                    <TableCell>
                      <Badge variant="outline">{screen.screenId}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{screen.name}</TableCell>
                    <TableCell>{screen.locationName || "-"}</TableCell>
                    <TableCell>
                      <Link href={`/locations/${screen.locationId}`}>
                        <Button
                          variant="outline"
                          size="sm"
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Bekijk locatie
                        </Button>
                      </Link>
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
