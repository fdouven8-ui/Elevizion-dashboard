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
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">Overview</h1>
          <p className="text-muted-foreground">Your digital signage network at a glance</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-hover" data-testid="card-mrr">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-mrr">€{mrr.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{activeContracts} active contracts</p>
          </CardContent>
        </Card>
        
        <Card className="card-hover" data-testid="card-advertisers">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Advertisers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-advertisers">{activeAdvertisers}</div>
            <p className="text-xs text-muted-foreground">With active contracts</p>
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="card-screens">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Screens</CardTitle>
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
            <CardTitle className="text-sm font-medium">Unpaid Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-unpaid">€{unpaidAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{unpaidInvoiceCount} invoices outstanding</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Generate Monthly Snapshot</p>
                  <p className="text-sm text-muted-foreground">Create immutable billing snapshot for current period</p>
                </div>
                <a href="/billing" className="text-primary hover:underline text-sm font-medium">
                  Go to Billing →
                </a>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Send Invoices</p>
                  <p className="text-sm text-muted-foreground">Generate and send invoices from locked snapshot</p>
                </div>
                <a href="/billing" className="text-primary hover:underline text-sm font-medium">
                  Go to Billing →
                </a>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Process Payouts</p>
                  <p className="text-sm text-muted-foreground">Calculate and approve partner payouts</p>
                </div>
                <a href="/payouts" className="text-primary hover:underline text-sm font-medium">
                  Go to Payouts →
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Screen Network</p>
                  <p className="text-xs text-muted-foreground">{onlineScreens} of {totalScreens} screens online</p>
                </div>
              </div>
              
              {screens.filter(s => s.status === 'offline').length > 0 && (
                <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Offline Screens</p>
                    <p className="text-xs text-muted-foreground">
                      {screens.filter(s => s.status === 'offline').map(s => s.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Active Contracts</p>
                  <p className="text-xs text-muted-foreground">{activeContracts} contracts generating revenue</p>
                </div>
              </div>

              {pendingPayoutAmount > 0 && (
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Pending Payouts</p>
                    <p className="text-xs text-muted-foreground">€{pendingPayoutAmount.toLocaleString()} awaiting processing</p>
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
