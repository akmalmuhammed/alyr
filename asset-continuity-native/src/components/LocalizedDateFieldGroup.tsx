import type { RefObject } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import type { LanguageCode } from "@/domain/model";
import {
  isoFromLocalizedDateParts,
  localizeDateDigits,
  normalizeLocaleDigits,
  shouldStackLocalizedDateFields,
  type LocalizedDateParts
} from "@/i18n/dateInput";
import { formatLocalizedDate } from "@/i18n/coreJourneyCopy";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

interface LocalizedDateFieldGroupProps {
  readonly datePreviewLabel: string;
  readonly dayLabel: string;
  readonly description?: string;
  readonly error?: string | null;
  readonly inputRef?: RefObject<TextInput | null> | undefined;
  readonly invalidPreview: string;
  readonly label: string;
  readonly language: LanguageCode;
  readonly monthLabel: string;
  readonly onBlur?: (() => void) | undefined;
  readonly onChange: (value: LocalizedDateParts) => void;
  readonly rtl: boolean;
  readonly testID: string;
  readonly value: LocalizedDateParts;
  readonly yearLabel: string;
}

function acceptsLocalizedDateDigits(value: string): boolean {
  return /^\d*$/u.test(normalizeLocaleDigits(value));
}

export function LocalizedDateFieldGroup({
  datePreviewLabel,
  dayLabel,
  description,
  error,
  inputRef,
  invalidPreview,
  label,
  language,
  monthLabel,
  onBlur,
  onChange,
  rtl,
  testID,
  value,
  yearLabel
}: LocalizedDateFieldGroupProps) {
  const { fontScale, width } = useWindowDimensions();
  const stacked = shouldStackLocalizedDateFields(width, fontScale);
  const normalized = isoFromLocalizedDateParts(value);
  const readableDate = normalized
    ? formatLocalizedDate(normalized, language)
    : invalidPreview;

  return (
    <View
      accessibilityLabel={label}
      accessibilityValue={{ text: readableDate }}
      style={styles.group}
      testID={testID}
    >
      <Text
        style={[
          styles.groupLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      {description ? (
        <Text
          style={[
            styles.description,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {description}
        </Text>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.preview,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {datePreviewLabel}: {readableDate}
      </Text>
      <View
        style={[
          styles.fields,
          rtl && !stacked && styles.rowReverse,
          stacked && styles.fieldsStacked
        ]}
      >
        <DatePartField
          inputRef={inputRef}
          label={dayLabel}
          maxLength={2}
          onBlur={onBlur}
          onChange={(day) => onChange({ ...value, day })}
          placeholder={localizeDateDigits("28", language)}
          rtl={rtl}
          testID={`${testID}-day`}
          value={value.day}
        />
        <DatePartField
          label={monthLabel}
          maxLength={2}
          onBlur={onBlur}
          onChange={(month) => onChange({ ...value, month })}
          placeholder={localizeDateDigits("07", language)}
          rtl={rtl}
          testID={`${testID}-month`}
          value={value.month}
        />
        <DatePartField
          label={yearLabel}
          maxLength={4}
          onBlur={onBlur}
          onChange={(year) => onChange({ ...value, year })}
          placeholder={localizeDateDigits("2026", language)}
          rtl={rtl}
          testID={`${testID}-year`}
          value={value.year}
        />
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          role="alert"
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

function DatePartField({
  inputRef,
  label,
  maxLength,
  onBlur,
  onChange,
  placeholder,
  rtl,
  testID,
  value
}: {
  readonly inputRef?: RefObject<TextInput | null> | undefined;
  readonly label: string;
  readonly maxLength: number;
  readonly onBlur?: (() => void) | undefined;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly rtl: boolean;
  readonly testID: string;
  readonly value: string;
}) {
  return (
    <View style={styles.part}>
      <Text
        style={[
          styles.partLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={maxLength}
        onBlur={onBlur}
        onChangeText={(next) => {
          if (acceptsLocalizedDateDigits(next)) onChange(next);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        ref={inputRef}
        selectionColor={colors.action}
        style={styles.input}
        testID={testID}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs
  },
  groupLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  preview: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  fields: {
    flexDirection: "row",
    gap: spacing.sm
  },
  fieldsStacked: {
    flexDirection: "column"
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  part: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  partLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18
  },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontFamily: typography.bodyMedium,
    fontSize: 17,
    textAlign: "center",
    writingDirection: "ltr",
    fontVariant: ["tabular-nums"]
  },
  error: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  arabic: {
    fontFamily: typography.arabic,
    letterSpacing: 0
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  }
});
