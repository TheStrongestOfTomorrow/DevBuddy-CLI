// `devbuddy phone` — phone control management.
//
// ⚠️ EXPERIMENTAL + DANGEROUS. Lets the AI agent control your Android phone
//    via ADB (PC→phone) or Shizuku/rish (on-phone).
//
// Gating (strict):
//   1. Active provider must be Ollama (local, no data leaves your machine)
//   2. User must run `devbuddy phone enable`
//   3. All 11 phone tools are listed for review
//   4. User must type "I trust this AI" verbatim
//   5. ADB (or rish) must be available + device connected

import { loadConfig, saveConfig } from "../store.js";
import { getActiveProviderId, PROVIDERS } from "../ai/providers.js";
import { checkPhoneAvailable, PHONE_TOOL_NAMES, PHONE_TOOLS } from "../agent/phone-tools.js";
import { execSync } from "node:child_process";
import * as ui from "../ui.js";

function readLine(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf.replace(/\r?\n$/, ""));
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

const REQUIRED_PHRASE = "I trust this AI";

export function register(program) {
  const phone = program.command("phone").description("⚠️ Experimental: AI phone control via ADB/Shizuku (Ollama only).");

  phone
    .command("enable")
    .description("Enable phone control. Requires Ollama + type-to-confirm trust.")
    .option("--mode <mode>", "adb | rish (default: adb)", "adb")
    .option("--rish-path <path>", "Custom path to the rish binary (for rish mode, if not on PATH).", "")
    .action(async (opts) => {
      const cfg = loadConfig();

      // --- Gate 1: Ollama-only ---
      const providerId = getActiveProviderId();
      if (providerId !== "ollama") {
        ui.error(
          "Phone control is Ollama-only for safety.\n" +
          "  Active provider is '" + providerId + "'. Switch to Ollama first:\n" +
          "  devbuddy onboard   (pick ollama)\n" +
          "  (or) devbuddy auth switch ollama\n\n" +
          "  Why Ollama-only? Phone control sends screen content + actions to the AI.\n" +
          "  Ollama runs locally — no data leaves your machine. Cloud APIs would\n" +
          "  receive your phone screen contents, which is unsafe."
        );
        process.exit(1);
      }

      ui.title("⚠️  PHONE CONTROL — ENABLE");
      ui.blank();
      ui.warn(
        "This is a DANGEROUS feature. Once enabled, the AI agent can:\n" +
        "  - See your phone screen (screenshots)\n" +
        "  - Tap, swipe, and type on your phone\n" +
        "  - Launch apps\n" +
        "  - Run shell commands on your phone\n\n" +
        "Mode: " + opts.mode + (opts.mode === "rish" ? " (Shizuku — DevBuddy runs on the phone)" : " (ADB — DevBuddy runs on PC, phone connected via USB/WiFi)")
      );
      ui.blank();

      // --- Show all 11 tools ---
      ui.heading("tools that will be exposed to the agent");
      ui.blank();
      for (const name of PHONE_TOOL_NAMES) {
        const t = PHONE_TOOLS[name];
        const tags = [];
        if (t.confirm) tags.push("confirm");
        if (t.dangerous) tags.push("DANGEROUS");
        if (t.parallelSafe) tags.push("parallel-safe");
        const tagStr = tags.length > 0 ? " [" + tags.join(", ") + "]" : "";
        console.log("  " + ui.theme.value(name.padEnd(22)) + " " + tagStr);
        console.log("    " + ui.theme.muted(t.description.slice(0, 100)));
      }
      ui.blank();

      // --- Gate 2: check ADB/rish available ---
      ui.heading("checking phone connectivity");
      const available = checkPhoneAvailable(opts.mode, opts.rishPath || "");
      if (!available.ok) {
        ui.error(
          `Phone not accessible in '${opts.mode}' mode: ${available.error || "no device"}\n` +
          (opts.mode === "adb"
            ? "  Make sure:\n    - adb is installed (apt install adb / brew install adb)\n    - Phone has USB debugging enabled\n    - Phone is connected via USB or adb connect <ip>:5555\n    - Run 'adb devices' to verify"
            : "  Make sure:\n    - Shizuku is installed and running on the phone\n    - rish is on your PATH (Shizuku provides this)\n    - You're running DevBuddy on the phone itself (e.g. Termux)")
        );
        process.exit(1);
      }
      ui.ok(`phone accessible (${available.mode} mode${available.deviceCount ? `, ${available.deviceCount} device(s)` : ""})`);
      ui.blank();

      // --- Gate 3: type-to-confirm ---
      ui.heading("trust confirmation");
      ui.muted(`To enable, you must type this exact phrase:`);
      console.log(`    ${ui.theme.warn(REQUIRED_PHRASE)}`);
      ui.blank();
      const typed = await readLine("  type here: ");
      if (typed.trim() !== REQUIRED_PHRASE) {
        ui.error("Phrase did not match. Phone control NOT enabled.");
        ui.muted(`  (expected: "${REQUIRED_PHRASE}")`);
        process.exit(1);
      }

      // --- Enable ---
      cfg.phoneControlEnabled = true;
      cfg.phoneControlTrusted = true;
      cfg.phoneControlMode = opts.mode;
      cfg.phoneControlRishPath = opts.rishPath || "";
      cfg.phoneControlEnabledAt = new Date().toISOString();
      saveConfig(cfg);

      ui.blank();
      ui.ok("phone control ENABLED.");
      ui.blank();
      ui.muted("Next steps:");
      ui.muted("  devbuddy --phone              # launch unified REPL with phone tools");
      ui.muted("  devbuddy agent run --phone \"<task>\"   # one-shot agent with phone tools");
      ui.muted("");
      ui.muted("To disable: devbuddy phone disable");
      ui.muted("To check status: devbuddy phone status");
    });

  phone
    .command("disable")
    .description("Disable phone control.")
    .action(() => {
      const cfg = loadConfig();
      cfg.phoneControlEnabled = false;
      cfg.phoneControlTrusted = false;
      delete cfg.phoneControlEnabledAt;
      saveConfig(cfg);
      ui.ok("phone control DISABLED.");
    });

  phone
    .command("status")
    .description("Show phone control configuration + connectivity.")
    .action(() => {
      const cfg = loadConfig();
      const providerId = getActiveProviderId();

      ui.title("devbuddy phone status");
      ui.blank();
      ui.kv("enabled", cfg.phoneControlEnabled ? ui.theme.warn("yes") : "no");
      ui.kv("trusted", cfg.phoneControlTrusted ? ui.theme.warn("yes") : "no");
      ui.kv("mode", cfg.phoneControlMode || "adb");
      ui.kv("rish path", cfg.phoneControlRishPath || "(default: rish from PATH)");
      ui.kv("provider", `${PROVIDERS[providerId]?.name || providerId} ${providerId === "ollama" ? ui.theme.ok("(ollama ✓)") : ui.theme.err("(NOT ollama — phone control requires ollama)")}`);
      if (cfg.phoneControlEnabledAt) ui.kv("enabled at", cfg.phoneControlEnabledAt);

      ui.blank();
      ui.heading("connectivity check");
      const available = checkPhoneAvailable(cfg.phoneControlMode || "adb", cfg.phoneControlRishPath || "");
      if (available.ok) {
        ui.ok(`phone accessible (${available.mode})`);
      } else {
        ui.error(`phone not accessible: ${available.error || "no device"}`);
      }

      ui.blank();
      ui.muted("Subcommands: enable | disable | status | test | devices");
      if (!cfg.phoneControlEnabled) {
        ui.muted("  enable: devbuddy phone enable");
      } else {
        ui.muted("  launch: devbuddy --phone");
      }
    });

  phone
    .command("test")
    .description("Test phone connectivity (no actions performed).")
    .action(() => {
      const cfg = loadConfig();
      const mode = cfg.phoneControlMode || "adb";
      ui.muted(`testing ${mode} connectivity…`);
      const available = checkPhoneAvailable(mode, cfg.phoneControlRishPath || "");
      if (available.ok) {
        ui.ok(`✓ phone accessible (${mode})`);
        if (mode === "adb") {
          ui.muted(`  ${available.deviceCount} device(s) connected`);
        }
      } else {
        ui.error(`✗ phone not accessible: ${available.error}`);
        process.exit(1);
      }
    });

  phone
    .command("devices")
    .description("List connected devices (ADB mode).")
    .action(() => {
      const cfg = loadConfig();
      const mode = cfg.phoneControlMode || "adb";
      if (mode === "rish") {
        ui.muted("rish mode — no device list (runs locally on the phone).");
        return;
      }
      try {
        const out = execSync("adb devices -l", { encoding: "utf8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] });
        console.log(out);
      } catch (e) {
        ui.error(e.message);
      }
    });

  phone
    .command("rish-path [path]")
    .description("Set or show the custom path to the rish binary (for rish mode, when rish is not on PATH).")
    .action((path) => {
      const cfg = loadConfig();
      if (!path) {
        ui.muted("current rish path: " + (cfg.phoneControlRishPath || "(not set — uses 'rish' from PATH)"));
        ui.blank();
        ui.muted("set with: devbuddy phone rish-path /path/to/rish");
        ui.muted("clear with: devbuddy phone rish-path \"\"");
        ui.muted("");
        ui.muted("example locations where rish might be:");
        ui.muted("  /data/data/moe.shizuku.privileged.api/start.sh  (Shizuku rish)");
        ui.muted("  /sdcard/rish                                    (if you copied it)");
        ui.muted("  ~/rish                                          (home directory)");
        return;
      }
      cfg.phoneControlRishPath = path.trim();
      saveConfig(cfg);
      if (cfg.phoneControlRishPath) {
        ui.ok("rish path set to: " + cfg.phoneControlRishPath);
      } else {
        ui.ok("rish path cleared — will use 'rish' from PATH");
      }
    });

  phone.action(() => {
    const cfg = loadConfig();
    ui.title("devbuddy phone (experimental)");
    ui.blank();
    ui.kv("enabled", cfg.phoneControlEnabled ? ui.theme.warn("yes") : "no");
    ui.kv("mode", cfg.phoneControlMode || "adb");
    ui.blank();
    if (!cfg.phoneControlEnabled) {
      ui.muted("  Phone control is OFF. Enable with: devbuddy phone enable");
      ui.blank();
      ui.muted("  ⚠️ This feature lets the AI control your Android phone (tap, swipe,");
      ui.muted("    type, screenshot, run shell). Ollama-only for safety.");
    } else {
      ui.muted("  Phone control is ON. Launch with: devbuddy --phone");
      ui.muted("  Disable with: devbuddy phone disable");
    }
    ui.blank();
    ui.muted("Subcommands: enable | disable | status | test | devices");
  });
}
