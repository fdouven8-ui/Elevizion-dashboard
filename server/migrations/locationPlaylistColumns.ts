import { db } from "../db";
import { sql } from "drizzle-orm";

export async function runLocationPlaylistMigration(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL || "";
  const maskedUrl = dbUrl.replace(/:\/\/[^@]+@/, "://***:***@");
  const host = maskedUrl.match(/@([^:/]+)/)?.[1] || "unknown";
  const dbName = maskedUrl.match(/\/([^?]+)/)?.[1] || "unknown";
  
  console.log(`[Migration] Database: host=${host}, db=${dbName}, NODE_ENV=${process.env.NODE_ENV}`);
  
  const tableResult = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%location%'
  `);
  
  const tables = tableResult.rows.map((r: any) => r.table_name);
  console.log(`[Migration] Found location tables: ${JSON.stringify(tables)}`);
  
  const targetTable = tables.find((t: string) => t === "locations") || tables[0];
  
  if (!targetTable) {
    console.error("[Migration] FATAL: No locations table found!");
    throw new Error("MIGRATION_FAILED: No locations table found");
  }
  
  console.log(`[Migration] Applying playlist columns to table: ${targetTable}`);
  
  await db.execute(sql`
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS playlist_mode VARCHAR(20) NOT NULL DEFAULT 'TAG_BASED'
  `);
  
  await db.execute(sql`
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS playlist_tag TEXT
  `);
  
  await db.execute(sql`
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS yodeck_playlist_verified_at TIMESTAMPTZ
  `);
  
  await db.execute(sql`
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS yodeck_playlist_verify_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN'
  `);
  
  await db.execute(sql`
    ALTER TABLE locations
      ADD COLUMN IF NOT EXISTS last_yodeck_verify_error TEXT
  `);
  
  await db.execute(sql`
    UPDATE locations
    SET playlist_tag = 'elevizion:location:' || id::text
    WHERE playlist_tag IS NULL OR playlist_tag = ''
  `);
  
  const verifyResult = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations'
    AND column_name IN ('playlist_mode','playlist_tag','yodeck_playlist_verified_at','yodeck_playlist_verify_status','last_yodeck_verify_error')
    ORDER BY column_name
  `);
  
  const columns = verifyResult.rows.map((r: any) => r.column_name);
  console.log(`[Migration] Verified columns: ${JSON.stringify(columns)}`);
  
  if (columns.length < 5) {
    console.error(`[Migration] FATAL: Expected 5 columns, found ${columns.length}`);
    throw new Error(`MIGRATION_FAILED: Only ${columns.length}/5 playlist columns exist`);
  }
  
  console.log("[Migration] Playlist columns migration complete (5/5 columns verified)");
}
