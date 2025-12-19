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
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const menuItems = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Onboarding", url: "/onboarding", icon: Rocket },
  { title: "Schermen", url: "/screens", icon: Monitor },
  { title: "Adverteerders", url: "/advertisers", icon: Users },
  { title: "Plaatsingen", url: "/placements", icon: Target },
  { title: "Instellingen", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const getUserInitials = () => {
    if (!user) return "?";
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
  };

  const getUserDisplayName = () => {
    if (!user) return "";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "";
  };

  const isActive = (url: string) => {
    return location === url || location.startsWith(url + "/");
  };

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
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title}
                    className={`h-9 ${isActive(item.url) ? 'bg-muted/40 font-medium' : 'hover:bg-muted/30'}`}
                  >
                    <Link href={item.url}>
                      <item.icon className={`h-4 w-4 ${isActive(item.url) ? 'text-primary' : ''}`} />
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
