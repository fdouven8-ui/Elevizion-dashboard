import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";

// Pages
import Overview from "@/pages/Overview";
import Advertisers from "@/pages/Advertisers";
import Locations from "@/pages/Locations";
import Screens from "@/pages/Screens";
import Contracts from "@/pages/Contracts";
import Billing from "@/pages/Billing";
import Payouts from "@/pages/Payouts";
import MonthClose from "@/pages/MonthClose";
import Reports from "@/pages/Reports";
import Monitoring from "@/pages/Monitoring";
import Onboarding from "@/pages/Onboarding";
import Integrations from "@/pages/Integrations";
import SignContract from "@/pages/SignContract";
import NotFound from "@/pages/not-found";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/advertisers" component={Advertisers} />
        <Route path="/locations" component={Locations} />
        <Route path="/screens" component={Screens} />
        <Route path="/contracts" component={Contracts} />
        <Route path="/billing" component={Billing} />
        <Route path="/payouts" component={Payouts} />
        <Route path="/month-close" component={MonthClose} />
        <Route path="/reports" component={Reports} />
        <Route path="/monitoring" component={Monitoring} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/integrations" component={Integrations} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/sign/:token" component={SignContract} />
      <Route component={DashboardRouter} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
