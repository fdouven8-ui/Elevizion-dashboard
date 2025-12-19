import { authStorage } from "./replit_integrations/auth/storage";
import { log } from "./index";

export async function initializeAdminUser(): Promise<void> {
  try {
    const existingUsers = await authStorage.getAllUsers();
    
    if (existingUsers.length > 0) {
      log("Users already exist, skipping admin initialization", "init");
      return;
    }

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || "Administrator";

    if (!adminUsername || !adminPassword) {
      log("ADMIN_USERNAME and ADMIN_PASSWORD not set - cannot create initial admin user", "init");
      log("Set these environment variables to enable automatic admin creation on empty databases", "init");
      return;
    }

    log("Creating initial admin user...", "init");
    
    await authStorage.createUser(
      adminUsername,
      adminPassword,
      adminName,
      undefined,
      "eigenaar",
      undefined,
      false
    );

    log(`Initial admin user '${adminUsername}' created successfully with 'eigenaar' role`, "init");
  } catch (error) {
    log(`Failed to initialize admin user: ${error}`, "init");
  }
}
