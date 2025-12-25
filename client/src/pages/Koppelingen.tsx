import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Link2, Unlink, Wand2, CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
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

interface MatchResult {
  moneybirdContactId: string;
  contactName: string;
  confidence: "auto_exact" | "auto_fuzzy" | "needs_review";
  score: number;
  reason: string;
}

interface ScreenMapping {
  screen: {
    id: string;
    screenId: string;
    name: string;
    yodeckPlayerName: string | null;
    locationId: string;
    locationName: string;
  };
  currentMatch: {
    confidence: string | null;
    reason: string | null;
    moneybirdContactId: string | null;
    contactName: string | null;
  } | null;
  suggestions: MatchResult[];
  bestAutoMatch: MatchResult | null;
  status: "unmapped" | "auto_mapped" | "manually_mapped" | "needs_review";
}

interface MappingStats {
  totalScreens: number;
  mappedScreens: number;
  unmappedScreens: number;
  autoMapped: number;
  manualMapped: number;
  needsReview: number;
}

interface MappingsResponse {
  screens: ScreenMapping[];
  stats: MappingStats;
  contactsCount: number;
}

interface MoneybirdContact {
  id: string;
  moneybirdId: string;
  companyName: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
}

async function fetchMappings(): Promise<MappingsResponse> {
  const res = await fetch("/api/mappings/screens", { credentials: "include" });
  if (!res.ok) throw new Error("Fout bij ophalen koppelingen");
  return res.json();
}

async function fetchContacts(): Promise<MoneybirdContact[]> {
  const res = await fetch("/api/moneybird/contacts", { credentials: "include" });
  if (!res.ok) throw new Error("Fout bij ophalen contacten");
  return res.json();
}

async function linkScreen(screenId: string, moneybirdContactId: string, isManual: boolean): Promise<any> {
  const res = await fetch("/api/mappings/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ screenId, moneybirdContactId, isManual }),
  });
  if (!res.ok) throw new Error("Fout bij koppelen screen");
  return res.json();
}

async function unlinkScreen(screenId: string): Promise<any> {
  const res = await fetch("/api/mappings/unlink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ screenId }),
  });
  if (!res.ok) throw new Error("Fout bij ontkoppelen screen");
  return res.json();
}

async function autoMatchAll(): Promise<any> {
  const res = await fetch("/api/mappings/auto-match", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fout bij automatisch koppelen");
  return res.json();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "auto_mapped":
      return <Badge variant="default" className="bg-green-600">Automatisch</Badge>;
    case "manually_mapped":
      return <Badge variant="default" className="bg-blue-600">Handmatig</Badge>;
    case "needs_review":
      return <Badge variant="secondary" className="bg-yellow-500 text-black">Review nodig</Badge>;
    default:
      return <Badge variant="outline">Niet gekoppeld</Badge>;
  }
}

function getConfidenceBadge(confidence: string) {
  switch (confidence) {
    case "auto_exact":
      return <Badge variant="outline" className="border-green-500 text-green-600">Exact</Badge>;
    case "auto_fuzzy":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Fuzzy</Badge>;
    case "needs_review":
      return <Badge variant="outline" className="border-orange-500 text-orange-600">Review</Badge>;
    default:
      return null;
  }
}

export default function Koppelingen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContactMap, setSelectedContactMap] = useState<Record<string, string>>({});

  const { data: mappings, isLoading: mappingsLoading, refetch: refetchMappings } = useQuery({
    queryKey: ["mappings"],
    queryFn: fetchMappings,
  });

  const { data: contacts } = useQuery({
    queryKey: ["moneybird-contacts"],
    queryFn: fetchContacts,
  });

  const linkMutation = useMutation({
    mutationFn: ({ screenId, moneybirdContactId }: { screenId: string; moneybirdContactId: string }) =>
      linkScreen(screenId, moneybirdContactId, true),
    onSuccess: (data) => {
      toast({ title: "Succes", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (screenId: string) => unlinkScreen(screenId),
    onSuccess: (data) => {
      toast({ title: "Succes", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: autoMatchAll,
    onSuccess: (data) => {
      toast({ title: "Auto-match voltooid", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["mappings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const handleLinkScreen = (screenId: string) => {
    const moneybirdContactId = selectedContactMap[screenId];
    if (!moneybirdContactId) {
      toast({ title: "Fout", description: "Selecteer eerst een contact", variant: "destructive" });
      return;
    }
    linkMutation.mutate({ screenId, moneybirdContactId });
  };

  const handleSelectSuggestion = (screenId: string, suggestion: MatchResult) => {
    linkMutation.mutate({ screenId, moneybirdContactId: suggestion.moneybirdContactId });
  };

  if (mappingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = mappings?.stats;
  const screens = mappings?.screens || [];
  const unmappedScreens = screens.filter(s => s.status === "unmapped");
  const mappedScreens = screens.filter(s => s.status !== "unmapped");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Koppelingen</h1>
          <p className="text-muted-foreground">
            Koppel schermen aan Moneybird contacten voor automatische adres- en contactgegevens
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetchMappings()}
            disabled={mappingsLoading}
            data-testid="button-refresh-mappings"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${mappingsLoading ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
          <Button
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending || unmappedScreens.length === 0}
            data-testid="button-auto-match"
          >
            {autoMatchMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Auto-match alle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Totaal schermen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="stat-total-screens">{stats?.totalScreens || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Gekoppeld
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600" data-testid="stat-mapped-screens">{stats?.mappedScreens || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Niet gekoppeld
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600" data-testid="stat-unmapped-screens">{stats?.unmappedScreens || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              Moneybird contacten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600" data-testid="stat-contacts">{mappings?.contactsCount || 0}</p>
          </CardContent>
        </Card>
      </div>

      {unmappedScreens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Niet-gekoppelde schermen ({unmappedScreens.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Screen ID</TableHead>
                  <TableHead>Naam (Yodeck)</TableHead>
                  <TableHead>Suggesties</TableHead>
                  <TableHead>Koppelen aan</TableHead>
                  <TableHead className="w-[100px]">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmappedScreens.map((mapping) => (
                  <TableRow key={mapping.screen.id} data-testid={`row-unmapped-${mapping.screen.screenId}`}>
                    <TableCell className="font-mono">{mapping.screen.screenId}</TableCell>
                    <TableCell>
                      <div className="font-medium">{mapping.screen.yodeckPlayerName || mapping.screen.name}</div>
                      <div className="text-xs text-muted-foreground">{mapping.screen.locationName}</div>
                    </TableCell>
                    <TableCell>
                      {mapping.suggestions.length > 0 ? (
                        <div className="space-y-1">
                          {mapping.suggestions.slice(0, 3).map((suggestion, idx) => (
                            <Button
                              key={suggestion.moneybirdContactId}
                              variant="ghost"
                              size="sm"
                              className="h-auto p-1 text-left justify-start w-full"
                              onClick={() => handleSelectSuggestion(mapping.screen.id, suggestion)}
                              data-testid={`button-suggestion-${mapping.screen.screenId}-${idx}`}
                            >
                              <div className="flex items-center gap-2">
                                {getConfidenceBadge(suggestion.confidence)}
                                <span className="text-sm">{suggestion.contactName}</span>
                                <span className="text-xs text-muted-foreground">({suggestion.score}%)</span>
                              </div>
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Geen suggesties</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={selectedContactMap[mapping.screen.id] || ""}
                        onValueChange={(value) => setSelectedContactMap(prev => ({ ...prev, [mapping.screen.id]: value }))}
                      >
                        <SelectTrigger className="w-[200px]" data-testid={`select-contact-${mapping.screen.screenId}`}>
                          <SelectValue placeholder="Selecteer contact..." />
                        </SelectTrigger>
                        <SelectContent>
                          {contacts?.map((contact) => (
                            <SelectItem key={contact.moneybirdId} value={contact.moneybirdId}>
                              {contact.companyName || `${contact.firstname} ${contact.lastname}`.trim() || "Onbekend"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleLinkScreen(mapping.screen.id)}
                        disabled={!selectedContactMap[mapping.screen.id] || linkMutation.isPending}
                        data-testid={`button-link-${mapping.screen.screenId}`}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Gekoppelde schermen ({mappedScreens.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mappedScreens.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nog geen schermen gekoppeld aan Moneybird contacten
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Screen ID</TableHead>
                  <TableHead>Naam (Yodeck)</TableHead>
                  <TableHead>Gekoppeld aan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reden</TableHead>
                  <TableHead className="w-[100px]">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedScreens.map((mapping) => (
                  <TableRow key={mapping.screen.id} data-testid={`row-mapped-${mapping.screen.screenId}`}>
                    <TableCell className="font-mono">{mapping.screen.screenId}</TableCell>
                    <TableCell>
                      <div className="font-medium">{mapping.screen.yodeckPlayerName || mapping.screen.name}</div>
                      <div className="text-xs text-muted-foreground">{mapping.screen.locationName}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{mapping.currentMatch?.contactName || "-"}</div>
                    </TableCell>
                    <TableCell>{getStatusBadge(mapping.status)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{mapping.currentMatch?.reason || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unlinkMutation.mutate(mapping.screen.id)}
                        disabled={unlinkMutation.isPending}
                        data-testid={`button-unlink-${mapping.screen.screenId}`}
                      >
                        {unlinkMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unlink className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
