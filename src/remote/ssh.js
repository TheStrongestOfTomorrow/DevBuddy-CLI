// Experimental remote-AI connector: SSH tunnel.
//
// Connects to a remote machine via SSH, runs `devbuddy-agent` there (or any
// command that reads a prompt from stdin and writes a response to stdout),
// and streams the response back.
//
// Use case: you have a powerful AI setup on a remote machine (e.g., a GPU
// box running a local LLM, or a workstation with API keys you don't want
// to copy locally). You SSH to it, send prompts, get responses.
//
// ⚠️ EXPERIMENTAL. Gated by `experimentalRemoteAI: true` in config.

import { spawn } from "node:child_process";
import * as ui from "../ui.js";

/**
 * Run a prompt on a remote machine via SSH.
 * @param {object} config
 * @param {string} config.host        - SSH host (user@host or just host)
 * @param {string} [config.port]      - SSH port (default 22)
 * @param {string} [config.keyPath]   - Path to SSH private key
 * @param {string} [config.command]   - Remote command to run (default: 'devbuddy-agent')
 * @param {string} prompt             - The prompt to send
 * @returns {Promise<string>}         - The remote AI's response
 */
export async function runRemoteSsh(config, prompt) {
  if (!config.host) throw new Error("SSH config missing 'host'");

  const remoteCmd = config.command || "devbuddy-agent";
  const sshArgs = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
  ];
  if (config.port) sshArgs.push("-p", String(config.port));
  if (config.keyPath) sshArgs.push("-i", config.keyPath);
  sshArgs.push(config.host, remoteCmd);

  return new Promise((resolve, reject) => {
    const proc = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timeout;

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`SSH failed: ${err.message}. Is ssh installed and on PATH?`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim() || "(remote returned empty response)");
      } else {
        reject(new Error(`SSH exit ${code}: ${stderr.trim() || "(no stderr)"}`));
      }
    });

    // Send the prompt to the remote command's stdin
    proc.stdin.write(prompt);
    proc.stdin.end();

    // 60s timeout — remote AI may be slow
    timeout = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      reject(new Error("SSH request timed out (60s)"));
    }, 60_000);
  });
}

/**
 * Test SSH connection (runs `echo OK` on remote).
 */
export async function testSshConnection(config) {
  if (!config.host) throw new Error("SSH config missing 'host'");
  const sshArgs = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
  ];
  if (config.port) sshArgs.push("-p", String(config.port));
  if (config.keyPath) sshArgs.push("-i", config.keyPath);
  sshArgs.push(config.host, "echo DEVBUDDY_SSH_OK");

  return new Promise((resolve, reject) => {
    const proc = spawn("ssh", sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", (err) => reject(new Error(`SSH failed: ${err.message}`)));
    proc.on("exit", (code) => {
      if (code === 0 && stdout.includes("DEVBUDDY_SSH_OK")) {
        resolve(true);
      } else {
        reject(new Error(`SSH test failed (exit ${code}): ${stderr.trim()}`));
      }
    });
  });
}
