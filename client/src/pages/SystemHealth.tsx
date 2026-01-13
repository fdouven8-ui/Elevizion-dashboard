import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Building2, 
  Mail, 
  FileSignature, 
  CreditCard, 
  Monitor, 
  Users, 
  UserPlus, 
  MapPin,
  Play,
  Loader2,
  Info
} from "lucide-react";

type CheckStatus = "PASS" | "WARNING" | "FAIL";

interface HealthCheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, any>;
  fixSuggestion?: string;
}

interface HealthCheckGroup {
  name: string;
  icon: string;
  checks: HealthCheckResult[];
  testable: boolean;
}

interface HealthCheckResponse {
  overall: CheckStatus;
  counts: Record<CheckStatus, number>;
  groups: HealthCheckGroup[];
  timestamp: string;
}

const iconMap: Record<string, React.ReactNode> = {
  building: <Building2 className="h-5 w-5" />,
  mail: <Mail className="h-5 w-5" />,
  "file-signature": <FileSignature className="h-5 w-5" />,
  "credit-card": <CreditCard className="h-5 w-5" />,
  monitor: <Monitor className="h-5 w-5" />,
  users: <Users className="h-5 w-5" />,
  "user-plus": <UserPlus className="h-5 w-5" />,
  "map-pin": <MapPin className="h-5 w-5" />,
};

const statusIcon = (status: CheckStatus) => {
  switch (status) {
    case "PASS":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "WARNING":
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case "FAIL":
      return <XCircle className="h-4 w-4 text-red-600" />;
  }
};

const statusBadge = (status: CheckStatus) => {
  switch (status) {
    case "PASS":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">OK</Badge>;
    case "WARNING":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Waarschuwing</Badge>;
    case "FAIL":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Fout</Badge>;
  }
};

const getGroupStatus = (checks: HealthCheckResult[]): CheckStatus => {
  if (checks.some(c => c.status === "FAIL")) return "FAIL";
  if (checks.some(c => c.status === "WARNING")) return "WARNING";
  return "PASS";
};

export default function SystemHealth() {
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingMoneybird, setTestingMoneybird] = useState(false);
  const [testingYodeck, setTestingYodeck] = useState(false);
  const [testingLead, setTestingLead] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<HealthCheckResponse>({
    queryKey: ["/api/system-health"],
    refetchOnWindowFocus: false,
  });

  const testEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      setTestingEmail(true);
      const res = await fetch("/api/system-health/test/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || "Test e-mail verzonden!");
      setTestingEmail(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setTestingEmail(false);
    },
  });

  const testMoneybirdMutation = useMutation({
    mutationFn: async () => {
      setTestingMoneybird(true);
      const res = await fetch("/api/system-health/test/moneybird", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "PASS") {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      setTestingMoneybird(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setTestingMoneybird(false);
    },
  });

  const testYodeckMutation = useMutation({
    mutationFn: async () => {
      setTestingYodeck(true);
      const res = await fetch("/api/system-health/test/yodeck", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "PASS") {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      setTestingYodeck(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setTestingYodeck(false);
    },
  });

  const testLeadMutation = useMutation({
    mutationFn: async () => {
      setTestingLead(true);
      const res = await fetch("/api/system-health/test/lead", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "PASS") {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      setTestingLead(false);
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setTestingLead(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Systeemchecks worden uitgevoerd...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="system-health-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Systeemcheck</h1>
          <p className="text-muted-foreground">
            Controleer alle configuraties, integraties en workflows
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
          data-testid="button-refresh"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Vernieuwen
        </Button>
      </div>

      {data && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Algemene Status
                    {statusIcon(data.overall)}
                  </CardTitle>
                  <CardDescription>
                    Laatste check: {new Date(data.timestamp).toLocaleString("nl-NL")}
                  </CardDescription>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{data.counts.PASS}</div>
                    <div className="text-xs text-muted-foreground">OK</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{data.counts.WARNING}</div>
                    <div className="text-xs text-muted-foreground">Waarschuwing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{data.counts.FAIL}</div>
                    <div className="text-xs text-muted-foreground">Fout</div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Accordion type="multiple" className="space-y-3" defaultValue={data.groups.map((_, i) => `group-${i}`)}>
            {data.groups.map((group, groupIndex) => {
              const groupStatus = getGroupStatus(group.checks);
              
              return (
                <AccordionItem 
                  key={groupIndex} 
                  value={`group-${groupIndex}`}
                  className="border rounded-lg overflow-hidden bg-card"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        {iconMap[group.icon] || <Info className="h-5 w-5" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{group.name}</span>
                        {statusBadge(groupStatus)}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {group.checks.map((check, checkIndex) => (
                        <div 
                          key={checkIndex}
                          className="flex items-start justify-between p-3 rounded-lg bg-muted/30 border"
                          data-testid={`check-${group.icon}-${checkIndex}`}
                        >
                          <div className="flex items-start gap-3">
                            {statusIcon(check.status)}
                            <div>
                              <div className="font-medium text-sm">{check.name}</div>
                              <div className="text-sm text-muted-foreground">{check.message}</div>
                              {check.fixSuggestion && (
                                <div className="text-xs text-yellow-600 mt-1">
                                  💡 {check.fixSuggestion}
                                </div>
                              )}
                              {check.details && (
                                <div className="text-xs text-muted-foreground mt-1 font-mono">
                                  {JSON.stringify(check.details)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {group.name === "E-mail (Postmark)" && group.testable && (
                        <div className="mt-4 p-4 border rounded-lg bg-blue-50/50">
                          <div className="text-sm font-medium mb-2">Test e-mail versturen</div>
                          <div className="flex gap-2">
                            <Input
                              type="email"
                              placeholder="E-mailadres"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              className="max-w-xs"
                              data-testid="input-test-email"
                            />
                            <Button
                              size="sm"
                              onClick={() => testEmailMutation.mutate(testEmail)}
                              disabled={!testEmail || testingEmail}
                              data-testid="button-test-email"
                            >
                              {testingEmail ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-1" />
                              )}
                              Test
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {group.name === "Moneybird" && group.testable && (
                        <div className="mt-4 p-4 border rounded-lg bg-blue-50/50">
                          <div className="text-sm font-medium mb-2">Test contact aanmaken</div>
                          <Button
                            size="sm"
                            onClick={() => testMoneybirdMutation.mutate()}
                            disabled={testingMoneybird}
                            data-testid="button-test-moneybird"
                          >
                            {testingMoneybird ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Test
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            Maakt een TEST_HEALTHCHECK contact aan in Moneybird
                          </p>
                        </div>
                      )}
                      
                      {group.name === "Yodeck" && group.testable && (
                        <div className="mt-4 p-4 border rounded-lg bg-blue-50/50">
                          <div className="text-sm font-medium mb-2">Sync uitvoeren</div>
                          <Button
                            size="sm"
                            onClick={() => testYodeckMutation.mutate()}
                            disabled={testingYodeck}
                            data-testid="button-test-yodeck"
                          >
                            {testingYodeck ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Sync Now
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            Haalt schermen op (read-only, geen wijzigingen)
                          </p>
                        </div>
                      )}
                      
                      {group.name === "Leads/Formulieren" && group.testable && (
                        <div className="mt-4 p-4 border rounded-lg bg-blue-50/50">
                          <div className="text-sm font-medium mb-2">Test lead aanmaken</div>
                          <Button
                            size="sm"
                            onClick={() => testLeadMutation.mutate()}
                            disabled={testingLead}
                            data-testid="button-test-lead"
                          >
                            {testingLead ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-1" />
                            )}
                            Maak Test Lead
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            Maakt een TEST_HEALTHCHECK lead aan in de database
                          </p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </>
      )}
    </div>
  );
}
