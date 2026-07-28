import {
  fireEvent,
  render,
  within
} from "@testing-library/react-native";
import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";

import {
  buildPortfolioCompositionRail,
  PortfolioDashboard,
  shouldStackPortfolioFinancialLayout
} from "@/components/PortfolioDashboard";
import { createWorkspace } from "@/domain/sample";
import {
  colors,
  radius,
  themes,
  typography
} from "@/theme/tokens";

type InspectableStyle = TextStyle & ViewStyle;

function flattenedStyle(
  node: { readonly props: { readonly style?: unknown } }
): InspectableStyle {
  return (
    StyleSheet.flatten(
      node.props.style as StyleProp<InspectableStyle>
    ) ?? {}
  );
}

describe("Portfolio premium masthead", () => {
  it("derives a truthful visible composition without calculating a concealed ratio", () => {
    expect(buildPortfolioCompositionRail(3, 1, false)).toEqual({
      concealed: false,
      assetsPercent: 75,
      liabilitiesPercent: 25
    });
    expect(buildPortfolioCompositionRail(0, 0, false)).toEqual({
      concealed: false,
      assetsPercent: 50,
      liabilitiesPercent: 50
    });
    expect(buildPortfolioCompositionRail(1, 999, true)).toEqual(
      buildPortfolioCompositionRail(999, 1, true)
    );
    expect(buildPortfolioCompositionRail(1, 999, true)).toEqual({
      concealed: true,
      assetsPercent: null,
      liabilitiesPercent: null
    });
    expect(buildPortfolioCompositionRail(null, 1, false)).toBeNull();
    expect(buildPortfolioCompositionRail(1, null, false)).toBeNull();
    expect(buildPortfolioCompositionRail(-1, 1, false)).toBeNull();
  });

  it("makes one selected position dominant with adjacent freshness and an explicit equation", async () => {
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={createWorkspace("sample")}
      />
    );
    const hero = screen.getByTestId("portfolio-net-position");
    const position = within(hero).getByTestId(
      "portfolio-position-block"
    );
    const value = within(hero).getByTestId(
      "portfolio-position-value"
    );
    const freshness = within(hero).getByTestId(
      "portfolio-position-freshness"
    );
    const equation = within(hero).getByTestId(
      "portfolio-net-equation"
    );
    const rail = within(hero).getByTestId(
      "portfolio-composition-rail"
    );

    expect(flattenedStyle(hero)).toMatchObject({
      backgroundColor: colors.carbon,
      borderColor: themes.dark.borderStrong,
      borderRadius: radius.sm,
      borderWidth: 1
    });
    expect(flattenedStyle(value)).toMatchObject({
      fontFamily: typography.displayBold,
      fontSize: 38,
      fontVariant: ["tabular-nums"]
    });
    expect(within(position).getByText("QAR 5,047,500.00")).toBeTruthy();
    expect(within(freshness).getByText("QAR")).toBeTruthy();
    expect(
      within(freshness).getByText(
        "Records dated 21 Jul 2026–23 Jul 2026"
      )
    ).toBeTruthy();
    expect(
      within(equation).getByLabelText(
        "Recorded assets − Recorded liabilities = Tracked net position"
      )
    ).toBeTruthy();
    expect(
      within(equation).getByTestId("portfolio-equation-assets")
    ).toHaveTextContent("QAR 7,197,500.00");
    expect(
      within(equation).getByTestId(
        "portfolio-equation-liabilities"
      )
    ).toHaveTextContent("QAR 2,150,000.00");
    expect(rail.props.accessibilityRole).toBe("image");
    expect(rail.props.accessibilityLabel).toContain(
      "Recorded assets: QAR 7,197,500.00"
    );
    expect(
      flattenedStyle(
        within(hero).getByTestId("portfolio-composition-assets")
      ).width
    ).toBe("77%");
    expect(
      flattenedStyle(
        within(hero).getByTestId(
          "portfolio-composition-liabilities"
        )
      ).width
    ).toBe("23%");

    await fireEvent.press(
      screen.getByTestId("portfolio-currency-USD")
    );
    expect(
      within(hero).getByTestId("portfolio-position-value")
    ).toHaveTextContent("USD 10,200.00");
    expect(
      within(
        within(hero).getByTestId("portfolio-position-freshness")
      ).getByText("Records dated 22 Jul 2026–24 Jul 2026")
    ).toBeTruthy();
  });

  it("keeps masthead geometry while privacy mode removes every composition ratio", async () => {
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        workspace={createWorkspace("sample")}
      />
    );
    const visiblePositionStyle = flattenedStyle(
      screen.getByTestId("portfolio-position-block")
    );
    const visibleRailStyle = flattenedStyle(
      screen.getByTestId("portfolio-composition-rail")
    );

    await screen.rerender(
      <PortfolioDashboard
        amountsHidden
        workspace={createWorkspace("sample")}
      />
    );

    const concealedRail = screen.getByTestId(
      "portfolio-composition-rail"
    );
    expect(
      flattenedStyle(screen.getByTestId("portfolio-position-block"))
    ).toEqual(visiblePositionStyle);
    expect(flattenedStyle(concealedRail)).toEqual(
      visibleRailStyle
    );
    expect(concealedRail.props.accessibilityLabel).toBe(
      "Private · amounts hidden"
    );
    expect(concealedRail.props.accessibilityLabel).not.toMatch(
      /[0-9%]/u
    );
    expect(
      flattenedStyle(
        screen.getByTestId("portfolio-composition-concealed")
      )
    ).toMatchObject({
      width: "100%",
      backgroundColor: themes.dark.borderStrong
    });
    expect(
      screen.queryByTestId("portfolio-composition-assets")
    ).toBeNull();
    expect(
      screen.queryByTestId("portfolio-composition-liabilities")
    ).toBeNull();
  });

  it("retains stacking and RTL contracts for narrow screens and large text", async () => {
    expect(shouldStackPortfolioFinancialLayout(320, 1)).toBe(true);
    expect(shouldStackPortfolioFinancialLayout(390, 1.3)).toBe(true);

    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        language="ar"
        workspace={createWorkspace("sample")}
      />
    );
    const equationLabel = screen.getByLabelText(
      /الأصول المسجّلة.*−.*الالتزامات المسجّلة.*=.*صافي المركز المسجّل/u
    );
    const formulaStyle = flattenedStyle(equationLabel);
    const positionStyle = flattenedStyle(
      screen.getByTestId("portfolio-position-block")
    );

    expect(formulaStyle.flexDirection).toBe("row-reverse");
    expect(positionStyle.flexDirection).toBe("column");
    expect(
      flattenedStyle(
        screen.getByTestId("portfolio-position-freshness")
      ).alignItems
    ).toBe("flex-end");
    await fireEvent.press(
      screen.getByTestId("portfolio-currency-USD")
    );
    expect(
      screen.getByTestId("portfolio-position-value")
    ).toHaveTextContent("\u2066USD ١٠٬٢٠٠٫٠٠\u2069");
    expect(
      screen.getByTestId("portfolio-position-freshness")
    ).toHaveTextContent(/تواريخ السجلات/u);
  });
});
