// `devbuddy init` — create a DEVBUDDY.md template in the current directory.

import { createTemplate, findDevbuddyMd } from "../prompt.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("init")
    .description("Create a DEVBUDDY.md template in the current directory. This file becomes project context for all AI commands.")
    .option("--force", "Overwrite if DEVBUDDY.md already exists.")
    .action((opts) => {
      const existing = findDevbuddyMd();
      if (existing && existing.source === "project" && !opts.force) {
        ui.warn(`DEVBUDDY.md already exists: ${existing.path}`);
        ui.muted("  re-run with --force to overwrite.");
        return;
      }
      const result = createTemplate();
      if (result.created) {
        ui.ok(`created: ${result.path}`);
        ui.blank();
        ui.muted("Edit it to describe your project. devbuddy will use it as context for:");
        ui.muted("  ask, summarize, explain, translate, chat, agent");
      } else {
        ui.warn(`could not create: ${result.reason}`);
      }
    });
}
