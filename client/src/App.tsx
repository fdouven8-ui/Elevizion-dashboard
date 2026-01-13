import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect } from "react";

function EmailCenterRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/settings?tab=email", { replace: true });
  }, [navigate]);
  return null;
}

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
import AdvertiserPortal from "@/pages/AdvertiserPortal";
import LocationPortal from "@/pages/LocationPortal";
import DataHealthPage from "@/pages/DataHealthPage";
import LocalLanding from "@/pages/LocalLanding";
import Leads from "@/pages/Leads";
import Payouts from "@/pages/Payouts";
import Contracts from "@/pages/Contracts";
import ContractSigning from "@/pages/ContractSigning";
import AdvertiserOnboarding from "@/pages/AdvertiserOnboarding";
import LocationIntake from "@/pages/LocationIntake";
import LocationContract from "@/pages/LocationContract";
import NotFound from "@/pages/not-found";
import Adverteren from "@/pages/marketing/Adverteren";
import SchermLocatie from "@/pages/marketing/SchermLocatie";
import Prijzen from "@/pages/marketing/Prijzen";
import Werkwijze from "@/pages/marketing/Werkwijze";
import VeelgesteldeVragen from "@/pages/marketing/VeelgesteldeVragen";
import Contact from "@/pages/marketing/Contact";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Home} />
        <Route path="/leads" component={Leads} />
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
        <Route path="/payouts" component={Payouts} />
        <Route path="/financieel" component={Payouts} />
        <Route path="/contracts" component={Contracts} />
        <Route path="/settings" component={Settings} />
        <Route path="/content-inventory" component={ContentInventory} />
        <Route path="/yodeck" component={Yodeck} />
        <Route path="/entities" component={Entities} />
        <Route path="/sync-logs" component={SyncLogs} />
        <Route path="/email-center">
          <EmailCenterRedirect />
        </Route>
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
      <Route path="/adverteren" component={Adverteren} />
      <Route path="/scherm-locatie" component={SchermLocatie} />
      <Route path="/prijzen" component={Prijzen} />
      <Route path="/werkwijze" component={Werkwijze} />
      <Route path="/veelgestelde-vragen" component={VeelgesteldeVragen} />
      <Route path="/contact" component={Contact} />
      <Route path="/portal/:token" component={AdvertiserPortal} />
      <Route path="/locatie-portal/:token" component={LocationPortal} />
      <Route path="/regio/limburg">{() => <LocalLanding city="limburg" />}</Route>
      <Route path="/regio/sittard">{() => <LocalLanding city="sittard" />}</Route>
      <Route path="/regio/maastricht">{() => <LocalLanding city="maastricht" />}</Route>
      <Route path="/regio/heerlen">{() => <LocalLanding city="heerlen" />}</Route>
      <Route path="/regio/roermond">{() => <LocalLanding city="roermond" />}</Route>
      <Route path="/regio/venlo">{() => <LocalLanding city="venlo" />}</Route>
      <Route path="/contract-ondertekenen/:id" component={ContractSigning} />
      <Route path="/advertiser-onboarding/:token" component={AdvertiserOnboarding} />
      <Route path="/onboarding/location/intake/:token" component={LocationIntake} />
      <Route path="/onboarding/location/contract/:token" component={LocationContract} />
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
