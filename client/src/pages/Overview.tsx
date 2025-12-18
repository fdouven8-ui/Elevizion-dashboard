import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Monitor, AlertCircle, Wifi, WifiOff, Building2, 
  Receipt, ArrowRight, Play, CalendarCheck, Eye,
  TrendingUp, Clock, CheckCircle2, ChevronDown, ChevronUp
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

export default function Overview() {
  const { screens, locations, placements, contracts, advertisers, invoices } = useAppData();
  const [alertsOpen, setAlertsOpen] = useState(true);

  const onlineScreens = screens.filter(s => s.status === 'online').length;
  const offlineScreens = screens.filter(s => s.status === 'offline').length;
  const totalScreens = screens.length;
  const offlineScreensList = screens.filter(s => s.status === 'offline');
  
  const activeContracts = contracts.filter(c => c.status === 'active');
  const activePlacements = placements.filter(p => {
    if (!p.isActive) return false;
    const contract = contracts.find(c => c.id === p.contractId);
    return contract?.status === 'active';
  });
  
  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const overdueInvoices = invoices.filter(i => i.status === 'overdue');
  const unpaidAmount = unpaidInvoices.reduce((sum, i) => sum + Number(i.amountIncVat || 0), 0);

  const activeContractsWithPlacements = activeContracts.filter(c => 
    placements.some(p => p.contractId === c.id && p.isActive)
  );

  const screensWithoutAds = screens.filter(s => 
    s.status === 'online' && !activePlacements.some(p => p.screenId === s.id)
  );

  const mrr = activeContracts.reduce((sum, c) => sum + Number(c.monthlyPriceExVat || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">Status van je netwerk</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Maandelijkse omzet</p>
          <p className="text-2xl font-bold text-emerald-600">€{mrr.toLocaleString()}</p>
        </div>
      </div>

      {(offlineScreens > 0 || unpaidAmount > 0 || screensWithoutAds.length > 0) && (
        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors">
                Aandachtspunten
                {alertsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            {!alertsOpen && (
              <div className="flex items-center gap-2">
                {offlineScreens > 0 && (
                  <Badge variant="destructive" className="text-xs">{offlineScreens} offline</Badge>
                )}
                {overdueInvoices.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{overdueInvoices.length} te laat</Badge>
                )}
                {unpaidInvoices.length > 0 && overdueInvoices.length === 0 && (
                  <Badge variant="secondary" className="text-xs">€{unpaidAmount.toLocaleString()}</Badge>
                )}
              </div>
            )}
          </div>
          <CollapsibleContent className="space-y-3 mt-3">
          
          {offlineScreens > 0 && (
            <Card className="border-red-200 bg-red-50" data-testid="alert-offline">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <WifiOff className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="font-medium text-red-900">
                        {offlineScreens} scherm{offlineScreens > 1 ? 'en' : ''} offline
                      </p>
                      <p className="text-sm text-red-700">
                        {offlineScreensList.map(s => s.name).join(', ')}
                      </p>
                    </div>
                  </div>
                  <Link href="/monitoring">
                    <Button size="sm" className="bg-red-600 hover:bg-red-700">
                      Bekijken
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {overdueInvoices.length > 0 && (
            <Card className="border-red-200 bg-red-50" data-testid="alert-overdue">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="font-medium text-red-900">
                        {overdueInvoices.length} factuur{overdueInvoices.length !== 1 ? 'uren' : ''} te laat
                      </p>
                      <p className="text-sm text-red-700">
                        €{overdueInvoices.reduce((sum, i) => sum + Number(i.amountIncVat || 0), 0).toLocaleString()} openstaand
                      </p>
                    </div>
                  </div>
                  <Link href="/billing">
                    <Button size="sm" className="bg-red-600 hover:bg-red-700">
                      Opvolgen
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {unpaidInvoices.length > 0 && overdueInvoices.length === 0 && (
            <Card className="border-amber-200 bg-amber-50" data-testid="alert-unpaid">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-900">
                        €{unpaidAmount.toLocaleString()} openstaand
                      </p>
                      <p className="text-sm text-amber-700">
                        {unpaidInvoices.length} factuur{unpaidInvoices.length !== 1 ? 'ren' : ''} verstuurd
                      </p>
                    </div>
                  </div>
                  <Link href="/billing">
                    <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100">
                      Bekijken
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {screensWithoutAds.length > 0 && (
            <Card className="border-blue-200 bg-blue-50" data-testid="alert-empty-screens">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Monitor className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-900">
                        {screensWithoutAds.length} scherm{screensWithoutAds.length !== 1 ? 'en' : ''} zonder advertenties
                      </p>
                      <p className="text-sm text-blue-700">
                        {screensWithoutAds.map(s => s.name).join(', ')}
                      </p>
                    </div>
                  </div>
                  <Link href="/contracts">
                    <Button size="sm" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-100">
                      Contract toevoegen
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {offlineScreens === 0 && unpaidAmount === 0 && screensWithoutAds.length === 0 && (
        <Card className="border-green-200 bg-green-50" data-testid="status-ok">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Alles in orde</p>
                <p className="text-sm text-green-700">Alle schermen online, geen openstaande facturen</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/screens" className="block">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full" data-testid="card-screens">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <Wifi className={`h-5 w-5 ${offlineScreens > 0 ? 'text-amber-500' : 'text-green-500'}`} />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{onlineScreens}/{totalScreens}</p>
              <p className="text-sm text-muted-foreground">Schermen online</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/advertenties" className="block">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full" data-testid="card-campaigns">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <Play className="h-5 w-5 text-blue-500" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{activeContractsWithPlacements.length}</p>
              <p className="text-sm text-muted-foreground">Actieve campagnes</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/billing" className="block">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full" data-testid="card-invoices">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <Receipt className={`h-5 w-5 ${unpaidAmount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{unpaidInvoices.length}</p>
              <p className="text-sm text-muted-foreground">Openstaande facturen</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/advertisers" className="block">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full" data-testid="card-advertisers">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <Building2 className="h-5 w-5 text-emerald-500" />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{advertisers.filter(a => a.status === 'active').length}</p>
              <p className="text-sm text-muted-foreground">Actieve adverteerders</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Lopende Campagnes</CardTitle>
              <Link href="/advertenties">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  Alles bekijken
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeContractsWithPlacements.length === 0 ? (
              <div className="text-center py-6">
                <Play className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nog geen campagnes</p>
                <Link href="/contracts">
                  <Button variant="outline" size="sm" className="mt-3">
                    Contract aanmaken
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {activeContractsWithPlacements.slice(0, 5).map(contract => {
                  const advertiser = advertisers.find(a => a.id === contract.advertiserId);
                  const count = placements.filter(p => p.contractId === contract.id && p.isActive).length;
                  const onlineCount = placements.filter(p => {
                    if (p.contractId !== contract.id || !p.isActive) return false;
                    const screen = screens.find(s => s.id === p.screenId);
                    return screen?.status === 'online';
                  }).length;
                  
                  return (
                    <Link href="/advertenties" key={contract.id} className="block">
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="font-medium">{advertiser?.companyName || 'Onbekend'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {onlineCount}/{count} online
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Wat wil je doen?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link href="/contracts" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100">
                    <Play className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">Nieuw contract opstellen</p>
                    <p className="text-xs text-muted-foreground">Nieuwe adverteerder toevoegen</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            
            <Link href="/billing" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Receipt className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">Facturen beheren</p>
                    <p className="text-xs text-muted-foreground">{unpaidInvoices.length} openstaand</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            
            <Link href="/month-close" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <CalendarCheck className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium">Maand afsluiten</p>
                    <p className="text-xs text-muted-foreground">Snapshot maken & uitbetalingen</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            
            <Link href="/monitoring" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-100">
                    <Eye className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="font-medium">Schermen controleren</p>
                    <p className="text-xs text-muted-foreground">{onlineScreens} van {totalScreens} online</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
