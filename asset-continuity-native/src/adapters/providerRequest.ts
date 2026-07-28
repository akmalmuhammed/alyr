import type { ProviderRequestContext } from "@alyr/contracts";

export class ProviderRequestCancelledError extends Error {
  constructor() {
    super("The bounded provider request was cancelled.");
    this.name = "ProviderRequestCancelledError";
  }
}

export function providerRequestIsActive(
  context: ProviderRequestContext | undefined
): boolean {
  return (
    context === undefined ||
    (!context.signal.aborted &&
      Number.isFinite(context.deadlineAtMs) &&
      Date.now() < context.deadlineAtMs)
  );
}

export function assertProviderRequestActive(
  context: ProviderRequestContext | undefined
): void {
  if (!providerRequestIsActive(context)) {
    throw new ProviderRequestCancelledError();
  }
}

export function rethrowProviderCancellation(
  error: unknown,
  context: ProviderRequestContext | undefined
): void {
  if (
    error instanceof ProviderRequestCancelledError ||
    !providerRequestIsActive(context)
  ) {
    throw error instanceof ProviderRequestCancelledError
      ? error
      : new ProviderRequestCancelledError();
  }
}
