// Auto-updater — checks GitHub releases on launch, prompts to install.
//
// v0.3 behavior: by default, checks once per launch (silently in background).
// If a newer version exists, prints a one-line notice and prompts the user
// to update (Y/n). If they accept, runs `npm install -g` from GitHub.
//
// Configurable via:
//   devbuddy config set autoUpdate off|prompt|silent
//
// Off     = don't check
// Prompt  = check, prompt, install if yes  (DEFAULT)
// Silent  = check, install silently if newer

import { execSync } from "node:child_process";
import { loadConfig, saveConfig } from "../store.js";
import * as ui from "../ui.js";
import { getVersion } from "../ui.js";

const REPO = "TheStrongestOfTomorrow/DevBuddy-CLI";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const INSTALL_CMD = `npm install -g ${REPO}`;

// Cache the last check time so we don't hit GitHub on every single command
// (only on the first launch per hour).
const ONE_HOUR_MS = 60 * 60 * 1000;

function shouldCheck(cfg) {
  const mode = cfg.autoUpdate || "prompt";
  if (mode === "off") return false;
  const last = cfg.lastUpdateCheck ? new Date(cfg.lastUpdateCheck).getTime() : 0;
  return Date.now() - last > ONE_HOUR_MS;
}

function cmpVersions(a, b) {
  // Returns positive if a > b, negative if a < b, 0 if equal.
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

async function fetchLatestVersion() {
  const res = await fetch(RELEASES_URL, {
    headers: {
      "User-Agent": "DevBuddy-CLI",
      "Accept": "application/vnd.github+json",
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data = await res.json();
  return {
    version: (data.tag_name || "").replace(/^v/, ""),
    url: data.html_url,
    publishedAt: data.published_at,
  };
}

function runInstall() {
  ui.muted(`  running: ${INSTALL_CMD}`);
  try {
    execSync(INSTALL_CMD, { stdio: "inherit", timeout: 120_000 });
    return true;
  } catch (e) {
    ui.error(`update failed: ${e.message}`);
    return false;
  }
}

function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf.trim().toLowerCase());
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

/**
 * Check for updates. Called from the CLI entrypoint, non-blocking.
 * @param {object} opts
 * @param {boolean} [opts.force]  bypass the 1-hour cache
 * @param {boolean} [opts.silent] don't prompt, just print notice if newer
 * @returns {Promise<{checked: boolean, latest?: string, current: string, updated?: boolean}>}
 */
export async function checkForUpdates(opts = {}) {
  const cfg = loadConfig();
  const current = getVersion();
  const mode = cfg.autoUpdate || "prompt";

  if (mode === "off" && !opts.force) {
    return { checked: false, current, reason: "autoUpdate=off" };
  }
  if (!shouldCheck(cfg) && !opts.force) {
    return { checked: false, current, reason: "checked recently" };
  }

  // Mark check time
  cfg.lastUpdateCheck = new Date().toISOString();
  saveConfig(cfg);

  let latest;
  try {
    latest = await fetchLatestVersion();
  } catch (e) {
    if (opts.force) ui.warn(`could not check for updates: ${e.message}`);
    return { checked: false, current, error: e.message };
  }

  if (!latest.version) {
    return { checked: false, current, error: "no version tag in release" };
  }

  const is_newer = cmpVersions(latest.version, current) > 0;

  if (!is_newer) {
    return { checked: true, current, latest: latest.version, is_newer: false };
  }

  // Newer version available
  if (opts.silent || mode === "silent") {
    ui.warn(`v${latest.version} available (you have v${current}). Run: devbuddy update`);
    return { checked: true, current, latest: latest.version, is_newer: true };
  }

  // Prompt mode (default)
  ui.blank();
  ui.warn(`Update available: v${current} → v${latest.version}`);
  ui.muted(`  release: ${latest.url}`);
  const answer = await prompt("  Update now? [Y/n] ");

  if (answer === "" || answer === "y" || answer === "yes") {
    const ok = runInstall();
    if (ok) {
      ui.ok(`updated to v${latest.version}. Re-run your command.`);
      return { checked: true, current, latest: latest.version, is_newer: true, updated: true };
    }
    return { checked: true, current, latest: latest.version, is_newer: true, updated: false };
  } else {
    ui.muted("skipped. you can update later with: devbuddy update");
    return { checked: true, current, latest: latest.version, is_newer: true, skipped: true };
  }
}
