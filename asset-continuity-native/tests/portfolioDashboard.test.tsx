import { fireEvent, render } from "@testing-library/react-native";

import {
  PortfolioDashboard,
  portfolioEntryCount,
  portfolioLocationBucketLabel,
  portfolioPercentLabel,
  portfolioValuedCoverage,
  type PortfolioReviewIntent
} from "@/components/PortfolioDashboard";
import { getPortfolioValueRecords } from "@/domain/portfolio";
import { createWorkspace } from "@/domain/sample";
import { itemCount } from "@/i18n/coreJourneyCopy";

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
    expect(screen.getByText("TRACKED NET POSITION")).toBeTruthy();
    expect(screen.getByText(/QAR\s*5,047,500\.00/u)).toBeTruthy();
    expect(screen.getByText(/USD\s*10,200\.00/u)).toBeTruthy();
    expect(screen.getAllByText(/QAR\s*7,197,500\.00/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/USD\s*13,700\.00/u).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Illustrative values are dated sample entries—not live prices or appraisals."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Currencies stay separate. No exchange rate is applied."
      )
    ).toBeTruthy();
    expect(screen.getByText("West Bay Home mortgage")).toBeTruthy();
    expect(screen.getByText("Travel card balance")).toBeTruthy();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("West Bay Home").length).toBeGreaterThan(1);
  });

  it("discloses exactly how recorded value is calculated", async () => {
    const screen = await render(
      <PortfolioDashboard workspace={createWorkspace("sample")} />
    );
    const explain = screen.getByText("How this is calculated");

    await fireEvent.press(explain);

    expect(screen.getByText("Calculation boundary")).toBeTruthy();
    expect(
      screen.getByText(
        "Missing values stay missing and are never treated as zero."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Each currency is calculated independently; currencies are never combined."
      )
    ).toBeTruthy();
    expect(screen.getByText("Hide calculation details")).toBeTruthy();
  });

  it("shows currency-grouped subtraction without claiming complete net worth", async () => {
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getByText(/QAR\s*5,047,500\.00/u)).toBeTruthy();
    expect(screen.getByText(/USD\s*10,200\.00/u)).toBeTruthy();
    expect(
      screen.getByText(
        "Currencies stay separate. No exchange rate is applied."
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Recorded assets minus recorded liabilities—not a bank balance, live valuation or complete statement of net worth."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/^Net worth$/iu)).toBeNull();
  });

  it("retains a negative net position sign in visual and assistive output", async () => {
    const sample = createWorkspace("sample");
    const valueRecords = getPortfolioValueRecords(sample).map(
      (record) =>
        record.liabilityId === "liability-mortgage"
          ? { ...record, amountMinor: 800_000_000 }
          : record
    );
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        valueRecords={valueRecords}
        workspace={sample}
      />
    );

    expect(screen.getByText("QAR −802,500.00")).toBeTruthy();
    expect(
      screen.getByLabelText(/Tracked net position: QAR −802,500\.00/u)
    ).toBeTruthy();
  });

  it("shows an honest not-started state with both first actions available", async () => {
    const addAsset = jest.fn();
    const addLiability = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        onAddAsset={addAsset}
        onAddLiability={addLiability}
        workspace={createWorkspace("personal")}
      />
    );

    expect(screen.getByText("Review to calculate")).toBeTruthy();
    expect(
      screen.getByText(
        "Start with one asset or liability to build this view."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("No active liabilities recorded")
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId("liability-add"));
    await fireEvent.press(screen.getByText("Add your first item"));
    expect(addLiability).toHaveBeenCalledTimes(1);
    expect(addAsset).toHaveBeenCalledTimes(1);
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

    expect(
      screen.getByLabelText("Show tracked financial amounts")
    ).toBeTruthy();
    expect(screen.queryByText(/QAR\s*5,047,500\.00/u)).toBeNull();
    expect(screen.queryByText(/QAR\s*2,150,000\.00/u)).toBeNull();
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
    expect(
      screen.getByLabelText(
        /West Bay Home mortgage, Mortgage, QAR, recorded amount hidden/u
      )
    ).toBeTruthy();
    expect(
      screen.getAllByText("QAR \u2022\u2022\u2022\u2022\u2022\u2022")
        .length
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText("USD \u2022\u2022\u2022\u2022\u2022\u2022")
        .length
    ).toBeGreaterThan(1);
    expect(screen.getByText("QAR")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getAllByText(/items?$/u).length).toBeGreaterThan(0);

    await fireEvent.press(
      screen.getByLabelText("Show tracked financial amounts")
    );

    expect(
      screen.getByLabelText("Hide tracked financial amounts")
    ).toBeTruthy();
    expect(screen.getByText(/QAR\s*5,047,500\.00/u)).toBeTruthy();
    expect(screen.getAllByText(/QAR\s*7,197,500\.00/u).length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText(/GMT-Master II, QAR\s*52,500\.00/u)
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText("Hide tracked financial amounts")
    );
    expect(
      screen.getByLabelText("Show tracked financial amounts")
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(/GMT-Master II, QAR\s*52,500\.00/u)
    ).toBeNull();
    expect(
      screen.queryByLabelText(
        /West Bay Home mortgage.+QAR\s*2,150,000\.00/u
      )
    ).toBeNull();
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

  it("opens a liability as its own financial record", async () => {
    const openSubject = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        onOpenSubject={openSubject}
        workspace={createWorkspace("sample")}
      />
    );

    await fireEvent.press(
      screen.getByLabelText(
        /West Bay Home mortgage, Mortgage, QAR\s*2,150,000\.00/u
      )
    );
    expect(openSubject).toHaveBeenCalledWith({
      kind: "liability",
      liabilityId: "liability-mortgage"
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
    expect(screen.getByText("صافي المركز المسجّل")).toBeTruthy();
    expect(screen.getByText("الالتزامات")).toBeTruthy();
    expect(screen.getByText(/ساعة/u)).toBeTruthy();
    expect(screen.queryByText("Watch")).toBeNull();
    expect(screen.getByText(/عقار.*بتاريخ/us)).toBeTruthy();
    expect(screen.getByText(/على هذا الجهاز/u)).toBeTruthy();
    expect(screen.getByLabelText(/QAR.+USD/us)).toBeTruthy();
    expect(
      screen.getByText(
        "الأصول المسجّلة ناقص الالتزامات المسجّلة؛ وليس رصيدًا مصرفيًا أو تقييمًا مباشرًا أو بيانًا كاملًا لصافي الثروة."
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
    expect(screen.getAllByText("٤ سجلات").length).toBeGreaterThan(0);
    expect(screen.getAllByText("سجلان").length).toBeGreaterThan(0);
    expect(screen.getByText("لا يحتاج إلى مكان فعلي")).toBeTruthy();
    expect(screen.queryByText("No physical place required")).toBeNull();
    expect(screen.getByLabelText(westBayLabel)).toBeTruthy();
  });
});
