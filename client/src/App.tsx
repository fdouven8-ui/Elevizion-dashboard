import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Onboarding from "@/pages/Onboarding";
import Screens from "@/pages/Screens";
import ScreenDetail from "@/pages/ScreenDetail";
import Locations from "@/pages/Locations";
import LocationDetail from "@/pages/LocationDetail";
import Advertisers from "@/pages/Advertisers";
import AdvertiserDetail from "@/pages/AdvertiserDetail";
import Placements from "@/pages/Placements";
import PlacementDetail from "@/pages/PlacementDetail";
import Finance from "@/pages/Finance";
import Settings from "@/pages/Settings";
import ContentInventory from "@/pages/ContentInventory";
import Yodeck from "@/pages/Yodeck";
import Entities from "@/pages/Entities";
import SyncLogs from "@/pages/SyncLogs";
import EmailCenter from "@/pages/EmailCenter";
import AdvertiserPortal from "@/pages/AdvertiserPortal";
import LocationPortal from "@/pages/LocationPortal";
import DataHealthPage from "@/pages/DataHealthPage";
import LocalLanding from "@/pages/LocalLanding";
import NotFound from "@/pages/not-found";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Home} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/onboarding/:wizard" component={Onboarding} />
        <Route path="/screens" component={Screens} />
        <Route path="/screens/:id" component={ScreenDetail} />
        <Route path="/locations" component={Locations} />
        <Route path="/locations/:id" component={LocationDetail} />
        <Route path="/advertisers" component={Advertisers} />
        <Route path="/advertisers/:id" component={AdvertiserDetail} />
        <Route path="/placements" component={Placements} />
        <Route path="/placements/:id" component={PlacementDetail} />
        <Route path="/finance" component={Finance} />
        <Route path="/settings" component={Settings} />
        <Route path="/content-inventory" component={ContentInventory} />
        <Route path="/yodeck" component={Yodeck} />
        <Route path="/entities" component={Entities} />
        <Route path="/sync-logs" component={SyncLogs} />
        <Route path="/email-center" component={EmailCenter} />
        <Route path="/data-health" component={DataHealthPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/portal/:token" component={AdvertiserPortal} />
      <Route path="/locatie-portal/:token" component={LocationPortal} />
      <Route path="/regio/limburg">{() => <LocalLanding city="limburg" />}</Route>
      <Route path="/regio/sittard">{() => <LocalLanding city="sittard" />}</Route>
      <Route path="/regio/maastricht">{() => <LocalLanding city="maastricht" />}</Route>
      <Route path="/regio/heerlen">{() => <LocalLanding city="heerlen" />}</Route>
      <Route path="/regio/roermond">{() => <LocalLanding city="roermond" />}</Route>
      <Route path="/regio/venlo">{() => <LocalLanding city="venlo" />}</Route>
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
