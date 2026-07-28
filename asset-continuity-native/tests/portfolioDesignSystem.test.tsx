import { render, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type {
  StyleProp,
  TextStyle,
  ViewStyle
} from "react-native";

import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { createWorkspace } from "@/domain/sample";
import { radius, typography } from "@/theme/tokens";

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

function renderedFontSizes(node: unknown): number[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(renderedFontSizes);
  if (typeof node !== "object") return [];
  const element = node as {
    readonly type?: unknown;
    readonly props?: { readonly style?: unknown };
    readonly children?: readonly unknown[];
  };
  const style =
    element.type === "Text" && element.props
      ? StyleSheet.flatten(
          element.props.style as StyleProp<TextStyle>
        )
      : undefined;
  return [
    ...(typeof style?.fontSize === "number" ? [style.fontSize] : []),
    ...(element.children?.flatMap(renderedFontSizes) ?? [])
  ];
}

describe("Portfolio ALYR design-system contract", () => {
  it("uses restrained segmented currency controls and operational metadata type", async () => {
    const screen = await render(
      <PortfolioDashboard
        onOpenSubject={jest.fn()}
        workspace={createWorkspace("sample")}
      />
    );
    const qar = screen.getByTestId("portfolio-currency-QAR");
    const qarLabel = within(qar).getByText("QAR");
    const mortgage = within(
      screen.getByTestId("liability-row-liability-mortgage")
    );
    const mortgageMeta = mortgage.getByText(
      /Mortgage.+Current recorded balance/u
    );
    const mortgageState = mortgage.getByText(
      /Active.+On this device/u
    );

    expect(flattenedStyle(qar).borderRadius).toBe(radius.sm);
    expect(flattenedStyle(qarLabel)).toMatchObject({
      fontFamily: typography.metadata,
      fontSize: 13
    });
    expect(flattenedStyle(mortgageMeta)).toMatchObject({
      fontFamily: typography.metadata,
      fontSize: 12
    });
    expect(flattenedStyle(mortgageState)).toMatchObject({
      fontFamily: typography.metadata,
      fontSize: 12
    });

    const sampleLabel = screen.getByText("SAMPLE WORKSPACE");
    const heroLabel = screen.getByText("TRACKED NET POSITION");
    expect(flattenedStyle(sampleLabel)).toMatchObject({
      fontFamily: typography.bodyBold,
      fontSize: 13
    });
    expect(flattenedStyle(heroLabel)).toMatchObject({
      fontFamily: typography.bodyBold,
      fontSize: 13
    });
    expect(flattenedStyle(screen.getByText("Portfolio")).fontFamily).toBe(
      typography.displayBold
    );
    expect(
      flattenedStyle(screen.getByText("How this is calculated"))
        .fontFamily
    ).toBe(typography.bodyMedium);
  });

  it("anchors progress and distribution fills to the RTL end edge without changing percentages", async () => {
    const screen = await render(
      <PortfolioDashboard
        language="ar"
        workspace={createWorkspace("sample")}
      />
    );
    const progressFills = screen.getAllByTestId(
      "portfolio-progress-fill"
    );
    const distributionFills = screen.getAllByTestId(
      /^portfolio-distribution-fill-/u
    );

    expect(progressFills.length).toBeGreaterThan(0);
    expect(distributionFills.length).toBeGreaterThan(0);
    for (const fill of [...progressFills, ...distributionFills]) {
      const style = flattenedStyle(fill);
      expect(style.alignSelf).toBe("flex-end");
      expect(style.width).toMatch(/^\d+(?:\.\d+)?%$/u);
    }
  });

  it("keeps every visible Portfolio text style at 12px or larger", async () => {
    const screen = await render(
      <PortfolioDashboard workspace={createWorkspace("sample")} />
    );
    const fontSizes = renderedFontSizes(screen.toJSON());

    expect(fontSizes.length).toBeGreaterThan(0);
    for (const fontSize of fontSizes) {
      expect(fontSize).toBeGreaterThanOrEqual(12);
    }
  });

});
