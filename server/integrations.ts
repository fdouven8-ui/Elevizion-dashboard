// Yodeck API Integration
// IMPORTANT: API key is read ONLY from process.env.YODECK_API_KEY - never from frontend or local files
// Base URL: https://api.yodeck.com/v3
// Endpoint for screens: /monitors
// Auth: Token <label>:<token_value> - keep the full secret unchanged
const YODECK_BASE_URL = "https://api.yodeck.com/v3";

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
  basic?: { tags?: string[] };
  state?: {
    online?: boolean;
    last_seen?: string;
  };
  screenshot_url?: string;
  working_hours_config?: any;
}

// Get the raw API key - keep it unchanged (includes label:token format)
function getYodeckApiKey(): string | undefined {
  return process.env.YODECK_API_KEY;
}

// Validate API key format - should be "label:token" format
function isValidYodeckApiKey(key: string): boolean {
  return key.length > 10 && key.includes(":");
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

// Check if Yodeck is properly configured
export function isYodeckConfigured(): boolean {
  const apiKey = getYodeckApiKey();
  return !!apiKey && apiKey.length > 10;
}

// Get Yodeck config status (safe for API response)
export function getYodeckConfigStatus(): { configured: boolean } {
  return { configured: isYodeckConfigured() };
}

export async function testYodeckConnection(): Promise<{ 
  ok: boolean; 
  message: string; 
  deviceCount?: number;
  statusCode?: number;
  requestedUrl?: string;
  contentType?: string;
  bodyPreview?: string;
}> {
  const apiKey = getYodeckApiKey();
  
  console.log(`[YODECK TEST] configured: ${isYodeckConfigured()}`);
  console.log(`[YODECK TEST] YODECK_BASE_URL = "${YODECK_BASE_URL}"`);
  
  if (!apiKey || apiKey.length <= 10) {
    console.log("[YODECK TEST] FAIL - YODECK_API_KEY missing or too short");
    return { ok: false, message: "YODECK_API_KEY ontbreekt of is ongeldig", statusCode: 400 };
  }

  // Validate API key format
  if (!isValidYodeckApiKey(apiKey)) {
    console.log(`[YODECK TEST] Invalid API key format - must be label:token format with length > 10`);
    return { ok: false, message: "Invalid API key format - must be label:token format" };
  }

  // Use /monitors endpoint to list screens
  const fullUrl = `${YODECK_BASE_URL}/monitors`;
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
        const sampleFields = ["id", "uuid", "name", "workspace.name", "state.online"];
        console.log(`[YODECK TEST] SUCCESS - ${count} screens found`);
        return { ok: true, message: "Verbonden met Yodeck", count, sampleFields, statusCode, requestedUrl: fullUrl };
      } catch (parseError) {
        console.log(`[YODECK TEST] FAIL - JSON parse error`);
        return { ok: false, message: "Invalid JSON response from Yodeck", statusCode: 502, requestedUrl: fullUrl, bodyPreview };
      }
    } else {
      console.log(`[YODECK TEST] FAIL - status ${statusCode}`);
      return { ok: false, message: `API Fout: ${statusCode}`, statusCode: 502, requestedUrl: fullUrl, contentType, bodyPreview };
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
  requestedUrl?: string;
  statusCode?: number;
  contentType?: string;
  bodyPreview?: string;
}> {
  const apiKey = getYodeckApiKey();
  
  console.log(`[Yodeck] Sync screens - configured: ${isYodeckConfigured()}`);
  
  if (!apiKey || apiKey.length <= 10) {
    console.log("[Yodeck] Sync failed - YODECK_API_KEY missing");
    return { success: false, message: "YODECK_API_KEY ontbreekt" };
  }

  const url = `${YODECK_BASE_URL}/monitors`;
  console.log(`[Yodeck] Sync calling: GET ${url}`);

  try {
    const response = await fetch(url, {
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
    
    console.log(`[Yodeck] Sync response status: ${statusCode}, content-type: ${contentType}`);
    console.log(`[Yodeck] Sync body (first 200 chars): ${bodyPreview}`);

    // Check if we got non-JSON response
    if (!contentType.includes("application/json")) {
      console.log(`[Yodeck] Sync failed - non-JSON response: ${contentType}`);
      return { 
        success: false, 
        message: `Yodeck returned non-JSON response (${contentType || "unknown"})`,
        requestedUrl: url,
        statusCode: 502,
        contentType,
        bodyPreview 
      };
    }

    if (response.ok) {
      try {
        const data = JSON.parse(bodyText);
        // API returns { results: [...], count: N } or array
        const rawScreens: YodeckScreen[] = data.results || (Array.isArray(data) ? data : []);
        
        // Process screens with EVZ-### mapping
        const processedScreens: ProcessedYodeckScreen[] = rawScreens.map(screen => {
          const screenId = extractScreenIdFromYodeck(screen);
          return {
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
          };
        });
        
        const mapped = processedScreens.filter(s => s.is_mapped).length;
        const unmapped = processedScreens.filter(s => !s.is_mapped).length;
        
        console.log(`[Yodeck] Sync success - ${processedScreens.length} screens (${mapped} mapped, ${unmapped} unmapped)`);
        return { 
          success: true, 
          screens: processedScreens,
          count: processedScreens.length,
          mapped,
          unmapped,
          requestedUrl: url,
          statusCode
        };
      } catch (parseError) {
        console.log(`[Yodeck] Sync failed - JSON parse error`);
        return { success: false, message: "Invalid JSON response from Yodeck", statusCode: 502, requestedUrl: url, bodyPreview };
      }
    } else {
      console.log(`[Yodeck] Sync failed - status ${statusCode}`);
      return { success: false, message: `Schermen ophalen mislukt: ${statusCode}`, statusCode: 502, requestedUrl: url, contentType, bodyPreview };
    }
  } catch (error: any) {
    console.log(`[Yodeck] Sync failed - error: ${error.message}`);
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
