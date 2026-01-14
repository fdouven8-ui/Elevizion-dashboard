import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

interface ClaimResponse {
  success?: boolean;
  available?: boolean;
  contractId?: string;
  redirectToStart?: boolean;
  formData?: {
    companyName: string;
    contactName: string;
    email: string;
    phone?: string;
    kvkNumber?: string;
    vatNumber?: string;
    packageType: string;
    businessCategory: string;
    targetRegionCodes?: string[];
  };
  message?: string;
}

interface ClaimCheckResponse {
  valid: boolean;
  available?: boolean;
  packageType?: string;
  businessCategory?: string;
  regionsLabel?: string;
  companyName?: string;
  contactName?: string;
  videoDurationSeconds?: number;
  message?: string;
  expired?: boolean;
}

export default function ClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const checkQuery = useQuery<ClaimCheckResponse>({
    queryKey: ["claim-check", token],
    queryFn: async () => {
      const response = await fetch(`/api/claim/${token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Ongeldige claim link");
      }
      return response.json();
    },
    retry: false,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/claim/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Fout bij claimen");
      }
      return response.json();
    },
    onSuccess: (data: ClaimResponse) => {
      if (data.redirectToStart && data.formData) {
        // Store formData in sessionStorage and redirect to /start
        sessionStorage.setItem("waitlistClaimData", JSON.stringify(data.formData));
        window.location.href = "/start?fromClaim=true";
      }
    },
  });

  const PACKAGE_LABELS: Record<string, string> = {
    SINGLE: "Enkelvoudig (1 scherm)",
    TRIPLE: "Drievoudig (3 schermen)",
    TEN: "Tien (10 schermen)",
    CUSTOM: "Maatwerk",
  };

  if (checkQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <MarketingHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-slate-200">
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto text-emerald-600 animate-spin mb-4" />
              <p className="text-slate-600">Je claim wordt gecontroleerd...</p>
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  if (checkQuery.isError) {
    const errorMessage = checkQuery.error?.message || "Ongeldige claim link";
    const isExpired = errorMessage.toLowerCase().includes("verlopen");

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <MarketingHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <CardTitle className="text-xl text-slate-800">
                  {isExpired ? "Deze uitnodiging is verlopen" : "Ongeldige claim link"}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isExpired ? (
                <p className="text-slate-600">
                  De claim-link was 48 uur geldig. Je aanvraag staat weer op de wachtlijst en 
                  je ontvangt automatisch een nieuwe uitnodiging zodra er plek is.
                </p>
              ) : (
                <p className="text-slate-600">{errorMessage}</p>
              )}
              <Button 
                onClick={() => window.location.href = "/"}
                variant="outline"
                className="w-full"
                data-testid="button-ok"
              >
                Oké
              </Button>
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  const data = checkQuery.data;

  if (!data?.valid || !data?.available) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <MarketingHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-amber-600" />
                </div>
                <CardTitle className="text-xl text-slate-800">
                  Plek tijdelijk niet beschikbaar
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                Er is net te weinig plek beschikbaar in de gekozen gebieden.
                We hebben je aanvraag terug op de wachtlijst gezet en mailen je 
                automatisch zodra er weer plek is.
              </p>
              <Button 
                onClick={() => window.location.href = "/"}
                variant="outline"
                className="w-full"
                data-testid="button-close"
              >
                Terug naar overzicht
              </Button>
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  if (confirmMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <MarketingHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-emerald-300 bg-emerald-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                </div>
                <CardTitle className="text-xl text-slate-800">
                  Plek bevestigd!
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                Je wordt doorgestuurd naar het volgende scherm...
              </p>
              <Loader2 className="h-6 w-6 mx-auto text-emerald-600 animate-spin" />
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  if (confirmMutation.isError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <MarketingHeader />
        <div className="container mx-auto px-4 py-20 max-w-lg">
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-amber-600" />
                </div>
                <CardTitle className="text-xl text-slate-800">
                  Plek tijdelijk niet beschikbaar
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                Er is net te weinig plek beschikbaar in de gekozen gebieden.
                We hebben je aanvraag terug op de wachtlijst gezet en mailen je 
                automatisch zodra er weer plek is.
              </p>
              <Button 
                onClick={() => window.location.href = "/"}
                variant="outline"
                className="w-full"
                data-testid="button-back"
              >
                Terug naar overzicht
              </Button>
            </CardContent>
          </Card>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <MarketingHeader />
      <div className="container mx-auto px-4 py-20 max-w-lg">
        <Card className="border-2 border-emerald-300 bg-emerald-50/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <CardTitle className="text-xl text-slate-800">
                Je plek is bevestigd
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-slate-600">
              Top! Je kunt nu direct verder met akkoord en daarna je advertentie uploaden.
            </p>

            {data && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
                {data.companyName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bedrijf:</span>
                    <span className="font-medium">{data.companyName}</span>
                  </div>
                )}
                {data.packageType && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pakket:</span>
                    <span className="font-medium">{PACKAGE_LABELS[data.packageType] || data.packageType}</span>
                  </div>
                )}
                {data.regionsLabel && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gebieden:</span>
                    <span className="font-medium">{data.regionsLabel}</span>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-continue"
            >
              {confirmMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Bezig...
                </>
              ) : (
                <>
                  Doorgaan
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>

            {data?.videoDurationSeconds && (
              <p className="text-xs text-slate-500 text-center">
                Let op: standaard video is {data.videoDurationSeconds} seconden (tenzij anders overeengekomen).
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <MarketingFooter />
    </div>
  );
}
