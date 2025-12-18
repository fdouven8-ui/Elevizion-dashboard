import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Save, Check, X, Camera, Wifi, Power, MapPin, Users, Monitor, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Lead, LocationSurvey as SurveyType } from "@shared/schema";

function SignaturePad({ 
  onSave, 
  signerName,
  onSignerNameChange 
}: { 
  onSave: (data: string, name: string) => void;
  signerName: string;
  onSignerNameChange: (name: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getCoords = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !signerName.trim()) return;
    
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl, signerName);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Naam ondertekenaar *</Label>
        <Input 
          value={signerName}
          onChange={(e) => onSignerNameChange(e.target.value)}
          placeholder="Volledige naam"
          data-testid="input-signer-name"
        />
      </div>
      
      <div className="space-y-2">
        <Label>Handtekening</Label>
        <div className="border rounded-lg bg-white p-2">
          <canvas
            ref={canvasRef}
            width={400}
            height={150}
            className="border rounded touch-none w-full"
            style={{ maxWidth: "100%", height: "auto", aspectRatio: "400/150" }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            data-testid="canvas-signature"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clearSignature}>
            <X className="h-4 w-4 mr-1" /> Wissen
          </Button>
          <Button 
            type="button" 
            size="sm" 
            onClick={saveSignature}
            disabled={!hasSignature || !signerName.trim()}
            data-testid="button-save-signature"
          >
            <Check className="h-4 w-4 mr-1" /> Onderteken
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LocationSurveyPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    surveyDate: new Date().toISOString().split("T")[0],
    hasWifiAvailable: false,
    wifiNetworkName: "",
    hasPowerOutlet: false,
    powerOutletLocation: "",
    proposedScreenCount: 1,
    proposedScreenLocations: "",
    wallMountPossible: false,
    ceilingMountPossible: false,
    standMountPossible: false,
    footTrafficEstimate: "",
    targetAudience: "",
    competingScreens: false,
    competingScreensNotes: "",
    proposedRevenueShare: "10",
    installationNotes: "",
    estimatedInstallationCost: "",
    notes: "",
  });
  
  const [signerName, setSignerName] = useState("");
  const [isSigned, setIsSigned] = useState(false);

  const { data: lead, isLoading } = useQuery<Lead>({
    queryKey: [`/api/leads/${leadId}`],
    enabled: !!leadId,
  });

  const saveSurveyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/surveys", data);
      return res.json();
    },
    onSuccess: (survey) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Schouw opgeslagen!" });
      navigate("/sales");
    },
    onError: (error: any) => {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    },
  });

  const saveSignatureMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/signatures", data);
      return res.json();
    },
  });

  const handleSignature = async (signatureData: string, name: string) => {
    try {
      await saveSignatureMutation.mutateAsync({
        documentType: "schouw_akkoord",
        documentId: leadId,
        signerName: name,
        signatureData,
        signerRole: "locatie_eigenaar",
      });
      setIsSigned(true);
      toast({ title: "Handtekening opgeslagen!" });
    } catch (error: any) {
      toast({ title: "Fout bij ondertekenen", description: error.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    saveSurveyMutation.mutate({
      leadId,
      surveyDate: formData.surveyDate,
      hasWifiAvailable: formData.hasWifiAvailable,
      wifiNetworkName: formData.wifiNetworkName || null,
      hasPowerOutlet: formData.hasPowerOutlet,
      powerOutletLocation: formData.powerOutletLocation || null,
      proposedScreenCount: formData.proposedScreenCount,
      proposedScreenLocations: formData.proposedScreenLocations || null,
      wallMountPossible: formData.wallMountPossible,
      ceilingMountPossible: formData.ceilingMountPossible,
      standMountPossible: formData.standMountPossible,
      footTrafficEstimate: formData.footTrafficEstimate || null,
      targetAudience: formData.targetAudience || null,
      competingScreens: formData.competingScreens,
      competingScreensNotes: formData.competingScreensNotes || null,
      proposedRevenueShare: formData.proposedRevenueShare || null,
      installationNotes: formData.installationNotes || null,
      estimatedInstallationCost: formData.estimatedInstallationCost || null,
      notes: formData.notes || null,
      status: isSigned ? "afgerond" : "concept",
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Lead niet gevonden</p>
        <Button onClick={() => navigate("/sales")} className="mt-4">
          Terug naar Acquisitie
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Locatie Schouw</h1>
          <p className="text-muted-foreground">{lead.companyName} - {lead.contactName}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Locatie Gegevens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schouwdatum</Label>
                <Input 
                  type="date"
                  value={formData.surveyDate}
                  onChange={(e) => setFormData({ ...formData, surveyDate: e.target.value })}
                  data-testid="input-survey-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Aantal schermen</Label>
                <Input 
                  type="number"
                  min="1"
                  value={formData.proposedScreenCount}
                  onChange={(e) => setFormData({ ...formData, proposedScreenCount: parseInt(e.target.value) || 1 })}
                  data-testid="input-screen-count"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Locatie beschrijving schermen</Label>
              <Textarea 
                value={formData.proposedScreenLocations}
                onChange={(e) => setFormData({ ...formData, proposedScreenLocations: e.target.value })}
                placeholder="Bijv. Bij de kassa, in de wachtruimte, etc."
                data-testid="input-screen-locations"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" /> Technische Voorzieningen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>WiFi beschikbaar</Label>
                <p className="text-sm text-muted-foreground">Is er een WiFi netwerk aanwezig?</p>
              </div>
              <Switch 
                checked={formData.hasWifiAvailable}
                onCheckedChange={(v) => setFormData({ ...formData, hasWifiAvailable: v })}
                data-testid="switch-wifi"
              />
            </div>
            
            {formData.hasWifiAvailable && (
              <div className="space-y-2 pl-4 border-l-2">
                <Label>Netwerknaam</Label>
                <Input 
                  value={formData.wifiNetworkName}
                  onChange={(e) => setFormData({ ...formData, wifiNetworkName: e.target.value })}
                  placeholder="WiFi SSID"
                />
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-2"><Power className="h-4 w-4" /> Stroomaansluiting</Label>
                <p className="text-sm text-muted-foreground">Is er een stopcontact nabij?</p>
              </div>
              <Switch 
                checked={formData.hasPowerOutlet}
                onCheckedChange={(v) => setFormData({ ...formData, hasPowerOutlet: v })}
                data-testid="switch-power"
              />
            </div>
            
            {formData.hasPowerOutlet && (
              <div className="space-y-2 pl-4 border-l-2">
                <Label>Locatie stopcontact</Label>
                <Input 
                  value={formData.powerOutletLocation}
                  onChange={(e) => setFormData({ ...formData, powerOutletLocation: e.target.value })}
                  placeholder="Bijv. onder de balie, in de kast"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" /> Montagemogelijkheden
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={formData.wallMountPossible}
                  onCheckedChange={(v) => setFormData({ ...formData, wallMountPossible: v })}
                />
                <Label>Wandmontage</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={formData.ceilingMountPossible}
                  onCheckedChange={(v) => setFormData({ ...formData, ceilingMountPossible: v })}
                />
                <Label>Plafondmontage</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={formData.standMountPossible}
                  onCheckedChange={(v) => setFormData({ ...formData, standMountPossible: v })}
                />
                <Label>Standaard</Label>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Installatienotities</Label>
              <Textarea 
                value={formData.installationNotes}
                onChange={(e) => setFormData({ ...formData, installationNotes: e.target.value })}
                placeholder="Bijzonderheden voor installatie..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Geschatte installatiekosten (€)</Label>
              <Input 
                type="number"
                value={formData.estimatedInstallationCost}
                onChange={(e) => setFormData({ ...formData, estimatedInstallationCost: e.target.value })}
                placeholder="0"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Omgeving & Doelgroep
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Loopverkeer inschatting</Label>
              <Select 
                value={formData.footTrafficEstimate} 
                onValueChange={(v) => setFormData({ ...formData, footTrafficEstimate: v })}
              >
                <SelectTrigger data-testid="select-traffic">
                  <SelectValue placeholder="Selecteer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="laag">Laag (&lt;50 per dag)</SelectItem>
                  <SelectItem value="gemiddeld">Gemiddeld (50-200 per dag)</SelectItem>
                  <SelectItem value="hoog">Hoog (&gt;200 per dag)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Doelgroep</Label>
              <Input 
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                placeholder="Bijv. gezinnen, zakelijke bezoekers, studenten"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Concurrerende schermen?</Label>
                <p className="text-sm text-muted-foreground">Zijn er al andere digitale schermen aanwezig?</p>
              </div>
              <Switch 
                checked={formData.competingScreens}
                onCheckedChange={(v) => setFormData({ ...formData, competingScreens: v })}
              />
            </div>
            
            {formData.competingScreens && (
              <div className="space-y-2 pl-4 border-l-2">
                <Label>Toelichting</Label>
                <Input 
                  value={formData.competingScreensNotes}
                  onChange={(e) => setFormData({ ...formData, competingScreensNotes: e.target.value })}
                  placeholder="Wat voor schermen?"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voorstel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Voorgesteld revenue share (%)</Label>
              <Input 
                type="number"
                min="0"
                max="100"
                value={formData.proposedRevenueShare}
                onChange={(e) => setFormData({ ...formData, proposedRevenueShare: e.target.value })}
                data-testid="input-revenue-share"
              />
              <p className="text-sm text-muted-foreground">Standaard is 10%</p>
            </div>
            
            <div className="space-y-2">
              <Label>Algemene notities</Label>
              <Textarea 
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Overige opmerkingen..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" /> Ondertekening
            </CardTitle>
            <CardDescription>
              Door te ondertekenen gaat de locatie-eigenaar akkoord met de schouw en voorgestelde samenwerking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSigned ? (
              <div className="text-center py-8 bg-green-50 rounded-lg">
                <Check className="h-12 w-12 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-800">Ondertekend door {signerName}</p>
              </div>
            ) : (
              <SignaturePad 
                onSave={handleSignature}
                signerName={signerName}
                onSignerNameChange={setSignerName}
              />
            )}
          </CardContent>
        </Card>

        <div className="sticky bottom-4 bg-background pt-4">
          <Button 
            type="submit" 
            className="w-full h-12 text-lg"
            disabled={saveSurveyMutation.isPending}
            data-testid="button-save-survey"
          >
            <Save className="h-5 w-5 mr-2" />
            {saveSurveyMutation.isPending ? "Opslaan..." : "Schouw Opslaan"}
          </Button>
        </div>
      </form>
    </div>
  );
}
