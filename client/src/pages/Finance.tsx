import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { 
  Euro, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  CreditCard,
  Banknote
} from "lucide-react";

interface Invoice {
  id: string;
  advertiserName: string;
  invoiceNumber: string;
  amount: string;
  status: string;
  dueDate: string;
  paidDate?: string;
  daysOverdue?: number;
}

interface FinanceStats {
  totalPaid: number;
  totalOpen: number;
  totalOverdue: number;
  monthlyRevenue: number;
}

export default function Finance() {
  const { data: stats, isLoading: statsLoading } = useQuery<FinanceStats>({
    queryKey: ["/api/finance/stats"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/finance/stats");
        return res.json();
      } catch {
        return { totalPaid: 0, totalOpen: 0, totalOverdue: 0, monthlyRevenue: 0 };
      }
    },
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/invoices");
        return res.json();
      } catch {
        return [];
      }
    },
  });

  const formatCurrency = (amount: number | string) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(Number(amount));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("nl-NL");
  };

  const getStatusBadge = (status: string, daysOverdue?: number) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-100 text-green-800">Betaald</Badge>;
      case "sent":
        return <Badge className="bg-blue-100 text-blue-800">Verzonden</Badge>;
      case "overdue":
        return (
          <Badge className="bg-red-100 text-red-800">
            {daysOverdue ? `${daysOverdue}d achterstallig` : "Achterstallig"}
          </Badge>
        );
      case "draft":
        return <Badge variant="outline">Concept</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const paidInvoices = invoices.filter(i => i.status === "paid");
  const openInvoices = invoices.filter(i => i.status === "sent");
  const overdueInvoices = invoices.filter(i => i.status === "overdue");

  const exportCSV = () => {
    const headers = ["Factuurnummer", "Adverteerder", "Bedrag", "Status", "Vervaldatum"];
    const rows = invoices.map(i => [
      i.invoiceNumber,
      i.advertiserName,
      i.amount,
      i.status,
      i.dueDate
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturen-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Financieel</h1>
          <p className="text-muted-foreground">Read-only overzicht van Moneybird data</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" asChild>
            <a href="https://moneybird.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Moneybird
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-green-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Betaald</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats?.totalPaid || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Deze maand ontvangen</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Openstaand</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(stats?.totalOpen || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Wacht op betaling</p>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Achterstallig</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats?.totalOverdue || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Cash at risk</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maandomzet</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.monthlyRevenue || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Verwachte omzet</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Facturen</CardTitle>
          <CardDescription>Overzicht van alle facturen vanuit Moneybird</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overdue">
            <TabsList>
              <TabsTrigger value="overdue" className="gap-2">
                <AlertTriangle className="h-4 w-4" />
                Achterstallig ({overdueInvoices.length})
              </TabsTrigger>
              <TabsTrigger value="open" className="gap-2">
                <Clock className="h-4 w-4" />
                Open ({openInvoices.length})
              </TabsTrigger>
              <TabsTrigger value="paid" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Betaald ({paidInvoices.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overdue" className="mt-4">
              {invoicesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : overdueInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                  <p>Geen achterstallige facturen!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factuurnummer</TableHead>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Bedrag</TableHead>
                      <TableHead>Vervaldatum</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.advertiserName}</TableCell>
                        <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                        <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status, invoice.daysOverdue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="open" className="mt-4">
              {invoicesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : openInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Geen openstaande facturen</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factuurnummer</TableHead>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Bedrag</TableHead>
                      <TableHead>Vervaldatum</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.advertiserName}</TableCell>
                        <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                        <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="paid" className="mt-4">
              {invoicesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : paidInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Banknote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nog geen betaalde facturen</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factuurnummer</TableHead>
                      <TableHead>Adverteerder</TableHead>
                      <TableHead>Bedrag</TableHead>
                      <TableHead>Betaald op</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.advertiserName}</TableCell>
                        <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                        <TableCell>{invoice.paidDate ? formatDate(invoice.paidDate) : "-"}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
