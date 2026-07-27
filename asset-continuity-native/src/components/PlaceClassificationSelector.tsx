import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PlaceClassification } from "@/domain/model";
import { getCaptureCopy } from "@/i18n/captureCopy";
import { useLocale } from "@/i18n/LocaleProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const CLASSIFICATION_CHOICES: readonly PlaceClassification[] = [
  "owned_property",
  "rented_or_managed",
  "storage",
  "temporary",
  "unknown"
] as const;

export function PlaceClassificationSelector({
  onChange,
  testID,
  value
}: {
  readonly onChange: (value: PlaceClassification) => void;
  readonly testID?: string;
  readonly value: PlaceClassification;
}) {
  const { language, rtl } = useLocale();
  const copy = getCaptureCopy(language);

  return (
    <View style={styles.group} testID={testID}>
      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.title,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.placeClassification}
        </Text>
        <Text
          style={[
            styles.description,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.placeClassificationDescription}
        </Text>
      </View>

      <View
        accessibilityLabel={copy.placeClassification}
        accessibilityRole="radiogroup"
        style={styles.choices}
      >
        {CLASSIFICATION_CHOICES.map((choice, index) => {
          const active = value === choice;
          const option = copy.placeClassificationChoices[choice];
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              key={choice}
              onPress={() => onChange(choice)}
              style={({ pressed }) => [
                styles.choice,
                index === CLASSIFICATION_CHOICES.length - 1 &&
                  styles.choiceLast,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
              testID={`place-classification-${choice}`}
            >
              <View
                style={[
                  styles.radio,
                  active && styles.radioActive
                ]}
              >
                {active ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.choiceCopy}>
                <Text
                  style={[
                    styles.label,
                    active && styles.labelActive,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm
  },
  heading: {
    gap: 3
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  choices: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong
  },
  choice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  choiceLast: {
    borderBottomWidth: 0
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  radioActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  choiceCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  label: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  labelActive: {
    fontFamily: typography.bodyBold
  },
  meta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  pressed: {
    opacity: 0.72
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
