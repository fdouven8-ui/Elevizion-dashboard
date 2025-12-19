import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, requirePermission } from "./replitAuth";
import { z } from "zod";
import { storage } from "../../storage";
import { createUserSchema, updateUserPermissionsSchema, PERMISSIONS, ROLE_PRESETS, type RolePreset } from "@shared/models/auth";
import crypto from "crypto";

function generateTemporaryPassword(): string {
  return crypto.randomBytes(6).toString("hex");
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.currentUser;
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/users", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (_req, res) => {
    try {
      const users = await authStorage.getAllUsers();
      const safeUsers = users.map(({ passwordHash, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Fout bij ophalen gebruikers" });
    }
  });

  app.post("/api/users", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (req: any, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Ongeldige invoer", errors: parsed.error.errors });
      }

      const { username, displayName, email, password, rolePreset, permissions, forcePasswordChange } = parsed.data;

      const existingUser = await authStorage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Gebruikersnaam is al in gebruik" });
      }

      const user = await authStorage.createUser(
        username,
        password,
        displayName,
        email,
        rolePreset as RolePreset | undefined,
        permissions,
        forcePasswordChange ?? true
      );

      await storage.createAuditLog({
        entityType: "user",
        entityId: user.id,
        action: "user_created",
        actorType: "user",
        actorId: req.currentUser.id,
        changes: { username, rolePreset, permissions },
      });

      const { passwordHash, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Fout bij aanmaken gebruiker" });
    }
  });

  app.patch("/api/users/:id/permissions", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (req: any, res) => {
    try {
      const { id } = req.params;
      const parsed = updateUserPermissionsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Ongeldige invoer", errors: parsed.error.errors });
      }

      const { permissions, rolePreset } = parsed.data;
      
      const oldUser = await authStorage.getUser(id);
      if (!oldUser) {
        return res.status(404).json({ message: "Gebruiker niet gevonden" });
      }

      const user = await authStorage.updateUserPermissions(id, permissions, rolePreset);

      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "permissions_changed",
        actorType: "user",
        actorId: req.currentUser.id,
        changes: { 
          oldPermissions: oldUser.permissions, 
          newPermissions: permissions,
          oldRolePreset: oldUser.rolePreset,
          newRolePreset: rolePreset,
        },
      });

      const { passwordHash, ...safeUser } = user!;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating permissions:", error);
      res.status(500).json({ message: "Fout bij bijwerken rechten" });
    }
  });

  app.post("/api/users/:id/reset-password", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await authStorage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "Gebruiker niet gevonden" });
      }

      const temporaryPassword = generateTemporaryPassword();
      await authStorage.updateUserPassword(id, temporaryPassword, true);

      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "password_reset",
        actorType: "user",
        actorId: req.currentUser.id,
      });

      res.json({ temporaryPassword });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Fout bij resetten wachtwoord" });
    }
  });

  app.post("/api/users/:id/deactivate", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (req: any, res) => {
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
        action: "user_deactivated",
        actorType: "user",
        actorId: currentUser.id,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deactivating user:", error);
      res.status(500).json({ message: "Fout bij deactiveren gebruiker" });
    }
  });

  app.post("/api/users/:id/activate", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (req: any, res) => {
    try {
      const { id } = req.params;
      await authStorage.activateUser(id);
      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "user_activated",
        actorType: "user",
        actorId: req.currentUser.id,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error activating user:", error);
      res.status(500).json({ message: "Fout bij activeren gebruiker" });
    }
  });

  app.delete("/api/users/:id", isAuthenticated, requirePermission(PERMISSIONS.MANAGE_USERS), async (req: any, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.currentUser;
      if (currentUser.id === id) {
        return res.status(400).json({ message: "Je kunt jezelf niet verwijderen" });
      }
      
      await authStorage.deleteUser(id);
      await storage.createAuditLog({
        entityType: "user",
        entityId: id,
        action: "user_deleted",
        actorType: "user",
        actorId: currentUser.id,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Fout bij verwijderen gebruiker" });
    }
  });

  app.get("/api/permissions", isAuthenticated, (_req, res) => {
    res.json({
      permissions: PERMISSIONS,
      rolePresets: ROLE_PRESETS,
    });
  });
}

export { requirePermission };
