// Minimal UI helpers — subtle colors, clean output, no clutter.
// Inspired by ripgrep / bat / modern minimal CLIs.

import chalk from "chalk";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// --- Theme (subtle, dim accents like ripgrep) ---
const theme = {
  title: chalk.bold.cyan,
  heading: chalk.bold.white,
  muted: chalk.dim.gray,
  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
  accent: chalk.cyan,
  key: chalk.dim.cyan,
  value: chalk.white,
  bullet: chalk.dim("•"),
  arrow: chalk.dim("→"),
};

export { theme };

// Allow global disable (e.g., NO_COLOR=1, --no-color flag, or piped output)
let colorEnabled = process.stdout.isTTY && !process.env.NO_COLOR;
export function setColorEnabled(on) {
  colorEnabled = !!on;
  if (!on) {
    chalk.level = 0;
  }
}

// --- Output primitives ---
export function hr() {
  if (!colorEnabled) return;
  console.log(theme.muted("─".repeat(Math.min(60, process.stdout.columns || 60))));
}

export function title(text) {
  console.log(theme.title(text));
}

export function heading(text) {
  console.log(theme.heading(text));
}

export function muted(text) {
  console.log(theme.muted(text));
}

export function ok(text) {
  console.log(theme.ok(text));
}

export function warn(text) {
  console.log(theme.warn(text));
}

export function error(text) {
  console.error(theme.err("error") + ": " + text);
}

export function kv(k, v) {
  console.log(`  ${theme.key(k)} ${theme.arrow} ${theme.value(v)}`);
}

export function bullet(text) {
  console.log(`  ${theme.bullet} ${text}`);
}

export function blank() {
  console.log();
}

// Render a Markdown-ish text block as plain text.
// We intentionally do NOT add fancy markdown rendering — minimal vibe.
// Just trim leading/trailing whitespace and print.
export function body(text) {
  const out = (text || "").trim();
  if (out) console.log(out);
}

// --- Spinner (no external deps) ---
export class Spinner {
  constructor(text = "") {
    this.text = text;
    this._frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this._i = 0;
    this._timer = null;
  }

  start() {
    if (!colorEnabled || !process.stdout.isTTY) {
      if (this.text) process.stdout.write(`${this.text}...\n`);
      return this;
    }
    this._timer = setInterval(() => {
      const f = this._frames[this._i % this._frames.length];
      this._i++;
      process.stdout.write(`\r${chalk.cyan(f)} ${chalk.dim(this.text)}  `);
    }, 80);
    return this;
  }

  stop(finalText = "") {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      process.stdout.write("\r\x1b[K"); // clear line
    }
    if (finalText) console.log(finalText);
    return this;
  }

  succeed(text) { this.stop(text ? theme.ok("✓") + " " + text : ""); }
  fail(text)    { this.stop(text ? theme.err("✗") + " " + text : ""); }
}

// --- JSON output helper (for --json flag) ---
export function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// --- Storage paths ---
export const APP_DIR = join(homedir(), ".devbuddy");
export const CONFIG_FILE = join(APP_DIR, "config.json");
export const TODOS_FILE = join(APP_DIR, "todos.json");

// --- Version ---
export function getVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}
