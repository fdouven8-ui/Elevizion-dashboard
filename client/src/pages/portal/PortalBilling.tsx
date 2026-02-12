import { Card, CardContent } from "@/components/ui/card";
import { Receipt } from "lucide-react";

export default function PortalBilling() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-billing-title">Facturatie</h1>
        <p className="text-muted-foreground">Bekijk je facturen en betalingen</p>
      </div>

      <Card>
        <CardContent className="pt-6 text-center space-y-3">
          <Receipt className="w-12 h-12 text-gray-400 mx-auto" />
          <p className="text-muted-foreground" data-testid="text-billing-placeholder">
            Facturatie wordt binnenkort beschikbaar. Neem contact op met info@elevizion.nl voor vragen over je factuur.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
