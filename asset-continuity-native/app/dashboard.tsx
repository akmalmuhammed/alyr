import { useRouter } from "expo-router";
import { ChartDonut } from "phosphor-react-native";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  PortfolioDashboard,
  type PortfolioReviewIntent
} from "@/components/PortfolioDashboard";
import { PermissionNotice } from "@/components/PermissionDenied";
import {
  AppScreen,
  BodyText,
  PrimaryButton,
  ScreenTitle
} from "@/components/ui";
import { useSecondarySurfaceCopy } from "@/i18n/secondarySurfaceCopy";
import { portfolioReviewRoute } from "@/navigation/portfolioReview";
import { usePortfolioPrivacy } from "@/privacy/PortfolioPrivacyProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function DashboardScreen() {
  const router = useRouter();
  const { copy, rtl } = useSecondarySurfaceCopy();
  const { amountsHidden, setAmountsHidden } = usePortfolioPrivacy();
  const {
    can,
    error,
    loading,
    recordedPortfolioValues,
    workspace
  } = useWorkspace();

  if (loading) {
    return (
      <AppScreen scroll={false} testID="portfolio-loading">
        <View
          accessibilityLabel={copy.portfolio.preparing}
          accessibilityLiveRegion="polite"
          style={styles.centerState}
        >
          <ActivityIndicator color={colors.text} size="small" />
          <Text
            style={[
              styles.stateTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.portfolio.preparing}
          </Text>
          <Text
            style={[
              styles.stateDetail,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.portfolio.preparingDetail}
          </Text>
        </View>
      </AppScreen>
    );
  }

  if (!workspace) {
    return (
      <AppScreen testID="portfolio-unavailable">
        <View
          style={[
            styles.emptyHeading,
            rtl && styles.emptyHeadingRtl
          ]}
        >
          <ChartDonut color={colors.text} size={28} weight="regular" />
          <ScreenTitle size="medium">
            {copy.portfolio.unavailableTitle}
          </ScreenTitle>
          <BodyText muted>
            {copy.portfolio.unavailableDetail}
            {error ? ` ${copy.portfolio.unavailablePreserved}` : ""}
          </BodyText>
        </View>
        <PrimaryButton
          label={copy.portfolio.continueSetup}
          onPress={() => router.replace("/")}
        />
      </AppScreen>
    );
  }

  const reviewAssets = (intent: PortfolioReviewIntent) => {
    router.push(portfolioReviewRoute(intent));
  };

  return (
    <AppScreen safeEdges={["top"]} testID="portfolio-screen">
      {!can("asset.write") ? (
        <PermissionNotice
          capability="asset.write"
          testID="portfolio-view-only-notice"
        />
      ) : null}
      <PortfolioDashboard
        amountsHidden={amountsHidden}
        language={workspace.language}
        {...(can("asset.write")
          ? { onAddAsset: () => router.push("/capture") }
          : {})}
        onOpenAsset={(assetId) => router.push(`/asset/${assetId}`)}
        onOpenSubject={(subject) =>
          router.push(
            subject.kind === "asset"
              ? `/asset/${subject.assetId}`
              : `/place/${subject.placeId}`
          )
        }
        onAmountsHiddenChange={setAmountsHidden}
        onReviewAssets={reviewAssets}
        onReviewPlaces={() => router.push("/atlas")}
        showTitle={false}
        valueRecords={recordedPortfolioValues}
        workspace={workspace}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl
  },
  stateTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center"
  },
  stateDetail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  emptyHeading: {
    maxWidth: 520,
    gap: spacing.sm
  },
  emptyHeadingRtl: {
    alignItems: "flex-end"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  rtlText: {
    textAlign: "center",
    writingDirection: "rtl"
  }
});
