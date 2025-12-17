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
import { Download } from "lucide-react";

export default function Billing() {
  const { invoices, advertisers } = useAppData();

  const getAdvertiserName = (id: string) => advertisers.find(a => a.id === id)?.companyName || "Onbekend";

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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Facturatie</h1>
          <p className="text-muted-foreground">Facturen en betalingsstatus.</p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factuurnummer</TableHead>
              <TableHead>Adverteerder</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Bedrag (incl. BTW)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.id}</TableCell>
                <TableCell className="font-medium">{getAdvertiserName(inv.advertiserId)}</TableCell>
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
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
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
