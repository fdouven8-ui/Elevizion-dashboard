import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Settings,
  Activity,
  Send,
  PlaySquare,
  LayoutGrid,
  Bug,
  Database,
  Mail,
  Shield,
  RefreshCw,
  FileText,
  Wrench
} from "lucide-react";

const adminTools = [
  { title: "Instellingen", description: "Systeeminstellingen en configuratie", url: "/settings", icon: Settings },
  { title: "Systeemcheck", description: "Gezondheidscontroles en diagnostiek", url: "/system-health", icon: Activity },
  { title: "Publicatie Wachtrij", description: "Beheer publicatie-taken", url: "/publish-queue", icon: Send },
  { title: "Video Beoordelen", description: "Beoordeel ingediende video's", url: "/video-review", icon: PlaySquare },
  { title: "Layouts", description: "Beheer Yodeck layouts", url: "/admin/layouts", icon: LayoutGrid },
  { title: "Yodeck Debug", description: "Yodeck API debugging tools", url: "/admin/yodeck-debug", icon: Bug },
  { title: "Data Gezondheid", description: "Data integriteitscontroles", url: "/data-health", icon: Database },
  { title: "Email Center", description: "E-mail templates en logs", url: "/email-center", icon: Mail },
  { title: "Entiteiten", description: "Beheer systeem-entiteiten", url: "/entities", icon: Shield },
  { title: "Sync Logs", description: "Synchronisatie logboeken", url: "/sync-logs", icon: RefreshCw },
  { title: "Content Inventaris", description: "Beheer content items", url: "/content-inventory", icon: FileText },
  { title: "Playlist Mapping", description: "Koppel playlists aan locaties", url: "/playlist-mapping", icon: Wrench },
];

export default function AdminIndex() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            Admin Tools
          </h1>
          <p className="text-muted-foreground mt-1">
            Geavanceerde beheertools en diagnostiek
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Alleen voor beheerders
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminTools.map((tool) => (
          <Link key={tool.url} href={tool.url}>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full" data-testid={`admin-tool-${tool.url.replace(/\//g, '-')}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <tool.icon className="h-5 w-5 text-muted-foreground" />
                  {tool.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
