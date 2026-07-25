import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server/start.mjs"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev"],
    {
      stdio: "inherit",
      env: process.env,
    },
  ),
];

let shuttingDown = false;

function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal || code !== 0) {
      stop(code || 1);
    }
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

