import { useAppData } from "@/hooks/use-app-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, Banknote, ArrowRight, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function Billing() {
  const { invoices, advertisers, contracts } = useAppData();

  const getAdvertiser = (id: string) => advertisers.find(a => a.id === id);
  const getAdvertiserName = (id: string) => getAdvertiser(id)?.companyName || "Onbekend";

  const getStatusVariant = (status: string) => {
    switch(status) {
      case 'paid': return 'default';
      case 'sent': return 'secondary';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'paid': return 'Betaald';
      case 'sent': return 'Verzonden';
      case 'overdue': return 'Achterstallig';
      case 'draft': return 'Concept';
      default: return status;
    }
  };

  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const paidInvoices = invoices.filter(i => i.status === 'paid');
  const totalUnpaid = unpaidInvoices.reduce((sum, i) => sum + Number(i.amountIncVat || 0), 0);
  
  const advertisersWithSepa = advertisers.filter(a => a.sepaMandate && a.iban);
  const advertisersWithoutSepa = advertisers.filter(a => a.status === 'active' && (!a.sepaMandate || !a.iban));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading" data-testid="text-page-title">Facturatie</h1>
          <p className="text-muted-foreground">Facturen en betalingsstatus.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <Banknote className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-2xl font-bold">€{totalUnpaid.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{unpaidInvoices.length} openstaand</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <Check className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{paidInvoices.length}</p>
            <p className="text-sm text-muted-foreground">Betaald deze periode</p>
          </CardContent>
        </Card>

        <Card className={advertisersWithoutSepa.length > 0 ? "border-amber-200" : ""}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <CreditCard className={`h-5 w-5 ${advertisersWithoutSepa.length > 0 ? 'text-amber-500' : 'text-green-500'}`} />
              {advertisersWithoutSepa.length > 0 && (
                <Link href="/advertisers">
                  <Button variant="ghost" size="sm" className="h-6 text-xs">
                    Instellen
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
            <p className="text-2xl font-bold">{advertisersWithSepa.length}/{advertisers.filter(a => a.status === 'active').length}</p>
            <p className="text-sm text-muted-foreground">Met automatisch incasso</p>
          </CardContent>
        </Card>
      </div>

      {advertisersWithoutSepa.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900">
                    {advertisersWithoutSepa.length} adverteerder{advertisersWithoutSepa.length !== 1 ? 's' : ''} zonder automatisch incasso
                  </p>
                  <p className="text-sm text-amber-700">
                    {advertisersWithoutSepa.map(a => a.companyName).join(', ')}
                  </p>
                </div>
              </div>
              <Link href="/advertisers">
                <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-100">
                  Incasso instellen
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factuurnummer</TableHead>
              <TableHead>Adverteerder</TableHead>
              <TableHead>Betaalmethode</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Bedrag (incl. BTW)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const advertiser = getAdvertiser(inv.advertiserId);
              const hasSepa = advertiser?.sepaMandate && advertiser?.iban;
              
              return (
                <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                  <TableCell className="font-mono text-xs">{inv.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{getAdvertiserName(inv.advertiserId)}</TableCell>
                  <TableCell>
                    {hasSepa ? (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs text-green-700">Incasso</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Overboeking</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {inv.periodStart} - {inv.periodEnd}
                  </TableCell>
                  <TableCell className="text-right font-mono">€{parseFloat(inv.amountIncVat).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(inv.status) as any}>
                      {getStatusLabel(inv.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" data-testid={`button-download-${inv.id}`}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Geen facturen gevonden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
