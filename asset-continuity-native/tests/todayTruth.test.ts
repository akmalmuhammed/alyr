import type { NativePlace } from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import {
  atlasAccessibilityLabel,
  CORE_JOURNEY_COPY,
  formatLocalizedPercent,
  todayHouseholdSummary,
  todayPinSummary
} from "@/i18n/coreJourneyCopy";
import {
  rankTodayAttention,
  selectTodayCommandState,
  selectTodayPlacePinStatus
} from "@/domain/today";

function place(
  id: string,
  overrides: Partial<NativePlace>
): NativePlace {
  const base = createWorkspace("sample").places[0]!;
  return {
    ...base,
    id,
    ...overrides
  };
}

describe("Today truth selectors", () => {
  it("uses grammatically correct bilingual household summaries", () => {
    expect(todayHouseholdSummary(7, 2, "ar")).toBe(
      "٧ أغراض مهمة في مكانين."
    );
    expect(todayHouseholdSummary(2, 1, "ar")).toBe(
      "غرضان مهمان في مكان واحد."
    );
    expect(todayHouseholdSummary(0, 0, "ar")).toBe(
      "لا توجد أغراض مهمة أو أماكن مسجّلة بعد."
    );
    expect(todayHouseholdSummary(1, 2, "en")).toBe(
      "1 important thing across 2 Places."
    );
    expect(atlasAccessibilityLabel(2, 0, 2, "ar")).toBe(
      "دبوسان مؤكّدان للعقارات، ولا توجد دبابيس تحتاج إلى تأكيد، ضمن مكانين."
    );
    expect(todayPinSummary(2, 1, "ar")).toBe(
      "دبوسان مؤكّدان · دبوس واحد يحتاج إلى تأكيد"
    );
    expect(todayPinSummary(1, 0, "en")).toBe(
      "1 confirmed pin · 0 need confirmation"
    );
    expect(formatLocalizedPercent(78, "ar")).toContain("٧٨");
    expect(formatLocalizedPercent(78, "ar")).toContain("٪");
  });

  it("distinguishes empty, incomplete and all-ready registers", () => {
    expect(selectTodayCommandState(0, 0)).toBe("empty");
    expect(selectTodayCommandState(3, 1)).toBe("incomplete");
    expect(selectTodayCommandState(3, 0)).toBe("ready");
  });

  it("ranks attention deterministically by readiness, gap and age", () => {
    const assets = createWorkspace("sample").assets;
    const oldest = {
      ...assets[0]!,
      id: "oldest",
      updatedAt: "2026-07-20T00:00:00.000Z"
    };
    const newest = {
      ...assets[1]!,
      id: "newest",
      updatedAt: "2026-07-27T00:00:00.000Z"
    };
    const locationGap = {
      ...assets[2]!,
      id: "location",
      updatedAt: "2026-07-26T00:00:00.000Z"
    };

    const queue = rankTodayAttention([
      {
        asset: newest,
        readiness: {
          percent: 50,
          items: [],
          nextItem: {
            id: "photo",
            label: "Photo",
            weight: 20,
            complete: false
          }
        }
      },
      {
        asset: oldest,
        readiness: {
          percent: 25,
          items: [],
          nextItem: {
            id: "evidence",
            label: "Proof",
            weight: 25,
            complete: false
          }
        }
      },
      {
        asset: locationGap,
        readiness: {
          percent: 50,
          items: [],
          nextItem: {
            id: "location",
            label: "Location",
            weight: 30,
            complete: false
          }
        }
      },
      {
        asset: {
          ...oldest,
          id: "ready"
        },
        readiness: {
          percent: 100,
          items: [],
          nextItem: null
        }
      }
    ]);

    expect(queue.map((entry) => entry.asset.id)).toEqual([
      "oldest",
      "location",
      "newest"
    ]);
  });

  it("counts a coordinate as confirmed only when confirmedAt is present", () => {
    const status = selectTodayPlacePinStatus([
      place("confirmed", {
        confirmedAt: "2026-07-27T12:00:00.000Z"
      }),
      place("needs-confirmation", {
        confirmedAt: null
      }),
      place("not-pinned", {
        latitude: null,
        longitude: null,
        confirmedAt: null
      })
    ]);

    expect(status.confirmedCount).toBe(1);
    expect(status.confirmationNeededCount).toBe(1);
    expect(status.pins).toEqual([
      expect.objectContaining({
        confirmation: "confirmed",
        place: expect.objectContaining({ id: "confirmed" })
      }),
      expect.objectContaining({
        confirmation: "confirmation-needed",
        place: expect.objectContaining({ id: "needs-confirmation" })
      })
    ]);
  });

  it("gives the all-ready state a truthful next action", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/index.tsx`,
      "utf8"
    );

    expect(source).toContain("eyebrow: copy.today.registerReady");
    expect(source).toContain("title: copy.today.readyTitle");
    expect(source).toContain("action: copy.today.addAnotherItem");
    expect(CORE_JOURNEY_COPY.en.today.registerReady).toBe(
      "REGISTER READY"
    );
    expect(CORE_JOURNEY_COPY.en.today.readyTitle).toBe(
      "Your core records are ready"
    );
    expect(CORE_JOURNEY_COPY.en.today.addAnotherItem).toBe(
      "Add another item"
    );
    expect(source).toContain(
      'commandState === "incomplete" && firstGap'
    );
  });
});
