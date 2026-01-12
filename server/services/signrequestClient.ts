import fetch from "node-fetch";
import FormData from "form-data";

const API_BASE = "https://signrequest.com/api/v1";
const API_TOKEN = process.env.SIGNREQUEST_API_TOKEN;
const SIGNER1_EMAIL = process.env.SIGNREQUEST_SIGNER1_EMAIL;

interface SignerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  order?: number;
}

interface CreateSignRequestInput {
  pdfBuffer: Buffer;
  filename: string;
  signers: SignerInput[];
  subject: string;
  message?: string;
  externalId?: string;
}

interface SignRequestResponse {
  uuid: string;
  url: string;
  document: string;
  status: string;
  signrequest_url?: string;
}

interface DocumentResponse {
  uuid: string;
  url: string;
  pdf: string;
  status: string;
  signrequest?: {
    uuid: string;
    url: string;
  };
}

function getHeaders(contentType?: string): Record<string, string> {
  if (!API_TOKEN) {
    throw new Error("SIGNREQUEST_API_TOKEN is not configured");
  }
  const headers: Record<string, string> = {
    Authorization: `Token ${API_TOKEN}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

export async function createSignRequest(input: CreateSignRequestInput): Promise<{
  success: boolean;
  signrequestId?: string;
  signrequestUrl?: string;
  documentId?: string;
  error?: string;
}> {
  try {
    const formData = new FormData();
    formData.append("file", input.pdfBuffer, {
      filename: input.filename,
      contentType: "application/pdf",
    });

    const docResponse = await fetch(`${API_BASE}/documents/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${API_TOKEN}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!docResponse.ok) {
      const error = await docResponse.text();
      console.error("[SignRequest] Failed to upload document:", error);
      return { success: false, error: `Document upload failed: ${error}` };
    }

    const docData = (await docResponse.json()) as DocumentResponse;
    console.log("[SignRequest] Document uploaded:", docData.uuid);

    const signersPayload = input.signers.map((signer, index) => ({
      email: signer.email,
      first_name: signer.firstName || "",
      last_name: signer.lastName || "",
      order: signer.order ?? index,
    }));

    const signRequestPayload = {
      document: docData.uuid,
      signers: signersPayload,
      from_email: SIGNER1_EMAIL,
      subject: input.subject,
      message: input.message || "Graag uw handtekening zetten op bijgaand document.",
      external_id: input.externalId || "",
      who: "o",
      send_reminders: true,
    };

    const signResponse = await fetch(`${API_BASE}/signrequests/`, {
      method: "POST",
      headers: getHeaders("application/json"),
      body: JSON.stringify(signRequestPayload),
    });

    if (!signResponse.ok) {
      const error = await signResponse.text();
      console.error("[SignRequest] Failed to create sign request:", error);
      return { success: false, error: `Sign request creation failed: ${error}` };
    }

    const signData = (await signResponse.json()) as SignRequestResponse;
    console.log("[SignRequest] Sign request created:", signData.uuid);

    const sendResponse = await fetch(`${API_BASE}/signrequests/${signData.uuid}/resend_signrequest_email/`, {
      method: "POST",
      headers: getHeaders("application/json"),
      body: JSON.stringify({}),
    });

    if (!sendResponse.ok) {
      console.warn("[SignRequest] Warning: Could not send sign request email, but request was created");
    }

    return {
      success: true,
      signrequestId: signData.uuid,
      signrequestUrl: signData.url,
      documentId: docData.uuid,
    };
  } catch (error) {
    console.error("[SignRequest] Error:", error);
    return { success: false, error: String(error) };
  }
}

export async function getSignRequestStatus(signrequestId: string): Promise<{
  success: boolean;
  status?: string;
  signed?: boolean;
  declined?: boolean;
  cancelled?: boolean;
  signedPdfUrl?: string;
  signers?: Array<{
    email: string;
    signed: boolean;
    signedAt?: string;
    declined?: boolean;
    declinedAt?: string;
  }>;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_BASE}/signrequests/${signrequestId}/`, {
      method: "GET",
      headers: getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const data = (await response.json()) as any;

    const signed = data.status === "si";
    const declined = data.status === "de";
    const cancelled = data.status === "ca";

    return {
      success: true,
      status: data.status,
      signed,
      declined,
      cancelled,
      signedPdfUrl: data.pdf,
      signers: data.signers?.map((s: any) => ({
        email: s.email,
        signed: s.has_signed,
        signedAt: s.signed_on,
        declined: s.declined,
        declinedAt: s.declined_on,
      })),
    };
  } catch (error) {
    console.error("[SignRequest] Error getting status:", error);
    return { success: false, error: String(error) };
  }
}

export async function downloadSignedPdf(signrequestId: string): Promise<{
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
}> {
  try {
    const statusResult = await getSignRequestStatus(signrequestId);
    if (!statusResult.success || !statusResult.signedPdfUrl) {
      return { success: false, error: "No signed PDF available" };
    }

    const response = await fetch(statusResult.signedPdfUrl, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      return { success: false, error: `Failed to download PDF: ${response.statusText}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    return { success: true, pdfBuffer };
  } catch (error) {
    console.error("[SignRequest] Error downloading PDF:", error);
    return { success: false, error: String(error) };
  }
}

export function getElevizionSignerEmail(): string {
  if (!SIGNER1_EMAIL) {
    throw new Error("SIGNREQUEST_SIGNER1_EMAIL is not configured");
  }
  return SIGNER1_EMAIL;
}

export function isConfigured(): boolean {
  return !!(API_TOKEN && SIGNER1_EMAIL);
}

export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  if (!API_TOKEN) {
    return { success: false, message: "API token niet geconfigureerd (SIGNREQUEST_API_TOKEN)" };
  }
  if (!SIGNER1_EMAIL) {
    return { success: false, message: "Signer email niet geconfigureerd (SIGNREQUEST_SIGNER1_EMAIL)" };
  }

  try {
    const response = await fetch(`${API_BASE}/teams/`, {
      method: "GET",
      headers: getHeaders(),
    });

    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        message: "Verbinding succesvol", 
        data: { 
          configured: true, 
          signerEmail: SIGNER1_EMAIL,
          teams: Array.isArray(data) ? data.length : (data.results?.length || 0)
        } 
      };
    } else {
      const error = await response.text();
      return { success: false, message: `API Fout: ${response.status} - ${error}` };
    }
  } catch (error: any) {
    return { success: false, message: `Verbinding mislukt: ${error.message}` };
  }
}
