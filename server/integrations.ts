// Yodeck API Integration
// Base URL: https://app.yodeck.com/api/v2
// Endpoint: /screens
// Auth: Token <API_KEY>
// API key is stored in integrations table as encryptedCredentials
const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

import { storage } from "./storage";
import { decryptCredentials } from "./crypto";

// Helper: Get or create default location for screen imports
// Returns the ID of the first location or creates a minimal "Default" location
async function getOrCreateDefaultLocationId(): Promise<string> {
  const locations = await storage.getLocations();
  if (locations.length > 0) {
    const id = locations[0].id;
    console.log("[DB] defaultLocationId", id);
    return id;
  }
  
  // Create minimal default location
  const defaultLocation = await storage.createLocation({
    name: "Default",
    address: "Onbekend",
    contactName: "Niet ingesteld",
    email: "noreply@example.com",
    status: "active",
  });
  console.log("[DB] defaultLocationId (created)", defaultLocation.id);
  return defaultLocation.id;
}

export interface IntegrationCredentials {
  api_key?: string;
  access_token?: string;
  admin_id?: string;
}

// Yodeck screen interface based on their JSON structure
export interface YodeckScreen {
  id: number;
  uuid: string;
  name: string;
  workspace?: { id: number; name: string };
  basic?: { tags?: string[]; description?: string };
  state?: {
    online?: boolean;
    last_seen?: string;
  };
  screenshot_url?: string;
  working_hours_config?: any;
}

// Get the API key from integrations table (decrypted) - never from env
async function getYodeckApiKey(): Promise<string | null> {
  try {
    const config = await storage.getIntegrationConfig("yodeck");
    if (!config?.encryptedCredentials) {
      console.log("[YODECK] No encryptedCredentials in DB");
      return null;
    }
    const credentials = decryptCredentials(config.encryptedCredentials);
    return credentials.api_key || null;
  } catch (error) {
    console.error("[YODECK] Failed to get API key from DB:", error);
    return null;
  }
}

// Validate API key - must be at least 10 chars
function isValidYodeckApiKey(key: string): boolean {
  return key.length >= 10;
}

// Mask API key for logging (first 4 chars + length)
function maskApiKeyForLog(key: string): string {
  if (!key || key.length < 4) return "(empty)";
  return `${key.substring(0, 4)}...(len=${key.length})`;
}

// Extract EVZ-### screen ID from Yodeck screen data
// Priority: 1) tags containing EVZ-###, 2) name containing EVZ-###, 3) null (unmapped)
export function extractScreenIdFromYodeck(screen: YodeckScreen): string | null {
  const evzPattern = /EVZ-\d{3}/;
  
  // Check tags first
  if (screen.basic?.tags) {
    for (const tag of screen.basic.tags) {
      const match = tag.match(evzPattern);
      if (match) return match[0];
    }
  }
  
  // Check name
  if (screen.name) {
    const match = screen.name.match(evzPattern);
    if (match) return match[0];
  }
  
  return null; // Unmapped
}

// Check if Yodeck is properly configured (async)
export async function isYodeckConfigured(): Promise<boolean> {
  const apiKey = await getYodeckApiKey();
  return !!apiKey && apiKey.length >= 10;
}

// Get Yodeck config status (safe for API response)
export async function getYodeckConfigStatus(): Promise<{ configured: boolean }> {
  return { configured: await isYodeckConfigured() };
}

export async function testYodeckConnection(): Promise<{ 
  ok: boolean; 
  success?: boolean;
  message: string; 
  count?: number;
  statusCode?: number;
  requestedUrl?: string;
  contentType?: string;
  bodyPreview?: string;
}> {
  const apiKey = await getYodeckApiKey();
  const configured = await isYodeckConfigured();
  
  console.log(`[YODECK TEST] configured: ${configured}`);
  console.log(`[YODECK TEST] YODECK_BASE_URL = "${YODECK_BASE_URL}"`);
  console.log(`[YODECK TEST] apiKey = ${maskApiKeyForLog(apiKey || "")}`);
  
  // Hard check: API key must exist and be at least 10 chars
  if (!apiKey || apiKey.length < 10) {
    console.log("[YODECK TEST] FAIL - Missing Yodeck API key or too short");
    return { ok: false, success: false, message: "Missing Yodeck API key", statusCode: 400 };
  }

  // Use /screens endpoint to list screens
  const fullUrl = `${YODECK_BASE_URL}/screens`;
  console.log(`[YODECK TEST] requesting: ${fullUrl}`);

  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Accept": "application/json",
      },
    });

    const statusCode = response.status;
    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();
    const bodyPreview = bodyText.substring(0, 200);
    
    console.log(`[YODECK TEST] status: ${statusCode}`);
    console.log(`[YODECK TEST] content-type: ${contentType}`);
    console.log(`[YODECK TEST] body (first 200 chars): ${bodyPreview}`);

    // Check if we got JSON response - if not, treat as failure
    if (!contentType.includes("application/json")) {
      console.log(`[YODECK TEST] FAIL - received non-JSON response: ${contentType}`);
      return { 
        ok: false, 
        message: `Yodeck returned non-JSON response (${contentType || "unknown"})`, 
        statusCode,
        requestedUrl: fullUrl,
        contentType,
        bodyPreview,
      };
    }

    if (response.ok) {
      try {
        const data = JSON.parse(bodyText);
        // API returns { results: [...], count: N } or array
        const screenList = data.results || (Array.isArray(data) ? data : []);
        const count = data.count ?? screenList.length;
        console.log(`[YODECK TEST] SUCCESS - ${count} screens found`);
        return { ok: true, success: true, message: "Verbonden met Yodeck", count, statusCode, requestedUrl: fullUrl };
      } catch (parseError) {
        console.log(`[YODECK TEST] FAIL - JSON parse error`);
        return { ok: false, success: false, message: "Invalid JSON response from Yodeck", statusCode: 502, requestedUrl: fullUrl, bodyPreview };
      }
    } else {
      console.log(`[YODECK TEST] FAIL - status ${statusCode}`);
      return { ok: false, success: false, message: `API Fout: ${statusCode} - ${bodyPreview}`, statusCode, requestedUrl: fullUrl, contentType, bodyPreview };
    }
  } catch (error: any) {
    console.log(`[YODECK TEST] FAIL - network error: ${error.message}`);
    return { ok: false, message: `Verbinding mislukt: ${error.message}`, statusCode: 0, requestedUrl: fullUrl };
  }
}

// Processed Yodeck screen with EVZ mapping
export interface ProcessedYodeckScreen {
  yodeck_screen_id: number;
  yodeck_uuid: string;
  yodeck_name: string;
  screen_id: string | null; // EVZ-### or null if unmapped
  workspace_name: string | null;
  workspace_id: number | null;
  screenshot_url: string | null;
  online: boolean;
  last_seen: string | null;
  working_hours_config: any | null;
  is_mapped: boolean;
}

export async function syncYodeckScreens(): Promise<{ 
  success: boolean; 
  screens?: ProcessedYodeckScreen[]; 
  message?: string;
  count?: number;
  mapped?: number;
  unmapped?: number;
  updated?: number;
}> {
  const apiKey = await getYodeckApiKey();
  const configured = await isYodeckConfigured();
  
  console.log(`[Yodeck] Sync screens - configured: ${configured}`);
  console.log(`[Yodeck] Sync apiKey = ${maskApiKeyForLog(apiKey || "")}`);
  
  if (!apiKey || apiKey.length < 10) {
    console.log("[Yodeck] Sync failed - Missing Yodeck API key");
    return { success: false, message: "Missing Yodeck API key" };
  }

  const allScreens: YodeckScreen[] = [];
  let nextUrl: string | null = `${YODECK_BASE_URL}/screens`;
  
  try {
    // Fetch all pages
    while (nextUrl) {
      console.log(`[Yodeck] Sync calling: GET ${nextUrl}`);
      
      const response: Response = await fetch(nextUrl, {
        method: "GET",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.log(`[Yodeck] Sync failed - non-JSON response: ${contentType}`);
        return { success: false, message: `Yodeck returned non-JSON response` };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[Yodeck] Sync failed - status ${response.status}: ${errorText.substring(0, 200)}`);
        return { success: false, message: `API error: ${response.status}` };
      }

      const data: { results?: YodeckScreen[]; next?: string | null } = await response.json();
      const pageScreens: YodeckScreen[] = data.results || [];
      allScreens.push(...pageScreens);
      
      console.log(`[Yodeck] Fetched ${pageScreens.length} screens (total: ${allScreens.length})`);
      nextUrl = data.next || null;
    }

    // Process screens and prepare for upsert
    const processedScreens: ProcessedYodeckScreen[] = [];
    for (const screen of allScreens) {
      const screenId = extractScreenIdFromYodeck(screen);
      processedScreens.push({
        yodeck_screen_id: screen.id,
        yodeck_uuid: screen.uuid,
        yodeck_name: screen.name,
        screen_id: screenId,
        workspace_name: screen.workspace?.name || null,
        workspace_id: screen.workspace?.id || null,
        screenshot_url: screen.screenshot_url || null,
        online: screen.state?.online || false,
        last_seen: screen.state?.last_seen || null,
        working_hours_config: screen.working_hours_config || null,
        is_mapped: screenId !== null,
      });
    }

    // Upsert screens to database with retry for Neon 57P01 errors
    const upsertScreensToDb = async (): Promise<number> => {
      const defaultLocationId = await getOrCreateDefaultLocationId();
      let updatedCount = 0;
      
      for (const screen of allScreens) {
        if (!screen.uuid) continue;
        
        const screenId = extractScreenIdFromYodeck(screen);
        const existing = await storage.getScreenByYodeckUuid(screen.uuid);
        
        if (existing) {
          // Update existing screen (also update locationId if missing)
          await storage.updateScreenByYodeckUuid(screen.uuid, {
            yodeckPlayerId: String(screen.id),
            yodeckPlayerName: screen.name,
            yodeckWorkspaceName: screen.workspace?.name || null,
            yodeckScreenshotUrl: screen.screenshot_url || null,
            status: screen.state?.online ? "online" : "offline",
            lastSeenAt: screen.state?.last_seen ? new Date(screen.state.last_seen) : null,
            locationId: existing.locationId || defaultLocationId,
          });
          updatedCount++;
        } else {
          // Create new screen
          const newScreenId = screenId || `YDK-${screen.id}`;
          await storage.createScreen({
            screenId: newScreenId,
            name: screen.name || `Yodeck Screen ${screen.id}`,
            locationId: defaultLocationId,
            yodeckPlayerId: String(screen.id),
            yodeckPlayerName: screen.name,
            yodeckUuid: screen.uuid,
            yodeckWorkspaceName: screen.workspace?.name || null,
            yodeckScreenshotUrl: screen.screenshot_url || null,
            status: screen.state?.online ? "online" : "offline",
            lastSeenAt: screen.state?.last_seen ? new Date(screen.state.last_seen) : null,
            isActive: true,
          });
          updatedCount++;
        }
      }
      return updatedCount;
    };

    // Execute upsert with retry for Neon connection terminated errors
    let updatedCount = 0;
    try {
      updatedCount = await upsertScreensToDb();
    } catch (dbError: any) {
      if (dbError.code === "57P01") {
        console.log("[DB] connection terminated, retrying once");
        try {
          updatedCount = await upsertScreensToDb();
        } catch (retryError: any) {
          console.log(`[DB] retry failed: ${retryError.message}`);
          await storage.updateIntegrationConfig("yodeck", {
            status: "error",
            lastTestError: `DB error after retry: ${retryError.message}`,
          });
          return { success: false, message: `Database error: ${retryError.message}` };
        }
      } else {
        throw dbError; // Re-throw non-57P01 errors
      }
    }

    // Update integration sync status
    await storage.updateIntegrationConfig("yodeck", {
      lastSyncAt: new Date(),
      lastSyncItemsProcessed: processedScreens.length,
      status: "connected",
    });
    
    const mapped = processedScreens.filter(s => s.is_mapped).length;
    const unmapped = processedScreens.filter(s => !s.is_mapped).length;
    
    console.log(`[Yodeck] Sync complete - ${processedScreens.length} screens (${mapped} mapped, ${unmapped} unmapped, ${updatedCount} updated in DB)`);
    return { 
      success: true, 
      screens: processedScreens,
      count: processedScreens.length,
      mapped,
      unmapped,
      updated: updatedCount,
    };
  } catch (error: any) {
    console.log(`[Yodeck] Sync failed - error: ${error.message}`);
    await storage.updateIntegrationConfig("yodeck", {
      status: "error",
      lastTestError: error.message,
    });
    return { success: false, message: error.message };
  }
}

// Moneybird API Integration
const MONEYBIRD_BASE_URL = "https://moneybird.com/api/v2";

export async function testMoneybirdConnection(credentials?: IntegrationCredentials): Promise<{ success: boolean; message: string; data?: any }> {
  const apiToken = credentials?.access_token || process.env.MONEYBIRD_API_TOKEN;
  const administrationId = credentials?.admin_id || process.env.MONEYBIRD_ADMINISTRATION_ID;
  
  if (!apiToken) {
    return { success: false, message: "Access token niet geconfigureerd" };
  }
  
  if (!administrationId) {
    return { success: false, message: "Administratie ID niet geconfigureerd" };
  }

  try {
    const response = await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/users.json`, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Accept": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, message: "Verbinding succesvol", data };
    } else {
      const error = await response.text();
      return { success: false, message: `API Fout: ${response.status} - ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: `Verbinding mislukt: ${error.message}` };
  }
}

export async function testDropboxSignConnection(credentials?: IntegrationCredentials): Promise<{ success: boolean; message: string; data?: any }> {
  const apiKey = credentials?.api_key || process.env.DROPBOX_SIGN_API_KEY;
  
  if (!apiKey) {
    return { success: false, message: "API key niet geconfigureerd" };
  }

  try {
    const response = await fetch("https://api.hellosign.com/v3/account", {
      headers: {
        "Authorization": `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        "Accept": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, message: "Verbinding succesvol", data };
    } else {
      const error = await response.text();
      return { success: false, message: `API Fout: ${response.status} - ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: `Verbinding mislukt: ${error.message}` };
  }
}

export async function createMoneybirdInvoice(invoiceData: {
  contactName: string;
  email: string;
  amount: number;
  description: string;
  // SEPA Incasso velden
  sepaMandate?: boolean;
  iban?: string;
  ibanAccountHolder?: string;
  sepaMandateReference?: string;
  moneybirdContactId?: string; // Use existing contact if known
}): Promise<{ success: boolean; invoiceId?: string; contactId?: string; message?: string }> {
  const apiToken = process.env.MONEYBIRD_API_TOKEN;
  const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;
  
  if (!apiToken || !administrationId) {
    return { success: false, message: "Moneybird not configured" };
  }

  try {
    let contactId = invoiceData.moneybirdContactId;

    // Create or update contact if no existing contact ID
    if (!contactId) {
      const contactPayload: any = {
        contact: {
          company_name: invoiceData.contactName,
          email: invoiceData.email,
        },
      };

      // Add SEPA Direct Debit info if mandate is active
      if (invoiceData.sepaMandate && invoiceData.iban) {
        contactPayload.contact.sepa_active = true;
        contactPayload.contact.sepa_iban = invoiceData.iban;
        contactPayload.contact.sepa_iban_account_name = invoiceData.ibanAccountHolder || invoiceData.contactName;
        contactPayload.contact.sepa_mandate_id = invoiceData.sepaMandateReference;
        contactPayload.contact.sepa_mandate_date = new Date().toISOString().split('T')[0];
        contactPayload.contact.sepa_sequence_type = "RCUR"; // Recurring
      }

      const contactResponse = await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/contacts.json`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(contactPayload),
      });

      if (contactResponse.ok) {
        const contact = await contactResponse.json();
        contactId = contact.id;
      } else {
        const error = await contactResponse.text();
        return { success: false, message: `Failed to create contact: ${error}` };
      }
    } else if (invoiceData.sepaMandate && invoiceData.iban) {
      // Update existing contact with SEPA info
      const updatePayload = {
        contact: {
          sepa_active: true,
          sepa_iban: invoiceData.iban,
          sepa_iban_account_name: invoiceData.ibanAccountHolder || invoiceData.contactName,
          sepa_mandate_id: invoiceData.sepaMandateReference,
          sepa_sequence_type: "RCUR",
        },
      };

      await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/contacts/${contactId}.json`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });
    }

    // Create invoice with SEPA payment method if mandate is active
    const invoicePayload: any = {
      sales_invoice: {
        contact_id: contactId,
        details_attributes: [
          {
            description: invoiceData.description,
            price: invoiceData.amount.toString(),
            amount: "1",
          },
        ],
      },
    };

    // Set payment method to direct debit if SEPA mandate is active
    if (invoiceData.sepaMandate && invoiceData.iban) {
      // Moneybird uses direct_debit workflow for SEPA contacts
      invoicePayload.sales_invoice.workflow_id = null; // Use default workflow
      invoicePayload.sales_invoice.payment_conditions = "Betaling via automatische incasso";
      // For SEPA direct debit, we need to set the invoice to be collected automatically
      // The contact must have sepa_active = true for this to work
      invoicePayload.sales_invoice.prices_are_incl_tax = false;
    }

    const invoiceResponse = await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/sales_invoices.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(invoicePayload),
    });

    if (invoiceResponse.ok) {
      const invoice = await invoiceResponse.json();
      return { success: true, invoiceId: invoice.id, contactId };
    } else {
      const error = await invoiceResponse.text();
      return { success: false, message: `Invoice creation failed: ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/**
 * Update SEPA mandate info for an existing Moneybird contact
 */
export async function updateMoneybirdSepaMandate(data: {
  moneybirdContactId: string;
  iban: string;
  ibanAccountHolder: string;
  sepaMandateReference: string;
  sepaMandateDate?: string;
}): Promise<{ success: boolean; message?: string }> {
  const apiToken = process.env.MONEYBIRD_API_TOKEN;
  const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;
  
  if (!apiToken || !administrationId) {
    return { success: false, message: "Moneybird not configured" };
  }

  try {
    const response = await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/contacts/${data.moneybirdContactId}.json`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        contact: {
          sepa_active: true,
          sepa_iban: data.iban,
          sepa_iban_account_name: data.ibanAccountHolder,
          sepa_mandate_id: data.sepaMandateReference,
          sepa_mandate_date: data.sepaMandateDate || new Date().toISOString().split('T')[0],
          sepa_sequence_type: "RCUR",
        },
      }),
    });

    if (response.ok) {
      return { success: true, message: "SEPA mandate updated in Moneybird" };
    } else {
      const error = await response.text();
      return { success: false, message: `Failed to update SEPA: ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

// Check if integrations are configured
export function getIntegrationStatus() {
  return {
    yodeck: {
      isConfigured: isYodeckConfigured(),
    },
    moneybird: {
      isConfigured: !!process.env.MONEYBIRD_API_TOKEN && !!process.env.MONEYBIRD_ADMINISTRATION_ID,
    },
  };
}
