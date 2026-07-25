import {
  Component,
  createContext,
  cloneElement,
  isValidElement,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  AirplaneTilt,
  Archive,
  ArrowLeft,
  ArrowRight,
  Bicycle,
  Boat,
  BookOpenText,
  Briefcase,
  Buildings,
  Camera,
  CarProfile,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Cube,
  Diamond,
  DownloadSimple,
  FileText,
  FolderLock,
  GearSix,
  GlobeHemisphereWest,
  HardDrives,
  Heart,
  House,
  IdentificationCard,
  Image,
  Images,
  Info,
  Key,
  LinkSimple,
  List,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Motorcycle,
  Note,
  Package,
  Paperclip,
  PencilSimple,
  Plus,
  Question,
  Receipt,
  QrCode,
  Scan,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Trash,
  TreeStructure,
  Truck,
  UploadSimple,
  User,
  UserCircle,
  UserPlus,
  UsersThree,
  Warning,
  Watch,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { RouterProvider } from "react-router/dom";
import {
  LEGACY_STORAGE_KEYS,
  SNAPSHOT_VERSION,
  createSampleWorkspace,
  getAssetLocationPolicy,
  hasConfirmedExactPlaceLocation,
  isReviewableEvidence,
  normalizeWorkspace,
  searchWorkspace,
  selectAssetReadiness,
  selectAssetLocationHistory,
  selectCollectionSummary,
  selectEvidenceRequirementSatisfaction,
  selectNextAction,
  selectPlaceSummary,
  selectPortfolioSummary,
  selectSpacePath,
  selectWorkspaceActorMemberId,
  workspaceReducer,
} from "./domain.js";
import {
  PROPERTY_TENURES,
  isOwnedPropertyTenure,
  isRealEstateAsset,
  propertyAssetForPlace,
  propertyPlaceForAsset,
} from "./propertyLinkage.js";
import {
  ASSET_CATEGORY_GROUPS,
  ASSET_TAXONOMY_VERSION,
  MATERIAL_KINDS as MATERIAL_KIND_OPTIONS,
  MATERIAL_RELATIONS as MATERIAL_RELATION_OPTIONS,
  getAssetCategory,
  getAssetCategoryPath,
  getCategoryProfile,
  getMaterialKind,
  searchAssetCategories,
} from "./taxonomy.js";
import { LocationPicker } from "./LocationPicker.jsx";
import {
  canPreviewFileType,
  copyEvidenceFilesBetweenScopes,
  deleteCaptureDraftFile,
  describeEvidenceOriginal,
  describeLocalFile,
  formatFileSize,
  getCaptureDraftFile,
  getEvidenceFile,
  putCaptureDraftFile,
  purgeFileScope,
  sha256ForBlob,
  validateLocalFile,
  verifyEvidenceFileRecord,
} from "./fileStore.js";
import {
  createEncryptedRecoveryKit,
  decryptEncryptedRecoveryKit,
  parseEncryptedRecoveryKit,
} from "./recoveryKit.js";
import {
  runBackupPreflight,
  runRestorePreflight,
} from "./backupPreflight.js";
import {
  SecureAccountPanel,
  SecureAccountProvider,
  useSecureAccount,
} from "./SecureAccountPanel.jsx";
import {
  LOCAL_DEMO_SCOPE_ID,
  createAccountStorageScopeId,
  readActiveStorageGenerationId,
  storageKeysForScope,
} from "./storageScope.js";
import {
  persistActiveRecoveryWorkspace,
  persistActiveRecoveryWorkspaceWithFiles,
  readRecoveryRollback,
  readRecoveryGenerationState,
  resetRecoveryGenerationScope,
  rollbackRecoveryGeneration,
  stageAndActivateRecoveryGeneration,
} from "./restoreGeneration.js";
import {
  validatePrivateFinancialReference,
} from "./collectorDomain.js";
import { createSafePreviewMetadata } from "./securityVault.js";
import { CollectionCarePanel } from "./CollectionCarePanel.jsx";
import { MemoryPeopleEditor } from "./MemoryPeopleEditor.jsx";
import EvidenceVersionHistory from "./EvidenceVersionHistory.jsx";
import FirstUsefulVaultCard from "./FirstUsefulVaultCard.jsx";
import { selectFirstUsefulVaultProgress } from "./firstUsefulVault.js";
import {
  buildMemoryPeopleCommands,
  memoryCaptureStages,
  memoryPeopleLabel,
  memorySubjectTypeForAsset,
  normalizeMemoryCaptureDraftForm,
  selectMemoryPeopleForAsset,
  validateMemorySubjectDetails,
} from "./memoryContinuity.js";

const WorkspaceContext = createContext(null);
const CAPTURE_DRAFT_FILE_ID = "active-capture-file";
const ContinuityGlobe = lazy(() =>
  import("./Globe.jsx").then((module) => ({ default: module.ContinuityGlobe })),
);
const CaptureStudioDrawer = lazy(() =>
  import("./CaptureStudioDrawer.jsx").then((module) => ({
    default: module.CaptureStudioDrawer,
  })),
);

class GlobeBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onUnavailable?.();
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback || <GlobeLoading />;
    }
    return this.props.children;
  }
}

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/assets", label: "Assets", icon: Cube },
  { to: "/family", label: "Family", icon: UsersThree },
  { to: "/vault", label: "Vault", icon: FolderLock },
];

const CAPTURE_TYPES = new Set([
  "choose",
  "place",
  "space",
  "asset",
  "evidence",
  "collection",
  "studio",
]);

const CATEGORY_ICONS = {
  Property: Buildings,
  Watch,
  Camera,
  Document: FileText,
  Personal: User,
  Collectible: Archive,
  Digital: FolderLock,
};

const CATEGORY_ICON_BY_KEY = {
  vehicle: CarProfile,
  car: CarProfile,
  motorcycle: Motorcycle,
  bicycle: Bicycle,
  boat: Boat,
  aircraft: AirplaneTilt,
  truck: Truck,
  accessibility: User,
  engine: Wrench,
  property: Buildings,
  house: House,
  apartment: Buildings,
  land: MapPin,
  buildings: Buildings,
  farm: Buildings,
  key: Key,
  lifestyle: Watch,
  watch: Watch,
  diamond: Diamond,
  handbag: Archive,
  palette: Sparkle,
  collectible: Archive,
  sport: Archive,
  music: Archive,
  book: BookOpenText,
  camera: Camera,
  personal: User,
  "home-items": House,
  chair: House,
  appliance: House,
  device: HardDrives,
  tools: Wrench,
  kitchen: House,
  decor: Sparkle,
  garden: House,
  box: Archive,
  "digital-asset": FolderLock,
  license: IdentificationCard,
  globe: GlobeHemisphereWest,
  wallet: FolderLock,
  certificate: FileText,
  investment: Sparkle,
  bank: Buildings,
  policy: ShieldCheck,
  company: Briefcase,
  equipment: Wrench,
  inventory: Archive,
  contract: FileText,
  credential: IdentificationCard,
  project: Briefcase,
  briefcase: Briefcase,
  heirloom: Heart,
  photo: Image,
  letter: FileText,
  story: Note,
  "family-tree": TreeStructure,
  identity: IdentificationCard,
  title: FileText,
  insurance: ShieldCheck,
  receipt: Receipt,
  service: Wrench,
  valuation: Sparkle,
  legal: Shield,
  manual: BookOpenText,
  document: FileText,
  custom: Cube,
  other: Cube,
};

const MEMORY_SUBJECT_OPTIONS = [
  {
    value: "physical",
    label: "Physical belonging",
    copy: "An object you can place in a home, room, shelf, box, or safe.",
    icon: Cube,
  },
  {
    value: "story",
    label: "Story only",
    copy: "A story worth preserving even when no object survives.",
    icon: Note,
  },
  {
    value: "person",
    label: "Person",
    copy: "A person-led memory with private relationships and consent.",
    icon: User,
  },
  {
    value: "moment",
    label: "Moment",
    copy: "An event, tradition, milestone, or ordinary day you remember.",
    icon: Clock,
  },
];

const MEMORY_CANONICAL_PROFILE_FIELDS = new Set([
  "origin",
  "date-period",
  "people",
]);

const MEMORY_SUBJECT_FORM_COPY = {
  physical: {
    nameLabel: "Belonging name",
    nameHint: "The name you would search for later",
    namePlaceholder: "e.g. Grandmother's sewing box",
    notesLabel: "Story or notes",
    notesPlaceholder:
      "Its story, provenance, condition, or anything the next person should know",
    peopleHeading: "Who and when should survive with it?",
  },
  story: {
    nameLabel: "Story title",
    nameHint: "A short title you would recognize later",
    namePlaceholder: "e.g. Friday courtyard story",
    notesLabel: "The story",
    notesPlaceholder: "Write the memory in your own words",
    peopleHeading: "Who belongs in this story?",
  },
  person: {
    nameLabel: "Person memory title",
    nameHint: "A private title for this person-led memory",
    namePlaceholder: "e.g. Stories about Grandmother",
    notesLabel: "Story about this person",
    notesPlaceholder:
      "What should be remembered about them, in your own words",
    peopleHeading: "Who is this memory about?",
  },
  moment: {
    nameLabel: "Moment title",
    nameHint: "A short title for the event, tradition, or day",
    namePlaceholder: "e.g. Our first Eid in Doha",
    notesLabel: "What happened",
    notesPlaceholder: "Record the details you do not want to lose",
    peopleHeading: "Who shared this moment?",
  },
};

const QUICK_CAPTURE_OPTIONS = [
  {
    id: "quick-car",
    label: "Car",
    eyebrow: "Vehicle",
    copy: "Cars, SUVs, and road vehicles",
    categoryId: "vehicle.car",
    icon: CarProfile,
  },
  {
    id: "quick-motorbike",
    label: "Motorbike",
    eyebrow: "Vehicle",
    copy: "Motorcycles, scooters, and mopeds",
    categoryId: "vehicle.motorcycle",
    icon: Motorcycle,
  },
  {
    id: "quick-watch",
    label: "Watch",
    eyebrow: "Lifestyle",
    copy: "Watches and meaningful timepieces",
    categoryId: "lifestyle.watch",
    icon: Watch,
  },
  {
    id: "quick-property",
    label: "Real estate",
    eyebrow: "Owned property",
    copy: "House, apartment, plot, or land",
    groupId: "real-estate-land",
    icon: Buildings,
  },
  {
    id: "quick-digital",
    label: "Digital asset",
    eyebrow: "Digital",
    copy: "Accounts, domains, files, and rights",
    categoryId: "digital.asset",
    icon: FolderLock,
  },
  {
    id: "quick-physical",
    label: "Physical item",
    eyebrow: "Home & storage",
    copy: "Furniture, devices, tools, or anything else",
    categoryId: "home.other",
    icon: Package,
  },
];

const ASSET_CATEGORY_COUNT = ASSET_CATEGORY_GROUPS.reduce(
  (total, group) => total + group.categories.length,
  0,
);

const MATERIAL_ICON_BY_KIND = {
  paper: FileText,
  artifact: Package,
  media: Image,
  note: Note,
  link: LinkSimple,
  record: Receipt,
};

const PLACE_KINDS = [
  "Home",
  "Apartment",
  "Property",
  "Plot",
  "Office",
  "Commercial",
  "Farm",
  "Storage",
  "Archive",
];
const PROPERTY_TENURE_COPY = {
  owned: {
    label: "Owned by me or my household",
    shortLabel: "Owned",
  },
  co_owned: {
    label: "Co-owned with someone else",
    shortLabel: "Co-owned",
  },
  rented: {
    label: "Rented",
    shortLabel: "Rented",
  },
  managed: {
    label: "Managed for someone else",
    shortLabel: "Managed",
  },
  family_property: {
    label: "Family property — ownership not recorded",
    shortLabel: "Family property",
  },
  third_party_storage: {
    label: "Third-party storage",
    shortLabel: "Third-party storage",
  },
  unknown: {
    label: "Not sure — add later",
    shortLabel: "Relationship not recorded",
  },
};

function propertyTenureLabel(value, { short = false } = {}) {
  const copy = PROPERTY_TENURE_COPY[value] || PROPERTY_TENURE_COPY.unknown;
  return short ? copy.shortLabel : copy.label;
}

const PROPERTY_PLACE_KIND_BY_CATEGORY = {
  "property.house": "Home",
  "property.apartment": "Apartment",
  "property.land": "Plot",
  "property.commercial": "Commercial",
  "property.farm": "Farm",
  "property.rental-managed": "Property",
  "property.other": "Property",
};
const EVIDENCE_TYPES = [
  "Purchase receipt",
  "Service record",
  "Current photo",
  "Insurance policy",
  "Title deed",
  "Valuation",
];

const CITY_OPTIONS = [
  { id: "doha", name: "Doha", lat: 25.2854, lng: 51.531, countryCode: "QA" },
  { id: "dubai", name: "Dubai", lat: 25.2048, lng: 55.2708, countryCode: "AE" },
  { id: "london", name: "London", lat: 51.5074, lng: -0.1278, countryCode: "GB" },
  { id: "riyadh", name: "Riyadh", lat: 24.7136, lng: 46.6753, countryCode: "SA" },
  { id: "cairo", name: "Cairo", lat: 30.0444, lng: 31.2357, countryCode: "EG" },
  { id: "istanbul", name: "Istanbul", lat: 41.0082, lng: 28.9784, countryCode: "TR" },
  { id: "paris", name: "Paris", lat: 48.8566, lng: 2.3522, countryCode: "FR" },
  { id: "new-york", name: "New York", lat: 40.7128, lng: -74.006, countryCode: "US" },
  { id: "mumbai", name: "Mumbai", lat: 19.076, lng: 72.8777, countryCode: "IN" },
  { id: "singapore", name: "Singapore", lat: 1.3521, lng: 103.8198, countryCode: "SG" },
];

function createId(prefix) {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function createCaptureCommitIdentity() {
  return {
    operationId: createId("capture-operation"),
    committedAt: new Date().toISOString(),
    evidenceId: createId("evidence"),
    placeId: createId("place"),
    spaceId: createId("space"),
    assetId: createId("asset"),
    collectionId: createId("collection"),
    propertyAssetId: createId("asset"),
    propertyLocationAssignmentId: createId("location-assignment"),
    assetLocationAssignmentId: createId("location-assignment"),
    moveLocationAssignmentId: createId("location-assignment"),
  };
}

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function formatMoney(value) {
  if (!value || !Number.isFinite(value.amountMinor)) return "Value not set";
  try {
    return new Intl.NumberFormat("en-QA", {
      style: "currency",
      currency: value.currency || "QAR",
      maximumFractionDigits: 0,
    }).format(value.amountMinor / 100);
  } catch {
    return `${value.currency || "QAR"} ${Math.round(value.amountMinor / 100).toLocaleString()}`;
  }
}

function isPrivateFinancialAsset(asset) {
  return Boolean(
    asset &&
      (asset.kind === "financial" ||
        String(asset.categoryId || "").startsWith("financial.")),
  );
}

function listValueLabel(asset) {
  if (isPrivateFinancialAsset(asset)) {
    return asset.value ? "Private estimate" : "Private";
  }
  return formatMoney(asset.value);
}

function formatDate(value) {
  if (!value) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isSafeReferenceUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function inferMaterialKind(evidenceType) {
  const value = String(evidenceType || "").toLowerCase();
  if (/(photo|image|video|audio|scan)/.test(value)) return "media";
  if (/(story|memory|note|journal|diary)/.test(value)) return "note";
  if (
    /(service|valuation|appraisal|maintenance|inspection|provenance|record)/.test(
      value,
    )
  ) {
    return "record";
  }
  return "paper";
}

function materialStatusLabel(status) {
  if (status === "pending") return "Pending";
  if (status === "verified") return "Reviewed by you";
  if (status === "rejected") return "Needs attention";
  return titleCase(status);
}

function materialStorageStatusLabel(status) {
  return (
    {
      known: "Known",
      needs_detail: "Needs detail",
      unknown: "Unknown",
      not_applicable: "Not applicable",
      external_custodian: "With another person or organization",
    }[status] || "Unknown"
  );
}

function materialStoragePath(storage) {
  return storage?.spacePathSnapshot?.length
    ? storage.spacePathSnapshot.map((item) => item.name).join(" / ")
    : null;
}

function materialStorageDraft(storage) {
  return {
    materialStorageStatus: storage?.status || "unknown",
    materialPlaceId: storage?.placeId || "",
    materialSpaceId: storage?.spaceId || "",
    materialLocatorText: storage?.locatorText || "",
    materialCustodianMemberId: storage?.custodianMemberId || "",
    materialExternalLabel: storage?.externalLabel || "",
    materialStorageReason: "",
  };
}

function readinessPercent(assetOrId, workspace) {
  const readiness = selectAssetReadiness(assetOrId, workspace);
  return typeof readiness === "number" ? readiness : readiness?.percent || 0;
}

function searchAssetRecords(workspace, query, filters = {}) {
  const domainFilters = {
    types: ["asset"],
    includeArchived: filters.includeArchived,
  };
  if (filters.category && filters.category !== "All") {
    domainFilters.category = filters.category;
  }
  if (filters.location && filters.location !== "all") {
    domainFilters.location = filters.location;
  }
  if (filters.placeId) domainFilters.placeId = filters.placeId;
  const byId = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  return searchWorkspace(workspace, query, domainFilters)
    .map((result) => byId.get(result.id))
    .filter(Boolean);
}

function titleCase(value) {
  if (!value) return "";
  return String(value)
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function locationSourceLabel(source) {
  return (
    {
      device_gps: "Device location",
      user_pin: "User-placed pin",
      geocoder: "Address search result",
      manual_coordinates: "User-entered coordinates",
      photo_exif: "Photo location metadata",
      imported: "Imported location",
      not_set: "Not set",
    }[source] || titleCase(source)
  );
}

function placePrecisionSummary(place) {
  if (place?.locationPrecision === "user_placed") {
    return "User-placed pin · accuracy not measured";
  }
  if (place?.locationPrecision === "exact") {
    return place.locationSource === "device_gps" &&
      Number.isFinite(place.horizontalAccuracyMeters)
      ? `Measured GPS point · ±${Math.round(place.horizontalAccuracyMeters)} m`
      : "Previously confirmed pin";
  }
  if (place?.locationPrecision === "approximate") {
    return place.locationSource === "device_gps" &&
      Number.isFinite(place.horizontalAccuracyMeters)
      ? `Approximate device point · ±${Math.round(
          place.horizontalAccuracyMeters,
        )} m`
      : "Approximate Place pin";
  }
  return "City-level location only";
}

function locationHistoryPrecisionLabel(placeSnapshot) {
  if (placeSnapshot?.locationPrecision === "user_placed") {
    return "User-placed pin at assignment · accuracy not measured";
  }
  if (
    placeSnapshot?.locationPrecision === "exact" &&
    placeSnapshot?.locationSource === "device_gps"
  ) {
    return "Measured GPS point at assignment";
  }
  if (placeSnapshot?.locationPrecision === "exact") {
    return "Previously confirmed pin at assignment";
  }
  return `${titleCase(
    placeSnapshot?.locationPrecision || "recorded",
  )} pin at assignment`;
}

function resolveCategory(assetOrRef) {
  if (assetOrRef && typeof assetOrRef === "object") {
    return getAssetCategory(
      assetOrRef.categoryId || assetOrRef.category,
    );
  }
  return getAssetCategory(assetOrRef);
}

function categoryLabel(assetOrRef) {
  const category = resolveCategory(assetOrRef);
  if (assetOrRef && typeof assetOrRef === "object" && assetOrRef.customCategory) {
    return assetOrRef.customCategory;
  }
  return category?.label || assetOrRef?.category || String(assetOrRef || "Other");
}

function categoryPathLabel(assetOrRef) {
  const category = resolveCategory(assetOrRef);
  if (!category) return categoryLabel(assetOrRef);
  const path = getAssetCategoryPath(category.id);
  return path?.label || category.label;
}

function categoryIcon(assetOrRef) {
  const category = resolveCategory(assetOrRef);
  return (
    CATEGORY_ICON_BY_KEY[category?.iconKey] ||
    CATEGORY_ICONS[assetOrRef?.category] ||
    Cube
  );
}

function useDialogFocus(containerRef, onClose, initialFocusRef) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const previousFocus = document.activeElement;
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusInitial = () => {
      const preferred = initialFocusRef?.current;
      const first = container.querySelector(selector);
      (preferred || first || container).focus?.();
    };
    const frame = requestAnimationFrame(focusInitial);

    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...container.querySelectorAll(selector)].filter(
        (element) => !element.hasAttribute("hidden"),
      );
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, [containerRef, initialFocusRef]);
}

function createAccountWorkspace(session, now = new Date().toISOString()) {
  const personal = workspaceReducer(createSampleWorkspace(), {
    type: "START_PERSONAL",
    household: {
      id: session.householdId,
      name: session.householdName || "My household",
    },
    member: {
      id: session.accountId,
      name: session.displayName || "Continuity member",
      email: session.email || null,
    },
    now,
  });
  return normalizeWorkspace({
    ...personal,
    mode: "unstarted",
    household: {
      ...personal.household,
      id: session.householdId,
      name: session.householdName || personal.household.name,
      demoOnly: false,
    },
  });
}

function bindWorkspaceToSession(workspace, session) {
  const normalized = normalizeWorkspace(workspace);
  if (!session?.accountId || !session?.householdId) return normalized;
  return normalizeWorkspace({
    ...normalized,
    privacyNotice:
      "This browser cache is isolated to the signed-in account and household. Selected originals remain on this device; only a deliberate client-encrypted recovery copy is sent to the connected service.",
    household: {
      ...normalized.household,
      id: session.householdId,
      name: session.householdName || normalized.household.name,
      demoOnly: false,
    },
  });
}

function claimWorkspaceForSession(workspace, session, now = new Date().toISOString()) {
  const normalized = normalizeWorkspace(workspace);
  if (!session?.accountId || !session?.householdId) return normalized;
  const priorOwnerId = normalized.household.ownerMemberId;
  const actorAlreadyPresent = normalized.members.some(
    (member) => member.id === session.accountId,
  );
  const replacePriorOwner =
    !actorAlreadyPresent &&
    Boolean(priorOwnerId) &&
    priorOwnerId !== session.accountId;
  const remapMemberId = (memberId) =>
    replacePriorOwner && memberId === priorOwnerId
      ? session.accountId
      : memberId;
  let members = normalized.members.map((member) => {
    const isClaimedOwner =
      member.id === session.accountId ||
      (replacePriorOwner && member.id === priorOwnerId);
    return {
      ...member,
      id: isClaimedOwner ? session.accountId : member.id,
      householdId: session.householdId,
      ...(isClaimedOwner
        ? {
            name: session.displayName || member.name,
            email: session.email || member.email,
            accessRole: "owner",
            accessScope: "all",
            inviteStatus: "active",
            joinedAt: member.joinedAt || now,
            updatedAt: now,
          }
        : {}),
    };
  });
  if (!members.some((member) => member.id === session.accountId)) {
    members = [
      ...members,
      {
        id: session.accountId,
        householdId: session.householdId,
        name: session.displayName || "Account owner",
        email: session.email || null,
        accessRole: "owner",
        accessScope: "all",
        inviteStatus: "active",
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
  const claimed = {
    ...normalized,
    mode: "personal",
    household: {
      ...normalized.household,
      id: session.householdId,
      ownerMemberId: session.accountId,
      demoOnly: false,
    },
    members,
    assets: normalized.assets.map((asset) => ({
      ...asset,
      ownerMemberId: remapMemberId(asset.ownerMemberId),
      custodianMemberId: remapMemberId(asset.custodianMemberId),
      intendedRecipientMemberId: remapMemberId(
        asset.intendedRecipientMemberId,
      ),
    })),
    locationAssignments: normalized.locationAssignments.map((assignment) => ({
      ...assignment,
      createdByMemberId: remapMemberId(assignment.createdByMemberId),
    })),
    evidence: normalized.evidence.map((item) => ({
      ...item,
      verifiedByMemberId: remapMemberId(item.verifiedByMemberId),
      materialStorage: item.materialStorage
        ? {
            ...item.materialStorage,
            custodianMemberId: remapMemberId(
              item.materialStorage.custodianMemberId,
            ),
            movedByMemberId: remapMemberId(
              item.materialStorage.movedByMemberId,
            ),
            history: item.materialStorage.history.map((event) => ({
              ...event,
              custodianMemberId: remapMemberId(
                event.custodianMemberId,
              ),
              movedByMemberId: remapMemberId(
                event.movedByMemberId,
              ),
            })),
          }
        : null,
    })),
    assetLabelRegistry: {
      ...normalized.assetLabelRegistry,
      assignments: normalized.assetLabelRegistry.assignments.map(
        (assignment) => ({
          ...assignment,
          assignedBy: remapMemberId(assignment.assignedBy),
          endedBy: remapMemberId(assignment.endedBy),
        }),
      ),
    },
    activity: normalized.activity.map((item) => ({
      ...item,
      memberId: remapMemberId(item.memberId),
    })),
  };
  return bindWorkspaceToSession(claimed, session);
}

function hasClaimableRecords(workspace) {
  return Boolean(
    workspace?.mode === "personal" &&
      [
        workspace.assets,
        workspace.places,
        workspace.spaces,
        workspace.evidence,
        workspace.collections,
        workspace.tasks,
        workspace.activity,
      ].some((records) => Array.isArray(records) && records.length),
  );
}

function isPristineUnstartedWorkspace(workspace) {
  return Boolean(
    workspace?.mode === "unstarted" &&
      [
        workspace.assets,
        workspace.places,
        workspace.spaces,
        workspace.evidence,
        workspace.collections,
        workspace.tasks,
        workspace.activity,
      ].every((records) => !Array.isArray(records) || records.length === 0),
  );
}

function readLocalClaimCandidate() {
  const localKeys = storageKeysForScope(LOCAL_DEMO_SCOPE_ID);
  let activeWorkspaceKey = localKeys.workspace;
  try {
    activeWorkspaceKey = localKeys.workspaceForGeneration(
      readActiveStorageGenerationId(LOCAL_DEMO_SCOPE_ID),
    );
  } catch {
    // The local scope recovery banner handles malformed cache metadata.
  }
  for (const key of [
    activeWorkspaceKey,
    ...(activeWorkspaceKey === localKeys.workspace
      ? []
      : [localKeys.workspace]),
    ...LEGACY_STORAGE_KEYS,
  ]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const workspace = normalizeWorkspace(JSON.parse(raw));
      if (hasClaimableRecords(workspace)) return workspace;
    } catch {
      // Corrupt local data is handled by the local scope's recovery banner.
    }
  }
  return null;
}

function preserveUnreadableWorkspace(raw, storageKeys) {
  try {
    window.localStorage.setItem(storageKeys.recovery, raw);
    window.localStorage.removeItem(storageKeys.recoveryWarningDismissed);
  } catch {
    // The explicit browser-storage message remains available in Settings.
  }
}

function activeWorkspaceStorageKey(storageScopeId, storageKeys) {
  try {
    return storageKeys.workspaceForGeneration(
      readActiveStorageGenerationId(storageScopeId),
    );
  } catch {
    return storageKeys.workspace;
  }
}

function loadWorkspace({ storageScopeId, storageKeys, session }) {
  const isLocalScope = storageScopeId === LOCAL_DEMO_SCOPE_ID;
  let activeGenerationId = null;
  let rollback = null;
  try {
    activeGenerationId =
      readActiveStorageGenerationId(storageScopeId);
    rollback = readRecoveryRollback(storageScopeId);
  } catch {
    // Malformed generation metadata is handled as an unreadable workspace.
  }
  const activeWorkspaceKey = storageKeys.workspaceForGeneration(
    activeGenerationId,
  );
  const rollbackWorkspaceKey =
    activeGenerationId &&
    rollback?.activatedGenerationId === activeGenerationId
      ? rollback.previousWorkspaceKey
      : null;
  const candidateKeys = [
    activeWorkspaceKey,
    ...(rollbackWorkspaceKey &&
    rollbackWorkspaceKey !== activeWorkspaceKey
      ? [rollbackWorkspaceKey]
      : []),
    ...(!activeGenerationId && isLocalScope ? LEGACY_STORAGE_KEYS : []),
  ];
  let foundStoredWorkspace = false;
  for (const key of candidateKeys) {
    let raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      break;
    }
    if (!raw) continue;
    foundStoredWorkspace = true;
    try {
      const parsed = JSON.parse(raw);
      const incomingVersion = Number(
        parsed?.version ?? parsed?.schemaVersion,
      );
      if (
        !parsed ||
        typeof parsed !== "object" ||
        (Number.isFinite(incomingVersion) &&
          incomingVersion > SNAPSHOT_VERSION)
      ) {
        preserveUnreadableWorkspace(raw, storageKeys);
        continue;
      }
      const normalized = normalizeWorkspace(parsed);
      if (
        session?.householdId &&
        normalized.household.id !== session.householdId
      ) {
        preserveUnreadableWorkspace(raw, storageKeys);
        continue;
      }
      const recoveredPreviousGeneration =
        Boolean(rollbackWorkspaceKey) && key === rollbackWorkspaceKey;
      if (recoveredPreviousGeneration) {
        try {
          if (rollback.previousGenerationId) {
            window.localStorage.setItem(
              storageKeys.activeGeneration,
              rollback.previousGenerationId,
            );
          } else {
            window.localStorage.removeItem(
              storageKeys.activeGeneration,
            );
          }
          window.localStorage.removeItem(storageKeys.restoreRollback);
        } catch {
          preserveUnreadableWorkspace(raw, storageKeys);
          continue;
        }
      }
      return {
        workspace: session
          ? bindWorkspaceToSession(normalized, session)
          : normalized,
        localClaimCandidate:
          session && isPristineUnstartedWorkspace(normalized)
            ? readLocalClaimCandidate()
            : null,
        generationRecoveryMessage: recoveredPreviousGeneration
          ? "An interrupted restore was rolled back to the previous verified workspace."
          : "",
      };
    } catch {
      preserveUnreadableWorkspace(raw, storageKeys);
    }
  }
  return {
    workspace: session
      ? createAccountWorkspace(session)
      : { ...createSampleWorkspace(), mode: "unstarted" },
    localClaimCandidate:
      session && !foundStoredWorkspace ? readLocalClaimCandidate() : null,
    generationRecoveryMessage: "",
  };
}

function scopedWorkspaceReducer(state, action, session) {
  if (
    session?.householdId &&
    action?.type === "REPLACE_WORKSPACE" &&
    !action.allowHouseholdClaim
  ) {
    const incoming = normalizeWorkspace(action.workspace);
    if (incoming.household.id !== session.householdId) return state;
  }
  const preparedAction =
    session?.householdId && action?.type === "START_PERSONAL"
      ? {
          ...action,
          household: {
            ...action.household,
            id: session.householdId,
            name:
              session.householdName ||
              action.household?.name ||
              "My household",
          },
          member: {
            ...action.member,
            id: session.accountId,
            name:
              session.displayName ||
              action.member?.name ||
              "Continuity member",
            email: session.email || action.member?.email || null,
          },
        }
      : action;
  const next = workspaceReducer(state, preparedAction);
  return session ? bindWorkspaceToSession(next, session) : next;
}

function WorkspaceProvider({
  children,
  storageScopeId = LOCAL_DEMO_SCOPE_ID,
  session = null,
}) {
  const storageKeys = useMemo(
    () => storageKeysForScope(storageScopeId),
    [storageScopeId],
  );
  const initialLoad = useMemo(
    () => loadWorkspace({ storageScopeId, storageKeys, session }),
    [storageScopeId, storageKeys, session],
  );
  const reducer = useCallback(
    (state, action) => scopedWorkspaceReducer(state, action, session),
    [session],
  );
  const [workspace, rawDispatch] = useReducer(
    reducer,
    initialLoad.workspace,
  );
  const [localClaimCandidate, setLocalClaimCandidate] = useState(
    initialLoad.localClaimCandidate,
  );
  const [announcement, setAnnouncement] = useState(
    initialLoad.generationRecoveryMessage || "",
  );
  const [storageStatus, setStorageStatus] = useState("checking");
  const [recoveryHeadRevision, setRecoveryHeadRevision] = useState(null);
  const [recoveryAuthorityReady, setRecoveryAuthorityReady] = useState(false);
  const recoveryRevisionRef = useRef(null);
  const persistedWorkspaceRawRef = useRef(null);
  const workspaceRef = useRef(workspace);
  const persistenceQueueRef = useRef(Promise.resolve());
  const recoveryAuthorityEpochRef = useRef(0);
  workspaceRef.current = workspace;
  const [recoveryRaw, setRecoveryRaw] = useState(() => {
    try {
      if (
        window.localStorage.getItem(storageKeys.recoveryWarningDismissed) ===
        "1"
      ) {
        return null;
      }
      return window.localStorage.getItem(storageKeys.recovery);
    } catch {
      return null;
    }
  });
  const dispatch = useMemo(
    () => (action) =>
      rawDispatch({
        ...action,
        now: action?.now ?? new Date().toISOString(),
      }),
    [],
  );
  const adoptRecoveryHead = useCallback((result, nextWorkspace) => {
    if (!Number.isSafeInteger(Number(result?.revision))) return;
    const revision = Number(result.revision);
    recoveryRevisionRef.current = revision;
    setRecoveryHeadRevision(revision);
    persistedWorkspaceRawRef.current = nextWorkspace
      ? JSON.stringify(nextWorkspace)
      : null;
  }, []);
  const commitWorkspaceActions = useCallback(
    async ({
      actions,
      operationId,
      now = new Date().toISOString(),
    } = {}) => {
      if (!recoveryAuthorityReady) {
        throw new Error(
          "Durable browser storage is still opening. Wait a moment and try again.",
        );
      }
      if (!Array.isArray(actions) || !actions.length) {
        throw new Error("Choose a valid workspace change to save.");
      }
      if (!String(operationId || "").trim()) {
        throw new Error(
          "This capture is missing its stable save identity. Close it and try again.",
        );
      }
      const authorityEpoch = recoveryAuthorityEpochRef.current;
      const baseWorkspace = workspaceRef.current;
      const baseWorkspaceRaw = JSON.stringify(baseWorkspace);
      const nextWorkspace = actions.reduce(
        (state, action) =>
          scopedWorkspaceReducer(
            state,
            {
              ...action,
              now: action?.now ?? now,
            },
            session,
          ),
        baseWorkspace,
      );
      const nextWorkspaceRaw = JSON.stringify(nextWorkspace);
      if (nextWorkspaceRaw === baseWorkspaceRaw) {
        throw new Error(
          "The capture did not produce a valid workspace change.",
        );
      }
      const expectedRevision = recoveryRevisionRef.current;
      if (!Number.isSafeInteger(Number(expectedRevision))) {
        throw new Error(
          "The active browser generation is not ready for a durable capture.",
        );
      }

      const operation = persistenceQueueRef.current.then(async () => {
        if (
          authorityEpoch !== recoveryAuthorityEpochRef.current ||
          JSON.stringify(workspaceRef.current) !== baseWorkspaceRaw
        ) {
          const error = new Error(
            "The workspace changed before this capture could be committed. Review the latest record and try again.",
          );
          error.code = "CAPTURE_WORKSPACE_STALE";
          throw error;
        }

        let result;
        try {
          result = await persistActiveRecoveryWorkspaceWithFiles({
            scopeId: storageScopeId,
            operationId,
            workspace: nextWorkspace,
            files: [],
            expectedRevision,
            now,
          });
        } catch (saveError) {
          let authoritative = null;
          try {
            authoritative =
              await readRecoveryGenerationState(storageScopeId);
          } catch {
            // Preserve the original durable-save failure below.
          }
          if (
            !authoritative ||
            authorityEpoch !== recoveryAuthorityEpochRef.current
          ) {
            throw saveError;
          }
          const authoritativeWorkspace = session
            ? bindWorkspaceToSession(
                normalizeWorkspace(authoritative.workspace),
                session,
              )
            : normalizeWorkspace(authoritative.workspace);
          const authoritativeRaw = JSON.stringify(
            authoritativeWorkspace,
          );
          if (authoritativeRaw === nextWorkspaceRaw) {
            result = {
              ...authoritative,
              workspace: authoritativeWorkspace,
              recoveredReceipt: true,
            };
          } else if (
            authoritativeRaw === baseWorkspaceRaw &&
            ![
              "CAPTURE_COMMIT_STALE",
              "RECOVERY_HEAD_STALE",
            ].includes(saveError?.code)
          ) {
            setStorageStatus("error");
            throw saveError;
          } else {
            recoveryRevisionRef.current = authoritative.revision;
            persistedWorkspaceRawRef.current = authoritativeRaw;
            workspaceRef.current = authoritativeWorkspace;
            setRecoveryHeadRevision(authoritative.revision);
            setStorageStatus("saved");
            rawDispatch({
              type: "REPLACE_WORKSPACE",
              workspace: authoritativeWorkspace,
              now,
            });
            const staleError = new Error(
              "A newer workspace became active before this capture was saved. Your draft is still available—review it and try again.",
            );
            staleError.code = "CAPTURE_WORKSPACE_STALE";
            staleError.cause = saveError;
            throw staleError;
          }
        }

        if (authorityEpoch !== recoveryAuthorityEpochRef.current) {
          const error = new Error(
            "The active account changed while this capture was saving.",
          );
          error.code = "CAPTURE_SCOPE_CHANGED";
          throw error;
        }
        const committed = session
          ? bindWorkspaceToSession(
              normalizeWorkspace(result.workspace),
              session,
            )
          : normalizeWorkspace(result.workspace);
        const committedRaw = JSON.stringify(committed);
        recoveryRevisionRef.current = result.revision;
        persistedWorkspaceRawRef.current = committedRaw;
        workspaceRef.current = committed;
        setRecoveryHeadRevision(result.revision);
        setStorageStatus("saved");
        rawDispatch({
          type: "REPLACE_WORKSPACE",
          workspace: committed,
          now,
        });
        return Object.freeze({
          ...result,
          workspace: committed,
        });
      });
      persistenceQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [
      recoveryAuthorityReady,
      session,
      storageScopeId,
    ],
  );
  const commitWorkspaceActionsWithFiles = useCallback(
    async ({
      actions,
      files,
      operationId,
      now = new Date().toISOString(),
    } = {}) => {
      if (!recoveryAuthorityReady) {
        throw new Error(
          "Durable browser storage is still opening. Wait a moment and try again.",
        );
      }
      if (!Array.isArray(actions) || !actions.length) {
        throw new Error("Choose a valid workspace change to save.");
      }
      if (!Array.isArray(files) || !files.length) {
        throw new Error(
          "Choose the local original that belongs to this capture.",
        );
      }
      const authorityEpoch = recoveryAuthorityEpochRef.current;
      const baseWorkspace = workspaceRef.current;
      const baseWorkspaceRaw = JSON.stringify(baseWorkspace);
      const nextWorkspace = actions.reduce(
        (state, action) =>
          scopedWorkspaceReducer(
            state,
            {
              ...action,
              now: action?.now ?? now,
            },
            session,
          ),
        baseWorkspace,
      );
      const nextWorkspaceRaw = JSON.stringify(nextWorkspace);
      if (nextWorkspaceRaw === baseWorkspaceRaw) {
        throw new Error(
          "The capture did not produce a valid workspace change.",
        );
      }
      const expectedRevision = recoveryRevisionRef.current;
      if (!Number.isSafeInteger(Number(expectedRevision))) {
        throw new Error(
          "The active browser generation is not ready for a durable capture.",
        );
      }

      const operation = persistenceQueueRef.current.then(async () => {
        if (
          authorityEpoch !== recoveryAuthorityEpochRef.current ||
          JSON.stringify(workspaceRef.current) !== baseWorkspaceRaw
        ) {
          const error = new Error(
            "The workspace changed before this capture could be committed. Review the latest record and try again.",
          );
          error.code = "CAPTURE_WORKSPACE_STALE";
          throw error;
        }
        const result =
          await persistActiveRecoveryWorkspaceWithFiles({
            scopeId: storageScopeId,
            operationId,
            workspace: nextWorkspace,
            files,
            expectedRevision,
            now,
          });
        if (authorityEpoch !== recoveryAuthorityEpochRef.current) {
          const error = new Error(
            "The active account changed while this capture was saving.",
          );
          error.code = "CAPTURE_SCOPE_CHANGED";
          throw error;
        }
        const committed = session
          ? bindWorkspaceToSession(
              normalizeWorkspace(result.workspace),
              session,
            )
          : normalizeWorkspace(result.workspace);
        const committedRaw = JSON.stringify(committed);
        recoveryRevisionRef.current = result.revision;
        persistedWorkspaceRawRef.current = committedRaw;
        workspaceRef.current = committed;
        setRecoveryHeadRevision(result.revision);
        setStorageStatus("saved");
        rawDispatch({
          type: "REPLACE_WORKSPACE",
          workspace: committed,
          now,
        });
        return Object.freeze({
          ...result,
          workspace: committed,
        });
      });
      persistenceQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [
      recoveryAuthorityReady,
      session,
      storageScopeId,
    ],
  );

  useEffect(() => {
    let disposed = false;
    recoveryAuthorityEpochRef.current += 1;
    recoveryRevisionRef.current = null;
    persistedWorkspaceRawRef.current = null;
    persistenceQueueRef.current = Promise.resolve();
    setRecoveryHeadRevision(null);
    setRecoveryAuthorityReady(false);

    const hydrateAuthoritativeWorkspace = async () => {
      try {
        const authoritative = await readRecoveryGenerationState(
          storageScopeId,
        );
        if (disposed) return;
        if (authoritative) {
          const incomingVersion = Number(
            authoritative.workspace?.version ??
              authoritative.workspace?.schemaVersion,
          );
          if (
            Number.isFinite(incomingVersion) &&
            incomingVersion > SNAPSHOT_VERSION
          ) {
            throw new Error(
              "The durable workspace uses a newer version of Continuity.",
            );
          }
          const normalized = normalizeWorkspace(
            authoritative.workspace,
          );
          if (
            session?.householdId &&
            normalized.household.id !== session.householdId
          ) {
            throw new Error(
              "The durable workspace belongs to a different household.",
            );
          }
          const bound = session
            ? bindWorkspaceToSession(normalized, session)
            : normalized;
          const authoritativeRaw = JSON.stringify(bound);
          recoveryRevisionRef.current = authoritative.revision;
          persistedWorkspaceRawRef.current = authoritativeRaw;
          setRecoveryHeadRevision(authoritative.revision);
          if (
            JSON.stringify(workspaceRef.current) !==
            authoritativeRaw
          ) {
            dispatch({
              type: "REPLACE_WORKSPACE",
              workspace: bound,
            });
          }
        } else {
          const initialized = await persistActiveRecoveryWorkspace({
            scopeId: storageScopeId,
            workspace: workspaceRef.current,
            expectedRevision: 0,
          });
          if (disposed) return;
          recoveryRevisionRef.current = initialized.revision;
          persistedWorkspaceRawRef.current = JSON.stringify(
            initialized.workspace,
          );
          setRecoveryHeadRevision(initialized.revision);
        }
        if (!disposed) setRecoveryAuthorityReady(true);
      } catch (error) {
        if (disposed) return;
        setStorageStatus("error");
        setAnnouncement(
          error?.message ||
            "Durable recovery storage is unavailable in this browser.",
        );
      }
    };

    hydrateAuthoritativeWorkspace();
    return () => {
      disposed = true;
    };
  }, [
    dispatch,
    session,
    storageScopeId,
  ]);

  useEffect(() => {
    if (!recoveryAuthorityReady) return undefined;
    const workspaceRaw = JSON.stringify(workspace);
    if (persistedWorkspaceRawRef.current === workspaceRaw) {
      return undefined;
    }
    const authorityEpoch = recoveryAuthorityEpochRef.current;
    persistenceQueueRef.current = persistenceQueueRef.current.then(
      async () => {
        if (authorityEpoch !== recoveryAuthorityEpochRef.current) return;
        try {
          const saved = await persistActiveRecoveryWorkspace({
            scopeId: storageScopeId,
            workspace,
            expectedRevision: recoveryRevisionRef.current,
          });
          if (authorityEpoch !== recoveryAuthorityEpochRef.current) return;
          recoveryRevisionRef.current = saved.revision;
          persistedWorkspaceRawRef.current = workspaceRaw;
          setRecoveryHeadRevision(saved.revision);
          setStorageStatus("saved");
        } catch (error) {
          if (authorityEpoch !== recoveryAuthorityEpochRef.current) return;
          if (error?.code === "RECOVERY_HEAD_STALE") {
            try {
              const authoritative =
                await readRecoveryGenerationState(storageScopeId);
              if (
                !authoritative ||
                authorityEpoch !== recoveryAuthorityEpochRef.current
              ) {
                return;
              }
              const normalized = normalizeWorkspace(
                authoritative.workspace,
              );
              const bound = session
                ? bindWorkspaceToSession(normalized, session)
                : normalized;
              recoveryRevisionRef.current =
                authoritative.revision;
              persistedWorkspaceRawRef.current =
                JSON.stringify(bound);
              setRecoveryHeadRevision(authoritative.revision);
              if (
                JSON.stringify(workspaceRef.current) !==
                persistedWorkspaceRawRef.current
              ) {
                dispatch({
                  type: "REPLACE_WORKSPACE",
                  workspace: bound,
                });
                setAnnouncement(
                  "A newer workspace from another tab is now active.",
                );
              }
              setStorageStatus("saved");
              return;
            } catch {
              // Fall through to the durable-storage error below.
            }
          }
          setStorageStatus("error");
          setAnnouncement(
            error?.message ||
              "This browser could not save the durable workspace generation.",
          );
        }
      },
    );
    return undefined;
  }, [
    dispatch,
    recoveryAuthorityReady,
    session,
    storageScopeId,
    workspace,
  ]);
  const claimLocalWorkspace = useCallback(async () => {
    if (
      !session?.householdId ||
      !localClaimCandidate ||
      storageScopeId === LOCAL_DEMO_SCOPE_ID
    ) {
      throw new Error(
        "Sign in to an empty account workspace before moving local records.",
      );
    }

    const localKeys = storageKeysForScope(LOCAL_DEMO_SCOPE_ID);
    const claimedWorkspace = claimWorkspaceForSession(
      localClaimCandidate,
      session,
    );
    const mayHaveOriginals = localClaimCandidate.evidence.some(
      (evidence) => evidence.fileName,
    );
    let targetCommitted = false;
    try {
      if (mayHaveOriginals) {
        await copyEvidenceFilesBetweenScopes({
          fromScopeId: LOCAL_DEMO_SCOPE_ID,
          toScopeId: storageScopeId,
        });
      }
      let committedTarget;
      try {
        committedTarget = await persistActiveRecoveryWorkspace({
          scopeId: storageScopeId,
          workspace: claimedWorkspace,
          expectedRevision: recoveryRevisionRef.current,
        });
      } catch (saveError) {
        const authoritative =
          await readRecoveryGenerationState(storageScopeId).catch(
            () => null,
          );
        if (
          !authoritative ||
          JSON.stringify(
            session
              ? bindWorkspaceToSession(
                  normalizeWorkspace(authoritative.workspace),
                  session,
                )
              : normalizeWorkspace(authoritative.workspace),
          ) !== JSON.stringify(claimedWorkspace)
        ) {
          throw saveError;
        }
        committedTarget = authoritative;
      }
      const verifiedTarget = session
        ? bindWorkspaceToSession(
            normalizeWorkspace(committedTarget.workspace),
            session,
          )
        : normalizeWorkspace(committedTarget.workspace);
      if (
        verifiedTarget.household.id !== session.householdId ||
        verifiedTarget.meta.id !== claimedWorkspace.meta.id
      ) {
        throw new Error(
          "The account workspace could not be verified after saving.",
        );
      }
      targetCommitted = true;
      adoptRecoveryHead(committedTarget, verifiedTarget);
      window.localStorage.setItem(
        storageKeys.workspace,
        JSON.stringify(verifiedTarget),
      );

      let localFilesRemoved = true;
      try {
        await resetRecoveryGenerationScope({
          scopeId: LOCAL_DEMO_SCOPE_ID,
        });
        for (const key of [
          localKeys.workspace,
          localKeys.captureDraft,
          ...LEGACY_STORAGE_KEYS,
        ]) {
          window.localStorage.removeItem(key);
        }
        if (window.localStorage.getItem(localKeys.workspace)) {
          throw new Error(
            "The local workspace could not be removed after the verified copy.",
          );
        }
      } catch {
        localFilesRemoved = false;
      }
      dispatch({
        type: "REPLACE_WORKSPACE",
        workspace: verifiedTarget,
        allowHouseholdClaim: true,
      });
      setLocalClaimCandidate(null);
      setAnnouncement(
        localFilesRemoved
          ? `Local records moved into ${session.householdName || "the signed-in household"}.`
          : "Local records moved into the signed-in household. Some orphaned temporary files could not be removed from this browser.",
      );
      return {
        workspace: verifiedTarget,
        localFilesRemoved,
      };
    } catch (error) {
      if (!targetCommitted && mayHaveOriginals) {
        try {
          window.localStorage.removeItem(storageKeys.workspace);
          await purgeFileScope(storageScopeId);
        } catch {
          // The original local workspace remains the authoritative recovery source.
        }
      }
      throw error;
    }
  }, [
    dispatch,
    adoptRecoveryHead,
    localClaimCandidate,
    session,
    storageKeys.workspace,
    storageScopeId,
  ]);

  useEffect(() => {
    if (session && isPristineUnstartedWorkspace(workspace)) {
      setStorageStatus("saved");
      return;
    }
    try {
      const workspaceKey = activeWorkspaceStorageKey(
        storageScopeId,
        storageKeys,
      );
      window.localStorage.setItem(
        workspaceKey,
        JSON.stringify(workspace),
      );
      setStorageStatus("saved");
    } catch {
      setStorageStatus("error");
      setAnnouncement("This browser could not save the current workspace.");
    }
  }, [session, storageKeys, storageScopeId, workspace]);

  useEffect(() => {
    const handleStorage = (event) => {
      const activeWorkspaceKey = activeWorkspaceStorageKey(
        storageScopeId,
        storageKeys,
      );
      if (
        event.key !== activeWorkspaceKey &&
        event.key !== storageKeys.activeGeneration
      ) {
        return;
      }
      void (async () => {
        try {
          const authoritative =
            await readRecoveryGenerationState(storageScopeId);
          if (authoritative) {
            const incoming = normalizeWorkspace(
              authoritative.workspace,
            );
            if (
              session?.householdId &&
              incoming.household.id !== session.householdId
            ) {
              setAnnouncement(
                "Another tab saved data for a different household. It was not opened.",
              );
              return;
            }
            const bound = session
              ? bindWorkspaceToSession(incoming, session)
              : incoming;
            recoveryRevisionRef.current =
              authoritative.revision;
            persistedWorkspaceRawRef.current =
              JSON.stringify(bound);
            setRecoveryHeadRevision(authoritative.revision);
            if (
              JSON.stringify(workspaceRef.current) !==
              persistedWorkspaceRawRef.current
            ) {
              dispatch({
                type: "REPLACE_WORKSPACE",
                workspace: bound,
              });
            }
            setAnnouncement(
              "Workspace refreshed from another tab.",
            );
            return;
          }
        } catch {
          // Fall back to the compatibility cache when IndexedDB is unavailable.
        }
        try {
          const incomingLoad = loadWorkspace({
            storageScopeId,
            storageKeys,
            session,
          });
          dispatch({
            type: "REPLACE_WORKSPACE",
            workspace: incomingLoad.workspace,
          });
          setAnnouncement(
            incomingLoad.generationRecoveryMessage ||
              "Workspace refreshed from another tab.",
          );
        } catch {
          setAnnouncement(
            "Another tab saved data that could not be read.",
          );
        }
      })();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [dispatch, session, storageKeys, storageScopeId]);

  function downloadRecovery() {
    if (!recoveryRaw) return;
    const blob = new Blob([recoveryRaw], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `continuity-recovery-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setAnnouncement("Preserved recovery copy downloaded.");
  }

  const value = useMemo(
    () => ({
      workspace,
      dispatch,
      announcement,
      setAnnouncement,
      storageStatus,
      storageScopeId,
      storageKeys,
      recoveryHeadRevision,
      recoveryAuthorityReady,
      adoptRecoveryHead,
      commitWorkspaceActions,
      commitWorkspaceActionsWithFiles,
      session,
      localClaimCandidate,
      clearLocalClaimCandidate: () => setLocalClaimCandidate(null),
      claimLocalWorkspace,
    }),
    [
      workspace,
      announcement,
      storageStatus,
      storageScopeId,
      storageKeys,
      recoveryHeadRevision,
      recoveryAuthorityReady,
      adoptRecoveryHead,
      commitWorkspaceActions,
      commitWorkspaceActionsWithFiles,
      session,
      localClaimCandidate,
      claimLocalWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {storageStatus === "error" && (
        <div className="storage-error-banner" role="alert">
          <Warning weight="bold" />
          <span>
            <strong>Browser save failed</strong>
            <small>
              Changes remain only in this tab. Keep it open and use Vault → Export
              demo JSON before leaving.
            </small>
          </span>
        </div>
      )}
      {recoveryRaw && (
        <div className="recovery-warning-banner" role="alert">
          <Warning weight="bold" />
          <span>
            <strong>A saved demo could not be opened</strong>
            <small>
              The original browser snapshot is preserved. Download it before
              starting over.
            </small>
          </span>
          <button onClick={downloadRecovery}>
            <DownloadSimple weight="bold" /> Download recovery copy
          </button>
          <IconButton
            label="Dismiss recovery warning"
            onClick={() => {
              try {
                window.localStorage.setItem(
                  storageKeys.recoveryWarningDismissed,
                  "1",
                );
              } catch {
                // Dismissal still applies for this render.
              }
              setRecoveryRaw(null);
            }}
          >
            <X />
          </IconButton>
        </div>
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </WorkspaceContext.Provider>
  );
}

function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is missing");
  return context;
}

function Brand({ compact = false }) {
  return (
    <Link to="/home" className={cx("brand", compact && "is-compact")} aria-label="Continuity home">
      <span className="brand-mark">
        <Shield weight="duotone" />
        <span className="brand-pulse" />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>Continuity</strong>
          <small>Everything you own</small>
        </span>
      )}
    </Link>
  );
}

function IconButton({ label, children, className, ...props }) {
  return (
    <button className={cx("icon-button", className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function ProgressRing({ value, size = 44 }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <span
      className="progress-ring"
      style={{
        "--progress": `${bounded * 3.6}deg`,
        "--ring-size": `${size}px`,
      }}
      aria-label={`${bounded}% documented`}
      role="img"
    >
      <span>{bounded}</span>
    </span>
  );
}

function StatusPill({ tone = "neutral", icon: Icon, children }) {
  return (
    <span className={cx("status-pill", `is-${tone}`)}>
      {Icon && <Icon weight="bold" />}
      {children}
    </span>
  );
}

function AppRoutes() {
  const { workspace } = useWorkspace();
  const account = useSecureAccount();
  const location = useLocation();
  if (
    account.status === "checking" &&
    !account.session &&
    workspace.mode === "unstarted" &&
    location.pathname !== "/welcome"
  ) {
    return (
      <main className="account-route-gate" aria-live="polite">
        <span><FolderLock weight="duotone" /></span>
        <div>
          <strong>Opening the right workspace</strong>
          <small>Authenticated records stay locked during this check.</small>
        </div>
      </main>
    );
  }
  return (
    <Routes>
      <Route
        path="/welcome"
        element={
          account.session && workspace.mode !== "unstarted" ? (
            <Navigate to="/home" replace />
          ) : (
            <WelcomeScreen />
          )
        }
      />
      <Route
        path="/*"
        element={workspace.mode === "unstarted" ? <Navigate to="/welcome" replace /> : <AppShell />}
      />
    </Routes>
  );
}

function WelcomeScreen() {
  const {
    workspace,
    dispatch,
    setAnnouncement,
    session,
    storageScopeId,
    localClaimCandidate,
    clearLocalClaimCandidate,
    claimLocalWorkspace,
  } = useWorkspace();
  const navigate = useNavigate();
  const [showHow, setShowHow] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState("");
  const regionSummaries = useRegionSummaries(workspace);
  const localClaimSummary = localClaimCandidate
    ? {
        assets: localClaimCandidate.assets.length,
        places: localClaimCandidate.places.length,
        materials: localClaimCandidate.evidence.length,
      }
    : null;

  async function claimLocalRecords() {
    if (!claimLocalWorkspace || claimBusy) return;
    setClaimBusy(true);
    setClaimError("");
    try {
      await claimLocalWorkspace();
      navigate("/home", { replace: true });
    } catch (error) {
      setClaimError(
        error?.message ||
          "The local workspace could not be moved. It remains unchanged.",
      );
    } finally {
      setClaimBusy(false);
    }
  }

  function exploreSample() {
    const hasPersonalRecords =
      workspace.mode === "personal" &&
      Boolean(
        workspace.assets.length ||
          workspace.places.length ||
          workspace.spaces.length ||
          workspace.evidence.length ||
          workspace.members.length > 1 ||
          workspace.tasks.length ||
          workspace.activity.length,
      );
    if (
      hasPersonalRecords &&
      !window.confirm(
        "Open the isolated sample workspace? Your current personal demo records will be replaced on this device.",
      )
    ) {
      return;
    }
    dispatch({ type: "RESET_DEMO" });
    setAnnouncement(
      "Isolated sample workspace opened. It does not contain personal demo records.",
    );
    navigate("/home", { replace: true });
  }

  function startPersonal(captureType) {
    const alreadyPersonal = workspace.mode === "personal";
    const workspaceLabel = session ? "signed-in workspace" : "local workspace";
    if (!alreadyPersonal) dispatch({ type: "START_PERSONAL" });
    setAnnouncement(
      captureType === "asset"
        ? alreadyPersonal
          ? `Your ${workspaceLabel} is ready. Choose a category.`
          : `Your ${workspaceLabel} is ready. Choose a category for your first item.`
        : alreadyPersonal
          ? `Your ${workspaceLabel} is ready. Add a place.`
          : `Your ${workspaceLabel} is ready. Add your first place.`,
    );
    navigate(`/home?capture=${captureType}`, { replace: true });
  }

  return (
    <main className="welcome-page">
      <section className="welcome-copy-panel">
        <Brand />
        <div className="welcome-copy">
          <StatusPill tone="violet" icon={Sparkle}>
            Your private continuity map
          </StatusPill>
          <h1>Start with what matters.</h1>
          <p>
            Add one item you never want to lose track of, or begin with a home,
            property, plot, storage space, or family archive. You can organize the
            rest gradually.
          </p>
          {session && localClaimSummary && (
            <section
              className="welcome-claim-card"
              aria-labelledby="claim-local-workspace-title"
            >
              <span className="welcome-claim-icon">
                <FolderLock weight="duotone" />
              </span>
              <div>
                <small>Local records found on this browser</small>
                <h2 id="claim-local-workspace-title">
                  Move them into {session.householdName || "this household"}?
                </h2>
                <p>
                  {localClaimSummary.assets} assets,{" "}
                  {localClaimSummary.places} places, and{" "}
                  {localClaimSummary.materials} linked materials can become this
                  signed-in household&apos;s workspace. Continuity verifies the
                  account copy before removing the local workspace.
                </p>
                <div className="welcome-claim-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={claimLocalRecords}
                    disabled={claimBusy}
                  >
                    <FolderLock weight="bold" />
                    {claimBusy ? "Moving safely…" : "Move into my account"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={clearLocalClaimCandidate}
                    disabled={claimBusy}
                  >
                    Keep separate for now
                  </button>
                </div>
                {claimError && (
                  <div className="form-error" role="alert">
                    <Warning weight="bold" /> {claimError}
                  </div>
                )}
                <small>
                  This changes browser ownership only. Create an encrypted
                  account backup in Vault for cross-device recovery.
                </small>
              </div>
            </section>
          )}
          <div className="welcome-actions">
            <button className="primary-button" onClick={() => startPersonal("asset")}>
              Add my first item <ArrowRight weight="bold" />
            </button>
            <button className="secondary-button" onClick={() => startPersonal("place")}>
              Add a place
            </button>
          </div>
          <button className="text-button" onClick={exploreSample}>
            <GlobeHemisphereWest weight="bold" /> Explore a sample workspace
          </button>
          <button className="text-button" onClick={() => setShowHow((value) => !value)}>
            <Info weight="bold" /> How Continuity works
          </button>
          {!session && (
            <button
              className="text-button"
              onClick={() => setShowAccount((value) => !value)}
              aria-expanded={showAccount}
            >
              <LockKey weight="bold" />
              {showAccount
                ? "Hide secure account"
                : "Sign in or recover an existing household"}
            </button>
          )}
          <AnimatePresence initial={false}>
            {showHow && (
              <motion.ol
                className="how-list"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <li><span>1</span> Capture any item, even when its location is unknown.</li>
                <li><span>2</span> Organize it by place, room, category, or owner later.</li>
                <li><span>3</span> Add papers, photos, records, stories, and artifacts.</li>
                <li><span>4</span> Retrieve any record when your family needs it.</li>
              </motion.ol>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {!session && showAccount && (
              <motion.div
                className="welcome-account-entry"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <SecureAccountPanel
                  workspace={workspace}
                  dispatch={dispatch}
                  setAnnouncement={setAnnouncement}
                  storageScopeId={storageScopeId}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <p className="honesty-note">
            This web build is a local product prototype. It stores records and
            selected originals on this device. Vault can create a manual
            encrypted recovery kit; the optional local account service can store
            an encrypted recovery copy, but automatic live sync is not connected.
          </p>
        </div>
      </section>
      <section className="welcome-visual" aria-label="Preview of the asset map">
        <div className="welcome-globe">
          <GlobeBoundary>
            <Suspense fallback={<GlobeLoading />}>
              <ContinuityGlobe regions={regionSummaries} selectedId="doha" />
            </Suspense>
          </GlobeBoundary>
        </div>
        <div className="welcome-preview-card">
          <img src="/assets/west-bay-home.png" alt="West Bay Home at night" />
          <div>
            <span>Sample place</span>
            <strong>West Bay Home</strong>
            <small>One home · 6 useful records</small>
          </div>
          <ProgressRing value={78} />
        </div>
      </section>
    </main>
  );
}

function RoutedCaptureDrawer({ drawerKey, ...props }) {
  return <CaptureDrawer key={drawerKey} {...props} />;
}

function AppShell() {
  const {
    workspace,
    dispatch,
    setAnnouncement,
    storageScopeId,
    storageKeys,
    adoptRecoveryHead,
    commitWorkspaceActionsWithFiles,
    session,
  } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCaptureType = searchParams.get("capture");
  const captureType = CAPTURE_TYPES.has(requestedCaptureType)
    ? requestedCaptureType
    : null;
  const captureContext = {
    placeId: searchParams.get("placeId"),
    assetId: searchParams.get("assetId"),
    spaceId: searchParams.get("spaceId"),
    collectionId: searchParams.get("collectionId"),
    stage: searchParams.get("stage"),
    intent: searchParams.get("intent"),
  };
  const captureDrawerKey = [
    storageScopeId,
    captureType || "none",
    captureContext.placeId || "",
    captureContext.assetId || "",
    captureContext.spaceId || "",
    captureContext.collectionId || "",
    captureContext.stage || "",
    captureContext.intent || "",
  ].join("|");
  const activeOverlay = captureType
    ? "capture"
    : searchParams.get("search") === "1"
      ? "search"
      : searchParams.get("settings") === "1"
        ? "settings"
        : searchParams.get("help") === "1"
          ? "help"
          : null;
  const searchOpen = activeOverlay === "search";
  const settingsOpen = activeOverlay === "settings";
  const helpOpen = activeOverlay === "help";
  const overlayOpen = Boolean(activeOverlay);
  const profileMember =
    workspace.members.find(
      (member) => member.id === workspace.household.ownerMemberId,
    ) || workspace.members[0];
  const actorMemberId = selectWorkspaceActorMemberId(workspace, session);
  const householdLabel =
    workspace.mode === "sample"
      ? "Sample household"
      : session?.householdName || workspace.household.name;
  const householdInitials =
    session?.displayName
      ?.split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    profileMember?.initials ||
    "MY";
  const isDarkRoute =
    location.pathname.startsWith("/home") ||
    location.pathname.startsWith("/vault") ||
    location.pathname.startsWith("/collections") ||
    (location.pathname.startsWith("/assets") &&
      ["memories", "private"].includes(searchParams.get("view")));

  function setOverlay(key, value, extras = {}) {
    const next = new URLSearchParams(location.search);
    [
      "capture",
      "search",
      "settings",
      "help",
      "placeId",
      "assetId",
      "spaceId",
      "collectionId",
      "stage",
      "intent",
      "tool",
    ].forEach((overlayKey) => next.delete(overlayKey));
    next.set(key, value);
    Object.entries(extras).forEach(([name, data]) => {
      if (data) next.set(name, data);
    });
    navigate(`${location.pathname}?${next.toString()}`, {
      replace: overlayOpen,
      state: {
        ...(location.state || {}),
        continuityOverlay:
          location.state?.continuityOverlay || !overlayOpen,
      },
    });
  }

  function closeOverlays() {
    const next = new URLSearchParams(location.search);
    [
      "capture",
      "search",
      "settings",
      "help",
      "placeId",
      "assetId",
      "spaceId",
      "collectionId",
      "stage",
      "intent",
    ].forEach((key) => next.delete(key));
    const query = next.toString();
    if (location.state?.continuityOverlay) {
      navigate(-1);
      return;
    }
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, {
      replace: true,
      state: null,
    });
  }

  useEffect(() => {
    if (!requestedCaptureType || captureType) return;
    const next = new URLSearchParams(location.search);
    ["capture", "placeId", "assetId", "spaceId", "collectionId", "stage", "intent"].forEach((key) =>
      next.delete(key),
    );
    const query = next.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, {
      replace: true,
      state: null,
    });
    setAnnouncement("That capture link was invalid, so it was closed safely.");
  }, [
    captureType,
    location.pathname,
    location.search,
    navigate,
    requestedCaptureType,
    setAnnouncement,
  ]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const next = new URLSearchParams(location.search);
        ["capture", "settings", "help", "placeId", "assetId", "spaceId", "collectionId", "stage", "intent"].forEach(
          (overlayKey) => next.delete(overlayKey),
        );
        next.set("search", "1");
        navigate(`${location.pathname}?${next.toString()}`, {
          replace: overlayOpen,
          state: {
            ...(location.state || {}),
            continuityOverlay:
              location.state?.continuityOverlay || !overlayOpen,
          },
        });
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    location.pathname,
    location.search,
    location.state,
    navigate,
    overlayOpen,
  ]);

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `continuity-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setAnnouncement("Demo workspace exported as JSON.");
  }

  return (
    <div className={cx("app-shell", isDarkRoute ? "route-dark" : "route-light")}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Brand />
        <nav className="primary-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className={({ isActive }) =>
                cx(
                  "nav-link",
                  (isActive ||
                    (to === "/assets" &&
                      location.pathname.startsWith("/collections"))) &&
                    "is-active",
                )
              }
            >
              <Icon weight="duotone" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          className="capture-sidebar-button"
          aria-label="Add a place, asset, room, paper, or artifact"
          onClick={() => setOverlay("capture", "choose")}
        >
          <Plus weight="bold" /> <span>Add</span>
        </button>
        <div className="sidebar-footer">
          <button
            className="sidebar-meta"
            aria-label="Prototype privacy and storage settings"
            onClick={() => setOverlay("settings", "1")}
          >
            <ShieldCheck weight="duotone" />
            <span>
              <strong>
                {session ? "Account-scoped workspace" : "Local prototype"}
              </strong>
              <small>
                {session
                  ? "Signed in · stored on this device"
                  : "Stored on this device"}
              </small>
            </span>
          </button>
          <button
            className="sidebar-profile"
            aria-label="Household profile and settings"
            onClick={() => setOverlay("settings", "1")}
          >
            <span>{householdInitials}</span>
            <span className="profile-copy">
              <strong>{householdLabel}</strong>
              <small>
                {workspace.mode === "sample"
                  ? "Viewing sample"
                  : session
                    ? `${session.displayName} · ${session.role}`
                    : "Local-only workspace"}
              </small>
            </span>
            <CaretRight />
          </button>
        </div>
      </aside>

      <div className="app-column">
        <header className="utility-header">
          <div className="mobile-brand">
            <Brand compact />
            <span>Continuity</span>
          </div>
          <button
            className="global-search-trigger"
            aria-label="Search assets, places, materials, and people"
            onClick={() => setOverlay("search", "1")}
          >
            <MagnifyingGlass weight="bold" />
            <span>Search assets, places, documents…</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="header-actions">
            {workspace.mode === "sample" && (
              <button className="sample-badge" onClick={() => navigate("/welcome")}>
                Sample data <ArrowRight />
              </button>
            )}
            <IconButton label="Help and getting started" onClick={() => setOverlay("help", "1")}>
              <Question />
            </IconButton>
            <IconButton label="Profile and settings" onClick={() => setOverlay("settings", "1")}>
              <UserCircle />
            </IconButton>
          </div>
        </header>

        <main id="main-content" tabIndex="-1" className="route-stage">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomeScreen openCapture={setOverlay} />} />
            <Route path="/assets" element={<AssetsScreen openCapture={setOverlay} />} />
            <Route path="/assets/:assetId" element={<AssetDetail openCapture={setOverlay} />} />
            <Route path="/evidence/:evidenceId" element={<EvidenceDetail />} />
            <Route
              path="/collections"
              element={<CollectionsScreen openCapture={setOverlay} />}
            />
            <Route
              path="/collections/:collectionId"
              element={<CollectionDetail openCapture={setOverlay} />}
            />
            <Route path="/places/:placeId" element={<PlaceDetail openCapture={setOverlay} />} />
            <Route
              path="/places/:placeId/spaces/:spaceId"
              element={<SpaceDetail openCapture={setOverlay} />}
            />
            <Route path="/family" element={<FamilyScreen openCapture={setOverlay} />} />
            <Route
              path="/vault"
              element={
                <VaultScreen
                  exportWorkspace={exportWorkspace}
                  openCapture={setOverlay}
                />
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>

      <button
        className="mobile-capture-button"
        aria-label="Add a place, asset, room, paper, or artifact"
        onClick={() => setOverlay("capture", "choose")}
      >
        <Plus weight="bold" />
      </button>
      <nav className="mobile-nav" aria-label="Mobile primary navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                "mobile-nav-link",
                (isActive ||
                  (to === "/assets" &&
                    location.pathname.startsWith("/collections"))) &&
                  "is-active",
              )
            }
          >
            <Icon weight="duotone" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <AnimatePresence>
        {searchOpen && <SearchOverlay onClose={closeOverlays} />}
        {captureType &&
          (captureType === "studio" ? (
            <Suspense fallback={<CaptureStudioLoading />}>
              <CaptureStudioDrawer
                workspace={workspace}
                dispatch={dispatch}
                commitWorkspaceActionsWithFiles={
                  commitWorkspaceActionsWithFiles
                }
                setAnnouncement={setAnnouncement}
                storageScopeId={storageScopeId}
                createdBy={actorMemberId}
                initialTool={searchParams.get("tool")}
                initialAssetId={searchParams.get("assetId")}
                initialPlaceId={searchParams.get("placeId")}
                initialSpaceId={searchParams.get("spaceId")}
                onClose={closeOverlays}
              />
            </Suspense>
          ) : (
            <RoutedCaptureDrawer
              drawerKey={captureDrawerKey}
              initialType={captureType === "choose" ? null : captureType}
              context={captureContext}
              actorMemberId={actorMemberId}
              onOpenStudio={(tool, extras = {}) =>
                setOverlay("capture", "studio", { tool, ...extras })
              }
              onClose={closeOverlays}
            />
          ))}
        {settingsOpen && (
          <SettingsDrawer
            onClose={closeOverlays}
            onExport={exportWorkspace}
            onOpenRecovery={() => {
              navigate("/vault", { replace: true, state: null });
            }}
            onReset={async () => {
              try {
                await resetRecoveryGenerationScope({
                  scopeId: storageScopeId,
                });
                adoptRecoveryHead({ revision: 0 }, null);
              } catch (error) {
                setAnnouncement(
                  error?.message ||
                    "Nothing was reset because this browser could not clear the active device generation.",
                );
                return;
              }
              dispatch({
                type: "REPLACE_WORKSPACE",
                workspace: session
                  ? createAccountWorkspace(session)
                  : { ...createSampleWorkspace(), mode: "unstarted" },
              });
              navigate("/welcome", { replace: true });
              setAnnouncement(
                `${session ? "Account-scoped" : "Local"} workspace, drafts, restore generations, and locally stored originals reset.`,
              );
            }}
          />
        )}
        {helpOpen && (
          <HelpDrawer
            onClose={closeOverlays}
            onGoHome={() =>
              navigate("/home", { replace: true, state: null })
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function useRegionSummaries(workspace) {
  return useMemo(
    () =>
      workspace.regions.map((region) => {
        const placeIds = workspace.places
          .filter((place) => place.regionId === region.id && place.status !== "archived")
          .map((place) => place.id);
        const assets = workspace.assets.filter(
          (asset) => placeIds.includes(asset.placeId) && asset.lifecycleStatus !== "archived",
        );
        return {
          ...region,
          placeCount: placeIds.length,
          assetCount: assets.length,
        };
      }),
    [workspace],
  );
}

function HomeScreen({ openCapture }) {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const summaries = useRegionSummaries(workspace);
  const portfolio = selectPortfolioSummary(workspace);
  const nextAction = selectNextAction(workspace);
  const firstVaultProgress = useMemo(
    () => selectFirstUsefulVaultProgress(workspace),
    [workspace],
  );
  const [worldMode, setWorldMode] = useState("globe");
  const [selectedRegionId, setSelectedRegionId] = useState(
    summaries.find((region) => region.placeCount)?.id || summaries[0]?.id,
  );
  const selectedRegion =
    summaries.find((region) => region.id === selectedRegionId) || summaries[0];
  const regionPlaces = workspace.places.filter(
    (place) => place.regionId === selectedRegion?.id && place.status !== "archived",
  );
  const [selectedPlaceId, setSelectedPlaceId] = useState(regionPlaces[0]?.id || null);

  useEffect(() => {
    if (!regionPlaces.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(regionPlaces[0]?.id || null);
    }
  }, [selectedRegionId, regionPlaces, selectedPlaceId]);

  const selectedPlace =
    regionPlaces.find((place) => place.id === selectedPlaceId) || regionPlaces[0] || null;
  const selectedPlaceSummary = selectedPlace
    ? selectPlaceSummary(workspace, selectedPlace.id)
    : null;

  function selectRegion(id) {
    setSelectedRegionId(id);
  }

  function runFirstVaultAction(action) {
    switch (action?.type) {
      case "capture-place":
        openCapture("capture", "place");
        break;
      case "capture-asset":
        openCapture("capture", "asset", {
          ...(action.placeId ? { placeId: action.placeId } : {}),
        });
        break;
      case "capture-material":
        openCapture("capture", "evidence", {
          assetId: action.assetId,
        });
        break;
      case "asset":
        navigate(`/assets/${action.assetId}`);
        break;
      case "search":
        navigate("/home?search=1");
        break;
      default:
        openCapture("capture", "choose");
    }
  }

  function handleViewKey(event, current) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "globe"
        : event.key === "ArrowRight" || event.key === "End"
          ? "list"
          : current;
    setWorldMode(next);
    event.currentTarget.parentElement
      ?.querySelector(`[data-world-mode="${next}"]`)
      ?.focus();
  }

  const personalActiveAssets = workspace.assets.filter(
    (asset) => asset.lifecycleStatus !== "archived",
  );
  const personalActivePlaces = workspace.places.filter(
    (place) => place.status !== "archived",
  );

  if (workspace.mode === "personal" && personalActivePlaces.length === 0) {
    return (
      <section className="empty-workspace">
        <div className="empty-orbit"><Cube weight="duotone" /></div>
        <StatusPill tone="violet">
          {personalActiveAssets.length
            ? `${personalActiveAssets.length} ${
                personalActiveAssets.length === 1 ? "item" : "items"
              } saved`
            : "A useful start takes one minute"}
        </StatusPill>
        <h1>{personalActiveAssets.length ? "Give your items a place" : "What do you want to remember?"}</h1>
        <p>
          Add an item now—even if you do not know where it is—or create a place
          to organize rooms, property papers, and everything stored there.
        </p>
        <div className="empty-workspace-actions">
          <button className="primary-button" onClick={() => openCapture("capture", "asset")}>
            <Plus weight="bold" /> Add an item
          </button>
          <button className="secondary-button" onClick={() => openCapture("capture", "place")}>
            <MapPin weight="bold" /> Add a place
          </button>
        </div>
        {personalActiveAssets.length > 0 && <Link className="text-button" to="/assets">View unplaced items</Link>}
        <button className="text-button" onClick={() => navigate("/welcome")}>
          Explore the sample instead
        </button>
      </section>
    );
  }

  return (
    <div className="home-page">
      <div className="home-heading">
        <div>
          <span className="eyebrow">Your private asset atlas</span>
          <h1>Everything you own</h1>
          <span className="mobile-home-subtitle">One living map</span>
          <p>Places, possessions, records, and memories—mapped together so nothing important gets lost again.</p>
        </div>
        <div className="home-heading-actions">
          <div className="portfolio-summary" aria-label="Portfolio summary">
            <span><strong>{portfolio.assetCount}</strong> assets</span>
            <i />
            <span><strong>{portfolio.placeCount}</strong> places</span>
            <i />
            <span className="summary-readiness"><strong>{portfolio.readiness}%</strong> documented</span>
          </div>
          <button
            className="home-add-button"
            onClick={() => openCapture("capture", "choose")}
          >
            <Plus weight="bold" /> Add anything
          </button>
        </div>
      </div>

      {workspace.mode === "personal" && (
        <FirstUsefulVaultCard
          progress={firstVaultProgress}
          onAction={runFirstVaultAction}
        />
      )}

      <div className="home-layout">
        <section className="world-panel" aria-labelledby="world-heading">
          <div className="world-toolbar">
            <div>
              <span className="eyebrow">Interactive world</span>
              <h2 id="world-heading">Your living map</h2>
            </div>
            <div className="view-switch" role="tablist" aria-label="World view">
              <button
                id="world-tab-globe"
                data-world-mode="globe"
                role="tab"
                aria-label="Globe view"
                aria-controls="world-panel-globe"
                aria-selected={worldMode === "globe"}
                tabIndex={worldMode === "globe" ? 0 : -1}
                className={worldMode === "globe" ? "is-active" : ""}
                onClick={() => setWorldMode("globe")}
                onKeyDown={(event) => handleViewKey(event, "globe")}
              >
                <GlobeHemisphereWest /> <span>Globe</span>
              </button>
              <button
                id="world-tab-list"
                data-world-mode="list"
                role="tab"
                aria-label="List view"
                aria-controls="world-panel-list"
                aria-selected={worldMode === "list"}
                tabIndex={worldMode === "list" ? 0 : -1}
                className={worldMode === "list" ? "is-active" : ""}
                onClick={() => setWorldMode("list")}
                onKeyDown={(event) => handleViewKey(event, "list")}
              >
                <List /> <span>List</span>
              </button>
            </div>
          </div>

          {worldMode === "globe" ? (
            <div
              id="world-panel-globe"
              className="globe-frame"
              role="tabpanel"
              aria-labelledby="world-tab-globe"
            >
              <div className="globe-viewport">
                <GlobeBoundary onUnavailable={() => setWorldMode("list")}>
                  <Suspense fallback={<GlobeLoading />}>
                    <ContinuityGlobe
                      regions={summaries.filter((region) => region.placeCount)}
                      selectedId={selectedRegion?.id}
                      onUnavailable={() => setWorldMode("list")}
                    />
                  </Suspense>
                </GlobeBoundary>
              </div>
              <div className="globe-console">
                <div className="globe-coordinate">
                  <GlobeHemisphereWest weight="duotone" />
                  <span>
                    <small>Selected atlas region</small>
                    <strong>{selectedRegion?.name}</strong>
                  </span>
                  <code>
                    {selectedRegion
                      ? `${Math.abs(selectedRegion.lat).toFixed(2)}°${selectedRegion.lat >= 0 ? "N" : "S"}  ${Math.abs(selectedRegion.lng).toFixed(2)}°${selectedRegion.lng >= 0 ? "E" : "W"}`
                      : "No coordinates"}
                  </code>
                </div>
                <div className="globe-region-rail" aria-label="Choose a region">
                  {summaries
                    .filter((region) => region.placeCount)
                    .map((region) => (
                      <button
                        key={region.id}
                        className={cx(
                          "globe-region-chip",
                          region.id === selectedRegion?.id && "is-active",
                        )}
                        aria-pressed={region.id === selectedRegion?.id}
                        onClick={() => selectRegion(region.id)}
                      >
                        <span>{region.name}</span>
                        <strong>{region.assetCount}</strong>
                      </button>
                    ))}
                </div>
              </div>
              <p className="globe-help">
                Drag to rotate · choose a region below
              </p>
            </div>
          ) : (
            <div
              id="world-panel-list"
              role="tabpanel"
              aria-labelledby="world-tab-list"
            >
              <PlaceTable
                places={workspace.places}
                workspace={workspace}
                onSelect={(place) => {
                  setSelectedRegionId(place.regionId);
                  setSelectedPlaceId(place.id);
                }}
              />
            </div>
          )}
        </section>

        <aside className="home-context" aria-label="Selected location details">
          <div className="context-heading">
            <div>
              <span className="eyebrow">{selectedRegion?.name}</span>
              <h2>{regionPlaces.length} {regionPlaces.length === 1 ? "place" : "places"}</h2>
            </div>
            <MapPin weight="duotone" />
          </div>

          <AttentionCard action={nextAction} openCapture={openCapture} />

          <div className="region-place-list">
            {regionPlaces.map((place) => {
              const summary = selectPlaceSummary(workspace, place.id);
              return (
                <button
                  key={place.id}
                  className={cx("region-place-row", place.id === selectedPlace?.id && "is-active")}
                  aria-pressed={place.id === selectedPlace?.id}
                  onClick={() => setSelectedPlaceId(place.id)}
                >
                  <span className="mini-place-icon">
                    {place.kind === "Home" ? <House weight="duotone" /> : <Buildings weight="duotone" />}
                  </span>
                  <span>
                    <strong>{place.name}</strong>
                    <small>{summary.assetCount} assets · {summary.readiness}% ready</small>
                  </span>
                  <Check className="row-check" weight="bold" />
                </button>
              );
            })}
          </div>

          {selectedPlace && (
            <article className="selected-place-card">
              {selectedPlace.image ? (
                <img src={selectedPlace.image} alt="" />
              ) : (
                <div className="place-image-fallback"><Buildings weight="duotone" /></div>
              )}
              <div className="selected-place-copy">
                <span>{selectedPlace.kind}</span>
                <h3>{selectedPlace.name}</h3>
                <div className="place-stat-row">
                  <span><Cube /> {selectedPlaceSummary.assetCount} assets</span>
                  <span><ProgressRing value={selectedPlaceSummary.readiness} size={36} /> documented</span>
                </div>
                <button onClick={() => navigate(`/places/${selectedPlace.id}`)}>
                  Open place <ArrowRight weight="bold" />
                </button>
              </div>
            </article>
          )}
        </aside>
      </div>
    </div>
  );
}

function PlaceTable({ places, workspace, onSelect }) {
  const navigate = useNavigate();
  if (!places.length) return <EmptyState icon={MapPin} title="No places yet" copy="Add your first place to begin." />;
  return (
    <div className="place-table">
      <div className="place-table-head">
        <span>Place</span><span>Type</span><span>Assets</span><span>Readiness</span><span />
      </div>
      {places.filter((place) => place.status !== "archived").map((place) => {
        const summary = selectPlaceSummary(workspace, place.id);
        return (
          <div className="place-table-row" key={place.id}>
            <button className="place-table-name" onClick={() => onSelect(place)}>
              <MapPin weight="duotone" />
              <span><strong>{place.name}</strong><small>{place.address || place.regionId}</small></span>
            </button>
            <span>{place.kind}</span>
            <span>{summary.assetCount}</span>
            <span><strong>{summary.readiness}%</strong></span>
            <IconButton label={`Open ${place.name}`} onClick={() => navigate(`/places/${place.id}`)}>
              <CaretRight />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}

function AttentionCard({ action, openCapture }) {
  const navigate = useNavigate();
  if (!action) {
    return (
      <article className="attention-card is-complete">
        <CheckCircle weight="duotone" />
        <div><span>All clear</span><h3>Your next review can wait.</h3></div>
      </article>
    );
  }

  function act() {
    const destination = action.destination;
    switch (destination?.type) {
      case "capture-material":
        openCapture("capture", "evidence", {
          assetId: destination.assetId,
        });
        break;
      case "capture-asset":
        openCapture("capture", "asset", {
          placeId: destination.placeId,
        });
        break;
      case "capture-place":
        openCapture("capture", "place");
        break;
      case "space":
        navigate(
          `/places/${destination.placeId}/spaces/${destination.spaceId}`,
        );
        break;
      case "asset":
        navigate(`/assets/${destination.assetId}`);
        break;
      case "place":
        navigate(`/places/${destination.placeId}`);
        break;
      case "assets":
        navigate("/assets");
        break;
      default:
        navigate("/assets");
    }
  }

  return (
    <article className="attention-card">
      <div className="attention-icon"><ShieldCheck weight="duotone" /></div>
      <div className="attention-copy">
        <span>What needs attention</span>
        <h3>{action.title}</h3>
        <p>{action.description || "Complete one useful gap to strengthen this record."}</p>
        <button className="gradient-button" onClick={act}>
          {action.ctaLabel || "Continue"} <ArrowRight weight="bold" />
        </button>
      </div>
    </article>
  );
}

function AssetsScreen({ openCapture }) {
  const { workspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = ["items", "memories", "private"].includes(
    searchParams.get("view"),
  )
    ? searchParams.get("view")
    : "items";
  const query = searchParams.get("q") || "";
  const category = searchParams.get("category") || "All";
  const locationFilter = searchParams.get("location") || "all";
  const sort = searchParams.get("sort") || "readiness";
  const results = searchAssetRecords(workspace, query, {
    category,
    location: locationFilter,
  }).filter((asset) => {
    if (asset.lifecycleStatus === "archived") return false;
    if (view === "memories") {
      return (
        asset.kind === "memory" ||
        asset.categoryPath?.includes("family-memory-legacy") ||
        asset.meaningFacets?.some((item) =>
          ["memory", "heirloom", "family-history"].includes(item),
        )
      );
    }
    if (view === "private") {
      return (
        ["financial", "digital", "intangible"].includes(asset.kind) ||
        asset.categoryPath?.includes("digital-financial")
      );
    }
    return true;
  });
  const sorted = [...results].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "newest") return String(b.createdAt).localeCompare(String(a.createdAt));
    return readinessPercent(a, workspace) - readinessPercent(b, workspace);
  });

  function setParam(name, value, clearValue) {
    const next = new URLSearchParams(searchParams);
    if (value === clearValue) next.delete(name);
    else next.set(name, value);
    setSearchParams(next, { replace: true });
  }

  if (view === "memories") {
    return (
      <MemoryArchiveScreen
        memories={sorted}
        workspace={workspace}
        openCapture={openCapture}
        query={query}
        onQueryChange={(value) => setParam("q", value, "")}
      />
    );
  }

  if (view === "private") {
    return (
      <PrivateReferenceScreen
        records={sorted}
        workspace={workspace}
        openCapture={openCapture}
        query={query}
        onQueryChange={(value) => setParam("q", value, "")}
      />
    );
  }

  return (
    <div className="content-page assets-page">
      <PageHeader
        eyebrow={
          view === "memories"
            ? "Meaning and legacy"
            : view === "private"
              ? "Sensitive references"
              : "Portfolio records"
        }
        title={
          view === "memories"
            ? "Memories"
            : view === "private"
              ? "Private references"
              : "Assets"
        }
        copy={
          view === "memories"
            ? "Objects, photographs, stories, and loved people whose meaning deserves to survive."
            : view === "private"
              ? "Keep safe references to financial and digital holdings—never passwords, PINs, keys, or full account numbers."
              : "Every useful record, with category, location, papers, and readiness kept distinct."
        }
        action={
          <div className="page-header-button-group">
            <Link className="secondary-button" to="/collections">
              <Archive weight="duotone" /> Collections
            </Link>
            <button className="primary-button" onClick={() => openCapture("capture", "asset")}>
              <Plus weight="bold" />{" "}
              {view === "memories"
                ? "Add memory"
                : view === "private"
                  ? "Add private reference"
                  : "Add asset"}
            </button>
          </div>
        }
      />

      <AssetBrowseTabs active={view} />

      {view === "private" && (
        <div className="sensitive-reference-notice">
          <LockKey weight="duotone" />
          <span>
            <strong>Keep a safe reference—not the secret.</strong>
            <small>Use an institution, alias, and masked last four digits. Exact recovery instructions belong in protected evidence.</small>
          </span>
        </div>
      )}

      <section className="filter-bar" aria-label="Asset filters">
        <label className="search-field">
          <MagnifyingGlass weight="bold" />
          <span className="sr-only">Search assets</span>
          <input
            value={query}
            onChange={(event) => setParam("q", event.target.value, "")}
            placeholder="Search by name, reference, place…"
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setParam("q", "", "")}><X /></button>
          )}
        </label>
        <label className="select-field">
          <SlidersHorizontal />
          <span className="sr-only">Category</span>
          <select value={category} onChange={(event) => setParam("category", event.target.value, "All")}>
            <option value="All">All categories</option>
            {ASSET_CATEGORY_GROUPS.map((group) => (
              <optgroup key={group.id} label={group.label}>
                <option value={group.id}>All {group.label.toLowerCase()}</option>
                {group.categories.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <CaretDown />
        </label>
        <label className="select-field">
          <MapPin />
          <span className="sr-only">Location</span>
          <select value={locationFilter} onChange={(event) => setParam("location", event.target.value, "all")}>
            <option value="all">All locations</option>
            <option value="known">Known</option>
            <option value="needs-detail">Needs detail</option>
            <option value="unknown">Unknown</option>
            <option value="no-physical">No physical location</option>
          </select>
          <CaretDown />
        </label>
        <label className="select-field is-sort">
          <span>Sort:</span>
          <select value={sort} onChange={(event) => setParam("sort", event.target.value, "readiness")}>
            <option value="readiness">Needs attention</option>
            <option value="name">Name</option>
            <option value="newest">Newest</option>
          </select>
          <CaretDown />
        </label>
      </section>

      <div className="result-heading">
        <strong>{sorted.length} {sorted.length === 1 ? "record" : "records"}</strong>
        {(query || category !== "All" || locationFilter !== "all") && (
            <button className="text-button" onClick={() => setSearchParams(view === "items" ? {} : { view }, { replace: true })}>
              Clear all filters
            </button>
        )}
      </div>

      {sorted.length ? (
        <AssetResults assets={sorted} workspace={workspace} />
      ) : (
        <EmptyState
          icon={MagnifyingGlass}
          title="No matching records"
          copy="Try a broader search or clear one of the filters."
          action={<button className="secondary-button" onClick={() => setSearchParams(view === "items" ? {} : { view }, { replace: true })}>Clear filters</button>}
        />
      )}
    </div>
  );
}

function memoryStory(asset) {
  return (
    asset.profile?.story ||
    asset.sentimentalValue ||
    asset.notes ||
    "A memory waiting for the people, place, and story that make it yours."
  );
}

function memoryLegacyLabel(intent) {
  return (
    {
      inherit: "Pass on with its story",
      "archive-story": "Preserve for the family",
      keep: "Keep close",
      gift: "Gift with context",
      donate: "Share its story",
      sell: "Preserve before selling",
    }[intent] || "Legacy intention not decided"
  );
}

function memorySubjectLabel(subjectType) {
  return (
    MEMORY_SUBJECT_OPTIONS.find((option) => option.value === subjectType)
      ?.label || "Memory"
  );
}

function MemoryArchiveScreen({
  memories,
  workspace,
  openCapture,
  query,
  onQueryChange,
}) {
  const featured =
    memories.find((asset) => asset.coverImage && asset.sentimentalValue) ||
    memories.find((asset) => asset.coverImage) ||
    memories[0] ||
    null;
  const peopleByMemory = new Map(
    memories.map((asset) => [
      asset.id,
      selectMemoryPeopleForAsset(workspace, asset.id),
    ]),
  );
  const namedPeople = [
    ...memories
      .flatMap((asset) =>
        (peopleByMemory.get(asset.id) || []).map((person) => ({
          ...person,
          memoryId: asset.id,
        })),
      )
      .reduce((people, person) => {
        const key =
          person.personId ||
          person.displayName.trim().toLocaleLowerCase("en");
        const existing = people.get(key);
        people.set(key, {
          ...existing,
          ...person,
          memoryCount: (existing?.memoryCount || 0) + 1,
        });
        return people;
      }, new Map())
      .values(),
  ];
  const storiesPreserved = memories.filter(
    (asset) => asset.profile?.story || asset.sentimentalValue || asset.notes,
  ).length;
  const photographed = memories.filter(
    (asset) =>
      asset.coverImage ||
      workspace.evidence.some(
        (item) => item.assetId === asset.id && item.kind === "media",
      ),
  ).length;

  return (
    <div className="meaning-page memory-archive-page">
      <PageHeader
        eyebrow="Memory atlas"
        title="Memories"
        copy="Keep the people, moments, and ordinary objects that explain where your family came from."
        action={
          <button
            className="primary-button"
            onClick={() =>
              openCapture("capture", "asset", { intent: "memory" })
            }
          >
            <Plus weight="bold" /> Preserve a memory
          </button>
        }
      />
      <AssetBrowseTabs active="memories" />

      {featured ? (
        <>
          <section className="memory-feature">
            <div className="memory-feature-media">
              <AssetCoverMedia
                asset={featured}
                workspace={workspace}
                alt={`Private photograph representing ${featured.name}`}
                fallback={
                  <span className="memory-media-fallback">
                    <Heart weight="duotone" />
                  </span>
                }
              />
              <span className="memory-photo-caption">
                <Image weight="duotone" /> Private family memory
              </span>
            </div>
            <div className="memory-feature-copy">
              <span className="eyebrow">A story worth keeping</span>
              <h2>{featured.name}</h2>
              <blockquote>“{memoryStory(featured)}”</blockquote>
              <dl className="memory-context-list">
                <div>
                  <dt>People</dt>
                  <dd>
                    {memoryPeopleLabel(
                      peopleByMemory.get(featured.id) || [],
                    ) || "Add the people connected to this"}
                  </dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{featured.profile?.["date-period"] || "Date or period not added"}</dd>
                </div>
                <div>
                  <dt>Future</dt>
                  <dd>{memoryLegacyLabel(featured.legacyIntent)}</dd>
                </div>
              </dl>
              <div className="memory-feature-actions">
                <Link className="primary-button" to={`/assets/${featured.id}`}>
                  Open memory <ArrowRight weight="bold" />
                </Link>
                <button
                  className="secondary-button"
                  onClick={() =>
                    openCapture("capture", "evidence", {
                      assetId: featured.id,
                    })
                  }
                >
                  <Paperclip weight="duotone" /> Add story or photo
                </button>
              </div>
            </div>
          </section>

          <section className="memory-continuity-rail" aria-label="Memory continuity">
            <div>
              <strong>{memories.length}</strong>
              <span>meaningful objects</span>
            </div>
            <div>
              <strong>{namedPeople.length || "—"}</strong>
              <span>people named</span>
            </div>
            <div>
              <strong>{storiesPreserved}</strong>
              <span>stories preserved</span>
            </div>
            <div>
              <strong>{photographed}</strong>
              <span>recognisable today</span>
            </div>
            <p>
              This is not a score. It is a gentle check that the next person can
              recognise the object and understand why it mattered.
            </p>
          </section>

          {namedPeople.length > 0 && (
            <section className="memory-people-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">People inside the archive</span>
                  <h2>Remembered together</h2>
                </div>
              </div>
              <div className="memory-person-list">
                {namedPeople.map((person) => (
                  <span key={person.personId || person.displayName}>
                    <User weight="duotone" />
                    <span>
                      <strong>{person.displayName}</strong>
                      <small>
                        {person.relationship || person.roleLabel || "Private connection"}
                        {" · "}
                        {person.memoryCount}{" "}
                        {person.memoryCount === 1 ? "memory" : "memories"}
                      </small>
                    </span>
                    <LockKey weight="bold" aria-label="Private" />
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="memory-library-section">
            <div className="section-heading memory-library-heading">
              <div>
                <span className="eyebrow">Your living archive</span>
                <h2>Objects with a voice</h2>
              </div>
              <label className="memory-search">
                <MagnifyingGlass weight="bold" />
                <span className="sr-only">Search memories</span>
                <input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Search a person, place, or story…"
                />
              </label>
            </div>
            <div className="memory-mosaic">
              {memories.map((asset, index) => (
                <Link
                  key={asset.id}
                  to={`/assets/${asset.id}`}
                  className={cx("memory-card", index === 0 && "is-leading")}
                >
                  <div className="memory-card-media">
                    <AssetCoverMedia
                      asset={asset}
                      workspace={workspace}
                      alt={`Private photograph representing ${asset.name}`}
                      fallback={
                        <span className="memory-media-fallback">
                          <AssetGlyph asset={asset} />
                        </span>
                      }
                    />
                  </div>
                  <div className="memory-card-copy">
                    <small>
                      {asset.profile?.["date-period"] ||
                        categoryLabel(asset)}
                    </small>
                    <h3>{asset.name}</h3>
                    <p>{memoryStory(asset)}</p>
                    <span>
                      {memoryPeopleLabel(
                        peopleByMemory.get(asset.id) || [],
                      ) || memoryLegacyLabel(asset.legacyIntent)}
                      <CaretRight />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          icon={Heart}
          title={query ? "No memories match that search" : "Begin with one remembered thing"}
          copy={
            query
              ? "Try a person, place, object, or a phrase from the story."
              : "It can be valuable, ordinary, found, inherited, or already lost. Record what you remember first."
          }
          action={
            query ? (
              <button className="secondary-button" onClick={() => onQueryChange("")}>
                Clear search
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={() =>
                  openCapture("capture", "asset", { intent: "memory" })
                }
              >
                Preserve a memory
              </button>
            )
          }
        />
      )}
    </div>
  );
}

function maskedReference(asset) {
  const explicit = String(asset.reference || "").trim();
  if (explicit) return explicit;
  const digits = String(asset.profile?.["account-reference"] || "")
    .replace(/\D/g, "")
    .slice(-4);
  return digits ? `•••• ${digits}` : "Reference not added";
}

function PrivateReferenceScreen({
  records,
  workspace,
  openCapture,
  query,
  onQueryChange,
}) {
  const [showValues, setShowValues] = useState(false);
  const financial = records.filter((asset) => asset.kind === "financial");
  const digital = records.filter((asset) => asset.kind !== "financial");
  const institutions = [
    ...new Set(
      financial
        .map((asset) => asset.profile?.institution)
        .filter(Boolean),
    ),
  ];
  const withContinuityNote = records.filter((asset) =>
    workspace.evidence.some(
      (item) =>
        item.assetId === asset.id &&
        /recovery|beneficiary|access|continuity/i.test(item.type),
    ),
  ).length;

  return (
    <div className="meaning-page private-reference-page">
      <PageHeader
        eyebrow="Private continuity"
        title="Private references"
        copy="Remember what exists, where it is held, and who should know—without turning this into a password manager."
        action={
          <button
            className="primary-button"
            onClick={() =>
              openCapture("capture", "asset", {
                intent: "private-reference",
              })
            }
          >
            <Plus weight="bold" /> Add private reference
          </button>
        }
      />
      <AssetBrowseTabs active="private" />

      <section className="private-ledger-hero">
        <div className="private-ledger-shield">
          <LockKey weight="duotone" />
          <span className="eyebrow">Keep a safe reference—not the secret</span>
          <h2>Enough context for continuity. Nothing that unlocks the account.</h2>
          <p>
            Keep the institution, an alias or final four digits, ownership
            context, and a protected recovery note—never passwords, PINs, keys,
            or full account numbers. Seed phrases and OTPs never belong here either.
          </p>
          <div className="private-rule-list">
            <span><CheckCircle /> Masked identifiers only</span>
            <span><CheckCircle /> Values hidden by default</span>
            <span><CheckCircle /> Financial records excluded from showcases</span>
          </div>
        </div>
        <div className="private-ledger-summary">
          <span className="eyebrow">Continuity view</span>
          <dl>
            <div><dt>Financial references</dt><dd>{financial.length}</dd></div>
            <div><dt>Institutions named</dt><dd>{institutions.length}</dd></div>
            <div><dt>Recovery context</dt><dd>{withContinuityNote}/{records.length}</dd></div>
          </dl>
          <button
            type="button"
            className="secondary-button"
            aria-pressed={showValues}
            onClick={() => setShowValues((current) => !current)}
          >
            {showValues ? <LockKey /> : <Sparkle />}
            {showValues ? "Hide recorded estimates" : "Reveal recorded estimates"}
          </button>
          <small>
            Estimates are private observations, not live balances or investment
            performance.
          </small>
        </div>
      </section>

      <section className="private-reference-section">
        <div className="section-heading private-reference-heading">
          <div>
            <span className="eyebrow">Banks and investments</span>
            <h2>Financial continuity</h2>
          </div>
          <label className="memory-search">
            <MagnifyingGlass weight="bold" />
            <span className="sr-only">Search private references</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search institution or alias…"
            />
          </label>
        </div>

        {financial.length ? (
          <div className="private-reference-grid">
            {financial.map((asset) => {
              const continuityMaterial = workspace.evidence.find(
                (item) =>
                  item.assetId === asset.id &&
                  /recovery|beneficiary|access|continuity/i.test(item.type),
              );
              return (
                <Link
                  key={asset.id}
                  to={`/assets/${asset.id}`}
                  className="private-reference-card"
                >
                  <span className="private-reference-icon">
                    {asset.categoryId === "financial.investment" ? (
                      <Sparkle weight="duotone" />
                    ) : (
                      <Buildings weight="duotone" />
                    )}
                  </span>
                  <span className="private-reference-copy">
                    <small>
                      {asset.profile?.institution || categoryLabel(asset)}
                    </small>
                    <strong>{asset.name}</strong>
                    <code>{maskedReference(asset)}</code>
                  </span>
                  <span className="private-reference-state">
                    <strong>
                      {showValues
                        ? formatMoney(asset.value)
                        : asset.value
                          ? "••••••"
                          : "No estimate"}
                    </strong>
                    <small>
                      {continuityMaterial
                        ? materialStatusLabel(continuityMaterial.status)
                        : "Recovery note needed"}
                    </small>
                  </span>
                  <CaretRight />
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Buildings}
            title={query ? "No financial reference matches" : "Add a safe financial reference"}
            copy="Use an institution, a helpful alias, and only a masked identifier. Credentials never belong here."
            action={
              query ? (
                <button className="secondary-button" onClick={() => onQueryChange("")}>
                  Clear search
                </button>
              ) : (
                <button
                  className="primary-button"
                  onClick={() =>
                    openCapture("capture", "asset", {
                      intent: "private-reference",
                    })
                  }
                >
                  Add private reference
                </button>
              )
            }
          />
        )}
      </section>

      {digital.length > 0 && (
        <section className="digital-continuity-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Domains, licenses, and digital holdings</span>
              <h2>Digital continuity</h2>
            </div>
            <small>{digital.length} safe references</small>
          </div>
          <div className="digital-continuity-list">
            {digital.map((asset) => (
              <Link key={asset.id} to={`/assets/${asset.id}`}>
                <span><Key weight="duotone" /></span>
                <span>
                  <strong>{asset.name}</strong>
                  <small>{maskedReference(asset)}</small>
                </span>
                <StatusPill
                  tone={
                    selectAssetReadiness(asset, workspace).percent === 100
                      ? "success"
                      : "warning"
                  }
                >
                  {selectAssetReadiness(asset, workspace).percent === 100
                    ? "Continuity noted"
                    : "Needs context"}
                </StatusPill>
                <CaretRight />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AssetBrowseTabs({ active }) {
  const tabs = [
    { id: "items", label: "Items", to: "/assets" },
    { id: "collections", label: "Collections", to: "/collections" },
    { id: "memories", label: "Memories", to: "/assets?view=memories" },
    { id: "private", label: "Private references", to: "/assets?view=private" },
  ];
  return (
    <nav className="asset-browse-tabs" aria-label="Asset views">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className={tab.id === active ? "is-active" : ""}
          aria-current={tab.id === active ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function AssetResults({ assets, workspace }) {
  return (
    <>
      <div className="asset-table" role="table" aria-label="Assets">
        <div className="asset-table-head" role="row">
          <span role="columnheader">Asset</span>
          <span role="columnheader">Location</span>
          <span role="columnheader">Materials</span>
          <span role="columnheader">Readiness</span>
          <span role="columnheader">Value</span>
          <span />
        </div>
        {assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} workspace={workspace} />
        ))}
      </div>
      <div className="asset-card-list">
        {assets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} workspace={workspace} />
        ))}
      </div>
    </>
  );
}

function AssetGlyph({ asset }) {
  const Icon = categoryIcon(asset);
  return <span className={cx("asset-glyph", `accent-${asset.accent || "violet"}`)}><Icon weight="duotone" /></span>;
}

function useAssetCoverMedia(asset, workspace) {
  const { storageScopeId } = useWorkspace();
  const [localUrl, setLocalUrl] = useState("");
  const localEvidence = workspace?.evidence.find(
    (item) =>
      item.assetId === asset?.id &&
      item.kind === "media" &&
      item.fileName &&
      canPreviewFileType(item.fileType),
  );
  const localEvidenceId = localEvidence?.id;

  useEffect(() => {
    let active = true;
    let nextUrl = "";
    setLocalUrl("");
    if (!asset || asset.coverImage || !localEvidenceId) return undefined;
    getEvidenceFile(localEvidenceId, { scopeId: storageScopeId })
      .then((record) => {
        if (
          !active ||
          !record?.blob ||
          !canPreviewFileType(record.fileType) ||
          !canPreviewFileType(record.blob.type)
        ) {
          return;
        }
        nextUrl = URL.createObjectURL(record.blob);
        setLocalUrl(nextUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [
    asset?.id,
    asset?.coverImage,
    localEvidenceId,
    storageScopeId,
  ]);

  if (asset?.coverImage) {
    return { url: asset.coverImage, source: "sample" };
  }
  if (localUrl) return { url: localUrl, source: "local" };
  return { url: "", source: "none" };
}

function AssetCoverMedia({
  asset,
  workspace,
  alt,
  className,
  fallback = null,
}) {
  const media = useAssetCoverMedia(asset, workspace);
  if (!media.url) return fallback;
  return (
    <img
      className={className}
      src={media.url}
      alt={alt || `${asset.name} cover`}
      data-cover-source={media.source}
    />
  );
}

function resolveAssetLocation(asset, workspace) {
  if (asset.locationMode === "virtual") {
    return asset.locationDetail || "No physical location";
  }
  if (asset.locationMode === "not-applicable") return "Location not applicable";
  if (asset.locationStatus === "unknown") return "Location unknown";
  const place = workspace.places.find((item) => item.id === asset.placeId);
  const path = asset.spaceId
    ? selectSpacePath(workspace, asset.spaceId).map((item) => item.name)
    : [];
  return [place?.name, ...path, asset.locationDetail]
    .filter(Boolean)
    .join(" · ") || "Location needs detail";
}

function materialSummary(asset, workspace) {
  const evidence = workspace.evidence.filter((item) => item.assetId === asset.id);
  const pending = evidence.filter((item) => item.status === "pending").length;
  const reviewed = evidence.filter((item) => item.status === "verified").length;
  const requirements = selectEvidenceRequirementSatisfaction(asset, workspace);
  const needed = requirements.requirements.filter(
    (item) => !item.satisfied,
  ).length;
  if (pending) return { label: `${pending} pending`, tone: "pending" };
  if (needed) return { label: `${needed} needed`, tone: "warning" };
  return {
    label: reviewed ? `${reviewed} reviewed` : "None added",
    tone: reviewed ? "success" : "neutral",
  };
}

function AssetRow({ asset, workspace }) {
  const materials = materialSummary(asset, workspace);
  const readiness = readinessPercent(asset, workspace);
  return (
    <Link to={`/assets/${asset.id}`} className="asset-table-row" role="row">
      <span className="asset-identity" role="cell">
        <AssetGlyph asset={asset} />
        <span><strong>{asset.name}</strong><small>{categoryPathLabel(asset)} · {asset.reference || "No reference"}</small></span>
      </span>
      <span className="location-cell" role="cell"><MapPin /> {resolveAssetLocation(asset, workspace)}</span>
      <span role="cell"><StatusPill tone={materials.tone}>{materials.label}</StatusPill></span>
      <span className="readiness-cell" role="cell"><ProgressRing value={readiness} size={38} /><strong>{readiness}%</strong></span>
      <span role="cell"><strong>{listValueLabel(asset)}</strong></span>
      <span role="cell"><CaretRight /></span>
    </Link>
  );
}

function AssetCard({ asset, workspace }) {
  const materials = materialSummary(asset, workspace);
  const readiness = readinessPercent(asset, workspace);
  return (
    <Link to={`/assets/${asset.id}`} className="asset-card">
      <AssetGlyph asset={asset} />
      <div className="asset-card-copy">
        <span>{categoryLabel(asset)}</span>
        <h3>{asset.name}</h3>
        <p><MapPin /> {resolveAssetLocation(asset, workspace)}</p>
        <div><StatusPill tone={materials.tone}>{materials.label}</StatusPill><strong>{listValueLabel(asset)}</strong></div>
      </div>
      <ProgressRing value={readiness} size={42} />
    </Link>
  );
}

function AssetDetail({ openCapture }) {
  const { assetId } = useParams();
  const { workspace, dispatch, setAnnouncement } = useWorkspace();
  const navigate = useNavigate();
  const [showPrivateValue, setShowPrivateValue] = useState(false);
  const [showAllLocationHistory, setShowAllLocationHistory] = useState(false);
  const asset = workspace.assets.find((item) => item.id === assetId && item.lifecycleStatus !== "archived");

  if (!asset) {
    return <RecordNotFound title="Asset not found" backTo="/assets" />;
  }

  const readinessState = selectAssetReadiness(asset, workspace);
  const readiness = readinessState.percent;
  const linkedPropertyPlace = propertyPlaceForAsset(workspace, asset.id);
  const place = workspace.places.find((item) => item.id === asset.placeId);
  const space = workspace.spaces.find((item) => item.id === asset.spaceId);
  const spacePath = asset.spaceId
    ? selectSpacePath(workspace, asset.spaceId)
    : [];
  const locationHistory = selectAssetLocationHistory(workspace, asset.id);
  const fullLocationPath = [
    place?.name,
    ...spacePath.map((item) => item.name),
    asset.locationDetail,
  ]
    .filter(Boolean)
    .join(" · ");
  const evidence = workspace.evidence.filter((item) => item.assetId === asset.id);
  const profile = getCategoryProfile(asset.categoryId || asset.category);
  const profileEntries = profile?.fields
    .map((field) => ({ field, value: asset.profile?.[field.id] }))
    .filter((item) => item.value) || [];
  const memoryPeople = selectMemoryPeopleForAsset(workspace, asset.id);
  const memorySubjectType = memorySubjectTypeForAsset(asset);
  const isMemoryRecord =
    asset.kind === "memory" ||
    Boolean(asset.profile?.["memory-subject"]) ||
    asset.meaningFacets?.some((facet) =>
      ["memory", "heirloom", "family-history"].includes(facet),
    );
  const hasPhysicalMemoryLocation =
    !isMemoryRecord || memorySubjectType === "physical";

  function archive() {
    if (!window.confirm(`Archive “${asset.name}”? You can keep its history in the demo export.`)) return;
    dispatch({ type: "ARCHIVE_ASSET", assetId: asset.id });
    setAnnouncement(`${asset.name} archived.`);
    navigate("/assets");
  }

  return (
    <div className="detail-page">
      <BackLink to="/assets" label="All assets" />
      <div className="asset-detail-grid">
        <section className="asset-passport">
          <div className="passport-topline">
            <AssetGlyph asset={asset} />
            <div>
              <span className="eyebrow">{categoryPathLabel(asset)} passport</span>
              <h1>{asset.name}</h1>
              <p>{asset.notes || "A continuity record you can improve over time."}</p>
            </div>
            <ProgressRing value={readiness} size={64} />
          </div>
          <div className={cx("passport-value", isMemoryRecord && "is-memory")}>
            {isMemoryRecord ? (
              <>
                <span>Preserved as</span>
                <strong>{memorySubjectLabel(memorySubjectType)}</strong>
                <small>
                  {asset.profile?.["date-period"] || "Period not recorded"}
                  {" · "}
                  {memoryPeople.length
                    ? `${memoryPeople.length} ${
                        memoryPeople.length === 1 ? "person" : "people"
                      } linked privately`
                    : "No people linked yet"}
                </small>
              </>
            ) : (
              <>
            <span>Recorded value</span>
            <strong>
              {isPrivateFinancialAsset(asset) && !showPrivateValue
                ? asset.value
                  ? "••••••"
                  : "Private"
                : formatMoney(asset.value)}
            </strong>
            {isPrivateFinancialAsset(asset) && asset.value ? (
              <button
                type="button"
                className="text-button passport-value-reveal"
                aria-pressed={showPrivateValue}
                onClick={() => setShowPrivateValue((current) => !current)}
              >
                {showPrivateValue ? <LockKey /> : <Sparkle />}
                {showPrivateValue ? "Hide estimate" : "Reveal estimate"}
              </button>
            ) : (
              <small>{asset.value ? "User supplied · not a live valuation" : "Optional"}</small>
            )}
            {isPrivateFinancialAsset(asset) && (
              <small>Private estimate · not a live balance</small>
            )}
              </>
            )}
          </div>
          <div className="passport-actions">
            <button
              className="primary-button"
              onClick={() => openCapture("capture", "asset", { assetId: asset.id })}
            >
              <PencilSimple weight="bold" /> Edit details
            </button>
            {hasPhysicalMemoryLocation && (
              <button
                className="secondary-button"
                onClick={() =>
                  openCapture("capture", "asset", {
                    assetId: asset.id,
                    stage: "location",
                  })
                }
              >
                <MapPin weight="bold" />{" "}
                {asset.locationStatus === "known"
                  ? "Change location"
                  : "Set location"}
              </button>
            )}
            <button
              className="secondary-button"
              onClick={() => openCapture("capture", "evidence", { assetId: asset.id })}
            >
              <Paperclip weight="bold" /> Add paper or artifact
            </button>
          </div>
          <div className="readiness-breakdown">
            <div className="section-heading"><div><span className="eyebrow">Transparent score</span><h2>Readiness breakdown</h2></div></div>
            {readinessState.items.map((item) => {
              const detail =
                item.id === "location"
                  ? resolveAssetLocation(asset, workspace)
                  : item.id === "location-detail"
                    ? asset.locationMode === "virtual"
                      ? asset.locationDetail || "Virtual record"
                      : asset.locationMode === "not-applicable"
                        ? "No physical location required"
                        : fullLocationPath ||
                          "Room, shelf, box, or location note missing"
                    : item.id === "reference"
                      ? asset.reference || "Serial, deed, or reference missing"
                      : item.id === "evidence"
                        ? readinessState.evidence.complete
                          ? "Current requirements reviewed"
                          : readinessState.evidence.requirements
                              .filter((requirement) => !requirement.satisfied)
                              .map((requirement) => requirement.type)
                              .join(", ") || "No required material"
                        : `${item.complete ? "Complete" : "Missing"} · ${item.weight}% of readiness`;
              return (
                <ReadinessLine
                  key={item.id}
                  complete={item.complete}
                  label={`${item.label} · ${item.weight}%`}
                  detail={detail}
                />
              );
            })}
          </div>
        </section>

        <aside className="asset-facts">
          {linkedPropertyPlace && (
            <DetailSection icon={Buildings} title="Property Place">
              <strong>{linkedPropertyPlace.name}</strong>
              <p>
                {propertyTenureLabel(linkedPropertyPlace.tenure, {
                  short: true,
                })}
                {" · "}
                {linkedPropertyPlace.address ||
                  "Address can be added from the Place record."}
              </p>
              <Link
                className="secondary-button"
                to={`/places/${linkedPropertyPlace.id}`}
              >
                <MapPin /> Open Place <CaretRight />
              </Link>
            </DetailSection>
          )}
          <DetailSection icon={MapPin} title="Location">
            <strong>
              {hasPhysicalMemoryLocation
                ? place?.name || resolveAssetLocation(asset, workspace)
                : "No current physical location"}
            </strong>
            <p>
              {hasPhysicalMemoryLocation
                ? fullLocationPath || "No room or zone assigned"
                : "This record preserves a person, moment, or story. Continuity does not invent a place for it."}
            </p>
            <StatusPill
              tone={
                asset.locationMode === "virtual" ||
                asset.locationMode === "not-applicable" ||
                asset.locationStatus === "known"
                  ? "success"
                  : "warning"
              }
            >
              {asset.locationMode === "virtual"
                ? "No physical location"
                : asset.locationMode === "not-applicable"
                  ? "Not applicable"
                  : asset.locationStatus === "known"
                    ? "Located"
                    : "Needs confirmation"}
            </StatusPill>
            {place && (
              <small className="location-precision-copy">
                {placePrecisionSummary(place)}
              </small>
            )}
            {hasPhysicalMemoryLocation && (
              <button
                className="text-button"
                onClick={() =>
                  openCapture("capture", "asset", {
                    assetId: asset.id,
                    stage: "location",
                  })
                }
              >
                <PencilSimple /> Change location
              </button>
            )}
          </DetailSection>
          {profileEntries.length > 0 && (
            <DetailSection icon={IdentificationCard} title={`${profile?.label || "Category"} details`}>
              <dl className="profile-facts">
                {profileEntries.map(({ field, value }) => (
                  <div key={field.id}><dt>{field.label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </DetailSection>
          )}
          {isMemoryRecord && (
            <DetailSection icon={User} title="People & memory">
              <strong>{memorySubjectLabel(memorySubjectType)}</strong>
              <p>
                {[
                  asset.profile?.["date-period"],
                  asset.profile?.origin,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Add a period or origin when it helps someone understand the memory."}
              </p>
              {memoryPeople.length ? (
                <div className="passport-memory-people">
                  {memoryPeople.map((person) => (
                    <div key={person.linkId || person.entryId}>
                      <span>
                        <User weight="duotone" />
                      </span>
                      <span>
                        <strong>{person.displayName}</strong>
                        <small>
                          {person.relationship ||
                            person.roleLabel ||
                            "Private connection"}
                        </small>
                      </span>
                      <StatusPill
                        tone={
                          person.showInShowcase ? "success" : "neutral"
                        }
                      >
                        {person.showInShowcase
                          ? "Public label allowed"
                          : person.livingStatus === "living" &&
                              person.consentState === "granted"
                            ? "Private · permission recorded"
                            : "Private"}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="passport-memory-empty">
                  <LockKey weight="duotone" />
                  <span>
                    <strong>No one linked yet</strong>
                    <small>
                      Add a person only when the relationship helps preserve
                      the story.
                    </small>
                  </span>
                </div>
              )}
              <button
                className="text-button"
                onClick={() =>
                  openCapture("capture", "asset", { assetId: asset.id })
                }
              >
                <PencilSimple /> Edit people and context
              </button>
            </DetailSection>
          )}
          <DetailSection icon={Heart} title="Story & meaning">
            <strong>
              {asset.sentimentalValue ||
                (asset.notes
                  ? "A story is attached"
                  : "Every belonging can carry meaning")}
            </strong>
            <p>
              {asset.sentimentalValue ||
                asset.notes ||
                "Record why this matters, who it connects to, or how it entered your life."}
            </p>
            {asset.meaningFacets?.length > 0 && (
              <div className="meaning-facet-list">
                {asset.meaningFacets.map((facet) => (
                  <span key={facet}>{titleCase(facet)}</span>
                ))}
              </div>
            )}
            {asset.legacyIntent !== "undecided" && (
              <StatusPill tone="pending">
                Future intention · {titleCase(asset.legacyIntent)}
              </StatusPill>
            )}
            <button
              className="text-button"
              onClick={() =>
                openCapture("capture", "asset", { assetId: asset.id })
              }
            >
              <PencilSimple /> Add to the story
            </button>
          </DetailSection>
          <DetailSection icon={IdentificationCard} title="Reference">
            <strong>{asset.reference || "Not recorded"}</strong>
            <p>Created {formatDate(asset.createdAt)}</p>
          </DetailSection>
          <DetailSection icon={Paperclip} title="Papers & artifacts">
            {evidence.length ? (
              <div className="evidence-list">
                {evidence.map((item) => {
                  const MaterialIcon = MATERIAL_ICON_BY_KIND[item.kind] || FileText;
                  return (
                    <div className="evidence-row" key={item.id}>
                      <span className={cx("evidence-icon", `is-${item.status}`)}>
                        {item.status === "verified" ? <CheckCircle weight="duotone" /> : <MaterialIcon weight="duotone" />}
                      </span>
                      <Link
                        className="evidence-row-copy"
                        to={`/evidence/${item.id}`}
                      >
                        <strong>{item.type}</strong>
                        <small>
                          {item.fileName || item.linkUrl || item.physicalLocation || item.note || "Metadata record"}
                          {" · "}
                          {item.fileState === "ready_local"
                            ? "On this device"
                            : item.fileName
                              ? "Original missing"
                              : formatDate(item.addedAt)}
                        </small>
                      </Link>
                      {item.status !== "verified" ? (
                        <StatusPill tone="pending">Open to review</StatusPill>
                      ) : (
                        <StatusPill tone="success">Reviewed by you</StatusPill>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>No papers, photos, records, stories, links, or artifacts added yet.</p>
            )}
          </DetailSection>
          <DetailSection icon={Clock} title="Location history">
            {locationHistory.length ? (
              <div className="location-history-list">
                {(showAllLocationHistory
                  ? locationHistory
                  : locationHistory.slice(0, 4)
                ).map((assignment) => {
                  const historyPlace = workspace.places.find(
                    (item) => item.id === assignment.placeId,
                  );
                  const historyActor = workspace.members.find(
                    (member) =>
                      member.id === assignment.createdByMemberId,
                  );
                  const historyPlaceSnapshot = assignment.placeSnapshot;
                  const historyPath = assignment.spacePathSnapshot?.length
                    ? assignment.spacePathSnapshot.map((item) => item.name)
                    : assignment.spaceId
                      ? selectSpacePath(workspace, assignment.spaceId).map(
                          (item) => item.name,
                        )
                      : [];
                  const label =
                    assignment.mode === "virtual"
                      ? assignment.locatorText || "Virtual record"
                      : assignment.mode === "not-applicable"
                        ? "No physical location"
                        : assignment.mode === "unknown"
                          ? "Location unknown"
                          : [
                              historyPlaceSnapshot?.name || historyPlace?.name,
                              ...historyPath,
                              assignment.locatorText,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                  const hasRecordedPin =
                    Number.isFinite(
                      historyPlaceSnapshot?.coordinates?.lat,
                    ) &&
                    Number.isFinite(
                      historyPlaceSnapshot?.coordinates?.lng,
                    );
                  const snapshotDetail = [
                    historyPlaceSnapshot?.formattedAddress,
                    hasRecordedPin
                      ? locationHistoryPrecisionLabel(historyPlaceSnapshot)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={assignment.id}>
                      <span
                        className={cx(
                          "location-history-dot",
                          !assignment.validTo && "is-current",
                        )}
                      />
                      <span>
                        <strong>{label || "Location needs detail"}</strong>
                        <small>
                          {assignment.validTo
                            ? `${formatDate(assignment.validFrom)} – ${formatDate(assignment.validTo)}`
                            : `Current · ${
                                {
                                  "user-confirmed": "confirmed",
                                  suggested: "needs confirmation",
                                  stale: "stale",
                                  disputed: "disputed",
                                }[assignment.confirmationState] ||
                                "needs confirmation"
                              } ${formatDate(assignment.validFrom)}`}
                          {snapshotDetail ? ` · ${snapshotDetail}` : ""}
                        </small>
                        {(assignment.reason || historyActor) && (
                          <small className="location-history-context">
                            {[assignment.reason, historyActor?.name]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </span>
                    </div>
                  );
                })}
                {locationHistory.length > 4 && (
                  <button
                    type="button"
                    className="text-button location-history-toggle"
                    aria-expanded={showAllLocationHistory}
                    onClick={() =>
                      setShowAllLocationHistory((current) => !current)
                    }
                  >
                    {showAllLocationHistory
                      ? "Show recent history"
                      : `View all ${locationHistory.length} moves`}
                  </button>
                )}
              </div>
            ) : (
              <p>No location history recorded yet.</p>
            )}
          </DetailSection>
          <DetailSection icon={Clock} title="Lifecycle">
            <strong className="capitalize">{asset.lifecycleStatus || "active"}</strong>
            <p>Ownership and location history will remain attached to this record.</p>
            <button className="danger-text-button" onClick={archive}><Trash /> Archive record</button>
          </DetailSection>
        </aside>
      </div>
    </div>
  );
}

function ReadinessLine({ complete, label, detail }) {
  return (
    <div className="readiness-line">
      <span className={cx("readiness-check", complete && "is-complete")}>
        {complete ? <Check weight="bold" /> : <Warning weight="bold" />}
      </span>
      <span><strong>{label}</strong><small>{detail}</small></span>
      <strong>{complete ? "Complete" : "Needs attention"}</strong>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }) {
  return (
    <section className="detail-section">
      <div className="detail-section-heading"><Icon weight="duotone" /><h2>{title}</h2></div>
      {children}
    </section>
  );
}

function PlaceDetail({ openCapture }) {
  const { placeId } = useParams();
  const {
    workspace,
    session,
    setAnnouncement,
    commitWorkspaceActions,
  } = useWorkspace();
  const place = workspace.places.find((item) => item.id === placeId && item.status !== "archived");
  const actorMemberId = selectWorkspaceActorMemberId(workspace, session);
  const eligiblePropertyAssets = workspace.assets
    .filter(
      (asset) =>
        asset.lifecycleStatus !== "archived" &&
        isRealEstateAsset(asset) &&
        !asset.propertyPlaceId,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const [selectedPropertyAssetId, setSelectedPropertyAssetId] =
    useState(() => eligiblePropertyAssets[0]?.id || "");
  const [propertyRepairBusy, setPropertyRepairBusy] = useState(false);
  const [propertyRepairError, setPropertyRepairError] = useState("");
  const propertyRepairIdentityRef = useRef(
    createCaptureCommitIdentity(),
  );

  useEffect(() => {
    if (
      selectedPropertyAssetId &&
      eligiblePropertyAssets.some(
        (asset) => asset.id === selectedPropertyAssetId,
      )
    ) {
      return;
    }
    setSelectedPropertyAssetId(
      eligiblePropertyAssets[0]?.id || "",
    );
  }, [
    eligiblePropertyAssets
      .map((asset) => asset.id)
      .join("|"),
    selectedPropertyAssetId,
  ]);

  if (!place) return <RecordNotFound title="Place not found" backTo="/home" />;

  const summary = selectPlaceSummary(workspace, place.id);
  const linkedPropertyAsset = propertyAssetForPlace(workspace, place.id);
  const region = workspace.regions.find((item) => item.id === place.regionId);
  const spaces = workspace.spaces.filter((item) => item.placeId === place.id && !item.archivedAt);
  const assets = workspace.assets.filter(
    (item) => item.placeId === place.id && item.lifecycleStatus !== "archived",
  );
  const assetIds = new Set(assets.map((item) => item.id));
  const placeEvidenceCount = workspace.evidence.filter((item) => assetIds.has(item.assetId)).length;

  async function createPropertyPassport() {
    if (!actorMemberId || !isOwnedPropertyTenure(place.tenure)) {
      setPropertyRepairError(
        "An active workspace owner or editor and an owned Place are required.",
      );
      return;
    }
    setPropertyRepairBusy(true);
    setPropertyRepairError("");
    const identity = propertyRepairIdentityRef.current;
    try {
      await commitWorkspaceActions({
        actions: [
          {
            type: "CREATE_PROPERTY_PROJECTION",
            memberId: actorMemberId,
            placeId: place.id,
            propertyAsset: {
              id: identity.propertyAssetId,
              name: `${place.name} property passport`,
              locationAssignmentId:
                identity.propertyLocationAssignmentId,
            },
            now: identity.committedAt,
          },
        ],
        operationId: identity.operationId,
        now: identity.committedAt,
      });
      setAnnouncement(
        `${place.name} now has one linked property passport.`,
      );
      propertyRepairIdentityRef.current =
        createCaptureCommitIdentity();
    } catch (error) {
      setPropertyRepairError(
        error?.message ||
          "The property passport could not be created. Nothing was changed.",
      );
    } finally {
      setPropertyRepairBusy(false);
    }
  }

  async function linkExistingPropertyPassport() {
    const asset = eligiblePropertyAssets.find(
      (item) => item.id === selectedPropertyAssetId,
    );
    if (!actorMemberId || !asset) {
      setPropertyRepairError(
        "Choose an unlinked property passport first.",
      );
      return;
    }
    setPropertyRepairBusy(true);
    setPropertyRepairError("");
    const identity = propertyRepairIdentityRef.current;
    try {
      await commitWorkspaceActions({
        actions: [
          {
            type: "LINK_PROPERTY_PROJECTION",
            memberId: actorMemberId,
            placeId: place.id,
            assetId: asset.id,
            now: identity.committedAt,
          },
          {
            type: "MOVE_ASSET",
            memberId: actorMemberId,
            assetId: asset.id,
            placeId: place.id,
            spaceId: null,
            locationMode: "physical",
            locationStatus: hasConfirmedExactPlaceLocation(place)
              ? "known"
              : "needs-detail",
            locationDetail: null,
            assignmentId: identity.moveLocationAssignmentId,
            source: "user",
            reason: "Property passport linked to its canonical Place",
            now: identity.committedAt,
          },
        ],
        operationId: identity.operationId,
        now: identity.committedAt,
      });
      setAnnouncement(
        `${asset.name} is now the property passport for ${place.name}.`,
      );
      propertyRepairIdentityRef.current =
        createCaptureCommitIdentity();
    } catch (error) {
      setPropertyRepairError(
        error?.message ||
          "The property passport could not be linked. Nothing was changed.",
      );
    } finally {
      setPropertyRepairBusy(false);
    }
  }

  return (
    <div className="detail-page place-detail">
      <BackLink to="/home" label="World map" />
      <section className="place-hero">
        {place.image ? (
          <img src={place.image} alt={`${place.name} at night`} />
        ) : (
          <div className="place-hero-fallback"><Buildings weight="duotone" /></div>
        )}
        <div className="place-hero-overlay">
          <StatusPill tone="violet" icon={MapPin}>{region?.name || "Unknown region"}</StatusPill>
          <h1>{place.name}</h1>
          <p>{place.kind} · {place.address || "Address can be added later"}</p>
          <div className="place-hero-stats">
            <span><strong>{summary.assetCount}</strong> assets</span>
            <span><strong>{placeEvidenceCount}</strong> papers &amp; artifacts</span>
            <span><strong>{summary.readiness}%</strong> documented</span>
          </div>
        </div>
      </section>

      <div className="place-detail-layout">
        <div className="place-main">
          <section>
            <div className="section-heading">
              <div><span className="eyebrow">Inside this place</span><h2>Rooms & zones</h2></div>
              <button className="secondary-button" onClick={() => openCapture("capture", "space", { placeId: place.id })}>
                <Plus /> Add room or zone
              </button>
            </div>
            {spaces.length ? (
              <div className="space-grid">
                {spaces.map((space) => {
                  const spaceAssets = assets.filter((asset) => asset.spaceId === space.id);
                  const spacePath = selectSpacePath(workspace, space.id);
                  const spaceReadiness = spaceAssets.length
                    ? Math.round(spaceAssets.reduce((sum, asset) => sum + readinessPercent(asset, workspace), 0) / spaceAssets.length)
                    : 0;
                  return (
                    <Link key={space.id} to={`/places/${place.id}/spaces/${space.id}`} className="space-card">
                      <span className="space-card-icon"><Archive weight="duotone" /></span>
                      <span>
                        <strong>{space.name}</strong>
                        <small>
                          {spacePath.map((item) => item.name).join(" · ")}
                          {" · "}
                          {spaceAssets.length} records
                        </small>
                      </span>
                      <ProgressRing value={spaceReadiness} size={42} />
                      <CaretRight />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Archive}
                title={place.kind === "home" || place.kind === "property" ? "No rooms yet" : "Zones are optional"}
                copy={place.kind === "home" || place.kind === "property" ? "Add a room, safe, wardrobe, or zone before guided capture." : "You can add assets directly to this place."}
              />
            )}
          </section>

          <section>
            <div className="section-heading">
              <div><span className="eyebrow">Records</span><h2>Assets in {place.name}</h2></div>
              <button className="primary-button" onClick={() => openCapture("capture", "asset", { placeId: place.id })}>
                <Plus /> Add asset
              </button>
            </div>
            {assets.length ? <AssetResults assets={assets} workspace={workspace} /> : (
              <EmptyState icon={Cube} title="No assets yet" copy="Add one important object, document, or memory first." />
            )}
          </section>
        </div>
        <aside className="place-side">
          <section className="place-location-card">
            <div className="detail-section-heading">
              <Buildings weight="duotone" />
              <h2>Property relationship</h2>
            </div>
            <strong>
              {propertyTenureLabel(place.tenure, { short: true })}
            </strong>
            {linkedPropertyAsset ? (
              <>
                <p>
                  One linked Asset Passport holds ownership papers, value,
                  insurance, and property history.
                </p>
                <Link
                  className="secondary-button"
                  to={`/assets/${linkedPropertyAsset.id}`}
                >
                  <IdentificationCard /> Open property passport{" "}
                  <CaretRight />
                </Link>
              </>
            ) : isOwnedPropertyTenure(place.tenure) ? (
              <>
                <p>
                  No property passport is linked yet. Create one, or reconcile
                  an existing unlinked property record without duplicating the
                  property.
                </p>
                <div className="property-repair-actions">
                  {eligiblePropertyAssets.length ? (
                    <>
                      <label>
                        <span>Existing property passport</span>
                        <select
                          value={selectedPropertyAssetId}
                          onChange={(event) => {
                            setSelectedPropertyAssetId(
                              event.target.value,
                            );
                            setPropertyRepairError("");
                          }}
                          disabled={propertyRepairBusy}
                        >
                          {eligiblePropertyAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          propertyRepairBusy ||
                          !selectedPropertyAssetId
                        }
                        onClick={linkExistingPropertyPassport}
                      >
                        <LinkSimple /> Link existing passport
                      </button>
                      <small>
                        This also records this Place as that passport&apos;s
                        current property location.
                      </small>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="primary-button"
                    disabled={propertyRepairBusy}
                    onClick={createPropertyPassport}
                  >
                    <IdentificationCard />{" "}
                    {propertyRepairBusy
                      ? "Saving…"
                      : "Create property passport"}
                  </button>
                  {propertyRepairError ? (
                    <small className="field-error" role="alert">
                      {propertyRepairError}
                    </small>
                  ) : null}
                </div>
              </>
            ) : (
              <p>
                This is a location record only. No ownership passport was
                created.
              </p>
            )}
          </section>
          <section className="place-location-card">
            <div className="detail-section-heading">
              <MapPin weight="duotone" />
              <h2>Place pin</h2>
            </div>
            {place.coordinates?.lat !== null &&
            place.coordinates?.lng !== null ? (
              <>
                <strong>
                  {placePrecisionSummary(place)}
                </strong>
                <p>{place.address || "No formatted address saved."}</p>
                <small>
                  {Number(place.coordinates.lat).toFixed(6)},{" "}
                  {Number(place.coordinates.lng).toFixed(6)}
                  {place.horizontalAccuracyMeters !== null
                    ? ` · ±${Math.round(place.horizontalAccuracyMeters)} m`
                    : ` · ${locationSourceLabel(place.locationSource)}`}
                </small>
              </>
            ) : (
              <>
                <strong>City-level only</strong>
                <p>
                  This Place does not have a property pin yet.
                </p>
              </>
            )}
            <button
              className="secondary-button"
              onClick={() =>
                openCapture("capture", "place", { placeId: place.id })
              }
            >
              <PencilSimple />{" "}
              {place.coordinates?.lat !== null &&
              place.locationPrecision !== "locality_only"
                ? "Adjust pin"
                : "Set property pin"}
            </button>
          </section>
          <section className="sticky-readiness-card">
            <span className="eyebrow">Place readiness</span>
            <div><ProgressRing value={summary.readiness} size={76} /><strong>{summary.readiness}%</strong></div>
            <p>Based on real fields and verified requirements—not an AI or legal score.</p>
            <button className="gradient-button" onClick={() => openCapture("capture", spaces.length ? "asset" : "space", { placeId: place.id })}>
              {spaces.length ? "Add next record" : "Add the first zone"} <ArrowRight />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SpaceDetail({ openCapture }) {
  const { placeId, spaceId } = useParams();
  const { workspace } = useWorkspace();
  const place = workspace.places.find(
    (item) =>
      item.id === placeId &&
      item.status !== "archived",
  );
  const space = workspace.spaces.find((item) => item.id === spaceId && item.placeId === placeId);
  if (!place || !space) {
    return (
      <RecordNotFound
        title="Room or zone not found"
        backTo={place ? `/places/${place.id}` : "/home"}
      />
    );
  }
  const assets = workspace.assets.filter(
    (item) => item.spaceId === space.id && item.lifecycleStatus !== "archived",
  );
  const readiness = assets.length
    ? Math.round(assets.reduce((sum, item) => sum + readinessPercent(item, workspace), 0) / assets.length)
    : 0;

  return (
    <div className="detail-page">
      <BackLink to={`/places/${place.id}`} label={place.name} />
      <PageHeader
        eyebrow={`${space.kind} · ${place.name}`}
        title={space.name}
        copy="A location container for assets and evidence. Add detail only when it helps retrieval."
        action={
          <div className="page-header-button-group">
            <button
              className="secondary-button"
              onClick={() =>
                openCapture("capture", "space", {
                  placeId: place.id,
                  spaceId: space.id,
                })
              }
            >
              <PencilSimple /> Edit room or container
            </button>
            <button className="primary-button" onClick={() => openCapture("capture", "asset", { placeId: place.id, spaceId: space.id })}>
              <Plus /> Add asset here
            </button>
          </div>
        }
      />
      <div className="room-summary-strip">
        <span><Cube /><strong>{assets.length}</strong> records</span>
        <span><ShieldCheck /><strong>{readiness}%</strong> documented</span>
        <span><Clock /><strong>{formatDate(space.lastReviewedAt || space.createdAt)}</strong> reviewed</span>
      </div>
      {assets.length ? (
        <AssetResults assets={assets} workspace={workspace} />
      ) : (
        <EmptyState
          icon={Camera}
          title={`Start ${space.name}`}
          copy="Add one object now. Guided camera capture will connect here once the upload pipeline is real."
          action={<button className="primary-button" onClick={() => openCapture("capture", "asset", { placeId: place.id, spaceId: space.id })}>Add first asset</button>}
        />
      )}
    </div>
  );
}

function FamilyScreen({ openCapture }) {
  const { workspace, dispatch, setAnnouncement } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMemberId = searchParams.get("member");
  const requestedMemberExists = workspace.members.some(
    (member) => member.id === requestedMemberId,
  );
  const invalidMemberLink = Boolean(
    requestedMemberId && !requestedMemberExists,
  );
  const selectedMemberId = invalidMemberLink
    ? null
    : requestedMemberId || workspace.members[0]?.id || null;
  const selected = workspace.members.find((member) => member.id === selectedMemberId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "viewer" });
  const [inviteError, setInviteError] = useState("");

  function selectMember(memberId) {
    const next = new URLSearchParams(searchParams);
    next.set("member", memberId);
    setSearchParams(next, { replace: true });
  }

  function submitInvite(event) {
    event.preventDefault();
    if (!invite.name.trim() || !invite.email.trim()) return;
    const email = invite.email.trim().toLowerCase();
    if (
      workspace.members.some(
        (member) => member.email?.trim().toLowerCase() === email,
      )
    ) {
      setInviteError("That email already belongs to a household member.");
      return;
    }
    dispatch({
      type: "INVITE_MEMBER",
      member: {
        id: createId("member"),
        name: invite.name.trim(),
        email,
        accessRole: invite.role,
        createdAt: new Date().toISOString(),
      },
    });
    setInvite({ name: "", email: "", role: "viewer" });
    setInviteError("");
    setInviteOpen(false);
    setAnnouncement(`Demo invitation created for ${invite.name}. No email was sent.`);
  }

  return (
    <div className="content-page">
      <PageHeader
        eyebrow="Household access"
        title="Family"
        copy="Decide who can see which records. Real invitations and permissions require the authenticated backend."
        action={
          <button
            className="primary-button"
            onClick={() => {
              setInviteError("");
              setInviteOpen(true);
            }}
          >
            <UserPlus /> Invite member
          </button>
        }
      />
      <div className="family-layout">
        <section className="member-panel">
          <div className="section-heading"><div><span className="eyebrow">People</span><h2>{workspace.members.length} members</h2></div></div>
          <div className="member-list">
            {workspace.members.map((member) => (
              <button
                key={member.id}
                className={cx("member-row", member.id === selectedMemberId && "is-active")}
                aria-pressed={member.id === selectedMemberId}
                onClick={() => selectMember(member.id)}
              >
                <span className="member-avatar">{member.initials || member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                <span><strong>{member.name}</strong><small>{titleCase(member.accessRole)} · {titleCase(member.inviteStatus)}</small></span>
                <StatusPill tone={member.inviteStatus === "active" ? "success" : "pending"}>{titleCase(member.inviteStatus)}</StatusPill>
                <CaretRight />
              </button>
            ))}
          </div>
        </section>
        <aside className="member-detail">
          {selected ? (
            <>
              <span className="member-avatar is-large">{selected.initials || selected.name.slice(0, 2).toUpperCase()}</span>
              <span className="eyebrow">Member access</span>
              <h2>{selected.name}</h2>
              <p>{selected.email || "Email hidden in sample mode"}</p>
              <div className="permission-summary">
                <div><ShieldCheck /><span><strong>{titleCase(selected.accessRole)}</strong><small>Household role</small></span></div>
                <div><MapPin /><span><strong>{workspace.places.filter((place) => place.status !== "archived").length} places</strong><small>Demo visibility</small></span></div>
                <div><Clock /><span><strong>No live log</strong><small>Backend required</small></span></div>
              </div>
              <button className="secondary-button" disabled title="Available after authenticated access control is built">
                Manage permissions · Coming soon
              </button>
            </>
          ) : (
            <EmptyState
              icon={UsersThree}
              title={
                invalidMemberLink
                  ? "Member link unavailable"
                  : "Choose a member"
              }
              copy={
                invalidMemberLink
                  ? "This person may have been removed, or the shared link is incomplete."
                  : "Select a person to review their demo access."
              }
              action={
                invalidMemberLink ? (
                  <button
                    className="secondary-button"
                    onClick={() => setSearchParams({}, { replace: true })}
                  >
                    Show household members
                  </button>
                ) : null
              }
            />
          )}
        </aside>
      </div>

      <AnimatePresence>
        {inviteOpen && (
          <Modal title="Invite a household member" onClose={() => setInviteOpen(false)}>
            <form className="stacked-form" onSubmit={submitInvite}>
              <FormField label="Name"><input value={invite.name} onChange={(e) => { setInvite({ ...invite, name: e.target.value }); setInviteError(""); }} required /></FormField>
              <FormField label="Email"><input type="email" value={invite.email} onChange={(e) => { setInvite({ ...invite, email: e.target.value }); setInviteError(""); }} required /></FormField>
              <FormField label="Role">
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="co-owner">Co-owner</option>
                </select>
              </FormField>
              <div className="prototype-disclosure"><Info /> This records a demo invitation only. No email is sent.</div>
              {inviteError && (
                <div className="form-error" role="alert">
                  <Warning weight="bold" /> {inviteError}
                </div>
              )}
              <button className="primary-button" type="submit">Create demo invite <ArrowRight /></button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function VaultScreen({ exportWorkspace, openCapture }) {
  const {
    workspace,
    dispatch,
    setAnnouncement,
    storageScopeId,
    recoveryHeadRevision,
    adoptRecoveryHead,
    session,
  } = useWorkspace();
  const [selectedKind, setSelectedKind] = useState("all");
  const [showAllMaterials, setShowAllMaterials] = useState(false);
  const activeAssets = workspace.assets.filter(
    (asset) => asset.lifecycleStatus !== "archived",
  );
  const activeAssetIds = new Set(activeAssets.map((asset) => asset.id));
  const evidence = workspace.evidence
    .filter((item) => activeAssetIds.has(item.assetId))
    .sort((left, right) =>
      String(right.addedAt).localeCompare(String(left.addedAt)),
    );
  const assetById = new Map(activeAssets.map((asset) => [asset.id, asset]));
  const pending = evidence.filter((item) => item.status === "pending").length;
  const materialGroups = MATERIAL_KIND_OPTIONS.map((kind) => ({
    ...kind,
    icon: MATERIAL_ICON_BY_KIND[kind.id] || FileText,
    count: evidence.filter((item) => item.kind === kind.id).length,
  }));
  const visibleMaterials =
    selectedKind === "all"
      ? evidence
      : evidence.filter((item) => item.kind === selectedKind);
  const displayedMaterials = showAllMaterials
    ? visibleMaterials
    : visibleMaterials.slice(0, 8);

  return (
    <div className="vault-page">
      <div className="vault-heading">
        <div>
          <span className="eyebrow">Digital continuity</span>
          <h1>Vault</h1>
          <p>Papers, artifacts, photos, records, stories, and links—connected to the assets they support.</p>
        </div>
        <div className="vault-heading-actions">
          <StatusPill tone="pending" icon={LockKey}>Local device prototype</StatusPill>
          <button
            className="primary-button"
            onClick={() =>
              openCapture(
                "capture",
                activeAssets.length ? "evidence" : "asset",
              )
            }
          >
            <Plus weight="bold" />{" "}
            {activeAssets.length ? "Add material" : "Add first asset"}
          </button>
        </div>
      </div>
      <div className="vault-layout">
        <section className="vault-collections">
          <div className="section-heading"><div><span className="eyebrow">Material types</span><h2>Browse by format</h2></div></div>
          <div className="collection-grid">
            {materialGroups.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                className={cx("collection-card", selectedKind === id && "is-active")}
                aria-pressed={selectedKind === id}
                onClick={() => {
                  setSelectedKind((current) => current === id ? "all" : id);
                  setShowAllMaterials(false);
                }}
              >
                <span><Icon weight="duotone" /></span>
                <strong>{label}</strong>
                <small>{count} linked {count === 1 ? "record" : "records"}</small>
                <CaretRight />
              </button>
            ))}
          </div>
          <div className="vault-document-list">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{selectedKind === "all" ? "Recent" : getMaterialKind(selectedKind)?.label}</span>
                <h2>Linked materials</h2>
              </div>
              {visibleMaterials.length > 8 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowAllMaterials((current) => !current)}
                >
                  {showAllMaterials
                    ? "Show recent 8"
                    : `View all ${visibleMaterials.length}`}
                </button>
              )}
            </div>
            {visibleMaterials.length ? displayedMaterials.map((item) => {
              const asset = assetById.get(item.assetId);
              const MaterialIcon = MATERIAL_ICON_BY_KIND[item.kind] || FileText;
              return (
              <Link to={`/assets/${item.assetId}`} className="vault-record" key={item.id}>
                <span><MaterialIcon weight="duotone" /></span>
                <span><strong>{item.type}</strong><small>{asset?.name || "Unlinked record"} · {materialStatusLabel(item.status)}</small></span>
                <CaretRight />
              </Link>
              );
            }) : <EmptyState icon={Paperclip} title="No materials here yet" copy="Open any asset and add a paper, artifact, photo, record, story, or link." />}
          </div>
        </section>
        <aside className="vault-status" aria-labelledby="vault-protection-title">
          <span className="vault-shield"><ShieldCheck weight="duotone" /></span>
          <span className="eyebrow">Current build status</span>
          <h2 id="vault-protection-title">Honest protection state</h2>
          <p>
            Metadata and selected originals are stored together under an
            IndexedDB-authoritative device generation with integrity checks.
            You can create a portable recovery kit, or connect the local secure
            account service below to prove authenticated encrypted retrieval
            across signed-in browser sessions on this development computer.
          </p>
          <div className="vault-status-list">
            <span><CheckCircle /> Atomic device generations with one-step undo</span>
            <span><CheckCircle /> On-device originals and SHA-256 checksums</span>
            <span><CheckCircle /> Manual encrypted recovery kit</span>
            <span><CheckCircle /> Explicit pending material review</span>
            <span className="is-pending">
              <Clock /> {pending} {pending === 1 ? "item" : "items"} awaiting review
            </span>
            <span className="is-pending"><Clock /> Production cloud and passkeys still require deployment</span>
          </div>
          <button className="secondary-button" onClick={exportWorkspace}><DownloadSimple /> Export readable demo JSON</button>
        </aside>
      </div>
      <SecureAccountPanel
        workspace={workspace}
        dispatch={dispatch}
        setAnnouncement={setAnnouncement}
        storageScopeId={storageScopeId}
        recoveryHeadRevision={recoveryHeadRevision}
        adoptRecoveryHead={adoptRecoveryHead}
      />
      <EncryptedRecoveryKit />
    </div>
  );
}

function EncryptedRecoveryKit() {
  const {
    workspace,
    dispatch,
    setAnnouncement,
    storageScopeId,
    recoveryHeadRevision,
    adoptRecoveryHead,
    session,
  } = useWorkspace();
  const [mode, setMode] = useState("create");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportConfirmation, setExportConfirmation] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedKit, setSelectedKit] = useState(null);
  const [recoveryPreview, setRecoveryPreview] = useState(null);
  const [backupPreflight, setBackupPreflight] = useState(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [partialBackupAcknowledged, setPartialBackupAcknowledged] =
    useState(false);
  const [rollbackInfo, setRollbackInfo] = useState(() => {
    try {
      return readRecoveryRollback(storageScopeId);
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    if (mode !== "create") return undefined;
    let disposed = false;
    setPreflightBusy(true);
    setPartialBackupAcknowledged(false);
    void runBackupPreflight({
      workspace,
      storageScopeId,
    })
      .then((result) => {
        if (!disposed) setBackupPreflight(result);
      })
      .catch((error) => {
        if (disposed) return;
        setBackupPreflight(null);
        setFeedback({
          tone: "error",
          text:
            error?.message ||
            "This device could not inspect recovery coverage.",
        });
      })
      .finally(() => {
        if (!disposed) setPreflightBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [mode, storageScopeId, workspace]);

  function clearSensitiveState(nextMode = mode) {
    setMode(nextMode);
    setExportPassphrase("");
    setExportConfirmation("");
    setImportPassphrase("");
    setSelectedFile(null);
    setSelectedKit(null);
    setRecoveryPreview(null);
    setPartialBackupAcknowledged(false);
    setFeedback(null);
    if (importInputRef.current) importInputRef.current.value = "";
  }

  async function createKit(event) {
    event.preventDefault();
    setFeedback(null);
    if (exportPassphrase.length < 12) {
      setFeedback({
        tone: "error",
        text: "Use a passphrase with at least 12 characters.",
      });
      return;
    }
    if (exportPassphrase !== exportConfirmation) {
      setFeedback({
        tone: "error",
        text: "The passphrases do not match.",
      });
      return;
    }

    setBusy("create");
    try {
      const preflight = await runBackupPreflight({
        workspace,
        storageScopeId,
      });
      setBackupPreflight(preflight);
      if (preflight.status === "blocked") {
        throw new Error(
          preflight.coverage.integrityFailures[0]?.message ||
            preflight.capacity.blockingReasons[0]?.message ||
            "Recovery creation is blocked until this device passes integrity and capacity checks.",
        );
      }
      if (
        preflight.status === "partial" &&
        !partialBackupAcknowledged
      ) {
        throw new Error(
          "Review and acknowledge the missing originals or excluded drafts before creating this partial recovery copy.",
        );
      }
      const originals = preflight.originals;
      const kit = await createEncryptedRecoveryKit({
        workspace,
        originals,
        passphrase: exportPassphrase,
      });
      const download = new Blob([JSON.stringify(kit)], {
        type: "application/vnd.continuity.encrypted+json",
      });
      const url = URL.createObjectURL(download);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `continuity-recovery-${kit.createdAt.slice(
        0,
        10,
      )}.continuity-kit`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      const originalLabel = `${originals.length} ${
        originals.length === 1 ? "original" : "originals"
      }`;
      const missingCount =
        preflight.coverage.missingOriginalCount;
      const missingLabel = missingCount
        ? ` ${missingCount} referenced ${
            missingCount === 1 ? "file is" : "files are"
          } metadata-only because the original is not on this device.`
        : "";
      const draftLabel = preflight.drafts.totalDraftCount
        ? ` ${preflight.drafts.totalDraftCount} unfinished ${
            preflight.drafts.totalDraftCount === 1
              ? "draft was"
              : "drafts were"
          } excluded.`
        : "";
      setFeedback({
        tone: "success",
        text: `Encrypted recovery-kit download started with ${originalLabel}.${missingLabel}${draftLabel}`,
      });
      setAnnouncement(
        "Encrypted recovery-kit download started. No cloud backup was created.",
      );
      setExportPassphrase("");
      setExportConfirmation("");
    } catch (error) {
      setExportPassphrase("");
      setExportConfirmation("");
      setFeedback({
        tone: "error",
        text:
          error?.message ||
          "The encrypted recovery kit could not be created.",
      });
    } finally {
      setBusy("");
    }
  }

  async function chooseRecoveryFile(file) {
    setRecoveryPreview(null);
    setSelectedKit(null);
    setSelectedFile(null);
    setFeedback(null);
    if (!file) return;
    setBusy("choose");
    try {
      const kit = await parseEncryptedRecoveryKit(file);
      setSelectedFile(file);
      setSelectedKit(kit);
      setFeedback({
        tone: "neutral",
        text: "Encrypted envelope recognized. Enter its passphrase to inspect the workspace before replacing anything.",
      });
    } catch (error) {
      setImportPassphrase("");
      setFeedback({
        tone: "error",
        text: error?.message || "That recovery-kit file could not be read.",
      });
      if (importInputRef.current) importInputRef.current.value = "";
    } finally {
      setBusy("");
    }
  }

  async function openRecoveryKit(event) {
    event.preventDefault();
    if (!selectedKit) {
      setFeedback({
        tone: "error",
        text: "Choose an encrypted recovery-kit file first.",
      });
      return;
    }
    setBusy("open");
    setFeedback(null);
    try {
      const recovered = await decryptEncryptedRecoveryKit(
        selectedKit,
        importPassphrase,
      );
      const incomingVersion = Number(
        recovered.workspace?.version ?? recovered.workspace?.schemaVersion,
      );
      if (
        !Number.isFinite(incomingVersion) ||
        incomingVersion > SNAPSHOT_VERSION
      ) {
        throw new Error(
          "This kit uses a newer workspace version and was not opened.",
        );
      }
      if (
        session?.householdId &&
        recovered.workspace?.household?.id !== session.householdId
      ) {
        throw new Error(
          "This recovery kit belongs to a different household and was not opened.",
        );
      }
      const restorePreflight = await runRestorePreflight({
        recovered,
      });
      if (restorePreflight.status === "blocked") {
        throw new Error(
          restorePreflight.coverage.integrityFailures[0]
            ?.message ||
            "The recovery kit failed restore integrity checks.",
        );
      }
      setRecoveryPreview({
        ...recovered,
        workspace: normalizeWorkspace(recovered.workspace),
        originals: restorePreflight.originals,
        restorePreflight,
      });
      setImportPassphrase("");
      setFeedback({
        tone: "success",
        text: "Kit opened in memory. Review the summary before restoring it.",
      });
    } catch (error) {
      setImportPassphrase("");
      setFeedback({
        tone: "error",
        text:
          error?.message ||
          "The passphrase is incorrect or the kit failed integrity validation.",
      });
    } finally {
      setBusy("");
    }
  }

  async function restoreRecoveryKit() {
    if (!recoveryPreview) return;
    setBusy("restore");
    setFeedback(null);
    try {
      if (
        session?.householdId &&
        recoveryPreview.workspace?.household?.id !== session.householdId
      ) {
        throw new Error(
          "This recovery kit belongs to a different household and was not restored.",
        );
      }
      const restorePreflight = await runRestorePreflight({
        recovered: recoveryPreview,
      });
      if (restorePreflight.status === "blocked") {
        throw new Error(
          restorePreflight.coverage.integrityFailures[0]
            ?.message ||
            "The recovery kit failed its final integrity check.",
        );
      }
      if (
        restorePreflight.browserStorage.status ===
        "insufficient"
      ) {
        throw new Error(
          "This device does not currently report enough durable space to stage the recovery copy. The current workspace is unchanged.",
        );
      }
      const replacementFiles = restorePreflight.originals.map((original) => {
        const file = new File([original.blob], original.fileName, {
          type: original.fileType,
          lastModified: Date.parse(recoveryPreview.createdAt),
        });
        return {
          evidenceId: original.evidenceId,
          originalVersionId: original.originalVersionId,
          file,
          expectedFileName: original.fileName,
          expectedFileType: original.fileType,
          expectedFileSize: original.fileSize,
          expectedFileChecksum: original.fileChecksum,
        };
      });
      const activation = await stageAndActivateRecoveryGeneration({
        scopeId: storageScopeId,
        currentWorkspace: workspace,
        recoveredWorkspace: recoveryPreview.workspace,
        files: replacementFiles,
        expectedHeadRevision: recoveryHeadRevision ?? undefined,
      });
      adoptRecoveryHead(
        activation,
        recoveryPreview.workspace,
      );
      dispatch({
        type: "REPLACE_WORKSPACE",
        workspace: recoveryPreview.workspace,
      });
      setRollbackInfo(activation.rollback);
      const restoredCount = recoveryPreview.originals.length;
      setAnnouncement(
        `Workspace restored with ${restoredCount} ${
          restoredCount === 1 ? "original" : "originals"
        }.`,
      );
      setSelectedFile(null);
      setSelectedKit(null);
      setRecoveryPreview(null);
      if (importInputRef.current) importInputRef.current.value = "";
      setFeedback({
        tone: "success",
        text: `Workspace restored on this device with ${restoredCount} ${
          restoredCount === 1 ? "original" : "originals"
        }. The previous verified generation is available to undo.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error?.message ||
          "The workspace was not replaced because restoration failed.",
      });
    } finally {
      setBusy("");
    }
  }

  async function undoLastRestore() {
    setBusy("rollback");
    setFeedback(null);
    try {
      const result = await rollbackRecoveryGeneration({
        scopeId: storageScopeId,
        expectedHeadRevision: recoveryHeadRevision ?? undefined,
      });
      adoptRecoveryHead(result, result.workspace);
      dispatch({
        type: "REPLACE_WORKSPACE",
        workspace: result.workspace,
      });
      setRollbackInfo(null);
      setAnnouncement(
        "The previous verified workspace generation is active again.",
      );
      setFeedback({
        tone: "success",
        text: result.cleaned
          ? "The last restore was undone and its inactive staged files were removed."
          : "The last restore was undone. Some inactive staged files could not be reclaimed, but they are not active.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error?.message ||
          "The previous workspace generation could not be reactivated.",
      });
    } finally {
      setBusy("");
    }
  }

  const createDisabled =
    busy !== "" ||
    preflightBusy ||
    !backupPreflight ||
    backupPreflight.status === "blocked" ||
    (backupPreflight.status === "partial" &&
      !partialBackupAcknowledged) ||
    exportPassphrase.length < 12 ||
    exportPassphrase !== exportConfirmation;
  const openDisabled =
    busy !== "" || !selectedKit || importPassphrase.length < 12;

  return (
    <section className="encrypted-recovery-section" aria-labelledby="recovery-kit-title">
      <div className="recovery-kit-intro">
        <span className="recovery-kit-mark">
          <Key weight="duotone" />
        </span>
        <span className="eyebrow">Portable recovery</span>
        <h2 id="recovery-kit-title">Take your continuity archive with you.</h2>
        <p>
          Create one passphrase-protected file containing this workspace and
          every original currently available on this device. Move it manually
          to another trusted device, then inspect it before restoring.
        </p>
        <div className="recovery-trust-lines">
          <span><ShieldCheck /> AES-GCM encryption and integrity validation</span>
          <span><LockKey /> Passphrase stays in memory and is never saved</span>
          <span><HardDrives /> Manual file transfer, not cloud synchronization</span>
        </div>
      </div>

      <div className="recovery-kit-console">
        <div className="recovery-mode-tabs" role="tablist" aria-label="Recovery-kit action">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={cx(mode === "create" && "is-active")}
            onClick={() => clearSensitiveState("create")}
          >
            Create kit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "restore"}
            className={cx(mode === "restore" && "is-active")}
            onClick={() => clearSensitiveState("restore")}
          >
            Restore kit
          </button>
        </div>

        {mode === "create" ? (
          <form className="recovery-kit-form" onSubmit={createKit}>
            <div className="recovery-console-heading">
              <div>
                <span className="eyebrow">Encrypted export</span>
                <h3>Create a portable kit</h3>
              </div>
              <StatusPill tone="success" icon={ShieldCheck}>Local encryption</StatusPill>
            </div>
            {preflightBusy ? (
              <div className="recovery-preflight-card is-scanning" role="status">
                <Clock />
                <span>
                  <strong>Checking this device…</strong>
                  <small>Verifying originals, unfinished drafts, and package capacity.</small>
                </span>
              </div>
            ) : backupPreflight ? (
              <div
                className={cx(
                  "recovery-preflight-card",
                  `is-${backupPreflight.status}`,
                )}
              >
                <div className="recovery-preflight-heading">
                  {backupPreflight.status === "blocked" ? (
                    <Warning weight="duotone" />
                  ) : (
                    <ShieldCheck weight="duotone" />
                  )}
                  <span>
                    <strong>
                      {backupPreflight.coverage.includedOriginalCount} of{" "}
                      {backupPreflight.coverage.referencedOriginalCount} referenced originals included
                    </strong>
                    <small>
                      {formatFileSize(backupPreflight.coverage.originalBytes)} original bytes ·{" "}
                      {formatFileSize(
                        backupPreflight.capacity.projectedPlaintextBytes || 0,
                      )}{" "}
                      of{" "}
                      {formatFileSize(
                        backupPreflight.capacity.limits.maxPlaintextBytes,
                      )}{" "}
                      recovery payload
                    </small>
                  </span>
                </div>
                {backupPreflight.coverage.integrityFailures.length > 0 && (
                  <p className="recovery-preflight-error">
                    Backup is blocked:{" "}
                    {backupPreflight.coverage.integrityFailures[0].message}
                  </p>
                )}
                {backupPreflight.capacity.blockingReasons.length > 0 && (
                  <p className="recovery-preflight-error">
                    {backupPreflight.capacity.blockingReasons[0].message}
                  </p>
                )}
                {backupPreflight.coverage.missingOriginalCount > 0 && (
                  <div className="recovery-preflight-missing">
                    <strong>
                      {backupPreflight.coverage.missingOriginalCount}{" "}
                      {backupPreflight.coverage.missingOriginalCount === 1
                        ? "original is"
                        : "originals are"}{" "}
                      unavailable on this device
                    </strong>
                    <small>
                      {backupPreflight.coverage.missing
                        .slice(0, 3)
                        .map((item) => item.fileName)
                        .join(", ")}
                      {backupPreflight.coverage.missingOriginalCount > 3
                        ? ` +${backupPreflight.coverage.missingOriginalCount - 3} more`
                        : ""}
                    </small>
                  </div>
                )}
                {backupPreflight.drafts.totalDraftCount > 0 && (
                  <p>
                    {backupPreflight.drafts.totalDraftCount} unfinished{" "}
                    {backupPreflight.drafts.totalDraftCount === 1
                      ? "draft is"
                      : "drafts are"}{" "}
                    excluded
                    {backupPreflight.drafts.knownBytes
                      ? ` · ${formatFileSize(backupPreflight.drafts.knownBytes)}`
                      : ""}.
                  </p>
                )}
                {backupPreflight.browserStorage.status ===
                  "insufficient" && (
                  <p className="recovery-preflight-error">
                    This browser reports insufficient durable space for the
                    projected package.
                  </p>
                )}
                {backupPreflight.status === "partial" && (
                  <label className="recovery-partial-acknowledgement">
                    <input
                      type="checkbox"
                      checked={partialBackupAcknowledged}
                      onChange={(event) =>
                        setPartialBackupAcknowledged(
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      I understand this recovery copy contains the metadata, but
                      not the missing originals or unfinished drafts listed
                      above.
                    </span>
                  </label>
                )}
              </div>
            ) : null}
            <FormField
              label="Recovery passphrase"
              hint="At least 12 characters. You will need the exact phrase to restore."
            >
              <input
                type="password"
                autoComplete="new-password"
                value={exportPassphrase}
                onChange={(event) => setExportPassphrase(event.target.value)}
                placeholder="Choose a memorable private phrase"
              />
            </FormField>
            <FormField label="Confirm passphrase">
              <input
                type="password"
                autoComplete="new-password"
                value={exportConfirmation}
                onChange={(event) => setExportConfirmation(event.target.value)}
                placeholder="Repeat the phrase"
              />
            </FormField>
            <button
              className="gradient-button"
              type="submit"
              disabled={createDisabled}
            >
              {busy === "create" ? (
                <><Clock /> Encrypting kit…</>
              ) : (
                <><DownloadSimple /> Create encrypted recovery kit</>
              )}
            </button>
          </form>
        ) : (
          <form className="recovery-kit-form" onSubmit={openRecoveryKit}>
            <div className="recovery-console-heading">
              <div>
                <span className="eyebrow">Protected restore</span>
                <h3>Inspect before replacing</h3>
              </div>
              <StatusPill tone="pending" icon={UploadSimple}>Manual import</StatusPill>
            </div>
            <input
              ref={importInputRef}
              type="file"
              hidden
              accept=".continuity-kit,application/json,application/vnd.continuity.encrypted+json"
              onChange={(event) =>
                chooseRecoveryFile(event.target.files?.[0] || null)
              }
            />
            <button
              className="recovery-file-picker"
              type="button"
              disabled={busy !== ""}
              onClick={() => importInputRef.current?.click()}
            >
              <UploadSimple weight="duotone" />
              <span>
                <strong>
                  {selectedFile?.name || "Choose encrypted recovery kit"}
                </strong>
                <small>
                  {selectedFile
                    ? `${formatFileSize(selectedFile.size)} · created ${formatDate(
                        selectedKit?.createdAt,
                      )}`
                    : "Continuity kit · encrypted JSON envelope"}
                </small>
              </span>
              <CaretRight />
            </button>
            {!recoveryPreview && (
              <>
                <FormField label="Recovery passphrase">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={importPassphrase}
                    onChange={(event) => setImportPassphrase(event.target.value)}
                    placeholder="Enter the kit passphrase"
                  />
                </FormField>
                <button
                  className="primary-button recovery-open-button"
                  type="submit"
                  disabled={openDisabled}
                >
                  {busy === "open" ? (
                    <><Clock /> Validating…</>
                  ) : (
                    <><LockKey /> Open and review kit</>
                  )}
                </button>
              </>
            )}
            {recoveryPreview && (
              <div className="recovery-preview-card">
                <div>
                  <span className="eyebrow">Decrypted in memory</span>
                  <strong>{recoveryPreview.workspace.household.name}</strong>
                  <small>
                    {recoveryPreview.workspace.assets.length} assets ·{" "}
                    {recoveryPreview.originals.length} stored{" "}
                    {recoveryPreview.originals.length === 1
                      ? "original"
                      : "originals"}
                  </small>
                </div>
                <div className="recovery-restore-preflight">
                  <span>
                    <strong>
                      {
                        recoveryPreview.restorePreflight.coverage
                          .includedOriginalCount
                      }{" "}
                      of{" "}
                      {
                        recoveryPreview.restorePreflight.coverage
                          .referencedOriginalCount
                      }{" "}
                      referenced originals included
                    </strong>
                    <small>
                      {formatFileSize(
                        recoveryPreview.restorePreflight
                          .requiredStagingBytes || 0,
                      )}{" "}
                      required to stage this workspace
                    </small>
                  </span>
                  {recoveryPreview.restorePreflight.coverage
                    .missingOriginalCount > 0 && (
                    <p>
                      {
                        recoveryPreview.restorePreflight.coverage
                          .missingOriginalCount
                      }{" "}
                      referenced{" "}
                      {recoveryPreview.restorePreflight.coverage
                        .missingOriginalCount === 1
                        ? "original is"
                        : "originals are"}{" "}
                      metadata-only in this copy.
                    </p>
                  )}
                  {recoveryPreview.restorePreflight.browserStorage
                    .status === "unknown" && (
                    <p>
                      Available browser storage could not be estimated. The
                      current workspace remains active unless staging succeeds.
                    </p>
                  )}
                  {recoveryPreview.restorePreflight.browserStorage
                    .status === "insufficient" && (
                    <p className="recovery-preflight-error">
                      This device currently reports insufficient durable space.
                    </p>
                  )}
                </div>
                <div className="recovery-replace-warning">
                  <Warning weight="duotone" />
                  <span>
                    <strong>This prepares a new local generation.</strong>
                    <small>
                      It becomes active only after the workspace and every
                      included original pass validation. The current
                      generation remains available for one-step undo.
                    </small>
                  </span>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  disabled={
                    busy !== "" ||
                    recoveryPreview.restorePreflight.browserStorage
                      .status === "insufficient"
                  }
                  onClick={restoreRecoveryKit}
                >
                  {busy === "restore" ? (
                    <><Clock /> Restoring…</>
                  ) : (
                    <><UploadSimple /> Restore this workspace</>
                  )}
                </button>
              </div>
            )}
          </form>
        )}

        {rollbackInfo && (
          <div className="recovery-rollback-card" role="status">
            <ShieldCheck weight="duotone" />
            <span>
              <strong>Previous generation retained</strong>
              <small>
                Restore completed{" "}
                {new Date(rollbackInfo.createdAt).toLocaleString()}. Undo
                switches the workspace and originals back together.
              </small>
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy !== ""}
              onClick={undoLastRestore}
            >
              <ArrowLeft weight="bold" />
              {busy === "rollback" ? "Reactivating…" : "Undo last restore"}
            </button>
          </div>
        )}

        {feedback && (
          <div
            className={cx("recovery-feedback", `is-${feedback.tone}`)}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.tone === "error" ? (
              <Warning weight="bold" />
            ) : feedback.tone === "success" ? (
              <CheckCircle weight="bold" />
            ) : (
              <Info weight="bold" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function CollectionsScreen({ openCapture }) {
  const { workspace } = useWorkspace();
  const summaries = workspace.collections
    .filter((item) => item.status !== "archived")
    .map((item) => selectCollectionSummary(workspace, item.id))
    .filter(Boolean)
    .sort((left, right) =>
      String(right.collection.updatedAt).localeCompare(
        String(left.collection.updatedAt),
      ),
    );
  const spotlight = summaries[0] || null;

  return (
    <div className="collections-page">
      <PageHeader
        eyebrow="Private exhibitions"
        title="Collections"
        copy="Bring related pieces, their proof, and their story together—without exposing exact locations or values."
        action={
          <button
            className="primary-button"
            onClick={() => openCapture("capture", "collection")}
          >
            <Plus weight="bold" /> Create collection
          </button>
        }
      />
      <AssetBrowseTabs active="collections" />

      {spotlight ? (
        <>
          <CollectionSpotlight summary={spotlight} workspace={workspace} />
          <section className="collection-browse-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Your shelves</span>
                <h2>Made meaningful over time</h2>
              </div>
              <small>{summaries.length} private {summaries.length === 1 ? "collection" : "collections"}</small>
            </div>
            <div className="real-collection-grid">
              {summaries.map((summary) => (
                <CollectionCard
                  key={summary.collection.id}
                  summary={summary}
                  workspace={workspace}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          icon={Archive}
          title="A collection can start with one piece"
          copy="You do not need a complete catalog. Name it now, add one object, and enrich the story when you are ready."
          action={
            <button
              className="primary-button"
              onClick={() => openCapture("capture", "collection")}
            >
              Create a collection
            </button>
          }
        />
      )}
    </div>
  );
}

function CollectionSpotlight({ summary, workspace }) {
  const { collection, coverAsset, assetCount, photographedCount } = summary;
  return (
    <Link
      to={`/collections/${collection.id}`}
      className="collection-spotlight"
    >
      <div className="collection-spotlight-media">
        <AssetCoverMedia
          asset={coverAsset}
          workspace={workspace}
          alt={`Private cover for ${collection.name}`}
          fallback={
            <span className="collection-cover-fallback">
              <Archive weight="duotone" />
            </span>
          }
        />
      </div>
      <div className="collection-spotlight-copy">
        <StatusPill tone="pending" icon={LockKey}>
          {titleCase(collection.visibility)}
        </StatusPill>
        <span className="eyebrow">Recently curated</span>
        <h2>{collection.name}</h2>
        <p>{collection.description || "A collection whose story grows with each piece."}</p>
        <div className="collection-count-line">
          <span><Cube /> {assetCount} {assetCount === 1 ? "item" : "items"}</span>
          <span><Image /> {photographedCount} photographed</span>
        </div>
        <strong className="collection-open-label">
          Enter collection <ArrowRight />
        </strong>
      </div>
    </Link>
  );
}

function CollectionCard({ summary, workspace }) {
  const { collection, coverAsset, assetCount, photographedCount, storyCount } =
    summary;
  const containsArt = summary.assets.some(
    (asset) => asset.categoryId === "lifestyle.art",
  );
  return (
    <Link
      to={`/collections/${collection.id}`}
      className="real-collection-card"
    >
      <div className="real-collection-cover">
        <AssetCoverMedia
          asset={coverAsset}
          workspace={workspace}
          alt={`Private cover for ${collection.name}`}
          fallback={
            <span>
              <Archive weight="duotone" />
              <small>Choose a cover that feels like yours</small>
            </span>
          }
        />
        <StatusPill tone="pending" icon={LockKey}>
          {titleCase(collection.visibility)}
        </StatusPill>
      </div>
      <div className="real-collection-copy">
        <span className="eyebrow">
          {containsArt ? "Art collection" : titleCase(collection.kind)}
        </span>
        <h3>{collection.name}</h3>
        <p>{collection.description || "A private collection in progress."}</p>
        <div>
          <small>{assetCount} items · {photographedCount} photographed</small>
          <CaretRight />
        </div>
        <span className="collection-cue">
          {storyCount
            ? `${storyCount} ${storyCount === 1 ? "piece has" : "pieces have"} a story`
            : "Tell how the first piece arrived"}
        </span>
      </div>
    </Link>
  );
}

function CollectionDetail({ openCapture }) {
  const { collectionId } = useParams();
  const { workspace, dispatch, setAnnouncement } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [curating, setCurating] = useState(false);
  const summary = selectCollectionSummary(workspace, collectionId);
  if (!summary) {
    return <RecordNotFound title="Collection not found" backTo="/collections" />;
  }
  const requestedTab = searchParams.get("tab");
  const activeTab = [
    "showcase",
    "catalog",
    "story",
    "proof",
    "care",
    "access",
  ].includes(requestedTab)
    ? requestedTab
    : "showcase";
  const { collection, coverAsset, assets, assetCount, curation } = summary;
  const artAssets = assets.filter(
    (asset) => asset.categoryId === "lifestyle.art",
  );
  const artProvenanceCount = artAssets.filter((asset) =>
    workspace.evidence.some(
      (item) =>
        item.assetId === asset.id &&
        (/provenance/i.test(item.type) || item.relation === "provenance"),
    ),
  ).length;
  const artConditionCount = artAssets.filter((asset) =>
    workspace.evidence.some(
      (item) =>
        item.assetId === asset.id &&
        (/condition/i.test(item.type) || item.relation === "condition"),
    ),
  ).length;
  const editionCount = artAssets.filter(
    (asset) => asset.profile?.edition,
  ).length;
  const visibleShowcaseAssets = assets.filter(
    (asset) =>
      asset.kind !== "financial" &&
      !String(asset.categoryId || "").startsWith("financial."),
  );
  const featured = [
    ...collection.featuredAssetIds
      .map((id) => visibleShowcaseAssets.find((asset) => asset.id === id))
      .filter(Boolean),
    ...visibleShowcaseAssets.filter(
      (asset) => !collection.featuredAssetIds.includes(asset.id),
    ),
  ];
  const evidence = workspace.evidence.filter((item) =>
    assets.some((asset) => asset.id === item.assetId),
  );

  function selectTab(tab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "showcase") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="collection-detail-page">
      <BackLink to="/collections" label="All collections" />
      <section className="collection-detail-hero">
        <div className="collection-detail-media">
          <AssetCoverMedia
            asset={coverAsset}
            workspace={workspace}
            alt={`Private cover for ${collection.name}`}
            fallback={
              <span className="collection-cover-fallback">
                <Archive weight="duotone" />
              </span>
            }
          />
        </div>
        <div className="collection-detail-copy">
          <StatusPill tone="pending" icon={LockKey}>
            {titleCase(collection.visibility)} collection
          </StatusPill>
          <span className="eyebrow">{titleCase(collection.kind)}</span>
          <h1>{collection.name}</h1>
          <p>{collection.description || "A collection whose identity is still taking shape."}</p>
          <div className="collection-hero-facts">
            <span><Cube /> {assetCount} items</span>
            <span><Image /> {summary.photographedCount} photographed</span>
            <span><Heart /> {summary.storyCount} with stories</span>
            {artAssets.length > 0 && (
              <span><Sparkle /> {artAssets.length} artwork{artAssets.length === 1 ? "" : "s"}</span>
            )}
          </div>
          <div className="collection-hero-actions">
            <button
              className="primary-button"
              onClick={() =>
                openCapture("capture", "asset", {
                  collectionId: collection.id,
                  intent: "collection-piece",
                })
              }
            >
              <Plus weight="bold" /> Add new piece
            </button>
            <button
              className="secondary-button"
              onClick={() => setCurating(true)}
            >
              Curate collection
            </button>
          </div>
        </div>
      </section>

      <nav className="collection-tabs" aria-label="Collection sections">
        {[
          ["showcase", "Showcase"],
          ["catalog", "Catalog"],
          ["story", "Story"],
          ["proof", "Proof"],
          ["care", "Care"],
          ["access", "Access"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "is-active" : ""}
            aria-pressed={activeTab === id}
            onClick={() => selectTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "showcase" && artAssets.length > 0 && (
        <section className="art-collection-strip" aria-label="Art collection context">
          <div>
            <span className="eyebrow">Collector’s view</span>
            <h2>Feeling and facts, kept together</h2>
            <p>
              The private passport protects provenance, condition, edition,
              value, and exact location. The exhibition keeps the human reason
              for choosing the work.
            </p>
          </div>
          <dl>
            <div>
              <dt>Provenance</dt>
              <dd>{artProvenanceCount}/{artAssets.length} linked</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>{artConditionCount}/{artAssets.length} observed</dd>
            </div>
            <div>
              <dt>Editions</dt>
              <dd>{editionCount || "—"} recorded</dd>
            </div>
          </dl>
        </section>
      )}

      {activeTab === "showcase" && (
        <div className="collection-showcase-layout">
          <section className="showcase-main">
            <div className="collection-story-intro">
              <span className="eyebrow">Why this matters</span>
              <h2>{collection.story || "Every collection has a beginning."}</h2>
              <p>
                {collection.curatorNote ||
                  "Record why this matters, who started it, or how the first piece arrived."}
              </p>
            </div>
            {featured.length ? (
              <div className="showcase-grid">
                {featured.map((asset, index) => (
                  <Link
                    key={asset.id}
                    to={`/assets/${asset.id}`}
                    className={cx(
                      "showcase-item",
                      index === 0 && "is-featured",
                    )}
                  >
                    <AssetCoverMedia
                      asset={asset}
                      workspace={workspace}
                      alt={`Private photograph representing ${asset.name}`}
                      fallback={
                        <span className="showcase-item-fallback">
                          <AssetGlyph asset={asset} />
                        </span>
                      }
                    />
                    <span>
                      <small>
                        {asset.profile?.creator
                          ? [
                              asset.profile.creator,
                              asset.profile["production-year"],
                              asset.profile.edition,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : categoryLabel(asset)}
                      </small>
                      <strong>{asset.name}</strong>
                      <p>
                        {asset.sentimentalValue ||
                          asset.notes ||
                          "A piece in this private collection."}
                      </p>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Archive}
                title="This collection has its identity"
                copy="Now add the first piece. Exact location, documents, and values stay out of showcase mode."
              />
            )}
          </section>
          <aside className="collection-curation-panel">
            <span className="eyebrow">One useful next step</span>
            <h2>
              {summary.photographedCount < assetCount
                ? "Photograph the pieces that are hard to recognise"
                : summary.storyCount < assetCount
                  ? "Tell how the first piece arrived"
                  : "Choose the next piece to feature"}
            </h2>
            <p>
              These prompts improve preservation and meaning. They are not a competitive score.
            </p>
            <div className="curation-progress-list">
              <CurationLine label="Findable" value={curation.findable} />
              <CurationLine label="Documented" value={curation.documented} />
              <CurationLine label="Personal" value={curation.personal} />
            </div>
            <button
              className="gradient-button"
              onClick={() => setCurating(true)}
            >
              Review collection <ArrowRight />
            </button>
          </aside>
        </div>
      )}

      {activeTab === "catalog" && (
        <section className="collection-management-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Complete catalog</span>
              <h2>{assetCount} pieces</h2>
            </div>
            <button
              className="primary-button"
              onClick={() =>
                openCapture("capture", "asset", {
                  collectionId: collection.id,
                  intent: "collection-piece",
                })
              }
            >
              <Plus /> Add new piece
            </button>
          </div>
          {assets.length ? (
            <AssetResults assets={assets} workspace={workspace} />
          ) : (
            <EmptyState
              icon={Archive}
              title="Add the first piece"
              copy="A collection can begin before its catalog is complete."
            />
          )}
        </section>
      )}

      {activeTab === "story" && (
        <section className="collection-panel-grid">
          <article>
            <span className="eyebrow">The beginning</span>
            <h2>{collection.story || "Every collection has a beginning."}</h2>
            <p>{collection.curatorNote || "Add the person, place, or moment that made this collection meaningful."}</p>
          </article>
          <article>
            <span className="eyebrow">Pieces with context</span>
            <h2>{summary.storyCount} stories preserved</h2>
            <p>Stories remain attached even if an object is later gifted, sold, donated, or lost.</p>
          </article>
        </section>
      )}

      {activeTab === "proof" && (
        <section className="collection-management-section">
          <div className="section-heading">
            <div><span className="eyebrow">Supporting material</span><h2>{evidence.length} linked records</h2></div>
          </div>
          {evidence.length ? (
            <div className="collection-proof-list">
              {evidence.slice(0, 20).map((item) => {
                const asset = assets.find((candidate) => candidate.id === item.assetId);
                return (
                  <Link key={item.id} to={`/evidence/${item.id}`}>
                    <Paperclip weight="duotone" />
                    <span><strong>{item.type}</strong><small>{asset?.name} · {materialStatusLabel(item.status)}</small></span>
                    <CaretRight />
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Paperclip} title="No proof linked yet" copy="Add photographs, receipts, provenance, appraisals, or condition records to the pieces they support." />
          )}
        </section>
      )}

      {activeTab === "care" && (
        <CollectionCarePanel
          collector={workspace.collector}
          collectionId={collection.id}
          assets={assets}
          onCommands={(commands) =>
            commands.forEach((command) =>
              dispatch({
                type: "APPLY_COLLECTOR_COMMAND",
                command,
              }),
            )
          }
          onAddMaterial={(assetId) =>
            openCapture("capture", "evidence", { assetId })
          }
          onAnnounce={setAnnouncement}
        />
      )}

      {activeTab === "access" && (
        <section className="collection-access-panel">
          <LockKey weight="duotone" />
          <div>
            <span className="eyebrow">Private by default</span>
            <h2>{titleCase(collection.visibility)} visibility</h2>
            <p>Showcase views exclude exact location, serial numbers, financial references, documents, and recorded values. Authoritative sharing will require authenticated permissions.</p>
          </div>
        </section>
      )}
      <AnimatePresence>
        {curating && (
          <CollectionCurationEditor
            collection={collection}
            assets={assets}
            workspace={workspace}
            onClose={() => setCurating(false)}
            onSave={({ changes, coverAssetId, removedAssetIds }) => {
              dispatch({
                type: "UPDATE_COLLECTION",
                collectionId: collection.id,
                changes,
              });
              dispatch({
                type: "SET_COLLECTION_COVER",
                collectionId: collection.id,
                assetId: coverAssetId,
              });
              removedAssetIds.forEach((assetId) =>
                dispatch({
                  type: "REMOVE_COLLECTION_MEMBER",
                  collectionId: collection.id,
                  assetId,
                }),
              );
              setCurating(false);
              setAnnouncement(
                `${collection.name} curation updated. Private fields remain outside its showcase.`,
              );
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CollectionCurationEditor({
  collection,
  assets,
  workspace,
  onClose,
  onSave,
}) {
  const safeAssets = assets.filter((asset) => !isPrivateFinancialAsset(asset));
  const [draft, setDraft] = useState({
    description: collection.description || "",
    story: collection.story || "",
    curatorNote: collection.curatorNote || "",
    coverAssetId:
      safeAssets.some((asset) => asset.id === collection.coverAssetId)
        ? collection.coverAssetId
        : safeAssets[0]?.id || null,
    featuredAssetIds: collection.featuredAssetIds.filter((id) =>
      safeAssets.some((asset) => asset.id === id),
    ),
    removedAssetIds: [],
  });
  const visibleAssets = assets.filter(
    (asset) => !draft.removedAssetIds.includes(asset.id),
  );

  function toggleFeatured(assetId) {
    setDraft((current) => {
      const selected = current.featuredAssetIds.includes(assetId);
      return {
        ...current,
        featuredAssetIds: selected
          ? current.featuredAssetIds.filter((id) => id !== assetId)
          : [...current.featuredAssetIds, assetId].slice(0, 6),
      };
    });
  }

  function moveFeatured(assetId, direction) {
    setDraft((current) => {
      const list = [...current.featuredAssetIds];
      const index = list.indexOf(assetId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) {
        return current;
      }
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      return { ...current, featuredAssetIds: list };
    });
  }

  function toggleRemoved(assetId) {
    setDraft((current) => {
      const removed = current.removedAssetIds.includes(assetId);
      const removedAssetIds = removed
        ? current.removedAssetIds.filter((id) => id !== assetId)
        : [...current.removedAssetIds, assetId];
      const featuredAssetIds = removed
        ? current.featuredAssetIds
        : current.featuredAssetIds.filter((id) => id !== assetId);
      const coverAssetId =
        !removed && current.coverAssetId === assetId
          ? assets.find(
              (asset) =>
                asset.id !== assetId &&
                !removedAssetIds.includes(asset.id) &&
                !isPrivateFinancialAsset(asset),
            )?.id || null
          : current.coverAssetId;
      return {
        ...current,
        removedAssetIds,
        featuredAssetIds,
        coverAssetId,
      };
    });
  }

  return (
    <Modal
      title={`Curate ${collection.name}`}
      onClose={onClose}
      className="curation-modal"
    >
      <form
        className="curation-editor"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            changes: {
              description: draft.description.trim(),
              story: draft.story.trim(),
              curatorNote: draft.curatorNote.trim(),
              featuredAssetIds: draft.featuredAssetIds.filter(
                (id) =>
                  !draft.removedAssetIds.includes(id) &&
                  safeAssets.some((asset) => asset.id === id),
              ),
            },
            coverAssetId: draft.coverAssetId,
            removedAssetIds: draft.removedAssetIds,
          });
        }}
      >
        <div className="curation-editor-intro">
          <span className="eyebrow">Private exhibition editor</span>
          <h3>Make the collection feel unmistakably yours.</h3>
          <p>
            Choose what visitors can understand without exposing value, exact
            location, identifiers, private people, or supporting documents.
          </p>
        </div>
        <FormField label="Collection statement">
          <textarea
            rows="3"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="What connects these pieces?"
          />
        </FormField>
        <FormField label="How it began">
          <textarea
            rows="3"
            value={draft.story}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                story: event.target.value,
              }))
            }
            placeholder="The first piece, person, place, or moment…"
          />
        </FormField>
        <FormField label="Curator’s note">
          <textarea
            rows="3"
            value={draft.curatorNote}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                curatorNote: event.target.value,
              }))
            }
            placeholder="What should someone notice or feel?"
          />
        </FormField>
        <div className="curation-piece-heading">
          <div>
            <span className="eyebrow">Cover and order</span>
            <h3>{visibleAssets.length} pieces in this collection</h3>
          </div>
          <small>Feature up to six</small>
        </div>
        <div className="curation-piece-list">
          {assets.map((asset) => {
            const removed = draft.removedAssetIds.includes(asset.id);
            const featuredIndex = draft.featuredAssetIds.indexOf(asset.id);
            const isCover = draft.coverAssetId === asset.id;
            return (
              <div
                className={cx(
                  "curation-piece-row",
                  removed && "is-removed",
                )}
                key={asset.id}
              >
                <div className="curation-piece-media">
                  <AssetCoverMedia
                    asset={asset}
                    workspace={workspace}
                    alt=""
                    fallback={<AssetGlyph asset={asset} />}
                  />
                </div>
                <span className="curation-piece-copy">
                  <strong>{asset.name}</strong>
                  <small>{categoryLabel(asset)}</small>
                </span>
                <div className="curation-piece-actions">
                  {!removed && !isPrivateFinancialAsset(asset) && (
                    <button
                      type="button"
                      className={cx("text-button", isCover && "is-selected")}
                      aria-pressed={isCover}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          coverAssetId: asset.id,
                        }))
                      }
                    >
                      {isCover ? "Cover" : "Use as cover"}
                    </button>
                  )}
                  {!removed && !isPrivateFinancialAsset(asset) && (
                    <button
                      type="button"
                      className={cx(
                        "text-button",
                        featuredIndex >= 0 && "is-selected",
                      )}
                      aria-pressed={featuredIndex >= 0}
                      onClick={() => toggleFeatured(asset.id)}
                    >
                      {featuredIndex >= 0
                        ? `Featured ${featuredIndex + 1}`
                        : "Feature"}
                    </button>
                  )}
                  {featuredIndex >= 0 &&
                    !removed &&
                    !isPrivateFinancialAsset(asset) && (
                    <span className="curation-order-actions">
                      <button
                        type="button"
                        aria-label={`Move ${asset.name} earlier`}
                        disabled={featuredIndex === 0}
                        onClick={() => moveFeatured(asset.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${asset.name} later`}
                        disabled={
                          featuredIndex ===
                          draft.featuredAssetIds.length - 1
                        }
                        onClick={() => moveFeatured(asset.id, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-button is-danger"
                    onClick={() => toggleRemoved(asset.id)}
                  >
                    {removed ? "Keep piece" : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="curation-safe-preview">
          <ShieldCheck weight="duotone" />
          <span>
            <strong>Safe showcase boundary</strong>
            <small>
              Financial references are never eligible for covers. Locations,
              values, identifiers, documents, and private people stay excluded.
            </small>
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            <Check weight="bold" /> Save curation
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CurationLine({ label, value }) {
  return (
    <div className="curation-line">
      <span><strong>{label}</strong><small>{value}%</small></span>
      <span><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
    </div>
  );
}

function EvidenceDetail() {
  const { evidenceId } = useParams();
  const {
    workspace,
    dispatch,
    setAnnouncement,
    storageScopeId,
    commitWorkspaceActionsWithFiles,
    session,
  } = useWorkspace();
  const actorMemberId = selectWorkspaceActorMemberId(workspace, session);
  const evidence = workspace.evidence.find((item) => item.id === evidenceId);
  const asset = evidence
    ? workspace.assets.find((item) => item.id === evidence.assetId)
    : null;
  const [fileRecord, setFileRecord] = useState(null);
  const [fileState, setFileState] = useState("loading");
  const [fileError, setFileError] = useState("");
  const [objectUrl, setObjectUrl] = useState("");
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [storageEditing, setStorageEditing] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageDraft, setStorageDraft] = useState(() =>
    materialStorageDraft(evidence?.materialStorage),
  );
  const replacementInputRef = useRef(null);
  const replacementOperationRef = useRef(null);
  const evidenceIntegrityKey = evidence
    ? [
        evidence.id,
        evidence.fileName || "",
        evidence.fileType || "",
        evidence.fileSize ?? "",
        evidence.fileChecksum || "",
        evidence.originalVersionId || "",
      ].join("|")
    : "";
  const hasCanonicalOriginalIdentity = Boolean(
    evidence &&
      Number.isFinite(Number(evidence.fileSize)) &&
      Number(evidence.fileSize) > 0 &&
      /^[a-f0-9]{64}$/i.test(String(evidence.fileChecksum || "")) &&
      evidence.originalVersionId,
  );
  const [verifiedEvidenceKey, setVerifiedEvidenceKey] = useState("");
  const verifiedFileRecord =
    fileRecord?.id === evidenceId &&
    verifiedEvidenceKey === evidenceIntegrityKey
      ? fileRecord
      : null;
  const previewPolicy = verifiedFileRecord
    ? createSafePreviewMetadata({
        mediaType: verifiedFileRecord.fileType,
        fileName: verifiedFileRecord.fileName,
        sourceBytes: verifiedFileRecord.fileSize,
      })
    : null;

  useEffect(() => {
    setStorageDraft(materialStorageDraft(evidence?.materialStorage));
    setStorageEditing(false);
    setStorageError("");
  }, [
    evidence?.id,
    evidence?.materialStorage?.currentEventId,
  ]);

  useEffect(() => {
    let active = true;
    let url = "";
    setFileRecord(null);
    setVerifiedEvidenceKey("");
    setObjectUrl("");
    setFileError("");
    if (!evidence) return undefined;
    if (!evidence.fileName) {
      setFileState("metadata-only");
      return undefined;
    }
    if (
      evidence.fileState === "missing_original" &&
      !hasCanonicalOriginalIdentity
    ) {
      setFileState("missing");
      return undefined;
    }
    setFileState("loading");
    getEvidenceFile(evidence.id, { scopeId: storageScopeId })
      .then(async (record) => {
        if (!active) return;
        if (record?.blob) {
          await verifyEvidenceFileRecord(record, evidence);
          if (!active) return;
          dispatch({
            type: "SET_EVIDENCE_FILE_STATE",
            evidenceId: evidence.id,
            fileState: "ready_local",
            fileType: record.fileType,
            fileSize: record.fileSize,
            fileChecksum: record.fileChecksum,
            originalVersionId: record.originalVersionId,
            storageScope: "local-device",
          });
          url = URL.createObjectURL(record.blob);
          setFileRecord(record);
          setVerifiedEvidenceKey(evidenceIntegrityKey);
          setObjectUrl(url);
          setFileState("ready");
        } else {
          setFileState("missing");
          if (evidence.fileName) {
            dispatch({
              type: "SET_EVIDENCE_FILE_STATE",
              evidenceId: evidence.id,
              fileState: "missing_original",
            });
          }
        }
      })
      .catch((error) => {
        if (!active) return;
        setFileRecord(null);
        setVerifiedEvidenceKey("");
        setObjectUrl("");
        setFileError(error?.message || "The original could not be verified.");
        if (evidence.fileName) {
          dispatch({
            type: "SET_EVIDENCE_FILE_STATE",
            evidenceId: evidence.id,
            fileState: ["CHECKSUM_UNAVAILABLE", "FILE_INTEGRITY_FAILED"].includes(
              error?.code,
            )
              ? "quarantined"
              : "failed",
          });
        }
        setFileState(
          ["CHECKSUM_UNAVAILABLE", "FILE_INTEGRITY_FAILED"].includes(
            error?.code,
          )
            ? "integrity-failed"
            : "unavailable",
        );
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [evidenceIntegrityKey, storageScopeId]);

  if (!evidence || !asset) {
    return <RecordNotFound title="Material not found" backTo="/vault" />;
  }

  function downloadFile() {
    if (
      fileState !== "ready" ||
      !objectUrl ||
      !verifiedFileRecord
    ) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download =
      verifiedFileRecord.fileName || evidence.fileName || "attachment";
    anchor.click();
  }

  function markReviewed() {
    if (!actorMemberId) {
      setAnnouncement(
        "This signed-in account is not an active member of this workspace.",
      );
      return;
    }
    dispatch({
      type: "VERIFY_EVIDENCE",
      evidenceId: evidence.id,
      memberId: actorMemberId,
      integrityVerified:
        !evidence.fileName ||
        (fileState === "ready" && Boolean(verifiedFileRecord)),
      integrityChecksum: verifiedFileRecord?.fileChecksum || null,
    });
    setAnnouncement(`${evidence.type} marked reviewed by you.`);
  }

  async function replaceOriginal(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file || replacementBusy) return;
    const validationError = validateLocalFile(file);
    if (validationError) {
      setFileError(validationError);
      setAnnouncement(validationError);
      return;
    }
    setReplacementBusy(true);
    setFileError("");
    try {
      const record = await describeEvidenceOriginal(evidence.id, file);
      const replacementFingerprint = [
        evidence.id,
        record.originalVersionId,
      ].join(":");
      if (
        replacementOperationRef.current?.fingerprint !==
        replacementFingerprint
      ) {
        replacementOperationRef.current = {
          fingerprint: replacementFingerprint,
          operationId: createId("replace-original-operation"),
        };
      }
      await commitWorkspaceActionsWithFiles({
        actions: [
          {
            type: "SET_EVIDENCE_FILE_STATE",
            evidenceId: evidence.id,
            fileState: "ready_local",
            fileName: record.fileName,
            fileType: record.fileType,
            fileSize: record.fileSize,
            fileChecksum: record.fileChecksum,
            originalVersionId: record.originalVersionId,
            storageScope: "local-device",
          },
        ],
        files: [
          {
            evidenceId: evidence.id,
            file,
            expectedCurrentOriginalVersionId:
              evidence.originalVersionId || null,
          },
        ],
        operationId:
          replacementOperationRef.current.operationId,
        now: new Date().toISOString(),
      });
      setAnnouncement(
        `${record.fileName} attached. Continuity is checking the original before review.`,
      );
    } catch (error) {
      const message =
        error?.message ||
        "The browser could not save this original. Choose the file and try again.";
      setFileError(message);
      setAnnouncement(message);
    } finally {
      setReplacementBusy(false);
    }
  }

  function updateMaterialStorageDraft(name, value) {
    setStorageDraft((current) => ({
      ...current,
      [name]: value,
      ...(name === "materialPlaceId"
        ? { materialSpaceId: "" }
        : {}),
    }));
    setStorageError("");
  }

  function saveMaterialStorage(event) {
    event.preventDefault();
    if (!actorMemberId) {
      setStorageError(
        "An active workspace member is required to correct storage history.",
      );
      return;
    }
    if (
      storageDraft.materialStorageStatus === "known" &&
      !workspace.places.some(
        (place) =>
          place.id === storageDraft.materialPlaceId &&
          place.status !== "archived",
      )
    ) {
      setStorageError(
        "Choose the Place that contains the original, or use another honest status.",
      );
      return;
    }
    if (
      storageDraft.materialStorageStatus === "known" &&
      !storageDraft.materialSpaceId &&
      !storageDraft.materialLocatorText.trim()
    ) {
      setStorageError(
        "Add a room, container, or retrieval clue before marking storage known.",
      );
      return;
    }
    if (
      storageDraft.materialStorageStatus === "external_custodian" &&
      !storageDraft.materialCustodianMemberId &&
      !storageDraft.materialExternalLabel.trim()
    ) {
      setStorageError(
        "Name the person or organization holding the original.",
      );
      return;
    }
    if (!storageDraft.materialStorageReason.trim()) {
      setStorageError(
        "Add a short reason so the correction is understandable later.",
      );
      return;
    }
    dispatch({
      type: "MOVE_MATERIAL_STORAGE",
      evidenceId: evidence.id,
      memberId: actorMemberId,
      status: storageDraft.materialStorageStatus,
      placeId: storageDraft.materialPlaceId || null,
      spaceId: storageDraft.materialSpaceId || null,
      locatorText: storageDraft.materialLocatorText.trim() || null,
      custodianMemberId:
        storageDraft.materialCustodianMemberId || null,
      externalLabel:
        storageDraft.materialExternalLabel.trim() || null,
      reason: storageDraft.materialStorageReason.trim(),
    });
    setStorageEditing(false);
    setStorageError("");
    setAnnouncement(
      "Original material storage corrected. The previous assignment remains in history.",
    );
  }

  const canMarkReviewed =
    Boolean(actorMemberId) &&
    (evidence.fileName
      ? fileState === "ready" && Boolean(verifiedFileRecord)
      : isReviewableEvidence(evidence));
  const placementContext = evidence.placementContext;
  const placementPlace = placementContext?.placeSnapshot;
  const placementPath =
    placementContext?.spacePathSnapshot
      ?.map((item) => item.name)
      .filter(Boolean)
      .join(" › ") || "No room or container recorded";
  const placementCoordinates =
    Number.isFinite(placementPlace?.coordinates?.lat) &&
    Number.isFinite(placementPlace?.coordinates?.lng)
      ? `${placementPlace.coordinates.lat.toFixed(5)}, ${placementPlace.coordinates.lng.toFixed(5)} · ${placePrecisionSummary(
          placementPlace,
        )}`
      : "No Place pin recorded";
  const materialStorage = evidence.materialStorage;
  const materialStoragePlace =
    workspace.places.find(
      (place) => place.id === materialStorage?.placeId,
    ) ||
    materialStorage?.placeSnapshot ||
    null;
  const materialStorageRoomPath =
    materialStoragePath(materialStorage) ||
    "No room or container recorded";
  const materialStorageCustodian = workspace.members.find(
    (member) =>
      member.id === materialStorage?.custodianMemberId,
  );
  const materialStorageActor = workspace.members.find(
    (member) => member.id === materialStorage?.movedByMemberId,
  );
  const materialStorageHistory = [
    ...(materialStorage?.history || []),
  ].reverse();
  const metadataOnlyTitle =
    evidence.kind === "note"
      ? "Story saved as text"
      : evidence.kind === "link"
        ? "Reference saved as a link"
        : evidence.kind === "artifact"
          ? "Artifact details saved"
          : "Material saved without a file";
  const metadataOnlyDescription =
    evidence.kind === "note"
      ? "The words are the material. No original file is missing."
      : evidence.kind === "link"
        ? "The recorded URL is the material. No original file is missing."
        : evidence.kind === "artifact"
          ? "The recorded artifact clue is the material. A photo was optional."
          : "This material was intentionally saved without an attachment.";
  const MetadataOnlyIcon =
    MATERIAL_ICON_BY_KIND[evidence.kind] || Note;

  return (
    <div className="detail-page evidence-detail-page">
      <BackLink to={`/assets/${asset.id}`} label={asset.name} />
      <PageHeader
        eyebrow={`${getMaterialKind(evidence.kind)?.label || "Material"} · ${materialStatusLabel(evidence.status)}`}
        title={evidence.type}
        copy={`Supporting ${asset.name}. Human review confirms the record was checked; it does not certify authenticity.`}
        action={
          evidence.status !== "verified" ? (
            canMarkReviewed ? (
              <button className="primary-button" onClick={markReviewed}>
                <CheckCircle /> Mark reviewed
              </button>
            ) : (
              <StatusPill tone="warning" icon={Warning}>
                {!actorMemberId
                  ? "Active workspace membership required"
                  : fileState === "loading"
                  ? "Checking original"
                  : evidence.fileName
                    ? "Verified original required"
                    : "Usable source required"}
              </StatusPill>
            )
          ) : (
            <StatusPill tone="success" icon={CheckCircle}>
              Reviewed by you
            </StatusPill>
          )
        }
      />
      <div className="evidence-detail-grid">
        <section className="evidence-preview-panel">
          {fileState === "ready" && objectUrl && verifiedFileRecord ? (
            <>
              {previewPolicy?.mode === "inline-original" ? (
                <img src={objectUrl} alt={evidence.type} />
              ) : (
                <div
                  className="file-preview-generic is-protected"
                  data-preview-mode={previewPolicy?.mode || "download-only"}
                >
                  <ShieldCheck weight="duotone" />
                  <strong>Original available for download</strong>
                  <small>
                    {previewPolicy?.activeContent
                      ? "Active file content is blocked from inline rendering."
                      : "This original is not rendered inline until a sanitized preview rendition exists."}
                  </small>
                  <span>
                    <FileText /> {verifiedFileRecord.fileName}
                  </span>
                </div>
              )}
              <button className="secondary-button" onClick={downloadFile}>
                <DownloadSimple /> Download original
              </button>
            </>
          ) : fileState === "loading" ? (
            <div className="file-preview-generic" role="status">
              <Clock weight="duotone" />
              <strong>Checking original integrity…</strong>
            </div>
          ) : fileState === "integrity-failed" ? (
            <div className="file-preview-generic is-warning" role="alert">
              <Warning weight="duotone" />
              <strong>Original blocked by integrity check</strong>
              <small>{fileError}</small>
            </div>
          ) : fileState === "metadata-only" ? (
            <div className="file-preview-generic is-metadata-only">
              <MetadataOnlyIcon weight="duotone" />
              <strong>{metadataOnlyTitle}</strong>
              {evidence.note ? (
                <p className="metadata-only-content">{evidence.note}</p>
              ) : null}
              {evidence.linkUrl && isSafeReferenceUrl(evidence.linkUrl) ? (
                <a
                  className="secondary-button"
                  href={evidence.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <LinkSimple /> Open reference
                </a>
              ) : null}
              {materialStorage?.locatorText ? (
                <span className="metadata-only-location">
                  <MapPin /> Original stored: {materialStorage.locatorText}
                </span>
              ) : null}
              <small>{metadataOnlyDescription}</small>
            </div>
          ) : (
            <div className="file-preview-generic is-warning">
              <Warning weight="duotone" />
              <strong>
                {evidence.fileState === "missing_original"
                  ? "Original file was never stored"
                  : "File missing on this device"}
              </strong>
              <small>
                The metadata record is preserved. Attach the original here to
                restore preview, download, and review.
              </small>
              <input
                ref={replacementInputRef}
                className="sr-only"
                type="file"
                accept="image/*,video/mp4,video/quicktime,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                onChange={replaceOriginal}
                aria-label="Choose replacement original"
              />
              <button
                type="button"
                className="secondary-button"
                disabled={replacementBusy}
                onClick={() => replacementInputRef.current?.click()}
              >
                <Paperclip />
                {replacementBusy ? "Saving original…" : "Attach original"}
              </button>
              {fileError ? <span className="field-error">{fileError}</span> : null}
            </div>
          )}
        </section>
        <aside className="evidence-metadata-panel">
          <span className="eyebrow">
            {evidence.fileName ? "File integrity" : "Material source"}
          </span>
          {evidence.fileName ? (
            <dl>
              <div><dt>Filename</dt><dd>{evidence.fileName}</dd></div>
              <div><dt>Type</dt><dd>{evidence.fileType || "Unknown"}</dd></div>
              <div><dt>Size</dt><dd>{evidence.fileSize !== null ? formatFileSize(evidence.fileSize) : "Unknown"}</dd></div>
              <div><dt>Storage</dt><dd>{fileState === "integrity-failed" ? "Blocked · integrity check failed" : evidence.fileState === "ready_local" ? "On this device" : titleCase(evidence.fileState || "metadata only")}</dd></div>
              <div><dt>Checksum</dt><dd className="checksum-value">{evidence.fileChecksum || "Not available"}</dd></div>
              <div><dt>Added</dt><dd>{formatDate(evidence.addedAt)}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>Kind</dt><dd>{getMaterialKind(evidence.kind)?.label || "Material"}</dd></div>
              <div><dt>Attachment</dt><dd>Not required</dd></div>
              <div><dt>Storage</dt><dd>Workspace metadata</dd></div>
              <div><dt>Added</dt><dd>{formatDate(evidence.addedAt)}</dd></div>
            </dl>
          )}
          <span className="eyebrow">
            Where the original material is stored
          </span>
          <div className="material-storage-card">
            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  {materialStorageStatusLabel(
                    materialStorage?.status,
                  )}
                </dd>
              </div>
              {["known", "needs_detail"].includes(
                materialStorage?.status,
              ) && (
                <>
                  <div>
                    <dt>Place</dt>
                    <dd>
                      {materialStoragePlace?.name ||
                        "No Place recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Room / container</dt>
                    <dd>{materialStorageRoomPath}</dd>
                  </div>
                </>
              )}
              {materialStorage?.status ===
                "external_custodian" && (
                <div>
                  <dt>Holder</dt>
                  <dd>
                    {[
                      materialStorageCustodian?.name,
                      materialStorage?.externalLabel,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "Not named"}
                  </dd>
                </div>
              )}
              {materialStorage?.status !== "not_applicable" && (
                <div>
                  <dt>Retrieval clue</dt>
                  <dd>
                    {materialStorage?.locatorText ||
                      "No clue recorded"}
                  </dd>
                </div>
              )}
              <div>
                <dt>Last corrected</dt>
                <dd>{formatDateTime(materialStorage?.movedAt)}</dd>
              </div>
              <div>
                <dt>Corrected by</dt>
                <dd>
                  {materialStorageActor?.name ||
                    "Actor not available on migrated record"}
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>
                  {materialStorage?.reason || "Not recorded"}
                </dd>
              </div>
            </dl>
            {!storageEditing && (
              <button
                type="button"
                className="secondary-button"
                disabled={!actorMemberId}
                onClick={() => {
                  setStorageDraft(
                    materialStorageDraft(materialStorage),
                  );
                  setStorageEditing(true);
                  setStorageError("");
                }}
              >
                <PencilSimple /> Correct or move original
              </button>
            )}
          </div>
          {storageEditing && (
            <form
              className="material-storage-editor"
              aria-label="Correct original material storage"
              onSubmit={saveMaterialStorage}
            >
              <MaterialStorageFields
                form={storageDraft}
                update={updateMaterialStorageDraft}
                workspace={workspace}
                showReason
              />
              {storageError && (
                <div className="form-error" role="alert">
                  <Warning weight="bold" /> {storageError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setStorageEditing(false);
                    setStorageError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Check weight="bold" /> Save storage correction
                </button>
              </div>
            </form>
          )}
          {materialStorageHistory.length > 0 && (
            <details className="material-storage-history">
              <summary>
                Storage history ({materialStorageHistory.length})
              </summary>
              <ol>
                {materialStorageHistory.map((event) => {
                  const historyPlace =
                    workspace.places.find(
                      (place) => place.id === event.placeId,
                    ) ||
                    event.placeSnapshot ||
                    null;
                  const historyActor = workspace.members.find(
                    (member) =>
                      member.id === event.movedByMemberId,
                  );
                  const historyHolder = workspace.members.find(
                    (member) =>
                      member.id === event.custodianMemberId,
                  );
                  const path = materialStoragePath(event);
                  const location = [
                    historyPlace?.name,
                    path,
                    event.locatorText,
                    historyHolder?.name,
                    event.externalLabel,
                  ]
                    .filter(Boolean)
                    .join(" / ");
                  return (
                    <li key={event.id}>
                      <strong>
                        {materialStorageStatusLabel(event.status)}
                      </strong>
                      <span>
                        {location || "No physical location"}
                      </span>
                      <small>
                        {formatDateTime(event.movedAt)} -{" "}
                        {historyActor?.name ||
                          "Migrated actor unavailable"}
                      </small>
                      <small>
                        {event.reason || "No reason recorded"}
                      </small>
                    </li>
                  );
                })}
              </ol>
            </details>
          )}
          <div className="prototype-disclosure">
            <Info /> This is the current retrieval assignment for the
            original paper, object, or other physical material. It is
            independent from the asset snapshot below.
          </div>
          <span className="eyebrow">Asset location when attached</span>
          {placementContext ? (
            <>
              <dl>
                <div><dt>Location revision</dt><dd>{placementContext.assignmentId ? "Immutable revision linked" : "No active revision"}</dd></div>
                <div><dt>Mode</dt><dd>{titleCase(placementContext.mode)}</dd></div>
                <div><dt>Place</dt><dd>{placementPlace?.name || "No place recorded"}</dd></div>
                <div><dt>Address</dt><dd>{placementPlace?.formattedAddress || "Not recorded"}</dd></div>
                <div><dt>Recorded pin</dt><dd>{placementCoordinates}</dd></div>
                <div><dt>Room / container</dt><dd>{placementPath}</dd></div>
                <div><dt>Locator clue</dt><dd>{placementContext.locatorText || "Not recorded"}</dd></div>
                <div><dt>Context recorded</dt><dd>{formatDateTime(placementContext.recordedAt)}</dd></div>
              </dl>
              <div className="prototype-disclosure">
                <Info /> This snapshot records the asset&apos;s active location assignment when the material was attached. It is contextual metadata, not independent proof that the original was created or stored there.
              </div>
            </>
          ) : (
            <div className="prototype-disclosure">
              <Info /> Placement context was not recorded for this older material. Its current asset location must not be treated as its attachment location.
            </div>
          )}
          <div className="prototype-disclosure">
            <LockKey /> On-device files are not encrypted cloud backup and will not appear on another device.
          </div>
        </aside>
        {hasCanonicalOriginalIdentity && (
          <EvidenceVersionHistory
            evidenceId={evidence.id}
            scopeId={storageScopeId}
            currentOriginalVersionId={evidence.originalVersionId}
          />
        )}
      </div>
    </div>
  );
}

function SearchOverlay({ onClose }) {
  const { workspace, session, dispatch } = useWorkspace();
  const navigate = useNavigate();
  const actorMemberId = selectWorkspaceActorMemberId(workspace, session);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const results = query.trim()
      ? searchWorkspace(workspace, query, {
        types: ["asset", "collection", "place", "space", "evidence", "member"],
      }).slice(0, 10)
    : [];

  useDialogFocus(dialogRef, onClose, inputRef);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function targetForResult(result) {
    if (result.type === "collection") return `/collections/${result.id}`;
    if (result.type === "place") return `/places/${result.id}`;
    if (result.type === "space") {
      return `/places/${result.placeId}/spaces/${result.id}`;
    }
    if (result.type === "member") return `/family?member=${result.id}`;
    if (result.type === "evidence") return `/evidence/${result.id}`;
    return `/assets/${result.assetId || result.id}`;
  }

  function openResult(result) {
    if (!result) return;
    if (actorMemberId) {
      dispatch({
        type: "RECORD_RETRIEVAL",
        entityType: result.type,
        entityId: result.id,
        title: `Retrieved ${result.title} through Search`,
        memberId: actorMemberId,
      });
    }
    // Replace the transient overlay entry directly. Calling the generic close
    // handler first can race its history back-navigation against the result
    // route in real browsers.
    navigate(targetForResult(result), {
      replace: true,
      state: null,
    });
  }

  function handleSearchKeyDown(event) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) =>
        Math.min(current + 1, results.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      openResult(results[selectedIndex] || results[0]);
    }
  }

  return (
    <motion.div className="overlay-backdrop search-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section ref={dialogRef} tabIndex="-1" className="search-dialog" role="dialog" aria-modal="true" aria-label="Search everything" initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }}>
        <div className="search-dialog-header">
          <label className="search-dialog-input">
            <MagnifyingGlass weight="bold" />
            <span className="sr-only">Search everything</span>
            <input
              ref={inputRef}
              aria-label="Search everything"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(results.length)}
              aria-controls="workspace-search-results"
              aria-activedescendant={
                results.length
                  ? `workspace-search-result-${selectedIndex}`
                  : undefined
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Find an asset, place, material, or reference…"
            />
            <kbd>esc</kbd>
          </label>
          <IconButton label="Close search" onClick={onClose}><X /></IconButton>
        </div>
        <div className="search-dialog-body">
          {!query ? (
            <>
              <span className="eyebrow">Try searching</span>
              <div className="quick-searches">
                {["watch", "title deed", "unknown location", "West Bay"].map((term) => (
                  <button key={term} onClick={() => setQuery(term)}><MagnifyingGlass /> {term}</button>
                ))}
              </div>
            </>
          ) : results.length ? (
            <>
              <span className="eyebrow">{results.length} best matches</span>
              <div
                id="workspace-search-results"
                className="search-results"
                role="listbox"
                aria-label="Search results"
              >
                {results.map((result, index) => {
                  const asset =
                    result.type === "asset"
                      ? result.entity
                      : workspace.assets.find((item) => item.id === result.assetId);
                  const ResultIcon =
                    result.type === "collection"
                      ? Archive
                      : result.type === "place"
                      ? MapPin
                      : result.type === "space"
                        ? Archive
                        : result.type === "evidence"
                          ? MATERIAL_ICON_BY_KIND[result.entity?.kind] || FileText
                          : User;
                  return (
                  <button
                    id={`workspace-search-result-${index}`}
                    key={`${result.type}-${result.id}`}
                    className={index === selectedIndex ? "is-active" : ""}
                    role="option"
                    aria-selected={index === selectedIndex}
                    onMouseMove={() => setSelectedIndex(index)}
                    onFocus={() => setSelectedIndex(index)}
                    onClick={() => openResult(result)}
                  >
                    {asset && result.type === "asset" ? (
                      <AssetGlyph asset={asset} />
                    ) : (
                      <span className="asset-glyph accent-blue"><ResultIcon weight="duotone" /></span>
                    )}
                    <span><strong>{result.title}</strong><small>{result.subtitle}</small></span>
                    <CaretRight />
                  </button>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState icon={MagnifyingGlass} title="Nothing found" copy="Check the spelling or search for a broader category." />
          )}
        </div>
        <footer><span><kbd>↑↓</kbd> choose</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span><small>Search runs only inside this {session ? "signed-in" : "local"} workspace</small></footer>
      </motion.section>
    </motion.div>
  );
}

function CaptureDrawer({
  initialType,
  context,
  actorMemberId,
  onOpenStudio,
  onClose,
}) {
  const {
    workspace,
    dispatch,
    setAnnouncement,
    storageStatus,
    storageKeys,
    storageScopeId,
    commitWorkspaceActions,
    commitWorkspaceActionsWithFiles,
  } = useWorkspace();
  const navigate = useNavigate();
  const captureIntent = [
    "memory",
    "private-reference",
    "collection-piece",
    "quick-item",
  ].includes(context.intent)
    ? context.intent
    : "general";
  const configuredAssetStages =
    captureIntent === "memory"
      ? ["identity", "location", "materials"]
      : captureIntent === "private-reference"
      ? ["identity", "materials"]
      : captureIntent === "collection-piece" || captureIntent === "quick-item"
        ? ["identity", "location", "materials"]
        : ["category", "identity", "location", "materials"];
  const contextCollection = workspace.collections.find(
    (collection) =>
      collection.id === context.collectionId &&
      collection.status !== "archived",
  );
  const contextAsset = workspace.assets.find(
    (asset) =>
      asset.id === context.assetId &&
      asset.lifecycleStatus !== "archived",
  );
  const explicitContextPlace = workspace.places.find(
    (place) =>
      place.id === context.placeId &&
      place.status !== "archived",
  );
  const contextSpaceCandidate = workspace.spaces.find(
    (space) => space.id === context.spaceId,
  );
  const contextSpace =
    contextSpaceCandidate &&
    workspace.places.some(
      (place) =>
        place.id === contextSpaceCandidate.placeId &&
        place.status !== "archived",
    ) &&
    (!context.placeId ||
      explicitContextPlace?.id === contextSpaceCandidate.placeId)
      ? contextSpaceCandidate
      : null;
  const contextPlace =
    explicitContextPlace ||
    workspace.places.find(
      (place) =>
        place.id === contextSpace?.placeId &&
        place.status !== "archived",
    );
  const editingPlace =
    initialType === "place" && explicitContextPlace
      ? explicitContextPlace
      : null;
  const editingPropertyAsset = editingPlace
    ? propertyAssetForPlace(workspace, editingPlace.id)
    : null;
  const editingSpace =
    initialType === "space" && contextSpace ? contextSpace : null;
  const [initialContextError] = useState(
    () =>
      context.assetId && !contextAsset
        ? "The linked asset is missing or archived."
        : context.collectionId && !contextCollection
          ? "The linked collection is missing or archived."
        : context.placeId && !explicitContextPlace
          ? "The linked place is missing or archived."
          : context.spaceId && !contextSpace
            ? "The linked room or zone is unavailable."
            : null,
  );
  const [editingAsset] = useState(() => contextAsset || null);
  const focusedAssetStage =
    editingAsset &&
    ["identity", "location", "materials"].includes(context.stage)
      ? context.stage
      : null;
  const [type, setType] = useState(initialType);
  const [step, setStep] = useState(initialType ? "details" : "choose");
  const [assetStage, setAssetStage] = useState(
    focusedAssetStage
      ? focusedAssetStage
      : editingAsset
        ? "identity"
        : configuredAssetStages[0],
  );
  const [categoryBrowseGroupId, setCategoryBrowseGroupId] = useState(null);
  const [continuation, setContinuation] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [savedRecord, setSavedRecord] = useState(null);
  const savingRef = useRef(false);
  const allowNavigationRef = useRef(false);
  function createCaptureForm(
    asset = null,
    placeRecord = null,
    spaceRecord = null,
  ) {
    const category = resolveCategory(asset);
    const intentCategoryId =
      captureIntent === "memory"
        ? "legacy.story-memory"
        : captureIntent === "private-reference"
          ? "financial.bank-reference"
          : ["collection-piece", "quick-item"].includes(captureIntent)
            ? "custom.other"
            : "";
    const materialAsset = contextAsset || asset;
    const placeLocationMethod =
      placeRecord?.locationSource === "device_gps"
        ? "current"
        : placeRecord?.locationSource === "geocoder"
          ? "address"
          : placeRecord?.locationSource === "user_pin" ||
              placeRecord?.locationSource === "photo_exif"
            ? "pin"
            : placeRecord?.coordinates?.lat !== null &&
                placeRecord?.coordinates?.lat !== undefined &&
                placeRecord?.coordinates?.lng !== null &&
                placeRecord?.coordinates?.lng !== undefined
              ? "coordinates"
              : "later";
    return {
      name: asset?.name || placeRecord?.name || spaceRecord?.name || "",
      kind: placeRecord
        ? titleCase(placeRecord.kind)
        : spaceRecord
          ? titleCase(spaceRecord.kind)
          : "Home",
      tenure: placeRecord?.tenure || "unknown",
      createPropertyPassport: false,
      propertyPassportName: "",
      parentSpaceId: spaceRecord?.parentSpaceId || "",
      regionId: placeRecord
        ? placeRecord.regionId
        : contextPlace
          ? contextPlace.regionId || workspace.regions[0]?.id
        : workspace.regions[0]?.id || CITY_OPTIONS[0].id,
      placeId:
        asset?.placeId ||
        spaceRecord?.placeId ||
        contextPlace?.id ||
        "",
      spaceId: asset?.spaceId || contextSpace?.id || "",
      assetId: materialAsset?.id || "",
      assetQuery: materialAsset?.name || "",
      categoryId: category?.id || intentCategoryId,
      customCategory: asset?.customCategory || "",
      profile: asset?.profile || {},
      memoryPeople: asset?.profile?.people || "",
      memoryPeopleEntries: asset
        ? selectMemoryPeopleForAsset(workspace, asset.id)
        : [],
      memorySubjectType: memorySubjectTypeForAsset(asset, captureIntent),
      memoryPeriod: asset?.profile?.["date-period"] || "",
      memoryOrigin: asset?.profile?.origin || "",
      locationMode:
        asset?.locationMode ||
        (captureIntent === "private-reference"
          ? "not-applicable"
          : contextPlace
            ? "physical"
            : captureIntent === "memory"
              ? "not-applicable"
            : "unknown"),
      locationStatus:
        asset?.locationStatus ||
        (contextPlace ? "known" : "unknown"),
      locationDetail: asset?.locationDetail || "",
      locationMethod: placeLocationMethod,
      formattedAddress: placeRecord?.address || "",
      latitude: placeRecord?.coordinates?.lat ?? "",
      longitude: placeRecord?.coordinates?.lng ?? "",
      horizontalAccuracyMeters:
        placeRecord?.horizontalAccuracyMeters ?? "",
      locationSource: placeRecord?.locationSource || "not_set",
      locationPrecision:
        placeRecord?.locationPrecision || "locality_only",
      locationCapturedAt: placeRecord?.locationCapturedAt || "",
      reference: asset?.reference || "",
      value: asset?.value ? String(asset.value.amountMinor / 100) : "",
      notes: asset?.notes || "",
      meaningFacets:
        asset?.meaningFacets?.join(", ") ||
        (captureIntent === "memory"
          ? "memory, family-history"
          : captureIntent === "collection-piece"
            ? "collectible"
            : ""),
      sentimentalValue: asset?.sentimentalValue || "",
      legacyIntent: asset?.legacyIntent || "undecided",
      visibility:
        captureIntent === "private-reference"
          ? "private"
          : asset?.visibility || "private",
      acquiredAt: asset?.acquiredAt?.slice(0, 10) || "",
      evidenceType: materialAsset?.requiredProofTypes?.[0] || "Purchase receipt",
      materialKind: "paper",
      materialRelation: "ownership",
      materialNote: "",
      linkUrl: "",
      physicalLocation: "",
      materialStorageStatus: "unknown",
      materialPlaceId: "",
      materialSpaceId: "",
      materialLocatorText: "",
      materialCustodianMemberId: "",
      materialExternalLabel: "",
      materialStorageReason: "Original material added",
      addMaterial: initialType === "evidence",
      fileName: "",
      fileType: "",
      fileSize: null,
      fileChecksum: "",
      collectionDescription: "",
      collectionStory: "",
      collectionVisibility: "private",
      collectionAssetIds: [],
    };
  }
  const [form, setForm] = useState(() =>
    createCaptureForm(editingAsset, editingPlace, editingSpace),
  );
  const activeAssetStages =
    captureIntent === "memory"
      ? memoryCaptureStages(form.memorySubjectType)
      : configuredAssetStages;
  const [selectedFile, setSelectedFile] = useState(null);
  const [captureCommitIdentity, setCaptureCommitIdentity] = useState(
    createCaptureCommitIdentity,
  );
  const [draftRestored, setDraftRestored] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [error, setError] = useState("");
  const drawerRef = useRef(null);
  const titleMap = {
    choose: "What are you adding?",
    place: editingPlace ? "Edit place" : "Add a place",
    space: editingSpace ? "Edit room or container" : "Add a room or zone",
    asset: editingAsset ? "Edit asset" : "Add an asset",
    evidence: "Add paper or artifact",
    collection: "Create a collection",
  };
  const protectDraft = dirty && step !== "success";
  const draftContextKey = [
    initialType || "choose",
    context.assetId || "",
    context.placeId || "",
    context.spaceId || "",
    context.collectionId || "",
    ...(captureIntent === "general" ? [] : [captureIntent]),
  ].join("|");

  function clearCaptureDraft() {
    try {
      window.localStorage.removeItem(storageKeys.captureDraft);
    } catch {
      // The visible storage warning remains the recovery source.
    }
    deleteCaptureDraftFile(CAPTURE_DRAFT_FILE_ID, {
      scopeId: storageScopeId,
    }).catch(() => {});
  }

  function persistCaptureDraftSnapshot(
    identity = captureCommitIdentity,
  ) {
    window.localStorage.setItem(
      storageKeys.captureDraft,
      JSON.stringify({
        version: 4,
        contextKey: draftContextKey,
        type,
        step,
        assetStage,
        continuation,
        form,
        captureCommitIdentity: identity,
        hasFile: Boolean(selectedFile),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  useEffect(() => {
    let active = true;
    try {
      const raw = window.localStorage.getItem(storageKeys.captureDraft);
      if (!raw) return undefined;
      const draft = JSON.parse(raw);
      const age = Date.now() - Date.parse(draft.updatedAt || "");
      if (
        ![1, 2, 3, 4].includes(draft.version) ||
        draft.contextKey !== draftContextKey ||
        !draft.form ||
        !Number.isFinite(age) ||
        age > 7 * 24 * 60 * 60 * 1000
      ) {
        return undefined;
      }
      const draftCategory = getAssetCategory(draft.form.categoryId);
      const draftHasMemoryContext =
        captureIntent === "memory" ||
        draftCategory?.kind === "memory" ||
        String(draft.form.meaningFacets || "")
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .some((item) =>
            ["memory", "heirloom", "family-history"].includes(item),
          );
      const restoredForm = draftHasMemoryContext
        ? normalizeMemoryCaptureDraftForm(draft.form, {
            preferLegacyProfile: draft.version === 1,
          })
        : draft.form;
      setType(draft.type || initialType);
      setStep(draft.step === "review" ? "review" : "details");
      setAssetStage(draft.assetStage || configuredAssetStages[0]);
      setContinuation(draft.continuation || null);
      setForm((current) => ({ ...current, ...restoredForm }));
      if (
        draft.captureCommitIdentity &&
        typeof draft.captureCommitIdentity.evidenceId === "string" &&
        draft.captureCommitIdentity.evidenceId.trim() &&
        typeof draft.captureCommitIdentity.operationId === "string" &&
        draft.captureCommitIdentity.operationId.trim()
      ) {
        const restoredIdentity = createCaptureCommitIdentity();
        for (const key of Object.keys(restoredIdentity)) {
          const value = draft.captureCommitIdentity[key];
          if (typeof value === "string" && value.trim()) {
            restoredIdentity[key] = value;
          }
        }
        setCaptureCommitIdentity(restoredIdentity);
      }
      setDirty(true);
      setDraftRestored(true);
      if (draft.hasFile) {
        getCaptureDraftFile(CAPTURE_DRAFT_FILE_ID, {
          scopeId: storageScopeId,
        })
          .then((record) => {
            if (!active || !record?.blob) return;
            const restored = new File([record.blob], record.fileName, {
              type: record.fileType,
              lastModified: Date.now(),
            });
            setSelectedFile(restored);
          })
          .catch(() => {});
      }
    } catch {
      try {
        window.localStorage.removeItem(storageKeys.captureDraft);
      } catch {
        // Ignore an unreadable stale draft.
      }
    }
    return () => {
      active = false;
    };
  }, [draftContextKey, storageKeys.captureDraft]);

  useEffect(() => {
    if (!dirty || step === "success") return;
    const frame = window.setTimeout(() => {
      try {
        persistCaptureDraftSnapshot();
      } catch {
        // WorkspaceProvider exposes the broader browser storage failure.
      }
    }, 180);
    return () => window.clearTimeout(frame);
  }, [
    assetStage,
    captureCommitIdentity,
    continuation,
    dirty,
    draftContextKey,
    form,
    selectedFile,
    step,
    storageKeys.captureDraft,
    type,
  ]);

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        protectDraft &&
        !allowNavigationRef.current &&
        (currentLocation.pathname !== nextLocation.pathname ||
          currentLocation.search !== nextLocation.search),
      [protectDraft],
    ),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Discard the saved draft and the details you entered?")) {
      clearCaptureDraft();
      allowNavigationRef.current = true;
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!protectDraft) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [protectDraft],
    ),
  );

  function requestClose() {
    if (dirty && step !== "success" && !window.confirm("Discard the saved draft and the details you entered?")) return;
    clearCaptureDraft();
    allowNavigationRef.current = true;
    onClose();
  }

  useDialogFocus(drawerRef, requestClose);

  useEffect(() => {
    const body = drawerRef.current?.querySelector(".capture-body");
    if (body) body.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      drawerRef.current
        ?.querySelector("#capture-title")
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assetStage, step, type]);

  useEffect(() => {
    const drawer = drawerRef.current;
    drawer
      ?.querySelectorAll("[data-capture-invalid]")
      .forEach((control) => {
        control.removeAttribute("data-capture-invalid");
        control.removeAttribute("aria-invalid");
        control.removeAttribute("aria-errormessage");
      });
    if (!drawer || !error) return undefined;

    const selector =
      error.includes("category")
        ? ".category-search input"
        : error.includes("primary person")
          ? ".memory-add-person-button"
        : [
              "asset name",
              "belonging name",
              "story title",
              "person memory title",
              "moment title",
            ].some((phrase) => error.includes(phrase))
          ? '[data-memory-title], input[placeholder*="GMT"]'
          : error.includes("asset this material")
            ? "[data-asset-picker]"
          : error.includes("custom category")
            ? 'input[placeholder*="ceremonial"]'
            : error.includes("file or photo")
              ? 'input[type="file"]'
              : error.includes("note or story")
                ? "textarea"
                : error.includes("reference link")
                  ? 'input[type="url"]'
                  : error.includes("place")
                    ? "select"
                    : "input, select, textarea, button";
    const control = drawer.querySelector(selector);
    if (!control) return undefined;
    control.setAttribute("data-capture-invalid", "true");
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-errormessage", "capture-error");
    const frame = window.requestAnimationFrame(() => control.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [error]);

  function update(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "placeId") next.spaceId = "";
      if (name === "materialPlaceId") next.materialSpaceId = "";
      if (name === "tenure" && !editingPlace) {
        next.createPropertyPassport = isOwnedPropertyTenure(value);
        if (!isOwnedPropertyTenure(value)) {
          next.propertyPassportName = "";
        }
      }
      if (
        name === "materialKind" &&
        !current.materialPlaceId &&
        !current.materialSpaceId &&
        !current.materialLocatorText &&
        !current.materialCustodianMemberId &&
        !current.materialExternalLabel
      ) {
        next.materialStorageStatus = ["paper", "artifact", "record"].includes(
          value,
        )
          ? "unknown"
          : "not_applicable";
      }
      return next;
    });
    setDirty(true);
    setError("");
  }

  function chooseMemorySubject(memorySubjectType) {
    const hasPhysicalLocation = memorySubjectType === "physical";
    setForm((current) => ({
      ...current,
      memorySubjectType,
      locationMode: hasPhysicalLocation ? "physical" : "not-applicable",
      locationStatus: hasPhysicalLocation
        ? current.placeId
          ? "known"
          : "unknown"
        : "unknown",
      placeId: hasPhysicalLocation ? current.placeId : "",
      spaceId: hasPhysicalLocation ? current.spaceId : "",
      locationDetail: hasPhysicalLocation ? current.locationDetail : "",
    }));
    setDirty(true);
    setError("");
  }

  function updatePlaceLocation(changes) {
    setForm((current) => ({ ...current, ...changes }));
    setDirty(true);
    setError("");
  }

  async function chooseFile(file) {
    if (!file) {
      setSelectedFile(null);
      setForm((current) => ({
        ...current,
        fileName: "",
        fileType: "",
        fileSize: null,
        fileChecksum: "",
      }));
      deleteCaptureDraftFile(CAPTURE_DRAFT_FILE_ID, {
        scopeId: storageScopeId,
      }).catch(() => {});
      setDirty(true);
      setError("");
      return;
    }
    const validation = validateLocalFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setFileBusy(true);
    setError("");
    try {
      const metadata = await describeLocalFile(file);
      setSelectedFile(file);
      setForm((current) => ({ ...current, ...metadata }));
      setDirty(true);
      try {
        await putCaptureDraftFile(CAPTURE_DRAFT_FILE_ID, file, {
          scopeId: storageScopeId,
        });
      } catch {
        setError(
          "The file is selected for this session, but the browser could not preserve it as a recoverable draft.",
        );
      }
    } catch (fileError) {
      setError(fileError.message || "That file could not be prepared.");
    } finally {
      setFileBusy(false);
    }
  }

  function updateProfile(fieldId, value) {
    setForm((current) => ({
      ...current,
      profile: { ...current.profile, [fieldId]: value },
    }));
    setDirty(true);
    setError("");
  }

  function toggleCollectionAsset(assetId) {
    setForm((current) => ({
      ...current,
      collectionAssetIds: current.collectionAssetIds.includes(assetId)
        ? current.collectionAssetIds.filter((id) => id !== assetId)
        : [...current.collectionAssetIds, assetId],
    }));
    setDirty(true);
    setError("");
  }

  function chooseCategory(categoryId) {
    const category = getAssetCategory(categoryId);
    if (!category) return;
    setForm((current) => {
      const categoryChanged = current.categoryId !== category.id;
      const locationPolicy = getAssetLocationPolicy({
        kind: category.kind,
        profile: {
          ...current.profile,
          "memory-subject":
            current.memorySubjectType ||
            current.profile?.["memory-subject"] ||
            "story",
        },
      });
      const hadAutomaticVirtualMode =
        current.locationMode === "virtual" ||
        current.locationMode === "not-applicable";
      const locationMode =
        locationPolicy.usesNotApplicable
            ? "not-applicable"
          : locationPolicy.allowsVirtual
              ? "virtual"
            : contextPlace
              ? "physical"
              : hadAutomaticVirtualMode
                ? "unknown"
                : current.locationMode;
      const evidenceType =
        category.recommendedEvidenceTypes?.[0] ||
        current.evidenceType ||
        "Current photo";
      return {
        ...current,
        categoryId: category.id,
        customCategory: category.id === "custom.other" ? current.customCategory : "",
        profile: categoryChanged ? {} : current.profile,
        locationMode,
        locationStatus: locationMode === "physical" ? current.locationStatus : "unknown",
        placeId: locationMode === "physical" ? current.placeId : "",
        spaceId: locationMode === "physical" ? current.spaceId : "",
        evidenceType,
        materialKind: inferMaterialKind(evidenceType),
      };
    });
    setDirty(true);
    setError("");
  }

  function startQuickAsset(option) {
    setContinuation(null);
    setType("asset");
    setStep("details");
    setError("");
    if (option.categoryId) {
      setCategoryBrowseGroupId(null);
      chooseCategory(option.categoryId);
      setAssetStage("identity");
      return;
    }
    setCategoryBrowseGroupId(option.groupId || null);
    setAssetStage("category");
  }

  function browseAssetCategories(groupId = null) {
    setContinuation(null);
    setCategoryBrowseGroupId(groupId);
    setType("asset");
    setAssetStage("category");
    setStep("details");
    setError("");
  }

  function startRoomCapture() {
    if (!places.length) {
      setContinuation("space-after-place");
      setForm(createCaptureForm());
      setType("place");
      setStep("details");
      setDirty(false);
      setError("");
      return;
    }
    setContinuation(null);
    setForm((current) => ({
      ...current,
      placeId: current.placeId || places[0]?.id || "",
    }));
    setType("space");
    setStep("details");
    setError("");
  }

  function startMaterialCapture() {
    setContinuation(null);
    setType("evidence");
    setStep("details");
    setError("");
  }

  function startCollectionCapture() {
    setContinuation(null);
    setForm(createCaptureForm());
    setType("collection");
    setStep("details");
    setDirty(false);
    setError("");
  }

  function startMaterialParentAsset() {
    setContinuation("material-after-asset");
    setCategoryBrowseGroupId(null);
    setForm(createCaptureForm());
    setType("asset");
    setAssetStage("category");
    setStep("details");
    setDirty(false);
    setError("");
  }

  function chooseLocation(value) {
    if (
      (value === "virtual" && !selectedLocationPolicy.allowsVirtual) ||
      (value === "not-applicable" &&
        !selectedLocationPolicy.usesNotApplicable)
    ) {
      setError(
        "This category describes something physical. Record a findable place, mark it Needs detail, or keep it Unknown.",
      );
      return;
    }
    if (value === "known" || value === "needs-detail") {
      update("locationMode", "physical");
      setForm((current) => ({
        ...current,
        locationMode: "physical",
        locationStatus: value,
      }));
    } else if (value === "virtual") {
      setForm((current) => ({
        ...current,
        locationMode: "virtual",
        locationStatus: "unknown",
        placeId: "",
        spaceId: "",
      }));
      setDirty(true);
      setError("");
    } else if (value === "not-applicable") {
      setForm((current) => ({
        ...current,
        locationMode: "not-applicable",
        locationStatus: "unknown",
        placeId: "",
        spaceId: "",
      }));
      setDirty(true);
      setError("");
    } else {
      setForm((current) => ({
        ...current,
        locationMode: "unknown",
        locationStatus: "unknown",
        placeId: "",
        spaceId: "",
      }));
      setDirty(true);
      setError("");
    }
  }

  function validateMaterial() {
    if (!form.addMaterial && type === "asset") return "";
    if (
      type === "evidence" &&
      !workspace.assets.some(
        (asset) =>
          asset.id === form.assetId &&
          asset.lifecycleStatus !== "archived",
      )
    ) {
      return "Choose the asset this material supports.";
    }
    if (!form.evidenceType.trim()) return "Name this paper, artifact, record, or story.";
    if (["paper", "media"].includes(form.materialKind) && !form.fileName) {
      return "Choose a file or photo to store on this device.";
    }
    if (form.materialKind === "note" && !form.materialNote.trim()) {
      return "Write the note or story you want to preserve.";
    }
    if (
      form.materialKind === "link" &&
      !isSafeReferenceUrl(form.linkUrl)
    ) {
      return "Add a valid http or https reference link.";
    }
    if (
      form.materialStorageStatus === "known" &&
      !workspace.places.some(
        (place) =>
          place.id === form.materialPlaceId &&
          place.status !== "archived",
      )
    ) {
      return "Choose where the original material is stored, choose Needs detail, or mark it unknown.";
    }
    if (
      form.materialStorageStatus === "known" &&
      !form.materialSpaceId &&
      !form.materialLocatorText.trim()
    ) {
      return "Add a room, container, or locator clue before marking the original storage known.";
    }
    if (
      ["known", "needs_detail"].includes(
        form.materialStorageStatus,
      ) &&
      form.materialSpaceId &&
      !workspace.spaces.some(
        (space) =>
          space.id === form.materialSpaceId &&
          space.placeId === form.materialPlaceId,
      )
    ) {
      return "Choose a room or container inside the selected material storage place.";
    }
    if (
      form.materialStorageStatus === "external_custodian" &&
      !form.materialCustodianMemberId &&
      !form.materialExternalLabel.trim()
    ) {
      return "Name the person or organization holding the original material.";
    }
    if (
      form.materialKind === "artifact" &&
      !form.materialLocatorText.trim() &&
      !form.materialPlaceId &&
      !form.materialExternalLabel.trim() &&
      !form.materialCustodianMemberId &&
      !form.materialNote.trim() &&
      !form.fileName
    ) {
      return "Add a photo, location, or note that identifies the physical artifact.";
    }
    return "";
  }

  function validateFinancialDraft() {
    if (selectedCategory?.kind !== "financial") return "";
    const rawReference = String(
      form.profile?.["account-reference"] || "",
    ).trim();
    const accountEnding = rawReference
      ? rawReference.replace(/[^A-Za-z0-9]/g, "").slice(-4)
      : "";
    const validation = validatePrivateFinancialReference({
      id: editingAsset?.id || "draft-financial-reference",
      label: form.name.trim() || "Draft financial reference",
      institution: String(form.profile?.institution || "").trim(),
      kind:
        selectedCategory.id === "financial.investment"
          ? "brokerage"
          : selectedCategory.id === "financial.policy-membership"
            ? "insurance"
            : "bank",
      accountEnding,
      profile: form.profile,
      reference: form.reference,
      notes: form.notes,
    });
    if (validation.valid) return "";
    const combined = validation.errors.join(" ").toLowerCase();
    if (
      combined.includes("credential") ||
      combined.includes("recovery secret") ||
      combined.includes("not allowed")
    ) {
      return "Remove passwords, PINs, credentials, recovery phrases, tokens, private keys, and security answers. Continuity stores references only.";
    }
    if (
      combined.includes("full account number") ||
      combined.includes("accountending")
    ) {
      return "Use only a masked reference or the final four letters or digits—never a full account number.";
    }
    if (combined.includes("institution")) {
      return "Add the institution that holds this reference.";
    }
    return "Review the private reference and remove any credential-like or unsupported information.";
  }

  function validateAssetLocationDraft() {
    if (type !== "asset") return "";
    if (
      form.locationMode === "virtual" &&
      !selectedLocationPolicy.allowsVirtual
    ) {
      return "This physical category cannot use No physical location. Choose a findable place, Needs detail, or Unknown.";
    }
    if (
      form.locationMode === "not-applicable" &&
      !selectedLocationPolicy.usesNotApplicable
    ) {
      return "Location can be Not applicable only for a non-physical memory.";
    }
    if (form.locationMode !== "physical") return "";

    const place = workspace.places.find(
      (item) =>
        item.id === form.placeId &&
        item.status !== "archived",
    );
    if ((form.locationStatus === "known" || form.placeId) && !place) {
      return "Choose a place, choose Needs detail, or mark the location Unknown.";
    }
    if (
      form.spaceId &&
      !workspace.spaces.some(
        (space) =>
          space.id === form.spaceId &&
          space.placeId === form.placeId,
      )
    ) {
      return "Choose a room or container inside the selected Place.";
    }
    if (form.locationStatus !== "known") return "";
    if (selectedLocationPolicy.isRealEstate) {
      if (!hasConfirmedExactPlaceLocation(place)) {
        return "Confirm an exact Place pin before marking this property location Known.";
      }
      return "";
    }
    if (!form.spaceId && !form.locationDetail.trim()) {
      return "Add a room, container, or useful locator clue before marking this item Known.";
    }
    return "";
  }

  function validate() {
    if (
      !actorMemberId &&
      (["asset", "evidence"].includes(type) ||
        (type === "place" && form.createPropertyPassport) ||
        Boolean(editingPlace) ||
        Boolean(editingSpace))
    ) {
      return "An active workspace member is required to save this correction.";
    }
    if (type === "place" && !form.name.trim()) return "Enter a name for this place.";
    if (
      type === "place" &&
      form.createPropertyPassport &&
      !isOwnedPropertyTenure(form.tenure)
    ) {
      return "Only an owned or co-owned Place can create a property passport.";
    }
    if (type === "place" && form.locationMethod !== "later") {
      const latitude = Number(form.latitude);
      const longitude = Number(form.longitude);
      if (
        form.latitude === "" ||
        form.latitude === null ||
        form.latitude === undefined ||
        form.longitude === "" ||
        form.longitude === null ||
        form.longitude === undefined ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        return "Choose a valid map point or enter latitude and longitude.";
      }
    }
    if (
      type === "space" &&
      (!form.name.trim() ||
        !workspace.places.some(
          (place) =>
            place.id === form.placeId &&
            place.status !== "archived",
        ))
    ) {
      return "Enter a name and choose its place.";
    }
    if (
      type === "space" &&
      form.parentSpaceId &&
      !availableParentSpaces.some(
        (space) => space.id === form.parentSpaceId,
      )
    ) {
      return "Choose a parent inside the same place that does not create a loop.";
    }
    if (type === "collection" && !form.name.trim()) {
      return "Name this collection.";
    }
    if (type === "asset" && context.assetId && !contextAsset) {
      return "This asset is no longer active. Close this draft and choose another record.";
    }
    if (type === "asset" && !form.categoryId) return "Choose a category first.";
    if (type === "asset" && !form.name.trim()) {
      return showsMemoryContext
        ? `Enter a ${memoryFormCopy.nameLabel.toLowerCase()}.`
        : "Enter an asset name.";
    }
    if (type === "asset" && showsMemoryContext) {
      const memoryError = validateMemorySubjectDetails(
        form.memorySubjectType,
        form.memoryPeopleEntries || [],
      );
      if (memoryError) return memoryError;
    }
    if (type === "asset") {
      const financialError = validateFinancialDraft();
      if (financialError) return financialError;
      const locationError = validateAssetLocationDraft();
      if (locationError) return locationError;
    }
    if (type === "asset" && showsPhysicalMemoryFields && form.value) {
      const amount = Number(form.value.replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount < 0) return "Enter a valid positive value, or leave it blank.";
    }
    if (type === "asset") return validateMaterial();
    if (type === "evidence") return validateMaterial();
    return "";
  }

  function continueToReview(event) {
    event?.preventDefault();
    if (type === "asset" && step === "details") {
      const stageOrder = activeAssetStages;
      const stageIndex = stageOrder.indexOf(assetStage);
      let stageError = "";
      if (assetStage === "category" && !form.categoryId) {
        stageError = "Choose a category to continue.";
      } else if (assetStage === "identity") {
        if (!form.name.trim()) {
          stageError = showsMemoryContext
            ? `Enter a ${memoryFormCopy.nameLabel.toLowerCase()}.`
            : "Enter an asset name.";
        }
        if (!stageError && showsMemoryContext) {
          stageError = validateMemorySubjectDetails(
            form.memorySubjectType,
            form.memoryPeopleEntries || [],
          );
        }
        if (!stageError) stageError = validateFinancialDraft();
        if (showsPhysicalMemoryFields && form.value) {
          const amount = Number(form.value.replace(/,/g, ""));
          if (!Number.isFinite(amount) || amount < 0) {
            stageError = "Enter a valid positive value, or leave it blank.";
          }
        }
      } else if (assetStage === "location") {
        stageError = validateAssetLocationDraft();
      } else if (assetStage === "materials") {
        stageError = validateMaterial();
      }
      if (stageError) {
        setError(stageError);
        return;
      }
      if (
        assetStage === "category" &&
        selectedCategory?.kind === "real-estate" &&
        !editingAsset
      ) {
        setForm({
          ...createCaptureForm(),
          kind:
            PROPERTY_PLACE_KIND_BY_CATEGORY[selectedCategory.id] ||
            "Property",
          tenure: "unknown",
          createPropertyPassport: false,
        });
        setType("place");
        setContinuation(null);
        setStep("details");
        setError("");
        setDirty(true);
        return;
      }
      if (focusedAssetStage && assetStage === focusedAssetStage) {
        setStep("review");
        setError("");
        return;
      }
      if (stageIndex < stageOrder.length - 1) {
        setAssetStage(stageOrder[stageIndex + 1]);
        setError("");
        return;
      }
    }
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setStep("review");
  }

  function materialRecord(assetId, id, now, storedRecord = null) {
    return {
      id,
      assetId,
      type: form.evidenceType.trim(),
      kind: form.materialKind,
      relation: form.materialRelation,
      status: "pending",
      fileName: storedRecord?.fileName || form.fileName || null,
      fileType: storedRecord?.fileType || form.fileType || null,
      fileSize: storedRecord?.fileSize ?? form.fileSize,
      fileChecksum:
        storedRecord?.fileChecksum || form.fileChecksum || null,
      originalVersionId: storedRecord?.originalVersionId || null,
      fileState: form.fileName
        ? selectedFile
          ? "ready_local"
          : "missing_original"
        : null,
      storageScope: form.fileName ? "local-device" : null,
      linkUrl: form.linkUrl.trim() || null,
      physicalLocation: form.materialLocatorText.trim() || null,
      materialStorage: {
        status: form.materialStorageStatus,
        placeId: ["known", "needs_detail"].includes(
          form.materialStorageStatus,
        )
          ? form.materialPlaceId || null
          : null,
        spaceId: ["known", "needs_detail"].includes(
          form.materialStorageStatus,
        )
          ? form.materialSpaceId || null
          : null,
        locatorText:
          form.materialStorageStatus === "not_applicable"
            ? null
            : form.materialLocatorText.trim() || null,
        custodianMemberId:
          form.materialStorageStatus === "external_custodian"
            ? form.materialCustodianMemberId || null
            : null,
        externalLabel:
          form.materialStorageStatus === "external_custodian"
            ? form.materialExternalLabel.trim() || null
            : null,
        movedAt: now,
        movedByMemberId: actorMemberId,
        reason: "Original material added",
      },
      note: form.materialNote.trim(),
      addedAt: now,
    };
  }

  async function commitMetadataOrRetainDraft(
    actions,
    {
      fallbackMessage =
        "This record could not be saved durably. Nothing from this capture was added, and your draft is still available.",
      assetStageOnError = null,
    } = {},
  ) {
    try {
      await commitWorkspaceActions({
        actions,
        operationId: captureCommitIdentity.operationId,
        now: captureCommitIdentity.committedAt,
      });
      return true;
    } catch (commitError) {
      const message = commitError?.message || fallbackMessage;
      setError(message);
      setAnnouncement(message);
      setStep("details");
      if (assetStageOnError) setAssetStage(assetStageOnError);
      savingRef.current = false;
      return false;
    }
  }

  async function save() {
    if (step === "success" || savingRef.current) return;
    savingRef.current = true;
    const validation = validate();
    if (validation) {
      setError(validation);
      setStep("details");
      if (type === "asset") {
        const normalizedValidation = validation.toLowerCase();
        if (normalizedValidation.includes("category")) setAssetStage("category");
        else if (
          normalizedValidation.includes("asset name") ||
          normalizedValidation.includes("positive value")
        ) {
          setAssetStage("identity");
        } else if (
          [
            "material",
            "original",
            "file",
            "photo",
            "paper",
            "artifact",
            "reference link",
            "note or story",
          ].some((term) => normalizedValidation.includes(term))
        ) {
          setAssetStage("materials");
        } else if (
          [
            "place",
            "location",
            "room",
            "container",
            "locator",
            "pin",
            "physical",
            "unknown",
          ].some((term) => normalizedValidation.includes(term)) ||
          normalizedValidation.includes("no longer active")
        ) {
          setAssetStage("location");
        } else {
          setAssetStage("materials");
        }
      }
      savingRef.current = false;
      return;
    }
    try {
      persistCaptureDraftSnapshot();
    } catch {
      const message =
        "Continuity could not secure this draft's retry identity in browser storage. Nothing was saved; keep this tab open and try again.";
      setError(message);
      setAnnouncement(message);
      setStep("details");
      savingRef.current = false;
      return;
    }
    const now = captureCommitIdentity.committedAt;
    if (type === "place") {
      const id = editingPlace?.id || captureCommitIdentity.placeId;
      const region =
        workspace.regions.find((item) => item.id === form.regionId) ||
        CITY_OPTIONS.find((item) => item.id === form.regionId) ||
        CITY_OPTIONS[0];
      const place = {
        id,
        name: form.name.trim(),
        kind: form.kind,
        tenure: form.tenure,
        regionId: region.id,
        regionName: region.name,
        city: region.name,
        countryCode: region.countryCode || null,
        regionCoordinates: {
          lat: region.lat,
          lng: region.lng,
        },
        coordinates:
          form.locationMethod === "later"
            ? { lat: null, lng: null }
            : {
                lat: Number(form.latitude),
                lng: Number(form.longitude),
              },
        formattedAddress:
          form.locationMethod === "later"
            ? form.formattedAddress.trim() || region.name
            : form.formattedAddress.trim() || null,
        locationSource:
          form.locationMethod === "later"
            ? "not_set"
            : form.locationSource,
        locationPrecision:
          form.locationMethod === "later"
            ? "locality_only"
            : form.locationPrecision,
        horizontalAccuracyMeters:
          form.locationPrecision === "user_placed" ||
          form.horizontalAccuracyMeters === ""
            ? null
            : Number(form.horizontalAccuracyMeters),
        locationCapturedAt: form.locationCapturedAt || now,
        locationConfirmedAt:
          form.locationMethod === "later" ? null : now,
        createdAt: editingPlace?.createdAt || now,
      };
      const createPropertyAsset =
        !editingPlace &&
        isOwnedPropertyTenure(form.tenure) &&
        form.createPropertyPassport;
      const propertyAssetId = createPropertyAsset
        ? captureCommitIdentity.propertyAssetId
        : null;
      const placeAction = editingPlace
        ? {
            type: "UPDATE_PLACE",
            memberId: actorMemberId,
            placeId: editingPlace.id,
            changes: place,
            now,
          }
        : {
            type: "ADD_PLACE",
            memberId: actorMemberId,
            place,
            createPropertyAsset,
            propertyAsset: createPropertyAsset
              ? {
                  id: propertyAssetId,
                  locationAssignmentId:
                    captureCommitIdentity.propertyLocationAssignmentId,
                  name:
                    form.propertyPassportName.trim() ||
                    `${place.name} property passport`,
                }
              : null,
            now,
          };
      if (
        !(await commitMetadataOrRetainDraft([placeAction], {
          fallbackMessage:
            "This Place could not be saved durably. Nothing was added, and your draft is still available.",
        }))
      ) {
        return;
      }
      setSavedRecord({
        type: "place",
        id,
        name: place.name,
        propertyAssetId:
          propertyAssetId || editingPropertyAsset?.id || null,
      });
      if (!editingPlace && continuation === "space-after-place") {
        clearCaptureDraft();
        setCaptureCommitIdentity(createCaptureCommitIdentity());
        setContinuation(null);
        setSavedRecord(null);
        setForm({
          ...createCaptureForm(),
          kind: "Room",
          placeId: id,
        });
        setType("space");
        setStep("details");
        setDirty(false);
        setAnnouncement(
          `${place.name} was added. Now name the room or zone inside it.`,
        );
        savingRef.current = false;
        return;
      }
    } else if (type === "space") {
      const id = editingSpace?.id || captureCommitIdentity.spaceId;
      const space = {
        id,
        placeId: form.placeId,
        parentSpaceId: form.parentSpaceId || null,
        name: form.name.trim(),
        kind: form.kind === "Home" ? "Room" : form.kind,
        createdAt: editingSpace?.createdAt || now,
      };
      const spaceAction = editingSpace
        ? {
            type: "UPDATE_SPACE",
            memberId: actorMemberId,
            spaceId: editingSpace.id,
            changes: space,
            now,
          }
        : {
            type: "ADD_SPACE",
            memberId: actorMemberId,
            space,
            now,
          };
      if (
        !(await commitMetadataOrRetainDraft([spaceAction], {
          fallbackMessage:
            "This room or container could not be saved durably. Nothing was added, and your draft is still available.",
        }))
      ) {
        return;
      }
      setSavedRecord({ type: "space", id, placeId: form.placeId, name: space.name });
    } else if (type === "asset") {
      const selectedCategory = getAssetCategory(form.categoryId);
      const selectedPath = getAssetCategoryPath(form.categoryId);
      if (!selectedCategory || !selectedPath) {
        setError("Choose a valid category before saving.");
        setStep("details");
        setAssetStage("category");
        savingRef.current = false;
        return;
      }
      const requiredProofTypes =
        editingAsset && editingAsset.categoryId === selectedCategory.id
          ? editingAsset.requiredProofTypes
          : selectedCategory.recommendedEvidenceTypes?.slice(0, 1) || [];
      const hasPhysicalLocation = form.locationMode === "physical";
      const profile = { ...form.profile };
      const peopleLabel = memoryPeopleLabel(
        form.memoryPeopleEntries || [],
      );
      if (showsMemoryContext) {
        profile["people-model"] = "canonical-v1";
      }
      for (const [field, value] of [
        ["people", peopleLabel],
        ["date-period", form.memoryPeriod],
        ["origin", form.memoryOrigin],
        [
          "memory-subject",
          showsMemoryContext ? form.memorySubjectType : "",
        ],
      ]) {
        const normalized = String(value || "").trim();
        if (normalized) profile[field] = normalized;
        else delete profile[field];
      }
      const changes = {
        name: form.name.trim(),
        category: form.customCategory.trim() || selectedCategory.label,
        categoryId: selectedCategory.id,
        categoryPath: selectedPath.ids,
        customCategory:
          selectedCategory.id === "custom.other"
            ? form.customCategory.trim()
            : null,
        taxonomyVersion: ASSET_TAXONOMY_VERSION,
        kind: selectedCategory.kind,
        profile,
        placeId:
          hasPhysicalLocation && form.locationStatus !== "unknown"
            ? form.placeId || null
            : null,
        spaceId:
          hasPhysicalLocation && form.locationStatus !== "unknown"
            ? form.spaceId || null
            : null,
        locationMode: form.locationMode,
        locationStatus:
          hasPhysicalLocation ? form.locationStatus : "unknown",
        locationDetail: form.locationDetail.trim(),
        reference: showsPhysicalMemoryFields ? form.reference.trim() : "",
        notes: form.notes.trim(),
        meaningFacets: form.meaningFacets
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
        sentimentalValue: form.sentimentalValue.trim() || null,
        legacyIntent: showsPhysicalMemoryFields
          ? form.legacyIntent
          : "archive-story",
        visibility:
          selectedCategory.kind === "financial"
            ? "private"
            : form.visibility,
        acquiredAt: showsPhysicalMemoryFields && form.acquiredAt
          ? new Date(`${form.acquiredAt}T00:00:00.000Z`).toISOString()
          : null,
        value: showsPhysicalMemoryFields && form.value
          ? { amountMinor: Math.round(Number(form.value.replace(/,/g, "")) * 100), currency: "QAR" }
          : null,
        requiredProofTypes,
      };
      const materialEvidenceId = form.addMaterial
        ? captureCommitIdentity.evidenceId
        : null;
      let storedMaterialOriginal = null;
      if (form.addMaterial && form.fileName) {
        if (!selectedFile) {
          setError(
            "The selected file is no longer available. Choose it again before saving.",
          );
          setStep("details");
          setAssetStage("materials");
          savingRef.current = false;
          return;
        }
        try {
          storedMaterialOriginal = await describeEvidenceOriginal(
            materialEvidenceId,
            selectedFile,
          );
        } catch (fileError) {
          setError(
            fileError?.message ||
              "The browser could not prepare this file. Your draft is still available—retry or remove the file.",
          );
          setStep("details");
          setAssetStage("materials");
          savingRef.current = false;
          return;
        }
      }
      let savedAssetId = editingAsset?.id;
      const assetActions = [];
      if (editingAsset) {
        const {
          placeId: nextPlaceId,
          spaceId: nextSpaceId,
          locationStatus: nextLocationStatus,
          locationMode: nextLocationMode,
          locationDetail: nextLocationDetail,
          ...nonLocationChanges
        } = changes;
        assetActions.push({
          type: "UPDATE_ASSET",
          assetId: editingAsset.id,
          changes: nonLocationChanges,
          now,
        });
        assetActions.push({
          type: "MOVE_ASSET",
          memberId: actorMemberId,
          assetId: editingAsset.id,
          placeId: nextPlaceId,
          spaceId: nextSpaceId,
          locationStatus: nextLocationStatus,
          locationMode: nextLocationMode,
          locationDetail: nextLocationDetail,
          source: "user",
          assignmentId:
            captureCommitIdentity.moveLocationAssignmentId,
          reason: "Location corrected in standard capture",
          now,
        });
      } else {
        const id = captureCommitIdentity.assetId;
        savedAssetId = id;
        assetActions.push({
          type: "ADD_ASSET",
          memberId: actorMemberId,
          asset: {
            id,
            ...changes,
            locationSource: "user",
            locationAssignmentId:
              captureCommitIdentity.assetLocationAssignmentId,
            lifecycleStatus: "active",
            createdAt: now,
          },
          now,
        });
        if (contextCollection) {
          assetActions.push({
            type: "ADD_COLLECTION_MEMBER",
            collectionId: contextCollection.id,
            assetId: id,
            now,
          });
        }
      }
      if (showsMemoryContext) {
        const peopleResult = buildMemoryPeopleCommands({
          workspace,
          assetId: savedAssetId,
          entries: form.memoryPeopleEntries || [],
          now,
          idFactory: (() => {
            let index = 0;
            return (prefix) =>
              `${captureCommitIdentity.operationId}-${prefix}-${index++}`;
          })(),
        });
        for (const command of peopleResult.commands) {
          assetActions.push({
            type: "APPLY_COLLECTOR_COMMAND",
            command,
          });
        }
      }
      if (form.addMaterial) {
        assetActions.push({
          type: "ADD_EVIDENCE",
          memberId: actorMemberId,
          evidence: materialRecord(
            savedAssetId,
            materialEvidenceId,
            now,
            storedMaterialOriginal,
          ),
          now,
        });
      }
      if (form.addMaterial && selectedFile) {
        try {
          await commitWorkspaceActionsWithFiles({
            actions: assetActions,
            files: [
              {
                evidenceId: materialEvidenceId,
                file: selectedFile,
                expectedCurrentOriginalVersionId: null,
              },
            ],
            operationId: captureCommitIdentity.operationId,
            now,
          });
        } catch (commitError) {
          const message =
            commitError?.message ||
            "The record and its original could not be saved together. Nothing was added, and your draft is still available.";
          setError(message);
          setAnnouncement(message);
          setStep("details");
          setAssetStage("materials");
          savingRef.current = false;
          return;
        }
      } else {
        if (
          !(await commitMetadataOrRetainDraft(assetActions, {
            fallbackMessage:
              "This asset could not be saved durably. Nothing was added, and your draft is still available.",
            assetStageOnError: "materials",
          }))
        ) {
          return;
        }
      }
      setSavedRecord({
        type: "asset",
        id: savedAssetId,
        name: changes.name,
      });
      if (
        continuation === "material-after-asset" &&
        !editingAsset &&
        !form.addMaterial
      ) {
        clearCaptureDraft();
        setCaptureCommitIdentity(createCaptureCommitIdentity());
        const evidenceType =
          selectedCategory.recommendedEvidenceTypes?.[0] ||
          "Purchase receipt";
        setContinuation(null);
        setSavedRecord(null);
        setForm({
          ...createCaptureForm(),
          assetId: savedAssetId,
          assetQuery: changes.name,
          addMaterial: true,
          evidenceType,
          materialKind: inferMaterialKind(evidenceType),
        });
        setType("evidence");
        setStep("details");
        setDirty(false);
        setAnnouncement(
          `${changes.name} was added. Now add the paper or artifact that supports it.`,
        );
        savingRef.current = false;
        return;
      }
      if (continuation === "material-after-asset") {
        setContinuation(null);
      }
    } else if (type === "evidence") {
      const id = captureCommitIdentity.evidenceId;
      let storedMaterialOriginal = null;
      if (form.fileName) {
        if (!selectedFile) {
          setError(
            "The selected file is no longer available. Choose it again before saving.",
          );
          setStep("details");
          savingRef.current = false;
          return;
        }
        try {
          storedMaterialOriginal = await describeEvidenceOriginal(
            id,
            selectedFile,
          );
        } catch (fileError) {
          setError(
            fileError?.message ||
              "The browser could not prepare this file. Your draft is still available—retry or remove the file.",
          );
          setStep("details");
          savingRef.current = false;
          return;
        }
      }
      const evidenceAction = {
        type: "ADD_EVIDENCE",
        memberId: actorMemberId,
        evidence: materialRecord(
          form.assetId,
          id,
          now,
          storedMaterialOriginal,
        ),
        now,
      };
      if (selectedFile) {
        try {
          await commitWorkspaceActionsWithFiles({
            actions: [evidenceAction],
            files: [
              {
                evidenceId: id,
                file: selectedFile,
                expectedCurrentOriginalVersionId: null,
              },
            ],
            operationId: captureCommitIdentity.operationId,
            now,
          });
        } catch (commitError) {
          const message =
            commitError?.message ||
            "The material and its original could not be saved together. Nothing was added, and your draft is still available.";
          setError(message);
          setAnnouncement(message);
          setStep("details");
          savingRef.current = false;
          return;
        }
      } else {
        if (
          !(await commitMetadataOrRetainDraft([evidenceAction], {
            fallbackMessage:
              "This material could not be saved durably. Nothing was added, and your draft is still available.",
          }))
        ) {
          return;
        }
      }
      setSavedRecord({ type: "evidence", id, assetId: form.assetId, name: form.evidenceType });
    } else if (type === "collection") {
      const id = captureCommitIdentity.collectionId;
      const collectionAction = {
        type: "ADD_COLLECTION",
        collection: {
          id,
          name: form.name.trim(),
          description: form.collectionDescription.trim(),
          story: form.collectionStory.trim(),
          kind: form.kind === "Home" ? "collection" : form.kind,
          visibility: form.collectionVisibility,
          assetIds: form.collectionAssetIds,
          featuredAssetIds: form.collectionAssetIds.slice(0, 3),
          createdAt: now,
        },
        now,
      };
      if (
        !(await commitMetadataOrRetainDraft([collectionAction], {
          fallbackMessage:
            "This collection could not be saved durably. Nothing was added, and your draft is still available.",
        }))
      ) {
        return;
      }
      setSavedRecord({ type: "collection", id, name: form.name.trim() });
    }
    setDirty(false);
    clearCaptureDraft();
    setSelectedFile(null);
    setStep("success");
    setAnnouncement(
      type === "place" &&
        !editingPlace &&
        isOwnedPropertyTenure(form.tenure) &&
        form.createPropertyPassport
        ? `${form.name.trim()} and its linked property passport were added.`
        : `${type === "evidence" ? "Material" : "Record"} added to the local demo workspace.`,
    );
  }

  function viewSaved() {
    if (!savedRecord) return;
    allowNavigationRef.current = true;
    let target;
    if (
      savedRecord.type === "asset" &&
      contextCollection &&
      captureIntent === "collection-piece"
    ) {
      target = `/collections/${contextCollection.id}`;
    }
    else if (savedRecord.type === "asset") target = `/assets/${savedRecord.id}`;
    else if (savedRecord.type === "evidence") target = `/evidence/${savedRecord.id}`;
    else if (savedRecord.type === "collection") target = `/collections/${savedRecord.id}`;
    else if (savedRecord.type === "place") target = `/places/${savedRecord.id}`;
    else target = `/places/${savedRecord.placeId}/spaces/${savedRecord.id}`;

    navigate(target, { replace: true, state: null });
  }

  function addMaterialAfterSave() {
    const assetId =
      savedRecord?.type === "asset"
        ? savedRecord.id
        : savedRecord?.assetId;
    if (!assetId) return;
    savingRef.current = false;
    setType("evidence");
    setStep("details");
    setSavedRecord(null);
    setSelectedFile(null);
    setCaptureCommitIdentity(createCaptureCommitIdentity());
    setForm((current) => ({
      ...current,
      assetId,
      addMaterial: true,
      materialKind: "paper",
      materialRelation: "ownership",
      evidenceType: "Purchase receipt",
      fileName: "",
      fileType: "",
      fileSize: null,
      fileChecksum: "",
      materialNote: "",
      linkUrl: "",
      physicalLocation: "",
      materialStorageStatus: "unknown",
      materialPlaceId: "",
      materialSpaceId: "",
      materialLocatorText: "",
      materialCustodianMemberId: "",
      materialExternalLabel: "",
      materialStorageReason: "Original material added",
    }));
  }

  function goBack() {
    if (step === "review") {
      setStep("details");
      if (type === "asset") {
        setAssetStage(focusedAssetStage || "materials");
      }
      return;
    }
    if (type === "asset") {
      const order = activeAssetStages;
      const index = order.indexOf(assetStage);
      if (index > 0) {
        setAssetStage(order[index - 1]);
        setError("");
        return;
      }
    }
    if (type) {
      setForm(createCaptureForm());
      setType(null);
      setStep("choose");
      setCategoryBrowseGroupId(null);
      setContinuation(null);
      setError("");
      setSelectedFile(null);
      deleteCaptureDraftFile(CAPTURE_DRAFT_FILE_ID, {
        scopeId: storageScopeId,
      }).catch(() => {});
      setDirty(false);
      savingRef.current = false;
      return;
    }
    requestClose();
  }

  const places = workspace.places.filter((place) => place.status !== "archived");
  const spaces = workspace.spaces.filter((space) => space.placeId === form.placeId);
  const unavailableParentSpaceIds = new Set(
    editingSpace ? [editingSpace.id] : [],
  );
  if (editingSpace) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const space of spaces) {
        if (
          space.parentSpaceId &&
          unavailableParentSpaceIds.has(space.parentSpaceId) &&
          !unavailableParentSpaceIds.has(space.id)
        ) {
          unavailableParentSpaceIds.add(space.id);
          changed = true;
        }
      }
    }
  }
  const availableParentSpaces = spaces.filter(
    (space) => !unavailableParentSpaceIds.has(space.id),
  );
  const reviewPlace = places.find((place) => place.id === form.placeId);
  const reviewPlaceHasCoordinates =
    Number.isFinite(reviewPlace?.coordinates?.lat) &&
    Number.isFinite(reviewPlace?.coordinates?.lng);
  const reviewPlaceHasPin =
    reviewPlaceHasCoordinates &&
    reviewPlace.locationPrecision !== "locality_only";
  const reviewPlaceAccuracy = !reviewPlaceHasCoordinates
    ? "No property pin yet"
    : placePrecisionSummary(reviewPlace);
  const reviewSpacePath = form.spaceId
    ? selectSpacePath(workspace, form.spaceId)
    : [];
  const reviewLocationPath = [
    reviewPlace?.name,
    ...reviewSpacePath.map((space) => space.name),
    form.locationDetail || null,
  ]
    .filter(Boolean)
    .join(" → ");
  const reviewMaterialPlace = places.find(
    (place) => place.id === form.materialPlaceId,
  );
  const reviewMaterialSpacePath = form.materialSpaceId
    ? selectSpacePath(workspace, form.materialSpaceId)
    : [];
  const reviewMaterialStoragePath = [
    reviewMaterialPlace?.name,
    ...reviewMaterialSpacePath.map((space) => space.name),
    form.materialLocatorText || null,
  ]
    .filter(Boolean)
    .join(" / ");
  const reviewMaterialCustodian = workspace.members.find(
    (member) => member.id === form.materialCustodianMemberId,
  );
  const reviewMaterialStorage =
    form.materialStorageStatus === "known"
      ? reviewMaterialStoragePath
      : form.materialStorageStatus === "needs_detail"
        ? reviewMaterialStoragePath || "Needs more detail"
        : form.materialStorageStatus === "external_custodian"
          ? [
              reviewMaterialCustodian?.name,
              form.materialExternalLabel,
              form.materialLocatorText,
            ]
              .filter(Boolean)
              .join(" / ")
          : materialStorageStatusLabel(form.materialStorageStatus);
  const evidenceAsset = workspace.assets.find((asset) => asset.id === form.assetId);
  const evidenceAssetPlace = places.find(
    (place) => place.id === evidenceAsset?.placeId,
  );
  const evidenceAssetLocationSnapshot = evidenceAsset
    ? evidenceAsset.locationMode !== "physical" ||
      evidenceAsset.locationStatus === "unknown"
      ? materialStorageStatusLabel(
          evidenceAsset.locationMode === "not-applicable"
            ? "not_applicable"
            : "unknown",
        )
      : [
          evidenceAssetPlace?.name,
          ...(evidenceAsset.spaceId
            ? selectSpacePath(workspace, evidenceAsset.spaceId).map(
                (space) => space.name,
              )
            : []),
          evidenceAsset.locationDetail,
        ]
          .filter(Boolean)
          .join(" / ") || "Needs detail"
    : "No asset selected";
  const materialAssetQuery = form.assetQuery.trim().toLowerCase();
  const activeMaterialAssets = workspace.assets
    .filter((asset) => asset.lifecycleStatus !== "archived")
    .sort((left, right) => left.name.localeCompare(right.name));
  const needsMaterialParent =
    type === "evidence" && activeMaterialAssets.length === 0;
  const materialAssetOptions = activeMaterialAssets
    .filter((asset) => {
      if (!materialAssetQuery) return true;
      return [
        asset.name,
        asset.category,
        asset.customCategory,
        asset.reference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(materialAssetQuery);
    })
    .slice(0, materialAssetQuery ? 40 : 12);
  if (
    evidenceAsset &&
    !materialAssetOptions.some((asset) => asset.id === evidenceAsset.id)
  ) {
    materialAssetOptions.unshift(evidenceAsset);
  }
  const selectedCategory = getAssetCategory(form.categoryId);
  const selectedCategoryPath = selectedCategory
    ? getAssetCategoryPath(selectedCategory.id)
    : null;
  const selectedLocationPolicy = getAssetLocationPolicy({
    kind: selectedCategory?.kind || "physical",
    profile: {
      ...form.profile,
      "memory-subject":
        form.memorySubjectType ||
        form.profile?.["memory-subject"] ||
        "story",
    },
  });
  const locationChoiceOptions = [
    ["known", "Known and findable", MapPin],
    ["needs-detail", "Needs detail", Question],
    ["unknown", "Unknown", MagnifyingGlass],
    ...(selectedLocationPolicy.allowsVirtual
      ? [["virtual", "No physical location", GlobeHemisphereWest]]
      : selectedLocationPolicy.usesNotApplicable
        ? [["not-applicable", "Not applicable", GlobeHemisphereWest]]
        : []),
  ];
  const categoryProfile = selectedCategory
    ? getCategoryProfile(selectedCategory.id)
    : null;
  const showsMemoryContext =
    selectedCategory?.kind === "memory" ||
    form.meaningFacets
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .some((item) =>
        ["memory", "heirloom", "family-history"].includes(item),
      );
  const memoryFormCopy =
    MEMORY_SUBJECT_FORM_COPY[form.memorySubjectType] ||
    MEMORY_SUBJECT_FORM_COPY.story;
  const showsPhysicalMemoryFields =
    !showsMemoryContext || form.memorySubjectType === "physical";
  const categoryProfileFields = (categoryProfile?.fields || []).filter(
    (field) =>
      !showsMemoryContext || !MEMORY_CANONICAL_PROFILE_FIELDS.has(field.id),
  );
  const materialSuggestions = [
    ...(selectedCategory?.recommendedEvidenceTypes || []),
    ...EVIDENCE_TYPES,
  ].filter((item, index, list) => list.indexOf(item) === index);
  const assetStageOrder = [...activeAssetStages, "review"];
  const assetStageLabels = assetStageOrder.map(
    (stage) =>
      ({
        category: "Category",
        identity:
          captureIntent === "memory"
            ? "Memory"
            : captureIntent === "private-reference"
              ? "Reference"
              : "Identity",
        location: "Location",
        materials:
          captureIntent === "memory" ? "Story & media" : "Materials",
        review: "Review",
      })[stage],
  );
  const currentAssetStage =
    step === "review"
      ? "review"
      : step === "success"
        ? "success"
        : assetStage;
  const assetStepIndex = assetStageOrder.indexOf(currentAssetStage);
  const assetHeading =
    step === "review"
      ? captureIntent === "memory"
        ? "Review memory"
        : "Review asset"
      : step === "success"
        ? captureIntent === "memory"
          ? "Memory preserved"
          : "Record added"
        : assetStage === "category"
          ? "Choose a category"
          : assetStage === "identity"
            ? captureIntent === "memory"
              ? "Preserve what you remember"
              : captureIntent === "private-reference"
                ? "Add a safe private reference"
                : captureIntent === "collection-piece"
                  ? "Add a piece to the collection"
                  : captureIntent === "quick-item"
                    ? "Remember the item first"
                    : "Identify the item"
            : assetStage === "location"
              ? "Where is it?"
              : "Papers & artifacts";
  const cityOptions = [
    ...workspace.regions.map((region) => ({
      ...region,
      countryCode:
        CITY_OPTIONS.find((item) => item.id === region.id)?.countryCode || null,
    })),
    ...CITY_OPTIONS.filter(
      (city) => !workspace.regions.some((region) => region.id === city.id),
    ),
  ];
  const savedAsset =
    savedRecord?.type === "asset"
      ? workspace.assets.find((asset) => asset.id === savedRecord.id)
      : null;

  if (initialContextError) {
    return (
      <motion.div
        className="overlay-backdrop drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) =>
          event.target === event.currentTarget && requestClose()
        }
      >
        <motion.div
          ref={drawerRef}
          tabIndex="-1"
          className="capture-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="capture-title"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
        >
          <div className="drawer-header">
            <div>
              <span className="eyebrow">Capture recovery</span>
              <h2 id="capture-title" tabIndex="-1">
                Capture link unavailable
              </h2>
            </div>
            <IconButton label="Close capture" onClick={requestClose}>
              <X />
            </IconButton>
          </div>
          <div className="capture-body">
            <EmptyState
              icon={Warning}
              title="Choose a current record"
              copy={`${initialContextError} Close this link and start again from the current Place, Asset, or Vault.`}
              action={
                <button className="primary-button" onClick={requestClose}>
                  Close safely
                </button>
              }
            />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div className="overlay-backdrop drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <motion.div ref={drawerRef} tabIndex="-1" className="capture-drawer" role="dialog" aria-modal="true" aria-labelledby="capture-title" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
        <div className="drawer-header">
          <div>
            <span className="eyebrow">
              {type === "asset" && step !== "success"
                ? focusedAssetStage
                  ? `Editing ${focusedAssetStage}`
                  : `Step ${Math.max(1, assetStepIndex + 1)} of ${assetStageOrder.length}`
                : step === "review"
                  ? "Review before saving"
                  : step === "success"
                    ? "Saved record"
                    : "Contextual capture"}
            </span>
            <h2 id="capture-title" tabIndex="-1">
              {type === "asset"
                ? assetHeading
                : step === "review"
                  ? `Review ${type === "evidence" ? "material" : type}`
                  : step === "success"
                    ? "Record added"
                    : titleMap[type || "choose"]}
            </h2>
          </div>
          <IconButton label="Close capture" onClick={requestClose}><X /></IconButton>
        </div>

        {type === "asset" && step !== "success" ? (
          focusedAssetStage ? (
            <div className="capture-focus-strip">
              <CheckCircle weight="duotone" />
              <span>
                <strong>Focused edit</strong>
                <small>
                  Review and save this change without walking through unrelated
                  steps.
                </small>
              </span>
            </div>
          ) : (
            <ol className="capture-stepper" aria-label="Asset capture progress">
              {assetStageLabels.map((label, index) => (
                <li
                  key={label}
                  className={cx(
                    index < assetStepIndex && "is-complete",
                    index === assetStepIndex && "is-current",
                  )}
                  aria-current={index === assetStepIndex ? "step" : undefined}
                >
                  <span>
                    {index < assetStepIndex ? (
                      <Check weight="bold" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <small>{label}</small>
                </li>
              ))}
            </ol>
          )
        ) : (
          <div className="capture-progress" aria-label="Capture progress">
            {["details", "review", "success"].map((item, index) => (
              <span key={item} className={cx((step === "choose" ? -1 : ["details", "review", "success"].indexOf(step)) >= index && "is-active")} />
            ))}
          </div>
        )}

        <div className="capture-body">
          {draftRestored && step !== "success" && (
            <div className="draft-restored-banner" role="status">
              <Clock weight="duotone" />
              <span>
                <strong>Your unfinished capture was restored</strong>
                <small>
                  Details and any available local file are back. Nothing was
                  added twice.
                </small>
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => setDraftRestored(false)}
              >
                Dismiss
              </button>
            </div>
          )}
          {step === "choose" && (
            <div className="capture-launchpad">
              <div className="capture-intro capture-launchpad-intro">
                <span className="eyebrow">Start with what it is</span>
                <h3>Add anything you want to remember</h3>
                <p>Choose a common type now, or open the complete ownership taxonomy.</p>
              </div>

              <div className="quick-capture-grid" aria-label="Popular asset types">
                {QUICK_CAPTURE_OPTIONS.map((option) => (
                  <QuickCaptureChoice
                    key={option.id}
                    option={option}
                    onClick={() => startQuickAsset(option)}
                  />
                ))}
              </div>

              <button
                className="category-browser-entry"
                aria-label={`Browse all ${ASSET_CATEGORY_COUNT} asset categories`}
                onClick={() => browseAssetCategories()}
              >
                <span><MagnifyingGlass weight="bold" /></span>
                <span>
                  <strong>Browse all {ASSET_CATEGORY_COUNT} categories</strong>
                  <small>Search vehicles, property, collections, digital assets, records, and more</small>
                </span>
                <ArrowRight weight="bold" />
              </button>

              <div className="capture-support-heading">
                <span>Organize & support</span>
                <small>Locations and materials around your assets</small>
              </div>
              <div className="capture-support-grid">
                <CaptureSupportChoice
                  icon={MapPin}
                  title="Place"
                  copy="A location where items live"
                  onClick={() => {
                    setContinuation(null);
                    setType("place");
                    setStep("details");
                  }}
                />
                <CaptureSupportChoice
                  icon={Archive}
                  title="Room or zone"
                  copy={places.length ? "Inside a saved Place" : "We will create its Place first"}
                  onClick={startRoomCapture}
                />
                <CaptureSupportChoice
                  icon={Paperclip}
                  title="Paper or artifact"
                  copy="Document, photo, story, link, or object"
                  onClick={startMaterialCapture}
                />
                <CaptureSupportChoice
                  icon={Heart}
                  title="Collection"
                  copy="Group pieces, proof, and stories"
                  onClick={startCollectionCapture}
                />
              </div>
              <div className="capture-support-heading capture-studio-heading">
                <span>Capture studio</span>
                <small>Use the camera, OCR, room batches, and private labels</small>
              </div>
              <div className="capture-support-grid capture-studio-entry-grid">
                <CaptureSupportChoice
                  icon={Scan}
                  title="Scan document"
                  copy="Pages, local OCR, and review"
                  onClick={() =>
                    onOpenStudio?.("document", {
                      assetId: context.assetId,
                    })
                  }
                />
                <CaptureSupportChoice
                  icon={Images}
                  title="Capture room"
                  copy="Ordered photos with recovery"
                  onClick={() =>
                    onOpenStudio?.("room", {
                      placeId: context.placeId,
                      spaceId: context.spaceId,
                    })
                  }
                />
                <CaptureSupportChoice
                  icon={QrCode}
                  title="Asset labels"
                  copy="Private QR or NFC findability"
                  onClick={() => onOpenStudio?.("labels")}
                />
              </div>
              <div className="prototype-disclosure">
                <ShieldCheck />
                Supporting materials belong to an asset. If you do not have one yet, Continuity will help you create it first.
              </div>
            </div>
          )}

          {step === "details" && (
            <form id="capture-form" className="stacked-form" onSubmit={continueToReview}>
              {type === "place" && (
                <>
                  {continuation === "space-after-place" && (
                    <div className="capture-context-note">
                      <Archive weight="duotone" />
                      <span>
                        <strong>A room needs a Place</strong>
                        <small>Save the home, office, storage site, or archive first. Your room draft will continue automatically.</small>
                      </span>
                    </div>
                  )}
                  <FormField label="Place name" hint="Something you will recognize later">
                    <input autoFocus value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. West Bay Home" />
                  </FormField>
                  <FormField label="Place type">
                    <select value={form.kind} onChange={(e) => update("kind", e.target.value)}>
                      {PLACE_KINDS.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </FormField>
                  <FormField
                    label="Relationship to this place"
                    hint="Be literal. Ownership creates different records from renting, managing, or storing items."
                  >
                    <select
                      value={form.tenure}
                      onChange={(event) =>
                        update("tenure", event.target.value)
                      }
                    >
                      {PROPERTY_TENURES.map((tenure) => (
                        <option key={tenure} value={tenure}>
                          {propertyTenureLabel(tenure)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {!editingPlace &&
                    isOwnedPropertyTenure(form.tenure) && (
                      <>
                        <div className="capture-intro">
                          <span className="eyebrow">
                            One property, two useful views
                          </span>
                          <h3>Create a linked property passport?</h3>
                          <p>
                            The Place organizes rooms and item locations. The
                            linked Asset Passport holds deeds, insurance,
                            value, and property history without creating a
                            second standalone property.
                          </p>
                        </div>
                        <div className="material-choice">
                          <button
                            type="button"
                            className={cx(
                              form.createPropertyPassport && "is-active",
                            )}
                            aria-pressed={form.createPropertyPassport}
                            onClick={() =>
                              update("createPropertyPassport", true)
                            }
                          >
                            <IdentificationCard weight="duotone" />
                            <span>
                              <strong>Create linked passport</strong>
                              <small>
                                One ownership record, linked both ways
                              </small>
                            </span>
                            {form.createPropertyPassport && (
                              <CheckCircle weight="duotone" />
                            )}
                          </button>
                          <button
                            type="button"
                            className={cx(
                              !form.createPropertyPassport && "is-active",
                            )}
                            aria-pressed={!form.createPropertyPassport}
                            onClick={() =>
                              update("createPropertyPassport", false)
                            }
                          >
                            <ArrowRight weight="duotone" />
                            <span>
                              <strong>Place only for now</strong>
                              <small>
                                Keep rooms and item locations without ownership
                                claims
                              </small>
                            </span>
                            {!form.createPropertyPassport && (
                              <CheckCircle weight="duotone" />
                            )}
                          </button>
                        </div>
                        {form.createPropertyPassport && (
                          <FormField
                            label="Property passport name"
                            hint={`Optional — defaults to “${form.name.trim() || "This place"} property passport”.`}
                          >
                            <input
                              value={form.propertyPassportName}
                              onChange={(event) =>
                                update(
                                  "propertyPassportName",
                                  event.target.value,
                                )
                              }
                              placeholder={`${form.name.trim() || "This place"} property passport`}
                            />
                          </FormField>
                        )}
                      </>
                    )}
                  {editingPlace &&
                    editingPropertyAsset &&
                    !isOwnedPropertyTenure(form.tenure) && (
                      <div className="capture-context-note">
                        <Warning weight="duotone" />
                        <span>
                          <strong>
                            Saving will unlink the ownership passport
                          </strong>
                          <small>
                            {editingPropertyAsset.name} remains as a standalone
                            asset record; this Place becomes location-only.
                          </small>
                        </span>
                      </div>
                    )}
                  <FormField label="City cluster" hint="A city groups places on the globe; it is not the property itself.">
                    <select value={form.regionId} onChange={(e) => update("regionId", e.target.value)}>
                      {cityOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                    </select>
                  </FormField>
                  <FormField
                    label="Property location"
                    hint="Choose how you know it. The source and measured accuracy stay visible below."
                  >
                    <LocationPicker
                      value={{
                        locationMethod: form.locationMethod,
                        formattedAddress: form.formattedAddress,
                        latitude: form.latitude,
                        longitude: form.longitude,
                        horizontalAccuracyMeters:
                          form.horizontalAccuracyMeters,
                        locationSource: form.locationSource,
                        locationPrecision: form.locationPrecision,
                        locationCapturedAt: form.locationCapturedAt,
                      }}
                      onChange={updatePlaceLocation}
                    />
                  </FormField>
                </>
              )}
              {type === "space" && (
                <>
                  <FormField
                    label="Place"
                    hint={
                      editingSpace
                        ? "This container stays in its current Place. Reparent it below to correct the indoor path."
                        : undefined
                    }
                  >
                    <select
                      value={form.placeId}
                      onChange={(e) => update("placeId", e.target.value)}
                      disabled={Boolean(editingSpace)}
                    >
                      <option value="">Choose place</option>
                      {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
                    </select>
                  </FormField>
                  <FormField
                    label="Inside"
                    hint="Optional. Choose a parent to build a retrieval path."
                  >
                    <select
                      value={form.parentSpaceId}
                      onChange={(e) => update("parentSpaceId", e.target.value)}
                      disabled={!form.placeId}
                    >
                      <option value="">Place level</option>
                      {availableParentSpaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {selectSpacePath(workspace, space.id)
                            .map((item) => item.name)
                            .join(" → ")}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Room or zone name">
                    <input autoFocus value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Study safe" />
                  </FormField>
                  <FormField label="Type">
                    <select value={form.kind} onChange={(e) => update("kind", e.target.value)}>
                      {["Room", "Zone", "Floor", "Unit", "Cabinet", "Safe", "Shelf", "Drawer", "Box", "Bin"].map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </FormField>
                </>
              )}
              {type === "collection" && (
                <>
                  <div className="capture-intro">
                    <span className="eyebrow">A private exhibition</span>
                    <h3>What brings these pieces together?</h3>
                    <p>A collection can express taste, preserve proof, carry a person’s story, or simply help related things feel like yours.</p>
                  </div>
                  <FormField label="Collection name" hint="Use words you would be proud to see on its cover">
                    <input
                      autoFocus
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                      placeholder="e.g. Watches I chose carefully"
                    />
                  </FormField>
                  <div className="form-grid">
                    <FormField label="Collection type">
                      <select
                        value={form.kind === "Home" ? "collection" : form.kind}
                        onChange={(event) => update("kind", event.target.value)}
                      >
                        <option value="collection">Open-ended collection</option>
                        <option value="portfolio">Defined set or portfolio</option>
                        <option value="memory">Memory archive</option>
                        <option value="archive">Family or research archive</option>
                      </select>
                    </FormField>
                    <FormField label="Visibility">
                      <select
                        value={form.collectionVisibility}
                        onChange={(event) =>
                          update("collectionVisibility", event.target.value)
                        }
                      >
                        <option value="private">Only me</option>
                        <option value="household" disabled>
                          Household · connect scoped sharing first
                        </option>
                        <option value="selected" disabled>
                          Selected people · connect scoped sharing first
                        </option>
                      </select>
                    </FormField>
                  </div>
                  <FormField label="What is this collection about?">
                    <textarea
                      rows="3"
                      value={form.collectionDescription}
                      onChange={(event) =>
                        update("collectionDescription", event.target.value)
                      }
                      placeholder="The pieces, era, maker, person, or idea that connects them"
                    />
                  </FormField>
                  <FormField
                    label="The beginning"
                    hint="Optional. Why did the first piece matter?"
                  >
                    <textarea
                      rows="4"
                      value={form.collectionStory}
                      onChange={(event) =>
                        update("collectionStory", event.target.value)
                      }
                      placeholder="Every collection has a beginning…"
                    />
                  </FormField>
                  <FormField
                    label="Start with existing pieces"
                    hint="Optional. One item can belong to more than one collection."
                  >
                    <div className="collection-asset-picker">
                      {workspace.assets
                        .filter(
                          (asset) =>
                            asset.lifecycleStatus !== "archived" &&
                            (form.kind === "portfolio" ||
                              (asset.kind !== "financial" &&
                                !String(asset.categoryId || "").startsWith(
                                  "financial.",
                                ))),
                        )
                        .slice(0, 24)
                        .map((asset) => {
                          const selected =
                            form.collectionAssetIds.includes(asset.id);
                          return (
                            <button
                              type="button"
                              key={asset.id}
                              className={selected ? "is-active" : ""}
                              aria-pressed={selected}
                              onClick={() => toggleCollectionAsset(asset.id)}
                            >
                              <AssetGlyph asset={asset} />
                              <span>
                                <strong>{asset.name}</strong>
                                <small>{categoryLabel(asset)}</small>
                              </span>
                              {selected ? (
                                <CheckCircle weight="duotone" />
                              ) : (
                                <Plus />
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </FormField>
                  <div className="prototype-disclosure">
                    <LockKey /> Exact locations, values, documents, and private financial references are excluded from collection showcase surfaces.
                  </div>
                </>
              )}
              {type === "asset" && (
                <>
                  {assetStage === "category" && (
                    <>
                      <div className="capture-intro">
                        <span className="eyebrow">A real ownership taxonomy</span>
                        <h3>What kind of item is this?</h3>
                        <p>Search “car,” “motorbike,” “watch,” “land,” or browse a group. You can change this later without losing details.</p>
                      </div>
                      <CategoryPicker
                        value={form.categoryId}
                        initialGroupId={categoryBrowseGroupId}
                        onSelect={chooseCategory}
                      />
                      {form.categoryId === "custom.other" && (
                        <FormField
                          label="Custom category name"
                          hint="Optional. Leave blank to keep this as Other."
                        >
                          <input
                            autoFocus
                            value={form.customCategory}
                            onChange={(event) => update("customCategory", event.target.value)}
                            placeholder="e.g. Family ceremonial items"
                          />
                        </FormField>
                      )}
                      {selectedCategory?.kind === "real-estate" && (
                        <div className="capture-context-note">
                          <Buildings weight="duotone" />
                          <span>
                            <strong>Real estate starts as a Place</strong>
                            <small>
                              Continue to record the location and your
                              relationship first. If it is owned or co-owned,
                              you can create exactly one linked property
                              passport there.
                            </small>
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {assetStage === "identity" && (
                    <>
                      {(captureIntent === "memory" ||
                        selectedCategory?.kind === "memory") && (
                        <section className="memory-subject-section">
                          <div className="capture-intro is-compact">
                            <span className="eyebrow">Start with what is true</span>
                            <h3>What are you preserving?</h3>
                            <p>
                              Only a physical belonging needs a current place.
                              A person, moment, or story remains complete without
                              a made-up location.
                            </p>
                          </div>
                          <div
                            className="memory-subject-choice"
                            role="radiogroup"
                            aria-label="Memory subject type"
                          >
                            {MEMORY_SUBJECT_OPTIONS.map((option) => {
                              const Icon = option.icon;
                              const selected =
                                form.memorySubjectType === option.value;
                              return (
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={selected}
                                  className={selected ? "is-active" : ""}
                                  key={option.value}
                                  onClick={() =>
                                    chooseMemorySubject(option.value)
                                  }
                                >
                                  <span>
                                    <Icon weight="duotone" />
                                  </span>
                                  <strong>{option.label}</strong>
                                  <small>{option.copy}</small>
                                  {selected && (
                                    <CheckCircle weight="duotone" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      )}
                      <CategorySummary
                        category={selectedCategory}
                        customLabel={form.customCategory}
                        onChange={() => setAssetStage("category")}
                      />
                      <FormField
                        label={
                          showsMemoryContext
                            ? memoryFormCopy.nameLabel
                            : "Asset name"
                        }
                        hint={
                          showsMemoryContext
                            ? memoryFormCopy.nameHint
                            : "The name you would search for later"
                        }
                      >
                        <input
                          autoFocus
                          data-memory-title={
                            showsMemoryContext ? "true" : undefined
                          }
                          value={form.name}
                          onChange={(e) => update("name", e.target.value)}
                          placeholder={
                            showsMemoryContext
                              ? memoryFormCopy.namePlaceholder
                              : "e.g. GMT-Master II"
                          }
                        />
                      </FormField>
                      {categoryProfileFields.length > 0 && (
                        <div className="profile-field-section">
                          <div className="subsection-heading">
                            <span>
                              <small>{categoryProfile.label}</small>
                              <strong>Useful identity details</strong>
                            </span>
                            <StatusPill>Optional now</StatusPill>
                          </div>
                          <div className="form-grid">
                            {categoryProfileFields.map((field) => (
                              <ProfileFieldInput
                                key={field.id}
                                field={field}
                                value={form.profile[field.id] || ""}
                                onChange={(value) => updateProfile(field.id, value)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {showsPhysicalMemoryFields && (
                        <div className="form-grid">
                          <FormField label="Quick reference" hint="Serial, deed, plate, or account alias">
                            <input value={form.reference} onChange={(e) => update("reference", e.target.value)} placeholder="Optional" />
                          </FormField>
                          <FormField label="Value (QAR)" hint="Optional and user supplied">
                            <input inputMode="decimal" value={form.value} onChange={(e) => update("value", e.target.value)} placeholder="46,000" />
                          </FormField>
                        </div>
                      )}
                      <FormField
                        label={
                          showsMemoryContext
                            ? memoryFormCopy.notesLabel
                            : "Notes or story"
                        }
                      >
                        <textarea
                          rows="3"
                          value={form.notes}
                          onChange={(e) => update("notes", e.target.value)}
                          placeholder={
                            showsMemoryContext
                              ? memoryFormCopy.notesPlaceholder
                              : "Provenance, condition, memory, or instructions"
                          }
                        />
                      </FormField>
                      {selectedCategory?.kind === "financial" && (
                        <div className="sensitive-reference-notice is-compact">
                          <LockKey weight="duotone" />
                          <span>
                            <strong>Keep a safe reference—not the secret.</strong>
                            <small>Never enter a password, PIN, full account number, private key, seed phrase, or recovery code.</small>
                          </span>
                        </div>
                      )}
                      <div className="profile-field-section meaning-section">
                        <div className="subsection-heading">
                          <span>
                            <small>More than a category</small>
                            <strong>Meaning & future</strong>
                          </span>
                          <StatusPill>Optional</StatusPill>
                        </div>
                        <FormField
                          label="What does it mean to you?"
                          hint={
                            showsMemoryContext
                              ? "Use a few private tags that will help you find it later."
                              : "Collectible, investment, heirloom, memory, personal style—use commas."
                          }
                        >
                          <input
                            value={form.meaningFacets}
                            onChange={(event) =>
                              update("meaningFacets", event.target.value)
                            }
                            placeholder={
                              showsMemoryContext
                                ? "e.g. childhood, family history, tradition"
                                : "e.g. collectible, heirloom, memory"
                            }
                          />
                        </FormField>
                        <FormField label="Why it matters">
                          <textarea
                            rows="3"
                            value={form.sentimentalValue}
                            onChange={(event) =>
                              update("sentimentalValue", event.target.value)
                            }
                            placeholder="A person, moment, achievement, or reason you would want the story to survive"
                          />
                        </FormField>
                        {showsMemoryContext && (
                          <div className="memory-context-capture">
                            <div className="subsection-heading">
                              <span>
                                <small>Memory context</small>
                                <strong>{memoryFormCopy.peopleHeading}</strong>
                              </span>
                              <Heart weight="duotone" />
                            </div>
                            <MemoryPeopleEditor
                              entries={form.memoryPeopleEntries || []}
                              knownPeople={workspace.collector?.people || []}
                              onChange={(entries) =>
                                update("memoryPeopleEntries", entries)
                              }
                              requiresPrimaryPerson={
                                form.memorySubjectType === "person"
                              }
                            />
                            <div className="form-grid">
                              <FormField label="Time or period">
                                <input
                                  value={form.memoryPeriod}
                                  onChange={(event) =>
                                    update("memoryPeriod", event.target.value)
                                  }
                                  placeholder="e.g. Childhood · 1999"
                                />
                              </FormField>
                              <FormField label="Origin">
                                <input
                                  value={form.memoryOrigin}
                                  onChange={(event) =>
                                    update("memoryOrigin", event.target.value)
                                  }
                                  placeholder="Who, where, or how it came to you"
                                />
                              </FormField>
                            </div>
                          </div>
                        )}
                        <div className="form-grid">
                          {showsPhysicalMemoryFields && (
                            <FormField label="Future intention">
                              <select
                                value={form.legacyIntent}
                                onChange={(event) =>
                                  update("legacyIntent", event.target.value)
                                }
                              >
                                <option value="undecided">Decide later</option>
                                <option value="keep">Keep</option>
                                <option value="gift">Gift</option>
                                <option value="inherit">Pass to someone</option>
                                <option value="sell">Sell</option>
                                <option value="donate">Donate</option>
                                <option value="archive-story">Preserve the story</option>
                              </select>
                            </FormField>
                          )}
                          <FormField label="Visibility">
                            {selectedCategory?.kind === "financial" ? (
                              <div className="locked-visibility">
                                <LockKey weight="bold" />
                                <span>
                                  <strong>Only me</strong>
                                  <small>Financial references cannot enter showcases.</small>
                                </span>
                              </div>
                            ) : (
                              <select
                                value={form.visibility}
                                onChange={(event) =>
                                  update("visibility", event.target.value)
                                }
                              >
                                <option value="private">Only me</option>
                                <option value="household">Household</option>
                                <option value="selected">Selected people</option>
                                <option value="showcase">Safe showcase</option>
                              </select>
                            )}
                          </FormField>
                        </div>
                        {showsPhysicalMemoryFields && (
                          <FormField label="Acquired on" hint="Optional">
                            <input
                              type="date"
                              value={form.acquiredAt}
                              onChange={(event) =>
                                update("acquiredAt", event.target.value)
                              }
                            />
                          </FormField>
                        )}
                      </div>
                    </>
                  )}

                  {assetStage === "location" && (
                    <>
                      <CategorySummary category={selectedCategory} customLabel={form.customCategory} />
                      <div className="capture-intro is-compact">
                        <h3>Record what you actually know</h3>
                        <p>
                          Continuity never guesses. A physical item is only
                          marked findable when it has a Place plus a room,
                          container, or useful locator clue.
                        </p>
                      </div>
                      <FormField label="Location state">
                        <div className="location-choice-grid">
                          {locationChoiceOptions.map(([value, label, Icon]) => {
                            const active =
                              value === "known" || value === "needs-detail"
                                ? form.locationMode === "physical" && form.locationStatus === value
                                : form.locationMode === value;
                            return (
                              <button type="button" key={value} className={active ? "is-active" : ""} aria-pressed={active} onClick={() => chooseLocation(value)}>
                                <Icon weight="duotone" />
                                <span>{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </FormField>
                      {form.locationMode === "physical" && (
                        <div className="form-grid">
                          <FormField label="Place">
                            <select
                              value={form.placeId}
                              onChange={(event) => {
                                const placeId = event.target.value;
                                setForm((current) => ({
                                  ...current,
                                  placeId,
                                  spaceId: "",
                                }));
                                setDirty(true);
                                setError("");
                              }}
                            >
                              <option value="">Choose place</option>
                              {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
                            </select>
                          </FormField>
                          {!selectedLocationPolicy.isRealEstate && (
                            <FormField
                              label="Room / container"
                              hint="Choose this or add a locator clue below"
                            >
                              <select value={form.spaceId} onChange={(e) => update("spaceId", e.target.value)} disabled={!form.placeId}>
                                <option value="">Choose room or container</option>
                                {spaces.map((space) => (
                                  <option key={space.id} value={space.id}>
                                    {selectSpacePath(workspace, space.id)
                                      .map((item) => item.name)
                                      .join(" → ")}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                          )}
                        </div>
                      )}
                      {form.locationMode === "physical" && reviewPlace && (
                        <div className="location-accuracy-card">
                          <span className="location-accuracy-icon">
                            <MapPin weight="duotone" />
                          </span>
                          <span>
                            <small>Geographic accuracy</small>
                            <strong>{reviewPlaceAccuracy}</strong>
                            <em>
                              {reviewPlace.address ||
                                locationSourceLabel(reviewPlace.locationSource)}
                            </em>
                          </span>
                          <button
                            type="button"
                            className="text-button"
                            disabled={dirty}
                            title={
                              dirty
                                ? "Save this item first so your current changes are not lost."
                                : "Open this Place and adjust its shared map pin."
                            }
                            onClick={() =>
                              navigate(
                                `/places/${reviewPlace.id}?capture=place&placeId=${reviewPlace.id}`,
                              )
                            }
                          >
                            {reviewPlaceHasPin
                              ? "Adjust Place pin"
                              : "Set Place pin"}
                          </button>
                          {dirty ? (
                            <small className="location-accuracy-save-note">
                              Save this item first, then refine the shared Place pin.
                            </small>
                          ) : null}
                        </div>
                      )}
                      <FormField
                        label={form.locationMode === "virtual" ? "Platform or continuity clue" : "Location detail"}
                        hint={
                          form.locationMode === "virtual"
                            ? "Provider, account alias, or recovery-location reference—never a secret"
                            : selectedLocationPolicy.isRealEstate
                              ? "Optional parcel, entrance, or access context"
                              : form.locationStatus === "known" && !form.spaceId
                                ? "Required without a room/container: shelf, box, safe, custodian, or another useful clue"
                                : "Shelf, box, safe, custodian, or another useful clue"
                        }
                      >
                        <input
                          value={form.locationDetail}
                          onChange={(e) => update("locationDetail", e.target.value)}
                          placeholder={
                            selectedLocationPolicy.isRealEstate ||
                            form.locationMode === "virtual" ||
                            form.spaceId
                              ? "Optional"
                              : "e.g. Top shelf in blue archival box"
                          }
                        />
                      </FormField>
                    </>
                  )}

                  {assetStage === "materials" && (
                    <>
                      <div className="capture-intro">
                        <span className="eyebrow">Universal to every category</span>
                        <h3>Add a paper or artifact now?</h3>
                        <p>Receipts are only one option. Add a photo, record, story, safe link, or physical supporting item—or skip and return later.</p>
                      </div>
                      <div className="material-choice">
                        <button
                          type="button"
                          className={cx(form.addMaterial && "is-active")}
                          aria-pressed={form.addMaterial}
                          onClick={() => update("addMaterial", true)}
                        >
                          <Paperclip weight="duotone" />
                          <span><strong>Add one now</strong><small>It will start pending your review</small></span>
                          {form.addMaterial && <CheckCircle weight="duotone" />}
                        </button>
                        <button
                          type="button"
                          className={cx(!form.addMaterial && "is-active")}
                          aria-pressed={!form.addMaterial}
                          onClick={() => update("addMaterial", false)}
                        >
                          <ArrowRight weight="duotone" />
                          <span><strong>Skip for now</strong><small>The passport keeps a visible gap</small></span>
                          {!form.addMaterial && <CheckCircle weight="duotone" />}
                        </button>
                      </div>
                      {form.addMaterial && (
                        <MaterialFields
                          form={form}
                          update={update}
                          workspace={workspace}
                          suggestions={materialSuggestions}
                          selectedFile={selectedFile}
                          onFileChange={chooseFile}
                          fileBusy={fileBusy}
                        />
                      )}
                    </>
                  )}
                </>
              )}
              {type === "evidence" && (
                <>
                  {needsMaterialParent ? (
                    <div className="material-parent-empty">
                      <span><Paperclip weight="duotone" /></span>
                      <div className="capture-intro">
                        <span className="eyebrow">One useful connection first</span>
                        <h3>What does this material support?</h3>
                        <p>
                          A paper, photo, story, link, or physical artifact stays useful
                          when it belongs to an asset. Create that asset first, and this
                          flow will bring you straight back here.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={startMaterialParentAsset}
                      >
                        Create the asset first <ArrowRight weight="bold" />
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={goBack}
                      >
                        Choose something else
                      </button>
                    </div>
                  ) : (
                    <>
                      {!contextAsset && (
                        <>
                          <FormField
                            label="Find the asset"
                            hint={`Search name, category, or reference across ${activeMaterialAssets.length} active assets`}
                          >
                            <input
                              value={form.assetQuery}
                              onChange={(event) => update("assetQuery", event.target.value)}
                              placeholder="e.g. GMT, apartment, deed…"
                            />
                          </FormField>
                          <FormField
                            label="Attach to asset"
                            hint={
                              materialAssetQuery
                                ? `${materialAssetOptions.length} best matches`
                                : "Showing the first 12 alphabetically—search to narrow the list"
                            }
                          >
                            <select
                              data-asset-picker
                              value={form.assetId}
                              onChange={(event) => update("assetId", event.target.value)}
                            >
                              <option value="">
                                {materialAssetOptions.length
                                  ? "Choose an asset"
                                  : "No matching assets"}
                              </option>
                              {materialAssetOptions.map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                  {asset.name}
                                </option>
                              ))}
                            </select>
                          </FormField>
                        </>
                      )}
                      {evidenceAsset && (
                        <div className="capture-context-card">
                          <AssetGlyph asset={evidenceAsset} />
                          <span><small>Adding material to</small><strong>{evidenceAsset.name}</strong></span>
                        </div>
                      )}
                      <MaterialFields
                        form={form}
                        update={update}
                        workspace={workspace}
                        selectedFile={selectedFile}
                        onFileChange={chooseFile}
                        fileBusy={fileBusy}
                        suggestions={[
                          ...(resolveCategory(evidenceAsset)?.recommendedEvidenceTypes || []),
                          ...EVIDENCE_TYPES,
                        ].filter((item, index, list) => list.indexOf(item) === index)}
                      />
                      <div className="prototype-disclosure"><Info /> The record and any selected file are stored on this device as pending. “Reviewed by you” confirms your check, not legal authenticity.</div>
                    </>
                  )}
                </>
              )}
              {error && <div id="capture-error" className="form-error" role="alert"><Warning weight="bold" /> {error}</div>}
            </form>
          )}

          {step === "review" && (
            <div className="review-card">
              <span className="review-icon">
                {type === "place" ? (
                  <MapPin weight="duotone" />
                ) : type === "space" ? (
                  <Archive weight="duotone" />
                ) : type === "evidence" ? (
                  <Paperclip weight="duotone" />
                ) : type === "collection" ? (
                  <Heart weight="duotone" />
                ) : (
                  <Cube weight="duotone" />
                )}
              </span>
              <span className="eyebrow">Confirm the useful facts</span>
              <h3>{type === "evidence" ? form.evidenceType : form.name}</h3>
              <dl>
                {type === "place" && (
                  <>
                    <div><dt>Type</dt><dd>{form.kind}</dd></div>
                    <div>
                      <dt>Relationship</dt>
                      <dd>
                        {propertyTenureLabel(form.tenure, { short: true })}
                      </dd>
                    </div>
                    {!editingPlace &&
                      isOwnedPropertyTenure(form.tenure) && (
                        <div>
                          <dt>Property passport</dt>
                          <dd>
                            {form.createPropertyPassport
                              ? `Create and link “${
                                  form.propertyPassportName.trim() ||
                                  `${form.name.trim()} property passport`
                                }”`
                              : "Place only for now"}
                          </dd>
                        </div>
                      )}
                    <div><dt>City cluster</dt><dd>{cityOptions.find((region) => region.id === form.regionId)?.name}</dd></div>
                    <div>
                      <dt>Property pin</dt>
                      <dd>
                        {form.locationMethod === "later"
                          ? "Not set — city only"
                          : `${Number(form.latitude).toFixed(6)}, ${Number(form.longitude).toFixed(6)}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Method & accuracy</dt>
                      <dd>
                        {form.locationMethod === "later"
                          ? "Add later"
                          : form.locationPrecision === "user_placed"
                            ? `${locationSourceLabel(form.locationSource)} · accuracy not measured`
                            : `${locationSourceLabel(form.locationSource)} · ${
                                form.horizontalAccuracyMeters !== ""
                                  ? `±${Math.round(Number(form.horizontalAccuracyMeters))} m`
                                  : titleCase(form.locationPrecision)
                              }`}
                      </dd>
                    </div>
                    {form.formattedAddress && (
                      <div><dt>Address</dt><dd>{form.formattedAddress}</dd></div>
                    )}
                  </>
                )}
                {type === "space" && (
                  <>
                    <div><dt>Place</dt><dd>{reviewPlace?.name}</dd></div>
                    <div>
                      <dt>Inside</dt>
                      <dd>
                        {form.parentSpaceId
                          ? selectSpacePath(workspace, form.parentSpaceId)
                              .map((space) => space.name)
                              .join(" → ")
                          : "Place level"}
                      </dd>
                    </div>
                    <div><dt>Container</dt><dd>{form.kind}</dd></div>
                  </>
                )}
                {type === "collection" && (
                  <>
                    <div><dt>Type</dt><dd>{titleCase(form.kind === "Home" ? "collection" : form.kind)}</dd></div>
                    <div><dt>Visibility</dt><dd>{titleCase(form.collectionVisibility)}</dd></div>
                    <div><dt>Starting pieces</dt><dd>{form.collectionAssetIds.length}</dd></div>
                    <div><dt>Story</dt><dd>{form.collectionStory || "Add later"}</dd></div>
                  </>
                )}
                {type === "asset" && (
                  <>
                    <div><dt>Category</dt><dd>{form.customCategory || selectedCategoryPath?.label}</dd></div>
                    {showsMemoryContext && (
                      <>
                        <div>
                          <dt>Memory type</dt>
                          <dd>
                            {MEMORY_SUBJECT_OPTIONS.find(
                              (option) =>
                                option.value === form.memorySubjectType,
                            )?.label || "Not selected"}
                          </dd>
                        </div>
                        <div>
                          <dt>People</dt>
                          <dd>
                            {form.memoryPeopleEntries?.length
                              ? memoryPeopleLabel(form.memoryPeopleEntries)
                              : "No one linked"}
                          </dd>
                        </div>
                      </>
                    )}
                    <div>
                      <dt>Location</dt>
                      <dd>
                        {form.locationMode === "virtual"
                          ? "No physical location"
                          : form.locationMode === "not-applicable"
                            ? "Not applicable"
                            : form.locationMode === "unknown" || form.locationStatus === "unknown"
                              ? "Explicitly unknown"
                              : reviewLocationPath || "Needs detail"}
                      </dd>
                    </div>
                    {showsPhysicalMemoryFields && (
                      <div><dt>Reference</dt><dd>{form.reference || "Not set"}</dd></div>
                    )}
                    <div><dt>Paper or artifact</dt><dd>{form.addMaterial ? form.evidenceType : "Add later"}</dd></div>
                    {form.addMaterial && (
                      <div>
                        <dt>Original material storage</dt>
                        <dd>{reviewMaterialStorage}</dd>
                      </div>
                    )}
                  </>
                )}
                {type === "evidence" && (
                  <>
                    <div><dt>Asset</dt><dd>{evidenceAsset?.name}</dd></div>
                    <div><dt>Kind</dt><dd>{getMaterialKind(form.materialKind)?.label}</dd></div>
                    <div><dt>Source</dt><dd>{form.fileName || form.linkUrl || form.materialNote || form.materialLocatorText || "Metadata record"}</dd></div>
                    <div><dt>Asset location when attached</dt><dd>{evidenceAssetLocationSnapshot}</dd></div>
                    <div><dt>Original material storage</dt><dd>{reviewMaterialStorage}</dd></div>
                    <div><dt>Initial status</dt><dd>Pending your review</dd></div>
                  </>
                )}
              </dl>
              <div className="prototype-disclosure"><ShieldCheck /> You can correct details later. Material review status and location history remain explicit.</div>
            </div>
          )}

          {step === "success" && (
            <div className="capture-success">
              {savedAsset && (
                <div className="capture-success-cover">
                  <AssetCoverMedia
                    asset={savedAsset}
                    workspace={workspace}
                    alt={`Newly saved ${savedAsset.name}`}
                    fallback={<AssetGlyph asset={savedAsset} />}
                  />
                </div>
              )}
              <span>
                {storageStatus === "error" ? (
                  <Warning weight="bold" />
                ) : (
                  <Check weight="bold" />
                )}
              </span>
              <StatusPill tone={storageStatus === "error" ? "warning" : "success"}>
                {storageStatus === "error"
                  ? "Added for this session only"
                  : "Added to workspace"}
              </StatusPill>
              <h3>{savedRecord?.name}</h3>
              <p>
                {storageStatus === "error"
                  ? "Browser storage failed. Keep this tab open and export the demo JSON from Vault before leaving."
                  : type === "evidence"
                    ? form.fileName
                      ? "The material and its original file are stored on this device, pending your review."
                      : "The material is pending until you explicitly mark it reviewed."
                    : type === "collection"
                      ? "Your private collection is ready to curate. Exact locations, documents, and values stay outside showcase views."
                    : type === "place" && savedRecord?.propertyAssetId
                      ? "The Place organizes rooms and item locations. Its one linked property passport is ready for deeds, insurance, value, and history."
                    : type === "place"
                      ? "The Place is ready for rooms and item locations. No ownership record was inferred."
                    : captureIntent === "memory"
                        ? form.memorySubjectType === "physical"
                          ? "The belonging is preserved with an honest location state, private people links, and room for its story or photograph."
                          : "The memory is preserved without inventing a physical location. Private people, story, and media can grow with it."
                        : captureIntent === "private-reference"
                          ? "The reference is private, masked in general browsing, and excluded from showcases."
                          : captureIntent === "collection-piece" && contextCollection
                            ? `Added to ${contextCollection.name}. Any saved photograph can now become its cover or a featured piece.`
                            : "The record is now searchable in this local demo workspace."}
              </p>
              {type === "asset" && !form.addMaterial && (
                <button className="primary-button" onClick={addMaterialAfterSave}>
                  <Paperclip weight="bold" /> Add paper or artifact
                </button>
              )}
              <button
                className={
                  type === "asset" && !form.addMaterial
                    ? "secondary-button"
                    : "primary-button"
                }
                onClick={viewSaved}
              >
                {captureIntent === "collection-piece" && contextCollection
                  ? `See in ${contextCollection.name}`
                  : "View record"}{" "}
                <ArrowRight />
              </button>
              <button className="text-button" onClick={onClose}>Done</button>
            </div>
          )}
        </div>

        {(step === "details" || step === "review") && !needsMaterialParent && (
          <footer className="capture-footer">
            <button className="secondary-button" onClick={goBack}>
              <ArrowLeft /> Back
            </button>
            {step === "details" ? (
              <button
                className="primary-button"
                type="submit"
                form="capture-form"
                disabled={
                  type === "asset" &&
                  assetStage === "category" &&
                  !form.categoryId
                }
              >
                {type === "asset" && focusedAssetStage
                  ? `Review ${focusedAssetStage}`
                  : type === "asset" && assetStage !== "materials"
                    ? "Continue"
                    : "Review"}{" "}
                <ArrowRight />
              </button>
            ) : (
              <button className="primary-button" onClick={save}>Save record <Check /></button>
            )}
          </footer>
        )}
      </motion.div>
    </motion.div>
  );
}

function CategoryPicker({ value, initialGroupId, onSelect }) {
  const initialCategory = getAssetCategory(value);
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState(
    initialCategory?.groupId || initialGroupId || null,
  );
  const groups = ASSET_CATEGORY_GROUPS;
  const activeGroup = groups.find((group) => group.id === groupId);
  const results = query.trim()
    ? searchAssetCategories(query, { limit: 18 })
    : activeGroup?.categories.map((item) => getAssetCategory(item.id)) || [];

  function choose(category) {
    onSelect(category.id);
  }

  return (
    <div className="category-picker">
      <label className="category-search">
        <MagnifyingGlass weight="bold" />
        <span className="sr-only">Search asset categories</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search car, motorbike, watch, land…"
        />
        {query && <button type="button" aria-label="Clear category search" onClick={() => setQuery("")}><X /></button>}
      </label>

      {!query && !activeGroup ? (
        <div className="category-group-grid">
          {groups.map((group) => {
            const GroupIcon = CATEGORY_ICON_BY_KEY[group.iconKey] || Cube;
            const examples = group.categories
              .slice(0, 3)
              .map((category) =>
                category.id === "vehicle.motorcycle"
                  ? "Motorbike"
                  : category.label,
              );
            return (
              <button
                type="button"
                key={group.id}
                aria-label={`Browse ${group.label}: ${examples.join(", ")}`}
                onClick={() => setGroupId(group.id)}
              >
                <span><GroupIcon weight="duotone" /></span>
                <strong>{group.label}</strong>
                <small>{examples.join(" · ")}</small>
                <CaretRight />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="category-results">
          {!query && activeGroup && (
            <button type="button" className="category-back" onClick={() => setGroupId(null)}>
              <ArrowLeft /> All groups
            </button>
          )}
          <div className="category-results-heading">
            <span>
              <small>{query ? "Search results" : activeGroup?.label}</small>
              <strong>{results.length} {results.length === 1 ? "category" : "categories"}</strong>
            </span>
          </div>
          <div className="category-leaf-list">
            {results.map((category) => {
              const Icon = CATEGORY_ICON_BY_KEY[category.iconKey] || Cube;
              return (
                <button
                  type="button"
                  key={category.id}
                  className={cx(value === category.id && "is-selected")}
                  aria-label={`${category.label} — ${category.groupLabel}`}
                  aria-pressed={value === category.id}
                  onClick={() => choose(category)}
                >
                  <span><Icon weight="duotone" /></span>
                  <span>
                    <strong>{category.label}</strong>
                    <small>{category.pathLabel}</small>
                  </span>
                  {value === category.id ? <CheckCircle weight="duotone" /> : <CaretRight />}
                </button>
              );
            })}
            {!results.length && (
              <div className="category-empty">
                <MagnifyingGlass weight="duotone" />
                <strong>No exact category found</strong>
                <p>Try a broader word, or use Other & custom.</p>
                <button type="button" onClick={() => { setQuery(""); setGroupId("other-custom"); }}>Open Other & custom</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategorySummary({ category, customLabel, onChange }) {
  if (!category) return null;
  const Icon = CATEGORY_ICON_BY_KEY[category.iconKey] || Cube;
  return (
    <div className="category-summary">
      <span><Icon weight="duotone" /></span>
      <span>
        <small>{category.groupLabel}</small>
        <strong>{customLabel || category.label}</strong>
      </span>
      {onChange && <button type="button" onClick={onChange}>Change</button>}
    </div>
  );
}

function ProfileFieldInput({ field, value, onChange }) {
  const hint = [
    field.required ? "Recommended for a complete passport." : null,
    field.helpText,
    field.privacy === "sensitive"
      ? "Keep secrets and passwords out."
      : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
  if (field.type === "select") {
    return (
      <FormField label={field.label} hint={hint}>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Not set</option>
          {field.options.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
        </select>
      </FormField>
    );
  }
  if (field.type === "multiline") {
    return (
      <FormField label={field.label} hint={hint}>
        <textarea rows="3" value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder || "Optional"} />
      </FormField>
    );
  }
  const inputType = field.type === "date" ? "date" : "text";
  const inputMode = ["number", "year", "percentage"].includes(field.type) ? "numeric" : undefined;
  return (
    <FormField label={field.label} hint={hint}>
      <input
        type={inputType}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder || "Optional"}
      />
    </FormField>
  );
}

function LocalFilePreview({ file, name }) {
  const [objectUrl, setObjectUrl] = useState("");
  const previewPolicy = file
    ? createSafePreviewMetadata({
        mediaType: file.type,
        fileName: file.name,
        sourceBytes: file.size,
      })
    : null;

  useEffect(() => {
    if (!file || previewPolicy?.mode !== "inline-original") {
      setObjectUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, previewPolicy?.mode]);

  if (!file) return null;

  if (objectUrl && previewPolicy?.mode === "inline-original") {
    return (
      <div className="local-file-preview is-image">
        <img src={objectUrl} alt={`Preview of ${name || file.name}`} />
      </div>
    );
  }

  return (
    <div
      className="local-file-preview is-generic"
      data-preview-mode={previewPolicy?.mode || "download-only"}
    >
      <FileText weight="duotone" />
      <span>
        <strong>{file.name}</strong>
        <small>
          {file.type || "Unknown file type"} · {formatFileSize(file.size)}
        </small>
        <small>
          Original selected · inline preview disabled; download remains available after save.
        </small>
      </span>
    </div>
  );
}

function MaterialStorageFields({
  form,
  update,
  workspace,
  showReason = false,
}) {
  const headingId = useId();
  const status = form.materialStorageStatus;
  const activePlaces = workspace.places.filter(
    (place) => place.status !== "archived",
  );
  const storageSpaces = form.materialPlaceId
    ? workspace.spaces
        .filter((space) => space.placeId === form.materialPlaceId)
        .sort((left, right) =>
          selectSpacePath(workspace, left.id)
            .map((item) => item.name)
            .join(" / ")
            .localeCompare(
              selectSpacePath(workspace, right.id)
                .map((item) => item.name)
                .join(" / "),
            ),
        )
    : [];
  const activeMembers = workspace.members.filter(
    (member) => member.inviteStatus === "active",
  );
  const statuses = [
    ["known", "Known"],
    ["needs_detail", "Needs detail"],
    ["unknown", "Unknown"],
    ["external_custodian", "Held elsewhere"],
    ["not_applicable", "Not applicable"],
  ];

  return (
    <section
      className="material-storage-fields"
      aria-labelledby={headingId}
    >
      <div className="capture-intro">
        <span className="eyebrow">Separate retrieval fact</span>
        <h3 id={headingId}>
          Where is the original material stored?
        </h3>
        <p>
          Record the paper, object, or other original itself. This does not
          copy the asset location captured when it was attached.
        </p>
      </div>
      <div
        className="material-storage-status-grid"
        role="group"
        aria-label="Original material storage status"
      >
        {statuses.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={status === value ? "is-active" : ""}
            aria-pressed={status === value}
            onClick={() => update("materialStorageStatus", value)}
          >
            {label}
          </button>
        ))}
      </div>
      {["known", "needs_detail"].includes(status) && (
        <>
          <FormField
            label="Storage place"
            hint={
              status === "known"
                ? "Choose the Place that physically contains the original"
                : "Choose a Place if you know that much"
            }
          >
            <select
              value={form.materialPlaceId}
              onChange={(event) =>
                update("materialPlaceId", event.target.value)
              }
            >
              <option value="">No Place selected</option>
              {activePlaces.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Room or container"
            hint="Follow the nested path as far as you can"
          >
            <select
              value={form.materialSpaceId}
              disabled={!form.materialPlaceId}
              onChange={(event) =>
                update("materialSpaceId", event.target.value)
              }
            >
              <option value="">Place level / not selected</option>
              {storageSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {selectSpacePath(workspace, space.id)
                    .map((item) => item.name)
                    .join(" / ")}
                </option>
              ))}
            </select>
          </FormField>
        </>
      )}
      {status === "external_custodian" && (
        <>
          <FormField
            label="Household custodian"
            hint="Optional if a member of this workspace holds it"
          >
            <select
              value={form.materialCustodianMemberId}
              onChange={(event) =>
                update(
                  "materialCustodianMemberId",
                  event.target.value,
                )
              }
            >
              <option value="">Not a workspace member</option>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Person or organization"
            hint="Use this for a bank, lawyer, storage company, gallery, or another external holder"
          >
            <input
              value={form.materialExternalLabel}
              onChange={(event) =>
                update("materialExternalLabel", event.target.value)
              }
              placeholder="e.g. Family lawyer"
            />
          </FormField>
        </>
      )}
      {status !== "not_applicable" && (
        <FormField
          label={
            status === "unknown"
              ? "Last known clue"
              : "Exact retrieval clue"
          }
          hint={
            status === "unknown"
              ? "Optional; keep the state Unknown even if you have a lead"
              : "Shelf, box, safe slot, file name, or instructions that finish the path"
          }
        >
          <input
            value={form.materialLocatorText}
            onChange={(event) =>
              update("materialLocatorText", event.target.value)
            }
            placeholder={
              status === "unknown"
                ? "e.g. May be with old family papers"
                : "e.g. Blue archive box, folder 3"
            }
          />
        </FormField>
      )}
      {status === "not_applicable" && (
        <div className="prototype-disclosure">
          <Info /> There is no separate physical original to retrieve for this
          material.
        </div>
      )}
      {showReason && (
        <FormField
          label="Why are you correcting this?"
          hint="The explanation is kept with the new append-only history entry"
        >
          <input
            value={form.materialStorageReason}
            onChange={(event) =>
              update("materialStorageReason", event.target.value)
            }
            placeholder="Moved after organizing the archive"
          />
        </FormField>
      )}
    </section>
  );
}

function MaterialFields({
  form,
  update,
  workspace,
  suggestions,
  selectedFile,
  onFileChange,
  fileBusy = false,
}) {
  const suggestionId = useId();
  const selectedKind = getMaterialKind(form.materialKind);
  const requiresFile = ["paper", "media"].includes(form.materialKind);
  const generalAccept =
    form.materialKind === "media"
      ? "image/*,audio/*"
      : form.materialKind === "artifact"
        ? "image/*"
        : "image/*,application/pdf,audio/*,text/plain,.doc,.docx,.xls,.xlsx";
  return (
    <div className="material-fields">
      <FormField label="Material kind" hint="Every kind is available for every asset category">
        <div className="material-kind-grid">
          {MATERIAL_KIND_OPTIONS.map((kind) => {
            const Icon = MATERIAL_ICON_BY_KIND[kind.id] || FileText;
            return (
              <button
                type="button"
                key={kind.id}
                className={form.materialKind === kind.id ? "is-active" : ""}
                aria-pressed={form.materialKind === kind.id}
                onClick={() => update("materialKind", kind.id)}
              >
                <Icon weight="duotone" />
                <span>{kind.label}</span>
              </button>
            );
          })}
        </div>
      </FormField>
      <FormField label="What is it?" hint="Use a useful name such as Registration, Title deed, or Childhood story">
        <input
          list={suggestionId}
          value={form.evidenceType}
          onChange={(event) => update("evidenceType", event.target.value)}
          placeholder={selectedKind?.label || "Material title"}
        />
      </FormField>
      <datalist id={suggestionId}>
        {suggestions.map((item) => <option key={item} value={item} />)}
      </datalist>
      <FormField label="How does it support the asset?">
        <select value={form.materialRelation} onChange={(event) => update("materialRelation", event.target.value)}>
          {MATERIAL_RELATION_OPTIONS.map((relation) => (
            <option key={relation.id} value={relation.id}>{relation.label}</option>
          ))}
        </select>
      </FormField>
      {(requiresFile || form.materialKind === "artifact") && (
        <FormField
          label={requiresFile ? "Choose file or photo" : "Artifact photo"}
          hint="Stored privately in this browser with type, size, and a SHA-256 integrity checksum."
        >
          <div className={cx("file-capture-panel", form.fileName && "has-file")}>
            <LocalFilePreview file={selectedFile} name={form.evidenceType} />
            <div className="file-capture-summary">
              {form.fileName ? (
                <CheckCircle weight="duotone" />
              ) : (
                <UploadSimple weight="duotone" />
              )}
              <span>
                <strong>
                  {fileBusy
                    ? "Preparing secure local copy…"
                    : form.fileName ||
                      (requiresFile
                        ? "Add the original"
                        : "Add a photo if useful")}
                </strong>
                <small>
                  {form.fileName
                    ? `${formatFileSize(form.fileSize)} · ${
                        form.fileChecksum
                          ? `SHA-256 ${form.fileChecksum.slice(0, 12)}…`
                          : "Checksum unavailable"
                      }`
                    : "Take a new photo or choose an existing file. Maximum 25 MB."}
                </small>
              </span>
            </div>
            <div className="file-capture-actions">
              <label className="secondary-button">
                <Camera weight="bold" />
                Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={fileBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file) onFileChange(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <label className="secondary-button">
                <UploadSimple weight="bold" />
                {form.fileName ? "Replace file" : "Choose file"}
                <input
                  type="file"
                  accept={generalAccept}
                  disabled={fileBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file) onFileChange(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {form.fileName && (
                <button
                  type="button"
                  className="text-button is-danger"
                  disabled={fileBusy}
                  onClick={() => onFileChange(null)}
                >
                  <Trash weight="bold" /> Remove
                </button>
              )}
            </div>
            {!selectedFile && form.fileName && (
              <div className="file-draft-warning" role="status">
                <Warning weight="bold" />
                The metadata was restored, but the original file is unavailable.
                Choose it again before saving.
              </div>
            )}
          </div>
        </FormField>
      )}
      {form.materialKind === "link" && (
        <FormField label="Safe reference link" hint="Never paste a password, private key, or recovery phrase">
          <input type="url" value={form.linkUrl} onChange={(event) => update("linkUrl", event.target.value)} placeholder="https://…" />
        </FormField>
      )}
      <MaterialStorageFields
        form={form}
        update={update}
        workspace={workspace}
      />
      {["note", "artifact", "record"].includes(form.materialKind) && (
        <FormField
          label={form.materialKind === "note" ? "Note or story" : "Context"}
          hint={form.materialKind === "note" ? "The words are the material—no file is required" : "Optional detail that will help later"}
        >
          <textarea rows="4" value={form.materialNote} onChange={(event) => update("materialNote", event.target.value)} placeholder="What should your future self or family know?" />
        </FormField>
      )}
    </div>
  );
}

function QuickCaptureChoice({ option, onClick }) {
  const Icon = option.icon;
  const destination = option.groupId
    ? `Browse ${option.label}`
    : `Add ${option.label}`;
  return (
    <button
      type="button"
      className="quick-capture-choice"
      aria-label={`${destination} — ${option.eyebrow}`}
      onClick={onClick}
    >
      <span className="quick-capture-icon"><Icon weight="duotone" /></span>
      <span className="quick-capture-copy">
        <small>{option.eyebrow}</small>
        <strong>{option.label}</strong>
        <span>{option.copy}</span>
      </span>
      <CaretRight weight="bold" />
    </button>
  );
}

function CaptureSupportChoice({
  icon: Icon,
  title,
  copy,
  onClick,
  disabled = false,
}) {
  return (
    <button
      type="button"
      className="capture-support-choice"
      aria-label={`${title} — ${copy}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span><Icon weight="duotone" /></span>
      <strong>{title}</strong>
      <small>{copy}</small>
    </button>
  );
}

function HelpDrawer({ onClose, onGoHome }) {
  const { session } = useWorkspace();
  const drawerRef = useRef(null);
  useDialogFocus(drawerRef, onClose);

  return (
    <motion.div
      className="overlay-backdrop drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <motion.div
        ref={drawerRef}
        tabIndex="-1"
        className="settings-drawer help-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Getting started</span>
            <h2 id="help-title">Your next move</h2>
          </div>
          <IconButton label="Close help" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        <section className="help-intro">
          <span><BookOpenText weight="duotone" /></span>
          <div>
            <strong>Start small. Build continuity over time.</strong>
            <p>
              You do not need a complete inventory today. Capture one useful
              record, then let Home guide the next highest-value action.
            </p>
          </div>
        </section>

        <ol className="help-steps">
          <li>
            <span><Plus weight="bold" /></span>
            <div>
              <strong>Capture what you remember</strong>
              <p>Add a place, asset, room, paper, story, or physical artifact.</p>
            </div>
          </li>
          <li>
            <span><MapPin weight="duotone" /></span>
            <div>
              <strong>Keep location honest</strong>
              <p>
                Physical items need a findable Place plus a room, container,
                or locator clue. Digital records can use No physical location.
              </p>
            </div>
          </li>
          <li>
            <span><MagnifyingGlass weight="bold" /></span>
            <div>
              <strong>Retrieve it later</strong>
              <p>Search by item, place, person, paper, artifact, or reference.</p>
            </div>
          </li>
        </ol>

        <section className="settings-section">
          <div className="detail-section-heading">
            <ShieldCheck />
            <h3>Prototype boundary</h3>
          </div>
          <p>
            This build keeps metadata and selected originals on this device.
            Vault can create a manual encrypted recovery kit
            {session
              ? " or a client-encrypted account recovery copy"
              : ", and the optional local service can add an authenticated recovery copy"}.
            Automatic live sync and real family delivery are not connected.
          </p>
        </section>

        <button className="primary-button help-home-action" onClick={onGoHome}>
          Show my next action <ArrowRight weight="bold" />
        </button>
      </motion.div>
    </motion.div>
  );
}

function SettingsDrawer({ onClose, onExport, onOpenRecovery, onReset }) {
  const { workspace, session } = useWorkspace();
  const profileMember =
    workspace.members.find(
      (member) => member.id === workspace.household.ownerMemberId,
    ) || workspace.members[0];
  const householdLabel =
    workspace.mode === "sample"
      ? "Sample household"
      : session?.householdName || workspace.household.name;
  const householdInitials =
    session?.displayName
      ?.split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    profileMember?.initials ||
    "MY";
  const drawerRef = useRef(null);
  useDialogFocus(drawerRef, onClose);
  return (
    <motion.div className="overlay-backdrop drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.div ref={drawerRef} tabIndex="-1" className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}>
        <div className="drawer-header"><div><span className="eyebrow">Account & prototype</span><h2 id="settings-title">Settings</h2></div><IconButton label="Close settings" onClick={onClose}><X /></IconButton></div>
        <div className="settings-profile">
          <span>{householdInitials}</span><div><strong>{householdLabel}</strong><small>{workspace.mode === "sample" ? "Viewing isolated sample data" : session ? `${session.displayName} · ${session.role}` : "Local-only workspace"}</small></div>
        </div>
        <section className="settings-section">
          <div className="detail-section-heading"><ShieldCheck /><h3>Privacy state</h3></div>
          <p>{session ? "This browser snapshot and its selected originals are isolated to the signed-in account and household. Nothing is uploaded automatically." : "One local workspace snapshot and selected originals stay on this device. Nothing is uploaded automatically."}</p>
          <StatusPill tone={session ? "success" : "pending"}>{session ? "Account-scoped on this device" : "Local prototype"}</StatusPill>
        </section>
        <section className="settings-section">
          <div className="detail-section-heading"><DownloadSimple /><h3>Your data</h3></div>
          <button className="settings-row" onClick={onExport}><span><strong>Export records JSON</strong><small>Readable metadata only · no originals · not encrypted</small></span><CaretRight /></button>
          <button className="settings-row" onClick={onOpenRecovery}><span><strong>Encrypted recovery kit</strong><small>Create or restore a manual portable kit in Vault</small></span><CaretRight /></button>
        </section>
        <section className="settings-section">
          <div className="detail-section-heading"><GearSix /><h3>Product settings</h3></div>
          <button className="settings-row" disabled><span><strong>Arabic & RTL</strong><small>Planned before regional alpha</small></span><CaretRight /></button>
          <button className="settings-row" disabled><span><strong>Notifications</strong><small>Requires account and task service</small></span><CaretRight /></button>
        </section>
        <button className="danger-button" onClick={() => window.confirm(session ? "Reset this signed-in workspace on this device? This removes every account-scoped local generation, unfinished draft, and stored original from this browser. It does not delete encrypted service backup history." : "Reset this local workspace? This removes every local generation, unfinished draft, and stored original from this browser. Create a recovery kit first if you may need them.") && onReset()}>
          <Trash /> {session ? "Reset this device’s account workspace" : "Reset local workspace"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function Modal({ title, onClose, children, className }) {
  const modalRef = useRef(null);
  useDialogFocus(modalRef, onClose);
  return (
    <motion.div className="overlay-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section ref={modalRef} tabIndex="-1" className={cx("modal", className)} role="dialog" aria-modal="true" aria-labelledby="modal-title" initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 16 }}>
        <header><h2 id="modal-title">{title}</h2><IconButton label="Close" onClick={onClose}><X /></IconButton></header>
        {children}
      </motion.section>
    </motion.div>
  );
}

function FormField({ label, hint, children }) {
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const hintId = `${fieldId}-hint`;
  const isNativeControl =
    isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type);
  const controlId =
    isNativeControl
      ? children.props.id || `${fieldId}-control`
      : null;
  const control = isValidElement(children)
    ? cloneElement(children, {
        ...(isNativeControl
          ? { id: controlId }
          : { "aria-labelledby": labelId }),
        ...(hint ? { "aria-describedby": hintId } : {}),
      })
    : children;
  const visibleLabel = isNativeControl ? (
    <label id={labelId} htmlFor={controlId}>
      <strong>{label}</strong>
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  ) : (
    <span id={labelId}>
      <strong>{label}</strong>
      {hint && <small id={hintId}>{hint}</small>}
    </span>
  );
  return (
    <div className="form-field">
      {visibleLabel}
      {control}
    </div>
  );
}

function PageHeader({ eyebrow, title, copy, action }) {
  return (
    <header className="page-header">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

function BackLink({ to, label }) {
  return <Link className="back-link" to={to}><ArrowLeft weight="bold" /> {label}</Link>;
}

function EmptyState({ icon: Icon, title, copy, action }) {
  return (
    <div className="empty-state">
      <span><Icon weight="duotone" /></span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action}
    </div>
  );
}

function CaptureStudioLoading() {
  return (
    <div className="overlay-backdrop drawer-backdrop capture-studio-backdrop">
      <aside
        className="capture-studio-drawer capture-studio-loading"
        aria-label="Opening capture studio"
      >
        <Scan weight="duotone" />
        <strong>Opening capture studio</strong>
        <span>Preparing local document, room, and label tools.</span>
      </aside>
    </div>
  );
}

function GlobeLoading() {
  return (
    <div className="globe-fallback" aria-label="Loading the asset globe">
      <GlobeHemisphereWest weight="duotone" />
      <strong>Preparing your world</strong>
      <span>The place list remains the accessible source of truth.</span>
    </div>
  );
}

function RecordNotFound({ title, backTo }) {
  return (
    <div className="record-not-found">
      <span><Warning weight="duotone" /></span>
      <StatusPill tone="warning">Record unavailable</StatusPill>
      <h1>{title}</h1>
      <p>It may have been archived, deleted, or the link may be incomplete.</p>
      <Link className="primary-button" to={backTo}><ArrowLeft /> Return safely</Link>
    </div>
  );
}

function NotFound() {
  return <RecordNotFound title="This page does not exist" backTo="/home" />;
}

function NavigationEffects() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    if (previousPath.current !== pathname) {
      window.requestAnimationFrame(() => {
        document.querySelector("#main-content")?.focus({ preventScroll: true });
      });
      previousPath.current = pathname;
    }
  }, [pathname]);

  return null;
}

function WorkspaceBoundary() {
  const account = useSecureAccount();
  const session =
    account.session?.accountId && account.session?.householdId
      ? account.session
      : null;
  const storageScopeId = session
    ? createAccountStorageScopeId(session)
    : LOCAL_DEMO_SCOPE_ID;

  return (
    <WorkspaceProvider
      key={storageScopeId}
      storageScopeId={storageScopeId}
      session={session}
    >
      <AppRoutes />
    </WorkspaceProvider>
  );
}

export function App() {
  const router = useMemo(
    () =>
      createBrowserRouter([
        {
          path: "*",
          element: (
            <>
              <NavigationEffects />
              <SecureAccountProvider>
                <WorkspaceBoundary />
              </SecureAccountProvider>
            </>
          ),
        },
      ]),
    [],
  );

  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
