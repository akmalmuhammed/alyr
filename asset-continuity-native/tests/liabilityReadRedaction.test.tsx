import { render } from "@testing-library/react-native";

import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { createWorkspace } from "@/domain/sample";
import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";

describe("Portfolio liability-read boundary", () => {
  it("keeps the owner/editor net-position experience when liability.read is granted", async () => {
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        canReadLiabilities
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getByTestId("portfolio-net-position")).toBeTruthy();
    expect(
      screen.getByTestId("portfolio-net-position-visibility")
    ).toBeTruthy();
    expect(screen.getByTestId("liabilities-list")).toBeTruthy();
    expect(screen.getByText("TRACKED NET POSITION")).toBeTruthy();
    expect(screen.getByText("West Bay Home mortgage")).toBeTruthy();
    expect(screen.getByText("Travel card balance")).toBeTruthy();
    expect(
      screen.getAllByText("Recorded liabilities").length
    ).toBeGreaterThan(0);
  });

  it("renders only asset/property recorded value when liability.read is denied", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const screen = await render(
      <PortfolioDashboard
        amountsHidden={false}
        canReadLiabilities={false}
        workspace={createWorkspace("sample")}
      />
    );

    expect(screen.getByTestId("portfolio-recorded-asset-value")).toBeTruthy();
    expect(screen.getByText("RECORDED VALUE")).toBeTruthy();
    expect(screen.getAllByText(/QAR\s*7,197,500\.00/u).length).toBeGreaterThan(
      0
    );

    for (const testID of [
      "portfolio-net-position",
      "portfolio-net-position-visibility",
      "liabilities-list",
      "liability-add"
    ]) {
      expect(screen.queryByTestId(testID)).toBeNull();
    }
    for (const privateLabel of [
      "TRACKED NET POSITION",
      "Liabilities",
      "Recorded liabilities",
      "West Bay Home mortgage",
      "Travel card balance",
      copy.netPosition.status.partial
    ]) {
      expect(screen.queryByText(privateLabel)).toBeNull();
    }
    expect(
      screen.queryByLabelText(/West Bay Home mortgage|Travel card balance/u)
    ).toBeNull();
    expect(screen.queryByText(/QAR\s*5,047,500\.00/u)).toBeNull();
    expect(screen.queryByText(/QAR\s*2,150,000\.00/u)).toBeNull();
  });
});
