import assert from "node:assert/strict";
import test from "node:test";

import {
  collectorProfileIdForAsset,
} from "../src/collectorWorkspace.js";
import {
  selectCollectionCompletion,
  selectCollectionHealth,
} from "../src/collectorDomain.js";
import {
  createSampleWorkspace,
  selectCollectionSummary,
  workspaceReducer,
} from "../src/domain.js";

const NOW = "2026-07-25T12:00:00.000Z";

test("the canonical workspace carries a reconciled collector state", () => {
  const workspace = createSampleWorkspace();
  const artCollection = workspace.collector.collections.find(
    (collection) => collection.id === "collection-art",
  );
  const artProfile = workspace.collector.itemProfiles.find(
    (profile) => profile.assetId === "desert-light-study",
  );
  const membership = workspace.collector.memberships.find(
    (item) =>
      item.collectionId === "collection-art" &&
      item.itemProfileId === artProfile.id,
  );

  assert.equal(artCollection.kind, "art");
  assert.equal(
    artProfile.id,
    collectorProfileIdForAsset("desert-light-study"),
  );
  assert.equal(artProfile.kind, "art");
  assert.equal(artProfile.edition.editionNumber, 7);
  assert.equal(artProfile.edition.editionSize, 25);
  assert.ok(membership);
});

test("collector care history and targets persist through workspace commands", () => {
  const initial = createSampleWorkspace();
  const itemProfileId = collectorProfileIdForAsset("gmt-master-ii");
  const report = {
    id: "condition-gmt-2026-07",
    itemProfileId,
    observedAt: NOW,
    grade: "excellent",
    summary: "Case, crystal, and bracelet reviewed.",
    privacy: "private",
  };
  const target = {
    id: "target-watch-independent",
    collectionId: "collection-watches",
    label: "Independent watch with a documented service history",
    priority: "high",
    required: true,
    criteria: { tags: ["watch"] },
    status: "open",
  };

  const withReport = workspaceReducer(initial, {
    type: "APPLY_COLLECTOR_COMMAND",
    command: { type: "APPEND_CONDITION_REPORT", report },
    now: NOW,
  });
  const withTarget = workspaceReducer(withReport, {
    type: "APPLY_COLLECTOR_COMMAND",
    command: { type: "UPSERT_COLLECTION_TARGET", target },
    now: "2026-07-25T12:01:00.000Z",
  });
  const repeated = workspaceReducer(withTarget, {
    type: "APPLY_COLLECTOR_COMMAND",
    command: { type: "APPEND_CONDITION_REPORT", report },
    now: "2026-07-25T12:02:00.000Z",
  });

  assert.equal(
    repeated.collector.conditionReports.filter(
      (item) => item.id === report.id,
    ).length,
    1,
  );
  assert.equal(
    repeated.collector.collectionTargets.find(
      (item) => item.id === target.id,
    ).label,
    target.label,
  );
  assert.equal(
    selectCollectionSummary(repeated, "collection-watches").assetCount,
    1,
  );
});

test("simple collection membership remains authoritative for collector memberships", () => {
  const initial = createSampleWorkspace();
  const removed = workspaceReducer(initial, {
    type: "REMOVE_COLLECTION_MEMBER",
    collectionId: "collection-cameras",
    assetId: "leica-q3",
    now: NOW,
  });
  const itemProfileId = collectorProfileIdForAsset("leica-q3");

  assert.equal(
    removed.collector.memberships.some(
      (membership) =>
        membership.collectionId === "collection-cameras" &&
        membership.itemProfileId === itemProfileId,
    ),
    false,
  );
});

test("pending service material stays unreviewed until evidence verification promotes it", () => {
  const initial = createSampleWorkspace();
  const itemProfileId = collectorProfileIdForAsset("gmt-master-ii");
  const withPending = workspaceReducer(initial, {
    type: "ADD_EVIDENCE",
    evidence: {
      id: "evidence-gmt-service-reviewed-later",
      assetId: "gmt-master-ii",
      type: "Service record",
      relation: "service-maintenance",
      fileName: "service.pdf",
      fileType: "application/pdf",
      fileSize: 128,
      fileChecksum: "a".repeat(64),
      fileState: "ready_local",
    },
    now: NOW,
  });
  const pendingEvent = withPending.collector.serviceEvents.find(
    (event) => event.id ===
      "collector-service-evidence-gmt-service-reviewed-later",
  );

  assert.equal(pendingEvent.itemProfileId, itemProfileId);
  assert.equal(pendingEvent.status, "planned");
  assert.equal(pendingEvent.verificationStatus, "unreviewed");
  assert.equal(
    selectCollectionCompletion(
      withPending.collector,
      "collection-watches",
    ).dimensions.care.percent,
    0,
  );
  assert.equal(
    selectCollectionHealth(
      withPending.collector,
      "collection-watches",
      { asOf: NOW },
    ).alerts.some((alert) => alert.kind === "service-history"),
    true,
  );

  const verified = workspaceReducer(withPending, {
    type: "VERIFY_EVIDENCE",
    evidenceId: "evidence-gmt-service-reviewed-later",
    integrityVerified: true,
    integrityChecksum: "a".repeat(64),
    now: "2026-07-25T12:05:00.000Z",
  });
  const verifiedEvent = verified.collector.serviceEvents.find(
    (event) => event.id ===
      "collector-service-evidence-gmt-service-reviewed-later",
  );

  assert.equal(verifiedEvent.status, "completed");
  assert.equal(verifiedEvent.verificationStatus, "reviewed-by-owner");
  assert.equal(
    selectCollectionCompletion(
      verified.collector,
      "collection-watches",
    ).dimensions.care.percent,
    100,
  );
});

test("a standalone legacy memory seeds a canonical private profile, people, and links", () => {
  const initial = createSampleWorkspace();
  const assetId = "standalone-story-memory";
  const added = workspaceReducer(initial, {
    type: "ADD_ASSET",
    asset: {
      id: assetId,
      name: "The blue-kitchen story",
      categoryId: "legacy.story-memory",
      kind: "memory",
      locationMode: "not-applicable",
      meaningFacets: ["memory"],
      sentimentalValue: "A family story that should not be lost.",
      profile: {
        people: "Family, Layla and Noor",
        story: "A remembered afternoon in the blue kitchen.",
        "memory-subject": "story",
      },
    },
    now: NOW,
  });
  const itemProfileId = collectorProfileIdForAsset(assetId);
  const profile = added.collector.itemProfiles.find(
    (item) => item.id === itemProfileId,
  );
  const links = added.collector.memoryPersonLinks.filter(
    (link) => link.itemProfileId === itemProfileId,
  );
  const linkedPeople = links
    .map((link) =>
      added.collector.people.find((person) => person.id === link.personId),
    )
    .filter(Boolean);

  assert.ok(profile);
  assert.equal(profile.assetId, assetId);
  assert.equal(profile.kind, "memory");
  assert.equal(profile.privacy.showPeople, false);
  assert.equal(
    added.collections.some((collection) =>
      collection.assetIds.includes(assetId),
    ),
    false,
  );
  assert.deepEqual(
    linkedPeople.map((person) => person.displayName).sort(),
    ["Layla", "Noor"],
  );
  assert.ok(
    linkedPeople.every(
      (person) =>
        person.livingStatus === "unknown" &&
        person.consentState === "not-requested" &&
        person.showInShowcase === false &&
        person.publicLabel === null,
    ),
  );
  assert.ok(
    links.every(
      (link) =>
        link.id.startsWith("collector-memory-link-legacy-") &&
        link.showInShowcase === false &&
        link.publicSummary === null,
    ),
  );

  const reconciledAgain = workspaceReducer(added, {
    type: "UPDATE_ASSET",
    assetId,
    changes: {
      notes: "The story was reviewed without changing who is linked.",
    },
    now: "2026-07-25T14:05:00.000Z",
  });
  const repeatedLinks = reconciledAgain.collector.memoryPersonLinks.filter(
    (link) => link.itemProfileId === itemProfileId,
  );

  assert.equal(repeatedLinks.length, 2);
  assert.deepEqual(
    repeatedLinks.map((link) => link.id).sort(),
    links.map((link) => link.id).sort(),
  );

  const canonicallyReviewed = workspaceReducer(reconciledAgain, {
    type: "UPDATE_ASSET",
    assetId,
    changes: {
      profile: {
        ...reconciledAgain.assets.find((asset) => asset.id === assetId)
          .profile,
        people: "",
        "people-model": "canonical-v1",
      },
    },
    now: "2026-07-25T14:10:00.000Z",
  });
  const refreshed = workspaceReducer(canonicallyReviewed, {
    type: "UPDATE_ASSET",
    assetId,
    changes: { notes: "Refreshed after reviewed unlink." },
    now: "2026-07-25T14:15:00.000Z",
  });

  assert.equal(
    refreshed.collector.memoryPersonLinks.filter(
      (link) => link.itemProfileId === itemProfileId,
    ).length,
    0,
  );
  assert.ok(
    refreshed.collector.people.some(
      (person) => person.displayName === "Layla",
    ),
  );
});
