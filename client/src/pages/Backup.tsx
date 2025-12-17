import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Database, FileJson, FileSpreadsheet, Shield, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const tables = [
  { id: "advertisers", name: "Adverteerders", description: "Alle bedrijven die adverteren", icon: "🏢" },
  { id: "locations", name: "Locaties", description: "Partner locaties met schermen", icon: "📍" },
  { id: "screens", name: "Schermen", description: "Digitale displays", icon: "🖥️" },
  { id: "contracts", name: "Contracten", description: "Reclame overeenkomsten", icon: "📄" },
  { id: "placements", name: "Plaatsingen", description: "Scherm-contract koppelingen", icon: "🎯" },
  { id: "invoices", name: "Facturen", description: "Verzonden facturen", icon: "💰" },
  { id: "payouts", name: "Uitbetalingen", description: "Uitbetalingen aan locaties", icon: "💸" },
  { id: "snapshots", name: "Maandsnapshots", description: "Onveranderlijke maanddata", icon: "📸" },
  { id: "users", name: "Gebruikers", description: "Systeemgebruikers", icon: "👤" },
];

export default function Backup() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadBackup = async (type: string, format: "json" | "csv" = "json") => {
    setDownloading(type);
    try {
      const url = type === "full" 
        ? "/api/backup/full" 
        : format === "csv" 
          ? `/api/backup/${type}/csv`
          : `/api/backup/${type}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download mislukt");
      
      const blob = await response.blob();
      const filename = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") 
        || `backup-${type}.${format}`;
      
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      
      toast({
        title: "Download gestart",
        description: `${filename} wordt gedownload`,
      });
    } catch (error: any) {
      toast({
        title: "Fout bij downloaden",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="page-title">Backup & Export</h1>
        <p className="text-muted-foreground">
          Maak een backup van je gegevens of exporteer specifieke data
        </p>
      </div>

      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            Volledige Backup
          </CardTitle>
          <CardDescription>
            Download alle gegevens in één bestand. Dit bevat alles wat je nodig hebt om je systeem te herstellen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Database className="h-4 w-4" />
                Alle tabellen
              </span>
              <span className="flex items-center gap-1">
                <FileJson className="h-4 w-4" />
                JSON formaat
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Met timestamp
              </span>
            </div>
            <Button 
              size="lg" 
              onClick={() => downloadBackup("full")}
              disabled={downloading === "full"}
              data-testid="button-full-backup"
            >
              {downloading === "full" ? (
                <>Bezig met downloaden...</>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Volledige Backup
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exporteer Per Onderdeel</CardTitle>
          <CardDescription>
            Download specifieke gegevens als JSON of CSV bestand
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tables.map((table) => (
              <div 
                key={table.id}
                className="flex flex-col gap-3 p-4 border rounded-lg"
                data-testid={`export-card-${table.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{table.icon}</span>
                  <div>
                    <p className="font-medium">{table.name}</p>
                    <p className="text-xs text-muted-foreground">{table.description}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => downloadBackup(table.id, "json")}
                    disabled={downloading === table.id}
                    data-testid={`button-export-${table.id}-json`}
                  >
                    <FileJson className="mr-1 h-3 w-3" />
                    JSON
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => downloadBackup(table.id, "csv")}
                    disabled={downloading === table.id}
                    data-testid={`button-export-${table.id}-csv`}
                  >
                    <FileSpreadsheet className="mr-1 h-3 w-3" />
                    CSV
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            Tips voor Backups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <span><strong>Maak regelmatig backups</strong> - Download minimaal eens per week een volledige backup</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <span><strong>Bewaar backups veilig</strong> - Sla ze op meerdere plekken op (computer, cloud, externe schijf)</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <span><strong>CSV voor Excel</strong> - Gebruik CSV als je de data in Excel wilt bekijken of bewerken</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5">4</Badge>
              <span><strong>JSON voor herstel</strong> - JSON bestanden bevatten alle informatie om data te herstellen</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
