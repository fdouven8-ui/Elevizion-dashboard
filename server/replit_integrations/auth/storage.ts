import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string, locationId?: string | null): Promise<User | undefined>;
  deactivateUser(id: string): Promise<void>;
  activateUser(id: string): Promise<void>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      })
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
}

export const authStorage = new AuthStorage();
