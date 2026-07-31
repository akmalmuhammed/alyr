import * as Sharing from "expo-sharing";
import {
  ArrowSquareOut,
  File as FileIcon
} from "phosphor-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  AttachmentReadError,
  createDefaultAttachmentStore,
  type AttachmentReadRequest,
  type AttachmentStore,
  type MaterializedAttachment
} from "@/data/attachmentStore";
import type {
  LanguageCode,
  NativeEvidence
} from "@/domain/model";
import { useCoreJourneyCopy } from "@/i18n/coreJourneyCopy";
import { colors, spacing, typography } from "@/theme/tokens";

const defaultAttachmentStore = createDefaultAttachmentStore();

type AttachmentKind = "photo" | "proof";

export const PROOF_ATTACHMENT_COPY = {
  en: {
    reviewed: "Reviewed by you",
    waiting: "Waiting for your review",
    onDevice: "on this device",
    queued: "queued for sync",
    synced: "cloud acknowledged",
    open: "Open",
    openLabel: (fileName: string) => `Open ${fileName}`,
    openHint: "Opens a temporary copy in the system share sheet.",
    openDialog: (fileName: string) => `Open ${fileName}`,
    sharingUnavailable: "Sharing is not available on this device."
  },
  ar: {
    reviewed: "راجعته أنت",
    waiting: "بانتظار مراجعتك",
    onDevice: "على هذا الجهاز",
    queued: "بانتظار المزامنة",
    synced: "تم تأكيده سحابيًا",
    open: "فتح",
    openLabel: (fileName: string) => `فتح ${fileName}`,
    openHint: "يفتح نسخة مؤقتة في لوحة المشاركة الخاصة بالنظام.",
    openDialog: (fileName: string) => `فتح ${fileName}`,
    sharingUnavailable: "المشاركة غير متاحة على هذا الجهاز."
  }
} as const;

export function isolateAttachmentIdentifier(
  value: string,
  language: LanguageCode
): string {
  return language === "ar" ? `\u2068${value}\u2069` : value;
}

/**
 * `undefined` preserves the legacy preview/test fallback. `null` is an
 * explicit vault lock and must never resolve to the module-global store.
 */
export function resolveAttachmentStoreForViewing(
  store: AttachmentStore | null | undefined
): AttachmentStore {
  if (store === null) {
    throw new AttachmentReadError(
      "VAULT_LOCKED",
      "The active household attachment vault is locked."
    );
  }
  return store ?? defaultAttachmentStore;
}

interface ReadRequestOptions {
  readonly evidence: NativeEvidence;
  readonly encryptedAtRest: boolean;
  readonly encryptedUri?: string | null | undefined;
  readonly previewUri?: string | null | undefined;
}

export function createAttachmentReadRequest({
  evidence,
  encryptedAtRest,
  encryptedUri,
  previewUri
}: ReadRequestOptions): AttachmentReadRequest {
  if (encryptedAtRest) {
    const protectedUri = encryptedUri ?? evidence.localUri;
    if (!protectedUri) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "The protected attachment reference is missing."
      );
    }
    return {
      storage: "encrypted",
      protectedUri,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      byteSize: evidence.byteSize,
      checksumSha256: evidence.checksumSha256
    };
  }

  const localUri = previewUri ?? evidence.localUri;
  if (!localUri) {
    throw new AttachmentReadError(
      "INVALID_REFERENCE",
      "The preview attachment reference is missing."
    );
  }
  return {
    storage: "plaintext-preview",
    localUri,
    fileName: evidence.fileName,
    mimeType: evidence.mimeType,
    byteSize: evidence.byteSize
  };
}

export function attachmentReadErrorMessage(
  error: unknown,
  kind: AttachmentKind,
  language: LanguageCode = "en"
): string {
  if (language === "ar") {
    const label = kind === "photo" ? "الصورة" : "الإثبات";
    if (!(error instanceof AttachmentReadError)) {
      return `تعذّر فتح ${label}.`;
    }
    const code: string = error.code;
    switch (code) {
      case "CHECKSUM_MISMATCH":
      case "DECRYPTION_FAILED":
      case "SIZE_MISMATCH":
        return `لم يجتز ${label} فحص سلامة الملف.`;
      case "KEY_UNAVAILABLE":
      case "VAULT_LOCKED":
        return `${label} مقفل على هذا الجهاز.`;
      case "PROTECTED_FILE_MISSING":
        return `${label} لم يعد متاحًا على هذا الجهاز.`;
      case "PROTECTED_ATTACHMENT_UNAVAILABLE":
        return `يُفتح ${label} في نسخة Heldat موقّعة.`;
      default:
        return `تعذّر فتح ${label}.`;
    }
  }

  const label = kind === "photo" ? "Photo" : "Proof";
  if (!(error instanceof AttachmentReadError)) {
    return `${label} could not be opened.`;
  }

  const code: string = error.code;
  switch (code) {
    case "CHECKSUM_MISMATCH":
    case "DECRYPTION_FAILED":
    case "SIZE_MISMATCH":
      return `${label} did not pass its integrity check.`;
    case "KEY_UNAVAILABLE":
    case "VAULT_LOCKED":
      return `${label} is locked on this device.`;
    case "PROTECTED_FILE_MISSING":
      return `${label} is no longer available on this device.`;
    case "PROTECTED_ATTACHMENT_UNAVAILABLE":
      return `${label} opens in an Heldat signed build.`;
    default:
      return `${label} could not be opened.`;
  }
}

export interface AttachmentViewSession {
  readonly attachment: MaterializedAttachment;
  close(): Promise<void>;
}

export async function openAttachmentViewSession(
  options: ReadRequestOptions,
  store: AttachmentStore
): Promise<AttachmentViewSession> {
  const attachment = await store.materializeForViewing(
    createAttachmentReadRequest(options)
  );
  let closed = false;
  return {
    attachment,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await store.cleanupMaterialized(attachment);
    }
  };
}

export type AttachmentPreviewState =
  | { readonly status: "idle"; readonly uri: null; readonly error: null }
  | { readonly status: "loading"; readonly uri: null; readonly error: null }
  | { readonly status: "ready"; readonly uri: string; readonly error: null }
  | { readonly status: "error"; readonly uri: null; readonly error: string };

interface UseAttachmentPreviewOptions {
  readonly evidence: NativeEvidence | null;
  readonly encryptedAtRest: boolean;
  readonly encryptedUri?: string | null | undefined;
  readonly previewUri?: string | null | undefined;
  readonly active: boolean;
  readonly store?: AttachmentStore | null;
}

const idlePreviewState: AttachmentPreviewState = {
  status: "idle",
  uri: null,
  error: null
};

/**
 * Materializes an attachment only while its screen is active. The returned URI
 * is ephemeral component state and is never written back to the workspace.
 */
export function useAttachmentPreview({
  evidence,
  encryptedAtRest,
  encryptedUri,
  previewUri,
  active,
  store
}: UseAttachmentPreviewOptions): AttachmentPreviewState {
  const [state, setState] =
    useState<AttachmentPreviewState>(idlePreviewState);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active"
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active || !appActive || !evidence) {
      setState(idlePreviewState);
      return;
    }

    let disposed = false;
    let session: AttachmentViewSession | null = null;
    setState({ status: "loading", uri: null, error: null });

    void (async () => {
      try {
        const nextSession = await openAttachmentViewSession(
          {
            evidence,
            encryptedAtRest,
            encryptedUri,
            previewUri
          },
          resolveAttachmentStoreForViewing(store)
        );
        if (disposed) {
          await nextSession.close();
          return;
        }
        session = nextSession;
        setState({
          status: "ready",
          uri: nextSession.attachment.uri,
          error: null
        });
      } catch (error) {
        if (!disposed) {
          setState({
            status: "error",
            uri: null,
            error: attachmentReadErrorMessage(error, "photo")
          });
        }
      }
    })();

    return () => {
      disposed = true;
      const current = session;
      session = null;
      if (current) {
        void current.close().catch(() => undefined);
      }
    };
  }, [
    active,
    appActive,
    encryptedAtRest,
    encryptedUri,
    evidence,
    previewUri,
    store
  ]);

  return state;
}

interface ShareAttachmentDependencies {
  readonly store: AttachmentStore;
  readonly isSharingAvailable: () => Promise<boolean>;
  readonly share: (
    uri: string,
    options: { readonly dialogTitle: string; readonly mimeType: string }
  ) => Promise<void>;
}

export async function shareEvidenceAttachment(
  evidence: NativeEvidence,
  encryptedAtRest: boolean,
  dependencies: ShareAttachmentDependencies,
  dialogTitle = `Open ${evidence.fileName}`
): Promise<void> {
  let session: AttachmentViewSession | null = null;
  let actionFailed = false;
  try {
    session = await openAttachmentViewSession(
      { evidence, encryptedAtRest },
      dependencies.store
    );
    if (!(await dependencies.isSharingAvailable())) {
      throw new Error("Sharing is not available on this device.");
    }
    await dependencies.share(session.attachment.uri, {
      dialogTitle,
      mimeType: evidence.mimeType
    });
  } catch (error) {
    actionFailed = true;
    throw error;
  } finally {
    if (session) {
      try {
        await session.close();
      } catch (cleanupError) {
        if (!actionFailed) {
          throw cleanupError;
        }
      }
    }
  }
}

interface ProofAttachmentButtonProps {
  readonly evidence: NativeEvidence;
  readonly encryptedAtRest: boolean;
  readonly store?: AttachmentStore | null;
}

export function ProofAttachmentButton({
  evidence,
  encryptedAtRest,
  store
}: ProofAttachmentButtonProps) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = PROOF_ATTACHMENT_COPY[language];
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const protectedFileName = isolateAttachmentIdentifier(
    evidence.fileName,
    language
  );
  const reviewLabel =
    evidence.reviewStatus === "reviewed"
      ? copy.reviewed
      : copy.waiting;
  const storageLabel =
    evidence.storageState === "on-device"
      ? copy.onDevice
      : evidence.storageState === "queued"
        ? copy.queued
        : copy.synced;

  const openProof = async () => {
    if (opening) {
      return;
    }
    setOpening(true);
    setError(null);
    try {
      await shareEvidenceAttachment(evidence, encryptedAtRest, {
        store: resolveAttachmentStoreForViewing(store),
        isSharingAvailable: Sharing.isAvailableAsync,
        share: Sharing.shareAsync
      }, copy.openDialog(protectedFileName));
    } catch (caught) {
      setError(
        caught instanceof Error &&
          caught.message === "Sharing is not available on this device."
          ? copy.sharingUnavailable
          : attachmentReadErrorMessage(caught, "proof", language)
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.attachment}>
      <Pressable
        accessibilityHint={copy.openHint}
        accessibilityLabel={copy.openLabel(protectedFileName)}
        accessibilityRole="button"
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        onPress={() => void openProof()}
        style={({ pressed }) => [
          styles.evidenceRow,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
        testID={`open-proof-${evidence.id}`}
      >
        <FileIcon color={colors.text} size={22} weight="regular" />
        <View style={styles.evidenceCopy}>
          <Text
            numberOfLines={2}
            style={[
              styles.evidenceName,
              rtl && styles.textRight,
              styles.mixedScript
            ]}
          >
            {protectedFileName}
          </Text>
          <Text
            style={[
              styles.evidenceMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {reviewLabel} · {storageLabel}
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
            <ArrowSquareOut color={colors.text} size={19} weight="regular" />
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
          testID={`proof-error-${evidence.id}`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  attachment: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  evidenceRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  evidenceCopy: {
    flex: 1,
    gap: 2
  },
  evidenceName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  evidenceMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  openAction: {
    minWidth: 62,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xxs
  },
  openLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  error: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: spacing.sm,
    paddingStart: 34
  },
  pressed: {
    opacity: 0.68
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  textRight: {
    textAlign: "right"
  },
  mixedScript: {
    writingDirection: "auto"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  }
});
