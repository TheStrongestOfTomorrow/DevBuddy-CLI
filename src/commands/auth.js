// `devbuddy auth` — manage API keys and custom providers across all providers.

import { PROVIDERS, PROVIDER_IDS, getActiveProvider, getActiveProviderId, getActiveKey, verifyActiveProvider, fetchProviderModels } from "../ai/providers.js";
import { loadConfig, setProviderKey, setActiveProvider, setProviderModel, saveConfig, addCustomProvider, removeCustomProvider, getCustomProviders, setNamedKey, getNamedKeys, removeNamedKey, selectNamedKey } from "../store.js";
import * as ui from "../ui.js";

function mask(token) {
  if (!token) return "(not set)";
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "…" + token.slice(-4);
}

export function register(program) {
  const auth = program.command("auth").description("Manage API keys and custom providers across all providers.");

  auth
    .command("set <key>")
    .description("Set the API key for the active provider. (Use `devbuddy onboard` to switch providers.)")
    .option("-p, --provider <id>", "Set key for a different provider (and make it active).")
    .option("--no-verify", "Skip the connection test before saving.")
    .action(async (key, opts) => {
      key = (key || "").trim();
      if (!key) { ui.error("key is required"); process.exit(1); }

      let providerId = opts.provider || getActiveProviderId();
      if (!PROVIDERS[providerId]) {
        ui.error(`unknown provider '${providerId}'. valid: ${PROVIDER_IDS.join(", ")}`);
        process.exit(1);
      }
      const provider = PROVIDERS[providerId];

      if (opts.provider) setActiveProvider(providerId);
      setProviderKey(providerId, key);
      ui.ok(`key saved for ${provider.name} (now active).`);

      if (opts.verify !== false && providerId !== "ollama") {
        const spinner = new ui.Spinner("Verifying");
        spinner.start();
        try {
          await verifyActiveProvider();
          spinner.succeed("connection verified.");
        } catch (e) {
          spinner.fail();
          ui.warn(`could not verify: ${e.message}`);
          ui.muted("key still saved. try `devbuddy ask \"hi\"` to test.");
        }
      }
    });

  auth
    .command("add <provider> <key>")
    .description("Add an API key for another provider (without making it active).")
    .option("--model <name>", "Also set the model for this provider.")
    .option("--switch", "Switch active provider to this one after adding.")
    .action(async (provider, key, opts) => {
      if (!PROVIDERS[provider]) {
        ui.error(`unknown provider '${provider}'. valid: ${PROVIDER_IDS.join(", ")}`);
        process.exit(1);
      }
      key = (key || "").trim();
      if (!key) { ui.error("key is required"); process.exit(1); }
      setProviderKey(provider, key);
      if (opts.model) setProviderModel(provider, opts.model);
      if (opts.switch) setActiveProvider(provider);
      ui.ok(`key added for ${PROVIDERS[provider].name}.`);
      if (opts.switch) ui.muted(`  (now active)`);
      else ui.muted(`  switch with: devbuddy auth switch ${provider}`);
    });

  // --- Subcommands for Named Keys ---
  const keyCmd = auth.command("key").description("Manage named API keys.");

  keyCmd
    .command("add <name> <key>")
    .description("Save a named API key.")
    .option("-p, --provider <id>", "Associate key with a provider.")
    .option("--select", "Select this key as the active key immediately.")
    .action((name, key, opts) => {
      name = (name || "").trim();
      key = (key || "").trim();
      if (!name || !key) {
        ui.error("Name and key are required.");
        process.exit(1);
      }
      setNamedKey(name, key, opts.provider || null);
      ui.ok(`Saved named key '${name}'${opts.provider ? ` (${opts.provider})` : ""}.`);
      if (opts.select) {
        selectNamedKey(name);
        ui.muted(`  Selected '${name}' as active key.`);
      }
    });

  keyCmd
    .command("list")
    .description("List saved named API keys.")
    .action(() => {
      const keys = getNamedKeys();
      const cfg = loadConfig();
      ui.title("Named API Keys");
      ui.blank();
      const entries = Object.entries(keys);
      if (entries.length === 0) {
        ui.muted("No named API keys saved.");
        ui.muted("Add one with: devbuddy auth key add <name> <key> [-p <provider>]");
        return;
      }
      for (const [name, kObj] of entries) {
        const mark = name === cfg.activeKeyName ? ui.theme.ok("→") : " ";
        const provTag = kObj.provider ? ui.theme.muted(`[${kObj.provider}]`) : "";
        console.log(`  ${mark} ${ui.theme.value(name.padEnd(16))} ${mask(kObj.key)} ${provTag}`);
      }
      ui.blank();
      ui.muted("Select key with: devbuddy auth key select <name>");
    });

  keyCmd
    .command("select <name>")
    .description("Select a named API key to use as active key.")
    .action((name) => {
      try {
        selectNamedKey(name);
        ui.ok(`Active key set to named key '${name}'.`);
      } catch (e) {
        ui.error(e.message);
        process.exit(1);
      }
    });

  keyCmd
    .command("remove <name>")
    .description("Remove a saved named API key.")
    .action((name) => {
      if (removeNamedKey(name)) {
        ui.ok(`Removed named key '${name}'.`);
      } else {
        ui.warn(`Named key '${name}' not found.`);
      }
    });

  // --- Subcommands for Custom Providers ---
  const providerCmd = auth.command("provider").description("Manage custom API providers.");

  providerCmd
    .command("add <id>")
    .description("Add a new custom API provider.")
    .requiredOption("--base-url <url>", "Base URL for the provider API endpoint.")
    .option("--name <name>", "Display name for the custom provider.")
    .option("--type <type>", "Connection type: openai_chat, openai_completions, openai_responses, anthropic_messages", "openai_chat")
    .option("--model <model>", "Default model ID for this provider", "default")
    .option("--notes <notes>", "Description or notes for this provider")
    .action((id, opts) => {
      const prov = addCustomProvider({
        id,
        name: opts.name || id,
        type: opts.type,
        baseUrl: opts.baseUrl,
        defaultModel: opts.model,
        notes: opts.notes,
      });
      ui.ok(`Added custom provider '${prov.name}' (${prov.id}).`);
      ui.muted(`  Base URL: ${prov.baseUrl}`);
      ui.muted(`  Type: ${prov.type}`);
      ui.muted(`  Default Model: ${prov.defaultModel}`);
      ui.muted(`  Switch to it with: devbuddy auth switch ${prov.id}`);
    });

  providerCmd
    .command("list")
    .description("List custom API providers.")
    .action(() => {
      const custom = getCustomProviders();
      ui.title("Custom API Providers");
      ui.blank();
      const entries = Object.entries(custom);
      if (entries.length === 0) {
        ui.muted("No custom providers configured.");
        ui.muted("Add one with: devbuddy auth provider add <id> --base-url <url>");
        return;
      }
      for (const [id, p] of entries) {
        console.log(`  ${ui.theme.ok("•")} ${ui.theme.value(p.name)} (${id})`);
        ui.muted(`      Base URL: ${p.baseUrl}`);
        ui.muted(`      Type: ${p.type}  |  Default Model: ${p.defaultModel}`);
      }
    });

  providerCmd
    .command("remove <id>")
    .description("Remove a custom API provider.")
    .action((id) => {
      if (removeCustomProvider(id)) {
        ui.ok(`Removed custom provider '${id}'.`);
      } else {
        ui.warn(`Custom provider '${id}' not found.`);
      }
    });

  auth
    .command("switch <provider>")
    .description("Switch the active provider without re-onboarding.")
    .option("--model <name>", "Also change the model for this provider.")
    .action((provider, opts) => {
      if (!PROVIDERS[provider]) {
        ui.error(`unknown provider '${provider}'. valid: ${PROVIDER_IDS.join(", ")}`);
        process.exit(1);
      }
      const cfg = loadConfig();
      if (!cfg.providers?.[provider]?.apiKey && provider !== "ollama" && !cfg.activeKeyName) {
        ui.error(`no key set for ${PROVIDERS[provider].name}.`);
        ui.muted(`  add one with: devbuddy auth add ${provider} <key>`);
        process.exit(1);
      }
      setActiveProvider(provider);
      if (opts.model) setProviderModel(provider, opts.model);
      ui.ok(`active provider: ${PROVIDERS[provider].name}`);
      const m = opts.model || cfg.providers?.[provider]?.model || PROVIDERS[provider].defaultModel;
      ui.muted(`  model: ${m}`);
    });

  auth
    .command("model [name]")
    .description("Set or show the active provider's model. Pass any model ID — doesn't have to be in the known list.")
    .action(async (name) => {
      const cfg = loadConfig();
      const activeId = getActiveProviderId();
      if (!cfg.provider) {
        ui.error("no active provider. run `devbuddy onboard` first.");
        process.exit(1);
      }
      const current = cfg.providers?.[activeId]?.model || PROVIDERS[activeId].defaultModel;
      if (!name) {
        ui.muted(`current model: ${current}`);
        ui.muted(`  provider: ${PROVIDERS[activeId].name} (${activeId})`);
        ui.blank();
        ui.muted(`fetching known/available models for ${PROVIDERS[activeId].name}...`);
        const knownModels = await fetchProviderModels(activeId);
        for (const m of knownModels) {
          const mark = m === current ? ui.theme.ok("→") : " ";
          console.log(`  ${mark} ${m}`);
        }
        ui.blank();
        ui.muted(`change with: devbuddy auth model <any-model-id>`);
        return;
      }
      setProviderModel(activeId, name);
      ui.ok(`model set to: ${name}`);
      ui.muted(`  provider: ${PROVIDERS[activeId].name}`);
    });

  auth
    .command("status")
    .description("Show active provider, key (masked), and model.")
    .action(() => {
      const cfg = loadConfig();
      const provider = getActiveProvider();
      const key = getActiveKey();
      ui.title("devbuddy auth status");
      ui.blank();
      ui.kv("active provider", `${provider.name} (${cfg.provider || "huggingface"})`);
      if (cfg.activeKeyName) {
        ui.kv("active named key", `${cfg.activeKeyName} (${mask(key)})`);
      } else {
        ui.kv("api key", mask(key));
      }
      ui.kv("model", cfg.providers?.[cfg.provider]?.model || provider.defaultModel);
      ui.kv("onboarded", cfg.onboardingComplete ? ui.theme.ok("yes") : ui.theme.warn("no — run `devbuddy onboard`"));
      ui.blank();
      ui.muted("Stored keys (all providers):");
      for (const id of PROVIDER_IDS) {
        const k = cfg.providers?.[id]?.apiKey;
        if (k) {
          const mark = id === cfg.provider ? ui.theme.ok("→") : " ";
          console.log(`  ${mark} ${id}: ${mask(k)}`);
        }
      }
      ui.blank();
      ui.muted("Switch: `devbuddy onboard --force`  |  Add key: `devbuddy auth set <key> --provider <id>`");
    });

  auth
    .command("providers")
    .description("List all supported providers.")
    .action(() => {
      const cfg = loadConfig();
      const active = cfg.provider;
      ui.title("supported providers");
      ui.blank();
      for (const id of PROVIDER_IDS) {
        const p = PROVIDERS[id];
        const mark = id === active ? ui.theme.ok("→") : " ";
        const hasKey = cfg.providers?.[id]?.apiKey ? ui.theme.ok("✓") : ui.theme.muted("·");
        const tag = p.free ? ui.theme.ok("(free)") : p.isCustom ? ui.theme.accent("(custom)") : ui.theme.muted("(paid)");
        console.log(`  ${mark} ${hasKey} ${ui.theme.value(id.padEnd(16))} ${tag} ${p.name}`);
        ui.muted(`        ${p.notes}`);
      }
      ui.blank();
      ui.muted("Switch: devbuddy onboard --force   |   Add custom: devbuddy auth provider add <id>");
    });

  auth
    .command("clear [provider]")
    .description("Remove the API key for a provider (default: active).")
    .action((providerId) => {
      const cfg = loadConfig();
      const id = providerId || cfg.provider;
      if (!cfg.providers || !cfg.providers[id]) {
        ui.warn(`no key set for ${id}.`);
        return;
      }
      delete cfg.providers[id].apiKey;
      if (Object.keys(cfg.providers[id]).length === 0) delete cfg.providers[id];
      saveConfig(cfg);
      ui.ok(`key cleared for ${id}.`);
    });

  auth.action(() => {
    const cfg = loadConfig();
    const provider = getActiveProvider();
    const key = getActiveKey();
    ui.title("devbuddy auth");
    ui.blank();
    if (!cfg.onboardingComplete) {
      ui.warn("Not onboarded yet.");
      ui.blank();
      ui.muted("  Run: devbuddy onboard   (interactive setup, ~1 min)");
      ui.blank();
    }
    ui.kv("active provider", `${provider.name} (${cfg.provider || "huggingface"})`);
    ui.kv("api key", mask(key));
    ui.kv("model", cfg.providers?.[cfg.provider]?.model || provider.defaultModel);
    ui.blank();
    ui.muted("Subcommands: set | status | providers | clear | key | provider | switch | model");
  });
}
