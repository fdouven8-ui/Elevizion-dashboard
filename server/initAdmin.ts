import { authStorage } from "./replit_integrations/auth/storage";
import { log } from "./index";

export async function initializeAdminUser(): Promise<void> {
  try {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || "Administrator";

    if (!adminUsername || !adminPassword) {
      log("ADMIN_USERNAME and ADMIN_PASSWORD not set - skipping admin initialization", "init");
      return;
    }

    const existingAdmin = await authStorage.getUserByUsername(adminUsername);
    
    if (existingAdmin) {
      await authStorage.updateUserPassword(existingAdmin.id, adminPassword, false);
      log(`Admin user '${adminUsername}' password synchronized from environment`, "init");
      return;
    }

    const existingUsers = await authStorage.getAllUsers();
    
    if (existingUsers.length > 0) {
      log("Users exist but admin not found, creating admin user...", "init");
    } else {
      log("Empty database, creating initial admin user...", "init");
    }
    
    await authStorage.createUser(
      adminUsername,
      adminPassword,
      adminName,
      undefined,
      "eigenaar",
      undefined,
      false
    );

    log(`Admin user '${adminUsername}' created successfully with 'eigenaar' role`, "init");
  } catch (error) {
    log(`Failed to initialize admin user: ${error}`, "init");
  }
}
