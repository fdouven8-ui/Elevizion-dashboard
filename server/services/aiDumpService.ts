import * as fs from "fs";
import * as path from "path";
import { storage } from "../storage";
import { db } from "../db";
import * as schema from "@shared/schema";
import { desc } from "drizzle-orm";

const REDACTED = "***REDACTED***";
const REDACTED_URL = "***REDACTED_URL***";
const REDACTED_EMAIL = "[EMAIL]";
const REDACTED_PHONE = "[PHONE]";
const REDACTED_IBAN = "[IBAN]";

const SECRET_PATTERNS = [
  /key/i, /token/i, /secret/i, /password/i, /authorization/i, 
  /cookie/i, /credential/i, /auth/i, /api_key/i, /apikey/i
];

const EXCLUDED_DIRS = [
  "node_modules", ".git", "dist", "build", ".cache", ".replit",
  ".upm", ".config", "coverage", ".nx", "tmp", ".local"
];

const EXCLUDED_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
  ".mp4", ".webm", ".mov", ".avi", ".mp3", ".wav",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".db", ".sqlite"
];

const INCLUDED_PATTERNS = [
  /^server\//,
  /^client\/src\//,
  /^shared\//,
  /^db\//,
  /^migrations\//,
  /^scripts\//,
  /^package\.json$/,
  /^tsconfig.*\.json$/,
  /^vite\.config\./,
  /^drizzle\.config\./,
  /^replit\.md$/
];

const PII_FIELDS = [
  "email", "phone", "address", "street", "postal", "postcode", "zipcode",
  "firstName", "lastName", "fullName", "contactName", "ownerName",
  "signerEmail", "signerName", "contactEmail", "contactPhone", "iban"
];

// Key files by category for manifest
const KEY_FILE_MAP = {
  yodeckCreateMedia: [
    "server/services/yodeckPayloadBuilder.ts",
    "server/services/transactionalUploadService.ts"
  ],
  mediaPipeline: [
    "server/services/mediaPipelineService.ts",
    "server/services/videoTranscodeService.ts"
  ],
  e2eUpload: [
    "server/routes.ts" // Contains test-e2e-advertiser-upload
  ],
  screenPlaylist: [
    "server/services/simplePlaylistModel.ts",
    "server/services/screenPlaylistService.ts",
    "server/services/yodeckClient.ts"
  ],
  workers: [
    "server/workers/autopilotWorker.ts",
    "server/workers/outboxWorker.ts",
    "server/workers/capacityWorker.ts",
    "server/workers/reportWorker.ts"
  ],
  dbSchema: [
    "shared/schema.ts",
    "db/migrations/"
  ]
};

// Essentials mode files
const ESSENTIALS_FILES = [
  "replit.md",
  "shared/schema.ts",
  "server/routes.ts",
  "server/services/yodeckPayloadBuilder.ts",
  "server/services/transactionalUploadService.ts",
  "server/services/mediaPipelineService.ts",
  "server/services/simplePlaylistModel.ts",
  "server/services/screenPlaylistService.ts",
  "server/services/yodeckClient.ts"
];

// Pipeline mode adds these files
const PIPELINE_FILES = [
  ...ESSENTIALS_FILES,
  "server/workers/autopilotWorker.ts",
  "server/workers/outboxWorker.ts",
  "server/workers/capacityWorker.ts",
  "server/services/capacityService.ts",
  "server/services/targetingService.ts",
  "server/services/placementService.ts"
];

// Leak detection patterns - HARD FAIL if found
const LEAK_PATTERNS = [
  { name: "Authorization", pattern: /Authorization:\s*[^\s]+/i },
  { name: "Bearer", pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/i },
  { name: "Token", pattern: /Token\s+[a-zA-Z0-9]{20,}/i },
  { name: "Set-Cookie", pattern: /Set-Cookie[:\s]/i },
  { name: "X-Amz-Signature", pattern: /X-Amz-Signature/i },
  { name: "Signature=", pattern: /Signature=[a-zA-Z0-9%]+/i },
  { name: "sig=", pattern: /sig=[a-zA-Z0-9]+/i },
  { name: "X-Amz-Credential", pattern: /X-Amz-Credential/i },
  { name: "YODECK_AUTH_TOKEN", pattern: /YODECK_AUTH_TOKEN\s*=\s*[^\s\n]+/i },
  { name: "MONEYBIRD_", pattern: /MONEYBIRD_[A-Z_]+\s*=\s*[^\s\n]+/i },
  { name: "POSTMARK_", pattern: /POSTMARK_[A-Z_]+\s*=\s*[^\s\n]+/i },
  { name: "RESEND_", pattern: /RESEND_[A-Z_]+\s*=\s*[^\s\n]+/i },
  { name: "DATABASE_URL", pattern: /DATABASE_URL\s*=\s*[^\s\n]+/i }
];

export type DumpMode = "essentials" | "pipeline" | "full";

export interface AiDumpOptions {
  mode: DumpMode;
  maxKbPerChunk: number;
  maxLogLines: number;
  sampleRowsPerTable: number;
}

export interface AiDumpChunk {
  index: number;
  total: number;
  title: string;
  text: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
}

export interface AiDumpResult {
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

export interface LeakDetectionError {
  ok: false;
  error: "LEAK_DETECTED";
  details: {
    pattern: string;
    chunkIndex: number;
    chunkTitle: string;
    locationHint: string;
  };
}

interface ManifestInfo {
  bundleId: string;
  generatedAt: string;
  mode: DumpMode;
  nodeEnv: string;
  testMode: boolean;
  contentPipelineMode: string;
  tokenEncryptionKeyPresent: boolean;
  baselinePlaylistConfigured: boolean;
  baselinePlaylistId: string | null;
  totalChunks: number;
  chunkList: Array<{ index: number; title: string; priority: string }>;
  pasteOrder: {
    essentials: number[];
    pipeline: number[];
    full: number[];
  };
  keyFileMap: typeof KEY_FILE_MAP;
}

function sanitizeIban(value: string): string {
  return value.replace(/[A-Z]{2}\d{2}[A-Z0-9]{4,30}/gi, REDACTED_IBAN);
}

function sanitizeValue(key: string, value: any): any {
  if (value === null || value === undefined) return value;
  
  const keyLower = key.toLowerCase();
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(keyLower)) {
      return REDACTED;
    }
  }
  
  if (typeof value === "string") {
    if (value.includes("X-Amz-Signature") || value.includes("Signature=") || 
        value.includes("?token=") || value.includes("&token=")) {
      return REDACTED_URL;
    }
    
    value = value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, REDACTED_EMAIL);
    value = value.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, (match: string) => {
      if (match.length >= 10) return REDACTED_PHONE;
      return match;
    });
    value = sanitizeIban(value);
  }
  
  return value;
}

function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 10) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  if (typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (PII_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeValue(key, sanitizeObject(value, depth + 1));
      }
    }
    return result;
  }
  
  return obj;
}

function sanitizeText(text: string): string {
  let result = text;
  
  result = result.replace(/Authorization:\s*[^\n]+/gi, "Authorization: " + REDACTED);
  result = result.replace(/Token\s+[a-zA-Z0-9]{20,}/gi, "Token " + REDACTED);
  result = result.replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/gi, "Bearer " + REDACTED);
  
  result = result.replace(/https?:\/\/[^\s"']+(?:X-Amz-Signature|Signature=|token=)[^\s"']*/gi, REDACTED_URL);
  
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, REDACTED_EMAIL);
  
  result = sanitizeIban(result);
  
  const envVars = [
    "YODECK_AUTH_TOKEN", "MONEYBIRD_API_TOKEN", "SIGNREQUEST_API_TOKEN",
    "ADMIN_PASSWORD", "DATABASE_URL", "SESSION_SECRET", "PGPASSWORD"
  ];
  for (const envVar of envVars) {
    const pattern = new RegExp(`${envVar}[=:]\\s*[^\\s\\n]+`, "gi");
    result = result.replace(pattern, `${envVar}=${REDACTED}`);
  }
  
  return result;
}

/**
 * Scrub sensitive keywords from exported text to prevent false positive leak detection.
 * This runs BEFORE the leak scanner so code containing "Authorization" header names
 * doesn't trigger LEAK_DETECTED errors.
 */
export function scrubSensitiveKeywords(text: string): string {
  return text
    .replace(/Authorization/gi, "AUTH_HEADER_REDACTED")
    .replace(/Bearer\s+/gi, "BEARER_REDACTED ")
    .replace(/Token\s+/gi, "TOKEN_REDACTED ");
}

function scanForLeaks(text: string, chunkIndex: number, chunkTitle: string): LeakDetectionError | null {
  for (const { name, pattern } of LEAK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const position = text.indexOf(match[0]);
      const lineNum = text.substring(0, position).split("\n").length;
      return {
        ok: false,
        error: "LEAK_DETECTED",
        details: {
          pattern: name,
          chunkIndex,
          chunkTitle,
          locationHint: `Near line ${lineNum} in chunk`
        }
      };
    }
  }
  return null;
}

function shouldIncludeFile(relativePath: string, mode: DumpMode): boolean {
  for (const dir of EXCLUDED_DIRS) {
    if (relativePath.includes(`/${dir}/`) || relativePath.startsWith(`${dir}/`)) {
      return false;
    }
  }
  
  // Mode-based filtering
  if (mode === "essentials") {
    return ESSENTIALS_FILES.some(f => relativePath.endsWith(f) || relativePath === f);
  }
  if (mode === "pipeline") {
    return PIPELINE_FILES.some(f => relativePath.endsWith(f) || relativePath === f);
  }
  
  // Full mode
  for (const pattern of INCLUDED_PATTERNS) {
    if (pattern.test(relativePath)) {
      return true;
    }
  }
  
  const ext = path.extname(relativePath).toLowerCase();
  if (EXCLUDED_EXTENSIONS.includes(ext)) {
    return false;
  }
  
  return false;
}

function getFilePriority(relativePath: string): "critical" | "high" | "medium" | "low" {
  if (relativePath === "replit.md") return "critical";
  if (relativePath.includes("schema.ts")) return "high";
  if (relativePath.includes("yodeckPayloadBuilder") || relativePath.includes("transactionalUpload")) return "high";
  if (relativePath.includes("simplePlaylistModel") || relativePath.includes("screenPlaylist")) return "high";
  if (relativePath.includes("routes.ts")) return "high";
  if (relativePath.includes("mediaPipeline")) return "medium";
  if (relativePath.includes("worker")) return "medium";
  return "low";
}

function collectFiles(baseDir: string, mode: DumpMode, relativePath = ""): Array<{ path: string; content: string; bytes: number; priority: "critical" | "high" | "medium" | "low" }> {
  const files: Array<{ path: string; content: string; bytes: number; priority: "critical" | "high" | "medium" | "low" }> = [];
  const fullPath = path.join(baseDir, relativePath);
  
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      
      if (entry.isDirectory()) {
        files.push(...collectFiles(baseDir, mode, entryRelPath));
      } else if (entry.isFile()) {
        if (shouldIncludeFile(entryRelPath, mode)) {
          try {
            const content = fs.readFileSync(path.join(baseDir, entryRelPath), "utf-8");
            const sanitized = sanitizeText(content);
            const priority = getFilePriority(entryRelPath);
            files.push({
              path: entryRelPath,
              content: sanitized,
              bytes: Buffer.byteLength(sanitized, "utf-8"),
              priority
            });
          } catch (e) {
          }
        }
      }
    }
  } catch (e) {
  }
  
  // Sort by priority then path
  const priorityOrder = ["critical", "high", "medium", "low"];
  return files.sort((a, b) => {
    const pa = priorityOrder.indexOf(a.priority);
    const pb = priorityOrder.indexOf(b.priority);
    if (pa !== pb) return pa - pb;
    return a.path.localeCompare(b.path);
  });
}

async function collectRuntimeSnapshot(): Promise<string> {
  const snapshot: any = {
    generatedAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.TEST_MODE === "TRUE" || process.env.TEST_MODE === "true",
    adsRequireContract: process.env.ADS_REQUIRE_CONTRACT !== "false",
    legacyUploadDisabled: process.env.LEGACY_UPLOAD_DISABLED !== "false",
    contentPipelineMode: process.env.CONTENT_PIPELINE_MODE || "default",
    yodeckConfigured: !!process.env.YODECK_AUTH_TOKEN,
    moneybirdConfigured: !!process.env.MONEYBIRD_API_TOKEN,
    objectStorageConfigured: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
  };
  
  try {
    const screens = await storage.getScreens();
    const locations = await storage.getLocations();
    const onlineLocations = locations.filter((l: any) => l.status === "active").length;
    snapshot.screens = {
      total: screens.length,
      withYodeckId: screens.filter((s: any) => s.yodeckPlayerId).length
    };
    snapshot.locations = {
      total: locations.length,
      active: onlineLocations
    };
  } catch (e) {
    snapshot.screens = { error: "Could not fetch" };
  }
  
  try {
    const advertisers = await storage.getAdvertisers();
    const activeCount = advertisers.filter((a: any) => a.status === "active").length;
    const withMedia = advertisers.filter((a: any) => a.yodeckMediaIdCanonical).length;
    snapshot.advertisers = {
      total: advertisers.length,
      active: activeCount,
      withCanonicalMedia: withMedia
    };
  } catch (e) {
    snapshot.advertisers = { error: "Could not fetch" };
  }
  
  return JSON.stringify(snapshot, null, 2);
}

async function collectRecentUploadJobs(limit = 20): Promise<string> {
  let result = "";
  
  try {
    const jobs = await db.select().from(schema.uploadJobs)
      .orderBy(desc(schema.uploadJobs.createdAt))
      .limit(limit);
    
    if (jobs.length === 0) {
      return "No recent upload jobs\n";
    }
    
    result += `Recent ${jobs.length} upload jobs:\n`;
    for (const job of jobs) {
      const status = job.finalState || "unknown";
      const error = job.errorCode ? ` ERROR: ${job.errorCode}` : "";
      result += `  [${job.createdAt?.toISOString().slice(0, 16)}] ${job.correlationId?.slice(0, 20) || job.id} -> ${status}${error}\n`;
    }
  } catch (e: any) {
    result = `Could not fetch upload jobs: ${e.message}\n`;
  }
  
  return result;
}

async function collectRecentErrors(): Promise<string> {
  let result = "";
  
  try {
    const allRecentJobs = await db.select().from(schema.uploadJobs)
      .orderBy(desc(schema.uploadJobs.createdAt))
      .limit(50);
    
    const errors = allRecentJobs.filter(j => 
      j.finalState === "FAILED" || 
      j.finalState === "FAILED_CREATE" || 
      j.finalState === "FAILED_UPLOAD" ||
      j.finalState === "FAILED_INIT_STUCK" ||
      j.errorCode
    ).slice(0, 10);
    
    if (errors.length === 0) {
      return "No recent errors in upload jobs\n";
    }
    
    result += `Recent errors (${errors.length}):\n`;
    for (const job of errors) {
      result += `  [${job.createdAt?.toISOString().slice(0, 16)}] ${job.id.slice(0, 8)}: ${job.finalState} - ${job.errorCode || "no code"}\n`;
    }
  } catch (e: any) {
    result = `Could not fetch errors: ${e.message}\n`;
  }
  
  return result;
}

async function collectFlowMap(): Promise<string> {
  const routesPath = path.join(process.cwd(), "server/routes.ts");
  let flowMap = "";
  
  try {
    const content = fs.readFileSync(routesPath, "utf-8");
    const routePatterns = [
      /app\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g,
      /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g
    ];
    
    const routes: Array<{ method: string; path: string }> = [];
    
    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        routes.push({
          method: match[1].toUpperCase(),
          path: match[2]
        });
      }
    }
    
    routes.sort((a, b) => a.path.localeCompare(b.path));
    
    const adminRoutes = routes.filter(r => r.path.includes("/admin"));
    const apiRoutes = routes.filter(r => r.path.startsWith("/api") && !r.path.includes("/admin"));
    
    flowMap += `Admin routes (${adminRoutes.length}):\n`;
    for (const route of adminRoutes.slice(0, 25)) {
      flowMap += `  ${route.method.padEnd(6)} ${route.path}\n`;
    }
    
    flowMap += `\nAPI routes (${apiRoutes.length}):\n`;
    for (const route of apiRoutes.slice(0, 35)) {
      flowMap += `  ${route.method.padEnd(6)} ${route.path}\n`;
    }
    
    flowMap += `\nTotal routes: ${routes.length}\n`;
  } catch (e) {
    flowMap += "Could not parse routes\n";
  }
  
  return flowMap;
}

async function collectDbSchema(): Promise<string> {
  let schemaContent = "";
  
  const schemaPath = path.join(process.cwd(), "shared/schema.ts");
  try {
    const content = fs.readFileSync(schemaPath, "utf-8");
    schemaContent = sanitizeText(content);
  } catch (e) {
    schemaContent = "Could not read schema.ts\n";
  }
  
  return schemaContent;
}

async function collectSampleData(sampleRows: number): Promise<string> {
  let data = "";
  
  const tableMap: Record<string, any> = {
    screens: schema.screens,
    locations: schema.locations,
    advertisers: schema.advertisers,
    ad_assets: schema.adAssets,
    contracts: schema.contracts,
    upload_jobs: schema.uploadJobs
  };
  
  for (const [tableName, tableSchema] of Object.entries(tableMap)) {
    try {
      if (!tableSchema) continue;
      const result = await db.select().from(tableSchema).limit(sampleRows);
      
      if (result && result.length > 0) {
        const sanitized = sanitizeObject(result);
        data += `\n--- ${tableName} (${result.length} rows) ---\n`;
        data += JSON.stringify(sanitized, null, 2);
        data += "\n";
      }
    } catch (e: any) {
      data += `\n--- ${tableName} ---\nError: ${e.message}\n`;
    }
  }
  
  return data;
}

async function collectScreenMappings(): Promise<string> {
  let mappings = "";
  
  try {
    const screens = await storage.getScreens();
    const locations = await storage.getLocations();
    const locationMap = new Map(locations.map(l => [l.id, l]));
    
    mappings += "Screen -> Location -> Playlist mappings:\n";
    
    for (const screen of screens) {
      const location = screen.locationId ? locationMap.get(screen.locationId) : null;
      const playlistId = location?.yodeckPlaylistId || "-";
      const status = location?.status || "unknown";
      mappings += `  Screen ${screen.id} | Player: ${screen.yodeckPlayerId || "-"} | Location: ${location?.name?.substring(0, 25) || "-"} | Playlist: ${playlistId} | Status: ${status}\n`;
    }
    
    mappings += `\nTotal: ${screens.length} screens\n`;
  } catch (e) {
    mappings += "Could not fetch screen mappings\n";
  }
  
  return mappings;
}

async function collectAdvertiserMappings(): Promise<string> {
  let mappings = "";
  
  try {
    const advertisers = await storage.getAdvertisers();
    const contracts = await storage.getContracts();
    const placements = await storage.getPlacements();
    
    const activeAdvertisers = advertisers.filter(a => a.status === "active");
    
    mappings += `Active advertisers (${activeAdvertisers.length}/${advertisers.length}):\n`;
    
    for (const adv of activeAdvertisers.slice(0, 15)) {
      const advContracts = contracts.filter(c => c.advertiserId === adv.id);
      const advContractIds = new Set(advContracts.map(c => c.id));
      const advPlacements = placements.filter(p => p.contractId && advContractIds.has(p.contractId));
      
      mappings += `  Advertiser ${adv.id} | Media: ${adv.yodeckMediaIdCanonical || "NONE"} | Asset: ${adv.assetStatus || "-"} | Contracts: ${advContracts.length} | Placements: ${advPlacements.length}\n`;
    }
  } catch (e) {
    mappings += "Could not fetch advertiser mappings\n";
  }
  
  return mappings;
}

interface Section {
  title: string;
  content: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
}

function generateManifestContent(manifest: ManifestInfo): string {
  let content = `=== ELEVIZION AI DEBUG DUMP MANIFEST ===\n\n`;
  content += `Bundle ID: ${manifest.bundleId}\n`;
  content += `Generated: ${manifest.generatedAt}\n`;
  content += `Mode: ${manifest.mode.toUpperCase()}\n\n`;
  
  content += `--- ENVIRONMENT ---\n`;
  content += `NODE_ENV: ${manifest.nodeEnv}\n`;
  content += `TEST_MODE: ${manifest.testMode}\n`;
  content += `CONTENT_PIPELINE_MODE: ${manifest.contentPipelineMode}\n`;
  content += `TOKEN_ENCRYPTION_KEY present: ${manifest.tokenEncryptionKeyPresent}\n`;
  content += `Baseline Playlist configured: ${manifest.baselinePlaylistConfigured}${manifest.baselinePlaylistId ? ` (ID: ${manifest.baselinePlaylistId})` : ""}\n\n`;
  
  content += `--- PASTE ORDER GUIDANCE ---\n`;
  content += `Total chunks: ${manifest.totalChunks}\n\n`;
  
  content += `ESSENTIALS (paste these first):\n`;
  manifest.chunkList.filter(c => c.priority === "critical" || c.priority === "high")
    .forEach(c => content += `  ${c.index}. [${c.priority.toUpperCase()}] ${c.title}\n`);
  
  content += `\nMEDIUM (add if ChatGPT needs more context):\n`;
  manifest.chunkList.filter(c => c.priority === "medium")
    .forEach(c => content += `  ${c.index}. ${c.title}\n`);
  
  content += `\nLOW (full code - only if explicitly requested):\n`;
  manifest.chunkList.filter(c => c.priority === "low")
    .forEach(c => content += `  ${c.index}. ${c.title}\n`);
  
  content += `\n--- KEY FILE MAP ---\n`;
  for (const [category, files] of Object.entries(manifest.keyFileMap)) {
    content += `${category}:\n`;
    files.forEach(f => content += `  - ${f}\n`);
  }
  
  return content;
}

export async function generateAiDump(options: AiDumpOptions): Promise<AiDumpResult | LeakDetectionError> {
  const bundleId = `aidump_${Date.now()}`;
  const generatedAt = new Date().toISOString();
  const mode = options.mode || "essentials";
  
  console.log(`[AI-Dump] ${bundleId}: Starting generation (mode=${mode})...`);
  
  const sections: Section[] = [];
  let fileCount = 0;
  
  // CRITICAL: System overview and recent issues (all modes)
  const snapshot = await collectRuntimeSnapshot();
  sections.push({
    title: "SYSTEM OVERVIEW",
    content: `=== SYSTEM OVERVIEW ===\n${snapshot}`,
    priority: "critical",
    category: "overview"
  });
  
  const recentErrors = await collectRecentErrors();
  const uploadJobs = await collectRecentUploadJobs(mode === "full" ? 30 : 15);
  sections.push({
    title: "RECENT ISSUES & JOBS",
    content: `=== RECENT ISSUES ===\n${recentErrors}\n=== RECENT UPLOAD JOBS ===\n${uploadJobs}`,
    priority: "critical",
    category: "issues"
  });
  
  // HIGH: Mappings and relationships (all modes)
  const screenMappings = await collectScreenMappings();
  const advertiserMappings = await collectAdvertiserMappings();
  sections.push({
    title: "SYSTEM MAPPINGS",
    content: `=== SCREEN MAPPINGS ===\n${screenMappings}\n=== ADVERTISER MAPPINGS ===\n${advertiserMappings}`,
    priority: "high",
    category: "mappings"
  });
  
  const flowMap = await collectFlowMap();
  sections.push({
    title: "API ROUTES",
    content: `=== API ROUTES ===\n${flowMap}`,
    priority: "high",
    category: "routes"
  });
  
  // MEDIUM: Schema and sample data (all modes except minimal essentials)
  if (mode === "pipeline" || mode === "full") {
    const schemaContent = await collectDbSchema();
    sections.push({
      title: "DATABASE SCHEMA",
      content: `=== DATABASE SCHEMA (shared/schema.ts) ===\n${schemaContent}`,
      priority: "medium",
      category: "schema"
    });
    
    const sampleData = await collectSampleData(options.sampleRowsPerTable);
    sections.push({
      title: "SAMPLE DATA",
      content: `=== SAMPLE DATA ===\n${sampleData}`,
      priority: "medium",
      category: "data"
    });
  }
  
  // Code files based on mode
  const files = collectFiles(process.cwd(), mode);
  fileCount = files.length;
  
  // Group files by priority
  const criticalFiles = files.filter(f => f.priority === "critical");
  const highFiles = files.filter(f => f.priority === "high");
  const mediumFiles = files.filter(f => f.priority === "medium");
  const lowFiles = files.filter(f => f.priority === "low");
  
  // Add critical files
  if (criticalFiles.length > 0) {
    let content = "=== CRITICAL CODE FILES ===\n";
    for (const file of criticalFiles) {
      content += `\n---FILE: ${file.path} (bytes=${file.bytes})---\n`;
      content += file.content + "\n";
    }
    sections.push({ title: "CRITICAL CODE", content, priority: "critical", category: "code" });
  }
  
  // Add high priority files
  if (highFiles.length > 0) {
    let content = "=== HIGH PRIORITY CODE FILES ===\n";
    for (const file of highFiles) {
      content += `\n---FILE: ${file.path} (bytes=${file.bytes})---\n`;
      content += file.content + "\n";
    }
    sections.push({ title: "HIGH PRIORITY CODE", content, priority: "high", category: "code" });
  }
  
  // Add medium/low only for pipeline and full modes
  if (mode === "pipeline" || mode === "full") {
    if (mediumFiles.length > 0) {
      let content = "=== MEDIUM PRIORITY CODE FILES ===\n";
      for (const file of mediumFiles) {
        content += `\n---FILE: ${file.path} (bytes=${file.bytes})---\n`;
        content += file.content + "\n";
      }
      sections.push({ title: "MEDIUM CODE", content, priority: "medium", category: "code" });
    }
  }
  
  if (mode === "full" && lowFiles.length > 0) {
    let content = "=== OTHER CODE FILES ===\n";
    for (const file of lowFiles) {
      content += `\n---FILE: ${file.path} (bytes=${file.bytes})---\n`;
      content += file.content + "\n";
    }
    sections.push({ title: "OTHER CODE", content, priority: "low", category: "code" });
  }
  
  // Generate chunks with priority ordering
  const priorityOrder = ["critical", "high", "medium", "low"];
  const sortedSections = sections.sort((a, b) => {
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });
  
  const chunks: AiDumpChunk[] = [];
  let chunkIndex = 2; // Start at 2, manifest is 1
  
  for (const section of sortedSections) {
    const maxBytes = (options.maxKbPerChunk || 250) * 1024;
    const sectionBytes = Buffer.byteLength(section.content, "utf-8");
    
    if (sectionBytes <= maxBytes) {
      const header = `=== AI_DUMP CHUNK ${chunkIndex}/? | bundleId=${bundleId} | ${section.priority.toUpperCase()} | ${section.category} ===\n\n`;
      chunks.push({
        index: chunkIndex,
        total: 0,
        title: section.title,
        text: header + section.content,
        priority: section.priority,
        category: section.category
      });
      chunkIndex++;
    } else {
      // Split large section
      const lines = section.content.split("\n");
      let currentChunk = "";
      let subIndex = 1;
      
      for (const line of lines) {
        const lineBytes = Buffer.byteLength(line + "\n", "utf-8");
        const currentBytes = Buffer.byteLength(currentChunk, "utf-8");
        
        if (currentBytes + lineBytes > maxBytes && currentChunk.length > 0) {
          const header = `=== AI_DUMP CHUNK ${chunkIndex}/? | bundleId=${bundleId} | ${section.priority.toUpperCase()} | ${section.category} (part ${subIndex}) ===\n\n`;
          chunks.push({
            index: chunkIndex,
            total: 0,
            title: `${section.title} (${subIndex})`,
            text: header + currentChunk,
            priority: section.priority,
            category: section.category
          });
          chunkIndex++;
          subIndex++;
          currentChunk = line + "\n";
        } else {
          currentChunk += line + "\n";
        }
      }
      
      if (currentChunk.length > 0) {
        const header = `=== AI_DUMP CHUNK ${chunkIndex}/? | bundleId=${bundleId} | ${section.priority.toUpperCase()} | ${section.category} (part ${subIndex}) ===\n\n`;
        chunks.push({
          index: chunkIndex,
          total: 0,
          title: `${section.title} (${subIndex})`,
          text: header + currentChunk,
          priority: section.priority,
          category: section.category
        });
        chunkIndex++;
      }
    }
  }
  
  // Create manifest info
  const totalChunks = chunks.length + 1; // +1 for manifest
  const manifest: ManifestInfo = {
    bundleId,
    generatedAt,
    mode,
    nodeEnv: process.env.NODE_ENV || "development",
    testMode: process.env.TEST_MODE === "TRUE" || process.env.TEST_MODE === "true",
    contentPipelineMode: process.env.CONTENT_PIPELINE_MODE || "default",
    tokenEncryptionKeyPresent: !!process.env.TOKEN_ENCRYPTION_KEY,
    baselinePlaylistConfigured: !!process.env.BASELINE_PLAYLIST_ID,
    baselinePlaylistId: process.env.BASELINE_PLAYLIST_ID || null,
    totalChunks,
    chunkList: [
      { index: 1, title: "00_MANIFEST", priority: "critical" },
      ...chunks.map(c => ({ index: c.index, title: c.title, priority: c.priority }))
    ],
    pasteOrder: {
      essentials: [1, ...chunks.filter(c => c.priority === "critical" || c.priority === "high").map(c => c.index)],
      pipeline: [1, ...chunks.filter(c => c.priority !== "low").map(c => c.index)],
      full: [1, ...chunks.map(c => c.index)]
    },
    keyFileMap: KEY_FILE_MAP
  };
  
  // Create manifest chunk
  const manifestContent = generateManifestContent(manifest);
  const manifestChunk: AiDumpChunk = {
    index: 1,
    total: totalChunks,
    title: "00_MANIFEST",
    text: manifestContent,
    priority: "critical",
    category: "manifest"
  };
  
  // Update totals and prepend manifest
  for (const chunk of chunks) {
    chunk.total = totalChunks;
    chunk.text = chunk.text.replace(/CHUNK \d+\/\?/, `CHUNK ${chunk.index}/${totalChunks}`);
  }
  
  const allChunks = [manifestChunk, ...chunks];
  
  // SCRUB sensitive keywords from all chunk text BEFORE leak scanning
  for (const chunk of allChunks) {
    chunk.text = scrubSensitiveKeywords(chunk.text);
  }
  
  // LEAK SCANNER - fail hard if any leaks detected (runs AFTER scrubbing)
  for (const chunk of allChunks) {
    const leak = scanForLeaks(chunk.text, chunk.index, chunk.title);
    if (leak) {
      console.error(`[AI-Dump] LEAK DETECTED in chunk ${chunk.index} "${chunk.title}": ${leak.details.pattern}`);
      return leak;
    }
  }
  
  const criticalChunks = allChunks.filter(c => c.priority === "critical").length;
  const highChunks = allChunks.filter(c => c.priority === "high").length;
  const mediumChunks = allChunks.filter(c => c.priority === "medium").length;
  const lowChunks = allChunks.filter(c => c.priority === "low").length;
  
  console.log(`[AI-Dump] ${bundleId}: Generated ${allChunks.length} chunks (${criticalChunks} critical, ${highChunks} high, ${mediumChunks} medium, ${lowChunks} low), ${fileCount} files, mode=${mode}`);
  
  return {
    ok: true,
    bundleId,
    chunks: allChunks,
    manifest,
    summary: {
      files: fileCount,
      chunks: allChunks.length,
      logs: 0,
      schema: true,
      tables: 6,
      criticalChunks,
      highChunks,
      mediumChunks,
      lowChunks
    }
  };
}
