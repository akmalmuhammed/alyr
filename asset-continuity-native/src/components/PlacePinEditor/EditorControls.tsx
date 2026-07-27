import { Check, Crosshair, MapPin, Trash } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { colors, radius, spacing, typography } from "@/theme/tokens";

import {
  confirmPlacePin,
  createManualPlacePin,
  describePlacePin,
  formatCoordinate,
  hasValidCoordinates,
  normalizeDevicePlacePin,
  parseCoordinateInput,
  placePinEditorLabels,
  type CoordinateInputErrors
} from "./contract";
import type { PlacePinEditorProps } from "./types";

const EMPTY_ERRORS: CoordinateInputErrors = {
  latitude: null,
  longitude: null
};

export interface EditorControlsProps extends PlacePinEditorProps {
  readonly mapContent: React.ReactNode;
  readonly platformNotice?: React.ReactNode;
}

export function EditorControls({
  value,
  onChange,
  onConfirm,
  onRequestCurrentLocation,
  language = "en",
  labels: labelOverrides = {},
  disabled = false,
  testID = "place-pin-editor",
  now = () => new Date().toISOString(),
  headerAccessory,
  mapContent,
  platformNotice
}: EditorControlsProps) {
  const labels = useMemo(
    () => placePinEditorLabels(language, labelOverrides),
    [labelOverrides, language]
  );
  const rtl = language === "ar";
  const [latitudeInput, setLatitudeInput] = useState(
    value ? formatCoordinate(value.latitude) : ""
  );
  const [longitudeInput, setLongitudeInput] = useState(
    value ? formatCoordinate(value.longitude) : ""
  );
  const [errors, setErrors] =
    useState<CoordinateInputErrors>(EMPTY_ERRORS);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    setLatitudeInput(value ? formatCoordinate(value.latitude) : "");
    setLongitudeInput(value ? formatCoordinate(value.longitude) : "");
    setErrors(EMPTY_ERRORS);
  }, [value?.latitude, value?.longitude]);

  const truth = value ? describePlacePin(value, labels) : null;

  const setManualCoordinates = () => {
    const parsed = parseCoordinateInput(
      latitudeInput,
      longitudeInput,
      labels
    );
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors(EMPTY_ERRORS);
    setLocationError(null);
    onChange(
      createManualPlacePin(parsed.latitude, parsed.longitude, now())
    );
  };

  const requestCurrentLocation = async () => {
    if (!onRequestCurrentLocation || locating || disabled) return;
    setLocating(true);
    setLocationError(null);
    try {
      const reading = await onRequestCurrentLocation();
      const normalized = reading
        ? normalizeDevicePlacePin(reading, now())
        : null;
      if (!normalized) {
        setLocationError(labels.locationUnavailable);
        return;
      }
      onChange(normalized);
    } catch {
      setLocationError(labels.locationUnavailable);
    } finally {
      setLocating(false);
    }
  };

  const confirm = () => {
    if (!hasValidCoordinates(value) || disabled) return;
    onConfirm(confirmPlacePin(value, now()));
  };

  return (
    <View
      accessibilityLabel={labels.sectionLabel}
      style={styles.container}
      testID={testID}
    >
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={[styles.headerCopy, rtl && styles.alignEnd]}>
          <Text
            style={[
              styles.eyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {labels.sectionLabel}
          </Text>
          {truth ? (
            <>
              <Text
                style={[
                  styles.truthTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {truth.sourceLabel}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.truthDetail,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
                testID={`${testID}-truth`}
              >
                {truth.detail}
              </Text>
            </>
          ) : (
            <>
              <Text
                style={[
                  styles.truthTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {labels.noPinTitle}
              </Text>
              <Text
                style={[
                  styles.truthDetail,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {labels.noPinBody}
              </Text>
            </>
          )}
        </View>
        {headerAccessory}
      </View>

      {mapContent}
      {platformNotice}

      {value ? (
        <Text
          style={[
            styles.instruction,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {labels.dragInstruction}
        </Text>
      ) : null}

      <View
        style={[styles.coordinateFields, rtl && styles.rowReverse]}
        testID={`${testID}-coordinate-fields`}
      >
        <CoordinateField
          disabled={disabled}
          error={errors.latitude}
          label={labels.latitudeLabel}
          onChangeText={(text) => {
            setLatitudeInput(text);
            if (errors.latitude) {
              setErrors((current) => ({ ...current, latitude: null }));
            }
          }}
          rtl={rtl}
          testID={`${testID}-latitude`}
          value={latitudeInput}
        />
        <CoordinateField
          disabled={disabled}
          error={errors.longitude}
          label={labels.longitudeLabel}
          onChangeText={(text) => {
            setLongitudeInput(text);
            if (errors.longitude) {
              setErrors((current) => ({ ...current, longitude: null }));
            }
          }}
          rtl={rtl}
          testID={`${testID}-longitude`}
          value={longitudeInput}
        />
      </View>
      <Text
        style={[
          styles.helper,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {labels.coordinateExample}
      </Text>

      <View style={[styles.actions, rtl && styles.rowReverse]}>
        <ActionButton
          disabled={disabled}
          icon={<MapPin color={colors.text} size={19} weight="regular" />}
          label={labels.setCoordinates}
          onPress={setManualCoordinates}
          rtl={rtl}
          testID={`${testID}-set-coordinates`}
        />
        {onRequestCurrentLocation ? (
          <ActionButton
            disabled={disabled || locating}
            icon={
              locating ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Crosshair color={colors.text} size={19} weight="regular" />
              )
            }
            label={locating ? labels.locating : labels.useCurrentLocation}
            onPress={requestCurrentLocation}
            rtl={rtl}
            testID={`${testID}-use-current-location`}
          />
        ) : null}
      </View>

      {locationError ? (
        <Text
          accessibilityLiveRegion="assertive"
          style={[
            styles.error,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
          testID={`${testID}-location-error`}
        >
          {locationError}
        </Text>
      ) : null}

      {value ? (
        <Pressable
          accessibilityHint={labels.confirmationHint}
          accessibilityRole="button"
          accessibilityState={{
            disabled,
            selected: truth?.isConfirmed ?? false
          }}
          disabled={disabled}
          onPress={confirm}
          style={({ pressed }) => [
            styles.confirmButton,
            rtl && styles.rowReverse,
            truth?.isConfirmed && styles.confirmButtonConfirmed,
            pressed && styles.pressed,
            disabled && styles.disabled
          ]}
          testID={`${testID}-confirm`}
        >
          <Check color={colors.carbon} size={21} weight="bold" />
          <Text
            style={[
              styles.confirmLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {truth?.isConfirmed ? labels.confirmedPin : labels.confirmPin}
          </Text>
        </Pressable>
      ) : null}

      {value ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onChange(null)}
          style={({ pressed }) => [
            styles.removeButton,
            rtl && styles.rowReverse,
            rtl && styles.removeButtonRtl,
            pressed && styles.pressed,
            disabled && styles.disabled
          ]}
          testID={`${testID}-remove`}
        >
          <Trash color={colors.textMuted} size={18} weight="regular" />
          <Text
            style={[
              styles.removeLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {labels.removeCoordinates}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CoordinateField({
  label,
  value,
  onChangeText,
  error,
  disabled,
  rtl,
  testID
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly error: string | null;
  readonly disabled: boolean;
  readonly rtl: boolean;
  readonly testID: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text
        style={[
          styles.fieldLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        editable={!disabled}
        inputMode="decimal"
        keyboardType="numbers-and-punctuation"
        onChangeText={onChangeText}
        selectionColor={colors.action}
        style={[
          styles.field,
          error && styles.fieldError,
          rtl && styles.rtlText,
          styles.coordinateLtr
        ]}
        testID={testID}
        value={value}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.error,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  rtl,
  testID
}: {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly rtl: boolean;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        rtl && styles.rowReverse,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
      testID={testID}
    >
      {icon}
      <Text
        style={[
          styles.actionLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  headerCopy: {
    flex: 1,
    gap: 3
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  truthTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
    lineHeight: 24
  },
  truthDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  instruction: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  coordinateFields: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  fieldGroup: {
    flex: 1,
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  field: {
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontFamily: typography.body,
    fontSize: 15
  },
  fieldError: {
    borderColor: colors.danger
  },
  helper: {
    marginTop: -spacing.xs,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  actionButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  actionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  confirmButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.action,
    borderRadius: radius.md,
    backgroundColor: colors.action
  },
  confirmButtonConfirmed: {
    borderColor: colors.success,
    backgroundColor: colors.surface
  },
  confirmLabel: {
    color: colors.carbon,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  removeButton: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  removeButtonRtl: {
    alignSelf: "flex-end"
  },
  removeLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  error: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.72
  },
  disabled: {
    opacity: 0.45
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  coordinateLtr: {
    writingDirection: "ltr"
  }
});
