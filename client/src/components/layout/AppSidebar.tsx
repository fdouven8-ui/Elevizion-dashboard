import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/models/auth";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermissions?: string[];
  anyPermission?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard, requiredPermissions: [PERMISSIONS.VIEW_HOME] },
  { title: "Onboarding", url: "/onboarding", icon: Rocket, requiredPermissions: [PERMISSIONS.VIEW_ONBOARDING, PERMISSIONS.ONBOARD_ADVERTISERS, PERMISSIONS.ONBOARD_SCREENS], anyPermission: true },
  { title: "Schermen", url: "/screens", icon: Monitor, requiredPermissions: [PERMISSIONS.VIEW_SCREENS] },
  { title: "Adverteerders", url: "/advertisers", icon: Users, requiredPermissions: [PERMISSIONS.VIEW_ADVERTISERS] },
  { title: "Plaatsingen", url: "/placements", icon: Target, requiredPermissions: [PERMISSIONS.VIEW_PLACEMENTS] },
  { title: "Financieel", url: "/finance", icon: Euro, requiredPermissions: [PERMISSIONS.VIEW_FINANCE] },
  { title: "Instellingen", url: "/settings", icon: Settings, requiredPermissions: [PERMISSIONS.MANAGE_USERS, PERMISSIONS.EDIT_SYSTEM_SETTINGS, PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.MANAGE_INTEGRATIONS], anyPermission: true },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading, logout, hasPermission, hasAnyPermission } = useAuth();

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

  const visibleMenuItems = menuItems.filter(canViewItem);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <img 
                src="/elevizion-logo.png" 
                alt="Elevizion" 
                className="h-7 w-auto object-contain"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title}
                    className={`h-9 rounded-lg transition-all ${isActive(item.url) ? 'bg-primary/10 font-medium border-l-2 border-primary' : 'hover:bg-muted/30'}`}
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
      </SidebarContent>
      <SidebarFooter className="pt-2 pb-3">
        <SidebarMenu className="gap-0.5">
          {isAuthenticated && user ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton className="cursor-default h-9">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-[10px]">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{getUserDisplayName()}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} data-testid="button-logout" className="h-9 hover:bg-muted/30">
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">Uitloggen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogin} data-testid="button-login" disabled={isLoading} className="h-9 hover:bg-muted/30">
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
