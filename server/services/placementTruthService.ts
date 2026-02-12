import { db } from "../db";
import { portalPlacements, screens, PORTAL_PLACEMENT_STATUS } from "@shared/schema";
import { eq, and, or, inArray } from "drizzle-orm";

const MAX_ADS_PER_SCREEN = 20;

export async function attemptGoLiveForAdvertiser(advertiserId: string): Promise<{
  ok: boolean;
  results: Array<{ placementId: string; screenId: string; status: string; reason?: string }>;
  locationsReconciled: string[];
  errors: string[];
}> {
  const results: Array<{ placementId: string; screenId: string; status: string; reason?: string }> = [];
  const errors: string[] = [];
  const locationIds = new Set<string>();

  const pending = await db.select()
    .from(portalPlacements)
    .where(and(
      eq(portalPlacements.advertiserId, advertiserId),
      or(
        eq(portalPlacements.status, PORTAL_PLACEMENT_STATUS.SELECTED),
        eq(portalPlacements.status, PORTAL_PLACEMENT_STATUS.QUEUED),
      )
    ));

  for (const pp of pending) {
    try {
      const liveCount = await db.select({ id: portalPlacements.id })
        .from(portalPlacements)
        .where(and(
          eq(portalPlacements.screenId, pp.screenId),
          or(
            eq(portalPlacements.status, PORTAL_PLACEMENT_STATUS.LIVE),
            eq(portalPlacements.status, PORTAL_PLACEMENT_STATUS.PAUSED),
          )
        ));

      if (liveCount.length >= MAX_ADS_PER_SCREEN) {
        await db.update(portalPlacements)
          .set({ status: PORTAL_PLACEMENT_STATUS.QUEUED, lastReason: "capacity_full", updatedAt: new Date() })
          .where(eq(portalPlacements.id, pp.id));
        results.push({ placementId: pp.id, screenId: pp.screenId, status: "queued", reason: "capacity_full" });
        continue;
      }

      await db.update(portalPlacements)
        .set({
          status: PORTAL_PLACEMENT_STATUS.LIVE,
          liveAt: new Date(),
          lastReason: null,
          updatedAt: new Date(),
        })
        .where(eq(portalPlacements.id, pp.id));

      const screen = await db.select({ locationId: screens.locationId })
        .from(screens)
        .where(eq(screens.id, pp.screenId))
        .limit(1);
      if (screen[0]?.locationId) locationIds.add(screen[0].locationId);

      results.push({ placementId: pp.id, screenId: pp.screenId, status: "live" });
    } catch (err: any) {
      errors.push(`placement ${pp.id}: ${err.message}`);
      results.push({ placementId: pp.id, screenId: pp.screenId, status: "error", reason: err.message });
    }
  }

  const locationsReconciled: string[] = [];
  if (locationIds.size > 0) {
    try {
      const { reconcileLocationTruth } = await import("./truthReconciler");
      for (const locId of Array.from(locationIds)) {
        try {
          await reconcileLocationTruth({
            locationId: locId,
            push: true,
            reason: "portal-go-live",
          });
          locationsReconciled.push(locId);
        } catch (err: any) {
          errors.push(`reconcile ${locId}: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`reconcile import: ${err.message}`);
    }
  }

  return { ok: errors.length === 0, results, locationsReconciled, errors };
}

export async function pauseAdvertiser(advertiserId: string): Promise<{
  ok: boolean;
  count: number;
}> {
  const result = await db.update(portalPlacements)
    .set({
      status: PORTAL_PLACEMENT_STATUS.PAUSED,
      pausedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(portalPlacements.advertiserId, advertiserId),
      eq(portalPlacements.status, PORTAL_PLACEMENT_STATUS.LIVE),
    ))
    .returning();
  return { ok: true, count: result.length };
}
