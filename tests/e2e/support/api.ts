import { expect, request, type APIRequestContext, type TestInfo } from "@playwright/test";
import { WEB } from "./env";
import { ADDRESS_HEADER, addressFor } from "./test";

// Talking to the stack the way its own pages do, for the parts of a journey that are not what is
// being proved: making a signed-in person, or a customer's first message. Everything goes through
// the web app's address, which forwards /api and /sim to the API.

let counter = 0;

/** A name that is new on every call, in every worker, for emails, shops and phone numbers. */
export function unique(tag: string): string {
  counter += 1;
  return `${tag}-${Date.now().toString(36)}${process.pid.toString(36)}${counter}`;
}

/** A customer's phone number that no other test uses. Qatar's mobile numbers start with 5. */
export function customerPhone(): string {
  const tail = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `9745${tail}0`.slice(0, 11);
}

/** The API as one test's visitor (support/test.ts says why each test has an address of its own). */
export async function newApi(info?: TestInfo): Promise<APIRequestContext> {
  const address = info ? addressFor(info) : "10.255.255.254";
  return request.newContext({ baseURL: WEB, extraHTTPHeaders: { [ADDRESS_HEADER]: address } });
}

export type Me = { signed_in: boolean; email: string; role: string; name: string; business_id: string | null };

/**
 * Signs `email` in through the sign-in API. A local API hands the code back (`dev_code`), which
 * is what the sign-in page shows without an inbox. The session cookie stays in `api`'s jar.
 */
export async function signIn(api: APIRequestContext, email: string): Promise<Me> {
  const sent = await api.post("/api/auth/code", { data: { email } });
  expect(sent.status(), `asking for a sign-in code for ${email}`).toBe(200);
  const { dev_code: code } = await sent.json();
  expect(code, "a local API hands the code back").toBeTruthy();
  const verified = await api.post("/api/auth/verify", { data: { email, code } });
  expect(verified.status(), `signing ${email} in`).toBe(200);
  return verified.json();
}

export type NewShop = { email: string; ownerName: string; name: string; slug: string };

/**
 * A new business made the way sign-up makes it: a code to a new address, the terms ticked, the
 * business created. Leaves `api` signed in as its owner. `type` is a business type's key.
 */
export async function signUp(
  api: APIRequestContext,
  { type, name = unique("Shop") }: { type: string; name?: string },
): Promise<NewShop> {
  const email = `${unique("owner")}@shop.example`;
  const sent = await api.post("/api/onboarding/code", { data: { email } });
  expect(sent.status(), "asking for a sign-up code").toBe(200);
  const { dev_code: code } = await sent.json();
  const verified = await api.post("/api/onboarding/verify", { data: { email, code } });
  expect(verified.status(), "checking the sign-up code").toBe(200);
  const { signup_token: token } = await verified.json();
  expect(token, "a new address gets a token to make its business").toBeTruthy();
  const terms = await (await api.get("/api/onboarding/terms/current")).json();
  const made = await api.post("/api/onboarding/business", {
    data: {
      signup_token: token, owner_name: "Hamad", name, name_ar: "", type, area: "Al Sadd",
      accepted_terms: terms.current.map((t: { id: string }) => t.id),
    },
  });
  expect(made.status(), `creating the ${type} business: ${await made.text()}`).toBe(200);
  const state = await (await api.get("/api/onboarding/state")).json();
  return { email, ownerName: "Hamad", name, slug: state.business.slug };
}

/** The business types sign-up offers, with their names in both languages. */
export async function businessTypes(api: APIRequestContext) {
  const answer = await (await api.get("/api/onboarding/types")).json();
  return answer.types as { key: string; name: { en: string; ar: string }; way: string }[];
}

export type Link = { path: string; url: string };

/**
 * A customer's first words to a shop's test line, and the link the shop answers with: `menu` gets
 * the order page's link, `I want to book` the booking page's. This is the real inbound path (the
 * simulator channel, then the module that answers), not a made-up link; the link carries a signed
 * token, never a contact ID. `path` is what a browser on the web app opens.
 */
export async function customerLink(
  api: APIRequestContext,
  { shop, phone, say }: { shop: string; phone: string; say: "menu" | "I want to book" },
): Promise<Link> {
  const sent = await api.post("/sim/messages", { data: { from_number: phone, text: say, shop } });
  expect(sent.status(), `${phone} writing to ${shop}`).toBe(200);
  // The answer is a queued message, sent by the job runner a moment after the customer's own
  // message is accepted, so it is waited for in the conversation rather than read off the reply.
  let url = "";
  await expect
    .poll(
      async () => {
        const conversation = await api.get(`/sim/conversations/${phone}`, { params: { shop } });
        const answer = ((await conversation.json()).messages as { direction: string; body: string }[])
          .reverse()
          .find((m) => m.direction === "out" && /https?:\/\//.test(m.body));
        url = answer?.body.match(/https?:\/\/\S+/)?.[0] ?? "";
        return url;
      },
      { message: `the shop answers "${say}" with a link`, timeout: 20_000 },
    )
    .not.toBe("");
  const parsed = new URL(url);
  return { url, path: `${parsed.pathname}${parsed.search}` };
}
