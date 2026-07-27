import MapView, {
  Marker,
  type MarkerDragStartEndEvent
} from "react-native-maps";
import { StyleSheet, View } from "react-native";

import { colors, radius } from "@/theme/tokens";

import { EditorControls } from "./EditorControls";
import {
  createDraggedPlacePin,
  hasValidCoordinates,
  placePinEditorLabels
} from "./contract";
import type { PlacePinEditorProps } from "./types";

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
  const hasPin = hasValidCoordinates(value);

  const mapContent = hasPin ? (
    <View style={styles.mapFrame} testID={`${testID}-map-frame`}>
      <MapView
        accessibilityLabel={labels.mapAccessibilityLabel}
        initialRegion={{
          latitude: value.latitude,
          longitude: value.longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006
        }}
        key={`${value.latitude.toFixed(6)}:${value.longitude.toFixed(6)}`}
        mapType="standard"
        pitchEnabled={false}
        rotateEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={false}
        style={styles.map}
        testID={`${testID}-native-map`}
        toolbarEnabled={false}
      >
        <Marker
          anchor={{ x: 0.5, y: 0.5 }}
          accessibilityLabel={labels.markerAccessibilityLabel}
          coordinate={{
            latitude: value.latitude,
            longitude: value.longitude
          }}
          draggable={!disabled}
          identifier="property-pin"
          onDragEnd={(event: MarkerDragStartEndEvent) => {
            const coordinate = event.nativeEvent.coordinate;
            onChange(
              createDraggedPlacePin(
                value,
                coordinate.latitude,
                coordinate.longitude,
                now()
              )
            );
          }}
          testID={`${testID}-native-marker`}
          title={labels.sectionLabel}
          tracksViewChanges={false}
        >
          <View style={styles.marker}>
            <View style={styles.markerCore} />
          </View>
        </Marker>
      </MapView>
      <View pointerEvents="none" style={styles.voltRule} />
    </View>
  ) : (
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
  }
});
