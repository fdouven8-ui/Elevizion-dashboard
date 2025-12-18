import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Monitor, MapPin, Play, AlertCircle, CheckCircle2, 
  Wifi, WifiOff, Building2, Clock, Receipt, ArrowRight,
  Eye, Zap, Megaphone
} from "lucide-react";
import { Link } from "wouter";

export default function Overview() {
  const { screens, locations, placements, contracts, advertisers, invoices } = useAppData();

  const onlineScreens = screens.filter(s => s.status === 'online').length;
  const offlineScreens = screens.filter(s => s.status === 'offline').length;
  const totalScreens = screens.length;
  
  const activePlacements = placements.filter(p => {
    if (!p.isActive) return false;
    const contract = contracts.find(c => c.id === p.contractId);
    return contract?.status === 'active';
  });
  const activeAdsCount = new Set(activePlacements.map(p => p.contractId)).size;
  
  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const unpaidAmount = unpaidInvoices.reduce((sum, i) => sum + Number(i.amountIncVat || 0), 0);

  const getLocationName = (locationId: string) => 
    locations.find(l => l.id === locationId)?.name || 'Onbekend';

  const getScreenAds = (screenId: string) => {
    const screenPlacements = placements.filter(p => p.screenId === screenId && p.isActive);
    return screenPlacements.map(p => {
      const contract = contracts.find(c => c.id === p.contractId);
      const advertiser = contract ? advertisers.find(a => a.id === contract.advertiserId) : null;
      return {
        advertiserName: advertiser?.companyName || 'Onbekend',
        secondsPerLoop: p.secondsPerLoop,
        playsPerHour: p.playsPerHour,
        contractStatus: contract?.status || 'unknown',
      };
    }).filter(ad => ad.contractStatus === 'active');
  };

  const sortedScreens = [...screens].sort((a, b) => {
    if (a.status === 'offline' && b.status !== 'offline') return -1;
    if (a.status !== 'offline' && b.status === 'offline') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">
            Scherm Overzicht
          </h1>
          <p className="text-muted-foreground">Alle schermen en advertenties in één oogopslag</p>
        </div>
        <Link href="/screens">
          <Button variant="outline" className="gap-2">
            <Monitor className="h-4 w-4" />
            Beheer Schermen
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className={`overflow-hidden ${offlineScreens > 0 ? 'shadow-lg' : 'shadow-glow'}`} data-testid="card-screen-status">
          <div className={`h-1.5 ${offlineScreens > 0 ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`} />
          <CardContent className="pt-5">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${offlineScreens > 0 ? 'bg-red-100' : 'bg-emerald-100'}`}>
                {offlineScreens > 0 ? (
                  <WifiOff className="h-6 w-6 text-red-600" />
                ) : (
                  <Wifi className="h-6 w-6 text-emerald-600" />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-online-count">
                  {onlineScreens}/{totalScreens}
                </p>
                <p className="text-sm text-muted-foreground">Schermen online</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-md hover:shadow-lg transition-shadow" data-testid="card-active-ads">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <CardContent className="pt-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-100">
                <Play className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-ads-count">{activeAdsCount}</p>
                <p className="text-sm text-muted-foreground">Actieve campagnes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-md hover:shadow-lg transition-shadow" data-testid="card-placements">
          <div className="h-1.5 bg-gradient-to-r from-purple-500 to-pink-500" />
          <CardContent className="pt-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-100">
                <Zap className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-placements-count">{activePlacements.length}</p>
                <p className="text-sm text-muted-foreground">Plaatsingen actief</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`overflow-hidden ${unpaidAmount > 0 ? 'shadow-lg' : 'shadow-md hover:shadow-lg transition-shadow'}`} data-testid="card-invoices">
          <div className={`h-1.5 ${unpaidAmount > 0 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-slate-300 to-slate-400'}`} />
          <CardContent className="pt-5">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${unpaidAmount > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
                <Receipt className={`h-6 w-6 ${unpaidAmount > 0 ? 'text-amber-600' : 'text-slate-500'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-unpaid">€{unpaidAmount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">{unpaidInvoices.length} openstaand</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {offlineScreens > 0 && (
        <Card className="border-red-300 bg-red-50" data-testid="alert-offline">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="font-medium text-red-900">
                  {offlineScreens} scherm{offlineScreens > 1 ? 'en' : ''} offline
                </p>
                <p className="text-sm text-red-700">
                  {screens.filter(s => s.status === 'offline').map(s => s.name).join(', ')}
                </p>
              </div>
              <Link href="/monitoring">
                <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100">
                  Bekijk Details
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        const activeContractsWithPlacements = contracts.filter(c => c.status === 'active' && placements.some(p => p.contractId === c.id && p.isActive));
        if (activeContractsWithPlacements.length === 0) return null;
        
        const topCampaigns = activeContractsWithPlacements.slice(0, 3);
        
        return (
          <Card className="overflow-hidden shadow-lg border-emerald-100" data-testid="section-active-campaigns-preview">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100">
                    <Megaphone className="h-4 w-4 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold">Actieve Campagnes</h3>
                  <Badge variant="secondary">{activeContractsWithPlacements.length}</Badge>
                </div>
                <Link href="/advertenties">
                  <Button variant="outline" size="sm" className="gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                    Volledig Overzicht
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {topCampaigns.map(contract => {
                  const advertiser = advertisers.find(a => a.id === contract.advertiserId);
                  const contractPlacements = placements.filter(p => p.contractId === contract.id && p.isActive);
                  return (
                    <div 
                      key={contract.id}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100"
                    >
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{advertiser?.companyName || 'Onbekend'}</span>
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">
                        {contractPlacements.length} scherm{contractPlacements.length !== 1 ? 'en' : ''}
                      </Badge>
                    </div>
                  );
                })}
                {activeContractsWithPlacements.length > 3 && (
                  <Link href="/advertenties">
                    <div className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors">
                      +{activeContractsWithPlacements.length - 3} meer
                    </div>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Alle Schermen ({totalScreens})
        </h2>
        
        {totalScreens === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Monitor className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Nog geen schermen</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Voeg je eerste scherm toe om te beginnen
              </p>
              <Link href="/screens">
                <Button>Scherm Toevoegen</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedScreens.map((screen) => {
              const ads = getScreenAds(screen.id);
              const isOnline = screen.status === 'online';
              
              return (
                <Card 
                  key={screen.id} 
                  className={`relative overflow-hidden transition-all hover:shadow-lg ${!isOnline ? 'border-red-200 bg-gradient-to-br from-red-50 to-rose-50' : 'bg-gradient-to-br from-white to-slate-50 hover:shadow-emerald-100'}`}
                  data-testid={`screen-card-${screen.id}`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${isOnline ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-red-400 to-rose-500'}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isOnline ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          <Monitor className={`h-4 w-4 ${isOnline ? 'text-emerald-600' : 'text-red-600'}`} />
                        </div>
                        <CardTitle className="text-base">{screen.name}</CardTitle>
                      </div>
                      <Badge 
                        className={`text-xs ${isOnline ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}
                      >
                        {isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground ml-8">
                      <MapPin className="h-3 w-3" />
                      {getLocationName(screen.locationId)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {ads.length} Ad{ads.length !== 1 ? 's' : ''}
                        </p>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                      </div>
                      {ads.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic text-center py-2">
                          Geen actieve ads
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {ads.map((ad, idx) => (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between p-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg text-sm border border-blue-100"
                            >
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3 w-3 text-blue-500" />
                                <span className="font-medium truncate max-w-[120px]">{ad.advertiserName}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                <Clock className="h-3 w-3" />
                                {ad.secondsPerLoop}s
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Snelle Acties
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/contracts" className="block">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <Play className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Nieuw Contract</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/billing" className="block">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <Receipt className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">Facturen Beheren</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/month-close" className="block">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium">Maandafsluiting</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top Adverteerders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
                const onlineScreenIds = new Set(screens.filter(s => s.status === 'online').map(s => s.id));
                const rankedAdvertisers = advertisers
                  .filter(a => a.status === 'active')
                  .map(advertiser => {
                    const activeScreenCount = placements.filter(p => {
                      if (!p.isActive || !onlineScreenIds.has(p.screenId)) return false;
                      const contract = contracts.find(c => c.id === p.contractId);
                      return contract?.advertiserId === advertiser.id && contract?.status === 'active';
                    }).length;
                    return { ...advertiser, activeScreenCount };
                  })
                  .filter(a => a.activeScreenCount > 0)
                  .sort((a, b) => b.activeScreenCount - a.activeScreenCount)
                  .slice(0, 5);

                if (rankedAdvertisers.length === 0) {
                  return <p className="text-sm text-muted-foreground italic">Nog geen actieve advertenties</p>;
                }

                return (
                  <div className="space-y-2">
                    {rankedAdvertisers.map(advertiser => (
                      <div key={advertiser.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <span className="font-medium">{advertiser.companyName}</span>
                        <Badge variant="secondary">{advertiser.activeScreenCount} scherm{advertiser.activeScreenCount !== 1 ? 'en' : ''}</Badge>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
