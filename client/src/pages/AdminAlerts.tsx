import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle, AlertTriangle, Info, X, RefreshCw, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Alert {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  source: string;
  message: string;
  details?: any;
  acknowledged: boolean;
  createdAt: string;
  duplicateCount: number;
}

interface AlertStats {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  active: number;
}

const severityConfig = {
  critical: { icon: AlertCircle, color: "bg-red-600", textColor: "text-red-600", label: "Kritiek" },
  error: { icon: X, color: "bg-red-500", textColor: "text-red-500", label: "Error" },
  warning: { icon: AlertTriangle, color: "bg-yellow-500", textColor: "text-yellow-600", label: "Waarschuwing" },
  info: { icon: Info, color: "bg-blue-500", textColor: "text-blue-600", label: "Info" },
};

const categoryLabels: Record<string, string> = {
  yodeck_api: "Yodeck API",
  yodeck_publish: "Yodeck Publish",
  yodeck_sync: "Yodeck Sync",
  upload: "Upload",
  integration: "Integratie",
  system: "Systeem",
};

export default function AdminAlerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: alertsData, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/alerts", severityFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter !== "all") params.append("severity", severityFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      const response = await api.get(`/api/admin/alerts?${params}`);
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await api.post(`/api/admin/alerts/${alertId}/acknowledge`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      toast({ title: "Alert bevestigd", description: "Het alert is gemarkeerd als opgelost" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Fout", 
        description: error.response?.data?.error || "Kon alert niet bevestigen",
        variant: "destructive"
      });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post("/api/admin/alerts/cleanup");
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      toast({ title: "Opruiming voltooid", description: data.message });
    },
  });

  const alerts: Alert[] = alertsData?.alerts || [];
  const stats: AlertStats = alertsData?.stats || { total: 0, bySeverity: {}, byCategory: {}, active: 0 };

  const activeAlerts = alerts.filter(a => !a.acknowledged);
  const criticalAlerts = activeAlerts.filter(a => a.severity === "critical");

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Systeem Alerts
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor systeemfouten en integratieproblemen
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Vernieuwen
          </Button>
          <Button variant="outline" onClick={() => cleanupMutation.mutate()} disabled={cleanupMutation.isPending}>
            Oude alerts opruimen
          </Button>
        </div>
      </div>

      {/* Critical Alert Banner */}
      {criticalAlerts.length > 0 && (
        <Card className="mb-6 border-red-600 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-red-600 mt-1" />
              <div>
                <h3 className="font-semibold text-red-900">
                  {criticalAlerts.length} Kritieke Probleem{criticalAlerts.length > 1 ? "en" : ""} Actief
                </h3>
                <p className="text-red-800 mt-1">
                  Er zijn kritieke fouten die onmiddellijke aandacht vereisen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Actieve Alerts</p>
                <p className="text-3xl font-bold">{stats.active}</p>
              </div>
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Kritiek</p>
                <p className="text-3xl font-bold text-red-600">{stats.bySeverity.critical || 0}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-3xl font-bold text-red-500">{stats.bySeverity.error || 0}</p>
              </div>
              <X className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Waarschuwingen</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.bySeverity.warning || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="w-full md:w-48">
              <label className="text-sm font-medium mb-2 block">Ernst</label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle ernsten" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="critical">Kritiek</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warning">Waarschuwing</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <label className="text-sm font-medium mb-2 block">Categorie</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle categorieën" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {alertsData?.categories?.map((cat: string) => (
                    <SelectItem key={cat} value={cat}>
                      {categoryLabels[cat] || cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts List */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            Actief ({activeAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            Alle ({alerts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-muted-foreground mt-2">Alerts laden...</p>
              </CardContent>
            </Card>
          ) : activeAlerts.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
                <h3 className="font-semibold mt-4">Geen actieve alerts</h3>
                <p className="text-muted-foreground mt-1">
                  Alle systemen functioneren normaal
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={() => acknowledgeMutation.mutate(alert.id)}
                    isAcknowledging={acknowledgeMutation.isPending}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-muted-foreground mt-2">Alerts laden...</p>
              </CardContent>
            </Card>
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
                <h3 className="font-semibold mt-4">Geen alerts gevonden</h3>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={() => acknowledgeMutation.mutate(alert.id)}
                    isAcknowledging={acknowledgeMutation.isPending}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AlertCardProps {
  alert: Alert;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
}

function AlertCard({ alert, onAcknowledge, isAcknowledging }: AlertCardProps) {
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <Card className={alert.acknowledged ? "opacity-60" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${config.color} bg-opacity-10`}>
            <Icon className={`h-5 w-5 ${config.textColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={config.color}>
                {config.label}
              </Badge>
              <Badge variant="outline">
                {categoryLabels[alert.category] || alert.category}
              </Badge>
              {alert.duplicateCount > 0 && (
                <Badge variant="secondary">
                  {alert.duplicateCount + 1}x
                </Badge>
              )}
              {alert.acknowledged && (
                <Badge variant="outline" className="border-green-500 text-green-600">
                  Bevestigd
                </Badge>
              )}
            </div>
            <p className="font-medium mt-2">{alert.message}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Bron: {alert.source}
            </p>
            {alert.details && (
              <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
                {JSON.stringify(alert.details, null, 2)}
              </pre>
            )}
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: nl })}
              </p>
              {!alert.acknowledged && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onAcknowledge}
                  disabled={isAcknowledging}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Bevestigen
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
