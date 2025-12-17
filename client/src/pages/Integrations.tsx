import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, AlertCircle } from "lucide-react";

export default function Integrations() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">Integrations</h1>
          <p className="text-muted-foreground">Connect external services for billing and display management.</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Moneybird
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                Not Configured
              </span>
            </CardTitle>
            <CardDescription>
              Connect your Moneybird account to automatically sync invoices and payments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>API Token</Label>
              <div className="flex gap-2">
                <Input type="password" placeholder="••••••••••••••••" className="max-w-md" disabled />
                <Button variant="outline">Connect</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Yodeck
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                Not Configured
              </span>
            </CardTitle>
            <CardDescription>
              Connect Yodeck to monitor screen status and push content updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input type="password" placeholder="••••••••••••••••" className="max-w-md" disabled />
                <Button variant="outline">Connect</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
