import {
  Stack,
  useLocalSearchParams,
  useRouter,
  type Href
} from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  FileText,
  Fingerprint,
  HardDrive,
  Warning
} from "phosphor-react-native";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { ProofAttachmentButton } from "@/components/AttachmentViewer";
import { PermissionNotice } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import type {
  LanguageCode,
  NativeEvidence
} from "@/domain/model";
import {
  formatLocalizedNumber,
  localeTag,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

export const EVIDENCE_DETAIL_COPY = {
  en: {
    screenTitle: "Evidence",
    back: "Back",
    notFoundTitle: "Evidence not found",
    notFoundBody:
      "This record is not available in the current household.",
    kicker: "PROOF AND DOCUMENTS",
    attachedTo: (assetName: string) =>
      `Attached to ${assetName} · private to this household`,
    reviewState: "REVIEW STATE",
    reviewedTitle: "Reviewed by you",
    waitingTitle: "Waiting for your review",
    reviewedMeta: (date: string) => `Recorded ${date}.`,
    waitingMeta:
      "Open the original when available, check its metadata, then record your decision.",
    returnAlertTitle: "Return this evidence to review?",
    returnAlertBody:
      "The file stays attached. Its status will show that your household needs to review it again.",
    keepReviewed: "Keep reviewed",
    returnToReview: "Return to review",
    reviewAlertTitle: "Mark this evidence reviewed?",
    reviewAlertBody:
      "Confirm that you checked the visible metadata and, when available, opened the stored original. This does not verify ownership, authenticity or market value.",
    notYet: "Not yet",
    markReviewed: "Mark as reviewed",
    storedOriginal: "Stored original",
    originalUnavailable: "Original not available in this workspace",
    sampleMetadataOnly: "This sample contains metadata only.",
    reattachSource:
      "The metadata is preserved. Reattach the source before relying on this record.",
    metadata: "Evidence metadata",
    fileName: "File name",
    format: "Format",
    storedSize: "Stored size",
    kind: "Kind",
    relationship: "Relationship",
    captured: "Captured",
    expires: "Expires",
    integrityAndStorage: "Integrity and storage",
    storageState: "Storage state",
    checksum: "SHA-256 checksum",
    checksumMissing: "Not recorded in this preview",
    integrityTruth:
      "Review status records your household decision. It does not replace a professional appraisal, authenticity check or legal proof.",
    notRecorded: "Not recorded",
    saveError:
      "The review update was not saved. The evidence remains unchanged; try again.",
    byte: "byte",
    bytes: "bytes",
    kilobytes: "KB",
    megabytes: "MB",
    kinds: {
      paper: "Paper",
      artifact: "Artifact",
      media: "Media",
      record: "Record",
      note: "Note",
      link: "Link"
    },
    relations: {
      ownership: "Ownership",
      identity: "Identity",
      service: "Service",
      provenance: "Provenance",
      condition: "Condition",
      insurance: "Insurance",
      valuation: "Valuation",
      legal: "Legal",
      access: "Access",
      context: "Context",
      other: "Other"
    },
    storage: {
      "on-device": "On this device",
      queued: "Queued for sync",
      synced: "Cloud acknowledged"
    }
  },
  ar: {
    screenTitle: "الإثبات",
    back: "العودة",
    notFoundTitle: "الإثبات غير موجود",
    notFoundBody: "هذا السجل غير متاح ضمن الأسرة الحالية.",
    kicker: "الإثباتات والمستندات",
    attachedTo: (assetName: string) =>
      `مرتبط بالغرض ${assetName} · خاص بهذه الأسرة`,
    reviewState: "حالة المراجعة",
    reviewedTitle: "راجعته أنت",
    waitingTitle: "بانتظار مراجعتك",
    reviewedMeta: (date: string) => `سُجّلت المراجعة في ${date}.`,
    waitingMeta:
      "افتح النسخة الأصلية عند توفرها، وراجع بياناتها الوصفية، ثم سجّل قرارك.",
    returnAlertTitle: "إعادة هذا الإثبات للمراجعة؟",
    returnAlertBody:
      "يبقى الملف مرفقًا، وتظهر حالته بأن الأسرة تحتاج إلى مراجعته من جديد.",
    keepReviewed: "إبقاؤه مُراجعًا",
    returnToReview: "إعادته للمراجعة",
    reviewAlertTitle: "تسجيل هذا الإثبات كمُراجع؟",
    reviewAlertBody:
      "أكّد أنك راجعت البيانات الظاهرة وفتحت النسخة الأصلية المحفوظة عند توفرها. لا يثبت ذلك الملكية أو الأصالة أو القيمة السوقية.",
    notYet: "ليس الآن",
    markReviewed: "تسجيل المراجعة",
    storedOriginal: "النسخة الأصلية المحفوظة",
    originalUnavailable: "النسخة الأصلية غير متاحة في مساحة العمل هذه",
    sampleMetadataOnly: "تحتوي هذه العينة على البيانات الوصفية فقط.",
    reattachSource:
      "تم الاحتفاظ بالبيانات الوصفية. أعد إرفاق المصدر قبل الاعتماد على هذا السجل.",
    metadata: "بيانات الإثبات",
    fileName: "اسم الملف",
    format: "الصيغة",
    storedSize: "الحجم المحفوظ",
    kind: "نوع الإثبات",
    relationship: "علاقته بالغرض",
    captured: "تاريخ الالتقاط",
    expires: "انتهاء الصلاحية",
    integrityAndStorage: "سلامة الملف والتخزين",
    storageState: "حالة التخزين",
    checksum: "بصمة SHA-256",
    checksumMissing: "غير مسجّلة في هذه النسخة التجريبية",
    integrityTruth:
      "تسجّل حالة المراجعة قرار الأسرة. ولا تحل محل التقييم المهني أو فحص الأصالة أو الإثبات القانوني.",
    notRecorded: "غير مسجّل",
    saveError:
      "لم يُحفظ تحديث المراجعة. بقي الإثبات كما هو؛ حاول مرة أخرى.",
    byte: "بايت",
    bytes: "بايت",
    kilobytes: "ك.ب",
    megabytes: "م.ب",
    kinds: {
      paper: "مستند ورقي",
      artifact: "أثر مادي",
      media: "وسائط",
      record: "سجل",
      note: "ملاحظة",
      link: "رابط"
    },
    relations: {
      ownership: "ملكية",
      identity: "هوية",
      service: "خدمة وصيانة",
      provenance: "مصدر",
      condition: "حالة",
      insurance: "تأمين",
      valuation: "تقييم",
      legal: "قانوني",
      access: "وصول",
      context: "سياق",
      other: "أخرى"
    },
    storage: {
      "on-device": "على هذا الجهاز",
      queued: "بانتظار المزامنة",
      synced: "تم تأكيده سحابيًا"
    }
  }
} as const;

export function getEvidenceDetailCopy(language: LanguageCode) {
  return EVIDENCE_DETAIL_COPY[language];
}

export function isolateEvidenceIdentifier(
  value: string,
  language: LanguageCode
): string {
  return language === "ar" ? `\u2068${value}\u2069` : value;
}

export function evidenceFileSize(
  bytes: number,
  language: LanguageCode
): string {
  const copy = getEvidenceDetailCopy(language);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    return copy.notRecorded;
  }
  if (bytes < 1024) {
    return `${formatLocalizedNumber(bytes, language)} ${
      bytes === 1 ? copy.byte : copy.bytes
    }`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatLocalizedNumber(
      Math.ceil(bytes / 1024),
      language
    )} ${copy.kilobytes}`;
  }
  return `${formatLocalizedNumber(bytes / (1024 * 1024), language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} ${copy.megabytes}`;
}

export function evidenceDateLabel(
  value: string | null | undefined,
  language: LanguageCode
): string {
  const copy = getEvidenceDetailCopy(language);
  if (!value) return copy.notYet;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy.notRecorded;
  return new Intl.DateTimeFormat(localeTag(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function evidenceKindLabel(
  value: NativeEvidence["kind"],
  language: LanguageCode
): string {
  return getEvidenceDetailCopy(language).kinds[value];
}

export function evidenceRelationLabel(
  value: NativeEvidence["relation"],
  language: LanguageCode
): string {
  return getEvidenceDetailCopy(language).relations[value];
}

export function evidenceStorageLabel(
  value: NativeEvidence["storageState"],
  language: LanguageCode
): string {
  return getEvidenceDetailCopy(language).storage[value];
}

export function evidenceBackHref(assetId: string | null | undefined): Href {
  return assetId
    ? (`/asset/${encodeURIComponent(assetId)}` as Href)
    : "/vault";
}

export default function EvidenceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getEvidenceDetailCopy(language);
  const {
    attachmentStore,
    can,
    clearError,
    error,
    repository,
    saving,
    setEvidenceReviewStatus,
    workspace
  } = useWorkspace();
  const evidence = workspace?.evidence.find((item) => item.id === id);
  const asset = workspace?.assets.find(
    (item) => item.id === evidence?.assetId
  );

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(evidenceBackHref(asset?.id));
  };
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  const backControl = () => (
    <Pressable
      accessibilityLabel={copy.back}
      accessibilityRole="button"
      hitSlop={8}
      onPress={goBack}
      style={({ pressed }) => [
        styles.backButton,
        pressed && styles.pressed
      ]}
      testID="evidence-back"
    >
      <BackIcon color={colors.text} size={22} weight="regular" />
    </Pressable>
  );

  const stackOptions = rtl
    ? {
        title: copy.screenTitle,
        headerBackVisible: false,
        headerLeft: () => null,
        headerRight: backControl
      }
    : {
        title: copy.screenTitle,
        headerBackVisible: false,
        headerLeft: backControl,
        headerRight: () => null
      };

  if (!workspace || !evidence || !asset) {
    return (
      <AppScreen safeEdges={[]} testID="evidence-not-found">
        <Stack.Screen options={stackOptions} />
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <ScreenTitle size="medium">{copy.notFoundTitle}</ScreenTitle>
          <BodyText muted>{copy.notFoundBody}</BodyText>
        </View>
      </AppScreen>
    );
  }

  const reviewed = evidence.reviewStatus === "reviewed";
  const canOpen = Boolean(evidence.localUri);
  const canReviewEvidence = can("evidence.write");
  const protectedFileName = isolateEvidenceIdentifier(
    evidence.fileName,
    language
  );
  const protectedAssetName = isolateEvidenceIdentifier(
    asset.name,
    language
  );

  const confirmReviewChange = () => {
    if (reviewed) {
      Alert.alert(
        copy.returnAlertTitle,
        copy.returnAlertBody,
        [
          { text: copy.keepReviewed, style: "cancel" },
          {
            text: copy.returnToReview,
            onPress: () => {
              void setEvidenceReviewStatus({
                evidenceId: evidence.id,
                reviewStatus: "pending"
              }).catch(() => undefined);
            }
          }
        ]
      );
      return;
    }
    Alert.alert(
      copy.reviewAlertTitle,
      copy.reviewAlertBody,
      [
        { text: copy.notYet, style: "cancel" },
        {
          text: copy.markReviewed,
          onPress: () => {
            void setEvidenceReviewStatus({
              evidenceId: evidence.id,
              reviewStatus: "reviewed"
            }).catch(() => undefined);
          }
        }
      ]
    );
  };

  return (
    <AppScreen safeEdges={[]} testID="evidence-detail-screen">
      <Stack.Screen options={stackOptions} />
      {error ? (
        <ErrorBanner
          message={language === "ar" ? copy.saveError : error}
          onDismiss={clearError}
        />
      ) : null}

      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.kicker,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText,
            rtl && styles.noTracking
          ]}
        >
          {copy.kicker}
        </Text>
        <ScreenTitle
          size="medium"
          style={rtl ? styles.mixedTitleRtl : styles.mixedTitle}
        >
          {protectedFileName}
        </ScreenTitle>
        <Text
          style={[
            styles.attachedMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.attachedTo(protectedAssetName)}
        </Text>
      </View>

      {!canReviewEvidence ? (
        <PermissionNotice
          capability="evidence.write"
          testID="evidence-view-only-notice"
        />
      ) : null}

      <CommandSurface>
        <View style={[styles.commandHeading, rtl && styles.rowReverse]}>
          <CheckCircle
            color={reviewed ? colors.volt : colors.concrete}
            size={24}
            weight="regular"
          />
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText,
              rtl && styles.noTracking
            ]}
          >
            {copy.reviewState}
          </Text>
        </View>
        <Text
          style={[
            styles.commandTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {reviewed ? copy.reviewedTitle : copy.waitingTitle}
        </Text>
        <Text
          style={[
            styles.commandMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {reviewed
            ? copy.reviewedMeta(
                evidenceDateLabel(evidence.reviewedAt, language)
              )
            : copy.waitingMeta}
        </Text>
      </CommandSurface>

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.storedOriginal}
        </Text>
        {canOpen ? (
          <ProofAttachmentButton
            encryptedAtRest={repository.encryptedAtRest}
            evidence={evidence}
            store={attachmentStore}
          />
        ) : (
          <View
            style={[
              styles.sourceUnavailable,
              rtl && styles.rowReverse
            ]}
          >
            <FileText color={colors.text} size={24} weight="regular" />
            <View style={[styles.sourceCopy, rtl && styles.alignEnd]}>
              <Text
                style={[
                  styles.sourceTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.originalUnavailable}
              </Text>
              <Text
                style={[
                  styles.sourceMeta,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {workspace.mode === "sample"
                  ? copy.sampleMetadataOnly
                  : copy.reattachSource}
              </Text>
            </View>
          </View>
        )}
      </Section>

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.metadata}
        </Text>
        <MetadataRow
          label={copy.fileName}
          mixed="auto"
          rtl={rtl}
          value={protectedFileName}
        />
        <MetadataRow
          label={copy.format}
          mixed="technical"
          rtl={rtl}
          value={isolateEvidenceIdentifier(evidence.mimeType, language)}
        />
        <MetadataRow
          label={copy.storedSize}
          rtl={rtl}
          value={evidenceFileSize(evidence.byteSize, language)}
        />
        <MetadataRow
          label={copy.kind}
          rtl={rtl}
          value={evidenceKindLabel(evidence.kind, language)}
        />
        <MetadataRow
          label={copy.relationship}
          rtl={rtl}
          value={evidenceRelationLabel(evidence.relation, language)}
        />
        <MetadataRow
          label={copy.captured}
          rtl={rtl}
          value={evidenceDateLabel(evidence.capturedAt, language)}
        />
        {evidence.expiresAt ? (
          <MetadataRow
            label={copy.expires}
            rtl={rtl}
            value={evidenceDateLabel(evidence.expiresAt, language)}
          />
        ) : null}
      </Section>

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.integrityAndStorage}
        </Text>
        <View style={[styles.integrityRow, rtl && styles.rowReverse]}>
          <HardDrive color={colors.text} size={22} weight="regular" />
          <View style={[styles.integrityCopy, rtl && styles.alignEnd]}>
            <Text
              style={[
                styles.integrityLabel,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.storageState}
            </Text>
            <Text
              style={[
                styles.integrityValue,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {evidenceStorageLabel(evidence.storageState, language)}
            </Text>
          </View>
        </View>
        <View style={[styles.integrityRow, rtl && styles.rowReverse]}>
          <Fingerprint color={colors.text} size={22} weight="regular" />
          <View style={[styles.integrityCopy, rtl && styles.alignEnd]}>
            <Text
              style={[
                styles.integrityLabel,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.checksum}
            </Text>
            <Text
              selectable
              style={[
                styles.checksum,
                rtl && styles.checksumRtl
              ]}
            >
              {evidence.checksumSha256
                ? isolateEvidenceIdentifier(
                    evidence.checksumSha256,
                    language
                  )
                : copy.checksumMissing}
            </Text>
          </View>
        </View>
        <BodyText muted>{copy.integrityTruth}</BodyText>
      </Section>

      {canReviewEvidence ? (
        reviewed ? (
          <SecondaryButton
            disabled={saving}
            label={copy.returnToReview}
            onPress={confirmReviewChange}
          />
        ) : (
          <PrimaryButton
            disabled={saving}
            label={copy.markReviewed}
            loading={saving}
            onPress={confirmReviewChange}
          />
        )
      ) : null}
    </AppScreen>
  );
}

function MetadataRow({
  label,
  mixed,
  rtl,
  value
}: {
  readonly label: string;
  readonly mixed?: "auto" | "technical";
  readonly rtl: boolean;
  readonly value: string;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.metadataRow, rtl && styles.rowReverse]}
    >
      <Text
        style={[
          styles.metadataLabel,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <Text
        selectable
        style={[
          styles.metadataValue,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText,
          mixed === "auto" && styles.mixedValue,
          mixed === "technical" && styles.technicalValue,
          mixed === "technical" && rtl && styles.technicalRtl
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
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
  attachedMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24
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
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 21,
    lineHeight: 28
  },
  sourceUnavailable: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  sourceCopy: {
    flex: 1,
    gap: 2
  },
  sourceTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  sourceMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  metadataRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  metadataLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  metadataValue: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "right"
  },
  integrityRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  integrityCopy: {
    flex: 1,
    gap: 2
  },
  integrityLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  integrityValue: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  checksum: {
    color: colors.text,
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 17,
    writingDirection: "ltr"
  },
  notFound: {
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  mixedTitle: {
    writingDirection: "auto"
  },
  mixedTitleRtl: {
    textAlign: "right",
    writingDirection: "auto"
  },
  mixedValue: {
    writingDirection: "auto"
  },
  technicalValue: {
    writingDirection: "ltr"
  },
  technicalRtl: {
    textAlign: "right",
    writingDirection: "ltr"
  },
  checksumRtl: {
    alignSelf: "stretch",
    textAlign: "right",
    writingDirection: "ltr"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  noTracking: {
    letterSpacing: 0
  },
  pressed: {
    opacity: 0.62
  }
});
