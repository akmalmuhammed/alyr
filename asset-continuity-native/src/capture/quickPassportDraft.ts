import * as SecureStore from "expo-secure-store";

import type {
  CapturedFile,
  PlaceClassification,
  PlacePinInput
} from "@/domain/model";

const ITEM_DRAFT_KEY = "alyr.quick-passport-draft.v1";
const PLACE_DRAFT_KEY = "alyr.place-capture-draft.v1";
const DRAFT_VERSION = 1 as const;

export type DraftLocationChoice =
  | "known"
  | "needs-detail"
  | "unknown";

export interface QuickPassportDraft {
  readonly version: typeof DRAFT_VERSION;
  readonly householdId: string;
  readonly updatedAt: string;
  readonly step: number;
  readonly name: string;
  readonly categoryId: string | null;
  readonly photo: CapturedFile | null;
  readonly evidence: CapturedFile | null;
  readonly locationStatus: DraftLocationChoice | null;
  readonly placeId: string | null;
  readonly roomId: string | null;
  readonly locatorText: string;
  readonly showPlaceForm: boolean;
  readonly placeName: string;
  readonly placeClassification?: PlaceClassification;
  readonly address: string;
  readonly region: string;
  readonly roomName: string;
  readonly pin: PlacePinInput | null;
}

export interface PlaceCaptureDraft {
  readonly version: typeof DRAFT_VERSION;
  readonly householdId: string;
  readonly updatedAt: string;
  readonly placeName: string;
  readonly placeClassification?: PlaceClassification;
  readonly address: string;
  readonly region: string;
  readonly roomName: string;
  readonly pin: PlacePinInput | null;
}

let writeQueue: Promise<void> = Promise.resolve();

function isDraft(value: unknown): value is QuickPassportDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QuickPassportDraft>;
  return (
    candidate.version === DRAFT_VERSION &&
    typeof candidate.householdId === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.step === "number" &&
    Number.isInteger(candidate.step) &&
    candidate.step >= 0 &&
    candidate.step <= 3 &&
    typeof candidate.name === "string" &&
    (candidate.categoryId === null ||
      typeof candidate.categoryId === "string")
  );
}

function isPlaceDraft(value: unknown): value is PlaceCaptureDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlaceCaptureDraft>;
  return (
    candidate.version === DRAFT_VERSION &&
    typeof candidate.householdId === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.placeName === "string" &&
    (candidate.placeClassification === undefined ||
      [
        "owned_property",
        "rented_or_managed",
        "storage",
        "temporary",
        "unknown"
      ].includes(candidate.placeClassification)) &&
    typeof candidate.address === "string" &&
    typeof candidate.region === "string" &&
    typeof candidate.roomName === "string"
  );
}

export async function readQuickPassportDraft(
  householdId: string
): Promise<QuickPassportDraft | null> {
  try {
    const stored = await SecureStore.getItemAsync(ITEM_DRAFT_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isDraft(parsed) || parsed.householdId !== householdId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeQuickPassportDraft(
  draft: Omit<QuickPassportDraft, "version" | "updatedAt">
): Promise<void> {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() =>
      SecureStore.setItemAsync(
        ITEM_DRAFT_KEY,
        JSON.stringify({
          ...draft,
          version: DRAFT_VERSION,
          updatedAt: new Date().toISOString()
        } satisfies QuickPassportDraft)
      )
    )
    .catch(() => undefined);
  return writeQueue;
}

export function clearQuickPassportDraft(): Promise<void> {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => SecureStore.deleteItemAsync(ITEM_DRAFT_KEY))
    .catch(() => undefined);
  return writeQueue;
}

export async function readPlaceCaptureDraft(
  householdId: string
): Promise<PlaceCaptureDraft | null> {
  try {
    const stored = await SecureStore.getItemAsync(PLACE_DRAFT_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isPlaceDraft(parsed) || parsed.householdId !== householdId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePlaceCaptureDraft(
  draft: Omit<PlaceCaptureDraft, "version" | "updatedAt">
): Promise<void> {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() =>
      SecureStore.setItemAsync(
        PLACE_DRAFT_KEY,
        JSON.stringify({
          ...draft,
          version: DRAFT_VERSION,
          updatedAt: new Date().toISOString()
        } satisfies PlaceCaptureDraft)
      )
    )
    .catch(() => undefined);
  return writeQueue;
}

export function clearPlaceCaptureDraft(): Promise<void> {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => SecureStore.deleteItemAsync(PLACE_DRAFT_KEY))
    .catch(() => undefined);
  return writeQueue;
}
