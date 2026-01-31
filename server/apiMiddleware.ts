/**
 * API Middleware & Helpers
 * Ensures /api routes NEVER return HTML (SPA fallback prevention)
 */

import { Request, Response, NextFunction } from "express";

export function safeJson(res: Response, payload: any, status: number = 200): void {
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(payload);
}

export function apiNotFound(res: Response, message: string = "Not found"): void {
  safeJson(res, { ok: false, error: message, code: "NOT_FOUND" }, 404);
}

export function apiError(res: Response, message: string, status: number = 500, code?: string): void {
  safeJson(res, { ok: false, error: message, code: code || "ERROR" }, status);
}

export function apiSuccess(res: Response, data: any, status: number = 200): void {
  safeJson(res, { ok: true, ...data }, status);
}

export function apiOnlyMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function(body: any) {
    const contentType = res.getHeader("content-type");
    if (contentType && typeof contentType === "string" && contentType.includes("text/html")) {
      console.error(`[API Guard] BLOCKED HTML response for ${req.method} ${req.path}`);
      res.setHeader("Content-Type", "application/json");
      return originalJson.call(this, {
        ok: false,
        error: "API route cannot return HTML - check route configuration",
        code: "API_HTML_BLOCKED",
        path: req.path,
      });
    }
    return originalSend.call(this, body);
  };

  res.json = function(body: any) {
    res.setHeader("Content-Type", "application/json");
    return originalJson.call(this, body);
  };

  next();
}

export function apiRouteGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/")) {
    console.error(`[API Guard] 404: No route handler for ${req.method} ${req.path}`);
    return apiNotFound(res, `No API route: ${req.method} ${req.path}`);
  }
  next();
}
