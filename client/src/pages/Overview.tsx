import { useAppData } from "@/hooks/use-app-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Monitor, CreditCard, Banknote } from "lucide-react";

export default function Overview() {
  const { advertisers, screens, invoices, payouts } = useAppData();

  // KPIs
  const activeAdvertisers = advertisers.filter(a => a.status === 'active').length;
  const mrr = advertisers
    .filter(a => a.status === 'active')
    .reduce((sum, a) => sum + a.monthlyPriceExVat, 0);
  
  const activeScreens = screens.filter(s => s.status === 'online').length;
  const totalPayoutsPending = payouts
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.payoutAmountExVat, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight font-heading">Overview</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${mrr.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">+20.1% from last month</p>
          </CardContent>
        </Card>
        
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Advertisers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAdvertisers}</div>
            <p className="text-xs text-muted-foreground">+2 since last month</p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Screens</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeScreens} <span className="text-sm font-normal text-muted-foreground">/ {screens.length}</span></div>
            <p className="text-xs text-muted-foreground">85% uptime</p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPayoutsPending.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">For current period</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Revenue</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {/* Chart placeholder */}
            <div className="h-[240px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md">
              Revenue Chart Visualization
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {/* Activity Items */}
              <div className="flex items-center">
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">New Advertiser Joined</p>
                  <p className="text-sm text-muted-foreground">TechCorp Solutions</p>
                </div>
                <div className="ml-auto font-medium">+$500.00</div>
              </div>
              <div className="flex items-center">
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">Screen Offline</p>
                  <p className="text-sm text-muted-foreground">Gate A5 (Airport)</p>
                </div>
                <div className="ml-auto font-medium text-destructive">Alert</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
