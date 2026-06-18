// `devbuddy auth` — manage HuggingFace access token.

import { setToken, clearToken, verifyToken, getAuth, isAuthenticated, KNOWN_MODELS } from "../ai.js";
import { loadConfig, saveConfig } from "../store.js";
import * as ui from "../ui.js";

function mask(token) {
  if (!token) return "(not set)";
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "…" + token.slice(-4);
}

export function register(program) {
  const auth = program.command("auth").description("Manage your HuggingFace access token.");

  auth
    .command("set <token>")
    .description("Save your HuggingFace token. Get one at https://huggingface.co/settings/tokens")
    .option("--verify", "Verify the token works before saving (default: true).")
    .option("--no-verify", "Skip verification; save immediately.")
    .action(async (token, opts) => {
      token = (token || "").trim();
      if (!token) { ui.error("token is required"); process.exit(1); }
      if (!token.startsWith("hf_")) {
        ui.warn("Token doesn't start with 'hf_' — HuggingFace tokens usually do. Double-check it.");
      }

      // Save first so the token is available even if verification fails
      // (e.g. due to network issues or shared-IP rate limits).
      setToken(token);
      ui.ok("token saved to ~/.devbuddy/config.json");

      if (opts.verify !== false) {
        const spinner = new ui.Spinner("Verifying token");
        spinner.start();
        try {
          const info = await verifyToken(token);
          spinner.succeed(`Verified as ${info.type} '${info.name}'`);
        } catch (e) {
          spinner.fail();
          ui.warn(
            `Could not verify token: ${e?.message || e}\n` +
            "The token is still saved. If it's correct, AI commands will work — " +
            "verification may have failed due to network rate limits on this IP."
          );
        }
      }

      ui.blank();
      ui.muted("Try it now: devbuddy ask \"hello\"");
      ui.muted("Free tier reminder: HuggingFace rate-limits ~1000 req/month per user.");
    });

  auth
    .command("status")
    .description("Show whether a token is configured (does not verify it).")
    .action(() => {
      const { token, model, baseUrl } = getAuth();
      if (!token) {
        ui.warn("No token configured.");
        ui.blank();
        ui.muted("Set one with: devbuddy auth set hf_xxx");
        ui.muted("Get a free token: https://huggingface.co/settings/tokens");
        return;
      }
      ui.title("devbuddy auth status");
      ui.blank();
      ui.kv("token", mask(token));
      ui.kv("model", model);
      ui.kv("baseUrl", baseUrl);
      ui.blank();
      ui.muted("Verify it works: devbuddy auth verify");
    });

  auth
    .command("verify")
    .description("Verify the saved token by calling HuggingFace.")
    .action(async () => {
      const { token } = getAuth();
      if (!token) {
        ui.error("no token set — run `devbuddy auth set <token>` first");
        process.exit(1);
      }
      const spinner = new ui.Spinner("Verifying");
      spinner.start();
      try {
        const info = await verifyToken(token);
        spinner.succeed(`Token OK — authenticated as ${info.type} '${info.name}'`);
      } catch (e) {
        spinner.fail();
        ui.error(e?.message || String(e));
        process.exit(1);
      }
    });

  auth
    .command("clear")
    .description("Remove the saved token.")
    .action(() => {
      clearToken();
      ui.ok("token removed.");
    });

  auth
    .command("models")
    .description("List known free HuggingFace chat models.")
    .action(() => {
      const { model: current } = getAuth();
      ui.title("Known free HuggingFace chat models");
      ui.blank();
      for (const m of KNOWN_MODELS) {
        const mark = m === current ? ui.theme.ok("→") : ui.theme.muted(" ");
        console.log(`  ${mark} ${m}`);
      }
      ui.blank();
      ui.muted("Set with: devbuddy config set hfModel <name>");
      ui.muted("Browse all: https://huggingface.co/models?inference=warm&sort=trending");
    });

  auth.action(() => {
    // `devbuddy auth` with no subcommand -> status
    const { token, model, baseUrl } = getAuth();
    ui.title("devbuddy auth");
    ui.blank();
    if (!token) {
      ui.warn("No token configured.");
      ui.blank();
      ui.muted("  devbuddy auth set hf_xxx       # save your token");
      ui.muted("  devbuddy auth status           # check if a token is set");
      ui.muted("  devbuddy auth models           # list free models");
      ui.blank();
      ui.muted("Get a free token at https://huggingface.co/settings/tokens");
    } else {
      ui.kv("token", mask(token));
      ui.kv("model", model);
      ui.kv("baseUrl", baseUrl);
      ui.blank();
      ui.muted("Subcommands: set | status | verify | clear | models");
    }
  });
}
