export interface CommittedRecordFinalization {
  readonly clearDraft: () => Promise<void>;
  readonly acknowledge: () => Promise<void>;
  readonly navigate: () => void;
}

/**
 * Runs only after the repository-backed create call has resolved. Keeping this
 * boundary separate lets the UI retry draft deletion or SecureStore
 * acknowledgement with the same committed record identity.
 */
export async function finalizeCommittedRecord(
  steps: CommittedRecordFinalization
): Promise<void> {
  await steps.clearDraft();
  await steps.acknowledge();
  steps.navigate();
}
