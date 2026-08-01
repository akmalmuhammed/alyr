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
  ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST: readonly string[];
  ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST: readonly string[];
  ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST: readonly string[];
  DEVELOPMENT_SCHEME_PREFIX: string;
  LEGACY_GOOGLE_MAPS_METADATA_NAME: string;
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
    }
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
  submit?: {
    production?: {
      android?: {
        applicationId?: string;
        track?: string;
        releaseStatus?: string;
        changesNotSentForReview?: boolean;
      };
    };
  };
};

function resolveConfig(
  environment: Record<string, string | undefined>
) {
  const originalEnvironment = {
    EAS_BUILD_PLATFORM: process.env.EAS_BUILD_PLATFORM,
    EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
    NODE_ENV: process.env.NODE_ENV
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
  it("uses MapLibre without a distributable map credential", () => {
    for (const profile of ["preview", "production"]) {
      const config = resolveConfig({
        NODE_ENV: "production",
        EAS_BUILD_PLATFORM: "android",
        EAS_BUILD_PROFILE: profile
      });

      expect(config.android?.config?.googleMaps).toBeUndefined();
      expect(
        pluginOptions(config, "@maplibre/maplibre-react-native")
      ).toEqual({ android: { locationEngine: "default" } });
      expect(
        pluginOptions(
          config,
          "./plugins/with-production-android-release"
        )
      ).toEqual({ enabled: true });
    }
  });

  it("keeps foreground GPS on expo-location and MapLibre on its default engine", () => {
    const config = resolveConfig({
      NODE_ENV: "production",
      EAS_BUILD_PLATFORM: "android",
      EAS_BUILD_PROFILE: "production"
    });

    expect(pluginOptions(config, "expo-location")).toMatchObject({
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
      isIosBackgroundLocationEnabled: false
    });
    expect(
      pluginOptions(config, "@maplibre/maplibre-react-native")
    ).toEqual({ android: { locationEngine: "default" } });
  });

  it("disables the release manifest policy only for local development", () => {
    const config = resolveConfig({
      NODE_ENV: "development",
      EAS_BUILD_PLATFORM: "android",
      EAS_BUILD_PROFILE: "development"
    });

    expect(config.android?.config?.googleMaps).toBeUndefined();
    expect(
      pluginOptions(
        config,
        "./plugins/with-production-android-release"
      )
    ).toEqual({ enabled: false });
  });

  it("enables the credential-free production release policy", () => {
    const config = resolveConfig({
      NODE_ENV: "production",
      EAS_BUILD_PLATFORM: "android",
      EAS_BUILD_PROFILE: "production"
    });

    expect(config.android?.config?.googleMaps).toBeUndefined();
    expect(config.android?.package).toBe(
      androidReleasePlugin.HELDAT_ANDROID_APPLICATION_ID
    );
    expect(
      pluginOptions(
        config,
        "./plugins/with-production-android-release"
      )
    ).toEqual({ enabled: true });
    expect(config.android?.intentFilters).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          { scheme: "https", host: "heldat.app", pathPrefix: "/join" },
          { scheme: "https", host: "heldat.app", pathPrefix: "/callback" },
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

  it("keeps first Google Play submissions on an internal draft gate", () => {
    expect(eas.submit?.production?.android).toEqual({
      applicationId: "app.heldat.mobile",
      track: "internal",
      releaseStatus: "draft",
      changesNotSentForReview: true
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
        }
      )
    ).toThrow(
      "Unreviewed manifest permissions: android.permission.READ_CONTACTS"
    );
  });

  it("rejects legacy Google Maps API key metadata", () => {
    expect(() =>
      androidReleasePlugin.enforceManifest({
        manifest: {
          application: [
            {
              activity: [
                {
                  "intent-filter": [
                    {
                      data: [{ $: { "android:scheme": "heldat" } }]
                    }
                  ]
                }
              ],
              "meta-data": [
                {
                  $: {
                    "android:name":
                      androidReleasePlugin.LEGACY_GOOGLE_MAPS_METADATA_NAME,
                    "android:value": "legacy-key"
                  }
                }
              ]
            }
          ]
        }
      })
    ).toThrow(
      "Legacy Google Maps API key metadata is prohibited for the MapLibre release"
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
            EAS_BUILD_PROFILE: "production"
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
                  provider?: AndroidPermission[];
                  receiver?: AndroidPermission[];
                  service?: AndroidPermission[];
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
    const componentRemovalMarkers = (
      componentType: "provider" | "receiver" | "service"
    ) =>
      new Set(
        (application?.[componentType] ?? [])
          .filter(
            (component) =>
              component.$?.["tools:node"] === "remove"
          )
          .map((component) => component.$?.["android:name"])
          .filter(
            (name): name is string => typeof name === "string"
          )
      );
    const metadata = application?.["meta-data"] ?? [];
    const legacyMapsMetadata = metadata.find(
      (entry) =>
        entry.$?.["android:name"] ===
        androidReleasePlugin.LEGACY_GOOGLE_MAPS_METADATA_NAME
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
    const mapLibreLocationEngineProperties = (
      android.gradleProperties ?? []
    ).filter(
      (entry) =>
        entry.type === "property" &&
        entry.key === "org.maplibre.reactnative.locationEngine"
    );

    expect(introspected.android.config?.googleMaps).toBeUndefined();
    expect(legacyMapsMetadata).toBeUndefined();
    expect(mapLibreLocationEngineProperties).toEqual([
      {
        type: "property",
        key: "org.maplibre.reactnative.locationEngine",
        value: "default"
      }
    ]);
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
    for (const [componentType, deniedNames] of [
      [
        "provider",
        androidReleasePlugin.ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST
      ],
      [
        "receiver",
        androidReleasePlugin.ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST
      ],
      [
        "service",
        androidReleasePlugin.ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST
      ]
    ] as const) {
      const markers = componentRemovalMarkers(componentType);
      for (const deniedName of deniedNames) {
        expect(markers).toContain(deniedName);
      }
    }
    const remoteComponents = [
      ...androidReleasePlugin.ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST,
      ...androidReleasePlugin.ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST,
      ...androidReleasePlugin.ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST
    ];
    expect(remoteComponents).not.toContain(
      "expo.modules.notifications.service.NotificationsService"
    );
    expect(remoteComponents).not.toContain(
      "expo.modules.notifications.service.NotificationForwarderActivity"
    );

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
    expect(
      androidReleasePlugin.ANDROID_RELEASE_PERMISSION_DENYLIST
    ).toEqual(
      expect.arrayContaining([
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.USE_EXACT_ALARM",
        "android.permission.WRITE_EXTERNAL_STORAGE"
      ])
    );
    expect(
      androidReleasePlugin.ANDROID_RELEASE_PERMISSION_ALLOWLIST
    ).not.toEqual(
      expect.arrayContaining([
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.USE_EXACT_ALARM",
        "android.permission.WRITE_EXTERNAL_STORAGE"
      ])
    );
  }, 30_000);
});
