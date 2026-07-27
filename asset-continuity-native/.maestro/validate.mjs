import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseAllDocuments } from "yaml";

const workspace = new URL(".", import.meta.url);
const nativeRoot = resolve(fileURLToPath(new URL("..", workspace)));
const flowDirectory = resolve(fileURLToPath(new URL("flows", workspace)));
const subflowDirectory = resolve(
  fileURLToPath(new URL("subflows", workspace))
);
const expectedAppId = "com.alyr.continuity";
const failures = [];

const flowFiles = readdirSync(flowDirectory)
  .filter((file) => file.endsWith(".yaml"))
  .sort();
const subflowFiles = readdirSync(subflowDirectory)
  .filter((file) => file.endsWith(".yaml"))
  .sort();

if (flowFiles.length < 5) {
  failures.push(`Expected at least 5 executable flows; found ${flowFiles.length}.`);
}

const parsedFiles = new Map();
for (const [directory, files] of [
  [flowDirectory, flowFiles],
  [subflowDirectory, subflowFiles]
]) {
  for (const file of files) {
    const path = resolve(directory, file);
    const source = readFileSync(path, "utf8");
    const documents = parseAllDocuments(source);
    const parseErrors = documents.flatMap((document) => document.errors);
    if (parseErrors.length > 0) {
      failures.push(
        `${file}: ${parseErrors.map((error) => error.message).join("; ")}`
      );
      continue;
    }
    if (documents.length !== 2) {
      failures.push(`${file}: expected config and command YAML documents.`);
      continue;
    }
    const config = documents[0].toJS();
    const commands = documents[1].toJS();
    if (config?.appId !== expectedAppId) {
      failures.push(`${file}: appId must remain ${expectedAppId}.`);
    }
    if (!Array.isArray(commands) || commands.length === 0) {
      failures.push(`${file}: command document must be a non-empty list.`);
    }
    if (source.match(/\bpoint\s*:/u)) {
      failures.push(`${file}: coordinate selectors are prohibited.`);
    }
    parsedFiles.set(path, { config, commands, source });
  }
}

for (const file of flowFiles) {
  const parsed = parsedFiles.get(resolve(flowDirectory, file));
  if (!parsed) continue;
  if (!Array.isArray(parsed.config?.tags) || parsed.config.tags.length === 0) {
    failures.push(`${file}: every executable flow needs reportable tags.`);
  }
}

const allSources = [
  readFileSync(resolve(nativeRoot, "app/(auth)/index.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/(auth)/create-account.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/(auth)/sign-in.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/(auth)/forgot-password.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/(tabs)/index.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/(tabs)/assets.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/capture/index.tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/asset/[id].tsx"), "utf8"),
  readFileSync(resolve(nativeRoot, "app/dashboard.tsx"), "utf8"),
  readFileSync(
    resolve(nativeRoot, "src/state/SessionBoundWorkspaceProvider.tsx"),
    "utf8"
  ),
  readFileSync(
    resolve(nativeRoot, "src/components/PortfolioDashboard/index.tsx"),
    "utf8"
  ),
  readFileSync(resolve(nativeRoot, "app/atlas.tsx"), "utf8")
].join("\n");

const requiredIds = [
  "auth-welcome-screen",
  "auth-create-account-screen",
  "auth-sign-in-screen",
  "auth-forgot-password-screen",
  "home-screen",
  "capture-asset-name",
  "asset-passport-saved-confirmation",
  "asset-passport-screen",
  "today-portfolio-entry",
  "portfolio-screen",
  "portfolio-dashboard",
  "today-atlas-entry",
  "atlas-screen",
  "assets-screen"
];
for (const id of requiredIds) {
  if (!allSources.includes(`"${id}"`)) {
    failures.push(`Native selector contract is missing testID ${id}.`);
  }
}
if (!allSources.includes("testID={`capture-step-${step}`}")) {
  failures.push("Native selector contract is missing dynamic capture step IDs.");
}
for (const contract of [
  '(mode === "supabase" && session === null)',
  "signedOutSampleWorkspaceReady(",
  'workspaceMode === "sample"'
]) {
  if (!allSources.includes(contract)) {
    failures.push(`Signed-out sample runtime contract is missing: ${contract}`);
  }
}

for (const parsed of parsedFiles.values()) {
  const fileReferences = [
    ...parsed.source.matchAll(/file:\s*"([^"]+\.yaml)"/gu)
  ].map((match) => match[1]);
  for (const reference of fileReferences) {
    const sourcePath = [...parsedFiles.entries()].find(
      ([, value]) => value === parsed
    )?.[0];
    if (!sourcePath) continue;
    const target = resolve(dirname(sourcePath), reference);
    if (!parsedFiles.has(target)) {
      failures.push(`${sourcePath}: missing runFlow dependency ${reference}.`);
    }
  }
}

const offline = parsedFiles.get(
  resolve(flowDirectory, "03-local-first-passport-restart.yaml")
);
if (
  !offline?.source.includes("setAirplaneMode: enabled") ||
  !offline?.source.includes("onFlowComplete:") ||
  !offline?.source.includes("setAirplaneMode: disabled")
) {
  failures.push("Offline flow must enable airplane mode and always restore it.");
}

const config = readFileSync(
  resolve(fileURLToPath(new URL("config.yaml", workspace))),
  "utf8"
);
const configDocuments = parseAllDocuments(config);
if (configDocuments.some((document) => document.errors.length > 0)) {
  failures.push("config.yaml is not valid YAML.");
} else {
  const value = configDocuments[0]?.toJS();
  if (!value?.flows?.includes("flows/*.yaml")) {
    failures.push("config.yaml must discover only executable flows.");
  }
}

if (failures.length > 0) {
  console.error("Maestro static validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Maestro static validation passed: ${flowFiles.length} flows, ` +
      `${subflowFiles.length} subflows, ${requiredIds.length + 1} selector contracts.`
  );
}
