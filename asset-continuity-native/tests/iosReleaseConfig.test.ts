import createConfig from "../app.config";

declare const __dirname: string;
declare function require(moduleName: string): unknown;
declare const process: {
  env: Record<string, string | undefined>;
  execPath: string;
};

const { existsSync, readFileSync } = require("fs") as {
  existsSync(filePath: string): boolean;
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
    }
  ): string;
};

const appRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(appRoot, "..");
const nativePackage = JSON.parse(
  readFileSync(path.join(appRoot, "package.json"), "utf8")
) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
};

const config = createConfig({
  config: {
    name: "Heldat",
    slug: "alyr-asset-continuity"
  }
} as Parameters<typeof createConfig>[0]);

const eas = JSON.parse(
  readFileSync(path.join(appRoot, "eas.json"), "utf8")
) as {
  cli: {
    version: string;
    appVersionSource: string;
    requireCommit: boolean;
  };
  build: Record<
    string,
    {
      extends?: string;
      developmentClient?: boolean;
      distribution?: string;
      environment?: string;
      channel?: string;
      ios?: { simulator?: boolean };
    }
  >;
};

function pluginOptions(name: string): Record<string, unknown> | undefined {
  const plugin = (config.plugins ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === name
  );
  return Array.isArray(plugin)
    ? (plugin[1] as Record<string, unknown>)
    : undefined;
}

function privacyReasons(category: string): readonly string[] {
  const entry = config.ios?.privacyManifests?.NSPrivacyAccessedAPITypes?.find(
    (candidate) => candidate.NSPrivacyAccessedAPIType === category
  );
  return entry?.NSPrivacyAccessedAPITypeReasons ?? [];
}

describe("signed iOS release configuration", () => {
  it("pins the linked Expo identity, app identity, and deep-link scheme", () => {
    expect(config.owner).toBe("alyr-app");
    expect(config.extra?.eas).toEqual({
      projectId: "85cab1f2-111f-4e20-abd5-8dff0df2fabb"
    });
    expect(config.slug).toBe("alyr-asset-continuity");
    expect(config.ios?.bundleIdentifier).toBe("app.heldat.mobile");
    expect(config.scheme).toBe("heldat");
    expect(config.ios?.supportsTablet).toBe(false);
    expect(config.ios?.associatedDomains).toEqual([
      "applinks:heldat.app"
    ]);
  });

  it("enables app-version-scoped EAS updates for the linked project", () => {
    expect(config.runtimeVersion).toEqual({ policy: "appVersion" });
    expect(config.updates?.url).toBe(
      "https://u.expo.dev/85cab1f2-111f-4e20-abd5-8dff0df2fabb"
    );
    expect(nativePackage.dependencies["expo-updates"]).toMatch(/^~57\./u);
  });

  it("uses an opaque full-bleed 1024px PNG for the iOS app icon", () => {
    const iconPath = config.ios?.icon;
    expect(iconPath).toBe(
      "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-ios-1024.png"
    );

    const png = readFileSync(path.resolve(appRoot, iconPath as string));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect(png[25]).toBe(2);
    expect(png.indexOf("tRNS", 0, "ascii")).toBe(-1);
  });

  it("declares only the reviewed required-reason API categories", () => {
    expect(config.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
    expect(config.ios?.privacyManifests?.NSPrivacyTrackingDomains).toEqual([]);
    expect(
      privacyReasons("NSPrivacyAccessedAPICategoryFileTimestamp")
    ).toEqual(["C617.1", "3B52.1"]);
    expect(
      privacyReasons("NSPrivacyAccessedAPICategoryDiskSpace")
    ).toEqual(["E174.1", "85F4.1"]);
    expect(
      privacyReasons("NSPrivacyAccessedAPICategorySystemBootTime")
    ).toEqual(["35F9.1"]);
    expect(
      privacyReasons("NSPrivacyAccessedAPICategoryUserDefaults")
    ).toEqual(["CA92.1"]);
  });

  it("declares the signed cloud record collected by first-party code", () => {
    const collected =
      config.ios?.privacyManifests?.NSPrivacyCollectedDataTypes ?? [];
    expect(
      collected.map((entry) => entry.NSPrivacyCollectedDataType)
    ).toEqual([
      "NSPrivacyCollectedDataTypeEmailAddress",
      "NSPrivacyCollectedDataTypeUserID",
      "NSPrivacyCollectedDataTypeDeviceID",
      "NSPrivacyCollectedDataTypePhysicalAddress",
      "NSPrivacyCollectedDataTypePreciseLocation",
      "NSPrivacyCollectedDataTypeCoarseLocation",
      "NSPrivacyCollectedDataTypeOtherFinancialInfo",
      "NSPrivacyCollectedDataTypePhotosorVideos",
      "NSPrivacyCollectedDataTypeOtherUserContent",
      "NSPrivacyCollectedDataTypeOtherDiagnosticData",
      "NSPrivacyCollectedDataTypeProductInteraction"
    ]);
    const productInteraction = collected.find(
      (entry) =>
        entry.NSPrivacyCollectedDataType ===
        "NSPrivacyCollectedDataTypeProductInteraction"
    );
    expect(productInteraction).toEqual({
      NSPrivacyCollectedDataType:
        "NSPrivacyCollectedDataTypeProductInteraction",
      NSPrivacyCollectedDataTypeLinked: true,
      NSPrivacyCollectedDataTypeTracking: false,
      NSPrivacyCollectedDataTypePurposes: [
        "NSPrivacyCollectedDataTypePurposeAnalytics"
      ]
    });
    expect(
      collected.filter(
        (entry) =>
          entry.NSPrivacyCollectedDataType !==
          "NSPrivacyCollectedDataTypeProductInteraction"
      )
    ).toEqual(
      collected
        .filter(
          (entry) =>
            entry.NSPrivacyCollectedDataType !==
            "NSPrivacyCollectedDataTypeProductInteraction"
        )
        .map((entry) => ({
        ...entry,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: [
          "NSPrivacyCollectedDataTypePurposeAppFunctionality"
        ]
        }))
    );
  });

  it("uses the exempt Apple-platform encryption declaration", () => {
    expect(config.ios?.config?.usesNonExemptEncryption).toBe(false);
  });

  it("keeps specific camera, location, photo, and biometric disclosures", () => {
    expect(config.ios?.infoPlist?.NSCameraUsageDescription).toContain(
      "photograph an asset"
    );
    expect(
      config.ios?.infoPlist?.NSLocationWhenInUseUsageDescription
    ).toContain("place a property");
    expect(config.ios?.infoPlist?.NSFaceIDUsageDescription).toContain(
      "unlock your private household record"
    );
    expect(pluginOptions("expo-image-picker")?.photosPermission).toContain(
      "only the photos you choose"
    );
  });

  it("keeps iOS transport security fail-closed outside the local dev network", () => {
    const originalProfile = process.env.EAS_BUILD_PROFILE;
    const originalPlatform = process.env.EAS_BUILD_PLATFORM;
    const originalNodeEnvironment = process.env.NODE_ENV;
    const resolveTransportSecurity = () =>
      createConfig({
        config: {
          name: "Heldat",
          slug: "alyr-asset-continuity"
        }
      } as Parameters<typeof createConfig>[0]).ios?.infoPlist
        ?.NSAppTransportSecurity;

    try {
      process.env.EAS_BUILD_PLATFORM = "ios";
      process.env.NODE_ENV = "production";
      delete process.env.EAS_BUILD_PROFILE;
      expect(resolveTransportSecurity()).toEqual({
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: false
      });

      process.env.EAS_BUILD_PROFILE = "development-simulator";
      expect(resolveTransportSecurity()).toEqual({
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true
      });

      process.env.EAS_BUILD_PROFILE = "preview";
      expect(resolveTransportSecurity()).toEqual({
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: false
      });

      process.env.NODE_ENV = "development";
      expect(resolveTransportSecurity()).toEqual({
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: false
      });

      process.env.EAS_BUILD_PROFILE = "production";
      expect(resolveTransportSecurity()).toEqual({
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: false
      });
    } finally {
      if (originalProfile === undefined) {
        delete process.env.EAS_BUILD_PROFILE;
      } else {
        process.env.EAS_BUILD_PROFILE = originalProfile;
      }

      if (originalPlatform === undefined) {
        delete process.env.EAS_BUILD_PLATFORM;
      } else {
        process.env.EAS_BUILD_PLATFORM = originalPlatform;
      }

      if (originalNodeEnvironment === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnvironment;
      }
    }
  });

  it("keeps callback routes aligned with the custom scheme", () => {
    expect(existsSync(path.join(appRoot, "app", "(auth)", "callback.tsx"))).toBe(
      true
    );
    expect(
      existsSync(path.join(appRoot, "app", "(auth)", "reset-password.tsx"))
    ).toBe(true);

    const runtimeConfig = readFileSync(
      path.join(appRoot, "src", "runtime", "supabaseConfig.ts"),
      "utf8"
    );
    expect(runtimeConfig).toContain('"heldat://callback"');
    expect(runtimeConfig).toContain('"heldat://reset-password"');
  });

  it("ships the reviewed browser PKCE bridge for Google sign-in", () => {
    expect(nativePackage.dependencies["expo-auth-session"]).toMatch(
      /^~57\./u
    );
    expect(nativePackage.dependencies["expo-web-browser"]).toMatch(
      /^~57\./u
    );
    expect(pluginOptions("expo-web-browser")).toEqual({
      experimentalLauncherActivity: false
    });
    const googleOAuthBoundary = readFileSync(
      path.join(
        appRoot,
        "src",
        "auth",
        "googleOAuthBrowser.ts"
      ),
      "utf8"
    );
    expect(googleOAuthBoundary).toContain(
      '"heldat://callback" as const'
    );
    expect(googleOAuthBoundary).toContain(
      "WebBrowser.openAuthSessionAsync"
    );
  });

  it("separates physical-device, simulator, preview, and store profiles", () => {
    expect(eas.cli).toEqual({
      version: "21.2.0",
      appVersionSource: "remote",
      requireCommit: true
    });
    expect(eas.build.development).toMatchObject({
      developmentClient: true,
      distribution: "internal",
      environment: "development",
      channel: "development"
    });
    expect(eas.build["development-simulator"]).toEqual({
      extends: "development",
      ios: { simulator: true }
    });
    expect(eas.build.preview).toMatchObject({
      distribution: "internal",
      environment: "preview",
      channel: "preview"
    });
    expect(eas.build.production?.environment).toBe("production");
    expect(eas.build.production?.distribution).toBeUndefined();
  });

  it("ships local notification APIs without push entitlements or remote background mode", () => {
    expect(nativePackage.dependencies["expo-notifications"]).toMatch(
      /^~57\./u
    );
    expect(pluginOptions("expo-notifications")).toBeUndefined();
    expect(config.plugins).not.toContain("expo-notifications");
    expect(config.plugins).toContain(
      "./plugins/with-local-notifications-only"
    );
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
            FORCE_COLOR: "0"
          }
        }
      )
    ) as {
      _internal: {
        autolinkedModules: readonly string[];
        modResults: {
          ios: {
            entitlements?: Record<string, unknown>;
            infoPlist?: {
              UIBackgroundModes?: readonly string[];
            };
          };
        };
      };
    };
    const introspectedIos =
      introspected._internal.modResults.ios;
    expect(
      introspectedIos.entitlements?.["aps-environment"]
    ).toBeUndefined();
    expect(
      introspectedIos.infoPlist?.UIBackgroundModes ?? []
    ).not.toContain("remote-notification");
    expect(
      introspected._internal.autolinkedModules
    ).toContain("expo-notifications");
    expect(nativePackage.dependencies["expo-background-task"]).toMatch(
      /^~57\./u
    );
    expect(nativePackage.dependencies["expo-task-manager"]).toMatch(
      /^~57\./u
    );
    expect(config.plugins).toContain("expo-background-task");
  }, 30_000);

  it("keeps the splash asset separate from the iOS icon", () => {
    expect(pluginOptions("expo-splash-screen")).toEqual({
      image:
        "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-512.png",
      imageWidth: 160,
      resizeMode: "contain",
      backgroundColor: "#F6F7F3"
    });
  });

  it("keeps credentials out of the EAS archive while retaining build inputs", () => {
    const easIgnore = readFileSync(
      path.join(repositoryRoot, ".easignore"),
      "utf8"
    );
    expect(easIgnore).toContain("**/.env.*");
    expect(easIgnore).toContain("*.p8");
    expect(easIgnore).toContain("*.mobileprovision");
    expect(easIgnore).toContain("client-work/");
    expect(easIgnore).toContain("\n.git\n");
    expect(easIgnore).not.toContain("\n.git/\n");
    expect(easIgnore).not.toContain("\npackages/\n");
    expect(easIgnore).not.toContain("\nasset-continuity-native/\n");
    expect(existsSync(path.join(repositoryRoot, "package-lock.json"))).toBe(
      true
    );
  });

  it("rebuilds ignored shared-package outputs after a clean EAS install", () => {
    expect(nativePackage.scripts["postinstall"]).toBe(
      "npm run build:shared"
    );
    expect(nativePackage.scripts["build:shared"]).toBe(
      "npm --prefix .. run build:shared"
    );
    expect(nativePackage.scripts["verify:eas-packaging"]).toBe(
      "node scripts/verify-eas-shared-packages.mjs"
    );

    for (const packageDirectory of [
      "analytics",
      "contracts",
      "design-tokens",
      "domain",
      "fixtures"
    ]) {
      const manifest = JSON.parse(
        readFileSync(
          path.join(
            repositoryRoot,
            "packages",
            packageDirectory,
            "package.json"
          ),
          "utf8"
        )
      ) as {
        main: string;
        exports: {
          ".": {
            import: string;
            types: string;
          };
        };
      };
      expect(manifest.main).toBe("./dist/index.js");
      expect(manifest.exports["."].import).toBe("./dist/index.js");
      expect(manifest.exports["."].types).toBe("./dist/index.d.ts");
    }
  });
});
