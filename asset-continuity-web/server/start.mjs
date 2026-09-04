#!/usr/bin/env node
import path from "node:path";

import { createLocalApiServer } from "./localApi.mjs";

const port = Number.parseInt(process.env.ALYR_LOCAL_PORT || "8788", 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("ALYR_LOCAL_PORT must be a valid TCP port.");
}

const host = process.env.ALYR_LOCAL_HOST || "127.0.0.1";
const dataDirectory = path.resolve(
  process.env.ALYR_LOCAL_DATA_DIR || "server/data",
);
const allowedOrigins = (
  process.env.ALYR_LOCAL_APP_ORIGINS ||
  "http://localhost:4173,http://127.0.0.1:4173"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const secureCookies = process.env.ALYR_LOCAL_SECURE_COOKIES === "true";

const localApi = await createLocalApiServer({
  dataDirectory,
  allowedOrigins,
  secureCookies,
});
await localApi.listen(port, host);

console.log(
  `Heldat local API listening on http://${host}:${port} (local filesystem only; no cloud backup).`,
);

async function shutdown() {
  await localApi.close();
  process.exitCode = 0;
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
