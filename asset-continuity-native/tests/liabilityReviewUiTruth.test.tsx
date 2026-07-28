import {
  fireEvent,
  render
} from "@testing-library/react-native";

import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import {
  confirmNoLiabilities,
  createLiability,
  setLiabilityLifecycle,
  updateLiability
} from "@/domain/liabilities";
import { createWorkspace } from "@/domain/sample";
import { getPortfolioExperienceCopy } from "@/i18n/portfolioCopy";

function invalidatedReviewWorkspace() {
  const context = {
    id: (prefix: string) => `id-${prefix}`,
    now: () => "2026-07-28T08:00:00.000Z",
    today: () => "2026-07-28"
  };
  const created = createLiability(
    createWorkspace("personal"),
    { name: "Home finance", kind: "mortgage" },
    { ...context, id: () => "liability-home" }
  );
  const archived = setLiabilityLifecycle(
    created.workspace,
    {
      liabilityId: created.liability.id,
      lifecycleStatus: "archived"
    },
    { ...context, now: () => "2026-07-28T09:00:00.000Z" }
  );
  const reviewed = confirmNoLiabilities(
    archived.workspace,
    "2026-07-28",
    { ...context, now: () => "2026-07-28T10:00:00.000Z" }
  );
  return updateLiability(
    reviewed.workspace,
    {
      liabilityId: created.liability.id,
      name: "Updated home finance",
      kind: "mortgage"
    },
    { ...context, now: () => "2026-07-28T11:00:00.000Z" }
  ).workspace;
}

describe("Liability review UI truth", () => {
  it("distinguishes a superseded review from first-time unknown and offers re-review", async () => {
    const copy = getPortfolioExperienceCopy("en");
    const onConfirm = jest.fn();
    const firstTime = await render(
      <PortfolioDashboard
        canReadLiabilities
        workspace={createWorkspace("personal")}
      />
    );
    expect(
      firstTime.getByTestId("portfolio-start-decision")
    ).toBeTruthy();
    expect(
      firstTime.queryByText(copy.liabilities.noActiveTitle)
    ).toBeNull();
    expect(
      firstTime.queryByText(copy.liabilities.noneReviewChangedTitle)
    ).toBeNull();
    await firstTime.unmount();

    const changed = await render(
      <PortfolioDashboard
        canReadLiabilities
        onConfirmNoLiabilities={onConfirm}
        workspace={invalidatedReviewWorkspace()}
      />
    );
    expect(
      changed.getByText(copy.liabilities.noneReviewChangedTitle)
    ).toBeTruthy();
    expect(
      changed.getByText(copy.liabilities.noneReviewChangedBody)
    ).toBeTruthy();
    await fireEvent.press(
      changed.getByTestId("liability-confirm-none")
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await changed.unmount();
  });

  it("renders explicit Arabic re-review guidance in RTL", async () => {
    const copy = getPortfolioExperienceCopy("ar");
    const screen = await render(
      <PortfolioDashboard
        canReadLiabilities
        language="ar"
        onConfirmNoLiabilities={jest.fn()}
        workspace={invalidatedReviewWorkspace()}
      />
    );

    expect(
      screen.getByText(copy.liabilities.noneReviewChangedTitle)
    ).toBeTruthy();
    expect(
      screen.getByText(copy.liabilities.noneReviewChangedBody)
    ).toBeTruthy();
    await screen.unmount();
  });
});
