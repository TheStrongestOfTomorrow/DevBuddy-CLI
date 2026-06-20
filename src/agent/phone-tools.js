// Phone control tools — ADB-based Android phone control.
//
// Inspired by ClosePaw (https://github.com/imoonkey/closepaw) — an open-source
// Android phone-use agent. Their toolset: mobile_action (tap/type/swipe/scroll),
// open_app, system_button, shell, screenshot.
//
// We adapt this for DevBuddy's PC→phone architecture (ADB over USB/WiFi) and
// also support Shizuku's `rish` shell when DevBuddy runs ON the phone (Termux).
//
// TWO CONTROL MODES:
//   - 'adb'  — DevBuddy on PC, phone connected via USB/WiFi. Uses `adb shell ...`.
//   - 'rish' — DevBuddy on phone (Termux + Shizuku). Uses `rish ...` (no `adb shell` prefix).
//
// ⚠️ GATED: only registered when phoneControlEnabled AND the user has confirmed
//    trust. See src/commands/phone.js for the enable flow.
//
// ⚠️ OLLAMA-ONLY for now: phone control requires the active provider to be ollama
//    (local, no data leaves your machine). This is a safety decision.

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as ui from "../ui.js";

function shellPrefix(mode, rishPath = "") {
  if (mode === "rish") {
    // Use custom rish path if set, otherwise just 'rish' (from PATH)
    const rishBin = rishPath || "rish";
    return rishBin;
  }
  return "adb shell";
}

function phoneExec(cmd, { mode = "adb", timeout = 10_000, rishPath = "" } = {}) {
  const prefix = shellPrefix(mode, rishPath);
  const fullCmd = `${prefix} ${cmd}`;
  try {
    return execSync(fullCmd, {
      encoding: "utf8",
      timeout,
      maxBuffer: 1_000_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    throw new Error(`phone command failed: ${e.stderr || e.message}`);
  }
}

export function checkPhoneAvailable(mode = "adb", rishPath = "") {
  try {
    if (mode === "rish") {
      const rishBin = rishPath || "rish";
      const out = execSync(`"${rishBin}" echo DEVBUDDY_PHONE_OK`, {
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { ok: out.includes("DEVBUDDY_PHONE_OK"), mode, error: null };
    }
    const out = execSync("adb devices", {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = out.split("\n").filter((l) => l.trim() && !l.startsWith("List of devices"));
    const devices = lines.filter((l) => l.includes("device") && !l.includes("unauthorized"));
    return { ok: devices.length > 0, mode, deviceCount: devices.length, raw: out, error: null };
  } catch (e) {
    return { ok: false, mode, error: e.message };
  }
}

export const PHONE_TOOLS = {
  phone_devices: {
    description: "List connected Android devices (ADB mode) or verify Shizuku is running (rish mode). Read-only.",
    inputSchema: { type: "object", properties: {} },
    parallelSafe: true,
    confirm: false,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      if (mode === "rish") {
        const r = checkPhoneAvailable("rish");
        return r.ok ? "Shizuku (rish) is running and accessible." : `Shizuku not available: ${r.error}`;
      }
      const out = execSync("adb devices", { encoding: "utf8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] });
      return out;
    },
  },

  phone_screenshot: {
    description: "Capture a screenshot from the phone. Saves to ./.devbuddy/phone-screenshots/<timestamp>.png. Returns the file path.",
    inputSchema: {
      type: "object",
      properties: {
        output: { type: "string", description: "Optional output path. Default: ./.devbuddy/phone-screenshots/<ts>.png" },
      },
    },
    parallelSafe: false,
    confirm: false,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const dir = join(process.cwd(), ".devbuddy", "phone-screenshots");
      mkdirSync(dir, { recursive: true });
      const outPath = args.output || join(dir, `screenshot-${ts}.png`);
      if (mode === "rish") {
        const rishBin = rishPath || "rish";
        execSync(`"${rishBin}" screencap -p > "${outPath}"`, { encoding: "utf8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"], shell: "/bin/sh" });
      } else {
        execSync(`adb exec-out screencap -p > "${outPath}"`, { encoding: "utf8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"], shell: "/bin/sh" });
      }
      return `Screenshot saved to: ${outPath}`;
    },
  },

  phone_tap: {
    description: "Tap at the given x,y coordinates on the phone screen.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate." },
        y: { type: "number", description: "Y coordinate." },
      },
      required: ["x", "y"],
    },
    parallelSafe: false,
    confirm: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      if (typeof args.x !== "number" || typeof args.y !== "number") {
        throw new Error("x and y must be numbers");
      }
      phoneExec(`input tap ${Math.floor(args.x)} ${Math.floor(args.y)}`, { mode, rishPath });
      return `Tapped at (${args.x}, ${args.y})`;
    },
  },

  phone_long_press: {
    description: "Long-press at the given x,y coordinates (1.5 second hold by default).",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        duration_ms: { type: "number", description: "Hold duration in milliseconds (default: 1500)." },
      },
      required: ["x", "y"],
    },
    parallelSafe: false,
    confirm: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const dur = Math.floor(args.duration_ms || 1500);
      phoneExec(`input swipe ${Math.floor(args.x)} ${Math.floor(args.y)} ${Math.floor(args.x)} ${Math.floor(args.y)} ${dur}`, { mode, rishPath });
      return `Long-pressed at (${args.x}, ${args.y}) for ${dur}ms`;
    },
  },

  phone_swipe: {
    description: "Swipe from (x1,y1) to (x2,y2). Optional duration_ms (default: 300).",
    inputSchema: {
      type: "object",
      properties: {
        x1: { type: "number" }, y1: { type: "number" },
        x2: { type: "number" }, y2: { type: "number" },
        duration_ms: { type: "number", description: "Duration in ms (default: 300). Higher = slower swipe." },
      },
      required: ["x1", "y1", "x2", "y2"],
    },
    parallelSafe: false,
    confirm: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const dur = Math.floor(args.duration_ms || 300);
      phoneExec(`input swipe ${Math.floor(args.x1)} ${Math.floor(args.y1)} ${Math.floor(args.x2)} ${Math.floor(args.y2)} ${dur}`, { mode, rishPath });
      return `Swiped from (${args.x1}, ${args.y1}) to (${args.x2}, ${args.y2}) over ${dur}ms`;
    },
  },

  phone_type: {
    description: "Type text into the currently focused field on the phone. Spaces are encoded as %s automatically.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to type." },
      },
      required: ["text"],
    },
    parallelSafe: false,
    confirm: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const encoded = String(args.text).replace(/ /g, "%s").replace(/["`$\\]/g, "");
      phoneExec(`input text "${encoded}"`, { mode, rishPath });
      return `Typed: ${args.text}`;
    },
  },

  phone_key: {
    description: "Send a key event to the phone. Common keys: home (3), back (4), menu (82), power (26), volume_up (24), volume_down (25), app_switch (187), enter (66), del (67).",
    inputSchema: {
      type: "object",
      properties: {
        keycode: {
          type: "string",
          description: "Either a numeric keycode (e.g. '4' for BACK) or a name (home, back, menu, power, volume_up, volume_down, app_switch, enter, del, tab, escape).",
        },
      },
      required: ["keycode"],
    },
    parallelSafe: false,
    confirm: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const keyMap = {
        home: 3, back: 4, menu: 82, power: 26,
        volume_up: 24, volume_down: 25, app_switch: 187,
        enter: 66, del: 67, tab: 61, escape: 111,
      };
      const code = keyMap[String(args.keycode).toLowerCase()] || args.keycode;
      phoneExec(`input keyevent ${code}`, { mode, rishPath });
      return `Sent key event: ${args.keycode} (${code})`;
    },
  },

  phone_launch_app: {
    description: "Launch an app by its package name (e.g. com.android.chrome). Uses 'monkey -p <pkg>'.",
    inputSchema: {
      type: "object",
      properties: {
        package: { type: "string", description: "The app's package name (e.g. com.android.chrome, com.whatsapp)." },
      },
      required: ["package"],
    },
    parallelSafe: false,
    confirm: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const pkg = String(args.package).replace(/[^a-zA-Z0-9._]/g, "");
      phoneExec(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`, { mode, rishPath });
      return `Launched app: ${pkg}`;
    },
  },

  phone_list_apps: {
    description: "List installed apps (package names) on the phone. Optional filter pattern. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Optional case-insensitive substring filter (e.g. 'chrome', 'whatsapp')." },
      },
    },
    parallelSafe: true,
    confirm: false,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      let out = phoneExec("pm list packages", { mode, rishPath, timeout: 15_000 });
      let lines = out.split("\n").map((l) => l.replace(/^package:/, "").trim()).filter(Boolean);
      if (args.filter) {
        const f = String(args.filter).toLowerCase();
        lines = lines.filter((l) => l.includes(f));
      }
      const limited = lines.slice(0, 100);
      return `${lines.length} package(s)${args.filter ? ` matching '${args.filter}'` : ""} (showing first ${limited.length}):\n${limited.join("\n")}`;
    },
  },

  phone_current_app: {
    description: "Get the currently focused/foreground app's package name. Read-only.",
    inputSchema: { type: "object", properties: {} },
    parallelSafe: true,
    confirm: false,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const out = phoneExec("dumpsys activity activities | grep mResumedActivity", { mode, rishPath, timeout: 10_000 });
      const m = out.match(/(\w[\w.]*)\/\./);
      if (m) return `Current app: ${m[1]}`;
      return out || "(could not determine current app)";
    },
  },

  phone_shell: {
    description: "Run an arbitrary shell command on the phone (via adb shell or rish). DANGEROUS — requires confirmation. 30s timeout. One command per call (no pipes/redirects). Blocks rm -rf /, dd, mkfs.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run on the phone." },
      },
      required: ["command"],
    },
    parallelSafe: false,
    confirm: true,
    dangerous: true,
    run: async (args, opts = {}) => {
      const mode = opts.phoneMode || "adb";
      const rishPath = opts.rishPath || "";
      const cmd = String(args.command);
      if (/\brm\s+-rf\s+\//.test(cmd) || /\bdd\s+if=/.test(cmd) || /\bmkfs/.test(cmd)) {
        throw new Error("Refusing to run potentially destructive command on phone.");
      }
      const out = phoneExec(cmd, { mode, rishPath, timeout: 30_000 });
      return out || "(no output)";
    },
  },
};

export const PHONE_TOOL_NAMES = Object.keys(PHONE_TOOLS);

export async function registerPhoneTools(mode = "adb", rishPath = "") {
  const { TOOLS } = await import("./tools.js");
  let count = 0;
  for (const [name, spec] of Object.entries(PHONE_TOOLS)) {
    const originalRun = spec.run;
    TOOLS[name] = {
      ...spec,
      run: async (args, opts = {}) => originalRun(args, { ...opts, phoneMode: mode, rishPath }),
    };
    count++;
  }
  return count;
}

export async function unregisterPhoneTools() {
  const { TOOLS } = await import("./tools.js");
  for (const name of PHONE_TOOL_NAMES) {
    delete TOOLS[name];
  }
}
