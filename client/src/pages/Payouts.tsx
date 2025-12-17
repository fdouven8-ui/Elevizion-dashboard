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
    // Simulate current month generation
    generatePayouts(format(new Date(), "yyyy-MM"));
    setTimeout(() => setIsGenerating(false), 500);
  };

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || "Unknown";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Payouts</h1>
          <p className="text-muted-foreground">Revenue share distribution for location partners.</p>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "Processing..." : "Generate Payouts for This Month"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Distributed (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground">Calculated from paid payouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.payoutAmountExVat, 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Gross Revenue Share</TableHead>
              <TableHead className="text-right">Share %</TableHead>
              <TableHead className="text-right">Payout Amount</TableHead>
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
                <TableCell className="text-right font-mono">${pay.grossRevenueExVat.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">{pay.sharePercent}%</TableCell>
                <TableCell className="text-right font-mono font-bold">${pay.payoutAmountExVat.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={pay.status === 'paid' ? 'default' : 'secondary'}>
                    {pay.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {payouts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No payouts generated yet. Click the button above to calculate shares.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
