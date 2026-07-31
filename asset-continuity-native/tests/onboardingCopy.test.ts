import type { LanguageCode } from "@/domain/model";
import {
  getWorldlineOnboardingCopy,
  WORLDLINE_ONBOARDING_COPY,
  WORLDLINE_ONBOARDING_SCENE_IDS
} from "@/onboarding/onboardingCopy";

describe("Worldline onboarding copy", () => {
  it.each<LanguageCode>(["en", "ar"])(
    "keeps all four scenes complete in %s",
    (language) => {
      const copy = getWorldlineOnboardingCopy(language);

      expect(Object.keys(copy.scenes)).toEqual(
        WORLDLINE_ONBOARDING_SCENE_IDS
      );
      for (const sceneId of WORLDLINE_ONBOARDING_SCENE_IDS) {
        const scene = copy.scenes[sceneId];
        expect(scene.eyebrow.trim()).not.toBe("");
        expect(scene.title.trim()).not.toBe("");
        expect(scene.body.trim()).not.toBe("");
        expect(scene.primaryAction.trim()).not.toBe("");
      }
    }
  );

  it("preserves the selected English promise and action sequence", () => {
    const copy = WORLDLINE_ONBOARDING_COPY.en;

    expect(copy.scenes.promise).toMatchObject({
      title: "Know what you have. Know where it is.",
      primaryAction: "Show me how",
      secondaryAction: "Skip introduction",
      quietAction: "Sign in"
    });
    expect(copy.scenes.place.primaryAction).toBe("Continue");
    expect(copy.scenes.proof.primaryAction).toBe("Continue");
    expect(copy.scenes.start).toMatchObject({
      title: "Start with one thing.",
      primaryAction: "Add my first item",
      secondaryAction: "Explore a sample",
      quietAction: "Sign in"
    });
  });

  it("labels every synthetic visual as an example without embedding a public name", () => {
    for (const language of ["en", "ar"] as const) {
      const copy = WORLDLINE_ONBOARDING_COPY[language];
      expect(copy.exampleLabel).not.toBe("");
      expect(copy.exampleGlobeLabel).not.toBe("");
      expect(JSON.stringify(copy)).not.toMatch(/ALYR/i);
    }
  });

  it("provides localized named progress", () => {
    expect(
      WORLDLINE_ONBOARDING_COPY.en.progressLabel(2, 4)
    ).toBe("Introduction, step 2 of 4");
    expect(
      WORLDLINE_ONBOARDING_COPY.ar.progressLabel(2, 4)
    ).toBe("المقدمة، الخطوة 2 من 4");
  });
});
