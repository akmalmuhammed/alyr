import { portfolioReviewRoute } from "@/navigation/portfolioReview";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";

describe("Portfolio review routing", () => {
  it.each([
    ["all", "/assets?view=items"],
    ["proof", "/assets?view=items&filter=evidence"],
    ["location", "/assets?view=items&filter=location"],
    ["unvalued", "/assets?view=items&filter=value"],
    ["proof-review", "/assets?view=items&filter=review"]
  ] as const)("maps %s to its distinct Items review", (intent, route) => {
    expect(portfolioReviewRoute(intent)).toBe(route);
  });

  it("backs every routed review with the matching Portfolio snapshot IDs", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/assets.tsx`,
      "utf8"
    );

    expect(source).toContain("snapshot.proofGapAssetIds");
    expect(source).toContain("snapshot.locationGapAssetIds");
    expect(source).toContain("snapshot.unvaluedAssetIds");
    expect(source).toContain("snapshot.pendingProofReviewAssetIds");
    expect(source).toContain("label={copy.items.needsValue}");
    expect(source).toContain("label={copy.items.reviewProof}");
    expect(CORE_JOURNEY_COPY.en.items.needsValue).toBe("Needs value");
    expect(CORE_JOURNEY_COPY.en.items.reviewProof).toBe("Review proof");
  });
});
