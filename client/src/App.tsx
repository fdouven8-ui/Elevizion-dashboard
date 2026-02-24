import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ScrollToTop from "@/components/ScrollToTop";
import { useEffect } from "react";

// Disable browser scroll restoration globally
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function EmailCenterRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/settings?tab=email", { replace: true });
  }, [navigate]);
  return null;
}

import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import Wachtlijst from "@/pages/Wachtlijst";
import Payouts from "@/pages/Payouts";
import Contracts from "@/pages/Contracts";
import SystemHealth from "@/pages/SystemHealth";
import ContractSigning from "@/pages/ContractSigning";
import AdvertiserOnboarding from "@/pages/AdvertiserOnboarding";
import LocationIntake from "@/pages/LocationIntake";
import LocationContract from "@/pages/LocationContract";
import UploadPortal from "@/pages/UploadPortal";
import PublishQueue from "@/pages/PublishQueue";
import PlaylistMapping from "@/pages/PlaylistMapping";
import ClaimPage from "@/pages/ClaimPage";
import VideoReview from "@/pages/VideoReview";
import Layouts from "@/pages/Layouts";
import YodeckDebug from "@/pages/YodeckDebug";
import AiDump from "@/pages/AiDump";
import AdminIndex from "@/pages/AdminIndex";
import NotFound from "@/pages/not-found";
import Adverteren from "@/pages/marketing/Adverteren";
import SchermLocatie from "@/pages/marketing/SchermLocatie";
import Prijzen from "@/pages/marketing/Prijzen";
import Werkwijze from "@/pages/marketing/Werkwijze";
import VeelgesteldeVragen from "@/pages/marketing/VeelgesteldeVragen";
import Contact from "@/pages/marketing/Contact";
import Start from "@/pages/marketing/Start";
import PortalLogin from "@/pages/portal/PortalLogin";
import PortalSignup from "@/pages/portal/PortalSignup";
import PortalOnboarding from "@/pages/portal/PortalOnboarding";
import PortalStatus from "@/pages/portal/PortalStatus";
import PortalLayout from "@/components/portal/PortalLayout";
import PortalOverview from "@/pages/portal/PortalOverview";
import PortalScreens from "@/pages/portal/PortalScreens";
import PortalVideo from "@/pages/portal/PortalVideo";
import PortalBilling from "@/pages/portal/PortalBilling";
import PortalVerifyEmail from "@/pages/portal/PortalVerifyEmail";
import PortalAccount from "@/pages/portal/PortalAccount";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Home} />
        <Route path="/leads" component={Leads} />
        <Route path="/wachtlijst" component={Wachtlijst} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/onboarding/:wizard" component={Onboarding} />
        <Route path="/screens" component={Screens} />
        <Route path="/screens/:id" component={ScreenDetail} />
        <Route path="/locations" component={Locations} />
        <Route path="/locations/:id" component={LocationDetail} />
        <Route path="/advertisers" component={Advertisers} />
        <Route path="/advertisers/:id">
          {() => (
            <ErrorBoundary
              fallbackTitle="Er ging iets mis bij het laden van deze adverteerder"
              fallbackMessage="Probeer de pagina opnieuw te laden of ga terug naar het overzicht."
              backUrl="/advertisers"
              backLabel="Terug naar overzicht"
            >
              <AdvertiserDetail />
            </ErrorBoundary>
          )}
        </Route>
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
        <Route path="/system-health" component={SystemHealth} />
        <Route path="/publish-queue" component={PublishQueue} />
        <Route path="/playlist-mapping" component={PlaylistMapping} />
        <Route path="/video-review" component={VideoReview} />
        <Route path="/layouts" component={Layouts} />
        <Route path="/admin/layouts" component={Layouts} />
        <Route path="/yodeck-debug" component={YodeckDebug} />
        <Route path="/admin/yodeck-debug" component={YodeckDebug} />
        <Route path="/admin/ai-dump" component={AiDump} />
        <Route path="/admin" component={AdminIndex} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/adverteren" component={Adverteren} />
      <Route path="/scherm-locatie" component={SchermLocatie} />
      <Route path="/prijzen" component={Prijzen} />
      <Route path="/werkwijze" component={Werkwijze} />
      <Route path="/veelgestelde-vragen" component={VeelgesteldeVragen} />
      <Route path="/contact" component={Contact} />
      <Route path="/start" component={Start} />
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal/signup" component={PortalSignup} />
      <Route path="/portal/verify-email" component={PortalVerifyEmail} />
      <Route path="/portal/change-email" component={PortalVerifyEmail} />
      <Route path="/portal/onboarding">{() => <PortalLayout><PortalOnboarding /></PortalLayout>}</Route>
      <Route path="/portal/screens">{() => <PortalLayout><PortalScreens /></PortalLayout>}</Route>
      <Route path="/portal/video">{() => <PortalLayout><PortalVideo /></PortalLayout>}</Route>
      <Route path="/portal/billing">{() => <PortalLayout><PortalBilling /></PortalLayout>}</Route>
      <Route path="/portal/account">{() => <PortalLayout><PortalAccount /></PortalLayout>}</Route>
      <Route path="/portal/status">{() => <PortalLayout><PortalStatus /></PortalLayout>}</Route>
      <Route path="/portal">{() => <PortalLayout><PortalOverview /></PortalLayout>}</Route>
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
      <Route path="/upload/:token" component={UploadPortal} />
      <Route path="/claim/:token" component={ClaimPage} />
        <Route component={DashboardRouter} />
      </Switch>
    </>
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
