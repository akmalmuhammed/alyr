import { render } from "@testing-library/react-native";

import {
  queuedSyncChangeSummary,
  SyncTruth
} from "@/components/SyncTruth";

describe("SyncTruth localization", () => {
  it("uses natural English and Arabic count forms", () => {
    expect(queuedSyncChangeSummary(1, "en")).toBe(
      "1 change safely queued for cloud acknowledgement"
    );
    expect(queuedSyncChangeSummary(2, "ar")).toBe(
      "تغييران محفوظان بأمان وينتظران تأكيد السحابة"
    );
    expect(queuedSyncChangeSummary(0, "ar")).toBe(
      "لا توجد تغييرات محلية بانتظار تأكيد السحابة"
    );
  });

  it("keeps a durable conflict visible even when cloud transport is unavailable", async () => {
    const screen = await render(
      <SyncTruth
        language="en"
        pendingOperationCount={0}
        sync={{
          status: "local-only",
          conflicts: [
            {
              operationId: "operation-1",
              entityId: "asset-1",
              conflictKind: "location",
              serverVersion: 2,
              message: "Changed elsewhere."
            }
          ],
          lastError: null,
          lastAttemptAt: null,
          lastSyncedAt: null
        }}
      />
    );

    expect(screen.getByText("Sync needs review")).toBeTruthy();
    expect(
      screen.getByText(
        "1 difference safely preserved. Open to compare device and cloud records."
      )
    ).toBeTruthy();
  });
});
