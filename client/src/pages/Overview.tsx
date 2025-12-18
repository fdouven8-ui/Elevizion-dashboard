import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Monitor, AlertCircle, Wifi, WifiOff, Building2, 
  Receipt, ArrowRight, Play, CalendarCheck, FileText
} from "lucide-react";
import { Link } from "wouter";

export default function Overview() {
  const { screens, placements, contracts, advertisers, invoices } = useAppData();

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

  const activeContractsWithPlacements = contracts.filter(c => 
    c.status === 'active' && placements.some(p => p.contractId === c.id && p.isActive)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">Welkom terug</p>
      </div>

      {offlineScreens > 0 && (
        <Card className="border-red-200 bg-red-50" data-testid="alert-offline">
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
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                  Bekijken
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {unpaidAmount > 0 && (
        <Card className="border-amber-200 bg-amber-50" data-testid="alert-unpaid">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <p className="font-medium text-amber-900">
                  €{unpaidAmount.toLocaleString()} openstaand
                </p>
                <p className="text-sm text-amber-700">
                  {unpaidInvoices.length} factuur{unpaidInvoices.length !== 1 ? 'en' : ''} wachten op betaling
                </p>
              </div>
              <Link href="/billing">
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100">
                  Bekijken
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-screens">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Schermen</p>
                <p className="text-2xl font-bold mt-1">{onlineScreens}/{totalScreens}</p>
                <p className="text-xs text-muted-foreground">online</p>
              </div>
              <div className={`p-3 rounded-full ${offlineScreens > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                {offlineScreens > 0 ? (
                  <WifiOff className="h-5 w-5 text-red-600" />
                ) : (
                  <Wifi className="h-5 w-5 text-green-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-campaigns">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Campagnes</p>
                <p className="text-2xl font-bold mt-1">{activeAdsCount}</p>
                <p className="text-xs text-muted-foreground">actief</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <Play className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-placements">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Plaatsingen</p>
                <p className="text-2xl font-bold mt-1">{activePlacements.length}</p>
                <p className="text-xs text-muted-foreground">actief</p>
              </div>
              <div className="p-3 rounded-full bg-purple-100">
                <Monitor className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-advertisers">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Adverteerders</p>
                <p className="text-2xl font-bold mt-1">{advertisers.filter(a => a.status === 'active').length}</p>
                <p className="text-xs text-muted-foreground">actief</p>
              </div>
              <div className="p-3 rounded-full bg-emerald-100">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Actieve Campagnes</CardTitle>
          </CardHeader>
          <CardContent>
            {activeContractsWithPlacements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nog geen actieve campagnes
              </p>
            ) : (
              <div className="space-y-2">
                {activeContractsWithPlacements.slice(0, 5).map(contract => {
                  const advertiser = advertisers.find(a => a.id === contract.advertiserId);
                  const count = placements.filter(p => p.contractId === contract.id && p.isActive).length;
                  return (
                    <div key={contract.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{advertiser?.companyName || 'Onbekend'}</span>
                      </div>
                      <Badge variant="secondary">{count} scherm{count !== 1 ? 'en' : ''}</Badge>
                    </div>
                  );
                })}
                {activeContractsWithPlacements.length > 5 && (
                  <Link href="/advertenties" className="block">
                    <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground">
                      Bekijk alle {activeContractsWithPlacements.length} campagnes
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Snelle Acties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/advertenties" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <Monitor className="h-4 w-4 text-emerald-600" />
                  <span>Advertenties Overzicht</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/contracts" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <Play className="h-4 w-4 text-blue-600" />
                  <span>Nieuw Contract</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/billing" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <Receipt className="h-4 w-4 text-amber-600" />
                  <span>Facturen</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/month-close" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <CalendarCheck className="h-4 w-4 text-purple-600" />
                  <span>Maandafsluiting</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/reports" className="block">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-600" />
                  <span>Rapportages</span>
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
