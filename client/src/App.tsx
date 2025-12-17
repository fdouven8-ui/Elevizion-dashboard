import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AppDataProvider } from "@/hooks/use-app-data";
import DashboardLayout from "@/components/layout/DashboardLayout";

// Pages
import Overview from "@/pages/Overview";
import Advertisers from "@/pages/Advertisers";
import Locations from "@/pages/Locations";
import Screens from "@/pages/Screens";
import Campaigns from "@/pages/Campaigns";
import Billing from "@/pages/Billing";
import Payouts from "@/pages/Payouts";
import Integrations from "@/pages/Integrations";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/advertisers" component={Advertisers} />
        <Route path="/locations" component={Locations} />
        <Route path="/screens" component={Screens} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/billing" component={Billing} />
        <Route path="/payouts" component={Payouts} />
        <Route path="/integrations" component={Integrations} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppDataProvider>
        <Router />
        <Toaster />
      </AppDataProvider>
    </QueryClientProvider>
  );
}

export default App;
