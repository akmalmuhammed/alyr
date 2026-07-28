import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowRight,
  CaretRight,
  CheckCircle,
  Crosshair,
  CurrencyCircleDollar,
  FilePlus,
  MapPin,
  NotePencil,
  Plus,
  Warning
} from "phosphor-react-native";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { chooseEvidenceDocument } from "@/adapters/capture";
import { AssetListItem } from "@/components/AssetListItem";
import { PlaceDocumentRow } from "@/components/PlaceDocumentRow";
import { PermissionNotice } from "@/components/PermissionDenied";
import { SyncTruth } from "@/components/SyncTruth";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section,
  SectionHeader
} from "@/components/ui";
import type {
  LanguageCode,
  NativeRoom
} from "@/domain/model";
import {
  isOwnedPropertyPlace,
  placeClassification
} from "@/domain/model";
import {
  getPortfolioValueRecords,
  selectCurrentPortfolioValues
} from "@/domain/portfolio";
import {
  formatLocalizedDate,
  formatLocalizedNumber,
  itemCount,
  localeTag,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { getCaptureCopy } from "@/i18n/captureCopy";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import { formatRecordedValue } from "@/privacy/ValueVisibility";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface PlaceDetailCopy {
  readonly notFoundTitle: string;
  readonly notFoundBody: string;
  readonly savedTitle: string;
  readonly savedMeta: string;
  readonly todayHint: string;
  readonly goToToday: string;
  readonly noAddress: string;
  readonly updated: (date: string) => string;
  readonly editPlace: string;
  readonly portfolioStatus: string;
  readonly includedInPortfolio: string;
  readonly excludedFromPortfolio: string;
  readonly reviewRelationship: string;
  readonly recordedPropertyValue: string;
  readonly noPropertyValue: string;
  readonly valueAsOf: (date: string) => string;
  readonly addPropertyValue: string;
  readonly updatePropertyValue: string;
  readonly propertyValueTruth: string;
  readonly propertyValueOnDevice: string;
  readonly placeLocation: string;
  readonly propertyLocation: string;
  readonly deviceGps: (accuracy: string) => string;
  readonly adjustedPin: string;
  readonly manualCoordinates: string;
  readonly pinNotSet: string;
  readonly localityOnlyTruth: string;
  readonly deviceGpsTruth: string;
  readonly userPinTruth: string;
  readonly addItemHere: string;
  readonly reviewPin: string;
  readonly setPin: string;
  readonly addItemWithoutPin: string;
  readonly spaces: string;
  readonly addSpace: string;
  readonly roomKind: Readonly<Record<NativeRoom["kind"], string>>;
  readonly inside: (parentName: string) => string;
  readonly topLevel: string;
  readonly roomAccessibilityLabel: (
    roomName: string,
    kind: string,
    count: string
  ) => string;
  readonly editSpaceHint: string;
  readonly noSpacesTitle: string;
  readonly noSpacesBody: string;
  readonly addFirstSpace: string;
  readonly documentPickerTitle: string;
  readonly documentPickerBody: string;
  readonly oversizedFileTitle: string;
  readonly oversizedFileBody: string;
  readonly documents: string;
  readonly attach: string;
  readonly attachAccessibilityLabel: string;
  readonly protectedDocuments: string;
  readonly previewDocuments: string;
  readonly documentTruth: string;
  readonly noDocumentsTitle: string;
  readonly noDocumentsBody: string;
  readonly items: string;
  readonly addFirstItem: string;
  readonly placeAlreadySelected: string;
  readonly noItems: string;
}

export const PLACE_DETAIL_COPY = {
  en: {
    notFoundTitle: "Place not found",
    notFoundBody:
      "This location is not available in the current household.",
    savedTitle: "Place saved",
    savedMeta:
      "It is available on this device. Continue from Today whenever you are ready.",
    todayHint: "Returns to the Today overview",
    goToToday: "Go to Today",
    noAddress: "No address summary recorded",
    updated: (date: string) => `Updated ${date}`,
    editPlace: "Edit Place",
    portfolioStatus: "PORTFOLIO STATUS",
    includedInPortfolio:
      "Confirmed as household-owned property. Its pin and recorded value can appear in Portfolio.",
    excludedFromPortfolio:
      "This Place remains available for retrieval, but it stays outside property counts and recorded values until ownership is confirmed.",
    reviewRelationship: "Review Place relationship",
    recordedPropertyValue: "RECORDED PROPERTY VALUE",
    noPropertyValue: "No property value recorded",
    valueAsOf: (date: string) => `Your entry · as of ${date}`,
    addPropertyValue: "Record property value",
    updatePropertyValue: "Update property value",
    propertyValueTruth:
      "A dated value you enter—not a live price, appraisal or proof of ownership.",
    propertyValueOnDevice:
      "Property values stay on this device in the pilot.",
    placeLocation: "PLACE LOCATION",
    propertyLocation: "PROPERTY LOCATION",
    deviceGps: (accuracy: string) => `Device GPS ±${accuracy} m`,
    adjustedPin: "Pin adjusted by you",
    manualCoordinates: "Coordinates entered manually",
    pinNotSet: "Exact pin not set",
    localityOnlyTruth:
      "The locality is recorded, but this Place has no property-level pin.",
    deviceGpsTruth:
      "The measurement describes the phone position. Confirm that the marker is on the correct property.",
    userPinTruth:
      "No measured GPS accuracy is claimed for this marker.",
    addItemHere: "Add an item here",
    reviewPin: "Review or adjust property pin",
    setPin: "Set property pin",
    addItemWithoutPin: "Add an item without a pin",
    spaces: "Spaces",
    addSpace: "Add space",
    roomKind: {
      room: "room",
      zone: "zone",
      container: "container"
    },
    inside: (parentName: string) => `inside ${parentName}`,
    topLevel: "top level",
    roomAccessibilityLabel: (
      roomName: string,
      kind: string,
      count: string
    ) => `${roomName}, ${kind}, ${count}`,
    editSpaceHint:
      "Edit this retrieval space without changing its stable ID.",
    noSpacesTitle: "No retrieval spaces yet",
    noSpacesBody:
      "Add the room, zone or container someone would need to physically find an item.",
    addFirstSpace: "Add the first space",
    documentPickerTitle: "Document did not open",
    documentPickerBody:
      "Nothing changed. Choose a PDF or image up to 10 MB.",
    oversizedFileTitle: "File is over 10 MB",
    oversizedFileBody:
      "Choose a smaller PDF or image. The original file was not changed.",
    documents: "Place documents",
    attach: "Attach",
    attachAccessibilityLabel: "Attach a Place document",
    protectedDocuments: "Protected locally · status shown per document",
    previewDocuments: "Session-only preview files",
    documentTruth:
      "These belong to the Place, not to an item. Each row reports whether its original is on device, waiting to upload, synced, or unavailable. Sync is not an independent disaster backup.",
    noDocumentsTitle: "No Place documents",
    noDocumentsBody:
      "Attach a deed, lease, plan, policy or other Place-level record.",
    items: "Items",
    addFirstItem: "Add the first item here",
    placeAlreadySelected: "This Place will already be selected.",
    noItems: "No items are recorded at this Place."
  },
  ar: {
    notFoundTitle: "المكان غير موجود",
    notFoundBody: "هذا الموقع غير متاح ضمن الأسرة الحالية.",
    savedTitle: "تم حفظ المكان",
    savedMeta:
      "أصبح متاحًا على هذا الجهاز. يمكنك المتابعة من «اليوم» عندما تكون جاهزًا.",
    todayHint: "يعود إلى نظرة «اليوم» العامة",
    goToToday: "الانتقال إلى اليوم",
    noAddress: "لم يُسجّل ملخص للعنوان",
    updated: (date: string) => `آخر تحديث ${date}`,
    editPlace: "تعديل المكان",
    portfolioStatus: "حالة المحفظة",
    includedInPortfolio:
      "تم تأكيده كعقار تملكه الأسرة، ويمكن أن يظهر دبوسه وقيمته المسجّلة ضمن المحفظة.",
    excludedFromPortfolio:
      "يبقى هذا المكان متاحاً للوصول إلى الأغراض، لكنه لا يدخل ضمن أعداد العقارات وقيمها حتى تتأكد الملكية.",
    reviewRelationship: "مراجعة علاقة المكان",
    recordedPropertyValue: "القيمة المسجّلة للعقار",
    noPropertyValue: "لم تُسجّل قيمة للعقار",
    valueAsOf: (date: string) => `إدخالك · بتاريخ ${date}`,
    addPropertyValue: "تسجيل قيمة العقار",
    updatePropertyValue: "تحديث قيمة العقار",
    propertyValueTruth:
      "قيمة مؤرخة تدخلها بنفسك، وليست سعرًا مباشرًا أو تقييمًا رسميًا أو إثبات ملكية.",
    propertyValueOnDevice:
      "تبقى قيم العقارات على هذا الجهاز في النسخة التجريبية.",
    placeLocation: "موقع المكان",
    propertyLocation: "موقع العقار",
    deviceGps: (accuracy: string) => `GPS الجهاز بدقة ±${accuracy} م`,
    adjustedPin: "عدّلت الدبوس يدويًا",
    manualCoordinates: "أُدخلت الإحداثيات يدويًا",
    pinNotSet: "لم يُحدّد دبوس دقيق",
    localityOnlyTruth:
      "المنطقة مسجّلة، لكن هذا المكان لا يتضمن دبوسًا على مستوى العقار.",
    deviceGpsTruth:
      "يمثل القياس موقع الهاتف. تأكد من وجود العلامة على العقار الصحيح.",
    userPinTruth: "لا تُنسب دقة GPS مقاسة إلى هذه العلامة.",
    addItemHere: "إضافة غرض هنا",
    reviewPin: "مراجعة دبوس العقار أو تعديله",
    setPin: "تحديد دبوس العقار",
    addItemWithoutPin: "إضافة غرض من دون دبوس",
    spaces: "مساحات الاسترجاع",
    addSpace: "إضافة مساحة",
    roomKind: {
      room: "غرفة",
      zone: "منطقة",
      container: "حاوية"
    },
    inside: (parentName: string) => `داخل ${parentName}`,
    topLevel: "المستوى الأعلى",
    roomAccessibilityLabel: (
      roomName: string,
      kind: string,
      count: string
    ) => `${roomName}، ${kind}، ${count}`,
    editSpaceHint:
      "يعدّل مساحة الاسترجاع هذه من دون تغيير معرّفها الثابت.",
    noSpacesTitle: "لا توجد مساحات استرجاع بعد",
    noSpacesBody:
      "أضف الغرفة أو المنطقة أو الحاوية التي يحتاجها شخص للعثور على الغرض فعليًا.",
    addFirstSpace: "إضافة أول مساحة",
    documentPickerTitle: "لم يُفتح المستند",
    documentPickerBody:
      "لم يتغير شيء. اختر ملف PDF أو صورة بحجم لا يتجاوز 10 م.ب.",
    oversizedFileTitle: "حجم الملف يتجاوز 10 م.ب.",
    oversizedFileBody:
      "اختر ملف PDF أو صورة أصغر. بقي الملف الأصلي كما هو.",
    documents: "مستندات المكان",
    attach: "إرفاق",
    attachAccessibilityLabel: "إرفاق مستند بالمكان",
    protectedDocuments: "محمية محليًا · تظهر حالة كل مستند",
    previewDocuments: "ملفات معاينة لهذه الجلسة فقط",
    documentTruth:
      "ترتبط هذه الملفات بالمكان لا بالغرض. يوضح كل صف ما إذا كانت النسخة الأصلية على الجهاز أو تنتظر الرفع أو متزامنة أو غير متاحة. المزامنة ليست نسخة مستقلة للتعافي من الكوارث.",
    noDocumentsTitle: "لا توجد مستندات للمكان",
    noDocumentsBody:
      "أرفق سندًا أو عقد إيجار أو مخططًا أو وثيقة تأمين أو سجلًا آخر يخص المكان.",
    items: "الأغراض",
    addFirstItem: "إضافة أول غرض هنا",
    placeAlreadySelected: "سيكون هذا المكان محددًا مسبقًا.",
    noItems: "لا توجد أغراض مسجّلة في هذا المكان."
  }
} as const satisfies Record<LanguageCode, PlaceDetailCopy>;

export function placeCoordinateLabel(
  latitude: number,
  longitude: number
): string {
  return `\u2066${latitude.toFixed(6)}, ${longitude.toFixed(6)}\u2069`;
}

export function placeSectionTitle(
  label: string,
  count: number,
  language: LanguageCode
): string {
  return `${label} · ${formatLocalizedNumber(count, language)}`;
}

export default function PlaceScreen() {
  const { id, justCreated } = useLocalSearchParams<{
    id: string;
    justCreated?: string;
  }>();
  const router = useRouter();
  const { language, rtl } = useCoreJourneyCopy();
  const { visibility: valueVisibility } = usePortfolioPrivacy();
  const copy = PLACE_DETAIL_COPY[language];
  const classificationCopy = getCaptureCopy(language);
  const {
    addPlaceDocument,
    attachmentStore,
    can,
    clearError,
    error,
    pendingOperationCount,
    repository,
    saving,
    sync,
    workspace
  } = useWorkspace();
  const place = workspace?.places.find((item) => item.id === id);

  if (!workspace || !place) {
    return (
      <AppScreen safeEdges={[]}>
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
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

  const assets = workspace.assets.filter((asset) => asset.placeId === place.id);
  const classification = placeClassification(place);
  const classificationLabel =
    classificationCopy.placeClassificationChoices[classification].label;
  const ownedProperty = isOwnedPropertyPlace(place);
  const documents = (workspace.placeDocuments ?? []).filter(
    (document) => document.placeId === place.id
  );
  const currentValue =
    selectCurrentPortfolioValues(
      [],
      getPortfolioValueRecords(workspace),
      [place]
    ).records[0] ?? null;
  const formattedCurrentValue = currentValue
    ? formatRecordedValue({
        amountMinor: currentValue.amountMinor,
        currency: currentValue.currency,
        language,
        locale: localeTag(language),
        visibility: valueVisibility
      })
    : null;
  const accuracy =
    place.horizontalAccuracyMeters === null
      ? null
      : formatLocalizedNumber(
          Math.round(place.horizontalAccuracyMeters),
          language
        );
  const pinLabel =
    place.locationSource === "device_gps" && accuracy !== null
      ? copy.deviceGps(accuracy)
      : place.locationSource === "user_pin"
        ? copy.adjustedPin
        : place.locationSource === "manual_coordinates"
          ? copy.manualCoordinates
          : copy.pinNotSet;
  const pinTruth =
    place.latitude === null
      ? copy.localityOnlyTruth
      : place.locationSource === "device_gps"
        ? copy.deviceGpsTruth
        : copy.userPinTruth;
  const hasPin = place.latitude !== null && place.longitude !== null;
  const coordinateLabel = hasPin
    ? placeCoordinateLabel(place.latitude!, place.longitude!)
    : null;
  const canWriteAssets = can("asset.write");
  const canWritePlaces = can("place.write");
  const canWriteEvidence = can("evidence.write");

  const attachDocument = async () => {
    const outcome = await chooseEvidenceDocument();
    if (!outcome.ok) {
      if (outcome.reason === "failed") {
        Alert.alert(copy.documentPickerTitle, copy.documentPickerBody);
      }
      return;
    }
    if (outcome.file.byteSize > MAX_FILE_BYTES) {
      Alert.alert(copy.oversizedFileTitle, copy.oversizedFileBody);
      return;
    }
    try {
      await addPlaceDocument({
        placeId: place.id,
        file: outcome.file
      });
    } catch {
      // WorkspaceProvider keeps the Place visible and reports the error.
    }
  };

  return (
    <AppScreen safeEdges={[]} testID="place-screen">
      {justCreated === "1" ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="summary"
          style={styles.savedReceipt}
          testID="place-saved-receipt"
        >
          <View style={[styles.savedReceiptHeading, rtl && styles.rowReverse]}>
            <CheckCircle color={colors.success} size={24} weight="regular" />
            <View style={styles.savedReceiptCopy}>
              <Text
                style={[
                  styles.savedReceiptTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.savedTitle}
              </Text>
              <Text
                style={[
                  styles.savedReceiptMeta,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.savedMeta}
              </Text>
            </View>
          </View>
          <PrimaryButton
            accessibilityHint={copy.todayHint}
            label={copy.goToToday}
            onPress={() => router.replace("/(tabs)")}
          />
        </View>
      ) : null}
      {justCreated === "1" ? (
        <SyncTruth
          language={language}
          onPress={() => router.push("/vault")}
          pendingOperationCount={pendingOperationCount}
          sync={sync}
        />
      ) : null}

      {error ? (
        <ErrorBanner
          message={localizedWorkspaceError(error, language)}
          onDismiss={clearError}
        />
      ) : null}

      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.region,
            rtl && styles.textRight,
            styles.mixedScript
          ]}
        >
          {place.regionLabel}
        </Text>
        <ScreenTitle
          style={rtl ? styles.mixedTextRtl : styles.mixedTextLtr}
        >
          {place.name}
        </ScreenTitle>
        <BodyText
          muted
          style={rtl ? styles.mixedTextRtl : styles.mixedTextLtr}
        >
          {place.addressSummary || copy.noAddress}
        </BodyText>
        <View style={[styles.recordMeta, rtl && styles.rowReverse]}>
          <Text
            style={[
              styles.recordMetaText,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.updated(formatLocalizedDate(place.updatedAt, language))}
          </Text>
          {canWritePlaces ? (
            <Pressable
              accessibilityLabel={copy.editPlace}
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  `/place-edit?placeId=${encodeURIComponent(place.id)}`
                )
              }
              style={({ pressed }) => [
                styles.textAction,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
            >
              <NotePencil color={colors.text} size={17} />
              <Text
                style={[
                  styles.textActionLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.editPlace}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!canWritePlaces ? (
        <PermissionNotice
          capability="place.write"
          testID="place-view-only-notice"
        />
      ) : null}

      <View
        accessibilityLabel={`${copy.portfolioStatus}. ${classificationLabel}. ${
          ownedProperty
            ? copy.includedInPortfolio
            : copy.excludedFromPortfolio
        }`}
        style={styles.portfolioStatus}
        testID="place-portfolio-status"
      >
        <View
          style={[
            styles.portfolioStatusHeading,
            rtl && styles.rowReverse
          ]}
        >
          {ownedProperty ? (
            <CheckCircle color={colors.success} size={22} weight="regular" />
          ) : (
            <MapPin color={colors.textMuted} size={22} weight="regular" />
          )}
          <View style={styles.portfolioStatusCopy}>
            <Text
              style={[
                styles.valueEyebrow,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText,
                rtl && styles.noLetterSpacing
              ]}
            >
              {copy.portfolioStatus}
            </Text>
            <Text
              style={[
                styles.portfolioStatusTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {classificationLabel}
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.portfolioStatusBody,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {ownedProperty
            ? copy.includedInPortfolio
            : copy.excludedFromPortfolio}
        </Text>
        {canWritePlaces && !ownedProperty ? (
          <SecondaryButton
            label={copy.reviewRelationship}
            onPress={() =>
              router.push(
                `/place-edit?placeId=${encodeURIComponent(place.id)}`
              )
            }
          />
        ) : null}
      </View>

      {ownedProperty ? (
        <View
          accessibilityLabel={
            currentValue && formattedCurrentValue
              ? `${copy.recordedPropertyValue}, ${formattedCurrentValue.accessibilityLabel}, ${copy.valueAsOf(
                  formatLocalizedDate(currentValue.asOf, language)
                )}`
              : `${copy.recordedPropertyValue}, ${copy.noPropertyValue}`
          }
          style={styles.valuePanel}
          testID="place-recorded-value"
        >
          <View style={[styles.valueHeading, rtl && styles.rowReverse]}>
            <CurrencyCircleDollar
              color={colors.text}
              size={22}
              weight="regular"
            />
            <Text
              style={[
                styles.valueEyebrow,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText,
                rtl && styles.noLetterSpacing
              ]}
            >
              {copy.recordedPropertyValue}
            </Text>
          </View>
          <Text
            style={[
              styles.valueAmount,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {currentValue && formattedCurrentValue
              ? formattedCurrentValue.text
              : copy.noPropertyValue}
          </Text>
          {currentValue ? (
            <Text
              style={[
                styles.valueMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.valueAsOf(
                formatLocalizedDate(currentValue.asOf, language)
              )}
            </Text>
          ) : null}
          <Text
            style={[
              styles.valueTruth,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.propertyValueTruth}
          </Text>
          <Text
            style={[
              styles.valueStorage,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.propertyValueOnDevice}
          </Text>
          {canWritePlaces ? (
            <SecondaryButton
              label={
                currentValue
                  ? copy.updatePropertyValue
                  : copy.addPropertyValue
              }
              onPress={() =>
                router.push(
                  `/asset-value?placeId=${encodeURIComponent(
                    place.id
                  )}&returnTo=place`
                )
              }
            />
          ) : null}
        </View>
      ) : null}

      <CommandSurface>
        <View style={[styles.locationHeading, rtl && styles.rowReverse]}>
          <Crosshair color={colors.volt} size={24} weight="regular" />
          <View style={styles.locationHeadingCopy}>
            <Text
              style={[
                styles.mapCaptionLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText,
                rtl && styles.noLetterSpacing
              ]}
            >
              {ownedProperty
                ? copy.propertyLocation
                : copy.placeLocation}
            </Text>
            <Text
              style={[
                styles.mapCaptionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {pinLabel}
            </Text>
          </View>
        </View>
        {coordinateLabel ? (
          <Text
            accessibilityLabel={coordinateLabel}
            selectable
            style={[styles.coordinates, rtl && styles.coordinatesRtl]}
          >
            {coordinateLabel}
          </Text>
        ) : null}
        <Text
          style={[
            styles.pinTruth,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {pinTruth}
        </Text>
        {hasPin ? (
          <>
            {canWriteAssets ? (
              <PrimaryButton
                icon={Plus}
                label={copy.addItemHere}
                onPress={() => router.push(`/capture?placeId=${place.id}`)}
              />
            ) : null}
            {canWritePlaces ? (
              <SecondaryButton
                icon={Crosshair}
                label={copy.reviewPin}
                onPress={() =>
                  router.push(
                    `/place-pin?placeId=${encodeURIComponent(place.id)}`
                  )
                }
              />
            ) : null}
          </>
        ) : (
          <>
            {canWritePlaces ? (
              <PrimaryButton
                icon={Crosshair}
                label={copy.setPin}
                onPress={() =>
                  router.push(
                    `/place-pin?placeId=${encodeURIComponent(place.id)}`
                  )
                }
              />
            ) : null}
            {canWriteAssets ? (
              <SecondaryButton
                icon={Plus}
                label={copy.addItemWithoutPin}
                onPress={() => router.push(`/capture?placeId=${place.id}`)}
              />
            ) : null}
          </>
        )}
      </CommandSurface>

      <Section>
        <SectionHeader
          action={
            canWritePlaces ? (
              <Pressable
                accessibilityLabel={copy.addSpace}
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    `/space-edit?placeId=${encodeURIComponent(place.id)}`
                  )
                }
                style={({ pressed }) => [
                  styles.sectionAction,
                  rtl && styles.rowReverse,
                  pressed && styles.pressed
                ]}
              >
                <Plus color={colors.text} size={17} />
                <Text
                  style={[
                    styles.sectionActionLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.addSpace}
                </Text>
              </Pressable>
            ) : undefined
          }
          title={placeSectionTitle(
            copy.spaces,
            place.rooms.length,
            language
          )}
        />
        {place.rooms.length > 0 ? (
          place.rooms.map((room) => {
            const count = assets.filter(
              (asset) => asset.roomId === room.id
            ).length;
            const parent = room.parentRoomId
              ? place.rooms.find(
                  (candidate) => candidate.id === room.parentRoomId
                )
              : null;
            const countLabel = itemCount(count, language);
            const kindLabel = copy.roomKind[room.kind];
            return (
              <Pressable
                accessibilityHint={copy.editSpaceHint}
                accessibilityLabel={copy.roomAccessibilityLabel(
                  room.name,
                  kindLabel,
                  countLabel
                )}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canWritePlaces }}
                disabled={!canWritePlaces}
                key={room.id}
                onPress={() =>
                  router.push(
                    `/space-edit?placeId=${encodeURIComponent(place.id)}&roomId=${encodeURIComponent(room.id)}`
                  )
                }
                style={({ pressed }) => [
                  styles.roomRow,
                  rtl && styles.rowReverse,
                  pressed && styles.pressed
                ]}
              >
                <View style={styles.spaceIcon}>
                  <MapPin color={colors.text} size={20} weight="regular" />
                </View>
                <View style={styles.roomCopy}>
                  <Text
                    style={[
                      styles.roomName,
                      rtl && styles.textRight,
                      styles.mixedScript
                    ]}
                  >
                    {room.name}
                  </Text>
                  <Text
                    style={[
                      styles.roomMeta,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {kindLabel}
                    {" · "}
                    {parent ? copy.inside(parent.name) : copy.topLevel}
                    {" · "}
                    {countLabel}
                  </Text>
                </View>
                <CaretRight
                  color={colors.textMuted}
                  mirrored={rtl}
                  size={19}
                />
              </Pressable>
            );
          })
        ) : (
          <View style={[styles.empty, rtl && styles.alignEnd]}>
            <MapPin color={colors.text} size={30} weight="regular" />
            <Text
              style={[
                styles.emptyTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.noSpacesTitle}
            </Text>
            <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
              {copy.noSpacesBody}
            </BodyText>
            {canWritePlaces ? (
              <SecondaryButton
                icon={Plus}
                label={copy.addFirstSpace}
                onPress={() =>
                  router.push(
                    `/space-edit?placeId=${encodeURIComponent(place.id)}`
                  )
                }
              />
            ) : null}
          </View>
        )}
      </Section>

      <Section>
        <SectionHeader
          action={
            canWritePlaces && canWriteEvidence ? (
              <Pressable
                accessibilityLabel={copy.attachAccessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ busy: saving, disabled: saving }}
                disabled={saving}
                onPress={() => void attachDocument()}
                style={({ pressed }) => [
                  styles.sectionAction,
                  rtl && styles.rowReverse,
                  pressed && styles.pressed,
                  saving && styles.disabled
                ]}
              >
                <FilePlus color={colors.text} size={17} />
                <Text
                  style={[
                    styles.sectionActionLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.attach}
                </Text>
              </Pressable>
            ) : undefined
          }
          title={placeSectionTitle(
            copy.documents,
            documents.length,
            language
          )}
        />
        <View
          style={[
            styles.documentTruth,
            rtl && styles.documentTruthRtl
          ]}
        >
          <Text
            style={[
              styles.documentTruthTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {repository.encryptedAtRest
              ? copy.protectedDocuments
              : copy.previewDocuments}
          </Text>
          <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
            {copy.documentTruth}
          </BodyText>
        </View>
        {documents.length > 0 ? (
          documents.map((document) => (
            <PlaceDocumentRow
              document={document}
              key={document.id}
              store={attachmentStore}
            />
          ))
        ) : (
          <View
            style={[
              styles.emptyDocument,
              rtl && styles.rowReverse
            ]}
          >
            <FilePlus color={colors.text} size={26} />
            <View style={styles.emptyDocumentCopy}>
              <Text
                style={[
                  styles.emptyTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.noDocumentsTitle}
              </Text>
              <BodyText
                muted
                style={rtl ? styles.rtlText : styles.ltrText}
              >
                {copy.noDocumentsBody}
              </BodyText>
            </View>
          </View>
        )}
      </Section>

      <Section>
        <SectionHeader
          title={placeSectionTitle(copy.items, assets.length, language)}
        />
        {assets.length > 0 ? (
          assets.map((asset) => (
            <AssetListItem
              asset={asset}
              evidence={workspace.evidence}
              key={asset.id}
              onPress={() =>
                router.push(
                  `/asset/${asset.id}?retrievalSource=place-view`
                )
              }
              places={workspace.places}
            />
          ))
        ) : canWriteAssets ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/capture?placeId=${place.id}`)}
            style={({ pressed }) => [
              styles.addRow,
              rtl && styles.rowReverse,
              pressed && styles.pressed
            ]}
          >
            <Plus color={colors.text} size={21} />
            <View style={styles.addRowCopy}>
              <Text
                style={[
                  styles.addRowTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.addFirstItem}
              </Text>
              <Text
                style={[
                  styles.addRowMeta,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.placeAlreadySelected}
              </Text>
            </View>
            <ArrowRight
              color={colors.textMuted}
              mirrored={rtl}
              size={20}
            />
          </Pressable>
        ) : (
          <BodyText muted style={rtl ? styles.rtlText : styles.ltrText}>
            {copy.noItems}
          </BodyText>
        )}
      </Section>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  savedReceipt: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  savedReceiptHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  savedReceiptCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  savedReceiptTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  savedReceiptMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  heading: {
    alignItems: "flex-start",
    gap: spacing.xs
  },
  region: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  recordMeta: {
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  recordMetaText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ["tabular-nums"]
  },
  textAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs
  },
  textActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  portfolioStatus: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong
  },
  portfolioStatusHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  portfolioStatusCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  portfolioStatusTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  portfolioStatusBody: {
    maxWidth: 560,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  valuePanel: {
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  valueHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  valueEyebrow: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  valueAmount: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 27,
    lineHeight: 34,
    fontVariant: ["tabular-nums"]
  },
  valueMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  valueTruth: {
    maxWidth: 560,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs
  },
  valueStorage: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.sm
  },
  locationHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  locationHeadingCopy: {
    flex: 1,
    gap: 2
  },
  mapCaptionLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1
  },
  noLetterSpacing: {
    letterSpacing: 0
  },
  mapCaptionTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  coordinates: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    fontVariant: ["tabular-nums"],
    writingDirection: "ltr",
    textAlign: "left"
  },
  coordinatesRtl: {
    textAlign: "right"
  },
  pinTruth: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  sectionAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs
  },
  sectionActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  roomRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  spaceIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.mist
  },
  roomCopy: {
    flex: 1,
    gap: 2
  },
  roomName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  roomMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  empty: {
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  documentTruth: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet
  },
  documentTruthRtl: {
    borderLeftWidth: 0,
    borderRightWidth: 2,
    borderRightColor: colors.borderStrong
  },
  documentTruthTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  emptyDocument: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  emptyDocumentCopy: {
    flex: 1,
    gap: spacing.xs
  },
  addRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  addRowCopy: {
    flex: 1,
    gap: 2
  },
  addRowTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  addRowMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  notFound: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  pressed: {
    opacity: 0.65
  },
  disabled: {
    opacity: 0.42
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  alignEnd: {
    alignItems: "flex-end"
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
    textAlign: "left",
    writingDirection: "ltr"
  },
  textRight: {
    textAlign: "right"
  },
  textLeft: {
    textAlign: "left"
  },
  mixedScript: {
    writingDirection: "auto"
  },
  mixedTextRtl: {
    textAlign: "right",
    writingDirection: "auto"
  },
  mixedTextLtr: {
    textAlign: "left",
    writingDirection: "auto"
  }
});
