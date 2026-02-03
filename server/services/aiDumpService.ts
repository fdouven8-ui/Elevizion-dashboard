import * as fs from "fs";
import * as path from "path";
import { storage } from "../storage";
import { db } from "../db";
import * as schema from "@shared/schema";
import { desc, sql } from "drizzle-orm";

const REDACTED = "***REDACTED***";
const REDACTED_URL = "***REDACTED_URL***";
const REDACTED_EMAIL = "***EMAIL***";
const REDACTED_PHONE = "***PHONE***";

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
  ".db", ".sqlite", ".lock"
];

const INCLUDED_PATTERNS = [
  /^server\//,
  /^client\/src\//,
  /^shared\//,
  /^db\//,
  /^migrations\//,
  /^scripts\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig.*\.json$/,
  /^vite\.config\./,
  /^drizzle\.config\./,
  /^tailwind\.config\./,
  /^replit\.md$/,
  /^\.env\.example$/
];

const PII_FIELDS = [
  "email", "phone", "address", "street", "postal", "postcode", "zipcode",
  "firstName", "lastName", "fullName", "contactName", "ownerName",
  "signerEmail", "signerName", "contactEmail", "contactPhone"
];

const CORE_TABLES = [
  "screens", "locations", "advertisers", "ad_assets", "placement_plans",
  "contracts", "invoices", "leads", "users", "upload_jobs"
];

export interface AiDumpOptions {
  mode: "full" | "minimal";
  maxFilesKB: number;
  maxLogLines: number;
  sampleRowsPerTable: number;
}

export interface AiDumpChunk {
  index: number;
  total: number;
  title: string;
  text: string;
}

export interface AiDumpResult {
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

function shouldIncludeFile(relativePath: string): boolean {
  for (const dir of EXCLUDED_DIRS) {
    if (relativePath.includes(`/${dir}/`) || relativePath.startsWith(`${dir}/`)) {
      return false;
    }
  }
  
  // Check explicit includes FIRST (allows package-lock.json despite .lock exclusion)
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

function collectFiles(baseDir: string, relativePath = ""): Array<{ path: string; content: string; bytes: number }> {
  const files: Array<{ path: string; content: string; bytes: number }> = [];
  const fullPath = path.join(baseDir, relativePath);
  
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      
      if (entry.isDirectory()) {
        files.push(...collectFiles(baseDir, entryRelPath));
      } else if (entry.isFile()) {
        if (shouldIncludeFile(entryRelPath)) {
          try {
            const content = fs.readFileSync(path.join(baseDir, entryRelPath), "utf-8");
            const sanitized = sanitizeText(content);
            files.push({
              path: entryRelPath,
              content: sanitized,
              bytes: Buffer.byteLength(sanitized, "utf-8")
            });
          } catch (e) {
          }
        }
      }
    }
  } catch (e) {
  }
  
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectRuntimeSnapshot(): Promise<string> {
  const snapshot: any = {
    generatedAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.TEST_MODE === "TRUE" || process.env.TEST_MODE === "true",
    adsRequireContract: process.env.ADS_REQUIRE_CONTRACT !== "false",
    legacyUploadDisabled: process.env.LEGACY_UPLOAD_DISABLED !== "false",
    yodeckConfigured: !!process.env.YODECK_AUTH_TOKEN,
    moneybirdConfigured: !!process.env.MONEYBIRD_API_TOKEN,
    objectStorageConfigured: !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
  };
  
  try {
    const screens = await storage.getScreens();
    const onlineCount = screens.filter((s: any) => s.onlineStatus === "online").length;
    snapshot.screens = {
      total: screens.length,
      online: onlineCount,
      offline: screens.length - onlineCount
    };
  } catch (e) {
    snapshot.screens = { error: "Could not fetch" };
  }
  
  try {
    const advertisers = await storage.getAdvertisers();
    const activeCount = advertisers.filter((a: any) => a.status === "active").length;
    snapshot.advertisers = {
      total: advertisers.length,
      active: activeCount
    };
  } catch (e) {
    snapshot.advertisers = { error: "Could not fetch" };
  }
  
  try {
    const locations = await storage.getLocations();
    const activeCount = locations.filter((l: any) => l.status === "active").length;
    snapshot.locations = {
      total: locations.length,
      active: activeCount
    };
  } catch (e) {
    snapshot.locations = { error: "Could not fetch" };
  }
  
  return `=== RUNTIME SNAPSHOT ===\n${JSON.stringify(snapshot, null, 2)}\n`;
}

async function collectFlowMap(): Promise<string> {
  const routesPath = path.join(process.cwd(), "server/routes.ts");
  let flowMap = "=== EXPRESS ROUTES FLOW MAP ===\n";
  
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
    
    flowMap += "| Method | Path |\n";
    flowMap += "|--------|------|\n";
    for (const route of routes) {
      flowMap += `| ${route.method.padEnd(6)} | ${route.path} |\n`;
    }
    flowMap += `\nTotal routes: ${routes.length}\n`;
  } catch (e) {
    flowMap += "Could not parse routes\n";
  }
  
  return flowMap + "\n";
}

async function collectDbSchema(): Promise<string> {
  let schema = "=== DATABASE SCHEMA ===\n";
  
  const schemaPath = path.join(process.cwd(), "shared/schema.ts");
  try {
    const content = fs.readFileSync(schemaPath, "utf-8");
    schema += "--- File: shared/schema.ts ---\n";
    schema += sanitizeText(content);
    schema += "\n\n";
  } catch (e) {
    schema += "Could not read schema.ts\n";
  }
  
  return schema;
}

async function collectSampleData(sampleRows: number): Promise<string> {
  let data = "=== SAMPLE DATA (SANITIZED) ===\n";
  
  const tableMap: Record<string, any> = {
    screens: schema.screens,
    locations: schema.locations,
    advertisers: schema.advertisers,
    ad_assets: schema.adAssets,
    placement_plans: schema.placementPlans,
    contracts: schema.contracts,
    invoices: schema.invoices,
    leads: schema.leads,
    users: schema.users,
    upload_jobs: schema.uploadJobs
  };
  
  for (const [tableName, tableSchema] of Object.entries(tableMap)) {
    try {
      if (!tableSchema) continue;
      const result = await db.select().from(tableSchema).limit(sampleRows);
      
      if (result && result.length > 0) {
        const sanitized = sanitizeObject(result);
        data += `\n--- Table: ${tableName} (${result.length} rows) ---\n`;
        data += JSON.stringify(sanitized, null, 2);
        data += "\n";
      }
    } catch (e: any) {
      data += `\n--- Table: ${tableName} ---\nError: ${e.message}\n`;
    }
  }
  
  return data;
}

async function collectScreenMappings(): Promise<string> {
  let mappings = "=== SCREEN -> PLAYLIST MAPPINGS ===\n";
  
  try {
    const screens = await storage.getScreens();
    const locations = await storage.getLocations();
    const locationMap = new Map(locations.map(l => [l.id, l]));
    
    mappings += "| Screen ID | Yodeck Player ID | Location Playlist ID | Location Status |\n";
    mappings += "|-----------|------------------|---------------------|----------------|\n";
    
    for (const screen of screens) {
      const location = screen.locationId ? locationMap.get(screen.locationId) : null;
      const playlistId = location?.yodeckPlaylistId || "-";
      const status = location?.status || "unknown";
      mappings += `| ${screen.id} | ${screen.yodeckPlayerId || "-"} | ${playlistId} | ${status} |\n`;
    }
    
    mappings += `\nTotal: ${screens.length} screens\n`;
  } catch (e) {
    mappings += "Could not fetch screen mappings\n";
  }
  
  return mappings + "\n";
}

async function collectAdvertiserMappings(): Promise<string> {
  let mappings = "=== ADVERTISER -> CONTRACTS -> PLACEMENTS ===\n";
  
  try {
    const advertisers = await storage.getAdvertisers();
    const contracts = await storage.getContracts();
    const placements = await storage.getPlacements();
    
    for (const adv of advertisers.slice(0, 10)) {
      mappings += `\n## Advertiser: ${adv.id} | Status: ${adv.status} | MediaID: ${adv.yodeckMediaIdCanonical || "-"}\n`;
      
      const advContracts = contracts.filter(c => c.advertiserId === adv.id);
      if (advContracts.length > 0) {
        mappings += `  Contracts: ${advContracts.length}\n`;
        for (const contract of advContracts.slice(0, 3)) {
          mappings += `    - Contract ${contract.id}: ${contract.status}\n`;
        }
      }
      
      const advContractIds = new Set(advContracts.map(c => c.id));
      const advPlacements = placements.filter(p => p.contractId && advContractIds.has(p.contractId));
      if (advPlacements.length > 0) {
        mappings += `  Placements: ${advPlacements.length}\n`;
        for (const p of advPlacements.slice(0, 3)) {
          mappings += `    - Placement ${p.id}: screen=${p.screenId}, active=${p.isActive}\n`;
        }
      }
    }
  } catch (e) {
    mappings += "Could not fetch advertiser mappings\n";
  }
  
  return mappings + "\n";
}

function chunkText(text: string, maxKB: number): string[] {
  const maxBytes = maxKB * 1024;
  const chunks: string[] = [];
  
  let currentChunk = "";
  const lines = text.split("\n");
  
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + "\n", "utf-8");
    const currentBytes = Buffer.byteLength(currentChunk, "utf-8");
    
    if (currentBytes + lineBytes > maxBytes && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

export async function generateAiDump(options: AiDumpOptions): Promise<AiDumpResult> {
  const bundleId = `aidump_${Date.now()}`;
  const generatedAt = new Date().toISOString();
  
  console.log(`[AI-Dump] ${bundleId}: Starting generation...`);
  
  let fullText = "";
  let fileCount = 0;
  let tableCount = 0;
  
  const snapshot = await collectRuntimeSnapshot();
  fullText += snapshot;
  
  const flowMap = await collectFlowMap();
  fullText += flowMap;
  
  const screenMappings = await collectScreenMappings();
  fullText += screenMappings;
  
  const advertiserMappings = await collectAdvertiserMappings();
  fullText += advertiserMappings;
  
  const schema = await collectDbSchema();
  fullText += schema;
  
  const sampleData = await collectSampleData(options.sampleRowsPerTable);
  fullText += sampleData;
  tableCount = CORE_TABLES.length;
  
  fullText += "=== CODE FILES ===\n";
  const files = collectFiles(process.cwd());
  fileCount = files.length;
  
  for (const file of files) {
    fullText += `\n---FILE: ${file.path} (bytes=${file.bytes})---\n`;
    fullText += file.content;
    fullText += "\n";
  }
  
  const rawChunks = chunkText(fullText, options.maxFilesKB);
  const chunks: AiDumpChunk[] = rawChunks.map((text, i) => {
    const lines = text.split("\n").slice(0, 5);
    const title = lines.find(l => l.startsWith("===") || l.startsWith("---FILE:")) || `Chunk ${i + 1}`;
    
    const header = `=== AI_DUMP CHUNK ${i + 1}/${rawChunks.length} | bundleId=${bundleId} | generatedAt=${generatedAt} ===\n\n`;
    
    return {
      index: i + 1,
      total: rawChunks.length,
      title: title.replace(/[=\-]/g, "").trim().substring(0, 60),
      text: header + text
    };
  });
  
  console.log(`[AI-Dump] ${bundleId}: Generated ${chunks.length} chunks, ${fileCount} files`);
  
  return {
    ok: true,
    bundleId,
    chunks,
    summary: {
      files: fileCount,
      chunks: chunks.length,
      logs: 0,
      schema: true,
      tables: tableCount
    }
  };
}
