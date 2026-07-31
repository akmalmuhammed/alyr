import { useMemo } from "react";

import type { LanguageCode } from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";

export const WORLDLINE_ONBOARDING_SCENE_IDS = [
  "promise",
  "place",
  "proof",
  "start"
] as const;

export type WorldlineOnboardingSceneId =
  (typeof WORLDLINE_ONBOARDING_SCENE_IDS)[number];

export interface WorldlineOnboardingSceneCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly primaryAction: string;
  readonly secondaryAction?: string;
  readonly quietAction?: string;
}

export interface WorldlineOnboardingCopy {
  readonly progressLabel: (
    currentScene: number,
    totalScenes: number
  ) => string;
  readonly exampleLabel: string;
  readonly exampleGlobeLabel: string;
  readonly examples: {
    readonly watch: string;
    readonly document: string;
    readonly home: string;
  };
  readonly scenes: Readonly<
    Record<
      WorldlineOnboardingSceneId,
      WorldlineOnboardingSceneCopy
    >
  >;
}

export const WORLDLINE_ONBOARDING_COPY: Readonly<
  Record<LanguageCode, WorldlineOnboardingCopy>
> = {
  en: {
    progressLabel: (currentScene, totalScenes) =>
      `Introduction, step ${currentScene} of ${totalScenes}`,
    exampleLabel: "Illustrative example",
    exampleGlobeLabel:
      "Illustrative globe showing example items connected to example places",
    examples: {
      watch: "Watch",
      document: "Document",
      home: "Home"
    },
    scenes: {
      promise: {
        eyebrow: "ONE CONNECTED RECORD",
        title: "Know what you have. Know where it is.",
        body:
          "Keep important things, exact places and proof connected in one private record.",
        primaryAction: "Show me how",
        secondaryAction: "Skip introduction",
        quietAction: "Sign in"
      },
      place: {
        eyebrow: "PLACE",
        title: "Everything connects to a place.",
        body:
          "A property, room, shelf or precise pin—use the level of detail you actually know.",
        primaryAction: "Continue",
        secondaryAction: "Back"
      },
      proof: {
        eyebrow: "PROOF",
        title: "Keep the proof beside the thing.",
        body:
          "Photos, receipts and documents stay connected to the item they support.",
        primaryAction: "Continue",
        secondaryAction: "Back"
      },
      start: {
        eyebrow: "YOUR FIRST PASSPORT",
        title: "Start with one thing.",
        body:
          "Your first Passport takes only a photo, a name and a place—or you can set the place later.",
        primaryAction: "Add my first item",
        secondaryAction: "Explore a sample",
        quietAction: "Sign in"
      }
    }
  },
  ar: {
    progressLabel: (currentScene, totalScenes) =>
      `المقدمة، الخطوة ${currentScene} من ${totalScenes}`,
    exampleLabel: "مثال توضيحي",
    exampleGlobeLabel:
      "كرة أرضية توضيحية تربط أغراضًا تجريبية بأماكن تجريبية",
    examples: {
      watch: "ساعة",
      document: "مستند",
      home: "منزل"
    },
    scenes: {
      promise: {
        eyebrow: "سجل واحد مترابط",
        title: "اعرف ما تملكه. واعرف أين يوجد.",
        body:
          "احتفظ بأغراضك المهمة وأماكنها الدقيقة وإثباتاتها مترابطة في سجل خاص واحد.",
        primaryAction: "أرني كيف",
        secondaryAction: "تخطّي المقدمة",
        quietAction: "تسجيل الدخول"
      },
      place: {
        eyebrow: "المكان",
        title: "كل شيء يرتبط بمكان.",
        body:
          "عقار أو غرفة أو رف أو دبوس دقيق—استخدم مستوى التفاصيل الذي تعرفه فعلًا.",
        primaryAction: "متابعة",
        secondaryAction: "رجوع"
      },
      proof: {
        eyebrow: "الإثبات",
        title: "احتفظ بالإثبات بجانب الغرض.",
        body:
          "تظل الصور والإيصالات والمستندات مرتبطة بالغرض الذي تدعمه.",
        primaryAction: "متابعة",
        secondaryAction: "رجوع"
      },
      start: {
        eyebrow: "جواز غرضك الأول",
        title: "ابدأ بغرض واحد.",
        body:
          "لا يحتاج جواز غرضك الأول سوى صورة واسم ومكان—أو يمكنك تحديد المكان لاحقًا.",
        primaryAction: "أضف غرضي الأول",
        secondaryAction: "استكشف مثالًا",
        quietAction: "تسجيل الدخول"
      }
    }
  }
};

export function getWorldlineOnboardingCopy(
  language: LanguageCode
): WorldlineOnboardingCopy {
  return WORLDLINE_ONBOARDING_COPY[language];
}

export function useWorldlineOnboardingCopy() {
  const { language, rtl } = useLocale();
  return useMemo(
    () => ({
      copy: getWorldlineOnboardingCopy(language),
      language,
      rtl
    }),
    [language, rtl]
  );
}
