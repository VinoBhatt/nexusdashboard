// Wipes local D1 state and reseeds fresh, so the Playwright suite
// always starts from the same known dataset regardless of what
// earlier manual testing left behind. Cross-platform (no shell rm -rf).
import { rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const d1State = join(root, ".wrangler/state/v3/d1");

if (existsSync(d1State)) {
  rmSync(d1State, { recursive: true, force: true });
  console.log("Cleared local D1 state.");
}

execSync("npm run db:migrate:local --workspace apps/api", { cwd: root, stdio: "inherit" });
execSync("npm run db:seed:local --workspace apps/api", { cwd: root, stdio: "inherit" });
