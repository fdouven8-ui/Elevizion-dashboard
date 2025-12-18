import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";

import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Onboarding from "@/pages/Onboarding";
import Screens from "@/pages/Screens";
import Advertisers from "@/pages/Advertisers";
import Placements from "@/pages/Placements";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Home} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/onboarding/:wizard" component={Onboarding} />
        <Route path="/screens" component={Screens} />
        <Route path="/advertisers" component={Advertisers} />
        <Route path="/placements" component={Placements} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
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
