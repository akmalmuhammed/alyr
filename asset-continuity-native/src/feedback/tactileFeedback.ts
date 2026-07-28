import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type TactileFeedbackKind =
  | "selection"
  | "success"
  | "destructive";

interface TactileFeedbackOptions {
  readonly platform?: string;
  readonly reduceMotion?: boolean;
}

/**
 * Optional, non-semantic feedback for a few completed native interactions.
 *
 * Visible state, copy and navigation always carry the meaning. Web, Reduce
 * Motion and unavailable native haptics deliberately resolve as no-ops.
 */
export async function playTactileFeedback(
  kind: TactileFeedbackKind,
  options: TactileFeedbackOptions = {}
): Promise<void> {
  const platform = options.platform ?? Platform.OS;
  if (platform === "web" || options.reduceMotion === true) return;

  try {
    if (kind === "selection") {
      await Haptics.selectionAsync();
      return;
    }

    await Haptics.notificationAsync(
      kind === "success"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
  } catch {
    // Feedback is enhancement-only: the completed action remains successful.
  }
}
