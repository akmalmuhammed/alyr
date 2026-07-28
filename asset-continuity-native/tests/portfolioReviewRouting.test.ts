import {
  portfolioPropertyValueReviewRoute,
  portfolioReviewRoute
} from "@/navigation/portfolioReview";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { REGISTER_COPY } from "@/i18n/registerCopy";

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

  it("keeps missing property values in a distinct URL-backed Place queue", () => {
    expect(portfolioPropertyValueReviewRoute()).toBe(
      "/assets?view=places&filter=value"
    );
  });

  it("backs every routed review with the matching Portfolio snapshot IDs", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/(tabs)/assets.tsx`,
      "utf8"
    );
    const dashboard = readFileSync(
      `${process.cwd()}/app/dashboard.tsx`,
      "utf8"
    );

    expect(source).toContain("snapshot.proofGapAssetIds");
    expect(source).toContain("snapshot.locationGapAssetIds");
    expect(source).toContain("snapshot.unvaluedAssetIds");
    expect(source).toContain("snapshot.pendingProofReviewAssetIds");
    expect(source).toContain("snapshot.unvaluedPlaceIds");
    expect(source).toContain("registerCopy.filters[assetFilter]");
    expect(CORE_JOURNEY_COPY.en.items.needsValue).toBe("Needs value");
    expect(CORE_JOURNEY_COPY.en.items.reviewProof).toBe("Review proof");
    expect(REGISTER_COPY.en.filters.value).toBe("Needs value");
    expect(REGISTER_COPY.en.placeFilters.value).toBe(
      "Needs property value"
    );
    expect(REGISTER_COPY.en.filters.review).toBe("Proof to review");
    expect(dashboard).toContain(
      "onReviewPropertyValues={() =>"
    );
    expect(dashboard).toContain(
      "router.push(portfolioPropertyValueReviewRoute())"
    );
  });
});
