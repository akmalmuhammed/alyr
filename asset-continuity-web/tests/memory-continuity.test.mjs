import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMemoryPeopleCommands,
  memoryCaptureStages,
  memoryPeopleLabel,
  memorySubjectTypeForAsset,
  memorySubjectUsesPhysicalLocation,
  normalizeMemoryCaptureDraftForm,
  parseLegacyMemoryPeople,
  validateMemoryPeopleEntries,
  validateMemorySubjectDetails,
} from "../src/memoryContinuity.js";
import { collectorProfileIdForAsset } from "../src/collectorWorkspace.js";

const NOW = "2026-07-25T14:00:00.000Z";

test("legacy people parsing removes generic labels and deduplicates names", () => {
  const entries = parseLegacyMemoryPeople(
    "Family, Mariam and mariam, Friends, Yusuf, unknown",
  );

  assert.deepEqual(
    entries.map((entry) => entry.displayName),
    ["Mariam", "Yusuf"],
  );
  assert.ok(
    entries.every(
      (entry) =>
        entry.livingStatus === "unknown" &&
        entry.consentState === "not-requested" &&
        entry.showInShowcase === false,
    ),
  );
  assert.equal(memoryPeopleLabel(entries), "Mariam and Yusuf");
});

test("only a physical memory enters the location stage", () => {
  assert.deepEqual(memoryCaptureStages("physical"), [
    "identity",
    "location",
    "materials",
  ]);
  for (const subjectType of ["story", "person", "moment", ""]) {
    assert.deepEqual(memoryCaptureStages(subjectType), [
      "identity",
      "materials",
    ]);
    assert.equal(
      memorySubjectUsesPhysicalLocation(subjectType),
      false,
    );
  }
  assert.equal(memorySubjectUsesPhysicalLocation("physical"), true);
  assert.equal(
    memorySubjectTypeForAsset({
      kind: "memory",
      locationMode: "physical",
      profile: {},
    }),
    "physical",
  );
  assert.equal(
    memorySubjectTypeForAsset({
      kind: "memory",
      locationMode: "not-applicable",
      profile: { "memory-subject": "moment" },
    }),
    "moment",
  );
});

test("person memories require one valid primary person while other memory subjects do not", () => {
  assert.match(
    validateMemorySubjectDetails("person", []),
    /primary person/i,
  );
  assert.match(
    validateMemorySubjectDetails("person", [
      {
        displayName: "",
      },
    ]),
    /add a name/i,
  );
  assert.equal(
    validateMemorySubjectDetails("person", [
      {
        displayName: "Mariam",
        livingStatus: "unknown",
        consentState: "not-requested",
        showInShowcase: false,
      },
    ]),
    "",
  );
  for (const subjectType of ["physical", "story", "moment"]) {
    assert.equal(validateMemorySubjectDetails(subjectType, []), "");
  }
});

test("legacy memory drafts promote origin, period, and people into canonical fields", () => {
  const normalized = normalizeMemoryCaptureDraftForm(
    {
      profile: {
        origin: "Made by Mariam",
        "date-period": "Childhood · 1999",
        people: "Mariam and Yusuf",
        story: "The original words remain.",
      },
      memoryOrigin: "",
      memoryPeriod: "",
      memoryPeopleEntries: [],
    },
    { preferLegacyProfile: true },
  );

  assert.equal(normalized.memoryOrigin, "Made by Mariam");
  assert.equal(normalized.memoryPeriod, "Childhood · 1999");
  assert.deepEqual(
    normalized.memoryPeopleEntries.map((entry) => entry.displayName),
    ["Mariam", "Yusuf"],
  );
  assert.deepEqual(normalized.profile, {
    story: "The original words remain.",
  });
});

test("showcase selection requires a deliberate public label", () => {
  const error = validateMemoryPeopleEntries([
    {
      displayName: "Sara",
      livingStatus: "living",
      consentState: "granted",
      showInShowcase: true,
      publicLabel: "",
    },
  ]);

  assert.match(error, /public label/i);
});

test("unknown living status fails closed even when a public label is supplied", () => {
  const result = buildMemoryPeopleCommands({
    workspace: {
      collector: {
        people: [],
        memoryPersonLinks: [],
      },
    },
    assetId: "memory-unknown",
    entries: [
      {
        displayName: "Private full name",
        relationship: "Family friend",
        relationshipType: "shared-memory",
        roleLabel: "Family friend",
        memorySummary: "A private memory.",
        livingStatus: "unknown",
        consentState: "granted",
        showInShowcase: true,
        publicLabel: "A family friend",
      },
    ],
    now: NOW,
    idFactory: (prefix) => `${prefix}-one`,
  });

  assert.equal(result.error, "");
  const person = result.commands.find(
    (command) => command.type === "UPSERT_PERSON",
  ).person;
  const link = result.commands.find(
    (command) => command.type === "UPSERT_MEMORY_PERSON_LINK",
  ).link;
  const profile = result.commands.find(
    (command) => command.type === "UPSERT_ITEM_PROFILE",
  ).itemProfile;

  assert.equal(person.livingStatus, "unknown");
  assert.equal(person.consentState, "not-requested");
  assert.equal(person.showInShowcase, false);
  assert.equal(person.publicLabel, null);
  assert.equal(link.showInShowcase, false);
  assert.equal(link.publicSummary, null);
  assert.equal(profile.privacy.showPeople, false);
});

test("memory people commands reuse canonical people, expose only granted labels, and unlink removed relationships", () => {
  const itemProfileId = collectorProfileIdForAsset("memory-sara");
  const workspace = {
    collector: {
      people: [
        {
          id: "person-sara",
          displayName: "Sara",
          livingStatus: "living",
          consentState: "not-requested",
          showInShowcase: false,
          publicLabel: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      memoryPersonLinks: [
        {
          id: "link-removed",
          itemProfileId,
          personId: "person-no-longer-linked",
        },
      ],
    },
  };
  const result = buildMemoryPeopleCommands({
    workspace,
    assetId: "memory-sara",
    entries: [
      {
        displayName: "Sara",
        relationship: "Cousin",
        relationshipType: "photographed-with",
        roleLabel: "Cousin",
        memorySummary: "We took the photograph together.",
        livingStatus: "living",
        consentState: "granted",
        showInShowcase: true,
        publicLabel: "A cousin",
      },
    ],
    now: NOW,
    idFactory: (prefix) => `${prefix}-created`,
  });

  assert.equal(result.error, "");
  assert.equal(result.peopleLabel, "Sara");
  const personCommand = result.commands.find(
    (command) => command.type === "UPSERT_PERSON",
  );
  const linkCommand = result.commands.find(
    (command) => command.type === "UPSERT_MEMORY_PERSON_LINK",
  );

  assert.equal(personCommand.person.id, "person-sara");
  assert.equal(personCommand.person.showInShowcase, true);
  assert.equal(personCommand.person.publicLabel, "A cousin");
  assert.equal(linkCommand.link.itemProfileId, itemProfileId);
  assert.equal(linkCommand.link.personId, "person-sara");
  assert.equal(linkCommand.link.showInShowcase, true);
  assert.equal(
    linkCommand.link.publicSummary,
    "We took the photograph together.",
  );
  assert.ok(
    result.commands.some(
      (command) =>
        command.type === "UNLINK_MEMORY_PERSON" &&
        command.linkId === "link-removed",
    ),
  );
  assert.equal(
    result.commands.find(
      (command) => command.type === "UPSERT_ITEM_PROFILE",
    ).itemProfile.privacy.showPeople,
    true,
  );
});

test("ambiguous same-name people are never silently merged", () => {
  const result = buildMemoryPeopleCommands({
    workspace: {
      collector: {
        people: [
          {
            id: "person-mohammed-uncle",
            displayName: "Mohammed",
            relationship: "Uncle",
          },
          {
            id: "person-mohammed-friend",
            displayName: "Mohammed",
            relationship: "Family friend",
          },
        ],
        memoryPersonLinks: [],
      },
    },
    assetId: "memory-mohammed",
    entries: [
      {
        displayName: "Mohammed",
        relationship: "Neighbour",
        livingStatus: "unknown",
        consentState: "not-requested",
        relationshipType: "shared-memory",
        showInShowcase: false,
      },
    ],
    now: NOW,
    idFactory: (prefix) => `${prefix}-new-distinct-record`,
  });

  const person = result.commands.find(
    (command) => command.type === "UPSERT_PERSON",
  ).person;
  assert.equal(person.id, "person-new-distinct-record");
  assert.equal(person.relationship, "Neighbour");
});
