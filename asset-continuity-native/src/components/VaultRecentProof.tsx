import * as Sharing from "expo-sharing";
import { ArrowRight, ArrowSquareOut } from "phosphor-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { resolveAttachmentStoreForViewing } from "@/components/AttachmentViewer";
import {
  openPlaceDocument,
  PLACE_DOCUMENT_COPY,
  placeDocumentCapturedDate,
  placeDocumentErrorMessage,
  placeDocumentFileSize,
  placeDocumentStorageState
} from "@/components/PlaceDocumentRow";
import { Section } from "@/components/ui";
import type { ScopedAttachmentStore } from "@/data/attachmentStore";
import type {
  LanguageCode,
  NativeEvidence,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import {
  formatByteSize,
  formatLocalizedDate,
  formatLocalizedNumber,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, spacing, typography } from "@/theme/tokens";
import {
  getRecentProofEntries,
  isolateRecentProofIdentifier,
  RECENT_PROOF_INITIAL_LIMIT,
  recentProofCountLabel
} from "@/vault/recentProof";

export function VaultRecentProof({
  attachmentStore,
  onOpenEvidence,
  workspace
}: {
  readonly attachmentStore: ScopedAttachmentStore | null;
  readonly onOpenEvidence: (evidenceId: string) => void;
  readonly workspace: NativeWorkspace;
}) {
  const { copy, language, rtl } = useCoreJourneyCopy();
  const [expanded, setExpanded] = useState(false);
  const entries = getRecentProofEntries(workspace);
  const visibleEntries = expanded
    ? entries
    : entries.slice(0, RECENT_PROOF_INITIAL_LIMIT);
  const chapterReference = formatProofReference(1, language);

  return (
    <Section>
      <View
        style={[styles.chapterHeading, rtl && styles.rowReverse]}
        testID="vault-chapter-recent-proof"
      >
        <Text
          style={styles.chapterReference}
        >
          {chapterReference}
        </Text>
        <View style={styles.headingCopy}>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.recentProof}
          </Text>
          <Text
            style={[
              styles.intro,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.recentProofIntro}
          </Text>
        </View>
        <Text
          style={[
            styles.count,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {recentProofCountLabel(entries.length, language)}
        </Text>
      </View>

      {entries.length > 0 ? (
        <View style={styles.list}>
          <View
            accessibilityLabel={[
              copy.vault.recentProofReference,
              copy.vault.recentProofRecord,
              copy.vault.recentProofState
            ].join(". ")}
            accessible
            style={[styles.columnHeader, rtl && styles.rowReverse]}
            testID="vault-proof-column-header"
          >
            <Text style={[styles.columnLabel, styles.referenceColumn]}>
              {copy.vault.recentProofReference}
            </Text>
            <Text
              style={[
                styles.columnLabel,
                styles.recordColumn,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.recentProofRecord}
            </Text>
            <Text
              style={[
                styles.columnLabel,
                styles.stateColumnHeader,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.vault.recentProofState}
            </Text>
          </View>

          {visibleEntries.map((entry, index) => {
            const reference = formatProofReference(index + 1, language);
            return entry.kind === "asset-evidence" ? (
              <AssetEvidenceRow
                assetName={entry.asset.name}
                evidence={entry.evidence}
                key={`asset-${entry.id}`}
                language={language}
                onPress={() => onOpenEvidence(entry.evidence.id)}
                reference={reference}
                rtl={rtl}
              />
            ) : (
              <VaultPlaceDocumentRow
                attachmentStore={attachmentStore}
                contextLabel={`${copy.vault.recentProofPlace} · ${isolateRecentProofIdentifier(
                  entry.place.name
                )}`}
                document={entry.document}
                key={`place-${entry.id}`}
                language={language}
                reference={reference}
                rtl={rtl}
              />
            );
          })}

          {entries.length > RECENT_PROOF_INITIAL_LIMIT ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((current) => !current)}
              style={({ pressed }) => [
                styles.disclosure,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
              testID="vault-recent-proof-disclosure"
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={styles.disclosureReference}
              />
              <Text
                style={[
                  styles.disclosureText,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {expanded
                  ? copy.vault.recentProofShowLess
                  : `${copy.vault.recentProofShowAll} · ${recentProofCountLabel(
                      entries.length,
                      language
                    )}`}
              </Text>
              <ArrowRight
                color={colors.text}
                size={18}
                style={rtl ? styles.mirrorArrow : undefined}
              />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.empty, rtl && styles.rowReverse]}>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={styles.emptyReference}
          >
            —
          </Text>
          <Text
            style={[
              styles.emptyText,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.vault.recentProofEmpty}
          </Text>
        </View>
      )}
    </Section>
  );
}

function formatProofReference(
  value: number,
  language: LanguageCode
): string {
  return formatLocalizedNumber(value, language, {
    minimumIntegerDigits: 2,
    useGrouping: false
  });
}

function AssetEvidenceRow({
  assetName,
  evidence,
  language,
  onPress,
  reference,
  rtl
}: {
  readonly assetName: string;
  readonly evidence: NativeEvidence;
  readonly language: LanguageCode;
  readonly onPress: () => void;
  readonly reference: string;
  readonly rtl: boolean;
}) {
  const { copy } = useCoreJourneyCopy();
  const reviewState =
    evidence.reviewStatus === "reviewed"
      ? copy.vault.recentProofReviewed
      : copy.vault.recentProofWaiting;
  const storageState =
    evidence.storageState === "on-device"
      ? copy.vault.recentProofOnDevice
      : evidence.storageState === "queued"
        ? copy.vault.recentProofQueued
        : copy.vault.recentProofSynced;
  const capturedAt = formatLocalizedDate(evidence.capturedAt, language);
  const size = formatByteSize(evidence.byteSize, language);
  const protectedFileName = isolateRecentProofIdentifier(evidence.fileName);
  const protectedAssetName = isolateRecentProofIdentifier(assetName);

  return (
    <Pressable
      accessibilityHint={copy.vault.recentProofOpenHint}
      accessibilityLabel={`${copy.vault.recentProofReference} ${reference}, ${protectedFileName}, ${
        copy.vault.recentProofItem
      }, ${protectedAssetName}, ${capturedAt}, ${reviewState}, ${storageState}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.proofRow,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
      testID={`vault-recent-evidence-${evidence.id}`}
    >
      <Text
        style={styles.reference}
        testID={`vault-proof-reference-${evidence.id}`}
      >
        {reference}
      </Text>
      <View style={styles.proofCopy}>
        <Text
          style={[
            styles.fileName,
            rtl && styles.textRight,
            styles.mixedScript
          ]}
        >
          {protectedFileName}
        </Text>
        <Text
          style={[
            styles.context,
            rtl && styles.textRight,
            styles.mixedScript
          ]}
        >
          {copy.vault.recentProofItem} · {protectedAssetName}
        </Text>
        <Text
          style={[
            styles.meta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {size} · {capturedAt}
        </Text>
      </View>
      <View
        style={[
          styles.stateColumn,
          rtl && styles.stateColumnRtl
        ]}
        testID={`vault-proof-state-${evidence.id}`}
      >
        <Text
          style={[
            styles.state,
            evidence.reviewStatus === "reviewed" && styles.stateConfirmed,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {reviewState}
        </Text>
        <Text
          style={[
            styles.storageState,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {storageState}
        </Text>
        <ArrowRight
          color={colors.textMuted}
          size={18}
          style={rtl ? styles.mirrorArrow : undefined}
        />
      </View>
    </Pressable>
  );
}

function VaultPlaceDocumentRow({
  attachmentStore,
  contextLabel,
  document,
  language,
  reference,
  rtl
}: {
  readonly attachmentStore: ScopedAttachmentStore | null;
  readonly contextLabel: string;
  readonly document: NativePlaceDocument;
  readonly language: LanguageCode;
  readonly reference: string;
  readonly rtl: boolean;
}) {
  const copy = PLACE_DOCUMENT_COPY[language];
  const vaultCopy = useCoreJourneyCopy().copy.vault;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const protectedFileName = isolateRecentProofIdentifier(document.fileName);
  const displayFileName = document.fileName;
  const fileSize = placeDocumentFileSize(document.byteSize, language);
  const capturedAt = placeDocumentCapturedDate(
    document.capturedAt,
    language
  );
  const storageState = placeDocumentStorageState(document, language);

  const open = async (): Promise<void> => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      await openPlaceDocument(
        document,
        {
          store: resolveAttachmentStoreForViewing(attachmentStore),
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
    <View style={styles.placeDocumentWrapper}>
      <Pressable
        accessibilityHint={copy.openHint}
        accessibilityLabel={`${vaultCopy.recentProofReference} ${reference}, ${copy.openLabel(
          protectedFileName
        )}, ${contextLabel}, ${capturedAt}, ${storageState}`}
        accessibilityRole="button"
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        onPress={() => void open()}
        style={({ pressed }) => [
          styles.proofRow,
          styles.placeDocumentRow,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
        testID={`open-place-document-${document.id}`}
      >
        <Text
          style={styles.reference}
          testID={`vault-proof-reference-${document.id}`}
        >
          {reference}
        </Text>
        <View style={styles.proofCopy}>
          <Text
            style={[
              styles.fileName,
              rtl && styles.textRight,
              styles.mixedScript
            ]}
          >
            {displayFileName}
          </Text>
          <Text
            style={[
              styles.context,
              rtl && styles.textRight,
              styles.mixedScript
            ]}
          >
            {contextLabel}
          </Text>
          <Text
            style={[
              styles.meta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {fileSize} · {capturedAt}
          </Text>
        </View>
        <View
          style={[
            styles.stateColumn,
            rtl && styles.stateColumnRtl
          ]}
          testID={`vault-proof-state-${document.id}`}
        >
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
                size={17}
              />
            </View>
          )}
          <Text
            style={[
              styles.storageState,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {storageState}
          </Text>
        </View>
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
  chapterHeading: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong
  },
  chapterReference: {
    width: 30,
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "left",
    writingDirection: "ltr"
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  intro: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  count: {
    maxWidth: 78,
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    fontVariant: ["tabular-nums"]
  },
  list: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  columnHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong
  },
  columnLabel: {
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.5
  },
  referenceColumn: {
    width: 30,
    flexShrink: 0,
    textAlign: "left",
    writingDirection: "ltr"
  },
  recordColumn: {
    flex: 1,
    minWidth: 0
  },
  stateColumnHeader: {
    width: 88,
    flexShrink: 0,
    textAlign: "right"
  },
  proofRow: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  placeDocumentRow: {
    borderBottomWidth: 0
  },
  reference: {
    width: 30,
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "left",
    writingDirection: "ltr"
  },
  proofCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  fileName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 20
  },
  context: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 17
  },
  meta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    fontVariant: ["tabular-nums"]
  },
  stateColumn: {
    width: 88,
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xxs
  },
  stateColumnRtl: {
    alignItems: "flex-start"
  },
  state: {
    color: colors.text,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right"
  },
  stateConfirmed: {
    color: colors.success
  },
  storageState: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right"
  },
  openAction: {
    minHeight: 24,
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
  placeDocumentWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  error: {
    paddingStart: 42,
    paddingBottom: spacing.sm,
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  disclosure: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  disclosureReference: {
    width: 30,
    flexShrink: 0
  },
  disclosureText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  empty: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  emptyReference: {
    width: 30,
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: typography.metadata,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "left",
    writingDirection: "ltr"
  },
  emptyText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  mirrorArrow: {
    transform: [{ scaleX: -1 }]
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
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  pressed: {
    opacity: 0.64
  }
});
