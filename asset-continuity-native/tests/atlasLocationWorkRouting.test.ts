import {
  ATLAS_LOCATION_WORK_ROUTES,
  atlasLocationWorkRoute
} from "@/navigation/atlasLocationWork";
import { atlasLocationWork } from "@/i18n/secondarySurfaceCopy";

describe("Atlas location-work routing", () => {
  it.each([
    ["no-pin", "/assets?view=places&filter=no-pin"],
    ["pin-review", "/assets?view=places&filter=pin-review"],
    ["unplaced-items", "/assets?view=items&filter=location"]
  ] as const)("routes %s into an actionable filtered register", (kind, route) => {
    expect(atlasLocationWorkRoute(kind)).toBe(route);
    expect(ATLAS_LOCATION_WORK_ROUTES[kind]).toBe(route);
  });

  it("renders every location-work entry as an accessible action", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/atlas.tsx`,
      "utf8"
    );

    expect(source).toContain(
      "router.push(atlasLocationWorkRoute(work.kind))"
    );
    expect(source).toContain(
      "accessibilityHint={atlasCopy.locationWorkHint}"
    );
    expect(source).toContain("accessibilityLabel={work.label}");
    expect(source).toMatch(
      /attentionAction:\s*\{[\s\S]*?minHeight:\s*44,/
    );
  });

  it("labels review debt honestly in English and Arabic", () => {
    expect(atlasLocationWork("review", 1, "en")).toBe(
      "1 pin needs review"
    );
    expect(atlasLocationWork("review", 2, "ar")).toBe(
      "دبوسان يحتاجان إلى مراجعة"
    );
  });
});
