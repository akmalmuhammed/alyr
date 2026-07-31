import { heldatStatusBarStyle } from "@/navigation/statusBar";

describe("Heldat status bar style", () => {
  it.each([
    [["(onboarding)"], "light"],
    [["(auth)"], "light"],
    [["(auth)", "index"], "light"],
    [["(auth)", "sign-in"], "dark"],
    [["(tabs)"], "dark"],
    [["capture", "index"], "dark"],
    [["settings"], "dark"],
    [[], "dark"]
  ] as const)("maps %j to %s icons", (segments, style) => {
    expect(heldatStatusBarStyle(segments)).toBe(style);
  });
});
