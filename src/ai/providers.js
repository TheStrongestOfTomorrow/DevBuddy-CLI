// Provider abstraction layer.
//
// Design: one OpenAI-compatible adapter covers most providers (HF, OpenAI,
// Groq, OpenRouter, Together, Mistral, Ollama). Native adapters for Anthropic
// and Cohere (their APIs are not OpenAI-compatible).
//
// Inspired by: OpenClaude (minimal agent core), Hermes (provider abstraction),
// but stripped down to ~300 lines instead of thousands.

import * as ui from "../ui.js";
import { loadConfig } from "../store.js";

// --- Provider registry -----------------------------------------------------

export const PROVIDERS = {
  huggingface: {
    id: "huggingface",
    name: "HuggingFace",
    type: "openai",
    baseUrl: "https://router.huggingface.co/v1",
    defaultModel: "mistralai/Mistral-7B-Instruct-v0.3",
    envVar: "HF_TOKEN",
    free: true,
    getKeyUrl: "https://huggingface.co/settings/tokens",
    signupUrl: "https://huggingface.co/join",
    models: [
      "mistralai/Mistral-7B-Instruct-v0.3",
      "meta-llama/Meta-Llama-3-8B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "HuggingFaceH4/zephyr-7b-beta",
      "google/gemma-2-2b-it",
    ],
    notes: "Free tier (~1000 req/month). Models may take 10-30s to warm up.",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    envVar: "OPENAI_API_KEY",
    free: false,
    getKeyUrl: "https://platform.openai.com/api-keys",
    signupUrl: "https://platform.openai.com/signup",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "o1-mini", "o1"],
    notes: "Pay-as-you-go (~$0.15/M in, $0.60/M out for gpt-4o-mini).",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-20241022",
    envVar: "ANTHROPIC_API_KEY",
    free: false,
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    signupUrl: "https://console.anthropic.com/",
    models: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    notes: "Excellent for code. ~$3/M in, $15/M out for sonnet.",
  },
  groq: {
    id: "groq",
    name: "Groq",
    type: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    envVar: "GROQ_API_KEY",
    free: true,
    getKeyUrl: "https://console.groq.com/keys",
    signupUrl: "https://console.groq.com/",
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    notes: "FREE tier, ultra-fast inference (500+ tok/s).",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    type: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    envVar: "OPENROUTER_API_KEY",
    free: false,
    getKeyUrl: "https://openrouter.ai/keys",
    signupUrl: "https://openrouter.ai/",
    models: [
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-flash-1.5",
      "meta-llama/llama-3.3-70b-instruct:free",
    ],
    notes: "One key, 200+ models. Some free models available.",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (local)",
    type: "openai",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    envVar: "OLLAMA_API_KEY",
    free: true,
    getKeyUrl: "https://ollama.com/download",
    signupUrl: "https://ollama.com/download",
    models: ["llama3.2", "qwen2.5:7b", "mistral:7b", "phi3:mini", "gemma2:2b"],
    notes: "Runs locally, fully free, no internet. Install from ollama.com.",
  },
  together: {
    id: "together",
    name: "Together AI",
    type: "openai",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    envVar: "TOGETHER_API_KEY",
    free: true,
    getKeyUrl: "https://api.together.ai/settings/api-keys",
    signupUrl: "https://api.together.ai/",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "Qwen/Qwen2.5-7B-Instruct-Turbo",
    ],
    notes: "Free tier with Llama-3.3-70B. $5 free credits on signup.",
  },
  mistral: {
    id: "mistral",
    name: "Mistral La Plateforme",
    type: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    envVar: "MISTRAL_API_KEY",
    free: false,
    getKeyUrl: "https://console.mistral.ai/api-keys/",
    signupUrl: "https://console.mistral.ai/",
    models: ["mistral-small-latest", "mistral-large-latest", "mistral-tiny"],
    notes: "Official Mistral API. Free experimentation tier available.",
  },
  cohere: {
    id: "cohere",
    name: "Cohere",
    type: "cohere",
    baseUrl: "https://api.cohere.com/v2",
    defaultModel: "command-r-plus",
    envVar: "COHERE_API_KEY",
    free: false,
    getKeyUrl: "https://dashboard.cohere.com/api-keys",
    signupUrl: "https://dashboard.cohere.com/",
    models: ["command-r-plus", "command-r", "command-r-08-2024"],
    notes: "Strong on RAG. Free trial keys available.",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

// --- Config helpers --------------------------------------------------------

export function getActiveProviderId() {
  const cfg = loadConfig();
  return cfg.provider || "huggingface";
}

export function getActiveProvider() {
  return PROVIDERS[getActiveProviderId()] || PROVIDERS.huggingface;
}

export function getActiveKey() {
  const cfg = loadConfig();
  const provider = getActiveProvider();
  const id = getActiveProviderId();
  const stored = cfg.providers && cfg.providers[id] && cfg.providers[id].apiKey;
  // Ollama runs locally and typically needs no API key.
  // Use a dummy bearer so the Authorization header is present (some HTTP
  // libraries reject requests without it).
  if (id === "ollama") return stored || "ollama";
  return stored || process.env[provider.envVar] || "";
}

export function getActiveModel() {
  const cfg = loadConfig();
  const id = getActiveProviderId();
  if (cfg.providers && cfg.providers[id] && cfg.providers[id].model) {
    return cfg.providers[id].model;
  }
  return getActiveProvider().defaultModel;
}

export function isAuthenticated() {
  const id = getActiveProviderId();
  // Ollama never requires a key — it runs locally.
  if (id === "ollama") return true;
  return Boolean(getActiveKey());
}

export function isOnboarded() {
  const cfg = loadConfig();
  return Boolean(cfg.onboardingComplete) && Boolean(cfg.provider);
}

// --- Chat completion dispatch ----------------------------------------------

/**
 * Run a single-turn chat completion against the active provider.
 */
export async function complete(userPrompt, opts = {}) {
  const provider = getActiveProvider();
  const key = getActiveKey();
  const model = opts.model || getActiveModel();

  if (!key && provider.id !== "ollama") {
    throw new Error(
      `No API key configured for ${provider.name}.\n` +
      `  Get one at: ${provider.getKeyUrl}\n` +
      `  Then run: devbuddy onboard   (or)   devbuddy auth set <key>`
    );
  }

  const messages = opts.messages
    ? opts.messages
    : [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: userPrompt },
      ];

  switch (provider.type) {
    case "openai":
      return _openaiComplete(provider, key, model, messages, opts);
    case "anthropic":
      return _anthropicComplete(provider, key, model, messages, opts);
    case "cohere":
      return _cohereComplete(provider, key, model, messages, opts);
    default:
      throw new Error(`Unknown provider type: ${provider.type}`);
  }
}

async function _openaiComplete(provider, key, model, messages, opts) {
  const url = provider.baseUrl + "/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (provider.id === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI";
    headers["X-Title"] = "DevBuddy-CLI";
  }
  const body = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  };
  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return _handleOpenAIResponse(res, provider, model);
}

async function _handleOpenAIResponse(res, provider, model) {
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after") || res.headers.get("Retry-After");
    const err = new Error(
      retryAfter
        ? `${provider.name} rate limit hit (429). Try again in ${retryAfter}s.`
        : `${provider.name} rate limit hit (429). Try again later or switch models.`
    );
    err.code = "RATE_LIMITED";
    err.retryAfter = retryAfter;
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${provider.name} rejected your API key (HTTP ${res.status}). ` +
      `Check at ${provider.getKeyUrl} and re-run \`devbuddy onboard\` or \`devbuddy auth set <key>\`.`
    );
  }
  if (res.status === 404) {
    throw new Error(
      `Model '${model}' not found on ${provider.name}. ` +
      `Try one of: ${(provider.models || []).slice(0, 3).join(", ")}.`
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || errBody?.error || errBody?.message || JSON.stringify(errBody).slice(0, 200);
    } catch {
      detail = (await res.text().catch(() => "")) || "(no response body)";
    }
    throw new Error(`${provider.name} API error (HTTP ${res.status}): ${detail}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error("Empty response from model.");
  return text.trim();
}

async function _anthropicComplete(provider, key, model, messages, opts) {
  const url = provider.baseUrl + "/v1/messages";
  let system = "";
  const filtered = [];
  for (const m of messages) {
    if (m.role === "system") system = (system ? system + "\n\n" : "") + m.content;
    else filtered.push({ role: m.role, content: m.content });
  }
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  const body = {
    model,
    messages: filtered,
    max_tokens: opts.maxTokens ?? 1024,
    ...(system ? { system } : {}),
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
  };
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 429) {
    const err = new Error(`Anthropic rate limit hit (429). Try again later.`);
    err.code = "RATE_LIMITED";
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Anthropic rejected your API key (HTTP ${res.status}). Check at ${provider.getKeyUrl}.`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || JSON.stringify(errBody).slice(0, 200);
    } catch {
      detail = (await res.text().catch(() => "")) || "(no response body)";
    }
    throw new Error(`Anthropic API error (HTTP ${res.status}): ${detail}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text || !text.trim()) throw new Error("Empty response from Anthropic.");
  return text.trim();
}

async function _cohereComplete(provider, key, model, messages, opts) {
  const url = provider.baseUrl + "/chat";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  const body = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
  };
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 429) {
    const err = new Error(`Cohere rate limit hit (429). Try again later.`);
    err.code = "RATE_LIMITED";
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Cohere rejected your API key (HTTP ${res.status}). Check at ${provider.getKeyUrl}.`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.message || JSON.stringify(errBody).slice(0, 200);
    } catch {
      detail = (await res.text().catch(() => "")) || "(no response body)";
    }
    throw new Error(`Cohere API error (HTTP ${res.status}): ${detail}`);
  }
  const data = await res.json();
  const text = data?.message?.content?.[0]?.text || data?.text;
  if (!text || !text.trim()) throw new Error("Empty response from Cohere.");
  return text.trim();
}

export async function completeWithRetry(userPrompt, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await complete(userPrompt, opts);
    } catch (e) {
      lastErr = e;
      if (e.code === "RATE_LIMITED") throw e;
      if (/HTTP 4\d\d/.test(e.message)) throw e;
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Stream a chat completion. Calls opts.onToken(text) for each chunk.
 * Falls back to non-streaming + simulated chunking for providers that
 * don't support SSE streaming.
 * @returns {Promise<string>} full text
 */
export async function completeStream(userPrompt, opts = {}) {
  const provider = getActiveProvider();
  const key = getActiveKey();
  const model = opts.model || getActiveModel();
  const onToken = opts.onToken || (() => {});

  if (!key && provider.id !== "ollama") {
    throw new Error(
      `No API key configured for ${provider.name}.\n` +
      `  Get one at: ${provider.getKeyUrl}\n` +
      `  Then run: devbuddy onboard   (or)   devbuddy auth set <key>`
    );
  }

  // For now, all providers use the OpenAI-compatible streaming format
  // (Anthropic and Cohere fall back to non-streaming + simulated chunking).
  if (provider.type === "anthropic" || provider.type === "cohere") {
    // Fallback: get full response, then emit in chunks
    const full = await complete(userPrompt, opts);
    const words = full.split(/(\s+)/);
    for (const w of words) {
      onToken(w);
      await new Promise((r) => setTimeout(r, 10));
    }
    return full;
  }

  // OpenAI-compatible streaming
  const messages = opts.messages
    ? opts.messages
    : [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: userPrompt },
      ];

  const url = provider.baseUrl + "/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (provider.id === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI";
    headers["X-Title"] = "DevBuddy-CLI";
  }
  const body = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    stream: true,
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const err = new Error(
      retryAfter
        ? `${provider.name} rate limit hit (429). Try again in ${retryAfter}s.`
        : `${provider.name} rate limit hit (429). Try again later.`
    );
    err.code = "RATE_LIMITED";
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${provider.name} rejected your API key (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(`${provider.name} API error (HTTP ${res.status})`);
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {}
    }
  }
  return full;
}

let _warnedThisSession = false;
export function warnRateLimit(force = false) {
  if (_warnedThisSession && !force) return;
  _warnedThisSession = true;
  const p = getActiveProvider();
  if (p.free) {
    ui.warn(
      `${p.name} free tier is rate-limited. If you hit 429 errors, ` +
      `switch providers via \`devbuddy onboard\` or models via \`devbuddy config set model <name>\`.`
    );
  }
}

export async function verifyActiveProvider() {
  const provider = getActiveProvider();
  const key = getActiveKey();
  if (!key && provider.id !== "ollama") {
    throw new Error(`No API key set for ${provider.name}.`);
  }
  const reply = await complete("Reply with just: OK", { maxTokens: 8, temperature: 0 });
  return { ok: true, reply };
}
