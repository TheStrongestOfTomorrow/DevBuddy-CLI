// Modern, refined UI helpers — sleek CLI styling, subtle accents, clear hierarchy.
// Inspired by ripgrep, bat, and modern developer CLIs.

import chalk from "chalk";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// --- Refined Theme ---
const theme = {
  title: chalk.bold.cyan,
  heading: chalk.bold.white,
  muted: chalk.dim.gray,
  ok: chalk.green,
  warn: chalk.yellow,
  err: chalk.red,
  accent: chalk.cyan,
  badge: chalk.bgCyan.black.bold,
  key: chalk.dim.cyan,
  value: chalk.white,
  bullet: chalk.cyan("•"),
  arrow: chalk.dim("→"),
  border: chalk.dim.cyan,
};

export { theme };

let colorEnabled = process.stdout.isTTY && !process.env.NO_COLOR;
export function setColorEnabled(on) {
  colorEnabled = !!on;
  if (!on) {
    chalk.level = 0;
  }
}

// --- Visual Primitives ---
export function hr(char = "─", len = 60) {
  if (!colorEnabled) return;
  const cols = process.stdout.columns || len;
  console.log(theme.muted(char.repeat(Math.min(cols, len))));
}

export function banner(titleText, subtitleText = "") {
  ui.blank();
  const width = Math.min(64, process.stdout.columns || 64);
  console.log(theme.border("┌" + "─".repeat(width - 2) + "┐"));
  console.log(theme.border("│ ") + theme.title(titleText.padEnd(width - 4)) + theme.border("│"));
  if (subtitleText) {
    console.log(theme.border("│ ") + theme.muted(subtitleText.padEnd(width - 4)) + theme.border("│"));
  }
  console.log(theme.border("└" + "─".repeat(width - 2) + "┘"));
  ui.blank();
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
  console.log(theme.ok("✓ ") + text);
}

export function warn(text) {
  console.log(theme.warn("⚠ ") + text);
}

export function error(text) {
  console.error(theme.err("✗ error: ") + text);
}

export function kv(k, v) {
  console.log(`  ${theme.key(k.padEnd(18))} ${theme.arrow} ${theme.value(v)}`);
}

export function bullet(text) {
  console.log(`  ${theme.bullet} ${text}`);
}

export function blank() {
  console.log();
}

export function body(text) {
  const out = (text || "").trim();
  if (out) console.log(out);
}

// --- Spinner ---
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
      process.stdout.write("\r\x1b[K");
    }
    if (finalText) console.log(finalText);
    return this;
  }

  succeed(text) { this.stop(text ? theme.ok(text) : ""); }
  fail(text)    { this.stop(text ? theme.err(text) : ""); }
}

export function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

export const APP_DIR = join(homedir(), ".devbuddy");
export const CONFIG_FILE = join(APP_DIR, "config.json");
export const TODOS_FILE = join(APP_DIR, "todos.json");

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
