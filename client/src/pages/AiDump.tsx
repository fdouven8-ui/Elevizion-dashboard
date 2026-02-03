import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Loader2, CheckCircle, FileText, Code, AlertTriangle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiDumpChunk {
  index: number;
  total: number;
  title: string;
  text: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
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
    criticalChunks: number;
    highChunks: number;
  };
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-gray-400 text-white"
};

const priorityLabels: Record<string, string> = {
  critical: "KRITIEK",
  high: "HOOG",
  medium: "MEDIUM",
  low: "LAAG"
};

export default function AiDump() {
  const { toast } = useToast();
  const [result, setResult] = useState<AiDumpResult | null>(null);
  const [copiedIndices, setCopiedIndices] = useState<Set<number>>(new Set());
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
      setCopiedIndices(new Set());
      toast({
        title: "AI Dump Gegenereerd",
        description: `${data.summary.chunks} chunks (${data.summary.criticalChunks} kritiek, ${data.summary.highChunks} hoog)`,
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
      setCopiedIndices(prev => new Set(Array.from(prev).concat([index])));
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

  const copyPriorityChunks = async () => {
    if (!result) return;
    
    const priorityChunks = result.chunks.filter(c => c.priority === "critical" || c.priority === "high");
    const text = priorityChunks.map(c => c.text).join("\n\n---\n\n");
    
    try {
      await navigator.clipboard.writeText(text);
      const newIndices = priorityChunks.map(c => c.index);
      setCopiedIndices(prev => new Set(Array.from(prev).concat(newIndices)));
      toast({
        title: "Prioriteit Chunks Gekopieerd",
        description: `${priorityChunks.length} kritieke/hoge prioriteit chunks gekopieerd`,
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
    
    const criticalTitles = result.chunks.filter(c => c.priority === "critical").map(c => `  ${c.index}. ${c.title}`).join("\n");
    const highTitles = result.chunks.filter(c => c.priority === "high").map(c => `  ${c.index}. ${c.title}`).join("\n");
    
    const summary = `AI DUMP SUMMARY FOR CHATGPT
============================
Bundle ID: ${result.bundleId}
Files: ${result.summary.files}
Total Chunks: ${result.summary.chunks}
Tables: ${result.summary.tables}

PRIORITY ORDER (paste these first):
-----------------------------------
CRITICAL (${result.summary.criticalChunks} chunks):
${criticalTitles}

HIGH (${result.summary.highChunks} chunks):
${highTitles}

INSTRUCTIONS:
1. Paste this summary first
2. Then paste CRITICAL chunks (${result.summary.criticalChunks} total)
3. Then paste HIGH priority chunks (${result.summary.highChunks} total)
4. Ask your debugging question
5. Only add MEDIUM/LOW chunks if ChatGPT needs more context
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

  const criticalChunks = result?.chunks.filter(c => c.priority === "critical") || [];
  const highChunks = result?.chunks.filter(c => c.priority === "high") || [];
  const mediumChunks = result?.chunks.filter(c => c.priority === "medium") || [];
  const lowChunks = result?.chunks.filter(c => c.priority === "low") || [];

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="ai-dump-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Debug Dump</h1>
        <p className="text-muted-foreground mt-2" data-testid="text-page-description">
          Genereer een complete export voor ChatGPT debugging. Chunks zijn gesorteerd op prioriteit.
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
                  <strong data-testid="text-bundle-id">{result.bundleId}</strong> - {result.summary.files} bestanden, {result.summary.chunks} chunks
                  <span className="ml-2">
                    <Badge className="bg-red-500 text-white ml-1">{result.summary.criticalChunks} kritiek</Badge>
                    <Badge className="bg-orange-500 text-white ml-1">{result.summary.highChunks} hoog</Badge>
                  </span>
                </span>
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={copyPriorityChunks} data-testid="button-copy-priority">
                    <Zap className="h-4 w-4 mr-1" />
                    Kopieer Prioriteit
                  </Button>
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

          {/* Priority Guide */}
          <Card className="mb-6 border-orange-300 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Snelstart voor ChatGPT Debugging
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li><strong>Kopieer de samenvatting</strong> en plak in ChatGPT</li>
                <li><strong>Kopieer KRITIEKE chunks</strong> ({criticalChunks.length}) - systeem overzicht en recente fouten</li>
                <li><strong>Kopieer HOGE prioriteit</strong> ({highChunks.length}) - mappings, routes en core code</li>
                <li><strong>Stel je vraag</strong> - ChatGPT heeft nu voldoende context</li>
                <li>Voeg MEDIUM/LAAG alleen toe als ChatGPT meer nodig heeft</li>
              </ol>
            </CardContent>
          </Card>

          {/* Critical Chunks */}
          {criticalChunks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <Badge className="bg-red-500 text-white">KRITIEK</Badge>
                Eerst kopiëren ({criticalChunks.length} chunks)
              </h2>
              <div className="grid gap-3">
                {criticalChunks.map((chunk) => (
                  <ChunkCard key={chunk.index} chunk={chunk} isCopied={copiedIndices.has(chunk.index)} onCopy={copyToClipboard} />
                ))}
              </div>
            </div>
          )}

          {/* High Priority Chunks */}
          {highChunks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <Badge className="bg-orange-500 text-white">HOOG</Badge>
                Tweede prioriteit ({highChunks.length} chunks)
              </h2>
              <div className="grid gap-3">
                {highChunks.map((chunk) => (
                  <ChunkCard key={chunk.index} chunk={chunk} isCopied={copiedIndices.has(chunk.index)} onCopy={copyToClipboard} />
                ))}
              </div>
            </div>
          )}

          {/* Medium Priority Chunks */}
          {mediumChunks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <Badge className="bg-yellow-500 text-black">MEDIUM</Badge>
                Alleen indien nodig ({mediumChunks.length} chunks)
              </h2>
              <div className="grid gap-3">
                {mediumChunks.map((chunk) => (
                  <ChunkCard key={chunk.index} chunk={chunk} isCopied={copiedIndices.has(chunk.index)} onCopy={copyToClipboard} />
                ))}
              </div>
            </div>
          )}

          {/* Low Priority Chunks */}
          {lowChunks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <Badge className="bg-gray-400 text-white">LAAG</Badge>
                Extra context ({lowChunks.length} chunks)
              </h2>
              <div className="grid gap-3">
                {lowChunks.map((chunk) => (
                  <ChunkCard key={chunk.index} chunk={chunk} isCopied={copiedIndices.has(chunk.index)} onCopy={copyToClipboard} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChunkCard({ chunk, isCopied, onCopy }: { 
  chunk: AiDumpChunk; 
  isCopied: boolean; 
  onCopy: (text: string, index: number) => void;
}) {
  return (
    <Card data-testid={`chunk-card-${chunk.index}`}>
      <CardHeader className="pb-2 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {chunk.index}/{chunk.total}
            </Badge>
            <Badge className={priorityColors[chunk.priority] + " text-xs"}>
              {priorityLabels[chunk.priority]}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {chunk.category}
            </Badge>
            <span className="font-medium text-sm">{chunk.title}</span>
          </div>
          <Button
            variant={isCopied ? "default" : "outline"}
            size="sm"
            onClick={() => onCopy(chunk.text, chunk.index)}
            data-testid={`button-copy-chunk-${chunk.index}`}
          >
            {isCopied ? (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Gekopieerd!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Kopieer
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="bg-muted rounded p-2 text-xs font-mono max-h-24 overflow-auto whitespace-pre-wrap" data-testid={`text-chunk-preview-${chunk.index}`}>
          {chunk.text.substring(0, 300)}...
        </div>
        <p className="text-xs text-muted-foreground mt-1" data-testid={`text-chunk-size-${chunk.index}`}>
          {(chunk.text.length / 1024).toFixed(1)} KB
        </p>
      </CardContent>
    </Card>
  );
}
