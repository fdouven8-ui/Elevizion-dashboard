import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LayoutDashboard,
  Monitor,
  Users,
  Target,
  Settings,
  LogOut,
  LogIn,
  Rocket,
  Euro,
  UserPlus,
  ChevronDown,
  MapPin,
  Link2,
  Shield,
  FileText,
  Wallet,
  Activity,
  Send,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/models/auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermissions?: string[];
  anyPermission?: boolean;
}

const mainMenuItems: MenuItem[] = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard, requiredPermissions: [PERMISSIONS.VIEW_HOME] },
  { title: "Schermen", url: "/screens", icon: Monitor, requiredPermissions: [PERMISSIONS.VIEW_SCREENS] },
  { title: "Adverteerders", url: "/advertisers", icon: Users, requiredPermissions: [PERMISSIONS.VIEW_ADVERTISERS] },
  { title: "Plaatsingen", url: "/placements", icon: Target, requiredPermissions: [PERMISSIONS.VIEW_PLACEMENTS] },
];

const financieelSubItems = [
  { title: "Uitbetalingen", url: "/payouts", icon: Wallet },
  { title: "Contracten", url: "/contracts", icon: FileText },
];

const onboardingSubItems = [
  { title: "Leads", url: "/leads", icon: UserPlus },
  { title: "Nieuw scherm", url: "/onboarding", icon: MapPin },
  { title: "Nieuwe adverteerder", url: "/onboarding", icon: Users },
  { title: "Plaatsingen koppelen", url: "/placements", icon: Link2 },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading, logout, hasPermission, hasAnyPermission } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(
    location.startsWith("/onboarding") || location === "/leads"
  );
  const [financieelOpen, setFinancieelOpen] = useState(
    location === "/payouts" || location === "/contracts" || location === "/finance" || location === "/financieel"
  );

  // Fetch lead count for badge
  const { data: leadsData } = useQuery<{ leads: any[] }>({
    queryKey: ["/api/leads"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/leads");
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const newLeadsCount = leadsData?.leads?.filter((l: any) => l.status === "nieuw" || l.status === "new").length || 0;

  const handleLogin = () => {
    window.location.href = "/";
  };

  const handleLogout = () => {
    logout();
  };

  const getUserInitials = () => {
    if (!user) return "?";
    if (user.displayName) {
      const parts = user.displayName.split(" ");
      return parts.map(p => p[0]).join("").toUpperCase().slice(0, 2);
    }
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || "?";
  };

  const getUserDisplayName = () => {
    if (!user) return "";
    if (user.displayName) return user.displayName;
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username || user.email || "";
  };

  const isActive = (url: string) => {
    return location === url || location.startsWith(url + "/");
  };

  const canViewItem = (item: MenuItem): boolean => {
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) return true;
    if (item.anyPermission) {
      return hasAnyPermission(...item.requiredPermissions);
    }
    return item.requiredPermissions.every(p => hasPermission(p));
  };

  const visibleMainItems = mainMenuItems.filter(canViewItem);
  const canViewOnboarding = hasAnyPermission(PERMISSIONS.VIEW_ONBOARDING, PERMISSIONS.ONBOARD_ADVERTISERS, PERMISSIONS.ONBOARD_SCREENS);
  const canViewFinance = hasPermission(PERMISSIONS.VIEW_FINANCE);
  const canViewSettings = hasAnyPermission(PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_SYSTEM_SETTINGS, PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.MANAGE_INTEGRATIONS);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/30">
      <SidebarHeader className="pb-3 pt-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground px-2">
              <img 
                src="/elevizion-logo.png" 
                alt="Elevizion" 
                className="h-5 w-auto object-contain"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {/* Home */}
              {visibleMainItems.find(i => i.url === "/dashboard") && (
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    tooltip="Home"
                    className={`h-9 rounded-lg transition-colors ${isActive("/dashboard") ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                  >
                    <Link href="/dashboard" data-testid="nav-dashboard">
                      <LayoutDashboard className="h-4 w-4" />
                      <span className="text-[13px]">Home</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Onboarding with collapsible subitems */}
              {canViewOnboarding && (
                <Collapsible open={onboardingOpen} onOpenChange={setOnboardingOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton 
                        tooltip="Onboarding"
                        className={`h-9 rounded-lg transition-colors ${(isActive("/onboarding") || isActive("/leads")) ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                      >
                        <Rocket className="h-4 w-4" />
                        <span className="text-[13px] flex-1">Onboarding</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="ml-3 mt-1 space-y-0.5 border-l border-sidebar-border/30 pl-2">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild className={`h-8 text-[12px] rounded-md ${isActive("/leads") ? 'bg-sidebar-primary/20 text-sidebar-primary-foreground font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'}`}>
                            <Link href="/leads" data-testid="nav-leads">
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Leads</span>
                              {newLeadsCount > 0 && (
                                <Badge className="ml-auto h-4 px-1.5 text-[10px] font-medium bg-orange-500 text-white border-0">
                                  {newLeadsCount}
                                </Badge>
                              )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild className={`h-8 text-[12px] rounded-md ${isActive("/onboarding") ? 'bg-sidebar-primary/20 text-sidebar-primary-foreground font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'}`}>
                            <Link href="/onboarding" data-testid="nav-onboarding">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>Nieuw scherm</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {/* Other main items */}
              {visibleMainItems.filter(i => i.url !== "/dashboard").map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title}
                    className={`h-9 rounded-lg transition-colors ${isActive(item.url) ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                  >
                    <Link href={item.url} data-testid={`nav-${item.url.replace('/', '')}`}>
                      <item.icon className="h-4 w-4" />
                      <span className="text-[13px]">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Financieel with collapsible subitems */}
              {canViewFinance && (
                <Collapsible open={financieelOpen} onOpenChange={setFinancieelOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton 
                        tooltip="Financieel"
                        className={`h-9 rounded-lg transition-colors ${(isActive("/payouts") || isActive("/contracts") || isActive("/finance") || isActive("/financieel")) ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                      >
                        <Euro className="h-4 w-4" />
                        <span className="text-[13px] flex-1">Financieel</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="ml-3 mt-1 space-y-0.5 border-l border-sidebar-border/30 pl-2">
                        {financieelSubItems.map((subItem) => {
                          const isSubItemActive = isActive(subItem.url) || (subItem.url === "/payouts" && isActive("/financieel"));
                          return (
                            <SidebarMenuSubItem key={subItem.url}>
                              <SidebarMenuSubButton asChild className={`h-8 text-[12px] rounded-md ${isSubItemActive ? 'bg-sidebar-primary/20 text-sidebar-primary-foreground font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30'}`}>
                                <Link href={subItem.url} data-testid={`nav-${subItem.url.replace('/', '')}`}>
                                  <subItem.icon className="h-3.5 w-3.5" />
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Administrator Section */}
        {canViewSettings && (
          <>
            <SidebarSeparator className="my-3 opacity-30" />
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 px-3 mb-1">
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Instellingen"
                      className={`h-9 rounded-lg transition-colors ${isActive("/settings") ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                    >
                      <Link href="/settings" data-testid="nav-settings">
                        <Settings className="h-4 w-4" />
                        <span className="text-[13px]">Instellingen</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Systeemcheck"
                      className={`h-9 rounded-lg transition-colors ${isActive("/system-health") ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                    >
                      <Link href="/system-health" data-testid="nav-system-health">
                        <Activity className="h-4 w-4" />
                        <span className="text-[13px]">Systeemcheck</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Publicatie Wachtrij"
                      className={`h-9 rounded-lg transition-colors ${isActive("/publish-queue") ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
                    >
                      <Link href="/publish-queue" data-testid="nav-publish-queue">
                        <Send className="h-4 w-4" />
                        <span className="text-[13px]">Publicatie Wachtrij</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      
      <SidebarFooter className="pt-2 pb-3 border-t border-sidebar-border/20">
        <SidebarMenu className="gap-0.5">
          {isAuthenticated && user ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton className="cursor-default h-9 hover:bg-transparent">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-[10px] bg-sidebar-primary/20 text-sidebar-primary">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-[12px] text-sidebar-foreground/80">{getUserDisplayName()}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} data-testid="button-logout" className="h-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg">
                  <LogOut className="h-4 w-4" />
                  <span className="text-[12px]">Uitloggen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogin} data-testid="button-login" disabled={isLoading} className="h-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg">
                <LogIn className="h-4 w-4" />
                <span className="text-[13px]">{isLoading ? "Laden..." : "Inloggen"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
