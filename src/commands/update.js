// `devbuddy update` — manually check for and install updates.

import { checkForUpdates, forceInstall } from "../updater/updater.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("update")
    .description("Check for and install the latest version from GitHub.")
    .option("--check", "Only check; don't install.")
    .option("--force-install", "Skip the GitHub API check and just run npm install -g (use when the API times out).")
    .action(async (opts) => {
      ui.title("devbuddy update");
      ui.blank();

      // --force-install: skip API check entirely, just install
      if (opts.forceInstall) {
        ui.muted("skipping GitHub API check (--force-install). installing directly…");
        const result = forceInstall();
        if (!result.installed) {
          ui.error("install failed. check your network + npm.");
          process.exit(1);
        }
        return;
      }

      const result = await checkForUpdates({
        force: true,
        silent: opts.check,
      });

      if (!result.checked) {
        if (result.error) {
          ui.error(`check failed: ${result.error}`);
          ui.blank();
          ui.muted("if this keeps failing (network timeout, rate limit), try:");
          ui.muted("  devbuddy update --force-install   (skips the check, just installs)");
        } else {
          ui.muted(`skipped: ${result.reason || "no update available"}`);
        }
        return;
      }

      if (!result.is_newer) {
        ui.ok(`already on latest: v${result.current}`);
        return;
      }

      if (opts.check) {
        ui.warn(`v${result.latest} available (you have v${result.current}).`);
        ui.muted("  install with: devbuddy update   (no --check)");
        return;
      }

      if (result.updated) {
        ui.ok(`updated to v${result.latest}.`);
      } else if (result.skipped) {
        ui.muted("skipped by user.");
      } else {
        ui.warn(`update did not complete. try: npm install -g TheStrongestOfTomorrow/DevBuddy-CLI`);
      }
    });
}
