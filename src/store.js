// Persistent config + todos storage under ~/.devbuddy/
// Plain JSON files, no external deps.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { APP_DIR, CONFIG_FILE, TODOS_FILE } from "./ui.js";

function ensureDir() {
  if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
}

// --- Config schema ---
const DEFAULT_CONFIG = {
  // Onboarding state
  onboardingComplete: false,
  onboardedAt: null,

  // Active provider + per-provider config
  provider: null,                // 'huggingface' | 'openai' | ... or custom provider ID
  providers: {},                 // { huggingface: { apiKey, model }, openai: { ... }, ... }

  // Custom Providers
  customProviders: {},           // { "custom-local": { id, name, type, baseUrl, defaultModel, notes } }

  // Named API Keys
  namedKeys: {},                 // { "key-name": { name, key, provider } }
  activeKeyName: null,

  // Output preferences
  language: "en",
  translateTo: "en",
  summarizeStyle: "bullets",

  // Theme: 'dark' (default) | 'light' | 'auto'
  theme: "dark",

  // Agent
  agentEnabled: false,           // master toggle for agentic mode
  agentMaxSteps: 20,
  agentYolo: false,              // skip confirms (DANGEROUS)

  // Streaming
  stream: true,                  // stream AI responses by default

  // Auto-update: 'off' | 'prompt' (default) | 'silent'
  autoUpdate: "prompt",
  lastUpdateCheck: null,

  // Experimental features (gated)
  experimentalRemoteAI: false,   // SSH / Claude Desktop remote connector
  experimentalActAsMcp: false,   // run devbuddy as an MCP server
  experimentalCommandGuard: false, // dry-run preview command execution
  experimentalCustomEndpoints: false, // raw raw custom endpoint overrides

  // Phone control (experimental, Ollama-only, strict trust gate)
  phoneControlEnabled: false,    // master toggle
  phoneControlTrusted: false,    // user typed "I trust this AI"
  phoneControlMode: "adb",       // 'adb' (PC→phone) | 'rish' (on-phone Shizuku)
  phoneControlEnabledAt: null,   // timestamp
  phoneControlRishPath: "",      // custom path to rish binary (default: empty = use 'rish' from PATH)

  createdAt: null,
};

function migrateV2ToV3(cfg) {
  if (cfg.hfToken || cfg.hfModel || cfg.hfBaseUrl) {
    if (!cfg.providers) cfg.providers = {};
    if (!cfg.providers.huggingface) cfg.providers.huggingface = {};
    if (cfg.hfToken) {
      cfg.providers.huggingface.apiKey = cfg.hfToken;
      delete cfg.hfToken;
    }
    if (cfg.hfModel) {
      cfg.providers.huggingface.model = cfg.hfModel;
      delete cfg.hfModel;
    }
    if (cfg.hfBaseUrl) {
      cfg.providers.huggingface.baseUrl = cfg.hfBaseUrl;
      delete cfg.hfBaseUrl;
    }
    if (!cfg.provider) cfg.provider = "huggingface";
    if (!cfg.onboardingComplete && cfg.providers.huggingface.apiKey) {
      cfg.onboardingComplete = true;
      cfg.onboardedAt = new Date().toISOString();
    }
  }
  return cfg;
}

export function loadConfig() {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    const init = { ...DEFAULT_CONFIG, createdAt: new Date().toISOString() };
    writeFileSync(CONFIG_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    let parsed = JSON.parse(raw);
    parsed = migrateV2ToV3(parsed);
    return { ...DEFAULT_CONFIG, ...parsed, providers: { ...DEFAULT_CONFIG.providers, ...parsed.providers }, customProviders: { ...parsed.customProviders }, namedKeys: { ...parsed.namedKeys } };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function setConfigKey(key, value) {
  const cfg = loadConfig();
  if (value === "true") value = true;
  else if (value === "false") value = false;
  else if (/^-?\d+$/.test(value)) value = Number(value);
  cfg[key] = value;
  saveConfig(cfg);
  return cfg;
}

export function getConfigKey(key) {
  const cfg = loadConfig();
  return key in cfg ? cfg[key] : undefined;
}

// --- Provider-scoped setters ---

export function setProviderKey(providerId, apiKey) {
  const cfg = loadConfig();
  if (!cfg.providers) cfg.providers = {};
  if (!cfg.providers[providerId]) cfg.providers[providerId] = {};
  cfg.providers[providerId].apiKey = apiKey;
  saveConfig(cfg);
  return cfg;
}

export function setProviderModel(providerId, model) {
  const cfg = loadConfig();
  if (!cfg.providers) cfg.providers = {};
  if (!cfg.providers[providerId]) cfg.providers[providerId] = {};
  cfg.providers[providerId].model = model;
  saveConfig(cfg);
  return cfg;
}

export function setActiveProvider(providerId) {
  const cfg = loadConfig();
  cfg.provider = providerId;
  saveConfig(cfg);
  return cfg;
}

// --- Custom Providers ---

export function getCustomProviders() {
  const cfg = loadConfig();
  return cfg.customProviders || {};
}

export function addCustomProvider(prov) {
  const cfg = loadConfig();
  if (!cfg.customProviders) cfg.customProviders = {};
  const id = prov.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  cfg.customProviders[id] = {
    id,
    name: prov.name || id,
    type: prov.type || "openai_chat",
    baseUrl: prov.baseUrl.replace(/\/+$/, ""),
    defaultModel: prov.defaultModel || "default",
    models: prov.models || [prov.defaultModel || "default"],
    notes: prov.notes || "Custom user provider",
    isCustom: true,
  };
  saveConfig(cfg);
  return cfg.customProviders[id];
}

export function removeCustomProvider(id) {
  const cfg = loadConfig();
  if (cfg.customProviders && cfg.customProviders[id]) {
    delete cfg.customProviders[id];
    if (cfg.provider === id) {
      cfg.provider = "huggingface";
    }
    saveConfig(cfg);
    return true;
  }
  return false;
}

// --- Named Keys ---

export function getNamedKeys() {
  const cfg = loadConfig();
  return cfg.namedKeys || {};
}

export function setNamedKey(name, key, provider) {
  const cfg = loadConfig();
  if (!cfg.namedKeys) cfg.namedKeys = {};
  cfg.namedKeys[name] = { name, key, provider };
  saveConfig(cfg);
  return cfg.namedKeys[name];
}

export function removeNamedKey(name) {
  const cfg = loadConfig();
  if (cfg.namedKeys && cfg.namedKeys[name]) {
    delete cfg.namedKeys[name];
    if (cfg.activeKeyName === name) {
      cfg.activeKeyName = null;
    }
    saveConfig(cfg);
    return true;
  }
  return false;
}

export function selectNamedKey(name) {
  const cfg = loadConfig();
  if (name && (!cfg.namedKeys || !cfg.namedKeys[name])) {
    throw new Error(`Named key '${name}' does not exist.`);
  }
  cfg.activeKeyName = name || null;
  if (name) {
    const kObj = cfg.namedKeys[name];
    if (kObj.provider) {
      cfg.provider = kObj.provider;
      if (!cfg.providers) cfg.providers = {};
      if (!cfg.providers[kObj.provider]) cfg.providers[kObj.provider] = {};
      cfg.providers[kObj.provider].apiKey = kObj.key;
    }
  }
  saveConfig(cfg);
  return cfg;
}

export function markOnboarded() {
  const cfg = loadConfig();
  cfg.onboardingComplete = true;
  cfg.onboardedAt = new Date().toISOString();
  saveConfig(cfg);
  return cfg;
}

// --- Todos ---
export function loadTodos() {
  ensureDir();
  if (!existsSync(TODOS_FILE)) return [];
  try {
    const raw = readFileSync(TODOS_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveTodos(todos) {
  ensureDir();
  writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2));
}
