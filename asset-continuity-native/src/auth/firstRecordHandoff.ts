import type { FirstCaptureIntent } from "./types";
import { firstRecordCaptureDestination } from "./routes";

export function resolveFirstRecordHandoff(input: {
  readonly dataRoutesReady: boolean;
  readonly onboardingFinished: boolean;
  readonly vaultReleased: boolean;
  readonly intent: FirstCaptureIntent | null;
}): "/capture" | "/capture?intent=place" | null {
  if (
    !input.dataRoutesReady ||
    !input.onboardingFinished ||
    !input.vaultReleased ||
    !input.intent
  ) {
    return null;
  }
  return firstRecordCaptureDestination(input.intent);
}
