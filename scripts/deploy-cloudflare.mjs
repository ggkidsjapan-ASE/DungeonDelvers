import { existsSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const buildConfigPath = join(projectRoot, "dist", "server", "wrangler.json");
const deployConfigPath = join(projectRoot, "dist", "server", "wrangler.deploy.json");
const productionDatabaseId = "7b105829-199a-4709-b528-87221876ca43";

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: "inherit" });
  if (result.error) {
    console.error(`Could not start ${args.join(" ")}: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

if (!existsSync(wranglerCli)) {
  console.error("Project dependencies are missing. From this folder, run: corepack pnpm install");
  process.exit(1);
}

if (!runNode([wranglerCli, "whoami"])) {
  console.error("Cloudflare authentication is required. Run: npx wrangler login");
  process.exit(1);
}

if (!runNode(["scripts/run-framework.mjs", "build"])) process.exit(1);

try {
  const config = JSON.parse(await readFile(buildConfigPath, "utf8"));
  const database = config.d1_databases?.find((binding) => binding.binding === "DB");
  if (!database) throw new Error("The build config does not contain the expected DB binding.");

  database.database_id = productionDatabaseId;
  await writeFile(deployConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  if (!runNode([wranglerCli, "deploy", "--config", deployConfigPath])) process.exitCode = 1;
} catch (error) {
  console.error(`Cloudflare deployment failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await rm(deployConfigPath, { force: true });
}
