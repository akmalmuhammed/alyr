import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
} from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BackpackIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  Crosshair2Icon,
  CubeIcon,
  DotsHorizontalIcon,
  EyeOpenIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  IdCardIcon,
  ImageIcon,
  LockClosedIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  PersonIcon,
  PlusIcon,
  ReaderIcon,
  StackIcon,
  StopwatchIcon,
} from "@radix-ui/react-icons";
import {
  Camera as PhCamera,
  CaretRight as PhCaretRight,
  Cloud as PhCloud,
  Cube as PhCube,
  FileText as PhFileText,
  Fingerprint as PhFingerprint,
  GlobeHemisphereWest as PhGlobe,
  Hexagon as PhHexagon,
  House as PhHouse,
  List as PhList,
  LockKey as PhLockKey,
  MagnifyingGlass as PhSearch,
  MapPin as PhMapPin,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  Target as PhTarget,
  User as PhUser,
  UsersThree as PhUsers,
  type IconWeight,
} from "@phosphor-icons/react";
import createGlobe, {
  type Arc,
  type Globe,
  type Marker,
} from "cobe";
import { AnimatePresence, motion } from "motion/react";
import {
  BottomSheet,
  KeyboardInput,
  MobileScroll,
  useKeyboard,
  useKeyboardInsets,
} from "./mobile";

type TabId = "home" | "assets" | "family" | "vault";
type SpaceMode = "places" | "assets";
type WorldMode = "globe" | "list";
type CaptureIntent = "room" | "item" | "proof" | "place";
type ProofType =
  | "Purchase receipt"
  | "Service record"
  | "Current photo"
  | "Insurance policy";
type LocationStatus = "known" | "needs-detail" | "unknown";
type CaptureStage =
  | "menu"
  | "room"
  | "item"
  | "proof"
  | "place"
  | "scanning"
  | "review"
  | "success";

type Room = {
  id: string;
  name: string;
  progress: number;
  captured: string;
  icon: ElementType;
  itemCount: number;
  documents: number;
  note: string;
};

type PlacePoint = {
  id: string;
  name: string;
  primaryPlaceId: string;
  propertyName: string;
  count: number;
  propertyCount: number;
  placeCount: number;
  progress: number;
  lat: number;
  lng: number;
  meta: string;
};

type OwnedPlace = {
  id: string;
  regionId: string;
  regionName: string;
  name: string;
  kind: string;
  assetCount: number;
  progress: number;
  documents: number;
  proofGaps: number;
  hasRooms: boolean;
  image?: string;
};

type AssetRecord = {
  id: string;
  name: string;
  meta: string;
  value: string;
  icon: ElementType;
  accent: string;
  regionId?: string;
  placeId?: string;
  roomId?: string;
  locationStatus: LocationStatus;
  locationDetail?: string;
  reference?: string;
  proofCount: number;
  pendingProofCount: number;
  proofRecords: ProofRecord[];
  requiredProofTypes: ProofType[];
  needsProof: boolean;
  lastProofType?: ProofType;
  readiness: number;
  status: string;
};

type ProofRecord = {
  id: string;
  type: ProofType;
  status: "pending" | "verified";
  addedAt: string;
};

const ROOM_SEED: Room[] = [
  {
    id: "study",
    name: "Study",
    progress: 92,
    captured: "Jul 20, 2026",
    icon: ReaderIcon,
    itemCount: 84,
    documents: 9,
    note: "One receipt and a wide room photo would complete this room.",
  },
  {
    id: "wardrobe",
    name: "Wardrobe",
    progress: 64,
    captured: "Jul 18, 2026",
    icon: BackpackIcon,
    itemCount: 41,
    documents: 3,
    note: "High-value bags and jewelry need closer photos.",
  },
  {
    id: "garage",
    name: "Garage",
    progress: 55,
    captured: "Jul 12, 2026",
    icon: ArchiveIcon,
    itemCount: 26,
    documents: 4,
    note: "Add serial numbers for tools and the bicycle.",
  },
];

const PLACE_POINTS: PlacePoint[] = [
  {
    id: "doha",
    name: "Doha",
    primaryPlaceId: "west-bay-home",
    propertyName: "West Bay Home",
    count: 127,
    propertyCount: 86,
    placeCount: 2,
    progress: 78,
    lat: 25.2854,
    lng: 51.531,
    meta: "86 assets · 22 need proof",
  },
  {
    id: "london",
    name: "London",
    primaryPlaceId: "family-archive",
    propertyName: "Family archive",
    count: 8,
    propertyCount: 8,
    placeCount: 1,
    progress: 94,
    lat: 51.5074,
    lng: -0.1278,
    meta: "8 assets · fully located",
  },
  {
    id: "dubai",
    name: "Dubai",
    primaryPlaceId: "dubai-storage",
    propertyName: "Storage suite",
    count: 3,
    propertyCount: 3,
    placeCount: 1,
    progress: 67,
    lat: 25.2048,
    lng: 55.2708,
    meta: "3 assets · 1 needs proof",
  },
];

const CITY_CATALOG: PlacePoint[] = [
  ...PLACE_POINTS,
  {
    id: "riyadh",
    name: "Riyadh",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 24.7136,
    lng: 46.6753,
    meta: "Available city cluster",
  },
  {
    id: "cairo",
    name: "Cairo",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 30.0444,
    lng: 31.2357,
    meta: "Available city cluster",
  },
  {
    id: "istanbul",
    name: "Istanbul",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 41.0082,
    lng: 28.9784,
    meta: "Available city cluster",
  },
  {
    id: "paris",
    name: "Paris",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 48.8566,
    lng: 2.3522,
    meta: "Available city cluster",
  },
  {
    id: "new-york",
    name: "New York",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 40.7128,
    lng: -74.006,
    meta: "Available city cluster",
  },
  {
    id: "mumbai",
    name: "Mumbai",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 19.076,
    lng: 72.8777,
    meta: "Available city cluster",
  },
  {
    id: "singapore",
    name: "Singapore",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 1.3521,
    lng: 103.8198,
    meta: "Available city cluster",
  },
  {
    id: "tokyo",
    name: "Tokyo",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: 35.6762,
    lng: 139.6503,
    meta: "Available city cluster",
  },
  {
    id: "sydney",
    name: "Sydney",
    primaryPlaceId: "",
    propertyName: "New place",
    count: 0,
    propertyCount: 0,
    placeCount: 0,
    progress: 0,
    lat: -33.8688,
    lng: 151.2093,
    meta: "Available city cluster",
  },
];

const PLACE_SEED: OwnedPlace[] = [
  {
    id: "west-bay-home",
    regionId: "doha",
    regionName: "Doha",
    name: "West Bay Home",
    kind: "Home",
    assetCount: 86,
    progress: 78,
    documents: 31,
    proofGaps: 1,
    hasRooms: true,
    image: "/assets/west-bay-home.png",
  },
  {
    id: "pearl-apartment-place",
    regionId: "doha",
    regionName: "Doha",
    name: "Pearl apartment",
    kind: "Property",
    assetCount: 41,
    progress: 92,
    documents: 12,
    proofGaps: 1,
    hasRooms: false,
  },
  {
    id: "family-archive",
    regionId: "london",
    regionName: "London",
    name: "Family archive",
    kind: "Archive",
    assetCount: 8,
    progress: 94,
    documents: 18,
    proofGaps: 1,
    hasRooms: false,
  },
  {
    id: "dubai-storage",
    regionId: "dubai",
    regionName: "Dubai",
    name: "Storage suite",
    kind: "Storage",
    assetCount: 3,
    progress: 67,
    documents: 6,
    proofGaps: 2,
    hasRooms: false,
  },
];

const SEARCH_ITEMS: AssetRecord[] = [
  {
    id: "gmt-master-ii",
    name: "GMT-Master II",
    meta: "Watch · Study safe",
    value: "QAR 46,000",
    icon: StopwatchIcon,
    accent: "violet",
    regionId: "doha",
    placeId: "west-bay-home",
    roomId: "study",
    locationStatus: "known",
    proofCount: 2,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Service record"],
    needsProof: true,
    readiness: 86,
    status: "Service proof due",
  },
  {
    id: "pearl-apartment",
    name: "Pearl apartment",
    meta: "Property · The Pearl-Qatar",
    value: "QAR 2.4M",
    icon: HomeIcon,
    accent: "blue",
    regionId: "doha",
    placeId: "pearl-apartment-place",
    locationStatus: "known",
    proofCount: 3,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Insurance policy"],
    needsProof: true,
    readiness: 92,
    status: "Insurance review due Jul 31",
  },
  {
    id: "west-bay-title-deed",
    name: "West Bay title deed",
    meta: "Document · West Bay Home",
    value: "Verified",
    icon: FileTextIcon,
    accent: "cyan",
    regionId: "doha",
    placeId: "west-bay-home",
    roomId: "study",
    locationStatus: "known",
    proofCount: 4,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: [],
    needsProof: false,
    readiness: 100,
    status: "Verified in the sample workspace",
  },
  {
    id: "childhood-film-camera",
    name: "Childhood film camera",
    meta: "Collectible · Family archive",
    value: "Story added",
    icon: CameraIcon,
    accent: "amber",
    regionId: "london",
    placeId: "family-archive",
    locationStatus: "needs-detail",
    proofCount: 1,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Current photo"],
    needsProof: true,
    readiness: 74,
    status: "Location needs confirmation",
  },
  {
    id: "inherited-coin-box",
    name: "Inherited coin box",
    meta: "Collectible · Location needed",
    value: "Story added",
    icon: CubeIcon,
    accent: "amber",
    locationStatus: "unknown",
    proofCount: 1,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Current photo"],
    needsProof: true,
    readiness: 38,
    status: "Location needs confirmation",
  },
  {
    id: "family-photo-album",
    name: "Family photo album",
    meta: "Personal · Location needed",
    value: "24 memories",
    icon: ImageIcon,
    accent: "cyan",
    locationStatus: "unknown",
    proofCount: 2,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Current photo"],
    needsProof: true,
    readiness: 44,
    status: "Location needs confirmation",
  },
  {
    id: "dubai-storage-agreement",
    name: "Storage agreement",
    meta: "Document · Dubai storage",
    value: "Verified",
    icon: FileTextIcon,
    accent: "blue",
    regionId: "dubai",
    placeId: "dubai-storage",
    locationStatus: "known",
    proofCount: 4,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: [],
    needsProof: false,
    readiness: 100,
    status: "Verified in the sample workspace",
  },
  {
    id: "leica-q3",
    name: "Leica Q3",
    meta: "Camera · Dubai storage",
    value: "QAR 24,000",
    icon: CameraIcon,
    accent: "violet",
    regionId: "dubai",
    placeId: "dubai-storage",
    locationStatus: "known",
    proofCount: 1,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Purchase receipt"],
    needsProof: true,
    readiness: 68,
    status: "Purchase proof needed",
  },
  {
    id: "travel-jewelry-case",
    name: "Travel jewelry case",
    meta: "Personal · Dubai storage",
    value: "Value not set",
    icon: CubeIcon,
    accent: "cyan",
    regionId: "dubai",
    placeId: "dubai-storage",
    locationStatus: "known",
    proofCount: 1,
    pendingProofCount: 0,
    proofRecords: [],
    requiredProofTypes: ["Current photo"],
    needsProof: true,
    readiness: 52,
    status: "Add a contents photo",
  },
];

const NAV_ITEMS: Array<{
  id: TabId;
  label: string;
  icon: ElementType;
}> = [
  { id: "home", label: "Home", icon: PhHouse },
  { id: "assets", label: "Assets", icon: PhCube },
  { id: "family", label: "Family", icon: PhUsers },
  { id: "vault", label: "Vault", icon: VaultNavGlyph },
];

function iconForCategory(category: string): ElementType {
  if (category === "Watch") return StopwatchIcon;
  if (category === "Document") return FileTextIcon;
  if (category === "Camera") return CameraIcon;
  if (category === "Property") return HomeIcon;
  if (category === "Personal") return BackpackIcon;
  return CubeIcon;
}

function defaultProofRequirements(category: string): ProofType[] {
  if (category === "Property") return ["Insurance policy"];
  if (
    category === "Personal" ||
    category === "Collectible" ||
    category === "Document"
  ) {
    return ["Current photo"];
  }
  return ["Purchase receipt"];
}

function ShieldDocumentGlyph() {
  return (
    <span className="shield-document-glyph" aria-hidden="true">
      <PhShield className="shield-document-base" weight="duotone" />
      <PhFileText className="shield-document-file" weight="bold" />
    </span>
  );
}

function VaultNavGlyph({ weight = "regular" }: { weight?: IconWeight }) {
  return (
    <span className="vault-nav-glyph" aria-hidden="true">
      <PhHexagon className="vault-nav-frame" weight={weight} />
      <PhLockKey className="vault-nav-lock" weight="bold" />
    </span>
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlacePointArray(value: unknown): value is PlacePoint[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (place) =>
        isObject(place) &&
        typeof place.id === "string" &&
        typeof place.name === "string" &&
        typeof place.primaryPlaceId === "string" &&
        Number.isFinite(place.count) &&
        Number.isFinite(place.placeCount) &&
        Number.isFinite(place.progress) &&
        Number.isFinite(place.lat) &&
        Number.isFinite(place.lng),
    )
  );
}

function isOwnedPlaceArray(value: unknown): value is OwnedPlace[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (place) =>
        isObject(place) &&
        typeof place.id === "string" &&
        typeof place.regionId === "string" &&
        typeof place.regionName === "string" &&
        typeof place.name === "string" &&
        Number.isFinite(place.assetCount) &&
        Number.isFinite(place.progress) &&
        Number.isFinite(place.documents) &&
        Number.isFinite(place.proofGaps),
    )
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRoomCompletionRecord(
  value: unknown,
): value is Record<string, number> {
  return (
    isObject(value) &&
    Object.values(value).every(
      (count) =>
        typeof count === "number" &&
        Number.isFinite(count) &&
        count >= 0,
    )
  );
}

function createEntityId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function getHistoryDepth() {
  const state = window.history.state as
    | { continuity?: unknown; depth?: unknown }
    | null;
  return state?.continuity === true &&
    typeof state.depth === "number" &&
    Number.isFinite(state.depth)
    ? Math.max(0, state.depth)
    : 0;
}

function usePersistentState<T>(
  key: string,
  seed: T,
  isValid: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) return seed;
      const parsed = JSON.parse(stored) as unknown;
      return isValid(parsed) ? parsed : seed;
    } catch {
      return seed;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The prototype remains usable when storage is unavailable.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function usePersistentAssets(key: string, seed: AssetRecord[]) {
  const [assets, setAssets] = useState<AssetRecord[]>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) return seed;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return seed;
      if (parsed.length === 0) return [];
      const seen = new Set<string>();
      const normalized = parsed.flatMap((candidate) => {
        if (
          !isObject(candidate) ||
          typeof candidate.id !== "string" ||
          !candidate.id ||
          seen.has(candidate.id) ||
          typeof candidate.name !== "string" ||
          typeof candidate.meta !== "string" ||
          typeof candidate.value !== "string" ||
          !Number.isFinite(candidate.readiness)
        ) {
          return [];
        }
        seen.add(candidate.id);
        const proofRecords: ProofRecord[] = Array.isArray(
          candidate.proofRecords,
        )
          ? candidate.proofRecords.flatMap((proof) =>
              isObject(proof) &&
              typeof proof.id === "string" &&
              (proof.type === "Purchase receipt" ||
                proof.type === "Service record" ||
                proof.type === "Current photo" ||
                proof.type === "Insurance policy") &&
              (proof.status === "pending" ||
                proof.status === "verified") &&
              typeof proof.addedAt === "string"
                ? [
                    {
                      id: proof.id,
                      type: proof.type,
                      status: proof.status,
                      addedAt: proof.addedAt,
                    },
                  ]
                : [],
            )
          : [];
        const pendingProofCount = proofRecords.filter(
          (proof) => proof.status === "pending",
        ).length;
        const category = candidate.meta.split(" · ")[0] ?? "Other";
        const requiredProofTypes: ProofType[] = Array.isArray(
          candidate.requiredProofTypes,
        )
          ? candidate.requiredProofTypes.filter(
              (type): type is ProofType =>
                type === "Purchase receipt" ||
                type === "Service record" ||
                type === "Current photo" ||
                type === "Insurance policy",
            )
          : candidate.needsProof === true
            ? [
                typeof candidate.status === "string" &&
                candidate.status.toLowerCase().includes("service")
                  ? "Service record"
                  : typeof candidate.status === "string" &&
                      candidate.status.toLowerCase().includes("insurance")
                    ? "Insurance policy"
                    : typeof candidate.status === "string" &&
                        candidate.status.toLowerCase().includes("photo")
                      ? "Current photo"
                      : "Purchase receipt",
              ]
            : [];
        const locationStatus: LocationStatus =
          candidate.locationStatus === "known" ||
          candidate.locationStatus === "needs-detail" ||
          candidate.locationStatus === "unknown"
            ? candidate.locationStatus
            : typeof candidate.placeId === "string"
              ? "known"
              : "unknown";
        return [
          {
            ...(candidate as Omit<AssetRecord, "icon">),
            icon: iconForCategory(category),
            accent:
              typeof candidate.accent === "string"
                ? candidate.accent
                : "violet",
            locationStatus,
            proofRecords,
            requiredProofTypes,
            proofCount: Math.max(
              proofRecords.length,
              typeof candidate.proofCount === "number" &&
                Number.isFinite(candidate.proofCount)
                ? candidate.proofCount
                : 0,
            ),
            pendingProofCount,
            needsProof: requiredProofTypes.length > 0,
            readiness: Math.max(
              0,
              Math.min(100, Number(candidate.readiness)),
            ),
            status:
              typeof candidate.status === "string"
                ? candidate.status
                : "Review this record",
          } satisfies AssetRecord,
        ];
      });
      return normalized.length ? normalized : seed;
    } catch {
      return seed;
    }
  });

  useEffect(() => {
    try {
      const serializable = assets.map(({ icon: _icon, ...asset }) => asset);
      window.localStorage.setItem(key, JSON.stringify(serializable));
    } catch {
      // The prototype remains usable when storage is unavailable.
    }
  }, [assets, key]);

  return [assets, setAssets] as const;
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const { keyboardHeight } = useKeyboardInsets();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "view",
    ) as TabId;
    return NAV_ITEMS.some((item) => item.id === requested)
      ? requested
      : "home";
  });
  const [worldMode, setWorldMode] = useState<WorldMode>("globe");
  const [places, setPlaces] = usePersistentState<PlacePoint[]>(
    "continuity-v5-regions",
    PLACE_POINTS,
    isPlacePointArray,
  );
  const [ownedPlaces, setOwnedPlaces] = usePersistentState<OwnedPlace[]>(
    "continuity-v5-places",
    PLACE_SEED,
    isOwnedPlaceArray,
  );
  const [portfolioTotal, setPortfolioTotal] = usePersistentState(
    "continuity-v5-portfolio-total",
    146,
    isFiniteNumber,
  );
  const [portfolioReadiness, setPortfolioReadiness] =
    usePersistentState(
      "continuity-v5-readiness",
      83,
      isFiniteNumber,
    );
  const [selectedPlaceId, setSelectedPlaceId] = useState("doha");
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [assetRecords, setAssetRecords] = usePersistentAssets(
    "continuity-v5-assets",
    SEARCH_ITEMS,
  );
  const [assetsInitialFilter, setAssetsInitialFilter] = useState("All");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureIntent, setCaptureIntent] =
    useState<CaptureIntent>("room");
  const [captureAssetId, setCaptureAssetId] = useState<string | null>(
    null,
  );
  const [capturePlaceId, setCapturePlaceId] = useState<string | null>(
    null,
  );
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState("Watch");
  const [itemPlaceId, setItemPlaceId] =
    useState<string | null>("west-bay-home");
  const [itemRoomId, setItemRoomId] = useState<string | null>(null);
  const [itemValue, setItemValue] = useState("");
  const [itemReference, setItemReference] = useState("");
  const [itemLocationDetail, setItemLocationDetail] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeKind, setPlaceKind] = useState("Home");
  const [placeRegionId, setPlaceRegionId] = useState("doha");
  const [createdPlaceId, setCreatedPlaceId] = useState<string | null>(
    null,
  );
  const [selectedProofType, setSelectedProofType] =
    useState<ProofType | null>(null);
  const [captureStage, setCaptureStage] = useState<CaptureStage>("menu");
  const [selectedRoom, setSelectedRoom] = useState("study");
  const [scanProgress, setScanProgress] = useState(8);
  const [completedRooms, setCompletedRooms] = usePersistentState<
    Record<string, number>
  >(
    "continuity-v5-room-captures",
    {},
    isRoomCompletionRecord,
  );
  const [lastCompletedRoomId, setLastCompletedRoomId] = useState<
    string | null
  >(null);
  const [lastCompletedRoomPlaceId, setLastCompletedRoomPlaceId] =
    useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try {
      return window.localStorage.getItem("continuity-onboarded") !== "1";
    } catch {
      return true;
    }
  });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [creatingFirstPlace, setCreatingFirstPlace] = useState(false);
  const [proofListAssetId, setProofListAssetId] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const appRootRef = useRef<HTMLDivElement>(null);
  const captureResetTimerRef = useRef<number | null>(null);
  const verifyingProofIdsRef = useRef(new Set<string>());
  const ownedPlacesRef = useRef(ownedPlaces);
  ownedPlacesRef.current = ownedPlaces;
  const roomContextPlaceId =
    capturePlaceId ??
    openPlaceId ??
    places.find((place) => place.id === selectedPlaceId)
      ?.primaryPlaceId ??
    "west-bay-home";

  const cancelCaptureReset = () => {
    if (captureResetTimerRef.current !== null) {
      window.clearTimeout(captureResetTimerRef.current);
      captureResetTimerRef.current = null;
    }
  };

  const rooms = useMemo(
    () =>
      ROOM_SEED.map((room) => {
        const baseRoom =
          roomContextPlaceId === "west-bay-home"
            ? room
            : {
                ...room,
                progress: 0,
                captured: "Not captured",
                itemCount: 0,
                documents: 0,
                note: "Start a guided scan to create this room record.",
              };
        const completions =
          completedRooms[`${roomContextPlaceId}:${room.id}`] ??
          (roomContextPlaceId === "west-bay-home"
            ? completedRooms[room.id] ?? 0
            : 0);
        return completions
          ? {
              ...baseRoom,
              progress:
                roomContextPlaceId === "west-bay-home"
                  ? Math.min(100, room.progress + 5 * completions)
                  : Math.min(100, 62 + 10 * (completions - 1)),
              captured: "Today",
              itemCount: baseRoom.itemCount + 8 * completions,
              documents: baseRoom.documents + 3 * completions,
            }
          : baseRoom;
      }),
    [completedRooms, roomContextPlaceId],
  );

  const activeRoom = rooms.find((room) => room.id === roomId) ?? null;
  const activeAsset =
    assetRecords.find((asset) => asset.id === assetId) ?? null;
  const activeRegion =
    places.find((place) => place.id === selectedPlaceId) ?? places[0];
  const activePlace =
    ownedPlaces.find((place) => place.id === openPlaceId) ?? null;
  const activePrimaryPlace =
    ownedPlaces.find(
      (place) => place.id === activeRegion.primaryPlaceId,
    ) ?? ownedPlaces[0];
  const proofListAsset =
    assetRecords.find((asset) => asset.id === proofListAssetId) ?? null;
  const locationNeededCount = assetRecords.filter(
    (asset) => asset.locationStatus !== "known",
  ).length;
  const placeTotal = places.reduce(
    (total, place) => total + place.placeCount,
    0,
  );
  const hasDetail = Boolean(activeAsset || activeRoom || activePlace);
  const lastCompletedRoomName =
    rooms.find((room) => room.id === lastCompletedRoomId)?.name ?? null;
  const regionalAssets = assetRecords.filter(
    (asset) => asset.regionId === selectedPlaceId,
  );
  const regionalLocationIssue = regionalAssets
    .filter((asset) => asset.locationStatus !== "known")
    .sort((a, b) => a.readiness - b.readiness)[0];
  const regionalPendingProof = regionalAssets
    .filter((asset) => asset.pendingProofCount > 0)
    .sort((a, b) => b.pendingProofCount - a.pendingProofCount)[0];
  const regionalProofIssue = regionalAssets
    .filter((asset) => asset.needsProof)
    .sort((a, b) => a.readiness - b.readiness)[0];
  const activeRoomCaptureCount = Object.entries(completedRooms).reduce(
    (total, [key, count]) =>
      key.startsWith(`${activePrimaryPlace.id}:`) ||
      (activePrimaryPlace.id === "west-bay-home" && !key.includes(":"))
        ? total + count
        : total,
    0,
  );
  const homeAttention = (() => {
    if (
      lastCompletedRoomId &&
      ownedPlaces.find((place) => place.id === lastCompletedRoomPlaceId)
        ?.regionId === selectedPlaceId
    ) {
      return {
        kind: "review-room" as const,
        title: `Review the new ${lastCompletedRoomName} records`,
        meta: "Ready to verify",
        cta: "Review capture",
      };
    }
    if (
      activePrimaryPlace.hasRooms &&
      activeRoomCaptureCount === 0
    ) {
      return {
        kind: "scan-room" as const,
        title: "Start with a quick Study scan",
        meta: "About 90 seconds",
        cta: "Scan Study",
      };
    }
    if (regionalLocationIssue) {
      return {
        kind: "location" as const,
        asset: regionalLocationIssue,
        title: `Confirm where ${regionalLocationIssue.name} is kept`,
        meta: "Add a room, shelf, box or address note",
        cta: "Set location",
      };
    }
    if (regionalPendingProof) {
      return {
        kind: "verify-proof" as const,
        asset: regionalPendingProof,
        title: `Verify ${
          regionalPendingProof.lastProofType ?? "new evidence"
        } for ${regionalPendingProof.name}`,
        meta: `${regionalPendingProof.pendingProofCount} pending ${
          regionalPendingProof.pendingProofCount === 1 ? "record" : "records"
        }`,
        cta: "Review proof",
      };
    }
    if (regionalProofIssue) {
      return {
        kind: "proof" as const,
        asset: regionalProofIssue,
        title: `Add proof to ${regionalProofIssue.name}`,
        meta: `${activePrimaryPlace.proofGaps} ${
          activePrimaryPlace.proofGaps === 1
            ? "item needs"
            : "items need"
        } evidence`,
        cta: "Add proof",
      };
    }
    return {
      kind: "review-place" as const,
      title: `Review ${activePrimaryPlace.name}`,
      meta: "Priority records are current",
      cta: "Open place",
    };
  })();

  useEffect(() => {
    if (captureStage !== "scanning") return;

    setScanProgress(8);
    let completionTimer: number | undefined;
    const progressTimer = window.setInterval(() => {
      setScanProgress((current) => {
        const next = Math.min(100, current + 11);
        if (next >= 100) {
          window.clearInterval(progressTimer);
          completionTimer = window.setTimeout(
            () => setCaptureStage("review"),
            360,
          );
        }
        return next;
      });
    }, 130);

    return () => {
      window.clearInterval(progressTimer);
      if (completionTimer) window.clearTimeout(completionTimer);
    };
  }, [captureStage]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(
    () => () => {
      cancelCaptureReset();
    },
    [],
  );

  useEffect(() => {
    if (!onboardingOpen || !appRootRef.current) return;
    const backgroundNodes = Array.from(
      appRootRef.current.children,
    ).filter(
      (node) =>
        node instanceof HTMLElement &&
        !node.classList.contains("first-run-backdrop"),
    ) as HTMLElement[];

    backgroundNodes.forEach((node) => {
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });

    return () => {
      backgroundNodes.forEach((node) => {
        node.removeAttribute("inert");
        node.removeAttribute("aria-hidden");
      });
    };
  }, [onboardingOpen]);

  useEffect(() => {
    const applyRoute = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get("view") as TabId;
      const nextTab = NAV_ITEMS.some((item) => item.id === requestedView)
        ? requestedView
        : "home";
      const nextPlaceId = params.get("place");
      const nextRoomId = params.get("room");
      const nextAssetId = params.get("asset");

      setActiveTab(nextTab);
      setOpenPlaceId(nextPlaceId);
      setRoomId(nextRoomId);
      setAssetId(nextAssetId);

      const routePlace = ownedPlacesRef.current.find(
        (place) => place.id === nextPlaceId,
      );
      if (routePlace) setSelectedPlaceId(routePlace.regionId);
    };

    window.history.replaceState(
      {
        ...(window.history.state ?? {}),
        continuity: true,
        depth: getHistoryDepth(),
      },
      "",
      window.location.href,
    );
    applyRoute();
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, []);

  const routeUrl = ({
    tab,
    placeId: nextPlaceId,
    nextRoomId,
    nextAssetId,
  }: {
    tab: TabId;
    placeId?: string | null;
    nextRoomId?: string | null;
    nextAssetId?: string | null;
  }) => {
    const params = new URLSearchParams({ view: tab });
    if (nextPlaceId) params.set("place", nextPlaceId);
    if (nextRoomId) params.set("room", nextRoomId);
    if (nextAssetId) params.set("asset", nextAssetId);
    return `?${params.toString()}`;
  };

  const pushRoute = (nextUrl: string) => {
    if (window.location.search === nextUrl) return;
    window.history.pushState(
      {
        continuity: true,
        depth: getHistoryDepth() + 1,
      },
      "",
      nextUrl,
    );
  };

  const goBack = (fallback: () => void, fallbackUrl: string) => {
    if (getHistoryDepth() > 0) {
      window.history.back();
    } else {
      fallback();
      window.history.replaceState(
        { continuity: true, depth: 0 },
        "",
        fallbackUrl,
      );
    }
  };

  const navigate = (tab: TabId, preserveAssetFilter = false) => {
    keyboard.hide();
    if (tab === "assets" && !preserveAssetFilter) {
      setAssetsInitialFilter("All");
    }
    setAssetId(null);
    setRoomId(null);
    setOpenPlaceId(null);
    setActiveTab(tab);
    pushRoute(routeUrl({ tab }));
  };

  const openOwnedPlace = (nextPlaceId: string) => {
    const nextPlace = ownedPlaces.find(
      (place) => place.id === nextPlaceId,
    );
    keyboard.hide();
    setAssetId(null);
    setRoomId(null);
    setOpenPlaceId(nextPlaceId);
    setActiveTab("home");
    if (nextPlace) setSelectedPlaceId(nextPlace.regionId);
    pushRoute(routeUrl({ tab: "home", placeId: nextPlaceId }));
  };

  const openRoom = (
    nextRoomId: string,
    nextPlaceId = openPlaceId ?? "west-bay-home",
  ) => {
    keyboard.hide();
    setAssetId(null);
    setOpenPlaceId(nextPlaceId);
    setRoomId(nextRoomId);
    setActiveTab("home");
    pushRoute(
      routeUrl({
        tab: "home",
        placeId: nextPlaceId,
        nextRoomId,
      }),
    );
  };

  const openAsset = (nextAssetId: string) => {
    keyboard.hide();
    setAssetId(nextAssetId);
    pushRoute(
      routeUrl({
        tab: activeTab,
        placeId: openPlaceId,
        nextRoomId: roomId,
        nextAssetId,
      }),
    );
  };

  const beginCapture = (targetRoom?: string) => {
    cancelCaptureReset();
    keyboard.hide();
    setCaptureIntent("room");
    setCaptureAssetId(null);
    setCapturePlaceId(openPlaceId ?? activePrimaryPlace.id);
    setSelectedProofType(null);
    if (targetRoom) {
      setSelectedRoom(targetRoom);
      setCaptureStage("scanning");
    } else {
      setCaptureStage("menu");
    }
    setCaptureOpen(true);
  };

  const startPlaceCapture = () => {
    cancelCaptureReset();
    keyboard.hide();
    setCaptureIntent("place");
    setCaptureAssetId(null);
    setCreatedPlaceId(null);
    setPlaceName("");
    setPlaceKind("Home");
    setPlaceRegionId(selectedPlaceId);
    setCaptureStage("place");
    setCaptureOpen(true);
  };

  const finishOnboarding = (action: "explore" | "place") => {
    if (action === "explore") {
      try {
        window.localStorage.setItem("continuity-onboarded", "1");
      } catch {
        // The guide still closes when storage is unavailable.
      }
    }
    setOnboardingOpen(false);
    setOnboardingStep(0);
    setCreatingFirstPlace(action === "place");
    if (activeTab !== "home" || hasDetail) navigate("home");
    if (action === "place") startPlaceCapture();
  };

  const startItemCapture = (
    asset?: AssetRecord,
    placeId: string | null = activeRegion.primaryPlaceId,
  ) => {
    cancelCaptureReset();
    keyboard.hide();
    setCaptureIntent("item");
    setCaptureAssetId(asset?.id ?? null);
    setItemName(asset?.name ?? "");
    setItemCategory(asset?.meta.split(" · ")[0] ?? "Watch");
    setItemPlaceId(asset ? asset.placeId ?? null : placeId);
    setItemRoomId(
      asset?.roomId ??
        (ownedPlaces.find((place) => place.id === asset?.placeId)
          ?.hasRooms &&
        asset?.locationStatus === "known"
          ? "place-level"
          : null),
    );
    setItemValue(
      asset?.value === "Value not set" ? "" : asset?.value ?? "",
    );
    setItemReference(asset?.reference ?? "");
    setItemLocationDetail(asset?.locationDetail ?? "");
    setSelectedProofType(null);
    setCaptureStage("item");
    setCaptureOpen(true);
  };

  const startProofCapture = (asset: AssetRecord) => {
    cancelCaptureReset();
    keyboard.hide();
    setCaptureIntent("proof");
    setCaptureAssetId(asset.id);
    setItemName(asset.name);
    setItemCategory(asset.meta.split(" · ")[0] ?? "Other");
    setItemPlaceId(asset.placeId ?? null);
    setItemRoomId(asset.roomId ?? null);
    setItemValue(asset.value === "Value not set" ? "" : asset.value);
    setItemReference(asset.reference ?? "");
    setItemLocationDetail(asset.locationDetail ?? "");
    setSelectedProofType(null);
    setCaptureStage("proof");
    setCaptureOpen(true);
  };

  const closeCapture = () => {
    const resumeFirstPlaceGuide = creatingFirstPlace;
    cancelCaptureReset();
    keyboard.hide();
    setCaptureOpen(false);
    captureResetTimerRef.current = window.setTimeout(() => {
      captureResetTimerRef.current = null;
      setCaptureStage("menu");
      setCaptureAssetId(null);
      setCapturePlaceId(null);
      setSelectedProofType(null);
      setCreatedPlaceId(null);
      setCreatingFirstPlace(false);
      if (resumeFirstPlaceGuide) {
        setOnboardingStep(2);
        setOnboardingOpen(true);
      }
    }, 220);
  };

  const saveCapture = () => {
    if (captureIntent === "place") {
      const normalizedName = placeName.trim();
      const region =
        places.find((place) => place.id === placeRegionId) ??
        CITY_CATALOG.find((place) => place.id === placeRegionId) ??
        places[0] ??
        CITY_CATALOG[0];
      if (!normalizedName || !region) return;
      const baseId =
        normalizedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "private-place";
      const nextId = createEntityId(baseId);
      const nextPlace: OwnedPlace = {
        id: nextId,
        regionId: region.id,
        regionName: region.name,
        name: normalizedName,
        kind: placeKind,
        assetCount: 0,
        progress: 0,
        documents: 0,
        proofGaps: 0,
        hasRooms: placeKind === "Home" || placeKind === "Property",
      };
      if (creatingFirstPlace) {
        setOwnedPlaces([nextPlace]);
        setPlaces([
          {
            ...region,
            count: 0,
            placeCount: 1,
            progress: 0,
            primaryPlaceId: nextId,
          },
        ]);
        setAssetRecords([]);
        setPortfolioTotal(0);
        setPortfolioReadiness(0);
        setCompletedRooms({});
        setLastCompletedRoomId(null);
        setLastCompletedRoomPlaceId(null);
        try {
          window.localStorage.setItem("continuity-onboarded", "1");
          window.localStorage.setItem(
            "continuity-workspace-mode",
            "personal",
          );
        } catch {
          // The personal workspace still works without storage.
        }
      } else {
        setOwnedPlaces((current) => [...current, nextPlace]);
        setPlaces((current) =>
          current.some((place) => place.id === region.id)
            ? current.map((place) =>
                place.id === region.id
                  ? { ...place, placeCount: place.placeCount + 1 }
                  : place,
              )
            : [
                ...current,
                {
                  ...region,
                  primaryPlaceId: nextId,
                  propertyName: normalizedName,
                  count: 0,
                  propertyCount: 0,
                  placeCount: 1,
                  progress: 0,
                  meta: "0 assets · just added",
                },
              ],
        );
      }
      setCreatingFirstPlace(false);
      setSelectedPlaceId(region.id);
      setCreatedPlaceId(nextId);
    } else if (captureIntent === "room") {
      const capturePlace =
        ownedPlaces.find((place) => place.id === capturePlaceId) ??
        activePrimaryPlace;
      const room =
        rooms.find((candidate) => candidate.id === selectedRoom) ??
        rooms[0];
      const capturedAt = new Date().toISOString();
      const captureTemplates = [
        {
          name: `${room.name} overview`,
          category: "Personal",
          value: "Current photo",
          proofCount: 1,
          needsProof: false,
          readiness: 72,
        },
        {
          name: `${room.name} receipt bundle`,
          category: "Document",
          value: "4 files",
          proofCount: 1,
          needsProof: false,
          readiness: 76,
        },
        {
          name: `${room.name} warranty folder`,
          category: "Document",
          value: "3 files",
          proofCount: 1,
          needsProof: false,
          readiness: 74,
        },
        {
          name: `${room.name} collection group`,
          category: "Collectible",
          value: "Value not set",
          proofCount: 0,
          needsProof: true,
          readiness: 48,
        },
        {
          name: `${room.name} electronics group`,
          category: "Personal",
          value: "Value not set",
          proofCount: 0,
          needsProof: true,
          readiness: 46,
        },
        {
          name: `${room.name} valuables group`,
          category: "Personal",
          value: "Value not set",
          proofCount: 0,
          needsProof: true,
          readiness: 44,
        },
        {
          name: `${room.name} serial-number sheet`,
          category: "Document",
          value: "Reference saved",
          proofCount: 1,
          needsProof: false,
          readiness: 78,
        },
        {
          name: `${room.name} condition photo set`,
          category: "Personal",
          value: "3 photos",
          proofCount: 1,
          needsProof: false,
          readiness: 70,
        },
      ];
      const capturedRecords: AssetRecord[] = captureTemplates.map(
        (record) => ({
          id: createEntityId(`${selectedRoom}-capture`),
          name: record.name,
          meta: `${record.category} · ${capturePlace.name}`,
          value: record.value,
          icon: iconForCategory(record.category),
          accent: record.needsProof ? "amber" : "cyan",
          regionId: capturePlace.regionId,
          placeId: capturePlace.id,
          roomId: selectedRoom,
          locationStatus: "known",
          locationDetail: room.name,
          proofCount: record.proofCount,
          pendingProofCount: 0,
          proofRecords: [],
          requiredProofTypes: record.needsProof
            ? defaultProofRequirements(record.category)
            : [],
          needsProof: record.needsProof,
          readiness: record.readiness,
          status: record.needsProof
            ? "Add individual proof and value"
            : `Captured ${new Date(capturedAt).toLocaleDateString(
                "en",
                { month: "short", day: "numeric" },
              )}`,
        }),
      );
      const averageCapturedReadiness =
        capturedRecords.reduce(
          (total, record) => total + record.readiness,
          0,
        ) / capturedRecords.length;
      const capturedReadinessTotal = capturedRecords.reduce(
        (total, record) => total + record.readiness,
        0,
      );
      setAssetRecords((current) => [...capturedRecords, ...current]);
      setPortfolioReadiness((current) =>
        Number(
          (
            (current * portfolioTotal +
              averageCapturedReadiness * capturedRecords.length) /
            (portfolioTotal + capturedRecords.length)
          ).toFixed(1),
        ),
      );
      setPortfolioTotal((current) => current + capturedRecords.length);
      setCompletedRooms((current) => ({
        ...current,
        [`${capturePlace.id}:${selectedRoom}`]:
          (current[`${capturePlace.id}:${selectedRoom}`] ?? 0) + 1,
      }));
      setLastCompletedRoomId(selectedRoom);
      setLastCompletedRoomPlaceId(capturePlace.id);
      setOwnedPlaces((current) =>
        current.map((place) =>
          place.id === capturePlace.id
            ? {
                ...place,
                assetCount: place.assetCount + capturedRecords.length,
                proofGaps:
                  place.proofGaps +
                  capturedRecords.filter((record) => record.needsProof)
                    .length,
                documents:
                  place.documents +
                  captureTemplates.filter(
                    (record) => record.category === "Document",
                  ).length,
                progress: Math.round(
                  (place.progress * place.assetCount +
                    capturedReadinessTotal) /
                    (place.assetCount + capturedRecords.length),
                ),
              }
            : place,
        ),
      );
      setPlaces((current) =>
        current.map((place) =>
          place.id === capturePlace.regionId
            ? {
                ...place,
                progress: Math.min(100, place.progress + 1),
                count: place.count + capturedRecords.length,
              }
            : place,
        ),
      );
    } else if (
      captureIntent === "proof" &&
      captureAssetId &&
      selectedProofType
    ) {
      const proofAsset = assetRecords.find(
        (asset) => asset.id === captureAssetId,
      );
      const nextProof: ProofRecord = {
        id: createEntityId(`${captureAssetId}-proof`),
        type: selectedProofType,
        status: "pending",
        addedAt: new Date().toISOString(),
      };
      setAssetRecords((current) =>
        current.map((asset) =>
          asset.id === captureAssetId
            ? {
                ...asset,
                proofCount: asset.proofCount + 1,
                pendingProofCount: asset.pendingProofCount + 1,
                proofRecords: [nextProof, ...asset.proofRecords],
                lastProofType: selectedProofType,
                status: `${selectedProofType} added · verification pending`,
              }
            : asset,
        ),
      );
      if (!proofAsset) return;
    } else if (captureAssetId) {
      const previous = assetRecords.find(
        (asset) => asset.id === captureAssetId,
      );
      const nextPlace = ownedPlaces.find(
        (place) => place.id === itemPlaceId,
      );
      const previousCategory =
        previous?.meta.split(" · ")[0] ?? "Other";
      const categoryChanged = previousCategory !== itemCategory;
      const nextRequiredProofTypes = categoryChanged
        ? defaultProofRequirements(itemCategory)
        : previous?.requiredProofTypes ?? [];
      const nextNeedsProof = nextRequiredProofTypes.length > 0;
      const samePlace = previous?.placeId === itemPlaceId;
      const nextLocationStatus: LocationStatus = !itemPlaceId
        ? "unknown"
        : nextPlace?.hasRooms
          ? itemRoomId ||
            itemLocationDetail.trim() ||
            (samePlace && previous?.locationStatus === "known")
            ? "known"
            : "needs-detail"
          : itemLocationDetail.trim() ||
              (samePlace && previous?.locationStatus === "known")
            ? "known"
            : "needs-detail";
      const locationWeight = (status: LocationStatus | undefined) =>
        status === "known" ? 8 : status === "needs-detail" ? 3 : 0;
      const locationScore =
        locationWeight(nextLocationStatus) -
        locationWeight(previous?.locationStatus);
      const previousHasValue = Boolean(
        previous?.value && previous.value !== "Value not set",
      );
      const valueScore =
        (itemValue.trim() ? 6 : 0) - (previousHasValue ? 6 : 0);
      const referenceScore =
        (itemReference.trim() ? 5 : 0) -
        (previous?.reference ? 5 : 0);
      const proofRequirementScore =
        categoryChanged && nextNeedsProof && !previous?.needsProof ? -5 : 0;
      const readinessGain =
        locationScore +
        valueScore +
        referenceScore +
        proofRequirementScore;
      const nextAssetReadiness = Math.max(
        0,
        Math.min(100, (previous?.readiness ?? 0) + readinessGain),
      );
      setAssetRecords((current) =>
        current.map((asset) =>
          asset.id === captureAssetId
            ? {
                ...asset,
                name: itemName.trim() || asset.name,
                regionId: nextPlace?.regionId,
                placeId: itemPlaceId ?? undefined,
                roomId: nextPlace?.hasRooms
                  ? itemRoomId && itemRoomId !== "place-level"
                    ? itemRoomId
                    : undefined
                  : undefined,
                locationStatus: nextLocationStatus,
                locationDetail:
                  itemLocationDetail.trim() ||
                  (itemRoomId && itemRoomId !== "place-level"
                    ? rooms.find((room) => room.id === itemRoomId)?.name
                    : undefined),
                reference: itemReference.trim() || undefined,
                value: itemValue.trim() || "Value not set",
                meta: `${itemCategory} · ${
                  nextPlace
                    ? nextPlace.name
                    : "Location needed"
                }`,
                icon: iconForCategory(itemCategory),
                requiredProofTypes: nextRequiredProofTypes,
                needsProof: nextNeedsProof,
                readiness: nextAssetReadiness,
                status:
                  nextLocationStatus === "known"
                    ? nextNeedsProof
                      ? "Location confirmed · proof still needed"
                      : "Details updated today"
                    : nextLocationStatus === "needs-detail"
                      ? "Add an address, room, shelf or box"
                      : "Location needs confirmation",
              }
            : asset,
        ),
      );
      if (previous?.placeId !== itemPlaceId) {
        setOwnedPlaces((current) =>
          current.map((place) => {
            if (place.id === previous?.placeId) {
              return {
                ...place,
                assetCount: Math.max(0, place.assetCount - 1),
                progress:
                  place.assetCount <= 1
                    ? 0
                    : Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round(
                            (place.progress * place.assetCount -
                              (previous?.readiness ?? 0)) /
                              (place.assetCount - 1),
                          ),
                        ),
                      ),
                proofGaps: previous?.needsProof
                  ? Math.max(0, place.proofGaps - 1)
                  : place.proofGaps,
                documents: Math.max(
                  0,
                  place.documents -
                    (previousCategory === "Document" ? 1 : 0),
                ),
              };
            }
            if (place.id === itemPlaceId) {
              return {
                ...place,
                assetCount: place.assetCount + 1,
                progress: Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(
                      (place.progress * place.assetCount +
                        nextAssetReadiness) /
                        (place.assetCount + 1),
                    ),
                  ),
                ),
                proofGaps: nextNeedsProof
                  ? place.proofGaps + 1
                  : place.proofGaps,
                documents:
                  place.documents +
                  (itemCategory === "Document" ? 1 : 0),
              };
            }
            return place;
          }),
        );
        setPlaces((current) =>
          current.map((place) => {
            if (
              previous?.regionId &&
              previous.regionId !== nextPlace?.regionId &&
              place.id === previous.regionId
            ) {
              return { ...place, count: Math.max(0, place.count - 1) };
            }
            if (
              nextPlace?.regionId &&
              previous?.regionId !== nextPlace.regionId &&
              place.id === nextPlace.regionId
            ) {
              return { ...place, count: place.count + 1 };
            }
            return place;
          }),
        );
      }
      if (
        previous?.placeId === itemPlaceId &&
        previousCategory !== itemCategory &&
        itemPlaceId
      ) {
        setOwnedPlaces((current) =>
          current.map((place) =>
            place.id === itemPlaceId
              ? {
                  ...place,
                  documents: Math.max(
                    0,
                    place.documents +
                      (itemCategory === "Document" ? 1 : 0) -
                      (previousCategory === "Document" ? 1 : 0),
                  ),
                  proofGaps: Math.max(
                    0,
                    place.proofGaps +
                      (nextNeedsProof ? 1 : 0) -
                      (previous?.needsProof ? 1 : 0),
                  ),
                }
              : place,
          ),
        );
      }
      if (
        previous?.placeId === itemPlaceId &&
        itemPlaceId &&
        readinessGain !== 0
      ) {
        setOwnedPlaces((current) =>
          current.map((place) =>
            place.id === itemPlaceId && place.assetCount > 0
              ? {
                  ...place,
                  progress: Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(
                        (place.progress * place.assetCount -
                          (previous?.readiness ?? 0) +
                          nextAssetReadiness) /
                          place.assetCount,
                      ),
                    ),
                  ),
                }
              : place,
          ),
        );
      }
      if (readinessGain !== 0) {
        setPortfolioReadiness((current) =>
          Number(
            Math.max(
              0,
              Math.min(
                100,
                current + readinessGain / Math.max(1, portfolioTotal),
              ),
            ).toFixed(1),
          ),
        );
      }
    } else {
      const normalizedName = itemName.trim() || "Untitled asset";
      const place = ownedPlaces.find(
        (candidate) => candidate.id === itemPlaceId,
      );
      const nextLocationStatus: LocationStatus = !itemPlaceId
        ? "unknown"
        : place?.hasRooms
          ? itemRoomId || itemLocationDetail.trim()
            ? "known"
            : "needs-detail"
          : itemLocationDetail.trim()
            ? "known"
            : "needs-detail";
      const nextReadiness = Math.min(
        82,
        28 +
          (itemPlaceId ? 8 : 0) +
          (nextLocationStatus === "known"
            ? 12
            : nextLocationStatus === "needs-detail"
              ? 4
              : 0) +
          (itemValue.trim() ? 10 : 0) +
          (itemReference.trim() ? 8 : 0),
      );
      setAssetRecords((current) => [
        {
          id: createEntityId(
            normalizedName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "") || "asset",
          ),
          name: normalizedName,
          meta: `${itemCategory} · ${
            place?.name ?? "Location needed"
          }`,
          value: itemValue.trim() || "Value not set",
          icon: iconForCategory(itemCategory),
          accent: itemPlaceId ? "violet" : "amber",
          regionId: place?.regionId,
          placeId: itemPlaceId ?? undefined,
          roomId: place?.hasRooms
            ? itemRoomId && itemRoomId !== "place-level"
              ? itemRoomId
              : undefined
            : undefined,
          locationStatus: nextLocationStatus,
          locationDetail:
            itemLocationDetail.trim() ||
            (itemRoomId && itemRoomId !== "place-level"
              ? rooms.find((room) => room.id === itemRoomId)?.name
              : undefined),
          reference: itemReference.trim() || undefined,
          proofCount: 0,
          pendingProofCount: 0,
          proofRecords: [],
          requiredProofTypes: defaultProofRequirements(itemCategory),
          needsProof: true,
          readiness: nextReadiness,
          status:
            nextLocationStatus === "known"
              ? "Add proof to complete this passport"
              : nextLocationStatus === "needs-detail"
                ? "Add an address, room, shelf or box"
                : "Location needs confirmation",
        },
        ...current,
      ]);
      setPortfolioReadiness((current) =>
        Number(
          (
            (current * portfolioTotal + nextReadiness) /
            (portfolioTotal + 1)
          ).toFixed(1),
        ),
      );
      setPortfolioTotal((current) => current + 1);
      if (itemPlaceId) {
        setOwnedPlaces((current) =>
          current.map((candidate) =>
            candidate.id === itemPlaceId
              ? {
                  ...candidate,
                  assetCount: candidate.assetCount + 1,
                  progress: Math.round(
                    (candidate.progress * candidate.assetCount +
                      nextReadiness) /
                      (candidate.assetCount + 1),
                  ),
                  proofGaps: candidate.proofGaps + 1,
                  documents:
                    candidate.documents +
                    (itemCategory === "Document" ? 1 : 0),
                }
              : candidate,
          ),
        );
        setPlaces((current) =>
          current.map((candidate) =>
            candidate.id === place?.regionId
              ? {
                  ...candidate,
                  count: candidate.count + 1,
                }
              : candidate,
          ),
        );
      }
    }
    setCaptureStage("success");
  };

  const verifyProof = (targetAssetId: string, proofId: string) => {
    if (verifyingProofIdsRef.current.has(proofId)) return;
    const targetAsset = assetRecords.find(
      (asset) => asset.id === targetAssetId,
    );
    const targetProof = targetAsset?.proofRecords.find(
      (proof) => proof.id === proofId,
    );
    if (!targetAsset || !targetProof || targetProof.status !== "pending") {
      return;
    }
    verifyingProofIdsRef.current.add(proofId);

    const satisfiesRequirement =
      targetAsset.requiredProofTypes.includes(targetProof.type);
    const remainingRequirements = satisfiesRequirement
      ? targetAsset.requiredProofTypes.filter(
          (type) => type !== targetProof.type,
        )
      : targetAsset.requiredProofTypes;
    const clearsGap =
      targetAsset.needsProof &&
      satisfiesRequirement &&
      remainingRequirements.length === 0;
    const readinessGain = satisfiesRequirement
      ? clearsGap
        ? 5
        : 3
      : 1;
    setAssetRecords((current) =>
      current.map((asset) =>
        asset.id === targetAssetId
          ? {
              ...asset,
              proofRecords: asset.proofRecords.map((proof) =>
                proof.id === proofId
                  ? { ...proof, status: "verified" as const }
                  : proof,
              ),
              pendingProofCount: Math.max(
                0,
                asset.pendingProofCount - 1,
              ),
              requiredProofTypes: remainingRequirements,
              needsProof: remainingRequirements.length > 0,
              readiness: Math.min(
                100,
                asset.readiness + readinessGain,
              ),
              status: satisfiesRequirement
                ? remainingRequirements.length
                  ? `${remainingRequirements.join(", ")} still needed`
                  : `${targetProof.type} verified today`
                : `${targetProof.type} verified · required proof still due`,
            }
          : asset,
      ),
    );

    if (clearsGap && targetAsset.placeId) {
      setOwnedPlaces((current) =>
        current.map((place) =>
          place.id === targetAsset.placeId
            ? {
                ...place,
                proofGaps: Math.max(0, place.proofGaps - 1),
                progress:
                  place.assetCount > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round(
                            (place.progress * place.assetCount -
                              targetAsset.readiness +
                              Math.min(
                                100,
                                targetAsset.readiness + readinessGain,
                              )) /
                              place.assetCount,
                          ),
                        ),
                      )
                    : place.progress,
              }
            : place,
        ),
      );
    }
    if (clearsGap && targetAsset.regionId) {
      setPlaces((current) =>
        current.map((place) =>
          place.id === targetAsset.regionId
            ? {
                ...place,
                progress: Math.min(100, place.progress + 1),
              }
            : place,
        ),
      );
    }
    setPortfolioReadiness((current) =>
      Number(
        Math.min(
          100,
          current + readinessGain / Math.max(1, portfolioTotal),
        ).toFixed(1),
      ),
    );
    setToast(
      satisfiesRequirement
        ? `${targetProof.type} verified`
        : `${targetProof.type} saved; required proof still due`,
    );
  };

  const finishCapture = () => {
    const nextCreatedPlaceId = createdPlaceId;
    cancelCaptureReset();
    keyboard.hide();
    setCaptureOpen(false);
    setToast(
      captureIntent === "place"
        ? `${placeName.trim() || "Place"} added to your private map`
        : captureIntent === "room"
          ? `8 new records added to ${
              rooms.find((room) => room.id === selectedRoom)?.name ??
              "your space"
            }`
        : captureIntent === "proof"
          ? `${selectedProofType ?? "Evidence"} added for review`
          : captureAssetId
            ? "Asset passport updated"
            : "Asset passport saved",
    );
    captureResetTimerRef.current = window.setTimeout(() => {
      captureResetTimerRef.current = null;
      setCaptureStage("menu");
      setCaptureAssetId(null);
      setCapturePlaceId(null);
      setSelectedProofType(null);
      setCreatedPlaceId(null);
      if (captureIntent === "place" && nextCreatedPlaceId) {
        openOwnedPlace(nextCreatedPlaceId);
      }
    }, 220);
  };

  const captureTitle =
    captureStage === "menu"
      ? "Capture evidence"
      : captureStage === "room"
        ? "Choose a room"
        : captureStage === "item"
          ? captureAssetId
            ? "Update asset"
            : "Add an asset"
        : captureStage === "place"
          ? "Add a place"
        : captureStage === "proof"
          ? "Add proof"
        : captureStage === "scanning"
          ? "Scanning room"
          : captureStage === "review"
            ? "Review capture"
            : "Saved securely";

  const screenKey = activeAsset
    ? `asset-${activeAsset.id}`
    : activeRoom
      ? `room-${activeRoom.id}`
      : activePlace
        ? `place-${activePlace.id}`
        : activeTab;
  const isDark =
    !hasDetail && (activeTab === "home" || activeTab === "vault");

  return (
    <div
      ref={appRootRef}
      className={`continuity-app ${isDark ? "theme-dark" : "theme-light"}`}
      data-testid="continuity-app"
    >
      <MobileScroll className="app-screen">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={screenKey}
            className="screen-transition"
            initial={{ opacity: 0, x: hasDetail ? 18 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeAsset ? (
              <AssetDetail
                asset={activeAsset}
                onBack={() =>
                  goBack(
                    () => setAssetId(null),
                    routeUrl({
                      tab: activeTab,
                      placeId: openPlaceId,
                      nextRoomId: roomId,
                    }),
                  )
                }
                onCapture={() => startProofCapture(activeAsset)}
                onEdit={() => startItemCapture(activeAsset)}
                onProofOpen={() => setProofListAssetId(activeAsset.id)}
                onNotify={setToast}
              />
            ) : activeRoom ? (
              <RoomDetail
                room={activeRoom}
                placeName={activePlace?.name ?? activePrimaryPlace.name}
                assets={assetRecords.filter(
                  (asset) =>
                    asset.placeId ===
                    (activePlace?.id ?? activePrimaryPlace.id),
                )}
                onBack={() =>
                  goBack(
                    () => setRoomId(null),
                    routeUrl({
                      tab: "home",
                      placeId: openPlaceId ?? "west-bay-home",
                    }),
                  )
                }
                onCapture={() => beginCapture(activeRoom.id)}
                onAssetOpen={openAsset}
                onNotify={setToast}
              />
            ) : activePlace ? (
              <PlaceDetail
                place={activePlace}
                rooms={activePlace.hasRooms ? rooms : []}
                assets={assetRecords.filter(
                  (asset) => asset.placeId === activePlace.id,
                )}
                onBack={() =>
                  goBack(
                    () => setOpenPlaceId(null),
                    routeUrl({ tab: "home" }),
                  )
                }
                onRoomOpen={(nextRoomId) =>
                  openRoom(nextRoomId, activePlace.id)
                }
                onAssetOpen={openAsset}
                onNotify={setToast}
                onCapture={() =>
                  activePlace.hasRooms
                    ? beginCapture()
                    : startItemCapture(undefined, activePlace.id)
                }
              />
            ) : activeTab === "home" ? (
              <HomeScreen
                mode={worldMode}
                places={places}
                ownedPlaces={ownedPlaces}
                portfolioTotal={portfolioTotal}
                portfolioReadiness={portfolioReadiness}
                placeTotal={placeTotal}
                locationNeededCount={locationNeededCount}
                selectedPlaceId={selectedPlaceId}
                attentionTitle={homeAttention.title}
                attentionMeta={homeAttention.meta}
                attentionCta={homeAttention.cta}
                onModeChange={setWorldMode}
                onPlaceSelect={setSelectedPlaceId}
                onPlaceOpen={() =>
                  openOwnedPlace(activeRegion.primaryPlaceId)
                }
                onOwnedPlaceOpen={openOwnedPlace}
                onNotify={setToast}
                onSearch={() => {
                  setAssetsInitialFilter("All");
                  navigate("assets");
                }}
                onContinue={() => {
                  if (
                    homeAttention.kind === "review-room" &&
                    lastCompletedRoomId
                  ) {
                    const reviewedRoomId = lastCompletedRoomId;
                    const reviewedPlaceId =
                      lastCompletedRoomPlaceId ?? activePrimaryPlace.id;
                    setLastCompletedRoomId(null);
                    setLastCompletedRoomPlaceId(null);
                    openRoom(reviewedRoomId, reviewedPlaceId);
                  } else if (homeAttention.kind === "scan-room") {
                    beginCapture("study");
                  } else if (homeAttention.kind === "location") {
                    startItemCapture(homeAttention.asset);
                  } else if (homeAttention.kind === "proof") {
                    startProofCapture(homeAttention.asset);
                  } else if (homeAttention.kind === "verify-proof") {
                    setProofListAssetId(homeAttention.asset.id);
                  } else {
                    openOwnedPlace(activeRegion.primaryPlaceId);
                  }
                }}
                onLocationNeeded={() => {
                  setToast(
                    `Showing ${locationNeededCount} assets that need a location`,
                  );
                  setAssetsInitialFilter("Location needed");
                  navigate("assets", true);
                }}
              />
            ) : activeTab === "assets" ? (
              <SearchScreen
                assets={assetRecords}
                portfolioTotal={portfolioTotal}
                initialFilter={assetsInitialFilter}
                onResultOpen={openAsset}
                onAddItem={() =>
                  startItemCapture(
                    undefined,
                    activeRegion.primaryPlaceId,
                  )
                }
              />
            ) : activeTab === "family" ? (
              <FamilyScreen onNotify={setToast} />
            ) : (
              <VaultScreen onNotify={setToast} />
            )}
          </motion.main>
        </AnimatePresence>
      </MobileScroll>

      {!hasDetail && activeTab === "home" ? (
        <motion.button
          className="capture-fab"
          data-testid="capture-fab"
          type="button"
          onClick={() => beginCapture()}
          whileTap={{ scale: 0.96 }}
          aria-label="Capture new evidence"
        >
          <PhCamera weight="regular" />
          <span className="sr-only">Capture</span>
        </motion.button>
      ) : null}

      {!hasDetail ? (
        <BottomNavigation
          activeTab={activeTab}
          dark={isDark}
          onNavigate={navigate}
        />
      ) : null}

      <AnimatePresence>
        {onboardingOpen ? (
          <FirstRunGuide
            step={onboardingStep}
            onStepChange={setOnboardingStep}
            onExplore={() => finishOnboarding("explore")}
            onCreatePlace={() => finishOnboarding("place")}
          />
        ) : null}
      </AnimatePresence>

      <BottomSheet
        open={captureOpen}
        onOpenChange={(open) => {
          if (open) setCaptureOpen(true);
          else closeCapture();
        }}
        title={captureTitle}
        description={
          captureStage === "menu"
            ? "A guided record takes less than two minutes."
            : captureStage === "item"
              ? "Create a useful passport with only the essentials."
            : captureStage === "place"
              ? "Create the location that will organize its assets and records."
            : captureStage === "proof"
              ? "Choose the evidence you are adding."
            : undefined
        }
        snap={
          captureStage === "item"
            ? keyboardHeight > 0
              ? 0.76
              : 0.86
            : captureStage === "review" ||
                captureStage === "place" ||
                captureStage === "menu"
              ? 0.76
              : 0.68
        }
      >
        <CaptureFlow
          stage={captureStage}
          intent={captureIntent}
          rooms={rooms}
          canScanRooms={
            (capturePlaceId
              ? ownedPlaces.find((place) => place.id === capturePlaceId)
                  ?.hasRooms
              : activePlace?.hasRooms) ?? activePrimaryPlace.hasRooms
          }
          selectedRoom={selectedRoom}
          progress={scanProgress}
          itemName={itemName}
          itemCategory={itemCategory}
          itemPlaceId={itemPlaceId}
          itemRoomId={itemRoomId}
          itemValue={itemValue}
          itemReference={itemReference}
          itemLocationDetail={itemLocationDetail}
          placeName={placeName}
          placeKind={placeKind}
          placeRegionId={placeRegionId}
          places={ownedPlaces}
          regions={CITY_CATALOG}
          selectedProofType={selectedProofType}
          onIntentChange={setCaptureIntent}
          onStartItem={() =>
            startItemCapture(
              undefined,
              activeRegion.primaryPlaceId,
            )
          }
          onStartPlace={startPlaceCapture}
          onItemNameChange={setItemName}
          onItemCategoryChange={setItemCategory}
          onItemPlaceChange={(nextPlaceId) => {
            if (nextPlaceId !== itemPlaceId) {
              setItemRoomId(null);
              setItemLocationDetail("");
            }
            setItemPlaceId(nextPlaceId);
          }}
          onItemRoomChange={setItemRoomId}
          onItemValueChange={setItemValue}
          onItemReferenceChange={setItemReference}
          onItemLocationDetailChange={setItemLocationDetail}
          onPlaceNameChange={setPlaceName}
          onPlaceKindChange={setPlaceKind}
          onPlaceRegionChange={setPlaceRegionId}
          onProofTypeChange={setSelectedProofType}
          onSelectRoom={setSelectedRoom}
          onStageChange={setCaptureStage}
          onSave={saveCapture}
          onDone={finishCapture}
        />
      </BottomSheet>

      <BottomSheet
        open={Boolean(proofListAsset)}
        onOpenChange={(open) => {
          if (!open) setProofListAssetId(null);
        }}
        title={proofListAsset ? `${proofListAsset.name} proof` : "Proof"}
        description="Pending evidence only improves readiness after you verify it."
        snap={0.72}
      >
        {proofListAsset ? (
          <ProofRecordList
            asset={proofListAsset}
            onVerify={(proofId) =>
              verifyProof(proofListAsset.id, proofId)
            }
            onAdd={() => {
              setProofListAssetId(null);
              startProofCapture(proofListAsset);
            }}
          />
        ) : null}
      </BottomSheet>

      <AnimatePresence>
        {toast ? (
          <motion.div
            className="app-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <CheckCircledIcon />
            <span>{toast}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FirstRunGuide({
  step,
  onStepChange,
  onExplore,
  onCreatePlace,
}: {
  step: number;
  onStepChange: (step: number) => void;
  onExplore: () => void;
  onCreatePlace: () => void;
}) {
  const slides = [
    {
      eyebrow: "Your living asset map",
      title: "Begin with one place",
      copy: "Heldat organizes every home, property and archive by where it belongs. The sample map shows the finished idea.",
      icon: PhGlobe,
    },
    {
      eyebrow: "A calm first step",
      title: "Capture one space at a time",
      copy: "Start with one important item, or use a guided room scan where rooms are set up. Stop anytime and improve the record over time.",
      icon: PhCamera,
    },
    {
      eyebrow: "Useful when it matters",
      title: "Add proof to important assets",
      copy: "Receipts, service records and current photos turn a memory into a private asset passport your family can rely on.",
      icon: PhShieldCheck,
    },
  ];
  const activeSlide = slides[step] ?? slides[0];
  const SlideIcon = activeSlide.icon;
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    const primary =
      dialog.querySelector<HTMLButtonElement>(".first-run-primary");
    (primary ?? focusable[0])?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExplore();
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
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

    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [onExplore, step]);

  return (
    <motion.div
      className="first-run-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        ref={dialogRef}
        className="first-run-card"
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        <header>
          <span>
            {step + 1} of {slides.length}
          </span>
          <button type="button" onClick={onExplore}>
            Explore sample
          </button>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className="first-run-slide"
            aria-live="polite"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <span className="first-run-visual">
              <SlideIcon weight="duotone" />
            </span>
            <p>{activeSlide.eyebrow}</p>
            <h2 id="first-run-title">{activeSlide.title}</h2>
            <span>{activeSlide.copy}</span>
          </motion.div>
        </AnimatePresence>
        <div className="first-run-progress" aria-hidden="true">
          {slides.map((slide, index) => (
            <i
              key={slide.title}
              className={index === step ? "is-active" : ""}
            />
          ))}
        </div>
        <div className="first-run-actions">
          {step < slides.length - 1 ? (
            <button
              className="first-run-primary"
              type="button"
              onClick={() => onStepChange(step + 1)}
            >
              Next
              <ArrowRightIcon />
            </button>
          ) : (
            <button
              className="first-run-primary"
              type="button"
              onClick={onExplore}
            >
              Open my map
              <ArrowRightIcon />
            </button>
          )}
          <button
            className="first-run-secondary"
            type="button"
            onClick={onCreatePlace}
          >
            <PhMapPin weight="duotone" />
            Create my first place
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function HomeScreen({
  mode,
  places,
  ownedPlaces,
  portfolioTotal,
  portfolioReadiness,
  placeTotal,
  locationNeededCount,
  selectedPlaceId,
  attentionTitle,
  attentionMeta,
  attentionCta,
  onModeChange,
  onPlaceSelect,
  onPlaceOpen,
  onOwnedPlaceOpen,
  onNotify,
  onSearch,
  onContinue,
  onLocationNeeded,
}: {
  mode: WorldMode;
  places: PlacePoint[];
  ownedPlaces: OwnedPlace[];
  portfolioTotal: number;
  portfolioReadiness: number;
  placeTotal: number;
  locationNeededCount: number;
  selectedPlaceId: string;
  attentionTitle: string;
  attentionMeta: string;
  attentionCta: string;
  onModeChange: (mode: WorldMode) => void;
  onPlaceSelect: (placeId: string) => void;
  onPlaceOpen: () => void;
  onOwnedPlaceOpen: (placeId: string) => void;
  onNotify: (message: string) => void;
  onSearch: () => void;
  onContinue: () => void;
  onLocationNeeded: () => void;
}) {
  const selectedPlace =
    places.find((place) => place.id === selectedPlaceId) ?? places[0];
  const selectedOwnedPlace =
    ownedPlaces.find(
      (place) => place.id === selectedPlace.primaryPlaceId,
    ) ?? ownedPlaces[0];

  return (
    <section className="screen-shell home-screen" data-testid="home-screen">
      <header className="world-header">
        <button
          className="world-circle-button"
          type="button"
          onClick={() => onNotify("Profile and household settings opened")}
          aria-label="Open profile"
        >
          <PhUser weight="regular" />
        </button>
        <div className="world-title">
          <h1>Everything you own</h1>
          <p>One living map</p>
        </div>
        <div className="world-privacy">
          <button
            type="button"
            onClick={() =>
              onNotify("Local prototype · production encryption planned")
            }
            aria-label="Prototype privacy details"
          >
            <PhLockKey weight="regular" />
          </button>
          <span>Private prototype</span>
        </div>
      </header>

      <p className="world-summary">
        <span>{portfolioTotal} assets</span>
        <i>·</i>
        <span>{placeTotal} places</span>
        <i>·</i>
        <strong>{Math.round(portfolioReadiness)}%</strong>
        <span>documented</span>
      </p>

      <div className="home-globe-wrap">
        <div className="globe-toolbar">
          <button
            className="world-circle-button world-search-button"
            type="button"
            onClick={onSearch}
            aria-label="Search assets or places"
          >
            <PhSearch weight="regular" />
          </button>
          <div
            className="world-view-switch"
            role="tablist"
            aria-label="World view"
          >
            <button
              className={mode === "globe" ? "is-active" : ""}
              data-testid="world-mode-globe"
              type="button"
              role="tab"
              aria-selected={mode === "globe"}
              onClick={() => onModeChange("globe")}
              aria-label="Globe view"
            >
              <PhGlobe weight={mode === "globe" ? "fill" : "regular"} />
            </button>
            <button
              className={mode === "list" ? "is-active" : ""}
              data-testid="world-mode-list"
              type="button"
              role="tab"
              aria-selected={mode === "list"}
              onClick={() => onModeChange("list")}
              aria-label="List view"
            >
              <PhList weight="bold" />
            </button>
          </div>
        </div>

        {mode === "globe" ? (
          <div className="interactive-world">
            <span className="sr-only">
              To browse every owned place with a keyboard or screen reader,
              choose List view.
            </span>
            <AssetGlobe
              places={places}
              selectedId={selectedPlaceId}
              onUnavailable={() => onModeChange("list")}
            />
            <div className="globe-place-labels" aria-label="Owned locations">
              {places.map((place) => (
                <span
                  key={place.id}
                  className={`globe-place-label label-${place.id} ${
                    selectedPlaceId === place.id ? "is-selected" : ""
                  }`}
                  aria-hidden="true"
                  onClick={() => onPlaceSelect(place.id)}
                  style={
                    {
                      positionAnchor: `--cobe-${place.id}`,
                      "--marker-visibility": `var(--cobe-visible-${place.id}, 0)`,
                      opacity: "var(--marker-visibility)",
                    } as React.CSSProperties
                  }
                >
                  <span>{place.name}</span>
                  <strong>{place.count}</strong>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="world-location-list" data-testid="world-list">
            {ownedPlaces.map((place) => (
              <button
                key={place.id}
                className={
                  selectedPlaceId === place.regionId
                    ? "is-selected"
                    : ""
                }
                type="button"
                onClick={() => {
                  onPlaceSelect(place.regionId);
                  onOwnedPlaceOpen(place.id);
                }}
              >
                <span className="location-list-icon">
                  <PhMapPin weight="duotone" />
                </span>
                <span>
                  <strong>{place.name}</strong>
                  <small>
                    {place.regionName} · {place.kind}
                  </small>
                </span>
                <span className="location-list-value">
                  <strong>{place.assetCount}</strong>
                  <small>assets</small>
                </span>
                <PhCaretRight />
              </button>
            ))}
          </div>
        )}

        <span className="world-selection-status sr-only" aria-live="polite">
          {selectedPlace.name} selected, {selectedPlace.count} assets
        </span>
      </div>

      <button
        className="home-place-card"
        data-testid="open-selected-place"
        type="button"
        onClick={onPlaceOpen}
      >
        {selectedOwnedPlace.image ? (
          <img
            src={selectedOwnedPlace.image}
            alt={`${selectedOwnedPlace.name} at blue hour`}
            draggable={false}
          />
        ) : (
          <span className="home-place-fallback">
            <PhMapPin weight="duotone" />
          </span>
        )}
        <span className="home-place-copy">
          <strong>{selectedOwnedPlace.name}</strong>
          <span>
            <PhCube weight="duotone" />
            {selectedOwnedPlace.assetCount} assets
          </span>
          <span>
            <i
              className="mini-readiness-ring"
              style={
                {
                  "--readiness": `${selectedOwnedPlace.progress * 3.6}deg`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
            {selectedOwnedPlace.progress}% documented
          </span>
        </span>
        <span className="home-place-open" aria-hidden="true">
          <PhCaretRight weight="bold" />
        </span>
      </button>

      <article className="home-attention-card">
        <div className="attention-heading">
          <span className="attention-shield">
            <ShieldDocumentGlyph />
          </span>
          <div>
            <p>What needs attention</p>
            <h2>{attentionTitle}</h2>
            <span>{attentionMeta}</span>
          </div>
        </div>
        <button
          className="attention-action"
          data-testid="home-continue-capture"
          type="button"
          onClick={onContinue}
        >
          <PhTarget weight="regular" />
          <span>{attentionCta}</span>
        </button>
        <button
          className="location-needed-action"
          type="button"
          onClick={onLocationNeeded}
        >
          <PhMapPin weight="regular" />
          <span>
            Location needed · {locationNeededCount}{" "}
            {locationNeededCount === 1 ? "item" : "items"}
          </span>
          <PhCaretRight weight="bold" />
        </button>
      </article>
    </section>
  );
}

const TAU = Math.PI * 2;

function locationToAngles(lat: number, lng: number): [number, number] {
  return [
    Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2),
    (lat * Math.PI) / 180,
  ];
}

function shortestAngle(from: number, to: number) {
  return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function AssetGlobe({
  places,
  selectedId,
  onUnavailable,
}: {
  places: PlacePoint[];
  selectedId: string;
  onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const frameRef = useRef<number | null>(null);
  const invalidateRef = useRef<() => void>(() => {});
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    axis: "pending" | "horizontal";
  } | null>(null);
  const initial = locationToAngles(25.2854, 51.531);
  const currentRef = useRef({ phi: initial[0], theta: initial[1] });
  const focusRef = useRef<[number, number] | null>(initial);
  const [webglAvailable, setWebglAvailable] = useState(true);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  const markers = useMemo<Marker[]>(
    () =>
      places.map((place) => ({
        id: place.id,
        location: [place.lat, place.lng],
        size: Math.min(
          0.09,
          0.028 + Math.log2(place.count + 1) * 0.008,
        ),
        color:
          place.id === selectedId
            ? [0.55, 0.4, 1]
            : [0.35, 0.82, 1],
      })),
    [places, selectedId],
  );

  const arcs = useMemo<Arc[]>(
    () => [
      {
        id: "doha-london",
        from: [25.2854, 51.531],
        to: [51.5074, -0.1278],
        color: [0.55, 0.35, 1],
      },
      {
        id: "doha-dubai",
        from: [25.2854, 51.531],
        to: [25.2048, 55.2708],
        color: [0.28, 0.74, 1],
      },
    ],
    [],
  );

  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    globeRef.current?.update({ markers, arcs });
  }, [arcs, markers]);

  useEffect(() => {
    const place = places.find((item) => item.id === selectedId);
    if (place) {
      focusRef.current = locationToAngles(place.lat, place.lng);
      invalidateRef.current();
    }
  }, [places, selectedId]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const measure = () => {
      const rect = host.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr: Math.min(2, window.devicePixelRatio || 1),
      };
    };

    const first = measure();
    let globe: Globe;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setWebglAvailable(false);
      unavailableRef.current();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    try {
      globe = createGlobe(canvas, {
        width: Math.round(first.width * first.dpr),
        height: Math.round(first.height * first.dpr),
        devicePixelRatio: first.dpr,
        phi: currentRef.current.phi,
        theta: currentRef.current.theta,
        dark: 1,
        diffuse: 1.45,
        mapSamples: 15000,
        mapBrightness: 6.8,
        mapBaseBrightness: 0.045,
        baseColor: [0.018, 0.04, 0.1],
        markerColor: [0.4, 0.78, 1],
        glowColor: [0.24, 0.54, 1],
        markers: markersRef.current,
        arcs,
        arcColor: [0.55, 0.35, 1],
        arcWidth: 0.45,
        arcHeight: 0.23,
        markerElevation: 0.04,
        scale: 1.13,
        opacity: 1,
        offset: [0, 18],
        context: { alpha: true, antialias: true },
      });
    } catch {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      setWebglAvailable(false);
      unavailableRef.current();
      return;
    }

    globeRef.current = globe;

    const resizeObserver = new ResizeObserver(() => {
      const next = measure();
      globe.update({
        width: Math.round(next.width * next.dpr),
        height: Math.round(next.height * next.dpr),
        devicePixelRatio: next.dpr,
      });
    });
    resizeObserver.observe(host);

    const motionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = motionQuery.matches;
    let destroyed = false;

    const render = () => {
      frameRef.current = null;
      if (destroyed || document.hidden) return;

      const current = currentRef.current;
      const target = focusRef.current;

      if (target) {
        if (reducedMotion) {
          current.phi = target[0];
          current.theta = target[1];
          focusRef.current = null;
        } else {
          const phiDistance = shortestAngle(current.phi, target[0]);
          const thetaDistance = target[1] - current.theta;
          current.phi += phiDistance * 0.085;
          current.theta += thetaDistance * 0.085;

          if (
            Math.abs(phiDistance) < 0.001 &&
            Math.abs(thetaDistance) < 0.001
          ) {
            focusRef.current = null;
          }
        }
      }

      globe.update({
        phi: current.phi,
        theta: current.theta,
      });

      if (focusRef.current) {
        frameRef.current = requestAnimationFrame(render);
      }
    };

    const start = () => {
      if (frameRef.current === null && !document.hidden) {
        frameRef.current = requestAnimationFrame(render);
      }
    };
    invalidateRef.current = start;

    const handleVisibility = () => {
      if (document.hidden && frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      } else if (focusRef.current) {
        start();
      }
    };

    const handleMotion = () => {
      reducedMotion = motionQuery.matches;
      if (focusRef.current) start();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery.addEventListener("change", handleMotion);
    start();

    return () => {
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery.removeEventListener("change", handleMotion);

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      invalidateRef.current = () => {};
      if (globeRef.current === globe) globeRef.current = null;
      globe.destroy();
    };
  }, [arcs]);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      dragRef.current ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      axis: "pending",
    };
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;

    if (drag.axis === "pending") {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 8) return;
      if (Math.abs(totalY) > Math.abs(totalX)) {
        dragRef.current = null;
        return;
      }

      drag.axis = "horizontal";
      focusRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    currentRef.current.phi -= dx / 180;
    currentRef.current.theta = Math.max(
      -0.75,
      Math.min(0.75, currentRef.current.theta + dy / 240),
    );
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    globeRef.current?.update({
      phi: currentRef.current.phi,
      theta: currentRef.current.theta,
    });
  };

  const endPointer = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      event.pointerType === "mouse" &&
      dragRef.current?.axis === "pending"
    ) {
      dragRef.current = null;
    }
  };

  if (!webglAvailable) {
    return (
      <div
        className="globe-fallback"
        role="img"
        aria-label="Asset globe unavailable"
      >
        <PhGlobe weight="duotone" />
        <span>Choose a location from List view.</span>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="asset-globe-stage">
      <canvas
        ref={canvasRef}
        className="asset-globe-canvas"
        aria-hidden="true"
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={handlePointerLeave}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
      />
    </div>
  );
}

function PlaceDetail({
  place,
  rooms,
  assets,
  onBack,
  onRoomOpen,
  onAssetOpen,
  onNotify,
  onCapture,
}: {
  place: OwnedPlace;
  rooms: Room[];
  assets: AssetRecord[];
  onBack: () => void;
  onRoomOpen: (roomId: string) => void;
  onAssetOpen: (assetId: string) => void;
  onNotify: (message: string) => void;
  onCapture: () => void;
}) {
  const placeLevelAssets = assets.filter((asset) => !asset.roomId);
  const renderAssetRows = (records: AssetRecord[]) => (
    <div className="room-asset-list place-asset-list">
      {records.map((asset) => {
        const AssetIcon = asset.icon;
        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onAssetOpen(asset.id)}
          >
            <span className={`search-result-icon ${asset.accent}`}>
              <AssetIcon />
            </span>
            <span>
              <strong>{asset.name}</strong>
              <small>{asset.value}</small>
            </span>
            <ChevronRightIcon />
          </button>
        );
      })}
    </div>
  );

  return (
    <section
      className="screen-shell place-detail-screen"
      data-testid="place-detail"
    >
      <header className="detail-header">
        <button
          className="round-icon-button"
          type="button"
          onClick={onBack}
          aria-label="Back to your world"
        >
          <ArrowLeftIcon />
        </button>
        <span>Your world · {place.regionName}</span>
        <button
          className="round-icon-button"
          type="button"
          onClick={() => onNotify("Place settings opened")}
          aria-label="Place options"
        >
          <DotsHorizontalIcon />
        </button>
      </header>

      <article className="place-detail-hero">
        {place.image ? (
          <img
            src={place.image}
            alt={`${place.name} at blue hour`}
            draggable={false}
          />
        ) : (
          <span className="place-detail-placeholder">
            <PhMapPin weight="duotone" />
          </span>
        )}
        <div className="place-detail-shade" aria-hidden="true" />
        <div className="place-detail-copy">
          <span>
            <PhLockKey weight="regular" />
            Exact location protected
          </span>
          <h1>{place.name}</h1>
          <p>
            {place.kind} · {place.assetCount} assets · {place.proofGaps} need
            evidence
          </p>
        </div>
      </article>

      <div className="place-stat-grid">
        <article>
          <strong>{place.assetCount}</strong>
          <span>assets</span>
        </article>
        <article>
          <strong>{place.progress}%</strong>
          <span>documented</span>
        </article>
        <article>
          <strong>{place.documents}</strong>
          <span>documents</span>
        </article>
      </div>

      <div className="section-heading compact-heading">
        <h2>{rooms.length ? "Rooms & zones" : "Records in this place"}</h2>
        <button type="button" onClick={onCapture}>
          <PlusIcon /> Add
        </button>
      </div>

      {rooms.length ? (
        <>
          <div className="room-list">
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                onOpen={() => onRoomOpen(room.id)}
              />
            ))}
          </div>
          {placeLevelAssets.length ? (
            <>
              <div className="section-heading compact-heading place-assets-heading">
                <h2>Place-level assets</h2>
                <span>
                  {placeLevelAssets.length}{" "}
                  {placeLevelAssets.length === 1 ? "record" : "records"}
                </span>
              </div>
              {renderAssetRows(placeLevelAssets)}
            </>
          ) : null}
        </>
      ) : assets.length ? (
        renderAssetRows(assets)
      ) : (
        <button className="place-empty-action" type="button" onClick={onCapture}>
          <PhCamera weight="duotone" />
          <span>
            <strong>Start this place record</strong>
            <small>Capture an asset, document, or room</small>
          </span>
          <PhCaretRight weight="bold" />
        </button>
      )}

      <button
        className="detail-capture-button"
        type="button"
        onClick={onCapture}
      >
        <PhCamera weight="regular" />
        Continue capture
      </button>
    </section>
  );
}

function AssetDetail({
  asset,
  onBack,
  onCapture,
  onEdit,
  onProofOpen,
  onNotify,
}: {
  asset: AssetRecord;
  onBack: () => void;
  onCapture: () => void;
  onEdit: () => void;
  onProofOpen: () => void;
  onNotify: (message: string) => void;
}) {
  const Icon = asset.icon;
  return (
    <section
      className="screen-shell asset-detail-screen"
      data-testid="asset-detail"
    >
      <header className="detail-header">
        <button
          className="round-icon-button"
          type="button"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </button>
        <span>Asset passport</span>
        <button
          className="round-icon-button"
          type="button"
          onClick={() => onNotify("Asset actions opened")}
          aria-label="Asset options"
        >
          <DotsHorizontalIcon />
        </button>
      </header>

      <div className={`asset-passport-icon ${asset.accent}`}>
        <Icon />
      </div>
      <div className="asset-title-block">
        <p>{asset.meta}</p>
        <h1>{asset.name}</h1>
        <strong>{asset.value}</strong>
      </div>

      <article className="readiness-card asset-readiness-card">
        <div className="readiness-copy">
          <span>Continuity readiness</span>
          <strong>{asset.readiness}%</strong>
        </div>
        <div className="readiness-track">
          <span style={{ width: `${asset.readiness}%` }} />
        </div>
        <p>{asset.status}</p>
      </article>

      <div className="asset-fact-list">
        <button
          type="button"
          onClick={onEdit}
        >
          <PhMapPin weight="duotone" />
          <div>
            <span>Location</span>
            <strong>
              {asset.locationStatus === "known"
                ? `${asset.meta.split(" · ")[1] ?? "Private"}${
                    asset.locationDetail
                      ? ` · ${asset.locationDetail}`
                      : ""
                  }`
                : "Choose a location"}
            </strong>
          </div>
          <PhCaretRight weight="bold" />
        </button>
        <button type="button" onClick={onEdit}>
          <IdCardIcon />
          <div>
            <span>Reference</span>
            <strong>
              {asset.reference ?? "Add serial, deed or reference"}
            </strong>
          </div>
          <PhCaretRight weight="bold" />
        </button>
        <button
          type="button"
          onClick={onProofOpen}
        >
          <PhFileText weight="duotone" />
          <div>
            <span>Proof</span>
            <strong>
              {asset.proofCount} secure{" "}
              {asset.proofCount === 1 ? "record" : "records"}
              {asset.pendingProofCount
                ? ` · ${asset.pendingProofCount} pending`
                : ""}
              {asset.requiredProofTypes.length
                ? ` · ${asset.requiredProofTypes.join(", ")} due`
                : ""}
            </strong>
          </div>
          <PhCaretRight weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => onNotify("Asset access controls opened")}
        >
          <PhLockKey weight="duotone" />
          <div>
            <span>Access</span>
            <strong>Owner and co-owner</strong>
          </div>
          <PhCaretRight weight="bold" />
        </button>
      </div>

      <div className="asset-detail-actions">
        <button
          className="asset-edit-button"
          type="button"
          onClick={onEdit}
        >
          <GearIcon />
          Edit details
        </button>
        <button
          className="detail-capture-button"
          type="button"
          onClick={onCapture}
        >
          <PhCamera weight="regular" />
          Add proof
        </button>
      </div>
    </section>
  );
}

function ProofRecordList({
  asset,
  onVerify,
  onAdd,
}: {
  asset: AssetRecord;
  onVerify: (proofId: string) => void;
  onAdd: () => void;
}) {
  const historicalVerified = Math.max(
    0,
    asset.proofCount - asset.proofRecords.length,
  );
  const verifiedCount =
    historicalVerified +
    asset.proofRecords.filter((proof) => proof.status === "verified")
      .length;

  return (
    <div className="proof-records-sheet" data-testid="proof-records">
      <article className="proof-records-summary">
        <span>
          <PhShieldCheck weight="duotone" />
        </span>
        <div>
          <strong>
            {asset.proofCount} secure{" "}
            {asset.proofCount === 1 ? "record" : "records"}
          </strong>
          <p>
            {verifiedCount} verified · {asset.pendingProofCount} pending
          </p>
          {asset.requiredProofTypes.length ? (
            <p>Required next: {asset.requiredProofTypes.join(", ")}</p>
          ) : null}
        </div>
      </article>

      <div className="proof-record-list">
        {asset.proofRecords.map((proof) => {
          const ProofIcon =
            proof.type === "Current photo" ? CameraIcon : FileTextIcon;
          return (
            <article key={proof.id}>
              <span className="proof-record-icon">
                <ProofIcon />
              </span>
              <div>
                <strong>{proof.type}</strong>
                <small>
                  Added{" "}
                  {new Date(proof.addedAt).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
                </small>
              </div>
              {proof.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => onVerify(proof.id)}
                >
                  Verify
                </button>
              ) : (
                <span className="proof-verified-status">
                  <CheckIcon />
                  Verified
                </span>
              )}
            </article>
          );
        })}
        {asset.proofRecords.length === 0 ? (
          <div className="proof-record-empty">
            <PhFileText weight="duotone" />
            <span>
              Historical records are summarized here. New evidence will show
              its verification status.
            </span>
          </div>
        ) : null}
      </div>

      <button
        className="sheet-primary-button"
        type="button"
        onClick={onAdd}
      >
        <PlusIcon />
        Add more evidence
      </button>
    </div>
  );
}

function VaultScreen({
  onNotify,
}: {
  onNotify: (message: string) => void;
}) {
  return (
    <section className="screen-shell vault-screen" data-testid="vault-screen">
      <header className="vault-header">
        <div>
          <p>Security concept</p>
          <h1>Digital vault</h1>
        </div>
        <button
          type="button"
          onClick={() => onNotify("Vault security details opened")}
          aria-label="Vault security"
        >
          <PhFingerprint weight="duotone" />
        </button>
      </header>

      <article className="vault-status-card">
        <span>
          <PhShieldCheck weight="duotone" />
        </span>
        <div>
          <p>Recovery status</p>
          <h2>Your essential records are protected</h2>
          <span>19 digital assets · 2 trusted people</span>
        </div>
      </article>

      <div className="section-heading vault-heading">
        <h2>Protected collections</h2>
        <button type="button" onClick={() => onNotify("Vault is up to date")}>
          Synced
        </button>
      </div>

      <div className="vault-list">
        <button
          type="button"
          onClick={() => onNotify("Opening identity documents")}
        >
          <span className="vault-record-icon violet">
            <PhFingerprint weight="duotone" />
          </span>
          <span>
            <strong>Identity & recovery</strong>
            <small>6 protected records</small>
          </span>
          <PhCaretRight weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => onNotify("Opening cloud assets")}
        >
          <span className="vault-record-icon cyan">
            <PhCloud weight="duotone" />
          </span>
          <span>
            <strong>Digital assets</strong>
            <small>9 accounts · 2 domains</small>
          </span>
          <PhCaretRight weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => onNotify("Opening essential documents")}
        >
          <span className="vault-record-icon blue">
            <PhFileText weight="duotone" />
          </span>
          <span>
            <strong>Essential documents</strong>
            <small>4 verified files</small>
          </span>
          <PhCaretRight weight="bold" />
        </button>
      </div>
    </section>
  );
}

function TodayScreen({
  captureComplete,
  onCapture,
}: {
  captureComplete: boolean;
  onCapture: () => void;
}) {
  return (
    <section className="screen-shell today-screen" data-testid="today-screen">
      <header className="today-header">
        <button className="round-icon-button dark-icon-button" type="button" aria-label="Open profile">
          <PersonIcon />
        </button>
        <div className="today-date">
          <h1>Today</h1>
          <p>Friday, Jul 24, 2026</p>
        </div>
        <div className="privacy-lock" aria-label="Private and encrypted">
          <LockClosedIcon />
          <span>Private · encrypted</span>
        </div>
      </header>

      <div className="today-summary" aria-label="Task summary">
        <span className="summary-dot" />
        <span>1 priority</span>
        <span className="summary-divider">·</span>
        <span>{captureComplete ? "1 later" : "2 later"}</span>
      </div>

      <article className="priority-card">
        <div className="priority-orbit" aria-hidden="true" />
        <div className="priority-icon">
          <CheckCircledIcon />
        </div>
        <p className="eyebrow">Priority</p>
        <h2>Pearl apartment insurance</h2>
        <p className="priority-description">
          Policy review and proof of coverage.
        </p>
        <div className="due-row">
          <CalendarIcon />
          <div>
            <span>Due</span>
            <strong>Jul 31</strong>
          </div>
        </div>
        <button className="gradient-action" type="button">
          <ArrowRightIcon />
          <span>Review insurance</span>
        </button>
      </article>

      <section className="later-section">
        <h2>Later</h2>
        <div className="dark-list">
          <button className="dark-list-row" type="button">
            <span className="list-icon violet">
              <StopwatchIcon />
            </span>
            <span className="list-copy">
              <strong>GMT service record</strong>
              <small>Add proof of last service</small>
            </span>
            <ChevronRightIcon />
          </button>
          <button className="dark-list-row" type="button">
            <span className="list-icon cyan">
              {captureComplete ? <CheckCircledIcon /> : <FileTextIcon />}
            </span>
            <span className="list-copy">
              <strong>
                {captureComplete ? "Study evidence pack" : "Study proof"}
              </strong>
              <small>
                {captureComplete
                  ? "8 new records secured"
                  : "Gather receipts and documents"}
              </small>
            </span>
            {captureComplete ? (
              <span className="ready-label">Ready</span>
            ) : (
              <ChevronRightIcon />
            )}
          </button>
        </div>
      </section>

      <button className="today-capture-link" type="button" onClick={onCapture}>
        <CameraIcon />
        <span>Capture something else</span>
      </button>
    </section>
  );
}

function SpacesScreen({
  mode,
  rooms,
  onModeChange,
  onRoomOpen,
  onCapture,
}: {
  mode: SpaceMode;
  rooms: Room[];
  onModeChange: (mode: SpaceMode) => void;
  onRoomOpen: (roomId: string) => void;
  onCapture: () => void;
}) {
  const homeProgress = rooms.some((room) => room.captured === "Today") ? 81 : 78;

  return (
    <section className="screen-shell spaces-screen" data-testid="spaces-screen">
      <header className="spaces-header">
        <h1>My spaces</h1>
        <button className="avatar-button" type="button" aria-label="Open profile">
          AH
        </button>
      </header>

      <div className="segmented-control" role="tablist" aria-label="Space view">
        {(["places", "assets"] as SpaceMode[]).map((item) => (
          <button
            key={item}
            className={mode === item ? "is-active" : ""}
            data-testid={`space-mode-${item}`}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => onModeChange(item)}
          >
            {item === "places" ? "Places" : "Assets"}
          </button>
        ))}
      </div>

      {mode === "places" ? (
        <>
          <article className="space-hero">
            <img
              src="/assets/west-bay-blueprint.png"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <div className="hero-shade" aria-hidden="true" />
            <div className="hero-content">
              <span className="status-badge">
                <HomeIcon />
                Active
              </span>
              <div>
                <h2>West Bay Home</h2>
                <p>
                  <strong>{homeProgress}%</strong> documented
                </p>
              </div>
              <div
                className="documentation-progress"
                role="progressbar"
                aria-valuenow={homeProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${homeProgress}%` }} />
              </div>
              <button className="hero-primary-action" type="button" onClick={onCapture}>
                <Crosshair2Icon />
                Continue capture
              </button>
              <button className="hero-secondary-action" type="button" onClick={onCapture}>
                <CameraIcon />
                Scan room
              </button>
            </div>
          </article>

          <div className="section-heading">
            <h2>Continue by room</h2>
            <span>
              <CalendarIcon />
              Jul 24, 2026
            </span>
          </div>

          <div className="room-list">
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                onOpen={() => onRoomOpen(room.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <AssetOverview />
      )}
    </section>
  );
}

function AssetOverview() {
  const groups = [
    {
      name: "Property",
      detail: "2 places · 31 documents",
      value: "QAR 4.8M",
      icon: HomeIcon,
      accent: "blue",
    },
    {
      name: "Watches",
      detail: "8 pieces · 7 verified",
      value: "QAR 214K",
      icon: StopwatchIcon,
      accent: "violet",
    },
    {
      name: "Collectibles",
      detail: "24 items · 11 stories",
      value: "QAR 68K",
      icon: CubeIcon,
      accent: "cyan",
    },
    {
      name: "Documents",
      detail: "73 protected records",
      value: "92% ready",
      icon: FileTextIcon,
      accent: "amber",
    },
  ];

  return (
    <section className="asset-overview" data-testid="asset-overview">
      <article className="portfolio-card">
        <div className="portfolio-topline">
          <span>Household record</span>
          <button type="button" aria-label="Portfolio options">
            <DotsHorizontalIcon />
          </button>
        </div>
        <strong>QAR 5.1M</strong>
        <p>Documented value across 146 records</p>
        <div className="portfolio-readiness">
          <span>
            <CheckCircledIcon /> 82% continuity ready
          </span>
          <span>+6% this month</span>
        </div>
      </article>
      <div className="section-heading compact-heading">
        <h2>Asset groups</h2>
        <button type="button">
          <PlusIcon /> Add
        </button>
      </div>
      <div className="asset-group-list">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <button className="asset-group-row" key={group.name} type="button">
              <span className={`asset-group-icon ${group.accent}`}>
                <Icon />
              </span>
              <span>
                <strong>{group.name}</strong>
                <small>{group.detail}</small>
              </span>
              <span className="asset-group-value">{group.value}</span>
              <ChevronRightIcon />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RoomRow({ room, onOpen }: { room: Room; onOpen: () => void }) {
  const Icon = room.icon;
  return (
    <button
      className="room-row"
      data-testid={`room-${room.id}`}
      type="button"
      onClick={onOpen}
    >
      <span className="room-icon">
        <Icon />
      </span>
      <span className="room-copy">
        <strong>{room.name}</strong>
        <small>Last captured {room.captured}</small>
      </span>
      <span className="room-progress">{room.progress}%</span>
      <ChevronRightIcon className="room-chevron" />
    </button>
  );
}

function RoomDetail({
  room,
  placeName,
  assets,
  onBack,
  onCapture,
  onAssetOpen,
  onNotify,
}: {
  room: Room;
  placeName: string;
  assets: AssetRecord[];
  onBack: () => void;
  onCapture: () => void;
  onAssetOpen: (assetId: string) => void;
  onNotify: (message: string) => void;
}) {
  const Icon = room.icon;
  const roomAssets = assets.filter(
    (asset) => asset.roomId === room.id,
  );
  return (
    <section className="screen-shell room-detail" data-testid="room-detail">
      <header className="detail-header">
        <button
          className="round-icon-button"
          data-testid="room-back"
          type="button"
          onClick={onBack}
          aria-label="Back to spaces"
        >
          <ArrowLeftIcon />
        </button>
        <span>{placeName}</span>
        <button
          className="round-icon-button"
          type="button"
          onClick={() => onNotify("Room actions opened")}
          aria-label="Room options"
        >
          <DotsHorizontalIcon />
        </button>
      </header>

      <div className="room-title-block">
        <span className="large-room-icon">
          <Icon />
        </span>
        <div>
          <p>Room record</p>
          <h1>{room.name}</h1>
        </div>
      </div>

      <article className="readiness-card">
        <div className="readiness-copy">
          <span>Continuity readiness</span>
          <strong>{room.progress}%</strong>
        </div>
        <div className="readiness-track">
          <span style={{ width: `${room.progress}%` }} />
        </div>
        <p>{room.note}</p>
      </article>

      <div className="room-stat-grid">
        <article>
          <ImageIcon />
          <strong>{room.itemCount}</strong>
          <span>items & photos</span>
        </article>
        <article>
          <FileTextIcon />
          <strong>{room.documents}</strong>
          <span>documents</span>
        </article>
        <article>
          <ClockIcon />
          <strong>4d</strong>
          <span>since review</span>
        </article>
      </div>

      <div className="section-heading compact-heading">
        <h2>Evidence</h2>
        <button
          type="button"
          onClick={() => onNotify("All evidence opened")}
        >
          View all
        </button>
      </div>
      <div className="evidence-strip">
        <article className="evidence-card evidence-photo">
          <CameraIcon />
          <div>
            <strong>Room overview</strong>
            <span>
              {room.captured === "Today"
                ? "Latest guided scan · Today"
                : room.captured === "Not captured"
                  ? "No guided scan yet"
                  : `6 photos · ${room.captured}`}
            </span>
          </div>
        </article>
        <article className="evidence-card evidence-doc">
          <FileTextIcon />
          <div>
            <strong>Purchase records</strong>
            <span>{room.documents} files · indexed</span>
          </div>
        </article>
      </div>

      {roomAssets.length ? (
        <>
          <div className="section-heading compact-heading">
            <h2>Assets in this room</h2>
            <button
              type="button"
              onClick={() => onNotify("All room assets opened")}
            >
              See all
            </button>
          </div>
          <div className="room-asset-list">
            {roomAssets.map((asset) => {
              const AssetIcon = asset.icon;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onAssetOpen(asset.id)}
                >
                  <span className={`search-result-icon ${asset.accent}`}>
                    <AssetIcon />
                  </span>
                  <span>
                    <strong>{asset.name}</strong>
                    <small>{asset.value}</small>
                  </span>
                  <ChevronRightIcon />
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <button
        className="next-best-card"
        type="button"
        onClick={onCapture}
      >
        <span className="next-best-icon">
          <MagicWandIcon />
        </span>
        <div>
          <span>Best next step</span>
          <strong>Add one wide photo and the missing receipt</strong>
          <p>About 90 seconds</p>
        </div>
        <ChevronRightIcon />
      </button>

      <button
        className="detail-capture-button"
        data-testid="room-continue-capture"
        type="button"
        onClick={onCapture}
      >
        <CameraIcon />
        Continue capture
      </button>
    </section>
  );
}

function SearchScreen({
  assets,
  portfolioTotal,
  initialFilter,
  onResultOpen,
  onAddItem,
}: {
  assets: AssetRecord[];
  portfolioTotal: number;
  initialFilter: string;
  onResultOpen: (assetId: string) => void;
  onAddItem: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const normalized = query.trim().toLowerCase();
  const filterToken =
    filter === "Watches"
      ? "watch"
      : filter === "Documents"
        ? "document"
        : filter.toLowerCase();
  const results = assets.filter((item) => {
    const searchable = [
      item.name,
      item.meta,
      item.value,
      item.reference,
      item.locationDetail,
      item.lastProofType,
      item.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const queryMatch =
      !normalized ||
      searchable.includes(normalized);
    const filterMatch =
      filter === "All" ||
      (filter === "Location needed"
        ? item.locationStatus !== "known"
        : item.meta.toLowerCase().includes(filterToken));
    return queryMatch && filterMatch;
  });

  return (
    <section className="screen-shell search-screen" data-testid="search-screen">
      <header className="simple-screen-header">
        <div>
          <p>{portfolioTotal} records across every place</p>
          <h1>My assets</h1>
        </div>
        <button
          className="invite-button"
          type="button"
          onClick={onAddItem}
          aria-label="Add an asset"
        >
          <PlusIcon />
          Add
        </button>
      </header>

      <label className="search-field" htmlFor="asset-search">
        <MagnifyingGlassIcon />
        <KeyboardInput
          id="asset-search"
          data-testid="asset-search"
          aria-label="Search assets and documents"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Asset, document, place or story"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            Clear
          </button>
        ) : null}
      </label>

      <div className="filter-row" data-scroll-drag="ignore">
        {[
          "All",
          "Property",
          "Watches",
          "Documents",
          "Location needed",
        ].map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "is-active" : ""}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {!query ? (
        <article className="search-intelligence-card">
          <span className="search-spark">
            <MagicWandIcon />
          </span>
          <div>
            <span>Natural search</span>
            <strong>Try “documents expiring this year”</strong>
            <p>Search understands owners, locations, dates and evidence.</p>
          </div>
        </article>
      ) : null}

      <div className="section-heading compact-heading search-results-heading">
        <h2>{query ? `${results.length} results` : "Recent & important"}</h2>
        {!query ? <span>{results.length} records</span> : null}
      </div>

      <div className="search-results">
        {results.length ? (
          results.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="search-result"
                key={item.id}
                type="button"
                onClick={() => onResultOpen(item.id)}
              >
                <span className={`search-result-icon ${item.accent}`}>
                  <Icon />
                </span>
                <span className="search-result-copy">
                  <strong>{item.name}</strong>
                  <small>{item.meta}</small>
                </span>
                <span className="search-result-value">{item.value}</span>
                <ChevronRightIcon />
              </button>
            );
          })
        ) : (
          <div className="empty-search">
            <MagnifyingGlassIcon />
            <strong>No matching records</strong>
            <p>Try a broader term or select All.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function FamilyScreen({
  onNotify,
}: {
  onNotify: (message: string) => void;
}) {
  const people = [
    {
      name: "Akmal H.",
      role: "Owner · Full access",
      initials: "AH",
      tone: "blue",
      status: "You",
    },
    {
      name: "Sara H.",
      role: "Co-owner · Home & family",
      initials: "SH",
      tone: "violet",
      status: "Active",
    },
    {
      name: "Nadia A.",
      role: "Trusted contact · Emergency only",
      initials: "NA",
      tone: "cyan",
      status: "Ready",
    },
  ];

  return (
    <section className="screen-shell family-screen" data-testid="family-screen">
      <header className="simple-screen-header">
        <div>
          <p>Private household</p>
          <h1>Family access</h1>
        </div>
        <button
          className="invite-button"
          type="button"
          onClick={() => onNotify("Invitation flow ready")}
        >
          <PlusIcon />
          Invite
        </button>
      </header>

      <article className="family-security-card">
        <span className="family-lock">
          <LockClosedIcon />
        </span>
        <div>
          <span>Continuity circle</span>
          <strong>3 people can help when it matters</strong>
          <p>Production views and downloads will be encrypted and logged.</p>
        </div>
        <button
          type="button"
          aria-label="Preview family access"
          onClick={() => onNotify("Previewing trusted access")}
        >
          <EyeOpenIcon />
        </button>
      </article>

      <div className="section-heading compact-heading">
        <h2>Household</h2>
        <button
          type="button"
          onClick={() => onNotify("Household access controls opened")}
        >
          Manage
        </button>
      </div>

      <div className="people-list">
        {people.map((person) => (
          <button
            className="person-row"
            key={person.name}
            type="button"
            onClick={() => onNotify(`${person.name} access details opened`)}
          >
            <span className={`person-avatar ${person.tone}`}>
              {person.initials}
            </span>
            <span>
              <strong>{person.name}</strong>
              <small>{person.role}</small>
            </span>
            <span className="person-status">{person.status}</span>
            <ChevronRightIcon />
          </button>
        ))}
      </div>

      <div className="section-heading compact-heading">
        <h2>Access activity</h2>
        <button
          type="button"
          onClick={() => onNotify("Access history opened")}
        >
          History
        </button>
      </div>

      <article className="activity-card">
        <div className="activity-line" aria-hidden="true" />
        <div className="activity-event">
          <span className="activity-dot active" />
          <div>
            <strong>Emergency pack is ready</strong>
            <p>Reviewed by you · Today, 9:42 AM</p>
          </div>
        </div>
        <div className="activity-event">
          <span className="activity-dot" />
          <div>
            <strong>Sara viewed West Bay Home</strong>
            <p>Family access · Jul 21</p>
          </div>
        </div>
        <div className="activity-event">
          <span className="activity-dot" />
          <div>
            <strong>Nadia confirmed recovery access</strong>
            <p>Trusted contact · Jul 18</p>
          </div>
        </div>
      </article>

      <button
        className="emergency-preview"
        type="button"
        onClick={() => onNotify("Emergency mode preview opened")}
      >
        <IdCardIcon />
        <span>
          <strong>Preview emergency mode</strong>
          <small>See exactly what a trusted contact receives</small>
        </span>
        <ChevronRightIcon />
      </button>
    </section>
  );
}

function CaptureFlow({
  stage,
  intent,
  rooms,
  canScanRooms,
  selectedRoom,
  progress,
  itemName,
  itemCategory,
  itemPlaceId,
  itemRoomId,
  itemValue,
  itemReference,
  itemLocationDetail,
  placeName,
  placeKind,
  placeRegionId,
  places,
  regions,
  selectedProofType,
  onIntentChange,
  onStartItem,
  onStartPlace,
  onItemNameChange,
  onItemCategoryChange,
  onItemPlaceChange,
  onItemRoomChange,
  onItemValueChange,
  onItemReferenceChange,
  onItemLocationDetailChange,
  onPlaceNameChange,
  onPlaceKindChange,
  onPlaceRegionChange,
  onProofTypeChange,
  onSelectRoom,
  onStageChange,
  onSave,
  onDone,
}: {
  stage: CaptureStage;
  intent: CaptureIntent;
  rooms: Room[];
  canScanRooms: boolean;
  selectedRoom: string;
  progress: number;
  itemName: string;
  itemCategory: string;
  itemPlaceId: string | null;
  itemRoomId: string | null;
  itemValue: string;
  itemReference: string;
  itemLocationDetail: string;
  placeName: string;
  placeKind: string;
  placeRegionId: string;
  places: OwnedPlace[];
  regions: PlacePoint[];
  selectedProofType: ProofType | null;
  onIntentChange: (intent: CaptureIntent) => void;
  onStartItem: () => void;
  onStartPlace: () => void;
  onItemNameChange: (name: string) => void;
  onItemCategoryChange: (category: string) => void;
  onItemPlaceChange: (placeId: string | null) => void;
  onItemRoomChange: (roomId: string | null) => void;
  onItemValueChange: (value: string) => void;
  onItemReferenceChange: (reference: string) => void;
  onItemLocationDetailChange: (detail: string) => void;
  onPlaceNameChange: (name: string) => void;
  onPlaceKindChange: (kind: string) => void;
  onPlaceRegionChange: (regionId: string) => void;
  onProofTypeChange: (proofType: ProofType) => void;
  onSelectRoom: (room: string) => void;
  onStageChange: (stage: CaptureStage) => void;
  onSave: () => void;
  onDone: () => void;
}) {
  const selectedName =
    rooms.find((room) => room.id === selectedRoom)?.name ?? "Study";

  if (stage === "menu") {
    return (
      <div className="capture-menu" data-testid="capture-menu">
        {canScanRooms ? (
          <button
            data-testid="capture-scan-room"
            type="button"
            onClick={() => {
              onIntentChange("room");
              onStageChange("room");
            }}
          >
            <span className="capture-option-icon primary">
              <Crosshair2Icon />
            </span>
            <span>
              <strong>Scan a room</strong>
              <small>Photos, items and documents in one guided pass</small>
            </span>
            <ChevronRightIcon />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onStartItem}
        >
          <span className="capture-option-icon secondary">
            <CameraIcon />
          </span>
          <span>
            <strong>Add one item</strong>
            <small>Capture a watch, document or personal object</small>
          </span>
          <ChevronRightIcon />
        </button>
        <button type="button" onClick={onStartPlace}>
          <span className="capture-option-icon tertiary">
            <PhMapPin weight="duotone" />
          </span>
          <span>
            <strong>Add a place</strong>
            <small>Create a home, plot, storage space or archive</small>
          </span>
          <ChevronRightIcon />
        </button>
        <div className="capture-privacy-note">
          <LockClosedIcon />
          <span>This prototype keeps records on this device</span>
        </div>
      </div>
    );
  }

  if (stage === "place") {
    return (
      <div className="place-capture-form" data-testid="capture-place-form">
        <label htmlFor="place-name">Name this place</label>
        <div className="item-name-field">
          <PhHouse weight="duotone" />
          <KeyboardInput
            id="place-name"
            value={placeName}
            onChange={(event) => onPlaceNameChange(event.target.value)}
            placeholder="e.g. Al Waab family home"
            autoComplete="off"
          />
        </div>
        <fieldset>
          <legend>Place type</legend>
          <div className="place-kind-grid">
            {["Home", "Property", "Plot", "Storage", "Archive"].map(
              (kind) => (
                <button
                  key={kind}
                  className={placeKind === kind ? "is-selected" : ""}
                  aria-pressed={placeKind === kind}
                  type="button"
                  onClick={() => onPlaceKindChange(kind)}
                >
                  {kind}
                </button>
              ),
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>City cluster</legend>
          <div className="place-region-grid">
            {regions.map((region) => (
              <button
                key={region.id}
                className={
                  placeRegionId === region.id ? "is-selected" : ""
                }
                aria-pressed={placeRegionId === region.id}
                type="button"
                onClick={() => onPlaceRegionChange(region.id)}
              >
                <PhMapPin weight="duotone" />
                <span>{region.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="place-setup-note">
          <PhLockKey weight="duotone" />
          <span>
            The exact address stays hidden. Organize papers and assets under
            this place next.
          </span>
        </div>
        <button
          className="sheet-primary-button"
          type="button"
          disabled={!placeName.trim()}
          onClick={onSave}
        >
          Add to my private map
          <ArrowRightIcon />
        </button>
      </div>
    );
  }

  if (stage === "item") {
    return (
      <div className="item-capture-form" data-testid="capture-item-form">
        <label htmlFor="item-name">What are you adding?</label>
        <div className="item-name-field">
          <PhCube weight="duotone" />
          <KeyboardInput
            id="item-name"
            value={itemName}
            onChange={(event) => onItemNameChange(event.target.value)}
            placeholder="e.g. GMT-Master II"
            autoComplete="off"
          />
        </div>
        <div className="item-detail-field-grid">
          <label htmlFor="item-value">
            <span>Value or estimate</span>
            <KeyboardInput
              id="item-value"
              value={itemValue}
              onChange={(event) => onItemValueChange(event.target.value)}
              placeholder="e.g. QAR 46,000"
              autoComplete="off"
            />
          </label>
          <label htmlFor="item-reference">
            <span>Serial, deed or reference</span>
            <KeyboardInput
              id="item-reference"
              value={itemReference}
              onChange={(event) =>
                onItemReferenceChange(event.target.value)
              }
              placeholder="Optional"
              autoComplete="off"
            />
          </label>
        </div>
        <fieldset>
          <legend>Category</legend>
          <div className="item-category-grid">
            {[
              "Watch",
              "Collectible",
              "Document",
              "Property",
              "Camera",
              "Personal",
              "Other",
            ].map(
              (category) => (
                <button
                  key={category}
                  className={itemCategory === category ? "is-selected" : ""}
                  aria-pressed={itemCategory === category}
                  type="button"
                  onClick={() => onItemCategoryChange(category)}
                >
                  {category}
                </button>
              ),
            )}
          </div>
        </fieldset>
        {places.find((place) => place.id === itemPlaceId)?.hasRooms ? (
          <fieldset>
            <legend>Room or zone</legend>
            <div className="item-room-grid">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  className={itemRoomId === room.id ? "is-selected" : ""}
                  aria-pressed={itemRoomId === room.id}
                  type="button"
                  onClick={() => onItemRoomChange(room.id)}
                >
                  {room.name}
                </button>
              ))}
              <button
                className={
                  itemRoomId === "place-level" ? "is-selected" : ""
                }
                aria-pressed={itemRoomId === "place-level"}
                type="button"
                onClick={() => onItemRoomChange("place-level")}
              >
                No room
              </button>
            </div>
          </fieldset>
        ) : null}
        <fieldset>
          <legend>Location</legend>
          <div className="item-place-grid">
            {places.map((place) => (
              <button
                key={place.id}
                className={itemPlaceId === place.id ? "is-selected" : ""}
                aria-pressed={itemPlaceId === place.id}
                type="button"
                onClick={() => onItemPlaceChange(place.id)}
              >
                <PhMapPin weight="duotone" />
                <span>
                  {place.name}
                  <small>{place.regionName}</small>
                </span>
              </button>
            ))}
            <button
              className={itemPlaceId === null ? "is-selected" : ""}
              aria-pressed={itemPlaceId === null}
              type="button"
              onClick={() => onItemPlaceChange(null)}
            >
              <PhMapPin weight="regular" />
              <span>Unknown</span>
            </button>
          </div>
        </fieldset>
        {itemPlaceId ? (
          <label className="item-location-detail" htmlFor="item-location-detail">
            <span>Specific location</span>
            <KeyboardInput
              id="item-location-detail"
              value={itemLocationDetail}
              onChange={(event) =>
                onItemLocationDetailChange(event.target.value)
              }
              placeholder="Address, shelf, box or private note"
              autoComplete="off"
            />
            <small>
              Add this when the place alone is not precise enough.
            </small>
          </label>
        ) : null}
        <button
          className="sheet-primary-button"
          type="button"
          disabled={!itemName.trim()}
          onClick={() => onStageChange("review")}
        >
          Create asset passport
          <ArrowRightIcon />
        </button>
      </div>
    );
  }

  if (stage === "proof") {
    return (
      <div className="proof-capture-menu" data-testid="capture-proof-menu">
        <div className="proof-capture-intro">
          <span className="capture-option-icon primary">
            <PhShieldCheck weight="duotone" />
          </span>
          <div>
            <strong>Strengthen {itemName || "this asset"}</strong>
            <p>Select the evidence you have now. You can add more later.</p>
          </div>
        </div>
        <div className="proof-option-list">
          <button
            type="button"
            onClick={() => {
              onProofTypeChange("Purchase receipt");
              onStageChange("review");
            }}
          >
            <span className="proof-option-icon violet">
              <FileTextIcon />
            </span>
            <span>
              <strong>Purchase receipt</strong>
              <small>Invoice, order confirmation or valuation</small>
            </span>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              onProofTypeChange("Service record");
              onStageChange("review");
            }}
          >
            <span className="proof-option-icon blue">
              <StopwatchIcon />
            </span>
            <span>
              <strong>Service record</strong>
              <small>Maintenance, authenticity or warranty evidence</small>
            </span>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              onProofTypeChange("Insurance policy");
              onStageChange("review");
            }}
          >
            <span className="proof-option-icon cyan">
              <PhShieldCheck weight="duotone" />
            </span>
            <span>
              <strong>Insurance policy</strong>
              <small>Current schedule, certificate or coverage proof</small>
            </span>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={() => {
              onProofTypeChange("Current photo");
              onStageChange("review");
            }}
          >
            <span className="proof-option-icon cyan">
              <CameraIcon />
            </span>
            <span>
              <strong>Current photo</strong>
              <small>Condition, serial number and identifying details</small>
            </span>
            <ChevronRightIcon />
          </button>
        </div>
        <div className="capture-privacy-note">
          <LockClosedIcon />
          <span>This prototype keeps evidence metadata on this device</span>
        </div>
      </div>
    );
  }

  if (stage === "room") {
    return (
      <div className="room-picker" data-testid="capture-room-picker">
        <p>Where are you capturing?</p>
        <div>
          {rooms.map((room) => {
            const Icon = room.icon;
            const checked = selectedRoom === room.id;
            return (
              <button
                key={room.id}
                className={checked ? "is-selected" : ""}
                aria-pressed={checked}
                type="button"
                onClick={() => onSelectRoom(room.id)}
              >
                <span className="room-choice-icon">
                  <Icon />
                </span>
                <span>
                  <strong>{room.name}</strong>
                  <small>{room.progress}% documented</small>
                </span>
                <span className="choice-check">
                  {checked ? <CheckIcon /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <button
          className="sheet-primary-button"
          data-testid="capture-start-scan"
          type="button"
          onClick={() => onStageChange("scanning")}
        >
          Start guided scan
          <ArrowRightIcon />
        </button>
      </div>
    );
  }

  if (stage === "scanning") {
    return (
      <div className="scanning-state" data-testid="capture-scanning">
        <div
          className="scan-progress"
          style={{ "--scan-progress": `${progress * 3.6}deg` } as React.CSSProperties}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div>
            <Crosshair2Icon />
            <strong>{progress}%</strong>
          </div>
        </div>
        <h3>Finding records in {selectedName}</h3>
        <p>Keep the phone steady. We are grouping objects and checking image quality.</p>
        <div className="scan-status-line">
          <span>
            <ImageIcon /> {Math.max(1, Math.floor(progress / 12))} photos
          </span>
          <span>
            <CubeIcon /> {Math.max(1, Math.floor(progress / 19))} items
          </span>
          <span>
            <FileTextIcon /> {progress > 62 ? 2 : 1} files
          </span>
        </div>
      </div>
    );
  }

  if (stage === "review") {
    const isRoom = intent === "room";
    const isProof = intent === "proof";
    return (
      <div className="capture-review" data-testid="capture-review">
        <div className="review-summary">
          <span className="review-summary-icon">
            <MagicWandIcon />
          </span>
          <div>
            <span>Ready to secure</span>
            <strong>
              {isProof
                ? `${selectedProofType ?? "Evidence"} for ${
                    itemName || "asset"
                  }`
                : !isRoom
                ? `${itemName || itemCategory} passport`
                : `8 records found in ${selectedName}`}
            </strong>
          </div>
          <span className="review-quality">Excellent</span>
        </div>
        <div className="review-grid">
          <div className="review-thumb thumb-one"><CameraIcon /></div>
          {!isRoom ? (
            <>
              <div className="review-thumb thumb-two">
                {isProof ? <FileTextIcon /> : <PhCube />}
              </div>
              <div className="review-thumb thumb-three">
                {isProof ? <PhShieldCheck /> : <PhMapPin />}
              </div>
              <button
                type="button"
                aria-label={
                  isProof ? "Choose different proof" : "Edit asset details"
                }
                onClick={() =>
                  onStageChange(isProof ? "proof" : "item")
                }
              >
                <PlusIcon />
              </button>
            </>
          ) : (
            <>
              <div className="review-thumb thumb-two"><StopwatchIcon /></div>
              <div className="review-thumb thumb-three"><FileTextIcon /></div>
              <div
                className="review-more-count"
                aria-label="Five additional records"
              >
                +5
              </div>
            </>
          )}
        </div>
        <div className="review-checks">
          <span><CheckCircledIcon /> Images are sharp</span>
          <span><CheckCircledIcon /> Duplicates removed</span>
          <span><CheckCircledIcon /> Private details protected</span>
        </div>
        <button
          className="sheet-primary-button"
          data-testid="capture-save"
          type="button"
          onClick={onSave}
        >
          {isProof
            ? "Save proof"
            : !isRoom
              ? "Save asset passport"
              : `Save to ${selectedName}`}
          <LockClosedIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="capture-success" data-testid="capture-success">
      <motion.span
        className="success-mark"
        initial={{ scale: 0.65, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 350, damping: 22 }}
      >
        <CheckIcon />
      </motion.span>
      <h3>
        {intent === "place" ? "Your place is ready" : "Your record is safer now"}
      </h3>
      <p>
        {intent === "place"
          ? `${placeName || "This place"} is now part of your private map. Add its first asset whenever you are ready.`
          : intent === "proof"
          ? `${selectedProofType ?? "Evidence"} was added to ${
              itemName || "this asset"
            }. It is saved locally and pending verification.`
          : intent === "item"
          ? `${itemName || "This asset"} now has a private passport you can improve over time.`
          : `8 new records were added to ${selectedName}. Items that still need proof are marked clearly.`}
      </p>
      <button
        className="sheet-primary-button"
        data-testid="capture-done"
        type="button"
        onClick={onDone}
      >
        Done
      </button>
    </div>
  );
}

function BottomNavigation({
  activeTab,
  dark,
  onNavigate,
}: {
  activeTab: TabId;
  dark: boolean;
  onNavigate: (tab: TabId) => void;
}) {
  return (
    <nav
      className={`bottom-navigation ${dark ? "is-dark" : "is-light"}`}
      aria-label="Primary"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={active ? "is-active" : ""}
            data-testid={`tab-${item.id}`}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">
              <Icon weight={active ? "duotone" : "regular"} />
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
