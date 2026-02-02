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

  // fall through to index.html if the file doesn't exist (SPA fallback for non-API routes only)
  app.use("*", (req: Request, res: Response) => {
    // API routes should NEVER fall through to index.html - return JSON 404
    if (req.originalUrl.startsWith("/api/")) {
      console.error(`[API Guard] 404: No route handler for ${req.method} ${req.originalUrl}`);
      res.setHeader("Content-Type", "application/json");
      return res.status(404).json({
        ok: false,
        error: `No API route: ${req.method} ${req.originalUrl}`,
        code: "API_NOT_FOUND",
      });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
