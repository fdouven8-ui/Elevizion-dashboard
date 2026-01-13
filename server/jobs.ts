/**
 * Background Jobs for Dashboard
 * Handles contract reminders, expiration processing, and scheduled tasks
 */

import { storage } from "./storage";
import { sendEmail } from "./email";
import { DEFAULT_COMPANY } from "./companyBranding";

const COMPANY = DEFAULT_COMPANY;

interface JobResult {
  success: boolean;
  processed: number;
  errors: number;
  details: string[];
}

/**
 * Contract Signing Reminder Job
 * Sends reminder emails for contracts pending signature
 */
export async function runContractSigningReminders(): Promise<JobResult> {
  const result: JobResult = {
    success: true,
    processed: 0,
    errors: 0,
    details: [],
  };

  try {
    const contracts = await storage.getContracts();
    const advertisers = await storage.getAdvertisers();
    const now = new Date();

    // Find contracts with status 'sent' or 'viewed' (awaiting signature)
    const pendingContracts = contracts.filter(c => 
      c.status === "sent" || c.status === "viewed"
    );

    for (const contract of pendingContracts) {
      // Check if reminder should be sent (e.g., after 3 days without signature)
      if (!contract.sentAt) continue;
      
      const sentDate = new Date(contract.sentAt);
      const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Send reminders at 3, 7, and 14 days
      const reminderDays = [3, 7, 14];
      const shouldRemind = reminderDays.includes(daysSinceSent);
      
      if (!shouldRemind) continue;

      const advertiser = advertisers.find(a => a.id === contract.advertiserId);
      if (!advertiser?.email) continue;

      try {
        const emailResult = await sendEmail({
          to: advertiser.email,
          subject: `Herinnering: Contract "${contract.name}" wacht op ondertekening`,
          html: generateSigningReminderEmail({
            contactName: advertiser.contactName || advertiser.companyName,
            contractName: contract.name,
            daysSinceSent,
            signingUrl: contract.signatureTokenHash 
              ? `${process.env.BASE_URL || 'https://elevizion.nl'}/sign/${contract.id}`
              : undefined,
          }),
        });

        if (emailResult.success) {
          result.details.push(`Herinnering verzonden naar ${advertiser.email} voor ${contract.name}`);
          result.processed++;
          
          // Create contract event
          await storage.createContractEvent({
            contractId: contract.id,
            eventType: "reminder_sent",
            metadata: { 
              daysSinceSent,
              reminderNumber: reminderDays.indexOf(daysSinceSent) + 1,
            },
          });
        } else {
          result.errors++;
          result.details.push(`Fout bij verzenden naar ${advertiser.email}: ${emailResult.message}`);
        }
      } catch (error: any) {
        result.errors++;
        result.details.push(`Exception voor ${contract.name}: ${error.message}`);
      }
    }

    result.success = result.errors === 0;
  } catch (error: any) {
    result.success = false;
    result.details.push(`Job fout: ${error.message}`);
  }

  return result;
}

/**
 * Contract Expiration Job
 * Handles contracts that are expiring or have expired
 */
export async function runContractExpirationCheck(): Promise<JobResult> {
  const result: JobResult = {
    success: true,
    processed: 0,
    errors: 0,
    details: [],
  };

  try {
    const contracts = await storage.getContracts();
    const advertisers = await storage.getAdvertisers();
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    for (const contract of contracts) {
      if (!contract.endDate) continue;
      if (contract.status === "terminated" || contract.status === "expired") continue;

      const endDate = new Date(contract.endDate);
      const daysUntilExpiry = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      const advertiser = advertisers.find(a => a.id === contract.advertiserId);

      // Check if contract has expired
      if (contract.endDate <= today && contract.status === "active") {
        try {
          await storage.updateContract(contract.id, { status: "expired" });
          
          // Send expiration notification
          let emailSuccess = true;
          if (advertiser?.email) {
            const emailResult = await sendEmail({
              to: advertiser.email,
              subject: `Contract "${contract.name}" is verlopen`,
              html: generateExpirationEmail({
                contactName: advertiser.contactName || advertiser.companyName,
                contractName: contract.name,
                endDate: contract.endDate,
                isExpired: true,
              }),
            });
            
            emailSuccess = emailResult.success;
            if (!emailResult.success) {
              result.errors++;
              result.details.push(`E-mail fout voor ${contract.name}: ${emailResult.message}`);
            }
          }
          
          // Only create event and count as processed if email was successful (or no email needed)
          if (emailSuccess) {
            await storage.createContractEvent({
              contractId: contract.id,
              eventType: "expired",
              metadata: { expiredAt: today, notificationSent: !!advertiser?.email },
            });
            
            result.processed++;
            result.details.push(`Contract ${contract.name} gemarkeerd als verlopen`);
          }
        } catch (error: any) {
          result.errors++;
          result.details.push(`Fout bij verlopen markeren ${contract.name}: ${error.message}`);
        }
        continue;
      }

      // Send expiration warnings at 30, 14, and 7 days before expiry
      const warningDays = [30, 14, 7];
      if (warningDays.includes(daysUntilExpiry) && advertiser?.email) {
        try {
          const emailResult = await sendEmail({
            to: advertiser.email,
            subject: `Contract "${contract.name}" verloopt over ${daysUntilExpiry} dagen`,
            html: generateExpirationEmail({
              contactName: advertiser.contactName || advertiser.companyName,
              contractName: contract.name,
              endDate: contract.endDate,
              daysUntilExpiry,
              isExpired: false,
            }),
          });
          
          if (emailResult.success) {
            await storage.createContractEvent({
              contractId: contract.id,
              eventType: "expiration_warning",
              metadata: { daysUntilExpiry },
            });
            
            result.processed++;
            result.details.push(`Verloop-waarschuwing verzonden voor ${contract.name} (${daysUntilExpiry} dagen)`);
          } else {
            result.errors++;
            result.details.push(`E-mail fout voor ${contract.name}: ${emailResult.message}`);
          }
        } catch (error: any) {
          result.errors++;
          result.details.push(`Fout bij waarschuwing ${contract.name}: ${error.message}`);
        }
      }
    }

    result.success = result.errors === 0;
  } catch (error: any) {
    result.success = false;
    result.details.push(`Job fout: ${error.message}`);
  }

  return result;
}

/**
 * Signing Token Cleanup Job
 * Clears expired signing tokens (e.g., tokens older than 30 days)
 */
export async function runSigningTokenCleanup(): Promise<JobResult> {
  const result: JobResult = {
    success: true,
    processed: 0,
    errors: 0,
    details: [],
  };

  try {
    const contracts = await storage.getContracts();
    const now = new Date();
    const maxTokenAgeDays = 30;

    for (const contract of contracts) {
      // Skip contracts without signing token or already signed
      if (!contract.signatureTokenHash || !contract.sentAt) continue;
      if (contract.status === "signed" || contract.status === "active") continue;

      const sentDate = new Date(contract.sentAt);
      const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceSent > maxTokenAgeDays) {
        try {
          await storage.updateContract(contract.id, {
            signatureTokenHash: null,
            status: "expired",
          });
          
          await storage.createContractEvent({
            contractId: contract.id,
            eventType: "token_expired",
            metadata: { daysSinceSent, maxTokenAgeDays },
          });
          
          result.processed++;
          result.details.push(`Token verlopen voor ${contract.name}`);
        } catch (error: any) {
          result.errors++;
          result.details.push(`Fout bij token cleanup ${contract.name}: ${error.message}`);
        }
      }
    }

    result.success = result.errors === 0;
  } catch (error: any) {
    result.success = false;
    result.details.push(`Job fout: ${error.message}`);
  }

  return result;
}

// Email template helpers
interface SigningReminderData {
  contactName: string;
  contractName: string;
  daysSinceSent: number;
  signingUrl?: string;
}

function generateSigningReminderEmail(data: SigningReminderData): string {
  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Herinnering: Contract Ondertekening</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${COMPANY.tradeName}</h1>
    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">${COMPANY.tagline}</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
    <h2 style="color: #1e3a5f; margin-top: 0;">Herinnering: Contract wacht op ondertekening</h2>
    
    <p>Beste ${data.contactName},</p>
    
    <p>Wij willen u er graag aan herinneren dat uw contract <strong>"${data.contractName}"</strong> nog wacht op uw ondertekening.</p>
    
    <p>Het contract is ${data.daysSinceSent} dagen geleden naar u verzonden en wij hebben uw handtekening nog niet ontvangen.</p>
    
    ${data.signingUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.signingUrl}" style="background: #f8a12f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Contract Ondertekenen</a>
    </div>
    ` : ""}
    
    <p>Heeft u vragen of heeft u hulp nodig? Neem gerust contact met ons op.</p>
    
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
    <p>© ${new Date().getFullYear()} ${COMPANY.legalName}. Alle rechten voorbehouden.</p>
  </div>
</body>
</html>
  `;
}

interface ExpirationEmailData {
  contactName: string;
  contractName: string;
  endDate: string;
  daysUntilExpiry?: number;
  isExpired: boolean;
}

function generateExpirationEmail(data: ExpirationEmailData): string {
  const title = data.isExpired 
    ? "Contract Verlopen" 
    : `Contract verloopt over ${data.daysUntilExpiry} dagen`;
  
  const message = data.isExpired
    ? `Uw contract <strong>"${data.contractName}"</strong> is vandaag verlopen (einddatum: ${data.endDate}).`
    : `Uw contract <strong>"${data.contractName}"</strong> verloopt over ${data.daysUntilExpiry} dagen (einddatum: ${data.endDate}).`;

  const action = data.isExpired
    ? "Als u uw reclame wilt voortzetten, neem dan contact met ons op om een nieuw contract af te sluiten."
    : "Als u uw contract wilt verlengen, neem dan contact met ons op vóór de einddatum.";

  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${COMPANY.tradeName}</h1>
    <p style="color: #f8a12f; margin: 5px 0 0 0; font-size: 14px;">${COMPANY.tagline}</p>
  </div>
  
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none;">
    <h2 style="color: ${data.isExpired ? '#dc3545' : '#f8a12f'}; margin-top: 0;">${title}</h2>
    
    <p>Beste ${data.contactName},</p>
    
    <p>${message}</p>
    
    <div style="background: ${data.isExpired ? '#f8d7da' : '#fff3cd'}; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid ${data.isExpired ? '#f5c6cb' : '#ffc107'};">
      <p style="margin: 0;">${action}</p>
    </div>
    
    <p>Heeft u vragen? Neem gerust contact met ons op.</p>
    
    <p>Met vriendelijke groet,<br><strong>Team ${COMPANY.tradeName}</strong></p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
    <p>© ${new Date().getFullYear()} ${COMPANY.legalName}. Alle rechten voorbehouden.</p>
  </div>
</body>
</html>
  `;
}

// Job registry - maps job names to their handler functions
export const jobRegistry: Record<string, () => Promise<JobResult>> = {
  "contract-signing-reminders": runContractSigningReminders,
  "contract-expiration-check": runContractExpirationCheck,
  "signing-token-cleanup": runSigningTokenCleanup,
};

// Execute a job by name and record the run
export async function executeJob(jobName: string): Promise<JobResult> {
  const handler = jobRegistry[jobName];
  if (!handler) {
    return {
      success: false,
      processed: 0,
      errors: 1,
      details: [`Onbekende job: ${jobName}`],
    };
  }

  const startTime = Date.now();
  const result = await handler();
  const durationMs = Date.now() - startTime;

  // Find job record and create run entry
  try {
    const job = await storage.getJobByName(jobName);
    if (job) {
      await storage.createJobRun({
        jobId: job.id,
        status: result.success ? "success" : "error",
        startedAt: new Date(startTime),
        completedAt: new Date(),
        durationMs,
        resultSummary: result,
      });

      await storage.updateJob(job.id, {
        lastRunAt: new Date(),
        lastRunStatus: result.success ? "success" : "error",
      });
    }
  } catch (error: any) {
    console.error("Failed to record job run:", error);
  }

  return result;
}
