import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter
} from "expo-router";
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  CurrencyCircleDollar,
  FileText,
  ImageSquare,
  MapPin,
  Warning
} from "phosphor-react-native";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useCallback, useState } from "react";

import {
  useAttachmentPreview
} from "@/components/AttachmentViewer";
import { AssetArtworkIcon } from "@/components/AssetArtwork";
import { PermissionNotice } from "@/components/PermissionDenied";
import { SyncTruth } from "@/components/SyncTruth";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  PrimaryButton,
  ScreenTitle,
  Section,
  SecondaryButton
} from "@/components/ui";
import {
  assetLifecycleStatus,
  type LanguageCode,
  type NativeAsset
} from "@/domain/model";
import { calculateNativeAssetReadiness } from "@/domain/readiness";
import {
  selectCurrentPortfolioValues
} from "@/domain/portfolio";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  localeTag,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import { formatRecordedValue } from "@/privacy/ValueVisibility";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export const ASSET_PASSPORT_COPY = {
  en: {
    notFoundTitle: "Passport not found",
    notFoundBody: "This record is not available in the current household.",
    restoreAlertTitle: "Restore this Asset Passport?",
    restoreAlertBody:
      "It will return to active lists with its location, evidence and value history unchanged.",
    keepArchived: "Keep archived",
    restorePassport: "Restore Passport",
    archiveAlertTitle: "Archive this Asset Passport?",
    archiveAlertBody:
      "It will leave active lists, but its location, evidence and value history will remain. You can restore it from Items → Archived.",
    keepActive: "Keep active",
    archivePassport: "Archive Passport",
    savedTitle: "Passport saved",
    savedMeta:
      "It is available on this device. Continue from Today whenever you are ready.",
    todayHint: "Returns to the Today overview",
    goToToday: "Go to Today",
    primaryPhoto: (name: string) => `Primary photo of ${name}`,
    openingPhoto: "Opening protected photo…",
    photoOpenError: "The protected photo could not be opened.",
    samplePhoto:
      "Sample photo metadata recorded · local category artwork shown",
    protectedPhoto: "Photo protected on this device",
    noPhoto: "No primary photo yet",
    archived: "Archived",
    onDevice: "On this device",
    created: (date: string) =>
      `Created ${date} · private to this household`,
    noPhysicalLocation: "No physical location needed",
    locationNotRecorded: "Location not recorded",
    deviceGps: (accuracy: string) => `Device GPS ±${accuracy} m`,
    pinAdjusted: "Property pin adjusted by you",
    noMeasuredAccuracy: "Location recorded without measured GPS accuracy",
    noPropertyPin: "No property pin is attached",
    retrievalPath: "RETRIEVAL PATH",
    openPlace: (name: string) => `Open ${name}`,
    archivedTitle: "Passport archived",
    archivedBody:
      "The record remains readable, but active editing and completion tasks are paused until you restore it.",
    completeTitle: "Passport complete",
    remaining: (count: string) =>
      `${count} ${count === "1" ? "thing" : "things"} to finish`,
    completeBody: "Identity, photo, location and proof are recorded.",
    missingAction: {
      photo: "Add a primary photo",
      location: "Confirm the retrieval location",
      evidence: "Attach useful proof",
      identity: "Finish the item identity"
    },
    missingMeta: {
      photo: "Add a clear image when you next have the item.",
      location: "Record a Place and an indoor retrieval clue.",
      evidence: "Attach a receipt, appraisal or useful document.",
      identity: "Add the missing identity information."
    },
    missingHint: (action: string) =>
      `Opens a focused editor for ${action.toLowerCase()}`,
    valueTitle: "Recorded asset value",
    valueEditHint:
      "Opens the value editor and keeps earlier entries in history.",
    valueAddHint: "Opens the recorded value form.",
    valueLabel: (amount: string, date: string) =>
      `Recorded asset value, ${amount}, as of ${date}`,
    noValueLabel: "No recorded asset value",
    notRecorded: "Not recorded",
    valueAsOf: (date: string) => `As of ${date} · entered by you`,
    valueOptional: "Optional · add only a value you know",
    valueTruth:
      "A dated amount you add yourself. ALYR does not estimate or convert it.",
    restoreBeforeValue: " Restore the Passport before changing it.",
    manageTitle: "Manage Passport",
    updateIdentity: "Update identity",
    replacePhoto: "Replace primary photo",
    updateLocation: "Update retrieval location",
    addProof: "Add proof or document",
    evidenceTitle: "Proof and documents",
    noEvidenceTitle: "No proof attached",
    noEvidenceBody:
      "Receipts, certificates and appraisals remain optional until you are ready to add them.",
    restoreTitle: "Restore Passport",
    restoreBody:
      "Return this record to active lists. Its evidence, location and value history are already preserved.",
    archiveTitle: "Archive Passport",
    archiveBody:
      "Archive records you no longer manage actively. Nothing is deleted, and the Passport can be restored later.",
    restoreAction: "Restore to active items",
    archiveAction: "Archive Passport",
    evidenceHint:
      "Opens evidence metadata, stored original and review controls.",
    reviewed: "reviewed",
    waitingReview: "waiting for review",
    expires: (date: string) => `expires ${date}`,
    reviewedByYou: "Reviewed by you",
    waitingForReview: "Waiting for your review",
    storageOnDevice: "on this device",
    storageQueued: "queued",
    storageSynced: "synced",
    expiresMeta: (date: string) => `Expires ${date}`
  },
  ar: {
    notFoundTitle: "جواز الغرض غير موجود",
    notFoundBody: "هذا السجل غير متاح ضمن الأسرة الحالية.",
    restoreAlertTitle: "استعادة جواز الغرض؟",
    restoreAlertBody:
      "سيعود إلى القوائم النشطة مع بقاء الموقع والإثباتات وسجل القيمة كما هي.",
    keepArchived: "إبقاؤه مؤرشفًا",
    restorePassport: "استعادة الجواز",
    archiveAlertTitle: "أرشفة جواز الغرض؟",
    archiveAlertBody:
      "سيغادر القوائم النشطة، مع الاحتفاظ بالموقع والإثباتات وسجل القيمة. يمكنك استعادته من «الأغراض ← المؤرشفة».",
    keepActive: "إبقاؤه نشطًا",
    archivePassport: "أرشفة الجواز",
    savedTitle: "تم حفظ الجواز",
    savedMeta:
      "أصبح متاحًا على هذا الجهاز. يمكنك المتابعة من «اليوم» عندما تكون جاهزًا.",
    todayHint: "يعود إلى نظرة «اليوم» العامة",
    goToToday: "الانتقال إلى اليوم",
    primaryPhoto: (name: string) => `الصورة الرئيسية للغرض ${name}`,
    openingPhoto: "جارٍ فتح الصورة المحمية…",
    photoOpenError: "تعذّر فتح الصورة المحمية.",
    samplePhoto:
      "تم تسجيل بيانات الصورة التجريبية · يظهر رسم الفئة المحلي",
    protectedPhoto: "الصورة محمية على هذا الجهاز",
    noPhoto: "لم تُضف صورة رئيسية بعد",
    archived: "مؤرشف",
    onDevice: "محفوظ على هذا الجهاز",
    created: (date: string) => `أُنشئ في ${date} · خاص بهذه الأسرة`,
    noPhysicalLocation: "لا يحتاج إلى موقع مادي",
    locationNotRecorded: "لم يُسجّل الموقع",
    deviceGps: (accuracy: string) => `تحديد الجهاز عبر GPS بدقة ±${accuracy} م`,
    pinAdjusted: "عدّلت دبوس العقار يدويًا",
    noMeasuredAccuracy: "تم تسجيل الموقع من دون دقة GPS مقاسة",
    noPropertyPin: "لا يوجد دبوس مرتبط بالعقار",
    retrievalPath: "مسار الاسترجاع",
    openPlace: (name: string) => `فتح ${name}`,
    archivedTitle: "جواز الغرض مؤرشف",
    archivedBody:
      "يبقى السجل متاحًا للقراءة، بينما تتوقف مهام التعديل والاستكمال إلى أن تستعيده.",
    completeTitle: "جواز الغرض مكتمل",
    remaining: (count: string) => `متطلبات الاستكمال: ${count}`,
    completeBody: "تم تسجيل الهوية والصورة والموقع والإثبات.",
    missingAction: {
      photo: "إضافة صورة رئيسية",
      location: "تأكيد موقع الاسترجاع",
      evidence: "إرفاق إثبات مفيد",
      identity: "استكمال بيانات الغرض"
    },
    missingMeta: {
      photo: "أضف صورة واضحة عندما يصبح الغرض في متناولك.",
      location: "سجّل المكان ودليل الاسترجاع داخل المبنى.",
      evidence: "أرفق إيصالًا أو تقييمًا أو مستندًا مفيدًا.",
      identity: "أضف بيانات الهوية الناقصة."
    },
    missingHint: (action: string) => `يفتح محررًا مخصصًا لإجراء «${action}»`,
    valueTitle: "القيمة المسجّلة للغرض",
    valueEditHint: "يفتح محرر القيمة مع الاحتفاظ بالمدخلات السابقة في السجل.",
    valueAddHint: "يفتح نموذج تسجيل قيمة الغرض.",
    valueLabel: (amount: string, date: string) =>
      `القيمة المسجّلة للغرض، ${amount}، بتاريخ ${date}`,
    noValueLabel: "لا توجد قيمة مسجّلة للغرض",
    notRecorded: "غير مسجّلة",
    valueAsOf: (date: string) => `بتاريخ ${date} · أدخلتها أنت`,
    valueOptional: "اختياري · أضف فقط قيمة تعرفها",
    valueTruth:
      "مبلغ مؤرّخ تضيفه بنفسك. لا تقدّر ALYR القيمة ولا تحوّل العملات.",
    restoreBeforeValue: " استعد جواز الغرض قبل تعديلها.",
    manageTitle: "إدارة جواز الغرض",
    updateIdentity: "تحديث الهوية",
    replacePhoto: "استبدال الصورة الرئيسية",
    updateLocation: "تحديث موقع الاسترجاع",
    addProof: "إضافة إثبات أو مستند",
    evidenceTitle: "الإثباتات والمستندات",
    noEvidenceTitle: "لا توجد إثباتات مرفقة",
    noEvidenceBody:
      "تبقى الإيصالات والشهادات والتقييمات اختيارية إلى أن تصبح جاهزًا لإضافتها.",
    restoreTitle: "استعادة جواز الغرض",
    restoreBody:
      "أعد هذا السجل إلى القوائم النشطة. إثباتاته وموقعه وسجل قيمته محفوظة.",
    archiveTitle: "أرشفة جواز الغرض",
    archiveBody:
      "أرشف السجلات التي لم تعد تديرها بنشاط. لا يُحذف شيء ويمكن استعادة الجواز لاحقًا.",
    restoreAction: "الاستعادة إلى الأغراض النشطة",
    archiveAction: "أرشفة الجواز",
    evidenceHint: "يفتح بيانات الإثبات والنسخة الأصلية المحفوظة وأدوات المراجعة.",
    reviewed: "تمت مراجعته",
    waitingReview: "بانتظار المراجعة",
    expires: (date: string) => `تنتهي صلاحيته في ${date}`,
    reviewedByYou: "راجعته أنت",
    waitingForReview: "بانتظار مراجعتك",
    storageOnDevice: "على هذا الجهاز",
    storageQueued: "في قائمة الانتظار",
    storageSynced: "تمت مزامنته",
    expiresMeta: (date: string) => `تنتهي صلاحيته في ${date}`
  }
} as const;

export function getAssetPassportCopy(language: LanguageCode) {
  return ASSET_PASSPORT_COPY[language];
}

export function isolateAssetPassportIdentifier(
  value: string,
  language: LanguageCode
): string {
  return language === "ar" ? `\u2068${value}\u2069` : value;
}

function localizedCategoryLabel(
  asset: Pick<NativeAsset, "categoryId" | "categoryLabel">,
  language: LanguageCode
): string {
  if (language === "en") return asset.categoryLabel;
  const labels: Readonly<Record<string, string>> = {
    "vehicle.car": "سيارة",
    "vehicle.motorcycle": "دراجة نارية",
    "property.house": "عقار",
    "property.apartment": "شقة",
    "property.land": "أرض",
    "property.commercial": "عقار تجاري",
    "lifestyle.watch": "ساعة",
    "lifestyle.jewelry": "مجوهرات",
    "art.painting": "لوحة فنية",
    "art.collectible": "مقتنيات",
    "home.electronics": "إلكترونيات",
    "home.furniture": "أثاث",
    "home.other": "غرض شخصي",
    "digital.asset": "مرجع رقمي",
    "document.important": "مستند مهم"
  };
  return labels[asset.categoryId] ?? asset.categoryLabel;
}

function missingAction(id: string, language: LanguageCode): string {
  const copy = getAssetPassportCopy(language);
  if (id === "photo") return copy.missingAction.photo;
  if (id === "location") return copy.missingAction.location;
  if (id === "evidence") return copy.missingAction.evidence;
  return copy.missingAction.identity;
}

function missingMeta(id: string, language: LanguageCode): string {
  const copy = getAssetPassportCopy(language);
  if (id === "photo") return copy.missingMeta.photo;
  if (id === "location") return copy.missingMeta.location;
  if (id === "evidence") return copy.missingMeta.evidence;
  return copy.missingMeta.identity;
}

function editHref(assetId: string, focus: string): string {
  return `/asset-edit?assetId=${encodeURIComponent(
    assetId
  )}&focus=${encodeURIComponent(focus)}&returnTo=passport`;
}

function recordedDateLabel(
  value: string,
  language: LanguageCode
): string {
  return formatLocalizedDate(value, language);
}

export default function AssetPassportScreen() {
  const { id, justCreated } = useLocalSearchParams<{
    id: string;
    justCreated?: string;
  }>();
  const router = useRouter();
  const { language, rtl } = useCoreJourneyCopy();
  const { visibility: valueVisibility } = usePortfolioPrivacy();
  const copy = getAssetPassportCopy(language);
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const {
    attachmentStore,
    can,
    clearError,
    error,
    pendingOperationCount,
    recordedAssetValues,
    repository,
    saving,
    setAssetLifecycle,
    sync,
    workspace
  } = useWorkspace();
  const [screenActive, setScreenActive] = useState(false);
  const asset = workspace?.assets.find((item) => item.id === id);
  const photoEvidence =
    workspace?.evidence.find((item) => item.id === asset?.photoEvidenceId) ??
    null;
  const samplePhotoMetadataOnly = Boolean(
    workspace?.mode === "sample" &&
      photoEvidence &&
      !asset?.photoUri &&
      !asset?.photoProtectedUri &&
      !photoEvidence.localUri
  );
  const photo = useAttachmentPreview({
    active:
      screenActive &&
      photoEvidence !== null &&
      !samplePhotoMetadataOnly,
    encryptedAtRest: repository.encryptedAtRest,
    evidence: photoEvidence,
    encryptedUri: asset?.photoProtectedUri,
    previewUri: asset?.photoUri,
    store: attachmentStore
  });

  useFocusEffect(
    useCallback(() => {
      setScreenActive(true);
      return () => setScreenActive(false);
    }, [])
  );

  if (!workspace || !asset) {
    return (
      <AppScreen safeEdges={[]}>
        <View style={styles.notFound}>
          <Warning color={colors.warning} size={32} />
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.notFoundTitle}
          </Text>
          <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
            {copy.notFoundBody}
          </BodyText>
        </View>
      </AppScreen>
    );
  }

  const readiness = calculateNativeAssetReadiness(
    asset,
    workspace.places,
    workspace.evidence
  );
  const missing = readiness.items.filter((item) => !item.complete);
  const evidence = workspace.evidence.filter((item) =>
    asset.evidenceIds.includes(item.id)
  );
  const place = workspace.places.find((item) => item.id === asset.placeId);
  const room = place?.rooms.find((item) => item.id === asset.roomId);
  const path = asset.categoryId.startsWith("digital")
    ? copy.noPhysicalLocation
    : place
      ? [place.name, room?.name, asset.locatorText]
          .filter(Boolean)
          .map((part) =>
            isolateAssetPassportIdentifier(String(part), language)
          )
          .join(language === "ar" ? " ‹ " : " › ")
      : copy.locationNotRecorded;
  const provenance =
    place?.locationSource === "device_gps" &&
    place.horizontalAccuracyMeters !== null
      ? copy.deviceGps(
          isolateAssetPassportIdentifier(
            formatLocalizedNumber(
              Math.round(place.horizontalAccuracyMeters),
              language
            ),
            language
          )
        )
      : place?.locationSource === "user_pin"
        ? copy.pinAdjusted
        : place?.latitude !== null && place?.latitude !== undefined
          ? copy.noMeasuredAccuracy
          : copy.noPropertyPin;
  const recordedValue =
    selectCurrentPortfolioValues(
      [asset],
      recordedAssetValues
    ).records[0] ?? null;
  const formattedRecordedValue = recordedValue
    ? formatRecordedValue({
        amountMinor: recordedValue.amountMinor,
        currency: recordedValue.currency,
        language,
        locale: localeTag(language),
        visibility: valueVisibility
      })
    : null;
  const archived = assetLifecycleStatus(asset) === "archived";
  const canWriteAsset = can("asset.write");
  const isJustCreated = justCreated === "1";

  const confirmLifecycleChange = () => {
    if (archived) {
      Alert.alert(
        copy.restoreAlertTitle,
        copy.restoreAlertBody,
        [
          { text: copy.keepArchived, style: "cancel" },
          {
            text: copy.restorePassport,
            onPress: () => {
              void setAssetLifecycle({
                assetId: asset.id,
                lifecycleStatus: "active"
              }).catch(() => undefined);
            }
          }
        ]
      );
      return;
    }
    Alert.alert(
      copy.archiveAlertTitle,
      copy.archiveAlertBody,
      [
        { text: copy.keepActive, style: "cancel" },
        {
          text: copy.archivePassport,
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await setAssetLifecycle({
                  assetId: asset.id,
                  lifecycleStatus: "archived"
                });
                router.replace("/assets?view=items&filter=archived");
              } catch {
                // WorkspaceProvider keeps the Passport visible with the error.
              }
            })();
          }
        }
      ]
    );
  };

  const readinessSection = archived ? (
    <Section>
      <Text
        style={[
          styles.sectionTitle,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {copy.archivedTitle}
      </Text>
      <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
        {copy.archivedBody}
      </BodyText>
    </Section>
  ) : (
    <Section>
      <View style={[styles.sectionHeading, rtl && styles.rowReverse]}>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {missing.length === 0
            ? copy.completeTitle
            : copy.remaining(
                formatLocalizedNumber(missing.length, language)
              )}
        </Text>
      </View>
      {missing.length === 0 ? (
        <View style={[styles.completeRow, rtl && styles.rowReverse]}>
          <View style={styles.completeIcon}>
            <Check color={colors.carbon} size={15} weight="bold" />
          </View>
          <Text
            style={[
              styles.completeLabel,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.completeBody}
          </Text>
        </View>
      ) : (
        missing.map((item, index) => (
          <Pressable
            accessibilityHint={copy.missingHint(
              missingAction(item.id, language)
            )}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canWriteAsset }}
            disabled={!canWriteAsset}
            key={item.id}
            onPress={() => router.push(editHref(asset.id, item.id))}
            style={({ pressed }) => [
              styles.gapRow,
              rtl && styles.rowReverse,
              pressed && styles.pressed
            ]}
            testID={
              index === 0
                ? "asset-passport-next-action"
                : `asset-passport-readiness-action-${item.id}`
            }
          >
            <View style={styles.gapMarker} />
            <View style={styles.gapCopy}>
              <Text
                style={[
                  styles.gapTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {missingAction(item.id, language)}
              </Text>
              <Text
                style={[
                  styles.gapMeta,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {missingMeta(item.id, language)}
              </Text>
            </View>
            {canWriteAsset ? (
              <ForwardIcon color={colors.textMuted} size={20} />
            ) : null}
          </Pressable>
        ))
      )}
    </Section>
  );

  return (
    <AppScreen safeEdges={[]} testID="asset-passport-screen">
      {isJustCreated ? (
        <View
          accessibilityRole="summary"
          style={[styles.savedPassport, rtl && styles.rowReverse]}
          testID="asset-passport-saved-confirmation"
        >
          <CheckCircle color={colors.success} size={24} weight="regular" />
          <View style={styles.savedPassportCopy}>
            <Text
              style={[
                styles.savedPassportTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.savedTitle}
            </Text>
            <Text
              style={[
                styles.savedPassportMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.savedMeta}
            </Text>
          </View>
          <Pressable
            accessibilityHint={copy.todayHint}
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.savedPassportAction,
              pressed && styles.pressed
            ]}
          >
            <Text
              style={[
                styles.savedPassportActionLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.goToToday}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {isJustCreated ? (
        <SyncTruth
          language={language}
          onPress={() => router.push("/vault")}
          pendingOperationCount={pendingOperationCount}
          sync={sync}
        />
      ) : null}
      {isJustCreated ? readinessSection : null}
      {error ? (
        <ErrorBanner
          message={localizedWorkspaceError(error, language)}
          onDismiss={clearError}
        />
      ) : null}
      {photo.status === "ready" ? (
        <Image
          accessibilityLabel={copy.primaryPhoto(
            isolateAssetPassportIdentifier(asset.name, language)
          )}
          source={{ uri: photo.uri }}
          style={styles.heroImage}
        />
      ) : (
        <View
          style={[
            styles.identityPlaceholder,
            rtl && styles.rowReverse
          ]}
        >
          {photo.status === "loading" ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : photo.status === "error" ? (
            <Warning color={colors.danger} size={30} weight="regular" />
          ) : (
            <AssetArtworkIcon asset={asset} size={34} />
          )}
          <View style={styles.placeholderCopy}>
            <Text
              style={[
                styles.placeholderTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {localizedCategoryLabel(asset, language)}
            </Text>
            <Text
              {...(photo.status === "error"
                ? {
                    accessibilityLiveRegion: "polite" as const,
                    accessibilityRole: "alert" as const
                  }
                : {})}
              style={[
                styles.placeholderMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {photo.status === "loading"
                ? copy.openingPhoto
                : photo.status === "error"
                  ? language === "ar"
                    ? copy.photoOpenError
                    : photo.error
                  : samplePhotoMetadataOnly
                    ? copy.samplePhoto
                    : asset.photoProtectedUri
                      ? copy.protectedPhoto
                      : copy.noPhoto}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.heading}>
        <View style={[styles.metadataRow, rtl && styles.rowReverse]}>
          <Text
            style={[
              styles.category,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {localizedCategoryLabel(asset, language)}
          </Text>
          <View
            style={[
              styles.statusBadge,
              archived && styles.statusBadgeArchived
            ]}
          >
            <Text
              style={[
                styles.statusBadgeLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {archived ? copy.archived : copy.onDevice}
            </Text>
          </View>
        </View>
        <ScreenTitle style={rtl ? styles.rtlText : styles.ltrText}>
          {asset.name}
        </ScreenTitle>
        <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
          {copy.created(
            language === "ar"
              ? formatLocalizedDate(asset.createdAt, language)
              : new Date(asset.createdAt).toLocaleDateString()
          )}
        </BodyText>
      </View>

      {!canWriteAsset ? (
        <PermissionNotice
          capability="asset.write"
          testID="asset-view-only-notice"
        />
      ) : null}
      {!isJustCreated ? readinessSection : null}

      <CommandSurface>
        <View style={[styles.commandHeading, rtl && styles.rowReverse]}>
          <MapPin color={colors.volt} size={24} weight="regular" />
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText,
              rtl && styles.commandLabelArabic
            ]}
            testID="asset-passport-retrieval-heading"
          >
            {copy.retrievalPath}
          </Text>
        </View>
        <Text
          style={[
            styles.commandTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {path}
        </Text>
        <Text
          style={[
            styles.commandMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {provenance}
        </Text>
        {place ? (
          <PrimaryButton
            icon={ForwardIcon}
            label={copy.openPlace(
              isolateAssetPassportIdentifier(place.name, language)
            )}
            onPress={() => router.push(`/place/${place.id}`)}
          />
        ) : null}
      </CommandSurface>

      <Section>
        <View style={styles.sectionHeading}>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
            testID="asset-passport-value-heading"
          >
            {copy.valueTitle}
          </Text>
        </View>
        <Pressable
          accessibilityHint={
            recordedValue
              ? copy.valueEditHint
              : copy.valueAddHint
          }
          accessibilityLabel={
            recordedValue && formattedRecordedValue
              ? copy.valueLabel(
                  isolateAssetPassportIdentifier(
                    formattedRecordedValue.accessibilityLabel,
                    language
                  ),
                  recordedDateLabel(recordedValue.asOf, language)
                )
              : copy.noValueLabel
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: archived || !canWriteAsset }}
          disabled={archived || !canWriteAsset}
          onPress={() =>
            router.push(
              `/asset-value?assetId=${encodeURIComponent(
                asset.id
              )}&returnTo=passport`
            )
          }
          style={({ pressed }) => [
            styles.valueRow,
            rtl && styles.rowReverse,
            (archived || !canWriteAsset) && styles.disabledRow,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.valueIcon}>
            <CurrencyCircleDollar
              color={colors.text}
              size={24}
              weight="regular"
            />
          </View>
          <View style={styles.valueCopy}>
            <Text
              style={[
                styles.valueAmount,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {recordedValue && formattedRecordedValue
                ? isolateAssetPassportIdentifier(
                    formattedRecordedValue.text,
                    language
                  )
                : copy.notRecorded}
            </Text>
            <Text
              style={[
                styles.valueMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {recordedValue
                ? copy.valueAsOf(
                    recordedDateLabel(recordedValue.asOf, language)
                  )
                : copy.valueOptional}
            </Text>
          </View>
          {!archived && canWriteAsset ? (
            <ForwardIcon color={colors.textMuted} size={20} />
          ) : null}
        </Pressable>
        <Text
          style={[
            styles.valueTruth,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.valueTruth}
          {archived ? copy.restoreBeforeValue : ""}
        </Text>
      </Section>

      {!archived && missing.length === 0 && canWriteAsset ? (
        <Section>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.manageTitle}
          </Text>
          <ManageRow
            label={copy.updateIdentity}
            language={language}
            onPress={() => router.push(editHref(asset.id, "identity"))}
            rtl={rtl}
          />
          <ManageRow
            label={copy.replacePhoto}
            language={language}
            onPress={() => router.push(editHref(asset.id, "photo"))}
            rtl={rtl}
          />
          {!asset.categoryId.startsWith("digital") ? (
            <ManageRow
              label={copy.updateLocation}
              language={language}
              onPress={() => router.push(editHref(asset.id, "location"))}
              rtl={rtl}
            />
          ) : null}
          <ManageRow
            label={copy.addProof}
            language={language}
            onPress={() => router.push(editHref(asset.id, "evidence"))}
            rtl={rtl}
          />
        </Section>
      ) : null}

      <Section>
        <View
          style={[styles.sectionHeading, rtl && styles.rowReverse]}
        >
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.evidenceTitle}
          </Text>
          <Text
            style={[
              styles.sectionCount,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {formatLocalizedNumber(evidence.length, language)}
          </Text>
        </View>
        {evidence.length > 0 ? (
          evidence.map((item) => (
            <EvidenceRow
              evidence={item}
              key={item.id}
              language={language}
              onPress={() => router.push(`/evidence/${item.id}`)}
              rtl={rtl}
            />
          ))
        ) : (
          <View
            style={[
              styles.emptyEvidence,
              rtl && styles.emptyEvidenceRtl
            ]}
          >
            <ImageSquare color={colors.text} size={30} weight="regular" />
            <Text
              style={[
                styles.emptyEvidenceTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.noEvidenceTitle}
            </Text>
            <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
              {copy.noEvidenceBody}
            </BodyText>
          </View>
        )}
      </Section>

      {canWriteAsset ? (
        <Section style={styles.lifecycleSection}>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {archived ? copy.restoreTitle : copy.archiveTitle}
          </Text>
          <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
            {archived ? copy.restoreBody : copy.archiveBody}
          </BodyText>
          {archived ? (
            <PrimaryButton
              icon={ArrowCounterClockwise}
              label={copy.restoreAction}
              loading={saving}
              onPress={confirmLifecycleChange}
            />
          ) : (
            <SecondaryButton
              destructive
              disabled={saving}
              icon={Archive}
              label={copy.archiveAction}
              onPress={confirmLifecycleChange}
            />
          )}
        </Section>
      ) : null}
    </AppScreen>
  );
}

function EvidenceRow({
  evidence,
  language,
  onPress,
  rtl
}: {
  readonly evidence: import("@/domain/model").NativeEvidence;
  readonly language: LanguageCode;
  readonly onPress: () => void;
  readonly rtl: boolean;
}) {
  const copy = getAssetPassportCopy(language);
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const reviewed = evidence.reviewStatus === "reviewed";
  const deadline = evidence.expiresAt
    ? recordedDateLabel(evidence.expiresAt, language)
    : null;
  const storageLabel =
    evidence.storageState === "on-device"
      ? copy.storageOnDevice
      : evidence.storageState === "queued"
        ? copy.storageQueued
        : copy.storageSynced;
  const protectedFileName = isolateAssetPassportIdentifier(
    evidence.fileName,
    language
  );
  return (
    <Pressable
      accessibilityHint={copy.evidenceHint}
      accessibilityLabel={`${protectedFileName}, ${
        reviewed ? copy.reviewed : copy.waitingReview
      }${deadline ? `, ${copy.expires(deadline)}` : ""}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.evidenceRow,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
    >
      <View style={styles.evidenceIcon}>
        {reviewed ? (
          <CheckCircle color={colors.success} size={23} weight="regular" />
        ) : (
          <FileText color={colors.text} size={23} weight="regular" />
        )}
      </View>
      <View style={styles.evidenceCopy}>
        <Text
          numberOfLines={2}
          style={[
            styles.evidenceName,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {protectedFileName}
        </Text>
        <Text
          style={[
            styles.evidenceMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {reviewed ? copy.reviewedByYou : copy.waitingForReview} ·{" "}
          {storageLabel}
          {deadline ? ` · ${copy.expiresMeta(deadline)}` : ""}
        </Text>
      </View>
      <ForwardIcon color={colors.textMuted} size={20} />
    </Pressable>
  );
}

function ManageRow({
  label,
  language,
  onPress,
  rtl
}: {
  readonly label: string;
  readonly language: LanguageCode;
  readonly onPress: () => void;
  readonly rtl: boolean;
}) {
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.manageRow,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
    >
      <Text
        style={[
          styles.manageLabel,
          language === "ar" && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <ForwardIcon color={colors.textMuted} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  savedPassport: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  savedPassportCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  savedPassportTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  savedPassportMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  savedPassportAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  savedPassportActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 16
  },
  heroImage: {
    width: "100%",
    aspectRatio: 1.45,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  identityPlaceholder: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  placeholderCopy: {
    flex: 1,
    gap: 3
  },
  placeholderTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  placeholderMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  heading: {
    gap: spacing.xs
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  category: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xs,
    backgroundColor: colors.surface
  },
  statusBadgeArchived: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.mist
  },
  statusBadgeLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16
  },
  commandHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 29
  },
  commandMeta: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  sectionHeading: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  sectionCount: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  valueRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  valueIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  valueCopy: {
    flex: 1,
    gap: 2
  },
  valueAmount: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
    lineHeight: 23,
    fontVariant: ["tabular-nums"]
  },
  valueMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  valueTruth: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  disabledRow: {
    opacity: 0.58
  },
  completeRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  completeIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  completeLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 21
  },
  gapRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  gapMarker: {
    width: 8,
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.warning
  },
  gapCopy: {
    flex: 1,
    gap: 2
  },
  gapTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  gapMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  manageRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  manageLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  emptyEvidence: {
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  emptyEvidenceRtl: {
    alignItems: "flex-end"
  },
  emptyEvidenceTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  evidenceRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  evidenceIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  evidenceCopy: {
    flex: 1,
    gap: 2
  },
  evidenceName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  evidenceMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  lifecycleSection: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  notFound: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  pressed: {
    opacity: 0.68
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
  ltrText: {
    writingDirection: "ltr"
  },
  commandLabelArabic: {
    letterSpacing: 0
  }
});
