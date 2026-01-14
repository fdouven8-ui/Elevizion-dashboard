/**
 * Capacity Watcher Worker
 * 
 * Background job that periodically checks WAITING waitlist requests
 * and sends invite emails when capacity becomes available.
 */

import { storage } from "../storage";
import { capacityGateService } from "./capacityGateService";
import * as crypto from "crypto";

const INVITE_EXPIRY_HOURS = 48;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Check all WAITING requests and send invites for those with available capacity
 */
async function checkWaitingRequests(): Promise<{
  checked: number;
  invited: number;
  errors: number;
}> {
  const stats = { checked: 0, invited: 0, errors: 0 };
  
  try {
    const waitingRequests = await storage.getWaitingRequests();
    console.log(`[CapacityWatcher] Checking ${waitingRequests.length} waiting requests...`);
    
    for (const request of waitingRequests) {
      stats.checked++;
      
      try {
        // Check capacity for this request
        const capacityCheck = await capacityGateService.checkCapacity({
          packageType: request.packageType,
          businessCategory: request.businessCategory,
          competitorGroup: request.competitorGroup || request.businessCategory,
          targetRegionCodes: request.targetRegionCodes || [],
          videoDurationSeconds: 15,
        });
        
        // Update lastCheckedAt
        await storage.updateWaitlistRequest(request.id, { lastCheckedAt: new Date() });
        
        if (capacityCheck.isAvailable) {
          // Capacity available! Send invite
          console.log(`[CapacityWatcher] Capacity available for ${request.email} (${request.packageType})`);
          
          // Generate claim token
          const claimToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(claimToken).digest("hex");
          const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
          
          // Update request with invite info
          await storage.updateWaitlistRequest(request.id, {
            status: "INVITED",
            inviteTokenHash: tokenHash,
            inviteSentAt: new Date(),
            inviteExpiresAt: expiresAt,
          });
          
          // Send claim email
          try {
            const { sendEmail, baseEmailTemplate } = await import("../email");
            const claimUrl = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000"}/claim/${claimToken}`;
            
            const emailContent = baseEmailTemplate({
              subject: "Er is plek! Claim je pakket - Elevizion",
              preheader: "Je kunt nu je plek claimen",
              title: `Goed nieuws, ${request.contactName.split(" ")[0]}!`,
              introText: `Er is plek vrijgekomen voor het ${request.packageType} pakket in de door jou gekozen regio's.`,
              bodyBlocks: [
                { type: "paragraph", content: `Claim nu je plek voordat iemand anders het doet. De link is ${INVITE_EXPIRY_HOURS} uur geldig.` },
                { type: "paragraph", content: `Claim link: ${claimUrl}` },
              ],
              cta: { label: "Claim je plek", url: claimUrl },
            });
            
            await sendEmail({
              to: request.email,
              subject: "Er is plek! Claim je pakket - Elevizion",
              html: emailContent.html,
            });
            
            stats.invited++;
            console.log(`[CapacityWatcher] Sent invite to ${request.email}`);
          } catch (emailError: any) {
            console.error(`[CapacityWatcher] Failed to send invite email to ${request.email}:`, emailError);
            // Revert status if email fails
            await storage.updateWaitlistRequest(request.id, {
              status: "WAITING",
              inviteTokenHash: null,
              inviteSentAt: null,
              inviteExpiresAt: null,
            });
            stats.errors++;
          }
        }
      } catch (error: any) {
        console.error(`[CapacityWatcher] Error checking request ${request.id}:`, error);
        stats.errors++;
      }
    }
  } catch (error: any) {
    console.error("[CapacityWatcher] Error in checkWaitingRequests:", error);
    stats.errors++;
  }
  
  console.log(`[CapacityWatcher] Check complete: ${stats.checked} checked, ${stats.invited} invited, ${stats.errors} errors`);
  return stats;
}

/**
 * Check for expired invites and reset them back to WAITING
 * This allows them to be re-invited when capacity becomes available
 */
async function expireOldInvites(): Promise<number> {
  let expired = 0;
  
  try {
    const invitedRequests = await storage.getWaitlistRequestByStatus("INVITED");
    const now = new Date();
    
    for (const request of invitedRequests) {
      if (request.inviteExpiresAt && new Date(request.inviteExpiresAt) < now) {
        // Reset to WAITING so they can be re-invited when capacity available
        await storage.updateWaitlistRequest(request.id, {
          status: "WAITING",
          inviteTokenHash: null,
          inviteSentAt: null,
          inviteExpiresAt: null,
        });
        expired++;
        console.log(`[CapacityWatcher] Invite expired for ${request.email} - reset to WAITING`);
      }
    }
  } catch (error: any) {
    console.error("[CapacityWatcher] Error expiring invites:", error);
  }
  
  return expired;
}

/**
 * Run the full worker cycle
 */
async function runWorkerCycle(): Promise<void> {
  if (isRunning) {
    console.log("[CapacityWatcher] Worker already running, skipping...");
    return;
  }
  
  isRunning = true;
  console.log("[CapacityWatcher] Starting worker cycle...");
  
  try {
    // First expire old invites
    const expired = await expireOldInvites();
    if (expired > 0) {
      console.log(`[CapacityWatcher] Expired ${expired} old invites`);
    }
    
    // Then check waiting requests
    await checkWaitingRequests();
  } finally {
    isRunning = false;
  }
}

/**
 * Start the capacity watcher worker
 */
export function startCapacityWatcher(): void {
  if (intervalId) {
    console.log("[CapacityWatcher] Worker already started");
    return;
  }
  
  console.log(`[CapacityWatcher] Starting worker (interval: ${CHECK_INTERVAL_MS / 1000 / 60} minutes)`);
  
  // Run immediately on start
  setTimeout(() => runWorkerCycle(), 5000);
  
  // Then run periodically
  intervalId = setInterval(() => runWorkerCycle(), CHECK_INTERVAL_MS);
}

/**
 * Stop the capacity watcher worker
 */
export function stopCapacityWatcher(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[CapacityWatcher] Worker stopped");
  }
}

/**
 * Manual trigger for admin
 */
export async function triggerCapacityCheck(): Promise<{
  checked: number;
  invited: number;
  errors: number;
}> {
  return await checkWaitingRequests();
}
