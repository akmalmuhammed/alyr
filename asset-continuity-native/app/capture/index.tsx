import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Crosshair,
  File,
  FolderOpen,
  ImageSquare,
  MapPin,
  Plus,
  ShieldCheck,
  Warning,
  X
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  Image,
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
import { readCurrentLocation } from "@/adapters/location";
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
  type NewPlaceInput
} from "@/domain/model";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  gradients,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const steps = ["Identity", "Location", "Material", "Review"] as const;
const DEFAULT_CATEGORY = CATEGORY_CHOICES[0]!;

export default function CaptureScreen() {
  const router = useRouter();
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const {
    workspace,
    saving,
    error,
    clearError,
    createPlace,
    createAsset
  } = useWorkspace();
  const [placeOnly] = useState(intent === "place");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(
    DEFAULT_CATEGORY.id
  );
  const [photo, setPhoto] = useState<CapturedFile | null>(null);
  const [evidence, setEvidence] = useState<CapturedFile | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "known" | "needs-detail" | "unknown"
  >("unknown");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [locatorText, setLocatorText] = useState("");
  const [showPlaceForm, setShowPlaceForm] = useState(placeOnly);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [region, setRegion] = useState("");
  const [roomName, setRoomName] = useState("");
  const [pin, setPin] = useState<NewPlaceInput["pin"]>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const selectedCategory = useMemo(
    () =>
      CATEGORY_CHOICES.find((category) => category.id === categoryId) ??
      DEFAULT_CATEGORY,
    [categoryId]
  );
  const selectedPlace = workspace?.places.find((place) => place.id === placeId);
  const selectedRoom = selectedPlace?.rooms.find((room) => room.id === roomId);
  const physical = selectedCategory.supportsPhysicalLocation;

  if (!workspace) return null;

  const close = () => router.back();

  const selectCategory = (nextId: string) => {
    const nextCategory = CATEGORY_CHOICES.find(
      (category) => category.id === nextId
    );
    setCategoryId(nextId);
    if (!nextCategory?.supportsPhysicalLocation) {
      setLocationStatus("known");
      setPlaceId(null);
      setRoomId(null);
      setLocatorText("");
    } else if (!physical) {
      setLocationStatus("unknown");
    }
  };

  const acceptCapturedFile = (
    file: CapturedFile,
    setter: (value: CapturedFile) => void
  ) => {
    if (file.byteSize > MAX_FILE_BYTES) {
      Alert.alert(
        "File is over 10 MB",
        "The pilot rejects oversized files instead of silently recompressing an imported original."
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
      Alert.alert(
        "Camera permission is off",
        "You can continue without a photo or enable camera access in system settings."
      );
    } else if (outcome.reason === "failed") {
      Alert.alert(
        "Camera did not open",
        "Your draft is preserved. Try the photo library or continue without a photo."
      );
    }
  };

  const choosePhoto = async () => {
    const outcome = await chooseAssetPhoto();
    if (outcome.ok) {
      acceptCapturedFile(outcome.file, setPhoto);
    } else if (outcome.reason === "permission") {
      Alert.alert(
        "Photo access is off",
        "You can continue without a photo or enable selected-photo access in system settings."
      );
    } else if (outcome.reason === "failed") {
      Alert.alert(
        "Photo could not be opened",
        "Your draft is preserved. Try another image."
      );
    }
  };

  const chooseEvidence = async () => {
    const outcome = await chooseEvidenceDocument();
    if (outcome.ok) {
      acceptCapturedFile(outcome.file, setEvidence);
    } else if (outcome.reason === "failed") {
      Alert.alert(
        "Material could not be attached",
        "Your draft is preserved. Try a PDF or image up to 10 MB."
      );
    }
  };

  const locate = async () => {
    setLocating(true);
    const outcome = await readCurrentLocation();
    setLocating(false);
    if (outcome.ok) {
      setPin(outcome.pin);
    } else {
      Alert.alert(
        outcome.reason === "permission"
          ? "Location permission is off"
          : "Current location unavailable",
        "You can save the Place without a pin. A locality label will not be presented as an exact property location."
      );
    }
  };

  const savePlace = async (): Promise<NativePlace | null> => {
    if (!placeName.trim()) {
      setPlaceError("Give this Place a name, such as West Bay Home.");
      return null;
    }
    setPlaceError(null);
    const confirmedPin = pin
      ? {
          ...pin,
          confirmedAt: new Date().toISOString()
        }
      : null;
    const place = await createPlace({
      name: placeName,
      addressSummary: address.trim() || null,
      regionLabel: region.trim() || "Unspecified region",
      roomName: roomName.trim() || null,
      pin: confirmedPin
    });
    setPlaceId(place.id);
    setRoomId(place.rooms[0]?.id ?? null);
    setLocationStatus(place.rooms.length > 0 ? "known" : "needs-detail");
    setShowPlaceForm(false);
    return place;
  };

  const savePlaceOnly = async () => {
    const place = await savePlace();
    if (place) {
      router.replace(`/place/${place.id}`);
    }
  };

  const goNext = () => {
    if (step === 0 && !name.trim()) {
      setNameError("Name the item so you can find it again.");
      return;
    }
    setNameError(null);
    if (
      step === 1 &&
      physical &&
      locationStatus === "known" &&
      (!placeId || (!roomId && !locatorText.trim()))
    ) {
      Alert.alert(
        "Complete the retrieval path",
        "Known means a Place plus a room, container, or useful locator clue. Choose Needs detail or Unknown to save honestly without it."
      );
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const saveAsset = async () => {
    const asset = await createAsset({
      name,
      categoryId: selectedCategory.id,
      categoryLabel: selectedCategory.label,
      photo,
      locationStatus: physical ? locationStatus : "known",
      placeId: physical ? placeId : null,
      roomId: physical ? roomId : null,
      locatorText: physical ? locatorText : null,
      evidence
    });
    router.replace(`/asset/${asset.id}`);
  };

  if (placeOnly) {
    return (
      <AppScreen testID="place-capture-screen">
        <CaptureHeader
          label="New Place"
          onClose={close}
          progress={50}
          stepLabel="Location foundation"
        />
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <PlaceForm
          address={address}
          locating={locating}
          onAddressChange={setAddress}
          onLocate={() => void locate()}
          onNameChange={setPlaceName}
          onRegionChange={setRegion}
          onRoomChange={setRoomName}
          pin={pin}
          placeError={placeError}
          placeName={placeName}
          region={region}
          roomName={roomName}
        />
        <PrimaryButton
          icon={Check}
          label="Save Place"
          loading={saving}
          onPress={() => void savePlaceOnly()}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen testID={`capture-step-${step}`}>
      <CaptureHeader
        label="Quick Passport"
        onClose={close}
        progress={((step + 1) / steps.length) * 100}
        stepLabel={`${step + 1} of ${steps.length} · ${steps[step]}`}
      />
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      {step === 0 ? (
        <IdentityStep
          categoryId={categoryId}
          name={name}
          nameError={nameError}
          onCategoryChange={selectCategory}
          onChoosePhoto={() => void choosePhoto()}
          onNameChange={setName}
          onTakePhoto={() => void takePhoto()}
          photo={photo}
        />
      ) : null}

      {step === 1 ? (
        <LocationStep
          locatorText={locatorText}
          locationStatus={locationStatus}
          onAddPlace={() => setShowPlaceForm(true)}
          onLocatorChange={setLocatorText}
          onPlaceChange={(nextPlace) => {
            setPlaceId(nextPlace.id);
            setRoomId(null);
            setLocationStatus("needs-detail");
          }}
          onRoomChange={(nextRoomId) => {
            setRoomId(nextRoomId);
            setLocationStatus("known");
          }}
          onStatusChange={(status) => {
            setLocationStatus(status);
            if (status === "unknown") {
              setPlaceId(null);
              setRoomId(null);
              setLocatorText("");
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
          <View style={styles.inlineFormHeader}>
            <View style={styles.inlineFormCopy}>
              <Eyebrow tone="cyan">New Place</Eyebrow>
              <Text style={styles.inlineFormTitle}>
                Add the location without leaving your draft
              </Text>
            </View>
            <IconButton
              icon={X}
              label="Close Place form"
              onPress={() => setShowPlaceForm(false)}
            />
          </View>
          <PlaceForm
            address={address}
            locating={locating}
            onAddressChange={setAddress}
            onLocate={() => void locate()}
            onNameChange={setPlaceName}
            onRegionChange={setRegion}
            onRoomChange={setRoomName}
            pin={pin}
            placeError={placeError}
            placeName={placeName}
            region={region}
            roomName={roomName}
          />
          <SecondaryButton
            icon={Plus}
            label="Save and select Place"
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

      {step === 3 ? (
        <ReviewStep
          categoryLabel={selectedCategory.label}
          evidence={evidence}
          locatorText={locatorText}
          locationStatus={physical ? locationStatus : "known"}
          name={name}
          photo={photo}
          place={selectedPlace}
          roomName={selectedRoom?.name ?? null}
        />
      ) : null}

      <View style={styles.footer}>
        {step > 0 ? (
          <SecondaryButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => setStep((current) => Math.max(0, current - 1))}
          />
        ) : null}
        <View style={styles.footerPrimary}>
          {step < steps.length - 1 ? (
            <PrimaryButton
              icon={ArrowRight}
              label={step === 2 && !evidence ? "Continue without material" : "Continue"}
              onPress={goNext}
            />
          ) : (
            <PrimaryButton
              icon={ShieldCheck}
              label="Create Asset Passport"
              loading={saving}
              onPress={() => void saveAsset()}
            />
          )}
        </View>
      </View>
    </AppScreen>
  );
}

function CaptureHeader({
  label,
  onClose,
  progress,
  stepLabel
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly progress: number;
  readonly stepLabel: string;
}) {
  return (
    <View style={styles.captureHeader}>
      <View style={styles.captureTop}>
        <View style={styles.captureTitleWrap}>
          <Eyebrow>{label}</Eyebrow>
          <Text style={styles.captureStep}>{stepLabel}</Text>
        </View>
        <IconButton icon={X} label="Close capture" onPress={onClose} />
      </View>
      <ProgressBar label={stepLabel} percent={progress} />
    </View>
  );
}

function IdentityStep({
  categoryId,
  name,
  nameError,
  onCategoryChange,
  onChoosePhoto,
  onNameChange,
  onTakePhoto,
  photo
}: {
  readonly categoryId: string;
  readonly name: string;
  readonly nameError: string | null;
  readonly onCategoryChange: (id: string) => void;
  readonly onChoosePhoto: () => void;
  readonly onNameChange: (value: string) => void;
  readonly onTakePhoto: () => void;
  readonly photo: CapturedFile | null;
}) {
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">What are you preserving?</ScreenTitle>
        <BodyText muted>
          Start with the minimum identity. Optional facts can improve the
          Passport later.
        </BodyText>
      </View>
      <Field
        autoCapitalize="words"
        error={nameError}
        label="Asset name"
        onChangeText={onNameChange}
        placeholder="e.g. GMT-Master II"
        value={name}
      />
      <View style={styles.optionSection}>
        <Text style={styles.fieldLikeLabel}>Category</Text>
        <View accessibilityRole="radiogroup" style={styles.categoryGrid}>
          {CATEGORY_CHOICES.map((category) => (
            <ChoiceCard
              active={category.id === categoryId}
              key={category.id}
              label={category.label}
              onPress={() => onCategoryChange(category.id)}
            />
          ))}
        </View>
      </View>
      <Surface>
        <View style={styles.photoHeader}>
          <View style={styles.photoIcon}>
            <Camera color={colors.cyan} size={24} weight="duotone" />
          </View>
          <View style={styles.inlineFormCopy}>
            <Text style={styles.inlineFormTitle}>Primary photo</Text>
            <BodyText muted>Useful now, optional for the first save.</BodyText>
          </View>
        </View>
        {photo ? (
          <>
            <Image source={{ uri: photo.localUri }} style={styles.photoPreview} />
            <Text style={styles.fileMeta}>
              {photo.fileName} · {fileSize(photo.byteSize)}
            </Text>
          </>
        ) : null}
        <View style={styles.twoButtons}>
          <View style={styles.buttonFlex}>
            <SecondaryButton
              icon={Camera}
              label="Take photo"
              onPress={onTakePhoto}
            />
          </View>
          <View style={styles.buttonFlex}>
            <SecondaryButton
              icon={ImageSquare}
              label="Choose photo"
              onPress={onChoosePhoto}
            />
          </View>
        </View>
      </Surface>
    </>
  );
}

function LocationStep({
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
  readonly locatorText: string;
  readonly locationStatus: "known" | "needs-detail" | "unknown";
  readonly onAddPlace: () => void;
  readonly onLocatorChange: (value: string) => void;
  readonly onPlaceChange: (place: NativePlace) => void;
  readonly onRoomChange: (roomId: string) => void;
  readonly onStatusChange: (
    status: "known" | "needs-detail" | "unknown"
  ) => void;
  readonly physical: boolean;
  readonly places: readonly NativePlace[];
  readonly roomId: string | null;
  readonly selectedPlace: NativePlace | undefined;
}) {
  if (!physical) {
    return (
      <>
        <View style={styles.stepHeading}>
          <ScreenTitle size="medium">No physical location needed</ScreenTitle>
          <BodyText muted>
            This category stores a continuity reference, never a password or
            seed phrase.
          </BodyText>
        </View>
        <Surface emphasis>
          <ShieldCheck color={colors.volt} size={30} weight="duotone" />
          <Text style={styles.inlineFormTitle}>Virtual record</Text>
          <BodyText muted>
            The Passport will not invent a Place, room, or property pin.
          </BodyText>
        </Surface>
      </>
    );
  }

  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">Where can you retrieve it?</ScreenTitle>
        <BodyText muted>
          Exact, incomplete, and unknown locations are different states. Choose
          the one that is true now.
        </BodyText>
      </View>
      <View accessibilityRole="radiogroup" style={styles.statusChoices}>
        <LocationStatusChoice
          active={locationStatus === "known"}
          description="Place plus a room, container, or useful locator clue."
          label="Known"
          onPress={() => onStatusChange("known")}
        />
        <LocationStatusChoice
          active={locationStatus === "needs-detail"}
          description="You know the Place, but the indoor path is incomplete."
          label="Needs detail"
          onPress={() => onStatusChange("needs-detail")}
        />
        <LocationStatusChoice
          active={locationStatus === "unknown"}
          description="Save honestly and return when the location is remembered."
          label="Unknown"
          onPress={() => onStatusChange("unknown")}
        />
      </View>

      {locationStatus !== "unknown" ? (
        <>
          <View style={styles.optionSection}>
            <View style={styles.labelActionRow}>
              <Text style={styles.fieldLikeLabel}>Place</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onAddPlace}
                style={styles.inlineAction}
              >
                <Plus color={colors.cyan} size={17} />
                <Text style={styles.inlineActionText}>Add Place</Text>
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
              <Surface>
                <MapPin color={colors.warning} size={25} />
                <BodyText muted>
                  No Place exists yet. Add one here, or change the location to
                  Unknown and continue.
                </BodyText>
              </Surface>
            )}
          </View>
          {selectedPlace ? (
            <View style={styles.optionSection}>
              <Text style={styles.fieldLikeLabel}>Room or container</Text>
              {selectedPlace.rooms.length > 0 ? (
                <View accessibilityRole="radiogroup" style={styles.placeChoices}>
                  {selectedPlace.rooms.map((room) => (
                    <ChoiceCard
                      active={room.id === roomId}
                      key={room.id}
                      label={room.name}
                      meta={room.kind}
                      onPress={() => onRoomChange(room.id)}
                    />
                  ))}
                </View>
              ) : (
                <BodyText muted>
                  This Place has no rooms yet. Add a useful locator clue or save
                  as Needs detail.
                </BodyText>
              )}
              <Field
                description="Example: upper drawer, blue case, behind the framed print."
                label="Locator clue"
                onChangeText={onLocatorChange}
                placeholder="Optional retrieval detail"
                value={locatorText}
              />
            </View>
          ) : null}
        </>
      ) : (
        <Surface>
          <Warning color={colors.warning} size={27} weight="duotone" />
          <Text style={styles.inlineFormTitle}>Location will remain visible as a gap</Text>
          <BodyText muted>
            ALYR will not guess the first Place or silently mark this Passport
            complete.
          </BodyText>
        </Surface>
      )}
    </>
  );
}

function PlaceForm({
  address,
  locating,
  onAddressChange,
  onLocate,
  onNameChange,
  onRegionChange,
  onRoomChange,
  pin,
  placeError,
  placeName,
  region,
  roomName
}: {
  readonly address: string;
  readonly locating: boolean;
  readonly onAddressChange: (value: string) => void;
  readonly onLocate: () => void;
  readonly onNameChange: (value: string) => void;
  readonly onRegionChange: (value: string) => void;
  readonly onRoomChange: (value: string) => void;
  readonly pin: NewPlaceInput["pin"];
  readonly placeError: string | null;
  readonly placeName: string;
  readonly region: string;
  readonly roomName: string;
}) {
  return (
    <View style={styles.formStack}>
      <Field
        error={placeError}
        label="Place name"
        onChangeText={onNameChange}
        placeholder="e.g. West Bay Home"
        value={placeName}
      />
      <Field
        description="A readable address for your household. Not sent to analytics."
        label="Address summary"
        onChangeText={onAddressChange}
        placeholder="Street or building, optional"
        value={address}
      />
      <Field
        label="Region"
        onChangeText={onRegionChange}
        placeholder="e.g. Doha"
        value={region}
      />
      <Field
        description="Create the first room now so the next item has a retrieval path."
        label="First room or container"
        onChangeText={onRoomChange}
        placeholder="e.g. Study"
        value={roomName}
      />
      <SecondaryButton
        disabled={locating}
        icon={Crosshair}
        label={locating ? "Measuring location…" : "Use current location"}
        onPress={onLocate}
      />
      {pin ? (
        <View style={styles.pinResult}>
          <MapPin color={colors.cyan} size={20} weight="duotone" />
          <View style={styles.pinResultCopy}>
            <Text style={styles.pinResultTitle}>
              {pin.precision === "exact"
                ? "Accurate GPS reading"
                : "Approximate GPS reading"}
            </Text>
            <Text style={styles.pinResultMeta}>
              {pin.horizontalAccuracyMeters !== null
                ? `Measured ±${Math.round(pin.horizontalAccuracyMeters)} m`
                : "Accuracy unavailable"}{" "}
              · confirm when saving
            </Text>
          </View>
        </View>
      ) : (
        <BodyText muted style={styles.honestyNote}>
          Without GPS or an adjusted pin, the region remains locality-only and
          is never labelled exact.
        </BodyText>
      )}
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
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">Attach one useful material</ScreenTitle>
        <BodyText muted>
          A receipt, certificate, appraisal, or identity paper is optional now.
          New material stays pending until you review it.
        </BodyText>
      </View>
      {evidence ? (
        <Surface emphasis>
          <View style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <File color={colors.cyan} size={26} weight="duotone" />
            </View>
            <View style={styles.fileCopy}>
              <Text numberOfLines={1} style={styles.fileName}>
                {evidence.fileName}
              </Text>
              <Text style={styles.fileMeta}>
                {fileSize(evidence.byteSize)} · pending your review
              </Text>
            </View>
            <StatusPill label="On device" tone="cyan" />
          </View>
          <SecondaryButton label="Remove material" onPress={onRemove} />
        </Surface>
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
            <FolderOpen color={colors.violetSoft} size={32} weight="duotone" />
          </View>
          <Text style={styles.dropTitle}>Choose PDF or image</Text>
          <Text style={styles.dropCopy}>
            Up to 10 MB · original bytes are not silently recompressed
          </Text>
        </Pressable>
      )}
      <Surface>
        <ShieldCheck color={colors.volt} size={26} weight="duotone" />
        <Text style={styles.inlineFormTitle}>What “pending” means</Text>
        <BodyText muted>
          Attaching a file does not authenticate it, prove ownership, confirm
          value, or verify legal title.
        </BodyText>
      </Surface>
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
  place,
  roomName
}: {
  readonly categoryLabel: string;
  readonly evidence: CapturedFile | null;
  readonly locatorText: string;
  readonly locationStatus: "known" | "needs-detail" | "unknown";
  readonly name: string;
  readonly photo: CapturedFile | null;
  readonly place: NativePlace | undefined;
  readonly roomName: string | null;
}) {
  const location =
    locationStatus === "unknown"
      ? "Unknown · visible follow-up"
      : place
        ? [place.name, roomName, locatorText].filter(Boolean).join(" › ")
        : "Needs detail";
  return (
    <>
      <View style={styles.stepHeading}>
        <ScreenTitle size="medium">Review the first Passport</ScreenTitle>
        <BodyText muted>
          Save what is true now. Readiness is derived from the record and can
          improve later.
        </BodyText>
      </View>
      <Surface emphasis>
        <View style={styles.reviewHero}>
          {photo ? (
            <Image source={{ uri: photo.localUri }} style={styles.reviewPhoto} />
          ) : (
            <View style={styles.reviewPhotoEmpty}>
              <ImageSquare color={colors.textMuted} size={29} />
            </View>
          )}
          <View style={styles.reviewCopy}>
            <StatusPill label={categoryLabel} tone="violet" />
            <Text style={styles.reviewName}>{name}</Text>
            <Text style={styles.reviewMeta}>Ready to save on this device</Text>
          </View>
        </View>
        <ReviewRow label="Location" value={location} />
        <ReviewRow
          label="Material"
          value={evidence ? `${evidence.fileName} · pending` : "Not attached"}
        />
        <ReviewRow
          label="Sync"
          value="On-device operation will be queued atomically"
        />
      </Surface>
      <Surface>
        <ShieldCheck color={colors.volt} size={28} weight="duotone" />
        <Text style={styles.inlineFormTitle}>Private by default</Text>
        <BodyText muted>
          The record stays in this household workspace. Creating it does not
          invite anyone or claim a cloud backup.
        </BodyText>
      </Surface>
    </>
  );
}

function ChoiceCard({
  active,
  label,
  meta,
  onPress
}: {
  readonly active: boolean;
  readonly label: string;
  readonly meta?: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        active && styles.choiceCardActive,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.choiceCheck, active && styles.choiceCheckActive]}>
        {active ? <Check color={colors.canvas} size={13} weight="bold" /> : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text
          numberOfLines={1}
          style={[styles.choiceLabel, active && styles.choiceLabelActive]}
        >
          {label}
        </Text>
        {meta ? <Text style={styles.choiceMeta}>{meta}</Text> : null}
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
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusChoice,
        active && styles.statusChoiceActive,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.choiceCopy}>
        <Text style={styles.statusChoiceLabel}>{label}</Text>
        <Text style={styles.statusChoiceCopy}>{description}</Text>
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
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewRowLabel}>{label}</Text>
      <Text style={styles.reviewRowValue}>{value}</Text>
    </View>
  );
}

function fileSize(bytes: number): string {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
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
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
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
  choiceCardActive: {
    borderColor: "rgba(139, 92, 246, 0.56)",
    backgroundColor: colors.violetQuiet
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
    borderColor: colors.cyan,
    backgroundColor: colors.cyan
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
    color: colors.text
  },
  choiceMeta: {
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 11
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  photoIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
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
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  statusChoiceActive: {
    borderColor: "rgba(74, 216, 245, 0.5)",
    backgroundColor: colors.cyanQuiet
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
    borderColor: colors.cyan
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: radius.round,
    backgroundColor: colors.cyan
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
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.xs
  },
  inlineActionText: {
    color: colors.cyan,
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
  pinResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(74, 216, 245, 0.28)",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
  },
  pinResultCopy: {
    flex: 1,
    gap: 3
  },
  pinResultTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13
  },
  pinResultMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  honestyNote: {
    fontSize: 12,
    lineHeight: 18
  },
  dropArea: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(139, 92, 246, 0.48)",
    borderRadius: radius.lg,
    backgroundColor: colors.violetQuiet
  },
  dropIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.round,
    backgroundColor: "rgba(139, 92, 246, 0.16)"
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
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  footerPrimary: {
    flex: 1
  },
  pressed: {
    opacity: 0.72
  }
});
