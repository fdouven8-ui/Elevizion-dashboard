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

  const getAdvertiserName = (id: string) => advertisers.find(a => a.id === id)?.companyName || "Unknown";

  const getStatusVariant = (status: string) => {
    switch(status) {
      case 'paid': return 'default';
      case 'sent': return 'secondary';
      case 'overdue': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Billing</h1>
          <p className="text-muted-foreground">Invoices and payment status.</p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice ID</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount (Inc VAT)</TableHead>
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
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
