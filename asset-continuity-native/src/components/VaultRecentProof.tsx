import { ArrowRight, CheckCircle, FileText } from "phosphor-react-native";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { PlaceDocumentRow } from "@/components/PlaceDocumentRow";
import { Section } from "@/components/ui";
import type { ScopedAttachmentStore } from "@/data/attachmentStore";
import type {
  LanguageCode,
  NativeEvidence,
  NativeWorkspace
} from "@/domain/model";
import {
  formatByteSize,
  formatLocalizedDate,
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

  return (
    <Section>
      <View style={[styles.heading, rtl && styles.rowReverse]}>
        <View style={styles.headingCopy}>
          <Text
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
          {visibleEntries.map((entry) =>
            entry.kind === "asset-evidence" ? (
              <AssetEvidenceRow
                evidence={entry.evidence}
                assetName={entry.asset.name}
                key={`asset-${entry.id}`}
                language={language}
                onPress={() => onOpenEvidence(entry.evidence.id)}
                rtl={rtl}
              />
            ) : (
              <PlaceDocumentRow
                contextLabel={`${copy.vault.recentProofPlace} · ${isolateRecentProofIdentifier(
                  entry.place.name
                )}`}
                document={entry.document}
                key={`place-${entry.id}`}
                store={attachmentStore}
              />
            )
          )}
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
          <View style={styles.emptyIcon}>
            <FileText color={colors.text} size={21} weight="regular" />
          </View>
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

function AssetEvidenceRow({
  assetName,
  evidence,
  language,
  onPress,
  rtl
}: {
  readonly assetName: string;
  readonly evidence: NativeEvidence;
  readonly language: LanguageCode;
  readonly onPress: () => void;
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
      accessibilityLabel={`${protectedFileName}, ${
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
      <View style={styles.proofIcon}>
        {evidence.reviewStatus === "reviewed" ? (
          <CheckCircle color={colors.success} size={22} weight="regular" />
        ) : (
          <FileText color={colors.text} size={21} weight="regular" />
        )}
      </View>
      <View style={styles.proofCopy}>
        <Text
          numberOfLines={2}
          style={[
            styles.fileName,
            rtl && styles.textRight,
            styles.mixedScript
          ]}
        >
          {protectedFileName}
        </Text>
        <Text
          numberOfLines={1}
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
        <Text
          style={[
            styles.state,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {reviewState} · {storageState}
        </Text>
      </View>
      <ArrowRight
        color={colors.textMuted}
        size={19}
        style={rtl ? styles.mirrorArrow : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  headingCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  intro: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  count: {
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    fontVariant: ["tabular-nums"]
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  proofRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  proofIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.mist
  },
  proofCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1
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
  state: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16
  },
  disclosure: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  disclosureText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  empty: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.mist
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
    fontFamily: typography.arabicMedium
  },
  pressed: {
    opacity: 0.64
  }
});
