import express, { type Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // API routes should NEVER fall through to index.html - return JSON 404
  app.use("/api/*", (req: Request, res: Response) => {
    console.error(`[API Guard] 404: No route handler for ${req.method} ${req.originalUrl}`);
    res.setHeader("Content-Type", "application/json");
    res.status(404).json({
      ok: false,
      error: `No API route: ${req.method} ${req.originalUrl}`,
      code: "API_NOT_FOUND",
    });
  });

  // fall through to index.html if the file doesn't exist (SPA fallback for non-API routes only)
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
