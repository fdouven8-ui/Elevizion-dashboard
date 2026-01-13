import { db } from "../db";
import { contractDocuments, termsAcceptance, verificationCodes } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import { sendEmail } from "../email";
import { generateContractPdf } from "./contractPdfService";
import { ObjectStorageService } from "../objectStorage";

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function sendContractForSigning(
  contractId: string,
  customerEmail: string,
  customerName: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, contractId));
    if (!doc) {
      return { success: false, error: "Contract document niet gevonden" };
    }

    if (doc.status !== "draft") {
      return { success: false, error: "Contract is al verzonden of ondertekend" };
    }

    const [termsRecord] = await db.select().from(termsAcceptance)
      .where(sql`entity_type = ${doc.entityType} AND entity_id = ${doc.entityId}`)
      .orderBy(desc(termsAcceptance.acceptedAt))
      .limit(1);

    if (!termsRecord) {
      return { success: false, error: "Algemene voorwaarden moeten eerst geaccepteerd worden" };
    }

    const otpCode = generateOtpCode();
    const codeHash = hashCode(otpCode);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(verificationCodes).values({
      email: customerEmail,
      codeHash,
      contractDocumentId: contractId,
      expiresAt,
    });

    await db.update(contractDocuments)
      .set({
        status: "sent",
        signStatus: "sent",
        signProvider: "internal_otp",
        signerEmail: customerEmail,
        signerName: customerName,
        sentAt: new Date(),
        otpSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contractDocuments.id, contractId));

    const contractLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/contract-ondertekenen/${contractId}`;

    await sendEmail({
      to: customerEmail,
      subject: "Contract ter ondertekening - Elevizion",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Contract ter ondertekening</h2>
          <p>Beste ${customerName},</p>
          <p>Er staat een contract klaar voor ondertekening. Gebruik de onderstaande verificatiecode om uw akkoord te geven:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otpCode}</span>
          </div>
          <p>Deze code is 24 uur geldig.</p>
          <p>Klik op de onderstaande link om het contract te bekijken en te ondertekenen:</p>
          <p style="text-align: center; margin: 20px 0;">
            <a href="${contractLink}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Contract bekijken en ondertekenen</a>
          </p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Elevizion</p>
        </div>
      `,
    });

    console.log(`[ContractEngine] Contract ${contractId} sent for signing to ${customerEmail}`);
    return { success: true, message: "Contract verzonden ter ondertekening" };
  } catch (error: any) {
    console.error("[ContractEngine] Error sending contract:", error);
    return { success: false, error: error.message };
  }
}

export async function verifyContractOtp(
  contractId: string,
  otpCode: string,
  ip: string,
  userAgent: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, contractId));
    if (!doc) {
      return { success: false, error: "Contract document niet gevonden" };
    }

    if (doc.status === "signed") {
      return { success: false, error: "Contract is al ondertekend" };
    }

    if (!doc.signerEmail) {
      return { success: false, error: "Geen ontvanger e-mail bekend" };
    }

    const codeHash = hashCode(otpCode);
    const [codeRecord] = await db.select().from(verificationCodes)
      .where(sql`email = ${doc.signerEmail} AND code_hash = ${codeHash} AND contract_document_id = ${contractId} AND used_at IS NULL AND expires_at > NOW()`)
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (!codeRecord) {
      const [existingCode] = await db.select().from(verificationCodes)
        .where(sql`email = ${doc.signerEmail} AND contract_document_id = ${contractId} AND used_at IS NULL AND expires_at > NOW()`)
        .orderBy(desc(verificationCodes.createdAt))
        .limit(1);

      if (existingCode) {
        await db.update(verificationCodes)
          .set({ attempts: existingCode.attempts + 1 })
          .where(eq(verificationCodes.id, existingCode.id));

        if (existingCode.attempts >= 5) {
          return { success: false, error: "Teveel pogingen. Vraag een nieuwe code aan." };
        }
      }
      return { success: false, error: "Ongeldige of verlopen verificatiecode" };
    }

    await db.update(verificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(verificationCodes.id, codeRecord.id));

    await db.update(contractDocuments)
      .set({
        signStatus: "verified",
        otpVerifiedAt: new Date(),
        signerIp: ip,
        signerUserAgent: userAgent,
        updatedAt: new Date(),
      })
      .where(eq(contractDocuments.id, contractId));

    console.log(`[ContractEngine] OTP verified for contract ${contractId}`);
    return { success: true, message: "Verificatiecode bevestigd" };
  } catch (error: any) {
    console.error("[ContractEngine] Error verifying OTP:", error);
    return { success: false, error: error.message };
  }
}

export async function finalizeContractSignature(
  contractId: string
): Promise<{ success: boolean; pdfUrl?: string; error?: string }> {
  try {
    const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, contractId));
    if (!doc) {
      return { success: false, error: "Contract document niet gevonden" };
    }

    if (doc.signStatus !== "verified") {
      return { success: false, error: "OTP verificatie vereist voor ondertekening" };
    }

    const auditTrailHtml = `
      <div style="page-break-before: always; border-top: 2px solid #e0e0e0; padding-top: 30px; margin-top: 50px;">
        <h2 style="color: #1a1a1a; font-size: 16pt;">Handtekening Audit Trail</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
          <tr style="background: #f5f5f5;">
            <td style="padding: 8px; border: 1px solid #e0e0e0; font-weight: bold;">Veld</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0; font-weight: bold;">Waarde</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">Document ID</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.id}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">Ondertekenaar</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.signerName} (${doc.signerEmail})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">Contract verzonden</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.sentAt?.toISOString() || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">OTP verzonden</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.otpSentAt?.toISOString() || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">OTP geverifieerd</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.otpVerifiedAt?.toISOString() || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">Ondertekend op</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${new Date().toISOString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">IP Adres</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.signerIp || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">User Agent</td>
            <td style="padding: 8px; border: 1px solid #e0e0e0;">${doc.signerUserAgent?.substring(0, 100) || "-"}</td>
          </tr>
        </table>
        <p style="margin-top: 20px; font-size: 9pt; color: #666;">
          Dit document is digitaal ondertekend via het Elevizion Dashboard met e-mail OTP verificatie.
          De ondertekenaar heeft akkoord gegeven door een verificatiecode in te voeren die naar hun e-mailadres is verzonden.
        </p>
      </div>
    `;

    const fullContent = (doc.renderedContent || "") + auditTrailHtml;
    const pdfBuffer = await generateContractPdf(fullContent);

    const objectStorage = new ObjectStorageService();
    const storagePath = `.private/contracts/signed-${doc.id}.pdf`;
    await objectStorage.write(storagePath, pdfBuffer, {
      contentType: "application/pdf",
    });

    await db.update(contractDocuments)
      .set({
        status: "signed",
        signStatus: "signed",
        signedAt: new Date(),
        signedPdfUrl: storagePath,
        updatedAt: new Date(),
      })
      .where(eq(contractDocuments.id, contractId));

    if (doc.signerEmail) {
      await sendEmail({
        to: doc.signerEmail,
        subject: "Contract ondertekend - Elevizion",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Contract ondertekend</h2>
            <p>Beste ${doc.signerName},</p>
            <p>Uw contract is succesvol ondertekend. U ontvangt een kopie van het ondertekende document.</p>
            <p>Hartelijk dank voor uw vertrouwen in Elevizion.</p>
            <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Elevizion</p>
          </div>
        `,
      });
    }

    console.log(`[ContractEngine] Contract ${contractId} signed and PDF stored at ${storagePath}`);
    return { success: true, pdfUrl: storagePath };
  } catch (error: any) {
    console.error("[ContractEngine] Error finalizing signature:", error);
    return { success: false, error: error.message };
  }
}

export async function resendContractOtp(
  contractId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, contractId));
    if (!doc) {
      return { success: false, error: "Contract document niet gevonden" };
    }

    if (doc.status === "signed") {
      return { success: false, error: "Contract is al ondertekend" };
    }

    if (!doc.signerEmail) {
      return { success: false, error: "Geen ontvanger e-mail bekend" };
    }

    await db.update(verificationCodes)
      .set({ usedAt: new Date() })
      .where(sql`contract_document_id = ${contractId} AND used_at IS NULL`);

    const otpCode = generateOtpCode();
    const codeHash = hashCode(otpCode);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(verificationCodes).values({
      email: doc.signerEmail,
      codeHash,
      contractDocumentId: contractId,
      expiresAt,
    });

    await db.update(contractDocuments)
      .set({
        otpSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contractDocuments.id, contractId));

    await sendEmail({
      to: doc.signerEmail,
      subject: "Nieuwe verificatiecode - Elevizion Contract",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Nieuwe verificatiecode</h2>
          <p>Beste ${doc.signerName},</p>
          <p>Hier is uw nieuwe verificatiecode voor het ondertekenen van het contract:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otpCode}</span>
          </div>
          <p>Deze code is 24 uur geldig.</p>
          <p style="color: #666; font-size: 12px;">Met vriendelijke groet,<br>Elevizion</p>
        </div>
      `,
    });

    console.log(`[ContractEngine] OTP resent for contract ${contractId}`);
    return { success: true, message: "Nieuwe verificatiecode verzonden" };
  } catch (error: any) {
    console.error("[ContractEngine] Error resending OTP:", error);
    return { success: false, error: error.message };
  }
}

export async function getContractSigningStatus(
  contractId: string
): Promise<{
  status: string;
  signStatus: string;
  signerEmail?: string;
  signerName?: string;
  sentAt?: Date | null;
  signedAt?: Date | null;
  signedPdfUrl?: string | null;
  isLegacy?: boolean;
} | null> {
  const [doc] = await db.select().from(contractDocuments).where(eq(contractDocuments.id, contractId));
  if (!doc) return null;

  return {
    status: doc.status,
    signStatus: doc.signStatus || "none",
    signerEmail: doc.signerEmail || undefined,
    signerName: doc.signerName || undefined,
    sentAt: doc.sentAt,
    signedAt: doc.signedAt,
    signedPdfUrl: doc.signedPdfUrl,
    isLegacy: doc.signProvider === "signrequest",
  };
}
