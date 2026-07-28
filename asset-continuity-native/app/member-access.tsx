import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Check,
  CrownSimple,
  Eye,
  PencilSimple,
  Trash,
  UserMinus
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import { useCoreJourneyCopy } from "@/i18n/coreJourneyCopy";
import {
  householdAccessErrorMessage,
  useHouseholdAdminCopy
} from "@/i18n/householdAdminCopy";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type ManagedRole = "editor" | "viewer";

export default function MemberAccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind?: string | string[];
    id?: string | string[];
  }>();
  const kind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    busy,
    householdAccessSnapshot,
    householdAccessError,
    refreshHouseholdAccess,
    changeHouseholdMemberRole,
    revokeHouseholdMember,
    cancelPendingHouseholdInvite,
    transferHouseholdOwnership
  } = useAuthFlow();
  const { copy: coreCopy, language, rtl } = useCoreJourneyCopy();
  const copy = useHouseholdAdminCopy();
  const member = useMemo(
    () =>
      kind === "member"
        ? householdAccessSnapshot?.members.find(
            (candidate) => candidate.membershipId === id
          ) ?? null
        : null,
    [householdAccessSnapshot?.members, id, kind]
  );
  const invite = useMemo(
    () =>
      kind === "invite"
        ? householdAccessSnapshot?.pendingInvites.find(
            (candidate) => candidate.inviteId === id
          ) ?? null
        : null,
    [householdAccessSnapshot?.pendingInvites, id, kind]
  );
  const [role, setRole] = useState<ManagedRole>(
    member?.role === "editor" ? "editor" : "viewer"
  );
  const [localError, setLocalError] = useState(false);

  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/family");

  const run = async (
    action: () => Promise<boolean>,
    successMessage: string
  ) => {
    setLocalError(false);
    const succeeded = await action();
    if (!succeeded) {
      setLocalError(true);
      return;
    }
    Alert.alert(successMessage, "", [
      { text: copy.done, onPress: close }
    ]);
  };

  if (
    !householdAccessSnapshot ||
    householdAccessSnapshot.currentRole !== "owner" ||
    (!member && !invite) ||
    member?.isCurrentUser
  ) {
    return (
      <AppScreen testID="member-access-unavailable">
        <View style={[styles.header, rtl && styles.rowReverse]}>
          <LocalizedRouteBack
            label={coreCopy.common.back}
            onPress={close}
            rtl={rtl}
            testID="member-access-back"
          />
          <Text
            style={[
              styles.navigationTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.memberNavigationTitle}
          </Text>
        </View>
        <ErrorBanner
          message={householdAccessErrorMessage(
            householdAccessError,
            language
          )}
          onDismiss={() => router.replace("/(tabs)/family")}
        />
        <PrimaryButton
          label={copy.refresh}
          loading={busy}
          onPress={() => void refreshHouseholdAccess()}
        />
      </AppScreen>
    );
  }

  if (invite) {
    return (
      <AppScreen testID="pending-invite-access-screen">
        <View style={[styles.header, rtl && styles.rowReverse]}>
          <LocalizedRouteBack
            label={coreCopy.common.back}
            onPress={close}
            rtl={rtl}
            testID="pending-invite-access-back"
          />
          <Text
            style={[
              styles.navigationTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.memberNavigationTitle}
          </Text>
        </View>
        <CommandSurface>
          <Text
            style={[
              styles.eyebrow,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.memberEyebrow}
          </Text>
          <ScreenTitle>{copy.cancelInviteTitle}</ScreenTitle>
          <BodyText muted>{copy.cancelInviteBody}</BodyText>
        </CommandSurface>
        {localError ? (
          <ErrorBanner
            message={householdAccessErrorMessage(
              householdAccessError,
              language
            )}
            onDismiss={() => setLocalError(false)}
          />
        ) : null}
        <SecondaryButton
          destructive
          disabled={busy}
          icon={Trash}
          label={copy.cancelInviteAction}
          onPress={() =>
            Alert.alert(
              copy.cancelInviteConfirmTitle,
              copy.cancelInviteConfirmBody,
              [
                { text: copy.keepInvite, style: "cancel" },
                {
                  text: copy.cancelInviteAction,
                  style: "destructive",
                  onPress: () =>
                    void run(
                      () =>
                        cancelPendingHouseholdInvite(
                          invite.inviteId,
                          invite.version
                        ),
                      copy.successInvite
                    )
                }
              ]
            )
          }
        />
      </AppScreen>
    );
  }

  const selectedMember = member;
  if (!selectedMember) return null;
  const roleChanged = role !== selectedMember.role;

  return (
    <AppScreen testID="member-access-screen">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <LocalizedRouteBack
          label={coreCopy.common.back}
          onPress={close}
          rtl={rtl}
          testID="member-access-back"
        />
        <Text
          style={[
            styles.navigationTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.memberNavigationTitle}
        </Text>
      </View>

      <CommandSurface>
        <Text
          style={[
            styles.eyebrow,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.memberEyebrow}
        </Text>
        <ScreenTitle>{selectedMember.displayName}</ScreenTitle>
        {selectedMember.email ? (
          <Text
            style={[
              styles.email,
              rtl && styles.rtlAlign
            ]}
          >
            {selectedMember.email}
          </Text>
        ) : null}
      </CommandSurface>

      {localError ? (
        <ErrorBanner
          message={householdAccessErrorMessage(
            householdAccessError,
            language
          )}
          onDismiss={() => setLocalError(false)}
        />
      ) : null}

      <Section style={styles.section}>
        <ScreenTitle>{copy.roleTitle}</ScreenTitle>
        <BodyText muted>{copy.roleBody}</BodyText>
        <View accessibilityRole="radiogroup" style={styles.roleChoices}>
          <RoleChoice
            active={role === "editor"}
            description={copy.editorDescription}
            icon={PencilSimple}
            label={copy.editor}
            onPress={() => setRole("editor")}
            rtl={rtl}
          />
          <RoleChoice
            active={role === "viewer"}
            description={copy.viewerDescription}
            icon={Eye}
            label={copy.viewer}
            onPress={() => setRole("viewer")}
            rtl={rtl}
          />
        </View>
        <PrimaryButton
          disabled={!roleChanged || busy}
          icon={Check}
          label={busy ? copy.saving : copy.saveRole}
          loading={busy}
          onPress={() =>
            void run(
              () =>
                changeHouseholdMemberRole(
                  selectedMember.membershipId,
                  selectedMember.version,
                  role
                ),
              copy.successRole
            )
          }
        />
      </Section>

      <Section style={styles.consequenceSection}>
        <View style={[styles.consequenceHeading, rtl && styles.rowReverse]}>
          <UserMinus color={colors.danger} size={22} />
          <Text
            style={[
              styles.consequenceTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.removeTitle}
          </Text>
        </View>
        <BodyText muted>{copy.removeBody}</BodyText>
        <SecondaryButton
          destructive
          disabled={busy}
          icon={UserMinus}
          label={copy.removeAction}
          onPress={() =>
            Alert.alert(
              copy.removeConfirmTitle,
              copy.removeConfirmBody,
              [
                { text: copy.cancel, style: "cancel" },
                {
                  text: copy.removeAction,
                  style: "destructive",
                  onPress: () =>
                    void run(
                      () =>
                        revokeHouseholdMember(
                          selectedMember.membershipId,
                          selectedMember.version
                        ),
                      copy.successRemoved
                    )
                }
              ]
            )
          }
        />
      </Section>

      <Section style={styles.transferSection}>
        <View style={[styles.consequenceHeading, rtl && styles.rowReverse]}>
          <CrownSimple color={colors.text} size={22} />
          <Text
            style={[
              styles.consequenceTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.transferTitle}
          </Text>
        </View>
        <BodyText muted>{copy.transferBody}</BodyText>
        <SecondaryButton
          disabled={busy}
          icon={CrownSimple}
          label={copy.transferAction}
          onPress={() =>
            Alert.alert(
              copy.transferConfirmTitle,
              copy.transferConfirmBody,
              [
                { text: copy.cancel, style: "cancel" },
                {
                  text: copy.transferConfirmAction,
                  style: "destructive",
                  onPress: () =>
                    void run(
                      () =>
                        transferHouseholdOwnership(
                          selectedMember.membershipId,
                          selectedMember.version
                        ),
                      copy.successTransfer
                    )
                }
              ]
            )
          }
        />
      </Section>
    </AppScreen>
  );
}

function RoleChoice({
  active,
  description,
  icon: Icon,
  label,
  onPress,
  rtl
}: {
  readonly active: boolean;
  readonly description: string;
  readonly icon: typeof Eye;
  readonly label: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}. ${description}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleChoice,
        active && styles.roleChoiceActive,
        pressed && styles.pressed,
        rtl && styles.rowReverse
      ]}
    >
      <Icon color={active ? colors.text : colors.textMuted} size={23} />
      <View style={styles.roleChoiceCopy}>
        <Text
          style={[
            styles.roleChoiceLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.roleChoiceDescription,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {description}
        </Text>
      </View>
      {active ? <Check color={colors.action} size={21} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowReverse: {
    flexDirection: "row-reverse"
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  navigationTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  eyebrow: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1
  },
  email: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    writingDirection: "ltr"
  },
  section: {
    gap: spacing.md
  },
  roleChoices: {
    gap: spacing.sm
  },
  roleChoice: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  roleChoiceActive: {
    borderWidth: 2,
    borderColor: colors.text
  },
  roleChoiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  roleChoiceLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  roleChoiceDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  consequenceSection: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.danger
  },
  transferSection: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong
  },
  consequenceHeading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  consequenceTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 26
  },
  pressed: {
    opacity: 0.64
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
