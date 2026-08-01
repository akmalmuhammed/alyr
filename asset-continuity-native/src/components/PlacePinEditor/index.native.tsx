import {
  Camera,
  Map,
  ViewAnnotation,
  type LngLat
} from "@maplibre/maplibre-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "@/theme/tokens";

import { EditorControls } from "./EditorControls";
import {
  createDraggedPlacePin,
  formatCoordinateReadout,
  hasValidCoordinates,
  placePinEditorLabels
} from "./contract";
import type { PlacePinEditorProps } from "./types";

export const OPENFREEMAP_LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";
export const MAP_LOAD_TIMEOUT_MS = 12_000;

export function PlacePinEditor(props: PlacePinEditorProps) {
  const {
    value,
    onChange,
    disabled = false,
    language = "en",
    labels: labelOverrides = {},
    testID = "place-pin-editor",
    now = () => new Date().toISOString()
  } = props;
  const labels = placePinEditorLabels(language, labelOverrides);
  const rtl = language === "ar";
  const hasPin = hasValidCoordinates(value);
  const mapKey = hasPin
    ? `${value.latitude.toFixed(6)}:${value.longitude.toFixed(6)}`
    : "no-pin";
  const [mapStatus, setMapStatus] = useState<
    "loading" | "ready" | "failed"
  >("loading");

  useEffect(() => {
    if (!hasPin) {
      setMapStatus("loading");
      return undefined;
    }

    setMapStatus("loading");
    const timer = setTimeout(() => {
      setMapStatus((current) =>
        current === "ready" ? current : "failed"
      );
    }, MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasPin, mapKey]);

  let mapContent: React.ReactNode;
  if (!hasPin) {
    mapContent = (
      <View
        accessibilityLabel={labels.noPinBody}
        accessibilityRole="summary"
        style={styles.emptyMap}
        testID={`${testID}-no-map`}
      >
        <View style={styles.emptyRule} />
        <View style={styles.emptyCrosshair}>
          <View style={styles.crosshairHorizontal} />
          <View style={styles.crosshairVertical} />
        </View>
      </View>
    );
  } else if (mapStatus === "failed") {
    const coordinateReadout = `${formatCoordinateReadout(
      value.latitude,
      value
    )}, ${formatCoordinateReadout(value.longitude, value)}`;
    mapContent = (
      <View
        accessibilityLabel={`${labels.mapUnavailableTitle}. ${labels.mapUnavailableBody}. ${coordinateReadout}`}
        accessibilityLiveRegion="polite"
        accessibilityRole="summary"
        style={styles.mapFallback}
        testID={`${testID}-map-fallback`}
      >
        <View style={styles.fallbackCrosshair}>
          <View style={styles.crosshairHorizontal} />
          <View style={styles.crosshairVertical} />
        </View>
        <View style={[styles.fallbackCopy, rtl && styles.alignEnd]}>
          <Text
            style={[
              styles.fallbackTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {labels.mapUnavailableTitle}
          </Text>
          <Text
            style={[
              styles.fallbackBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {labels.mapUnavailableBody}
          </Text>
          <Text
            style={styles.fallbackCoordinates}
            testID={`${testID}-map-fallback-coordinates`}
          >
            {coordinateReadout}
          </Text>
        </View>
      </View>
    );
  } else {
    const center: LngLat = [value.longitude, value.latitude];
    mapContent = (
      <View style={styles.mapFrame} testID={`${testID}-map-frame`}>
        <Map
          accessibilityLabel={labels.mapAccessibilityLabel}
          androidView="texture"
          attribution
          attributionPosition={{ bottom: 8, right: 8 }}
          compass={false}
          doubleTapHoldZoom
          doubleTapZoom
          dragPan
          key={mapKey}
          logo={false}
          mapStyle={OPENFREEMAP_LIBERTY_STYLE_URL}
          onDidFailLoadingMap={() => setMapStatus("failed")}
          onDidFinishRenderingMapFully={() => setMapStatus("ready")}
          preferredFramesPerSecond={30}
          scaleBar={false}
          style={styles.map}
          testID={`${testID}-native-map`}
          touchPitch={false}
          touchRotate={false}
          touchZoom
        >
          <Camera
            initialViewState={{ center, zoom: 16 }}
            maxZoom={20}
            minZoom={2}
            testID={`${testID}-native-camera`}
          />
          <ViewAnnotation
            anchor="center"
            draggable={!disabled}
            id="property-pin"
            lngLat={center}
            onDragEnd={(event) => {
              const [longitude, latitude] = event.nativeEvent.lngLat;
              onChange(
                createDraggedPlacePin(
                  value,
                  latitude,
                  longitude,
                  now()
                )
              );
            }}
            title={labels.sectionLabel}
          >
            <View
              accessible
              accessibilityLabel={labels.markerAccessibilityLabel}
              accessibilityRole="image"
              style={styles.marker}
              testID={`${testID}-native-marker`}
            >
              <View style={styles.markerCore} />
            </View>
          </ViewAnnotation>
        </Map>
        <View
          accessible
          accessibilityLabel={labels.mapAttributionLabel}
          pointerEvents="none"
          style={styles.attributionBadge}
          testID={`${testID}-map-attribution`}
        >
          <Text style={styles.attributionText}>
            OpenFreeMap / OpenMapTiles / OpenStreetMap
          </Text>
        </View>
        <View pointerEvents="none" style={styles.voltRule} />
      </View>
    );
  }

  return <EditorControls {...props} mapContent={mapContent} />;
}

export * from "./contract";
export type { PlacePinEditorProps } from "./types";

const styles = StyleSheet.create({
  mapFrame: {
    height: 248,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  map: {
    flex: 1
  },
  attributionBadge: {
    position: "absolute",
    insetInlineStart: spacing.xs,
    top: spacing.xs,
    maxWidth: "82%",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.carbon
  },
  attributionText: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16
  },
  voltRule: {
    position: "absolute",
    insetInlineStart: 0,
    bottom: 0,
    width: 72,
    height: 3,
    backgroundColor: colors.action
  },
  marker: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: radius.round,
    backgroundColor: colors.carbon
  },
  markerCore: {
    width: 9,
    height: 9,
    borderRadius: radius.round,
    backgroundColor: colors.action
  },
  mapFallback: {
    minHeight: 196,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceQuiet
  },
  fallbackCrosshair: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  fallbackCopy: {
    flex: 1,
    gap: spacing.xs
  },
  fallbackTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  fallbackBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  fallbackCoordinates: {
    color: colors.action,
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
    writingDirection: "ltr"
  },
  emptyMap: {
    height: 176,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceQuiet
  },
  emptyRule: {
    position: "absolute",
    insetInlineStart: 20,
    insetInlineEnd: 20,
    top: "50%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong
  },
  emptyCrosshair: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  crosshairHorizontal: {
    position: "absolute",
    width: 18,
    height: 1,
    backgroundColor: colors.textMuted
  },
  crosshairVertical: {
    position: "absolute",
    width: 1,
    height: 18,
    backgroundColor: colors.textMuted
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  }
});
