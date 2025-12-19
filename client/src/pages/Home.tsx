import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Wifi,
  WifiOff,
  Target,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface ControlRoomStats {
  screensOnline: number;
  screensTotal: number;
  screensOffline: number;
  activePlacements: number;
  payingAdvertisers: number;
}

export default function Home() {
  const { data: stats, isLoading } = useQuery<ControlRoomStats>({
    queryKey: ["/api/control-room/stats"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/control-room/stats");
        return res.json();
      } catch {
        return {
          screensOnline: 0,
          screensTotal: 0,
          screensOffline: 0,
          activePlacements: 0,
          payingAdvertisers: 0,
        };
      }
    },
    refetchInterval: 30000,
  });

  const kpiTiles = [
    {
      id: "online",
      title: "Schermen online",
      value: stats?.screensOnline || 0,
      subtitle: `/ ${stats?.screensTotal || 0}`,
      icon: Wifi,
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
      link: "/screens?status=online",
    },
    {
      id: "offline",
      title: "Schermen offline",
      value: stats?.screensOffline || 0,
      icon: WifiOff,
      iconColor: "text-muted-foreground",
      bgColor: "",
      link: "/screens?status=offline",
    },
    {
      id: "ads",
      title: "Ads online",
      value: stats?.activePlacements || 0,
      icon: Target,
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
      link: "/placements?status=active",
    },
    {
      id: "advertisers",
      title: "Actief betalende adverteerders",
      value: stats?.payingAdvertisers || 0,
      icon: Users,
      iconColor: "text-purple-600",
      bgColor: "bg-purple-50",
      link: "/advertisers?filter=paying",
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Home</h1>
        <p className="text-muted-foreground">Overzicht van je Elevizion netwerk</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiTiles.map((tile) => (
          <Link key={tile.id} href={tile.link}>
            <Card 
              className={`${tile.bgColor} cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] border`}
              data-testid={`kpi-${tile.id}`}
            >
              <CardContent className="pt-5 pb-5">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">{tile.title}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          {tile.value}
                        </span>
                        {tile.subtitle && (
                          <span className="text-lg text-muted-foreground">{tile.subtitle}</span>
                        )}
                      </div>
                    </div>
                    <div className={`p-3 rounded-full ${tile.bgColor || 'bg-muted/50'}`}>
                      <tile.icon className={`h-6 w-6 ${tile.iconColor}`} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
