import {
  fireEvent,
  render,
  within
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  PortfolioDashboard,
  portfolioEntryCount,
  portfolioLocationBucketLabel,
  portfolioPercentLabel,
  shouldStackPortfolioFinancialLayout,
  type PortfolioReviewIntent
} from "@/components/PortfolioDashboard";
import { createLiability } from "@/domain/liabilities";
import { getPortfolioValueRecords } from "@/domain/portfolio";
import type {
  NativeAsset,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { itemCount } from "@/i18n/coreJourneyCopy";

function renderedTestIds(node: unknown): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(renderedTestIds);
  if (typeof node !== "object") return [];
  const element = node as {
    readonly props?: { readonly testID?: unknown };
    readonly children?: readonly unknown[];
  };
  return [
    ...(typeof element.props?.testID === "string"
      ? [element.props.testID]
      : []),
    ...(element.children?.flatMap(renderedTestIds) ?? [])
  ];
}

function documentOnlyWorkspace(
  language: NativeWorkspace["language"] = "en"
): NativeWorkspace {
  const personal = createWorkspace("personal");
  const basis = createWorkspace("sample").assets[0]!;
  const documentAsset: NativeAsset = {
    ...basis,
    id: "asset-important-document",
    householdId: personal.household.id,
    name: "Family certificate",
    categoryId: "document.important",
    categoryLabel: "Important document",
    visualKind: "digital",
    locationStatus: "known",
    placeId: null,
    roomId: null,
    locatorText: null
  };

  return {
    ...personal,
    language,
    assets: [documentAsset],
    portfolioValueRecords: []
  };
}

describe("PortfolioDashboard", () => {
  it("stacks financial rows on narrow screens and large text", () => {
    expect(shouldStackPortfolioFinancialLayout(320, 1)).toBe(true);
    expect(shouldStackPortfolioFinancialLayout(390, 1.3)).toBe(true);
    expect(shouldStackPortfolioFinancialLayout(390, 1)).toBe(false);
  });

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
    expect(screen.getAllByText(/QAR\s*7,197,500\.00/u).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId("portfolio-currency-USD"));
    expect(screen.getByText(/USD\s*10,200\.00/u)).toBeTruthy();
    expect(screen.getAllByText(/USD\s*13,700\.00/u).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText("How this is calculated"));
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
    await fireEvent.press(screen.getByTestId("portfolio-insights-toggle"));
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("West Bay Home").length).toBeGreaterThan(1);
  });

  it("keeps secondary continuity diagnostics behind one progressive disclosure", async () => {
    const screen = await render(
      <PortfolioDashboard workspace={createWorkspace("sample")} />
    );
    const initialOrder = renderedTestIds(screen.toJSON()).filter((testID) =>
      [
        "portfolio-net-position",
        "portfolio-review-next-section",
        "portfolio-recorded-values-section",
        "portfolio-liabilities-section",
        "portfolio-insights-toggle",
        "portfolio-location-distribution-section",
        "portfolio-register-health-section"
      ].includes(testID)
    );

    expect(initialOrder).toEqual([
      "portfolio-net-position",
      "portfolio-review-next-section",
      "portfolio-recorded-values-section",
      "portfolio-liabilities-section",
      "portfolio-insights-toggle"
    ]);
    expect(
      screen.getByTestId("portfolio-insights-toggle").props
        .accessibilityState
    ).toMatchObject({ expanded: false });

    await fireEvent.press(screen.getByTestId("portfolio-insights-toggle"));
    const expandedOrder = renderedTestIds(screen.toJSON()).filter((testID) =>
      [
        "portfolio-net-position",
        "portfolio-review-next-section",
        "portfolio-recorded-values-section",
        "portfolio-liabilities-section",
        "portfolio-insights-toggle",
        "portfolio-location-distribution-section",
        "portfolio-register-health-section"
      ].includes(testID)
    );
    expect(expandedOrder).toEqual([
      "portfolio-net-position",
      "portfolio-review-next-section",
      "portfolio-recorded-values-section",
      "portfolio-liabilities-section",
      "portfolio-insights-toggle",
      "portfolio-location-distribution-section",
      "portfolio-register-health-section"
    ]);
  });

  it("places only non-zero review work directly after the hero", async () => {
    const sample = await render(
      <PortfolioDashboard workspace={createWorkspace("sample")} />
    );

    expect(sample.getByTestId("portfolio-review-next-section")).toBeTruthy();
    expect(sample.getByText("Review next")).toBeTruthy();
    expect(
      sample.queryByLabelText(/: 0$/u)
    ).toBeNull();

    const personal = await render(
      <PortfolioDashboard workspace={createWorkspace("personal")} />
    );
    expect(
      personal.queryByTestId("portfolio-review-next-section")
    ).toBeNull();
  });

  it("previews three recorded rows per currency and expands the full group", async () => {
    const screen = await render(
      <PortfolioDashboard
        onOpenSubject={jest.fn()}
        workspace={createWorkspace("sample")}
      />
    );
    const toggle = screen.getByTestId(
      "portfolio-recorded-values-view-all-QAR"
    );

    expect(toggle.props.accessibilityState).toMatchObject({
      expanded: false
    });
    expect(
      screen.queryByTestId(
        "portfolio-recorded-value-place:place-west-bay"
      )
    ).toBeNull();
    expect(screen.getByText("View all 4 QAR entries")).toBeTruthy();

    await fireEvent.press(toggle);

    expect(
      screen.getByTestId(
        "portfolio-recorded-value-place:place-west-bay"
      )
    ).toBeTruthy();
    expect(
      screen.getByTestId("portfolio-recorded-values-view-all-QAR")
        .props.accessibilityState
    ).toMatchObject({ expanded: true });
    expect(screen.getByText("Show fewer QAR entries")).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId("portfolio-recorded-values-view-all-QAR")
    );
    expect(
      screen.queryByTestId(
        "portfolio-recorded-value-place:place-west-bay"
      )
    ).toBeNull();
  });

  it("uses a neutral stable order while amounts are hidden", async () => {
    const screen = await render(
      <PortfolioDashboard
        onOpenSubject={jest.fn()}
        workspace={createWorkspace("sample")}
      />
    );
    const visibleQarRows = () =>
      renderedTestIds(screen.toJSON()).filter((testID) =>
        [
          "portfolio-recorded-value-asset:asset-heritage",
          "portfolio-recorded-value-asset:asset-gmt",
          "portfolio-recorded-value-asset:asset-roadster",
          "portfolio-recorded-value-place:place-west-bay"
        ].includes(testID)
      );

    expect(visibleQarRows()).toEqual([
      "portfolio-recorded-value-asset:asset-heritage",
      "portfolio-recorded-value-asset:asset-gmt",
      "portfolio-recorded-value-asset:asset-roadster"
    ]);

    await fireEvent.press(
      screen.getByLabelText("Show tracked financial amounts")
    );

    expect(visibleQarRows()).toEqual([
      "portfolio-recorded-value-place:place-west-bay",
      "portfolio-recorded-value-asset:asset-roadster",
      "portfolio-recorded-value-asset:asset-heritage"
    ]);
  });

  it("previews three liabilities and expands every active record", async () => {
    const sample = createWorkspace("sample");
    const basis = sample.liabilities?.[0]!;
    const workspace = {
      ...sample,
      liabilities: [
        ...(sample.liabilities ?? []),
        {
          ...basis,
          id: "liability-business",
          name: "Business loan",
          kind: "business" as const
        },
        {
          ...basis,
          id: "liability-education",
          name: "Education loan",
          kind: "education-loan" as const
        }
      ]
    };
    const screen = await render(
      <PortfolioDashboard
        onOpenSubject={jest.fn()}
        workspace={workspace}
      />
    );
    const toggle = screen.getByTestId("portfolio-liabilities-view-all");

    expect(toggle.props.accessibilityState).toMatchObject({
      expanded: false
    });
    expect(
      screen.queryByTestId("liability-row-liability-mortgage")
    ).toBeNull();
    expect(screen.getByText("View all 4 liabilities")).toBeTruthy();

    await fireEvent.press(toggle);

    expect(
      screen.getByTestId("liability-row-liability-mortgage")
    ).toBeTruthy();
    expect(
      screen.getByTestId("portfolio-liabilities-view-all").props
        .accessibilityState
    ).toMatchObject({ expanded: true });
    expect(screen.getByText("Show fewer liabilities")).toBeTruthy();
  });

  it("shows one currency at a time and updates the hero through an accessible selector", async () => {
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={createWorkspace("sample")}
      />
    );
    const hero = within(screen.getByTestId("portfolio-net-position"));
    const qar = screen.getByTestId("portfolio-currency-QAR");
    const usd = screen.getByTestId("portfolio-currency-USD");

    expect(qar.props.accessibilityRole).toBe("radio");
    expect(qar.props.accessibilityState).toMatchObject({ checked: true });
    expect(usd.props.accessibilityState).toMatchObject({ checked: false });
    expect(hero.getByText("QAR 5,047,500.00")).toBeTruthy();
    expect(hero.queryByText("USD 10,200.00")).toBeNull();

    await fireEvent.press(usd);

    expect(
      screen.getByTestId("portfolio-currency-QAR").props
        .accessibilityState
    ).toMatchObject({ checked: false });
    expect(
      screen.getByTestId("portfolio-currency-USD").props
        .accessibilityState
    ).toMatchObject({ checked: true });
    expect(hero.queryByText("QAR 5,047,500.00")).toBeNull();
    expect(hero.getByText("USD 10,200.00")).toBeTruthy();
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
    expect(screen.queryByText(/USD\s*10,200\.00/u)).toBeNull();
    await fireEvent.press(screen.getByTestId("portfolio-currency-USD"));
    expect(screen.getByText(/USD\s*10,200\.00/u)).toBeTruthy();
    expect(screen.queryByText(/QAR\s*5,047,500\.00/u)).toBeNull();
    await fireEvent.press(screen.getByText("How this is calculated"));
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

  it("replaces zero-subject analysis with one first-record decision", async () => {
    const addAsset = jest.fn();
    const addLiability = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        onAddAsset={addAsset}
        onAddLiability={addLiability}
        workspace={createWorkspace("personal")}
      />
    );

    expect(screen.getByTestId("portfolio-start-decision")).toBeTruthy();
    expect(
      screen.getByRole("header", {
        name: "Choose your first financial record"
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Choose your first financial record"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Add an item or property you want to value, or record a liability. ALYR never estimates an amount for you."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("portfolio-net-position")).toBeNull();
    expect(
      screen.queryByTestId("portfolio-review-next-section")
    ).toBeNull();
    expect(
      screen.queryByTestId("portfolio-recorded-values-section")
    ).toBeNull();
    expect(
      screen.queryByTestId("portfolio-liabilities-section")
    ).toBeNull();

    await fireEvent.press(screen.getByTestId("portfolio-start-liability"));
    await fireEvent.press(screen.getByTestId("portfolio-start-asset"));
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
        "GMT-Master II, QAR, recorded amount hidden, On this device"
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("portfolio-insights-toggle"));
    await fireEvent.press(
      screen.getByTestId("portfolio-recorded-values-view-all-QAR")
    );
    expect(
      screen.getByLabelText(
        "GMT-Master II, QAR, recorded amount hidden, On this device"
      )
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "West Bay Home, QAR, recorded amount hidden, On this device"
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
    expect(screen.getAllByText("QAR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
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

  it("preserves and labels recorded-value sync truth for assets and properties", async () => {
    const sample = createWorkspace("sample");
    const workspace = {
      ...sample,
      portfolioValueRecords: getPortfolioValueRecords(sample).map(
        (record) => {
          if (record.id === "sample-value-west-bay") {
            return { ...record, syncStatus: "synced" as const };
          }
          if (record.id === "sample-value-gmt") {
            return { ...record, syncStatus: "queued" as const };
          }
          if (record.id === "sample-value-roadster") {
            return {
              ...record,
              syncStatus: "needs-attention" as const
            };
          }
          return record;
        }
      )
    };
    const screen = await render(
      <PortfolioDashboard
        onOpenSubject={jest.fn()}
        workspace={workspace}
      />
    );

    expect(
      within(
        screen.getByTestId(
          "portfolio-recorded-value-asset:asset-gmt"
        )
      ).getByText(/Queued$/u)
    ).toBeTruthy();
    expect(
      within(
        screen.getByTestId(
          "portfolio-recorded-value-asset:asset-roadster"
        )
      ).getByText(/Needs attention$/u)
    ).toBeTruthy();
    expect(
      within(
        screen.getByTestId(
          "portfolio-recorded-value-asset:asset-heritage"
        )
      ).getByText(/On this device$/u)
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByTestId("portfolio-recorded-values-view-all-QAR")
    );

    const property = within(
      screen.getByTestId(
        "portfolio-recorded-value-place:place-west-bay"
      )
    );
    expect(property.getByText(/Synced$/u)).toBeTruthy();
    expect(property.queryByText(/On this device$/u)).toBeNull();
    expect(
      screen.getByLabelText(
        "West Bay Home, QAR, recorded amount hidden, Synced"
      )
    ).toBeTruthy();
  });

  it("does not demand a duplicate liability for an asset-only currency", async () => {
    const sample = createWorkspace("sample");
    const workspace = {
      ...sample,
      liabilities: (sample.liabilities ?? []).filter(
        (liability) => liability.id === "liability-mortgage"
      ),
      portfolioValueRecords: getPortfolioValueRecords(sample).filter(
        (record) =>
          record.subject?.kind !== "liability" ||
          record.subject.liabilityId === "liability-mortgage"
      )
    };
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={workspace}
      />
    );
    const hero = within(screen.getByTestId("portfolio-net-position"));

    await fireEvent.press(screen.getByTestId("portfolio-currency-USD"));

    expect(hero.getAllByText("USD 13,700.00")).toHaveLength(2);
    expect(
      hero.getByText("None recorded in this currency")
    ).toBeTruthy();
    expect(
      hero.queryByText("Liability review required")
    ).toBeNull();
  });

  it("withholds the displayed net while any active Liability has no balance", async () => {
    const created = createLiability(
      createWorkspace("sample"),
      {
        name: "Unreviewed family debt",
        kind: "family-debt"
      },
      {
        id: () => "liability-unreviewed",
        now: () => "2026-07-28T10:00:00.000Z",
        today: () => "2026-07-28"
      }
    );
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={created.workspace}
      />
    );
    const hero = within(screen.getByTestId("portfolio-net-position"));

    expect(hero.queryByText(/QAR\s*5,047,500\.00/u)).toBeNull();
    expect(hero.getByText(/QAR\s*7,197,500\.00/u)).toBeTruthy();
    expect(
      hero.getAllByText("Liability review required").length
    ).toBeGreaterThan(1);
  });

  it("shows category icons, zero-balance review truth and combined sync labels", async () => {
    const sample = createWorkspace("sample");
    const workspace = {
      ...sample,
      liabilities: (sample.liabilities ?? []).map((liability) => ({
        ...liability,
        syncStatus:
          liability.id === "liability-mortgage"
            ? ("queued" as const)
            : ("synced" as const)
      })),
      portfolioValueRecords: getPortfolioValueRecords(sample).map(
        (record) => {
          if (record.subject?.kind !== "liability") {
            return record;
          }
          if (record.subject.liabilityId === "liability-card") {
            return {
              ...record,
              amountMinor: 0,
              asOf: "2020-01-01",
              syncStatus: "queued" as const
            };
          }
          return {
            ...record,
            syncStatus: "synced" as const
          };
        }
      )
    };
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        onOpenSubject={jest.fn()}
        workspace={workspace}
      />
    );
    const mortgage = within(
      screen.getByTestId("liability-row-liability-mortgage")
    );
    const card = within(
      screen.getByTestId("liability-row-liability-card")
    );

    expect(
      mortgage.getByTestId("phosphor-react-native-house-regular")
    ).toBeTruthy();
    expect(
      card.getByTestId("phosphor-react-native-credit-card-regular")
    ).toBeTruthy();
    expect(mortgage.getByText("Active · Queued")).toBeTruthy();
    expect(
      card.getByText("Credit card · Zero balance recorded · 1 Jan 2020")
    ).toBeTruthy();
    expect(
      card.getByText("Active · Balance needs review · Queued")
    ).toBeTruthy();
  });

  it("keeps archived liabilities collapsed until the user asks for history", async () => {
    const sample = createWorkspace("sample");
    const workspace = {
      ...sample,
      liabilities: (sample.liabilities ?? []).map((liability) =>
        liability.id === "liability-card"
          ? {
              ...liability,
              lifecycleStatus: "archived" as const,
              archivedAt: "2026-07-25T12:00:00.000Z"
            }
          : liability
      )
    };
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        onOpenSubject={jest.fn()}
        workspace={workspace}
      />
    );
    const toggle = screen.getByTestId("liability-archived-toggle");

    expect(toggle.props.accessibilityState).toMatchObject({
      expanded: false
    });
    expect(screen.getByText("1 archived liability")).toBeTruthy();
    expect(
      screen.queryByTestId("liability-row-liability-card")
    ).toBeNull();
    expect(
      within(toggle).getByTestId(
        "phosphor-react-native-caret-down-undefined"
      )
    ).toBeTruthy();

    await fireEvent.press(toggle);

    expect(
      screen.getByTestId("liability-archived-toggle").props
        .accessibilityState
    ).toMatchObject({ expanded: true });
    expect(
      screen.getByTestId("liability-row-liability-card")
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("liability-archived-toggle")).getByTestId(
        "phosphor-react-native-caret-up-undefined"
      )
    ).toBeTruthy();
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
    const isolatedHiddenQar =
      "\u2066QAR \u2022\u2022\u2022\u2022\u2022\u2022\u2069";
    expect(
      screen.getAllByText(isolatedHiddenQar).length
    ).toBeGreaterThan(1);
    await fireEvent.press(
      screen.getByTestId("portfolio-recorded-values-view-all-QAR")
    );
    const itemLabel = screen.getByLabelText(/GMT-Master II/u).props
      .accessibilityLabel as string;
    expect(itemLabel).toContain("QAR");
    expect(itemLabel).toMatch(/[\u0600-\u06ff]/u);
    expect(itemLabel).not.toMatch(/[0-9]/u);
  });

  it("renders Arabic QAR and USD financial tokens inside explicit LTR isolates", async () => {
    const sample = createWorkspace("sample");
    const screen = await render(
      <PortfolioDashboard language="ar" workspace={sample} />
    );
    const hero = within(screen.getByTestId("portfolio-net-position"));

    expect(
      hero.getAllByText("\u2066QAR \u2022\u2022\u2022\u2022\u2022\u2022\u2069")
        .length
    ).toBeGreaterThan(0);
    await fireEvent.press(
      screen.getByLabelText("إظهار المبالغ المالية المسجّلة")
    );
    expect(hero.getByText("\u2066QAR ٥٬٠٤٧٬٥٠٠٫٠٠\u2069")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("portfolio-currency-USD"));
    expect(hero.getByText("\u2066USD ١٠٬٢٠٠٫٠٠\u2069")).toBeTruthy();

    const negativeRecords = getPortfolioValueRecords(sample).map(
      (record) =>
        record.liabilityId === "liability-mortgage"
          ? { ...record, amountMinor: 800_000_000 }
          : record
    );
    const negative = await render(
      <PortfolioDashboard
        amountsHidden={false}
        language="ar"
        valueRecords={negativeRecords}
        workspace={sample}
      />
    );
    expect(
      within(negative.getByTestId("portfolio-net-position")).getByText(
        "\u2066QAR −٨٠٢٬٥٠٠٫٠٠\u2069"
      )
    ).toBeTruthy();
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
    const reviewPropertyValues = jest.fn();
    const reviewPlaces = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        onReviewPlaces={reviewPlaces}
        onReviewPropertyValues={reviewPropertyValues}
        workspace={createWorkspace("sample")}
      />
    );

    await fireEvent.press(
      screen.getByLabelText("Properties without a recorded value: 1")
    );
    expect(reviewPropertyValues).toHaveBeenCalledTimes(1);
    expect(reviewPlaces).not.toHaveBeenCalled();
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

    expect(screen.getByTestId("portfolio-start-decision")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("portfolio-start-asset"));
    expect(addAsset).toHaveBeenCalledTimes(1);
  });

  it("keeps document-only continuity records outside the financial dashboard", async () => {
    const addAsset = jest.fn();
    const addLiability = jest.fn();
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        onAddAsset={addAsset}
        onAddLiability={addLiability}
        workspace={documentOnlyWorkspace()}
      />
    );
    const assetAction = screen.getByTestId("portfolio-start-asset");
    const liabilityAction = screen.getByTestId(
      "portfolio-start-liability"
    );

    expect(
      screen.getByText(
        "Your documents remain protected in the continuity register without becoming financial assets. Add an item, property or liability when it is useful."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("portfolio-net-position")).toBeNull();
    expect(
      screen.queryByTestId("portfolio-recorded-asset-value")
    ).toBeNull();
    expect(
      screen.queryByText("Items without a recorded value")
    ).toBeNull();
    expect(
      StyleSheet.flatten(assetAction.props.style).minHeight
    ).toBeGreaterThanOrEqual(44);
    expect(
      StyleSheet.flatten(liabilityAction.props.style).minHeight
    ).toBeGreaterThanOrEqual(44);

    await fireEvent.press(assetAction);
    await fireEvent.press(liabilityAction);
    expect(addAsset).toHaveBeenCalledTimes(1);
    expect(addLiability).toHaveBeenCalledTimes(1);
  });

  it("mirrors the document-only first decision in Arabic", async () => {
    const screen = await render(
      <PortfolioDashboard
        language="ar"
        onAddAsset={jest.fn()}
        onAddLiability={jest.fn()}
        workspace={documentOnlyWorkspace("ar")}
      />
    );
    const title = screen.getByText(
      "\u0627\u062e\u062a\u0631 \u0623\u0648\u0644 \u0633\u062c\u0644 \u0645\u0627\u0644\u064a"
    );
    const body = screen.getByText(
      "\u062a\u0628\u0642\u0649 \u0645\u0633\u062a\u0646\u062f\u0627\u062a\u0643 \u0645\u062d\u0645\u064a\u0629 \u0641\u064a \u0633\u062c\u0644 \u0627\u0644\u0627\u0633\u062a\u0645\u0631\u0627\u0631\u064a\u0629 \u0645\u0646 \u062f\u0648\u0646 \u0627\u062d\u062a\u0633\u0627\u0628\u0647\u0627 \u0643\u0623\u0635\u0648\u0644 \u0645\u0627\u0644\u064a\u0629. \u0623\u0636\u0641 \u063a\u0631\u0636\u064b\u0627 \u0623\u0648 \u0639\u0642\u0627\u0631\u064b\u0627 \u0623\u0648 \u0627\u0644\u062a\u0632\u0627\u0645\u064b\u0627 \u0639\u0646\u062f\u0645\u0627 \u064a\u0643\u0648\u0646 \u0630\u0644\u0643 \u0645\u0641\u064a\u062f\u064b\u0627."
    );
    const action = screen.getByTestId("portfolio-start-asset");

    expect(StyleSheet.flatten(title.props.style).writingDirection).toBe(
      "rtl"
    );
    expect(StyleSheet.flatten(body.props.style).textAlign).toBe("right");
    expect(StyleSheet.flatten(action.props.style).flexDirection).toBe(
      "row-reverse"
    );
    expect(action.props.accessibilityRole).toBe("button");
    expect(screen.queryByTestId("portfolio-net-position")).toBeNull();
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
    await fireEvent.press(
      screen.getByTestId("portfolio-recorded-values-view-all-QAR")
    );
    expect(screen.getByText(/ساعة/u)).toBeTruthy();
    expect(screen.queryByText("Watch")).toBeNull();
    expect(screen.getByText(/عقار.*بتاريخ/us)).toBeTruthy();
    expect(
      screen.getAllByText(/على هذا الجهاز/u).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByTestId("portfolio-currency-QAR").props
        .accessibilityState
    ).toMatchObject({ checked: true });
    expect(
      screen.getByTestId("portfolio-currency-USD").props
        .accessibilityState
    ).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByText("كيف يُحتسب هذا الرقم؟"));
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
    await fireEvent.press(screen.getByTestId("portfolio-insights-toggle"));
    expect(screen.getAllByText("٤ سجلات").length).toBeGreaterThan(0);
    expect(screen.getAllByText("سجلان").length).toBeGreaterThan(0);
    expect(screen.getByText("لا يحتاج إلى مكان فعلي")).toBeTruthy();
    expect(screen.queryByText("No physical place required")).toBeNull();
    expect(screen.getByLabelText(westBayLabel)).toBeTruthy();
  });
});
