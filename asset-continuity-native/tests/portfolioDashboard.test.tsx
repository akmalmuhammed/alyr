import { fireEvent, render } from "@testing-library/react-native";

import {
  PortfolioDashboard,
  portfolioEntryCount,
  portfolioLocationBucketLabel,
  portfolioPercentLabel,
  portfolioValuedCoverage,
  type PortfolioReviewIntent
} from "@/components/PortfolioDashboard";
import type { PortfolioValueRecord } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { itemCount } from "@/i18n/coreJourneyCopy";

function value(
  id: string,
  assetId: string,
  amountMinor: number,
  currency: string
): PortfolioValueRecord {
  return {
    id,
    assetId,
    amountMinor,
    currency,
    asOf: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    source: "user-entered"
  };
}

describe("PortfolioDashboard", () => {
  it("shows separated illustrative sample values without implying live prices", async () => {
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getByText("Portfolio")).toBeTruthy();
    expect(screen.getByLabelText("SAMPLE WORKSPACE")).toBeTruthy();
    expect(screen.getAllByText(/QAR\s*7,197,500\.00/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/USD\s*13,700\.00/u).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Illustrative values are dated sample entries—not live prices or appraisals."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Currencies stay separate. No exchange rate has been applied."
      )
    ).toBeTruthy();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("West Bay Home").length).toBeGreaterThan(1);
  });

  it("discloses exactly how recorded value is calculated", async () => {
    const screen = await render(
      <PortfolioDashboard workspace={createWorkspace("sample")} />
    );
    const explain = screen.getByText("Explain this number");

    await fireEvent.press(explain);

    expect(screen.getByText("What is included")).toBeTruthy();
    expect(
      screen.getByText(
        "Unvalued items are excluded—not treated as zero."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No live prices, appraisal, liabilities, taxes or selling costs."
      )
    ).toBeTruthy();
    expect(screen.getByText("Hide explanation")).toBeTruthy();
  });

  it("shows currency-grouped totals and never labels them net worth", async () => {
    const values = [
      value("gmt", "asset-gmt", 123_450, "QAR"),
      value("heritage", "asset-heritage", 500_000, "QAR"),
      value("car", "asset-roadster", 2_000_000, "USD")
    ];
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        valueRecords={values}
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getAllByText(/QAR\s*6,234\.50/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/USD\s*20,000\.00/u).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Currencies stay separate. No exchange rate has been applied."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This is not net worth. Liabilities, taxes and selling costs are not tracked."
      )
    ).toBeTruthy();
  });

  it("starts hidden and never leaks amounts through accessibility labels", async () => {
    const openAsset = jest.fn();
    const openSubject = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        onOpenAsset={openAsset}
        onOpenSubject={openSubject}
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getByLabelText("Show recorded amounts")).toBeTruthy();
    expect(screen.queryAllByText(/QAR\s*7,197,500\.00/u)).toHaveLength(0);
    expect(screen.queryAllByText(/USD\s*13,700\.00/u)).toHaveLength(0);
    expect(
      screen.getByLabelText(
        "GMT-Master II, QAR, recorded amount hidden"
      )
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "West Bay Home, QAR, recorded amount hidden"
      )
    ).toBeTruthy();
    expect(screen.getAllByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022").length).toBeGreaterThan(1);
    expect(screen.getAllByText("USD \u2022\u2022\u2022\u2022\u2022\u2022").length).toBeGreaterThan(1);
    expect(screen.getByText("QAR")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getAllByText(/items?$/u).length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText("Show recorded amounts"));

    expect(screen.getByLabelText("Hide recorded amounts")).toBeTruthy();
    expect(screen.getAllByText(/QAR\s*7,197,500\.00/u).length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/GMT-Master II, QAR\s*52,500\.00/u)
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Hide recorded amounts"));
    expect(screen.getByLabelText("Show recorded amounts")).toBeTruthy();
    expect(screen.queryByLabelText(/GMT-Master II, QAR\s*52,500\.00/u)).toBeNull();
  });

  it("localizes the hidden-by-default control in Arabic", async () => {
    const screen = await render(
      <PortfolioDashboard
        language="ar"
        onOpenSubject={jest.fn()}
        workspace={createWorkspace("sample")}
      />
    );

    const visibilityButton = screen.getByTestId(
      "portfolio-amount-visibility"
    );
    expect(visibilityButton.props.accessibilityLabel).toMatch(
      /[\u0600-\u06ff]/u
    );
    expect(screen.getAllByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022").length).toBeGreaterThan(1);
    const itemLabel = screen.getByLabelText(/GMT-Master II/u).props
      .accessibilityLabel as string;
    expect(itemLabel).toContain("QAR");
    expect(itemLabel).toMatch(/[\u0600-\u06ff]/u);
    expect(itemLabel).not.toMatch(/[0-9]/u);
  });

  it("opens a recorded property as a Place rather than an Asset", async () => {
    const openSubject = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        onOpenSubject={openSubject}
        workspace={createWorkspace("sample")}
      />
    );

    await fireEvent.press(
      screen.getByLabelText(/West Bay Home, QAR\s*6,750,000\.00/u)
    );

    expect(openSubject).toHaveBeenCalledWith({
      kind: "place",
      placeId: "place-west-bay"
    });
  });

  it("routes an unvalued property gap to the Place review surface", async () => {
    const reviewPlaces = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        onReviewPlaces={reviewPlaces}
        workspace={createWorkspace("sample")}
      />
    );

    await fireEvent.press(
      screen.getByLabelText("Properties without a recorded value: 1")
    );
    expect(reviewPlaces).toHaveBeenCalledTimes(1);
  });

  it("keeps pending proof review separate from proof and value gaps", async () => {
    const review = jest.fn<void, [PortfolioReviewIntent]>();
    const sample = createWorkspace("sample");
    const workspace = {
      ...sample,
      evidence: sample.evidence.map((evidence) =>
        evidence.id === "evidence-1"
          ? { ...evidence, reviewStatus: "pending" as const }
          : { ...evidence, reviewStatus: "reviewed" as const }
      )
    };
    const screen = await render(
      <PortfolioDashboard
        onReviewAssets={review}
        workspace={workspace}
      />
    );

    await fireEvent.press(
      screen.getByLabelText("Proof files awaiting review: 1")
    );
    await fireEvent.press(
      screen.getByLabelText("Items without a recorded value: 1")
    );

    expect(review).toHaveBeenNthCalledWith(1, "proof-review");
    expect(review).toHaveBeenNthCalledWith(2, "unvalued");
  });

  it("provides a first-item action for a new private workspace", async () => {
    const addAsset = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        onAddAsset={addAsset}
        workspace={createWorkspace("personal")}
      />
    );

    expect(screen.getByText("No values recorded")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add your first item"));
    expect(addAsset).toHaveBeenCalledTimes(1);
  });

  it("renders an RTL Arabic dashboard with the same truth boundary", async () => {
    const screen = await render(
      <PortfolioDashboard
        language="ar"
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getByText("المحفظة")).toBeTruthy();
    expect(screen.getByText("العقارات")).toBeTruthy();
    expect(screen.getByText(/ساعة/u)).toBeTruthy();
    expect(screen.queryByText("Watch")).toBeNull();
    expect(screen.getByText(/عقار.*بتاريخ/us)).toBeTruthy();
    expect(screen.getByText(/على هذا الجهاز/u)).toBeTruthy();
    expect(screen.getByLabelText(/QAR.+USD/us)).toBeTruthy();
    expect(
      screen.getByText(
        "هذا ليس صافي الثروة؛ فالالتزامات والضرائب وتكاليف البيع غير مسجّلة."
      )
    ).toBeTruthy();
  });

  it("localizes Arabic counts, coverage, percentages and special locations", async () => {
    const screen = await render(
      <PortfolioDashboard
        language="ar"
        workspace={createWorkspace("sample")}
      />
    );
    const westBayLabel = `West Bay Home: ${itemCount(
      4,
      "ar"
    )}, ${portfolioPercentLabel({ percent: 67 }, "ar")}`;

    expect(portfolioEntryCount(0, "ar")).toBe("لا سجلات");
    expect(portfolioEntryCount(1, "ar")).toBe("سجل واحد");
    expect(portfolioEntryCount(2, "ar")).toBe("سجلان");
    expect(portfolioEntryCount(4, "ar")).toBe("٤ سجلات");
    expect(portfolioPercentLabel({ percent: 100 }, "ar")).toBe("١٠٠٪");
    expect(
      portfolioLocationBucketLabel(
        {
          kind: "not-physically-located",
          label: "No physical place required"
        },
        "ar"
      )
    ).toBe("لا يحتاج إلى مكان فعلي");
    expect(
      screen.getByText(portfolioValuedCoverage(6, 8, "ar"))
    ).toBeTruthy();
    expect(screen.getAllByText("٤ سجلات").length).toBeGreaterThan(0);
    expect(screen.getAllByText("سجلان").length).toBeGreaterThan(0);
    expect(screen.getByText("لا يحتاج إلى مكان فعلي")).toBeTruthy();
    expect(screen.queryByText("No physical place required")).toBeNull();
    expect(screen.getByLabelText(westBayLabel)).toBeTruthy();
  });
});
