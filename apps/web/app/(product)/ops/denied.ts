// What the back office says when it will not open, in plain words (the console is English only).
// The API answers 401 when there is no sign-in or when a staff sign-in has run out (they last
// 12 hours), and 403 for a signed-in person who is not on the staff list. Each gets its own
// sentence, so staff who come back after a night do not read "sign in again" and wonder why.

export type Denial = { message: string; signIn: boolean };

export function denial(status: number, detail: string): Denial {
  if (status === 401 && /^sign in again/i.test(detail)) {
    const hours = /(\d+) hours/.exec(detail)?.[1] ?? "12";
    return { message: `Your back-office sign-in lasts ${hours} hours and has run out. Sign in again and you will come back to this page.`, signIn: true };
  }
  if (status === 401) {
    return { message: "Sign in with your ALYR staff email to use the console. You will come back to this page.", signIn: true };
  }
  if (status === 403) {
    return { message: "This console is for ALYR staff only. If you are staff, sign in with the email ALYR added you with.", signIn: true };
  }
  return { message: "The console could not be opened right now. Check your connection and try again.", signIn: false };
}
