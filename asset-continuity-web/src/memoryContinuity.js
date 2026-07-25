import { collectorProfileIdForAsset } from "./collectorWorkspace.js";

const GENERIC_PEOPLE_LABELS = new Set([
  "family",
  "friends",
  "others",
  "everyone",
  "unknown",
]);

const MEMORY_SUBJECT_TYPES = new Set([
  "physical",
  "story",
  "person",
  "moment",
]);

const RELATIONSHIP_TYPES = new Set([
  "owned-by",
  "made-by",
  "given-by",
  "inherited-from",
  "shared-memory",
  "photographed-with",
  "other",
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedName(value) {
  return text(value).toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function createLocalId(prefix) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function safeLivingStatus(value) {
  return ["living", "deceased", "unknown"].includes(value)
    ? value
    : "unknown";
}

function safeConsentState(value, livingStatus) {
  if (livingStatus === "deceased") return "not-applicable";
  if (livingStatus !== "living") return "not-requested";
  return ["not-requested", "granted", "declined"].includes(value)
    ? value
    : "not-requested";
}

function safeRelationshipType(value) {
  return RELATIONSHIP_TYPES.has(value) ? value : "shared-memory";
}

function personCanEnterShowcase(person) {
  return (
    person.livingStatus === "deceased" ||
    (person.livingStatus === "living" &&
      person.consentState === "granted")
  );
}

function entryFromPerson(person, link = {}) {
  const livingStatus = safeLivingStatus(person?.livingStatus);
  const consentState = safeConsentState(
    person?.consentState,
    livingStatus,
  );
  return {
    entryId: link.id || person?.id || createLocalId("memory-person"),
    personId: person?.id || null,
    linkId: link.id || null,
    displayName: text(person?.displayName),
    relationship: text(person?.relationship),
    livingStatus,
    consentState,
    relationshipType: safeRelationshipType(link.relationshipType),
    roleLabel: text(link.roleLabel),
    memorySummary: text(link.memorySummary),
    showInShowcase:
      personCanEnterShowcase({ livingStatus, consentState }) &&
      person?.showInShowcase === true &&
      link.showInShowcase === true,
    publicLabel: text(person?.publicLabel),
  };
}

export function parseLegacyMemoryPeople(value) {
  const names = text(value)
    .split(/,| and /i)
    .map((name) => name.trim())
    .filter(
      (name) =>
        name &&
        !GENERIC_PEOPLE_LABELS.has(name.toLocaleLowerCase("en")),
    );
  const seen = new Set();
  return names
    .filter((name) => {
      const key = normalizedName(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((displayName, index) => ({
      ...entryFromPerson({
        displayName,
        livingStatus: "unknown",
        consentState: "not-requested",
      }),
      entryId: `legacy-memory-person-${index}-${normalizedName(displayName).replace(/[^a-z0-9]+/g, "-")}`,
    }));
}

export function memorySubjectTypeForAsset(asset, captureIntent = "") {
  const explicit = text(asset?.profile?.["memory-subject"]);
  if (MEMORY_SUBJECT_TYPES.has(explicit)) return explicit;
  if (asset?.locationMode === "physical") return "physical";
  if (asset?.kind === "memory" || captureIntent === "memory") {
    return asset ? "story" : "";
  }
  return "physical";
}

export function memorySubjectUsesPhysicalLocation(subjectType) {
  return subjectType === "physical";
}

export function memoryCaptureStages(subjectType) {
  return memorySubjectUsesPhysicalLocation(subjectType)
    ? ["identity", "location", "materials"]
    : ["identity", "materials"];
}

export function selectMemoryPeopleForAsset(workspace, assetId) {
  const asset = workspace?.assets?.find((item) => item.id === assetId);
  if (!asset) return [];
  const collector = workspace.collector;
  const itemProfileId = collectorProfileIdForAsset(assetId);
  const personById = new Map(
    (collector?.people || []).map((person) => [person.id, person]),
  );
  const linked = (collector?.memoryPersonLinks || [])
    .filter((link) => link.itemProfileId === itemProfileId)
    .map((link) => {
      const person = personById.get(link.personId);
      return person ? entryFromPerson(person, link) : null;
    })
    .filter(Boolean);
  return linked.length
    ? linked
    : parseLegacyMemoryPeople(asset.profile?.people);
}

export function memoryPeopleLabel(entries) {
  const names = entries.map((entry) => text(entry.displayName)).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function normalizeMemoryCaptureDraftForm(
  form,
  { preferLegacyProfile = false } = {},
) {
  const source = form && typeof form === "object" ? form : {};
  const profile = {
    ...(source.profile && typeof source.profile === "object"
      ? source.profile
      : {}),
  };
  const currentEntries = Array.isArray(source.memoryPeopleEntries)
    ? source.memoryPeopleEntries
    : [];
  const normalized = {
    ...source,
    profile,
    memoryPeopleEntries: currentEntries,
  };

  if (preferLegacyProfile) {
    if (!text(normalized.memoryPeriod) && text(profile["date-period"])) {
      normalized.memoryPeriod = text(profile["date-period"]);
    }
    if (!text(normalized.memoryOrigin) && text(profile.origin)) {
      normalized.memoryOrigin = text(profile.origin);
    }
    if (!currentEntries.length) {
      normalized.memoryPeopleEntries = parseLegacyMemoryPeople(
        profile.people || source.memoryPeople,
      );
    }
  }

  delete profile.origin;
  delete profile["date-period"];
  delete profile.people;
  return normalized;
}

export function validateMemoryPeopleEntries(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const name = text(entry.displayName);
    if (!name) return "Add a name or remove the empty person.";
    const key = normalizedName(name);
    if (seen.has(key)) {
      return `${name} is listed twice. Keep one person record and add the different memory relationship there.`;
    }
    seen.add(key);
    if (entry.showInShowcase === true && !text(entry.publicLabel)) {
      return `Add a deliberate public label for ${name}, or keep this person private.`;
    }
  }
  return "";
}

export function validateMemorySubjectDetails(subjectType, entries = []) {
  if (!MEMORY_SUBJECT_TYPES.has(text(subjectType))) {
    return "Choose whether this is a physical belonging, story, person, or moment.";
  }
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const peopleError = validateMemoryPeopleEntries(normalizedEntries);
  if (peopleError) return peopleError;
  if (subjectType === "person" && normalizedEntries.length === 0) {
    return "Add or choose the primary person this memory is about.";
  }
  return "";
}

export function createBlankMemoryPersonEntry() {
  return entryFromPerson({
    displayName: "",
    livingStatus: "unknown",
    consentState: "not-requested",
  });
}

export function buildMemoryPeopleCommands({
  workspace,
  assetId,
  entries,
  now = new Date().toISOString(),
  idFactory = createLocalId,
}) {
  const validation = validateMemoryPeopleEntries(entries);
  if (validation) {
    return { commands: [], peopleLabel: "", error: validation };
  }

  const collector = workspace?.collector || {};
  const itemProfileId = collectorProfileIdForAsset(assetId);
  const currentPeople = collector.people || [];
  const currentLinks = (collector.memoryPersonLinks || []).filter(
    (link) => link.itemProfileId === itemProfileId,
  );
  const personById = new Map(currentPeople.map((person) => [person.id, person]));
  const peopleByName = currentPeople.reduce((index, person) => {
    const key = normalizedName(person.displayName);
    const matches = index.get(key) || [];
    matches.push(person);
    index.set(key, matches);
    return index;
  }, new Map());
  const currentLinkById = new Map(
    currentLinks.map((link) => [link.id, link]),
  );
  const retainedLinkIds = new Set();
  const commands = [];
  let showPeopleInShowcase = false;

  for (const entry of entries) {
    const displayName = text(entry.displayName);
    const nameMatches =
      peopleByName.get(normalizedName(displayName)) || [];
    const existingPerson =
      personById.get(entry.personId) ||
      (nameMatches.length === 1 ? nameMatches[0] : null) ||
      null;
    const personId = existingPerson?.id || idFactory("person");
    const livingStatus = safeLivingStatus(entry.livingStatus);
    const consentState = safeConsentState(
      entry.consentState,
      livingStatus,
    );
    const linkShowInShowcase =
      entry.showInShowcase === true &&
      personCanEnterShowcase({ livingStatus, consentState }) &&
      Boolean(text(entry.publicLabel));
    const personShowInShowcase =
      personCanEnterShowcase({ livingStatus, consentState }) &&
      (linkShowInShowcase || existingPerson?.showInShowcase === true) &&
      Boolean(
        text(entry.publicLabel) || text(existingPerson?.publicLabel),
      );
    showPeopleInShowcase ||= linkShowInShowcase;
    const currentLink = currentLinkById.get(entry.linkId);
    const linkId = currentLink?.id || idFactory("memory-link");

    retainedLinkIds.add(linkId);
    personById.set(personId, {
      ...existingPerson,
      id: personId,
      displayName,
    });
    const nextPerson = {
      ...existingPerson,
      id: personId,
      displayName,
    };
    const nextNameMatches =
      peopleByName.get(normalizedName(displayName)) || [];
    peopleByName.set(
      normalizedName(displayName),
      nextNameMatches.some((person) => person.id === personId)
        ? nextNameMatches.map((person) =>
            person.id === personId ? nextPerson : person,
          )
        : [...nextNameMatches, nextPerson],
    );

    commands.push({
      type: "UPSERT_PERSON",
      person: {
        id: personId,
        displayName,
        relationship:
          text(entry.relationship) || existingPerson?.relationship || null,
        livingStatus,
        consentState,
        showInShowcase: personShowInShowcase,
        publicLabel: personShowInShowcase
          ? text(entry.publicLabel) || text(existingPerson?.publicLabel)
          : null,
        createdAt: existingPerson?.createdAt || now,
        updatedAt: now,
      },
    });
    commands.push({
      type: "UPSERT_MEMORY_PERSON_LINK",
      link: {
        id: linkId,
        itemProfileId,
        personId,
        relationshipType: safeRelationshipType(entry.relationshipType),
        roleLabel:
          text(entry.roleLabel) || text(entry.relationship) || null,
        memorySummary: text(entry.memorySummary) || null,
        publicSummary: linkShowInShowcase
          ? text(entry.memorySummary) || null
          : null,
        showInShowcase: linkShowInShowcase,
        createdAt: currentLink?.createdAt || now,
      },
    });
  }

  for (const link of currentLinks) {
    if (!retainedLinkIds.has(link.id)) {
      commands.push({ type: "UNLINK_MEMORY_PERSON", linkId: link.id });
    }
  }

  commands.push({
    type: "UPSERT_ITEM_PROFILE",
    itemProfile: {
      id: itemProfileId,
      privacy: {
        showPeople: showPeopleInShowcase,
      },
    },
  });

  return {
    commands,
    peopleLabel: memoryPeopleLabel(entries),
    error: "",
  };
}
