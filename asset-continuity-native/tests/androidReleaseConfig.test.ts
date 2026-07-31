import createConfig from "../app.config";

declare const __dirname: string;
declare function require(moduleName: string): unknown;
declare const process: {
  env: Record<string, string | undefined>;
  execPath: string;
};

const { readFileSync } = require("fs") as {
  readFileSync(filePath: string, encoding?: string): any;
};
const path = require("path") as {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
};
const { execFileSync } = require("child_process") as {
  execFileSync(
    file: string,
    args: readonly string[],
    options: {
      cwd: string;
      encoding: "utf8";
      env: Record<string, string | undefined>;
      maxBuffer: number;
    }
  ): string;
};

type AndroidPermission = {
  $?: Record<string, string>;
};

const androidReleasePlugin = require(
  "../plugins/with-production-android-release"
) as {
  ANDROID_RELEASE_PERMISSION_ALLOWLIST: readonly string[];
  ANDROID_RELEASE_PERMISSION_DENYLIST: readonly string[];
  DEVELOPMENT_SCHEME_PREFIX: string;
  GOOGLE_MAPS_METADATA_NAME: string;
  HELDAT_ANDROID_APPLICATION_ID: string;
  HELDAT_NATIVE_SCHEME: string;
  NETWORK_INSPECTOR_GRADLE_PROPERTY: string;
  enforceManifest(
    androidManifest: {
      manifest: {
        $?: Record<string, string>;
        "uses-permission"?: AndroidPermission[];
        application?: unknown[];
      };
    },
    options: { requireGoogleMapsApiKey: boolean }
  ): unknown;
};

const appRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(appRoot, "..");
const expoCli = path.join(
  repositoryRoot,
  "node_modules",
  "expo",
  "bin",
  "cli"
);
const testGoogleMapsApiKey = `AIza${"A".repeat(35)}`;

const eas = JSON.parse(
  readFileSync(path.join(appRoot, "eas.json"), "utf8")
) as {
  build: Record<
    string,
    {
      environment?: string;
      android?: { buildType?: string };
    }
  >;
};

function resolveConfig(
  environment: Record<string, string | undefined>
) {
  const originalEnvironment = {
    EAS_BUILD_PLATFORM: process.env.EAS_BUILD_PLATFORM,
    EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
    NODE_ENV: process.env.NODE_ENV,
    GOOGLE_MAPS_ANDROID_API_KEY:
      process.env.GOOGLE_MAPS_ANDROID_API_KEY
  };

  try {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    return createConfig({
      config: {
        name: "Heldat",
        slug: "alyr-asset-continuity"
      }
    } as Parameters<typeof createConfig>[0]);
  } finally {
    for (const [key, value] of Object.entries(
      originalEnvironment
    )) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function pluginOptions(
  config: ReturnType<typeof createConfig>,
  name: string
): Record<string, unknown> | undefined {
  const plugin = (config.plugins ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === name
  );
  return Array.isArray(plugin)
    ? (plugin[1] as Record<string, unknown>)
    : undefined;
}

describe("Android production release configuration", () => {
  it("fails closed when distributable profiles lack the Maps key", () => {
    for (const profile of ["preview", "production"]) {
      expect(() =>
        resolveConfig({
          NODE_ENV: "production",
          EAS_BUILD_PLATFORM: "android",
          EAS_BUILD_PROFILE: profile,
          GOOGLE_MAPS_ANDROID_API_KEY: undefined
        })
      ).toThrow(
        "GOOGLE_MAPS_ANDROID_API_KEY is required for preview and production Android builds"
      );
    }
  });

  it("rejects placeholder or malformed Maps key values", () => {
    expect(() =>
      resolveConfig({
        NODE_ENV: "production",
        EAS_BUILD_PLATFORM: "android",
        EAS_BUILD_PROFILE: "production",
        GOOGLE_MAPS_ANDROID_API_KEY: "replace-me"
      })
    ).toThrow(
      "GOOGLE_MAPS_ANDROID_API_KEY must be a complete Google Android API key"
    );
  });

  it("allows development without Maps credentials", () => {
    const config = resolveConfig({
      NODE_ENV: "development",
      EAS_BUILD_PLATFORM: "android",
      EAS_BUILD_PROFILE: "development",
      GOOGLE_MAPS_ANDROID_API_KEY: undefined
    });

    expect(config.android?.config?.googleMaps).toBeUndefined();
    expect(
      pluginOptions(
        config,
        "./plugins/with-production-android-release"
      )
    ).toEqual({
      enabled: false,
      requireGoogleMapsApiKey: false
    });
  });

  it("injects a validated key and enables the release policy", () => {
    const config = resolveConfig({
      NODE_ENV: "production",
      EAS_BUILD_PLATFORM: "android",
      EAS_BUILD_PROFILE: "production",
      GOOGLE_MAPS_ANDROID_API_KEY: testGoogleMapsApiKey
    });

    expect(config.android?.config?.googleMaps?.apiKey).toBe(
      testGoogleMapsApiKey
    );
    expect(config.android?.package).toBe(
      androidReleasePlugin.HELDAT_ANDROID_APPLICATION_ID
    );
    expect(
      pluginOptions(
        config,
        "./plugins/with-production-android-release"
      )
    ).toEqual({
      enabled: true,
      requireGoogleMapsApiKey: true
    });
    expect(config.android?.intentFilters).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: "heldat.app",
            pathPrefix: "/join"
          },
          {
            scheme: "https",
            host: "heldat.app",
            pathPrefix: "/callback"
          },
          {
            scheme: "https",
            host: "heldat.app",
            pathPrefix: "/reset-password"
          }
        ]
      }
    ]);
  });

  it("binds preview and production to matching EAS environments", () => {
    expect(eas.build.preview).toMatchObject({
      environment: "preview",
      android: { buildType: "apk" }
    });
    expect(eas.build.production).toMatchObject({
      environment: "production"
    });
  });

  it("fails closed when a plugin introduces an unreviewed permission", () => {
    expect(() =>
      androidReleasePlugin.enforceManifest(
        {
          manifest: {
            "uses-permission": [
              {
                $: {
                  "android:name":
                    "android.permission.READ_CONTACTS"
                }
              }
            ],
            application: []
          }
        },
        { requireGoogleMapsApiKey: false }
      )
    ).toThrow(
      "Unreviewed manifest permissions: android.permission.READ_CONTACTS"
    );
  });

  it("generates a fail-closed production Android manifest", () => {
    const introspected = JSON.parse(
      execFileSync(
        process.execPath,
        [
          expoCli,
          "config",
          "--type",
          "introspect",
          "--json"
        ],
        {
          cwd: appRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            FORCE_COLOR: "0",
            NODE_ENV: "production",
            EAS_BUILD_PLATFORM: "android",
            EAS_BUILD_PROFILE: "production",
            GOOGLE_MAPS_ANDROID_API_KEY:
              testGoogleMapsApiKey
          },
          maxBuffer: 32 * 1024 * 1024
        }
      )
    ) as {
      android: {
        config?: {
          googleMaps?: {
            apiKey?: string;
          };
        };
      };
      _internal: {
        modResults: {
          android: {
            gradleProperties?: readonly {
              type?: string;
              key?: string;
              value?: string;
            }[];
            manifest?: {
              manifest?: {
                "uses-permission"?: AndroidPermission[];
                application?: {
                  "meta-data"?: {
                    $?: Record<string, string>;
                  }[];
                  activity?: {
                    "intent-filter"?: {
                      $?: Record<string, string>;
                      data?: {
                        $?: Record<string, string>;
                      }[];
                    }[];
                  }[];
                }[];
              };
            };
          };
        };
      };
    };

    const android =
      introspected._internal.modResults.android;
    const manifest = android.manifest?.manifest;
    const permissions = manifest?.["uses-permission"] ?? [];
    const activePermissions = permissions
      .filter(
        (permission) =>
          permission.$?.["tools:node"] !== "remove"
      )
      .map((permission) => permission.$?.["android:name"])
      .filter((name): name is string => typeof name === "string");
    const removalMarkers = new Set(
      permissions
        .filter(
          (permission) =>
            permission.$?.["tools:node"] === "remove"
        )
        .map((permission) => permission.$?.["android:name"])
        .filter(
          (name): name is string => typeof name === "string"
        )
    );
    const application = manifest?.application?.[0];
    const metadata = application?.["meta-data"] ?? [];
    const mapsMetadata = metadata.find(
      (entry) =>
        entry.$?.["android:name"] ===
        androidReleasePlugin.GOOGLE_MAPS_METADATA_NAME
    );
    const schemes = (application?.activity ?? []).flatMap(
      (activity) =>
        (activity["intent-filter"] ?? []).flatMap(
          (intentFilter) =>
            (intentFilter.data ?? [])
              .map((entry) => entry.$?.["android:scheme"])
              .filter(
                (scheme): scheme is string =>
                  typeof scheme === "string"
              )
        )
    );
    const appLinks = (application?.activity ?? []).flatMap(
      (activity) =>
        (activity["intent-filter"] ?? []).flatMap(
          (intentFilter) =>
            (intentFilter.data ?? [])
              .filter(
                (entry) =>
                  entry.$?.["android:scheme"] === "https" &&
                  entry.$?.["android:host"] === "heldat.app"
              )
              .map((entry) => ({
                pathPrefix:
                  entry.$?.["android:pathPrefix"],
                autoVerify:
                  intentFilter.$?.["android:autoVerify"]
              }))
        )
    );
    const networkInspectorProperties = (
      android.gradleProperties ?? []
    ).filter(
      (entry) =>
        entry.type === "property" &&
        entry.key ===
          androidReleasePlugin.NETWORK_INSPECTOR_GRADLE_PROPERTY
    );

    expect(
      introspected.android.config?.googleMaps?.apiKey
    ).toBe(testGoogleMapsApiKey);
    expect(mapsMetadata?.$?.["android:value"]).toBe(
      testGoogleMapsApiKey
    );
    expect(schemes).toContain(
      androidReleasePlugin.HELDAT_NATIVE_SCHEME
    );
    expect(appLinks).toEqual([
      { pathPrefix: "/join", autoVerify: "true" },
      { pathPrefix: "/callback", autoVerify: "true" },
      {
        pathPrefix: "/reset-password",
        autoVerify: "true"
      }
    ]);
    expect(
      schemes.some((scheme) =>
        scheme.startsWith(
          androidReleasePlugin.DEVELOPMENT_SCHEME_PREFIX
        )
      )
    ).toBe(false);
    expect(networkInspectorProperties).toEqual([
      {
        type: "property",
        key: "EX_DEV_CLIENT_NETWORK_INSPECTOR",
        value: "false"
      }
    ]);

    const allowlist = new Set(
      androidReleasePlugin.ANDROID_RELEASE_PERMISSION_ALLOWLIST
    );
    expect(
      activePermissions.filter(
        (permission) => !allowlist.has(permission)
      )
    ).toEqual([]);
    for (const deniedPermission of androidReleasePlugin.ANDROID_RELEASE_PERMISSION_DENYLIST) {
      expect(removalMarkers).toContain(deniedPermission);
      expect(activePermissions).not.toContain(deniedPermission);
    }
  }, 30_000);
});
