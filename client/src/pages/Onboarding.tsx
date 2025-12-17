import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle, 
  Building2,
  FileImage,
  CheckCheck,
  LayoutGrid,
  Monitor,
  CreditCard,
  FileText,
  Rocket,
  BarChart3,
  PlayCircle,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";

interface OnboardingTask {
  id: string;
  checklistId: string;
  taskType: string;
  status: string;
  ownerUserId: string | null;
  notes: string | null;
  dueDate: string | null;
  completedAt: string | null;
}

interface OnboardingChecklist {
  id: string;
  advertiserId: string;
  status: string;
  completedAt: string | null;
  tasks: OnboardingTask[];
}

interface Advertiser {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  status: string;
}

const taskConfig: Record<string, { label: string; description: string; icon: React.ElementType }> = {
  creative_received: {
    label: "Creative Ontvangen",
    description: "Advertentiemateriaal ontvangen van adverteerder",
    icon: FileImage,
  },
  creative_approved: {
    label: "Creative Goedgekeurd",
    description: "Materiaal voldoet aan specificaties en kwaliteitseisen",
    icon: CheckCheck,
  },
  campaign_created: {
    label: "Campagne Aangemaakt",
    description: "Campagne/contract geconfigureerd in systeem",
    icon: LayoutGrid,
  },
  scheduled_on_screens: {
    label: "Ingepland op Schermen",
    description: "Advertentie toegewezen aan schermen en playlist",
    icon: Monitor,
  },
  billing_configured: {
    label: "Facturatie Ingesteld",
    description: "Facturatiegegevens en betalingsschema geconfigureerd",
    icon: CreditCard,
  },
  first_invoice_sent: {
    label: "Eerste Factuur Verzonden",
    description: "Initiële factuur verstuurd naar adverteerder",
    icon: FileText,
  },
  go_live_confirmed: {
    label: "Go-Live Bevestigd",
    description: "Advertentie loopt op schermen, bevestigd door klant",
    icon: Rocket,
  },
  first_report_sent: {
    label: "Eerste Rapport Verzonden",
    description: "Proof-of-play rapport gedeeld met adverteerder",
    icon: BarChart3,
  },
};

export default function Onboarding() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<string>("");

  const { data: advertisers = [] } = useQuery<Advertiser[]>({
    queryKey: ["/api/advertisers"],
  });

  const { data: checklist, isLoading: checklistLoading } = useQuery<OnboardingChecklist | null>({
    queryKey: ["/api/advertisers", selectedAdvertiser, "onboarding"],
    queryFn: async () => {
      if (!selectedAdvertiser) return null;
      const res = await fetch(`/api/advertisers/${selectedAdvertiser}/onboarding`);
      if (!res.ok) throw new Error("Fout bij laden onboarding");
      return res.json();
    },
    enabled: !!selectedAdvertiser,
  });

  const createChecklistMutation = useMutation({
    mutationFn: async (advertiserId: string) => {
      const res = await fetch(`/api/advertisers/${advertiserId}/onboarding`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fout bij aanmaken checklist");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertisers", selectedAdvertiser, "onboarding"] });
      toast({ title: "Onboarding gestart", description: "Checklist is aangemaakt voor deze adverteerder." });
    },
    onError: () => {
      toast({ title: "Fout", description: "Kon checklist niet aanmaken.", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await fetch(`/api/onboarding-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Fout bij bijwerken taak");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertisers", selectedAdvertiser, "onboarding"] });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "doing": return <Clock className="h-5 w-5 text-yellow-500" />;
      case "blocked": return <AlertCircle className="h-5 w-5 text-red-500" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "done": 
        return <Badge className="bg-green-500/10 text-green-600">Voltooid</Badge>;
      case "doing": 
        return <Badge className="bg-yellow-500/10 text-yellow-600">Bezig</Badge>;
      case "blocked": 
        return <Badge className="bg-red-500/10 text-red-600">Geblokkeerd</Badge>;
      default: 
        return <Badge variant="secondary">Te Doen</Badge>;
    }
  };

  const tasks = checklist?.tasks || [];
  const completedTasks = tasks.filter(t => t.status === "done").length;
  const progressPercent = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  const sortedTasks = [...tasks].sort((a, b) => {
    const order = Object.keys(taskConfig);
    return order.indexOf(a.taskType) - order.indexOf(b.taskType);
  });

  const activeAdvertisers = advertisers.filter(a => a.status === "active");

  return (
    <div className="space-y-6" data-testid="onboarding-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Onboarding Wizard</h1>
          <p className="text-muted-foreground">
            Stapsgewijze begeleiding voor nieuwe adverteerders
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Selecteer Adverteerder</CardTitle>
          <CardDescription>
            Kies een adverteerder om de onboarding voortgang te bekijken of te starten
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Select value={selectedAdvertiser} onValueChange={setSelectedAdvertiser}>
                <SelectTrigger data-testid="select-advertiser">
                  <SelectValue placeholder="Selecteer een adverteerder" />
                </SelectTrigger>
                <SelectContent>
                  {activeAdvertisers.map(adv => (
                    <SelectItem key={adv.id} value={adv.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {adv.companyName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedAdvertiser && !checklist && !checklistLoading && (
              <Button
                onClick={() => createChecklistMutation.mutate(selectedAdvertiser)}
                disabled={createChecklistMutation.isPending}
                data-testid="button-start-onboarding"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Start Onboarding
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedAdvertiser && checklistLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">Laden...</div>
          </CardContent>
        </Card>
      )}

      {selectedAdvertiser && !checklistLoading && !checklist && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <PlayCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Geen onboarding gestart</h3>
              <p className="text-muted-foreground mb-4">
                Start de onboarding wizard om alle stappen te volgen voor deze adverteerder.
              </p>
              <Button
                onClick={() => createChecklistMutation.mutate(selectedAdvertiser)}
                disabled={createChecklistMutation.isPending}
                data-testid="button-start-onboarding-empty"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                {createChecklistMutation.isPending ? "Bezig..." : "Start Onboarding"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {checklist && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Voortgang</CardTitle>
                  <CardDescription>
                    {completedTasks} van {tasks.length} stappen voltooid
                  </CardDescription>
                </div>
                {progressPercent === 100 && (
                  <Badge className="bg-green-500/10 text-green-600 text-sm">
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Voltooid
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progressPercent} className="h-3" data-testid="progress-bar" />
              <p className="text-sm text-muted-foreground mt-2">
                {Math.round(progressPercent)}% voltooid
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {sortedTasks.map((task, index) => {
              const config = taskConfig[task.taskType];
              const Icon = config?.icon || Circle;
              const isLast = index === sortedTasks.length - 1;

              return (
                <Card 
                  key={task.id} 
                  className={`relative ${task.status === "done" ? "bg-muted/30" : ""}`}
                  data-testid={`task-${task.taskType}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`rounded-full p-2 ${
                          task.status === "done" 
                            ? "bg-green-500/10" 
                            : task.status === "doing"
                            ? "bg-yellow-500/10"
                            : "bg-muted"
                        }`}>
                          <Icon className={`h-5 w-5 ${
                            task.status === "done" 
                              ? "text-green-600" 
                              : task.status === "doing"
                              ? "text-yellow-600"
                              : "text-muted-foreground"
                          }`} />
                        </div>
                        {!isLast && (
                          <div className={`w-0.5 h-8 mt-2 ${
                            task.status === "done" ? "bg-green-300" : "bg-border"
                          }`} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h4 className={`font-medium ${
                              task.status === "done" ? "text-muted-foreground line-through" : ""
                            }`}>
                              {config?.label || task.taskType}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {config?.description || ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {getStatusBadge(task.status)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            variant={task.status === "done" ? "outline" : "default"}
                            size="sm"
                            onClick={() => updateTaskMutation.mutate({
                              taskId: task.id,
                              status: task.status === "done" ? "todo" : "done",
                            })}
                            disabled={updateTaskMutation.isPending}
                            data-testid={`button-toggle-${task.taskType}`}
                          >
                            {task.status === "done" ? (
                              <>
                                <Circle className="h-4 w-4 mr-1" />
                                Markeer Onvoltooid
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Markeer Voltooid
                              </>
                            )}
                          </Button>
                          {task.status !== "done" && task.status !== "doing" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateTaskMutation.mutate({
                                taskId: task.id,
                                status: "doing",
                              })}
                              disabled={updateTaskMutation.isPending}
                              data-testid={`button-start-${task.taskType}`}
                            >
                              <Clock className="h-4 w-4 mr-1" />
                              Start
                            </Button>
                          )}
                        </div>

                        {task.completedAt && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Voltooid op {format(new Date(task.completedAt), "d MMM yyyy HH:mm", { locale: nl })}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
