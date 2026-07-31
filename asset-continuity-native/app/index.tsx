import { Redirect } from "expo-router";
import { ArrowClockwise, SignOut } from "phosphor-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  localizedWorkspaceError,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useOnboardingIntro } from "@/onboarding/OnboardingIntroProvider";
import { signedOutSampleWorkspaceReady } from "@/state/SessionBoundWorkspaceProvider";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing } from "@/theme/tokens";

export default function IndexScreen() {
  const {
    bootstrapState,
    busy: authBusy,
    mode,
    pendingHouseholdInvite,
    pendingHouseholdInviteDeferred,
    session,
    signOut
  } = useAuthFlow();
  const {
    bootstrap,
    loading,
    retryBootstrap,
    workspace
  } = useWorkspace();
  const { language } = useCoreJourneyCopy();
  const { status: introStatus } = useOnboardingIntro();
  const publicEntry = () => {
    if (introStatus === "loading") {
      return (
        <View
          style={styles.loading}
          testID="onboarding-intro-bootstrap"
        >
          <ActivityIndicator color={colors.action} size="small" />
        </View>
      );
    }
    return introStatus === "unseen" ? (
      <Redirect href="/(onboarding)" />
    ) : (
      <Redirect href={AUTH_ROUTES.welcome} />
    );
  };

  if (bootstrapState === "bootstrapping") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.action} size="small" />
      </View>
    );
  }
  if (
    pendingHouseholdInvite &&
    !pendingHouseholdInviteDeferred
  ) {
    return <Redirect href={AUTH_ROUTES.join} />;
  }
  const signedOutSampleOpening =
    (mode === "supabase" || mode === "unavailable") &&
    session === null &&
    loading;
  if (signedOutSampleOpening) {
    return (
      <View style={styles.loading} testID="signed-sample-bootstrap">
        <ActivityIndicator color={colors.action} size="small" />
      </View>
    );
  }
  if (mode === "preview") {
    return workspace ? <Redirect href="/(tabs)" /> : publicEntry();
  }
  if (
    signedOutSampleWorkspaceReady(
      mode,
      session,
      workspace?.mode ?? null
    )
  ) {
    return <Redirect href="/(tabs)" />;
  }
  if (mode !== "supabase" || !session) {
    return publicEntry();
  }
  if (
    !session.activeHouseholdId ||
    !session.activeMembershipId ||
    !session.activeHouseholdRole
  ) {
    return <Redirect href={AUTH_ROUTES.household} />;
  }
  if (session.onboarding !== "complete") {
    return <Redirect href={AUTH_ROUTES.household} />;
  }
  if (workspace) return <Redirect href="/(tabs)" />;

  const arabic = language === "ar";
  const accessRevoked = bootstrap.status === "access-revoked";
  const terminalError = bootstrap.status === "error";
  const waiting =
    loading ||
    bootstrap.status === "opening" ||
    bootstrap.status === "pulling";
  const title = accessRevoked
    ? arabic
      ? "تغيّر الوصول إلى المنزل"
      : "Household access changed"
    : terminalError
      ? arabic
        ? "تحتاج الخزنة إلى مراجعة"
        : "Your vault needs attention"
    : arabic
      ? "استعادة مساحتك الخاصة"
      : "Restoring your private workspace";
  const body = accessRevoked
    ? arabic
      ? "لم يعد هذا الحساب عضواً نشطاً في هذا المنزل. لم يتم إنشاء منزل جديد ولم يتم فتح أي بيانات قديمة."
      : "This account is no longer an active member of this household. No new household was created and no stale data was opened."
    : terminalError
      ? arabic
        ? "أوقف Heldat فتح الخزنة لحماية بياناتك. لم تتم الكتابة فوق أي سجل."
        : "Heldat stopped opening the vault to protect your data. No record was overwritten."
    : arabic
      ? "نقوم الآن بتنزيل أحدث الأماكن والعناصر والأدلة بأمان إلى هذا الجهاز."
      : "Heldat is securely bringing your latest Places, items and evidence to this device.";
  const status = waiting
    ? arabic
      ? "اترك التطبيق مفتوحاً أثناء تجهيز الخزنة المشفرة."
      : "Keep Heldat open while the encrypted vault is prepared."
    : (bootstrap.lastError?.message
        ? localizedWorkspaceError(
            bootstrap.lastError.message,
            language,
            "open"
          )
        : null) ??
      (arabic
        ? "تعذر إكمال الاستعادة. تحقق من الاتصال وحاول مجدداً."
        : "The restore did not finish. Check your connection and try again.");

  return (
    <AuthScaffold
      footer={
        accessRevoked || terminalError ? (
          <AuthActions
            primary={{
              label: arabic ? "تسجيل الخروج" : "Sign out",
              icon: SignOut,
              loading: authBusy,
              disabled: authBusy,
              onPress: () => void signOut()
            }}
            {...(accessRevoked
              ? {
                  secondary: {
                    label: arabic
                      ? "التحقق مجدداً"
                      : "Check access again",
                    disabled: waiting || authBusy,
                    onPress: () => void retryBootstrap()
                  }
                }
              : {})}
          />
        ) : (
          <AuthActions
            primary={{
              label: waiting
                ? arabic
                  ? "جارٍ الاستعادة…"
                  : "Restoring…"
                : arabic
                  ? "المحاولة مجدداً"
                  : "Try again",
              icon: ArrowClockwise,
              loading: waiting,
              disabled: waiting,
              onPress: () => void retryBootstrap()
            }}
            secondary={{
              label: arabic ? "تسجيل الخروج" : "Sign out",
              disabled: waiting || authBusy,
              onPress: () => void signOut()
            }}
          />
        )
      }
      testID="signed-workspace-bootstrap"
    >
      <View style={styles.content}>
        <AuthHeading
          body={body}
          eyebrow={arabic ? "جهاز جديد" : "NEW DEVICE"}
          title={title}
        />
        <AuthNotice
          live
          tone={
            accessRevoked ||
            bootstrap.status === "retryable-error" ||
            bootstrap.status === "error"
              ? "attention"
              : "neutral"
          }
        >
          {status}
        </AuthNotice>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvas
  },
  content: {
    gap: spacing.xl
  }
});
