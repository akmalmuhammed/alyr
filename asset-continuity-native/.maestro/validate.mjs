import { existsSync, readFileSync, readdirSync } from "node:fs";
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

if (flowFiles.length < 7) {
  failures.push(`Expected at least 7 executable flows; found ${flowFiles.length}.`);
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

function readNativeSource(relativePath) {
  const path = resolve(nativeRoot, relativePath);
  if (!existsSync(path)) {
    failures.push(`Required native source is missing: ${relativePath}.`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const allSources = [
  "app/(auth)/index.tsx",
  "app/(auth)/create-account.tsx",
  "app/(auth)/sign-in.tsx",
  "app/(auth)/forgot-password.tsx",
  "app/(tabs)/index.tsx",
  "app/(tabs)/assets.tsx",
  "app/capture/index.tsx",
  "app/asset/[id].tsx",
  "app/dashboard.tsx",
  "app/liability-create.tsx",
  "app/liability/[id].tsx",
  "app/liability-balance.tsx",
  "src/state/SessionBoundWorkspaceProvider.tsx",
  "src/state/WorkspaceProvider.tsx",
  "src/components/PortfolioDashboard/index.tsx",
  "app/atlas.tsx"
].map(readNativeSource).join("\n");

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
  "portfolio-net-position",
  "portfolio-net-position-visibility",
  "liabilities-list",
  "liability-add",
  "liability-create-screen",
  "liability-detail-screen",
  "liability-balance-screen",
  "liability-name",
  "liability-category",
  "liability-amount",
  "liability-currency",
  "liability-as-of",
  "liability-save",
  "liability-edit",
  "liability-delete",
  "liability-delete-confirm",
  "liability-status",
  "liability-balance-save",
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
  'profile === "native-secure"',
  'kind: "signed-sample"',
  'mode === "unavailable"',
  "signedOutSampleWorkspaceReady(",
  'workspaceMode === "sample"',
  "SIGNED_OUT_SAMPLE_VAULT_SCOPE"
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

const liabilityLifecycle = parsedFiles.get(
  resolve(flowDirectory, "05-liability-lifecycle.yaml")
);
for (const selector of [
  "portfolio-net-position",
  "liabilities-list",
  "liability-edit",
  "liability-delete",
  "liability-delete-confirm"
]) {
  if (!liabilityLifecycle?.source.includes(`"${selector}"`)) {
    failures.push(
      `Liability lifecycle flow must exercise selector ${selector}.`
    );
  }
}

const addLiability = parsedFiles.get(
  resolve(subflowDirectory, "add-liability.yaml")
);
for (const selector of [
  "liability-add",
  "liability-name",
  "liability-category",
  "liability-amount",
  "liability-currency",
  "liability-as-of",
  "liability-save"
]) {
  if (!addLiability?.source.includes(`"${selector}"`)) {
    failures.push(`Add-liability subflow must exercise selector ${selector}.`);
  }
}

const netPositionOffline = parsedFiles.get(
  resolve(flowDirectory, "06-net-position-offline-restart.yaml")
);
if (
  !netPositionOffline?.source.includes("setAirplaneMode: enabled") ||
  !netPositionOffline?.source.includes("onFlowComplete:") ||
  !netPositionOffline?.source.includes("setAirplaneMode: disabled") ||
  !netPositionOffline?.source.includes("- stopApp") ||
  !netPositionOffline?.source.includes("- launchApp")
) {
  failures.push(
    "Net-position offline flow must edit offline, restart, and always restore connectivity."
  );
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
