/**
 * Moneybird API Client
 * 
 * Centralized client for Moneybird API interactions with:
 * - Automatic pagination handling
 * - Rate limiting respect (1000 requests per 5 minutes)
 * - Request timeout handling
 * - In-memory caching with TTL
 * 
 * Auth: Bearer <personal_access_token>
 * Base URL: https://moneybird.com/api/v2
 */

const MONEYBIRD_BASE_URL = "https://moneybird.com/api/v2";
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY_BASE = 1000;
const DEFAULT_PER_PAGE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Debug flag
const DEBUG_MONEYBIRD = process.env.DEBUG_MONEYBIRD === "true";

function debugLog(...args: any[]) {
  if (DEBUG_MONEYBIRD) {
    console.log("[Moneybird]", ...args);
  }
}

// Types based on Moneybird API
export interface MoneybirdAdministration {
  id: string;
  name: string;
  language: string;
  currency: string;
  country: string;
  time_zone: string;
}

export interface MoneybirdContactPerson {
  id: string;
  contact_id: string;
  firstname: string;
  lastname: string;
  phone: string;
  email: string;
}

export interface MoneybirdContact {
  id: string;
  company_name: string;
  firstname: string;
  lastname: string;
  address1: string;
  address2: string;
  zipcode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  email_ubl: boolean;
  send_invoices_to_email: string;
  send_estimates_to_email: string;
  sepa_active: boolean;
  sepa_iban: string;
  sepa_iban_account_name: string;
  sepa_bic: string;
  sepa_mandate_id: string;
  sepa_mandate_date: string;
  sepa_sequence_type: string;
  tax_number: string;
  chamber_of_commerce: string;
  customer_id: string;
  bank_account: string;
  attention: string;
  tax_number_valid: boolean | null;
  credit_card_number?: string;
  credit_card_reference?: string;
  credit_card_type?: string;
  invoice_workflow_id?: string;
  estimate_workflow_id?: string;
  si_identifier?: string;
  si_identifier_type?: string;
  send_invoices_to_attention?: string;
  send_estimates_to_attention?: string;
  notes?: MoneybirdNote[];
  contact_people?: MoneybirdContactPerson[];
  events?: MoneybirdEvent[];
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MoneybirdNote {
  id: string;
  note: string;
  todo: boolean;
  assignee_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MoneybirdEvent {
  id: string;
  administration_id: string;
  user_id?: string;
  action: string;
  link_entity_id?: string;
  link_entity_type?: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MoneybirdInvoiceDetail {
  id: string;
  description: string;
  period?: string;
  price: string;
  amount: string;
  tax_rate_id?: string;
  ledger_account_id?: string;
  project_id?: string;
  row_order: number;
}

export interface MoneybirdPayment {
  id: string;
  invoice_id: string;
  financial_account_id?: string;
  financial_mutation_id?: string;
  transaction_identifier?: string;
  price: string;
  price_base?: string;
  payment_date: string;
  credit_invoice_id?: string;
  manual_payment_action?: string;
  created_at: string;
  updated_at: string;
}

export interface MoneybirdInvoice {
  id: string;
  contact_id: string;
  contact?: MoneybirdContact;
  invoice_id: string; // User-visible number like 2024-0001
  workflow_id?: string;
  document_style_id?: string;
  identity_id?: string;
  draft_id?: string;
  state: "draft" | "open" | "scheduled" | "pending_payment" | "late" | "reminded" | "paid" | "uncollectible";
  invoice_date: string;
  due_date: string;
  payment_conditions?: string;
  reference?: string;
  language: string;
  currency: string;
  discount?: string;
  original_sales_invoice_id?: string;
  paused: boolean;
  paid_at?: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
  version: number;
  details: MoneybirdInvoiceDetail[];
  payments: MoneybirdPayment[];
  total_paid?: string;
  total_unpaid?: string;
  total_unpaid_base?: string;
  total_price_excl_tax?: string;
  total_price_excl_tax_base?: string;
  total_price_incl_tax?: string;
  total_price_incl_tax_base?: string;
  url?: string;
  payment_url?: string;
  custom_fields?: { id: string; value: string }[];
  notes?: MoneybirdNote[];
  events?: MoneybirdEvent[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class MoneybirdClient {
  private apiToken: string;
  private administrationId: string | null = null;
  private cache: Map<string, CacheEntry<any>> = new Map();

  constructor(apiToken: string, administrationId?: string) {
    this.apiToken = apiToken;
    this.administrationId = administrationId || null;
  }

  static async create(): Promise<MoneybirdClient | null> {
    const apiToken = process.env.MONEYBIRD_API_TOKEN;
    const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;

    if (!apiToken) {
      debugLog("No MONEYBIRD_API_TOKEN configured");
      return null;
    }

    return new MoneybirdClient(apiToken, administrationId);
  }

  setAdministrationId(id: string) {
    this.administrationId = id;
    this.clearCache();
  }

  getAdministrationId(): string | null {
    return this.administrationId;
  }

  clearCache() {
    this.cache.clear();
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    endpoint: string,
    body?: any,
    retryCount = 0
  ): Promise<T> {
    const url = `${MONEYBIRD_BASE_URL}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      debugLog(`${method} ${endpoint}`);
      
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Rate limiting
      if (response.status === 429) {
        if (retryCount < MAX_RETRIES) {
          const delay = RATE_LIMIT_DELAY_BASE * Math.pow(2, retryCount);
          debugLog(`Rate limited, waiting ${delay}ms before retry ${retryCount + 1}`);
          await new Promise(r => setTimeout(r, delay));
          return this.request(method, endpoint, body, retryCount + 1);
        }
        throw new Error("Moneybird rate limit exceeded after retries");
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Moneybird API error ${response.status}: ${errorText}`);
      }

      // Handle empty response (e.g., DELETE)
      const text = await response.text();
      if (!text) return {} as T;
      
      return JSON.parse(text) as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === "AbortError") {
        throw new Error("Moneybird API request timed out");
      }
      
      throw error;
    }
  }

  /**
   * Get all administrations the user has access to
   */
  async getAdministrations(): Promise<MoneybirdAdministration[]> {
    const cached = this.getCached<MoneybirdAdministration[]>("administrations");
    if (cached) return cached;

    const result = await this.request<MoneybirdAdministration[]>("GET", "/administrations");
    this.setCache("administrations", result);
    return result;
  }

  /**
   * Get all contacts with pagination
   */
  async getContacts(options?: { page?: number; perPage?: number }): Promise<MoneybirdContact[]> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    const page = options?.page || 1;
    const perPage = options?.perPage || DEFAULT_PER_PAGE;
    const cacheKey = `contacts_${page}_${perPage}`;
    
    const cached = this.getCached<MoneybirdContact[]>(cacheKey);
    if (cached) return cached;

    const result = await this.request<MoneybirdContact[]>(
      "GET",
      `/${this.administrationId}/contacts?page=${page}&per_page=${perPage}`
    );
    
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get all contacts (handles pagination automatically)
   */
  async getAllContacts(): Promise<MoneybirdContact[]> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    const allContacts: MoneybirdContact[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const contacts = await this.getContacts({ page, perPage: DEFAULT_PER_PAGE });
      allContacts.push(...contacts);
      
      if (contacts.length < DEFAULT_PER_PAGE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    debugLog(`Fetched ${allContacts.length} contacts total`);
    return allContacts;
  }

  /**
   * Get a single contact by ID
   */
  async getContact(contactId: string): Promise<MoneybirdContact> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    const cacheKey = `contact_${contactId}`;
    const cached = this.getCached<MoneybirdContact>(cacheKey);
    if (cached) return cached;

    const result = await this.request<MoneybirdContact>(
      "GET",
      `/${this.administrationId}/contacts/${contactId}`
    );
    
    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Get all sales invoices with pagination
   */
  async getSalesInvoices(options?: { 
    page?: number; 
    perPage?: number;
    state?: string;
    period?: string;
  }): Promise<MoneybirdInvoice[]> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    const page = options?.page || 1;
    const perPage = options?.perPage || DEFAULT_PER_PAGE;
    
    let url = `/${this.administrationId}/sales_invoices?page=${page}&per_page=${perPage}`;
    if (options?.state) url += `&filter=state:${options.state}`;
    if (options?.period) url += `&filter=period:${options.period}`;

    const result = await this.request<MoneybirdInvoice[]>("GET", url);
    return result;
  }

  /**
   * Get all sales invoices (handles pagination automatically)
   */
  async getAllSalesInvoices(options?: { state?: string; period?: string }): Promise<MoneybirdInvoice[]> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    const allInvoices: MoneybirdInvoice[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const invoices = await this.getSalesInvoices({ 
        page, 
        perPage: DEFAULT_PER_PAGE,
        state: options?.state,
        period: options?.period,
      });
      allInvoices.push(...invoices);
      
      if (invoices.length < DEFAULT_PER_PAGE) {
        hasMore = false;
      } else {
        page++;
      }
    }

    debugLog(`Fetched ${allInvoices.length} invoices total`);
    return allInvoices;
  }

  /**
   * Get a single invoice by ID
   */
  async getSalesInvoice(invoiceId: string): Promise<MoneybirdInvoice> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    const result = await this.request<MoneybirdInvoice>(
      "GET",
      `/${this.administrationId}/sales_invoices/${invoiceId}`
    );
    
    return result;
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<{ ok: boolean; administrations?: MoneybirdAdministration[]; error?: string }> {
    try {
      const administrations = await this.getAdministrations();
      return { ok: true, administrations };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * Create a new contact in Moneybird
   */
  async createContact(data: {
    company_name?: string;
    firstname?: string;
    lastname?: string;
    address1?: string;
    address2?: string;
    zipcode?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    chamber_of_commerce?: string;
    tax_number?: string;
  }): Promise<MoneybirdContact> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    debugLog("Creating contact:", data);
    
    const result = await this.request<MoneybirdContact>(
      "POST",
      `/${this.administrationId}/contacts`,
      { contact: data }
    );
    
    debugLog("Contact created with ID:", result.id);
    return result;
  }

  /**
   * Update an existing contact in Moneybird
   */
  async updateContact(contactId: string, data: {
    company_name?: string;
    firstname?: string;
    lastname?: string;
    address1?: string;
    address2?: string;
    zipcode?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    chamber_of_commerce?: string;
    tax_number?: string;
  }): Promise<MoneybirdContact> {
    if (!this.administrationId) {
      throw new Error("No administration selected");
    }

    debugLog("Updating contact:", contactId, data);
    
    const result = await this.request<MoneybirdContact>(
      "PATCH",
      `/${this.administrationId}/contacts/${contactId}`,
      { contact: data }
    );
    
    debugLog("Contact updated:", result.id);
    return result;
  }

  /**
   * Create or update a contact based on whether ID exists
   */
  async createOrUpdateContact(
    existingContactId: string | null,
    data: {
      company_name?: string;
      firstname?: string;
      lastname?: string;
      address1?: string;
      address2?: string;
      zipcode?: string;
      city?: string;
      country?: string;
      phone?: string;
      email?: string;
      chamber_of_commerce?: string;
      tax_number?: string;
    }
  ): Promise<{ contact: MoneybirdContact; created: boolean }> {
    if (existingContactId) {
      const contact = await this.updateContact(existingContactId, data);
      return { contact, created: false };
    } else {
      const contact = await this.createContact(data);
      return { contact, created: true };
    }
  }
}

// Singleton instance
let clientInstance: MoneybirdClient | null = null;

export async function getMoneybirdClient(): Promise<MoneybirdClient | null> {
  if (!clientInstance) {
    clientInstance = await MoneybirdClient.create();
  }
  return clientInstance;
}

export function clearMoneybirdClient(): void {
  if (clientInstance) {
    clientInstance.clearCache();
  }
  clientInstance = null;
}
