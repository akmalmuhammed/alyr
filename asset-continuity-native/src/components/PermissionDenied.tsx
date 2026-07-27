import type { PermissionCapability } from "@alyr/contracts";
import { useRouter } from "expo-router";
import { LockKey } from "phosphor-react-native";
import { StyleSheet, Text, View } from "react-native";

import { useCoreJourneyCopy } from "@/i18n/coreJourneyCopy";
import { colors, radius, spacing, typography } from "@/theme/tokens";

import {
  AppScreen,
  BodyText,
  ScreenTitle,
  SecondaryButton
} from "./ui";

type PermissionLanguage = "en" | "ar";

interface PermissionConsequence {
  readonly title: string;
  readonly body: string;
  readonly back: string;
}

const PERMISSION_COPY: Record<
  PermissionLanguage,
  Record<
    "asset" | "place" | "evidence" | "export" | "household",
    PermissionConsequence
  >
> = {
  en: {
    asset: {
      title: "View-only item access",
      body:
        "Your current household role can view item Passports, but it cannot add or change them. Ask the household owner to update your access.",
      back: "Go back"
    },
    place: {
      title: "View-only Place access",
      body:
        "Your current household role can view Places and locations, but it cannot add or change them. Ask the household owner to update your access.",
      back: "Go back"
    },
    evidence: {
      title: "View-only proof access",
      body:
        "Your current household role can open shared proof, but it cannot attach files or record review decisions. Ask the household owner to update your access.",
      back: "Go back"
    },
    export: {
      title: "Export access is restricted",
      body:
        "Your current household role can view shared records, but it cannot create or restore household exports. Ask the household owner to update your access.",
      back: "Go back"
    },
    household: {
      title: "Owner access required",
      body:
        "This action changes the household itself. Ask the household owner to complete it or update your access.",
      back: "Go back"
    }
  },
  ar: {
    asset: {
      title: "صلاحية عرض الأغراض فقط",
      body:
        "يسمح لك دورك الحالي بعرض جوازات الأغراض، ولا يسمح بإضافتها أو تعديلها. اطلب من مالك الأسرة تحديث صلاحيتك.",
      back: "العودة"
    },
    place: {
      title: "صلاحية عرض الأماكن فقط",
      body:
        "يسمح لك دورك الحالي بعرض الأماكن والمواقع، ولا يسمح بإضافتها أو تعديلها. اطلب من مالك الأسرة تحديث صلاحيتك.",
      back: "العودة"
    },
    evidence: {
      title: "صلاحية عرض الإثباتات فقط",
      body:
        "يسمح لك دورك الحالي بفتح الإثباتات المشتركة، ولا يسمح بإرفاق الملفات أو تسجيل قرارات المراجعة. اطلب من مالك الأسرة تحديث صلاحيتك.",
      back: "العودة"
    },
    export: {
      title: "صلاحية التصدير مقيّدة",
      body:
        "يسمح لك دورك الحالي بعرض السجلات المشتركة، ولا يسمح بإنشاء صادرات الأسرة أو استعادتها. اطلب من مالك الأسرة تحديث صلاحيتك.",
      back: "العودة"
    },
    household: {
      title: "تتطلب هذه الخطوة صلاحية المالك",
      body:
        "تغيّر هذه الخطوة بيانات الأسرة نفسها. اطلب من مالك الأسرة تنفيذها أو تحديث صلاحيتك.",
      back: "العودة"
    }
  }
};

function permissionKind(
  capability: PermissionCapability
): keyof (typeof PERMISSION_COPY)["en"] {
  if (capability === "place.write") return "place";
  if (
    capability === "evidence.read" ||
    capability === "evidence.write"
  ) {
    return "evidence";
  }
  if (capability === "export.create") return "export";
  if (
    capability === "household.manage" ||
    capability === "member.manage"
  ) {
    return "household";
  }
  return "asset";
}

export function permissionConsequence(
  language: PermissionLanguage,
  capability: PermissionCapability
): PermissionConsequence {
  return PERMISSION_COPY[language][permissionKind(capability)];
}

export function PermissionNotice({
  capability,
  testID = "permission-notice"
}: {
  readonly capability: PermissionCapability;
  readonly testID?: string;
}) {
  const { language, rtl } = useCoreJourneyCopy();
  const copy = permissionConsequence(language, capability);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, rtl && styles.noticeRtl]}
      testID={testID}
    >
      <LockKey color={colors.text} size={22} weight="regular" />
      <View style={styles.noticeCopy}>
        <Text
          style={[
            styles.noticeTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.title}
        </Text>
        <Text
          style={[
            styles.noticeBody,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.body}
        </Text>
      </View>
    </View>
  );
}

export function PermissionDeniedScreen({
  capability
}: {
  readonly capability: PermissionCapability;
}) {
  const router = useRouter();
  const { language, rtl } = useCoreJourneyCopy();
  const copy = permissionConsequence(language, capability);
  return (
    <AppScreen safeEdges={[]} testID="permission-denied-screen">
      <View style={[styles.screen, rtl && styles.screenRtl]}>
        <LockKey color={colors.text} size={30} weight="regular" />
        <ScreenTitle size="medium">{copy.title}</ScreenTitle>
        <BodyText muted>{copy.body}</BodyText>
        <SecondaryButton
          label={copy.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  noticeRtl: {
    flexDirection: "row-reverse"
  },
  noticeCopy: {
    flex: 1,
    gap: spacing.xs
  },
  noticeTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  noticeBody: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  screen: {
    maxWidth: 520,
    alignItems: "flex-start",
    gap: spacing.md,
    paddingTop: spacing.lg
  },
  screenRtl: {
    alignItems: "flex-end"
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
