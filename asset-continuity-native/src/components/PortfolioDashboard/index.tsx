import type { Icon } from "phosphor-react-native";
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Buildings,
  Car,
  CaretDown,
  CaretUp,
  ChartDonut,
  CheckCircle,
  CreditCard,
  Eye,
  EyeSlash,
  FileText,
  GraduationCap,
  Handshake,
  House,
  Info,
  MapPin,
  Plus,
  Receipt,
  Tag,
  Wallet,
  WarningCircle
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";

import type {
  LanguageCode,
  NativeLiability,
  NativeWorkspace
} from "@/domain/model";
import {
  getLiabilities,
  isActiveLiability
} from "@/domain/liabilities";
import {
  buildNetPositionSnapshot,
  type NetPositionSnapshot
} from "@/domain/netPosition";
import {
  buildPortfolioSnapshot,
  getPortfolioValueHistory,
  getPortfolioValueRecords,
  type PortfolioLocationBucket,
  type PortfolioRatio,
  type PortfolioSnapshot,
  type PortfolioValuableSubject,
  type PortfolioValueRecord
} from "@/domain/portfolio";
import {
  formatLocalizedNumber,
  itemCount
} from "@/i18n/coreJourneyCopy";
import { localizedCategoryLabel } from "@/i18n/captureCopy";
import {
  getPortfolioExperienceCopy,
  liabilityKindLabel,
  liabilityLifecycleLabel,
  type PortfolioExperienceCopy
} from "@/i18n/portfolioCopy";
import {
  formatRecordedValue,
  formatSignedRecordedValue,
  valueVisibilityFromHidden
} from "@/privacy/ValueVisibility";
import {
  colors,
  radius,
  spacing,
  themes,
  typography
} from "@/theme/tokens";

export type PortfolioReviewIntent =
  | "all"
  | "unvalued"
  | "proof"
  | "location"
  | "proof-review";

export interface PortfolioDashboardProps {
  readonly workspace: NativeWorkspace;
  readonly valueRecords?: readonly PortfolioValueRecord[];
  readonly language?: LanguageCode;
  readonly canReadLiabilities?: boolean;
  readonly onAddAsset?: () => void;
  readonly onAddLiability?: () => void;
  readonly onConfirmNoLiabilities?: () => void;
  readonly amountsHidden?: boolean;
  readonly onAmountsHiddenChange?: (hidden: boolean) => void;
  readonly onOpenAsset?: (assetId: string) => void;
  readonly onOpenSubject?: (subject: PortfolioValuableSubject) => void;
  readonly onReviewPlaces?: () => void;
  readonly onReviewAssets?: (intent: PortfolioReviewIntent) => void;
  readonly showTitle?: boolean;
  readonly testID?: string;
}

interface DashboardCopy {
  readonly portfolio: string;
  readonly sample: string;
  readonly introduction: string;
  readonly recordedValue: string;
  readonly hideRecordedAmounts: string;
  readonly showRecordedAmounts: string;
  readonly itemsLabel: string;
  readonly propertiesLabel: string;
  readonly valuedLabel: string;
  readonly currenciesLabel: string;
  readonly noTotal: string;
  readonly sampleValueNote: string;
  readonly personalValueNote: string;
  readonly separateCurrencies: string;
  readonly netWorthNote: string;
  readonly explain: string;
  readonly hideExplanation: string;
  readonly explanationTitle: string;
  readonly explanationLines: readonly string[];
  readonly overview: string;
  readonly documented: string;
  readonly documentedDetail: string;
  readonly locationReady: string;
  readonly locationReadyDetail: string;
  readonly propertyPins: string;
  readonly propertyPinsDetail: string;
  readonly noProperties: string;
  readonly proofGaps: string;
  readonly proofGapsDetail: string;
  readonly noApplicableLocations: string;
  readonly locationDistribution: string;
  readonly locationDistributionDetail: string;
  readonly needsLocationConfirmation: string;
  readonly noPhysicalPlaceRequired: string;
  readonly needsAttention: string;
  readonly reviewNext: string;
  readonly allCoreRecordsReady: string;
  readonly allCoreRecordsReadyDetail: string;
  readonly missingValues: string;
  readonly missingPropertyValues: string;
  readonly missingProof: string;
  readonly missingLocation: string;
  readonly pendingReview: string;
  readonly recordedItems: string;
  readonly noRecordedValues: string;
  readonly emptyPersonal: string;
  readonly emptySample: string;
  readonly reviewUnvalued: string;
  readonly addFirstItem: string;
  readonly reviewAllItems: string;
  readonly viewAllRecorded: (currency: string, count: number) => string;
  readonly showFewerRecorded: (currency: string) => string;
  readonly asOf: string;
  readonly items: (count: number) => string;
  readonly entries: (count: number) => string;
  readonly property: string;
  readonly onDevice: string;
  readonly ratio: (complete: number, total: number) => string;
  readonly valuedCoverage: (complete: number, total: number) => string;
  readonly ignoredValues: (count: number) => string;
  readonly totalUnavailable: string;
  readonly calculationIssue: string;
}

export function portfolioEntryCount(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "en") {
    return `${formatted} ${count === 1 ? "entry" : "entries"}`;
  }
  if (count === 0) return "لا سجلات";
  if (count === 1) return "سجل واحد";
  if (count === 2) return "سجلان";
  if (count >= 3 && count <= 10) return `${formatted} سجلات`;
  return `${formatted} سجلًا`;
}

export function portfolioValuedCoverage(
  complete: number,
  total: number,
  language: LanguageCode
): string {
  const completed = formatLocalizedNumber(complete, language);
  const denominator = formatLocalizedNumber(total, language);
  return language === "ar"
    ? `سُجّلت قيمة أدخلها المستخدم لـ${completed} من أصل ${denominator} من الأغراض والعقارات`
    : `${completed} of ${denominator} items and properties have a recorded value`;
}

const ENGLISH: DashboardCopy = {
  portfolio: "Portfolio",
  sample: "SAMPLE WORKSPACE",
  introduction:
    "What you own, where it is and what still needs attention.",
  recordedValue: "RECORDED VALUE",
  hideRecordedAmounts: "Hide recorded amounts",
  showRecordedAmounts: "Show recorded amounts",
  itemsLabel: "Items",
  propertiesLabel: "Properties",
  valuedLabel: "Valued",
  currenciesLabel: "Currencies",
  noTotal: "No total yet",
  sampleValueNote:
    "Illustrative values are dated sample entries—not live prices or appraisals.",
  personalValueNote:
    "Only the latest values you enter are included.",
  separateCurrencies:
    "Currencies stay separate. No exchange rate has been applied.",
  netWorthNote:
    "Recorded liabilities are included. Taxes, selling costs and unrecorded accounts remain outside this view.",
  explain: "Explain this number",
  hideExplanation: "Hide explanation",
  explanationTitle: "What is included",
  explanationLines: [
    "The latest dated value you recorded for each item or property.",
    "Separate totals for each currency, with no currency conversion.",
    "Unvalued items are excluded—not treated as zero.",
    "No live prices or appraisals; taxes and selling costs remain outside this view."
  ],
  overview: "Register health",
  documented: "Documented items",
  documentedDetail: "A photo or supporting proof is attached.",
  locationReady: "Location ready",
  locationReadyDetail:
    "Physical items have a usable retrieval location.",
  propertyPins: "Property pins",
  propertyPinsDetail:
    "Properties have saved coordinates and a user-confirmed pin.",
  noProperties: "No properties need a pin",
  proofGaps: "Proof gaps",
  proofGapsDetail: "Items without supporting material.",
  noApplicableLocations: "No physical items to locate",
  locationDistribution: "Where things are",
  locationDistributionDetail:
    "Distribution by assigned Place, not by estimated value.",
  needsLocationConfirmation: "Location needs confirmation",
  noPhysicalPlaceRequired: "No physical place required",
  needsAttention: "Needs attention",
  reviewNext: "Review next",
  allCoreRecordsReady: "Core records are ready",
  allCoreRecordsReadyDetail:
    "Every item and property has a recorded value; item proof and retrieval locations are ready.",
  missingValues: "Items without a recorded value",
  missingPropertyValues: "Properties without a recorded value",
  missingProof: "Items without supporting proof",
  missingLocation: "Physical items with a location gap",
  pendingReview: "Proof files awaiting review",
  recordedItems: "Recorded values",
  noRecordedValues: "No values recorded",
  emptyPersonal:
    "Your continuity register still works without financial data. Add values only when they are useful to you.",
  emptySample:
    "This sample demonstrates organization and proof coverage without making up prices.",
  reviewUnvalued: "Review unvalued items",
  addFirstItem: "Add your first item",
  reviewAllItems: "Review all items",
  viewAllRecorded: (currency, count) =>
    `View all ${count} ${currency} ${count === 1 ? "entry" : "entries"}`,
  showFewerRecorded: (currency) => `Show fewer ${currency} entries`,
  asOf: "As of",
  items: (count) => itemCount(count, "en"),
  entries: (count) => portfolioEntryCount(count, "en"),
  property: "Property",
  onDevice: "On this device",
  ratio: (complete, total) =>
    `${formatLocalizedNumber(complete, "en")} of ${formatLocalizedNumber(
      total,
      "en"
    )}`,
  valuedCoverage: (complete, total) =>
    portfolioValuedCoverage(complete, total, "en"),
  ignoredValues: (count) =>
    `${formatLocalizedNumber(
      count,
      "en"
    )} invalid or unmatched value ${
      count === 1 ? "record was" : "records were"
    } excluded.`,
  totalUnavailable: "Exact total unavailable",
  calculationIssue:
    "One or more currency totals exceeded the exact calculation range. Individual values remain visible."
};

const ARABIC: DashboardCopy = {
  itemsLabel: "الأغراض",
  propertiesLabel: "العقارات",
  valuedLabel: "لها قيمة",
  currenciesLabel: "العملات",
  portfolio: "المحفظة",
  sample: "مساحة عمل تجريبية",
  introduction:
    "عرض واضح لما تملكه، ومكانه، ومدى اكتمال توثيقه.",
  recordedValue: "القيمة المسجّلة",
  hideRecordedAmounts: "إخفاء القيم المسجّلة",
  showRecordedAmounts: "إظهار القيم المسجّلة",
  noTotal: "لا يوجد إجمالي بعد",
  sampleValueNote:
    "القيم التوضيحية إدخالات نموذجية مؤرخة، وليست أسعارًا مباشرة أو تقييمات رسمية.",
  personalValueNote:
    "لا يُحتسب إلا أحدث تقييم تدخله بنفسك.",
  separateCurrencies:
    "تُعرض العملات بشكل منفصل من دون تطبيق سعر صرف.",
  netWorthNote:
    "تُحتسب الالتزامات المسجّلة، بينما تبقى الضرائب وتكاليف البيع والحسابات غير المسجّلة خارج هذا العرض.",
  explain: "كيف حُسب هذا الرقم؟",
  hideExplanation: "إخفاء التوضيح",
  explanationTitle: "ما الذي يشمله الحساب؟",
  explanationLines: [
    "أحدث قيمة مؤرخة أدخلها المستخدم لكل غرض أو عقار.",
    "إجمالي مستقل لكل عملة من دون تحويل العملات.",
    "تُستبعد الأصول غير المقيّمة ولا تُعامل كأن قيمتها صفر.",
    "لا يشمل أسعاراً مباشرة أو تقييماً رسمياً؛ وتبقى الضرائب وتكاليف البيع خارج هذا العرض."
  ],
  overview: "سلامة السجل",
  documented: "الأصول الموثّقة",
  documentedDetail: "يتوفر لها صورة أو مستند داعم.",
  locationReady: "الموقع جاهز",
  locationReadyDetail:
    "للأصول المادية موقع استرجاع واضح.",
  propertyPins: "دبابيس العقارات",
  propertyPinsDetail:
    "للعقارات إحداثيات محفوظة ودبوس أكده المستخدم.",
  noProperties: "لا توجد عقارات تحتاج إلى دبوس",
  proofGaps: "نواقص الإثبات",
  proofGapsDetail: "أصول بلا مستندات داعمة.",
  noApplicableLocations: "لا توجد أصول مادية تحتاج إلى موقع",
  locationDistribution: "أماكن الأصول",
  locationDistributionDetail:
    "التوزيع حسب المكان المسجّل، وليس حسب القيمة التقديرية.",
  needsLocationConfirmation: "الموقع بحاجة إلى تأكيد",
  noPhysicalPlaceRequired: "لا يحتاج إلى مكان فعلي",
  needsAttention: "بحاجة إلى اهتمام",
  reviewNext: "المراجعة التالية",
  allCoreRecordsReady: "السجلات الأساسية مكتملة",
  allCoreRecordsReadyDetail:
    "لكل غرض وعقار قيمة مسجّلة، وإثباتات الأغراض ومواقع استرجاعها جاهزة.",
  missingValues: "أغراض بلا قيمة مسجّلة",
  missingPropertyValues: "عقارات بلا قيمة مسجّلة",
  missingProof: "أصول بلا مستند داعم",
  missingLocation: "أصول مادية بموقع غير مكتمل",
  pendingReview: "مستندات بانتظار المراجعة",
  recordedItems: "القيم المسجّلة",
  noRecordedValues: "لا توجد قيم مسجّلة",
  emptyPersonal:
    "يبقى سجل الاستمرارية مفيداً من دون بيانات مالية. أضف القيم عندما تكون مفيدة لك فقط.",
  emptySample:
    "توضح هذه العينة التنظيم وتغطية الإثبات من دون افتراض أسعار.",
  reviewUnvalued: "مراجعة الأصول غير المقيّمة",
  addFirstItem: "أضف أول أصل",
  reviewAllItems: "مراجعة جميع الأصول",
  viewAllRecorded: (currency, count) =>
    `عرض كل قيود ${currency} (${formatLocalizedNumber(count, "ar")})`,
  showFewerRecorded: (currency) => `عرض قيود ${currency} أقل`,
  asOf: "بتاريخ",
  items: (count) => itemCount(count, "ar"),
  entries: (count) => portfolioEntryCount(count, "ar"),
  property: "عقار",
  onDevice: "على هذا الجهاز",
  ratio: (complete, total) =>
    `${formatLocalizedNumber(complete, "ar")} من ${formatLocalizedNumber(
      total,
      "ar"
    )}`,
  valuedCoverage: (complete, total) =>
    portfolioValuedCoverage(complete, total, "ar"),
  ignoredValues: (count) =>
    `تم استبعاد ${formatLocalizedNumber(
      count,
      "ar"
    )} من سجلات القيمة غير الصالحة أو غير المطابقة.`,
  totalUnavailable: "الإجمالي الدقيق غير متاح",
  calculationIssue:
    "تجاوز إجمالي عملة واحدة أو أكثر نطاق الحساب الدقيق. ما زالت القيم الفردية ظاهرة."
};

function copyFor(language: LanguageCode): DashboardCopy {
  return language === "ar" ? ARABIC : ENGLISH;
}

export function portfolioPercentLabel(
  ratio: Pick<PortfolioRatio, "percent">,
  language: LanguageCode
): string {
  if (ratio.percent === null) return "—";
  const value = formatLocalizedNumber(ratio.percent, language);
  return language === "ar" ? `${value}٪` : `${value}%`;
}

export function portfolioLocationBucketLabel(
  bucket: Pick<PortfolioLocationBucket, "kind" | "label">,
  language: LanguageCode
): string {
  if (bucket.kind === "place") return bucket.label;
  const copy = copyFor(language);
  return bucket.kind === "needs-confirmation"
    ? copy.needsLocationConfirmation
    : copy.noPhysicalPlaceRequired;
}

function dateLabel(value: string, language: LanguageCode): string {
  try {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-QA" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function shouldStackPortfolioFinancialLayout(
  width: number,
  fontScale: number
): boolean {
  return width <= 360 || fontScale >= 1.3;
}

export function PortfolioDashboard({
  amountsHidden: controlledAmountsHidden,
  canReadLiabilities = true,
  workspace,
  valueRecords,
  language = workspace.language,
  onAddAsset,
  onAddLiability,
  onAmountsHiddenChange,
  onConfirmNoLiabilities,
  onOpenAsset,
  onOpenSubject,
  onReviewAssets,
  onReviewPlaces,
  showTitle = true,
  testID = "portfolio-dashboard"
}: PortfolioDashboardProps) {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [internalAmountsHidden, setInternalAmountsHidden] = useState(true);
  const amountsHidden =
    controlledAmountsHidden ?? internalAmountsHidden;
  const copy = copyFor(language);
  const financialCopy = getPortfolioExperienceCopy(language);
  const rtl = language === "ar";
  const resolvedValueRecords =
    valueRecords ?? getPortfolioValueRecords(workspace);
  const snapshot = useMemo(
    () => buildPortfolioSnapshot(workspace, resolvedValueRecords),
    [resolvedValueRecords, workspace]
  );
  const netPosition = useMemo(
    () =>
      canReadLiabilities
        ? buildNetPositionSnapshot({
            ...workspace,
            portfolioValueRecords: [...resolvedValueRecords]
          })
        : null,
    [canReadLiabilities, resolvedValueRecords, workspace]
  );

  return (
    <View
      accessibilityLabel={copy.portfolio}
      style={styles.dashboard}
      testID={testID}
    >
      <View style={styles.heading}>
        {showTitle ? (
          <View style={[styles.titleLine, rtl && styles.rowReverse]}>
            <Text
              accessibilityRole="header"
              style={[
                styles.pageTitle,
                rtl && styles.arabicHeading,
                rtl && styles.textRight
              ]}
            >
              {copy.portfolio}
            </Text>
            {workspace.mode === "sample" ? (
              <View
                accessibilityLabel={copy.sample}
                style={styles.sampleBadge}
              >
                <Text
                  style={[
                    styles.sampleBadgeText,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.sample}
                </Text>
              </View>
            ) : null}
          </View>
        ) : workspace.mode === "sample" ? (
          <View style={[styles.contextLine, rtl && styles.rowReverse]}>
            <View
              accessibilityLabel={copy.sample}
              style={styles.sampleBadge}
            >
              <Text
                style={[
                  styles.sampleBadgeText,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.sample}
              </Text>
            </View>
          </View>
        ) : null}
        <Text
          style={[
            styles.introduction,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {copy.introduction}
        </Text>
      </View>

      <View style={styles.heroDecisionGroup}>
        {canReadLiabilities && netPosition ? (
          <PortfolioHero
            amountsHidden={amountsHidden}
            copy={copy}
            explanationOpen={explanationOpen}
            financialCopy={financialCopy}
            language={language}
            netPosition={netPosition}
            onToggleExplanation={() =>
              setExplanationOpen((current) => !current)
            }
            onToggleRecordedAmounts={() => {
              const next = !amountsHidden;
              if (controlledAmountsHidden === undefined) {
                setInternalAmountsHidden(next);
              }
              onAmountsHiddenChange?.(next);
            }}
            rtl={rtl}
            sample={workspace.mode === "sample"}
          />
        ) : (
          <AssetPortfolioHero
            amountsHidden={amountsHidden}
            copy={copy}
            explanationOpen={explanationOpen}
            language={language}
            onToggleExplanation={() =>
              setExplanationOpen((current) => !current)
            }
            onToggleRecordedAmounts={() => {
              const next = !amountsHidden;
              if (controlledAmountsHidden === undefined) {
                setInternalAmountsHidden(next);
              }
              onAmountsHiddenChange?.(next);
            }}
            rtl={rtl}
            sample={workspace.mode === "sample"}
            snapshot={snapshot}
          />
        )}

        <ReviewNext
          copy={copy}
          language={language}
          onReviewAssets={onReviewAssets}
          onReviewPlaces={onReviewPlaces}
          rtl={rtl}
          snapshot={snapshot}
        />
      </View>

      {snapshot.valuableCount === 0 ? (
        <View
          accessibilityLabel={copy.noRecordedValues}
          style={[styles.firstItemState, rtl && styles.alignEnd]}
        >
          <ChartDonut color={colors.text} size={28} weight="regular" />
          <View style={styles.emptyCopy}>
            <Text
              style={[
                styles.emptyTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.noRecordedValues}
            </Text>
            <Text
              style={[
                styles.emptyBody,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {copy.emptyPersonal}
            </Text>
          </View>
          {onAddAsset ? (
            <TextAction
              label={copy.addFirstItem}
              onPress={onAddAsset}
              rtl={rtl}
            />
          ) : null}
        </View>
      ) : (
        <RecordedValues
          amountsHidden={amountsHidden}
          copy={copy}
          language={language}
          onOpenAsset={onOpenAsset}
          onOpenSubject={onOpenSubject}
          onReviewAssets={onReviewAssets}
          rtl={rtl}
          sample={workspace.mode === "sample"}
          snapshot={snapshot}
        />
      )}

      {canReadLiabilities && netPosition ? (
        <LiabilitiesSection
          amountsHidden={amountsHidden}
          copy={financialCopy}
          language={language}
          netPosition={netPosition}
          onAddLiability={onAddLiability}
          onConfirmNoLiabilities={onConfirmNoLiabilities}
          onOpenSubject={onOpenSubject}
          rtl={rtl}
          workspace={workspace}
        />
      ) : null}

      {snapshot.valuableCount > 0 ? (
        <>
          <LocationDistribution
            copy={copy}
            language={language}
            rtl={rtl}
            snapshot={snapshot}
          />
          <RegisterHealth
            copy={copy}
            language={language}
            onReviewAssets={onReviewAssets}
            onReviewPlaces={onReviewPlaces}
            rtl={rtl}
            snapshot={snapshot}
          />
        </>
      ) : null}

      {snapshot.ignoredValueRecordCount > 0 ||
      snapshot.uncalculableCurrencyCount > 0 ? (
        <View accessibilityLiveRegion="polite" style={styles.integrityNotice}>
          <WarningCircle color={colors.warning} size={20} />
          <Text
            style={[
              styles.integrityText,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {[
              snapshot.ignoredValueRecordCount > 0
                ? copy.ignoredValues(snapshot.ignoredValueRecordCount)
                : null,
              snapshot.uncalculableCurrencyCount > 0
                ? copy.calculationIssue
                : null
            ]
              .filter(Boolean)
              .join(" ")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const LIABILITY_KIND_ICONS: Readonly<Record<NativeLiability["kind"], Icon>> = {
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

function liabilitySyncLabel(
  status:
    | NativeLiability["syncStatus"]
    | PortfolioValueRecord["syncStatus"],
  copy: PortfolioExperienceCopy
): string {
  switch (status) {
    case "queued":
      return copy.common.queued;
    case "synced":
      return copy.common.synced;
    case "needs-attention":
      return copy.common.needsAttention;
    case "on-device":
      return copy.common.onDevice;
  }

  return copy.common.needsAttention;
}

function combinedLiabilitySyncStatus(
  liabilityStatus: NativeLiability["syncStatus"],
  balanceStatus?: PortfolioValueRecord["syncStatus"]
): NativeLiability["syncStatus"] | PortfolioValueRecord["syncStatus"] {
  const statuses = balanceStatus
    ? [liabilityStatus, balanceStatus]
    : [liabilityStatus];
  if (statuses.includes("needs-attention")) return "needs-attention";
  if (statuses.includes("queued")) return "queued";
  if (statuses.includes("on-device")) return "on-device";
  return "synced";
}

function AssetPortfolioHero({
  amountsHidden,
  copy,
  explanationOpen,
  language,
  onToggleExplanation,
  onToggleRecordedAmounts,
  rtl,
  sample,
  snapshot
}: {
  readonly amountsHidden: boolean;
  readonly copy: DashboardCopy;
  readonly explanationOpen: boolean;
  readonly language: LanguageCode;
  readonly onToggleExplanation: () => void;
  readonly onToggleRecordedAmounts: () => void;
  readonly rtl: boolean;
  readonly sample: boolean;
  readonly snapshot: PortfolioSnapshot;
}) {
  const visibility = valueVisibilityFromHidden(amountsHidden);
  const totals = snapshot.currencyTotals.map((total) => ({
    ...total,
    formatted:
      total.amountMinor === null
        ? null
        : formatRecordedValue({
            amountMinor: total.amountMinor,
            currency: total.currency,
            isolateBidi: true,
            language,
            visibility
          })
  }));
  const formatCount = (value: number) =>
    new Intl.NumberFormat(language === "ar" ? "ar-QA" : "en").format(value);
  const boundary =
    language === "ar"
      ? "يشمل هذا العرض الأغراض والعقارات المملوكة للأسرة التي سُجّلت قيمتها فقط. ولا يمثّل تقييماً مباشراً."
      : "This view includes only recorded items and household-owned properties. It is not a live valuation.";
  const a11ySummary =
    totals.length === 0
      ? copy.noTotal
      : totals
          .map(
            (total) =>
              `${total.currency}: ${
                total.formatted?.accessibilityLabel ??
                copy.totalUnavailable
              }`
          )
          .join("; ");

  return (
    <View style={styles.hero} testID="portfolio-recorded-asset-value">
      <View style={[styles.voltRule, rtl && styles.voltRuleRtl]} />
      <View style={[styles.heroHeading, rtl && styles.rowReverse]}>
        <View style={styles.heroHeadingCopy}>
          <Text
            style={[
              styles.heroEyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.textRight
            ]}
          >
            {copy.recordedValue}
          </Text>
          <Text
            style={[
              styles.heroIntro,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {copy.personalValueNote}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={
            amountsHidden
              ? copy.showRecordedAmounts
              : copy.hideRecordedAmounts
          }
          accessibilityRole="button"
          hitSlop={8}
          onPress={onToggleRecordedAmounts}
          style={({ pressed }) => [
            styles.amountVisibilityButton,
            pressed && styles.amountVisibilityPressed
          ]}
          testID="portfolio-amount-visibility"
        >
          {amountsHidden ? (
            <Eye color={colors.white} size={20} weight="regular" />
          ) : (
            <EyeSlash color={colors.white} size={20} weight="regular" />
          )}
        </Pressable>
      </View>

      {totals.length === 0 ? (
        <Text
          accessibilityLabel={copy.noTotal}
          style={[
            styles.noTotal,
            rtl && styles.arabicHeading,
            rtl && styles.textRight
          ]}
        >
          {copy.noTotal}
        </Text>
      ) : (
        <View accessibilityLabel={a11ySummary} style={styles.totalList}>
          {totals.map((total, index) => (
            <View
              key={total.currency}
              style={[
                styles.totalRow,
                index > 0 && styles.totalRowSeparated,
                rtl && styles.totalRowRtl
              ]}
            >
              <Text
                style={[
                  styles.totalValue,
                  rtl && styles.arabicHeading,
                  rtl && styles.textRight
                ]}
              >
                {total.formatted?.text ?? copy.totalUnavailable}
              </Text>
              <Text
                style={[
                  styles.totalMeta,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {copy.asOf} {dateLabel(total.latestAsOf, language)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.heroFacts, rtl && styles.rowReverse]}>
        <View
          style={[
            styles.heroFact,
            styles.heroFactSeparated,
            rtl && styles.heroFactSeparatedRtl
          ]}
        >
          <Text
            style={[
              styles.heroFactValue,
              rtl && styles.arabicHeading,
              rtl && styles.textRight
            ]}
          >
            {formatCount(snapshot.assetCount)}
          </Text>
          <Text
            style={[
              styles.heroFactLabel,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {copy.itemsLabel}
          </Text>
        </View>
        <View
          style={[
            styles.heroFact,
            styles.heroFactSeparated,
            rtl && styles.heroFactSeparatedRtl
          ]}
        >
          <Text
            style={[
              styles.heroFactValue,
              rtl && styles.arabicHeading,
              rtl && styles.textRight
            ]}
          >
            {formatCount(snapshot.propertyCount)}
          </Text>
          <Text
            style={[
              styles.heroFactLabel,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {copy.propertiesLabel}
          </Text>
        </View>
        <View style={styles.heroFact}>
          <Text
            style={[
              styles.heroFactValue,
              rtl && styles.arabicHeading,
              rtl && styles.textRight
            ]}
          >
            {formatCount(snapshot.valuedEntryCount)}
          </Text>
          <Text
            style={[
              styles.heroFactLabel,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {copy.valuedLabel}
          </Text>
        </View>
      </View>

      <View
        accessibilityLiveRegion="polite"
        style={[styles.heroStatus, rtl && styles.rowReverse]}
      >
        {snapshot.valuedEntryCount === snapshot.valuableCount &&
        snapshot.valuableCount > 0 ? (
          <CheckCircle color={colors.volt} size={19} weight="regular" />
        ) : (
          <WarningCircle color={colors.volt} size={19} weight="regular" />
        )}
        <Text
          style={[
            styles.heroStatusText,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {copy.valuedCoverage(
            snapshot.valuedEntryCount,
            snapshot.valuableCount
          )}
        </Text>
      </View>

      {sample ? (
        <Text
          style={[
            styles.heroSupporting,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {copy.sampleValueNote}
        </Text>
      ) : null}
      {totals.length > 1 ? (
        <Text
          style={[
            styles.heroSupporting,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {copy.separateCurrencies}
        </Text>
      ) : null}
      <Text
        style={[
          styles.netWorthNote,
          rtl && styles.arabic,
          rtl && styles.textRight
        ]}
      >
        {boundary}
      </Text>

      <Pressable
        accessibilityHint={copy.explanationTitle}
        accessibilityRole="button"
        accessibilityState={{ expanded: explanationOpen }}
        onPress={onToggleExplanation}
        style={({ pressed }) => [
          styles.explainButton,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
      >
        <Info color={colors.volt} size={19} weight="regular" />
        <Text
          style={[
            styles.explainLabel,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {explanationOpen ? copy.hideExplanation : copy.explain}
        </Text>
        {explanationOpen ? (
          <CaretUp color={colors.concrete} size={18} />
        ) : (
          <CaretDown color={colors.concrete} size={18} />
        )}
      </Pressable>

      {explanationOpen ? (
        <View style={styles.explanation}>
          <Text
            accessibilityRole="header"
            style={[
              styles.explanationTitle,
              rtl && styles.arabicMedium,
              rtl && styles.textRight
            ]}
          >
            {copy.explanationTitle}
          </Text>
          {copy.explanationLines.map((line) => (
            <View
              key={line}
              style={[styles.explanationLine, rtl && styles.rowReverse]}
            >
              <View style={styles.explanationMarker} />
              <Text
                style={[
                  styles.explanationText,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {line}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PortfolioHero({
  amountsHidden,
  copy,
  explanationOpen,
  financialCopy,
  language,
  netPosition,
  onToggleExplanation,
  onToggleRecordedAmounts,
  rtl,
  sample
}: {
  readonly amountsHidden: boolean;
  readonly copy: DashboardCopy;
  readonly explanationOpen: boolean;
  readonly financialCopy: PortfolioExperienceCopy;
  readonly language: LanguageCode;
  readonly netPosition: NetPositionSnapshot;
  readonly onToggleExplanation: () => void;
  readonly onToggleRecordedAmounts: () => void;
  readonly rtl: boolean;
  readonly sample: boolean;
}) {
  const { fontScale, width } = useWindowDimensions();
  const stackFinancialLayout = shouldStackPortfolioFinancialLayout(
    width,
    fontScale
  );
  const visibility = valueVisibilityFromHidden(amountsHidden);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(
    null
  );
  const formattedLines = netPosition.byCurrency.map((line) => ({
    ...line,
    net:
      line.recordedNetPositionMinor === null
        ? null
        : formatSignedRecordedValue({
            amountMinor: line.recordedNetPositionMinor,
            currency: line.currency,
            isolateBidi: true,
            language,
            visibility
          }),
    assets:
      line.recordedAssetsMinor === null
        ? null
        : formatRecordedValue({
            amountMinor: line.recordedAssetsMinor,
            currency: line.currency,
            isolateBidi: true,
            language,
            visibility
          }),
    liabilities:
      line.recordedLiabilitiesMinor === null
        ? null
        : formatRecordedValue({
            amountMinor: line.recordedLiabilitiesMinor,
            currency: line.currency,
            isolateBidi: true,
            language,
            visibility
          })
  }));
  const selectedLine =
    formattedLines.find((line) => line.currency === selectedCurrency) ??
    formattedLines[0] ??
    null;
  const statusReady = netPosition.status === "recorded";
  const a11ySummary =
    !selectedLine
      ? financialCopy.netPosition.noTotal
      : [
          selectedLine.currency,
          `${financialCopy.netPosition.assets}: ${
            selectedLine.assets?.accessibilityLabel ??
            financialCopy.netPosition.exactUnavailable
          }`,
          `${financialCopy.netPosition.liabilities}: ${
            selectedLine.liabilityCoverage === "no-recorded-liabilities"
              ? financialCopy.netPosition.noRecordedLiabilities
              : selectedLine.liabilities?.accessibilityLabel ??
                financialCopy.netPosition.reviewRequired
          }`,
          `${financialCopy.netPosition.net}: ${
            selectedLine.net?.accessibilityLabel ??
            financialCopy.netPosition.reviewRequired
          }`
        ].join(", ");
  const statusColor = statusReady
    ? themes.dark.success
    : themes.dark.warning;

  return (
    <View style={styles.hero} testID="portfolio-net-position">
      <View style={[styles.voltRule, rtl && styles.voltRuleRtl]} />
      <View style={[styles.heroHeading, rtl && styles.rowReverse]}>
        <View style={styles.heroHeadingCopy}>
          <Text
            style={[
              styles.heroEyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.textRight
            ]}
          >
            {financialCopy.netPosition.eyebrow}
          </Text>
          <Text
            style={[
              styles.heroIntro,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {financialCopy.netPosition.introduction}
          </Text>
        </View>
        <View testID="portfolio-net-position-visibility">
          <Pressable
            accessibilityLabel={
              amountsHidden
                ? financialCopy.netPosition.showAmounts
                : financialCopy.netPosition.hideAmounts
            }
            accessibilityRole="button"
            hitSlop={8}
            onPress={onToggleRecordedAmounts}
            style={({ pressed }) => [
              styles.amountVisibilityButton,
              pressed && styles.amountVisibilityPressed
            ]}
            testID="portfolio-amount-visibility"
          >
            {amountsHidden ? (
              <Eye color={colors.white} size={20} weight="regular" />
            ) : (
              <EyeSlash color={colors.white} size={20} weight="regular" />
            )}
          </Pressable>
        </View>
      </View>

      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.heroPrivacyStatus,
          rtl && styles.arabic,
          rtl && styles.textRight
        ]}
      >
        {amountsHidden
          ? financialCopy.netPosition.amountsHiddenStatus
          : financialCopy.netPosition.amountsVisibleStatus}
      </Text>

      {formattedLines.length > 1 ? (
        <View
          accessibilityLabel={financialCopy.netPosition.currencySelectorLabel}
          accessibilityRole="radiogroup"
        >
          <ScrollView
            contentContainerStyle={[
              styles.currencySelector,
              rtl && styles.currencySelectorRtl
            ]}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {formattedLines.map((line) => {
              const selected = line.currency === selectedLine?.currency;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={line.currency}
                  onPress={() => setSelectedCurrency(line.currency)}
                  style={({ pressed }) => [
                    styles.currencySelectorChoice,
                    selected && styles.currencySelectorChoiceSelected,
                    pressed && styles.amountVisibilityPressed
                  ]}
                  testID={`portfolio-currency-${line.currency}`}
                >
                  <Text
                    style={[
                      styles.currencySelectorLabel,
                      selected && styles.currencySelectorLabelSelected
                    ]}
                  >
                    {line.currency}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {!selectedLine ? (
        <Text
          accessibilityLabel={financialCopy.netPosition.noTotal}
          style={[
            styles.noTotal,
            rtl && styles.arabicHeading,
            rtl && styles.textRight
          ]}
        >
          {financialCopy.netPosition.noTotal}
        </Text>
      ) : (
        <View
          accessibilityLabel={a11ySummary}
          style={[
            styles.totalRow,
            rtl && styles.totalRowRtl
          ]}
        >
          <Text
            style={[
              styles.totalValue,
              rtl && styles.arabicHeading,
              rtl && styles.textRight
            ]}
          >
            {selectedLine.net?.text ??
              financialCopy.netPosition.reviewRequired}
          </Text>
          <Text
            style={[
              styles.totalMeta,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {selectedLine.oldestAsOf && selectedLine.newestAsOf
              ? financialCopy.netPosition.asOfRange(
                  dateLabel(selectedLine.oldestAsOf, language),
                  dateLabel(selectedLine.newestAsOf, language)
                )
              : selectedLine.currency}
          </Text>
          <View
            style={[
              styles.netComposition,
              stackFinancialLayout &&
                styles.netCompositionStacked,
              rtl && !stackFinancialLayout && styles.rowReverse
            ]}
          >
            <View style={styles.netCompositionPart}>
              <Text
                style={[
                  styles.netCompositionLabel,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {financialCopy.netPosition.assets}
              </Text>
              <Text
                style={[
                  styles.netCompositionValue,
                  rtl && styles.arabicMedium,
                  rtl && styles.textRight
                ]}
              >
                {selectedLine.assets?.text ??
                  financialCopy.netPosition.exactUnavailable}
              </Text>
            </View>
            {!stackFinancialLayout ? (
              <View style={styles.netOperator}>
                <Text style={styles.netOperatorText}>{"\u2212"}</Text>
              </View>
            ) : null}
            <View
              style={[
                styles.netCompositionPart,
                stackFinancialLayout &&
                  styles.netCompositionPartStacked
              ]}
            >
              <Text
                style={[
                  styles.netCompositionLabel,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {financialCopy.netPosition.liabilities}
              </Text>
              <Text
                style={[
                  styles.netCompositionValue,
                  rtl && styles.arabicMedium,
                  rtl && styles.textRight
                ]}
              >
                {selectedLine.liabilityCoverage ===
                "no-recorded-liabilities"
                  ? financialCopy.netPosition.noRecordedLiabilities
                  : selectedLine.liabilities?.text ??
                    financialCopy.netPosition.reviewRequired}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View
        accessibilityLiveRegion="polite"
        style={[styles.heroStatus, rtl && styles.rowReverse]}
      >
        {statusReady ? (
          <CheckCircle color={statusColor} size={19} weight="regular" />
        ) : (
          <WarningCircle color={statusColor} size={19} weight="regular" />
        )}
        <Text
          style={[
            styles.heroStatusText,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {financialCopy.netPosition.status[netPosition.status]}
        </Text>
      </View>

      <Pressable
        accessibilityHint={financialCopy.netPosition.explanationTitle}
        accessibilityRole="button"
        accessibilityState={{ expanded: explanationOpen }}
        onPress={onToggleExplanation}
        style={({ pressed }) => [
          styles.explainButton,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
      >
        <Info color={colors.volt} size={19} weight="regular" />
        <Text
          style={[
            styles.explainLabel,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {explanationOpen
            ? financialCopy.netPosition.hideExplanation
            : financialCopy.netPosition.explain}
        </Text>
        {explanationOpen ? (
          <CaretUp color={colors.concrete} size={18} />
        ) : (
          <CaretDown color={colors.concrete} size={18} />
        )}
      </Pressable>

      {explanationOpen ? (
        <View style={styles.explanation}>
          <Text
            accessibilityRole="header"
            style={[
              styles.explanationTitle,
              rtl && styles.arabicMedium,
              rtl && styles.textRight
            ]}
          >
            {financialCopy.netPosition.explanationTitle}
          </Text>
          <Text
            style={[
              styles.netWorthNote,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {financialCopy.netPosition.boundary}
          </Text>
          {sample ? (
            <Text
              style={[
                styles.heroSupporting,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {copy.sampleValueNote}
            </Text>
          ) : null}
          {netPosition.hasMultipleCurrencies ? (
            <Text
              style={[
                styles.heroSupporting,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {financialCopy.netPosition.currenciesSeparate}
            </Text>
          ) : null}
          {financialCopy.netPosition.explanationLines.map((line) => (
            <View
              key={line}
              style={[styles.explanationLine, rtl && styles.rowReverse]}
            >
              <View style={styles.explanationMarker} />
              <Text
                style={[
                  styles.explanationText,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {line}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LiabilitiesSection({
  amountsHidden,
  copy,
  language,
  netPosition,
  onAddLiability,
  onConfirmNoLiabilities,
  onOpenSubject,
  rtl,
  workspace
}: {
  readonly amountsHidden: boolean;
  readonly copy: PortfolioExperienceCopy;
  readonly language: LanguageCode;
  readonly netPosition: NetPositionSnapshot;
  readonly onAddLiability?: (() => void) | undefined;
  readonly onConfirmNoLiabilities?: (() => void) | undefined;
  readonly onOpenSubject?:
    | ((subject: PortfolioValuableSubject) => void)
    | undefined;
  readonly rtl: boolean;
  readonly workspace: NativeWorkspace;
}) {
  const liabilities = getLiabilities(workspace);
  const active = liabilities.filter(isActiveLiability);
  const archived = liabilities.filter((liability) => !isActiveLiability(liability));
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(false);
  const visibleActive = activeExpanded ? active : active.slice(0, 3);
  const review = netPosition.liabilityReview;
  const validNoneReview = Boolean(
    active.length === 0 &&
      review &&
      !netPosition.liabilityReviewExpired &&
      !netPosition.liabilityReviewInvalidated
  );
  const invalidatedNoneReview = Boolean(
    active.length === 0 &&
      review &&
      netPosition.liabilityReviewInvalidated
  );

  return (
    <DashboardSection
      action={
        onAddLiability ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAddLiability}
            style={({ pressed }) => [
              styles.addLiability,
              rtl && styles.rowReverse,
              pressed && styles.pressed
            ]}
            testID="liability-add"
          >
            <Plus color={colors.carbon} size={17} weight="bold" />
            <Text
              style={[
                styles.addLiabilityLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {copy.liabilities.add}
            </Text>
          </Pressable>
        ) : undefined
      }
      rtl={rtl}
      subtitle={copy.liabilities.subtitle}
      testID="portfolio-liabilities-section"
      title={copy.liabilities.title}
    >
      <View testID="liabilities-list">
        {active.length > 0 ? (
          <>
            <View style={styles.liabilityList}>
              {visibleActive.map((liability) => (
                <LiabilityRow
                  amountsHidden={amountsHidden}
                  copy={copy}
                  key={liability.id}
                  language={language}
                  liability={liability}
                  onPress={
                    onOpenSubject
                      ? () =>
                          onOpenSubject({
                            kind: "liability",
                            liabilityId: liability.id
                          })
                      : undefined
                  }
                  rtl={rtl}
                  stale={netPosition.staleLiabilityIds.includes(liability.id)}
                  workspace={workspace}
                />
              ))}
            </View>
            {active.length > 3 ? (
              <TextAction
                expanded={activeExpanded}
                kind="expand"
                label={
                  activeExpanded
                    ? copy.liabilities.showFewer
                    : copy.liabilities.viewAll(active.length)
                }
                onPress={() =>
                  setActiveExpanded((current) => !current)
                }
                rtl={rtl}
                testID="portfolio-liabilities-view-all"
              />
            ) : null}
          </>
        ) : (
          <View style={[styles.liabilityEmpty, rtl && styles.alignEnd]}>
            <View style={[styles.liabilityEmptyHeading, rtl && styles.rowReverse]}>
              {validNoneReview ? (
                <CheckCircle color={colors.success} size={24} weight="regular" />
              ) : (
                <CreditCard color={colors.text} size={24} weight="regular" />
              )}
              <View style={styles.liabilityEmptyCopy}>
                <Text
                  style={[
                    styles.liabilityEmptyTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.textRight
                  ]}
                >
                  {validNoneReview
                    ? copy.liabilities.noneConfirmed
                    : invalidatedNoneReview
                      ? copy.liabilities.noneReviewChangedTitle
                      : copy.liabilities.noActiveTitle}
                </Text>
                <Text
                  style={[
                    styles.liabilityEmptyBody,
                    rtl && styles.arabic,
                    rtl && styles.textRight
                  ]}
                >
                  {validNoneReview && review
                    ? copy.liabilities.noneConfirmedUntil(
                        dateLabel(review.expiresAt, language)
                      )
                    : invalidatedNoneReview
                      ? copy.liabilities.noneReviewChangedBody
                      : netPosition.liabilityReviewExpired
                      ? copy.liabilities.noneReviewExpired
                      : copy.liabilities.noActiveBody}
                </Text>
              </View>
            </View>
            {!validNoneReview && onConfirmNoLiabilities ? (
              <Pressable
                accessibilityHint={copy.liabilities.confirmNoneBody}
                accessibilityRole="button"
                onPress={onConfirmNoLiabilities}
                style={({ pressed }) => [
                  styles.confirmNone,
                  rtl && styles.rowReverse,
                  pressed && styles.pressed
                ]}
                testID="liability-confirm-none"
              >
                <CheckCircle color={colors.text} size={19} weight="regular" />
                <Text
                  style={[
                    styles.confirmNoneLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.liabilities.confirmNone}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {archived.length > 0 ? (
          <View style={styles.archivedGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: archivedOpen }}
              onPress={() => setArchivedOpen((current) => !current)}
              style={({ pressed }) => [
                styles.archivedToggle,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
              testID="liability-archived-toggle"
            >
              <Text
                style={[
                  styles.archivedGroupTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.textRight
                ]}
              >
                {copy.liabilities.archivedCount(archived.length)}
              </Text>
              {archivedOpen ? (
                <CaretUp color={colors.textMuted} size={18} />
              ) : (
                <CaretDown color={colors.textMuted} size={18} />
              )}
            </Pressable>
            {archivedOpen
              ? archived.map((liability) => (
                  <LiabilityRow
                    amountsHidden={amountsHidden}
                    copy={copy}
                    key={liability.id}
                    language={language}
                    liability={liability}
                    onPress={
                      onOpenSubject
                        ? () =>
                            onOpenSubject({
                              kind: "liability",
                              liabilityId: liability.id
                            })
                        : undefined
                    }
                    rtl={rtl}
                    stale={false}
                    workspace={workspace}
                  />
                ))
              : null}
          </View>
        ) : null}
      </View>
    </DashboardSection>
  );
}

function LiabilityRow({
  amountsHidden,
  copy,
  language,
  liability,
  onPress,
  rtl,
  stale,
  workspace
}: {
  readonly amountsHidden: boolean;
  readonly copy: PortfolioExperienceCopy;
  readonly language: LanguageCode;
  readonly liability: NativeLiability;
  readonly onPress?: (() => void) | undefined;
  readonly rtl: boolean;
  readonly stale: boolean;
  readonly workspace: NativeWorkspace;
}) {
  const { fontScale, width } = useWindowDimensions();
  const stacked = shouldStackPortfolioFinancialLayout(
    width,
    fontScale
  );
  const current = getPortfolioValueHistory(workspace, {
    kind: "liability",
    liabilityId: liability.id
  })[0] ?? null;
  const formatted = current
    ? formatRecordedValue({
        amountMinor: current.amountMinor,
        currency: current.currency,
        isolateBidi: true,
        language,
        visibility: valueVisibilityFromHidden(amountsHidden)
      })
    : null;
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const LiabilityIcon = LIABILITY_KIND_ICONS[liability.kind];
  const zeroBalance = current?.amountMinor === 0;
  const balanceStatus = current
    ? zeroBalance
      ? copy.liabilities.zeroBalanceOn(dateLabel(current.asOf, language))
      : stale
      ? copy.liabilities.balanceNeedsReview
      : `${copy.liabilities.currentBalance} \u00B7 ${dateLabel(
          current.asOf,
          language
         )}`
    : copy.liabilities.noBalance;
  const syncLabel = liabilitySyncLabel(
    combinedLiabilitySyncStatus(
      liability.syncStatus,
      current?.syncStatus
    ),
    copy
  );
  const lifecycleStatus = [
    liabilityLifecycleLabel(liability, language),
    stale ? copy.liabilities.balanceNeedsReview : null,
    syncLabel
  ]
    .filter(Boolean)
    .join(" \u00B7 ");
  const identityContent = (
    <>
      <View style={styles.liabilityIcon}>
        <LiabilityIcon color={colors.text} size={20} weight="regular" />
      </View>
      <View style={styles.liabilityCopy}>
        <Text
          numberOfLines={2}
          style={[
            styles.liabilityName,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {liability.name}
        </Text>
        <Text
          style={[
            styles.liabilityMeta,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {liabilityKindLabel(liability.kind, language)}
          {" \u00B7 "}
          {balanceStatus}
        </Text>
      </View>
    </>
  );
  const valueContent = (
    <View
      style={[
        styles.liabilityValueCopy,
        stacked && styles.liabilityValueCopyStacked,
        stacked && rtl && styles.liabilityValueCopyStackedRtl
      ]}
    >
      <Text
        style={[
          styles.liabilityValue,
          stacked && styles.liabilityValueStacked,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
        {formatted?.text ?? "?"}
      </Text>
      <Text
        style={[
          styles.liabilityLifecycle,
          stacked && styles.liabilityLifecycleStacked,
          stale && styles.liabilityStale,
          rtl && styles.arabic,
          rtl && styles.textRight
        ]}
      >
        {lifecycleStatus}
      </Text>
    </View>
  );
  const forwardIcon = onPress ? (
    <ForwardIcon color={colors.textMuted} size={18} />
  ) : null;
  const content = stacked ? (
    <>
      <View
        style={[
          styles.liabilityIdentityRow,
          rtl && styles.rowReverse
        ]}
      >
        {identityContent}
        {forwardIcon}
      </View>
      {valueContent}
    </>
  ) : (
    <>
      {identityContent}
      {valueContent}
      {forwardIcon}
    </>
  );
  const accessibilityLabel = `${liability.name}, ${liabilityKindLabel(
    liability.kind,
    language
  )}, ${formatted?.accessibilityLabel ?? copy.liabilities.noBalance}, ${balanceStatus}, ${lifecycleStatus}`;
  return onPress ? (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      key={liability.id}
      onPress={onPress}
      style={({ pressed }) => [
        styles.liabilityRow,
        stacked && styles.liabilityRowStacked,
        rtl && !stacked && styles.rowReverse,
        pressed && styles.pressed
      ]}
      testID={`liability-row-${liability.id}`}
    >
      {content}
    </Pressable>
  ) : (
    <View
      accessibilityLabel={accessibilityLabel}
      key={liability.id}
      style={[
        styles.liabilityRow,
        stacked && styles.liabilityRowStacked,
        rtl && !stacked && styles.rowReverse
      ]}
    >
      {content}
    </View>
  );
}

function RegisterHealth({
  copy,
  language,
  onReviewAssets,
  onReviewPlaces,
  rtl,
  snapshot
}: {
  readonly copy: DashboardCopy;
  readonly language: LanguageCode;
  readonly onReviewAssets?:
    | ((intent: PortfolioReviewIntent) => void)
    | undefined;
  readonly onReviewPlaces?: (() => void) | undefined;
  readonly rtl: boolean;
  readonly snapshot: PortfolioSnapshot;
}) {
  return (
    <DashboardSection
      rtl={rtl}
      subtitle={undefined}
      testID="portfolio-register-health-section"
      title={copy.overview}
    >
      <View style={styles.metricsBand}>
        <MetricRow
          detail={copy.documentedDetail}
          label={copy.documented}
          progress={snapshot.documentedItems}
          progressLabel={copy.ratio(
            snapshot.documentedItems.complete,
            snapshot.documentedItems.total
          )}
          rtl={rtl}
          value={portfolioPercentLabel(
            snapshot.documentedItems,
            language
          )}
        />
        <MetricRow
          detail={
            snapshot.locationReadyItems.total === 0
              ? copy.noApplicableLocations
              : copy.locationReadyDetail
          }
          label={copy.locationReady}
          onPress={
            onReviewAssets && snapshot.locationGapAssetIds.length > 0
              ? () => onReviewAssets("location")
              : undefined
          }
          progress={snapshot.locationReadyItems}
          progressLabel={copy.ratio(
            snapshot.locationReadyItems.complete,
            snapshot.locationReadyItems.total
          )}
          rtl={rtl}
          value={
            snapshot.locationReadyItems.percent === null
              ? "—"
              : portfolioPercentLabel(
                  snapshot.locationReadyItems,
                  language
                )
          }
        />
        <MetricRow
          detail={
            snapshot.propertyPinsConfirmed.total === 0
              ? copy.noProperties
              : copy.propertyPinsDetail
          }
          label={copy.propertyPins}
          onPress={
            onReviewPlaces && snapshot.propertyPinGapPlaceIds.length > 0
              ? onReviewPlaces
              : undefined
          }
          progress={{
            complete: snapshot.propertyPinsConfirmed.complete,
            total: snapshot.propertyPinsConfirmed.total,
            percent: snapshot.propertyPinsConfirmed.percent,
            assetIds: snapshot.propertyPinsConfirmed.placeIds
          }}
          progressLabel={copy.ratio(
            snapshot.propertyPinsConfirmed.complete,
            snapshot.propertyPinsConfirmed.total
          )}
          rtl={rtl}
          value={
            snapshot.propertyPinsConfirmed.percent === null
              ? "—"
              : `${formatLocalizedNumber(
                  snapshot.propertyPinsConfirmed.complete,
                  language
                )}/${formatLocalizedNumber(
                  snapshot.propertyPinsConfirmed.total,
                  language
                )}`
          }
        />
        <MetricRow
          detail={copy.proofGapsDetail}
          label={copy.proofGaps}
          onPress={
            onReviewAssets && snapshot.proofGapAssetIds.length > 0
              ? () => onReviewAssets("proof")
              : undefined
          }
          rtl={rtl}
          value={formatLocalizedNumber(
            snapshot.proofGapAssetIds.length,
            language
          )}
        />
      </View>
    </DashboardSection>
  );
}

function MetricRow({
  detail,
  label,
  onPress,
  progress,
  progressLabel,
  rtl,
  value
}: {
  readonly detail: string;
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly progress?: PortfolioRatio | undefined;
  readonly progressLabel?: string | undefined;
  readonly rtl: boolean;
  readonly value: string;
}) {
  const content = (
    <>
      <View style={[styles.metricMain, rtl && styles.rowReverse]}>
        <View style={styles.metricCopy}>
          <Text
            style={[
              styles.metricLabel,
              rtl && styles.arabicMedium,
              rtl && styles.textRight
            ]}
          >
            {label}
          </Text>
          <Text
            style={[
              styles.metricDetail,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {detail}
          </Text>
        </View>
        <Text
          style={[
            styles.metricValue,
            rtl && styles.arabicHeading,
            rtl && styles.textRight
          ]}
        >
          {value}
        </Text>
        {onPress ? (
          rtl ? (
            <ArrowLeft color={colors.textMuted} size={18} />
          ) : (
            <ArrowRight color={colors.textMuted} size={18} />
          )
        ) : null}
      </View>
      {progress && progress.percent !== null ? (
        <View
          accessibilityLabel={`${label}: ${
            progressLabel ?? `${progress.complete} of ${progress.total}`
          }`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: progress.percent
          }}
          style={styles.progressTrack}
        >
          <View
            style={[
              styles.progressFill,
              rtl && styles.progressFillRtl,
              { width: `${progress.percent}%` }
            ]}
            testID="portfolio-progress-fill"
          />
        </View>
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityLabel={`${label}. ${value}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricRow,
        pressed && styles.pressed
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      accessibilityLabel={`${label}. ${value}. ${detail}`}
      style={styles.metricRow}
    >
      {content}
    </View>
  );
}

function LocationDistribution({
  copy,
  language,
  rtl,
  snapshot
}: {
  readonly copy: DashboardCopy;
  readonly language: LanguageCode;
  readonly rtl: boolean;
  readonly snapshot: PortfolioSnapshot;
}) {
  return (
    <DashboardSection
      rtl={rtl}
      subtitle={copy.locationDistributionDetail}
      testID="portfolio-location-distribution-section"
      title={copy.locationDistribution}
    >
      <View style={styles.distribution}>
        {snapshot.locationDistribution.map((bucket) => {
          const label = portfolioLocationBucketLabel(bucket, language);
          const percent = portfolioPercentLabel(bucket, language);
          return (
            <View
              accessibilityLabel={`${label}: ${copy.items(
                bucket.count
              )}, ${percent}`}
              key={bucket.id}
              style={styles.distributionRow}
            >
            <View
              style={[
                styles.distributionHeading,
                rtl && styles.rowReverse
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.distributionLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.textRight
                ]}
              >
                {label}
              </Text>
              <Text
                style={[
                  styles.distributionCount,
                  rtl && styles.arabic,
                  rtl && styles.textRight
                ]}
              >
                {formatLocalizedNumber(bucket.count, language)} · {percent}
              </Text>
            </View>
            <View style={styles.distributionTrack}>
              <View
                style={[
                  styles.distributionFill,
                  rtl && styles.distributionFillRtl,
                  bucket.kind === "needs-confirmation" &&
                    styles.distributionWarning,
                  { width: `${bucket.percent}%` }
                ]}
                testID={`portfolio-distribution-fill-${bucket.id}`}
              />
            </View>
            </View>
          );
        })}
      </View>
    </DashboardSection>
  );
}

function ReviewNext({
  copy,
  language,
  onReviewAssets,
  onReviewPlaces,
  rtl,
  snapshot
}: {
  readonly copy: DashboardCopy;
  readonly language: LanguageCode;
  readonly onReviewAssets?:
    | ((intent: PortfolioReviewIntent) => void)
    | undefined;
  readonly onReviewPlaces?: (() => void) | undefined;
  readonly rtl: boolean;
  readonly snapshot: PortfolioSnapshot;
}) {
  const actions = [
    {
      id: "unvalued" as const,
      icon: Tag,
      label: copy.missingValues,
      count: snapshot.unvaluedAssetIds.length,
      onPress: onReviewAssets
        ? () => onReviewAssets("unvalued")
        : undefined
    },
    {
      id: "unvalued-properties" as const,
      icon: MapPin,
      label: copy.missingPropertyValues,
      count: snapshot.unvaluedPlaceIds.length,
      onPress: onReviewPlaces
    },
    {
      id: "proof" as const,
      icon: FileText,
      label: copy.missingProof,
      count: snapshot.proofGapAssetIds.length,
      onPress: onReviewAssets
        ? () => onReviewAssets("proof")
        : undefined
    },
    {
      id: "location" as const,
      icon: MapPin,
      label: copy.missingLocation,
      count: snapshot.locationGapAssetIds.length,
      onPress: onReviewAssets
        ? () => onReviewAssets("location")
        : undefined
    }
  ].filter((item) => item.count > 0);

  if (actions.length === 0 && snapshot.pendingProofReviewCount === 0) {
    return null;
  }

  return (
    <DashboardSection
      rtl={rtl}
      testID="portfolio-review-next-section"
      title={copy.reviewNext}
    >
      <View style={styles.reviewNextList}>
        {actions.map((action) => (
          <GapAction
            compact
            count={action.count}
            icon={action.icon}
            key={action.id}
            label={action.label}
            language={language}
            onPress={action.onPress}
            rtl={rtl}
          />
        ))}
        {snapshot.pendingProofReviewCount > 0 ? (
          <GapAction
            compact
            count={snapshot.pendingProofReviewCount}
            icon={WarningCircle}
            label={copy.pendingReview}
            language={language}
            onPress={
              onReviewAssets
                ? () => onReviewAssets("proof-review")
                : undefined
            }
            rtl={rtl}
          />
        ) : null}
      </View>
    </DashboardSection>
  );
}

function GapAction({
  compact = false,
  count,
  icon: IconComponent,
  label,
  language,
  onPress,
  rtl
}: {
  readonly compact?: boolean;
  readonly count: number;
  readonly icon: Icon;
  readonly label: string;
  readonly language: LanguageCode;
  readonly onPress?: (() => void) | undefined;
  readonly rtl: boolean;
}) {
  const row = (
    <>
      <IconComponent color={colors.text} size={21} weight="regular" />
      <Text
        style={[
          styles.actionLabel,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.actionCount,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
        {formatLocalizedNumber(count, language)}
      </Text>
      {onPress ? (
        rtl ? (
          <ArrowLeft color={colors.textMuted} size={18} />
        ) : (
          <ArrowRight color={colors.textMuted} size={18} />
        )
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityLabel={`${label}: ${formatLocalizedNumber(
        count,
        language
      )}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        compact && styles.reviewNextRow,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
    >
      {row}
    </Pressable>
  ) : (
    <View
      accessibilityLabel={`${label}: ${formatLocalizedNumber(
        count,
        language
      )}`}
      style={[
        styles.actionRow,
        compact && styles.reviewNextRow,
        rtl && styles.rowReverse
      ]}
    >
      {row}
    </View>
  );
}

function RecordedValues({
  amountsHidden,
  copy,
  language,
  onOpenAsset,
  onOpenSubject,
  onReviewAssets,
  rtl,
  sample,
  snapshot
}: {
  readonly amountsHidden: boolean;
  readonly copy: DashboardCopy;
  readonly language: LanguageCode;
  readonly onOpenAsset?: ((assetId: string) => void) | undefined;
  readonly onOpenSubject?:
    | ((subject: PortfolioValuableSubject) => void)
    | undefined;
  readonly onReviewAssets?:
    | ((intent: PortfolioReviewIntent) => void)
    | undefined;
  readonly rtl: boolean;
  readonly sample: boolean;
  readonly snapshot: PortfolioSnapshot;
}) {
  const [expandedCurrencies, setExpandedCurrencies] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const currencies = [
    ...new Set(snapshot.recordedValues.map((item) => item.currency))
  ];
  const toggleCurrency = (currency: string) => {
    setExpandedCurrencies((current) => {
      const next = new Set(current);
      if (next.has(currency)) {
        next.delete(currency);
      } else {
        next.add(currency);
      }
      return next;
    });
  };
  return (
    <DashboardSection
      action={
        onReviewAssets ? (
          <TextAction
            label={copy.reviewAllItems}
            onPress={() => onReviewAssets("all")}
            rtl={rtl}
          />
        ) : undefined
      }
      rtl={rtl}
      testID="portfolio-recorded-values-section"
      title={copy.recordedItems}
    >
      {snapshot.recordedValues.length === 0 ? (
        <View style={[styles.emptyValues, rtl && styles.alignEnd]}>
          <View style={[styles.emptyValuesHeader, rtl && styles.rowReverse]}>
            <ChartDonut color={colors.text} size={25} weight="regular" />
            <Text
              style={[
                styles.emptyTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.noRecordedValues}
            </Text>
          </View>
          <Text
            style={[
              styles.emptyBody,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {sample ? copy.emptySample : copy.emptyPersonal}
          </Text>
          {onReviewAssets && snapshot.unvaluedAssetIds.length > 0 ? (
            <TextAction
              label={copy.reviewUnvalued}
              onPress={() => onReviewAssets("unvalued")}
              rtl={rtl}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.valueGroups}>
          {currencies.map((currency) => {
            const items = snapshot.recordedValues.filter(
              (item) => item.currency === currency
            );
            const expanded = expandedCurrencies.has(currency);
            const visibleItems = expanded ? items : items.slice(0, 3);
            return (
              <View
                key={currency}
                style={styles.valueGroup}
                testID={`portfolio-recorded-values-${currency}`}
              >
                <View
                  style={[styles.valueGroupHeader, rtl && styles.rowReverse]}
                >
                  <Text
                    style={[
                      styles.valueGroupCurrency,
                      rtl && styles.arabicMedium,
                      rtl && styles.textRight
                    ]}
                  >
                    {currency}
                  </Text>
                  <Text
                    style={[
                      styles.valueGroupCount,
                      rtl && styles.arabic,
                      rtl && styles.textRight
                    ]}
                  >
                    {copy.entries(items.length)}
                  </Text>
                </View>
                {visibleItems.map((item) => (
                  <RecordedValueRow
                    amountsHidden={amountsHidden}
                    copy={copy}
                    item={item}
                    key={item.subjectKey}
                    language={language}
                    onPress={
                      onOpenSubject
                        ? () => onOpenSubject(item.subject)
                        : item.subjectKind === "asset" &&
                            item.assetId &&
                            onOpenAsset
                          ? () => onOpenAsset(item.assetId!)
                          : undefined
                    }
                    rtl={rtl}
                  />
                ))}
                {items.length > 3 ? (
                  <TextAction
                    expanded={expanded}
                    kind="expand"
                    label={
                      expanded
                        ? copy.showFewerRecorded(currency)
                        : copy.viewAllRecorded(currency, items.length)
                    }
                    onPress={() => toggleCurrency(currency)}
                    rtl={rtl}
                    testID={`portfolio-recorded-values-view-all-${currency}`}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </DashboardSection>
  );
}

function RecordedValueRow({
  amountsHidden,
  copy,
  item,
  language,
  onPress,
  rtl
}: {
  readonly amountsHidden: boolean;
  readonly copy: DashboardCopy;
  readonly item: PortfolioSnapshot["recordedValues"][number];
  readonly language: LanguageCode;
  readonly onPress?: (() => void) | undefined;
  readonly rtl: boolean;
}) {
  const formattedValue = formatRecordedValue({
    amountMinor: item.amountMinor,
    currency: item.currency,
    isolateBidi: true,
    language,
    visibility: valueVisibilityFromHidden(amountsHidden)
  });
  const content = (
    <>
      <View style={styles.recordedItemCopy}>
        <Text
          numberOfLines={2}
          style={[
            styles.recordedItemName,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {item.name}
        </Text>
        <Text
          style={[
            styles.recordedItemMeta,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {item.subjectKind === "place"
            ? copy.property
            : localizedCategoryLabel(
                item.categoryId ?? "",
                item.categoryLabel,
                language
              )}{" "}
          · {copy.asOf}{" "}
          {dateLabel(item.asOf, language)}
          {item.subjectKind === "place" ? ` · ${copy.onDevice}` : ""}
        </Text>
      </View>
      <Text
        style={[
          styles.recordedItemValue,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
        {formattedValue.text}
      </Text>
      {onPress ? (
        rtl ? (
          <ArrowLeft color={colors.textMuted} size={18} />
        ) : (
          <ArrowRight color={colors.textMuted} size={18} />
        )
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityLabel={`${item.name}, ${formattedValue.accessibilityLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.recordedItem,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
      testID={`portfolio-recorded-value-${item.subjectKey}`}
    >
      {content}
    </Pressable>
  ) : (
    <View
      style={[styles.recordedItem, rtl && styles.rowReverse]}
      testID={`portfolio-recorded-value-${item.subjectKey}`}
    >
      {content}
    </View>
  );
}

function DashboardSection({
  action,
  children,
  rtl,
  subtitle,
  testID,
  title
}: {
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly rtl: boolean;
  readonly subtitle?: string | undefined;
  readonly testID?: string | undefined;
  readonly title: string;
}) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={[styles.sectionHeader, rtl && styles.rowReverse]}>
        <View style={styles.sectionHeadingCopy}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              rtl && styles.arabicHeading,
              rtl && styles.textRight
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.sectionSubtitle,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function TextAction({
  expanded,
  kind = "navigate",
  label,
  onPress,
  rtl,
  testID
}: {
  readonly expanded?: boolean;
  readonly kind?: "navigate" | "expand";
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={
        kind === "expand" ? { expanded: Boolean(expanded) } : undefined
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        rtl && styles.rowReverse,
        rtl && styles.alignSelfEnd,
        pressed && styles.pressed
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.textActionLabel,
          rtl && styles.arabicMedium,
          rtl && styles.textRight
        ]}
      >
        {label}
      </Text>
      {kind === "expand" ? (
        expanded ? (
          <CaretUp color={colors.text} size={17} />
        ) : (
          <CaretDown color={colors.text} size={17} />
        )
      ) : rtl ? (
        <ArrowLeft color={colors.text} size={17} />
      ) : (
        <ArrowRight color={colors.text} size={17} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dashboard: {
    gap: spacing.xxxl
  },
  heroDecisionGroup: {
    gap: spacing.xl
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  alignSelfEnd: {
    alignSelf: "flex-end"
  },
  textRight: {
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
  arabicHeading: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  heading: {
    gap: spacing.xs
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  contextLine: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center"
  },
  pageTitle: {
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8
  },
  sampleBadge: {
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xs,
    backgroundColor: colors.surface
  },
  sampleBadgeText: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8
  },
  introduction: {
    maxWidth: 520,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24
  },
  hero: {
    overflow: "hidden",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.carbon
  },
  voltRule: {
    position: "absolute",
    top: 0,
    left: spacing.lg,
    width: 72,
    height: 3,
    backgroundColor: colors.volt
  },
  voltRuleRtl: {
    right: spacing.lg,
    left: undefined
  },
  heroEyebrow: {
    flex: 1,
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.15
  },
  heroHeading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  heroHeadingCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  heroIntro: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  heroPrivacyStatus: {
    color: colors.concrete,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17
  },
  currencySelector: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  currencySelectorRtl: {
    flexDirection: "row-reverse"
  },
  currencySelectorChoice: {
    minWidth: 64,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: themes.dark.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: themes.dark.surface
  },
  currencySelectorChoiceSelected: {
    borderColor: colors.volt,
    backgroundColor: colors.volt
  },
  currencySelectorLabel: {
    color: colors.white,
    fontFamily: typography.metadata,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"]
  },
  currencySelectorLabelSelected: {
    color: colors.carbon
  },
  amountVisibilityButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: themes.dark.surfaceQuiet
  },
  amountVisibilityPressed: {
    backgroundColor: themes.dark.surfaceRaised
  },
  noTotal: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 31,
    lineHeight: 38,
    letterSpacing: -0.6
  },
  totalList: {
    gap: spacing.sm
  },
  totalRow: {
    alignItems: "flex-start",
    gap: 2,
    paddingVertical: spacing.xs
  },
  totalRowRtl: {
    alignItems: "flex-end"
  },
  totalRowSeparated: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong
  },
  totalValue: {
    width: "100%",
    color: colors.white,
    fontFamily: typography.displayBold,
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -0.55,
    fontVariant: ["tabular-nums"]
  },
  totalMeta: {
    color: colors.concrete,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17
  },
  netComposition: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themes.dark.border
  },
  netCompositionStacked: {
    flexDirection: "column"
  },
  netCompositionPart: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  netCompositionPartStacked: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themes.dark.border
  },
  netCompositionLabel: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  netCompositionValue: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    fontVariant: ["tabular-nums"]
  },
  netOperator: {
    width: 18,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 1
  },
  netOperatorText: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 19
  },
  heroFacts: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: themes.dark.border
  },
  heroFact: {
    minWidth: 0,
    flex: 1,
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: spacing.sm
  },
  heroFactSeparated: {
    borderEndWidth: StyleSheet.hairlineWidth,
    borderEndColor: themes.dark.border
  },
  heroFactSeparatedRtl: {
    borderRightWidth: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: themes.dark.border
  },
  heroFactValue: {
    color: colors.white,
    fontFamily: typography.metadata,
    fontSize: 20,
    lineHeight: 25,
    fontVariant: ["tabular-nums"]
  },
  heroFactLabel: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  heroSupporting: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  heroStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  heroStatusText: {
    flex: 1,
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  netWorthNote: {
    marginTop: spacing.xs,
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  explainButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.textMuted
  },
  explainLabel: {
    flex: 1,
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  explanation: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.textMuted
  },
  explanationTitle: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  explanationLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  explanationMarker: {
    width: 4,
    height: 4,
    marginTop: 8,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  explanationText: {
    flex: 1,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  section: {
    gap: spacing.md
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionHeadingCopy: {
    flex: 1,
    gap: 2
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  addLiability: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -spacing.xs,
    marginEnd: -spacing.xs,
    paddingHorizontal: spacing.xs
  },
  addLiabilityLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: "underline"
  },
  liabilityList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  liabilityRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  liabilityRowStacked: {
    flexDirection: "column",
    alignItems: "stretch"
  },
  liabilityIdentityRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  liabilityIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.mist
  },
  liabilityCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  liabilityName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 20
  },
  liabilityMeta: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17
  },
  liabilityValueCopy: {
    maxWidth: "38%",
    alignItems: "flex-end",
    gap: 2
  },
  liabilityValueCopyStacked: {
    width: "100%",
    maxWidth: "100%",
    alignItems: "flex-end",
    paddingStart: 40 + spacing.sm
  },
  liabilityValueCopyStackedRtl: {
    alignItems: "flex-start",
    paddingStart: 0,
    paddingEnd: 40 + spacing.sm
  },
  liabilityValue: {
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right",
    fontVariant: ["tabular-nums"]
  },
  liabilityValueStacked: {
    width: "100%"
  },
  liabilityLifecycle: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right"
  },
  liabilityLifecycleStacked: {
    width: "100%"
  },
  liabilityStale: {
    color: colors.warning
  },
  liabilityEmpty: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  liabilityEmptyHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  liabilityEmptyCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  liabilityEmptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  liabilityEmptyBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  confirmNone: {
    minHeight: 48,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  confirmNoneLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  archivedGroup: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  archivedToggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  archivedGroupTitle: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8
  },
  metricsBand: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  metricRow: {
    minHeight: 82,
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  metricMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  metricCopy: {
    flex: 1,
    gap: 1
  },
  metricLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  metricDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  metricValue: {
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ["tabular-nums"]
  },
  progressTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: colors.mist
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  progressFillRtl: {
    alignSelf: "flex-end"
  },
  distribution: {
    gap: spacing.md
  },
  distributionRow: {
    gap: spacing.xs
  },
  distributionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  distributionLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  distributionCount: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ["tabular-nums"]
  },
  distributionTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: radius.xs,
    backgroundColor: colors.mist
  },
  distributionFill: {
    height: "100%",
    borderRadius: radius.xs,
    backgroundColor: colors.carbon
  },
  distributionFillRtl: {
    alignSelf: "flex-end"
  },
  distributionWarning: {
    backgroundColor: colors.warning
  },
  actionList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  reviewNextList: {
    paddingStart: spacing.sm,
    borderStartWidth: 3,
    borderStartColor: colors.volt,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.borderStrong,
    borderBottomColor: colors.borderStrong
  },
  actionRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  reviewNextRow: {
    minHeight: 52
  },
  actionLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  actionCount: {
    minWidth: 24,
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right",
    fontVariant: ["tabular-nums"]
  },
  readyRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  readyCopy: {
    flex: 1,
    gap: 2
  },
  readyTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  readyDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  valueGroups: {
    gap: spacing.lg
  },
  valueGroup: {
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong
  },
  valueGroupHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  valueGroupCurrency: {
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1
  },
  valueGroupCount: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17
  },
  recordedItem: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  recordedItemCopy: {
    flex: 1,
    gap: 2
  },
  recordedItemName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 20
  },
  recordedItemMeta: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17
  },
  recordedItemValue: {
    maxWidth: "42%",
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right",
    fontVariant: ["tabular-nums"]
  },
  emptyValues: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  emptyValuesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 19,
    lineHeight: 25
  },
  emptyBody: {
    maxWidth: 500,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  firstItemState: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  emptyCopy: {
    gap: spacing.xs
  },
  textAction: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  textActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: "underline"
  },
  integrityNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    backgroundColor: colors.warningQuiet
  },
  integrityText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  pressed: {
    opacity: 0.64
  }
});
