import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "@/theme/tokens";

import { EditorControls } from "./EditorControls";
import {
  formatCoordinateReadout,
  hasValidCoordinates,
  placePinEditorLabels
} from "./contract";
import type { PlacePinEditorProps } from "./types";

export function PlacePinEditor(props: PlacePinEditorProps) {
  const {
    value,
    language = "en",
    labels: labelOverrides = {},
    testID = "place-pin-editor"
  } = props;
  const labels = placePinEditorLabels(language, labelOverrides);
  const rtl = language === "ar";
  const hasPin = hasValidCoordinates(value);

  const mapContent = (
    <View
      accessibilityLabel={
        hasPin
          ? `${labels.webPreviewLabel}: ${formatCoordinateReadout(
              value.latitude,
              value
            )}, ${formatCoordinateReadout(value.longitude, value)}`
          : labels.noPinBody
      }
      accessibilityRole="image"
      style={styles.preview}
      testID={`${testID}-web-preview`}
    >
      <View style={styles.gridHorizontalA} />
      <View style={styles.gridHorizontalB} />
      <View style={styles.gridVerticalA} />
      <View style={styles.gridVerticalB} />
      {hasPin ? (
        <View
          accessibilityLabel={labels.markerAccessibilityLabel}
          accessibilityRole="image"
          style={styles.pin}
          testID={`${testID}-web-pin`}
        >
          <View style={styles.pinCore} />
        </View>
      ) : null}
      <View style={[styles.coordinateReadout, rtl && styles.readoutRtl]}>
        <Text style={[styles.readoutLabel, rtl && styles.arabicMedium]}>
          {hasPin ? labels.webPreviewLabel : labels.noPinTitle}
        </Text>
        {hasPin ? (
          <Text style={styles.readoutValue}>
            {formatCoordinateReadout(value.latitude, value)},{" "}
            {formatCoordinateReadout(value.longitude, value)}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const platformNotice = (
    <Text style={[styles.notice, rtl && styles.arabic]}>
      {labels.webPreviewBody}
    </Text>
  );

  return (
    <EditorControls
      {...props}
      mapContent={mapContent}
      platformNotice={platformNotice}
    />
  );
}

export * from "./contract";
export type { PlacePinEditorProps } from "./types";

const styles = StyleSheet.create({
  preview: {
    position: "relative",
    height: 224,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceQuiet
  },
  gridHorizontalA: {
    position: "absolute",
    insetInlineStart: 0,
    insetInlineEnd: 0,
    top: "33%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border
  },
  gridHorizontalB: {
    position: "absolute",
    insetInlineStart: 0,
    insetInlineEnd: 0,
    top: "66%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border
  },
  gridVerticalA: {
    position: "absolute",
    top: 0,
    bottom: 0,
    insetInlineStart: "33%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border
  },
  gridVerticalB: {
    position: "absolute",
    top: 0,
    bottom: 0,
    insetInlineStart: "66%",
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border
  },
  pin: {
    position: "absolute",
    insetInlineStart: "50%",
    top: "50%",
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginInlineStart: -15,
    marginTop: -15,
    borderRadius: radius.round,
    backgroundColor: colors.carbon
  },
  pinCore: {
    width: 8,
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.action
  },
  coordinateReadout: {
    position: "absolute",
    insetInlineStart: spacing.sm,
    bottom: spacing.sm,
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
    backgroundColor: colors.carbon
  },
  readoutRtl: {
    alignItems: "flex-end"
  },
  readoutLabel: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 15
  },
  readoutValue: {
    color: colors.action,
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 16,
    writingDirection: "ltr"
  },
  notice: {
    marginTop: -spacing.xs,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  arabic: {
    fontFamily: typography.arabic,
    textAlign: "right"
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    textAlign: "right"
  }
});
