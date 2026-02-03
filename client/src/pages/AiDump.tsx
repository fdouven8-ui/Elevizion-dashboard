import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Loader2, CheckCircle, FileText, Database, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiDumpChunk {
  index: number;
  total: number;
  title: string;
  text: string;
}

interface AiDumpResult {
  ok: boolean;
  bundleId: string;
  chunks: AiDumpChunk[];
  summary: {
    files: number;
    chunks: number;
    logs: number;
    schema: boolean;
    tables: number;
  };
}

export default function AiDump() {
  const { toast } = useToast();
  const [result, setResult] = useState<AiDumpResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [maxFilesKB, setMaxFilesKB] = useState(250);
  const [sampleRows, setSampleRows] = useState(3);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/ai-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "full",
          maxFilesKB,
          maxLogLines: 3000,
          sampleRowsPerTable: sampleRows
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fout bij genereren AI dump");
      }
      
      return response.json() as Promise<AiDumpResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "AI Dump Gegenereerd",
        description: `${data.summary.chunks} chunks, ${data.summary.files} bestanden`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: "Gekopieerd",
        description: `Chunk ${index} gekopieerd naar klembord`,
      });
    } catch (err) {
      toast({
        title: "Fout",
        description: "Kon niet kopieren naar klembord",
        variant: "destructive"
      });
    }
  };

  const copySummary = async () => {
    if (!result) return;
    
    const summary = `AI DUMP SUMMARY
================
Bundle ID: ${result.bundleId}
Files: ${result.summary.files}
Chunks: ${result.summary.chunks}
Tables: ${result.summary.tables}
Schema: ${result.summary.schema ? "Yes" : "No"}

Paste each chunk into ChatGPT in order (1 to ${result.summary.chunks}).
`;
    
    await copyToClipboard(summary, -1);
  };

  const downloadAll = () => {
    if (!result) return;
    
    const fullText = result.chunks.map(c => c.text).join("\n\n---\n\n");
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.bundleId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="ai-dump-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Debug Dump</h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Genereer een complete export van code, database en configuratie voor ChatGPT debugging.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Instellingen</CardTitle>
          <CardDescription>Pas de export opties aan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="maxFilesKB">Max KB per chunk</Label>
              <Input
                id="maxFilesKB"
                type="number"
                value={maxFilesKB}
                onChange={(e) => setMaxFilesKB(Number(e.target.value))}
                min={50}
                max={500}
                data-testid="input-max-kb"
              />
            </div>
            <div>
              <Label htmlFor="sampleRows">Sample rijen per tabel</Label>
              <Input
                id="sampleRows"
                type="number"
                value={sampleRows}
                onChange={(e) => setSampleRows(Number(e.target.value))}
                min={1}
                max={10}
                data-testid="input-sample-rows"
              />
            </div>
          </div>
          
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            size="lg"
            className="w-full"
            data-testid="button-generate-dump"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Genereren...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Genereer FULL AI Dump
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Alert className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span data-testid="text-summary">
                  <strong data-testid="text-bundle-id">{result.bundleId}</strong> - {result.summary.files} bestanden, {result.summary.chunks} chunks, {result.summary.tables} tabellen
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copySummary} data-testid="button-copy-summary">
                    <Copy className="h-4 w-4 mr-1" />
                    Kopieer Samenvatting
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadAll} data-testid="button-download-all">
                    <Download className="h-4 w-4 mr-1" />
                    Download Alles
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            {result.chunks.map((chunk) => (
              <Card key={chunk.index} data-testid={`chunk-card-${chunk.index}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {chunk.index} / {chunk.total}
                      </Badge>
                      <CardTitle className="text-base">{chunk.title}</CardTitle>
                    </div>
                    <Button
                      variant={copiedIndex === chunk.index ? "default" : "outline"}
                      size="sm"
                      onClick={() => copyToClipboard(chunk.text, chunk.index)}
                      data-testid={`button-copy-chunk-${chunk.index}`}
                    >
                      {copiedIndex === chunk.index ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Gekopieerd!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Kopieer Chunk
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded p-3 text-xs font-mono max-h-40 overflow-auto whitespace-pre-wrap" data-testid={`text-chunk-preview-${chunk.index}`}>
                    {chunk.text.substring(0, 500)}...
                  </div>
                  <p className="text-xs text-muted-foreground mt-2" data-testid={`text-chunk-size-${chunk.index}`}>
                    {(chunk.text.length / 1024).toFixed(1)} KB
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Hoe te Gebruiken
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Klik op "Kopieer Samenvatting" en plak in ChatGPT als eerste bericht</li>
                <li>Kopieer en plak elke chunk in volgorde (1 t/m {result.summary.chunks})</li>
                <li>Wacht tot ChatGPT elke chunk bevestigt voordat je de volgende plakt</li>
                <li>Na alle chunks: stel je debug vraag aan ChatGPT</li>
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
