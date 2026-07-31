import { useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, CheckCircle } from "phosphor-react-native";
import {
  Linking,
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
import {
  HELDAT_PUBLIC_CONTACTS,
  HELDAT_PUBLIC_ENDPOINTS
} from "@/release/publicEndpoints";
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
  readonly publicLinkLabel: string;
  readonly sections: readonly LegalSection[];
}

const ENGLISH: Record<LegalDocumentKind, LegalDocument> = {
  privacy: {
    eyebrow: "PRIVACY",
    title: "Pilot privacy notice",
    summary:
      "Heldat keeps a private household record of the items, places and proof you choose to add.",
    version: "Effective 31 July 2026 · Version 1.0",
    updated: "Public notice · Last revised 31 July 2026",
    publicLinkLabel: "Open the current privacy notice",
    sections: [
      {
        title: "What Heldat stores",
        points: [
          "The sample workspace stays isolated on this device and is not synchronized with a personal household.",
          "A personal household can store your email, membership, item and Place details, location records, photos, documents and sync diagnostics.",
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
        title: "Closed-pilot product measurement",
        paragraphs: [
          "For signed personal households, Heldat records a small set of product-interaction events to measure pilot activation, retention and reliability. Events can show that setup, a Passport, retrieval confirmation, invitation or export was completed."
        ],
        points: [
          "Event properties are limited to reviewed categories such as platform, app version, language, offline state, action source and coarse time or count bands.",
          "Asset names, recorded amounts, addresses, coordinates, retrieval clues, filenames and document contents are excluded from these events.",
          "Events are linked to the authenticated account and household for first-party analysis only. They are not used for advertising or cross-app tracking."
        ]
      },
      {
        title: "Sharing and access",
        paragraphs: [
          "Records begin private to the household. Household roles control who can view, edit or manage access. Heldat does not use the register for advertising or sell household records."
        ]
      },
      {
        title: "Protection, retention and deletion",
        paragraphs: [
          "Installed iPhone and Android builds encrypt local metadata and attachments. A sample is not a cloud backup.",
          "Sample data can be reset from Vault. Personal-account deletion and retention follow the controls shown in Account. Closed-pilot contact and retention details are supplied with each invitation."
        ]
      }
    ]
  },
  terms: {
    eyebrow: "TERMS",
    title: "Pilot terms",
    summary:
      "These terms describe personal use and the closed Heldat pilot.",
    version: "Effective 31 July 2026 · Version 1.0",
    updated: "Public terms · Last revised 31 July 2026",
    publicLinkLabel: "Open the current terms",
    sections: [
      {
        title: "Purpose",
        paragraphs: [
          "Heldat is a household record and retrieval tool. It is not an appraisal, insurance policy, title register, password manager or live market valuation service."
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
    version: "Support guide",
    updated: "Public support · Last revised 31 July 2026",
    publicLinkLabel: "Open Heldat support",
    sections: [
      {
        title: "Before reporting an issue",
        points: [
          "Open Vault → Advanced diagnostics and note the visible sync state.",
          "Include the device model, operating-system version, Heldat build and the step where the issue occurred.",
          "Remove names, addresses, coordinates, photos and document contents from screenshots."
        ]
      },
      {
        title: "Records and recovery",
        points: [
          "Keep the app installed while a local record is waiting to sync.",
          "Use a verified Recovery Kit before replacing a signed-build workspace.",
          "Sample workspaces are for exploration and should not contain personal records."
        ]
      },
      {
        title: "Contact",
        paragraphs: [
          `Product support: ${HELDAT_PUBLIC_CONTACTS.support}. Privacy requests: ${HELDAT_PUBLIC_CONTACTS.privacy}. Security reports: ${HELDAT_PUBLIC_CONTACTS.security}.`
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
      "يحفظ Heldat سجلًا منزليًا خاصًا للأغراض والأماكن والإثباتات التي تختار إضافتها.",
    version: "ساري من 31 يوليو 2026 · الإصدار 1.0",
    updated: "إشعار عام · آخر مراجعة 31 يوليو 2026",
    publicLinkLabel: "فتح إشعار الخصوصية الحالي",
    sections: [
      {
        title: "ما الذي تحفظه هذه النسخة",
        points: [
          "تبقى مساحة العمل النموذجية معزولة على هذا الجهاز ولا تتم مزامنتها مع منزل شخصي.",
          "قد يحفظ المنزل الشخصي بريدك وعضوية المنزل وتفاصيل الأغراض والأماكن والمواقع والصور والمستندات وتشخيصات المزامنة.",
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
        title: "قياس استخدام التجربة المغلقة",
        paragraphs: [
          "في المنازل الشخصية المسجّلة، يسجل Heldat مجموعة محدودة من أحداث التفاعل لقياس بدء الاستخدام والعودة إلى المنتج وموثوقيته. قد يبين الحدث اكتمال إعداد المنزل أو جواز غرض أو تأكيد استرجاع أو دعوة أو تصدير."
        ],
        points: [
          "تقتصر خصائص الحدث على فئات مراجَعة مثل المنصة وإصدار التطبيق واللغة وحالة الاتصال ومصدر الإجراء ونطاقات زمنية أو عددية عامة.",
          "لا تتضمن هذه الأحداث أسماء الأغراض أو المبالغ المسجلة أو العناوين أو الإحداثيات أو أدلة الاسترجاع أو أسماء الملفات أو محتوى المستندات.",
          "ترتبط الأحداث بالحساب والمنزل المصادق عليهما للتحليل الداخلي فقط، ولا تُستخدم للإعلانات أو للتتبع عبر التطبيقات."
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
          "تشفّر نسخ iPhone وAndroid المثبتة البيانات الوصفية المحلية والمرفقات. ولا تُعد مساحة العمل النموذجية نسخة احتياطية سحابية.",
          "يمكن تصفير بيانات العينة من الخزنة. ويتبع حذف الحساب الشخصي والاحتفاظ به عناصر التحكم الظاهرة في الحساب، وتُرسل تفاصيل التواصل والاحتفاظ الخاصة بالتجربة المغلقة مع كل دعوة."
        ]
      }
    ]
  },
  terms: {
    eyebrow: "الشروط",
    title: "شروط النسخة التجريبية",
    summary:
      "تصف هذه الشروط نسخة الاختبار الشخصي وتجربة Heldat المغلقة.",
    version: "ساري من 31 يوليو 2026 · الإصدار 1.0",
    updated: "شروط عامة · آخر مراجعة 31 يوليو 2026",
    publicLinkLabel: "فتح الشروط الحالية",
    sections: [
      {
        title: "الغرض",
        paragraphs: [
          "Heldat أداة لسجل المنزل والاسترجاع، وليس تقييمًا أو وثيقة تأمين أو سجل ملكية أو مدير كلمات مرور أو خدمة أسعار سوق مباشرة."
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
    version: "دليل الدعم",
    updated: "دعم عام · آخر مراجعة 31 يوليو 2026",
    publicLinkLabel: "فتح دعم Heldat",
    sections: [
      {
        title: "قبل الإبلاغ عن مشكلة",
        points: [
          "افتح الخزنة ← التشخيصات المتقدمة وسجّل حالة المزامنة الظاهرة.",
          "اذكر طراز الجهاز وإصدار النظام وإصدار Heldat والخطوة التي حدثت فيها المشكلة.",
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
          `دعم المنتج: ${HELDAT_PUBLIC_CONTACTS.support}. طلبات الخصوصية: ${HELDAT_PUBLIC_CONTACTS.privacy}. بلاغات الأمان: ${HELDAT_PUBLIC_CONTACTS.security}.`
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
  const publicUrl = HELDAT_PUBLIC_ENDPOINTS[kind];
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
            ? "الحماية تتبع مساحة عملك"
            : "Protection follows your workspace"}
        </Text>
        <Text
          style={[
            styles.commandBody,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {language === "ar"
            ? "تبقى العينة على هذا الجهاز. ويمكن للمنازل الشخصية استخدام التخزين المحلي المشفّر والمزامنة السحابية بعد تسجيل الدخول."
            : "A sample stays on this device. Personal households can use encrypted local storage and cloud synchronization after sign-in."}
        </Text>
      </CommandSurface>

      <Pressable
        accessibilityHint={
          language === "ar"
            ? "يفتح صفحة Heldat العامة في المتصفح"
            : "Opens the public Heldat page in your browser"
        }
        accessibilityLabel={document.publicLinkLabel}
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL(publicUrl);
        }}
        style={({ pressed }) => [
          styles.publicLink,
          rtl && styles.rowReverse,
          pressed && styles.pressed
        ]}
        testID={`legal-${kind}-public-link`}
      >
        <Text
          style={[
            styles.publicLinkText,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {document.publicLinkLabel}
        </Text>
        <Text
          style={[
            styles.publicLinkUrl,
            rtl && styles.rtlText
          ]}
        >
          {publicUrl}
        </Text>
      </Pressable>

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
    fontSize: 12,
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
  publicLink: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    justifyContent: "center",
    gap: 3
  },
  publicLinkText: {
    color: colors.action,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  publicLinkUrl: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18
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
