import { finalizeCommittedRecord } from "@/auth/firstRecordCompletion";

describe("committed first-record finalization", () => {
  it("retries a propagated draft-clear failure without running record creation again", async () => {
    const order: string[] = [];
    const createRecord = jest.fn(async () => {
      order.push("commit");
      return { id: "reserved-first-record" };
    });
    let failClear = true;
    const clearDraft = jest.fn(async () => {
      order.push("clear");
      if (failClear) {
        failClear = false;
        throw new Error("protected draft unavailable");
      }
    });
    const acknowledge = jest.fn(async () => {
      order.push("ack");
    });
    const navigate = jest.fn(() => {
      order.push("navigate");
    });

    const committed = await createRecord();
    await expect(
      finalizeCommittedRecord({
        clearDraft,
        acknowledge,
        navigate
      })
    ).rejects.toThrow("protected draft unavailable");
    expect(committed.id).toBe("reserved-first-record");
    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    await finalizeCommittedRecord({
      clearDraft,
      acknowledge,
      navigate
    });

    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(clearDraft).toHaveBeenCalledTimes(2);
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      "commit",
      "clear",
      "clear",
      "ack",
      "navigate"
    ]);
  });
});
