import createConfig from "../app.config";

function pluginOptions(
  plugins: NonNullable<ReturnType<typeof createConfig>["plugins"]>,
  name: string
): Record<string, unknown> | undefined {
  const plugin = plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === name
  );
  return Array.isArray(plugin)
    ? (plugin[1] as Record<string, unknown>)
    : undefined;
}

describe("signed device protection configuration", () => {
  const config = createConfig({
    config: {
      name: "ALYR",
      slug: "alyr-asset-continuity"
    }
  } as Parameters<typeof createConfig>[0]);
  const plugins = config.plugins ?? [];

  it("ships a specific Face ID purpose string through config and plugin", () => {
    expect(config.ios?.infoPlist?.NSFaceIDUsageDescription).toBe(
      "ALYR uses Face ID only to unlock your private household record on this device."
    );
    expect(
      pluginOptions(plugins, "expo-local-authentication")
    ).toEqual({
      faceIDPermission:
        "Allow ALYR to use Face ID to unlock your private household record on this device."
    });
  });

  it("does not request unused camera audio, barcode, background location, or motion capabilities", () => {
    expect(config.android?.blockedPermissions).toContain(
      "android.permission.RECORD_AUDIO"
    );
    expect(pluginOptions(plugins, "expo-camera")).toMatchObject({
      microphonePermission: false,
      recordAudioAndroid: false,
      barcodeScannerEnabled: false
    });
    expect(pluginOptions(plugins, "expo-location")).toMatchObject({
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
      isAndroidMotionActivityEnabled: false
    });
  });
});
