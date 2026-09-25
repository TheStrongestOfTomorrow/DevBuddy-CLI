// `devbuddy auth benchmark` — benchmark response latency across providers and named keys.

import { PROVIDERS, PROVIDER_IDS, complete } from "../ai/providers.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("benchmark")
    .description("Benchmark latency and token response times across configured providers.")
    .action(async () => {
      const cfg = loadConfig();
      ui.banner("DevBuddy Provider Benchmark", "Testing connection latency and response time across providers...");

      const configuredProviders = [];
      for (const id of PROVIDER_IDS) {
        const p = PROVIDERS[id];
        const key = cfg.providers?.[id]?.apiKey || (p.envVar ? process.env[p.envVar] : null);
        if (key || id === "ollama") {
          configuredProviders.push({ id, provider: p, key });
        }
      }

      if (configuredProviders.length === 0) {
        ui.warn("No configured providers found with API keys.");
        ui.muted("Run `devbuddy onboard` or `devbuddy auth set <key>` to set up providers.");
        return;
      }

      const promptText = "Say 'OK' and nothing else.";

      for (const { id, provider } of configuredProviders) {
        const spinner = new ui.Spinner(`Testing ${provider.name} (${id})`);
        spinner.start();
        const start = Date.now();
        try {
          const reply = await complete(promptText, {
            provider: id,
            model: cfg.providers?.[id]?.model || provider.defaultModel,
            maxTokens: 10,
            temperature: 0,
          });
          const latency = Date.now() - start;
          spinner.succeed(`${provider.name.padEnd(20)} ${ui.theme.ok(`${latency}ms`)} → "${reply.trim().slice(0, 30)}"`);
        } catch (e) {
          spinner.fail(`${provider.name.padEnd(20)} ${ui.theme.err("FAILED")} → ${e.message}`);
        }
      }

      ui.blank();
      ui.ok("Benchmark complete.");
    });
}
