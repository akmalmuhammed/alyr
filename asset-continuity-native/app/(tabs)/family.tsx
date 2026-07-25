import { ROLE_CAPABILITIES } from "@alyr/contracts";
import { useRouter } from "expo-router";
import {
  Eye,
  Key,
  ShieldCheck,
  UserPlus,
  UsersThree
} from "phosphor-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  BodyText,
  PrimaryButton,
  ScreenTitle,
  StatusPill,
  Surface
} from "@/components/ui";
import { useCopy } from "@/i18n/copy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const roleCopy = {
  owner: {
    label: "Owner",
    description: "Manages the household, members, records, and exports."
  },
  editor: {
    label: "Editor",
    description: "Adds and maintains Places, Passports, and materials."
  },
  viewer: {
    label: "Viewer",
    description: "Reads the household register without changing it."
  }
} as const;

export default function FamilyScreen() {
  const { workspace } = useWorkspace();
  const { text, rtl } = useCopy();
  if (!workspace) return null;

  const explainInvite = () => {
    Alert.alert(
      "Invitations are not active yet",
      "The free local pilot does not send email or grant remote access. One-time manual codes will be enabled only with the authenticated cloud pilot."
    );
  };

  return (
    <AppScreen testID="family-screen">
      <View style={styles.heading}>
        <StatusPill label="Household access" tone="violet" />
        <ScreenTitle>{text.family}</ScreenTitle>
        <BodyText muted>
          Separate who owns an asset, who currently holds it, and who may see
          its record.
        </BodyText>
      </View>

      <Surface emphasis>
        <View style={[styles.familySummary, rtl && styles.rowReverse]}>
          <View style={styles.summaryIcon}>
            <UsersThree color={colors.violetSoft} size={32} weight="duotone" />
          </View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryName}>{workspace.household.name}</Text>
            <Text style={styles.summaryMeta}>
              {workspace.members.length} people ·{" "}
              {workspace.members.filter((member) => member.status === "active").length}{" "}
              active
            </Text>
          </View>
          <ShieldCheck color={colors.volt} size={25} weight="duotone" />
        </View>
      </Surface>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>People</Text>
        {workspace.members.map((member) => {
          const role = roleCopy[member.role];
          return (
            <View
              key={member.id}
              style={[styles.memberRow, rtl && styles.rowReverse]}
            >
              <View
                accessibilityLabel={`${member.name} avatar`}
                style={[
                  styles.avatar,
                  member.status === "invited" && styles.avatarInvited
                ]}
              >
                <Text style={styles.avatarText}>{member.initials}</Text>
              </View>
              <View style={styles.memberCopy}>
                <View style={[styles.memberNameRow, rtl && styles.rowReverse]}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <StatusPill
                    label={member.status === "active" ? role.label : "Invited"}
                    tone={member.status === "active" ? "cyan" : "warning"}
                  />
                </View>
                <Text style={styles.memberDescription}>{role.description}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Surface>
        <View style={styles.permissionHeader}>
          <View style={styles.permissionIcon}>
            <Key color={colors.cyan} size={22} weight="duotone" />
          </View>
          <View style={styles.permissionCopy}>
            <Text style={styles.permissionTitle}>Role boundaries</Text>
            <BodyText muted>
              Permissions are deny-by-default in the production contract.
            </BodyText>
          </View>
        </View>
        {(["owner", "editor", "viewer"] as const).map((role) => (
          <View key={role} style={styles.roleRow}>
            <Eye color={colors.textMuted} size={17} />
            <Text style={styles.roleName}>{roleCopy[role].label}</Text>
            <Text numberOfLines={1} style={styles.roleCount}>
              {ROLE_CAPABILITIES[role].length} capabilities
            </Text>
          </View>
        ))}
      </Surface>

      <PrimaryButton
        icon={UserPlus}
        label="Prepare trusted invitation"
        onPress={explainInvite}
      />
      <BodyText muted style={styles.disclaimer}>
        No invitation is sent and no remote permission is granted from this
        local build.
      </BodyText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: "row-reverse" },
  heading: {
    gap: spacing.sm
  },
  familySummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  summaryIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.violetQuiet
  },
  summaryCopy: {
    flex: 1,
    gap: 4
  },
  summaryName: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18
  },
  summaryMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20
  },
  memberRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 216, 245, 0.3)",
    borderRadius: radius.round,
    backgroundColor: colors.cyanQuiet
  },
  avatarInvited: {
    borderStyle: "dashed",
    borderColor: "rgba(242, 179, 93, 0.4)",
    backgroundColor: colors.warningQuiet
  },
  avatarText: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 13
  },
  memberCopy: {
    flex: 1,
    gap: 5
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs
  },
  memberName: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  memberDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  permissionIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.cyanQuiet
  },
  permissionCopy: {
    flex: 1,
    gap: 2
  },
  permissionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  roleRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  roleName: {
    width: 58,
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  roleCount: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  },
  disclaimer: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18
  }
});
