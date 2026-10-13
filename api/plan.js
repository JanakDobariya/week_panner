import { checkAuth, extractJson } from "./_lib.js";

// Uses Gemini when GEMINI_API_KEY is set, otherwise Claude when ANTHROPIC_API_KEY is set.

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Tried in order; the first model the API accepts is used.
const geminiModels = () => [...new Set([process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean))];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ code: "method", error: "Use POST." });
  }
  if (!checkAuth(req, res)) return;

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    return res.status(500).json({ code: "no_ai_key", error: "No AI key is set in your Vercel project settings." });
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

  // Earlier turns as plain text, alternating user/assistant, starting with user, ending with assistant.
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

  try {
    const text = geminiKey
      ? await askGemini(geminiKey, { system, past, message, images })
      : await askClaude(anthropicKey, { system, past, message, images });
    try {
      const out = extractJson(text);
      return res.status(200).json({
        reply: typeof out.reply === "string" ? out.reply : "Done.",
        ops: Array.isArray(out.ops) ? out.ops : [],
      });
    } catch {
      return res.status(200).json({ reply: text.slice(0, 1500) || "I couldn't read that. Try again.", ops: [] });
    }
  } catch (e) {
    return res.status(e.httpStatus || 502).json({ code: e.code || "ai_error", error: e.message });
  }
}

function fail(code, message, httpStatus = 502) {
  const e = new Error(message);
  e.code = code;
  e.httpStatus = httpStatus;
  return e;
}

async function askGemini(key, { system, past, message, images }) {
  const contents = [
    ...past.map((p) => ({ role: p.role === "assistant" ? "model" : "user", parts: [{ text: p.content }] })),
    {
      role: "user",
      parts: [
        ...images.map((img) => ({ inline_data: { mime_type: img.media_type, data: img.data } })),
        { text: message },
      ],
    },
  ];
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192, temperature: 0.2 },
  });

  let lastError = null;
  for (const model of geminiModels()) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body,
      });
    } catch {
      throw fail("ai_unreachable", "Couldn't reach the Gemini API.");
    }
    const j = await r.json().catch(() => ({}));
    const msg = (j.error && j.error.message) || `Gemini API error ${r.status}`;
    if (!r.ok) {
      const bad = r.status === 401 || r.status === 403 || /api key/i.test(msg);
      if (bad) throw fail("bad_ai_key", msg);
      // Model missing, busy, over its quota or failing: try the next model.
      if (r.status === 404) lastError = fail("ai_error", `Gemini model "${model}" isn't available: ${msg}`);
      else if (r.status === 429) lastError = fail("rate_limited", `${model}: ${msg}`, 429);
      else if (r.status === 503 || r.status === 500 || r.status === 504) lastError = fail("overloaded", `${model}: ${msg}`);
      else throw fail("ai_error", `${model}: ${msg}`);
      continue;
    }
    const cand = (j.candidates || [])[0];
    if (!cand) throw fail("ai_error", (j.promptFeedback && `Blocked: ${j.promptFeedback.blockReason}`) || "Gemini returned no answer.");
    const text = ((cand.content && cand.content.parts) || []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
    if (!text) throw fail("ai_error", `Gemini returned an empty answer (${cand.finishReason || "unknown reason"}).`);
    return text;
  }
  throw lastError || fail("ai_error", "No Gemini model was available.");
}

async function askClaude(key, { system, past, message, images }) {
  const content = [
    ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } })),
    { type: "text", text: message },
  ];
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 4096,
        system,
        messages: [...past, { role: "user", content }],
      }),
    });
  } catch {
    throw fail("ai_unreachable", "Couldn't reach the Claude API.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || `Claude API error ${r.status}`;
    if (r.status === 401) throw fail("bad_ai_key", msg);
    if (r.status === 429) throw fail("rate_limited", msg, 429);
    if (r.status === 529) throw fail("overloaded", msg);
    throw fail("ai_error", msg);
  }
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
