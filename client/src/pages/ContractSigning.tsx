import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileSignature, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw,
  Loader2,
  Mail,
  Shield,
  Download
} from "lucide-react";

export default function ContractSigning() {
  const [, params] = useRoute("/contract-ondertekenen/:id");
  const contractId = params?.id;
  const { toast } = useToast();
  
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"view" | "verify" | "finalize" | "signed">("view");

  const { data: signingStatus, isLoading, refetch } = useQuery({
    queryKey: ["/api/contract-documents", contractId, "signing-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contract-documents/${contractId}/signing-status`);
      if (!res.ok) throw new Error("Kon status niet ophalen");
      return res.json();
    },
    enabled: !!contractId,
  });

  const { data: contractDoc, isLoading: docLoading } = useQuery({
    queryKey: ["/api/contract-documents", contractId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contract-documents/${contractId}`);
      if (!res.ok) throw new Error("Contract niet gevonden");
      return res.json();
    },
    enabled: !!contractId,
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/contract-documents/${contractId}/verify-otp`, {
        otpCode,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Verificatie gelukt", description: "U kunt nu het contract ondertekenen" });
        setStep("finalize");
        refetch();
      } else {
        toast({ title: "Verificatie mislukt", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const finalizeSignatureMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/contract-documents/${contractId}/finalize-signature`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Contract ondertekend", description: "Het contract is succesvol ondertekend" });
        setStep("signed");
        refetch();
      } else {
        toast({ title: "Fout", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const resendOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/contract-documents/${contractId}/resend-otp`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Code verzonden", description: "Een nieuwe code is naar uw e-mail gestuurd" });
      } else {
        toast({ title: "Fout", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  if (!contractId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="py-8 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ongeldige link</h2>
            <p className="text-muted-foreground">Deze ondertekeningslink is ongeldig.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || docLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="py-8">
            <Skeleton className="h-8 w-3/4 mx-auto mb-4" />
            <Skeleton className="h-4 w-1/2 mx-auto mb-8" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!signingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="py-8 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Contract niet gevonden</h2>
            <p className="text-muted-foreground">Dit contract bestaat niet of is niet langer beschikbaar.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signingStatus.signStatus === "signed" || step === "signed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-16 w-16 mx-auto text-green-600 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Contract ondertekend</h2>
            <p className="text-muted-foreground mb-6">
              Het contract is succesvol ondertekend. U ontvangt een bevestiging per e-mail.
            </p>
            {signingStatus.signedPdfUrl && (
              <Button asChild>
                <a href={`/api/contract-documents/${contractId}/signed-pdf`} download>
                  <Download className="h-4 w-4 mr-2" />
                  Download getekend contract
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signingStatus.isLegacy) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="py-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Legacy Contract</h2>
            <p className="text-muted-foreground">
              Dit contract is via een ander systeem verzonden. Neem contact op met Elevizion.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isVerified = signingStatus.signStatus === "verified" || step === "finalize";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Contract Ondertekenen</h1>
          <p className="text-muted-foreground">Elevizion Digital Signage</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Contractgegevens
            </CardTitle>
            <CardDescription>
              Controleer de gegevens en onderteken het contract
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Ondertekenaar</Label>
                <p className="font-medium">{signingStatus.signerName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">E-mail</Label>
                <p className="font-medium">{signingStatus.signerEmail}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <Badge 
                  variant={signingStatus.signStatus === "sent" ? "secondary" : signingStatus.signStatus === "verified" ? "default" : "outline"}
                  className="mt-1"
                >
                  {signingStatus.signStatus === "sent" && "Wacht op verificatie"}
                  {signingStatus.signStatus === "verified" && "Geverifieerd"}
                  {signingStatus.signStatus === "none" && "Concept"}
                </Badge>
              </div>
              <div>
                <Label className="text-muted-foreground">Verzonden op</Label>
                <p className="font-medium">
                  {signingStatus.sentAt ? new Date(signingStatus.sentAt).toLocaleString("nl-NL") : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {contractDoc?.renderedContent && (
          <Card>
            <CardHeader>
              <CardTitle>Contractinhoud</CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="prose prose-sm max-w-none border rounded-lg p-4 bg-white max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: contractDoc.renderedContent }}
              />
            </CardContent>
          </Card>
        )}

        {!isVerified && signingStatus.signStatus === "sent" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Stap 1: Verifieer uw identiteit
              </CardTitle>
              <CardDescription>
                Voer de 6-cijferige code in die naar {signingStatus.signerEmail} is verzonden
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 max-w-xs">
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  data-testid="input-otp-code"
                />
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={() => verifyOtpMutation.mutate()}
                  disabled={otpCode.length !== 6 || verifyOtpMutation.isPending}
                  data-testid="button-verify-otp"
                >
                  {verifyOtpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Verifieer code
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => resendOtpMutation.mutate()}
                  disabled={resendOtpMutation.isPending}
                  data-testid="button-resend-otp"
                >
                  {resendOtpMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Nieuwe code aanvragen
                </Button>
              </div>

              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  Geen code ontvangen? Controleer uw spam-map of vraag een nieuwe code aan.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {isVerified && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Stap 2: Onderteken het contract
              </CardTitle>
              <CardDescription>
                Uw identiteit is geverifieerd. Klik hieronder om het contract te ondertekenen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Door te ondertekenen gaat u akkoord met de inhoud van dit contract en de Algemene Voorwaarden van Elevizion B.V.
                </AlertDescription>
              </Alert>
              
              <Button 
                size="lg"
                className="w-full"
                onClick={() => finalizeSignatureMutation.mutate()}
                disabled={finalizeSignatureMutation.isPending}
                data-testid="button-finalize-signature"
              >
                {finalizeSignatureMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <FileSignature className="h-4 w-4 mr-2" />
                Contract Ondertekenen
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <footer className="max-w-3xl mx-auto mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Elevizion B.V. - Digital Signage Solutions</p>
      </footer>
    </div>
  );
}
