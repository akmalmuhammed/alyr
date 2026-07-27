import { useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, CheckCircle } from "phosphor-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  AppScreen,
  BodyText,
  CommandSurface,
  ScreenTitle,
  Section
} from "@/components/ui";
import { useCoreJourneyCopy } from "@/i18n/coreJourneyCopy";
import { colors, spacing, typography } from "@/theme/tokens";

export type LegalDocumentKind = "privacy" | "terms" | "support";

interface LegalSection {
  readonly title: string;
  readonly paragraphs?: readonly string[];
  readonly points?: readonly string[];
}

interface LegalDocument {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly version: string;
  readonly updated: string;
  readonly sections: readonly LegalSection[];
}

const ENGLISH: Record<LegalDocumentKind, LegalDocument> = {
  privacy: {
    eyebrow: "PRIVACY",
    title: "Pilot privacy notice",
    summary:
      "ALYR keeps a private household record of the items, places and proof you choose to add.",
    version: "Version 0.1",
    updated: "Updated 27 July 2026",
    sections: [
      {
        title: "What this test build stores",
        points: [
          "Expo Go and web preview records stay in the running test session. No confirmation email is sent.",
          "A signed pilot can store your email, household membership, item and Place details, location records, photos, documents and sync diagnostics.",
          "Precise location is requested only when you choose to place a property or item."
        ]
      },
      {
        title: "How the record is used",
        points: [
          "To show your household register, retrieval paths, proof and readiness.",
          "To synchronize authorized household devices in a signed cloud pilot.",
          "To diagnose failed uploads and protect records from duplicate sync."
        ]
      },
      {
        title: "Sharing and access",
        paragraphs: [
          "Records begin private to the household. Household roles control who can view, edit or manage access. ALYR does not use the register for advertising or sell household records."
        ]
      },
      {
        title: "Protection, retention and deletion",
        paragraphs: [
          "A development build encrypts local metadata and attachments. Expo Go is a visual test surface and does not provide the same device-protection boundary.",
          "Preview data can be reset from Vault. Signed-pilot account deletion and retention follow the controls shown in Account. Final store disclosures and operator contact details are completed before public release."
        ]
      }
    ]
  },
  terms: {
    eyebrow: "TERMS",
    title: "Pilot terms",
    summary:
      "These terms describe the personal test build and closed ALYR pilot.",
    version: "Version 0.1",
    updated: "Updated 27 July 2026",
    sections: [
      {
        title: "Purpose",
        paragraphs: [
          "ALYR is a household record and retrieval tool. It is not an appraisal, insurance policy, title register, password manager or live market valuation service."
        ]
      },
      {
        title: "Your records",
        points: [
          "Add only information and files you are permitted to keep in the household record.",
          "Do not store passwords, recovery phrases, seed phrases or authentication secrets.",
          "Review locations, values and proof dates before relying on them."
        ]
      },
      {
        title: "Household access",
        paragraphs: [
          "The household owner is responsible for invitations and roles. People with access may see the records allowed by their role."
        ]
      },
      {
        title: "Pilot availability",
        paragraphs: [
          "The free pilot may change, pause or reset while the product is being validated. Keep an independent Recovery Kit or readable export for records you need to retain."
        ]
      }
    ]
  },
  support: {
    eyebrow: "SUPPORT",
    title: "Pilot support",
    summary:
      "Use these steps to get help without exposing private household material.",
    version: "Support guide 0.1",
    updated: "Updated 27 July 2026",
    sections: [
      {
        title: "Before reporting an issue",
        points: [
          "Open Vault → Advanced diagnostics and note the visible sync state.",
          "Include the device model, operating-system version, ALYR build and the step where the issue occurred.",
          "Remove names, addresses, coordinates, photos and document contents from screenshots."
        ]
      },
      {
        title: "Records and recovery",
        points: [
          "Keep the app installed while a local record is waiting to sync.",
          "Use a verified Recovery Kit before replacing a signed-build workspace.",
          "Preview sessions are for test information and reset when the session ends."
        ]
      },
      {
        title: "Contact",
        paragraphs: [
          "Closed-pilot support and privacy contact details are supplied with the pilot invitation. The final public support address is added before store distribution."
        ]
      }
    ]
  }
};

const ARABIC: Record<LegalDocumentKind, LegalDocument> = {
  privacy: {
    eyebrow: "الخصوصية",
    title: "إشعار خصوصية النسخة التجريبية",
    summary:
      "يحفظ ALYR سجلًا منزليًا خاصًا للأغراض والأماكن والإثباتات التي تختار إضافتها.",
    version: "الإصدار 0.1",
    updated: "آخر تحديث: 27 يوليو 2026",
    sections: [
      {
        title: "ما الذي تحفظه هذه النسخة",
        points: [
          "تبقى سجلات Expo Go ومعاينة الويب داخل جلسة الاختبار، ولا تُرسل رسالة تأكيد.",
          "قد تحفظ النسخة التجريبية الموقعة بريدك وعضوية المنزل وتفاصيل الأغراض والأماكن والمواقع والصور والمستندات وتشخيصات المزامنة.",
          "لا يُطلب الموقع الدقيق إلا عندما تختار تحديد مكان عقار أو غرض."
        ]
      },
      {
        title: "كيف يُستخدم السجل",
        points: [
          "لعرض سجل المنزل ومسارات الاسترجاع والإثباتات والجاهزية.",
          "لمزامنة أجهزة المنزل المصرّح لها في النسخة السحابية الموقعة.",
          "لتشخيص فشل الرفع ومنع تكرار السجلات أثناء المزامنة."
        ]
      },
      {
        title: "المشاركة والصلاحيات",
        paragraphs: [
          "تبدأ السجلات خاصة بالمنزل، وتحدد الأدوار من يمكنه العرض أو التعديل أو إدارة الوصول. لا تُباع سجلات المنزل ولا تُستخدم للإعلانات."
        ]
      },
      {
        title: "الحماية والاحتفاظ والحذف",
        paragraphs: [
          "تشفّر نسخة التطوير البيانات المحلية والمرفقات. أما Expo Go فهو سطح اختبار بصري ولا يقدم مستوى حماية الجهاز نفسه.",
          "يمكن تصفير بيانات المعاينة من الخزنة. تتبع عملية حذف حساب النسخة الموقعة عناصر التحكم الظاهرة في الحساب. تُستكمل بيانات المتجر وجهة التواصل قبل الإطلاق العام."
        ]
      }
    ]
  },
  terms: {
    eyebrow: "الشروط",
    title: "شروط النسخة التجريبية",
    summary:
      "تصف هذه الشروط نسخة الاختبار الشخصي وتجربة ALYR المغلقة.",
    version: "الإصدار 0.1",
    updated: "آخر تحديث: 27 يوليو 2026",
    sections: [
      {
        title: "الغرض",
        paragraphs: [
          "ALYR أداة لسجل المنزل والاسترجاع، وليس تقييمًا أو وثيقة تأمين أو سجل ملكية أو مدير كلمات مرور أو خدمة أسعار سوق مباشرة."
        ]
      },
      {
        title: "سجلاتك",
        points: [
          "أضف فقط المعلومات والملفات المسموح لك بحفظها في سجل المنزل.",
          "لا تحفظ كلمات المرور أو عبارات الاسترداد أو العبارات الأولية أو أسرار المصادقة.",
          "راجع المواقع والقيم وتواريخ الإثبات قبل الاعتماد عليها."
        ]
      },
      {
        title: "الوصول المنزلي",
        paragraphs: [
          "يتحمل مالك المنزل مسؤولية الدعوات والأدوار، وقد يرى الأشخاص السجلات التي يسمح بها دورهم."
        ]
      },
      {
        title: "توفر النسخة التجريبية",
        paragraphs: [
          "قد تتغير التجربة المجانية أو تتوقف مؤقتًا أو تُصفّر أثناء التحقق من المنتج. احتفظ بحزمة استرداد مستقلة أو نسخة مقروءة للسجلات المهمة."
        ]
      }
    ]
  },
  support: {
    eyebrow: "الدعم",
    title: "دعم النسخة التجريبية",
    summary:
      "اتبع هذه الخطوات لطلب المساعدة من دون كشف مواد المنزل الخاصة.",
    version: "دليل الدعم 0.1",
    updated: "آخر تحديث: 27 يوليو 2026",
    sections: [
      {
        title: "قبل الإبلاغ عن مشكلة",
        points: [
          "افتح الخزنة ← التشخيصات المتقدمة وسجّل حالة المزامنة الظاهرة.",
          "اذكر طراز الجهاز وإصدار النظام وإصدار ALYR والخطوة التي حدثت فيها المشكلة.",
          "احذف الأسماء والعناوين والإحداثيات والصور ومحتوى المستندات من لقطات الشاشة."
        ]
      },
      {
        title: "السجلات والاسترداد",
        points: [
          "أبقِ التطبيق مثبتًا ما دام هناك سجل محلي ينتظر المزامنة.",
          "استخدم حزمة استرداد متحققًا منها قبل استبدال مساحة نسخة موقعة.",
          "جلسات المعاينة مخصصة لبيانات الاختبار وتُصفّر عند انتهائها."
        ]
      },
      {
        title: "التواصل",
        paragraphs: [
          "تُرسل بيانات دعم التجربة المغلقة والتواصل بشأن الخصوصية مع دعوة التجربة. يُضاف عنوان الدعم العام قبل النشر في المتجر."
        ]
      }
    ]
  }
};

export function LegalDocumentScreen({
  kind
}: {
  readonly kind: LegalDocumentKind;
}) {
  const router = useRouter();
  const { language, rtl } = useCoreJourneyCopy();
  const document = (language === "ar" ? ARABIC : ENGLISH)[kind];
  const BackIcon = rtl ? ArrowRight : ArrowLeft;

  return (
    <AppScreen testID={`legal-${kind}-screen`}>
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <Pressable
          accessibilityLabel={language === "ar" ? "رجوع" : "Back"}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/")
          }
          style={({ pressed }) => [
            styles.back,
            pressed && styles.pressed
          ]}
        >
          <BackIcon color={colors.text} size={22} />
        </Pressable>
        <Text
          style={[
            styles.version,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {document.version}
        </Text>
      </View>

      <View style={styles.heading}>
        <Text
          style={[
            styles.eyebrow,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {document.eyebrow}
        </Text>
        <ScreenTitle>{document.title}</ScreenTitle>
        <BodyText muted>{document.summary}</BodyText>
        <Text
          style={[
            styles.updated,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {document.updated}
        </Text>
      </View>

      <CommandSurface>
        <Text
          style={[
            styles.commandTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {language === "ar"
            ? "واضح ومحدد بالنسخة"
            : "Clear about the build you are using"}
        </Text>
        <Text
          style={[
            styles.commandBody,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {language === "ar"
            ? "توضح شاشات ALYR دائمًا الفرق بين المعاينة المحلية والنسخة الموقعة والمزامنة السحابية."
            : "ALYR surfaces the difference between a local preview, a signed build and cloud synchronization."}
        </Text>
      </CommandSurface>

      {document.sections.map((section) => (
        <Section key={section.title}>
          <Text
            style={[
              styles.sectionTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {section.title}
          </Text>
          {section.paragraphs?.map((paragraph) => (
            <Text
              key={paragraph}
              style={[
                styles.paragraph,
                rtl && styles.arabic,
                rtl && styles.rtlText
              ]}
            >
              {paragraph}
            </Text>
          ))}
          {section.points?.map((point) => (
            <View
              key={point}
              style={[styles.point, rtl && styles.rowReverse]}
            >
              <CheckCircle
                color={colors.action}
                size={19}
                weight="regular"
              />
              <Text
                style={[
                  styles.pointText,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {point}
              </Text>
            </View>
          ))}
        </Section>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  back: {
    width: 44,
    height: 44,
    marginStart: -spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: {
    opacity: 0.62
  },
  version: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    lineHeight: 18
  },
  heading: {
    gap: spacing.sm
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1
  },
  updated: {
    color: colors.textFaint,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  commandTitle: {
    color: colors.white,
    fontFamily: typography.display,
    fontSize: 21,
    lineHeight: 27
  },
  commandBody: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  paragraph: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 23
  },
  point: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  pointText: {
    minWidth: 0,
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
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
  }
});
