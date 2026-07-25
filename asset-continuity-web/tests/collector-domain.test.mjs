import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTOR_SCHEMA_VERSION,
  collectorReducer,
  createEmptyCollectorState,
  detectLikelyDuplicates,
  normalizeCollectorState,
  projectCollectionForShowcase,
  projectItemForShowcase,
  selectCollectionCompletion,
  selectCollectionGaps,
  selectCollectionHealth,
  selectCollectionPrideSummary,
  selectCurrentCollectorLifecycle,
  selectDuplicateGroups,
  validateInvestmentReference,
  validatePrivateFinancialReference,
} from "../src/collectorDomain.js";

const NOW = "2026-07-25T08:00:00.000Z";

function baseCollection(overrides = {}) {
  return {
    id: "collection-watches",
    name: "Mechanical watches",
    kind: "collectibles",
    identity: {
      theme: "Independent watchmaking",
      catalogSystem: "Reference and caliber",
    },
    curation: {
      statement: "Small machines that carry family time.",
      pridePrompt: "Which piece changed how you collect?",
      coverItemProfileId: "profile-watch",
      featuredItemProfileIds: ["profile-watch"],
    },
    showcase: {
      visibility: "showcase",
      slug: "mechanical-watches",
      title: "Time, kept",
      subtitle: "A personal mechanical-watch archive",
      theme: "midnight",
      publishedAt: "2026-07-20T08:00:00.000Z",
    },
    completionMode: "target-list",
    trackValuations: true,
    healthPolicy: {
      conditionReviewMonths: 12,
      valuationReviewMonths: 12,
    },
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

function watchProfile(overrides = {}) {
  return {
    id: "profile-watch",
    assetId: "asset-watch",
    kind: "collectible",
    identity: {
      displayName: "GMT Master II",
      maker: "Rolex",
      model: "GMT Master II",
      series: "Professional",
      reference: "126710BLRO",
      productionYear: 2022,
      variantName: "Pepsi",
      identifiers: [
        {
          type: "serial",
          value: "9R4X7P",
          issuer: "Manufacturer",
        },
      ],
    },
    edition: {
      applicable: true,
      kind: "production",
      variantName: "Pepsi",
      variantAttributes: ["Oyster bracelet", "Blue-red bezel"],
    },
    story: {
      headline: "The travel watch",
      narrative: "The first watch I saved for deliberately.",
      whyItMatters: "It marks a turning point.",
      prideNote: "A patient purchase.",
      publicExcerpt: "A travel watch chosen slowly and kept carefully.",
    },
    media: {
      coverMediaId: "media-original-watch",
      originalMediaIds: ["media-original-watch"],
      showcaseMediaIds: ["media-public-watch"],
    },
    privacy: {
      showcaseEligible: true,
      showStory: true,
      showCondition: true,
      showEdition: true,
      showPeople: false,
      showArtHistory: false,
    },
    carePlan: {
      requiresService: true,
      serviceIntervalMonths: 60,
      conditionReviewMonths: 12,
    },
    tags: ["watch", "gmt"],
    status: "active",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

function watchState(overrides = {}) {
  return normalizeCollectorState(
    {
      householdId: "household-test",
      collections: [baseCollection()],
      itemProfiles: [watchProfile()],
      memberships: [
        {
          id: "membership-watch",
          collectionId: "collection-watches",
          itemProfileId: "profile-watch",
          role: "owned",
          showcase: true,
          displayOrder: 1,
          addedAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      acquisitionEvents: [
        {
          id: "acquisition-watch",
          itemProfileId: "profile-watch",
          acquiredAt: "2020-01-02T00:00:00.000Z",
          method: "purchase",
          sourcePartyLabel: "Private seller",
          amount: { amountMinor: 1500000, currency: "USD" },
          materialIds: ["receipt-private"],
        },
      ],
      provenanceEvents: [
        {
          id: "provenance-watch",
          itemProfileId: "profile-watch",
          happenedAt: "2020-01-02T00:00:00.000Z",
          eventType: "owned",
          title: "Joined the collection",
          placeLabel: "Exact private address",
          partyLabels: ["Private seller"],
          confidence: "documented",
          privacy: "showcase",
          publicSummary: "Acquired after a long search.",
          materialIds: ["receipt-private"],
        },
      ],
      conditionReports: [
        {
          id: "condition-watch",
          itemProfileId: "profile-watch",
          observedAt: "2026-06-01T00:00:00.000Z",
          grade: "excellent",
          summary: "Private inspection detail",
          publicSummary: "Preserved in excellent condition.",
          assessorLabel: "Private specialist",
          privacy: "showcase",
          materialIds: ["condition-original"],
        },
      ],
      serviceEvents: [
        {
          id: "service-watch",
          itemProfileId: "profile-watch",
          serviceAt: "2026-05-01T00:00:00.000Z",
          serviceType: "Full service",
          status: "completed",
          providerLabel: "Private service center",
          cost: { amountMinor: 95000, currency: "USD" },
          nextDueAt: "2031-05-01T00:00:00.000Z",
          materialIds: ["service-invoice"],
        },
      ],
      valuationObservations: [
        {
          id: "valuation-watch",
          itemProfileId: "profile-watch",
          valuedAt: "2026-06-10T00:00:00.000Z",
          kind: "insurance",
          amount: { amountMinor: 1800000, currency: "USD" },
          sourceLabel: "Private appraiser",
          materialIds: ["appraisal-original"],
        },
      ],
      collectionTargets: [
        {
          id: "target-gmt",
          collectionId: "collection-watches",
          label: "Travel watch",
          priority: "essential",
          required: true,
          criteria: { maker: "Rolex", model: "GMT Master II" },
          matchedItemProfileId: "profile-watch",
        },
      ],
      ...overrides,
    },
    { now: NOW },
  );
}

test("creates an explicit, versioned empty collector state", () => {
  const state = createEmptyCollectorState({
    householdId: "household-empty",
    now: NOW,
  });

  assert.equal(state.schemaVersion, COLLECTOR_SCHEMA_VERSION);
  assert.equal(state.householdId, "household-empty");
  assert.deepEqual(state.collections, []);
  assert.deepEqual(state.privateFinancialReferences, []);
  assert.equal(state.createdAt, NOW);
});

test("normalization keeps one canonical membership and repairs curation references", () => {
  const state = normalizeCollectorState(
    {
      householdId: "household-test",
      collections: [
        baseCollection({
          curation: {
            coverItemProfileId: "ghost",
            featuredItemProfileIds: ["ghost", "profile-watch"],
          },
        }),
      ],
      itemProfiles: [watchProfile()],
      memberships: [
        {
          id: "membership-one",
          collectionId: "collection-watches",
          itemProfileId: "profile-watch",
        },
        {
          id: "membership-duplicate",
          collectionId: "collection-watches",
          itemProfileId: "profile-watch",
        },
        {
          id: "membership-orphan",
          collectionId: "ghost",
          itemProfileId: "profile-watch",
        },
      ],
    },
    { now: NOW },
  );

  assert.equal(state.memberships.length, 1);
  assert.equal(
    state.collections[0].curation.coverItemProfileId,
    "profile-watch",
  );
  assert.deepEqual(
    state.collections[0].curation.featuredItemProfileIds,
    ["profile-watch"],
  );
});

test("edition and variant identity preserve collector-specific details", () => {
  const state = normalizeCollectorState(
    {
      itemProfiles: [
        watchProfile({
          edition: {
            applicable: true,
            kind: "numbered",
            editionNumber: 7,
            editionSize: 100,
            variantName: "Midnight",
            variantAttributes: ["Blue dial", "Titanium"],
          },
        }),
      ],
    },
    { now: NOW },
  );

  assert.equal(state.itemProfiles[0].edition.editionNumber, 7);
  assert.equal(state.itemProfiles[0].edition.editionSize, 100);
  assert.equal(state.itemProfiles[0].edition.variantName, "Midnight");
  assert.deepEqual(state.itemProfiles[0].edition.variantAttributes, [
    "Blue dial",
    "Titanium",
  ]);
});

test("an impossible edition number is not accepted as documented truth", () => {
  const state = normalizeCollectorState(
    {
      itemProfiles: [
        watchProfile({
          edition: {
            applicable: true,
            kind: "numbered",
            editionNumber: 101,
            editionSize: 100,
          },
        }),
      ],
    },
    { now: NOW },
  );

  assert.equal(state.itemProfiles[0].edition.editionNumber, null);
  assert.equal(state.itemProfiles[0].edition.editionSize, 100);
});

test("duplicate identifiers are normalized without losing distinct identifiers", () => {
  const state = normalizeCollectorState(
    {
      itemProfiles: [
        watchProfile({
          identity: {
            displayName: "Watch",
            maker: "Maker",
            identifiers: [
              { type: "Serial", value: "ABC-123" },
              { type: "serial", value: "abc123" },
              { type: "Certificate", value: "CERT-9" },
            ],
          },
        }),
      ],
    },
    { now: NOW },
  );

  assert.deepEqual(
    state.itemProfiles[0].identity.identifiers.map((item) => item.type),
    ["Serial", "Certificate"],
  );
});

test("append-only collector commands are idempotent by event ID", () => {
  const initial = watchState({ conditionReports: [] });
  const action = {
    type: "APPEND_CONDITION_REPORT",
    now: NOW,
    report: {
      id: "condition-new",
      itemProfileId: "profile-watch",
      observedAt: NOW,
      grade: "good",
      summary: "Small scratch at six.",
    },
  };

  const once = collectorReducer(initial, action);
  const twice = collectorReducer(once, action);

  assert.equal(once.conditionReports.length, 1);
  assert.equal(twice.conditionReports.length, 1);
  assert.deepEqual(twice.conditionReports, once.conditionReports);
});

test("partial upserts preserve nested collection identity and curation", () => {
  const initial = watchState();
  const next = collectorReducer(initial, {
    type: "UPSERT_COLLECTION",
    now: NOW,
    collection: {
      id: "collection-watches",
      name: "Mechanical time",
      curation: {
        statement: "A more focused collecting statement.",
      },
    },
  });
  const collection = next.collections[0];

  assert.equal(collection.name, "Mechanical time");
  assert.equal(
    collection.curation.statement,
    "A more focused collecting statement.",
  );
  assert.equal(collection.curation.coverItemProfileId, "profile-watch");
  assert.equal(collection.identity.catalogSystem, "Reference and caliber");
  assert.equal(collection.showcase.visibility, "showcase");
});

test("acquisition and disposition remain history while lifecycle is derived", () => {
  const state = watchState({
    dispositionEvents: [
      {
        id: "disposition-watch",
        itemProfileId: "profile-watch",
        disposedAt: "2026-07-01T00:00:00.000Z",
        method: "gift",
        recipientLabel: "Family member",
      },
    ],
  });

  const lifecycle = selectCurrentCollectorLifecycle(state, "profile-watch");

  assert.equal(lifecycle.status, "disposed");
  assert.equal(lifecycle.latestEvent.method, "gift");
  assert.deepEqual(
    lifecycle.history.map((event) => event.kind),
    ["disposed", "acquired"],
  );
});

test("collection completion is derived from relevant collector records", () => {
  const completion = selectCollectionCompletion(
    watchState(),
    "collection-watches",
  );

  assert.equal(completion.itemCount, 1);
  assert.equal(completion.itemPercent, 100);
  assert.equal(completion.setPercent, 100);
  assert.equal(completion.percent, 100);
  assert.equal(completion.dimensions.story.percent, 100);
  assert.equal(completion.dimensions.valuation.percent, 100);
});

test("target-list completion exposes open gaps rather than storing a counter", () => {
  const state = watchState({
    collectionTargets: [
      {
        id: "target-gmt",
        collectionId: "collection-watches",
        label: "Travel watch",
        required: true,
        matchedItemProfileId: "profile-watch",
      },
      {
        id: "target-dress",
        collectionId: "collection-watches",
        label: "Dress watch",
        required: true,
        criteria: { tags: ["dress"] },
      },
    ],
    wishlistEntries: [
      {
        id: "wish-dress",
        collectionId: "collection-watches",
        targetId: "target-dress",
        label: "A simple dress watch",
        priority: "high",
        status: "researching",
        budget: { amountMinor: 500000, currency: "USD" },
      },
    ],
  });

  const completion = selectCollectionCompletion(
    state,
    "collection-watches",
  );
  const gaps = selectCollectionGaps(state, "collection-watches");

  assert.equal(completion.setPercent, 50);
  assert.equal(completion.percent, 88);
  assert.equal(gaps.openTargetCount, 1);
  assert.equal(gaps.targets[0].label, "Dress watch");
  assert.equal(gaps.openWishlistCount, 1);
  assert.equal(gaps.wishlist[0].budget.amountMinor, 500000);
});

test("collection gaps only suggest matching pieces already in the canonical collection", () => {
  const state = watchState({
    itemProfiles: [
      watchProfile(),
      watchProfile({
        id: "profile-dress",
        assetId: "asset-dress",
        identity: {
          displayName: "Dress watch",
          maker: "Grand Seiko",
          model: "Elegance",
        },
        tags: ["dress"],
      }),
      watchProfile({
        id: "profile-outsider",
        assetId: "asset-outsider",
        identity: {
          displayName: "Outside dress watch",
          maker: "Grand Seiko",
          model: "Elegance",
        },
        tags: ["dress"],
      }),
    ],
    memberships: [
      {
        id: "membership-watch",
        collectionId: "collection-watches",
        itemProfileId: "profile-watch",
        role: "owned",
      },
      {
        id: "membership-dress",
        collectionId: "collection-watches",
        itemProfileId: "profile-dress",
        role: "owned",
      },
    ],
    collectionTargets: [
      {
        id: "target-dress",
        collectionId: "collection-watches",
        label: "Dress watch",
        criteria: { tags: ["dress"] },
      },
    ],
  });

  const gaps = selectCollectionGaps(state, "collection-watches");

  assert.deepEqual(gaps.targets[0].candidateItemProfileIds, [
    "profile-dress",
  ]);
  assert.equal(
    gaps.targets[0].candidateItemProfileIds.includes("profile-outsider"),
    false,
  );
  assert.equal(gaps.targets[0].matchedItemProfileId, null);
});

test("exact private identifiers produce high-confidence duplicate candidates", () => {
  const state = watchState();
  const matches = detectLikelyDuplicates(
    state,
    watchProfile({
      id: "profile-import",
      assetId: "asset-import",
      identity: {
        displayName: "Imported GMT",
        maker: "Rolex",
        identifiers: [{ type: "serial", value: "9R4-X7P" }],
      },
    }),
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].itemProfileId, "profile-watch");
  assert.equal(matches[0].score, 0.98);
  assert.match(matches[0].reasons[0], /serial/i);
});

test("art title, maker, and edition can reveal a likely duplicate", () => {
  const state = normalizeCollectorState(
    {
      itemProfiles: [
        watchProfile({
          id: "profile-print",
          assetId: "asset-print",
          kind: "art",
          identity: {
            displayName: "Night Garden 7/25",
            maker: "Amina Noor",
            title: "Night Garden",
          },
          edition: {
            applicable: true,
            kind: "numbered",
            editionNumber: 7,
            editionSize: 25,
          },
          art: {
            title: "Night Garden",
            medium: "Screenprint",
          },
        }),
      ],
    },
    { now: NOW },
  );
  const matches = detectLikelyDuplicates(
    state,
    watchProfile({
      id: "profile-print-import",
      assetId: "asset-print-import",
      kind: "art",
      identity: {
        displayName: "Night Garden",
        maker: "Amina Noor",
        title: "Night Garden",
      },
      edition: {
        applicable: true,
        kind: "numbered",
        editionNumber: 7,
        editionSize: 25,
      },
      art: {
        title: "Night Garden",
        medium: "Screenprint",
      },
    }),
  );

  assert.equal(matches[0].score, 0.92);
  assert.match(matches[0].reasons[0], /edition/i);
});

test("different identity does not become a duplicate merely for sharing a category", () => {
  const matches = detectLikelyDuplicates(
    watchState(),
    watchProfile({
      id: "profile-other",
      assetId: "asset-other",
      identity: {
        displayName: "Field watch",
        maker: "Hamilton",
        model: "Khaki",
        reference: "H70455133",
      },
    }),
  );

  assert.deepEqual(matches, []);
});

test("duplicate groups report each pair only once", () => {
  const state = watchState({
    itemProfiles: [
      watchProfile(),
      watchProfile({
        id: "profile-watch-copy",
        assetId: "asset-watch-copy",
      }),
    ],
  });

  const groups = selectDuplicateGroups(state);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].itemProfileIds, [
    "profile-watch",
    "profile-watch-copy",
  ]);
});

test("collection health distinguishes care urgency from catalog completion", () => {
  const state = watchState({
    conditionReports: [
      {
        id: "condition-old",
        itemProfileId: "profile-watch",
        observedAt: "2024-01-01T00:00:00.000Z",
        grade: "needs-attention",
      },
    ],
    serviceEvents: [
      {
        id: "service-old",
        itemProfileId: "profile-watch",
        serviceAt: "2020-01-01T00:00:00.000Z",
        serviceType: "Full service",
        status: "completed",
        nextDueAt: "2025-01-01T00:00:00.000Z",
      },
    ],
    valuationObservations: [
      {
        id: "valuation-old",
        itemProfileId: "profile-watch",
        valuedAt: "2024-01-01T00:00:00.000Z",
        kind: "insurance",
        amount: { amountMinor: 1000000, currency: "USD" },
      },
    ],
  });

  const health = selectCollectionHealth(state, "collection-watches", {
    asOf: NOW,
  });

  assert.equal(health.status, "needs-care");
  assert.equal(health.atRiskConditionCount, 1);
  assert.equal(health.overdueServiceCount, 1);
  assert.equal(health.staleConditionCount, 1);
  assert.equal(health.staleValuationCount, 1);
  assert.equal(health.provenanceGapCount, 0);
  assert.ok(health.alerts.some((alert) => alert.priority === "urgent"));
});

test("unreviewed history does not satisfy provenance, condition, or service care", () => {
  const state = watchState({
    acquisitionEvents: [],
    provenanceEvents: [
      {
        id: "provenance-pending",
        itemProfileId: "profile-watch",
        happenedAt: NOW,
        title: "Pending provenance",
        verificationStatus: "unreviewed",
      },
    ],
    conditionReports: [
      {
        id: "condition-pending",
        itemProfileId: "profile-watch",
        observedAt: NOW,
        grade: "excellent",
        verificationStatus: "unreviewed",
      },
      {
        id: "condition-unknown",
        itemProfileId: "profile-watch",
        observedAt: NOW,
        grade: "unknown",
        verificationStatus: "reviewed-by-owner",
      },
    ],
    serviceEvents: [
      {
        id: "service-pending",
        itemProfileId: "profile-watch",
        serviceAt: NOW,
        serviceType: "Pending service document",
        status: "completed",
        verificationStatus: "unreviewed",
      },
    ],
  });

  const completion = selectCollectionCompletion(
    state,
    "collection-watches",
  );
  const health = selectCollectionHealth(state, "collection-watches", {
    asOf: NOW,
  });

  assert.equal(completion.dimensions.provenance.percent, 0);
  assert.equal(completion.dimensions.condition.percent, 0);
  assert.equal(completion.dimensions.care.percent, 0);
  assert.deepEqual(
    new Set(health.alerts.map((alert) => alert.kind)),
    new Set(["condition-review", "service-history", "provenance"]),
  );
});

test("an explicit next condition review date overrides the default interval", () => {
  const state = watchState({
    conditionReports: [
      {
        id: "condition-scheduled",
        itemProfileId: "profile-watch",
        observedAt: "2024-01-01T00:00:00.000Z",
        grade: "good",
        nextReviewAt: "2027-01-01T00:00:00.000Z",
      },
    ],
  });

  const health = selectCollectionHealth(state, "collection-watches", {
    asOf: NOW,
  });

  assert.equal(
    health.alerts.some((alert) => alert.kind === "condition-review"),
    false,
  );
});

test("health omits valuation and duplicate alerts until those flows can resolve them", () => {
  const state = watchState({
    itemProfiles: [
      watchProfile(),
      watchProfile({
        id: "profile-watch-copy",
        assetId: "asset-watch-copy",
      }),
    ],
    memberships: [
      {
        id: "membership-watch",
        collectionId: "collection-watches",
        itemProfileId: "profile-watch",
        role: "owned",
      },
      {
        id: "membership-watch-copy",
        collectionId: "collection-watches",
        itemProfileId: "profile-watch-copy",
        role: "owned",
      },
    ],
    valuationObservations: [
      {
        id: "valuation-old",
        itemProfileId: "profile-watch",
        valuedAt: "2020-01-01T00:00:00.000Z",
        kind: "insurance",
        amount: { amountMinor: 1000000, currency: "USD" },
      },
    ],
  });

  const health = selectCollectionHealth(state, "collection-watches", {
    asOf: NOW,
  });

  assert.equal(health.staleValuationCount > 0, true);
  assert.equal(health.possibleDuplicateCount, 1);
  assert.equal(
    health.alerts.some((alert) =>
      ["valuation-review", "possible-duplicate"].includes(alert.kind),
    ),
    false,
  );
});

test("a current, documented collection can be healthy without price gamification", () => {
  const health = selectCollectionHealth(
    watchState(),
    "collection-watches",
    { asOf: NOW },
  );

  assert.equal(health.status, "healthy");
  assert.equal(health.score, 100);
  assert.equal(health.alerts.length, 0);
});

test("private financial references fail closed when credentials are present", () => {
  const password = validatePrivateFinancialReference({
    id: "account-one",
    label: "Daily account",
    institution: "Example Bank",
    kind: "bank",
    password: "do-not-store",
  });
  const nestedSecret = validatePrivateFinancialReference({
    id: "account-two",
    label: "Brokerage",
    institution: "Example Broker",
    kind: "brokerage",
    recovery: { seedPhrase: "do not store" },
  });
  const accountNumber = validatePrivateFinancialReference({
    id: "account-three",
    label: "Savings",
    institution: "Example Bank",
    kind: "bank",
    accountNumber: "123456789012",
  });
  const disguisedPasswordKey = validatePrivateFinancialReference({
    id: "account-four",
    label: "Pension",
    institution: "Example Pension",
    kind: "pension",
    myPassword: "do-not-store",
  });

  assert.equal(password.valid, false);
  assert.match(password.errors.join(" "), /password/i);
  assert.equal(nestedSecret.valid, false);
  assert.match(nestedSecret.errors.join(" "), /seedPhrase/i);
  assert.equal(accountNumber.valid, false);
  assert.match(accountNumber.errors.join(" "), /accountNumber/i);
  assert.equal(disguisedPasswordKey.valid, false);
  assert.match(disguisedPasswordKey.errors.join(" "), /myPassword/i);
});

test("full account numbers and credential-bearing portal URLs are rejected", () => {
  const fullNumber = validatePrivateFinancialReference({
    id: "account-long",
    label: "Account 123456789012",
    institution: "Example Bank",
    kind: "bank",
  });
  const tokenUrl = validatePrivateFinancialReference({
    id: "account-url",
    label: "Brokerage",
    institution: "Example Broker",
    kind: "brokerage",
    portalUrl: "https://broker.example/account?access_token=secret",
  });

  assert.equal(fullNumber.valid, false);
  assert.match(fullNumber.errors.join(" "), /full account number/i);
  assert.equal(tokenUrl.valid, false);
  assert.match(tokenUrl.errors.join(" "), /query data/i);
});

test("valid financial references keep only a four-character hint and safe portal URL", () => {
  const state = normalizeCollectorState(
    {
      privateFinancialReferences: [
        {
          id: "account-safe",
          label: "Household brokerage",
          institution: "Example Broker",
          kind: "brokerage",
          accountEnding: "7x88",
          currency: "usd",
          portalUrl: "https://broker.example/overview?utm_source=continuity#top",
          visibility: "showcase",
          arbitrarySecretField: "silently not part of the model",
        },
      ],
    },
    { now: NOW },
  );

  assert.equal(state.privateFinancialReferences.length, 1);
  const account = state.privateFinancialReferences[0];
  assert.equal(account.accountEnding, "7X88");
  assert.equal(account.currency, "USD");
  assert.equal(account.portalUrl, "https://broker.example/overview");
  assert.equal(account.visibility, "private");
  assert.equal("arbitrarySecretField" in account, false);
});

test("invalid financial upserts cannot erase or replace a valid reference", () => {
  const initial = normalizeCollectorState(
    {
      privateFinancialReferences: [
        {
          id: "account-safe",
          label: "Household brokerage",
          institution: "Example Broker",
          kind: "brokerage",
          accountEnding: "7788",
        },
      ],
    },
    { now: NOW },
  );
  const next = collectorReducer(initial, {
    type: "UPSERT_PRIVATE_FINANCIAL_REFERENCE",
    now: NOW,
    financialReference: {
      id: "account-safe",
      password: "unsafe",
    },
  });

  assert.deepEqual(
    next.privateFinancialReferences,
    initial.privateFinancialReferences,
  );
});

test("investment references are private pointers, not access credentials", () => {
  const invalid = validateInvestmentReference({
    id: "investment-invalid",
    label: "Private fund",
    assetClass: "fund",
    apiKey: "unsafe",
  });
  const state = normalizeCollectorState(
    {
      privateFinancialReferences: [
        {
          id: "account-safe",
          label: "Brokerage",
          institution: "Example Broker",
          kind: "brokerage",
          accountEnding: "7788",
        },
      ],
      investmentReferences: [
        {
          id: "investment-fund",
          accountReferenceId: "account-safe",
          label: "Global index fund",
          assetClass: "fund",
          ticker: "vwra",
          quantity: 12.5,
          quantityUnit: "shares",
          visibility: "showcase",
        },
      ],
    },
    { now: NOW },
  );

  assert.equal(invalid.valid, false);
  assert.equal(state.investmentReferences.length, 1);
  assert.equal(
    state.investmentReferences[0].accountReferenceId,
    "account-safe",
  );
  assert.equal(state.investmentReferences[0].ticker, "VWRA");
  assert.equal(state.investmentReferences[0].visibility, "private");
  assert.equal("password" in state.investmentReferences[0], false);
});

test("living people require explicit consent before appearing in a memory showcase", () => {
  const state = normalizeCollectorState(
    {
      collections: [
        baseCollection({
          id: "collection-memories",
          name: "Family memories",
          kind: "memory",
          showcase: {
            visibility: "showcase",
            slug: "family-memories",
          },
          curation: {
            coverItemProfileId: "profile-memory",
            featuredItemProfileIds: ["profile-memory"],
          },
        }),
      ],
      itemProfiles: [
        watchProfile({
          id: "profile-memory",
          assetId: "asset-memory",
          kind: "memory",
          identity: {
            displayName: "Friday kitchen notebook",
            title: "Kitchen notebook",
          },
          privacy: {
            showcaseEligible: true,
            showStory: true,
            showPeople: true,
          },
          edition: { applicable: false, kind: "not-applicable" },
          story: {
            headline: "Recipes and handwriting",
            publicExcerpt: "A notebook used at every Friday lunch.",
          },
        }),
      ],
      memberships: [
        {
          id: "membership-memory",
          collectionId: "collection-memories",
          itemProfileId: "profile-memory",
          showcase: true,
        },
      ],
      people: [
        {
          id: "person-living",
          displayName: "Living relative private name",
          publicLabel: "A family member",
          livingStatus: "living",
          consentState: "declined",
          showInShowcase: true,
        },
        {
          id: "person-grandmother",
          displayName: "Mariam",
          publicLabel: "Grandmother Mariam",
          livingStatus: "deceased",
          consentState: "not-applicable",
          showInShowcase: true,
        },
      ],
      memoryPersonLinks: [
        {
          id: "link-living",
          itemProfileId: "profile-memory",
          personId: "person-living",
          roleLabel: "Relative",
          publicSummary: "We cooked together.",
          showInShowcase: true,
        },
        {
          id: "link-grandmother",
          itemProfileId: "profile-memory",
          personId: "person-grandmother",
          roleLabel: "Grandmother",
          publicSummary: "Her recipes remain in the margins.",
          showInShowcase: true,
        },
      ],
    },
    { now: NOW },
  );

  const projection = projectItemForShowcase(state, "profile-memory", {
    collectionId: "collection-memories",
  });

  assert.deepEqual(projection.people, [
    {
      name: "Grandmother Mariam",
      relationship: "Grandmother",
      memory: "Her recipes remain in the margins.",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(projection), /Living relative private name/);
});

test("unknown living status stays private even with a deliberate public label", () => {
  const state = normalizeCollectorState(
    {
      collections: [
        baseCollection({
          id: "collection-unknown-memory",
          name: "Private family memory",
          kind: "memory",
          showcase: {
            visibility: "showcase",
            slug: "private-family-memory",
          },
        }),
      ],
      itemProfiles: [
        watchProfile({
          id: "profile-unknown-memory",
          assetId: "asset-unknown-memory",
          kind: "memory",
          privacy: {
            showcaseEligible: true,
            showStory: true,
            showPeople: true,
          },
        }),
      ],
      memberships: [
        {
          id: "membership-unknown-memory",
          collectionId: "collection-unknown-memory",
          itemProfileId: "profile-unknown-memory",
          showcase: true,
        },
      ],
      people: [
        {
          id: "person-unknown",
          displayName: "Private unknown-status name",
          publicLabel: "A family friend",
          livingStatus: "unknown",
          consentState: "granted",
          showInShowcase: true,
        },
      ],
      memoryPersonLinks: [
        {
          id: "link-unknown",
          itemProfileId: "profile-unknown-memory",
          personId: "person-unknown",
          roleLabel: "Family friend",
          publicSummary: "A deliberately public memory summary.",
          showInShowcase: true,
        },
      ],
    },
    { now: NOW },
  );

  const projection = projectItemForShowcase(
    state,
    "profile-unknown-memory",
    { collectionId: "collection-unknown-memory" },
  );

  assert.deepEqual(projection.people, []);
  assert.doesNotMatch(
    JSON.stringify(projection),
    /Private unknown-status name|A family friend|deliberately public/i,
  );
});

test("canonical person and memory-link upserts plus unlink are idempotent", () => {
  const initial = normalizeCollectorState(
    {
      itemProfiles: [
        watchProfile({
          id: "profile-idempotent-memory",
          assetId: "asset-idempotent-memory",
          kind: "memory",
        }),
      ],
    },
    { now: NOW },
  );
  const upsertPerson = {
    type: "UPSERT_PERSON",
    now: NOW,
    person: {
      id: "person-idempotent",
      displayName: "Mariam",
      relationship: "Grandmother",
      livingStatus: "deceased",
      consentState: "not-applicable",
      showInShowcase: true,
      publicLabel: "Grandmother Mariam",
    },
  };
  const withPerson = collectorReducer(initial, upsertPerson);
  const withPersonAgain = collectorReducer(withPerson, upsertPerson);

  assert.equal(withPersonAgain.people.length, 1);
  assert.deepEqual(withPersonAgain, withPerson);

  const upsertLink = {
    type: "UPSERT_MEMORY_PERSON_LINK",
    now: NOW,
    link: {
      id: "link-idempotent",
      itemProfileId: "profile-idempotent-memory",
      personId: "person-idempotent",
      relationshipType: "inherited-from",
      roleLabel: "Grandmother",
      memorySummary: "Her notebook.",
      publicSummary: "A family notebook.",
      showInShowcase: true,
    },
  };
  const withLink = collectorReducer(withPersonAgain, upsertLink);
  const withLinkAgain = collectorReducer(withLink, upsertLink);

  assert.equal(withLinkAgain.memoryPersonLinks.length, 1);
  assert.deepEqual(withLinkAgain, withLink);

  const unlink = {
    type: "UNLINK_MEMORY_PERSON",
    now: NOW,
    linkId: "link-idempotent",
  };
  const unlinked = collectorReducer(withLinkAgain, unlink);
  const unlinkedAgain = collectorReducer(unlinked, unlink);

  assert.deepEqual(unlinked.memoryPersonLinks, []);
  assert.deepEqual(unlinkedAgain, unlinked);
});

test("art profiles retain creator, exhibition, and conservation history", () => {
  const state = normalizeCollectorState(
    {
      collections: [
        baseCollection({
          id: "collection-art",
          name: "Contemporary art",
          kind: "art",
          showcase: {
            visibility: "showcase",
            slug: "contemporary-art",
            theme: "gallery",
          },
          curation: {
            coverItemProfileId: "profile-art",
            featuredItemProfileIds: ["profile-art"],
          },
        }),
      ],
      itemProfiles: [
        watchProfile({
          id: "profile-art",
          assetId: "asset-art",
          kind: "art",
          identity: {
            displayName: "Night Garden VII",
            maker: "Amina Noor",
            title: "Night Garden",
          },
          edition: {
            applicable: true,
            kind: "numbered",
            editionNumber: 7,
            editionSize: 25,
          },
          art: {
            creatorIds: ["creator-amina"],
            title: "Night Garden",
            medium: "Screenprint",
            support: "Cotton paper",
            creationYear: 2019,
            dimensions: { height: 70, width: 50, unit: "cm" },
            signature: "signed",
          },
          privacy: {
            showcaseEligible: true,
            showStory: true,
            showCondition: true,
            showEdition: true,
            showArtHistory: true,
          },
        }),
      ],
      memberships: [
        {
          id: "membership-art",
          collectionId: "collection-art",
          itemProfileId: "profile-art",
          showcase: true,
        },
      ],
      artCreators: [
        {
          id: "creator-amina",
          displayName: "Amina Noor",
          birthYear: 1987,
          nationality: "Qatari",
          publicBio: "Known for layered botanical prints.",
        },
      ],
      conditionReports: [
        {
          id: "condition-art",
          itemProfileId: "profile-art",
          observedAt: "2026-05-01T00:00:00.000Z",
          grade: "excellent",
          privacy: "showcase",
          publicSummary: "Excellent, stable condition.",
        },
      ],
      exhibitionEvents: [
        {
          id: "exhibition-art",
          itemProfileId: "profile-art",
          exhibitionName: "After Rain",
          venueLabel: "Museum of Modern Art",
          city: "Doha",
          country: "Qatar",
          openedAt: "2020-02-01T00:00:00.000Z",
          catalogueReference: "Private catalogue inventory 771",
          publicSummary: "Shown in the artist's 2020 group exhibition.",
          showInShowcase: true,
        },
      ],
      conservationEvents: [
        {
          id: "conservation-art",
          itemProfileId: "profile-art",
          treatedAt: "2025-02-01T00:00:00.000Z",
          treatmentType: "Paper review",
          conservatorLabel: "Private conservator",
          treatmentSummary: "Private treatment detail",
          publicSummary: "Professionally reviewed and stabilized.",
          showInShowcase: true,
        },
      ],
    },
    { now: NOW },
  );

  const projection = projectItemForShowcase(state, "profile-art", {
    collectionId: "collection-art",
  });

  assert.equal(projection.edition, "7 of 25");
  assert.equal(projection.art.creators[0].name, "Amina Noor");
  assert.equal(projection.art.medium, "Screenprint");
  assert.equal(projection.art.exhibitions[0].name, "After Rain");
  assert.equal(
    projection.art.conservation[0].summary,
    "Professionally reviewed and stabilized.",
  );
  assert.doesNotMatch(JSON.stringify(projection), /Private conservator/);
  assert.doesNotMatch(JSON.stringify(projection), /inventory 771/);
});

test("showcase projection is an allowlist that excludes private value, location, parties, and originals", () => {
  const state = watchState({
    privateFinancialReferences: [
      {
        id: "account-private",
        label: "Private brokerage",
        institution: "Example Broker",
        kind: "brokerage",
        accountEnding: "7788",
      },
    ],
  });

  const item = projectItemForShowcase(state, "profile-watch", {
    collectionId: "collection-watches",
  });
  const collection = projectCollectionForShowcase(
    state,
    "collection-watches",
  );
  const serialized = JSON.stringify({ item, collection });

  assert.equal(collection.title, "Time, kept");
  assert.equal(collection.items.length, 1);
  assert.match(serialized, /media-public-watch/);
  for (const privateValue of [
    "asset-watch",
    "profile-watch",
    "9R4X7P",
    "media-original-watch",
    "receipt-private",
    "Exact private address",
    "Private seller",
    "1500000",
    "1800000",
    "account-private",
    "7788",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(privateValue));
  }
});

test("private or ineligible collections cannot produce a showcase projection", () => {
  const privateState = watchState({
    collections: [
      baseCollection({
        showcase: { visibility: "private" },
      }),
    ],
  });
  const ineligibleState = watchState({
    itemProfiles: [
      watchProfile({
        privacy: { showcaseEligible: false },
      }),
    ],
  });

  assert.equal(
    projectCollectionForShowcase(privateState, "collection-watches"),
    null,
  );
  assert.equal(
    projectCollectionForShowcase(
      ineligibleState,
      "collection-watches",
    ).items.length,
    0,
  );
});

test("pride summary celebrates care and story rather than monetary value", () => {
  const summary = selectCollectionPrideSummary(
    watchState(),
    "collection-watches",
  );
  const serialized = JSON.stringify(summary);

  assert.equal(summary.itemCount, 1);
  assert.equal(summary.storyCount, 1);
  assert.equal(summary.publicReadyCount, 1);
  assert.equal(summary.collectingSince, "2020-01-02T00:00:00.000Z");
  assert.ok(summary.milestones.some((item) => item.kind === "stories"));
  assert.doesNotMatch(serialized, /amount|value|1500000|1800000/i);
});
