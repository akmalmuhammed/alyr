import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowRight,
  FileText,
  MapPin,
  ShieldCheck
} from "phosphor-react-native";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets
} from "react-native-safe-area-context";

import {
  AuthActions,
  AuthNotice,
  TextAction
} from "@/auth/components";
import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { AUTH_ROUTES } from "@/auth/routes";
import { BrandSignalRail } from "@/components/BrandAtmosphere";
import { BrandMark, ErrorBanner } from "@/components/ui";
import {
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { rtlRowStyle } from "@/i18n/rtlLayout";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  themes,
  typography
} from "@/theme/tokens";

export default function AuthWelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width, fontScale } = useWindowDimensions();
  const {
    clearError: clearAuthError,
    clearStatus,
    mode,
    reset
  } = useAuthFlow();
  const {
    clearError,
    error,
    saving,
    startWorkspace,
    storageReady
  } = useWorkspace();
  const { copy, language, rtl, setLanguage } = useCoreJourneyCopy();

  const prepareAccountEntry = () => {
    clearAuthError();
    clearStatus();
    // Preview identities are intentionally session-only. A cloud session is
    // provider-owned and must be ended through signOut, never by clearing only
    // the React state while the durable Supabase session remains active.
    if (mode === "preview") reset();
  };

  const begin = () => {
    prepareAccountEntry();
    router.push(AUTH_ROUTES.createAccount);
  };

  const signIn = () => {
    prepareAccountEntry();
    router.push(AUTH_ROUTES.signIn);
  };

  const exploreSample = async () => {
    clearError();
    try {
      await startWorkspace("sample");
      router.replace("/(tabs)");
    } catch {
      // WorkspaceProvider presents the actionable storage error below.
    }
  };

  const compact = width <= 340 || height <= 620 || fontScale >= 1.25;
  const actions = (
    <AuthActions
      primary={{
        label: copy.welcome.createWorkspace,
        icon: ArrowRight,
        onPress: begin
      }}
      secondary={{
        label: saving
          ? copy.welcome.preparingSample
          : copy.welcome.exploreSample,
        disabled: saving || !storageReady,
        onPress: () => void exploreSample()
      }}
    />
  );

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.screen}
      testID="auth-welcome-screen"
    >
      <StatusBar style="light" />
      <View
        style={[
          styles.header,
          compact && styles.headerCompact,
          rtl && styles.rowReverse
        ]}
      >
        <BrandMark compact={compact} reversed />
        <View
          style={[
            styles.headerActions,
            compact && styles.headerActionsCompact,
            rtl && styles.headerActionsRtl
          ]}
        >
          <TextAction
            label={copy.welcome.languageAction}
            labelLanguage={language === "ar" ? "en" : "ar"}
            onPress={() =>
              void setLanguage(language === "ar" ? "en" : "ar")
            }
            tone="inverse"
          />
          <TextAction label={copy.welcome.signIn} onPress={signIn} tone="inverse" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.hero,
          compact && styles.heroCompact
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text
            style={[
              styles.eyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.welcome.eyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              compact && styles.titleCompact,
              rtl && styles.titleArabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.welcome.title}
          </Text>
          <Text
            style={[
              styles.body,
              rtl && styles.arabic,
              rtl && styles.rtlText
            ]}
          >
            {copy.welcome.body}
          </Text>
        </View>

        {!compact ? (
        <View style={styles.passportPreview}>
          <View
            style={[
              styles.previewTop,
              rtl && styles.rowReverse
            ]}
          >
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={copy.welcome.sampleImageLabel}
              resizeMode="cover"
              source={require("../../assets/sample-assets/gmt-watch.png")}
              style={styles.previewImage}
            />
            <View style={styles.previewCopy}>
              <Text
                style={[
                  styles.previewEyebrow,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.welcome.commandEyebrow}
              </Text>
              <Text
                style={[
                  styles.previewTitle,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.welcome.commandOne}
              </Text>
              <View
                style={[
                  styles.previewStatus,
                  rtl && styles.rowReverse
                ]}
              >
                <ShieldCheck
                  color={colors.volt}
                  size={18}
                  weight="bold"
                />
                <Text
                  style={[
                    styles.previewStatusText,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.welcome.readyToRetrieve}
                </Text>
              </View>
            </View>
          </View>

          <BrandSignalRail style={styles.signalRail} />

          <View
            style={[
              styles.previewFacts,
              rtl && styles.rowReverse
            ]}
          >
            <View style={styles.previewFact}>
              <MapPin color={colors.concrete} size={18} />
              <Text
                numberOfLines={2}
                style={[
                  styles.previewFactText,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.welcome.commandTwo}
              </Text>
            </View>
            <View style={styles.factDivider} />
            <View style={styles.previewFact}>
              <FileText color={colors.concrete} size={18} />
              <Text
                numberOfLines={2}
                style={[
                  styles.previewFactText,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.welcome.commandThree}
              </Text>
            </View>
          </View>
        </View>
        ) : null}

        {error ? (
          <ErrorBanner
            message={localizedWorkspaceError(error, language)}
            onDismiss={clearError}
          />
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.actionSheet,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) }
        ]}
      >
        <AuthNotice tone={mode === "preview" ? "attention" : "neutral"}>
          {mode === "preview"
            ? copy.welcome.previewNotice
            : mode === "unavailable"
              ? copy.welcome.unavailableNotice
              : copy.welcome.accountNotice}
        </AuthNotice>
        {actions}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.carbon
  },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg
  },
  headerCompact: {
    paddingHorizontal: spacing.md
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  headerActionsCompact: {
    gap: spacing.xs
  },
  headerActionsRtl: {
    ...rtlRowStyle()
  },
  rowReverse: {
    ...rtlRowStyle()
  },
  hero: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl
  },
  heroCompact: {
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md
  },
  heading: {
    gap: spacing.sm
  },
  eyebrow: {
    color: colors.volt,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.2
  },
  title: {
    maxWidth: 620,
    color: colors.white,
    fontFamily: typography.displayBold,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1.35
  },
  titleCompact: {
    fontSize: 33,
    lineHeight: 36,
    letterSpacing: -0.9
  },
  titleArabic: {
    fontFamily: typography.arabicMedium,
    lineHeight: 52,
    letterSpacing: 0
  },
  body: {
    maxWidth: 560,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24
  },
  passportPreview: {
    overflow: "hidden",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: themes.dark.border,
    borderRadius: radius.xl,
    backgroundColor: themes.dark.surface
  },
  previewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  previewImage: {
    width: 82,
    height: 82,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceQuiet
  },
  previewCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3
  },
  previewEyebrow: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.75
  },
  previewTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 23
  },
  previewStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  previewStatusText: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  signalRail: {
    opacity: 0.82
  },
  previewFacts: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm
  },
  previewFact: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  previewFactText: {
    minWidth: 0,
    flex: 1,
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  factDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: themes.dark.border
  },
  actionSheet: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: themes.dark.border,
    backgroundColor: colors.canvas
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
  }
});
