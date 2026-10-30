// What happened to a message the owner sent to their private test line (the "Try it" step).
// A business with no test line (ALYR's own, made by the one-off first-admin job) is answered
// 409 by `POST /api/onboarding/test-chat`; the screen used to take no notice and the chat stayed
// empty. Plain TypeScript with no React, so `testLine.test.mjs` runs it under Node.

export type TestSend = "sent" | "no_line" | "failed";

/** 409 is the API saying the business has no test line; any other refusal or error is a send
 * that did not happen. */
export function testSendOutcome(ok: boolean, status: number): TestSend {
  if (ok) return "sent";
  return status === 409 ? "no_line" : "failed";
}
