import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Monitor, MapPin, Play, AlertCircle, CheckCircle2, 
  Wifi, WifiOff, Building2, Clock, Receipt, ArrowRight,
  Eye, Zap
} from "lucide-react";
import { Link } from "wouter";

export default function Overview() {
  const { kpis, screens, locations, placements, contracts, advertisers, invoices } = useAppData();

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
        <Card className={`${offlineScreens > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`} data-testid="card-screen-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {offlineScreens > 0 ? (
                <WifiOff className="h-8 w-8 text-red-600" />
              ) : (
                <Wifi className="h-8 w-8 text-green-600" />
              )}
              <div>
                <p className="text-2xl font-bold" data-testid="text-online-count">
                  {onlineScreens}/{totalScreens}
                </p>
                <p className="text-sm text-muted-foreground">Schermen online</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-active-ads">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Play className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-ads-count">{activeAdsCount}</p>
                <p className="text-sm text-muted-foreground">Actieve campagnes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-placements">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-2xl font-bold" data-testid="text-placements-count">{activePlacements.length}</p>
                <p className="text-sm text-muted-foreground">Plaatsingen actief</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={unpaidAmount > 0 ? 'border-amber-200 bg-amber-50' : ''} data-testid="card-invoices">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-8 w-8 text-amber-600" />
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
                  className={`relative overflow-hidden ${!isOnline ? 'border-red-200 bg-red-50/50' : ''}`}
                  data-testid={`screen-card-${screen.id}`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Monitor className={`h-5 w-5 ${isOnline ? 'text-green-600' : 'text-red-600'}`} />
                        <CardTitle className="text-base">{screen.name}</CardTitle>
                      </div>
                      <Badge 
                        variant={isOnline ? 'default' : 'destructive'} 
                        className="text-xs"
                      >
                        {isOnline ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {getLocationName(screen.locationId)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Actieve Advertenties ({ads.length})
                      </p>
                      {ads.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                          Geen actieve ads
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {ads.map((ad, idx) => (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3 w-3 text-muted-foreground" />
                                <span className="font-medium truncate max-w-[120px]">{ad.advertiserName}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {ad.secondsPerLoop}s × {ad.playsPerHour}/u
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
