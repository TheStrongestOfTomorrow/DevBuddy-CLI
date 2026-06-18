// AI client for HuggingFace Inference API (router.huggingface.co/v1).
// OpenAI-compatible chat completions endpoint. Free tier with rate limits.
//
// Why HuggingFace? Free to use, anyone can sign up at https://huggingface.co,
// generous free tier, no credit card required. Trade-off: rate-limited — see
// `warnRateLimit()` below.

import { loadConfig, saveConfig } from "./store.js";
import * as ui from "./ui.js";

const DEFAULT_BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";
const CHAT_PATH = "/chat/completions";

// A few known-good free models. Users can override via --model or config.
export const KNOWN_MODELS = [
  "mistralai/Mistral-7B-Instruct-v0.3",     // default — fast, capable
  "meta-llama/Meta-Llama-3-8B-Instruct",    // good alternative
  "Qwen/Qwen2.5-7B-Instruct",               // strong on code
  "HuggingFaceH4/zephyr-7b-beta",           // friendly chat
  "google/gemma-2-2b-it",                   // lightweight
];

let _warnedThisSession = false;

export function getAuth() {
  const cfg = loadConfig();
  return {
    token: cfg.hfToken || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || "",
    baseUrl: (cfg.hfBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: cfg.hfModel || DEFAULT_MODEL,
  };
}

export function isAuthenticated() {
  const { token } = getAuth();
  return Boolean(token);
}

export function warnRateLimit(force = false) {
  if (_warnedThisSession && !force) return;
  _warnedThisSession = true;
  ui.warn(
    "HuggingFace free tier is rate-limited (~1000 requests/month for individuals). " +
    "If you hit 429 errors, switch models via `devbuddy config set hfModel <name>` " +
    "or upgrade at https://huggingface.co/pricing."
  );
}

/**
 * Single-turn chat completion via HuggingFace Inference API.
 * @param {string} userPrompt
 * @param {object} opts
 * @param {string} [opts.system]   system prompt
 * @param {string} [opts.model]    override model
 * @param {number} [opts.maxTokens] max output tokens (default 1024)
 * @param {number} [opts.temperature] 0..1 (default 0.7)
 * @returns {Promise<string>} assistant text
 */
export async function complete(userPrompt, opts = {}) {
  const { token, baseUrl, model: cfgModel } = getAuth();
  if (!token) {
    throw new Error(
      "No HuggingFace token set. Run `devbuddy auth set <token>` or set HF_TOKEN env var.\n" +
      "Get a free token at: https://huggingface.co/settings/tokens"
    );
  }

  const model = opts.model || cfgModel;
  const messages = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: userPrompt });

  const url = baseUrl + CHAT_PATH;
  const body = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // 429 — rate limited. Surface a clear, actionable error.
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after") || res.headers.get("Retry-After");
    const msg = retryAfter
      ? `HuggingFace rate limit hit (429). Try again in ${retryAfter} seconds. ` +
        `Consider switching models with \`devbuddy config set hfModel <name>\`.`
      : `HuggingFace rate limit hit (429). You may have exceeded your free-tier quota. ` +
        `Try again later, switch models, or upgrade at https://huggingface.co/pricing.`;
    const err = new Error(msg);
    err.code = "RATE_LIMITED";
    err.retryAfter = retryAfter;
    throw err;
  }

  // 401/403 — auth issue
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `HuggingFace rejected your token (HTTP ${res.status}). ` +
      `Check it at https://huggingface.co/settings/tokens and re-run \`devbuddy auth set <token>\`.`
    );
  }

  // 404 — model not found
  if (res.status === 404) {
    throw new Error(
      `Model '${model}' not found or unavailable on HuggingFace. ` +
      `Try one of: ${KNOWN_MODELS.slice(0, 3).join(", ")}. ` +
      `Set a new one with \`devbuddy config set hfModel <name>\`.`
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error || errBody?.message || JSON.stringify(errBody).slice(0, 200);
    } catch {
      detail = await res.text().catch(() => "") || "(no response body)";
    }
    throw new Error(`HuggingFace API error (HTTP ${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    throw new Error("Empty response from model.");
  }
  return text.trim();
}

/**
 * complete() with simple retry on transient errors (5xx, network).
 * Does NOT retry 429 — surfaces that immediately so the user knows.
 */
export async function completeWithRetry(userPrompt, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await complete(userPrompt, opts);
    } catch (e) {
      lastErr = e;
      // Don't retry rate-limit or auth errors — surface immediately.
      if (e.code === "RATE_LIMITED") throw e;
      if (/HTTP 4\d\d/.test(e.message)) throw e;
      // Network / 5xx — retry with backoff.
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// --- Auth management ---

export function setToken(token) {
  const cfg = loadConfig();
  cfg.hfToken = token.trim();
  saveConfig(cfg);
}

export function clearToken() {
  const cfg = loadConfig();
  delete cfg.hfToken;
  saveConfig(cfg);
}

/**
 * Test the current token by hitting the whoami-v2 endpoint.
 * Returns { ok, name, type } or throws.
 */
export async function verifyToken(token) {
  const res = await fetch("https://huggingface.co/api/whoami-v2", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Token invalid (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return {
    ok: true,
    name: data.name || data.fullname || "(unknown)",
    type: data.type || "user",
  };
}
