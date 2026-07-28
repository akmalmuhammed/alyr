import * as Sharing from "expo-sharing";
import { ArrowSquareOut, FileText } from "phosphor-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  AttachmentReadError,
  type AttachmentReadRequest,
  type AttachmentStore,
  type MaterializedAttachment
} from "@/data/attachmentStore";
import { resolveAttachmentStoreForViewing } from "@/components/AttachmentViewer";
import type {
  LanguageCode,
  NativePlaceDocument
} from "@/domain/model";
import {
  formatByteSize,
  formatLocalizedDate,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, spacing, typography } from "@/theme/tokens";

interface PlaceDocumentCopy {
  readonly open: string;
  readonly openLabel: (fileName: string) => string;
  readonly openHint: string;
  readonly openDialog: (fileName: string) => string;
  readonly sizeNotReported: string;
  readonly dateNotReported: string;
  readonly encrypted: string;
  readonly preview: string;
  readonly onDevice: string;
  readonly waitingToUpload: string;
  readonly synced: string;
  readonly originalUnavailable: string;
  readonly viewerUnavailable: string;
  readonly genericError: string;
  readonly integrityError: string;
  readonly lockedError: string;
  readonly missingError: string;
  readonly protectedPreviewError: string;
}

export const PLACE_DOCUMENT_COPY = {
  en: {
    open: "Open",
    openLabel: (fileName: string) => `Open ${fileName}`,
    openHint:
      "Creates a temporary verified copy, then opens the system document viewer.",
    openDialog: (fileName: string) => `Open ${fileName}`,
    sizeNotReported: "Size not reported",
    dateNotReported: "Date not reported",
    encrypted: "Encrypted on this device",
    preview: "Session-only preview copy",
    onDevice: "On device",
    waitingToUpload: "Waiting to upload",
    synced: "Synced",
    originalUnavailable: "Original unavailable on this device",
    viewerUnavailable: "The system document viewer is not supported here.",
    genericError:
      "The Place document did not open. The saved record was preserved.",
    integrityError: "The Place document did not pass its integrity check.",
    lockedError: "The Place document is locked on this device.",
    missingError: "The Place document file is missing from this device.",
    protectedPreviewError:
      "Protected Place documents open in the signed ALYR build."
  },
  ar: {
    open: "فتح",
    openLabel: (fileName: string) => `فتح ${fileName}`,
    openHint:
      "ينشئ نسخة مؤقتة تم التحقق منها، ثم يفتح عارض المستندات في النظام.",
    openDialog: (fileName: string) => `فتح ${fileName}`,
    sizeNotReported: "الحجم غير مسجّل",
    dateNotReported: "التاريخ غير مسجّل",
    encrypted: "مشفّر على هذا الجهاز",
    preview: "نسخة معاينة لهذه الجلسة فقط",
    onDevice: "على الجهاز",
    waitingToUpload: "في انتظار الرفع",
    synced: "متزامن",
    originalUnavailable: "النسخة الأصلية غير متاحة على هذا الجهاز",
    viewerUnavailable: "عارض مستندات النظام غير متاح هنا.",
    genericError:
      "لم يُفتح مستند المكان. بقي السجل المحفوظ كما هو.",
    integrityError: "لم يجتز مستند المكان فحص السلامة.",
    lockedError: "مستند المكان مقفل على هذا الجهاز.",
    missingError: "ملف مستند المكان غير موجود على هذا الجهاز.",
    protectedPreviewError:
      "تُفتح مستندات المكان المحمية في نسخة ALYR الموقّعة."
  }
} as const satisfies Record<LanguageCode, PlaceDocumentCopy>;

const VIEWER_UNAVAILABLE = "PLACE_DOCUMENT_VIEWER_UNAVAILABLE";

export function createPlaceDocumentReadRequest(
  document: NativePlaceDocument
): AttachmentReadRequest {
  if (!document.localUri) {
    throw new AttachmentReadError(
      "INVALID_REFERENCE",
      "The Place document reference is missing."
    );
  }
  if (document.encryptedAtRest) {
    return {
      storage: "encrypted",
      protectedUri: document.localUri,
      fileName: document.fileName,
      mimeType: document.mimeType,
      byteSize: document.byteSize,
      checksumSha256: document.checksumSha256
    };
  }
  return {
    storage: "plaintext-preview",
    localUri: document.localUri,
    fileName: document.fileName,
    mimeType: document.mimeType,
    byteSize: document.byteSize
  };
}

interface OpenPlaceDocumentDependencies {
  readonly store: AttachmentStore;
  readonly isSharingAvailable: () => Promise<boolean>;
  readonly share: (
    uri: string,
    options: {
      readonly dialogTitle: string;
      readonly mimeType: string;
    }
  ) => Promise<void>;
}

export async function openPlaceDocument(
  document: NativePlaceDocument,
  dependencies: OpenPlaceDocumentDependencies,
  dialogTitle = PLACE_DOCUMENT_COPY.en.openDialog(document.fileName)
): Promise<void> {
  let materialized: MaterializedAttachment | null = null;
  let actionFailed = false;
  try {
    materialized = await dependencies.store.materializeForViewing(
      createPlaceDocumentReadRequest(document)
    );
    if (!(await dependencies.isSharingAvailable())) {
      throw new Error(VIEWER_UNAVAILABLE);
    }
    await dependencies.share(materialized.uri, {
      dialogTitle,
      mimeType: document.mimeType
    });
  } catch (error) {
    actionFailed = true;
    throw error;
  } finally {
    if (materialized) {
      try {
        await dependencies.store.cleanupMaterialized(materialized);
      } catch (cleanupError) {
        if (!actionFailed) throw cleanupError;
      }
    }
  }
}

export function placeDocumentErrorMessage(
  error: unknown,
  language: LanguageCode
): string {
  const copy = PLACE_DOCUMENT_COPY[language];
  if (error instanceof Error && error.message === VIEWER_UNAVAILABLE) {
    return copy.viewerUnavailable;
  }
  if (!(error instanceof AttachmentReadError)) {
    return copy.genericError;
  }
  const code: string = error.code;
  switch (code) {
    case "CHECKSUM_MISMATCH":
    case "DECRYPTION_FAILED":
    case "SIZE_MISMATCH":
      return copy.integrityError;
    case "KEY_UNAVAILABLE":
    case "VAULT_LOCKED":
      return copy.lockedError;
    case "PROTECTED_FILE_MISSING":
      return copy.missingError;
    case "PROTECTED_ATTACHMENT_UNAVAILABLE":
      return copy.protectedPreviewError;
    default:
      return copy.genericError;
  }
}

export function placeDocumentFileSize(
  bytes: number,
  language: LanguageCode
): string {
  return bytes <= 0
    ? PLACE_DOCUMENT_COPY[language].sizeNotReported
    : formatByteSize(bytes, language);
}

export function placeDocumentCapturedDate(
  value: string,
  language: LanguageCode
): string {
  return Number.isNaN(Date.parse(value))
    ? PLACE_DOCUMENT_COPY[language].dateNotReported
    : formatLocalizedDate(value, language);
}

export function placeDocumentStorageState(
  document: NativePlaceDocument,
  language: LanguageCode
): string {
  const copy = PLACE_DOCUMENT_COPY[language];
  if (!document.localUri) return copy.originalUnavailable;
  if (!document.encryptedAtRest) return copy.preview;
  switch (document.storageState) {
    case "queued":
      return `${copy.waitingToUpload} · ${copy.encrypted}`;
    case "synced":
      return `${copy.synced} · ${copy.encrypted}`;
    case "on-device":
    default:
      return `${copy.onDevice} · ${copy.encrypted}`;
  }
}

export function PlaceDocumentRow({
  contextLabel,
  document,
  store
}: {
  readonly contextLabel?: string;
  readonly document: NativePlaceDocument;
  readonly store?: AttachmentStore | null;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = PLACE_DOCUMENT_COPY[language];
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      await openPlaceDocument(
        document,
        {
          store: resolveAttachmentStoreForViewing(store),
          isSharingAvailable: Sharing.isAvailableAsync,
          share: Sharing.shareAsync
        },
        copy.openDialog(document.fileName)
      );
    } catch (caught) {
      setError(placeDocumentErrorMessage(caught, language));
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityHint={copy.openHint}
        accessibilityLabel={`${copy.openLabel(document.fileName)}${
          contextLabel ? `, ${contextLabel}` : ""
        }`}
        accessibilityRole="button"
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        onPress={() => void open()}
        style={({ pressed }) => [
          styles.row,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
        testID={`open-place-document-${document.id}`}
      >
        <View style={styles.iconBox}>
          <FileText color={colors.text} size={21} />
        </View>
        <View style={styles.copy}>
          <Text
            numberOfLines={2}
            style={[
              styles.name,
              rtl && styles.textRight,
              styles.mixedScript
            ]}
          >
            {document.fileName}
          </Text>
          {contextLabel ? (
            <Text
              numberOfLines={1}
              style={[
                styles.context,
                rtl && styles.textRight,
                styles.mixedScript
              ]}
            >
              {contextLabel}
            </Text>
          ) : null}
          <Text
            style={[
              styles.meta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {placeDocumentFileSize(document.byteSize, language)}
            {" · "}
            {placeDocumentCapturedDate(document.capturedAt, language)}
          </Text>
          <Text
            style={[
              styles.state,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {placeDocumentStorageState(document, language)}
          </Text>
        </View>
        {opening ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <View style={[styles.openAction, rtl && styles.rowReverse]}>
            <Text
              style={[
                styles.openLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.open}
            </Text>
            <ArrowSquareOut
              color={colors.text}
              mirrored={rtl}
              size={18}
            />
          </View>
        )}
      </Pressable>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.error,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  iconBox: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.mist
  },
  copy: {
    flex: 1,
    gap: 2
  },
  name: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 20
  },
  meta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ["tabular-nums"]
  },
  context: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 17
  },
  state: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16
  },
  openAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  openLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  error: {
    paddingBottom: spacing.sm,
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.64
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
  textRight: {
    textAlign: "right"
  },
  mixedScript: {
    writingDirection: "auto"
  }
});
