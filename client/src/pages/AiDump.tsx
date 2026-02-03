import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Download, Loader2, CheckCircle, FileText, Code, AlertTriangle, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DumpMode = "essentials" | "pipeline" | "full";

interface AiDumpChunk {
  index: number;
  total: number;
  title: string;
  text: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
}

interface ManifestInfo {
  bundleId: string;
  generatedAt: string;
  mode: DumpMode;
  totalChunks: number;
  chunkList: Array<{ index: number; title: string; priority: string }>;
  pasteOrder: {
    essentials: number[];
    pipeline: number[];
    full: number[];
  };
}

interface AiDumpResult {
  ok: boolean;
  bundleId: string;
  chunks: AiDumpChunk[];
  manifest: ManifestInfo;
  summary: {
    files: number;
    chunks: number;
    logs: number;
    schema: boolean;
    tables: number;
    criticalChunks: number;
    highChunks: number;
    mediumChunks: number;
    lowChunks: number;
  };
}

interface LeakError {
  ok: false;
  error: "LEAK_DETECTED";
  details: {
    pattern: string;
    chunkIndex: number;
    chunkTitle: string;
    locationHint: string;
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

const modeDescriptions: Record<DumpMode, string> = {
  essentials: "Minimale chunks voor snelle debugging (~5-12 chunks)",
  pipeline: "Essentials + workers en targeting logic (~12-25 chunks)",
  full: "Volledige codebase export"
};

export default function AiDump() {
  const { toast } = useToast();
  const [result, setResult] = useState<AiDumpResult | null>(null);
  const [copiedIndices, setCopiedIndices] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<DumpMode>("essentials");
  const [maxKbPerChunk, setMaxKbPerChunk] = useState(250);
  const [sampleRows, setSampleRows] = useState(3);
  const [showPasteOrder, setShowPasteOrder] = useState(true);
  const [leakError, setLeakError] = useState<LeakError | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setLeakError(null);
      const response = await fetch("/api/admin/ai-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode,
          maxKbPerChunk,
          maxLogLines: 3000,
          sampleRowsPerTable: sampleRows
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error === "LEAK_DETECTED") {
          setLeakError(data as LeakError);
          throw new Error(`Lek gedetecteerd: ${data.details.pattern} in chunk ${data.details.chunkIndex}`);
        }
        throw new Error(data.error || "Fout bij genereren AI dump");
      }
      
      return data as AiDumpResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setCopiedIndices(new Set());
      setLeakError(null);
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
    },
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

  const copyNextUncopied = async () => {
    if (!result) return;
    
    const uncopied = result.chunks.find(c => !copiedIndices.has(c.index));
    if (!uncopied) {
      toast({
        title: "Alles Gekopieerd",
        description: "Alle chunks zijn al gekopieerd",
      });
      return;
    }
    
    await copyToClipboard(uncopied.text, uncopied.index);
    
    const element = document.querySelector(`[data-testid="chunk-card-${uncopied.index}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    const mediumTitles = result.chunks.filter(c => c.priority === "medium").map(c => `  ${c.index}. ${c.title}`).join("\n");
    const lowTitles = result.chunks.filter(c => c.priority === "low").map(c => `  ${c.index}. ${c.title}`).join("\n");
    
    const summary = `ELEVIZION AI DEBUG DUMP SAMENVATTING
=====================================
Bundle: ${result.bundleId}
Mode: ${result.manifest?.mode || "unknown"}
Totaal: ${result.summary.chunks} chunks, ${result.summary.files} bestanden

PLAK VOLGORDE (mode=${result.manifest?.mode}):
${result.manifest?.pasteOrder[result.manifest.mode]?.join(", ") || "n/a"}

KRITIEK (${result.summary.criticalChunks}):
${criticalTitles || "  (geen)"}

HOOG (${result.summary.highChunks}):
${highTitles || "  (geen)"}

MEDIUM (${result.summary.mediumChunks || 0}):
${mediumTitles || "  (geen)"}

LAAG (${result.summary.lowChunks || 0}):
${lowTitles || "  (geen)"}

Kopieer eerst de KRITIEK en HOOG chunks, dan vraag ChatGPT.
`;

    try {
      await navigator.clipboard.writeText(summary);
      toast({
        title: "Samenvatting Gekopieerd",
        description: "Plak eerst in ChatGPT, dan de chunks"
      });
    } catch (err) {
      toast({
        title: "Fout",
        description: "Kon niet kopieren",
        variant: "destructive"
      });
    }
  };

  const downloadAll = () => {
    if (!result) return;
    
    const fullText = result.chunks.map(c => c.text).join("\n\n========================================\n\n");
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.bundleId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Gedownload",
      description: `${result.bundleId}.txt opgeslagen`
    });
  };

  const criticalChunks = result?.chunks.filter(c => c.priority === "critical") || [];
  const highChunks = result?.chunks.filter(c => c.priority === "high") || [];
  const mediumChunks = result?.chunks.filter(c => c.priority === "medium") || [];
  const lowChunks = result?.chunks.filter(c => c.priority === "low") || [];

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Code className="h-8 w-8" />
          AI Debug Dump
        </h1>
        <p className="text-muted-foreground mt-2">
          Genereer een gestructureerde export voor ChatGPT debugging
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Genereer Dump
          </CardTitle>
          <CardDescription>
            Kies een mode en instellingen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label htmlFor="mode">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as DumpMode)}>
                <SelectTrigger id="mode" data-testid="select-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="essentials">Essentials</SelectItem>
                  <SelectItem value="pipeline">Pipeline</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{modeDescriptions[mode]}</p>
            </div>
            <div>
              <Label htmlFor="maxKb">Max KB/Chunk</Label>
              <Input
                id="maxKb"
                type="number"
                value={maxKbPerChunk}
                onChange={(e) => setMaxKbPerChunk(Number(e.target.value))}
                min={50}
                max={500}
                data-testid="input-max-kb"
              />
            </div>
            <div>
              <Label htmlFor="sampleRows">Sample Rows</Label>
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
            <div className="flex items-end">
              <Button 
                onClick={() => generateMutation.mutate()} 
                disabled={generateMutation.isPending}
                className="w-full"
                data-testid="button-generate"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Genereren...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Genereer Dump
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {leakError && (
        <Alert variant="destructive" className="mb-6" data-testid="alert-leak">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>LEK GEDETECTEERD!</strong> Pattern: {leakError.details.pattern} in chunk {leakError.details.chunkIndex} ({leakError.details.chunkTitle}).
            {leakError.details.locationHint}. De dump is NIET gegenereerd om lekken te voorkomen.
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <>
          <Alert className="mb-6 bg-green-50 border-green-200" data-testid="alert-success">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>{result.summary.chunks} chunks</strong> gegenereerd ({result.summary.files} bestanden).
              Mode: <strong>{result.manifest?.mode}</strong>.
              Kritiek: {result.summary.criticalChunks}, Hoog: {result.summary.highChunks}, Medium: {result.summary.mediumChunks || 0}, Laag: {result.summary.lowChunks || 0}
            </AlertDescription>
          </Alert>

          <Card className="mb-6 border-blue-200 bg-blue-50" data-testid="card-paste-order">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowPasteOrder(!showPasteOrder)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Plak Volgorde ({result.manifest?.mode})
                </CardTitle>
                {showPasteOrder ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
            {showPasteOrder && (
              <CardContent>
                <ol className="list-decimal list-inside space-y-1 text-sm mb-4">
                  <li><strong>Kopieer de samenvatting</strong> en plak in ChatGPT</li>
                  <li><strong>Kopieer MANIFEST (chunk 1)</strong> - overzicht en plak volgorde</li>
                  <li><strong>Kopieer KRITIEKE chunks</strong> ({criticalChunks.length}) - systeem overzicht en recente fouten</li>
                  <li><strong>Kopieer HOGE prioriteit</strong> ({highChunks.length}) - mappings, routes en core code</li>
                  <li><strong>Stel je vraag</strong> - ChatGPT heeft nu voldoende context</li>
                  <li>Voeg MEDIUM/LAAG alleen toe als ChatGPT meer nodig heeft</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={copySummary} data-testid="button-copy-summary">
                    <Copy className="h-4 w-4 mr-1" />
                    Kopieer Samenvatting
                  </Button>
                  <Button size="sm" variant="default" onClick={copyPriorityChunks} data-testid="button-copy-priority">
                    <Zap className="h-4 w-4 mr-1" />
                    Kopieer Kritiek+Hoog ({criticalChunks.length + highChunks.length})
                  </Button>
                  <Button size="sm" variant="secondary" onClick={copyNextUncopied} data-testid="button-copy-next">
                    <Copy className="h-4 w-4 mr-1" />
                    Kopieer Volgende ({result.chunks.length - copiedIndices.size} over)
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadAll} data-testid="button-download">
                    <Download className="h-4 w-4 mr-1" />
                    Download Alles
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

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

          {lowChunks.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
                <Badge className="bg-gray-400 text-white">LAAG</Badge>
                Volledige code ({lowChunks.length} chunks)
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
