// `devbuddy update` — manually check for and install updates.

import { checkForUpdates } from "../updater/updater.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("update")
    .description("Check for and install the latest version from GitHub.")
    .option("--check", "Only check; don't install.")
    .action(async (opts) => {
      ui.title("devbuddy update");
      ui.blank();
      const result = await checkForUpdates({
        force: true,
        silent: opts.check,
      });

      if (!result.checked) {
        if (result.error) ui.error(`check failed: ${result.error}`);
        else ui.muted(`skipped: ${result.reason || "no update available"}`);
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
