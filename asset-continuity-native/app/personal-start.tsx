import { Redirect, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Camera,
  CheckCircle,
  CloudSlash,
  DeviceMobile,
  MapPin
} from "phosphor-react-native";
import type { Icon } from "phosphor-react-native";
import { useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton
} from "@/components/ui";
import {
  SAMPLE_CONVERSION_COPY,
  useSampleConversionCopy
} from "@/i18n/sampleConversionCopy";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type ConversionStage = "review" | "converting" | "choose";
type SampleConversionCopy =
  (typeof SAMPLE_CONVERSION_COPY)[keyof typeof SAMPLE_CONVERSION_COPY];

export default function PersonalStartScreen() {
  const router = useRouter();
  const { mode } = useAuthFlow();
  const {
    workspace,
    replaceWithPersonalWorkspace
  } = useWorkspace();
  const { copy, rtl } = useSampleConversionCopy();
  const startedFromSample = useRef(workspace?.mode === "sample");
  const [stage, setStage] = useState<ConversionStage>("review");
  const [failure, setFailure] = useState<string | null>(null);
  const BackIcon = rtl ? ArrowRight : ArrowLeft;

  if (
    mode !== "preview" ||
    !workspace ||
    !startedFromSample.current
  ) {
    return <Redirect href={PRIMARY_ROUTES.today} />;
  }

  const returnToVault = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(PRIMARY_ROUTES.vault);
  };

  const convert = async () => {
    if (stage !== "review") return;
    setStage("converting");
    setFailure(null);
    try {
      await replaceWithPersonalWorkspace();
      setStage("choose");
    } catch {
      setStage("review");
      setFailure(copy.failure);
    }
  };

  const openFirstItem = () => {
    router.replace({
      pathname: "/capture",
      params: { returnTo: "today" }
    });
  };

  const openFirstPlace = () => {
    router.replace({
      pathname: "/capture",
      params: { intent: "place", returnTo: "today" }
    });
  };

  return (
    <AppScreen testID="personal-start-screen">
      <View style={[styles.routeHeader, rtl && styles.rowReverse]}>
        {stage === "review" ? (
          <LocalizedRouteBack
            label={copy.back}
            onPress={returnToVault}
            rtl={rtl}
            testID="personal-start-back"
          />
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <View style={styles.progressRule}>
          <View
            style={[
              styles.progressValue,
              stage === "choose" && styles.progressComplete
            ]}
          />
        </View>
      </View>

      {stage === "choose" ? (
        <ChoiceStage
          copy={copy}
          onFirstItem={openFirstItem}
          onFirstPlace={openFirstPlace}
          onToday={() => router.replace(PRIMARY_ROUTES.today)}
          rtl={rtl}
        />
      ) : (
        <>
          <View style={styles.heading}>
            <Text
              style={[
                styles.eyebrow,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.reviewEyebrow}
            </Text>
            <ScreenTitle>{copy.reviewTitle}</ScreenTitle>
            <BodyText muted>{copy.reviewBody}</BodyText>
          </View>

          {failure ? (
            <ErrorBanner
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          ) : null}

          <View style={styles.consequenceSection}>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.textRight
              ]}
            >
              {copy.consequenceTitle}
            </Text>
            <ConsequenceRow
              body={copy.sampleRemovedBody}
              icon={Archive}
              rtl={rtl}
              title={copy.sampleRemovedTitle}
            />
            <ConsequenceRow
              body={copy.localOnlyBody}
              icon={CloudSlash}
              rtl={rtl}
              title={copy.localOnlyTitle}
            />
            <ConsequenceRow
              body={copy.sessionBody}
              icon={DeviceMobile}
              rtl={rtl}
              title={copy.sessionTitle}
            />
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              accessibilityHint={copy.localOnlyBody}
              disabled={stage === "converting"}
              icon={CheckCircle}
              label={
                stage === "converting"
                  ? copy.confirming
                  : copy.confirm
              }
              loading={stage === "converting"}
              onPress={() => void convert()}
            />
            <SecondaryButton
              disabled={stage === "converting"}
              icon={BackIcon}
              label={copy.keepSample}
              onPress={returnToVault}
            />
          </View>
        </>
      )}
    </AppScreen>
  );
}

function ChoiceStage({
  copy,
  onFirstItem,
  onFirstPlace,
  onToday,
  rtl
}: {
  readonly copy: SampleConversionCopy;
  readonly onFirstItem: () => void;
  readonly onFirstPlace: () => void;
  readonly onToday: () => void;
  readonly rtl: boolean;
}) {
  return (
    <>
      <CommandSurface style={styles.readySurface}>
        <CheckCircle color={colors.volt} size={34} weight="regular" />
        <Text
          style={[
            styles.readyEyebrow,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {copy.readyEyebrow}
        </Text>
        <Text
          accessibilityRole="header"
          style={[
            styles.readyTitle,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {copy.readyTitle}
        </Text>
        <Text
          style={[
            styles.readyBody,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {copy.readyBody}
        </Text>
        <View style={[styles.truthLine, rtl && styles.rowReverse]}>
          <DeviceMobile color={colors.volt} size={18} />
          <Text
            style={[
              styles.truthText,
              rtl && styles.arabic,
              rtl && styles.textRight
            ]}
          >
            {copy.localTruth}
          </Text>
        </View>
      </CommandSurface>

      <View style={styles.choiceList}>
        <StartChoice
          body={copy.firstItemBody}
          icon={Camera}
          onPress={onFirstItem}
          rtl={rtl}
          testID="personal-start-item"
          title={copy.firstItem}
        />
        <StartChoice
          body={copy.firstPlaceBody}
          icon={MapPin}
          onPress={onFirstPlace}
          rtl={rtl}
          testID="personal-start-place"
          title={copy.firstPlace}
        />
      </View>

      <SecondaryButton
        label={copy.goToday}
        onPress={onToday}
      />
    </>
  );
}

function ConsequenceRow({
  body,
  icon: Icon,
  rtl,
  title
}: {
  readonly body: string;
  readonly icon: Icon;
  readonly rtl: boolean;
  readonly title: string;
}) {
  return (
    <View style={[styles.consequenceRow, rtl && styles.rowReverse]}>
      <View style={styles.consequenceIcon}>
        <Icon color={colors.text} size={22} weight="regular" />
      </View>
      <View style={styles.flex}>
        <Text
          style={[
            styles.rowTitle,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.rowBody,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

function StartChoice({
  body,
  icon: Icon,
  onPress,
  rtl,
  testID,
  title
}: {
  readonly body: string;
  readonly icon: Icon;
  readonly onPress: () => void;
  readonly rtl: boolean;
  readonly testID: string;
  readonly title: string;
}) {
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  return (
    <Pressable
      accessibilityHint={body}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.startChoice,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
      testID={testID}
    >
      <View style={styles.startIcon}>
        <Icon color={colors.carbon} size={25} weight="regular" />
      </View>
      <View style={styles.flex}>
        <Text
          style={[
            styles.choiceTitle,
            rtl && styles.arabicMedium,
            rtl && styles.textRight
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.choiceBody,
            rtl && styles.arabic,
            rtl && styles.textRight
          ]}
        >
          {body}
        </Text>
      </View>
      <Arrow color={colors.textMuted} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  routeHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  backPlaceholder: {
    height: 44,
    width: 44
  },
  progressRule: {
    backgroundColor: colors.border,
    flex: 1,
    height: 2,
    overflow: "hidden"
  },
  progressValue: {
    backgroundColor: colors.carbon,
    height: 2,
    width: "50%"
  },
  progressComplete: {
    backgroundColor: colors.volt,
    width: "100%"
  },
  heading: {
    gap: spacing.xs
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  },
  textRight: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  consequenceSection: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
    lineHeight: 24
  },
  consequenceRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 82,
    paddingVertical: spacing.md
  },
  consequenceIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceQuiet,
    borderRadius: radius.sm,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  flex: {
    flex: 1
  },
  rowTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 21
  },
  rowBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xxs
  },
  actions: {
    gap: spacing.sm,
    marginTop: "auto"
  },
  readySurface: {
    gap: spacing.sm,
    paddingVertical: spacing.xl
  },
  readyEyebrow: {
    color: colors.volt,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2
  },
  readyTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 35
  },
  readyBody: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24
  },
  truthLine: {
    alignItems: "center",
    borderTopColor: colors.borderStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.sm
  },
  truthText: {
    color: colors.concrete,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  choiceList: {
    gap: spacing.sm
  },
  startChoice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 108,
    padding: spacing.md
  },
  startIcon: {
    alignItems: "center",
    backgroundColor: colors.volt,
    borderRadius: radius.sm,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  choiceTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
    lineHeight: 23
  },
  choiceBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xxs
  },
  pressed: {
    opacity: 0.68
  }
});
