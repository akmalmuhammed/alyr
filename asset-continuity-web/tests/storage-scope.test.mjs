import assert from "node:assert/strict";
import test from "node:test";

import { STORAGE_KEY } from "../src/domain.js";
import {
  ACTIVE_GENERATION_STORAGE_KEY,
  LOCAL_DEMO_SCOPE_ID,
  clearStorageScopeCache,
  createAccountStorageScopeId,
  isAccountStorageScopeId,
  listWorkspaceGenerationStorageKeys,
  readActiveStorageGenerationId,
  scopedStorageKey,
  storageKeysForScope,
  workspaceStorageKeyForGeneration,
} from "../src/storageScope.js";

test("the local demo keeps its backwards-compatible browser key", () => {
  const keys = storageKeysForScope(LOCAL_DEMO_SCOPE_ID);

  assert.equal(keys.workspace, STORAGE_KEY);
  assert.equal(scopedStorageKey(STORAGE_KEY, LOCAL_DEMO_SCOPE_ID), STORAGE_KEY);
  assert.equal(isAccountStorageScopeId(LOCAL_DEMO_SCOPE_ID), false);
});

test("account storage scopes bind both account and household identities", () => {
  const first = createAccountStorageScopeId({
    accountId: "account-one",
    householdId: "household-one",
  });
  const anotherAccount = createAccountStorageScopeId({
    accountId: "account-two",
    householdId: "household-one",
  });
  const anotherHousehold = createAccountStorageScopeId({
    accountId: "account-one",
    householdId: "household-two",
  });

  assert.notEqual(first, anotherAccount);
  assert.notEqual(first, anotherHousehold);
  assert.equal(isAccountStorageScopeId(first), true);
  assert.match(storageKeysForScope(first).workspace, /\.scope\./u);
  assert.notEqual(storageKeysForScope(first).workspace, STORAGE_KEY);
});

test("opaque service ids cannot break or alias scoped storage keys", () => {
  const first = createAccountStorageScopeId({
    accountId: "account/one",
    householdId: "household:one",
  });
  const second = createAccountStorageScopeId({
    accountId: "account",
    householdId: "one/household:one",
  });

  assert.notEqual(first, second);
  assert.notEqual(
    storageKeysForScope(first).workspace,
    storageKeysForScope(second).workspace,
  );
});

test("missing authenticated identities fail closed", () => {
  assert.throws(
    () => createAccountStorageScopeId({ accountId: "account-one" }),
    /Household identity is required/u,
  );
  assert.throws(
    () => storageKeysForScope(""),
    /valid local or authenticated storage scope/u,
  );
});

test("workspace generations are scoped, opaque, and backwards compatible", () => {
  const accountScope = createAccountStorageScopeId({
    accountId: "account-one",
    householdId: "household-one",
  });
  const keys = storageKeysForScope(accountScope);
  const generationId = "restore:2026/07/25";

  assert.equal(keys.workspaceForGeneration(), keys.workspace);
  assert.equal(
    keys.workspaceForGeneration(generationId),
    workspaceStorageKeyForGeneration(accountScope, generationId),
  );
  assert.match(keys.workspaceForGeneration(generationId), /\.generation\./u);
  assert.ok(
    !keys.workspaceForGeneration(generationId).includes(generationId),
    "opaque generation ids must be encoded inside browser keys",
  );
  assert.equal(
    keys.activeGeneration,
    scopedStorageKey(ACTIVE_GENERATION_STORAGE_KEY, accountScope),
  );
});

test("active generation lookup fails closed on malformed stored values", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
  };
  const keys = storageKeysForScope(LOCAL_DEMO_SCOPE_ID);

  assert.equal(
    readActiveStorageGenerationId(LOCAL_DEMO_SCOPE_ID, storage),
    null,
  );
  values.set(keys.activeGeneration, "restore-001");
  assert.equal(
    readActiveStorageGenerationId(LOCAL_DEMO_SCOPE_ID, storage),
    "restore-001",
  );
  values.set(keys.activeGeneration, " ".repeat(2));
  assert.throws(
    () => readActiveStorageGenerationId(LOCAL_DEMO_SCOPE_ID, storage),
    /valid storage generation identity/u,
  );
});

test("scope reset enumerates and clears every local generation without touching another account", () => {
  const firstScope = createAccountStorageScopeId({
    accountId: "account-one",
    householdId: "household-one",
  });
  const secondScope = createAccountStorageScopeId({
    accountId: "account-two",
    householdId: "household-two",
  });
  const firstKeys = storageKeysForScope(firstScope);
  const secondKeys = storageKeysForScope(secondScope);
  const values = new Map([
    [firstKeys.workspace, "first-base"],
    [firstKeys.workspaceForGeneration("restore-one"), "first-one"],
    [firstKeys.workspaceForGeneration("restore-two"), "first-two"],
    [firstKeys.activeGeneration, "restore-two"],
    [firstKeys.restoreRollback, "rollback"],
    [firstKeys.captureDraft, "draft"],
    [firstKeys.recovery, "unreadable"],
    [firstKeys.recoveryWarningDismissed, "1"],
    [secondKeys.workspace, "second-base"],
    [secondKeys.workspaceForGeneration("restore-other"), "second-generation"],
    ["unrelated-key", "keep"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };

  assert.deepEqual(listWorkspaceGenerationStorageKeys(firstScope, storage), [
    firstKeys.workspaceForGeneration("restore-one"),
    firstKeys.workspaceForGeneration("restore-two"),
  ]);
  const cleared = clearStorageScopeCache(firstScope, storage);
  assert.ok(cleared.includes(firstKeys.workspaceForGeneration("restore-one")));
  assert.equal(values.get(firstKeys.workspace), undefined);
  assert.equal(
    values.get(firstKeys.workspaceForGeneration("restore-two")),
    undefined,
  );
  assert.equal(values.get(firstKeys.captureDraft), undefined);
  assert.equal(values.get(firstKeys.recovery), undefined);
  assert.equal(values.get(secondKeys.workspace), "second-base");
  assert.equal(
    values.get(secondKeys.workspaceForGeneration("restore-other")),
    "second-generation",
  );
  assert.equal(values.get("unrelated-key"), "keep");
});
