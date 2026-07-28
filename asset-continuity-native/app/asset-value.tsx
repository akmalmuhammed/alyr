import {
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import {
  CalendarBlank,
  ClockCounterClockwise,
  CurrencyCircleDollar,
  Warning
} from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  Field,
  PrimaryButton,
  ScreenTitle,
  Section
} from "@/components/ui";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  DEFAULT_PORTFOLIO_CURRENCY,
  getPortfolioValueHistory,
  normalizePortfolioCurrency,
  parsePortfolioMoney,
  portfolioMinorUnitsToInput,
  PORTFOLIO_CURRENCY_CHOICES,
  selectCurrentPortfolioValues,
  type PortfolioCurrencyChoice,
  type PortfolioMoneyParseResult
} from "@/domain/portfolio";
import type { LanguageCode } from "@/domain/model";
import { isOwnedPropertyPlace } from "@/domain/model";
import {
  datePartsFromIso,
  isoFromLocalizedDateParts,
  normalizeLocaleDigits,
  shouldStackLocalizedDateFields,
  validateLocalizedDateParts,
  type LocalizedDateParts
} from "@/i18n/dateInput";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  localizedWorkspaceError,
  localeTag,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import { formatRecordedValue } from "@/privacy/ValueVisibility";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

const COMMON_CURRENCIES = PORTFOLIO_CURRENCY_CHOICES.slice(0, 6);

interface ValueSubjectCopy {
  readonly assetEyebrow: string;
  readonly placeEyebrow: string;
  readonly assetTitle: string;
  readonly placeTitle: string;
  readonly assetIntro: string;
  readonly placeIntro: string;
  readonly assetNoValue: string;
  readonly placeNoValue: string;
  readonly assetNotFound: string;
  readonly assetNotFoundBody: string;
  readonly placeNotFound: string;
  readonly placeNotFoundBody: string;
  readonly placeNotOwned: string;
  readonly placeNotOwnedBody: string;
  readonly reviewPlace: string;
  readonly assetMeaning: string;
  readonly placeMeaning: string;
  readonly placeSync: string;
}

export const VALUE_SUBJECT_COPY = {
  en: {
    assetEyebrow: "ASSET PASSPORT",
    placeEyebrow: "PROPERTY RECORD",
    assetTitle: "Record an item value",
    placeTitle: "Record a property value",
    assetIntro:
      "Enter a value you know. ALYR keeps currencies separate and never fills in a price for you.",
    placeIntro:
      "Enter your own dated property value. ALYR does not estimate it or fetch a market price.",
    assetNoValue: "No value has been recorded for this item.",
    placeNoValue: "No value has been recorded for this property.",
    assetNotFound: "Item not found",
    assetNotFoundBody:
      "This item is not available in the current household.",
    placeNotFound: "Property not found",
    placeNotFoundBody:
      "This Place is not available in the current household.",
    placeNotOwned: "Confirm property ownership first",
    placeNotOwnedBody:
      "This Place stays outside Portfolio values until you explicitly mark it as household-owned property.",
    reviewPlace: "Review Place relationship",
    assetMeaning:
      "This is your dated item-value record. It is not a live market quote, formal appraisal or net worth. Liabilities, taxes, selling costs and currency conversion are excluded.",
    placeMeaning:
      "This is your dated property-value record. It is not a live market quote, formal valuation or proof of ownership. Mortgages, liabilities, taxes, selling costs and currency conversion are excluded.",
    placeSync:
      "Saved to this encrypted device first, then synced with your household when online."
  },
  ar: {
    assetEyebrow: "جواز الغرض",
    placeEyebrow: "سجل العقار",
    assetTitle: "سجّل قيمة الغرض",
    placeTitle: "سجّل قيمة العقار",
    assetIntro:
      "أدخل قيمة تعرفها. يحفظ ALYR كل عملة على حدة ولا يقدّر السعر نيابةً عنك.",
    placeIntro:
      "أدخل قيمة مؤرخة دوّنتها للعقار. لا يقدّرها ALYR ولا يجلب سعرًا من السوق.",
    assetNoValue: "لم تُسجّل قيمة لهذا الغرض.",
    placeNoValue: "لم تُسجّل قيمة لهذا العقار.",
    assetNotFound: "الغرض غير موجود",
    assetNotFoundBody: "هذا الغرض غير متاح ضمن الأسرة الحالية.",
    placeNotFound: "العقار غير موجود",
    placeNotFoundBody: "هذا المكان غير متاح ضمن الأسرة الحالية.",
    placeNotOwned: "أكّد ملكية العقار أولاً",
    placeNotOwnedBody:
      "يبقى هذا المكان خارج قيم المحفظة حتى تحدده صراحةً كعقار تملكه الأسرة.",
    reviewPlace: "مراجعة علاقة المكان",
    assetMeaning:
      "هذه قيمة مؤرخة دوّنتها للغرض. ليست سعر سوق مباشرًا ولا تقييمًا رسميًا ولا صافي ثروة. لا تشمل الالتزامات أو الضرائب أو تكاليف البيع أو تحويل العملات.",
    placeMeaning:
      "هذه قيمة مؤرخة دوّنتها للعقار. ليست سعر سوق مباشرًا ولا تقييمًا رسميًا ولا إثبات ملكية. لا تشمل الرهن أو الالتزامات أو الضرائب أو تكاليف البيع أو تحويل العملات.",
    placeSync:
      "تُحفظ أولًا على هذا الجهاز المشفّر، ثم تتزامن مع أسرتك عند الاتصال بالإنترنت."
  }
} as const satisfies Record<LanguageCode, ValueSubjectCopy>;

const ARABIC_CURRENCY_NAMES: Readonly<Record<string, string>> = {
  QAR: "الريال القطري",
  USD: "الدولار الأمريكي",
  EUR: "اليورو",
  GBP: "الجنيه الإسترليني",
  AED: "الدرهم الإماراتي",
  SAR: "الريال السعودي",
  KWD: "الدينار الكويتي",
  BHD: "الدينار البحريني",
  OMR: "الريال العُماني",
  JPY: "الين الياباني"
};

export function portfolioCurrencyAccessibilityLabel(
  choice: PortfolioCurrencyChoice,
  language: LanguageCode
): string {
  const name =
    language === "ar"
      ? ARABIC_CURRENCY_NAMES[choice.code] ?? choice.code
      : choice.label;
  return `${choice.code}, ${name}`;
}

export function localizedPortfolioMoneyError(
  result: PortfolioMoneyParseResult,
  language: LanguageCode
): string | null {
  if (result.ok) return null;
  if (language === "en") return result.error;
  switch (result.errorCode) {
    case "invalid-currency":
      return "استخدم رمز عملة من ثلاثة أحرف مثل QAR.";
    case "unsupported-currency":
      return "رمز العملة هذا غير مدعوم على هذا الجهاز.";
    case "empty":
      return "أدخل قيمة مسجّلة.";
    case "invalid-characters":
      return "استخدم الأرقام والفاصلة العشرية فقط، من دون فواصل الآلاف.";
    case "fraction-digits": {
      const currency = result.currency ?? "";
      const digits = result.fractionDigits ?? 0;
      if (digits === 0) {
        return `تُسجّل ${currency} من دون منازل عشرية.`;
      }
      if (digits === 1) {
        return `تدعم ${currency} منزلة عشرية واحدة كحد أقصى.`;
      }
      if (digits === 2) {
        return `تدعم ${currency} منزلتين عشريتين كحد أقصى.`;
      }
      return `تدعم ${currency} ${formatLocalizedNumber(
        digits,
        "ar"
      )} منازل عشرية كحد أقصى.`;
    }
    case "above-range":
      return "تتجاوز هذه القيمة النطاق الدقيق المدعوم.";
    case "invalid-number":
      return "أدخل القيمة المسجّلة باستخدام الأرقام فقط.";
  }
}

function isCommonCurrency(value: string): boolean {
  return COMMON_CURRENCIES.some((choice) => choice.code === value);
}

function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function acceptsDateDigits(value: string): boolean {
  return /^\d*$/u.test(normalizeLocaleDigits(value));
}

export default function AssetValueRoute() {
  const { assetId, placeId, returnTo } = useLocalSearchParams<{
    assetId?: string;
    placeId?: string;
    returnTo?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { fontScale, width } = useWindowDimensions();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const {
    amountsHidden,
    visibility: valueVisibility
  } = usePortfolioPrivacy();
  const subjectCopy = VALUE_SUBJECT_COPY[language];
  const allowRemovalRef = useRef(false);
  const submittingRef = useRef(false);
  const hydratedSubjectRef = useRef<string | null>(null);
  const {
    clearError,
    can,
    error,
    recordPortfolioValue,
    recordedPortfolioValues,
    repository,
    saving,
    workspace
  } = useWorkspace();
  const ambiguousSubject = Boolean(assetId && placeId);
  const asset = !ambiguousSubject
    ? workspace?.assets.find((item) => item.id === assetId)
    : undefined;
  const place = !ambiguousSubject
    ? workspace?.places.find((item) => item.id === placeId)
    : undefined;
  const subject = asset
    ? ({ kind: "asset", assetId: asset.id } as const)
    : place
      ? ({ kind: "place", placeId: place.id } as const)
      : null;
  const targetName = asset?.name ?? place?.name ?? "";
  const subjectKey = subject
    ? subject.kind === "asset"
      ? `asset:${subject.assetId}`
      : `place:${subject.placeId}`
    : null;
  const current = subject
    ? selectCurrentPortfolioValues(
        asset ? [asset] : [],
        recordedPortfolioValues,
        place ? [place] : []
      ).records[0] ?? null
    : null;
  const history =
    workspace && subject
      ? getPortfolioValueHistory(workspace, subject)
      : [];
  const formattedCurrent = current
    ? formatRecordedValue({
        amountMinor: current.amountMinor,
        currency: current.currency,
        language,
        locale: localeTag(language),
        visibility: valueVisibility
      })
    : null;
  const formattedHistory = history.map((record) => ({
    record,
    formatted: formatRecordedValue({
      amountMinor: record.amountMinor,
      currency: record.currency,
      language,
      locale: localeTag(language),
      visibility: valueVisibility
    })
  }));
  const initialCurrency =
    current?.currency ?? DEFAULT_PORTFOLIO_CURRENCY;
  const initialAmount = current
    ? portfolioMinorUnitsToInput(
        current.amountMinor,
        current.currency
      )
    : "";
  const initialAsOf = current?.asOf.slice(0, 10) ?? localCalendarDate();
  const initialDateParts = datePartsFromIso(initialAsOf, language);
  const [currency, setCurrency] = useState(initialCurrency);
  const [customCurrencyActive, setCustomCurrencyActive] = useState(
    !isCommonCurrency(initialCurrency)
  );
  const [amount, setAmount] = useState(initialAmount);
  const [dateParts, setDateParts] =
    useState<LocalizedDateParts>(initialDateParts);
  const [attempted, setAttempted] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const today = localCalendarDate();
  const normalizedCurrency = normalizePortfolioCurrency(currency);
  const normalizedAsOf = isoFromLocalizedDateParts(dateParts);
  const parsedMoney = useMemo(
    () => parsePortfolioMoney(amount, currency),
    [amount, currency]
  );
  const dateValidation = validateLocalizedDateParts(dateParts, today);
  const dateValidationMessage =
    dateValidation === "invalid"
      ? copy.assetValue.invalidDate
      : dateValidation === "future"
        ? copy.assetValue.futureDate
        : null;
  const hasDraft =
    amount !== initialAmount ||
    currency !== initialCurrency ||
    normalizedAsOf !== initialAsOf;
  const canSave =
    hasDraft &&
    normalizedCurrency !== null &&
    parsedMoney.ok &&
    normalizedAsOf !== null &&
    dateValidation === null;

  useEffect(() => {
    if (!subjectKey || hydratedSubjectRef.current === subjectKey) {
      return;
    }
    hydratedSubjectRef.current = subjectKey;
    setCurrency(initialCurrency);
    setCustomCurrencyActive(!isCommonCurrency(initialCurrency));
    setAmount(initialAmount);
    setDateParts(initialDateParts);
    setAttempted(false);
    setAmountTouched(false);
    setCurrencyTouched(false);
    setDateTouched(false);
  }, [
    subjectKey,
    initialAmount,
    initialAsOf,
    initialCurrency,
    initialDateParts.day,
    initialDateParts.month,
    initialDateParts.year
  ]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!hasDraft || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(
          copy.assetValue.discardTitle,
          copy.assetValue.discardBody,
          [
            { text: copy.assetValue.keepEditing, style: "cancel" },
            {
              text: copy.assetValue.discard,
              style: "destructive",
              onPress: () => {
                allowRemovalRef.current = true;
                navigation.dispatch(event.data.action);
              }
            }
          ]
        );
      }),
    [copy.assetValue, hasDraft, navigation]
  );

  if (!workspace || !subject) {
    const missingPlace = Boolean(placeId && !assetId);
    return (
      <AppScreen safeEdges={[]} testID="asset-value-not-found">
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <ScreenTitle size="medium">
            {missingPlace
              ? subjectCopy.placeNotFound
              : subjectCopy.assetNotFound}
          </ScreenTitle>
          <BodyText muted {...(rtl ? { style: styles.rtlText } : {})}>
            {missingPlace
              ? subjectCopy.placeNotFoundBody
              : subjectCopy.assetNotFoundBody}
          </BodyText>
        </View>
      </AppScreen>
    );
  }

  if (place && !isOwnedPropertyPlace(place)) {
    return (
      <AppScreen safeEdges={[]} testID="asset-value-place-not-owned">
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <ScreenTitle size="medium">
            {subjectCopy.placeNotOwned}
          </ScreenTitle>
          <BodyText muted {...(rtl ? { style: styles.rtlText } : {})}>
            {subjectCopy.placeNotOwnedBody}
          </BodyText>
          {can("place.write") ? (
            <PrimaryButton
              label={subjectCopy.reviewPlace}
              onPress={() =>
                router.replace(
                  `/place-edit?placeId=${encodeURIComponent(place.id)}`
                )
              }
            />
          ) : null}
        </View>
      </AppScreen>
    );
  }

  const save = async () => {
    setAttempted(true);
    if (
      !canSave ||
      !parsedMoney.ok ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    try {
      await recordPortfolioValue({
        ...(subject.kind === "asset"
          ? { assetId: subject.assetId }
          : { placeId: subject.placeId }),
        amountMinor: parsedMoney.amountMinor,
        currency: parsedMoney.currency,
        asOf: normalizedAsOf!
      });
      allowRemovalRef.current = true;
      if (returnTo === "dashboard") {
        router.replace("/dashboard");
      } else if (router.canGoBack()) {
        router.back();
      } else if (subject.kind === "place") {
        router.replace(`/place/${subject.placeId}`);
      } else {
        router.replace(`/asset/${subject.assetId}`);
      }
    } catch {
      submittingRef.current = false;
      // WorkspaceProvider preserves the draft and exposes a recovery message.
    }
  };

  const parserRejectsCurrency =
    !parsedMoney.ok &&
    (parsedMoney.errorCode === "invalid-currency" ||
      parsedMoney.errorCode === "unsupported-currency");
  const amountError =
    (attempted || amountTouched) &&
    !parsedMoney.ok &&
    !parserRejectsCurrency
      ? localizedPortfolioMoneyError(parsedMoney, language)
      : null;
  const currencyError =
    attempted || currencyTouched
      ? normalizedCurrency === null
        ? copy.assetValue.currencyError
        : parserRejectsCurrency
          ? localizedPortfolioMoneyError(parsedMoney, language)
          : null
      : null;
  const visibleDateError =
    attempted || dateTouched ? dateValidationMessage : null;
  const stackDateFields = shouldStackLocalizedDateFields(
    width,
    fontScale
  );

  const requiredCapability =
    subject.kind === "place" ? "place.write" : "asset.write";
  if (!can(requiredCapability)) {
    return <PermissionDeniedScreen capability={requiredCapability} />;
  }

  return (
    <AppScreen
      footer={
        <PrimaryButton
          accessibilityHint={
            current
              ? copy.assetValue.updateHint
              : copy.assetValue.recordHint
          }
          disabled={saving || (current !== null && !hasDraft)}
          label={
            current
              ? copy.assetValue.update
              : copy.assetValue.record
          }
          loading={saving}
          onPress={() => void save()}
        />
      }
      safeEdges={[]}
      testID="asset-value-screen"
    >
      {error ? (
        <ErrorBanner
          message={localizedWorkspaceError(error, language)}
          onDismiss={clearError}
        />
      ) : null}

      <View style={styles.heading}>
        <Text
          style={[
            styles.kicker,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {subject.kind === "place"
            ? subjectCopy.placeEyebrow
            : subjectCopy.assetEyebrow}
        </Text>
        <ScreenTitle size="medium">
          {current
            ? copy.assetValue.update
            : subject.kind === "place"
              ? subjectCopy.placeTitle
              : subjectCopy.assetTitle}
        </ScreenTitle>
        <BodyText muted>
          {subject.kind === "place"
            ? subjectCopy.placeIntro
            : subjectCopy.assetIntro}
        </BodyText>
      </View>

      <CommandSurface>
        <View
          style={[
            styles.commandHeading,
            rtl && styles.rowReverse
          ]}
        >
          <CurrencyCircleDollar
            color={colors.volt}
            size={24}
            weight="regular"
          />
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.assetValue.valueLabel}
          </Text>
        </View>
        <Text
          style={[
            styles.commandTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {targetName}
        </Text>
        <Text
          accessibilityLabel={
            current && formattedCurrent
              ? `${copy.assetValue.currentEntry}: ${formattedCurrent.accessibilityLabel} ${copy.assetValue.asOf} ${formatLocalizedDate(
                  current.asOf,
                  language
                )}.`
              : subject.kind === "place"
                ? subjectCopy.placeNoValue
                : subjectCopy.assetNoValue
          }
          style={[
            styles.commandMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {current && formattedCurrent
            ? `${copy.assetValue.currentEntry}: ${formattedCurrent.text} ${copy.assetValue.asOf} ${formatLocalizedDate(
                current.asOf,
                language
              )}.`
            : subject.kind === "place"
              ? subjectCopy.placeNoValue
              : subjectCopy.assetNoValue}
        </Text>
        <Text
          style={[
            styles.commandStorage,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {subject.kind === "place"
            ? subjectCopy.placeSync
            : repository.durable
              ? copy.common.encryptedDevice
              : copy.common.previewSession}
        </Text>
      </CommandSurface>

      <Section>
        <Field
          accessibilityHint={`${copy.assetValue.amountHintStart} ${
            normalizedCurrency ?? copy.assetValue.chooseCurrency
          } ${copy.assetValue.amountHintEnd}`}
          description={`${copy.assetValue.currency}: ${
            normalizedCurrency ?? copy.assetValue.chooseCurrency
          }`}
          error={amountError}
          keyboardType="decimal-pad"
          label={copy.assetValue.amount}
          onBlur={() => setAmountTouched(true)}
          onChangeText={setAmount}
          placeholder={copy.assetValue.amountPlaceholder}
          returnKeyType="done"
          secureTextEntry={amountsHidden}
          style={styles.numericInput}
          value={amount}
        />

        <View
          accessibilityLabel={copy.assetValue.commonCurrencies}
          accessibilityRole="radiogroup"
          style={[
            styles.currencyChoices,
            rtl && styles.rowReverse
          ]}
        >
          {COMMON_CURRENCIES.map((choice) => {
            const active =
              choice.code === normalizePortfolioCurrency(currency);
            return (
              <Pressable
                accessibilityHint={
                  language === "ar"
                    ? "يختار هذه العملة للقيمة المسجّلة"
                    : "Select this currency for the recorded value"
                }
                accessibilityLabel={portfolioCurrencyAccessibilityLabel(
                  choice,
                  language
                )}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                key={choice.code}
                onPress={() => {
                  setCurrency(choice.code);
                  setCustomCurrencyActive(false);
                  setCurrencyTouched(true);
                }}
                style={({ pressed }) => [
                  styles.currencyChoice,
                  active && styles.currencyChoiceActive,
                  pressed && styles.pressed
                ]}
              >
                <Text
                  style={[
                    styles.currencyChoiceLabel,
                    active && styles.currencyChoiceLabelActive
                  ]}
                >
                  {choice.code}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityHint={copy.assetValue.otherCurrencyHint}
            accessibilityLabel={copy.assetValue.otherCurrency}
            accessibilityRole="radio"
            accessibilityState={{ checked: customCurrencyActive }}
            onPress={() => {
              setCustomCurrencyActive(true);
              if (isCommonCurrency(currency)) setCurrency("");
              setCurrencyTouched(false);
            }}
            style={({ pressed }) => [
              styles.currencyChoice,
              styles.currencyChoiceOther,
              customCurrencyActive && styles.currencyChoiceActive,
              pressed && styles.pressed
            ]}
          >
            <Text
              style={[
                styles.currencyChoiceLabel,
                customCurrencyActive && styles.currencyChoiceLabelActive
              ]}
            >
              {copy.assetValue.other}
            </Text>
          </Pressable>
        </View>

        {customCurrencyActive ? (
          <Field
            autoCapitalize="characters"
            autoCorrect={false}
            description={copy.assetValue.isoDescription}
            error={currencyError}
            label={copy.assetValue.otherCurrency}
            maxLength={3}
            onBlur={() => setCurrencyTouched(true)}
            onChangeText={(value) => setCurrency(value.toUpperCase())}
            placeholder="EUR"
            style={styles.numericInput}
            value={currency}
          />
        ) : null}

        <View style={styles.dateGroup}>
          <Text
            style={[
              styles.dateGroupLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.assetValue.date}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.datePreview,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.assetValue.datePreview}:{" "}
            {normalizedAsOf
              ? formatLocalizedDate(normalizedAsOf, language)
              : copy.assetValue.validDate}
          </Text>
          <View
            style={[
              styles.dateFields,
              rtl && !stackDateFields && styles.rowReverse,
              stackDateFields && styles.dateFieldsStacked
            ]}
          >
            <DatePartField
              label={copy.assetValue.day}
              maxLength={2}
              onBlur={() => setDateTouched(true)}
              onChange={(day) =>
                setDateParts((current) => ({ ...current, day }))
              }
              rtl={rtl}
              value={dateParts.day}
            />
            <DatePartField
              label={copy.assetValue.month}
              maxLength={2}
              onBlur={() => setDateTouched(true)}
              onChange={(month) =>
                setDateParts((current) => ({ ...current, month }))
              }
              rtl={rtl}
              value={dateParts.month}
            />
            <DatePartField
              label={copy.assetValue.year}
              maxLength={4}
              onBlur={() => setDateTouched(true)}
              onChange={(year) =>
                setDateParts((current) => ({ ...current, year }))
              }
              rtl={rtl}
              value={dateParts.year}
            />
          </View>
          {visibleDateError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.dateError,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {visibleDateError}
            </Text>
          ) : null}
        </View>
      </Section>

      <View
        style={[
          styles.truthBoundary,
          rtl && styles.rowReverse
        ]}
      >
        <CalendarBlank color={colors.text} size={22} weight="regular" />
        <View style={styles.truthCopy}>
          <Text
            style={[
              styles.truthTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.assetValue.meaningTitle}
          </Text>
          <Text
            style={[
              styles.truthText,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {subject.kind === "place"
              ? subjectCopy.placeMeaning
              : subjectCopy.assetMeaning}
          </Text>
        </View>
      </View>

      {history.length > 0 ? (
        <Section>
          <View
            style={[
              styles.historyHeading,
              rtl && styles.rowReverse
            ]}
          >
            <ClockCounterClockwise
              color={colors.text}
              size={22}
              weight="regular"
            />
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.assetValue.history}
            </Text>
          </View>
          <BodyText muted>
            {copy.assetValue.historyBody}
          </BodyText>
          <View>
            {formattedHistory.map(({ formatted, record }, index) => (
              <View
                accessibilityLabel={`${index === 0 ? copy.common.current : copy.common.previous}, ${formatted.accessibilityLabel}, ${copy.assetValue.asOf} ${formatLocalizedDate(
                  record.asOf,
                  language
                )}`}
                key={record.id}
                style={[
                  styles.historyRow,
                  rtl && styles.rowReverse
                ]}
              >
                <View style={styles.historyCopy}>
                  <Text style={styles.historyValue}>
                    {formatted.text}
                  </Text>
                  <Text
                    style={[
                      styles.historyDate,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {copy.assetValue.asOf}{" "}
                    {formatLocalizedDate(record.asOf, language)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyStatus,
                    index === 0 && styles.historyStatusCurrent,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {index === 0
                    ? copy.common.current
                    : copy.common.previous}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </AppScreen>
  );
}

function DatePartField({
  label,
  maxLength,
  onBlur,
  onChange,
  rtl,
  value
}: {
  readonly label: string;
  readonly maxLength: number;
  readonly onBlur: () => void;
  readonly onChange: (value: string) => void;
  readonly rtl: boolean;
  readonly value: string;
}) {
  return (
    <View style={styles.datePart}>
      <Text
        style={[
          styles.datePartLabel,
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
          if (acceptsDateDigits(next)) onChange(next);
        }}
        placeholder={maxLength === 4 ? "2026" : "07"}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.action}
        style={styles.datePartInput}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  heading: {
    gap: spacing.xs
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.2
  },
  commandHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 23,
    lineHeight: 29
  },
  commandMeta: {
    color: colors.white,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22
  },
  commandStorage: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  currencyChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  numericInput: {
    textAlign: "left",
    writingDirection: "ltr"
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
  currencyChoiceOther: {
    minWidth: 72
  },
  currencyChoiceActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  currencyChoiceLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.4
  },
  currencyChoiceLabelActive: {
    color: colors.white
  },
  dateGroup: {
    gap: spacing.xs
  },
  dateGroupLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  datePreview: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  dateFields: {
    flexDirection: "row",
    gap: spacing.sm
  },
  dateFieldsStacked: {
    flexDirection: "column"
  },
  datePart: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  datePartLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18
  },
  datePartInput: {
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
  dateError: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  truthBoundary: {
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
    gap: spacing.xs
  },
  truthTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  truthText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  historyHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 21,
    lineHeight: 28
  },
  historyRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  historyCopy: {
    flex: 1,
    gap: 2
  },
  historyValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22,
    fontVariant: ["tabular-nums"]
  },
  historyDate: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  historyStatus: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  historyStatusCurrent: {
    color: colors.success
  },
  notFound: {
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  pressed: {
    opacity: 0.72
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0,
    textTransform: "none"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
