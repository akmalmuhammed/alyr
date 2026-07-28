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

if (flowFiles.length < 9) {
  failures.push(`Expected at least 9 executable flows; found ${flowFiles.length}.`);
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
  "app/(auth)/confirm-email.tsx",
  "app/(auth)/household.tsx",
  "app/(auth)/privacy.tsx",
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
  "src/auth/components.tsx",
  "src/state/SessionBoundWorkspaceProvider.tsx",
  "src/state/WorkspaceProvider.tsx",
  "src/components/PortfolioDashboard/index.tsx",
  "app/atlas.tsx"
].map(readNativeSource).join("\n");

const requiredIds = [
  "auth-welcome-screen",
  "auth-create-account-screen",
  "auth-create-email",
  "auth-create-pilot-access",
  "auth-create-password",
  "auth-create-confirm-password",
  "auth-confirm-email-screen",
  "auth-sign-in-screen",
  "auth-sign-in-email",
  "auth-sign-in-password",
  "auth-forgot-password-screen",
  "auth-household-screen",
  "auth-private-record-name",
  "auth-privacy-screen",
  "auth-first-passport-item",
  "auth-activation-progress",
  "auth-activation-current-stage",
  "onboarding-device-preflight",
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

function copyValuesForKeys(source, keys) {
  const values = new Set();
  for (const key of keys) {
    const pattern = new RegExp(`${key}:\\s*"([^"]+)"`, "gu");
    for (const match of source.matchAll(pattern)) {
      if (match[1]) values.add(match[1]);
    }
  }
  return [...values];
}

const previewOnlyCopy = [
  ...new Set([
    ...copyValuesForKeys(
      readNativeSource("src/i18n/coreJourneyCopy.ts"),
      [
        "previewSession",
        "previewNotice",
        "previewSentEyebrow",
        "previewSentTitle",
        "previewBody",
        "previewRequestReady",
        "openPreviewReset",
        "previewIncomplete",
        "previewCompleteTitle",
        "previewCompleteBody",
        "previewCompleteStatus",
        "previewCompleteDetail",
        "continuePreview",
        "previewEyebrow",
        "previewTitle",
        "sessionPreviewUnlockOff",
        "previewSessionOnly",
        "previewBypassBody"
      ]
    ),
    ...copyValuesForKeys(
      readNativeSource("src/i18n/accountDeletionCopy.ts"),
      ["resetPreview", "resetPreviewMeta"]
    ),
    ...copyValuesForKeys(
      readNativeSource("src/i18n/householdAdminCopy.ts"),
      ["previewTitle", "previewBody"]
    ),
    ...copyValuesForKeys(
      readNativeSource("src/i18n/inviteCopy.ts"),
      ["previewNotice"]
    )
  ])
];

for (const [path, parsed] of parsedFiles.entries()) {
  if (/\bpreview(?:-only)?\b/iu.test(parsed.source)) {
    failures.push(
      `${path}: installed-app flows must not contain preview-only strings.`
    );
  }
  for (const previewCopy of previewOnlyCopy) {
    if (parsed.source.includes(previewCopy)) {
      failures.push(
        `${path}: installed-app flows must not reference preview-only copy "${previewCopy}".`
      );
    }
  }
}

const nativeSecureFlows = flowFiles.filter((file) => {
  const parsed = parsedFiles.get(resolve(flowDirectory, file));
  return (
    Array.isArray(parsed?.config?.tags) &&
    parsed.config.tags.includes("native-secure")
  );
});
if (nativeSecureFlows.length < 2) {
  failures.push(
    "Expected separate native-secure signup and preconfirmed-account activation flows."
  );
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

function findSingleTaggedFlow(tag, label) {
  const matches = flowFiles
    .map((file) => ({
      file,
      parsed: parsedFiles.get(resolve(flowDirectory, file))
    }))
    .filter(
      ({ parsed }) =>
        Array.isArray(parsed?.config?.tags) &&
        parsed.config.tags.includes(tag)
    );
  if (matches.length !== 1) {
    failures.push(
      `${label} must have exactly one executable flow tagged ${tag}; found ${matches.length}.`
    );
    return undefined;
  }
  if (!matches[0]?.parsed?.config.tags.includes("native-secure")) {
    failures.push(`${label} must also remain tagged native-secure.`);
  }
  return matches[0];
}

const nativeSignupEntry = findSingleTaggedFlow(
  "native-signup",
  "Native signup flow"
);
const nativeActivationEntry = findSingleTaggedFlow(
  "native-activation",
  "Native preconfirmed-account activation flow"
);
const nativeSignup = nativeSignupEntry?.parsed;
const nativeActivation = nativeActivationEntry?.parsed;
const completePassportFromCapture = parsedFiles.get(
  resolve(subflowDirectory, "complete-minimal-passport-from-capture.yaml")
);
if (
  !completePassportFromCapture?.source.includes(
    'assertVisible: "Passport started"'
  )
) {
  failures.push(
    "Minimal Passport subflow must assert the truthful Passport started receipt."
  );
}
const nativeActivationSource = [
  nativeActivation?.source,
  completePassportFromCapture?.source
]
  .filter(Boolean)
  .join("\n");

function requireSelectors(label, source, selectors) {
  for (const selector of selectors) {
    if (!source.includes(`"${selector}"`)) {
      failures.push(`${label} must exercise selector ${selector}.`);
    }
  }
}

function collectInputTextValues(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectInputTextValues(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === "inputText" && typeof child === "string") {
      output.push(child);
    } else {
      collectInputTextValues(child, output);
    }
  }
  return output;
}

function requireExternalParameters(label, parsed, parameters) {
  const inputTextValues = collectInputTextValues(parsed?.commands);
  for (const parameter of parameters) {
    if (!inputTextValues.includes(`\${${parameter}}`)) {
      failures.push(
        `${label} must input external parameter ${parameter} from Maestro -e.`
      );
    }
    if (
      parsed?.config?.env &&
      Object.prototype.hasOwnProperty.call(parsed.config.env, parameter)
    ) {
      failures.push(
        `${label} must not commit a default value for ${parameter}; pass it with Maestro -e.`
      );
    }
  }
}

requireSelectors("Native signup flow", nativeSignup?.source ?? "", [
  "auth-welcome-screen",
  "auth-create-account-screen",
  "auth-create-email",
  "auth-create-pilot-access",
  "auth-create-password",
  "auth-create-confirm-password",
  "auth-confirm-email-screen",
  "auth-activation-progress",
  "auth-activation-current-stage"
]);
requireExternalParameters("Native signup flow", nativeSignup, [
  "ALYR_E2E_SIGNUP_EMAIL",
  "ALYR_E2E_PASSWORD",
  "ALYR_E2E_EARLY_ACCESS_CODE"
]);

requireSelectors(
  "Native preconfirmed-account activation flow",
  nativeActivationSource,
  [
    "auth-welcome-screen",
    "auth-sign-in-screen",
    "auth-sign-in-email",
    "auth-sign-in-password",
    "auth-household-screen",
    "auth-private-record-name",
    "auth-activation-progress",
    "auth-activation-current-stage",
    "auth-privacy-screen",
    "auth-first-passport-item",
    "onboarding-device-preflight",
    "capture-step-0",
    "capture-asset-name",
    "asset-passport-saved-confirmation",
    "home-screen"
  ]
);
requireExternalParameters(
  "Native preconfirmed-account activation flow",
  nativeActivation,
  ["ALYR_E2E_PRECONFIRMED_EMAIL", "ALYR_E2E_PASSWORD"]
);
if (
  !nativeActivation?.source.includes(
    'text: "Verify and add my first item"'
  )
) {
  failures.push(
    "Native preconfirmed-account activation flow must cross the device-verification action before capture."
  );
}
if (!nativeActivation?.source.includes('text: "Private record"')) {
  failures.push(
    "Native preconfirmed-account activation flow must assert the named Private record activation stage."
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
