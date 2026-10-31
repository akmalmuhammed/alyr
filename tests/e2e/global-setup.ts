import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect } from "@playwright/test";
import { newApi, signIn } from "./support/api";
import { AUTH, SEEDED, WEB } from "./support/env";

// Runs once before the journeys: checks the stack is really there, and makes the two signed-in
// sessions the tests start from (a person of ALYR staff, and the demo shop's owner).
export default async function globalSetup() {
  mkdirSync(".auth", { recursive: true });

  // Sign-in codes, sign-ups and orders are limited per address (core/ratelimit.py), and every test
  // here comes from one address. A fresh CI database never reaches the limits; a laptop that runs
  // the suite again within the hour can. Give E2E_RESET_LIMITS_CMD a command that empties
  // `rate_hits` and `login_codes` on the scratch database (README.md has one).
  if (process.env.E2E_RESET_LIMITS_CMD) execSync(process.env.E2E_RESET_LIMITS_CMD, { stdio: "inherit" });

  const api = await newApi();
  const types = await api.get("/api/onboarding/types").catch(() => null);
  if (!types?.ok()) {
    throw new Error(
      `The stack is not answering at ${WEB}. Start PostgreSQL, the API (migrated and seeded, ALYR_ENV=local ` +
        "ALYR_DEMO_OPEN=false) and the web app first: tests/e2e/README.md.",
    );
  }

  const staff = await signIn(api, SEEDED.staff);
  expect(staff.email, "the demo seed has made the ALYR staff member (python -m alyr.seed)").toBe(SEEDED.staff);

  // The bakery is set up by its owner alone only once ALYR switches it on in the back office
  // (/ops → Sign-up); that is how production was opened. Do the same here, as staff.
  const switched = await api.put("/api/admin/pricing/types/bakery", {
    data: { availability: "self_serve", price_mode: "prepared" },
  });
  expect(switched.status(), "the back office switches the bakery to self-serve").toBe(200);
  await api.storageState({ path: AUTH.staff });
  await api.dispose();

  const ownerApi = await newApi();
  const owner = await signIn(ownerApi, SEEDED.owner);
  expect(owner.role).toBe("owner");
  await ownerApi.storageState({ path: AUTH.owner });
  await ownerApi.dispose();
}
