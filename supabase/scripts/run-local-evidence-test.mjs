import { execFileSync, spawnSync } from "node:child_process";

const npx = process.platform === "win32"
  ? {
      file: process.env.ComSpec ?? "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npx --yes supabase@2.109.1 status -o env",
      ],
    }
  : {
      file: "npx",
      args: ["--yes", "supabase@2.109.1", "status", "-o", "env"],
    };
const statusOutput = execFileSync(
  npx.file,
  npx.args,
  {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

const local = Object.create(null);
for (const line of statusOutput.split(/\r?\n/u)) {
  const match = /^([A-Z0-9_]+)=["']?([^"'\r\n]+)["']?$/u.exec(line.trim());
  if (match) local[match[1]] = match[2];
}

const supabaseUrl = local.API_URL;
const serviceRoleKey = local.SERVICE_ROLE_KEY ?? local.SECRET_KEY;
const publishableKey = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
  throw new Error(
    "The local Supabase stack did not return the required integration variables.",
  );
}

const result = spawnSync(
  process.execPath,
  ["supabase/tests/evidence_api.local.mjs"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_DB_CONTAINER:
        process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_alyr-local",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
