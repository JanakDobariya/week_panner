import { checkAuth, extractJson } from "./_lib.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "method", error: "Use POST." });
  }
  if (!checkAuth(req, res)) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ code: "no_ai_key", error: "ANTHROPIC_API_KEY is not set in your Vercel project settings." });
  }

  const { system, history = [], message, images = [] } = req.body || {};
  if (typeof system !== "string" || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ code: "bad_request", error: "Missing message." });
  }
  if (system.length > 120_000 || message.length > 4000 || !Array.isArray(images) || images.length > 4 || !Array.isArray(history)) {
    return res.status(413).json({ code: "too_large", error: "Request is too large. Send fewer screenshots." });
  }
  for (const img of images) {
    if (!img || !IMAGE_TYPES.has(img.media_type) || typeof img.data !== "string" || img.data.length > 3_000_000) {
      return res.status(400).json({ code: "bad_image", error: "One of the screenshots couldn't be read. Try a PNG or JPG." });
    }
  }

  // Earlier turns as plain text, alternating user/assistant, starting with user.
  const past = [];
  for (const h of history.slice(-8)) {
    const role = h && h.role === "assistant" ? "assistant" : "user";
    const content = String((h && h.content) || "").slice(0, 4000);
    if (!content) continue;
    if (past.length === 0 && role !== "user") continue;
    if (past.length && past[past.length - 1].role === role) continue;
    past.push({ role, content });
  }
  if (past.length && past[past.length - 1].role === "user") past.pop();

  const content = [
    ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } })),
    { type: "text", text: message },
  ];

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 4096,
        system,
        messages: [...past, { role: "user", content }],
      }),
    });
  } catch (e) {
    return res.status(502).json({ code: "ai_unreachable", error: "Couldn't reach the Claude API." });
  }

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || `Claude API error ${r.status}`;
    const code = r.status === 401 ? "bad_ai_key" : r.status === 429 ? "rate_limited" : r.status === 529 ? "overloaded" : "ai_error";
    return res.status(r.status === 429 ? 429 : 502).json({ code, error: msg });
  }

  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  try {
    const out = extractJson(text);
    return res.status(200).json({
      reply: typeof out.reply === "string" ? out.reply : "Done.",
      ops: Array.isArray(out.ops) ? out.ops : [],
    });
  } catch {
    return res.status(200).json({ reply: text.slice(0, 1500) || "I couldn't read that. Try again.", ops: [] });
  }
}
