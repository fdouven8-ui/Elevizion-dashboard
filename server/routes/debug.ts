import { Router } from "express";
import { getYodeckClient, getYodeckToken } from "../services/yodeckClient";

const router = Router();

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

router.get("/ping", (req, res) => {
  res.json({ ok: true, source: "debug" });
});

router.get("/yodeck/media", async (req, res) => {
  try {
    const token = await getYodeckToken();
    if (!token.isValid) {
      return res.status(503).json({ error: "Yodeck token niet beschikbaar" });
    }
    const limit = parseInt(req.query.limit as string) || 10;
    const response = await fetch(`${YODECK_BASE_URL}/media/?limit=${limit}`, {
      headers: { "Authorization": `Token ${token.label}:${token.value}` },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yodeck API: ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/yodeck/media/:id/upload", async (req, res) => {
  try {
    const token = await getYodeckToken();
    if (!token.isValid) {
      return res.status(503).json({ error: "Yodeck token niet beschikbaar" });
    }
    const mediaId = req.params.id;
    const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/upload/`, {
      headers: { "Authorization": `Token ${token.label}:${token.value}` },
    });
    if (response.status === 404) {
      return res.status(404).json({ ok: false, error: "Media not found in Yodeck", mediaId });
    }
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yodeck API: ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("[Debug] /yodeck/media/:id/upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/yodeck/media/:id/status", async (req, res) => {
  try {
    const token = await getYodeckToken();
    if (!token.isValid) {
      return res.status(503).json({ error: "Yodeck token niet beschikbaar" });
    }
    const mediaId = req.params.id;
    const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/status/`, {
      headers: { "Authorization": `Token ${token.label}:${token.value}` },
    });
    if (response.status === 404) {
      return res.status(404).json({ ok: false, error: "Media not found in Yodeck", mediaId });
    }
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Yodeck API: ${response.status}`, body: text.substring(0, 500) });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("[Debug] /yodeck/media/:id/status error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/yodeck/media/:id/raw", async (req, res) => {
  try {
    const client = await getYodeckClient();
    if (!client) {
      return res.status(503).json({ error: "Yodeck client niet beschikbaar" });
    }
    const mediaId = parseInt(req.params.id);
    if (isNaN(mediaId)) {
      return res.status(400).json({ error: "Ongeldig media ID" });
    }
    const result = await client.fetchMediaRaw(mediaId);
    if (!result.ok) {
      return res.status(404).json({ error: result.error || "Media niet gevonden" });
    }
    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/yodeck/media/:id", async (req, res) => {
  try {
    const token = await getYodeckToken();
    if (!token.isValid) {
      return res.status(503).json({ error: "Yodeck token niet beschikbaar" });
    }
    const mediaId = req.params.id;
    const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${token.label}:${token.value}` },
    });
    if (response.status === 404) {
      return res.status(404).json({ ok: false, error: "Media not found in Yodeck", mediaId });
    }
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yodeck API: ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("[Debug] /yodeck/media/:id error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
