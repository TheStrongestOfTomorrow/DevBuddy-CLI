// Auto-updater v0.5 — dual-channel.
//
// Primary: fetch the tagged update script from GitHub
//   URL pattern: https://raw.githubusercontent.com/<repo>/main/scripts/update-v<version>.sh
//   Tag convention: scripts/update-v0.5.0.sh, scripts/update-v0.5.1.sh, etc.
//   Each script handles the full update including optional package installs.
//
// Fallback: if the .sh script 404s, fall back to GitHub releases:
//   npm install -g <repo>@<version>
//
// Package integration: each release can include a `packages.json` manifest
// listing extra npm packages to install and integrate. The .sh script
// typically handles this, but if we're using the releases fallback, we
// fetch the manifest separately and install the packages.
//
// Modes (config.autoUpdate):
//   off    = don't check
//   prompt = check, ask Y/n before installing (DEFAULT)
//   silent = check, install without asking

import { execSync } from "node:child_process";
import { loadConfig, saveConfig } from "../store.js";
import * as ui from "../ui.js";
import { getVersion } from "../ui.js";

const REPO = "TheStrongestOfTomorrow/DevBuddy-CLI";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const INSTALL_CMD_FALLBACK = `npm install -g ${REPO}`;

const ONE_HOUR_MS = 60 * 60 * 1000;

function shouldCheck(cfg) {
  const mode = cfg.autoUpdate || "prompt";
  if (mode === "off") return false;
  const last = cfg.lastUpdateCheck ? new Date(cfg.lastUpdateCheck).getTime() : 0;
  return Date.now() - last > ONE_HOUR_MS;
}

function cmpVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

async function fetchWithRetry(url, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

async function fetchLatestVersion() {
  const res = await fetchWithRetry(RELEASES_URL, {
    headers: { "User-Agent": "DevBuddy-CLI", "Accept": "application/vnd.github+json" },
    signal: AbortSignal.timeout(15000),
  }, 2);
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const data = await res.json();
  return {
    version: (data.tag_name || "").replace(/^v/, ""),
    url: data.html_url,
    publishedAt: data.published_at,
  };
}

// Try to fetch the tagged .sh script for a given version.
async function fetchUpdateScript(version) {
  const url = `${RAW_BASE}/scripts/update-v${version}.sh`;
  try {
    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": "DevBuddy-CLI" },
      signal: AbortSignal.timeout(15000),
    }, 1);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes("#!") && !text.includes("# devbuddy-update")) return null;
    return text;
  } catch {
    return null;
  }
}

// Fetch the packages.json manifest for a version (if it exists).
async function fetchPackagesManifest(version) {
  // Try release asset first, then raw on main
  const urls = [
    `${RAW_BASE}/scripts/packages-v${version}.json`,
    `${RAW_BASE}/packages.json`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchWithRetry(url, {
        headers: { "User-Agent": "DevBuddy-CLI" },
        signal: AbortSignal.timeout(10000),
      }, 1);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && Array.isArray(data.packages)) return data;
    } catch {}
  }
  return null;
}

function runShell(cmd) {
  try {
    execSync(cmd, { stdio: "inherit", timeout: 120_000 });
    return true;
  } catch (e) {
    ui.error(`command failed: ${e.message}`);
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

// Install extra packages from a manifest.
function installManifestPackages(manifest) {
  if (!manifest || !manifest.packages || manifest.packages.length === 0) return;
  ui.blank();
  ui.heading(`installing ${manifest.packages.length} integration package(s)`);
  for (const pkg of manifest.packages) {
    const name = typeof pkg === "string" ? pkg : pkg.name;
    const reason = typeof pkg === "string" ? "" : (pkg.reason || "");
    ui.muted(`  - ${name}${reason ? ` (${reason})` : ""}`);
    const ok = runShell(`npm install -g ${name}`);
    if (!ok) ui.warn(`    failed to install ${name}`);
  }
  if (manifest.integrations && manifest.integrations.length > 0) {
    ui.blank();
    ui.heading("running integration hooks");
    for (const hook of manifest.integrations) {
      ui.muted(`  $ ${hook}`);
      runShell(hook);
    }
  }
}

/**
 * Force-install the latest version without checking GitHub API first.
 * Useful when the API is timing out or rate-limited.
 */
export function forceInstall() {
  ui.muted(`  running: ${INSTALL_CMD_FALLBACK}`);
  const ok = runShell(INSTALL_CMD_FALLBACK);
  if (ok) {
    ui.ok(`install complete. Re-run your command.`);
    return { installed: true };
  }
  return { installed: false };
}

/**
 * Check for updates and optionally install.
 * @param {object} opts
 * @param {boolean} [opts.force]   bypass the 1-hour cache
 * @param {boolean} [opts.silent]  don't prompt, just print notice if newer
 * @returns {Promise<object>}
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

  cfg.lastUpdateCheck = new Date().toISOString();
  saveConfig(cfg);

  let latest;
  try {
    latest = await fetchLatestVersion();
  } catch (e) {
    const msg = e.message || String(e);
    if (opts.force) {
      ui.warn(`could not check GitHub for updates: ${msg}`);
      ui.muted(`  this is often a network timeout or rate limit.`);
      ui.muted(`  try: devbuddy update --force-install  (skips the check, just installs)`);
    }
    return { checked: false, current, error: msg };
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
    // Try .sh script first (primary channel)
    ui.muted(`  checking for update script…`);
    const script = await fetchUpdateScript(latest.version);
    if (script) {
      ui.ok(`  found update-v${latest.version}.sh — running it.`);
      // Write script to a temp file and execute
      const { writeFileSync, unlinkSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const tmpScript = join(tmpdir(), `devbuddy-update-${latest.version}.sh`);
      writeFileSync(tmpScript, script, { mode: 0o755 });
      const ok = runShell(`bash ${tmpScript} ${latest.version}`);
      try { unlinkSync(tmpScript); } catch {}
      if (ok) {
        // Also install manifest packages (if any) — the .sh may have done this,
        // but we check anyway to be safe.
        const manifest = await fetchPackagesManifest(latest.version);
        if (manifest) installManifestPackages(manifest);
        ui.ok(`updated to v${latest.version}. Re-run your command.`);
        return { checked: true, current, latest: latest.version, is_newer: true, updated: true, method: "script" };
      }
      ui.warn(`  .sh script failed. falling back to releases channel.`);
    } else {
      ui.muted(`  no update-v${latest.version}.sh found. using releases fallback.`);
    }

    // Fallback: npm install from releases
    ui.muted(`  running: ${INSTALL_CMD_FALLBACK}`);
    const ok = runShell(INSTALL_CMD_FALLBACK);
    if (ok) {
      const manifest = await fetchPackagesManifest(latest.version);
      if (manifest) installManifestPackages(manifest);
      ui.ok(`updated to v${latest.version}. Re-run your command.`);
      return { checked: true, current, latest: latest.version, is_newer: true, updated: true, method: "releases" };
    }
    return { checked: true, current, latest: latest.version, is_newer: true, updated: false };
  } else {
    ui.muted("skipped. you can update later with: devbuddy update");
    return { checked: true, current, latest: latest.version, is_newer: true, skipped: true };
  }
}
