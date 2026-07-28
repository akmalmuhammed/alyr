import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  Trash,
  Warning
} from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  PermissionDeniedScreen,
  PermissionNotice
} from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  Field,
  ScreenTitle
} from "@/components/ui";
import {
  LIABILITY_KINDS
} from "@/domain/liabilities";
import type {
  LiabilityKind,
  NativeLiability
} from "@/domain/model";
import {
  getPortfolioValueHistory
} from "@/domain/portfolio";
import {
  formatLocalizedDate,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import {
  getPortfolioExperienceCopy,
  liabilityKindLabel,
  liabilityLifecycleLabel
} from "@/i18n/portfolioCopy";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import {
  formatRecordedValue,
  valueVisibilityFromHidden
} from "@/privacy/ValueVisibility";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  themes,
  typography
} from "@/theme/tokens";

function localCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function LiabilityDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getPortfolioExperienceCopy(language);
  const {
    amountsHidden,
    setAmountsHidden
  } = usePortfolioPrivacy();
  const {
    can,
    clearError,
    deleteLiability,
    error,
    liabilities,
    recordPortfolioValue,
    saving,
    setLiabilityLifecycle,
    updateLiability,
    workspace
  } = useWorkspace();
  if (!can("liability.read")) {
    return <PermissionDeniedScreen capability="liability.read" />;
  }

  const liability = liabilities.find((record) => record.id === id);

  if (!workspace || !liability) {
    return (
      <AppScreen safeEdges={[]} testID="liability-detail-not-found">
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={30} />
          <ScreenTitle size="medium">{copy.detail.notFound}</ScreenTitle>
          <BodyText muted>{copy.detail.notFoundBody}</BodyText>
        </View>
      </AppScreen>
    );
  }

  return (
    <LiabilityDetail
      amountsHidden={amountsHidden}
      canWrite={can("liability.write")}
      error={error}
      liability={liability}
      onClearError={clearError}
      onDelete={async () => {
        await deleteLiability(liability.id);
        router.replace("/dashboard");
      }}
      onOpenBalance={() =>
        router.push(
          `/liability-balance?liabilityId=${encodeURIComponent(
            liability.id
          )}`
        )
      }
      onMarkPaidOff={(currency) =>
        recordPortfolioValue({
          liabilityId: liability.id,
          amountMinor: 0,
          currency,
          asOf: localCalendarDate()
        })
      }
      onSetAmountsHidden={setAmountsHidden}
      onSetLifecycle={(lifecycleStatus) =>
        setLiabilityLifecycle({
          liabilityId: liability.id,
          lifecycleStatus
        })
      }
      onUpdate={(name, kind) =>
        updateLiability({
          liabilityId: liability.id,
          name,
          kind
        })
      }
      saving={saving}
      workspace={workspace}
    />
  );
}

export function LiabilityDetail({
  amountsHidden,
  canWrite,
  error,
  liability,
  onClearError,
  onDelete,
  onOpenBalance,
  onMarkPaidOff,
  onSetAmountsHidden,
  onSetLifecycle,
  onUpdate,
  saving,
  workspace
}: {
  readonly amountsHidden: boolean;
  readonly canWrite: boolean;
  readonly error: string | null;
  readonly liability: NativeLiability;
  readonly onClearError: () => void;
  readonly onDelete: () => Promise<void>;
  readonly onOpenBalance: () => void;
  readonly onMarkPaidOff: (
    currency: string
  ) => Promise<ReturnType<typeof getPortfolioValueHistory>[number]>;
  readonly onSetAmountsHidden: (hidden: boolean) => void;
  readonly onSetLifecycle: (
    status: "active" | "archived"
  ) => Promise<NativeLiability>;
  readonly onUpdate: (
    name: string,
    kind: LiabilityKind
  ) => Promise<NativeLiability>;
  readonly saving: boolean;
  readonly workspace: NonNullable<ReturnType<typeof useWorkspace>["workspace"]>;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = getPortfolioExperienceCopy(language);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(liability.name);
  const [kind, setKind] = useState<LiabilityKind>(liability.kind);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [paidOffConfirming, setPaidOffConfirming] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [concurrentUpdate, setConcurrentUpdate] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const draftBaseline = useRef({
    id: liability.id,
    version: liability.version,
    name: liability.name,
    kind: liability.kind
  });

  useEffect(() => {
    const baseline = draftBaseline.current;
    const sameRecord = baseline.id === liability.id;
    const draftDirty =
      sameRecord &&
      (name !== baseline.name || kind !== baseline.kind);
    const incomingMatchesDraft =
      name === liability.name && kind === liability.kind;
    const incomingDetailsChanged =
      !sameRecord ||
      liability.name !== baseline.name ||
      liability.kind !== baseline.kind;
    const incoming = {
      id: liability.id,
      version: liability.version,
      name: liability.name,
      kind: liability.kind
    };

    if (
      !editing ||
      !sameRecord ||
      !draftDirty ||
      incomingMatchesDraft
    ) {
      draftBaseline.current = incoming;
      setName(liability.name);
      setKind(liability.kind);
      setConcurrentUpdate(false);
      setReplaceConfirmed(false);
      return;
    }

    // Sync-only revision changes advance the baseline while preserving the
    // user's dirty fields. A concurrent detail edit keeps the original
    // baseline so the draft is never silently replaced.
    if (!incomingDetailsChanged) {
      draftBaseline.current = incoming;
    } else {
      setConcurrentUpdate(true);
      setReplaceConfirmed(false);
    }
  }, [
    editing,
    kind,
    liability.id,
    liability.kind,
    liability.name,
    liability.version,
    name
  ]);
  const history = getPortfolioValueHistory(workspace, {
    kind: "liability",
    liabilityId: liability.id
  });
  const current = history[0] ?? null;
  const visibility = valueVisibilityFromHidden(amountsHidden);
  const formattedHistory = history.map((record) => ({
    record,
    formatted: formatRecordedValue({
      amountMinor: record.amountMinor,
      currency: record.currency,
      language,
      visibility
    })
  }));
  const currentFormatted = formattedHistory[0]?.formatted ?? null;
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const detailsChanged =
    name.trim() !== liability.name || kind !== liability.kind;
  const active = liability.lifecycleStatus === "active";
  const paidOff = current?.amountMinor === 0;

  const beginEditing = () => {
    draftBaseline.current = {
      id: liability.id,
      version: liability.version,
      name: liability.name,
      kind: liability.kind
    };
    setName(liability.name);
    setKind(liability.kind);
    setAttempted(false);
    setConcurrentUpdate(false);
    setReplaceConfirmed(false);
    setEditing(true);
  };

  const reloadUpdatedDetails = () => {
    draftBaseline.current = {
      id: liability.id,
      version: liability.version,
      name: liability.name,
      kind: liability.kind
    };
    setName(liability.name);
    setKind(liability.kind);
    setAttempted(false);
    setConcurrentUpdate(false);
    setReplaceConfirmed(false);
  };

  const saveBlocked =
    !detailsChanged ||
    saving ||
    (concurrentUpdate && !replaceConfirmed);

  const saveDetails = async () => {
    setAttempted(true);
    if (!name.trim() || saveBlocked) return;
    try {
      await onUpdate(name.trim(), kind);
      setEditing(false);
      setAttempted(false);
      setConcurrentUpdate(false);
      setReplaceConfirmed(false);
    } catch {
      // Provider preserves the editor and exposes a recovery message.
    }
  };

  return (
    <AppScreen safeEdges={[]} testID="liability-detail-screen">
      {error ? (
        <ErrorBanner
          message={localizedWorkspaceError(error, language)}
          onDismiss={onClearError}
        />
      ) : null}
      {!canWrite ? (
        <PermissionNotice
          capability="liability.write"
          testID="liability-view-only"
        />
      ) : null}

      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <View style={[styles.headingTopline, rtl && styles.rowReverse]}>
          <Text
            style={[
              styles.eyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.detail.eyebrow}
          </Text>
          <View
            accessibilityLabel={`${copy.detail.status}: ${liabilityLifecycleLabel(
              liability,
              language
            )}`}
            style={[
              styles.status,
              !active && styles.statusArchived,
              rtl && styles.rowReverse
            ]}
            testID="liability-status"
          >
            <View
              style={[
                styles.statusDot,
                !active && styles.statusDotArchived
              ]}
            />
            <Text
              style={[
                styles.statusLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {liabilityLifecycleLabel(liability, language)}
            </Text>
          </View>
        </View>
        <ScreenTitle size="medium">{liability.name}</ScreenTitle>
        <BodyText muted>
          {liabilityKindLabel(liability.kind, language)}
        </BodyText>
      </View>

      <CommandSurface>
        <View style={[styles.balanceHeading, rtl && styles.rowReverse]}>
          <View style={styles.balanceHeadingCopy}>
            <Text
              style={[
                styles.commandLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.detail.balance}
            </Text>
            <Text
              style={[
                styles.commandMeta,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
          {current
                ? `${copy.detail.balanceAsOf(
                    formatLocalizedDate(current.asOf, language)
                  )}${paidOff ? ` \u00B7 ${copy.detail.paidOffRecorded}` : ""}`
                : copy.detail.noBalance}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={
              amountsHidden
                ? copy.netPosition.showAmounts
                : copy.netPosition.hideAmounts
            }
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onSetAmountsHidden(!amountsHidden)}
            style={({ pressed }) => [
              styles.visibility,
              pressed && styles.commandPressed
            ]}
          >
            {amountsHidden ? (
              <Eye color={colors.white} size={20} weight="regular" />
            ) : (
              <EyeSlash color={colors.white} size={20} weight="regular" />
            )}
          </Pressable>
        </View>
        <Text
          accessibilityLabel={
            currentFormatted
              ? currentFormatted.accessibilityLabel
              : copy.detail.noBalance
          }
          style={[
            styles.balanceValue,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {currentFormatted?.text ?? copy.detail.noBalance}
        </Text>
        {active && canWrite ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenBalance}
            style={({ pressed }) => [
              styles.commandAction,
              rtl && styles.rowReverse,
              pressed && styles.commandPressed
            ]}
            testID="liability-edit"
          >
            <Plus color={colors.carbon} size={20} weight="bold" />
            <Text
              style={[
                styles.commandActionLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {current
                ? copy.detail.updateBalance
                : copy.detail.addBalance}
            </Text>
          </Pressable>
        ) : null}
      </CommandSurface>

      {!active ? (
        <View style={[styles.notice, rtl && styles.rowReverse]}>
          <Archive color={colors.text} size={22} weight="regular" />
          <Text
            style={[
              styles.noticeText,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.detail.archivedNotice}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={[styles.sectionHeader, rtl && styles.rowReverse]}>
          <Text
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.detail.edit}
          </Text>
          {canWrite && !editing ? (
            <Pressable
              accessibilityRole="button"
              onPress={beginEditing}
              style={({ pressed }) => [
                styles.textAction,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
              testID="liability-details-edit"
            >
              <PencilSimple color={colors.text} size={17} />
              <Text
                style={[
                  styles.textActionLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.detail.edit}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {editing ? (
          <View style={styles.editor}>
            {concurrentUpdate ? (
              <View
                style={styles.concurrentUpdate}
                testID="liability-details-concurrent-update"
              >
                <View
                  style={[
                    styles.concurrentUpdateHeading,
                    rtl && styles.rowReverse
                  ]}
                >
                  <Warning
                    color={colors.warning}
                    size={21}
                    weight="regular"
                  />
                  <View style={styles.concurrentUpdateCopy}>
                    <Text
                      accessibilityLiveRegion="assertive"
                      accessibilityRole="alert"
                      style={[
                        styles.concurrentUpdateTitle,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.detail.concurrentUpdateTitle}
                    </Text>
                    <Text
                      style={[
                        styles.concurrentUpdateBody,
                        rtl && styles.arabic,
                        rtl && styles.rtlText
                      ]}
                    >
                      {copy.detail.concurrentUpdateBody}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.editorActions,
                    rtl && styles.rowReverse
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={reloadUpdatedDetails}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      pressed && styles.pressed
                    ]}
                    testID="liability-details-reload"
                  >
                    <Text
                      style={[
                        styles.secondaryActionLabel,
                        rtl && styles.arabicMedium
                      ]}
                    >
                      {copy.detail.reloadUpdatedDetails}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: replaceConfirmed
                    }}
                    disabled={replaceConfirmed}
                    onPress={() => setReplaceConfirmed(true)}
                    style={({ pressed }) => [
                      styles.compactPrimary,
                      pressed && styles.pressed,
                      replaceConfirmed && styles.disabled
                    ]}
                    testID="liability-details-confirm-replace"
                  >
                    <Text
                      style={[
                        styles.compactPrimaryLabel,
                        rtl && styles.arabicMedium
                      ]}
                    >
                      {copy.detail.confirmReplace}
                    </Text>
                  </Pressable>
                </View>
                {replaceConfirmed ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.concurrentUpdateConfirmed,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                    testID="liability-details-replace-confirmed"
                  >
                    {copy.detail.replaceConfirmed}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Field
              error={
                attempted && !name.trim() ? copy.create.nameError : null
              }
              label={copy.create.name}
              maxLength={120}
              onChangeText={setName}
              testID="liability-name"
              value={name}
            />
            <View
              accessibilityRole="radiogroup"
              style={styles.categoryList}
            >
              {LIABILITY_KINDS.map((choice) => {
                const selected = kind === choice;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={choice}
                    onPress={() => setKind(choice)}
                    style={({ pressed }) => [
                      styles.categoryRow,
                      rtl && styles.rowReverse,
                      selected && styles.categorySelected,
                      pressed && styles.pressed
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryLabel,
                        selected && styles.categoryLabelSelected,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {liabilityKindLabel(choice, language)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.editorActions, rtl && styles.rowReverse]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  draftBaseline.current = {
                    id: liability.id,
                    version: liability.version,
                    name: liability.name,
                    kind: liability.kind
                  };
                  setName(liability.name);
                  setKind(liability.kind);
                  setEditing(false);
                  setAttempted(false);
                  setConcurrentUpdate(false);
                  setReplaceConfirmed(false);
                }}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed && styles.pressed
                ]}
              >
                <Text
                  style={[
                    styles.secondaryActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.detail.cancel}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                 accessibilityState={{
                  disabled: saveBlocked
                }}
                disabled={saveBlocked}
                onPress={() => void saveDetails()}
                style={({ pressed }) => [
                  styles.compactPrimary,
                  pressed && styles.pressed,
                  saveBlocked && styles.disabled
                ]}
                testID="liability-details-save"
              >
                <Text
                  style={[
                    styles.compactPrimaryLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.detail.saveDetails}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.detailRows}>
            <View style={[styles.detailRow, rtl && styles.rowReverse]}>
              <Text
                style={[
                  styles.detailLabel,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.create.name}
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {liability.name}
              </Text>
            </View>
            <View style={[styles.detailRow, rtl && styles.rowReverse]}>
              <Text
                style={[
                  styles.detailLabel,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.create.category}
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {liabilityKindLabel(liability.kind, language)}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={[styles.historyHeading, rtl && styles.rowReverse]}>
          <ClockCounterClockwise
            color={colors.text}
            size={22}
            weight="regular"
          />
          <View style={styles.historyHeadingCopy}>
            <Text
              accessibilityRole="header"
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.detail.history}
            </Text>
            <Text
              style={[
                styles.sectionSubtitle,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {copy.detail.historyBody}
            </Text>
          </View>
        </View>
        {formattedHistory.length > 0 ? (
          <View style={styles.historyList}>
            {formattedHistory.map(({ formatted, record }, index) => (
              <View
                accessibilityLabel={`${index === 0 ? copy.detail.current : copy.detail.previous}, ${formatted.accessibilityLabel}, ${copy.detail.balanceAsOf(
                  formatLocalizedDate(record.asOf, language)
                )}`}
                key={record.id}
                style={[styles.historyRow, rtl && styles.rowReverse]}
              >
                <View style={styles.historyCopy}>
                  <Text
                    style={[
                      styles.historyValue,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {formatted.text}
                  </Text>
                  <Text
                    style={[
                      styles.historyDate,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {formatLocalizedDate(record.asOf, language)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyState,
                    index === 0 && styles.historyStateCurrent,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {index === 0
                    ? copy.detail.current
                    : copy.detail.previous}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text
            style={[
              styles.emptyHistory,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.detail.noBalance}
          </Text>
        )}
      </View>

      <View style={[styles.dataBoundary, rtl && styles.rowReverse]}>
        <Warning color={colors.textMuted} size={20} weight="regular" />
        <Text
          style={[
            styles.dataBoundaryText,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.detail.dataBoundary}
        </Text>
      </View>

      {canWrite ? (
        <View style={styles.lifecycle}>
          {active && current && !paidOff ? (
            !paidOffConfirming ? (
              <Pressable
                accessibilityHint={copy.detail.paidOffBody}
                accessibilityRole="button"
                onPress={() => setPaidOffConfirming(true)}
                style={({ pressed }) => [
                  styles.lifecycleAction,
                  rtl && styles.rowReverse,
                  pressed && styles.pressed
                ]}
                testID="liability-mark-paid-off"
              >
                <CheckCircle color={colors.success} size={20} weight="regular" />
                <Text
                  style={[
                    styles.lifecycleActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.detail.markPaidOff}
                </Text>
                <ForwardIcon color={colors.textMuted} size={18} />
              </Pressable>
            ) : (
              <View
                accessibilityLiveRegion="polite"
                style={styles.paidOffConfirm}
              >
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.deleteTitle,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.detail.paidOffTitle}
                </Text>
                <Text
                  style={[
                    styles.deleteBody,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.detail.paidOffBody}
                </Text>
                <View style={[styles.editorActions, rtl && styles.rowReverse]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPaidOffConfirming(false)}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      pressed && styles.pressed
                    ]}
                  >
                    <Text
                      style={[
                        styles.secondaryActionLabel,
                        rtl && styles.arabicMedium
                      ]}
                    >
                      {copy.detail.cancel}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      void onMarkPaidOff(current.currency)
                        .then(() => setPaidOffConfirming(false))
                        .catch(() => undefined);
                    }}
                    style={({ pressed }) => [
                      styles.compactPrimary,
                      pressed && styles.pressed,
                      saving && styles.disabled
                    ]}
                    testID="liability-mark-paid-off-confirm"
                  >
                    <Text
                      style={[
                        styles.compactPrimaryLabel,
                        rtl && styles.arabicMedium
                      ]}
                    >
                      {copy.detail.paidOffConfirm}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() =>
              void onSetLifecycle(active ? "archived" : "active").catch(
                () => undefined
              )
            }
            style={({ pressed }) => [
              styles.lifecycleAction,
              rtl && styles.rowReverse,
              pressed && styles.pressed,
              saving && styles.disabled
            ]}
            testID="liability-status-action"
          >
            <Archive color={colors.text} size={20} weight="regular" />
            <Text
              style={[
                styles.lifecycleActionLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {active ? copy.detail.archive : copy.detail.restore}
            </Text>
            <ForwardIcon color={colors.textMuted} size={18} />
          </Pressable>

          {!deleteConfirming ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setDeleteConfirming(true)}
              style={({ pressed }) => [
                styles.lifecycleAction,
                rtl && styles.rowReverse,
                pressed && styles.pressed
              ]}
              testID="liability-delete"
            >
              <Trash color={colors.danger} size={20} weight="regular" />
              <Text
                style={[
                  styles.deleteLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.detail.delete}
              </Text>
            </Pressable>
          ) : (
            <View
              accessibilityLiveRegion="polite"
              style={styles.deleteConfirm}
            >
              <Text
                accessibilityRole="header"
                style={[
                  styles.deleteTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.detail.deleteTitle}
              </Text>
              <Text
                style={[
                  styles.deleteBody,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.detail.deleteBody}
              </Text>
              <View style={[styles.editorActions, rtl && styles.rowReverse]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDeleteConfirming(false)}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    pressed && styles.pressed
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryActionLabel,
                      rtl && styles.arabicMedium
                    ]}
                  >
                    {copy.detail.deleteCancel}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() =>
                    void onDelete().catch(() => undefined)
                  }
                  style={({ pressed }) => [
                    styles.destructiveAction,
                    pressed && styles.pressed,
                    saving && styles.disabled
                  ]}
                  testID="liability-delete-confirm"
                >
                  <Text
                    style={[
                      styles.destructiveActionLabel,
                      rtl && styles.arabicMedium
                    ]}
                  >
                    {copy.detail.deleteConfirm}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  headingTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  rowReverse: {
    flexDirection: "row-reverse"
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
  eyebrow: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.2
  },
  status: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xs,
    backgroundColor: colors.surface
  },
  statusArchived: {
    backgroundColor: colors.mist
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.round,
    backgroundColor: colors.success
  },
  statusDotArchived: {
    backgroundColor: colors.textMuted
  },
  statusLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16
  },
  balanceHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  balanceHeadingCopy: {
    flex: 1,
    gap: 2
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  commandMeta: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  balanceValue: {
    color: colors.white,
    fontFamily: typography.displayBold,
    fontSize: 30,
    lineHeight: 38,
    fontVariant: ["tabular-nums"]
  },
  visibility: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: themes.dark.surfaceQuiet
  },
  commandAction: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.volt
  },
  commandActionLabel: {
    color: colors.carbon,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  commandPressed: {
    opacity: 0.78
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  noticeText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  section: {
    gap: spacing.md
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 21,
    lineHeight: 27
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  textAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  textActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: "underline"
  },
  editor: {
    gap: spacing.md
  },
  concurrentUpdate: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.sm,
    backgroundColor: colors.warningQuiet
  },
  concurrentUpdateHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  concurrentUpdateCopy: {
    flex: 1,
    gap: spacing.xs
  },
  concurrentUpdateTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  concurrentUpdateBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  concurrentUpdateConfirmed: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  categoryList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  categoryRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  categorySelected: {
    backgroundColor: colors.carbon
  },
  categoryLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  categoryLabelSelected: {
    color: colors.white,
    fontFamily: typography.bodyMedium
  },
  editorActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm
  },
  secondaryAction: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface
  },
  secondaryActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  compactPrimary: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.carbon
  },
  compactPrimaryLabel: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  detailRows: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  detailRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  detailLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  detailValue: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right"
  },
  historyHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  historyHeadingCopy: {
    flex: 1,
    gap: 2
  },
  historyList: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  historyRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  historyCopy: {
    flex: 1,
    gap: 2
  },
  historyValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22,
    fontVariant: ["tabular-nums"]
  },
  historyDate: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  historyState: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  historyStateCurrent: {
    color: colors.success
  },
  emptyHistory: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  dataBoundary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  dataBoundaryText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  lifecycle: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  lifecycleAction: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  lifecycleActionLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  deleteLabel: {
    flex: 1,
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  deleteConfirm: {
    gap: spacing.sm,
    paddingVertical: spacing.lg
  },
  paidOffConfirm: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  deleteTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 19,
    lineHeight: 25
  },
  deleteBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  destructiveAction: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.danger
  },
  destructiveActionLabel: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  notFound: {
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  pressed: {
    opacity: 0.66
  },
  disabled: {
    opacity: 0.42
  }
});
