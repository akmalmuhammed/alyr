import type { LocationStatus } from "@alyr/contracts";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  File,
  FolderOpen,
  MapPin,
  Warning
} from "phosphor-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  chooseAssetPhoto,
  chooseEvidenceDocument,
  takeAssetPhoto
} from "@/adapters/capture";
import { AssetPhotoPreview } from "@/components/AssetPhotoPreview";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  ErrorBanner,
  Field,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton
} from "@/components/ui";
import {
  categoryLocationTransition,
  type CategoryLocationTransition
} from "@/domain/assetCategoryLocation";
import {
  CATEGORY_CHOICES,
  findCategoryChoice,
  type CapturedFile,
  type LanguageCode,
  type NativeAsset,
  type NativePlace
} from "@/domain/model";
import {
  deriveNativeAssetLocationTruth,
  hasConfirmedPreciseNativePlacePin
} from "@/domain/readiness";
import {
  getAssetEditCopy,
  type AssetEditCopy
} from "@/i18n/assetEditCopy";
import {
  getCaptureCopy,
  localizedCategoryLabel
} from "@/i18n/captureCopy";
import { useLocale } from "@/i18n/LocaleProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
type EditFocus = "photo" | "evidence" | "location" | "identity";

function parseFocus(value: string | undefined): EditFocus {
  return value === "photo" ||
    value === "evidence" ||
    value === "location" ||
    value === "identity"
    ? value
    : "identity";
}

function fileSize(
  bytes: number,
  language: LanguageCode,
  sizeUnavailable: string
): string {
  if (bytes <= 0) return sizeUnavailable;
  const locale = language === "ar" ? "ar-QA" : "en-QA";
  const value =
    bytes < 1024 * 1024
      ? Math.ceil(bytes / 1024)
      : bytes / (1024 * 1024);
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: bytes < 1024 * 1024 ? 0 : 1
  }).format(value);
  const unit =
    language === "ar"
      ? bytes < 1024 * 1024
        ? "ك.ب."
        : "م.ب."
      : bytes < 1024 * 1024
        ? "KB"
        : "MB";
  return `${formatted} ${unit}`;
}

export default function AssetEditRoute() {
  const { assetId, focus: rawFocus, returnTo } = useLocalSearchParams<{
    assetId?: string;
    focus?: string;
    returnTo?: string;
  }>();
  const { language, rtl } = useLocale();
  const copy = getAssetEditCopy(language);
  const { can, workspace } = useWorkspace();
  const asset = workspace?.assets.find((item) => item.id === assetId);

  if (!can("asset.write")) {
    return <PermissionDeniedScreen capability="asset.write" />;
  }

  if (!workspace || !asset) {
    return (
      <AppScreen safeEdges={[]} testID="asset-edit-not-found">
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <ScreenTitle size="medium">{copy.passportNotFound}</ScreenTitle>
          <BodyText muted>
            {copy.passportNotFoundBody}
          </BodyText>
        </View>
      </AppScreen>
    );
  }

  return (
    <AssetEditForm
      asset={asset}
      focus={parseFocus(rawFocus)}
      returnToPassport={returnTo === "passport"}
    />
  );
}

function AssetEditForm({
  asset,
  focus,
  returnToPassport
}: {
  readonly asset: NativeAsset;
  readonly focus: EditFocus;
  readonly returnToPassport: boolean;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const { language, rtl } = useLocale();
  const copy = getAssetEditCopy(language);
  const captureCopy = getCaptureCopy(language);
  const allowRemovalRef = useRef(false);
  const submittingRef = useRef(false);
  const addPlaceBaselineRef = useRef<Set<string> | null>(null);
  const {
    workspace,
    updateAsset,
    saving,
    error,
    clearError
  } = useWorkspace();
  const [name, setName] = useState(asset.name);
  const [categoryId, setCategoryId] = useState(asset.categoryId);
  const [photo, setPhoto] = useState<CapturedFile | null>(null);
  const [evidence, setEvidence] = useState<CapturedFile | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(
    asset.locationStatus
  );
  const [placeId, setPlaceId] = useState<string | null>(asset.placeId);
  const [roomId, setRoomId] = useState<string | null>(asset.roomId);
  const [locatorText, setLocatorText] = useState(asset.locatorText ?? "");
  const [screenActive, setScreenActive] = useState(false);

  const selectedCategory = useMemo(
    () => findCategoryChoice(categoryId),
    [categoryId]
  );
  const selectedPlace = workspace?.places.find((place) => place.id === placeId);
  const physical = selectedCategory?.supportsPhysicalLocation !== false;
  const truthfulLocationStatus = deriveNativeAssetLocationTruth({
    categoryId,
    requestedStatus: locationStatus,
    place: selectedPlace,
    roomId,
    locatorText
  }).status;
  const locationTransition = selectedCategory
    ? categoryLocationTransition(asset.categoryId, selectedCategory.id)
    : null;
  const identityChanged =
    name.trim() !== asset.name ||
    categoryId !== asset.categoryId;
  const locationChanged =
    truthfulLocationStatus !== asset.locationStatus ||
    placeId !== asset.placeId ||
    roomId !== asset.roomId ||
    (locatorText.trim() || null) !== asset.locatorText;
  const locationValid =
    truthfulLocationStatus === "unknown" ||
    (truthfulLocationStatus === "needs-detail" && Boolean(placeId)) ||
    (truthfulLocationStatus === "known" &&
      Boolean(placeId) &&
      Boolean(roomId || locatorText.trim()));
  const hasDraft =
    focus === "photo"
      ? photo !== null
      : focus === "evidence"
        ? evidence !== null
        : focus === "location"
          ? locationChanged
          : identityChanged;
  const canSave =
    focus === "photo"
      ? photo !== null
      : focus === "evidence"
        ? evidence !== null
        : focus === "location"
          ? locationChanged && locationValid
          : identityChanged && Boolean(name.trim() && selectedCategory);

  useFocusEffect(
    useCallback(() => {
      setScreenActive(true);
      return () => setScreenActive(false);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const baseline = addPlaceBaselineRef.current;
      if (!baseline || !workspace) return;
      const created = workspace.places.find(
        (place) => !baseline.has(place.id)
      );
      if (!created) return;
      addPlaceBaselineRef.current = null;
      setPlaceId(created.id);
      setRoomId(created.rooms[0]?.id ?? null);
      setLocationStatus(
        created.rooms.length > 0 ? "known" : "needs-detail"
      );
    }, [workspace])
  );

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!hasDraft || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(
          copy.discardTitle,
          copy.discardBody,
          [
            { text: copy.keepEditing, style: "cancel" },
            {
              text: copy.discardChanges,
              style: "destructive",
              onPress: () => {
                allowRemovalRef.current = true;
                navigation.dispatch(event.data.action);
              }
            }
          ]
        );
      }),
    [copy, hasDraft, navigation]
  );

  const acceptFile = (
    file: CapturedFile,
    setter: (next: CapturedFile) => void
  ) => {
    if (file.byteSize > MAX_FILE_BYTES) {
      Alert.alert(
        captureCopy.fileTooLarge,
        captureCopy.fileTooLargeRecovery
      );
      return;
    }
    setter(file);
  };

  const permissionRecovery = (title: string, message: string) => {
    Alert.alert(title, message, [
      { text: captureCopy.notNow, style: "cancel" },
      {
        text: captureCopy.openSettings,
        onPress: () => void Linking.openSettings()
      }
    ]);
  };

  const takePhoto = async () => {
    const outcome = await takeAssetPhoto();
    if (outcome.ok) {
      acceptFile(outcome.file, setPhoto);
    } else if (outcome.reason === "permission") {
      permissionRecovery(
        captureCopy.cameraPermission,
        captureCopy.cameraPermissionRecovery
      );
    } else if (outcome.reason === "failed") {
      Alert.alert(
        captureCopy.cameraFailed,
        captureCopy.cameraFailedRecovery
      );
    }
  };

  const choosePhoto = async () => {
    const outcome = await chooseAssetPhoto();
    if (outcome.ok) {
      acceptFile(outcome.file, setPhoto);
    } else if (outcome.reason === "permission") {
      permissionRecovery(
        captureCopy.photoPermission,
        captureCopy.photoPermissionRecovery
      );
    } else if (outcome.reason === "failed") {
      Alert.alert(
        captureCopy.photoFailed,
        captureCopy.photoFailedRecovery
      );
    }
  };

  const chooseEvidence = async () => {
    const outcome = await chooseEvidenceDocument();
    if (outcome.ok) {
      acceptFile(outcome.file, setEvidence);
    } else if (outcome.reason === "failed") {
      Alert.alert(
        captureCopy.documentFailed,
        captureCopy.documentFailedRecovery
      );
    }
  };

  const persist = async () => {
    if (
      !canSave ||
      submittingRef.current ||
      (focus === "identity" && !selectedCategory)
    ) {
      return;
    }
    submittingRef.current = true;
    try {
      await updateAsset({
        assetId: asset.id,
        ...(focus === "photo" && photo ? { photo } : {}),
        ...(focus === "evidence" && evidence ? { evidence } : {}),
        ...(focus === "identity"
          ? {
              identity: {
                name: name.trim(),
                categoryId: selectedCategory!.id,
                categoryLabel: selectedCategory!.label
              }
            }
          : {}),
        ...(focus === "location"
          ? {
              location: {
                locationStatus: truthfulLocationStatus,
                placeId:
                  truthfulLocationStatus === "unknown" ? null : placeId,
                roomId:
                  truthfulLocationStatus === "unknown" ? null : roomId,
                locatorText:
                  truthfulLocationStatus === "unknown"
                    ? null
                    : locatorText.trim() || null
              }
            }
          : {})
      });
      allowRemovalRef.current = true;
      if (returnToPassport) {
        router.back();
      } else {
        router.replace(`/asset/${asset.id}`);
      }
    } catch {
      submittingRef.current = false;
      // WorkspaceProvider keeps the focused edit visible and reports the error.
    }
  };

  const save = () => {
    if (focus === "identity" && locationTransition) {
      const notice = categoryTransitionNotice(locationTransition, language);
      Alert.alert(notice.title, notice.message, [
        { text: copy.keepEditing, style: "cancel" },
        {
          text: copy.changeCategory,
          onPress: () => void persist()
        }
      ]);
      return;
    }
    void persist();
  };

  const addPlace = () => {
    addPlaceBaselineRef.current = new Set(
      workspace?.places.map((place) => place.id) ?? []
    );
    router.push("/capture?intent=place&returnTo=asset-edit");
  };

  return (
    <AppScreen
      footer={
        <PrimaryButton
          accessibilityHint={
            copy.saveHint[focus][canSave ? "ready" : "blocked"]
          }
          disabled={!canSave}
          icon={Check}
          label={copy.saveLabel[focus]}
          loading={saving}
          onPress={save}
        />
      }
      safeEdges={[]}
      testID={`asset-edit-${focus}`}
    >
      {error ? (
        <ErrorBanner
          message={language === "ar" ? copy.saveFailed : error}
          onDismiss={clearError}
        />
      ) : null}
      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.kicker,
            rtl && styles.arabicMedium,
            rtl && styles.textRight,
            rtl && styles.kickerRtl
          ]}
        >
          {copy.updatePassport}
        </Text>
        <ScreenTitle size="medium">{copy.heading[focus]}</ScreenTitle>
        <BodyText muted>{copy.guidance[focus](asset.name)}</BodyText>
      </View>

      {focus === "photo" ? (
        <PhotoEditor
          active={screenActive}
          asset={asset}
          evidence={workspace?.evidence ?? []}
          onChoose={() => void choosePhoto()}
          onTake={() => void takePhoto()}
          photo={photo}
        />
      ) : null}

      {focus === "evidence" ? (
        <EvidenceEditor
          evidence={evidence}
          onChoose={() => void chooseEvidence()}
        />
      ) : null}

      {focus === "identity" ? (
        <IdentityEditor
          categoryId={categoryId}
          locationTransition={locationTransition}
          name={name}
          onCategoryChange={setCategoryId}
          onNameChange={setName}
        />
      ) : null}

      {focus === "location" ? (
        physical ? (
          <LocationEditor
            locatorText={locatorText}
            locationStatus={locationStatus}
            onAddPlace={addPlace}
            onLocatorChange={setLocatorText}
            onPlaceChange={(nextPlaceId) => {
              setPlaceId(nextPlaceId);
              setRoomId(null);
            }}
            onReviewPlacePin={(selectedPlaceId) =>
              router.push(
                `/place-pin?placeId=${encodeURIComponent(
                  selectedPlaceId
                )}`
              )
            }
            onRoomChange={setRoomId}
            onStatusChange={(status) => {
              setLocationStatus(status);
              if (status === "unknown") {
                setPlaceId(null);
                setRoomId(null);
                setLocatorText("");
              }
            }}
            placeId={placeId}
            roomId={roomId}
            selectedPlace={selectedPlace}
          />
        ) : (
          <View style={[styles.notice, rtl && styles.rowReverse]}>
            <Check color={colors.text} size={22} />
            <BodyText>
              {copy.digitalLocationNotNeeded}
            </BodyText>
          </View>
        )
      ) : null}
    </AppScreen>
  );
}

export function categoryTransitionNotice(
  transition: CategoryLocationTransition,
  language: LanguageCode = "en"
): AssetEditCopy["transition"][CategoryLocationTransition] {
  return getAssetEditCopy(language).transition[transition];
}

function PhotoEditor({
  active,
  asset,
  evidence,
  photo,
  onTake,
  onChoose
}: {
  readonly active: boolean;
  readonly asset: NativeAsset;
  readonly evidence: readonly import("@/domain/model").NativeEvidence[];
  readonly photo: CapturedFile | null;
  readonly onTake: () => void;
  readonly onChoose: () => void;
}) {
  const { language, rtl } = useLocale();
  const copy = getAssetEditCopy(language);
  const captureCopy = getCaptureCopy(language);
  const selectedSize = photo
    ? fileSize(photo.byteSize, language, captureCopy.sizeUnavailable)
    : null;

  return (
    <View style={styles.editor}>
      <AssetPhotoPreview
        active={active}
        asset={asset}
        draft={photo}
        evidence={evidence}
        variant="editor"
      />
      {photo ? (
        <View
          accessibilityLabel={copy.photoSelected(
            photo.fileName,
            selectedSize ?? captureCopy.sizeUnavailable
          )}
          style={[styles.fileSummary, rtl && styles.rowReverse]}
        >
          <Check color={colors.text} size={20} />
          <View style={styles.fileCopy}>
            <Text
              numberOfLines={2}
              style={[styles.fileName, styles.fileNameIsolate]}
            >
              {photo.fileName}
            </Text>
            <Text
              style={[
                styles.fileMeta,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {selectedSize}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.actionRow, rtl && styles.rowReverse]}>
        <View style={styles.action}>
          <PrimaryButton
            icon={Camera}
            label={captureCopy.takePhoto}
            onPress={onTake}
          />
        </View>
        <View style={styles.action}>
          <SecondaryButton
            icon={FolderOpen}
            label={captureCopy.choosePhoto}
            onPress={onChoose}
          />
        </View>
      </View>
    </View>
  );
}

function EvidenceEditor({
  evidence,
  onChoose
}: {
  readonly evidence: CapturedFile | null;
  readonly onChoose: () => void;
}) {
  const { language, rtl } = useLocale();
  const copy = getAssetEditCopy(language);
  const captureCopy = getCaptureCopy(language);
  const selectedSize = evidence
    ? fileSize(evidence.byteSize, language, captureCopy.sizeUnavailable)
    : null;

  return (
    <View style={styles.editor}>
      {evidence ? (
        <View
          accessibilityLabel={copy.proofSelected(
            evidence.fileName,
            selectedSize ?? captureCopy.sizeUnavailable
          )}
          style={[styles.selectedFile, rtl && styles.rowReverse]}
        >
          <File color={colors.text} size={28} />
          <View style={styles.fileCopy}>
            <Text
              numberOfLines={3}
              style={[styles.fileName, styles.fileNameIsolate]}
            >
              {evidence.fileName}
            </Text>
            <Text
              style={[
                styles.fileMeta,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {selectedSize} · {copy.readyToProtect}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.emptyMedia, rtl && styles.alignEnd]}>
          <File color={colors.text} size={34} />
          <Text
            style={[
              styles.emptyTitle,
              rtl && styles.arabicMedium,
              rtl && styles.textRight
            ]}
          >
            {copy.noFileSelected}
          </Text>
          <BodyText muted>
            {copy.privateFileLimit}
          </BodyText>
        </View>
      )}
      <SecondaryButton
        icon={FolderOpen}
        label={evidence ? copy.chooseAnotherFile : copy.chooseFile}
        onPress={onChoose}
      />
    </View>
  );
}

function IdentityEditor({
  name,
  categoryId,
  locationTransition,
  onNameChange,
  onCategoryChange
}: {
  readonly name: string;
  readonly categoryId: string;
  readonly locationTransition: CategoryLocationTransition | null;
  readonly onNameChange: (value: string) => void;
  readonly onCategoryChange: (value: string) => void;
}) {
  const { language, rtl } = useLocale();
  const copy = getAssetEditCopy(language);
  const captureCopy = getCaptureCopy(language);

  return (
    <View style={styles.editor}>
      <Field
        accessibilityHint={copy.itemNamePlaceholder}
        autoCapitalize="words"
        error={name.trim() ? null : captureCopy.nameError}
        label={copy.itemName}
        onChangeText={onNameChange}
        placeholder={copy.itemNamePlaceholder}
        value={name}
      />
      <View
        accessibilityLabel={captureCopy.categoryChoices}
        accessibilityRole="radiogroup"
        style={styles.fieldGroup}
      >
        <Text
          style={[
            styles.fieldLabel,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {captureCopy.category}
        </Text>
        {CATEGORY_CHOICES.map((category) => {
          const active = category.id === categoryId;
          const label = localizedCategoryLabel(
            category.id,
            category.label,
            language
          );
          return (
            <Pressable
              accessibilityHint={copy.categoryChoiceHint}
              accessibilityLabel={label}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              key={category.id}
              onPress={() => onCategoryChange(category.id)}
              style={({ pressed }) => [
                styles.choiceRow,
                rtl && styles.rowReverse,
                active && styles.choiceRowActive,
                pressed && styles.pressed
              ]}
            >
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
              <Text
                style={[
                  styles.choiceTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.textRight
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {locationTransition ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.categoryTransitionNotice,
            rtl && styles.rowReverse
          ]}
        >
          <MapPin color={colors.warning} size={22} weight="regular" />
          <View
            style={[
              styles.categoryTransitionCopy,
              rtl && styles.alignEnd
            ]}
          >
            <Text
              style={[
                styles.categoryTransitionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {categoryTransitionNotice(locationTransition, language).title}
            </Text>
            <Text
              style={[
                styles.categoryTransitionMessage,
                rtl && styles.arabic,
                rtl && styles.textRight
              ]}
            >
              {categoryTransitionNotice(locationTransition, language).message}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function LocationEditor({
  locationStatus,
  placeId,
  roomId,
  locatorText,
  selectedPlace,
  onAddPlace,
  onStatusChange,
  onPlaceChange,
  onReviewPlacePin,
  onRoomChange,
  onLocatorChange
}: {
  readonly locationStatus: LocationStatus;
  readonly placeId: string | null;
  readonly roomId: string | null;
  readonly locatorText: string;
  readonly selectedPlace: NativePlace | undefined;
  readonly onAddPlace: () => void;
  readonly onStatusChange: (status: LocationStatus) => void;
  readonly onPlaceChange: (placeId: string) => void;
  readonly onReviewPlacePin: (placeId: string) => void;
  readonly onRoomChange: (roomId: string | null) => void;
  readonly onLocatorChange: (value: string) => void;
}) {
  const { language, rtl } = useLocale();
  const copy = getAssetEditCopy(language);
  const captureCopy = getCaptureCopy(language);
  const { workspace } = useWorkspace();
  if (!workspace) return null;
  const placePinDebt =
    Boolean(selectedPlace) &&
    !hasConfirmedPreciseNativePlacePin(selectedPlace);
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const validationError =
    locationStatus === "known" &&
    (!placeId || !(roomId || locatorText.trim()))
      ? captureCopy.exactLocationError
      : locationStatus === "needs-detail" && !placeId
        ? captureCopy.placeError
        : null;

  return (
    <View style={styles.editor}>
      <View
        accessibilityLabel={captureCopy.locationQuestion}
        accessibilityRole="radiogroup"
        style={styles.fieldGroup}
      >
        <Text
          style={[
            styles.fieldLabel,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {captureCopy.locationQuestion}
        </Text>
        <ChoiceRow
          active={locationStatus === "known"}
          detail={captureCopy.exactSpotDescription}
          hint={copy.locationChoiceHint}
          label={captureCopy.exactSpot}
          onPress={() => onStatusChange("known")}
        />
        <ChoiceRow
          active={locationStatus === "needs-detail"}
          detail={captureCopy.placeOnlyDescription}
          hint={copy.locationChoiceHint}
          label={captureCopy.placeOnly}
          onPress={() => onStatusChange("needs-detail")}
        />
        <ChoiceRow
          active={locationStatus === "unknown"}
          detail={captureCopy.unknownDescription}
          hint={copy.locationChoiceHint}
          label={captureCopy.unknown}
          onPress={() => onStatusChange("unknown")}
        />
      </View>

      {locationStatus !== "unknown" ? (
        <>
          <View
            accessibilityLabel={copy.place}
            accessibilityRole="radiogroup"
            style={styles.fieldGroup}
          >
            <View style={[styles.labelRow, rtl && styles.rowReverse]}>
              <Text
                style={[
                  styles.fieldLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.textRight
                ]}
              >
                {copy.place}
              </Text>
              <Pressable
                accessibilityHint={copy.addPlaceHint}
                accessibilityLabel={captureCopy.addPlace}
                accessibilityRole="button"
                onPress={onAddPlace}
                style={styles.inlineLink}
              >
                <Text
                  style={[
                    styles.inlineLinkText,
                    rtl && styles.arabicMedium,
                    rtl && styles.textRight
                  ]}
                >
                  {captureCopy.addPlace}
                </Text>
              </Pressable>
            </View>
            {workspace.places.length > 0 ? (
              workspace.places.map((place) => (
                <ChoiceRow
                  active={place.id === placeId}
                  detail={place.regionLabel}
                  hint={copy.placeChoiceHint}
                  key={place.id}
                  label={place.name}
                  onPress={() => onPlaceChange(place.id)}
                />
              ))
            ) : (
              <View style={[styles.notice, rtl && styles.rowReverse]}>
                <MapPin color={colors.text} size={22} />
                <BodyText muted>
                  {captureCopy.addPlaceEmpty}
                </BodyText>
              </View>
            )}
          </View>

          {selectedPlace ? (
            <>
              {selectedPlace.rooms.length > 0 ? (
                <View
                  accessibilityLabel={copy.roomOrSpace}
                  accessibilityRole="radiogroup"
                  style={styles.fieldGroup}
                >
                  <Text
                    style={[
                      styles.fieldLabel,
                      rtl && styles.arabicMedium,
                      rtl && styles.textRight
                    ]}
                  >
                    {copy.roomOrSpace}
                  </Text>
                  {selectedPlace.rooms.map((room) => (
                    <ChoiceRow
                      active={room.id === roomId}
                      hint={copy.roomChoiceHint}
                      key={room.id}
                      label={room.name}
                      onPress={() => onRoomChange(room.id)}
                    />
                  ))}
                </View>
              ) : null}
              <Field
                accessibilityHint={captureCopy.locatorDescription}
                label={copy.retrievalClue}
                multiline
                onChangeText={onLocatorChange}
                placeholder={copy.retrievalCluePlaceholder}
                value={locatorText}
              />
              {placePinDebt ? (
                <View
                  style={styles.placePinDebt}
                  testID="asset-edit-place-pin-debt"
                >
                  <View
                    accessibilityLiveRegion="polite"
                    accessibilityRole="alert"
                    style={styles.placePinDebtMessage}
                    testID="asset-edit-place-pin-alert"
                  >
                    <View
                      style={[
                        styles.placePinDebtHeading,
                        rtl && styles.rowReverse
                      ]}
                    >
                      <Warning
                        color={colors.warning}
                        size={21}
                        weight="regular"
                      />
                      <Text
                        style={[
                          styles.placePinDebtTitle,
                          rtl && styles.arabicMedium,
                          rtl && styles.textRight
                        ]}
                      >
                        {copy.placePinDebtTitle}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.placePinDebtBody,
                        rtl && styles.arabic,
                        rtl && styles.textRight
                      ]}
                    >
                      {copy.placePinDebtBody}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityHint={copy.reviewPlacePinHint}
                    accessibilityLabel={copy.reviewPlacePin}
                    accessibilityRole="button"
                    onPress={() => onReviewPlacePin(selectedPlace.id)}
                    style={({ pressed }) => [
                      styles.placePinDebtAction,
                      rtl && styles.rowReverse,
                      pressed && styles.pressed
                    ]}
                    testID="asset-edit-place-pin-action"
                  >
                    <Text
                      style={[
                        styles.placePinDebtActionText,
                        rtl && styles.arabicMedium,
                        rtl && styles.textRight
                      ]}
                    >
                      {copy.reviewPlacePin}
                    </Text>
                    <ForwardIcon color={colors.text} size={18} />
                  </Pressable>
                </View>
              ) : null}
              <View style={[styles.truthNote, rtl && styles.rowReverse]}>
                <MapPin color={colors.textMuted} size={18} />
                <Text
                  style={[
                    styles.truthText,
                    rtl && styles.arabic,
                    rtl && styles.textRight
                  ]}
                >
                  {copy.retrievalTruth(selectedPlace.name)}
                </Text>
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {validationError ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.validationText,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {validationError}
        </Text>
      ) : null}
    </View>
  );
}

function ChoiceRow({
  active,
  label,
  detail,
  hint,
  onPress
}: {
  readonly active: boolean;
  readonly label: string;
  readonly detail?: string;
  readonly hint?: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useLocale();
  return (
    <Pressable
      accessibilityHint={hint ?? detail}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceRow,
        rtl && styles.rowReverse,
        active && styles.choiceRowActive,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={[styles.choiceCopy, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.choiceTitle,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            style={[
              styles.choiceDetail,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1.1
  },
  kickerRtl: {
    letterSpacing: 0
  },
  editor: {
    gap: spacing.lg
  },
  categoryTransitionNotice: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  categoryTransitionCopy: {
    flex: 1,
    gap: 3
  },
  categoryTransitionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  categoryTransitionMessage: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  emptyMedia: {
    minHeight: 180,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  action: {
    flex: 1
  },
  fileSummary: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  selectedFile: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  fileCopy: {
    flex: 1,
    gap: 3
  },
  fileName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  fileNameIsolate: {
    writingDirection: "ltr",
    textAlign: "left"
  },
  fileMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  fieldGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  labelRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  inlineLink: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs
  },
  inlineLinkText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textDecorationLine: "underline"
  },
  choiceRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  choiceRowActive: {
    backgroundColor: colors.mist
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  radioActive: {
    borderColor: colors.carbon
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.round,
    backgroundColor: colors.carbon
  },
  choiceCopy: {
    flex: 1,
    gap: 2
  },
  choiceTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  choiceDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  notice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  truthNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs
  },
  truthText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  placePinDebt: {
    alignItems: "stretch",
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    backgroundColor: colors.warningQuiet
  },
  placePinDebtMessage: {
    gap: spacing.xs
  },
  placePinDebtHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  placePinDebtTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  placePinDebtBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  placePinDebtAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  placePinDebtActionText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: "underline"
  },
  validationText: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
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
  arabic: {
    fontFamily: typography.arabic,
    writingDirection: "rtl"
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    writingDirection: "rtl"
  },
  textRight: {
    textAlign: "right"
  },
  pressed: {
    opacity: 0.68
  }
});
