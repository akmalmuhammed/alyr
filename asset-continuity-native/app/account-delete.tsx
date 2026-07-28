import { Redirect, useRouter } from "expo-router";
import {
  CheckSquare,
  ShieldWarning,
  Square,
  Trash
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthHeading,
  AuthNotice,
  AuthScaffold
} from "@/auth/components";
import { AUTH_ROUTES } from "@/auth/routes";
import {
  BodyText,
  CommandSurface,
  ErrorBanner,
  Field,
  Section,
  SecondaryButton
} from "@/components/ui";
import {
  accountDeletionErrorMessage,
  accountHouseholdConsequence,
  useAccountDeletionCopy
} from "@/i18n/accountDeletionCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export default function AccountDeleteScreen() {
  const router = useRouter();
  const {
    busy: authBusy,
    deleteAccount,
    finalizeAccountDeletion,
    mode,
    session
  } = useAuthFlow();
  const {
    workspace,
    pendingOperationCount,
    purgeActiveVault
  } = useWorkspace();
  const { copy, language, rtl } = useAccountDeletionCopy();
  const [password, setPassword] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [cloudDeleted, setCloudDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedAccount =
    mode === "supabase" &&
    session?.assurance === "verified-email" &&
    session.identity.emailVerified &&
    session.activeHouseholdId &&
    session.activeMembershipId &&
    session.activeHouseholdRole
      ? session
      : null;
  const preview = mode === "preview";
  const busy = authBusy || localBusy;
  const signedReady = Boolean(
    signedAccount &&
      password.length > 0 &&
      normalizedEmail(confirmationEmail) ===
        normalizedEmail(signedAccount.identity.email) &&
      acknowledged
  );
  const consequence = useMemo(
    () =>
      signedAccount && workspace
        ? accountHouseholdConsequence(
            signedAccount.activeHouseholdRole!,
            workspace.household.name,
            language
          )
        : "",
    [language, signedAccount, workspace]
  );

  const finishLocalCleanup = async () => {
    setLocalBusy(true);
    setError(null);
    try {
      await purgeActiveVault();
      await finalizeAccountDeletion();
      router.replace(AUTH_ROUTES.welcome);
    } catch {
      setError(copy.signed.localCleanupFailure);
    } finally {
      setLocalBusy(false);
    }
  };

  const submitSignedDeletion = async () => {
    if (!signedAccount || !signedReady || busy) return;
    setLocalBusy(true);
    setError(null);
    try {
      const result = await deleteAccount(password, confirmationEmail);
      if (!result.ok) {
        setError(
          accountDeletionErrorMessage(
            result.error.code,
            language,
            result.error.message
          )
        );
        return;
      }
      setCloudDeleted(true);
      setPassword("");
      setConfirmationEmail("");
      await purgeActiveVault();
      await finalizeAccountDeletion();
      router.replace(AUTH_ROUTES.welcome);
    } catch {
      setError(copy.signed.localCleanupFailure);
    } finally {
      setLocalBusy(false);
    }
  };

  const resetPreview = async () => {
    if (!preview || !acknowledged || busy) return;
    setLocalBusy(true);
    setError(null);
    try {
      await purgeActiveVault({ reopenEmptyPreview: true });
      await finalizeAccountDeletion();
      router.replace(AUTH_ROUTES.welcome);
    } catch {
      setError(copy.preview.error);
    } finally {
      setLocalBusy(false);
    }
  };

  if (!signedAccount && !preview) {
    return <Redirect href={AUTH_ROUTES.welcome} />;
  }

  if (!workspace) {
    return (
      <AuthScaffold
        onBack={() => router.replace(AUTH_ROUTES.welcome)}
        testID="account-delete-loading"
      >
        <AuthHeading
          body={copy.common.openingWorkspace}
          eyebrow={
            signedAccount
              ? copy.signed.eyebrow
              : copy.preview.eyebrow
          }
          title={
            signedAccount ? copy.signed.title : copy.preview.title
          }
        />
        <AuthNotice live>{copy.common.openingWorkspace}</AuthNotice>
      </AuthScaffold>
    );
  }

  const footer = signedAccount ? (
    <SecondaryButton
      destructive
      disabled={cloudDeleted ? busy : !signedReady || busy}
      icon={Trash}
      label={
        cloudDeleted
          ? copy.signed.finishLocalCleanup
          : busy
            ? copy.signed.deleting
            : copy.signed.delete
      }
      onPress={() =>
        void (cloudDeleted
          ? finishLocalCleanup()
          : submitSignedDeletion())
      }
    />
  ) : (
    <SecondaryButton
      destructive
      disabled={!acknowledged || busy}
      icon={Trash}
      label={busy ? copy.preview.resetting : copy.preview.action}
      onPress={() => void resetPreview()}
    />
  );

  return (
    <AuthScaffold
      footer={footer}
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace("/(tabs)/vault")
      }
      testID="account-delete-screen"
    >
      {signedAccount ? (
        <>
          <AuthHeading
            body={copy.signed.intro}
            eyebrow={copy.signed.eyebrow}
            title={copy.signed.title}
          />

          <CommandSurface>
            <View style={[styles.warningHeader, rtl && styles.rowReverse]}>
              <ShieldWarning
                color={colors.warning}
                size={30}
                weight="regular"
              />
              <View style={styles.warningCopy}>
                <Text
                  style={[
                    styles.commandLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {copy.signed.selectedAccount}
                </Text>
                <Text
                  selectable
                  style={[
                    styles.commandAccount,
                    rtl && styles.rtlAlign
                  ]}
                >
                  {signedAccount.identity.email}
                </Text>
              </View>
            </View>
          </CommandSurface>

          <Section>
            <Text
              style={[
                styles.sectionTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.signed.householdConsequence}
            </Text>
            <BodyText muted>{consequence}</BodyText>
            <BodyText muted>{copy.signed.multiHousehold}</BodyText>
          </Section>

          {pendingOperationCount > 0 ? (
            <AuthNotice tone="attention">
              {`${copy.signed.pendingTitle}\n${copy.signed.pendingBody}`}
            </AuthNotice>
          ) : null}

          {cloudDeleted ? (
            <AuthNotice live tone="attention">
              {copy.signed.localCleanupFailure}
            </AuthNotice>
          ) : (
            <Section>
              <Field
                autoCapitalize="none"
                autoComplete="current-password"
                description={copy.signed.passwordDescription}
                editable={!busy}
                label={copy.signed.password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                value={password}
              />
              <Field
                autoCapitalize="none"
                autoComplete="email"
                description={copy.signed.confirmationDescription}
                editable={!busy}
                keyboardType="email-address"
                label={copy.signed.confirmationEmail}
                onChangeText={setConfirmationEmail}
                textContentType="emailAddress"
                value={confirmationEmail}
              />
              <AcknowledgementRow
                checked={acknowledged}
                disabled={busy}
                label={copy.signed.acknowledgement}
                onPress={() => setAcknowledged((current) => !current)}
                rtl={rtl}
              />
            </Section>
          )}
        </>
      ) : (
        <>
          <AuthHeading
            body={copy.preview.intro}
            eyebrow={copy.preview.eyebrow}
            title={copy.preview.title}
          />
          <AuthNotice tone="attention">
            {workspace.mode === "sample"
              ? `${copy.preview.sampleTitle}\n${copy.preview.sampleBody}`
              : `${copy.preview.personalTitle}\n${copy.preview.personalBody}`}
          </AuthNotice>
          <Section>
            <AcknowledgementRow
              checked={acknowledged}
              disabled={busy}
              label={copy.preview.acknowledgement}
              onPress={() => setAcknowledged((current) => !current)}
              rtl={rtl}
            />
          </Section>
        </>
      )}

      {error ? (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      ) : null}
    </AuthScaffold>
  );
}

function AcknowledgementRow({
  checked,
  disabled,
  label,
  onPress,
  rtl
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
}) {
  const Icon = checked ? CheckSquare : Square;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.acknowledgement,
        rtl && styles.rowReverse,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      <Icon
        color={checked ? colors.action : colors.textMuted}
        size={24}
        weight={checked ? "fill" : "regular"}
      />
      <Text
        style={[
          styles.acknowledgementText,
          rtl && styles.arabic,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  warningCopy: {
    flex: 1,
    gap: 2
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 1
  },
  commandAccount: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 16,
    lineHeight: 22,
    writingDirection: "ltr"
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  acknowledgement: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  acknowledgementText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 21
  },
  pressed: {
    opacity: 0.62
  },
  disabled: {
    opacity: 0.45
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  rtlAlign: {
    textAlign: "right"
  }
});
