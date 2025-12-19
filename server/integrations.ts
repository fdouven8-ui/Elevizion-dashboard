// Yodeck API Integration
// IMPORTANT: API key is read ONLY from process.env.YODECK_API_KEY - never from frontend or local files
// Official API docs: https://app.yodeck.com/api-docs/
// Base URL: https://app.yodeck.com/api/v1
// Auth: Bearer <api_key>
const YODECK_BASE_URL = "https://app.yodeck.com/api/v1";

export interface IntegrationCredentials {
  api_key?: string;
  access_token?: string;
  admin_id?: string;
}

// Get the API key, stripping any prefix like "yodeck:" if present
function getYodeckApiKey(): string | undefined {
  const rawKey = process.env.YODECK_API_KEY;
  if (!rawKey) return undefined;
  // Strip common prefixes if present
  if (rawKey.startsWith("yodeck:")) return rawKey.slice(7);
  return rawKey;
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

  // Use /screens endpoint to list screens (per official docs)
  const fullUrl = `${YODECK_BASE_URL}/screens`;
  console.log(`[YODECK TEST] requesting: ${fullUrl}`);

  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
        // v3 API returns { results: [...], count: N }
        const deviceCount = data.count ?? (Array.isArray(data) ? data.length : (data.results?.length || 0));
        console.log(`[YODECK TEST] SUCCESS - ${deviceCount} devices found`);
        return { ok: true, message: "Verbonden met Yodeck", deviceCount, statusCode, requestedUrl: fullUrl };
      } catch (parseError) {
        console.log(`[YODECK TEST] FAIL - JSON parse error`);
        return { ok: false, message: "Invalid JSON response from Yodeck", statusCode, requestedUrl: fullUrl, bodyPreview };
      }
    } else {
      console.log(`[YODECK TEST] FAIL - status ${statusCode}`);
      return { ok: false, message: `API Fout: ${statusCode}`, statusCode, requestedUrl: fullUrl, contentType, bodyPreview };
    }
  } catch (error: any) {
    console.log(`[YODECK TEST] FAIL - network error: ${error.message}`);
    return { ok: false, message: `Verbinding mislukt: ${error.message}`, statusCode: 0, requestedUrl: fullUrl };
  }
}

export async function syncYodeckScreens(): Promise<{ success: boolean; screens?: any[]; message?: string }> {
  const apiKey = getYodeckApiKey();
  
  console.log(`[Yodeck] Sync screens - configured: ${isYodeckConfigured()}`);
  
  if (!apiKey || apiKey.length <= 10) {
    console.log("[Yodeck] Sync failed - YODECK_API_KEY missing");
    return { success: false, message: "YODECK_API_KEY ontbreekt" };
  }

  const url = `${YODECK_BASE_URL}/screens`;
  console.log(`[Yodeck] Sync calling: GET ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const bodyText = await response.text();
    
    console.log(`[Yodeck] Sync response status: ${response.status}, content-type: ${contentType}`);
    console.log(`[Yodeck] Sync body (first 100 chars): ${bodyText.substring(0, 100)}`);

    // Check if we got HTML instead of JSON
    if (contentType.includes("text/html") || bodyText.startsWith("<!") || bodyText.startsWith("<html")) {
      return { success: false, message: "Wrong Yodeck API URL/endpoint (HTML Not Found)" };
    }

    if (response.ok) {
      try {
        const data = JSON.parse(bodyText);
        // v3 API returns { results: [...], count: N }
        const screenList = data.results || (Array.isArray(data) ? data : []);
        console.log(`[Yodeck] Sync success - ${screenList.length} screens`);
        return { success: true, screens: screenList };
      } catch (parseError) {
        return { success: false, message: "Invalid JSON response from Yodeck" };
      }
    } else {
      console.log(`[Yodeck] Sync failed - status ${response.status}`);
      return { success: false, message: `Schermen ophalen mislukt: ${response.status}` };
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
