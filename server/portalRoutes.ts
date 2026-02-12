import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import {
  advertisers, advertiserAccounts, plans, portalPlacements, screens, locations,
  PORTAL_PLACEMENT_STATUS,
} from "@shared/schema";
import { eq, and, or, ne, isNotNull, sql, inArray } from "drizzle-orm";

const router = Router();

function portalAuth(req: Request, res: Response, next: Function) {
  const advId = (req.session as any)?.portalAdvertiserId;
  if (!advId) {
    return res.status(401).json({ ok: false, code: "NOT_AUTHENTICATED", message: "Niet ingelogd." });
  }
  (req as any).portalAdvertiserId = advId;
  next();
}

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      companyName: z.string().min(1).optional(),
    }).parse(req.body);

    const existing = await db.select({ id: advertiserAccounts.id })
      .from(advertiserAccounts)
      .where(eq(advertiserAccounts.email, body.email.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ ok: false, code: "EMAIL_EXISTS", message: "Er bestaat al een account met dit e-mailadres." });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const companyName = body.companyName || body.email.split("@")[0];

    const [adv] = await db.insert(advertisers).values({
      companyName,
      contactName: companyName,
      email: body.email.toLowerCase(),
      status: "active",
      onboardingStatus: "invited",
      onboardingComplete: false,
    }).returning();

    await db.insert(advertiserAccounts).values({
      advertiserId: adv.id,
      email: body.email.toLowerCase(),
      passwordHash,
    });

    (req.session as any).portalAdvertiserId = adv.id;
    res.json({ ok: true, advertiserId: adv.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Signup]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const [account] = await db.select()
      .from(advertiserAccounts)
      .where(eq(advertiserAccounts.email, body.email.toLowerCase()))
      .limit(1);

    if (!account) {
      return res.status(401).json({ ok: false, message: "Ongeldig e-mailadres of wachtwoord." });
    }

    const valid = await bcrypt.compare(body.password, account.passwordHash);
    if (!valid) {
      return res.status(401).json({ ok: false, message: "Ongeldig e-mailadres of wachtwoord." });
    }

    (req.session as any).portalAdvertiserId = account.advertiserId;
    const [adv] = await db.select().from(advertisers).where(eq(advertisers.id, account.advertiserId)).limit(1);

    res.json({
      ok: true,
      advertiser: adv ? {
        id: adv.id,
        companyName: adv.companyName,
        email: adv.email,
        onboardingComplete: adv.onboardingComplete,
        planId: adv.planId,
      } : null,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Ongeldige invoer" });
    console.error("[Portal Login]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  (req.session as any).portalAdvertiserId = null;
  res.json({ ok: true });
});

router.get("/me", portalAuth, async (req: Request, res: Response) => {
  try {
    const advId = (req as any).portalAdvertiserId;
    const [adv] = await db.select().from(advertisers).where(eq(advertisers.id, advId)).limit(1);
    if (!adv) return res.status(404).json({ ok: false, message: "Niet gevonden" });

    let plan = null;
    if (adv.planId) {
      const [p] = await db.select().from(plans).where(eq(plans.id, adv.planId)).limit(1);
      plan = p || null;
    }

    const pps = await db.select().from(portalPlacements)
      .where(and(
        eq(portalPlacements.advertiserId, advId),
        ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
      ));

    res.json({
      ok: true,
      advertiser: {
        id: adv.id,
        companyName: adv.companyName,
        contactName: adv.contactName,
        email: adv.email,
        phone: adv.phone,
        onboardingComplete: adv.onboardingComplete,
        planId: adv.planId,
        assetStatus: adv.assetStatus,
      },
      plan,
      placements: {
        total: pps.length,
        selected: pps.filter(p => p.status === "selected").length,
        queued: pps.filter(p => p.status === "queued").length,
        live: pps.filter(p => p.status === "live").length,
        paused: pps.filter(p => p.status === "paused").length,
      },
    });
  } catch (err: any) {
    console.error("[Portal Me]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/onboarding", portalAuth, async (req: Request, res: Response) => {
  try {
    const advId = (req as any).portalAdvertiserId;
    const body = z.object({
      companyName: z.string().min(1).optional(),
      contactName: z.string().min(1).optional(),
      phone: z.string().optional(),
      street: z.string().optional(),
      zipcode: z.string().optional(),
      city: z.string().optional(),
      kvkNumber: z.string().optional(),
      vatNumber: z.string().optional(),
      planCode: z.string().min(1),
    }).parse(req.body);

    const [plan] = await db.select().from(plans).where(eq(plans.code, body.planCode)).limit(1);
    if (!plan) return res.status(400).json({ ok: false, message: "Ongeldig plan." });

    const updates: Record<string, any> = { planId: plan.id, updatedAt: new Date() };
    if (body.companyName) updates.companyName = body.companyName;
    if (body.contactName) updates.contactName = body.contactName;
    if (body.phone) updates.phone = body.phone;
    if (body.street) updates.street = body.street;
    if (body.zipcode) updates.zipcode = body.zipcode;
    if (body.city) updates.city = body.city;
    if (body.kvkNumber) updates.kvkNumber = body.kvkNumber;
    if (body.vatNumber) updates.vatNumber = body.vatNumber;

    await db.update(advertisers).set(updates).where(eq(advertisers.id, advId));

    res.json({ ok: true, planId: plan.id, planCode: plan.code, maxScreens: plan.maxScreens });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Onboarding]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/plans", async (_req: Request, res: Response) => {
  try {
    const allPlans = await db.select().from(plans).orderBy(plans.maxScreens);
    res.json({ ok: true, plans: allPlans });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/cities", async (_req: Request, res: Response) => {
  try {
    const rows = await db.selectDistinct({ city: locations.city })
      .from(locations)
      .where(and(
        isNotNull(locations.city),
        or(eq(locations.status, "active"), eq(locations.readyForAds, true)),
      ))
      .orderBy(locations.city);

    const cities = rows.map(r => r.city).filter(Boolean) as string[];
    res.json({ ok: true, cities });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/screens", async (req: Request, res: Response) => {
  try {
    const city = req.query.city as string | undefined;

    let locIds: string[] = [];
    if (city) {
      const locs = await db.select({ id: locations.id })
        .from(locations)
        .where(and(
          eq(locations.city, city),
          or(eq(locations.status, "active"), eq(locations.readyForAds, true)),
        ));
      locIds = locs.map(l => l.id);
    } else {
      const locs = await db.select({ id: locations.id })
        .from(locations)
        .where(or(eq(locations.status, "active"), eq(locations.readyForAds, true)));
      locIds = locs.map(l => l.id);
    }

    if (locIds.length === 0) {
      return res.json({ ok: true, screens: [] });
    }

    const activeScreens = await db.select({
      id: screens.id,
      screenId: screens.screenId,
      name: screens.name,
      city: screens.city,
      locationId: screens.locationId,
    })
      .from(screens)
      .where(and(
        eq(screens.isActive, true),
        inArray(screens.locationId, locIds),
      ));

    res.json({ ok: true, screens: activeScreens });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/placements", portalAuth, async (req: Request, res: Response) => {
  try {
    const advId = (req as any).portalAdvertiserId;
    const pps = await db.select({
      id: portalPlacements.id,
      screenId: portalPlacements.screenId,
      status: portalPlacements.status,
      createdAt: portalPlacements.createdAt,
      liveAt: portalPlacements.liveAt,
      pausedAt: portalPlacements.pausedAt,
      lastReason: portalPlacements.lastReason,
    })
      .from(portalPlacements)
      .where(and(
        eq(portalPlacements.advertiserId, advId),
        ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
      ));

    const screenIds = pps.map(p => p.screenId);
    let screenMap: Record<string, { name: string; city: string | null }> = {};
    if (screenIds.length > 0) {
      const scrs = await db.select({ id: screens.id, name: screens.name, city: screens.city })
        .from(screens)
        .where(inArray(screens.id, screenIds));
      for (const s of scrs) {
        screenMap[s.id] = { name: s.name, city: s.city };
      }
    }

    const items = pps.map(p => ({
      ...p,
      screenName: screenMap[p.screenId]?.name || "Onbekend",
      screenCity: screenMap[p.screenId]?.city || null,
    }));

    res.json({ ok: true, placements: items });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/placements", portalAuth, async (req: Request, res: Response) => {
  try {
    const advId = (req as any).portalAdvertiserId;
    const body = z.object({
      screenIds: z.array(z.string().uuid()).min(1),
    }).parse(req.body);

    const [adv] = await db.select({ planId: advertisers.planId }).from(advertisers).where(eq(advertisers.id, advId)).limit(1);
    if (!adv?.planId) {
      return res.status(400).json({ ok: false, code: "NO_PLAN", message: "Kies eerst een plan." });
    }

    const [plan] = await db.select().from(plans).where(eq(plans.id, adv.planId)).limit(1);
    if (!plan) {
      return res.status(400).json({ ok: false, code: "INVALID_PLAN", message: "Plan niet gevonden." });
    }

    if (body.screenIds.length > plan.maxScreens) {
      return res.status(400).json({
        ok: false,
        code: "PLAN_LIMIT",
        message: `Je plan staat maximaal ${plan.maxScreens} schermen toe.`,
        maxScreens: plan.maxScreens,
      });
    }

    const existing = await db.select()
      .from(portalPlacements)
      .where(and(
        eq(portalPlacements.advertiserId, advId),
        ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
      ));

    const existingByScreen = new Map(existing.map(e => [e.screenId, e]));
    const selectedSet = new Set(body.screenIds);
    const now = new Date();

    for (const screenId of body.screenIds) {
      const ex = existingByScreen.get(screenId);
      if (!ex) {
        await db.insert(portalPlacements).values({
          advertiserId: advId,
          screenId,
          status: PORTAL_PLACEMENT_STATUS.SELECTED,
        }).onConflictDoNothing();
      }
    }

    for (const ex of existing) {
      if (!selectedSet.has(ex.screenId) &&
          (ex.status === PORTAL_PLACEMENT_STATUS.SELECTED || ex.status === PORTAL_PLACEMENT_STATUS.QUEUED)) {
        await db.update(portalPlacements)
          .set({ status: PORTAL_PLACEMENT_STATUS.REMOVED, removedAt: now, updatedAt: now })
          .where(eq(portalPlacements.id, ex.id));
      }
    }

    const activePlacements = await db.select()
      .from(portalPlacements)
      .where(and(
        eq(portalPlacements.advertiserId, advId),
        ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
      ));

    const hasPlacementsAndPlan = activePlacements.length >= 1 && adv.planId;
    if (hasPlacementsAndPlan) {
      await db.update(advertisers)
        .set({ onboardingComplete: true, updatedAt: now })
        .where(eq(advertisers.id, advId));
    }

    res.json({
      ok: true,
      count: activePlacements.length,
      onboardingComplete: hasPlacementsAndPlan,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Placements]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/upload/open", portalAuth, async (req: Request, res: Response) => {
  try {
    const advId = (req as any).portalAdvertiserId;
    const [adv] = await db.select().from(advertisers).where(eq(advertisers.id, advId)).limit(1);
    if (!adv) return res.status(404).json({ ok: false, message: "Niet gevonden" });

    if (!adv.onboardingComplete) {
      return res.status(400).json({ ok: false, code: "ONBOARDING_INCOMPLETE", message: "Rond eerst de onboarding af." });
    }

    if (!adv.linkKey) {
      const linkKey = `ADV-${adv.companyName.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 12)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      await db.update(advertisers).set({ linkKey, linkKeyGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(advertisers.id, advId));
      (adv as any).linkKey = linkKey;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { portalTokens } = await import("@shared/schema");
    await db.insert(portalTokens).values({
      advertiserId: advId,
      tokenHash,
      expiresAt,
    });

    await db.update(advertisers)
      .set({ uploadEnabled: true, lastUploadTokenGeneratedAt: new Date(), updatedAt: new Date() })
      .where(eq(advertisers.id, advId));

    const baseUrl = process.env.PUBLIC_PORTAL_URL
      || (req.headers.origin ? String(req.headers.origin) : null)
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");

    res.json({
      ok: true,
      url: `${baseUrl}/upload/${rawToken}`,
      token: rawToken,
    });
  } catch (err: any) {
    console.error("[Portal Upload Open]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

export default router;
