// Yodeck API Integration
const YODECK_BASE_URL = "https://app.yodeck.com/api/v1";

export async function testYodeckConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  const apiToken = process.env.YODECK_API_TOKEN;
  
  if (!apiToken) {
    return { success: false, message: "YODECK_API_TOKEN not configured" };
  }

  try {
    const response = await fetch(`${YODECK_BASE_URL}/screens`, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, message: "Connected successfully", data };
    } else {
      const error = await response.text();
      return { success: false, message: `API Error: ${response.status} - ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

export async function syncYodeckScreens(): Promise<{ success: boolean; screens?: any[]; message?: string }> {
  const apiToken = process.env.YODECK_API_TOKEN;
  
  if (!apiToken) {
    return { success: false, message: "YODECK_API_TOKEN not configured" };
  }

  try {
    const response = await fetch(`${YODECK_BASE_URL}/screens`, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const screens = await response.json();
      return { success: true, screens };
    } else {
      return { success: false, message: `Failed to fetch screens: ${response.status}` };
    }
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

// Moneybird API Integration
const MONEYBIRD_BASE_URL = "https://moneybird.com/api/v2";

export async function testMoneybirdConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  const apiToken = process.env.MONEYBIRD_API_TOKEN;
  const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;
  
  if (!apiToken) {
    return { success: false, message: "MONEYBIRD_API_TOKEN not configured" };
  }
  
  if (!administrationId) {
    return { success: false, message: "MONEYBIRD_ADMINISTRATION_ID not configured" };
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
      return { success: true, message: "Connected successfully", data };
    } else {
      const error = await response.text();
      return { success: false, message: `API Error: ${response.status} - ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

export async function createMoneybirdInvoice(invoiceData: {
  contactName: string;
  email: string;
  amount: number;
  description: string;
}): Promise<{ success: boolean; invoiceId?: string; message?: string }> {
  const apiToken = process.env.MONEYBIRD_API_TOKEN;
  const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;
  
  if (!apiToken || !administrationId) {
    return { success: false, message: "Moneybird not configured" };
  }

  try {
    // First, create or find contact
    const contactResponse = await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/contacts.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        contact: {
          company_name: invoiceData.contactName,
          email: invoiceData.email,
        },
      }),
    });

    let contactId: string;
    if (contactResponse.ok) {
      const contact = await contactResponse.json();
      contactId = contact.id;
    } else {
      return { success: false, message: "Failed to create contact" };
    }

    // Create invoice
    const invoiceResponse = await fetch(`${MONEYBIRD_BASE_URL}/${administrationId}/sales_invoices.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });

    if (invoiceResponse.ok) {
      const invoice = await invoiceResponse.json();
      return { success: true, invoiceId: invoice.id };
    } else {
      const error = await invoiceResponse.text();
      return { success: false, message: `Invoice creation failed: ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

// Check if integrations are configured
export function getIntegrationStatus() {
  return {
    yodeck: {
      isConfigured: !!process.env.YODECK_API_TOKEN,
    },
    moneybird: {
      isConfigured: !!process.env.MONEYBIRD_API_TOKEN && !!process.env.MONEYBIRD_ADMINISTRATION_ID,
    },
  };
}
