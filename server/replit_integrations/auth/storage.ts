import { users, type User, type UpsertUser, ROLE_PRESETS, type RolePreset } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(username: string, password: string, displayName?: string, email?: string, rolePreset?: RolePreset, customPermissions?: string[], forcePasswordChange?: boolean): Promise<User>;
  updateUserPassword(id: string, newPassword: string, forceChange?: boolean): Promise<void>;
  updateUserPermissions(id: string, permissions: string[], rolePreset?: string | null): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string, locationId?: string | null): Promise<User | undefined>;
  deactivateUser(id: string): Promise<void>;
  activateUser(id: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  validatePassword(user: User, password: string): Promise<boolean>;
  updateLastLogin(id: string): Promise<void>;
  clearForcePasswordChange(id: string): Promise<void>;
}

const BCRYPT_ROUNDS = 12;

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
    return user;
  }

  async createUser(
    username: string,
    password: string,
    displayName?: string,
    email?: string,
    rolePreset?: RolePreset,
    customPermissions?: string[],
    forcePasswordChange: boolean = true
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    let permissions: string[] = [];
    let role = "readonly";
    
    if (rolePreset && ROLE_PRESETS[rolePreset]) {
      permissions = [...ROLE_PRESETS[rolePreset].permissions];
      role = rolePreset;
    } else if (customPermissions) {
      permissions = customPermissions;
    }

    const [user] = await db
      .insert(users)
      .values({
        username: username.toLowerCase(),
        displayName: displayName || username,
        email: email || null,
        passwordHash,
        role,
        rolePreset: rolePreset || null,
        permissions,
        forcePasswordChange,
        isActive: true,
      })
      .returning();
    
    return user;
  }

  async updateUserPassword(id: string, newPassword: string, forceChange: boolean = false): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db
      .update(users)
      .set({ 
        passwordHash, 
        forcePasswordChange: forceChange,
        updatedAt: new Date() 
      })
      .where(eq(users.id, id));
  }

  async updateUserPermissions(id: string, permissions: string[], rolePreset?: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ 
        permissions, 
        rolePreset: rolePreset || null,
        role: rolePreset || "custom",
        updatedAt: new Date() 
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUserRole(id: string, role: string, locationId?: string | null): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, locationId, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deactivateUser(id: string): Promise<void> {
    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async activateUser(id: string): Promise<void> {
    await db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async deleteUser(id: string): Promise<void> {
    await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  async updateLastLogin(id: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id));
  }

  async clearForcePasswordChange(id: string): Promise<void> {
    await db.update(users).set({ forcePasswordChange: false, updatedAt: new Date() }).where(eq(users.id, id));
  }
}

export const authStorage = new AuthStorage();
