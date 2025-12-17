import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Monitor, CreditCard, Banknote, FileText, AlertCircle } from "lucide-react";

export default function Overview() {
  const { kpis, screens, invoices, contracts } = useAppData();

  const mrr = kpis?.mrr || 0;
  const activeAdvertisers = kpis?.activeAdvertisers || 0;
  const onlineScreens = kpis?.onlineScreens || 0;
  const totalScreens = kpis?.totalScreens || 0;
  const unpaidAmount = kpis?.unpaidAmount || 0;
  const unpaidInvoiceCount = kpis?.unpaidInvoiceCount || 0;
  const pendingPayoutAmount = kpis?.pendingPayoutAmount || 0;
  const activeContracts = kpis?.activeContracts || 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">Overzicht</h1>
          <p className="text-muted-foreground">Uw digital signage netwerk in één oogopslag</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-hover" data-testid="card-mrr">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maandelijkse Terugkerende Omzet</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-mrr">€{mrr.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{activeContracts} actieve contracten</p>
          </CardContent>
        </Card>
        
        <Card className="card-hover" data-testid="card-advertisers">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actieve Adverteerders</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-advertisers">{activeAdvertisers}</div>
            <p className="text-xs text-muted-foreground">Met actieve contracten</p>
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="card-screens">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actieve Schermen</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-screens">
              {onlineScreens} <span className="text-sm font-normal text-muted-foreground">/ {totalScreens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {totalScreens > 0 ? Math.round((onlineScreens / totalScreens) * 100) : 0}% online
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="card-unpaid">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Onbetaalde Facturen</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-unpaid">€{unpaidAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{unpaidInvoiceCount} facturen openstaand</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Snelle Acties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Maandelijkse Snapshot Genereren</p>
                  <p className="text-sm text-muted-foreground">Creëer onveranderlijke facturatie-snapshot voor huidige periode</p>
                </div>
                <a href="/billing" className="text-primary hover:underline text-sm font-medium">
                  Ga naar Facturatie →
                </a>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Facturen Versturen</p>
                  <p className="text-sm text-muted-foreground">Genereer en verstuur facturen vanuit vergrendelde snapshot</p>
                </div>
                <a href="/billing" className="text-primary hover:underline text-sm font-medium">
                  Ga naar Facturatie →
                </a>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Uitbetalingen Verwerken</p>
                  <p className="text-sm text-muted-foreground">Bereken en keur partner-uitbetalingen goed</p>
                </div>
                <a href="/payouts" className="text-primary hover:underline text-sm font-medium">
                  Ga naar Uitbetalingen →
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Systeemstatus</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Schermnetwerk</p>
                  <p className="text-xs text-muted-foreground">{onlineScreens} van {totalScreens} schermen online</p>
                </div>
              </div>
              
              {screens.filter(s => s.status === 'offline').length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Offline Schermen</p>
                    <p className="text-xs text-muted-foreground">
                      {screens.filter(s => s.status === 'offline').map(s => s.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Actieve Contracten</p>
                  <p className="text-xs text-muted-foreground">{activeContracts} contracten genereren omzet</p>
                </div>
              </div>

              {pendingPayoutAmount > 0 && (
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Openstaande Uitbetalingen</p>
                    <p className="text-xs text-muted-foreground">€{pendingPayoutAmount.toLocaleString()} wacht op verwerking</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
