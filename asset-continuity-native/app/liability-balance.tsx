import {
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import {
  CalendarBlank,
  Check,
  ClockCounterClockwise,
  Eye,
  EyeSlash,
  Warning
} from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
  DEFAULT_PORTFOLIO_CURRENCY,
  getPortfolioValueHistory,
  normalizePortfolioCurrency,
  parsePortfolioMoney,
  type PortfolioValueRecord,
  portfolioMinorUnitsToInput,
  PORTFOLIO_CURRENCY_CHOICES
} from "@/domain/portfolio";
import {
  datePartsFromIso,
  isoFromLocalizedDateParts,
  validateLocalizedDateParts,
  type LocalizedDateParts
} from "@/i18n/dateInput";
import {
  formatLocalizedDate,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import {
  formatRecordedValue,
  valueVisibilityFromHidden
} from "@/privacy/ValueVisibility";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

const COMMON_CURRENCIES = PORTFOLIO_CURRENCY_CHOICES.slice(0, 6);

interface BalanceEditorSource {
  readonly revisionKey: string;
  readonly amount: string;
  readonly currency: string;
  readonly customCurrency: boolean;
  readonly asOf: string;
}

function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function balanceEditorSource(
  liabilityId: string,
  current: PortfolioValueRecord | null,
  today: string
): BalanceEditorSource {
  const currency = current?.currency ?? DEFAULT_PORTFOLIO_CURRENCY;
  return {
    revisionKey: [
      liabilityId,
      current?.id ?? "no-balance",
      current?.amountMinor ?? "",
      current?.currency ?? "",
      current?.asOf ?? ""
    ].join("\u001f"),
    amount: current
      ? portfolioMinorUnitsToInput(current.amountMinor, current.currency)
      : "",
    currency,
    customCurrency: !COMMON_CURRENCIES.some(
      (choice) => choice.code === currency
    ),
    asOf: current?.asOf.slice(0, 10) ?? today
  };
}

function localizedMoneyError(
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
      return "يتضمن الرصيد منازل عشرية أكثر مما تدعمه هذه العملة.";
    case "above-range":
      return "يتجاوز هذا الرصيد نطاق الاحتساب الدقيق.";
    case "invalid-number":
      return "أدخل الرصيد باستخدام الأرقام فقط.";
  }
}

export default function LiabilityBalanceRoute() {
  const { liabilityId, returnTo } = useLocalSearchParams<{
    liabilityId?: string;
    returnTo?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getPortfolioExperienceCopy(language);
  const { amountsHidden } = usePortfolioPrivacy();
  const {
    can,
    clearError,
    error,
    recordPortfolioValue,
    saving,
    workspace
  } = useWorkspace();
  const liability = workspace?.liabilities?.find(
    (record) => record.id === liabilityId
  );
  const history =
    workspace && liability
      ? getPortfolioValueHistory(workspace, {
          kind: "liability",
          liabilityId: liability.id
        })
      : [];
  const current = history[0] ?? null;
  const today = localCalendarDate();
  const incomingSource = useMemo(
    () =>
      balanceEditorSource(
        liability?.id ?? liabilityId ?? "missing-liability",
        current,
        today
      ),
    [
      current?.amountMinor,
      current?.asOf,
      current?.currency,
      current?.id,
      liability?.id,
      liabilityId,
      today
    ]
  );
  const [baseline, setBaseline] = useState(incomingSource);
  const [amount, setAmount] = useState(incomingSource.amount);
  const [amountInputHidden, setAmountInputHidden] = useState(true);
  const [currency, setCurrency] = useState(incomingSource.currency);
  const [customCurrency, setCustomCurrency] = useState(
    incomingSource.customCurrency
  );
  const [dateParts, setDateParts] = useState<LocalizedDateParts>(() =>
    datePartsFromIso(incomingSource.asOf, language)
  );
  const [concurrentSource, setConcurrentSource] =
    useState<BalanceEditorSource | null>(null);
  const [replacementConfirmedRevision, setReplacementConfirmedRevision] =
    useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const allowRemovalRef = useRef(false);
  const submittingRef = useRef(false);
  const amountRef = useRef<TextInput>(null);
  const currencyRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
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
    amount !== baseline.amount ||
    currency !== baseline.currency ||
    normalizedAsOf !== baseline.asOf;
  const incomingMatchesDraft =
    amount === incomingSource.amount &&
    normalizedCurrency === incomingSource.currency &&
    normalizedAsOf === incomingSource.asOf;
  const canSave =
    Boolean(liability) &&
    hasDraft &&
    concurrentSource === null &&
    parsedMoney.ok &&
    normalizedCurrency !== null &&
    normalizedAsOf !== null &&
    dateValidation === null;
  const formattedCurrent = current
    ? formatRecordedValue({
        amountMinor: current.amountMinor,
        currency: current.currency,
        language,
        visibility: valueVisibilityFromHidden(amountsHidden)
      })
    : null;

  useEffect(() => {
    if (incomingSource.revisionKey === baseline.revisionKey) {
      if (concurrentSource) {
        setConcurrentSource(null);
        setReplacementConfirmedRevision(null);
      }
      return;
    }

    if (!hasDraft || incomingMatchesDraft) {
      setBaseline(incomingSource);
      setAmount(incomingSource.amount);
      setCurrency(incomingSource.currency);
      setCustomCurrency(incomingSource.customCurrency);
      setDateParts(datePartsFromIso(incomingSource.asOf, language));
      setConcurrentSource(null);
      setReplacementConfirmedRevision(null);
      setAttempted(false);
      return;
    }

    if (concurrentSource?.revisionKey !== incomingSource.revisionKey) {
      setConcurrentSource(incomingSource);
      setReplacementConfirmedRevision(null);
    }
  }, [
    baseline.revisionKey,
    concurrentSource?.revisionKey,
    hasDraft,
    incomingMatchesDraft,
    incomingSource
  ]);

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

  if (!workspace || !liability) {
    return (
      <AppScreen safeEdges={[]} testID="liability-balance-not-found">
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
    if (!hasDraft || concurrentSource) return;
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
      await recordPortfolioValue({
        liabilityId: liability.id,
        amountMinor: parsedMoney.amountMinor,
        currency: parsedMoney.currency,
        asOf: normalizedAsOf!
      });
      allowRemovalRef.current = true;
      if (router.canGoBack()) {
        router.back();
      } else if (returnTo === "dashboard") {
        router.replace("/dashboard");
      } else {
        router.replace(`/liability/${liability.id}`);
      }
    } catch {
      submittingRef.current = false;
    }
  };

  const loadConcurrentBalance = () => {
    if (!concurrentSource) return;
    setBaseline(concurrentSource);
    setAmount(concurrentSource.amount);
    setCurrency(concurrentSource.currency);
    setCustomCurrency(concurrentSource.customCurrency);
    setDateParts(datePartsFromIso(concurrentSource.asOf, language));
    setConcurrentSource(null);
    setReplacementConfirmedRevision(null);
    setAttempted(false);
  };

  const confirmDraftAfterConcurrentBalance = () => {
    if (!concurrentSource) return;
    setBaseline(concurrentSource);
    setConcurrentSource(null);
    setReplacementConfirmedRevision(concurrentSource.revisionKey);
    setAttempted(false);
  };

  return (
    <AppScreen
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave || saving, busy: saving }}
          disabled={!canSave || saving}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.pressed,
            (!canSave || saving) && styles.disabled
          ]}
          testID="liability-balance-save"
        >
          <Check color={colors.carbon} size={21} weight="bold" />
          <Text style={[styles.primaryActionLabel, rtl && styles.arabicMedium]}>
            {current ? copy.balance.update : copy.balance.save}
          </Text>
        </Pressable>
      }
      safeEdges={[]}
      testID="liability-balance-screen"
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
          {copy.balance.eyebrow}
        </Text>
        <ScreenTitle size="medium">{copy.balance.title}</ScreenTitle>
        <BodyText muted>{copy.balance.introduction}</BodyText>
      </View>

      <CommandSurface>
        <View style={[styles.commandHeading, rtl && styles.rowReverse]}>
          <ClockCounterClockwise
            color={colors.volt}
            size={23}
            weight="regular"
          />
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.balance.current}
          </Text>
        </View>
        <Text
          accessibilityLabel={
            current && formattedCurrent
              ? `${formattedCurrent.accessibilityLabel}. ${copy.detail.balanceAsOf(
                  formatLocalizedDate(current.asOf, language)
                )}`
              : copy.balance.noCurrent
          }
          style={[
            styles.commandValue,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {current && formattedCurrent
            ? formattedCurrent.text
            : copy.balance.noCurrent}
        </Text>
        {current ? (
          <Text
            style={[
              styles.commandMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.detail.balanceAsOf(
              formatLocalizedDate(current.asOf, language)
            )}
          </Text>
        ) : null}
      </CommandSurface>

      {concurrentSource ? (
        <View
          accessibilityLiveRegion="assertive"
          style={styles.concurrentUpdate}
          testID="liability-balance-concurrent-update"
        >
          <View style={[styles.concurrentHeading, rtl && styles.rowReverse]}>
            <Warning color={colors.warning} size={22} weight="regular" />
            <Text
              accessibilityRole="alert"
              style={[
                styles.concurrentTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.balance.concurrentUpdateTitle}
            </Text>
          </View>
          <Text
            style={[
              styles.concurrentBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.balance.concurrentUpdateBody}
          </Text>
          <View style={styles.concurrentActions}>
            <Pressable
              accessibilityRole="button"
              onPress={loadConcurrentBalance}
              style={({ pressed }) => [
                styles.concurrentSecondaryAction,
                pressed && styles.pressed
              ]}
              testID="liability-balance-load-concurrent"
            >
              <Text
                style={[
                  styles.concurrentSecondaryLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.balance.reloadUpdatedBalance}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDraftAfterConcurrentBalance}
              style={({ pressed }) => [
                styles.concurrentPrimaryAction,
                pressed && styles.pressed
              ]}
              testID="liability-balance-confirm-replace"
            >
              <Text
                style={[
                  styles.concurrentPrimaryLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.balance.confirmReplace}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : replacementConfirmedRevision === baseline.revisionKey &&
        hasDraft ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.replaceConfirmed,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
          testID="liability-balance-replace-confirmed"
        >
          {copy.balance.replaceConfirmed}
        </Text>
      ) : null}

      <View style={styles.form}>
        <View style={styles.amountField}>
          <Field
            description={`${copy.create.amountDescription} ${normalizedCurrency ?? ""}`}
            error={
              attempted && !parsedMoney.ok
                ? localizedMoneyError(parsedMoney, language)
                : null
            }
            keyboardType="decimal-pad"
            label={copy.create.amount}
            onChangeText={setAmount}
            placeholder={copy.create.amountPlaceholder}
            ref={amountRef}
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
              error={
                attempted && normalizedCurrency === null
                  ? copy.create.currencyError
                  : null
              }
              label={copy.create.otherCurrency}
              maxLength={3}
              onChangeText={(value) => setCurrency(value.toUpperCase())}
              placeholder="EUR"
              ref={currencyRef}
              style={styles.ltrInput}
              testID="liability-currency-custom"
              value={currency}
            />
          ) : null}
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

      <View style={[styles.truth, rtl && styles.rowReverse]}>
        <CalendarBlank color={colors.text} size={22} weight="regular" />
        <View style={styles.truthCopy}>
          <Text
            style={[
              styles.truthTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.balance.truthTitle}
          </Text>
          <Text
            style={[
              styles.truthBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.balance.truthBody}
          </Text>
        </View>
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
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
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
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  commandValue: {
    color: colors.white,
    fontFamily: typography.displayBold,
    fontSize: 27,
    lineHeight: 34,
    fontVariant: ["tabular-nums"]
  },
  commandMeta: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  form: {
    gap: spacing.lg
  },
  concurrentUpdate: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.sm,
    backgroundColor: colors.warningQuiet
  },
  concurrentHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  concurrentTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  concurrentBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  concurrentActions: {
    gap: spacing.xs
  },
  concurrentSecondaryAction: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  concurrentSecondaryLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  concurrentPrimaryAction: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.carbon
  },
  concurrentPrimaryLabel: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  replaceConfirmed: {
    color: colors.success,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
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
    lineHeight: 18
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
  truth: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  truthCopy: {
    flex: 1,
    gap: 2
  },
  truthTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  truthBody: {
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
