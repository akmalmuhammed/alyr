import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_REF = "ifiyragzeizaxdqzxvpk";
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const fallbackEnvironmentPath = path.join(
  repositoryRoot,
  "asset-continuity-native",
  ".env.local"
);

function readFallbackEnvironment() {
  if (!fs.existsSync(fallbackEnvironmentPath)) return {};
  const values = {};
  const source = fs
    .readFileSync(fallbackEnvironmentPath, "utf8")
    .replace(/^\uFEFF/u, "");
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/u, "$2");
  }
  return values;
}

function decodeLegacyRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "="
    );
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

function isPublicClientKey(value) {
  if (value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) {
    return value.length >= "sb_publishable_".length + 16;
  }
  return decodeLegacyRole(value) === "anon";
}

function configuration() {
  const fallback = readFallbackEnvironment();
  const projectUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    fallback.EXPO_PUBLIC_SUPABASE_URL ??
    "";
  const publicKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    fallback.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    fallback.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  let parsed;
  try {
    parsed = new URL(projectUrl);
  } catch {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL or provide asset-continuity-native/.env.local."
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${PROJECT_REF}.supabase.co` ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`The live probe is pinned to Supabase project ${PROJECT_REF}.`);
  }
  if (!isPublicClientKey(publicKey)) {
    throw new Error(
      "Provide the project's public publishable or legacy anon key; secret/service-role keys are rejected."
    );
  }

  return {
    apiBaseUrl: `${parsed.toString().replace(/\/+$/u, "")}/functions/v1/api`,
    publicKey
  };
}

const invalidUuid = "00000000-0000-4000-8000-000000000000";
const probeDefinitions = [
  {
    name: "recipient invitation preflight",
    path: "/invites/preflight",
    method: "POST",
    body: {
      apiVersion: 1,
      email: "alyr-live-probe@invalid.example",
      oneTimeCode: "ALYR-LIVE-PROBE-INVALID"
    },
    status: 403,
    code: "AUTHORIZATION_DENIED"
  },
  {
    name: "pilot invitation preflight",
    path: "/pilot/preflight",
    method: "POST",
    body: {
      apiVersion: 1,
      email: "alyr-live-probe@invalid.example",
      accessCode: "ALYRLIVEPROBEINVALID0001"
    },
    status: 403,
    code: "AUTHORIZATION_DENIED"
  },
  {
    name: "sync without bearer",
    path: "/sync/push",
    method: "POST",
    body: { apiVersion: 1, operations: [] },
    status: 401,
    code: "AUTHENTICATION_REQUIRED"
  },
  {
    name: "export create without bearer",
    path: "/exports",
    method: "POST",
    body: { apiVersion: 1 },
    status: 401,
    code: "AUTHENTICATION_REQUIRED"
  },
  {
    name: "export status without bearer",
    path: `/exports/${invalidUuid}`,
    method: "GET",
    status: 401,
    code: "AUTHENTICATION_REQUIRED"
  },
  {
    name: "export download without bearer",
    path: `/exports/${invalidUuid}/download`,
    method: "GET",
    status: 401,
    code: "AUTHENTICATION_REQUIRED"
  }
];

async function executeProbe(apiBaseUrl, publicKey, definition) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${definition.path}`, {
      method: definition.method,
      headers: {
        apikey: publicKey,
        ...(definition.body ? { "Content-Type": "application/json" } : {})
      },
      body: definition.body ? JSON.stringify(definition.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return {
      name: definition.name,
      actualStatus: 0,
      actualCode: "NETWORK_ERROR",
      expectedStatus: definition.status,
      expectedCode: definition.code,
      passed: false
    };
  }
  let envelope = null;
  try {
    envelope = JSON.parse(await response.text());
  } catch {
    envelope = null;
  }
  const code = envelope?.error?.code ?? null;
  return {
    name: definition.name,
    actualStatus: response.status,
    actualCode: code,
    expectedStatus: definition.status,
    expectedCode: definition.code,
    passed:
      response.status === definition.status &&
      envelope?.error?.errorVersion === 1 &&
      code === definition.code &&
      typeof envelope?.error?.retryable === "boolean"
  };
}

async function readLaunchMode(apiBaseUrl, publicKey) {
  try {
    const response = await fetch(`${apiBaseUrl}/signup/mode`, {
      method: "GET",
      headers: { apikey: publicKey, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
    const body = JSON.parse(await response.text());
    const keys = [
      "contract",
      "signupMode",
      "configVersion",
      "issuedAt",
      "expiresAt",
      "signature"
    ];
    if (
      response.status !== 200 ||
      body?.apiVersion !== 1 ||
      !["closed_pilot", "public_email", "public_email_google"].includes(
        body?.signupMode
      ) ||
      body?.contract !== "heldat-signup-mode-v1" ||
      !/^[1-9][0-9]{0,18}$/u.test(body?.configVersion ?? "") ||
      !/^[a-f0-9]{64}$/u.test(body?.signature ?? "") ||
      Date.parse(body?.expiresAt ?? "") <= Date.now() ||
      !response.headers.get("cache-control")?.includes("no-store")
    ) {
      return null;
    }
    return Object.fromEntries(keys.map((key) => [key, body[key]]));
  } catch {
    return null;
  }
}

async function run() {
  const { apiBaseUrl, publicKey } = configuration();
  if (process.argv.includes("--check-config")) {
    console.log(
      `Live probe configuration verified for ${PROJECT_REF}; ${probeDefinitions.length} boundaries are defined.`
    );
    return;
  }

  const attempts = process.argv.includes("--once") ? 1 : 12;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const launchMode = await readLaunchMode(apiBaseUrl, publicKey);
    const results = [];
    if (!launchMode) {
      results.push({
        name: "signup mode attestation",
        actualStatus: 0,
        actualCode: "INVALID_MODE_ATTESTATION",
        expectedStatus: 200,
        expectedCode: "ATTESTED_MODE",
        passed: false
      });
    } else {
      for (const definition of probeDefinitions) {
        const resolved = definition.path === "/pilot/preflight"
          ? {
              ...definition,
              body: { ...definition.body, launchMode }
            }
          : definition;
        results.push(await executeProbe(apiBaseUrl, publicKey, resolved));
      }
    }
    if (results.every((result) => result.passed)) {
      for (const result of results) {
        console.log(
          `PASS ${result.name}: ${result.actualStatus} ${result.actualCode}`
        );
      }
      console.log(`Live API deployment verified for ${PROJECT_REF}.`);
      return;
    }

    const failures = results
      .filter((result) => !result.passed)
      .map(
        (result) =>
          `${result.name}=${result.actualStatus}/${result.actualCode ?? "NO_CODE"}`
      )
      .join(", ");
    if (attempt === attempts) {
      throw new Error(`Live API probe failed after ${attempts} attempts: ${failures}`);
    }
    console.log(
      `Deployment propagation check ${attempt}/${attempts}: ${failures}`
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "Live API probe failed.");
  process.exitCode = 1;
});
