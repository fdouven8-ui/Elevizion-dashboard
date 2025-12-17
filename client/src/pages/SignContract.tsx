import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, AlertCircle, FileText, Calendar, Euro } from "lucide-react";

interface ContractData {
  id: string;
  name: string;
  title: string | null;
  htmlContent: string | null;
  monthlyPriceExVat: string;
  vatPercent: string;
  startDate: string;
  endDate: string | null;
  billingCycle: string;
  advertiserName: string;
  contactName: string;
  contactEmail: string;
  expiresAt: string;
}

export default function SignContract() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: contract, isLoading, error } = useQuery<ContractData>({
    queryKey: ["sign-contract", token],
    queryFn: async () => {
      const res = await fetch(`/api/sign/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Contract niet gevonden");
      }
      return res.json();
    },
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; signatureData: string | null; agreedToTerms: boolean }) => {
      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Fout bij ondertekenen");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (contract) {
      setName(contract.contactName || "");
      setEmail(contract.contactEmail || "");
    }
  }, [contract]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL("image/png"));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !agreedToTerms || !signatureData) return;
    signMutation.mutate({ name, email, signatureData, agreedToTerms });
  };

  const billingCycleNL: Record<string, string> = {
    monthly: "Maandelijks",
    quarterly: "Per Kwartaal",
    yearly: "Jaarlijks",
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-destructive">Contract Niet Beschikbaar</CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (signMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-green-700">Contract Ondertekend!</CardTitle>
            <CardDescription className="mt-2">
              Bedankt voor het ondertekenen van het contract. U ontvangt een bevestiging per e-mail.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              Wij nemen binnenkort contact met u op om de volgende stappen te bespreken.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthlyExVat = parseFloat(contract?.monthlyPriceExVat || "0");
  const vatRate = parseFloat(contract?.vatPercent || "21") / 100;
  const monthlyIncVat = monthlyExVat * (1 + vatRate);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f]" data-testid="text-elevizion-logo">Elevizion</h1>
          <p className="text-[#f8a12f] font-medium">See Your Business Grow</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {contract?.name}
            </CardTitle>
            <CardDescription>
              Bekijk en onderteken uw reclamecontract
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
                <Euro className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Maandprijs</p>
                  <p className="font-semibold" data-testid="text-monthly-price">€{monthlyIncVat.toFixed(2)} incl. BTW</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Startdatum</p>
                  <p className="font-semibold" data-testid="text-start-date">{contract?.startDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Facturatie</p>
                  <p className="font-semibold">{billingCycleNL[contract?.billingCycle || "monthly"]}</p>
                </div>
              </div>
            </div>

            {contract?.htmlContent && (
              <div 
                className="border rounded-lg p-6 bg-white max-h-[500px] overflow-y-auto mb-6"
                dangerouslySetInnerHTML={{ __html: contract.htmlContent }}
                data-testid="contract-content"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ondertekening</CardTitle>
            <CardDescription>
              Vul uw gegevens in en onderteken het contract
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Volledige naam *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Uw volledige naam"
                    required
                    data-testid="input-signer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="uw@email.nl"
                    required
                    data-testid="input-signer-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Handtekening (optioneel)</Label>
                <div className="border rounded-lg p-2 bg-white">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={150}
                    className="w-full border rounded cursor-crosshair"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    data-testid="canvas-signature"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearSignature}
                    className="mt-2"
                    data-testid="button-clear-signature"
                  >
                    Wissen
                  </Button>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                  data-testid="checkbox-agree-terms"
                />
                <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                  Ik heb het contract gelezen en ga akkoord met de voorwaarden. Ik begrijp dat dit een bindende overeenkomst is.
                </Label>
              </div>

              {signMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{(signMutation.error as Error).message}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full bg-[#1e3a5f] hover:bg-[#2d5a87]"
                disabled={!name || !email || !agreedToTerms || !signatureData || signMutation.isPending}
                data-testid="button-sign-contract"
              >
                {signMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bezig met ondertekenen...
                  </>
                ) : (
                  "Contract Ondertekenen"
                )}
              </Button>
              {!signatureData && (
                <p className="text-xs text-amber-600 text-center">
                  Plaats eerst uw handtekening in het veld hierboven
                </p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Door te ondertekenen bevestigt u uw identiteit en gaat u akkoord met elektronische ondertekening.
                Uw IP-adres en tijdstempel worden vastgelegd als bewijs.
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Elevizion. Alle rechten voorbehouden.</p>
        </div>
      </div>
    </div>
  );
}
