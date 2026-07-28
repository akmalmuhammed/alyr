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
  useCallback,
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
  Modal,
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
  isAssetMutationValidationError,
  type AssetMutationValidationError
} from "@alyr/domain";

import {
  chooseAssetPhoto,
  chooseEvidenceDocument,
  takeAssetPhoto
} from "@/adapters/capture";
import { readCurrentLocation } from "@/adapters/location";
import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { finalizeCommittedRecord } from "@/auth/firstRecordCompletion";
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
  SecondaryButton
} from "@/components/ui";
import {
  CATEGORY_CHOICES,
  type CapturedFile,
  type NativePlace,
  type NewAssetInput,
  type NewPlaceInput,
  type PlaceClassification
} from "@/domain/model";
import {
  featuredItemCategories,
  filterItemCategories,
  groupItemCategories
} from "@/domain/assetCategoryCatalog";
import {
  deriveNativeAssetLocationTruth,
  hasConfirmedPreciseNativePlacePin
} from "@/domain/readiness";
import { playTactileFeedback } from "@/feedback/tactileFeedback";
import {
  getCaptureCopy,
  localizedCategoryLabel
} from "@/i18n/captureCopy";
import { localizedAssetMutationRecovery } from "@/i18n/assetMutationCopy";
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
  useDeviceAuth,
  type OnboardingHandoffRecord
} from "@/deviceAuth";
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
type DraftPersistenceOperation = "read" | "write" | "clear";

interface CommittedCaptureRecord {
  readonly kind: "item" | "place";
  readonly id: string;
  readonly handoff: OnboardingHandoffRecord | null;
}

function draftPersistenceMessage(
  language: "en" | "ar",
  operation: DraftPersistenceOperation
): string {
  if (language === "ar") {
    return operation === "read"
      ? "تعذّرت استعادة المسودة المحمية. حاول مرة أخرى قبل المتابعة."
      : operation === "write"
        ? "لم تُحفظ تغييرات المسودة في التخزين المحمي بعد. حاول الحفظ مرة أخرى."
        : "تعذّر مسح المسودة المحمية. السجل المحفوظ لم يتغير؛ حاول الإنهاء مرة أخرى.";
  }
  return operation === "read"
    ? "The protected draft could not be restored. Try again before continuing."
    : operation === "write"
      ? "Your latest draft changes are not protected yet. Try saving the draft again."
      : "The protected draft could not be cleared. Your saved record is unchanged; try finishing again.";
}

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
    handoffId: requestedHandoffId,
    placeId: requestedPlaceId,
    returnTo
  } = useLocalSearchParams<{
    intent?: string;
    handoffId?: string;
    placeId?: string;
    returnTo?: string;
  }>();
  const {
    workspace,
    repository,
    attachmentStore,
    saving,
    error,
    clearError,
    can,
    createPlace,
    createAsset
  } = useWorkspace();
  const deviceAuth = useDeviceAuth();
  const [placeOnly] = useState(intent === "place");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedFile | null>(null);
  const [evidence, setEvidence] = useState<CapturedFile | null>(null);
  const [captureSource, setCaptureSource] =
    useState<NonNullable<NewAssetInput["captureSource"]>>("manual");
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
  const [assetMutationFailure, setAssetMutationFailure] =
    useState<AssetMutationValidationError | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [
    committedCaptureRecord,
    setCommittedCaptureRecord
  ] = useState<CommittedCaptureRecord | null>(null);
  const [
    handoffCompletionError,
    setHandoffCompletionError
  ] = useState<string | null>(null);
  const [
    draftPersistenceFailure,
    setDraftPersistenceFailure
  ] = useState<DraftPersistenceOperation | null>(null);
  const [draftRestoreAttempt, setDraftRestoreAttempt] = useState(0);
  const [draftPersistAttempt, setDraftPersistAttempt] = useState(0);
  const draftPersistenceVersionRef = useRef(0);
  const handoffCommitInFlightRef = useRef(false);
  const handoffAcknowledgeInFlightRef = useRef(false);
  const householdId = workspace?.household.id ?? null;
  const draftScopeId = repository.scopeId;
  const activeFirstRecordHandoff =
    typeof requestedHandoffId === "string" &&
    deviceAuth.pendingFirstRecordHandoff?.handoffId ===
      requestedHandoffId &&
    deviceAuth.pendingFirstRecordHandoff.intent ===
      (placeOnly ? "place" : "item")
      ? deviceAuth.pendingFirstRecordHandoff
      : null;

  const selectedCategory = useMemo(
    () =>
      CATEGORY_CHOICES.find((category) => category.id === categoryId) ?? null,
    [categoryId]
  );
  const selectedPlace = workspace?.places.find((place) => place.id === placeId);
  const selectedRoom = selectedPlace?.rooms.find((room) => room.id === roomId);
  const physical = selectedCategory?.supportsPhysicalLocation === true;
  const truthfulLocationStatus =
    physical && locationStatus
      ? deriveNativeAssetLocationTruth({
          categoryId: selectedCategory?.id ?? "",
          requestedStatus: locationStatus,
          place: selectedPlace,
          roomId,
          locatorText
        }).status
      : locationStatus;
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
      setDraftPersistenceFailure((current) =>
        current === "read" ? null : current
      );
      return;
    }
    let active = true;
    setDraftReady(false);
    if (placeOnly) {
      void readPlaceCaptureDraft(draftScopeId, householdId)
        .then((draft) => {
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
          setDraftPersistenceFailure((current) =>
            current === "read" ? null : current
          );
          setDraftReady(true);
        })
        .catch(() => {
          if (!active) return;
          setDraftPersistenceFailure("read");
          setDraftReady(false);
        });
    } else {
      void readQuickPassportDraft(
        draftScopeId,
        householdId,
        attachmentStore
      )
        .then((draft) => {
          if (!active) return;
          if (draft) {
            setStep(draft.step);
            setName(draft.name);
            setCategoryId(draft.categoryId);
            setPhoto(draft.photo);
            setEvidence(draft.evidence);
            setCaptureSource(
              draft.captureSource ??
                (draft.photo
                  ? "image-library"
                  : draft.evidence
                    ? "document-import"
                    : "manual")
            );
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
          setDraftPersistenceFailure((current) =>
            current === "read" ? null : current
          );
          setDraftReady(true);
        })
        .catch(() => {
          if (!active) return;
          setDraftPersistenceFailure("read");
          setDraftReady(false);
        });
    }
    return () => {
      active = false;
    };
  }, [
    attachmentStore,
    draftRestoreAttempt,
    draftScopeId,
    householdId,
    placeOnly
  ]);

  useEffect(() => {
    if (!draftReady || !householdId) return;
    const timer = setTimeout(() => {
      const persistenceVersion =
        draftPersistenceVersionRef.current + 1;
      draftPersistenceVersionRef.current = persistenceVersion;
      const settle = (
        operation: Promise<void>,
        failure: Exclude<DraftPersistenceOperation, "read">
      ) => {
        void operation
          .then(() => {
            if (
              draftPersistenceVersionRef.current ===
              persistenceVersion
            ) {
              setDraftPersistenceFailure((current) =>
                current === failure ? null : current
              );
            }
          })
          .catch(() => {
            if (
              draftPersistenceVersionRef.current ===
              persistenceVersion
            ) {
              setDraftPersistenceFailure(failure);
            }
          });
      };
      if (placeOnly) {
        if (!hasPlaceDraft) {
          settle(
            clearPlaceCaptureDraft(draftScopeId),
            "clear"
          );
          return;
        }
        settle(
          writePlaceCaptureDraft({
            scopeId: draftScopeId,
            householdId,
            placeName,
            placeClassification,
            address,
            region,
            roomName,
            pin
          }),
          "write"
        );
        return;
      }
      if (!hasDraft) {
        settle(
          clearQuickPassportDraft(
            draftScopeId,
            attachmentStore
          ),
          "clear"
        );
        return;
      }
      settle(
        writeQuickPassportDraft(
          {
            scopeId: draftScopeId,
            householdId,
            step,
            name,
            categoryId,
            captureSource,
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
          },
          attachmentStore
        ),
        "write"
      );
    }, 180);
    return () => clearTimeout(timer);
  }, [
    address,
    attachmentStore,
    categoryId,
    captureSource,
    draftReady,
    draftPersistAttempt,
    draftScopeId,
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

  const navigateAfterCommittedRecord = useCallback(
    (kind: "item" | "place", recordId: string) => {
      allowRemovalRef.current = true;
      if (returnTo === "today") {
        router.replace("/");
      } else if (kind === "place" && returnTo === "asset-edit") {
        router.back();
      } else {
        router.replace(
          kind === "place"
            ? `/place/${recordId}?justCreated=1`
            : `/asset/${recordId}?justCreated=1`
        );
      }
    },
    [returnTo, router]
  );

  const finishCommittedCapture = useCallback(
    async (record: CommittedCaptureRecord): Promise<boolean> => {
      const handoff = record.handoff;
      if (
        handoff &&
        (activeFirstRecordHandoff?.handoffId !==
          handoff.handoffId ||
          handoff.recordId !== record.id)
      ) {
        setHandoffCompletionError(
          language === "ar"
            ? "تعذّر تأكيد اكتمال السجل الأول. أعد فتح عملية الإعداد."
            : "The first record could not be confirmed. Reopen setup and try again."
        );
        return false;
      }
      if (handoffAcknowledgeInFlightRef.current) return false;

      handoffAcknowledgeInFlightRef.current = true;
      setHandoffCompletionError(null);
      let failureStage: "clear" | "acknowledge" = "clear";
      try {
        await finalizeCommittedRecord({
          clearDraft: async () => {
            if (record.kind === "place") {
              await clearPlaceCaptureDraft(draftScopeId);
            } else {
              await clearQuickPassportDraft(
                draftScopeId,
                attachmentStore
              );
            }
            setDraftPersistenceFailure((current) =>
              current === "clear" ? null : current
            );
          },
          acknowledge: async () => {
            failureStage = "acknowledge";
            if (handoff) {
              await deviceAuth.acknowledgeOnboardingHandoff({
                handoffId: handoff.handoffId,
                intent: handoff.intent,
                recordId: record.id
              });
            }
          },
          navigate: () =>
            navigateAfterCommittedRecord(record.kind, record.id)
        });
        return true;
      } catch {
        if (failureStage === "clear") {
          setDraftPersistenceFailure("clear");
        } else {
          setHandoffCompletionError(
            language === "ar"
              ? "تم حفظ السجل على هذا الجهاز، لكن تأكيد الإعداد لم يكتمل. حاول التأكيد مرة أخرى."
              : "Your record is saved on this device, but setup confirmation did not finish. Try confirming again."
          );
        }
        return false;
      } finally {
        handoffAcknowledgeInFlightRef.current = false;
      }
    },
    [
      activeFirstRecordHandoff,
      attachmentStore,
      deviceAuth,
      draftScopeId,
      language,
      navigateAfterCommittedRecord
    ]
  );

  const deferActiveFirstRecordHandoff = useCallback(() => {
    if (activeFirstRecordHandoff) {
      deviceAuth.deferOnboardingHandoff(
        activeFirstRecordHandoff.handoffId
      );
    }
  }, [activeFirstRecordHandoff, deviceAuth]);

  useEffect(() => {
    if (
      !draftReady ||
      !workspace ||
      !activeFirstRecordHandoff ||
      committedCaptureRecord ||
      handoffCommitInFlightRef.current ||
      handoffAcknowledgeInFlightRef.current
    ) {
      return;
    }

    const record =
      activeFirstRecordHandoff.intent === "place"
        ? workspace.places.find(
            (place) =>
              place.id === activeFirstRecordHandoff.recordId
          )
        : workspace.assets.find(
            (asset) =>
              asset.id === activeFirstRecordHandoff.recordId
          );
    if (!record) return;

    const committed = {
      kind: activeFirstRecordHandoff.intent,
      id: record.id,
      handoff: activeFirstRecordHandoff
    } as const;
    setCommittedCaptureRecord(committed);
    void finishCommittedCapture(committed);
  }, [
    activeFirstRecordHandoff,
    committedCaptureRecord,
    draftReady,
    finishCommittedCapture,
    workspace
  ]);

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
        if (allowRemovalRef.current) return;
        if (!hasDraft) {
          deferActiveFirstRecordHandoff();
          return;
        }
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
                  ? () => clearPlaceCaptureDraft(draftScopeId)
                  : () =>
                      clearQuickPassportDraft(
                        draftScopeId,
                        attachmentStore
                      );
                void clearActiveDraft()
                  .then(() => {
                    setDraftPersistenceFailure((current) =>
                      current === "clear" ? null : current
                    );
                    allowRemovalRef.current = true;
                    deferActiveFirstRecordHandoff();
                    navigation.dispatch(event.data.action);
                  })
                  .catch(() => {
                    setDraftPersistenceFailure("clear");
                  });
              }
            }
          ]
        );
      }),
    [
      attachmentStore,
      captureCopy,
      deferActiveFirstRecordHandoff,
      draftScopeId,
      hasDraft,
      navigation,
      placeOnly
    ]
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

  if (!draftReady && draftPersistenceFailure === "read") {
    const retryRestore = () => {
      setDraftPersistenceFailure(null);
      setDraftRestoreAttempt((current) => current + 1);
    };
    return (
      <AppScreen testID="capture-draft-read-error">
        <ErrorBanner
          message={draftPersistenceMessage(language, "read")}
          onDismiss={retryRestore}
        />
        <PrimaryButton
          icon={ShieldCheck}
          label={
            language === "ar"
              ? "محاولة استعادة المسودة مرة أخرى"
              : "Try restoring draft again"
          }
          onPress={retryRestore}
        />
      </AppScreen>
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
    setAssetMutationFailure(null);
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
  ): boolean => {
    if (file.byteSize > MAX_FILE_BYTES) {
      Alert.alert(
        captureCopy.fileTooLarge,
        captureCopy.fileTooLargeRecovery
      );
      return false;
    }
    setAssetMutationFailure(null);
    setter(file);
    return true;
  };

  const takePhoto = async () => {
    const outcome = await takeAssetPhoto();
    if (outcome.ok) {
      if (acceptCapturedFile(outcome.file, setPhoto)) {
        setCaptureSource("camera");
      }
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
      if (acceptCapturedFile(outcome.file, setPhoto)) {
        setCaptureSource("image-library");
      }
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
      if (acceptCapturedFile(outcome.file, setEvidence) && !photo) {
        setCaptureSource("document-import");
      }
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
        ...(placeOnly && activeFirstRecordHandoff
          ? { recordId: activeFirstRecordHandoff.recordId }
          : {}),
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
      if (!placeOnly) {
        setPlaceName("");
        setPlaceClassification("unknown");
        setAddress("");
        setRegion("");
        setRoomName("");
        setPin(null);
      }
      return place;
    } catch {
      return null;
    }
  };

  const savePlaceOnly = async () => {
    handoffCommitInFlightRef.current = true;
    try {
      const place = await savePlace();
      if (place) {
        const committed: CommittedCaptureRecord = {
          kind: "place",
          id: place.id,
          handoff: activeFirstRecordHandoff
        };
        setCommittedCaptureRecord(committed);
        await finishCommittedCapture(committed);
      }
    } finally {
      handoffCommitInFlightRef.current = false;
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
    setAssetMutationFailure(null);
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
    handoffCommitInFlightRef.current = true;
    try {
      const asset = await createAsset({
        ...(activeFirstRecordHandoff
          ? { recordId: activeFirstRecordHandoff.recordId }
          : {}),
        name: name.trim(),
        categoryId: selectedCategory.id,
        categoryLabel: selectedCategory.label,
        captureSource,
        photo,
        locationStatus: physical ? truthfulLocationStatus! : "known",
        placeId: physical ? placeId : null,
        roomId: physical ? roomId : null,
        locatorText: physical ? locatorText : null,
        evidence
      });
      void playTactileFeedback("success", { reduceMotion });
      const committed: CommittedCaptureRecord = {
        kind: "item",
        id: asset.id,
        handoff: activeFirstRecordHandoff
      };
      setCommittedCaptureRecord(committed);
      await finishCommittedCapture(committed);
    } catch (caught) {
      if (!isAssetMutationValidationError(caught)) {
        // WorkspaceProvider keeps the draft visible and presents the error.
        return;
      }
      const recovery = localizedAssetMutationRecovery(caught, language);
      setAssetMutationFailure(caught);
      setStep(recovery.step);
      if (recovery.field === "name") {
        setNameError(recovery.message);
        focusValidationTarget(nameInputRef);
      } else if (recovery.field === "category") {
        setCategoryError(recovery.message);
        focusValidationTarget(categoryGroupRef);
      } else if (recovery.field === "location") {
        setLocationError(recovery.message);
        focusValidationTarget(locationGroupRef);
      }
    } finally {
      handoffCommitInFlightRef.current = false;
    }
  };

  const openPlaceForm = () => {
    setShowPlaceForm(true);
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
            {draftPersistenceFailure &&
            draftPersistenceFailure !== "read" ? (
              <View
                style={styles.formStack}
                testID="capture-draft-persistence-error"
              >
                <ErrorBanner
                  message={draftPersistenceMessage(
                    language,
                    draftPersistenceFailure
                  )}
                  onDismiss={() => setDraftPersistenceFailure(null)}
                />
                <SecondaryButton
                  label={
                    language === "ar"
                      ? "المحاولة مرة أخرى"
                      : "Try again"
                  }
                  onPress={() => {
                    if (committedCaptureRecord) {
                      void finishCommittedCapture(
                        committedCaptureRecord
                      );
                    } else {
                      setDraftPersistAttempt(
                        (current) => current + 1
                      );
                    }
                  }}
                />
              </View>
            ) : null}
            {error ? (
              <ErrorBanner
                message={localizedWorkspaceError(error, language)}
                onDismiss={clearError}
              />
            ) : null}
            {handoffCompletionError ? (
              <View testID="first-record-handoff-error">
                <ErrorBanner
                  message={handoffCompletionError}
                  onDismiss={() => setHandoffCompletionError(null)}
                />
              </View>
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
              icon={committedCaptureRecord ? ShieldCheck : Check}
              label={
                committedCaptureRecord
                  ? committedCaptureRecord.handoff
                    ? language === "ar"
                      ? "تأكيد الإعداد مرة أخرى"
                      : "Confirm setup again"
                    : language === "ar"
                      ? "إكمال الحفظ"
                      : "Finish saving"
                  : captureCopy.savePlace
              }
              loading={
                saving ||
                deviceAuth.onboardingHandoffAcknowledgeState ===
                  "acknowledging"
              }
              onPress={() =>
                void (committedCaptureRecord
                  ? finishCommittedCapture(committedCaptureRecord)
                  : savePlaceOnly())
              }
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
          {draftPersistenceFailure &&
          draftPersistenceFailure !== "read" ? (
            <View
              style={styles.formStack}
              testID="capture-draft-persistence-error"
            >
              <ErrorBanner
                message={draftPersistenceMessage(
                  language,
                  draftPersistenceFailure
                )}
                onDismiss={() => setDraftPersistenceFailure(null)}
              />
              <SecondaryButton
                label={
                  language === "ar"
                    ? "المحاولة مرة أخرى"
                    : "Try again"
                }
                onPress={() => {
                  if (committedCaptureRecord) {
                    void finishCommittedCapture(
                      committedCaptureRecord
                    );
                  } else {
                    setDraftPersistAttempt(
                      (current) => current + 1
                    );
                  }
                }}
              />
            </View>
          ) : null}
          {assetMutationFailure ? (
            <ErrorBanner
              message={
                localizedAssetMutationRecovery(
                  assetMutationFailure,
                  language
                ).message
              }
              onDismiss={() => setAssetMutationFailure(null)}
            />
          ) : error ? (
            <ErrorBanner
              message={localizedWorkspaceError(error, language)}
              onDismiss={clearError}
            />
          ) : null}
          {handoffCompletionError ? (
            <View testID="first-record-handoff-error">
              <ErrorBanner
                message={handoffCompletionError}
                onDismiss={() => setHandoffCompletionError(null)}
              />
            </View>
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
                setAssetMutationFailure(null);
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
                setAssetMutationFailure(null);
                setLocatorText(value);
                if (value.trim() && placeId) setLocationError(null);
              }}
              onPlaceChange={(nextPlace) => {
                setAssetMutationFailure(null);
                setPlaceId(nextPlace.id);
                setRoomId(null);
                setLocationError(null);
              }}
              onRoomChange={(nextRoomId) => {
                setAssetMutationFailure(null);
                setRoomId(nextRoomId);
                setLocationError(null);
              }}
              onStatusChange={(status) => {
                setAssetMutationFailure(null);
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

          {step === 2 ? (
            <EvidenceStep
              evidence={evidence}
              onChoose={() => void chooseEvidence()}
              onRemove={() => {
                setAssetMutationFailure(null);
                setEvidence(null);
                if (!photo) setCaptureSource("manual");
              }}
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
              locationStatus={truthfulLocationStatus}
              name={name}
              onEditStep={setStep}
              onReviewPlacePin={(selectedPlaceId) =>
                router.push(
                  `/place-pin?placeId=${encodeURIComponent(
                    selectedPlaceId
                  )}`
                )
              }
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
                label={
                  committedCaptureRecord
                    ? committedCaptureRecord.handoff
                      ? language === "ar"
                        ? "تأكيد الإعداد مرة أخرى"
                        : "Confirm setup again"
                      : language === "ar"
                        ? "إكمال الحفظ"
                        : "Finish saving"
                    : captureCopy.savePassport
                }
                loading={
                  saving ||
                  deviceAuth.onboardingHandoffAcknowledgeState ===
                    "acknowledging"
                }
                onPress={() =>
                  void (committedCaptureRecord
                    ? finishCommittedCapture(committedCaptureRecord)
                    : saveAsset())
                }
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      <QuickPlaceSheet
        language={language}
        nameInputRef={inlinePlaceNameRef}
        onClose={closePlaceForm}
        onNameChange={(value) => {
          setPlaceName(value);
          if (value.trim()) setPlaceError(null);
        }}
        onPinChange={setPin}
        onPinConfirm={setPin}
        onRequestCurrentLocation={requestPlaceLocation}
        onSave={() => void savePlace()}
        pin={pin}
        placeError={placeError}
        placeName={placeName}
        reduceMotion={reduceMotion}
        saving={saving}
        visible={step === 1 && showPlaceForm}
      />
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
      <View style={[styles.documentaryFrame, styles.mediaSection]}>
        <View style={[styles.photoHeader, rtl && styles.rowReverse]}>
          <Camera color={colors.text} size={24} weight="regular" />
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
      <Field
        autoCapitalize="words"
        error={nameError}
        label={copy.assetName}
        onChangeText={onNameChange}
        placeholder={copy.assetNamePlaceholder}
        ref={nameInputRef}
        testID="capture-asset-name"
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
            <RuleChoice
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
                <RuleChoice
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
                      <RuleChoice
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
                  <RuleChoice
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
                    <RuleChoice
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

function QuickPlaceSheet({
  language,
  nameInputRef,
  onClose,
  onNameChange,
  onPinChange,
  onPinConfirm,
  onRequestCurrentLocation,
  onSave,
  pin,
  placeError,
  placeName,
  reduceMotion,
  saving,
  visible
}: {
  readonly language: "en" | "ar";
  readonly nameInputRef: RefObject<TextInput | null>;
  readonly onClose: () => void;
  readonly onNameChange: (value: string) => void;
  readonly onPinChange: (value: PlacePinEditorValue | null) => void;
  readonly onPinConfirm: (value: PlacePinEditorValue) => void;
  readonly onRequestCurrentLocation: () => Promise<PlacePinEditorValue | null>;
  readonly onSave: () => void;
  readonly pin: NewPlaceInput["pin"];
  readonly placeError: string | null;
  readonly placeName: string;
  readonly reduceMotion: boolean;
  readonly saving: boolean;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const copy = getCaptureCopy(language);
  const rtl = language === "ar";

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
      onShow={() => nameInputRef.current?.focus()}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.placeSheetBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
          style={styles.placeSheetKeyboard}
        >
          <View
            accessibilityViewIsModal
            style={[
              styles.placeSheet,
              { paddingBottom: Math.max(insets.bottom, spacing.md) }
            ]}
          >
            <View
              style={[
                styles.placeSheetHeader,
                rtl && styles.rowReverse
              ]}
            >
              <View style={styles.inlineFormCopy}>
                <Eyebrow>{copy.newPlace}</Eyebrow>
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.placeSheetTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.addNewPlace}
                </Text>
                <BodyText muted>
                  {copy.quickPlaceBody}
                </BodyText>
              </View>
              <IconButton
                icon={X}
                label={copy.closePlaceForm}
                onPress={onClose}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.placeSheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Field
                autoCapitalize="words"
                error={placeError}
                label={copy.placeName}
                onChangeText={onNameChange}
                placeholder={copy.placeNamePlaceholder}
                ref={nameInputRef}
                returnKeyType="done"
                value={placeName}
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
            </ScrollView>
            <PrimaryButton
              disabled={Boolean(pin && !pin.confirmedAt)}
              icon={Check}
              label={copy.saveAndUsePlace}
              loading={saving}
              onPress={onSave}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
      <View
        style={styles.documentaryFrame}
        testID="capture-evidence-frame"
      >
        {evidence ? (
          <>
            <View style={[styles.fileRow, rtl && styles.rowReverse]}>
              <File color={colors.text} size={25} weight="regular" />
              <View style={styles.fileCopy}>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.fileName,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {evidence.fileName}
                </Text>
                <Text
                  style={[
                    styles.fileMeta,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {fileSize(evidence.byteSize, language)} ·{" "}
                  {copy.readyToAdd}
                </Text>
                <View style={[styles.evidenceState, rtl && styles.rowReverse]}>
                  <View style={styles.evidenceStateSignal} />
                  <Text
                    style={[
                      styles.evidenceStateLabel,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {language === "ar" ? "على الجهاز" : "On device"}
                  </Text>
                </View>
              </View>
            </View>
            <SecondaryButton
              label={copy.removeDocument}
              onPress={onRemove}
            />
          </>
        ) : (
          <Pressable
            accessibilityHint={copy.fileLimit}
            accessibilityLabel={copy.choosePdf}
            accessibilityRole="button"
            onPress={onChoose}
            style={({ pressed }) => [
              styles.evidenceChoose,
              rtl && styles.rowReverse,
              pressed && styles.pressed
            ]}
            testID="capture-evidence-choose"
          >
            <FolderOpen color={colors.text} size={29} weight="regular" />
            <View style={styles.evidenceChooseCopy}>
              <Text
                style={[
                  styles.evidenceChooseTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.choosePdf}
              </Text>
              <Text
                style={[
                  styles.evidenceChooseDetail,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.fileLimit}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
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
  onEditStep,
  onReviewPlacePin,
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
  readonly onEditStep: (step: 0 | 1 | 2) => void;
  readonly onReviewPlacePin: (placeId: string) => void;
  readonly photo: CapturedFile | null;
  readonly physical: boolean;
  readonly place: NativePlace | undefined;
  readonly roomName: string | null;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  const locationPath = place
    ? [place.name, roomName, locatorText]
        .filter(Boolean)
        .join(rtl ? " ‹ " : " › ")
    : null;
  const location = !physical
    ? copy.noPhysicalLocation
    : locationStatus === "unknown"
      ? copy.unknownReminder
      : locationStatus === "needs-detail" && locationPath
        ? `${locationPath} · ${copy.placeNeedsDetail}`
        : locationPath ?? copy.placeNeedsDetail;
  const placePinDebt =
    physical &&
    locationStatus !== "unknown" &&
    Boolean(place) &&
    !hasConfirmedPreciseNativePlacePin(place);
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">{copy.reviewTitle}</ScreenTitle>
        <BodyText muted>
          {copy.reviewBody}
        </BodyText>
      </View>
      <View
        style={styles.documentaryFrame}
        testID="capture-review-frame"
      >
        <Pressable
          accessibilityLabel={`${copy.editIdentity}. ${name}, ${categoryLabel}`}
          accessibilityRole="button"
          onPress={() => onEditStep(0)}
          style={({ pressed }) => [
            styles.reviewHero,
            rtl && styles.rowReverse,
            pressed && styles.pressed
          ]}
        >
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
          <View style={[styles.reviewEditAction, rtl && styles.rowReverse]}>
            <Text
              style={[
                styles.reviewEditText,
                rtl && styles.arabicMedium
              ]}
            >
              {copy.edit}
            </Text>
            <ForwardIcon color={colors.textMuted} size={17} />
          </View>
        </Pressable>
        <ReviewRow
          editLabel={copy.editPhoto}
          label={copy.photo}
          onPress={() => onEditStep(0)}
          value={photo ? photo.fileName : copy.notAdded}
        />
        <ReviewRow
          editLabel={copy.editLocation}
          label={copy.reviewLocation}
          onPress={() => onEditStep(1)}
          value={location}
        />
        {placePinDebt && place ? (
          <View
            style={styles.placePinDebt}
            testID="capture-review-place-pin-debt"
          >
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.placePinDebtMessage}
              testID="capture-review-place-pin-alert"
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
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.placePinDebtTitle}
                </Text>
              </View>
              <Text
                style={[
                  styles.placePinDebtBody,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.placePinDebtBody}
              </Text>
            </View>
            <Pressable
              accessibilityHint={copy.reviewPlacePinHint}
              accessibilityLabel={copy.reviewPlacePin}
              accessibilityRole="button"
              onPress={() => onReviewPlacePin(place.id)}
              style={({ pressed }) => [
                styles.placePinDebtAction,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
              testID="capture-review-place-pin-action"
            >
              <Text
                style={[
                  styles.placePinDebtActionText,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.reviewPlacePin}
              </Text>
              <ForwardIcon color={colors.text} size={18} />
            </Pressable>
          </View>
        ) : null}
        <ReviewRow
          editLabel={copy.editProof}
          label={copy.reviewProof}
          onPress={() => onEditStep(2)}
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

function RuleChoice({
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
        styles.choiceRow,
        compact && styles.choiceRowCompact,
        rtl && styles.rowReverse,
        active && styles.choiceRowActive,
        pressed && styles.pressed
      ]}
    >
      <View
        style={[
          styles.choiceSignal,
          active && styles.choiceSignalActive
        ]}
      />
      <View style={[styles.choiceContent, rtl && styles.rowReverse]}>
        <View style={styles.choiceCheck}>
          {active ? (
            <Check color={colors.volt} size={16} weight="bold" />
          ) : null}
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
  editLabel,
  label,
  onPress,
  value
}: {
  readonly editLabel?: string;
  readonly label: string;
  readonly onPress?: () => void;
  readonly value: string;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getCaptureCopy(language);
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const rowContent = (
    <>
      <View style={styles.reviewRowCopy}>
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
          numberOfLines={2}
          style={[
            styles.reviewRowValue,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {value}
        </Text>
      </View>
      {onPress ? (
        <View style={[styles.reviewEditAction, rtl && styles.rowReverse]}>
          <Text
            style={[
              styles.reviewEditText,
              rtl && styles.arabicMedium
            ]}
          >
            {copy.edit}
          </Text>
          <ForwardIcon color={colors.textMuted} size={17} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={`${editLabel ?? copy.edit}. ${label}: ${value}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.reviewRow,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
      >
        {rowContent}
      </Pressable>
    );
  }

  return (
    <View style={[styles.reviewRow, rtl && styles.rowReverse]}>
      {rowContent}
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
  choiceRow: {
    minWidth: "47%",
    minHeight: 56,
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.transparent
  },
  choiceRowCompact: {
    minWidth: 124,
    minHeight: 52,
    flexBasis: 124
  },
  choiceRowActive: {
    borderBottomColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  choiceSignal: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: colors.transparent
  },
  choiceSignalActive: {
    backgroundColor: colors.volt
  },
  choiceContent: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  choiceCheck: {
    width: 18,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
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
    fontSize: 12,
    lineHeight: 17
  },
  choiceMetaActive: {
    color: colors.concrete
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mediaSection: {
    gap: spacing.md
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
  placeSheetBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: colors.modalScrim
  },
  placeSheetKeyboard: {
    width: "100%",
    maxWidth: 560,
    justifyContent: "flex-end"
  },
  placeSheet: {
    maxHeight: "90%",
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    backgroundColor: colors.canvas
  },
  placeSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  placeSheetTitle: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 24,
    lineHeight: 30
  },
  placeSheetContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm
  },
  formStack: {
    gap: spacing.md
  },
  honestyNote: {
    fontSize: 12,
    lineHeight: 18
  },
  documentaryFrame: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  evidenceChoose: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  evidenceChooseCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3
  },
  evidenceChooseTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  evidenceChooseDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  fileRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs
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
    fontSize: 13,
    lineHeight: 18
  },
  evidenceState: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  evidenceStateSignal: {
    width: 3,
    height: 18,
    backgroundColor: colors.volt
  },
  evidenceStateLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18
  },
  reviewHero: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
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
    minWidth: 0,
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
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  reviewRowCopy: {
    minWidth: 0,
    flex: 1,
    gap: 4
  },
  reviewRowLabel: {
    color: colors.textFaint,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  reviewRowValue: {
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  reviewEditAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0
  },
  reviewEditText: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
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
