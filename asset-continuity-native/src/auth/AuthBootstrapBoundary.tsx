import { ArrowClockwise, SignOut } from "phosphor-react-native";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuthFlow } from "./AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold
} from "./components";
import {
  localizeAuthFailure,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { colors, spacing } from "@/theme/tokens";

const bootstrapCopy = {
  en: {
    eyebrow: "PRIVATE ACCOUNT",
    checkingTitle: "Opening your account.",
    checkingBody:
      "Heldat is checking this device for an existing account session.",
    checkingStatus: "Checking encrypted account access\u2026",
    errorTitle: "Account access needs attention.",
    errorBody:
      "Heldat paused before opening any household data.",
    errorHint:
      "Your records remain closed until account access is confirmed.",
    retry: "Try again",
    startAgain: "Sign out"
  },
  ar: {
    eyebrow: "\u062d\u0633\u0627\u0628 \u062e\u0627\u0635",
    checkingTitle:
      "\u062c\u0627\u0631\u064d \u0641\u062a\u062d \u062d\u0633\u0627\u0628\u0643.",
    checkingBody:
      "\u064a\u062a\u062d\u0642\u0642 Heldat \u0645\u0646 \u062c\u0644\u0633\u0629 \u062d\u0633\u0627\u0628 \u0645\u0648\u062c\u0648\u062f\u0629 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062c\u0647\u0627\u0632.",
    checkingStatus:
      "\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0648\u0635\u0648\u0644 \u0627\u0644\u0645\u0634\u0641\u0651\u0631 \u0625\u0644\u0649 \u0627\u0644\u062d\u0633\u0627\u0628\u2026",
    errorTitle:
      "\u064a\u062d\u062a\u0627\u062c \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u062d\u0633\u0627\u0628 \u0625\u0644\u0649 \u0645\u0631\u0627\u062c\u0639\u0629.",
    errorBody:
      "\u0623\u0648\u0642\u0641 Heldat \u0641\u062a\u062d \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0646\u0632\u0644 \u062d\u062a\u0649 \u064a\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062c\u0644\u0633\u0629.",
    errorHint:
      "\u062a\u0628\u0642\u0649 \u0633\u062c\u0644\u0627\u062a\u0643 \u0645\u063a\u0644\u0642\u0629 \u062d\u062a\u0649 \u064a\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u062d\u0633\u0627\u0628.",
    retry: "\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649",
    startAgain:
      "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c"
  }
} as const;

/**
 * Global fail-closed session gate. It runs above every route so a restore
 * failure never masquerades as a signed-out Welcome screen or exposes an
 * account form while the provider state is unknown.
 */
export function AuthBootstrapBoundary({
  children
}: PropsWithChildren) {
  const {
    bootstrapState,
    busy,
    error,
    retryBootstrap,
    signOut
  } = useAuthFlow();
  const { language } = useCoreJourneyCopy();
  const copy = bootstrapCopy[language];

  if (bootstrapState === "ready") return children;

  if (bootstrapState === "bootstrapping") {
    return (
      <AuthScaffold testID="auth-bootstrap-checking">
        <View style={styles.content}>
          <AuthHeading
            body={copy.checkingBody}
            eyebrow={copy.eyebrow}
            title={copy.checkingTitle}
          />
          <View style={styles.status}>
            <ActivityIndicator color={colors.action} size="small" />
            <View style={styles.statusCopy}>
              <AuthNotice live>{copy.checkingStatus}</AuthNotice>
            </View>
          </View>
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label: copy.retry,
            icon: ArrowClockwise,
            disabled: busy,
            onPress: () => void retryBootstrap()
          }}
          secondary={{
            label: copy.startAgain,
            disabled: busy,
            onPress: () => void signOut()
          }}
        />
      }
      testID="auth-bootstrap-error"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.errorBody}
          eyebrow={copy.eyebrow}
          title={copy.errorTitle}
        />
        <AuthNotice live tone="attention">
          {error
            ? localizeAuthFailure(error, language)
            : copy.errorHint}
        </AuthNotice>
        <AuthNotice>{copy.errorHint}</AuthNotice>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  statusCopy: {
    flex: 1
  }
});
