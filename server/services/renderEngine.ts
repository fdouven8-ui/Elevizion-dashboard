/**
 * Render Engine - Single Source of Truth
 * 
 * This module provides centralized rendering for:
 * - Email templates (600px table-based layout)
 * - Contract templates (A4 print-ready layout)
 * 
 * ALL preview, send, and storage operations MUST use these functions
 * to ensure 1:1 consistency between preview and final output.
 */

import { db } from "../db";
import { templates } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// BRAND CONSTANTS
// ============================================================================

const BRAND = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  text: "#1f2937",
  muted: "#6b7280",
  light: "#f3f4f6",
  white: "#ffffff",
  border: "#e5e7eb",
};

const COMPANY = {
  name: "Elevizion B.V.",
  email: "info@elevizion.nl",
  website: "elevizion.nl",
  kvk: "12345678",
  address: "Maastricht, Nederland",
};

// ============================================================================
// RENDER EMAIL
// ============================================================================

export interface RenderEmailParams {
  templateKey?: string;
  subject?: string;
  body?: string;
  data?: Record<string, string>;
  contactName?: string;
}

export interface RenderEmailResult {
  subjectRendered: string;
  bodyRendered: string;
  finalHtmlRendered: string;
  textRendered: string;
}

/**
 * Renders an email template with full HTML wrapper.
 * This is the SINGLE source of truth for email rendering.
 */
export async function renderEmail(params: RenderEmailParams): Promise<RenderEmailResult> {
  const { templateKey, subject, body, data = {}, contactName } = params;
  
  let templateSubject = subject || "";
  let templateBody = body || "";
  
  // Load template from database if templateKey provided
  if (templateKey) {
    const [template] = await db.select().from(templates).where(eq(templates.name, templateKey));
    if (template) {
      templateSubject = template.subject || "";
      templateBody = template.body || "";
    }
  }
  
  // Render placeholders
  const subjectRendered = renderPlaceholders(templateSubject, data);
  const bodyRendered = renderPlaceholders(templateBody, data);
  
  // Get contact name for greeting
  const greeting = contactName || data.contactName || data.contact_name || "klant";
  
  // Convert body to HTML (respects existing HTML content)
  const bodyHtml = bodyToHtml(bodyRendered);
  
  // Build full email HTML
  const finalHtmlRendered = buildEmailWrapper({
    subject: subjectRendered,
    bodyHtml,
    contactName: greeting,
  });
  
  // Generate plain text version
  const textRendered = generateEmailPlainText({
    subject: subjectRendered,
    body: bodyRendered,
    contactName: greeting,
  });
  
  return {
    subjectRendered,
    bodyRendered,
    finalHtmlRendered,
    textRendered,
  };
}

// ============================================================================
// RENDER CONTRACT
// ============================================================================

export interface RenderContractParams {
  templateKey?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

export interface RenderContractResult {
  title: string;
  bodyRendered: string;
  finalHtmlRendered: string;
}

/**
 * Renders a contract template with A4 print-ready wrapper.
 * This is the SINGLE source of truth for contract rendering.
 */
export async function renderContract(params: RenderContractParams): Promise<RenderContractResult> {
  const { templateKey, title, body, data = {} } = params;
  
  let templateTitle = title || "";
  let templateBody = body || "";
  
  // Load template from database if templateKey provided
  if (templateKey) {
    const [template] = await db.select().from(templates).where(eq(templates.name, templateKey));
    if (template) {
      templateTitle = template.subject || template.name || "";
      templateBody = template.body || "";
    }
  }
  
  // Render placeholders
  const titleRendered = renderPlaceholders(templateTitle, data);
  const bodyRendered = renderPlaceholders(templateBody, data);
  
  // Convert body to HTML (respects existing HTML content)
  const bodyHtml = bodyToHtml(bodyRendered);
  
  // Build full contract HTML
  const finalHtmlRendered = buildContractWrapper({
    title: titleRendered,
    bodyHtml,
    data,
  });
  
  return {
    title: titleRendered,
    bodyRendered,
    finalHtmlRendered,
  };
}

// ============================================================================
// EMAIL WRAPPER (600px table-based layout)
// ============================================================================

interface EmailWrapperOptions {
  subject: string;
  bodyHtml: string;
  contactName: string;
  cta?: { label: string; url: string };
}

function buildEmailWrapper(options: EmailWrapperOptions): string {
  const { subject, bodyHtml, contactName, cta } = options;
  const year = new Date().getFullYear();
  
  const ctaHtml = cta ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${cta.url}" style="display:inline-block;padding:14px 32px;background-color:${BRAND.primary};color:${BRAND.white};text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
            ${cta.label}
          </a>
        </td>
      </tr>
    </table>
  ` : "";
  
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    table { border-collapse: collapse; }
    img { border: 0; display: block; }
    a { color: ${BRAND.primary}; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 16px !important; }
      .content { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.light};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;color:${BRAND.light};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${subject}
  </div>
  
  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.light};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        
        <!-- Main container (600px) -->
        <table role="presentation" class="container" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:${BRAND.white};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          
          <!-- Header with logo -->
          <tr>
            <td style="padding:32px 40px 24px 40px;text-align:center;border-bottom:1px solid ${BRAND.border};">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="text-align:center;">
                    <div style="display:inline-block;width:48px;height:48px;background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});border-radius:12px;text-align:center;line-height:48px;">
                      <span style="color:${BRAND.white};font-size:24px;font-weight:bold;">E</span>
                    </div>
                    <div style="margin-top:12px;font-size:20px;font-weight:700;color:${BRAND.text};">Elevizion</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Email content -->
          <tr>
            <td class="content" style="padding:32px 40px;">
              
              <!-- Title -->
              <h1 style="margin:0 0 24px 0;font-size:24px;font-weight:700;color:${BRAND.text};line-height:1.3;">
                ${subject}
              </h1>
              
              <!-- Greeting -->
              <p style="margin:0 0 20px 0;font-size:16px;color:${BRAND.text};line-height:1.7;">
                Beste ${contactName},
              </p>
              
              <!-- Body content -->
              <div style="font-size:16px;color:${BRAND.text};line-height:1.7;">
                ${bodyHtml}
              </div>
              
              ${ctaHtml}
              
              <!-- Signature -->
              <div style="margin-top:32px;padding-top:24px;border-top:1px solid ${BRAND.border};">
                <p style="margin:0;font-size:15px;color:${BRAND.text};line-height:1.6;">
                  Met vriendelijke groet,<br>
                  <strong>Team Elevizion</strong>
                </p>
              </div>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:${BRAND.light};border-radius:0 0 12px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px 0;font-size:13px;color:${BRAND.muted};">
                      ${COMPANY.name} | KvK: ${COMPANY.kvk}
                    </p>
                    <p style="margin:0 0 8px 0;font-size:13px;color:${BRAND.muted};">
                      <a href="mailto:${COMPANY.email}" style="color:${BRAND.primary};text-decoration:none;">${COMPANY.email}</a>
                      &nbsp;|&nbsp;
                      <a href="https://${COMPANY.website}" style="color:${BRAND.primary};text-decoration:none;">${COMPANY.website}</a>
                    </p>
                    <p style="margin:16px 0 0 0;font-size:11px;color:${BRAND.muted};">
                      &copy; ${year} ${COMPANY.name}. Alle rechten voorbehouden.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>`;
}

// ============================================================================
// CONTRACT WRAPPER (A4 print-ready layout)
// ============================================================================

interface ContractWrapperOptions {
  title: string;
  bodyHtml: string;
  data?: Record<string, string>;
}

function buildContractWrapper(options: ContractWrapperOptions): string {
  const { title, bodyHtml, data = {} } = options;
  const today = new Date().toLocaleDateString("nl-NL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .contract-wrapper { box-shadow: none !important; }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
    }
    .contract-wrapper {
      width: 210mm;
      max-width: 100%;
      min-height: 297mm;
      margin: 0 auto;
      padding: 40px 50px;
      background: white;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid ${BRAND.primary};
    }
    .logo {
      display: inline-block;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.primaryDark});
      border-radius: 12px;
      text-align: center;
      line-height: 60px;
      margin-bottom: 16px;
    }
    .logo span {
      color: white;
      font-size: 32px;
      font-weight: bold;
      font-family: Arial, sans-serif;
    }
    .company-name {
      font-size: 18pt;
      font-weight: bold;
      color: ${BRAND.text};
      margin: 8px 0;
    }
    .document-title {
      font-size: 16pt;
      font-weight: bold;
      color: ${BRAND.primary};
      margin: 24px 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .document-date {
      font-size: 10pt;
      color: ${BRAND.muted};
    }
    .content {
      margin: 30px 0;
    }
    .content h2 {
      font-size: 13pt;
      font-weight: bold;
      color: ${BRAND.text};
      margin: 28px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid ${BRAND.border};
    }
    .content h3 {
      font-size: 12pt;
      font-weight: bold;
      color: ${BRAND.text};
      margin: 20px 0 8px 0;
    }
    .content p {
      margin: 0 0 12px 0;
      text-align: justify;
    }
    .content ul, .content ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    .content li {
      margin-bottom: 6px;
    }
    .signature-section {
      margin-top: 60px;
      page-break-inside: avoid;
    }
    .signature-title {
      font-size: 13pt;
      font-weight: bold;
      margin-bottom: 30px;
      padding-bottom: 6px;
      border-bottom: 1px solid ${BRAND.border};
    }
    .signature-grid {
      display: flex;
      justify-content: space-between;
      gap: 40px;
    }
    .signature-box {
      flex: 1;
      padding: 20px;
      border: 1px solid ${BRAND.border};
      border-radius: 8px;
    }
    .signature-label {
      font-size: 10pt;
      color: ${BRAND.muted};
      margin-bottom: 4px;
    }
    .signature-value {
      font-weight: bold;
      margin-bottom: 12px;
    }
    .signature-line {
      margin-top: 50px;
      padding-top: 8px;
      border-top: 1px solid ${BRAND.text};
    }
    .signature-line-label {
      font-size: 9pt;
      color: ${BRAND.muted};
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid ${BRAND.border};
      text-align: center;
      font-size: 9pt;
      color: ${BRAND.muted};
    }
  </style>
</head>
<body>
  <div class="contract-wrapper">
    
    <!-- Header -->
    <div class="header">
      <div class="logo"><span>E</span></div>
      <div class="company-name">${COMPANY.name}</div>
      <div class="document-title">${title}</div>
      <div class="document-date">Datum: ${today}</div>
    </div>
    
    <!-- Content -->
    <div class="content">
      ${bodyHtml}
    </div>
    
    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-title">Ondertekening</div>
      <div class="signature-grid">
        <div class="signature-box">
          <div class="signature-label">Namens ${COMPANY.name}:</div>
          <div class="signature-value">Elevizion B.V.</div>
          <div class="signature-line">
            <div class="signature-line-label">Handtekening & datum</div>
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-label">Namens ${data.companyName || data.company_name || "de Wederpartij"}:</div>
          <div class="signature-value">${data.contactName || data.contact_name || "____________________"}</div>
          <div class="signature-line">
            <div class="signature-line-label">Handtekening & datum</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      ${COMPANY.name} | ${COMPANY.address} | KvK: ${COMPANY.kvk} | ${COMPANY.email}
    </div>
    
  </div>
</body>
</html>`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Render placeholders in a template string.
 * Supports both {{camelCase}} and {{snake_case}} formats.
 */
function renderPlaceholders(template: string, data: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(data)) {
    const escapedValue = value || "";
    // Match both {{key}} and {{key}} with spaces
    const patterns = [
      new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
      new RegExp(`\\{\\{\\s*${toSnakeCase(key)}\\s*\\}\\}`, "g"),
      new RegExp(`\\{\\{\\s*${toCamelCase(key)}\\s*\\}\\}`, "g"),
    ];
    
    for (const pattern of patterns) {
      result = result.replace(pattern, escapedValue);
    }
  }
  
  return result;
}

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Convert plain text to HTML paragraphs.
 * ONLY use this for plain text - HTML content should be passed through.
 */
function textToHtml(text: string): string {
  if (!text) return "";
  
  // Escape HTML entities
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Split by double newlines for paragraphs
  const paragraphs = escaped.split(/\n\n+/);
  
  return paragraphs.map(p => {
    const withBreaks = p.replace(/\n/g, "<br>");
    return `<p style="margin:0 0 16px 0;">${withBreaks}</p>`;
  }).join("");
}

/**
 * Check if content contains HTML tags.
 * Uses robust detection to avoid corrupting existing HTML.
 */
function isHtmlContent(content: string): boolean {
  if (!content) return false;
  
  // Check for DOCTYPE or html tag (full document)
  if (/<!DOCTYPE|<html/i.test(content)) return true;
  
  // Check for any opening HTML tag with optional attributes
  // This catches: <tag>, <tag attr="value">, <tag/>, etc.
  if (/<[a-z][a-z0-9]*(?:\s+[^>]*)?>/i.test(content)) return true;
  
  // Check for self-closing tags like <br/>, <hr/>, <img/>
  if (/<[a-z][a-z0-9]*\s*\/>/i.test(content)) return true;
  
  // Check for HTML entities that suggest HTML content
  if (/&(?:nbsp|amp|lt|gt|quot|#\d+);/i.test(content)) return true;
  
  return false;
}

/**
 * Convert body to HTML, respecting existing HTML content.
 * Plain text is converted to paragraphs, HTML is passed through.
 */
function bodyToHtml(body: string): string {
  if (!body) return "";
  
  // If body already contains HTML, pass it through unchanged
  if (isHtmlContent(body)) {
    return body;
  }
  
  // Otherwise convert plain text to HTML paragraphs
  return textToHtml(body);
}

/**
 * Generate plain text version of email.
 */
function generateEmailPlainText(options: { subject: string; body: string; contactName: string }): string {
  const { subject, body, contactName } = options;
  const year = new Date().getFullYear();
  
  let text = "";
  text += `${subject}\n${"=".repeat(subject.length)}\n\n`;
  text += `Beste ${contactName},\n\n`;
  text += body;
  text += "\n\n" + "-".repeat(40);
  text += "\nMet vriendelijke groet,";
  text += "\nTeam Elevizion";
  text += `\n\n${COMPANY.name} | ${COMPANY.email} | ${COMPANY.website}`;
  text += `\n\n© ${year} ${COMPANY.name}. Alle rechten voorbehouden.`;
  
  return text;
}

// ============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================================================

export { textToHtml, isHtmlContent, renderPlaceholders };
