import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  ChartDonut,
  CheckCircle,
  GlobeHemisphereWest,
  LockKey,
  MapPin,
  Plus,
  WarningCircle
} from "phosphor-react-native";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { AssetListItem } from "@/components/AssetListItem";
import { AssetPhotoPreview } from "@/components/AssetPhotoPreview";
import { PermissionNotice } from "@/components/PermissionDenied";
import { SyncTruth } from "@/components/SyncTruth";
import {
  AppScreen,
  BodyText,
  BrandMark,
  CommandSurface,
  IconButton,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section,
  SectionHeader
} from "@/components/ui";
import type { NativeAsset } from "@/domain/model";
import { isAssetActive } from "@/domain/model";
import { buildNetPositionSnapshot } from "@/domain/netPosition";
import { buildPortfolioSnapshot } from "@/domain/portfolio";
import {
  buildTodayRegisterHealth,
  selectTodayCommandState,
  selectTodayPlaceOverview,
  type TodayAttentionTask
} from "@/domain/today";

import {
  formatLocalizedNumber,
  formatLocalizedPercent,
  itemCount,
  placeCount,
  portfolioAccessibilityLabel,
  spaceCount,
  todayHouseholdSummary,
  todayPlaceLocationSummary,
  todayRegionSummary,
  type CoreJourneyCopy,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import {
  useWorkspace,
  type WorkspaceSyncRuntimeState
} from "@/state/WorkspaceProvider";
import {
  formatRecordedValue,
  formatSignedRecordedValue,
  valueVisibilityFromHidden
} from "@/privacy/ValueVisibility";
import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";
import { sampleActivationDestination } from "@/navigation/sampleActivation";
import {
  colors,
  radius,
  spacing,
  themes,
  typography
} from "@/theme/tokens";

type GapKind = "identity" | "photo" | "location" | "evidence";

/**
 * Today leads with the user's next decision. Sync becomes an interrupt only
 * when ALYR has a concrete error or conflict that needs review.
 */
export function shouldPromoteSyncTruth(
  sync: Pick<
    WorkspaceSyncRuntimeState,
    "conflicts" | "lastError" | "status"
  >
): boolean {
  return (
    sync.conflicts.length > 0 ||
    sync.status === "needs-attention" ||
    Boolean(sync.lastError)
  );
}

function gapCopy(
  asset: NativeAsset,
  gap: GapKind,
  copy: CoreJourneyCopy
): {
  readonly title: string;
  readonly detail: string;
  readonly action: string;
} {
  if (gap === "location") {
    return {
      title: `${copy.today.locationGap} ${asset.name}`,
      detail: copy.today.locationGapDetail,
      action: copy.today.reviewLocation
    };
  }
  if (gap === "evidence") {
    return {
      title: `${copy.today.proofGap} ${asset.name}`,
      detail: copy.today.proofGapDetail,
      action: copy.today.addProof
    };
  }
  if (gap === "photo") {
    return {
      title: `${copy.today.photoGap} ${asset.name}`,
      detail: copy.today.photoGapDetail,
      action: copy.today.addPhoto
    };
  }
  return {
    title: `${copy.today.identityGap} ${asset.name}`,
    detail: copy.today.identityGapDetail,
    action: copy.today.reviewPassport
  };
}

function gapHref(asset: NativeAsset, gap: GapKind): string {
  return `/asset-edit?assetId=${encodeURIComponent(asset.id)}&focus=${gap}`;
}

function attentionCopy(
  task: TodayAttentionTask,
  copy: CoreJourneyCopy
): {
  readonly title: string;
  readonly detail: string;
  readonly action: string;
} {
  if (task.kind === "asset-gap") {
    return gapCopy(
      task.asset,
      task.readiness.nextItem.id,
      copy
    );
  }
  if (task.kind === "property-pin") {
    return {
      title: `${copy.today.propertyPinGap} ${task.place.name}`,
      detail: copy.today.propertyPinGapDetail,
      action: copy.today.confirmPropertyPin
    };
  }
  if (task.kind === "liability-balance") {
    return task.state === "missing"
      ? {
          title: `${copy.today.liabilityBalanceGap} ${task.liability.name}`,
          detail: copy.today.liabilityBalanceGapDetail,
          action: copy.today.reviewBalance
        }
      : {
          title: `${copy.today.liabilityBalanceStale} ${task.liability.name}`,
          detail: copy.today.liabilityBalanceStaleDetail,
          action: copy.today.reviewBalance
        };
  }
  if (task.kind === "liability-review") {
    return {
      title: copy.today.liabilityReviewGap,
      detail:
        task.state === "expired"
          ? copy.today.liabilityReviewExpiredDetail
          : copy.today.liabilityReviewChangedDetail,
      action: copy.today.reviewLiabilities
    };
  }
  return {
    title: `${copy.today.recordedValueStale} ${task.name}`,
    detail: copy.today.recordedValueStaleDetail,
    action: copy.today.reviewRecordedValue
  };
}

function attentionHref(
  task: TodayAttentionTask,
  editable: boolean
): string {
  if (task.kind === "asset-gap") {
    return editable
      ? gapHref(task.asset, task.readiness.nextItem.id)
      : `/asset/${task.asset.id}`;
  }
  if (task.kind === "property-pin") {
    return editable
      ? `/place-pin?placeId=${encodeURIComponent(task.place.id)}`
      : `/place/${task.place.id}`;
  }
  if (task.kind === "liability-balance") {
    return editable
      ? `/liability-balance?liabilityId=${encodeURIComponent(
          task.liability.id
        )}`
      : `/liability/${task.liability.id}`;
  }
  if (task.kind === "liability-review") {
    return "/dashboard";
  }
  if (task.subject.kind === "asset") {
    return editable
      ? `/asset-value?assetId=${encodeURIComponent(
          task.subject.assetId
        )}`
      : `/asset/${task.subject.assetId}`;
  }
  if (task.subject.kind === "liability") {
    return editable
      ? `/liability-balance?liabilityId=${encodeURIComponent(
          task.subject.liabilityId
        )}`
      : `/liability/${task.subject.liabilityId}`;
  }
  return editable
    ? `/asset-value?placeId=${encodeURIComponent(
        task.subject.placeId
      )}`
    : `/place/${task.subject.placeId}`;
}

function TodayPortfolioCard({
  accessibilityLabel,
  copy,
  emptyLabel,
  label,
  meta,
  onPress,
  rtl,
  totals
}: {
  readonly accessibilityLabel: string;
  readonly copy: CoreJourneyCopy;
  readonly emptyLabel: string;
  readonly label: string;
  readonly meta: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly totals: readonly {
    readonly currency: string;
    readonly compact: string;
  }[];
}) {
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  const rtlRow =
    rtl && Platform.OS !== "web" ? styles.rowReverse : undefined;
  return (
    <Section>
      <Pressable
        accessibilityHint={copy.today.portfolioHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.portfolioRow,
          rtlRow,
          pressed && styles.pressed
        ]}
        testID="today-portfolio-entry"
      >
        <View style={styles.portfolioCopy}>
          <Text
            style={[
              styles.portfolioLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {label}
          </Text>
          {totals.length === 0 ? (
            <Text
              style={[
                styles.portfolioValue,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {emptyLabel}
            </Text>
          ) : (
            <View style={styles.portfolioValues}>
              {totals.map((total) => (
                <Text
                  key={total.currency}
                  style={[
                    styles.portfolioValue,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {total.compact}
                </Text>
              ))}
            </View>
          )}
          <Text
            style={[
              styles.portfolioMeta,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {meta}
          </Text>
        </View>
        <ForwardIcon color={colors.textMuted} size={20} />
      </Pressable>
    </Section>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { mode, session } = useAuthFlow();
  const {
    can,
    pendingOperationCount,
    recordedPortfolioValues,
    sync,
    workspace
  } = useWorkspace();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const financialCopy = getPortfolioExperienceCopy(language);
  if (!workspace) return null;
  const canWriteAssets = can("asset.write");
  const canWritePlaces = can("place.write");
  const sampleActivationRoute = sampleActivationDestination({
    canManageHousehold: can("household.manage"),
    mode,
    session,
    workspaceMode: workspace.mode
  });
  const ForwardIcon = rtl ? ArrowLeft : ArrowRight;
  // React Native Web already applies the inherited RTL direction to row
  // layout. Reversing those rows again restores LTR visual order; native
  // platforms still need the explicit row reversal.
  const rtlRow =
    rtl && Platform.OS !== "web" ? styles.rowReverse : undefined;
  const activeAssets = workspace.assets.filter(isAssetActive);
  const registerHealth = buildTodayRegisterHealth(
    workspace,
    recordedPortfolioValues
  );
  const attention = registerHealth.tasks;
  const registerReadiness = registerHealth.readinessPercent;
  const firstTask = attention[0];
  const primary = firstTask
    ? attentionCopy(firstTask, copy)
    : null;
  const commandState = selectTodayCommandState(
    registerHealth.recordCount,
    attention.length
  );
  const command =
    commandState === "empty"
      ? {
          eyebrow: copy.today.startHere,
          title: copy.today.emptyTitle,
          detail: copy.today.emptyDetail,
          action: copy.today.addFirstItem,
          icon: Plus
        }
      : commandState === "ready"
        ? {
            eyebrow: copy.today.registerReady,
            title: copy.today.readyTitle,
            detail: copy.today.readyDetail,
            action: copy.today.addAnotherItem,
            icon: Plus
          }
        : {
            eyebrow: copy.today.nextToProtect,
            title: primary?.title ?? copy.today.reviewNext,
            detail:
              primary?.detail ??
              copy.today.reviewNextDetail,
            action: primary?.action ?? copy.today.reviewPassport,
            icon:
              firstTask?.kind === "property-pin"
                ? MapPin
                : firstTask?.kind === "liability-balance" ||
                    firstTask?.kind === "liability-review" ||
                    firstTask?.kind === "recorded-value-review"
                  ? ChartDonut
                  : ForwardIcon
          };
  const CommandIcon = command.icon;
  const summary = todayHouseholdSummary(
    activeAssets.length,
    workspace.places.length,
    language
  );
  const placeOverview = selectTodayPlaceOverview(workspace.places);
  const regionSummary = todayRegionSummary(
    placeOverview.regions,
    language
  );
  const locationSummary = todayPlaceLocationSummary(
    placeOverview.confirmedCount,
    placeOverview.confirmationNeededCount,
    placeOverview.missingPinCount,
    language
  );
  // Today is glanceable and may appear while someone is looking over the
  // owner's shoulder. Exact financial amounts are revealed only inside the
  // dedicated Portfolio surface.
  const valueVisibility = valueVisibilityFromHidden(true);
  const portfolioCard = (() => {
    if (can("liability.read")) {
      const netPosition = buildNetPositionSnapshot(workspace);
      const totals = netPosition.byCurrency.slice(0, 2).map((line) => {
        if (line.recordedNetPositionMinor === null) {
          const unavailable = `${line.currency} ${financialCopy.netPosition.reviewRequired}`;
          return {
            currency: line.currency,
            compact: unavailable,
            exact: unavailable
          };
        }
        const formatted = formatSignedRecordedValue({
          amountMinor: line.recordedNetPositionMinor,
          currency: line.currency,
          language,
          visibility: valueVisibility
        });
        return {
          currency: line.currency,
          compact: formatted.text,
          exact: formatted.accessibilityLabel
        };
      });
      const summary =
        totals.length === 0
          ? financialCopy.netPosition.noTotal
          : totals.map((total) => total.exact).join("; ");
      const status = financialCopy.netPosition.status[netPosition.status];
      const remainingCurrencyCount =
        netPosition.byCurrency.length - totals.length;
      const moreCurrencyLabel =
        remainingCurrencyCount > 0
          ? financialCopy.netPosition.moreCurrencies(
              remainingCurrencyCount
            )
          : null;
      return {
        accessibilityLabel: [
          `${financialCopy.netPosition.net}: ${summary}.`,
          status,
          moreCurrencyLabel
        ]
          .filter(Boolean)
          .join(" "),
        emptyLabel: financialCopy.netPosition.noTotal,
        label: financialCopy.netPosition.eyebrow,
        meta: [
          status,
          financialCopy.netPosition.currenciesSeparate,
          moreCurrencyLabel
        ]
          .filter(Boolean)
          .join(" \u00B7 "),
        totals
      };
    }

    const portfolio = buildPortfolioSnapshot(
      workspace,
      recordedPortfolioValues
    );
    const totals = portfolio.currencyTotals.slice(0, 2).map((total) => {
      if (total.amountMinor === null) {
        const unavailable = `${total.currency} ${copy.today.totalUnavailable}`;
        return {
          currency: total.currency,
          compact: unavailable,
          exact: unavailable
        };
      }
      const compact = formatRecordedValue({
        amountMinor: total.amountMinor,
        compact: true,
        currency: total.currency,
        language,
        visibility: valueVisibility
      });
      const exact = formatRecordedValue({
        amountMinor: total.amountMinor,
        currency: total.currency,
        language,
        visibility: valueVisibility
      });
      return {
        currency: total.currency,
        compact: compact.text,
        exact: exact.accessibilityLabel
      };
    });
    const summary =
      totals.length === 0
        ? copy.today.noValues
        : totals.map((total) => total.exact).join("; ");
    const coverage =
      language === "ar"
        ? `${formatLocalizedNumber(
            portfolio.valuedEntryCount,
            language
          )} من ${formatLocalizedNumber(
            portfolio.valuableCount,
            language
          )} ${copy.today.valueCoverage}`
        : `${formatLocalizedNumber(
            portfolio.valuedEntryCount,
            language
          )} of ${formatLocalizedNumber(
            portfolio.valuableCount,
            language
          )} items and properties ${copy.today.valueCoverage}`;
    const remainingCurrencyCount =
      portfolio.currencyTotals.length - totals.length;
    const moreCurrencyLabel =
      remainingCurrencyCount > 0
        ? financialCopy.netPosition.moreCurrencies(
            remainingCurrencyCount
          )
        : null;
    return {
      accessibilityLabel: [
        portfolioAccessibilityLabel(
          summary,
          portfolio.valuedEntryCount,
          portfolio.valuableCount,
          language
        ),
        moreCurrencyLabel
      ]
        .filter(Boolean)
        .join(". "),
      emptyLabel: copy.today.noValues,
      label: copy.today.portfolio,
      meta: [
        coverage,
        copy.today.currenciesSeparate,
        moreCurrencyLabel
      ]
        .filter(Boolean)
        .join(" \u00B7 "),
      totals
    };
  })();
  const readinessPercent = formatLocalizedPercent(
    registerReadiness,
    language
  );
  const promoteSyncTruth = shouldPromoteSyncTruth(sync);
  const canEditTask = (task: TodayAttentionTask): boolean => {
    if (task.kind === "property-pin") return canWritePlaces;
    if (
      task.kind === "liability-balance" ||
      task.kind === "liability-review"
    ) {
      return can("liability.write");
    }
    if (task.kind === "recorded-value-review") {
      return task.subject.kind === "place"
        ? canWritePlaces
        : task.subject.kind === "liability"
          ? can("liability.write")
          : canWriteAssets;
    }
    return canWriteAssets;
  };
  const canOpenCommand =
    commandState === "incomplete" && firstTask
      ? canEditTask(firstTask)
      : canWriteAssets || canWritePlaces;
  const syncTruth = (
    <SyncTruth
      language={language}
      onPress={() =>
        router.push(
          sync.conflicts.length > 0 ? "/sync-conflicts" : "/vault"
        )
      }
      pendingOperationCount={pendingOperationCount}
      sync={sync}
    />
  );
  const openCommand = () =>
    commandState === "incomplete" && firstTask
      ? router.push(attentionHref(firstTask, true))
      : router.push(
          canWriteAssets ? "/capture" : "/capture?intent=place"
        );

  return (
    <AppScreen testID="home-screen">
      <View style={[styles.topBar, rtlRow]}>
        <View style={[styles.identity, rtlRow]}>
          <BrandMark compact />
          <View style={styles.identityCopy}>
            <Text
              style={[
                styles.householdName,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {workspace.household.name}
            </Text>
            <Text
              style={[
                styles.modeLabel,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {workspace.mode === "sample"
                ? copy.today.demoHousehold
                : copy.today.privateRegister}
            </Text>
          </View>
        </View>
        {canWriteAssets ? (
          <View style={[styles.topActions, rtlRow]}>
            <IconButton
              icon={Plus}
              label={copy.items.addItem}
              onPress={() => router.push("/capture")}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.heading}>
        <ScreenTitle>{copy.today.title}</ScreenTitle>
        <BodyText muted>{summary}</BodyText>
      </View>

      {sampleActivationRoute ? (
        <View
          style={styles.sampleActivation}
          testID="today-sample-activation"
        >
          <Text
            style={[
              styles.sampleActivationEyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.today.sampleNextEyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={[
              styles.sampleActivationTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.today.sampleNextTitle}
          </Text>
          <Text
            style={[
              styles.sampleActivationBody,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.today.sampleNextBody}
          </Text>
          <View testID="today-primary-action">
            <PrimaryButton
              icon={LockKey}
              label={copy.vault.createMyPrivateHousehold}
              onPress={() => router.push(sampleActivationRoute)}
            />
          </View>
        </View>
      ) : null}

      {promoteSyncTruth ? syncTruth : null}

      {!canWriteAssets ? (
        <PermissionNotice
          capability="asset.write"
          testID="today-view-only-notice"
        />
      ) : null}

      <CommandSurface>
        <View
          style={[
            styles.commandHeader,
            rtlRow
          ]}
        >
          <Text
            style={[
              styles.commandLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {command.eyebrow}
          </Text>
          <Text
            style={[
              styles.commandReadiness,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.today.registerReadiness} · {readinessPercent}
          </Text>
        </View>
        <View
          accessibilityLabel={`${copy.today.registerReadiness}: ${readinessPercent}`}
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: registerReadiness
          }}
          style={styles.commandProgressTrack}
        >
          <View
            style={[
              styles.commandProgressFill,
              rtl && styles.commandProgressFillRtl,
              { width: `${registerReadiness}%` }
            ]}
          />
        </View>
        <View
          style={[
            styles.commandMain,
            rtlRow
          ]}
        >
          {firstTask?.kind === "asset-gap" ? (
            <AssetPhotoPreview
              active
              asset={firstTask.asset}
              evidence={workspace.evidence}
              variant="command"
            />
          ) : (
            <View style={styles.commandIcon}>
              <CommandIcon
                color={colors.volt}
                size={26}
                weight="regular"
              />
            </View>
          )}
          <View style={styles.commandCopy}>
            <Text
              style={[
                styles.commandTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {command.title}
            </Text>
            <Text
              style={[
                styles.commandDetail,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {command.detail}
            </Text>
          </View>
        </View>
        {canOpenCommand ? (
          sampleActivationRoute ? (
            <View testID="today-secondary-command-action">
              <SecondaryButton
                icon={command.icon}
                label={command.action}
                onPress={openCommand}
              />
            </View>
          ) : (
            <View testID="today-primary-action">
              <PrimaryButton
                icon={command.icon}
                label={command.action}
                onPress={openCommand}
              />
            </View>
          )
        ) : null}
      </CommandSurface>

      {!promoteSyncTruth ? syncTruth : null}

      <TodayPortfolioCard
        accessibilityLabel={portfolioCard.accessibilityLabel}
        copy={copy}
        emptyLabel={portfolioCard.emptyLabel}
        label={portfolioCard.label}
        meta={portfolioCard.meta}
        onPress={() => router.push("/dashboard")}
        rtl={rtl}
        totals={portfolioCard.totals}
      />

      {attention.length > 1 ? (
        <Section>
          <SectionHeader title={copy.today.needsAttention} />
          {attention.slice(1, 3).map((attentionTask) => {
            const task = attentionCopy(attentionTask, copy);
            return (
              <Pressable
                accessibilityRole="button"
                key={attentionTask.id}
                onPress={() =>
                  router.push(
                    attentionHref(
                      attentionTask,
                      canEditTask(attentionTask)
                    )
                  )
                }
                style={({ pressed }) => [
                  styles.taskRow,
                  rtlRow,
                  pressed && styles.pressed
                ]}
              >
                <View style={styles.taskSignal} />
                <View style={styles.taskCopy}>
                  <Text
                    style={[
                      styles.taskTitle,
                      rtl && styles.arabicMedium,
                      rtl && styles.rtlText
                    ]}
                  >
                    {task.title}
                  </Text>
                  <Text
                    style={[
                      styles.taskDetail,
                      rtl && styles.arabic,
                      rtl && styles.rtlText
                    ]}
                  >
                    {task.detail}
                  </Text>
                </View>
                <ForwardIcon color={colors.textMuted} size={20} />
              </Pressable>
            );
          })}
        </Section>
      ) : null}

      <Section>
        <SectionHeader
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.today.viewAllPlaces}
              onPress={() => router.push("/assets?view=places")}
              style={styles.textAction}
            >
              <Text
                style={[
                  styles.textActionLabel,
                  rtl && styles.arabicMedium
                ]}
              >
                {copy.today.viewPlaces}
              </Text>
            </Pressable>
          }
          title={copy.items.yourPlaces}
        />
        <Pressable
          accessibilityLabel={[
            copy.stack.atlas,
            placeCount(placeOverview.placeCount, language),
            placeOverview.placeCount > 0 ? regionSummary : null,
            placeOverview.placeCount > 0
              ? locationSummary
              : copy.today.addPlaceDetail
          ]
            .filter(Boolean)
            .join(". ")}
          accessibilityHint={copy.today.atlasHint}
          accessibilityRole="button"
          onPress={() => router.push("/atlas")}
          style={({ pressed }) => [
            styles.atlas,
            pressed && styles.pressed
          ]}
          testID="today-atlas-entry"
        >
          <View
            style={[
              styles.atlasHeader,
              rtlRow
            ]}
          >
            <View style={styles.atlasIcon}>
              <GlobeHemisphereWest
                color={colors.text}
                size={24}
                weight="regular"
              />
            </View>
            <View style={styles.atlasCopy}>
              <Text
                style={[
                  styles.atlasKicker,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.today.locationOverview}
              </Text>
              <Text
                style={[
                  styles.atlasTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {placeCount(placeOverview.placeCount, language)}
              </Text>
              <Text
                style={[
                  styles.atlasMeta,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {placeOverview.placeCount > 0
                  ? regionSummary
                  : copy.today.addPlaceDetail}
              </Text>
            </View>
          </View>

          {placeOverview.placeCount > 0 ? (
            <View
              style={[
                styles.atlasStatus,
                placeOverview.reviewCount > 0 &&
                  styles.atlasStatusAttention,
                rtlRow
              ]}
            >
              {placeOverview.reviewCount > 0 ? (
                <WarningCircle
                  color={colors.warning}
                  size={20}
                  weight="regular"
                />
              ) : (
                <CheckCircle
                  color={colors.success}
                  size={20}
                  weight="regular"
                />
              )}
              <Text
                style={[
                  styles.atlasStatusText,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {locationSummary}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.atlasAction,
              rtlRow
            ]}
          >
            <Text
              style={[
                styles.atlasActionLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.today.openAtlas}
            </Text>
            <ForwardIcon color={colors.text} size={18} />
          </View>
        </Pressable>

        {workspace.places.slice(0, 2).map((place) => {
          const assetCount = activeAssets.filter(
            (asset) => asset.placeId === place.id
          ).length;
          return (
            <Pressable
              accessibilityRole="button"
              key={place.id}
              onPress={() => router.push(`/place/${place.id}`)}
              style={({ pressed }) => [
                styles.placeRow,
                rtlRow,
                pressed && styles.pressed
              ]}
            >
              <MapPin color={colors.text} size={22} weight="regular" />
              <View style={styles.placeCopy}>
                <Text
                  style={[
                    styles.placeName,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {place.name}
                </Text>
                <Text
                  style={[
                    styles.placeMeta,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {place.regionLabel} · {itemCount(assetCount, language)} ·{" "}
                  {spaceCount(place.rooms.length, language)}
                </Text>
              </View>
              <ForwardIcon color={colors.textMuted} size={20} />
            </Pressable>
          );
        })}

        {workspace.places.length === 0 && canWritePlaces ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/capture?intent=place")}
            style={styles.addPlace}
          >
            <Plus color={colors.text} size={20} />
            <Text
              style={[
                styles.addPlaceLabel,
                rtl && styles.arabicMedium
              ]}
            >
              {copy.today.addFirstPlace}
            </Text>
          </Pressable>
        ) : null}
      </Section>

      {activeAssets.length > 0 ? (
        <Section>
          <SectionHeader
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.today.viewAllItems}
                onPress={() => router.push("/assets?view=items")}
                style={styles.textAction}
              >
                <Text
                  style={[
                    styles.textActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copy.today.seeAll}
                </Text>
              </Pressable>
            }
            title={copy.today.itemsSection}
          />
          {activeAssets.slice(0, 3).map((asset) => (
            <AssetListItem
              asset={asset}
              evidence={workspace.evidence}
              key={asset.id}
              onPress={() =>
                router.push(
                  `/asset/${asset.id}?retrievalSource=asset-list`
                )
              }
              places={workspace.places}
            />
          ))}
        </Section>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rowReverse: {
    flexDirection: "row-reverse"
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  identityCopy: {
    flex: 1,
    gap: 1
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  householdName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 19
  },
  modeLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 16
  },
  heading: {
    gap: spacing.xs
  },
  sampleActivation: {
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  sampleActivationEyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.1
  },
  sampleActivationTitle: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.35
  },
  sampleActivationBody: {
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.2
  },
  commandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  commandReadiness: {
    flexShrink: 1,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "right",
    fontVariant: ["tabular-nums"]
  },
  commandProgressTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: themes.dark.surfaceQuiet
  },
  commandProgressFill: {
    height: "100%",
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  commandProgressFillRtl: {
    alignSelf: "flex-end"
  },
  commandMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md
  },
  commandCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs
  },
  commandIcon: {
    width: 56,
    height: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: themes.dark.surfaceQuiet
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3
  },
  commandDetail: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  taskRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  portfolioRow: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  portfolioCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  portfolioLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1
  },
  portfolioValues: {
    gap: 1
  },
  portfolioValue: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"]
  },
  portfolioMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  taskSignal: {
    width: 8,
    height: 8,
    borderRadius: radius.round,
    backgroundColor: colors.volt
  },
  taskCopy: {
    flex: 1,
    gap: 2
  },
  taskTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  taskDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  textAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    marginEnd: -spacing.xs
  },
  textActionLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    textDecorationLine: "underline"
  },
  atlas: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong
  },
  atlasHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md
  },
  atlasIcon: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  atlasCopy: {
    flex: 1,
    gap: 2
  },
  atlasKicker: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.9
  },
  atlasTitle: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.35
  },
  atlasMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22
  },
  atlasStatus: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  atlasStatusAttention: {
    borderTopColor: colors.warning
  },
  atlasStatusText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  atlasAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  atlasActionLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  placeRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  placeCopy: {
    flex: 1,
    gap: 2
  },
  placeName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22
  },
  placeMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  addPlace: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  addPlaceLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15
  },
  pressed: {
    opacity: 0.65
  },
  arabic: {
    fontFamily: typography.arabic,
    letterSpacing: 0
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
