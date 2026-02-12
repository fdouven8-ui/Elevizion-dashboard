import { Router, Request, Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "./db";
import {
  advertisers, portalUsers, portalUserScreenSelections, plans,
  portalPlacements, screens, locations, PORTAL_PLACEMENT_STATUS,
} from "@shared/schema";
import { eq, and, or, ne, isNotNull, sql, inArray } from "drizzle-orm";
import { sendEmail, baseEmailTemplate } from "./email";

const router = Router();

function getBaseUrl(req: Request): string {
  return process.env.PUBLIC_PORTAL_URL
    || (req.headers.origin ? String(req.headers.origin) : null)
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://elevizion.nl");
}

function portalAuth(req: Request, res: Response, next: Function) {
  const portalUserId = (req.session as any)?.portalUserId;
  if (!portalUserId) {
    return res.status(401).json({ ok: false, code: "NOT_AUTHENTICATED", message: "Niet ingelogd." });
  }
  (req as any).portalUserId = portalUserId;
  next();
}

function computeOnboardingComplete(user: { companyName: string | null; contactName: string | null; phone: string | null; kvk: string | null; emailVerifiedAt: Date | null; planCode: string | null }, screenCount: number): boolean {
  return !!(user.companyName && user.contactName && user.phone && user.kvk && user.emailVerifiedAt && user.planCode && screenCount >= 1);
}

async function getScreenCount(portalUserId: string): Promise<number> {
  const rows = await db.select({ id: portalUserScreenSelections.id })
    .from(portalUserScreenSelections)
    .where(eq(portalUserScreenSelections.portalUserId, portalUserId));
  return rows.length;
}

async function recomputeOnboarding(portalUserId: string) {
  const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
  if (!user) return;
  const count = await getScreenCount(portalUserId);
  const complete = computeOnboardingComplete(user, count);
  if (user.onboardingComplete !== complete) {
    await db.update(portalUsers).set({ onboardingComplete: complete, updatedAt: new Date() }).where(eq(portalUsers.id, portalUserId));
    if (user.advertiserId) {
      await db.update(advertisers).set({ onboardingComplete: complete, updatedAt: new Date() }).where(eq(advertisers.id, user.advertiserId));
    }
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendVerifyEmail(email: string, token: string, baseUrl: string) {
  const verifyUrl = `${baseUrl}/portal/verify-email?token=${token}`;
  const { html, text } = baseEmailTemplate({
    subject: "Verifieer je e-mailadres",
    preheader: "Klik op de knop om je e-mailadres te bevestigen",
    title: "Verifieer je e-mailadres",
    introText: "Bedankt voor je registratie bij Elevizion! Klik op de onderstaande knop om je e-mailadres te bevestigen.",
    bodyBlocks: [
      { type: "paragraph", content: "Deze link is 24 uur geldig. Als je geen account hebt aangemaakt, kun je deze e-mail negeren." },
    ],
    cta: { label: "E-mailadres verifiëren", url: verifyUrl },
  });
  await sendEmail({ to: email, subject: "Verifieer je e-mailadres", html, text, templateKey: "portal_verify_email", entityType: "portal_user" });
}

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      companyName: z.string().min(1).optional(),
    }).parse(req.body);

    const emailLower = body.email.toLowerCase();
    const existing = await db.select({ id: portalUsers.id })
      .from(portalUsers)
      .where(eq(portalUsers.email, emailLower))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ ok: false, code: "EMAIL_EXISTS", message: "Er bestaat al een account met dit e-mailadres." });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [user] = await db.insert(portalUsers).values({
      email: emailLower,
      passwordHash,
      companyName: body.companyName || null,
      verifyTokenHash: tokenHash,
      verifyTokenExpiresAt: expiresAt,
    }).returning();

    const baseUrl = getBaseUrl(req);
    await sendVerifyEmail(emailLower, rawToken, baseUrl);

    res.json({ ok: true, needsVerification: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Signup]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/verify-email", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ ok: false, message: "Token ontbreekt." });

    const tokenHashed = hashToken(token);
    const [user] = await db.select().from(portalUsers)
      .where(and(
        eq(portalUsers.verifyTokenHash, tokenHashed),
      )).limit(1);

    if (!user) return res.status(400).json({ ok: false, message: "Ongeldige of verlopen verificatielink." });
    if (user.verifyTokenExpiresAt && user.verifyTokenExpiresAt < new Date()) {
      return res.status(400).json({ ok: false, message: "Verificatielink is verlopen. Vraag een nieuwe aan." });
    }
    if (user.emailVerifiedAt) {
      (req.session as any).portalUserId = user.id;
      return res.json({ ok: true, alreadyVerified: true, redirect: "/portal" });
    }

    const now = new Date();
    await db.update(portalUsers).set({
      emailVerifiedAt: now,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
      updatedAt: now,
    }).where(eq(portalUsers.id, user.id));

    if (!user.advertiserId) {
      const companyName = user.companyName || user.email.split("@")[0];
      const [adv] = await db.insert(advertisers).values({
        companyName,
        contactName: user.contactName || companyName,
        email: user.email,
        status: "active",
        onboardingStatus: "invited",
        onboardingComplete: false,
      }).returning();
      await db.update(portalUsers).set({ advertiserId: adv.id, updatedAt: now }).where(eq(portalUsers.id, user.id));
    }

    (req.session as any).portalUserId = user.id;
    res.json({ ok: true, redirect: "/portal" });
  } catch (err: any) {
    console.error("[Portal Verify Email]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/resend-verify", async (req: Request, res: Response) => {
  try {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const emailLower = body.email.toLowerCase();
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.email, emailLower)).limit(1);
    if (!user || user.emailVerifiedAt) {
      return res.json({ ok: true });
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.update(portalUsers).set({ verifyTokenHash: tokenHash, verifyTokenExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(portalUsers.id, user.id));
    await sendVerifyEmail(emailLower, rawToken, getBaseUrl(req));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const emailLower = body.email.toLowerCase();
    const [user] = await db.select().from(portalUsers)
      .where(eq(portalUsers.email, emailLower))
      .limit(1);

    if (!user) {
      return res.status(401).json({ ok: false, message: "Ongeldig e-mailadres of wachtwoord." });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ ok: false, message: "Ongeldig e-mailadres of wachtwoord." });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({ ok: false, code: "EMAIL_NOT_VERIFIED", message: "Verifieer eerst je e-mailadres. Check je inbox." });
    }

    (req.session as any).portalUserId = user.id;

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName,
        planCode: user.planCode,
        onboardingComplete: user.onboardingComplete,
      },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Ongeldige invoer" });
    console.error("[Portal Login]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  (req.session as any).portalUserId = null;
  (req.session as any).portalAdvertiserId = null;
  res.json({ ok: true });
});

router.get("/me", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (!user) return res.status(404).json({ ok: false, message: "Niet gevonden" });

    let plan = null;
    if (user.planCode) {
      const [p] = await db.select().from(plans).where(eq(plans.code, user.planCode)).limit(1);
      plan = p || null;
    }

    const selectedScreens = await db.select({ screenId: portalUserScreenSelections.screenId })
      .from(portalUserScreenSelections)
      .where(eq(portalUserScreenSelections.portalUserId, portalUserId));

    let advertiser = null;
    if (user.advertiserId) {
      const [adv] = await db.select().from(advertisers).where(eq(advertisers.id, user.advertiserId)).limit(1);
      advertiser = adv ? {
        id: adv.id,
        companyName: adv.companyName,
        contactName: adv.contactName,
        email: adv.email,
        onboardingComplete: adv.onboardingComplete,
        assetStatus: adv.assetStatus,
      } : null;
    }

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: !!user.emailVerifiedAt,
        companyName: user.companyName,
        contactName: user.contactName,
        phone: user.phone,
        kvk: user.kvk,
        vat: user.vat,
        address: user.address,
        planCode: user.planCode,
        onboardingComplete: user.onboardingComplete,
      },
      plan,
      advertiser,
      selectedScreenIds: selectedScreens.map(s => s.screenId),
    });
  } catch (err: any) {
    console.error("[Portal Me]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.patch("/me", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const body = z.object({
      companyName: z.string().min(1).optional(),
      contactName: z.string().min(1).optional(),
      phone: z.string().optional(),
      kvk: z.string().optional(),
      vat: z.string().optional(),
      address: z.string().optional(),
    }).parse(req.body);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.companyName !== undefined) updates.companyName = body.companyName;
    if (body.contactName !== undefined) updates.contactName = body.contactName;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.kvk !== undefined) updates.kvk = body.kvk;
    if (body.vat !== undefined) updates.vat = body.vat;
    if (body.address !== undefined) updates.address = body.address;

    await db.update(portalUsers).set(updates).where(eq(portalUsers.id, portalUserId));

    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (user?.advertiserId) {
      const advUpdates: Record<string, any> = { updatedAt: new Date() };
      if (body.companyName) advUpdates.companyName = body.companyName;
      if (body.contactName) advUpdates.contactName = body.contactName;
      if (body.phone) advUpdates.phone = body.phone;
      if (body.kvk) advUpdates.kvkNumber = body.kvk;
      if (body.vat) advUpdates.vatNumber = body.vat;
      if (body.address) advUpdates.address = body.address;
      await db.update(advertisers).set(advUpdates).where(eq(advertisers.id, user.advertiserId));
    }

    await recomputeOnboarding(portalUserId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal PATCH Me]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/plan", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const body = z.object({ planCode: z.string().min(1) }).parse(req.body);

    const [plan] = await db.select().from(plans).where(eq(plans.code, body.planCode)).limit(1);
    if (!plan) return res.status(400).json({ ok: false, message: "Ongeldig plan." });

    await db.update(portalUsers).set({ planCode: body.planCode, updatedAt: new Date() }).where(eq(portalUsers.id, portalUserId));

    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (user?.advertiserId) {
      await db.update(advertisers).set({ planId: plan.id, updatedAt: new Date() }).where(eq(advertisers.id, user.advertiserId));
    }

    const currentScreens = await db.select({ id: portalUserScreenSelections.id })
      .from(portalUserScreenSelections)
      .where(eq(portalUserScreenSelections.portalUserId, portalUserId));
    if (currentScreens.length > plan.maxScreens) {
      const toRemove = currentScreens.slice(plan.maxScreens);
      for (const s of toRemove) {
        await db.delete(portalUserScreenSelections).where(eq(portalUserScreenSelections.id, s.id));
      }
    }

    await recomputeOnboarding(portalUserId);
    res.json({ ok: true, planCode: body.planCode, maxScreens: plan.maxScreens });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Ongeldige invoer" });
    console.error("[Portal Plan]", err.message);
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

router.post("/screens", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const body = z.object({
      screenIds: z.array(z.string()).min(1),
    }).parse(req.body);

    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (!user?.planCode) {
      return res.status(400).json({ ok: false, code: "NO_PLAN", message: "Kies eerst een plan." });
    }

    const [plan] = await db.select().from(plans).where(eq(plans.code, user.planCode)).limit(1);
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

    await db.delete(portalUserScreenSelections).where(eq(portalUserScreenSelections.portalUserId, portalUserId));

    for (const screenId of body.screenIds) {
      await db.insert(portalUserScreenSelections).values({
        portalUserId,
        screenId,
      }).onConflictDoNothing();
    }

    if (user.advertiserId) {
      const existingPlacements = await db.select().from(portalPlacements)
        .where(and(
          eq(portalPlacements.advertiserId, user.advertiserId),
          ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
        ));
      const existingByScreen = new Map(existingPlacements.map(e => [e.screenId, e]));
      const selectedSet = new Set(body.screenIds);
      const now = new Date();

      for (const screenId of body.screenIds) {
        if (!existingByScreen.has(screenId)) {
          await db.insert(portalPlacements).values({
            advertiserId: user.advertiserId,
            screenId,
            status: PORTAL_PLACEMENT_STATUS.SELECTED,
          }).onConflictDoNothing();
        }
      }
      for (const ex of existingPlacements) {
        if (!selectedSet.has(ex.screenId) && (ex.status === PORTAL_PLACEMENT_STATUS.SELECTED || ex.status === PORTAL_PLACEMENT_STATUS.QUEUED)) {
          await db.update(portalPlacements)
            .set({ status: PORTAL_PLACEMENT_STATUS.REMOVED, removedAt: now, updatedAt: now })
            .where(eq(portalPlacements.id, ex.id));
        }
      }
    }

    await recomputeOnboarding(portalUserId);
    res.json({ ok: true, count: body.screenIds.length });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Screens]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/change-password", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const body = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }).parse(req.body);

    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (!user) return res.status(404).json({ ok: false, message: "Niet gevonden" });

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ ok: false, message: "Huidig wachtwoord is onjuist." });

    const newHash = await bcrypt.hash(body.newPassword, 10);
    await db.update(portalUsers).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(portalUsers.id, portalUserId));
    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/change-email/start", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const body = z.object({ newEmail: z.string().email() }).parse(req.body);
    const emailLower = body.newEmail.toLowerCase();

    const existing = await db.select({ id: portalUsers.id }).from(portalUsers).where(eq(portalUsers.email, emailLower)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ ok: false, message: "Dit e-mailadres is al in gebruik." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.update(portalUsers).set({
      changeEmailTokenHash: tokenHash,
      changeEmailTokenExpiresAt: expiresAt,
      pendingEmail: emailLower,
      updatedAt: new Date(),
    }).where(eq(portalUsers.id, portalUserId));

    const baseUrl = getBaseUrl(req);
    const confirmUrl = `${baseUrl}/portal/change-email?token=${rawToken}`;
    const { html, text } = baseEmailTemplate({
      subject: "Bevestig je nieuwe e-mailadres",
      preheader: "Klik om je e-mailadres te wijzigen",
      title: "Bevestig je nieuwe e-mailadres",
      introText: "Je hebt gevraagd om je e-mailadres te wijzigen. Klik op de onderstaande knop om dit te bevestigen.",
      bodyBlocks: [
        { type: "paragraph", content: `Nieuw e-mailadres: <strong>${emailLower}</strong>` },
        { type: "paragraph", content: "Deze link is 24 uur geldig." },
      ],
      cta: { label: "E-mailadres bevestigen", url: confirmUrl },
    });
    await sendEmail({ to: emailLower, subject: "Bevestig je nieuwe e-mailadres", html, text, templateKey: "portal_change_email" });

    res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: "Ongeldig e-mailadres" });
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/change-email/confirm", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ ok: false, message: "Token ontbreekt." });

    const tokenHashed = hashToken(token);
    const [user] = await db.select().from(portalUsers)
      .where(eq(portalUsers.changeEmailTokenHash, tokenHashed))
      .limit(1);

    if (!user || !user.pendingEmail) {
      return res.status(400).json({ ok: false, message: "Ongeldige of verlopen link." });
    }
    if (user.changeEmailTokenExpiresAt && user.changeEmailTokenExpiresAt < new Date()) {
      return res.status(400).json({ ok: false, message: "Link is verlopen." });
    }

    const now = new Date();
    await db.update(portalUsers).set({
      email: user.pendingEmail,
      pendingEmail: null,
      changeEmailTokenHash: null,
      changeEmailTokenExpiresAt: null,
      emailVerifiedAt: now,
      updatedAt: now,
    }).where(eq(portalUsers.id, user.id));

    if (user.advertiserId) {
      await db.update(advertisers).set({ email: user.pendingEmail, updatedAt: now }).where(eq(advertisers.id, user.advertiserId));
    }

    res.json({ ok: true, newEmail: user.pendingEmail });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.get("/placements", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (!user?.advertiserId) return res.json({ ok: true, placements: [] });

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
        eq(portalPlacements.advertiserId, user.advertiserId),
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

router.post("/upload/open", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (!user?.advertiserId) return res.status(400).json({ ok: false, message: "Account niet compleet." });
    if (!user.onboardingComplete) return res.status(400).json({ ok: false, code: "ONBOARDING_INCOMPLETE", message: "Rond eerst de onboarding af." });

    const [adv] = await db.select().from(advertisers).where(eq(advertisers.id, user.advertiserId)).limit(1);
    if (!adv) return res.status(404).json({ ok: false, message: "Niet gevonden" });

    if (!adv.linkKey) {
      const linkKey = `ADV-${adv.companyName.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 12)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      await db.update(advertisers).set({ linkKey, linkKeyGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(advertisers.id, adv.id));
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { portalTokens } = await import("@shared/schema");
    await db.insert(portalTokens).values({
      advertiserId: adv.id,
      tokenHash,
      expiresAt,
    });

    await db.update(advertisers)
      .set({ uploadEnabled: true, lastUploadTokenGeneratedAt: new Date(), updatedAt: new Date() })
      .where(eq(advertisers.id, adv.id));

    const baseUrl = getBaseUrl(req);
    res.json({ ok: true, url: `${baseUrl}/upload/${rawToken}`, token: rawToken });
  } catch (err: any) {
    console.error("[Portal Upload Open]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/onboarding", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
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

    const userUpdates: Record<string, any> = { planCode: body.planCode, updatedAt: new Date() };
    if (body.companyName) userUpdates.companyName = body.companyName;
    if (body.contactName) userUpdates.contactName = body.contactName;
    if (body.phone) userUpdates.phone = body.phone;
    if (body.kvkNumber) userUpdates.kvk = body.kvkNumber;
    if (body.vatNumber) userUpdates.vat = body.vatNumber;
    await db.update(portalUsers).set(userUpdates).where(eq(portalUsers.id, portalUserId));

    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (user?.advertiserId) {
      const advUpdates: Record<string, any> = { planId: plan.id, updatedAt: new Date() };
      if (body.companyName) advUpdates.companyName = body.companyName;
      if (body.contactName) advUpdates.contactName = body.contactName;
      if (body.phone) advUpdates.phone = body.phone;
      if (body.street) advUpdates.street = body.street;
      if (body.zipcode) advUpdates.zipcode = body.zipcode;
      if (body.city) advUpdates.city = body.city;
      if (body.kvkNumber) advUpdates.kvkNumber = body.kvkNumber;
      if (body.vatNumber) advUpdates.vatNumber = body.vatNumber;
      await db.update(advertisers).set(advUpdates).where(eq(advertisers.id, user.advertiserId));
    }

    await recomputeOnboarding(portalUserId);
    res.json({ ok: true, planId: plan.id, planCode: plan.code, maxScreens: plan.maxScreens });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Onboarding]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

router.post("/placements", portalAuth, async (req: Request, res: Response) => {
  try {
    const portalUserId = (req as any).portalUserId;
    const [user] = await db.select().from(portalUsers).where(eq(portalUsers.id, portalUserId)).limit(1);
    if (!user?.advertiserId) return res.status(400).json({ ok: false, message: "Account niet compleet." });

    const body = z.object({
      screenIds: z.array(z.string()).min(1),
    }).parse(req.body);

    if (!user.planCode) {
      return res.status(400).json({ ok: false, code: "NO_PLAN", message: "Kies eerst een plan." });
    }
    const [plan] = await db.select().from(plans).where(eq(plans.code, user.planCode)).limit(1);
    if (!plan) return res.status(400).json({ ok: false, code: "INVALID_PLAN", message: "Plan niet gevonden." });

    if (body.screenIds.length > plan.maxScreens) {
      return res.status(400).json({
        ok: false,
        code: "PLAN_LIMIT",
        message: `Je plan staat maximaal ${plan.maxScreens} schermen toe.`,
      });
    }

    const existing = await db.select().from(portalPlacements)
      .where(and(
        eq(portalPlacements.advertiserId, user.advertiserId),
        ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
      ));
    const existingByScreen = new Map(existing.map(e => [e.screenId, e]));
    const selectedSet = new Set(body.screenIds);
    const now = new Date();

    for (const screenId of body.screenIds) {
      if (!existingByScreen.has(screenId)) {
        await db.insert(portalPlacements).values({
          advertiserId: user.advertiserId,
          screenId,
          status: PORTAL_PLACEMENT_STATUS.SELECTED,
        }).onConflictDoNothing();
      }
    }
    for (const ex of existing) {
      if (!selectedSet.has(ex.screenId) && (ex.status === PORTAL_PLACEMENT_STATUS.SELECTED || ex.status === PORTAL_PLACEMENT_STATUS.QUEUED)) {
        await db.update(portalPlacements)
          .set({ status: PORTAL_PLACEMENT_STATUS.REMOVED, removedAt: now, updatedAt: now })
          .where(eq(portalPlacements.id, ex.id));
      }
    }

    await db.delete(portalUserScreenSelections).where(eq(portalUserScreenSelections.portalUserId, portalUserId));
    for (const screenId of body.screenIds) {
      await db.insert(portalUserScreenSelections).values({ portalUserId, screenId }).onConflictDoNothing();
    }

    await recomputeOnboarding(portalUserId);
    const activePlacements = await db.select().from(portalPlacements)
      .where(and(eq(portalPlacements.advertiserId, user.advertiserId), ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED)));

    res.json({ ok: true, count: activePlacements.length, onboardingComplete: user.onboardingComplete });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, message: err.errors[0]?.message || "Ongeldige invoer" });
    console.error("[Portal Placements]", err.message);
    res.status(500).json({ ok: false, message: "Interne fout" });
  }
});

export default router;
