import { db } from "../db";
import * as schema from "@shared/schema";
import { storage } from "../storage";
import { eq } from "drizzle-orm";

export async function migrateScreensToSites(): Promise<{
  success: boolean;
  message: string;
  migrated: number;
  skipped: number;
  errors: string[];
}> {
  console.log("[Migration] Starting screens to sites migration...");
  
  const errors: string[] = [];
  let migrated = 0;
  let skipped = 0;
  
  try {
    const screens = await db.select().from(schema.screens);
    console.log(`[Migration] Found ${screens.length} screens to migrate`);
    
    for (const screen of screens) {
      try {
        const existingSite = await storage.getSiteByCode(screen.screenId);
        if (existingSite) {
          console.log(`[Migration] Site already exists for ${screen.screenId}, skipping`);
          skipped++;
          continue;
        }
        
        let displayName = screen.screenId;
        if (screen.moneybirdContactSnapshot) {
          const snapshot = screen.moneybirdContactSnapshot as { company?: string };
          if (snapshot.company) {
            displayName = snapshot.company;
          }
        } else if (screen.yodeckPlayerName) {
          displayName = screen.yodeckPlayerName;
        } else if (screen.name) {
          displayName = screen.name;
        }
        
        const siteData: schema.InsertSite = {
          code: screen.screenId,
          displayName,
          yodeckScreenId: screen.yodeckPlayerId || null,
          moneybirdContactId: screen.moneybirdContactId || null,
          multiScreen: screen.isMultiScreenLocation || false,
          status: screen.isActive ? "active" : "inactive",
          notes: screen.notes,
        };
        
        const newSite = await storage.createSite(siteData);
        console.log(`[Migration] Created site ${newSite.code} (${newSite.displayName})`);
        
        if (screen.moneybirdContactId && screen.moneybirdContactSnapshot) {
          try {
            const snapshot = screen.moneybirdContactSnapshot as { 
              company?: string; 
              firstname?: string; 
              lastname?: string;
              email?: string;
              phone?: string;
              address?: string;
              city?: string;
              kvk?: string;
              btw?: string;
            };
            
            await storage.upsertSiteContactSnapshot(newSite.id, {
              companyName: snapshot.company || null,
              contactName: [snapshot.firstname, snapshot.lastname].filter(Boolean).join(" ") || null,
              email: snapshot.email || null,
              phone: snapshot.phone || null,
              address1: snapshot.address || null,
              city: snapshot.city || null,
            });
            console.log(`[Migration] Created contact snapshot for site ${newSite.code}`);
          } catch (snapshotErr: any) {
            console.error(`[Migration] Failed to create contact snapshot for ${screen.screenId}: ${snapshotErr.message}`);
          }
        }
        
        if (screen.yodeckPlayerId) {
          try {
            await storage.upsertSiteYodeckSnapshot(newSite.id, {
              screenName: screen.yodeckPlayerName || null,
              status: screen.status === "online" ? "online" : screen.status === "offline" ? "offline" : "unknown",
              lastSeen: screen.lastSeenAt || null,
              screenshotUrl: screen.yodeckScreenshotUrl || null,
            });
            console.log(`[Migration] Created Yodeck snapshot for site ${newSite.code}`);
          } catch (yodeckErr: any) {
            console.error(`[Migration] Failed to create Yodeck snapshot for ${screen.screenId}: ${yodeckErr.message}`);
          }
        }
        
        migrated++;
      } catch (err: any) {
        const errorMsg = `Failed to migrate screen ${screen.screenId}: ${err.message}`;
        console.error(`[Migration] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
    
    console.log(`[Migration] Complete - migrated: ${migrated}, skipped: ${skipped}, errors: ${errors.length}`);
    
    return {
      success: errors.length === 0,
      message: `Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`,
      migrated,
      skipped,
      errors,
    };
  } catch (err: any) {
    console.error(`[Migration] Fatal error: ${err.message}`);
    return {
      success: false,
      message: `Migration failed: ${err.message}`,
      migrated,
      skipped,
      errors: [...errors, err.message],
    };
  }
}
