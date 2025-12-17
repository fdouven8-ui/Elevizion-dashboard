import { useAppData } from "@/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { format } from "date-fns";

export default function Payouts() {
  const { payouts, locations, generatePayouts } = useAppData();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    generatePayouts(format(new Date(), "yyyy-MM"));
    setTimeout(() => setIsGenerating(false), 500);
  };

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Onbekend";

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'paid': return 'Betaald';
      case 'pending': return 'In Afwachting';
      case 'approved': return 'Goedgekeurd';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Uitbetalingen</h1>
          <p className="text-muted-foreground">Omzetdeling voor locatiepartners.</p>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "Verwerken..." : "Uitbetalingen Genereren voor Deze Maand"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Totaal Uitgekeerd (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€0,00</div>
            <p className="text-xs text-muted-foreground">Berekend uit betaalde uitbetalingen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Openstaande Uitbetalingen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              €{payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + parseFloat(p.payoutAmountExVat), 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Locatie</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Bruto Omzet</TableHead>
              <TableHead className="text-right">Deel %</TableHead>
              <TableHead className="text-right">Uitbetalingsbedrag</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((pay) => (
              <TableRow key={pay.id}>
                <TableCell className="font-medium">{getLocationName(pay.locationId)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {pay.periodStart}
                </TableCell>
                <TableCell className="text-right font-mono">€{parseFloat(pay.grossRevenueExVat).toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">{pay.sharePercent}%</TableCell>
                <TableCell className="text-right font-mono font-bold">€{parseFloat(pay.payoutAmountExVat).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={pay.status === 'paid' ? 'default' : 'secondary'}>
                    {getStatusLabel(pay.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {payouts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Nog geen uitbetalingen gegenereerd. Klik op de knop hierboven om de delingen te berekenen.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
