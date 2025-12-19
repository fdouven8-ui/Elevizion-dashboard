import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { authStorage } from "./storage";
import { loginSchema, PERMISSIONS, type Permission } from "@shared/models/auth";
import { storage } from "../../storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || "elevizion-secret-key-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "strict",
    },
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { message: "Te veel inlogpogingen. Probeer het over 15 minuten opnieuw." },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Ongeldige invoer", errors: parsed.error.errors });
      }

      const { username, password } = parsed.data;
      const user = await authStorage.getUserByUsername(username);

      if (!user) {
        await storage.createAuditLog({
          entityType: "auth",
          entityId: "login_failed",
          action: "login_failed",
          actorType: "system",
          changes: { username, reason: "user_not_found" },
        });
        return res.status(401).json({ message: "Ongeldige gebruikersnaam of wachtwoord" });
      }

      if (!user.isActive) {
        await storage.createAuditLog({
          entityType: "auth",
          entityId: user.id,
          action: "login_failed",
          actorType: "system",
          changes: { username, reason: "account_disabled" },
        });
        return res.status(401).json({ message: "Dit account is gedeactiveerd" });
      }

      const isValid = await authStorage.validatePassword(user, password);
      if (!isValid) {
        await storage.createAuditLog({
          entityType: "auth",
          entityId: user.id,
          action: "login_failed",
          actorType: "system",
          changes: { username, reason: "invalid_password" },
        });
        return res.status(401).json({ message: "Ongeldige gebruikersnaam of wachtwoord" });
      }

      await authStorage.updateLastLogin(user.id);
      
      await storage.createAuditLog({
        entityType: "auth",
        entityId: user.id,
        action: "login_success",
        actorType: "user",
        actorId: user.id,
        changes: { username },
      });

      (req.session as any).userId = user.id;

      const { passwordHash, ...safeUser } = user;
      res.json({ 
        user: safeUser,
        forcePasswordChange: user.forcePasswordChange,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Er is een fout opgetreden bij het inloggen" });
    }
  });

  app.post("/api/auth/change-password", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Niet ingelogd" });
      }

      const { currentPassword, newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "Nieuw wachtwoord moet minimaal 8 karakters zijn" });
      }

      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Gebruiker niet gevonden" });
      }

      if (!user.forcePasswordChange) {
        const isValid = await authStorage.validatePassword(user, currentPassword);
        if (!isValid) {
          return res.status(401).json({ message: "Huidig wachtwoord is onjuist" });
        }
      }

      await authStorage.updateUserPassword(userId, newPassword, false);
      await authStorage.clearForcePasswordChange(userId);

      await storage.createAuditLog({
        entityType: "user",
        entityId: userId,
        action: "password_changed",
        actorType: "user",
        actorId: userId,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Er is een fout opgetreden bij het wijzigen van het wachtwoord" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = (req.session as any)?.userId;
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Er is een fout opgetreden bij het uitloggen" });
      }
      if (userId) {
        storage.createAuditLog({
          entityType: "auth",
          entityId: userId,
          action: "logout",
          actorType: "user",
          actorId: userId,
        });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Niet ingelogd" });
      }

      const user = await authStorage.getUser(userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "Sessie verlopen" });
      }

      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Er is een fout opgetreden" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }

  const user = await authStorage.getUser(userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Sessie verlopen" });
  }

  (req as any).currentUser = user;
  next();
};

export const requirePermission = (...requiredPermissions: Permission[]): RequestHandler => {
  return async (req, res, next) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Niet ingelogd" });
    }

    const user = await authStorage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Gebruiker niet gevonden" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is gedeactiveerd" });
    }

    const userPermissions = user.permissions || [];
    const hasAll = requiredPermissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      return res.status(403).json({ message: "Onvoldoende rechten" });
    }

    (req as any).currentUser = user;
    next();
  };
};

export const requireAnyPermission = (...requiredPermissions: Permission[]): RequestHandler => {
  return async (req, res, next) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Niet ingelogd" });
    }

    const user = await authStorage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Gebruiker niet gevonden" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is gedeactiveerd" });
    }

    const userPermissions = user.permissions || [];
    const hasAny = requiredPermissions.some((p) => userPermissions.includes(p));

    if (!hasAny) {
      return res.status(403).json({ message: "Onvoldoende rechten" });
    }

    (req as any).currentUser = user;
    next();
  };
};
