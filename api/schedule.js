import { checkAuth, hasStorage, redis } from "./_lib.js";

const KEY = "planner:schedule";

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  if (!hasStorage()) {
    return res.status(501).json({ code: "no_storage", error: "No storage connected. Add Upstash for Redis in Vercel to sync between devices." });
  }
  try {
    if (req.method === "GET") {
      const raw = await redis(["GET", KEY]);
      const doc = raw ? JSON.parse(raw) : { events: null, updatedAt: null };
      return res.status(200).json(doc);
    }
    if (req.method === "PUT") {
      const events = req.body && req.body.events;
      if (!Array.isArray(events) || events.length > 2000) {
        return res.status(400).json({ code: "bad_request", error: "events must be a list of at most 2000 items." });
      }
      const doc = { events, updatedAt: new Date().toISOString() };
      const raw = JSON.stringify(doc);
      if (raw.length > 500_000) return res.status(413).json({ code: "too_large", error: "Schedule is too large." });
      await redis(["SET", KEY, raw]);
      return res.status(200).json({ updatedAt: doc.updatedAt });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ code: "method", error: "Use GET or PUT." });
  } catch (e) {
    return res.status(502).json({ code: "storage_error", error: e.message });
  }
}
