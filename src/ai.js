// Thin wrapper around z-ai-web-dev-sdk for chat completions.
// Single shared instance, retry, error handling.

import ZAI from "z-ai-web-dev-sdk";

let _zai = null;

export async function getClient() {
  if (!_zai) {
    _zai = await ZAI.create();
  }
  return _zai;
}

/**
 * Run a single-turn chat completion.
 * @param {string} userPrompt
 * @param {object} opts
 * @param {string} [opts.system]   system/assistant prompt
 * @param {boolean} [opts.thinking] enable chain-of-thought
 * @returns {Promise<string>} assistant text
 */
export async function complete(userPrompt, opts = {}) {
  const zai = await getClient();
  const messages = [];
  if (opts.system) {
    messages.push({ role: "assistant", content: opts.system });
  }
  messages.push({ role: "user", content: userPrompt });

  const res = await zai.chat.completions.create({
    messages,
    stream: false,
    thinking: { type: opts.thinking ? "enabled" : "disabled" },
  });

  const text = res?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    throw new Error("Empty response from model.");
  }
  return text.trim();
}

/**
 * Same as complete() but with retry on transient errors.
 */
export async function completeWithRetry(userPrompt, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await complete(userPrompt, opts);
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}
