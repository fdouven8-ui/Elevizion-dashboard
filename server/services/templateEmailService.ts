/**
 * Template Email Service
 * Sends emails using templates from the database and logs all activity
 */

import { db } from "../db";
import { templates, emailLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendEmail, baseEmailTemplate, type BodyBlock } from "../email";

interface TemplateEmailParams {
  templateKey: string;
  to: string;
  data: Record<string, string>;
  entityType?: string;
  entityId?: string;
}

interface TemplateEmailResult {
  success: boolean;
  message: string;
  messageId?: string;
  logId?: string;
}

/**
 * Render template placeholders with data
 * Replaces {{key}} with corresponding value
 */
function renderTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Convert plain text body to HTML paragraphs
 */
function textToHtml(text: string): string {
  const paragraphs = text.split('\n\n');
  return paragraphs.map(p => `<p style="margin:0 0 16px 0;line-height:1.7;">${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * Send an email using a template from the database
 * Automatically logs the email to email_logs table
 */
export async function sendTemplateEmail(params: TemplateEmailParams): Promise<TemplateEmailResult> {
  const { templateKey, to, data, entityType, entityId } = params;

  try {
    // Lookup template by name (templateKey)
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.name, templateKey));

    if (!template) {
      console.error(`[TemplateEmail] Template not found: ${templateKey}`);
      // Create failed log entry
      const [log] = await db.insert(emailLogs).values({
        templateKey,
        toEmail: to,
        status: 'failed',
        errorMessage: `Template not found: ${templateKey}`,
        entityType: entityType || null,
        entityId: entityId || null,
      }).returning();
      
      return { success: false, message: `Template not found: ${templateKey}`, logId: log?.id };
    }

    if (!template.isEnabled) {
      console.warn(`[TemplateEmail] Template is disabled: ${templateKey}`);
      const [log] = await db.insert(emailLogs).values({
        templateKey,
        toEmail: to,
        status: 'failed',
        errorMessage: `Template is disabled: ${templateKey}`,
        entityType: entityType || null,
        entityId: entityId || null,
      }).returning();
      
      return { success: false, message: `Template is disabled: ${templateKey}`, logId: log?.id };
    }

    // Render subject and body
    const renderedSubject = renderTemplate(template.subject || '', data);
    const renderedBody = renderTemplate(template.body, data);

    // Create log entry with queued status
    const [log] = await db.insert(emailLogs).values({
      templateKey,
      toEmail: to,
      subjectRendered: renderedSubject,
      bodyRendered: renderedBody,
      status: 'queued',
      entityType: entityType || null,
      entityId: entityId || null,
    }).returning();

    // Convert body to HTML using baseEmailTemplate with full Dutch branding
    const contactName = data.contactName || data.contact_name || 'klant';
    const emailContent = baseEmailTemplate({
      subject: renderedSubject,
      preheader: renderedBody.substring(0, 100),
      title: renderedSubject,
      introText: `Beste ${contactName},`,
      bodyBlocks: [{ type: 'html', content: textToHtml(renderedBody) }],
      footerNote: 'Met vriendelijke groet, Team Elevizion',
    });

    const result = await sendEmail({
      to,
      subject: renderedSubject,
      html: emailContent.html,
      text: emailContent.text,
      templateKey,
      entityType,
      entityId,
    });

    // Update log with result
    if (result.success) {
      await db.update(emailLogs)
        .set({ status: 'sent', providerMessageId: result.messageId, sentAt: new Date() })
        .where(eq(emailLogs.id, log.id));
      
      console.log(`[TemplateEmail] Sent ${templateKey} to ${to}`);
      return { success: true, message: 'Email verzonden', messageId: result.messageId, logId: log.id };
    } else {
      await db.update(emailLogs)
        .set({ status: 'failed', errorMessage: result.message })
        .where(eq(emailLogs.id, log.id));
      
      return { success: false, message: result.message, logId: log.id };
    }

  } catch (error: any) {
    console.error(`[TemplateEmail] Error sending ${templateKey}:`, error);
    
    // Try to log the error
    try {
      const [log] = await db.insert(emailLogs).values({
        templateKey,
        toEmail: to,
        status: 'failed',
        errorMessage: error.message || 'Unknown error',
        entityType: entityType || null,
        entityId: entityId || null,
      }).returning();
      
      return { success: false, message: error.message, logId: log?.id };
    } catch {
      return { success: false, message: error.message };
    }
  }
}

/**
 * Get a template by key for preview or manual use
 */
export async function getTemplateByKey(templateKey: string) {
  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.name, templateKey));
  return template || null;
}

/**
 * Preview a template with sample data
 */
export function previewTemplate(templateBody: string, templateSubject: string, data: Record<string, string>) {
  return {
    subject: renderTemplate(templateSubject, data),
    body: renderTemplate(templateBody, data),
  };
}
