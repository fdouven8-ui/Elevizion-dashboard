import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const PERMISSIONS = {
  VIEW_HOME: "view_home",
  VIEW_SCREENS: "view_screens",
  EDIT_SCREENS: "edit_screens",
  VIEW_ADVERTISERS: "view_advertisers",
  EDIT_ADVERTISERS: "edit_advertisers",
  VIEW_PLACEMENTS: "view_placements",
  EDIT_PLACEMENTS: "edit_placements",
  VIEW_FINANCE: "view_finance",
  VIEW_ONBOARDING: "view_onboarding",
  ONBOARD_ADVERTISERS: "onboard_advertisers",
  ONBOARD_SCREENS: "onboard_screens",
  MANAGE_TEMPLATES: "manage_templates",
  MANAGE_INTEGRATIONS: "manage_integrations",
  MANAGE_USERS: "manage_users",
  EDIT_SYSTEM_SETTINGS: "edit_system_settings",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ROLE_PRESETS = {
  eigenaar: {
    name: "Eigenaar",
    description: "Volledige toegang tot alles",
    permissions: Object.values(PERMISSIONS),
  },
  operatie: {
    name: "Operatie",
    description: "Schermen en plaatsingen beheren",
    permissions: [
      PERMISSIONS.VIEW_HOME,
      PERMISSIONS.VIEW_SCREENS,
      PERMISSIONS.EDIT_SCREENS,
      PERMISSIONS.VIEW_ADVERTISERS,
      PERMISSIONS.VIEW_PLACEMENTS,
      PERMISSIONS.EDIT_PLACEMENTS,
      PERMISSIONS.VIEW_ONBOARDING,
      PERMISSIONS.ONBOARD_SCREENS,
    ],
  },
  sales: {
    name: "Sales",
    description: "Adverteerders en plaatsingen beheren",
    permissions: [
      PERMISSIONS.VIEW_HOME,
      PERMISSIONS.VIEW_SCREENS,
      PERMISSIONS.VIEW_ADVERTISERS,
      PERMISSIONS.EDIT_ADVERTISERS,
      PERMISSIONS.VIEW_PLACEMENTS,
      PERMISSIONS.EDIT_PLACEMENTS,
      PERMISSIONS.VIEW_ONBOARDING,
      PERMISSIONS.ONBOARD_ADVERTISERS,
    ],
  },
  finance: {
    name: "Finance",
    description: "Alleen financiële gegevens bekijken",
    permissions: [
      PERMISSIONS.VIEW_HOME,
      PERMISSIONS.VIEW_FINANCE,
    ],
  },
  readonly: {
    name: "Read-only",
    description: "Alleen bekijken, geen bewerkingen",
    permissions: [
      PERMISSIONS.VIEW_HOME,
      PERMISSIONS.VIEW_SCREENS,
      PERMISSIONS.VIEW_ADVERTISERS,
      PERMISSIONS.VIEW_PLACEMENTS,
    ],
  },
} as const;

export type RolePreset = keyof typeof ROLE_PRESETS;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).unique(),
  displayName: varchar("display_name", { length: 100 }),
  email: varchar("email").unique(),
  passwordHash: text("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: text("role").notNull().default("readonly"),
  rolePreset: text("role_preset"),
  permissions: text("permissions").array().default([]),
  locationId: varchar("location_id"),
  isActive: boolean("is_active").notNull().default(true),
  forcePasswordChange: boolean("force_password_change").notNull().default(false),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Gebruikersnaam is verplicht"),
  password: z.string().min(1, "Wachtwoord is verplicht"),
});

export const createUserSchema = z.object({
  username: z.string().min(3, "Gebruikersnaam moet minimaal 3 karakters zijn").max(50),
  displayName: z.string().max(100).optional(),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  password: z.string().min(8, "Wachtwoord moet minimaal 8 karakters zijn"),
  rolePreset: z.enum(["eigenaar", "operatie", "sales", "finance", "readonly"]).optional(),
  permissions: z.array(z.string()).optional(),
  forcePasswordChange: z.boolean().optional(),
});

export const updateUserPermissionsSchema = z.object({
  rolePreset: z.enum(["eigenaar", "operatie", "sales", "finance", "readonly"]).nullable().optional(),
  permissions: z.array(z.string()),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
