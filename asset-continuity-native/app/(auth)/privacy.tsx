import { Redirect, useRouter } from "expo-router";
import {
  ArrowRight,
  Buildings,
  Cube,
  MapPin,
  ShieldCheck,
  UsersThree
} from "phosphor-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  SelectionRow
} from "@/auth/components";
import { AUTH_ROUTES, authStepNumber } from "@/auth/routes";
import { ErrorBanner } from "@/components/ui";
import {
  localizeAuthFailure,
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PrivacyAndCaptureScreen() {
  const router = useRouter();
  const {
    activeHouseholdId,
    busy: authBusy,
    clearError: clearAuthError,
    completeOnboarding,
    createCompletion,
    error: authError,
    firstCaptureIntent,
    householdName,
    mode,
    session,
    setFirstCaptureIntent
  } = useAuthFlow();
  const {
    clearError: clearWorkspaceError,
    error: workspaceError,
    renameHousehold,
    saving,
    startWorkspace,
    storageReady,
    workspace
  } = useWorkspace();
  const { copy, language } = useCoreJourneyCopy();
  const [submitting, setSubmitting] = useState(false);

  if (!session) return <Redirect href={AUTH_ROUTES.signIn} />;
  if (!householdName.trim() || !activeHouseholdId) {
    return <Redirect href={AUTH_ROUTES.household} />;
  }

  const finish = async () => {
    const next = createCompletion();
    if (!next || submitting) return;
    setSubmitting(true);
    try {
      if (!workspace || workspace.mode === "sample") {
        await startWorkspace("personal");
      }
      await renameHousehold(next.householdName);
      const durable = await completeOnboarding();
      if (!durable) return;
      router.replace(
        next.firstCaptureIntent === "place"
          ? "/capture?intent=place"
          : "/capture"
      );
    } catch {
      // WorkspaceProvider supplies a recovery-oriented message below.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label:
              firstCaptureIntent === "place"
                ? copy.privacy.addFirstPlace
                : copy.privacy.addFirstItem,
            icon: ArrowRight,
            loading: saving || submitting || authBusy,
            disabled:
              !firstCaptureIntent ||
              !storageReady ||
              authBusy ||
              submitting,
            onPress: () => void finish()
          }}
        />
      }
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace(AUTH_ROUTES.household)
      }
      progress={authStepNumber("privacy")}
      testID="auth-privacy-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.privacy.body}
          eyebrow={copy.privacy.eyebrow}
          title={copy.privacy.title}
        />
        <View
          accessibilityLabel={copy.privacy.chooseFirst}
          accessibilityRole="radiogroup"
        >
          <SelectionRow
            active={firstCaptureIntent === "item"}
            description={copy.privacy.itemDescription}
            icon={Cube}
            label={copy.privacy.itemLabel}
            onPress={() => setFirstCaptureIntent("item")}
          />
          <SelectionRow
            active={firstCaptureIntent === "place"}
            description={copy.privacy.placeDescription}
            icon={Buildings}
            label={copy.privacy.placeLabel}
            onPress={() => setFirstCaptureIntent("place")}
          />
        </View>
        <View style={styles.principles}>
          <Principle
            icon={ShieldCheck}
            text={copy.privacy.privateText}
            title={copy.privacy.privateTitle}
          />
          <Principle
            icon={MapPin}
            text={copy.privacy.locationText}
            title={copy.privacy.locationTitle}
          />
          <Principle
            icon={UsersThree}
            text={copy.privacy.accessText}
            title={copy.privacy.accessTitle}
          />
        </View>
        {mode === "preview" ? (
          <AuthNotice tone="attention">
            {copy.privacy.previewNotice}
          </AuthNotice>
        ) : (
          <AuthNotice>
            {copy.privacy.liveNotice}
          </AuthNotice>
        )}
        {workspaceError ? (
          <ErrorBanner
            message={localizedWorkspaceError(
              workspaceError,
              language
            )}
            onDismiss={clearWorkspaceError}
          />
        ) : null}
        {authError ? (
          <ErrorBanner
            message={localizeAuthFailure(authError, language)}
            onDismiss={clearAuthError}
          />
        ) : null}
      </View>
    </AuthScaffold>
  );
}

function Principle({
  icon: IconComponent,
  text,
  title
}: {
  readonly icon: typeof ShieldCheck;
  readonly text: string;
  readonly title: string;
}) {
  const { rtl } = useCoreJourneyCopy();
  return (
    <View style={[styles.principle, rtl && styles.rowReverse]}>
      <IconComponent color={colors.text} size={21} />
      <View style={styles.principleCopy}>
        <Text
          style={[
            styles.principleTitle,
            rtl && styles.principleTitleArabic
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.principleText,
            rtl && styles.principleTextArabic
          ]}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  principles: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  principle: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  principleCopy: {
    flex: 1,
    gap: 2
  },
  principleTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  principleText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  principleTitleArabic: {
    fontFamily: typography.arabicMedium,
    textAlign: "right",
    writingDirection: "rtl"
  },
  principleTextArabic: {
    fontFamily: typography.arabic,
    textAlign: "right",
    writingDirection: "rtl"
  }
});
