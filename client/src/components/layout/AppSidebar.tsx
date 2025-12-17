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
  Command,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const items = [
  {
    title: "Overzicht",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Schermen",
    url: "/screens",
    icon: Monitor,
  },
  {
    title: "Adverteerders",
    url: "/advertisers",
    icon: Users,
  },
  {
    title: "Locaties",
    url: "/locations",
    icon: MapPin,
  },
  {
    title: "Contracten",
    url: "/contracts",
    icon: Calendar,
  },
  {
    title: "Facturatie",
    url: "/billing",
    icon: CreditCard,
  },
  {
    title: "Uitbetalingen",
    url: "/payouts",
    icon: Banknote,
  },
  {
    title: "Integraties",
    url: "/integrations",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Command className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold font-heading">Elevizion</span>
                <span className="truncate text-xs">Beheerdashboard</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Beheer</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
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
          <SidebarMenuItem>
            <SidebarMenuButton>
              <LogOut />
              <span>Uitloggen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
