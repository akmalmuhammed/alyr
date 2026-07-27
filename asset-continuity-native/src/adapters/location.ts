import * as Location from "expo-location";

import type { NewPlaceInput } from "@/domain/model";

export type LocationOutcome =
  | { readonly ok: true; readonly pin: NonNullable<NewPlaceInput["pin"]> }
  | { readonly ok: false; readonly reason: "permission" | "unavailable" };

export async function readCurrentLocation(): Promise<LocationOutcome> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        reason: "permission"
      };
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest
    });
    const accuracy = position.coords.accuracy;
    return {
      ok: true,
      pin: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: "device_gps",
        // Accuracy describes the phone reading, not whether the marker is on
        // the correct property. A separate map confirmation is required
        // before ALYR can make a property-level precision claim.
        precision: "approximate",
        horizontalAccuracyMeters: accuracy ?? null,
        observedAt: new Date(position.timestamp).toISOString(),
        confirmedAt: null
      }
    };
  } catch {
    return {
      ok: false,
      reason: "unavailable"
    };
  }
}
