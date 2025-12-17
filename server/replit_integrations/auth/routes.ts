import type { Express, RequestHandler } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { storage } from "../../storage";

const validRoles = ["admin", "finance", "ops", "viewer", "partner"] as const;
type Role = typeof validRoles[number];

async function getCurrentUser(req: any) {
  const userId = req.user?.claims?.sub;
  if (!userId) return undefined;
  return authStorage.getUser(userId);
}

export const requireRole = (...allowedRoles: Role[]): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: "Niet geauthenticeerd" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Account is gedeactiveerd" });
      }
      if (!allowedRoles.includes(user.role as Role)) {
        return res.status(403).json({ message: "Onvoldoende rechten" });
      }
      req.currentUser = user;
      next();
    } catch (error) {
      console.error("Error checking role:", error);
      res.status(500).json({ message: "Fout bij controleren rechten" });
    }
  };
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/users", isAuthenticated, requireRole("admin"), async (_req, res) => {
    try {
      const users = await authStorage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Fout bij ophalen gebruikers" });
    }
  });

  app.patch("/api/users/:id/role", isAuthenticated, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const roleSchema = z.object({
        role: z.enum(validRoles),
        locationId: z.string().nullable().optional(),
      });
      const { role, locationId } = roleSchema.parse(req.body);
      
      if (role === "partner" && !locationId) {
        return res.status(400).json({ message: "Partner rol vereist een gekoppelde locatie" });
      }
      
      const oldUser = await authStorage.getUser(id);
      const user = await authStorage.updateUserRole(id, role, locationId);
      if (!user) {
        return res.status(404).json({ message: "Gebruiker niet gevonden" });
      }
      
      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "role_changed",
        userId: req.currentUser.id,
        changes: { 
          oldRole: oldUser?.role, 
          newRole: role, 
          oldLocationId: oldUser?.locationId, 
          newLocationId: locationId 
        },
      });
      
      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Ongeldige rol", errors: error.errors });
      }
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Fout bij bijwerken rol" });
    }
  });

  app.post("/api/users/:id/deactivate", isAuthenticated, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.currentUser;
      if (currentUser.id === id) {
        return res.status(400).json({ message: "Je kunt jezelf niet deactiveren" });
      }
      await authStorage.deactivateUser(id);
      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "deactivated",
        userId: currentUser.id,
        changes: { isActive: false },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deactivating user:", error);
      res.status(500).json({ message: "Fout bij deactiveren gebruiker" });
    }
  });

  app.post("/api/users/:id/activate", isAuthenticated, requireRole("admin"), async (req: any, res) => {
    try {
      const { id } = req.params;
      await authStorage.activateUser(id);
      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "activated",
        userId: req.currentUser.id,
        changes: { isActive: true },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error activating user:", error);
      res.status(500).json({ message: "Fout bij activeren gebruiker" });
    }
  });
}
