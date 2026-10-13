import crypto from "node:crypto";

// Every API route is protected by the APP_PASSWORD you set in Vercel.
export function checkAuth(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({ code: "no_password", error: "APP_PASSWORD is not set in your Vercel project settings." });
    return false;
  }
  const given = String(req.headers["x-planner-password"] || "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ code: "unauthorized", error: "Wrong password." });
    return false;
  }
  return true;
}

// Upstash Redis (Vercel Marketplace → Upstash for Redis). Either naming works.
function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
export const hasStorage = () => !!redisEnv();

export async function redis(command) {
  const env = redisEnv();
  const r = await fetch(env.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Storage error ${r.status}`);
  return j.result;
}

// Pull the JSON object out of the model's reply (tolerates code fences or extra text).
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON in reply");
  return JSON.parse(body.slice(start, end + 1));
}
