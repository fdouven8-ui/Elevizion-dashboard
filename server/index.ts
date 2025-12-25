import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeAdminUser } from "./initAdmin";
import { syncAllScreensContent } from "./services/yodeckContent";
import { db } from "./db";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

// Debug flags
const DEBUG_MEMORY = process.env.DEBUG_MEMORY === "true";

// Scheduled sync interval (15 minutes)
const SYNC_INTERVAL_MS = 15 * 60 * 1000;
let syncIntervalId: NodeJS.Timeout | null = null;
let isShuttingDown = false;

// Memory logging (only if DEBUG_MEMORY=true)
let memoryLogIntervalId: NodeJS.Timeout | null = null;
if (DEBUG_MEMORY) {
  memoryLogIntervalId = setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[Memory] RSS=${Math.round(mem.rss / 1024 / 1024)}MB, Heap=${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB, External=${Math.round(mem.external / 1024 / 1024)}MB`);
  }, 60000);
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`[Server] ${signal} received, starting graceful shutdown...`);
  
  // Stop scheduled tasks
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (moneybirdSyncIntervalId) {
    clearInterval(moneybirdSyncIntervalId);
    moneybirdSyncIntervalId = null;
  }
  if (memoryLogIntervalId) {
    clearInterval(memoryLogIntervalId);
    memoryLogIntervalId = null;
  }
  
  // Close HTTP server (stop accepting new connections)
  httpServer.close(() => {
    console.log("[Server] HTTP server closed");
  });
  
  // Give existing requests 5 seconds to complete
  setTimeout(async () => {
    try {
      // Close database pool
      await db.$client.end();
      console.log("[Server] Database pool closed");
    } catch (err) {
      console.error("[Server] Error closing database:", err);
    }
    
    console.log("[Server] Graceful shutdown complete");
    process.exit(0);
  }, 5000);
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Background sync function - Yodeck
async function runBackgroundSync() {
  if (isShuttingDown) return;
  
  console.log("[Sync] Starting scheduled Yodeck content sync...");
  try {
    const result = await syncAllScreensContent(false);
    console.log(`[Sync] Completed: ${result.stats.total} screens (${result.stats.withContent} with content, ${result.stats.empty} empty, ${result.stats.error} errors)`);
  } catch (err: any) {
    console.error("[Sync] Scheduled sync failed:", err.message);
  }
}

// Background sync function - Moneybird (runs every 30 minutes)
const MONEYBIRD_SYNC_INTERVAL_MS = 30 * 60 * 1000;
let moneybirdSyncIntervalId: NodeJS.Timeout | null = null;

async function runMoneybirdBackgroundSync() {
  if (isShuttingDown) return;
  
  // Check if Moneybird is configured
  const apiToken = process.env.MONEYBIRD_API_TOKEN;
  const administrationId = process.env.MONEYBIRD_ADMINISTRATION_ID;
  
  if (!apiToken || !administrationId) {
    console.log("[Moneybird Sync] Skipped - not configured");
    return;
  }
  
  console.log("[Moneybird Sync] Starting scheduled sync...");
  const startTime = Date.now();
  
  try {
    const { getMoneybirdClient } = await import("./services/moneybirdClient");
    const client = await getMoneybirdClient();
    
    if (!client) {
      console.log("[Moneybird Sync] Skipped - no client available");
      return;
    }
    
    client.setAdministrationId(administrationId);
    
    // Sync contacts
    const contacts = await client.getAllContacts();
    let contactsProcessed = 0;
    
    for (const contact of contacts) {
      await storage.upsertMoneybirdContact({
        moneybirdId: contact.id,
        companyName: contact.company_name || null,
        firstname: contact.firstname || null,
        lastname: contact.lastname || null,
        email: contact.email || null,
        phone: contact.phone || null,
        address1: contact.address1 || null,
        address2: contact.address2 || null,
        zipcode: contact.zipcode || null,
        city: contact.city || null,
        country: contact.country || null,
        chamberOfCommerce: contact.chamber_of_commerce || null,
        taxNumber: contact.tax_number || null,
        sepaActive: contact.sepa_active || false,
        sepaIban: contact.sepa_iban || null,
        sepaIbanAccountName: contact.sepa_iban_account_name || null,
        sepaMandateId: contact.sepa_mandate_id || null,
        sepaMandateDate: contact.sepa_mandate_date || null,
        customerId: contact.customer_id || null,
        lastSyncedAt: new Date(),
      });
      contactsProcessed++;
    }
    
    // Sync invoices
    const invoices = await client.getAllSalesInvoices();
    let invoicesProcessed = 0;
    
    for (const invoice of invoices) {
      await storage.upsertMoneybirdInvoice({
        moneybirdId: invoice.id,
        moneybirdContactId: invoice.contact_id,
        invoiceId: invoice.invoice_id || null,
        reference: invoice.reference || null,
        invoiceDate: invoice.invoice_date || null,
        dueDate: invoice.due_date || null,
        state: invoice.state || null,
        totalPriceExclTax: invoice.total_price_excl_tax || null,
        totalPriceInclTax: invoice.total_price_incl_tax || null,
        totalUnpaid: invoice.total_unpaid || null,
        currency: invoice.currency || "EUR",
        paidAt: invoice.paid_at ? new Date(invoice.paid_at) : null,
        url: invoice.url || null,
        lastSyncedAt: new Date(),
      });
      invoicesProcessed++;
      
      // Sync payments
      if (invoice.payments && invoice.payments.length > 0) {
        for (const payment of invoice.payments) {
          await storage.upsertMoneybirdPayment({
            moneybirdId: payment.id,
            moneybirdInvoiceId: invoice.id,
            paymentDate: payment.payment_date || null,
            price: payment.price || null,
            priceCurrency: invoice.currency || "EUR",
            lastSyncedAt: new Date(),
          });
        }
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Update integration status
    await storage.upsertIntegrationConfig("moneybird", {
      isEnabled: true,
      lastSyncAt: new Date(),
      lastSyncItemsProcessed: contactsProcessed + invoicesProcessed,
      status: "connected",
    });
    
    console.log(`[Moneybird Sync] Completed in ${duration}ms: ${contactsProcessed} contacts, ${invoicesProcessed} invoices`);
  } catch (err: any) {
    console.error("[Moneybird Sync] Scheduled sync failed:", err.message);
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await initializeAdminUser();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      
      // Start scheduled Yodeck sync (15 minute interval)
      // Run first sync after 30 seconds to allow server to stabilize
      setTimeout(() => {
        if (!isShuttingDown) {
          runBackgroundSync();
          syncIntervalId = setInterval(runBackgroundSync, SYNC_INTERVAL_MS);
        }
      }, 30000);
      
      // Start scheduled Moneybird sync (30 minute interval)
      // Run first sync after 60 seconds to allow server to stabilize
      setTimeout(() => {
        if (!isShuttingDown) {
          runMoneybirdBackgroundSync();
          moneybirdSyncIntervalId = setInterval(runMoneybirdBackgroundSync, MONEYBIRD_SYNC_INTERVAL_MS);
        }
      }, 60000);
    },
  );
})();
