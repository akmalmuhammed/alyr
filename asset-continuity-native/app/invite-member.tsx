import type {
  HouseholdInvite,
  HouseholdRole
} from "@alyr/contracts";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Redirect, useRouter } from "expo-router";
import {
  Check,
  Clock,
  CopySimple,
  Eye,
  PencilSimple,
  ShareNetwork,
  UsersThree
} from "phosphor-react-native";
import { useState } from "react";
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import {
  AuthActions,
  AuthHeading,
  AuthNotice,
  AuthScaffold,
  SelectionRow
} from "@/auth/components";
import {
  formatInvitationExpiry,
  groupInvitationCode,
  invitationShareMessage,
  inviteFailureMessage,
  useInviteCopy
} from "@/i18n/inviteCopy";
import { useLocale } from "@/i18n/LocaleProvider";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";
import { useWorkspace } from "@/state/WorkspaceProvider";
import {
  colors,
  radius,
  spacing,
  typography
} from "@/theme/tokens";

type InviteRole = Exclude<HouseholdRole, "owner">;
type InviteHours = 24 | 72 | 168;
type CopyState = "idle" | "copying" | "copied" | "error";

const expiryChoices = [24, 72, 168] as const;

function ReceiptRow({
  label,
  last = false,
  rtl,
  value
}: {
  readonly label: string;
  readonly last?: boolean;
  readonly rtl: boolean;
  readonly value: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${value}`}
      style={[
        styles.receiptRow,
        last && styles.receiptRowLast,
        rtl && styles.rowReverse
      ]}
    >
      <Text
        style={[
          styles.receiptLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.receiptValue,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText,
          rtl && styles.receiptValueRtl
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function InviteMemberScreen() {
  const router = useRouter();
  const {
    busy,
    clearError,
    createHouseholdInvite,
    error,
    householdName,
    mode,
    session
  } = useAuthFlow();
  const { trackAccessGrantCreated } = useWorkspace();
  const { language, rtl } = useLocale();
  const copy = useInviteCopy();
  const [role, setRole] = useState<InviteRole>("viewer");
  const [expiresInHours, setExpiresInHours] =
    useState<InviteHours>(72);
  const [invite, setInvite] = useState<HouseholdInvite | null>(
    null
  );
  const [copyState, setCopyState] =
    useState<CopyState>("idle");

  if (
    !session ||
    !session.activeHouseholdId ||
    !session.activeMembershipId ||
    session.activeHouseholdRole !== "owner"
  ) {
    return <Redirect href={PRIMARY_ROUTES.family} />;
  }

  const create = async () => {
    const created = await createHouseholdInvite(
      role,
      expiresInHours
    );
    if (created) {
      await trackAccessGrantCreated?.(role, expiresInHours);
      setInvite(created);
    }
  };

  const share = async () => {
    if (!invite) return;
    await Share.share({
      message: invitationShareMessage(
        householdName.trim() || copy.screen.householdFallback,
        invite.oneTimeCode,
        invite.role,
        invite.expiresAt,
        language,
        Linking.createURL("/join", {
          queryParams: { code: invite.oneTimeCode }
        })
      )
    });
  };

  const copyCode = async () => {
    if (!invite || copyState === "copying") return;
    setCopyState("copying");
    try {
      await Clipboard.setStringAsync(invite.oneTimeCode);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  if (invite) {
    const receiptHousehold =
      householdName.trim() || copy.screen.householdFallback;
    const receiptRole =
      invite.role === "editor"
        ? copy.screen.editor
        : copy.screen.viewer;
    const receiptExpiry = formatInvitationExpiry(
      invite.expiresAt,
      language
    );
    const codeGroups = groupInvitationCode(invite.oneTimeCode);

    return (
      <AuthScaffold
        footer={
          <AuthActions
            primary={{
              label: copy.screen.shareAction,
              icon: ShareNetwork,
              onPress: () => void share()
            }}
            secondary={{
              label: copy.screen.createAnother,
              onPress: () => {
                setCopyState("idle");
                setInvite(null);
              }
            }}
          />
        }
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(PRIMARY_ROUTES.family)
        }
        testID="invite-member-result"
      >
        <View style={styles.content}>
          <AuthHeading
            body={copy.screen.resultBody}
            eyebrow={copy.screen.resultEyebrow}
            title={copy.screen.resultTitle}
          />
          <View style={styles.receipt}>
            <ReceiptRow
              label={copy.screen.householdLabel}
              rtl={rtl}
              value={receiptHousehold}
            />
            <ReceiptRow
              label={copy.screen.roleLabel}
              rtl={rtl}
              value={receiptRole}
            />
            <ReceiptRow
              label={copy.screen.expiresAtLabel}
              last
              rtl={rtl}
              value={receiptExpiry}
            />
          </View>

          <View style={styles.codePanel}>
            <View
              style={[
                styles.codeHeader,
                rtl && styles.rowReverse
              ]}
            >
              <Text
                style={[
                  styles.codeLabel,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.screen.codeLabel}
              </Text>
              <Pressable
                accessibilityHint={copy.screen.copyHint}
                accessibilityLabel={
                  copyState === "copied"
                    ? copy.screen.copiedAction
                    : copy.screen.copyAction
                }
                accessibilityLiveRegion="polite"
                accessibilityRole="button"
                accessibilityState={{
                  disabled: copyState === "copying"
                }}
                disabled={copyState === "copying"}
                onPress={() => void copyCode()}
                style={({ pressed }) => [
                  styles.copyAction,
                  pressed && styles.pressed
                ]}
              >
                {copyState === "copied" ? (
                  <Check
                    color={colors.actionText}
                    size={17}
                    weight="bold"
                  />
                ) : (
                  <CopySimple
                    color={colors.actionText}
                    size={17}
                    weight="bold"
                  />
                )}
                <Text
                  style={[
                    styles.copyActionLabel,
                    rtl && styles.arabicMedium
                  ]}
                >
                  {copyState === "copied"
                    ? copy.screen.copiedAction
                    : copy.screen.copyAction}
                </Text>
              </Pressable>
            </View>
            <View
              accessible
              accessibilityLabel={`${copy.screen.codeLabel}. ${invite.oneTimeCode}`}
              style={styles.codeValueRow}
            >
              {codeGroups.map((group, index) => (
                <Text key={`${group}-${index}`} style={styles.codeValue}>
                  {group}
                </Text>
              ))}
            </View>
          </View>
          {copyState === "error" ? (
            <AuthNotice live tone="attention">
              {copy.screen.copyFailure}
            </AuthNotice>
          ) : null}
          <AuthNotice>
            {mode === "preview"
              ? `${copy.screen.volatileNotice} ${copy.screen.previewNotice}`
              : copy.screen.volatileNotice}
          </AuthNotice>
        </View>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      footer={
        <AuthActions
          primary={{
            label: copy.screen.createAction,
            icon: UsersThree,
            loading: busy,
            disabled: busy,
            onPress: () => void create()
          }}
        />
      }
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace(PRIMARY_ROUTES.family)
      }
      testID="invite-member-screen"
    >
      <View style={styles.content}>
        <AuthHeading
          body={copy.screen.body}
          eyebrow={copy.screen.eyebrow}
          title={copy.screen.title}
        />

        <View style={styles.fieldGroup}>
          <Text
            style={[
              styles.fieldLabel,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.screen.roleLabel}
          </Text>
          <View accessibilityRole="radiogroup">
            <SelectionRow
              active={role === "viewer"}
              description={copy.screen.viewerDescription}
              icon={Eye}
              label={copy.screen.viewer}
              onPress={() => {
                clearError();
                setRole("viewer");
              }}
            />
            <SelectionRow
              active={role === "editor"}
              description={copy.screen.editorDescription}
              icon={PencilSimple}
              label={copy.screen.editor}
              onPress={() => {
                clearError();
                setRole("editor");
              }}
            />
          </View>
          <AuthNotice>
            {role === "editor"
              ? copy.screen.roleConsequenceEditor
              : copy.screen.roleConsequenceViewer}
          </AuthNotice>
        </View>

        <View style={styles.fieldGroup}>
          <View style={[styles.labelRow, rtl && styles.rowReverse]}>
            <Clock color={colors.text} size={20} />
            <Text
              style={[
                styles.fieldLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.screen.expiryLabel}
            </Text>
          </View>
          <View
            accessibilityRole="radiogroup"
            style={[styles.expiryRow, rtl && styles.rowReverse]}
          >
            {expiryChoices.map((hours) => {
              const active = expiresInHours === hours;
              const label =
                hours === 24
                  ? copy.screen.expiry24
                  : hours === 72
                    ? copy.screen.expiry72
                    : copy.screen.expiry168;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  key={hours}
                  onPress={() => {
                    clearError();
                    setExpiresInHours(hours);
                  }}
                  style={({ pressed }) => [
                    styles.expiryChoice,
                    active && styles.expiryChoiceActive,
                    pressed && styles.pressed
                  ]}
                >
                  <Text
                    style={[
                      styles.expiryText,
                      active && styles.expiryTextActive,
                      rtl && styles.arabicMedium
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {mode === "preview" ? (
          <AuthNotice>{copy.screen.previewNotice}</AuthNotice>
        ) : null}
        {error ? (
          <AuthNotice live tone="attention">
            {inviteFailureMessage(error.code, language)}
          </AuthNotice>
        ) : null}
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl
  },
  fieldGroup: {
    gap: spacing.sm
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  expiryRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  expiryChoice: {
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  expiryChoiceActive: {
    borderColor: colors.carbon,
    backgroundColor: colors.carbon
  },
  expiryText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    textAlign: "center"
  },
  expiryTextActive: {
    color: colors.white
  },
  receipt: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  receiptRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm
  },
  receiptLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 19
  },
  receiptValue: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right"
  },
  receiptValueRtl: {
    textAlign: "left"
  },
  receiptRowLast: {
    borderBottomWidth: 0
  },
  codePanel: {
    gap: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.carbon,
    borderRadius: radius.lg,
    backgroundColor: colors.carbon
  },
  codeHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  codeLabel: {
    flex: 1,
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  copyAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.action
  },
  copyActionLabel: {
    color: colors.actionText,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 18
  },
  codeValueRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    writingDirection: "ltr"
  },
  codeValue: {
    color: colors.white,
    fontFamily: "monospace",
    fontSize: 27,
    lineHeight: 34,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1.4,
    writingDirection: "ltr"
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  pressed: {
    opacity: 0.76
  }
});
