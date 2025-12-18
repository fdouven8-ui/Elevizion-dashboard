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
      invoicePayload.sales_invoice.payment_conditions = "Betaling via automatische incasso";
      // Note: Moneybird will automatically use SEPA Direct Debit for contacts with active SEPA
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
      isConfigured: !!process.env.YODECK_API_TOKEN,
    },
    moneybird: {
      isConfigured: !!process.env.MONEYBIRD_API_TOKEN && !!process.env.MONEYBIRD_ADMINISTRATION_ID,
    },
  };
}
