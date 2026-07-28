import type { ContractError } from "@alyr/contracts";
import { useRouter } from "expo-router";
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Clock,
  Plus,
  ShieldCheck,
  UsersThree,
  WarningCircle
} from "phosphor-react-native";
import { useEffect } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import { HOUSEHOLD_ROUTES } from "@/auth/routes";
import {
  authoritativeHouseholdAccessSnapshot,
  verifiedHouseholdAccessForWorkspace
} from "@/auth/verifiedHouseholdAccess";
import {
  AppScreen,
  BodyText,
  CommandSurface,
  PrimaryButton,
  ScreenTitle,
  SecondaryButton,
  Section
} from "@/components/ui";
import {
  familyMemberSummary,
  householdAccessSummary,
  memberAvatarAccessibilityLabel,
  useCoreJourneyCopy
} from "@/i18n/coreJourneyCopy";
import { useInviteCopy } from "@/i18n/inviteCopy";
import {
  householdAccessErrorMessage,
  useHouseholdAdminCopy
} from "@/i18n/householdAdminCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export default function FamilyScreen() {
  const router = useRouter();
  const {
    mode,
    session,
    householdAccessSnapshot,
    householdAccessStatus,
    householdAccessError,
    refreshHouseholdAccess
  } = useAuthFlow();
  const { workspace } = useWorkspace();
  const { copy, language, rtl } = useCoreJourneyCopy();
  const inviteCopy = useInviteCopy();
  const adminCopy = useHouseholdAdminCopy();
  if (!workspace) return null;

  const verifiedCloudAccess = verifiedHouseholdAccessForWorkspace(
    mode,
    session,
    workspace.household.id
  );
  const cloudRoster = authoritativeHouseholdAccessSnapshot(
    mode,
    session,
    householdAccessSnapshot,
    workspace.household.id
  );
  const usesCloudRoster = verifiedCloudAccess !== null;
  const signedRosterUnavailable =
    usesCloudRoster && !cloudRoster;
  const visibleMembers =
    usesCloudRoster
      ? cloudRoster?.members.map((member) => ({
          id: member.membershipId,
          name: member.displayName,
          initials: member.displayName
            .split(/\s+/u)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => Array.from(part)[0] ?? "")
            .join("")
            .toUpperCase(),
          role: member.role,
          status: member.status,
          description: member.email,
          isCurrentUser: member.isCurrentUser,
          version: member.version
        })) ?? []
      : workspace.members.map((member) => ({
          id: member.id,
          name: member.name,
          initials: member.initials,
          role: member.role,
          status: member.status,
          description: null,
          isCurrentUser:
            member.role === "owner" &&
            session?.activeHouseholdRole === "owner",
          version: 1
        }));
  const activeCount = visibleMembers.filter(
    (member) => member.status === "active"
  ).length;
  const pendingInvites =
    usesCloudRoster
      ? cloudRoster?.pendingInvites ?? []
      : [];
  const ownerCanInvite =
    mode === "preview"
      ? session?.activeHouseholdRole === "owner" &&
        Boolean(session.activeMembershipId)
      : cloudRoster?.currentRole === "owner";
  const ownerCanManage =
    usesCloudRoster &&
    cloudRoster?.currentRole === "owner";
  const roleCopy = {
    owner: {
      label: copy.family.owner,
      description: copy.family.ownerDescription
    },
    editor: {
      label: copy.family.editor,
      description: copy.family.editorDescription
    },
    viewer: {
      label: copy.family.viewer,
      description: copy.family.viewerDescription
    }
  } as const;

  return (
    <AppScreen testID="family-screen">
      <View style={styles.heading}>
        <ScreenTitle>{copy.family.title}</ScreenTitle>
        <BodyText muted>{copy.family.intro}</BodyText>
      </View>

      <CommandSurface>
        <View style={[styles.summary, rtl && styles.rowReverse]}>
          <UsersThree color={colors.volt} size={29} weight="regular" />
          <View style={styles.summaryCopy}>
            <Text
              style={[
                styles.commandLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.family.householdEyebrow}
            </Text>
            <Text
              style={[
                styles.commandTitle,
                styles.mixedScriptText,
                rtl && styles.rtlAlign
              ]}
            >
              {signedRosterUnavailable
                ? copy.family.householdEyebrow
                : cloudRoster?.householdName ??
                  workspace.household.name}
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.commandMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {signedRosterUnavailable
            ? householdAccessStatus === "refreshing"
              ? adminCopy.refreshing
              : adminCopy.refreshFailedTitle
            : usesCloudRoster
              ? householdAccessSummary(
                  visibleMembers.length,
                  pendingInvites.length,
                  language
                )
              : familyMemberSummary(
                  visibleMembers.length,
                  activeCount,
                  language
                )}
        </Text>
      </CommandSurface>

      {usesCloudRoster ? (
        <HouseholdRosterStatus
          error={householdAccessError}
          onRefresh={() => void refreshHouseholdAccess()}
          status={householdAccessStatus}
        />
      ) : null}

      <Section style={styles.inviteSection}>
        {ownerCanInvite ? (
          <>
            <BodyText muted>{inviteCopy.family.inviteHint}</BodyText>
            <PrimaryButton
              icon={Plus}
              label={inviteCopy.family.inviteAction}
              onPress={() =>
                router.push(HOUSEHOLD_ROUTES.inviteMember)
              }
            />
          </>
        ) : (
          <View style={[styles.notice, rtl && styles.rowReverse]}>
            <ShieldCheck
              color={colors.text}
              size={23}
              weight="regular"
            />
            <View style={styles.noticeCopy}>
              <BodyText muted>
                {inviteCopy.family.ownerOnly}
              </BodyText>
            </View>
          </View>
        )}
      </Section>

      <Section>
        <Text
          style={[
            styles.sectionTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {adminCopy.peopleSection}
        </Text>
        {visibleMembers.map((member) => {
          const role = roleCopy[member.role];
          const manageable =
            ownerCanManage && !member.isCurrentUser;
          const content = (
            <>
              <View
                accessibilityLabel={memberAvatarAccessibilityLabel(
                  member.name,
                  language
                )}
                style={[
                  styles.avatar,
                  member.status === "invited" && styles.avatarInvited
                ]}
              >
                <Text style={[styles.avatarText, styles.mixedScriptText]}>
                  {member.initials}
                </Text>
              </View>
              <View style={styles.memberCopy}>
                <View style={[styles.memberNameRow, rtl && styles.rowReverse]}>
                  <Text
                    style={[
                      styles.memberName,
                      styles.mixedScriptText,
                      rtl && styles.rtlAlign
                    ]}
                  >
                    {member.name}
                  </Text>
                  <View style={styles.roleBadge}>
                    <Text
                      style={[
                        styles.roleBadgeText,
                        rtl && styles.arabicMedium,
                        rtl && styles.rtlText
                      ]}
                    >
                      {member.status === "active"
                        ? role.label
                        : copy.family.invited}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.memberDescription,
                    member.description && styles.mixedScriptText,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {member.description ?? role.description}
                </Text>
              </View>
              {manageable ? (
                rtl ? (
                  <CaretLeft
                    color={colors.textMuted}
                    size={20}
                    weight="bold"
                  />
                ) : (
                  <CaretRight
                    color={colors.textMuted}
                    size={20}
                    weight="bold"
                  />
                )
              ) : null}
            </>
          );
          return (
            <Pressable
              accessible={manageable}
              accessibilityHint={
                manageable ? adminCopy.manageHint : undefined
              }
              accessibilityLabel={
                manageable ? `${member.name}, ${role.label}` : undefined
              }
              accessibilityRole={manageable ? "button" : undefined}
              disabled={!manageable}
              key={member.id}
              onPress={() =>
                router.push({
                  pathname: HOUSEHOLD_ROUTES.memberAccess,
                  params: {
                    kind: "member",
                    id: member.id
                  }
                })
              }
              style={({ pressed }) => [
                styles.memberRow,
                rtl && styles.rowReverse,
                pressed && manageable && styles.rowPressed
              ]}
            >
              {content}
            </Pressable>
          );
        })}
      </Section>

      {ownerCanManage && pendingInvites.length > 0 ? (
        <Section>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {adminCopy.pendingSection}
          </Text>
          {pendingInvites.map((invite) => (
            <Pressable
              accessibilityHint={adminCopy.manageHint}
              accessibilityLabel={`${adminCopy.pendingName}, ${
                roleCopy[invite.role].label
              }`}
              accessibilityRole="button"
              key={invite.inviteId}
              onPress={() =>
                router.push({
                  pathname: HOUSEHOLD_ROUTES.memberAccess,
                  params: {
                    kind: "invite",
                    id: invite.inviteId
                  }
                })
              }
              style={({ pressed }) => [
                styles.memberRow,
                rtl && styles.rowReverse,
                pressed && styles.rowPressed
              ]}
            >
              <View style={[styles.avatar, styles.avatarInvited]}>
                <Clock color={colors.text} size={21} />
              </View>
              <View style={styles.memberCopy}>
                <Text
                  style={[
                    styles.memberName,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {adminCopy.pendingName}
                </Text>
                <Text
                  style={[
                    styles.memberDescription,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {adminCopy.pendingDescription}
                </Text>
              </View>
              {rtl ? (
                <CaretLeft color={colors.textMuted} size={20} weight="bold" />
              ) : (
                <CaretRight color={colors.textMuted} size={20} weight="bold" />
              )}
            </Pressable>
          ))}
        </Section>
      ) : null}

      {!usesCloudRoster && workspace.mode === "sample" ? (
        <View style={[styles.notice, rtl && styles.rowReverse]}>
          <ShieldCheck color={colors.text} size={23} weight="regular" />
          <View style={styles.noticeCopy}>
            <Text
              style={[
                styles.noticeTitle,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {adminCopy.previewTitle}
            </Text>
            <BodyText muted>{adminCopy.previewBody}</BodyText>
          </View>
        </View>
      ) : null}
    </AppScreen>
  );
}

export type HouseholdRosterStatusKind =
  | "idle"
  | "refreshing"
  | "ready"
  | "error";

export function HouseholdRosterStatus({
  error,
  onRefresh,
  status
}: {
  readonly error: ContractError | null;
  readonly onRefresh: () => void;
  readonly status: HouseholdRosterStatusKind;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = useHouseholdAdminCopy();
  const message =
    status === "ready"
      ? copy.refreshed
      : status === "refreshing"
        ? copy.refreshing
        : status === "error"
          ? householdAccessErrorMessage(error, language)
          : copy.refreshIdle;
  const refreshing = status === "refreshing";
  const failed = status === "error";

  useEffect(() => {
    if (Platform.OS === "ios" && status !== "idle") {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message, status]);

  return (
    <Section style={styles.refreshSection}>
      <View
        accessible
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
        accessibilityRole={
          refreshing ? "progressbar" : failed ? "alert" : "summary"
        }
        accessibilityState={{ busy: refreshing }}
        style={[
          styles.refreshRow,
          failed && styles.refreshRowWarning,
          rtl && styles.rowReverse
        ]}
        testID="family-access-status"
      >
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.statusIcon}
          testID={
            status === "ready"
              ? "family-access-ready-icon"
              : refreshing
                ? "family-access-progress-icon"
                : failed
                  ? "family-access-warning-icon"
                  : "family-access-idle-icon"
          }
        >
          {status === "ready" ? (
            <ShieldCheck color={colors.success} size={22} />
          ) : refreshing ? (
            <ActivityIndicator color={colors.action} size="small" />
          ) : failed ? (
            <WarningCircle
              color={colors.warning}
              size={22}
              weight="fill"
            />
          ) : (
            <ArrowClockwise color={colors.textMuted} size={22} />
          )}
        </View>
        <Text
          accessible={false}
          importantForAccessibility="no"
          style={[
            styles.refreshText,
            failed && styles.refreshTextWarning,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {message}
        </Text>
      </View>
      {failed ? (
        <PrimaryButton
          accessibilityHint={message}
          icon={ArrowClockwise}
          label={copy.refresh}
          onPress={onRefresh}
        />
      ) : (
        <SecondaryButton
          accessibilityHint={copy.refreshHint}
          disabled={refreshing}
          icon={ArrowClockwise}
          label={refreshing ? copy.refreshing : copy.refresh}
          loading={refreshing}
          onPress={onRefresh}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  rowReverse: {
    flexDirection: "row-reverse"
  },
  heading: {
    gap: spacing.xs
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  commandLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  commandMeta: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  inviteSection: {
    gap: spacing.sm
  },
  refreshSection: {
    gap: spacing.sm
  },
  refreshRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  refreshRowWarning: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.sm,
    backgroundColor: colors.warningQuiet
  },
  refreshText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  refreshTextWarning: {
    color: colors.warning
  },
  statusIcon: {
    width: 24,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  memberRow: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  avatarInvited: {
    borderStyle: "dashed",
    backgroundColor: colors.mist
  },
  avatarText: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  rowPressed: {
    opacity: 0.64
  },
  memberNameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs
  },
  memberName: {
    flex: 1,
    minWidth: 96,
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  memberDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  roleBadge: {
    maxWidth: "48%",
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xs,
    backgroundColor: colors.surface
  },
  roleBadgeText: {
    flexShrink: 1,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 16
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  },
  noticeCopy: {
    flex: 1,
    gap: spacing.xs
  },
  noticeTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21
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
  },
  mixedScriptText: {
    writingDirection: "auto"
  }
});
