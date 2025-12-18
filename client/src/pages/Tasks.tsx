import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  User, 
  Users, 
  ChevronDown, 
  Building2, 
  Wrench, 
  ShoppingCart,
  AlertCircle,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Task } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  open: { label: "Open", icon: Circle, color: "bg-gray-100 text-gray-800" },
  in_progress: { label: "Bezig", icon: Clock, color: "bg-blue-100 text-blue-800" },
  completed: { label: "Afgerond", icon: CheckCircle2, color: "bg-green-100 text-green-800" },
  cancelled: { label: "Geannuleerd", icon: AlertCircle, color: "bg-red-100 text-red-800" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  laag: { label: "Laag", color: "bg-gray-100 text-gray-600" },
  normaal: { label: "Normaal", color: "bg-blue-100 text-blue-700" },
  hoog: { label: "Hoog", color: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

const taskTypeConfig: Record<string, { label: string; icon: any }> = {
  installatie: { label: "Installatie", icon: Wrench },
  inkoop: { label: "Inkoop", icon: ShoppingCart },
  administratie: { label: "Administratie", icon: Building2 },
  overig: { label: "Overig", icon: Circle },
};

function TaskCard({ task, onStatusChange, isUpdating }: { task: Task; onStatusChange: (id: string, status: string) => void; isUpdating?: boolean }) {
  const statusInfo = statusConfig[task.status] || statusConfig.open;
  const priorityInfo = priorityConfig[task.priority || "normaal"] || priorityConfig.normaal;
  const typeInfo = taskTypeConfig[task.taskType || "overig"] || taskTypeConfig.overig;
  const StatusIcon = statusInfo.icon;
  const TypeIcon = typeInfo.icon;

  const isOpen = task.status === "open";
  const isInProgress = task.status === "in_progress";

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`task-card-${task.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-1 p-2 rounded-lg ${task.taskType === "installatie" ? "bg-blue-100" : task.taskType === "inkoop" ? "bg-amber-100" : "bg-gray-100"}`}>
            <TypeIcon className={`h-5 w-5 ${task.taskType === "installatie" ? "text-blue-700" : task.taskType === "inkoop" ? "text-amber-700" : "text-gray-700"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{task.title}</h3>
              <Badge className={priorityInfo.color} variant="secondary">
                {priorityInfo.label}
              </Badge>
              <Badge variant="outline" className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
            </div>
            
            {task.description && (
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                {task.description}
              </p>
            )}
            
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
              {task.assignedToRole && (
                <Badge variant="outline" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  {task.assignedToRole === "ops" ? "Bouwvakker" : task.assignedToRole === "admin" ? "Inkoop" : task.assignedToRole}
                </Badge>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString("nl-NL")}
                </span>
              )}
              <span>
                {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true, locale: nl })}
              </span>
            </div>

            <div className="flex gap-2 mt-4">
              {isOpen && (
                <Button 
                  size="sm"
                  onClick={() => onStatusChange(task.id, "in_progress")}
                  disabled={isUpdating}
                  data-testid={`button-start-task-${task.id}`}
                >
                  {isUpdating ? (
                    <div className="animate-spin h-4 w-4 mr-1 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Clock className="h-4 w-4 mr-1" />
                  )}
                  Start
                </Button>
              )}
              {isInProgress && (
                <Button 
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => onStatusChange(task.id, "completed")}
                  disabled={isUpdating}
                  data-testid={`button-complete-task-${task.id}`}
                >
                  {isUpdating ? (
                    <div className="animate-spin h-4 w-4 mr-1 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Afronden
                </Button>
              )}
              {(isOpen || isInProgress) && (
                <Select 
                  value={task.status} 
                  onValueChange={(value) => onStatusChange(task.id, value)}
                  disabled={isUpdating}
                >
                  <SelectTrigger className="w-[130px] h-8">
                    <ChevronDown className="h-4 w-4" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([key, config]) => {
                      const Icon = config.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {config.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TasksPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks");
      return res.json();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      setUpdatingTaskId(id);
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Taakstatus bijgewerkt" });
      setUpdatingTaskId(null);
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
      setUpdatingTaskId(null);
    },
  });

  const handleStatusChange = (id: string, status: string) => {
    updateTaskMutation.mutate({ id, status });
  };

  const filteredTasks = tasks.filter(task => {
    if (roleFilter === "all") return true;
    return task.assignedToRole === roleFilter;
  });

  const openTasks = filteredTasks.filter(t => t.status === "open" || t.status === "in_progress");
  const completedTasks = filteredTasks.filter(t => t.status === "completed");

  const installatieCount = tasks.filter(t => t.taskType === "installatie" && t.status !== "completed").length;
  const inkoopCount = tasks.filter(t => t.taskType === "inkoop" && t.status !== "completed").length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Taken</h1>
          <p className="text-muted-foreground">Beheer installatie, inkoop en andere taken</p>
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-role-filter">
            <SelectValue placeholder="Filter op rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle taken</SelectItem>
            <SelectItem value="ops">Installatie (ops)</SelectItem>
            <SelectItem value="admin">Inkoop (admin)</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <Wrench className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{installatieCount}</p>
                <p className="text-sm text-muted-foreground">Installaties</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <ShoppingCart className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inkoopCount}</p>
                <p className="text-sm text-muted-foreground">Inkoop</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-full">
                <Clock className="h-5 w-5 text-orange-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{openTasks.length}</p>
                <p className="text-sm text-muted-foreground">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-full">
                <CheckCircle2 className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedTasks.length}</p>
                <p className="text-sm text-muted-foreground">Afgerond</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="open" className="w-full">
        <TabsList>
          <TabsTrigger value="open" data-testid="tab-open">Open ({openTasks.length})</TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">Afgerond ({completedTasks.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="open" className="mt-4">
          {openTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="font-medium text-lg">Geen openstaande taken</h3>
                <p className="text-muted-foreground">Alle taken zijn afgerond!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {openTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onStatusChange={handleStatusChange}
                  isUpdating={updatingTaskId === task.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="completed" className="mt-4">
          {completedTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Circle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium text-lg">Nog geen afgeronde taken</h3>
                <p className="text-muted-foreground">Afgeronde taken verschijnen hier</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {completedTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onStatusChange={handleStatusChange}
                  isUpdating={updatingTaskId === task.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
