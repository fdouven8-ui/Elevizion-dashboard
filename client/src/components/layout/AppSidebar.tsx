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
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Monitor,
  Users,
  MapPin,
  Calendar,
  CreditCard,
  Banknote,
  Settings,
  LogOut,
  LogIn,
  CalendarCheck,
  FileText,
  AlertTriangle,
  Rocket,
  Download,
  BookOpen,
  Megaphone,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const mainItems = [
  { title: "Overzicht", url: "/dashboard", icon: LayoutDashboard },
  { title: "Acquisitie", url: "/sales", icon: UserPlus },
  { title: "Taken", url: "/tasks", icon: ClipboardList },
  { title: "Advertenties", url: "/advertenties", icon: Megaphone },
  { title: "Schermen", url: "/screens", icon: Monitor },
  { title: "Monitoring", url: "/monitoring", icon: AlertTriangle },
];

const adminItems = [
  { title: "Adverteerders", url: "/advertisers", icon: Users },
  { title: "Locaties", url: "/locations", icon: MapPin },
  { title: "Contracten", url: "/contracts", icon: Calendar },
];

const financialItems = [
  { title: "Facturatie", url: "/billing", icon: CreditCard },
  { title: "Uitbetalingen", url: "/payouts", icon: Banknote },
  { title: "Maandafsluiting", url: "/month-close", icon: CalendarCheck },
  { title: "Rapportages", url: "/reports", icon: FileText },
];

const settingsItems = [
  { title: "Onboarding", url: "/onboarding", icon: Rocket },
  { title: "Gebruikers", url: "/users", icon: Users },
  { title: "Backup", url: "/backup", icon: Download },
  { title: "Handleiding", url: "/handleiding", icon: BookOpen },
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

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <img 
                src="/elevizion-logo.png" 
                alt="Elevizion" 
                className="h-8 w-auto object-contain"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dagelijks</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={location === item.url}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Beheer</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={location === item.url}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Financieel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {financialItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={location === item.url}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Instellingen</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} isActive={location === item.url}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {isAuthenticated && user ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton className="cursor-default">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getUserDisplayName()} />
                    <AvatarFallback className="text-xs">{getUserInitials()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{getUserDisplayName()}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleLogout} data-testid="button-logout">
                  <LogOut />
                  <span>Uitloggen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogin} data-testid="button-login" disabled={isLoading}>
                <LogIn />
                <span>{isLoading ? "Laden..." : "Inloggen"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
