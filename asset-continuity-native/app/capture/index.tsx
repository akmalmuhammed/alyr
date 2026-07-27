import {
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CaretDown,
  CaretUp,
  Check,
  File,
  FolderOpen,
  ImageSquare,
  MagnifyingGlass,
  MapPin,
  Plus,
  ShieldCheck,
  Warning,
  X
} from "phosphor-react-native";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  chooseAssetPhoto,
  chooseEvidenceDocument,
  takeAssetPhoto
} from "@/adapters/capture";
import { readCurrentLocation } from "@/adapters/location";
import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import {
  PlacePinEditor,
  type PlacePinEditorValue
} from "@/components/PlacePinEditor";
import { PlaceClassificationSelector } from "@/components/PlaceClassificationSelector";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  ErrorBanner,
  Eyebrow,
  Field,
  IconButton,
  PrimaryButton,
  ProgressBar,
  ScreenTitle,
  SecondaryButton,
  StatusPill,
  Surface
} from "@/components/ui";
import {
  CATEGORY_CHOICES,
  type CapturedFile,
  type NativePlace,
  type NewPlaceInput,
  type PlaceClassification
} from "@/domain/model";
import {
  featuredItemCategories,
  filterItemCategories,
  groupItemCategories
} from "@/domain/assetCategoryCatalog";
import {
  getCaptureCopy,
  localizedCategoryLabel
} from "@/i18n/captureCopy";
import {
  clearPlaceCaptureDraft,
  clearQuickPassportDraft,
  readPlaceCaptureDraft,
  readQuickPassportDraft,
  writePlaceCaptureDraft,
  writeQuickPassportDraft,
  type DraftLocationChoice
} from "@/capture/quickPassportDraft";
import {
  formatLocalizedNumber,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
type LocationChoice = DraftLocationChoice;

export default function CaptureScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const { language, rtl } = useCoreJourneyCopy();
  const captureCopy = getCaptureCopy(language);
  const steps = captureCopy.steps;
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const stackFooter = width <= 340 || fontScale >= 1.35;
  const reduceMotion = useReduceMotionPreference();
  const scrollRef = useRef<ScrollView>(null);
  const stepAnnouncementRef = useRef<View>(null);
  const lastFocusedStepRef = useRef<number | null>(null);
  const nameInputRef = useRef<TextInput>(null);
  const categoryGroupRef = useRef<View>(null);
  const locationGroupRef = useRef<View>(null);
  const addPlaceTriggerRef = useRef<View>(null);
  const inlinePlaceNameRef = useRef<TextInput>(null);
  const allowRemovalRef = useRef(false);
  const {
    intent,
    placeId: requestedPlaceId,
    returnTo
  } = useLocalSearchParams<{
    intent?: string;
    placeId?: string;
    returnTo?: string;
  }>();
  const {
    workspace,
    saving,
    error,
    clearError,
    can,
    createPlace,
    createAsset
  } = useWorkspace();
  const [placeOnly] = useState(intent === "place");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedFile | null>(null);
  const [evidence, setEvidence] = useState<CapturedFile | null>(null);
  const [locationStatus, setLocationStatus] =
    useState<LocationChoice | null>(
      typeof requestedPlaceId === "string" ? "needs-detail" : null
    );
  const [placeId, setPlaceId] = useState<string | null>(
    typeof requestedPlaceId === "string" ? requestedPlaceId : null
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [locatorText, setLocatorText] = useState("");
  const [showPlaceForm, setShowPlaceForm] = useState(placeOnly);
  const [placeName, setPlaceName] = useState("");
  const [placeClassification, setPlaceClassification] =
    useState<PlaceClassification>("unknown");
  const [address, setAddress] = useState("");
  const [region, setRegion] = useState("");
  const [roomName, setRoomName] = useState("");
  const [pin, setPin] = useState<NewPlaceInput["pin"]>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const householdId = workspace?.household.id ?? null;

  const selectedCategory = useMemo(
    () =>
      CATEGORY_CHOICES.find((category) => category.id === categoryId) ?? null,
    [categoryId]
  );
  const selectedPlace = workspace?.places.find((place) => place.id === placeId);
  const selectedRoom = selectedPlace?.rooms.find((room) => room.id === roomId);
  const physical = selectedCategory?.supportsPhysicalLocation === true;
  const hasDraft =
    name.trim().length > 0 ||
    categoryId !== null ||
    photo !== null ||
    evidence !== null ||
    locationStatus !== null ||
    placeName.trim().length > 0 ||
    placeClassification !== "unknown" ||
    address.trim().length > 0 ||
    region.trim().length > 0 ||
    roomName.trim().length > 0 ||
    pin !== null;
  const hasPlaceDraft =
    placeName.trim().length > 0 ||
    placeClassification !== "unknown" ||
    address.trim().length > 0 ||
    region.trim().length > 0 ||
    roomName.trim().length > 0 ||
    pin !== null;

  useEffect(() => {
    if (!householdId) {
      setDraftReady(true);
      return;
    }
    let active = true;
    setDraftReady(false);
    if (placeOnly) {
      void readPlaceCaptureDraft(householdId).then((draft) => {
        if (!active) return;
        if (draft) {
          setPlaceName(draft.placeName);
          setPlaceClassification(
            draft.placeClassification ?? "unknown"
          );
          setAddress(draft.address);
          setRegion(draft.region);
          setRoomName(draft.roomName);
          setPin(draft.pin);
          setDraftRestored(true);
        }
        setDraftReady(true);
      });
    } else {
      void readQuickPassportDraft(householdId).then((draft) => {
        if (!active) return;
        if (draft) {
          setStep(draft.step);
          setName(draft.name);
          setCategoryId(draft.categoryId);
          setPhoto(draft.photo);
          setEvidence(draft.evidence);
          setLocationStatus(draft.locationStatus);
          setPlaceId(draft.placeId);
          setRoomId(draft.roomId);
          setLocatorText(draft.locatorText);
          setShowPlaceForm(draft.showPlaceForm);
          setPlaceName(draft.placeName);
          setPlaceClassification(
            draft.placeClassification ?? "unknown"
          );
          setAddress(draft.address);
          setRegion(draft.region);
          setRoomName(draft.roomName);
          setPin(draft.pin);
          setDraftRestored(true);
        }
        setDraftReady(true);
      });
    }
    return () => {
      active = false;
    };
  }, [householdId, placeOnly]);

  useEffect(() => {
    if (!draftReady || !householdId) return;
    const timer = setTimeout(() => {
      if (placeOnly) {
        if (!hasPlaceDraft) {
          void clearPlaceCaptureDraft();
          return;
        }
        void writePlaceCaptureDraft({
          householdId,
          placeName,
          placeClassification,
          address,
          region,
          roomName,
          pin
        });
        return;
      }
      if (!hasDraft) {
        void clearQuickPassportDraft();
        return;
      }
      void writeQuickPassportDraft({
        householdId,
        step,
        name,
        categoryId,
        photo,
        evidence,
        locationStatus,
        placeId,
        roomId,
        locatorText,
        showPlaceForm,
        placeName,
        placeClassification,
        address,
        region,
        roomName,
        pin
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [
    address,
    categoryId,
    draftReady,
    evidence,
    hasDraft,
    hasPlaceDraft,
    householdId,
    locationStatus,
    locatorText,
    name,
    photo,
    pin,
    placeId,
    placeClassification,
    placeName,
    placeOnly,
    region,
    roomId,
    roomName,
    showPlaceForm,
    step
  ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    if (placeOnly) return;
    if (lastFocusedStepRef.current === step) return;

    // Web announces the changed header through its live region. Native screen
    // readers receive one deliberate focus move instead, so a step is not read
    // twice by both focus and an explicit announcement.
    if (Platform.OS === "web") {
      lastFocusedStepRef.current = step;
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (lastFocusedStepRef.current === step) return;
      const handle = findNodeHandle(stepAnnouncementRef.current);
      if (handle) {
        lastFocusedStepRef.current = step;
        AccessibilityInfo.setAccessibilityFocus(handle);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [placeOnly, step]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!hasDraft || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(
          captureCopy.discardTitle,
          captureCopy.discardBody,
          [
            { text: captureCopy.keepEditing, style: "cancel" },
            {
              text: captureCopy.discardDraft,
              style: "destructive",
              onPress: () => {
                const clearActiveDraft = placeOnly
                  ? clearPlaceCaptureDraft
                  : clearQuickPassportDraft;
                void clearActiveDraft().then(() => {
                  allowRemovalRef.current = true;
                  navigation.dispatch(event.data.action);
                });
              }
            }
          ]
        );
      }),
    [captureCopy, hasDraft, navigation, placeOnly]
  );

  useEffect(() => {
    if (
      placeId &&
      workspace &&
      !workspace.places.some((place) => place.id === placeId)
    ) {
      setPlaceId(null);
      setLocationStatus(null);
    }
  }, [placeId, workspace]);

  if (!workspace) return null;

  if (!can(placeOnly ? "place.write" : "asset.write")) {
    return (
      <PermissionDeniedScreen
        capability={placeOnly ? "place.write" : "asset.write"}
      />
    );
  }

  if (!draftReady) {
    return (
      <View
        accessibilityLabel={
          language === "ar"
            ? "جارٍ استعادة المسودة المحمية"
            : "Restoring protected draft"
        }
        accessibilityLiveRegion="polite"
        style={styles.draftLoading}
      >
        <ActivityIndicator color={colors.action} size="small" />
      </View>
    );
  }

  const close = () => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  };

  const showPermissionRecovery = (title: string, message: string) => {
    Alert.alert(title, message, [
      { text: captureCopy.notNow, style: "cancel" },
      {
        text: captureCopy.openSettings,
        onPress: () => void Linking.openSettings()
      }
    ]);
  };

  const selectCategory = (nextId: string) => {
    const nextCategory = CATEGORY_CHOICES.find(
      (category) => category.id === nextId
    );
    const wasPhysical = selectedCategory?.supportsPhysicalLocation;
    setCategoryId(nextId);
    setCategoryError(null);
    if (!nextCategory?.supportsPhysicalLocation) {
      setLocationStatus(null);
      setLocationError(null);
      setPlaceId(null);
      setRoomId(null);
      setLocatorText("");
    } else if (wasPhysical !== true) {
      setLocationStatus(null);
    }
  };

  const acceptCapturedFile = (
    file: CapturedFile,
    setter: (value: CapturedFile) => void
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

  const takePhoto = async () => {
    const outcome = await takeAssetPhoto();
    if (outcome.ok) {
      acceptCapturedFile(outcome.file, setPhoto);
    } else if (outcome.reason === "permission") {
      showPermissionRecovery(
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
      acceptCapturedFile(outcome.file, setPhoto);
    } else if (outcome.reason === "permission") {
      showPermissionRecovery(
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
      acceptCapturedFile(outcome.file, setEvidence);
    } else if (outcome.reason === "failed") {
      Alert.alert(
        captureCopy.documentFailed,
        captureCopy.documentFailedRecovery
      );
    }
  };

  const requestPlaceLocation =
    async (): Promise<PlacePinEditorValue | null> => {
      const outcome = await readCurrentLocation();
      if (outcome.ok) {
        return outcome.pin;
      }
      if (outcome.reason === "permission") {
        showPermissionRecovery(
          captureCopy.locationPermission,
          captureCopy.locationPermissionRecovery
        );
      }
      return null;
    };

  const savePlace = async (): Promise<NativePlace | null> => {
    if (!placeName.trim()) {
      setPlaceError(captureCopy.placeNameError);
      return null;
    }
    if (pin && !pin.confirmedAt) {
      Alert.alert(
        captureCopy.confirmPropertyPin,
        captureCopy.propertyPinError
      );
      return null;
    }
    setPlaceError(null);
    try {
      const place = await createPlace({
        name: placeName,
        classification: placeClassification,
        addressSummary: address.trim() || null,
        regionLabel: region.trim() || captureCopy.unspecifiedRegion,
        roomName: roomName.trim() || null,
        pin
      });
      setPlaceId(place.id);
      setRoomId(place.rooms[0]?.id ?? null);
      setLocationStatus(place.rooms.length > 0 ? "known" : "needs-detail");
      setLocationError(null);
      setShowPlaceForm(false);
      return place;
    } catch {
      return null;
    }
  };

  const savePlaceOnly = async () => {
    const place = await savePlace();
    if (place) {
      await clearPlaceCaptureDraft();
      allowRemovalRef.current = true;
      if (returnTo === "asset-edit") {
        router.back();
      } else if (returnTo === "today") {
        router.replace("/");
      } else {
        router.replace(`/place/${place.id}?justCreated=1`);
      }
    }
  };

  const focusValidationTarget = <T extends TextInput | View>(
    targetRef: RefObject<T | null>
  ) => {
    requestAnimationFrame(() => {
      const target = targetRef.current;
      if (!target) return;

      if (Platform.OS === "web") {
        (
          target as unknown as {
            focus?: () => void;
          }
        ).focus?.();
        return;
      }

      const handle = findNodeHandle(target);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  };

  const goNext = () => {
    if (step === 0) {
      const missingName = !name.trim();
      const missingCategory = selectedCategory === null;
      setNameError(
        missingName ? captureCopy.nameError : null
      );
      setCategoryError(
        missingCategory ? captureCopy.categoryError : null
      );
      if (missingName) {
        focusValidationTarget(nameInputRef);
        return;
      }
      if (missingCategory) {
        focusValidationTarget(categoryGroupRef);
        return;
      }
    }
    setNameError(null);
    setCategoryError(null);
    if (step === 1 && physical) {
      if (locationStatus === null) {
        setLocationError(captureCopy.locationError);
        focusValidationTarget(locationGroupRef);
        return;
      }
      if (
        locationStatus === "known" &&
        (!placeId || (!roomId && !locatorText.trim()))
      ) {
        setLocationError(
          captureCopy.exactLocationError
        );
        focusValidationTarget(locationGroupRef);
        return;
      }
      if (locationStatus === "needs-detail" && !placeId) {
        setLocationError(
          captureCopy.placeError
        );
        focusValidationTarget(locationGroupRef);
        return;
      }
    }
    setLocationError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const saveAsset = async () => {
    if (!selectedCategory) {
      setStep(0);
      setCategoryError(captureCopy.categoryError);
      return;
    }
    if (physical && locationStatus === null) {
      setStep(1);
      setLocationError(captureCopy.locationError);
      return;
    }
    try {
      const asset = await createAsset({
        name: name.trim(),
        categoryId: selectedCategory.id,
        categoryLabel: selectedCategory.label,
        photo,
        locationStatus: physical ? locationStatus! : "known",
        placeId: physical ? placeId : null,
        roomId: physical ? roomId : null,
        locatorText: physical ? locatorText : null,
        evidence
      });
      await clearQuickPassportDraft();
      allowRemovalRef.current = true;
      if (returnTo === "today") {
        router.replace("/");
      } else {
        router.replace(`/asset/${asset.id}?justCreated=1`);
      }
    } catch {
      // WorkspaceProvider keeps the draft visible and presents the error.
    }
  };

  const openPlaceForm = () => {
    setShowPlaceForm(true);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: !reduceMotion });
      inlinePlaceNameRef.current?.focus();
    });
  };

  const closePlaceForm = () => {
    setShowPlaceForm(false);
    requestAnimationFrame(() => {
      const handle = findNodeHandle(addPlaceTriggerRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  };

  if (placeOnly) {
    return (
      <AppScreen
        contentStyle={styles.captureShell}
        scroll={false}
        testID="place-capture-screen"
      >
        <CaptureHeader
          label={captureCopy.newPlace}
          onClose={close}
          progress={100}
          stepLabel={captureCopy.placeDetails}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={12}
          style={styles.captureBody}
        >
          <ScrollView
            contentContainerStyle={styles.stepContent}
            keyboardShouldPersistTaps="handled"
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.stepScroll}
          >
            {draftRestored ? (
              <View
                accessible
                accessibilityLabel={`${captureCopy.draftRestored}. ${captureCopy.draftRestoredBody}`}
                accessibilityLiveRegion="polite"
                style={[
                  styles.draftRestored,
                  rtl && styles.rowReverse,
                  rtl && styles.draftRestoredRtl
                ]}
              >
                <ShieldCheck color={colors.action} size={22} weight="bold" />
                <View style={styles.draftRestoredCopy}>
                  <Text
                    style={[
                      styles.draftRestoredTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {captureCopy.draftRestored}
                  </Text>
                  <Text
                    style={[
                      styles.draftRestoredBody,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {captureCopy.draftRestoredBody}
                  </Text>
                </View>
              </View>
            ) : null}
            {error ? (
              <ErrorBanner
                message={localizedWorkspaceError(error, language)}
                onDismiss={clearError}
              />
            ) : null}
            <PlaceForm
              address={address}
              classification={placeClassification}
              language={language}
              onAddressChange={setAddress}
              onClassificationChange={setPlaceClassification}
              onNameChange={setPlaceName}
              onPinChange={setPin}
              onPinConfirm={setPin}
              onRegionChange={setRegion}
              onRequestCurrentLocation={requestPlaceLocation}
              onRoomChange={setRoomName}
              pin={pin}
              placeError={placeError}
              placeName={placeName}
              region={region}
              roomName={roomName}
            />
          </ScrollView>
          <View
            style={[
              styles.placeFooter,
              { paddingBottom: Math.max(insets.bottom, spacing.sm) }
            ]}
          >
            <PrimaryButton
              disabled={Boolean(pin && !pin.confirmedAt)}
              icon={Check}
              label={captureCopy.savePlace}
              loading={saving}
              onPress={() => void savePlaceOnly()}
            />
          </View>
        </KeyboardAvoidingView>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      contentStyle={styles.captureShell}
      scroll={false}
      testID={`capture-step-${step}`}
    >
      <CaptureHeader
        label={captureCopy.quickPassport}
        onClose={close}
        progress={((step + 1) / steps.length) * 100}
        stepAnnouncementRef={stepAnnouncementRef}
        stepLabel={`${formatLocalizedNumber(
          step + 1,
          language
        )} ${language === "ar" ? "/" : "of"} ${formatLocalizedNumber(
          steps.length,
          language
        )} · ${steps[step]}`}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={12}
        style={styles.captureBody}
      >
        <ScrollView
          contentContainerStyle={styles.stepContent}
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.stepScroll}
        >
          {draftRestored ? (
            <View
              accessible
              accessibilityLabel={`${captureCopy.draftRestored}. ${captureCopy.draftRestoredBody}`}
              accessibilityLiveRegion="polite"
              style={[
                styles.draftRestored,
                rtl && styles.rowReverse,
                rtl && styles.draftRestoredRtl
              ]}
            >
              <ShieldCheck color={colors.action} size={22} weight="bold" />
              <View style={styles.draftRestoredCopy}>
                <Text
                  style={[
                    styles.draftRestoredTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {captureCopy.draftRestored}
                </Text>
                <Text
                  style={[
                    styles.draftRestoredBody,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {captureCopy.draftRestoredBody}
                </Text>
              </View>
            </View>
          ) : null}
          {error ? (
            <ErrorBanner
              message={localizedWorkspaceError(error, language)}
              onDismiss={clearError}
            />
          ) : null}

          {step === 0 ? (
            <IdentityStep
              categoryError={categoryError}
              categoryGroupRef={categoryGroupRef}
              categoryId={categoryId}
              name={name}
              nameError={nameError}
              nameInputRef={nameInputRef}
              onCategoryChange={selectCategory}
              onChoosePhoto={() => void choosePhoto()}
              onNameChange={(value) => {
                setName(value);
                if (value.trim()) setNameError(null);
              }}
              onTakePhoto={() => void takePhoto()}
              photo={photo}
            />
          ) : null}

          {step === 1 ? (
            <LocationStep
              addPlaceTriggerRef={addPlaceTriggerRef}
              locationError={locationError}
              locationGroupRef={locationGroupRef}
              locatorText={locatorText}
              locationStatus={locationStatus}
              onAddPlace={openPlaceForm}
              onLocatorChange={(value) => {
                setLocatorText(value);
                if (value.trim() && placeId) setLocationError(null);
              }}
              onPlaceChange={(nextPlace) => {
                setPlaceId(nextPlace.id);
                setRoomId(null);
                setLocationError(null);
              }}
              onRoomChange={(nextRoomId) => {
                setRoomId(nextRoomId);
                setLocationError(null);
              }}
              onStatusChange={(status) => {
                setLocationStatus(status);
                setLocationError(null);
                if (status === "unknown") {
                  setPlaceId(null);
                  setRoomId(null);
                  setLocatorText("");
                  setShowPlaceForm(false);
                }
              }}
              physical={physical}
              places={workspace.places}
              roomId={roomId}
              selectedPlace={selectedPlace}
            />
          ) : null}

          {step === 1 && showPlaceForm ? (
            <Surface emphasis>
              <View
                style={[
                  styles.inlineFormHeader,
                  rtl && styles.rowReverse
                ]}
              >
                <View style={styles.inlineFormCopy}>
                  <Eyebrow>{captureCopy.newPlace}</Eyebrow>
                  <Text
                    style={[
                      styles.inlineFormTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {captureCopy.addNewPlace}
                  </Text>
                </View>
                <IconButton
                  icon={X}
                  label={captureCopy.closePlaceForm}
                  onPress={closePlaceForm}
                />
              </View>
              <PlaceForm
                address={address}
                classification={placeClassification}
                language={language}
                nameInputRef={inlinePlaceNameRef}
                onAddressChange={setAddress}
                onClassificationChange={setPlaceClassification}
                onNameChange={setPlaceName}
                onPinChange={setPin}
                onPinConfirm={setPin}
                onRegionChange={setRegion}
                onRequestCurrentLocation={requestPlaceLocation}
                onRoomChange={setRoomName}
                pin={pin}
                placeError={placeError}
                placeName={placeName}
                region={region}
                roomName={roomName}
              />
              <SecondaryButton
                disabled={Boolean(pin && !pin.confirmedAt)}
                icon={Plus}
                label={captureCopy.saveAndUsePlace}
                onPress={() => void savePlace()}
              />
            </Surface>
          ) : null}

          {step === 2 ? (
            <EvidenceStep
              evidence={evidence}
              onChoose={() => void chooseEvidence()}
              onRemove={() => setEvidence(null)}
            />
          ) : null}

          {step === 3 && selectedCategory ? (
            <ReviewStep
              categoryLabel={localizedCategoryLabel(
                selectedCategory.id,
                selectedCategory.label,
                language
              )}
              evidence={evidence}
              locatorText={locatorText}
              locationStatus={locationStatus}
              name={name}
              photo={photo}
              physical={physical}
              place={selectedPlace}
              roomName={selectedRoom?.name ?? null}
            />
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            rtl && !stackFooter && styles.rowReverse,
            stackFooter && styles.footerStacked,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) }
          ]}
        >
          {step > 0 ? (
            <View
              style={[
                styles.footerBack,
                stackFooter && styles.footerBackStacked
              ]}
            >
              <SecondaryButton
                icon={BackIcon}
                label={captureCopy.back}
                onPress={() =>
                  setStep((current) => Math.max(0, current - 1))
                }
              />
            </View>
          ) : null}
          <View
            style={[
              styles.footerPrimary,
              stackFooter && styles.footerPrimaryStacked
            ]}
          >
            {step < steps.length - 1 ? (
              <PrimaryButton
                disabled={saving}
                icon={ForwardIcon}
                label={
                  step === 2 && !evidence
                    ? captureCopy.skip
                    : captureCopy.continue
                }
                onPress={goNext}
              />
            ) : (
              <PrimaryButton
                icon={ShieldCheck}
                label={captureCopy.savePassport}
                loading={saving}
                onPress={() => void saveAsset()}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

export function CaptureHeader({
  label,
  onClose,
  progress,
  stepAnnouncementRef,
  stepLabel
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly progress: number;
  readonly stepAnnouncementRef?: RefObject<View | null>;
  readonly stepLabel: string;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  return (
    <View style={styles.captureHeader}>
      <View style={[styles.captureTop, rtl && styles.rowReverse]}>
        <View style={styles.captureTitleWrap}>
          <Eyebrow>{label}</Eyebrow>
          <View
            accessible
            accessibilityLabel={stepLabel}
            accessibilityLiveRegion={
              stepAnnouncementRef && Platform.OS === "web"
                ? "polite"
                : undefined
            }
            accessibilityRole="header"
            ref={stepAnnouncementRef}
          >
            <Text
              style={[
                styles.captureStep,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {stepLabel}
            </Text>
          </View>
        </View>
        <IconButton
          icon={X}
          label={copy.closeCapture}
          onPress={onClose}
        />
      </View>
      <ProgressBar label={stepLabel} percent={progress} />
    </View>
  );
}

function IdentityStep({
  categoryError,
  categoryGroupRef,
  categoryId,
  name,
  nameError,
  nameInputRef,
  onCategoryChange,
  onChoosePhoto,
  onNameChange,
  onTakePhoto,
  photo
}: {
  readonly categoryError: string | null;
  readonly categoryGroupRef: RefObject<View | null>;
  readonly categoryId: string | null;
  readonly name: string;
  readonly nameError: string | null;
  readonly nameInputRef: RefObject<TextInput | null>;
  readonly onCategoryChange: (id: string) => void;
  readonly onChoosePhoto: () => void;
  readonly onNameChange: (value: string) => void;
  readonly onTakePhoto: () => void;
  readonly photo: CapturedFile | null;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  const [categoryCatalogOpen, setCategoryCatalogOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const selectedCategory =
    CATEGORY_CHOICES.find((category) => category.id === categoryId) ?? null;
  const featuredCategories = useMemo(
    () => featuredItemCategories(),
    []
  );
  const visibleCategoryGroups = useMemo(
    () =>
      groupItemCategories(
        filterItemCategories(
          categoryQuery,
          (category) =>
            localizedCategoryLabel(
              category.id,
              category.label,
              language
            ),
          (groupId) =>
            copy.categoryGroupLabels[groupId] ?? groupId
        )
      ),
    [categoryQuery, copy, language]
  );
  const chooseCategory = (nextCategoryId: string) => {
    const nextCategory = CATEGORY_CHOICES.find(
      (category) => category.id === nextCategoryId
    );
    onCategoryChange(nextCategoryId);
    setCategoryCatalogOpen(false);
    setCategoryQuery("");
    if (nextCategory) {
      AccessibilityInfo.announceForAccessibility(
        `${copy.category}: ${localizedCategoryLabel(
          nextCategory.id,
          nextCategory.label,
          language
        )}`
      );
    }
  };
  const toggleCategoryCatalog = () => {
    setCategoryCatalogOpen((open) => {
      if (open) setCategoryQuery("");
      return !open;
    });
  };
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">{copy.identityTitle}</ScreenTitle>
        <BodyText muted>
          {copy.identityBody}
        </BodyText>
      </View>
      <Field
        autoCapitalize="words"
        error={nameError}
        label={copy.assetName}
        onChangeText={onNameChange}
        placeholder={copy.assetNamePlaceholder}
        ref={nameInputRef}
        value={name}
      />
      <View style={styles.optionSection}>
        <View
          accessible
          accessibilityHint={categoryError ?? undefined}
          accessibilityLabel={copy.category}
          ref={categoryGroupRef}
          tabIndex={-1}
        >
          <Text
            style={[
              styles.fieldLikeLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.category}
          </Text>
        </View>
        {selectedCategory && !categoryCatalogOpen ? (
          <View
            accessibilityLabel={copy.categoryChoices}
            accessibilityRole="radiogroup"
            style={styles.categorySelection}
          >
            <ChoiceCard
              active
              compact
              label={localizedCategoryLabel(
                selectedCategory.id,
                selectedCategory.label,
                language
              )}
              meta={
                copy.categoryGroupLabels[selectedCategory.groupId] ??
                selectedCategory.groupId
              }
              onPress={() => setCategoryCatalogOpen(true)}
            />
          </View>
        ) : !categoryCatalogOpen ? (
          <>
            <Text
              style={[
                styles.categorySectionLabel,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.categoryFeatured}
            </Text>
            <View
              accessibilityLabel={copy.categoryChoices}
              accessibilityRole="radiogroup"
              style={styles.categoryGridCompact}
            >
              {featuredCategories.map((category) => (
                <ChoiceCard
                  active={false}
                  compact
                  key={category.id}
                  label={localizedCategoryLabel(
                    category.id,
                    category.label,
                    language
                  )}
                  onPress={() => chooseCategory(category.id)}
                />
              ))}
            </View>
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: categoryCatalogOpen }}
          onPress={toggleCategoryCatalog}
          style={({ pressed }) => [
            styles.categoryDisclosure,
            rtl && styles.rowReverse,
            pressed && styles.pressed
          ]}
        >
          <Text
            style={[
              styles.categoryDisclosureText,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {selectedCategory
              ? copy.changeCategory
              : copy.browseAllCategories}
          </Text>
          {categoryCatalogOpen ? (
            <CaretUp color={colors.textMuted} size={18} />
          ) : (
            <CaretDown color={colors.textMuted} size={18} />
          )}
        </Pressable>
        {categoryCatalogOpen ? (
          <View style={styles.categoryCatalog}>
            <View
              style={[
                styles.categorySearch,
                rtl && styles.rowReverse
              ]}
            >
              <MagnifyingGlass
                color={colors.textMuted}
                size={19}
                weight="regular"
              />
              <TextInput
                accessibilityLabel={copy.searchCategories}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setCategoryQuery}
                placeholder={copy.searchCategoriesPlaceholder}
                placeholderTextColor={colors.textFaint}
                returnKeyType="search"
                style={[
                  styles.categorySearchInput,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
                value={categoryQuery}
              />
              {categoryQuery ? (
                <Pressable
                  accessibilityLabel={copy.clearCategorySearch}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCategoryQuery("")}
                  style={({ pressed }) => [
                    styles.categorySearchClear,
                    pressed && styles.pressed
                  ]}
                >
                  <X color={colors.textMuted} size={17} />
                </Pressable>
              ) : null}
            </View>
            {visibleCategoryGroups.length > 0 ? (
              visibleCategoryGroups.map((group) => (
                <View key={group.id} style={styles.categoryGroup}>
                  <Text
                    accessibilityRole="header"
                    style={[
                      styles.categoryGroupLabel,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {copy.categoryGroupLabels[group.id] ?? group.id}
                  </Text>
                  <View
                    accessibilityLabel={
                      copy.categoryGroupLabels[group.id] ?? group.id
                    }
                    accessibilityRole="radiogroup"
                    style={styles.categoryGridCompact}
                  >
                    {group.categories.map((category) => (
                      <ChoiceCard
                        active={category.id === categoryId}
                        compact
                        key={category.id}
                        label={localizedCategoryLabel(
                          category.id,
                          category.label,
                          language
                        )}
                        onPress={() => chooseCategory(category.id)}
                      />
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.categoryEmpty,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.noCategoryResults}
              </Text>
            )}
          </View>
        ) : null}
        <Text
          style={[
            styles.categoryPlaceNote,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.propertyIsPlace}
        </Text>
        {categoryError ? (
          <Text
            style={[
              styles.inlineError,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {categoryError}
          </Text>
        ) : null}
      </View>
      <View style={styles.mediaSection}>
        <View style={[styles.photoHeader, rtl && styles.rowReverse]}>
          <View style={styles.photoIcon}>
            <Camera color={colors.text} size={24} weight="regular" />
          </View>
          <View style={styles.inlineFormCopy}>
            <Text
              style={[
                styles.inlineFormTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.photo}
            </Text>
            <BodyText muted>
              {copy.photoBody}
            </BodyText>
          </View>
        </View>
        {photo ? (
          <>
            <Image source={{ uri: photo.localUri }} style={styles.photoPreview} />
            <Text style={styles.fileMeta}>
              {photo.fileName} · {fileSize(photo.byteSize, language)}
            </Text>
          </>
        ) : null}
        <View style={[styles.twoButtons, rtl && styles.rowReverse]}>
          <View style={styles.buttonFlex}>
            <SecondaryButton
              icon={Camera}
              label={copy.takePhoto}
              onPress={onTakePhoto}
            />
          </View>
          <View style={styles.buttonFlex}>
            <SecondaryButton
              icon={ImageSquare}
              label={copy.choosePhoto}
              onPress={onChoosePhoto}
            />
          </View>
        </View>
      </View>
    </>
  );
}

function LocationStep({
  addPlaceTriggerRef,
  locationError,
  locationGroupRef,
  locatorText,
  locationStatus,
  onAddPlace,
  onLocatorChange,
  onPlaceChange,
  onRoomChange,
  onStatusChange,
  physical,
  places,
  roomId,
  selectedPlace
}: {
  readonly addPlaceTriggerRef: RefObject<View | null>;
  readonly locationError: string | null;
  readonly locationGroupRef: RefObject<View | null>;
  readonly locatorText: string;
  readonly locationStatus: LocationChoice | null;
  readonly onAddPlace: () => void;
  readonly onLocatorChange: (value: string) => void;
  readonly onPlaceChange: (place: NativePlace) => void;
  readonly onRoomChange: (roomId: string) => void;
  readonly onStatusChange: (status: LocationChoice) => void;
  readonly physical: boolean;
  readonly places: readonly NativePlace[];
  readonly roomId: string | null;
  readonly selectedPlace: NativePlace | undefined;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  if (!physical) {
    return (
      <>
        <View style={styles.stepHeading}>
          <ScreenTitle size="medium">{copy.digitalTitle}</ScreenTitle>
          <BodyText muted>
            {copy.digitalBody}
          </BodyText>
        </View>
        <View style={[styles.noticePanel, rtl && styles.noticePanelRtl]}>
          <ShieldCheck color={colors.text} size={28} weight="regular" />
          <Text
            style={[
              styles.inlineFormTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.digitalReference}
          </Text>
          <BodyText muted>
            {copy.digitalReferenceBody}
          </BodyText>
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">{copy.locationTitle}</ScreenTitle>
        <BodyText muted>
          {copy.locationBody}
        </BodyText>
      </View>
      <View
        accessible
        accessibilityHint={locationError ?? undefined}
        accessibilityLabel={copy.locationQuestion}
        ref={locationGroupRef}
        tabIndex={-1}
      >
        <Text
          style={[
            styles.fieldLikeLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.locationDetail}
        </Text>
      </View>
      <View
        accessibilityLabel={copy.locationChoices}
        accessibilityRole="radiogroup"
        style={styles.statusChoices}
      >
        <LocationStatusChoice
          active={locationStatus === "known"}
          description={copy.exactSpotDescription}
          label={copy.exactSpot}
          onPress={() => onStatusChange("known")}
        />
        <LocationStatusChoice
          active={locationStatus === "needs-detail"}
          description={copy.placeOnlyDescription}
          label={copy.placeOnly}
          onPress={() => onStatusChange("needs-detail")}
        />
        <LocationStatusChoice
          active={locationStatus === "unknown"}
          description={copy.unknownDescription}
          label={copy.unknown}
          onPress={() => onStatusChange("unknown")}
        />
      </View>
      {locationError ? (
        <Text
          style={[
            styles.inlineError,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {locationError}
        </Text>
      ) : null}

      {locationStatus === "known" || locationStatus === "needs-detail" ? (
        <>
          <View style={styles.optionSection}>
            <View
              style={[
                styles.labelActionRow,
                rtl && styles.rowReverse
              ]}
            >
              <Text
                style={[
                  styles.fieldLikeLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.placeName}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onAddPlace}
                ref={addPlaceTriggerRef}
                style={styles.inlineAction}
              >
                <Plus color={colors.text} size={17} />
                <Text
                  style={[
                    styles.inlineActionText,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.addPlace}
                </Text>
              </Pressable>
            </View>
            {places.length > 0 ? (
              <View accessibilityRole="radiogroup" style={styles.placeChoices}>
                {places.map((place) => (
                  <ChoiceCard
                    active={place.id === selectedPlace?.id}
                    key={place.id}
                    label={place.name}
                    meta={place.regionLabel}
                    onPress={() => onPlaceChange(place)}
                  />
                ))}
              </View>
            ) : (
              <View
                style={[styles.noticePanel, rtl && styles.noticePanelRtl]}
              >
                <MapPin color={colors.warning} size={25} />
                <BodyText muted>
                  {copy.addPlaceEmpty}
                </BodyText>
              </View>
            )}
          </View>
          {selectedPlace ? (
            <View style={styles.optionSection}>
              <Text
                style={[
                  styles.fieldLikeLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.roomOrContainer}
              </Text>
              {selectedPlace.rooms.length > 0 ? (
                <View accessibilityRole="radiogroup" style={styles.placeChoices}>
                  {selectedPlace.rooms.map((room) => (
                    <ChoiceCard
                      active={room.id === roomId}
                      key={room.id}
                      label={room.name}
                      meta={copy.spaceKindLabels[room.kind]}
                      onPress={() => onRoomChange(room.id)}
                    />
                  ))}
                </View>
              ) : (
                <BodyText muted>
                  {copy.noRooms}
                </BodyText>
              )}
              <Field
                description={copy.locatorPlaceholder}
                label={copy.locatorClue}
                onChangeText={onLocatorChange}
                placeholder={copy.locatorDescription}
                value={locatorText}
              />
            </View>
          ) : null}
        </>
      ) : locationStatus === "unknown" ? (
        <View style={[styles.noticePanel, rtl && styles.noticePanelRtl]}>
          <Warning color={colors.warning} size={27} weight="regular" />
          <Text
            style={[
              styles.inlineFormTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.addLocationLater}
          </Text>
          <BodyText muted>
            {copy.addLocationLaterBody}
          </BodyText>
        </View>
      ) : null}
    </>
  );
}

function PlaceForm({
  address,
  classification,
  language,
  nameInputRef,
  onAddressChange,
  onClassificationChange,
  onNameChange,
  onPinChange,
  onPinConfirm,
  onRegionChange,
  onRequestCurrentLocation,
  onRoomChange,
  pin,
  placeError,
  placeName,
  region,
  roomName
}: {
  readonly address: string;
  readonly classification: PlaceClassification;
  readonly language: "en" | "ar";
  readonly nameInputRef?: RefObject<TextInput | null>;
  readonly onAddressChange: (value: string) => void;
  readonly onClassificationChange: (
    value: PlaceClassification
  ) => void;
  readonly onNameChange: (value: string) => void;
  readonly onPinChange: (value: PlacePinEditorValue | null) => void;
  readonly onPinConfirm: (value: PlacePinEditorValue) => void;
  readonly onRegionChange: (value: string) => void;
  readonly onRequestCurrentLocation: () => Promise<PlacePinEditorValue | null>;
  readonly onRoomChange: (value: string) => void;
  readonly pin: NewPlaceInput["pin"];
  readonly placeError: string | null;
  readonly placeName: string;
  readonly region: string;
  readonly roomName: string;
}) {
  const copy = getCaptureCopy(language);
  return (
    <View style={styles.formStack}>
      <Field
        error={placeError}
        label={copy.placeName}
        onChangeText={onNameChange}
        placeholder={copy.placeNamePlaceholder}
        ref={nameInputRef}
        value={placeName}
      />
      <PlaceClassificationSelector
        onChange={onClassificationChange}
        value={classification}
      />
      <Field
        description={copy.addressDescription}
        label={copy.address}
        onChangeText={onAddressChange}
        placeholder={copy.addressPlaceholder}
        value={address}
      />
      <Field
        label={copy.region}
        onChangeText={onRegionChange}
        placeholder={copy.regionPlaceholder}
        value={region}
      />
      <Field
        description={copy.firstSpaceDescription}
        label={copy.firstSpace}
        onChangeText={onRoomChange}
        placeholder={copy.firstSpacePlaceholder}
        value={roomName}
      />
      <PlacePinEditor
        language={language}
        onChange={onPinChange}
        onConfirm={onPinConfirm}
        onRequestCurrentLocation={onRequestCurrentLocation}
        value={pin}
      />
      {!pin ? (
        <BodyText muted style={styles.honestyNote}>
          {copy.noPinNote}
        </BodyText>
      ) : null}
    </View>
  );
}

function EvidenceStep({
  evidence,
  onChoose,
  onRemove
}: {
  readonly evidence: CapturedFile | null;
  readonly onChoose: () => void;
  readonly onRemove: () => void;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">{copy.evidenceTitle}</ScreenTitle>
        <BodyText muted>
          {copy.evidenceBody}
        </BodyText>
      </View>
      {evidence ? (
        <View style={styles.filePanel}>
          <View style={[styles.fileRow, rtl && styles.rowReverse]}>
            <View style={styles.fileIcon}>
              <File color={colors.text} size={25} weight="regular" />
            </View>
            <View style={styles.fileCopy}>
              <Text numberOfLines={1} style={styles.fileName}>
                {evidence.fileName}
              </Text>
              <Text style={styles.fileMeta}>
                {fileSize(evidence.byteSize, language)} ·{" "}
                {copy.readyToAdd}
              </Text>
            </View>
            <StatusPill
              label={
                language === "ar" ? "على الجهاز" : "On device"
              }
              tone="neutral"
            />
          </View>
          <SecondaryButton
            label={copy.removeDocument}
            onPress={onRemove}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onChoose}
          style={({ pressed }) => [
            styles.dropArea,
            pressed && styles.pressed
          ]}
        >
          <View style={styles.dropIcon}>
            <FolderOpen color={colors.text} size={31} weight="regular" />
          </View>
          <Text
            style={[
              styles.dropTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.choosePdf}
          </Text>
          <Text
            style={[
              styles.dropCopy,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.fileLimit}
          </Text>
        </Pressable>
      )}
      <View style={[styles.noticePanel, rtl && styles.noticePanelRtl]}>
        <ShieldCheck color={colors.text} size={25} weight="regular" />
        <Text
          style={[
            styles.inlineFormTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.aboutDocument}
        </Text>
        <BodyText muted>
          {copy.aboutDocumentBody}
        </BodyText>
      </View>
    </>
  );
}

function ReviewStep({
  categoryLabel,
  evidence,
  locatorText,
  locationStatus,
  name,
  photo,
  physical,
  place,
  roomName
}: {
  readonly categoryLabel: string;
  readonly evidence: CapturedFile | null;
  readonly locatorText: string;
  readonly locationStatus: LocationChoice | null;
  readonly name: string;
  readonly photo: CapturedFile | null;
  readonly physical: boolean;
  readonly place: NativePlace | undefined;
  readonly roomName: string | null;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  const location = !physical
    ? copy.noPhysicalLocation
    : locationStatus === "unknown"
      ? copy.unknownReminder
      : place
        ? [place.name, roomName, locatorText]
            .filter(Boolean)
            .join(rtl ? " ‹ " : " › ")
        : copy.placeNeedsDetail;
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">{copy.reviewTitle}</ScreenTitle>
        <BodyText muted>
          {copy.reviewBody}
        </BodyText>
      </View>
      <View style={styles.reviewPanel}>
        <View style={[styles.reviewHero, rtl && styles.rowReverse]}>
          {photo ? (
            <Image source={{ uri: photo.localUri }} style={styles.reviewPhoto} />
          ) : (
            <View style={styles.reviewPhotoEmpty}>
              <ImageSquare color={colors.textMuted} size={29} />
            </View>
          )}
          <View style={styles.reviewCopy}>
            <Text
              style={[
                styles.reviewCategory,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {categoryLabel}
            </Text>
            <Text
              style={[
                styles.reviewName,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {name}
            </Text>
            <Text
              style={[
                styles.reviewMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.readyToAdd}
            </Text>
          </View>
        </View>
        <ReviewRow label={copy.reviewLocation} value={location} />
        <ReviewRow
          label={copy.reviewProof}
          value={evidence ? evidence.fileName : copy.notAdded}
        />
        <ReviewRow
          label={copy.reviewSaving}
          value={copy.savedDeviceFirst}
        />
      </View>
      <View style={[styles.noticePanel, rtl && styles.noticePanelRtl]}>
        <ShieldCheck color={colors.text} size={27} weight="regular" />
        <Text
          style={[
            styles.inlineFormTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.privateTitle}
        </Text>
        <BodyText muted>
          {copy.privateBody}
        </BodyText>
      </View>
    </>
  );
}

function ChoiceCard({
  active,
  compact = false,
  label,
  meta,
  onPress
}: {
  readonly active: boolean;
  readonly compact?: boolean;
  readonly label: string;
  readonly meta?: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        compact && styles.choiceCardCompact,
        rtl && styles.rowReverse,
        active && styles.choiceCardActive,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.choiceCheck, active && styles.choiceCheckActive]}>
        {active ? <Check color={colors.carbon} size={13} weight="bold" /> : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text
          style={[
            styles.choiceLabel,
            active && styles.choiceLabelActive,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {label}
        </Text>
        {meta ? (
          <Text
            style={[
              styles.choiceMeta,
              active && styles.choiceMetaActive,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function LocationStatusChoice({
  active,
  description,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly description: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusChoice,
        rtl && styles.rowReverse,
        active && styles.statusChoiceActive,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text
          style={[
            styles.statusChoiceLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.statusChoiceCopy,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function ReviewRow({
  label,
  value
}: {
  readonly label: string;
  readonly value: string;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <View style={styles.reviewRow}>
      <Text
        style={[
          styles.reviewRowLabel,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.reviewRowValue,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function fileSize(
  bytes: number,
  language: "en" | "ar"
): string {
  const copy = getCaptureCopy(language);
  if (!bytes) return copy.sizeUnavailable;
  if (bytes < 1024 * 1024) {
    return `${formatLocalizedNumber(
      Math.round(bytes / 1024),
      language
    )} ${language === "ar" ? "كيلوبايت" : "KB"}`;
  }
  return `${formatLocalizedNumber(
    bytes / (1024 * 1024),
    language,
    { maximumFractionDigits: 1, minimumFractionDigits: 1 }
  )} ${language === "ar" ? "ميغابايت" : "MB"}`;
}

const styles = StyleSheet.create({
  draftLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas
  },
  draftRestored: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.action,
    backgroundColor: colors.surfaceQuiet
  },
  draftRestoredRtl: {
    borderLeftWidth: 0,
    borderRightWidth: 2,
    borderRightColor: colors.action
  },
  draftRestoredCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2
  },
  draftRestoredTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  draftRestoredBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  captureShell: {
    paddingBottom: 0,
    gap: spacing.md
  },
  captureBody: {
    flex: 1,
    gap: spacing.md
  },
  stepScroll: {
    flex: 1
  },
  stepContent: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing.md
  },
  captureHeader: {
    gap: spacing.sm
  },
  captureTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  captureTitleWrap: {
    flex: 1,
    gap: 3
  },
  captureStep: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  stepHeading: {
    gap: spacing.sm
  },
  optionSection: {
    gap: spacing.sm
  },
  fieldLikeLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  inlineError: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  categoryGridCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  categorySelection: {
    width: "100%"
  },
  categorySectionLabel: {
    color: colors.textFaint,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 17
  },
  categoryDisclosure: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  categoryDisclosureText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  categoryCatalog: {
    gap: spacing.md,
    paddingTop: spacing.xs
  },
  categorySearch: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingStart: spacing.sm,
    paddingEnd: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  categorySearchInput: {
    minWidth: 0,
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: spacing.sm
  },
  categorySearchClear: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  categoryGroup: {
    gap: spacing.xs
  },
  categoryGroupLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 17
  },
  categoryEmpty: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: spacing.md
  },
  categoryPlaceNote: {
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  placeChoices: {
    gap: spacing.xs
  },
  choiceCard: {
    minWidth: "47%",
    minHeight: 58,
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  choiceCardCompact: {
    minWidth: 124,
    minHeight: 52,
    flexBasis: 124,
    paddingVertical: spacing.xs
  },
  choiceCardActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  choiceCheck: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  choiceCheckActive: {
    borderColor: colors.volt,
    backgroundColor: colors.volt
  },
  choiceCopy: {
    flex: 1,
    gap: 2
  },
  choiceLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 14
  },
  choiceLabelActive: {
    color: colors.white
  },
  choiceMeta: {
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 11
  },
  choiceMetaActive: {
    color: colors.concrete
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  photoIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md
  },
  mediaSection: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  twoButtons: {
    flexDirection: "row",
    gap: spacing.xs
  },
  buttonFlex: {
    flex: 1
  },
  statusChoices: {
    gap: spacing.xs
  },
  statusChoice: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  statusChoiceActive: {
    backgroundColor: colors.mist
  },
  radio: {
    width: 23,
    height: 23,
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
    width: 11,
    height: 11,
    borderRadius: radius.round,
    backgroundColor: colors.carbon
  },
  statusChoiceLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14
  },
  statusChoiceCopy: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  labelActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  inlineAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.xs
  },
  inlineActionText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  inlineFormHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  inlineFormCopy: {
    flex: 1,
    gap: 4
  },
  inlineFormTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 17,
    lineHeight: 23
  },
  formStack: {
    gap: spacing.md
  },
  honestyNote: {
    fontSize: 12,
    lineHeight: 18
  },
  dropArea: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  dropIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md
  },
  dropTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18
  },
  dropCopy: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center"
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  fileIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md
  },
  fileCopy: {
    flex: 1,
    gap: 3
  },
  fileName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14
  },
  fileMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  reviewHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  reviewPhoto: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  reviewPhotoEmpty: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceQuiet
  },
  reviewCopy: {
    flex: 1,
    gap: spacing.xs
  },
  reviewName: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  reviewCategory: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  reviewMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  reviewRow: {
    minHeight: 54,
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  reviewRowLabel: {
    color: colors.textFaint,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  reviewRowValue: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  noticePanel: {
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  noticePanelRtl: {
    alignItems: "flex-end"
  },
  filePanel: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  reviewPanel: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.canvas
  },
  placeFooter: {
    paddingTop: spacing.sm,
    backgroundColor: colors.canvas
  },
  footerPrimary: {
    flex: 1,
    minWidth: 0
  },
  footerPrimaryStacked: {
    width: "100%"
  },
  footerBack: {
    width: 100,
    flexShrink: 0
  },
  footerBackStacked: {
    width: "100%"
  },
  footerStacked: {
    flexDirection: "column",
    alignItems: "stretch"
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
