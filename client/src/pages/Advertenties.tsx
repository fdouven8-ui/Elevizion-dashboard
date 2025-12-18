import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Monitor, MapPin, Building2, Clock, Megaphone, 
  Search, Filter, Tv2, ArrowUpDown, ChevronDown, ChevronUp
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";

export default function Advertenties() {
  const { screens, locations, placements, contracts, advertisers } = useAppData();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "screens">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const activeContracts = contracts.filter(c => c.status === 'active');

  const campaignData = useMemo(() => {
    return activeContracts.map(contract => {
      const advertiser = advertisers.find(a => a.id === contract.advertiserId);
      const contractPlacements = placements.filter(p => p.contractId === contract.id && p.isActive);
      
      const screenDetails = contractPlacements.map(placement => {
        const screen = screens.find(s => s.id === placement.screenId);
        const location = screen ? locations.find(l => l.id === screen.locationId) : null;
        return {
          placement,
          screen,
          location,
          isOnline: screen?.status === 'online'
        };
      });

      return {
        contract,
        advertiser,
        placements: contractPlacements,
        screenDetails,
        screenCount: contractPlacements.length,
        onlineCount: screenDetails.filter(s => s.isOnline).length
      };
    }).filter(c => c.screenCount > 0);
  }, [activeContracts, advertisers, placements, screens, locations]);

  const filteredData = useMemo(() => {
    let filtered = campaignData.filter(item => 
      item.advertiser?.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.screenDetails.some(s => 
        s.screen?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.location?.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    filtered.sort((a, b) => {
      if (sortBy === "name") {
        const nameA = a.advertiser?.companyName || "";
        const nameB = b.advertiser?.companyName || "";
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else {
        return sortOrder === "asc" 
          ? a.screenCount - b.screenCount 
          : b.screenCount - a.screenCount;
      }
    });

    return filtered;
  }, [campaignData, searchTerm, sortBy, sortOrder]);

  const toggleRow = (contractId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(contractId)) {
      newExpanded.delete(contractId);
    } else {
      newExpanded.add(contractId);
    }
    setExpandedRows(newExpanded);
  };

  const toggleSort = (field: "name" | "screens") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const totalOnline = filteredData.reduce((sum, c) => sum + c.onlineCount, 0);
  const totalScreens = filteredData.reduce((sum, c) => sum + c.screenCount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading flex items-center gap-3" data-testid="text-page-title">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
              <Megaphone className="h-6 w-6 text-emerald-600" />
            </div>
            Advertenties Overzicht
          </h1>
          <p className="text-muted-foreground mt-1">
            Welke adverteerder draait op welk scherm - volledig overzicht
          </p>
        </div>
        <Link href="/contracts">
          <Button className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
            <Building2 className="h-4 w-4" />
            Nieuw Contract
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-advertisers">{filteredData.length}</p>
                <p className="text-sm text-muted-foreground">Actieve adverteerders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-purple-500 to-pink-500" />
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Monitor className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-total-screens">{totalScreens}</p>
                <p className="text-sm text-muted-foreground">Totaal plaatsingen</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Tv2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-online">{totalOnline}</p>
                <p className="text-sm text-muted-foreground">Schermen online</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <MapPin className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-locations">
                  {new Set(filteredData.flatMap(c => c.screenDetails.map(s => s.location?.id).filter(Boolean))).size}
                </p>
                <p className="text-sm text-muted-foreground">Locaties actief</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op adverteerder, scherm of locatie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => toggleSort("name")}
                className={sortBy === "name" ? "border-emerald-300 bg-emerald-50" : ""}
                data-testid="button-sort-name"
              >
                <ArrowUpDown className="h-4 w-4 mr-1" />
                Naam
                {sortBy === "name" && (sortOrder === "asc" ? " ↑" : " ↓")}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => toggleSort("screens")}
                className={sortBy === "screens" ? "border-emerald-300 bg-emerald-50" : ""}
                data-testid="button-sort-screens"
              >
                <ArrowUpDown className="h-4 w-4 mr-1" />
                Schermen
                {sortBy === "screens" && (sortOrder === "asc" ? " ↑" : " ↓")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tv2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Geen actieve campagnes gevonden</p>
              <p className="text-sm mt-1">
                {searchTerm ? "Pas je zoekopdracht aan" : "Maak een nieuw contract aan om te starten"}
              </p>
              {!searchTerm && (
                <Link href="/contracts">
                  <Button variant="outline" className="mt-4">Nieuw Contract Aanmaken</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredData.map(item => {
                const isExpanded = expandedRows.has(item.contract.id);
                
                return (
                  <div 
                    key={item.contract.id} 
                    className="rounded-xl border-2 border-slate-100 bg-white overflow-hidden hover:border-emerald-200 transition-all"
                    data-testid={`advertiser-row-${item.contract.id}`}
                  >
                    <div 
                      className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => toggleRow(item.contract.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                          <Building2 className="h-6 w-6 text-white" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-lg truncate">
                              {item.advertiser?.companyName || 'Onbekend'}
                            </h3>
                            <Badge variant="secondary" className="shrink-0">
                              €{Number(item.contract.monthlyPriceExVat).toLocaleString()}/mnd
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Contract #{item.contract.id.slice(0, 8)} • 
                            Loopt t/m {item.contract.endDate ? new Date(item.contract.endDate).toLocaleDateString('nl-NL') : 'onbepaald'}
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                {item.onlineCount} online
                              </Badge>
                              {item.screenCount - item.onlineCount > 0 && (
                                <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                  {item.screenCount - item.onlineCount} offline
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {item.screenCount} scherm{item.screenCount !== 1 ? 'en' : ''} totaal
                            </p>
                          </div>
                          
                          <div className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-slate-500" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t bg-gradient-to-b from-slate-50 to-white">
                        <div className="pt-4">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                            Schermen waarop deze adverteerder draait:
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {item.screenDetails.map(({ placement, screen, location, isOnline }) => (
                              <div 
                                key={placement.id}
                                className={`p-3 rounded-lg border-2 transition-all ${
                                  isOnline 
                                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 
                                    : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200'
                                }`}
                                data-testid={`screen-detail-${placement.id}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg ${isOnline ? 'bg-green-100' : 'bg-red-100'}`}>
                                      <Monitor className={`h-4 w-4 ${isOnline ? 'text-green-600' : 'text-red-600'}`} />
                                    </div>
                                    <div>
                                      <p className="font-medium">{screen?.name || 'Onbekend'}</p>
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3" />
                                        {location?.name || 'Onbekend'}
                                      </div>
                                    </div>
                                  </div>
                                  <Badge className={isOnline ? 'bg-green-500' : 'bg-red-500'}>
                                    {isOnline ? 'Online' : 'Offline'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-dashed">
                                  <div className="flex items-center gap-1 text-xs">
                                    <Clock className="h-3 w-3 text-blue-500" />
                                    <span className="font-medium">{placement.secondsPerLoop}s</span>
                                    <span className="text-muted-foreground">per loop</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="font-medium">{placement.playsPerHour}×</span>
                                    <span className="text-muted-foreground">per uur</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                            <p className="text-sm text-blue-800">
                              <strong>Prijsverdeling:</strong> Het maandbedrag van €{Number(item.contract.monthlyPriceExVat).toLocaleString()} 
                              wordt proportioneel verdeeld over {item.screenCount} scherm{item.screenCount !== 1 ? 'en' : ''} op basis van afspeeltijd × frequentie.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
