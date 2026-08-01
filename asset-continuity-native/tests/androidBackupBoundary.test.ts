import createConfig from "../app.config";

declare const __dirname: string;
declare function require(moduleName: string): unknown;
declare const process: {
  env: Record<string, string | undefined>;
  execPath: string;
};

const { execFileSync } = require("child_process") as {
  execFileSync(
    file: string,
    args: readonly string[],
    options: {
      cwd: string;
      encoding: "utf8";
      env: Record<string, string | undefined>;
      maxBuffer?: number;
    }
  ): string;
};
const path = require("path") as {
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
};
const fs = require("fs") as {
  readFileSync(path: string, encoding: "utf8"): string;
};

const appRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(appRoot, "..");

function pluginOptions(name: string): Record<string, unknown> | undefined {
  const config = createConfig({
    config: { name: "Heldat", slug: "alyr-asset-continuity" }
  } as Parameters<typeof createConfig>[0]);
  const plugin = (config.plugins ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === name
  );
  return Array.isArray(plugin)
    ? (plugin[1] as Record<string, unknown>)
    : undefined;
}

function collectAndroidProcessDeclarations(
  node: unknown,
  path = "manifest"
): readonly { path: string; process: string }[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) =>
      collectAndroidProcessDeclarations(entry, `${path}[${index}]`)
    );
  }
  if (node === null || typeof node !== "object") return [];

  const record = node as Record<string, unknown>;
  const attributes = record.$;
  const found: { path: string; process: string }[] = [];
  if (attributes !== null && typeof attributes === "object") {
    const process = (attributes as Record<string, unknown>)[
      "android:process"
    ];
    if (typeof process === "string") found.push({ path, process });
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "$") continue;
    found.push(
      ...collectAndroidProcessDeclarations(value, `${path}.${key}`)
    );
  }
  return found;
}

describe("Android device-bound backup boundary", () => {
  it("disables OS backup instead of restoring encrypted files without their keys", () => {
    const config = createConfig({
      config: { name: "Heldat", slug: "alyr-asset-continuity" }
    } as Parameters<typeof createConfig>[0]);
    expect(config.android?.allowBackup).toBe(false);
    expect(pluginOptions("expo-secure-store")).toEqual({
      configureAndroidBackup: true
    });
  });

  it("renders android:allowBackup=false in the production manifest", () => {
    const expoCli = path.join(
      repositoryRoot,
      "node_modules",
      "expo",
      "bin",
      "cli"
    );
    const introspected = JSON.parse(
      execFileSync(
        process.execPath,
        [expoCli, "config", "--type", "introspect", "--json"],
        {
          cwd: appRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            EAS_BUILD_PLATFORM: "android",
            EAS_BUILD_PROFILE: "production",
            NODE_ENV: "production",
            FORCE_COLOR: "0"
          },
          maxBuffer: 32 * 1024 * 1024
        }
      )
    ) as {
      _internal: {
        modResults: {
          android: {
            manifest: {
              manifest: {
                application: readonly {
                  $: Record<string, string>;
                }[];
              };
            };
          };
        };
      };
    };
    const manifest =
      introspected._internal.modResults.android.manifest.manifest;
    const application = manifest.application[0]?.$;
    expect(application?.["android:allowBackup"]).toBe("false");
    expect(application?.["android:fullBackupContent"]).toBe(
      "@xml/secure_store_backup_rules"
    );
    expect(application?.["android:dataExtractionRules"]).toBe(
      "@xml/secure_store_data_extraction_rules"
    );
    // Repository/key serialization is process-wide. A future secondary
    // Android process must fail this release invariant until native locking is
    // designed and reviewed.
    expect(collectAndroidProcessDeclarations(manifest)).toEqual([]);
  }, 30_000);

  it("keeps databases and files outside Expo's Android backup allow-list", () => {
    const resourceRoot = path.join(
      repositoryRoot,
      "node_modules",
      "expo-secure-store",
      "android",
      "src",
      "main",
      "res",
      "xml"
    );
    const legacyRules = fs.readFileSync(
      path.join(resourceRoot, "secure_store_backup_rules.xml"),
      "utf8"
    );
    const extractionRules = fs.readFileSync(
      path.join(resourceRoot, "secure_store_data_extraction_rules.xml"),
      "utf8"
    );

    for (const rules of [legacyRules, extractionRules]) {
      expect(rules).toContain('<include domain="sharedpref" path="."/>');
      expect(rules).toContain(
        '<exclude domain="sharedpref" path="SecureStore"/>'
      );
      expect(rules).not.toMatch(/<include\s+domain="(?:database|file|root|external)"/u);
    }
  });
});
