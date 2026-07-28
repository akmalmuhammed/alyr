import * as SecureStore from "expo-secure-store";

import {
  assetMutationFileIssue,
  normalizeAssetMutationReference
} from "@alyr/domain";

import type {
  CapturedFile,
  PlaceClassification,
  PlacePinInput
} from "@/domain/model";
import { CATEGORY_CHOICES } from "@/domain/model";
import {
  vaultScopeFromOpaqueId,
  type VaultScopeId
} from "@/data/vaultScope";
import {
  isDraftAttachmentStore,
  type AttachmentStore,
  type DraftAttachmentStore
} from "@/data/attachmentStore";

const ITEM_DRAFT_KEY_PREFIX = "alyr.quick-passport-draft";
const PLACE_DRAFT_KEY_PREFIX = "alyr.place-capture-draft";
const DRAFT_VERSION = 2 as const;

export type DraftLocationChoice =
  | "known"
  | "needs-detail"
  | "unknown";

export interface QuickPassportDraft {
  readonly version: typeof DRAFT_VERSION;
  readonly scopeId: VaultScopeId;
  readonly householdId: string;
  readonly updatedAt: string;
  readonly step: number;
  readonly name: string;
  readonly categoryId: string | null;
  readonly captureSource?:
    | "camera"
    | "image-library"
    | "document-import"
    | "manual";
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
  readonly scopeId: VaultScopeId;
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

function scopedDraftKey(
  prefix: typeof ITEM_DRAFT_KEY_PREFIX | typeof PLACE_DRAFT_KEY_PREFIX,
  scopeId: VaultScopeId
): string {
  const scope = vaultScopeFromOpaqueId(scopeId);
  return `${prefix}.${scope.scopeId}.v${DRAFT_VERSION}`;
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.catch(() => undefined);
  return result;
}

function isDraft(value: unknown): value is QuickPassportDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<QuickPassportDraft>;
  return (
    candidate.version === DRAFT_VERSION &&
    typeof candidate.scopeId === "string" &&
    typeof candidate.householdId === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.step === "number" &&
    Number.isInteger(candidate.step) &&
    candidate.step >= 0 &&
    candidate.step <= 3 &&
    typeof candidate.name === "string" &&
    (candidate.categoryId === null ||
      typeof candidate.categoryId === "string") &&
    (candidate.captureSource === undefined ||
      candidate.captureSource === "camera" ||
      candidate.captureSource === "image-library" ||
      candidate.captureSource === "document-import" ||
      candidate.captureSource === "manual") &&
    (candidate.photo === null ||
      (typeof candidate.photo === "object" &&
        candidate.photo !== null &&
        !Array.isArray(candidate.photo))) &&
    (candidate.evidence === null ||
      (typeof candidate.evidence === "object" &&
        candidate.evidence !== null &&
        !Array.isArray(candidate.evidence))) &&
    (candidate.locationStatus === null ||
      candidate.locationStatus === "known" ||
      candidate.locationStatus === "needs-detail" ||
      candidate.locationStatus === "unknown") &&
    (candidate.placeId === null ||
      typeof candidate.placeId === "string") &&
    (candidate.roomId === null ||
      typeof candidate.roomId === "string") &&
    typeof candidate.locatorText === "string" &&
    typeof candidate.showPlaceForm === "boolean" &&
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
    typeof candidate.roomName === "string" &&
    (candidate.pin === null ||
      (typeof candidate.pin === "object" &&
        candidate.pin !== null &&
        !Array.isArray(candidate.pin)))
  );
}

function isSupportedDraftCategory(categoryId: string | null): boolean {
  return Boolean(
    categoryId &&
      CATEGORY_CHOICES.some(
        (category) => category.id === categoryId.trim()
      )
  );
}

function sanitizedDraftFile(
  file: CapturedFile | null,
  role: "photo" | "evidence"
): CapturedFile | null {
  return file && !assetMutationFileIssue(file, role) ? file : null;
}

function sanitizeDraft(draft: QuickPassportDraft): QuickPassportDraft {
  const categoryId = isSupportedDraftCategory(draft.categoryId)
    ? draft.categoryId!.trim()
    : null;
  const placeId = normalizeAssetMutationReference(draft.placeId);
  const roomId = placeId
    ? normalizeAssetMutationReference(draft.roomId)
    : null;
  const unknownLocation = draft.locationStatus === "unknown";
  const photo = sanitizedDraftFile(draft.photo, "photo");
  const evidence = sanitizedDraftFile(draft.evidence, "evidence");

  return {
    ...draft,
    categoryId,
    captureSource:
      draft.captureSource ??
      (photo
        ? "image-library"
        : evidence
          ? "document-import"
          : "manual"),
    photo,
    evidence,
    placeId: unknownLocation ? null : placeId,
    roomId: unknownLocation ? null : roomId,
    locatorText: unknownLocation ? "" : draft.locatorText
  };
}

function draftFileReference(file: CapturedFile | null): string | null {
  return file?.encryptedAtRest === true &&
    typeof file.protectedUri === "string"
    ? file.protectedUri
    : null;
}

function draftFileReferences(
  draft: Pick<QuickPassportDraft, "photo" | "evidence">
): Set<string> {
  return new Set(
    [draftFileReference(draft.photo), draftFileReference(draft.evidence)].filter(
      (value): value is string => Boolean(value)
    )
  );
}

async function discardUnreferencedDraftFiles(
  store: DraftAttachmentStore,
  files: readonly (CapturedFile | null)[],
  retained: ReadonlySet<string>
): Promise<void> {
  const discarded = new Set<string>();
  for (const file of files) {
    const reference = draftFileReference(file);
    if (
      !reference ||
      retained.has(reference) ||
      discarded.has(reference)
    ) {
      continue;
    }
    await store.discardDraftFile(file!);
    discarded.add(reference);
  }
}

async function restorableDraftFile(
  file: CapturedFile | null,
  role: "photo" | "evidence",
  store: AttachmentStore | null | undefined
): Promise<CapturedFile | null> {
  const sanitized = sanitizedDraftFile(file, role);
  if (!sanitized || !isDraftAttachmentStore(store)) return null;
  try {
    const materialized = await store.materializeDraftForViewing(
      sanitized
    );
    return {
      ...sanitized,
      localUri: materialized.uri
    };
  } catch {
    await store.discardDraftFile(sanitized);
    return null;
  }
}

async function storedDraft(
  scopeId: VaultScopeId
): Promise<QuickPassportDraft | null> {
  const stored = await SecureStore.getItemAsync(
    scopedDraftKey(ITEM_DRAFT_KEY_PREFIX, scopeId)
  );
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlaceDraft(value: unknown): value is PlaceCaptureDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlaceCaptureDraft>;
  return (
    candidate.version === DRAFT_VERSION &&
    typeof candidate.scopeId === "string" &&
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
  scopeId: VaultScopeId,
  householdId: string,
  attachmentStore?: AttachmentStore | null
): Promise<QuickPassportDraft | null> {
  const parsed = await storedDraft(scopeId);
  if (
    !parsed ||
    parsed.scopeId !== scopeId ||
    parsed.householdId !== householdId
  ) {
    return null;
  }
  const sanitized = sanitizeDraft(parsed);
  const [photo, evidence] = await Promise.all([
    restorableDraftFile(sanitized.photo, "photo", attachmentStore),
    restorableDraftFile(
      sanitized.evidence,
      "evidence",
      attachmentStore
    )
  ]);
  return { ...sanitized, photo, evidence };
}

export function writeQuickPassportDraft(
  draft: Omit<QuickPassportDraft, "version" | "updatedAt">,
  attachmentStore?: AttachmentStore | null
): Promise<void> {
  return enqueueWrite(async () => {
    const previous = await storedDraft(draft.scopeId);
    const store = isDraftAttachmentStore(attachmentStore)
      ? attachmentStore
      : null;
    let photo: CapturedFile | null = null;
    let evidence: CapturedFile | null = null;
    if (store) {
      try {
        photo = draft.photo
          ? await store.stageForDraft(draft.photo)
          : null;
        evidence = draft.evidence
          ? await store.stageForDraft(draft.evidence)
          : null;
      } catch (error) {
        await discardUnreferencedDraftFiles(
          store,
          [photo, evidence],
          previous ? draftFileReferences(previous) : new Set()
        );
        throw error;
      }
    }
    const next = {
      ...draft,
      photo,
      evidence,
      version: DRAFT_VERSION,
      updatedAt: new Date().toISOString()
    } satisfies QuickPassportDraft;
    const previousReferences = previous
      ? draftFileReferences(previous)
      : new Set<string>();
    try {
      await SecureStore.setItemAsync(
        scopedDraftKey(ITEM_DRAFT_KEY_PREFIX, draft.scopeId),
        JSON.stringify(next)
      );
    } catch (error) {
      if (store) {
        await discardUnreferencedDraftFiles(
          store,
          [photo, evidence],
          previousReferences
        );
      }
      throw error;
    }
    if (store && previous) {
      await discardUnreferencedDraftFiles(
        store,
        [previous.photo, previous.evidence],
        draftFileReferences(next)
      );
    }
  });
}

export function clearQuickPassportDraft(
  scopeId: VaultScopeId,
  attachmentStore?: AttachmentStore | null,
  discardStagedFiles = true
): Promise<void> {
  return enqueueWrite(async () => {
    const previous = discardStagedFiles
      ? await storedDraft(scopeId)
      : null;
    await SecureStore.deleteItemAsync(
      scopedDraftKey(ITEM_DRAFT_KEY_PREFIX, scopeId)
    );
    if (
      previous &&
      isDraftAttachmentStore(attachmentStore)
    ) {
      await discardUnreferencedDraftFiles(
        attachmentStore,
        [previous.photo, previous.evidence],
        new Set()
      );
    }
  });
}

export async function readPlaceCaptureDraft(
  scopeId: VaultScopeId,
  householdId: string
): Promise<PlaceCaptureDraft | null> {
  const stored = await SecureStore.getItemAsync(
    scopedDraftKey(PLACE_DRAFT_KEY_PREFIX, scopeId)
  );
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      !isPlaceDraft(parsed) ||
      parsed.scopeId !== scopeId ||
      parsed.householdId !== householdId
    ) {
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
  return enqueueWrite(async () => {
    await SecureStore.setItemAsync(
      scopedDraftKey(PLACE_DRAFT_KEY_PREFIX, draft.scopeId),
      JSON.stringify({
        ...draft,
        version: DRAFT_VERSION,
        updatedAt: new Date().toISOString()
      } satisfies PlaceCaptureDraft)
    );
  });
}

export function clearPlaceCaptureDraft(
  scopeId: VaultScopeId
): Promise<void> {
  return enqueueWrite(async () => {
    await SecureStore.deleteItemAsync(
      scopedDraftKey(PLACE_DRAFT_KEY_PREFIX, scopeId)
    );
  });
}
