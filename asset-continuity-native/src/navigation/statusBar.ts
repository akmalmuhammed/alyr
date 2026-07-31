export type HeldatStatusBarStyle = "dark" | "light";

/**
 * Keeps system chrome legible while Expo Router retains previous screens in
 * the native stack. Only the immersive onboarding and welcome surfaces are
 * dark; the rest of the product uses the light canvas and dark system icons.
 */
export function heldatStatusBarStyle(
  segments: readonly string[]
): HeldatStatusBarStyle {
  const [group, leaf] = segments;

  if (group === "(onboarding)") return "light";
  if (group === "(auth)" && (!leaf || leaf === "index")) return "light";
  return "dark";
}
