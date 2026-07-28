import { useNavigation, useRouter } from "expo-router";
import type { Icon } from "phosphor-react-native";
import {
  Bank,
  Buildings,
  CalendarBlank,
  Car,
  CaretDown,
  CaretUp,
  Check,
  CreditCard,
  Eye,
  EyeSlash,
  FileText,
  GraduationCap,
  Handshake,
  House,
  Info,
  Receipt,
  Wallet,
  Warning
} from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  findNodeHandle,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { LocalizedDateFieldGroup } from "@/components/LocalizedDateFieldGroup";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  Field,
  ScreenTitle
} from "@/components/ui";
import {
  LIABILITY_KINDS
} from "@/domain/liabilities";
import type { LiabilityKind } from "@/domain/model";
import {
  DEFAULT_PORTFOLIO_CURRENCY,
  normalizePortfolioCurrency,
  parsePortfolioMoney,
  PORTFOLIO_CURRENCY_CHOICES
} from "@/domain/portfolio";
import {
  datePartsFromIso,
  isoFromLocalizedDateParts,
  validateLocalizedDateParts,
  type LocalizedDateParts
} from "@/i18n/dateInput";
import {
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import {
  getPortfolioExperienceCopy,
  liabilityKindLabel
} from "@/i18n/portfolioCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

const COMMON_CURRENCIES = PORTFOLIO_CURRENCY_CHOICES.slice(0, 3);
const COMMON_LIABILITY_KINDS: readonly LiabilityKind[] = [
  "mortgage",
  "vehicle-loan",
  "credit-card",
  "personal-loan"
];
const LIABILITY_KIND_ICONS: Readonly<Record<LiabilityKind, Icon>> = {
  mortgage: House,
  "vehicle-loan": Car,
  "personal-loan": Bank,
  "credit-card": CreditCard,
  "education-loan": GraduationCap,
  installment: Wallet,
  tax: Receipt,
  business: Buildings,
  "family-debt": Handshake,
  other: FileText
};

function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function moneyError(
  result: ReturnType<typeof parsePortfolioMoney>,
  language: "en" | "ar"
): string | null {
  if (result.ok) return null;
  if (language === "en") return result.error;
  switch (result.errorCode) {
    case "invalid-currency":
      return "استخدم رمز عملة من ثلاثة أحرف مثل QAR.";
    case "unsupported-currency":
      return "رمز العملة هذا غير مدعوم على هذا الجهاز.";
    case "empty":
      return "أدخل الرصيد المسجّل.";
    case "invalid-characters":
      return "استخدم الأرقام والفاصلة العشرية فقط، من دون فواصل الآلاف.";
    case "fraction-digits":
      return "يتضمن المبلغ منازل عشرية أكثر مما تدعمه هذه العملة.";
    case "above-range":
      return "يتجاوز هذا المبلغ نطاق الاحتساب الدقيق.";
    case "invalid-number":
      return "أدخل الرصيد باستخدام الأرقام فقط.";
  }
}

export default function LiabilityCreateRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getPortfolioExperienceCopy(language);
  const {
    can,
    clearError,
    createLiability,
    error,
    saving,
    workspace
  } = useWorkspace();
  const submittingRef = useRef(false);
  const allowRemovalRef = useRef(false);
  const nameRef = useRef<TextInput>(null);
  const categoryRef = useRef<View>(null);
  const amountRef = useRef<TextInput>(null);
  const currencyRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const today = localCalendarDate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LiabilityKind | null>(null);
  const [showAllKinds, setShowAllKinds] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountInputHidden, setAmountInputHidden] = useState(true);
  const [currency, setCurrency] = useState(DEFAULT_PORTFOLIO_CURRENCY);
  const [customCurrency, setCustomCurrency] = useState(false);
  const [dateParts, setDateParts] = useState<LocalizedDateParts>(() =>
    datePartsFromIso(today, language)
  );
  const [attempted, setAttempted] = useState(false);
  const parsedMoney = useMemo(
    () => parsePortfolioMoney(amount, currency),
    [amount, currency]
  );
  const normalizedCurrency = normalizePortfolioCurrency(currency);
  const normalizedAsOf = isoFromLocalizedDateParts(dateParts);
  const dateValidation = validateLocalizedDateParts(dateParts, today);
  const dateError =
    dateValidation === "invalid"
      ? copy.create.dateError
      : dateValidation === "future"
        ? copy.create.futureDateError
        : null;
  const hasDraft =
    Boolean(name.trim()) ||
    Boolean(amount.trim()) ||
    kind !== null ||
    currency !== DEFAULT_PORTFOLIO_CURRENCY ||
    normalizedAsOf !== today;
  const canSave =
    Boolean(workspace) &&
    Boolean(name.trim()) &&
    kind !== null &&
    parsedMoney.ok &&
    normalizedCurrency !== null &&
    normalizedAsOf !== null &&
    dateValidation === null;

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!hasDraft || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(copy.create.discardTitle, copy.create.discardBody, [
          { text: copy.create.keepEditing, style: "cancel" },
          {
            text: copy.create.discard,
            style: "destructive",
            onPress: () => {
              allowRemovalRef.current = true;
              navigation.dispatch(event.data.action);
            }
          }
        ]);
      }),
    [copy.create, hasDraft, navigation]
  );

  if (!can("liability.write")) {
    return <PermissionDeniedScreen capability="liability.write" />;
  }

  if (!workspace) {
    return (
      <AppScreen safeEdges={[]} testID="liability-create-unavailable">
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={30} />
          <ScreenTitle size="medium">{copy.detail.notFound}</ScreenTitle>
          <BodyText muted>{copy.detail.notFoundBody}</BodyText>
        </View>
      </AppScreen>
    );
  }

  const save = async () => {
    setAttempted(true);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    if (!kind) {
      requestAnimationFrame(() => {
        if (Platform.OS === "web") {
          (
            categoryRef.current as unknown as {
              focus?: () => void;
            } | null
          )?.focus?.();
          return;
        }
        AccessibilityInfo.announceForAccessibility(
          copy.create.categoryError
        );
        const handle = findNodeHandle(categoryRef.current);
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
      });
      return;
    }
    if (!parsedMoney.ok) {
      if (
        customCurrency &&
        (parsedMoney.errorCode === "invalid-currency" ||
          parsedMoney.errorCode === "unsupported-currency")
      ) {
        currencyRef.current?.focus();
      } else {
        amountRef.current?.focus();
      }
      return;
    }
    if (!normalizedAsOf || dateValidation !== null) {
      dateRef.current?.focus();
      return;
    }
    if (!canSave || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const liability = await createLiability({
        name: name.trim(),
        kind,
        amountMinor: parsedMoney.amountMinor,
        currency: parsedMoney.currency,
        asOf: normalizedAsOf!
      });
      allowRemovalRef.current = true;
      router.replace(`/liability/${liability.id}`);
    } catch {
      submittingRef.current = false;
    }
  };

  const amountError =
    attempted && !parsedMoney.ok ? moneyError(parsedMoney, language) : null;
  const currencyError =
    attempted && normalizedCurrency === null
      ? copy.create.currencyError
      : null;
  const selectedRareKind =
    kind !== null && !COMMON_LIABILITY_KINDS.includes(kind);
  const visibleLiabilityKinds = showAllKinds
    ? LIABILITY_KINDS
    : selectedRareKind && kind
      ? [...COMMON_LIABILITY_KINDS, kind]
      : COMMON_LIABILITY_KINDS;
  const categoryToggleLabel = showAllKinds
    ? copy.create.fewerCategories
    : copy.create.moreCategories;

  return (
    <AppScreen
      footer={
        <Pressable
          accessibilityHint={copy.create.savingHint}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          disabled={saving}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.pressed,
            saving && styles.disabled
          ]}
          testID="liability-save"
        >
          <Check color={colors.carbon} size={21} weight="bold" />
          <Text style={[styles.primaryActionLabel, rtl && styles.arabicMedium]}>
            {copy.create.save}
          </Text>
        </Pressable>
      }
      safeEdges={[]}
      testID="liability-create-screen"
    >
      {error ? (
        <ErrorBanner
          message={localizedWorkspaceError(error, language)}
          onDismiss={clearError}
        />
      ) : null}

      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.eyebrow,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.create.eyebrow}
        </Text>
        <ScreenTitle size="medium">{copy.create.title}</ScreenTitle>
        <BodyText muted>{copy.create.introduction}</BodyText>
      </View>

      <CommandSurface>
        <View style={[styles.commandHeading, rtl && styles.rowReverse]}>
          <CreditCard color={colors.volt} size={23} weight="regular" />
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.create.truthTitle}
          </Text>
        </View>
        <Text
          style={[
            styles.commandBody,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.create.truthBody}
        </Text>
      </CommandSurface>

      <View style={styles.formSection}>
        <Field
          autoCapitalize="words"
          autoCorrect={false}
          description={copy.create.nameDescription}
          error={attempted && !name.trim() ? copy.create.nameError : null}
          label={copy.create.name}
          maxLength={120}
          onChangeText={setName}
          placeholder={copy.create.namePlaceholder}
          ref={nameRef}
          returnKeyType="next"
          testID="liability-name"
          value={name}
        />

        <View style={styles.choiceGroup}>
          <Text
            style={[
              styles.fieldLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.create.category}
          </Text>
          <Text
            style={[
              styles.fieldDescription,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.create.categoryDescription}
          </Text>
          <View
            accessibilityLabel={copy.create.category}
            accessibilityRole="radiogroup"
            style={styles.choiceList}
            testID="liability-category-list"
          >
            {visibleLiabilityKinds.map((choice) => {
              const selected = choice === kind;
              const ChoiceIcon = LIABILITY_KIND_ICONS[choice];
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice}
                  onPress={() => setKind(choice)}
                  ref={choice === "mortgage" ? categoryRef : undefined}
                  style={({ pressed }) => [
                    styles.choiceRow,
                    rtl && styles.rowReverse,
                    selected && styles.choiceRowSelected,
                    pressed && styles.pressed
                  ]}
                  testID={
                    choice === "mortgage"
                      ? "liability-category"
                      : `liability-category-${choice}`
                  }
                >
                  <View
                    style={[
                      styles.choiceIcon,
                      selected && styles.choiceIconSelected
                    ]}
                  >
                    <ChoiceIcon
                      color={selected ? colors.volt : colors.text}
                      size={20}
                      weight="regular"
                    />
                  </View>
                  <View
                    style={[
                      styles.radio,
                      selected && styles.radioSelected
                    ]}
                  >
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.choiceLabel,
                      selected && styles.choiceLabelSelected,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {liabilityKindLabel(choice, language)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {attempted && !kind ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.fieldError,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.create.categoryError}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showAllKinds }}
            onPress={() => setShowAllKinds((current) => !current)}
            style={({ pressed }) => [
              styles.categoryToggle,
              rtl && styles.rowReverse,
              pressed && styles.pressed
            ]}
            testID="liability-category-toggle"
          >
            <Text
              style={[
                styles.categoryToggleLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {categoryToggleLabel}
            </Text>
            {showAllKinds ? (
              <CaretUp color={colors.text} size={18} />
            ) : (
              <CaretDown color={colors.text} size={18} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.rule} />

      <View style={styles.formSection}>
        <View style={styles.amountField}>
          <Field
            description={`${copy.create.amountDescription} ${normalizedCurrency ?? ""}`}
            error={amountError}
            keyboardType="decimal-pad"
            label={copy.create.amount}
            onChangeText={setAmount}
            placeholder={copy.create.amountPlaceholder}
            ref={amountRef}
            returnKeyType="done"
            secureTextEntry={amountInputHidden}
            style={[styles.ltrInput, styles.amountInput]}
            testID="liability-amount"
            value={amount}
          />
          <Pressable
            accessibilityLabel={
              amountInputHidden
                ? copy.create.showAmount
                : copy.create.hideAmount
            }
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => setAmountInputHidden((current) => !current)}
            style={({ pressed }) => [
              styles.amountVisibility,
              pressed && styles.pressed
            ]}
            testID="liability-amount-visibility"
          >
            {amountInputHidden ? (
              <Eye color={colors.text} size={20} weight="regular" />
            ) : (
              <EyeSlash color={colors.text} size={20} weight="regular" />
            )}
          </Pressable>
        </View>

        <View style={styles.choiceGroup}>
          <Text
            style={[
              styles.fieldLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.create.currency}
          </Text>
          <Text
            style={[
              styles.fieldDescription,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.create.currencyDescription}
          </Text>
          <View
            accessibilityLabel={copy.create.currency}
            accessibilityRole="radiogroup"
            style={[styles.currencyGrid, rtl && styles.rowReverse]}
          >
            {COMMON_CURRENCIES.map((choice) => {
              const selected =
                !customCurrency &&
                normalizePortfolioCurrency(currency) === choice.code;
              return (
                <Pressable
                  accessibilityLabel={`${choice.code}, ${choice.label}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.code}
                  onPress={() => {
                    setCurrency(choice.code);
                    setCustomCurrency(false);
                  }}
                  style={({ pressed }) => [
                    styles.currencyChoice,
                    selected && styles.currencyChoiceSelected,
                    pressed && styles.pressed
                  ]}
                  testID={
                    choice.code === "QAR"
                      ? "liability-currency"
                      : `liability-currency-${choice.code}`
                  }
                >
                  <Text
                    style={[
                      styles.currencyChoiceLabel,
                      selected && styles.currencyChoiceLabelSelected
                    ]}
                  >
                    {choice.code}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: customCurrency }}
              onPress={() => {
                setCustomCurrency(true);
                if (
                  COMMON_CURRENCIES.some((choice) => choice.code === currency)
                ) {
                  setCurrency("");
                }
              }}
              style={({ pressed }) => [
                styles.currencyChoice,
                styles.currencyOther,
                customCurrency && styles.currencyChoiceSelected,
                pressed && styles.pressed
              ]}
            >
              <Text
                style={[
                  styles.currencyChoiceLabel,
                  customCurrency && styles.currencyChoiceLabelSelected,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.create.other}
              </Text>
            </Pressable>
          </View>
          {customCurrency ? (
            <Field
              autoCapitalize="characters"
              autoCorrect={false}
              error={currencyError}
              label={copy.create.otherCurrency}
              maxLength={3}
              onChangeText={(value) => setCurrency(value.toUpperCase())}
              placeholder="EUR"
              ref={currencyRef}
              style={styles.ltrInput}
              testID="liability-currency-custom"
              value={currency}
            />
          ) : (
            <View
              accessibilityLabel={normalizedCurrency ?? ""}
              testID="liability-currency-current"
            />
          )}
        </View>

        <LocalizedDateFieldGroup
          datePreviewLabel={copy.create.datePreview}
          dayLabel={copy.create.day}
          description={copy.create.dateDescription}
          error={attempted ? dateError : null}
          inputRef={dateRef}
          invalidPreview={copy.create.validDate}
          label={copy.create.asOf}
          language={language}
          monthLabel={copy.create.month}
          onChange={setDateParts}
          rtl={rtl}
          testID="liability-as-of"
          value={dateParts}
          yearLabel={copy.create.year}
        />
      </View>

      <View style={[styles.dataNote, rtl && styles.rowReverse]}>
        <CalendarBlank color={colors.text} size={22} weight="regular" />
        <View style={styles.dataNoteCopy}>
          <Text
            style={[
              styles.dataNoteTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.create.asOf}
          </Text>
          <Text
            style={[
              styles.dataNoteBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.balance.truthBody}
          </Text>
        </View>
        <Info color={colors.textMuted} size={18} weight="regular" />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  rowReverse: {
    flexDirection: "row-reverse"
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
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.2
  },
  commandHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  commandLabel: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  commandBody: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  formSection: {
    gap: spacing.lg
  },
  choiceGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  fieldDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  fieldError: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  choiceList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  choiceRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  choiceRowSelected: {
    backgroundColor: colors.mist
  },
  choiceIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  choiceIconSelected: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  choiceLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 21
  },
  choiceLabelSelected: {
    fontFamily: typography.bodyMedium
  },
  categoryToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  categoryToggleLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  radio: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  radioSelected: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  rule: {
    height: 1,
    backgroundColor: colors.borderStrong
  },
  currencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  currencyChoice: {
    minWidth: 54,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  currencyOther: {
    minWidth: 72
  },
  currencyChoiceSelected: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  currencyChoiceLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3
  },
  currencyChoiceLabelSelected: {
    color: colors.white
  },
  ltrInput: {
    textAlign: "left",
    writingDirection: "ltr",
    fontVariant: ["tabular-nums"]
  },
  amountField: {
    position: "relative"
  },
  amountInput: {
    paddingEnd: 58
  },
  amountVisibility: {
    position: "absolute",
    right: spacing.xs,
    bottom: spacing.xs,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.mist
  },
  dataNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  dataNoteCopy: {
    flex: 1,
    gap: 2
  },
  dataNoteTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  dataNoteBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  primaryAction: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.volt
  },
  primaryActionLabel: {
    color: colors.carbon,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  notFound: {
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  pressed: {
    opacity: 0.66
  },
  disabled: {
    opacity: 0.42
  }
});
