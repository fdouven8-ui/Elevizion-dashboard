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
  { title: "Financieel", url: "/finance", icon: Euro, requiredPermissions: [PERMISSIONS.VIEW_FINANCE] },
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
  const canViewSettings = hasAnyPermission(PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_SYSTEM_SETTINGS, PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.MANAGE_INTEGRATIONS);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <img 
                src="/elevizion-logo.png" 
                alt="Elevizion" 
                className="h-6 w-auto object-contain"
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
                    className={`h-8 rounded-md transition-all ${isActive("/dashboard") ? 'bg-primary/10 font-medium border-l-2 border-primary' : 'hover:bg-muted/30'}`}
                  >
                    <Link href="/dashboard" data-testid="nav-dashboard">
                      <LayoutDashboard className={`h-4 w-4 ${isActive("/dashboard") ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="text-sm">Home</span>
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
                        className={`h-8 rounded-md transition-all ${(isActive("/onboarding") || isActive("/leads")) ? 'bg-primary/10 font-medium' : 'hover:bg-muted/30'}`}
                      >
                        <Rocket className={`h-4 w-4 ${(isActive("/onboarding") || isActive("/leads")) ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-sm flex-1">Onboarding</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="ml-4 mt-1 space-y-0.5">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild className={`h-7 text-xs ${isActive("/leads") ? 'bg-muted font-medium' : ''}`}>
                            <Link href="/leads" data-testid="nav-leads">
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Leads</span>
                              {newLeadsCount > 0 && (
                                <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px] font-medium">
                                  {newLeadsCount}
                                </Badge>
                              )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild className={`h-7 text-xs ${isActive("/onboarding") ? 'bg-muted font-medium' : ''}`}>
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
                    className={`h-8 rounded-md transition-all ${isActive(item.url) ? 'bg-primary/10 font-medium border-l-2 border-primary' : 'hover:bg-muted/30'}`}
                  >
                    <Link href={item.url} data-testid={`nav-${item.url.replace('/', '')}`}>
                      <item.icon className={`h-4 w-4 ${isActive(item.url) ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="text-sm">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Administrator Section */}
        {canViewSettings && (
          <>
            <SidebarSeparator className="my-2" />
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2">
                Administrator
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Instellingen"
                      className={`h-8 rounded-md transition-all ${isActive("/settings") ? 'bg-primary/10 font-medium border-l-2 border-primary' : 'hover:bg-muted/30'}`}
                    >
                      <Link href="/settings" data-testid="nav-settings">
                        <Settings className={`h-4 w-4 ${isActive("/settings") ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-sm">Instellingen</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      
      <SidebarFooter className="pt-2 pb-3">
        <SidebarMenu className="gap-0.5">
          {isAuthenticated && user ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton className="cursor-default h-8">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-[10px]">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs">{getUserDisplayName()}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} data-testid="button-logout" className="h-8 hover:bg-muted/30">
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">Uitloggen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogin} data-testid="button-login" disabled={isLoading} className="h-8 hover:bg-muted/30">
                <LogIn className="h-4 w-4" />
                <span className="text-sm">{isLoading ? "Laden..." : "Inloggen"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
