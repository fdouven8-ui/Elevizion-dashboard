/**
 * Acquisitie Service - Cold Walk-in Onboarding
 * 
 * Handles atomic creation of advertisers, locations, surveys, screens,
 * contracts and related records in a single transaction.
 */

import { db } from "../db";
import * as schema from "@shared/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { encrypt } from "../utils/encryption";
import { z } from "zod";

// Wizard step validation schemas
const companyBasicsSchema = z.object({
  companyName: z.string().min(1, "Bedrijfsnaam is verplicht"),
  contactName: z.string().min(1, "Contactpersoon is verplicht"),
  email: z.string().email("Ongeldig e-mailadres").optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  kvkNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const locationDetailsSchema = z.object({
  locationDisplayName: z.string().optional().nullable(),
  revenueSharePercent: z.string().default("10.00"),
});

const advertiserDetailsSchema = z.object({
  preferredPackagePlanId: z.string().optional().nullable(),
  customPriceExVat: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const schouwSchema = z.object({
  surveyDate: z.string(),
  hasWifiAvailable: z.boolean().optional().nullable(),
  wifiNetworkName: z.string().optional().nullable(),
  wifiPassword: z.string().optional().nullable(),
  hasPowerOutlet: z.boolean().optional().nullable(),
  powerOutletLocation: z.string().optional().nullable(),
  proposedScreenCount: z.number().default(1),
  proposedScreenLocations: z.string().optional().nullable(),
  wallMountPossible: z.boolean().optional().nullable(),
  ceilingMountPossible: z.boolean().optional().nullable(),
  standMountPossible: z.boolean().optional().nullable(),
  footTrafficEstimate: z.string().optional().nullable(),
  targetAudience: z.string().optional().nullable(),
  competingScreens: z.boolean().optional().nullable(),
  competingScreensNotes: z.string().optional().nullable(),
  installationNotes: z.string().optional().nullable(),
  estimatedInstallationCost: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const screenSchema = z.object({
  name: z.string().default("Hoofdscherm"),
  yodeckPlayerId: z.string().optional().nullable(),
  orientation: z.string().default("landscape"),
  installStatus: z.string().default("planned"),
});

const userAccountSchema = z.object({
  createPartnerUser: z.boolean().default(false),
  partnerEmail: z.string().email().optional().nullable(),
  partnerName: z.string().optional().nullable(),
  createAdvertiserUser: z.boolean().default(false),
  advertiserEmail: z.string().email().optional().nullable(),
  advertiserName: z.string().optional().nullable(),
});

const signatureSchema = z.object({
  signNow: z.boolean().default(false),
  signerName: z.string().optional().nullable(),
  signerEmail: z.string().email().optional().nullable(),
  signatureData: z.string().optional().nullable(),
});

export const acquisitieWizardSchema = z.object({
  onboardingType: z.enum(["location", "advertiser", "both"]),
  companyBasics: companyBasicsSchema,
  locationDetails: locationDetailsSchema.optional(),
  advertiserDetails: advertiserDetailsSchema.optional(),
  schouw: schouwSchema.optional(),
  screens: z.array(screenSchema).optional(),
  userAccounts: userAccountSchema.optional(),
  signature: signatureSchema.optional(),
  createPlacementsForNewScreens: z.boolean().default(true),
});

export type AcquisitieWizardInput = z.infer<typeof acquisitieWizardSchema>;

export interface AcquisitieResult {
  success: boolean;
  leadId?: string;
  advertiserId?: string;
  locationId?: string;
  surveyId?: string;
  screenIds?: string[];
  contractId?: string;
  placementIds?: string[];
  checklistId?: string;
  taskIds?: string[];
  errors?: string[];
  warnings?: string[];
  nextActions?: {
    openLocation?: string;
    openAdvertiser?: string;
    openContract?: string;
    signingLink?: string;
    sendInvites?: boolean;
  };
}

export interface DuplicateCheck {
  type: "advertiser" | "location" | "lead";
  id: string;
  name: string;
  email?: string | null;
  matchReason: string;
}

export async function checkDuplicates(
  companyName: string,
  email: string | null | undefined,
  postcode: string | null | undefined
): Promise<DuplicateCheck[]> {
  const duplicates: DuplicateCheck[] = [];
  
  const advertisers = await db
    .select()
    .from(schema.advertisers)
    .where(
      or(
        ilike(schema.advertisers.companyName, `%${companyName}%`),
        email ? eq(schema.advertisers.email, email) : undefined
      )
    );
  
  for (const adv of advertisers) {
    let reason = "";
    if (adv.companyName.toLowerCase().includes(companyName.toLowerCase())) {
      reason = "Vergelijkbare bedrijfsnaam";
    }
    if (email && adv.email === email) {
      reason = reason ? `${reason}, zelfde e-mail` : "Zelfde e-mail";
    }
    duplicates.push({
      type: "advertiser",
      id: adv.id,
      name: adv.companyName,
      email: adv.email,
      matchReason: reason,
    });
  }
  
  const locations = await db
    .select()
    .from(schema.locations)
    .where(
      or(
        ilike(schema.locations.name, `%${companyName}%`),
        email ? eq(schema.locations.email, email) : undefined
      )
    );
  
  for (const loc of locations) {
    let reason = "";
    if (loc.name.toLowerCase().includes(companyName.toLowerCase())) {
      reason = "Vergelijkbare locatienaam";
    }
    if (email && loc.email === email) {
      reason = reason ? `${reason}, zelfde e-mail` : "Zelfde e-mail";
    }
    duplicates.push({
      type: "location",
      id: loc.id,
      name: loc.name,
      email: loc.email,
      matchReason: reason,
    });
  }
  
  const leads = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        or(
          ilike(schema.leads.companyName, `%${companyName}%`),
          email ? eq(schema.leads.email, email) : undefined
        ),
        eq(schema.leads.convertedAt, null as any)
      )
    );
  
  for (const lead of leads) {
    let reason = "";
    if (lead.companyName.toLowerCase().includes(companyName.toLowerCase())) {
      reason = "Vergelijkbare bedrijfsnaam";
    }
    if (email && lead.email === email) {
      reason = reason ? `${reason}, zelfde e-mail` : "Zelfde e-mail";
    }
    duplicates.push({
      type: "lead",
      id: lead.id,
      name: lead.companyName,
      email: lead.email,
      matchReason: reason,
    });
  }
  
  return duplicates;
}

export async function createColdWalkIn(
  input: AcquisitieWizardInput,
  userId?: string
): Promise<AcquisitieResult> {
  const validated = acquisitieWizardSchema.parse(input);
  const result: AcquisitieResult = {
    success: false,
    screenIds: [],
    placementIds: [],
    taskIds: [],
    warnings: [],
    nextActions: {},
  };

  try {
    await db.transaction(async (tx) => {
      const { onboardingType, companyBasics, locationDetails, advertiserDetails, schouw, screens, signature } = validated;
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      // 1. Create Lead record
      const [lead] = await tx
        .insert(schema.leads)
        .values({
          type: onboardingType,
          companyName: companyBasics.companyName,
          contactName: companyBasics.contactName,
          email: companyBasics.email,
          phone: companyBasics.phone,
          address: companyBasics.address,
          city: companyBasics.city,
          postcode: companyBasics.postcode,
          kvkNumber: companyBasics.kvkNumber,
          notes: companyBasics.notes,
          status: "gewonnen",
          source: "cold_walk_in",
          convertedAt: now,
        })
        .returning();
      result.leadId = lead.id;

      let locationId: string | undefined;
      let advertiserId: string | undefined;
      let contractId: string | undefined;

      // 2. Create Location if needed
      if (onboardingType === "location" || onboardingType === "both") {
        const locationName = locationDetails?.locationDisplayName || companyBasics.companyName;
        const revenueShare = locationDetails?.revenueSharePercent || "10.00";
        
        const fullAddress = [companyBasics.address, companyBasics.postcode, companyBasics.city]
          .filter(Boolean)
          .join(", ");

        const [location] = await tx
          .insert(schema.locations)
          .values({
            name: locationName,
            address: fullAddress || companyBasics.companyName,
            contactName: companyBasics.contactName,
            email: companyBasics.email || `${companyBasics.companyName.toLowerCase().replace(/\s/g, '')}@onbekend.nl`,
            phone: companyBasics.phone,
            revenueSharePercent: revenueShare,
            status: "active",
            notes: companyBasics.notes,
          })
          .returning();
        locationId = location.id;
        result.locationId = locationId;
        result.nextActions!.openLocation = locationId;

        // Update lead with converted location ID
        await tx
          .update(schema.leads)
          .set({ convertedToId: locationId })
          .where(eq(schema.leads.id, lead.id));

        // 3. Create Survey if provided
        if (schouw) {
          const wifiEncrypted = schouw.wifiPassword ? encrypt(schouw.wifiPassword) : null;
          
          const [survey] = await tx
            .insert(schema.locationSurveys)
            .values({
              leadId: lead.id,
              locationId: locationId,
              surveyDate: schouw.surveyDate || today,
              surveyByUserId: userId,
              hasWifiAvailable: schouw.hasWifiAvailable,
              wifiNetworkName: schouw.wifiNetworkName,
              wifiPasswordEncrypted: wifiEncrypted,
              hasPowerOutlet: schouw.hasPowerOutlet,
              powerOutletLocation: schouw.powerOutletLocation,
              proposedScreenCount: schouw.proposedScreenCount,
              proposedScreenLocations: schouw.proposedScreenLocations,
              wallMountPossible: schouw.wallMountPossible,
              ceilingMountPossible: schouw.ceilingMountPossible,
              standMountPossible: schouw.standMountPossible,
              footTrafficEstimate: schouw.footTrafficEstimate,
              targetAudience: schouw.targetAudience,
              competingScreens: schouw.competingScreens,
              competingScreensNotes: schouw.competingScreensNotes,
              installationNotes: schouw.installationNotes,
              estimatedInstallationCost: schouw.estimatedInstallationCost,
              notes: schouw.notes,
              status: "afgerond",
            })
            .returning();
          result.surveyId = survey.id;

          // Create installation task
          const [installTask] = await tx
            .insert(schema.tasks)
            .values({
              title: `Installatie: ${locationName}`,
              description: `Schermen installeren bij ${locationName}. Aantal: ${schouw.proposedScreenCount || 1}. ${schouw.installationNotes || ""}`,
              taskType: "installatie",
              priority: "normaal",
              status: "open",
              surveyId: survey.id,
              locationId: locationId,
              assignedToRole: "ops",
              createdByUserId: userId,
            })
            .returning();
          result.taskIds!.push(installTask.id);

          // Create purchasing task if there are supplies needed
          const [purchaseTask] = await tx
            .insert(schema.tasks)
            .values({
              title: `Inkoop materialen: ${locationName}`,
              description: `Materialen bestellen voor installatie bij ${locationName}. Geschatte kosten: €${schouw.estimatedInstallationCost || "onbekend"}`,
              taskType: "inkoop",
              priority: "normaal",
              status: "open",
              surveyId: survey.id,
              locationId: locationId,
              assignedToRole: "admin",
              createdByUserId: userId,
            })
            .returning();
          result.taskIds!.push(purchaseTask.id);
        }

        // 4. Create Screens
        if (screens && screens.length > 0) {
          for (const screenData of screens) {
            const [screen] = await tx
              .insert(schema.screens)
              .values({
                locationId: locationId,
                name: screenData.name || "Hoofdscherm",
                yodeckPlayerId: screenData.yodeckPlayerId,
                orientation: screenData.orientation || "landscape",
                status: "unknown",
                isActive: true,
              })
              .returning();
            result.screenIds!.push(screen.id);
          }
        } else {
          // Create default screen
          const [screen] = await tx
            .insert(schema.screens)
            .values({
              locationId: locationId,
              name: "Hoofdscherm",
              orientation: "landscape",
              status: "unknown",
              isActive: true,
            })
            .returning();
          result.screenIds!.push(screen.id);
        }
      }

      // 5. Create Advertiser if needed
      if (onboardingType === "advertiser" || onboardingType === "both") {
        const fullAddress = [companyBasics.address, companyBasics.postcode, companyBasics.city]
          .filter(Boolean)
          .join(", ");

        const [advertiser] = await tx
          .insert(schema.advertisers)
          .values({
            companyName: companyBasics.companyName,
            contactName: companyBasics.contactName,
            email: companyBasics.email || `${companyBasics.companyName.toLowerCase().replace(/\s/g, '')}@onbekend.nl`,
            phone: companyBasics.phone,
            address: fullAddress,
            status: "active",
            notes: companyBasics.notes,
          })
          .returning();
        advertiserId = advertiser.id;
        result.advertiserId = advertiserId;
        result.nextActions!.openAdvertiser = advertiserId;

        // Update lead if not already updated
        if (onboardingType === "advertiser") {
          await tx
            .update(schema.leads)
            .set({ convertedToId: advertiserId })
            .where(eq(schema.leads.id, lead.id));
        }

        // 6. Create Contract
        const packagePlanId = advertiserDetails?.preferredPackagePlanId;
        let monthlyPrice = advertiserDetails?.customPriceExVat || "150.00";
        let contractName = `Contract ${companyBasics.companyName}`;

        if (packagePlanId) {
          const [plan] = await tx
            .select()
            .from(schema.packagePlans)
            .where(eq(schema.packagePlans.id, packagePlanId));
          if (plan) {
            monthlyPrice = advertiserDetails?.customPriceExVat || plan.baseMonthlyPriceExVat;
            contractName = `${plan.name} - ${companyBasics.companyName}`;
          }
        }

        const startDate = advertiserDetails?.startDate || today;
        const [contract] = await tx
          .insert(schema.contracts)
          .values({
            advertiserId: advertiserId,
            packagePlanId: packagePlanId,
            name: contractName,
            title: contractName,
            startDate: startDate,
            endDate: advertiserDetails?.endDate,
            monthlyPriceExVat: monthlyPrice,
            vatPercent: "21.00",
            billingCycle: "monthly",
            status: "draft",
          })
          .returning();
        contractId = contract.id;
        result.contractId = contractId;
        result.nextActions!.openContract = contractId;

        // 7. Create Onboarding Checklist
        const [checklist] = await tx
          .insert(schema.onboardingChecklists)
          .values({
            advertiserId: advertiserId,
            status: "in_progress",
          })
          .returning();
        result.checklistId = checklist.id;

        // Create default onboarding tasks
        const taskTypes = [
          "creative_received",
          "creative_approved",
          "campaign_created",
          "scheduled_on_screens",
          "billing_configured",
        ];
        for (const taskType of taskTypes) {
          await tx.insert(schema.onboardingTasks).values({
            checklistId: checklist.id,
            taskType: taskType,
            status: "todo",
          });
        }

        // 8. Create Placements if "both" and screens exist
        if (onboardingType === "both" && validated.createPlacementsForNewScreens && result.screenIds!.length > 0) {
          for (const screenId of result.screenIds!) {
            const [placement] = await tx
              .insert(schema.placements)
              .values({
                contractId: contractId,
                screenId: screenId,
                source: "manual",
                secondsPerLoop: 10,
                playsPerHour: 6,
                startDate: startDate,
                isActive: true,
              })
              .returning();
            result.placementIds!.push(placement.id);
          }
        }

        // 9. Handle Signature if signing now
        if (signature?.signNow && signature.signatureData) {
          await tx.insert(schema.digitalSignatures).values({
            documentType: "contract",
            documentId: contractId,
            signerName: signature.signerName || companyBasics.contactName,
            signerEmail: signature.signerEmail || companyBasics.email,
            signerRole: "adverteerder",
            signatureData: signature.signatureData,
          });

          // Update contract status to signed
          await tx
            .update(schema.contracts)
            .set({
              status: "signed",
              signedAt: now,
              signedByName: signature.signerName || companyBasics.contactName,
              signedByEmail: signature.signerEmail || companyBasics.email,
              signatureData: signature.signatureData,
            })
            .where(eq(schema.contracts.id, contractId));
        }
      }

      result.success = true;
    });

    return result;
  } catch (error: any) {
    console.error("Acquisitie transaction failed:", error);
    return {
      success: false,
      errors: [error.message || "Onbekende fout bij aanmaken"],
    };
  }
}
