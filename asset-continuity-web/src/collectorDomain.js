export const COLLECTOR_SCHEMA_VERSION = 1;
export const SHOWCASE_CONTRACT_VERSION = 1;

const COLLECTION_KINDS = new Set([
  "collectibles",
  "art",
  "memory",
  "archive",
  "portfolio",
  "mixed",
]);
const ITEM_KINDS = new Set([
  "collectible",
  "art",
  "memory",
  "heirloom",
  "reference",
  "other",
]);
const MEMBERSHIP_ROLES = new Set(["owned", "former", "reference"]);
const EDITION_KINDS = new Set([
  "unique",
  "numbered",
  "limited",
  "artist-proof",
  "printer-proof",
  "open",
  "production",
  "unknown",
  "not-applicable",
]);
const CONDITION_GRADES = new Set([
  "mint",
  "excellent",
  "very-good",
  "good",
  "fair",
  "poor",
  "needs-attention",
  "unknown",
]);
const EVENT_PRIVACY = new Set(["private", "household", "showcase"]);
const COLLECTION_VISIBILITIES = new Set([
  "private",
  "household",
  "showcase",
]);
const CONSENT_STATES = new Set([
  "not-requested",
  "requested",
  "granted",
  "declined",
  "not-applicable",
]);
const LIVING_STATUSES = new Set(["living", "deceased", "unknown"]);
const TARGET_PRIORITIES = new Set(["essential", "high", "normal", "someday"]);
const WISHLIST_STATUSES = new Set([
  "interested",
  "researching",
  "ready",
  "acquired",
  "passed",
]);
const FINANCIAL_ACCOUNT_KINDS = new Set([
  "bank",
  "brokerage",
  "pension",
  "insurance",
  "custodial-wallet",
  "employee-plan",
  "other",
]);
const INVESTMENT_CLASSES = new Set([
  "cash",
  "equity",
  "fund",
  "bond",
  "property",
  "private-equity",
  "commodity",
  "digital-asset",
  "collectible",
  "other",
]);
const PROFILE_STATUSES = new Set([
  "active",
  "missing",
  "disposed",
  "archived",
]);
const ACQUISITION_METHODS = new Set([
  "purchase",
  "gift",
  "inherited",
  "trade",
  "found",
  "commissioned",
  "other",
]);
const DISPOSITION_METHODS = new Set([
  "sale",
  "gift",
  "donation",
  "trade",
  "lost",
  "destroyed",
  "returned",
  "other",
]);
const VALUATION_KINDS = new Set([
  "market",
  "insurance",
  "appraisal",
  "replacement",
  "cost",
  "user-estimate",
]);
const RECORD_STATUSES = new Set(["active", "archived"]);
const SERVICE_STATUSES = new Set(["planned", "completed", "cancelled"]);
const HISTORY_VERIFICATION_STATUSES = new Set([
  "unreviewed",
  "reviewed-by-owner",
  "externally-supported",
]);

const FORBIDDEN_FINANCIAL_KEYS = new Set([
  "password",
  "passcode",
  "pin",
  "otp",
  "onetimepassword",
  "securityanswer",
  "secret",
  "clientsecret",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "privatekey",
  "seedphrase",
  "recoveryphrase",
  "mnemonic",
  "cvv",
  "cvc",
  "credential",
  "credentials",
  "username",
  "userid",
  "login",
  "loginname",
  "accountnumber",
  "fullaccountnumber",
  "routingnumber",
  "sortcode",
  "iban",
  "swift",
  "bic",
  "accessinstructions",
  "recoverycode",
  "backupcode",
]);

const CREDENTIAL_TEXT_PATTERN =
  /\b(password|passcode|pin|otp|one[- ]time password|security answer|api key|access token|refresh token|private key|seed phrase|recovery phrase|mnemonic|cvv|cvc|recovery code|backup code)\b\s*[:=]/i;
const FULL_ACCOUNT_NUMBER_PATTERN = /\b\d{8,34}\b/;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function nullableText(value) {
  const valueText = text(value);
  return valueText || null;
}

function shortText(value, maximum = 240) {
  return text(value).slice(0, maximum);
}

function finiteNumber(value, fallback = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value, fallback = null) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value, fallback = null) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item)).filter(Boolean))];
}

function enumValue(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function timestamp(value, fallback) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return fallback;
  }
  return value;
}

function dateOnly(value, fallback = null) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return fallback;
  }
  return value.slice(0, 10);
}

function normalizeCurrency(value) {
  const currency = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeMoney(value) {
  if (!isObject(value)) return null;
  const amountMinor = nonNegativeInteger(value.amountMinor);
  const currency = normalizeCurrency(value.currency);
  return amountMinor === null || !currency
    ? null
    : {
        amountMinor,
        currency,
      };
}

function normalizeIdentifierKey(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePhrase(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRecordList(value, normalizer) {
  if (!Array.isArray(value)) return [];
  const records = [];
  const ids = new Set();
  for (const candidate of value) {
    const record = normalizer(candidate);
    if (!record || ids.has(record.id)) continue;
    ids.add(record.id);
    records.push(record);
  }
  return records;
}

function normalizeStatus(candidate) {
  return enumValue(candidate?.status, RECORD_STATUSES, "active");
}

function normalizeIdentifier(candidate) {
  if (!isObject(candidate)) return null;
  const type = shortText(candidate.type, 80);
  const value = shortText(candidate.value, 180);
  if (!type || !value) return null;
  return {
    type,
    value,
    issuer: nullableText(shortText(candidate.issuer, 120)),
    visibility: "private",
  };
}

function normalizeIdentity(candidate) {
  const source = isObject(candidate) ? candidate : {};
  const seenIdentifiers = new Set();
  const identifiers = (Array.isArray(source.identifiers)
    ? source.identifiers
    : []
  )
    .map(normalizeIdentifier)
    .filter((identifier) => {
      if (!identifier) return false;
      const key = `${normalizeIdentifierKey(
        identifier.type,
      )}:${normalizeIdentifierKey(identifier.value)}`;
      if (seenIdentifiers.has(key)) return false;
      seenIdentifiers.add(key);
      return true;
    });
  return {
    displayName: shortText(source.displayName, 180),
    maker: nullableText(shortText(source.maker, 120)),
    model: nullableText(shortText(source.model, 120)),
    title: nullableText(shortText(source.title, 180)),
    series: nullableText(shortText(source.series, 120)),
    reference: nullableText(shortText(source.reference, 120)),
    productionYear:
      Number.isInteger(source.productionYear) &&
      source.productionYear >= 1000 &&
      source.productionYear <= 9999
        ? source.productionYear
        : null,
    variantName: nullableText(shortText(source.variantName, 120)),
    variantAttributes: uniqueStrings(source.variantAttributes).slice(0, 20),
    identifiers,
  };
}

function normalizeEdition(candidate) {
  const source = isObject(candidate) ? candidate : {};
  const kind = enumValue(source.kind, EDITION_KINDS, "unknown");
  const editionSize = positiveInteger(source.editionSize);
  let editionNumber = positiveInteger(source.editionNumber);
  if (editionNumber && editionSize && editionNumber > editionSize) {
    editionNumber = null;
  }
  return {
    applicable:
      typeof source.applicable === "boolean"
        ? source.applicable
        : !["not-applicable"].includes(kind),
    kind,
    editionNumber,
    editionSize,
    proofLabel: nullableText(shortText(source.proofLabel, 80)),
    variantName: nullableText(shortText(source.variantName, 120)),
    variantAttributes: uniqueStrings(source.variantAttributes).slice(0, 20),
  };
}

function normalizeStory(candidate) {
  const source = isObject(candidate) ? candidate : {};
  return {
    headline: nullableText(shortText(source.headline, 160)),
    narrative: nullableText(shortText(source.narrative, 5000)),
    whyItMatters: nullableText(shortText(source.whyItMatters, 1500)),
    prideNote: nullableText(shortText(source.prideNote, 800)),
    publicExcerpt: nullableText(shortText(source.publicExcerpt, 1000)),
    rememberedOn: dateOnly(source.rememberedOn),
  };
}

function normalizeMedia(candidate) {
  const source = isObject(candidate) ? candidate : {};
  return {
    coverMediaId: nullableText(source.coverMediaId),
    originalMediaIds: uniqueStrings(source.originalMediaIds),
    showcaseMediaIds: uniqueStrings(source.showcaseMediaIds),
  };
}

function normalizeItemPrivacy(candidate) {
  const source = isObject(candidate) ? candidate : {};
  return {
    showcaseEligible: source.showcaseEligible === true,
    showStory: source.showStory === true,
    showCondition: source.showCondition === true,
    showEdition: source.showEdition !== false,
    showPeople: source.showPeople === true,
    showArtHistory: source.showArtHistory === true,
  };
}

function normalizeArtProfile(candidate) {
  if (!isObject(candidate)) return null;
  return {
    creatorIds: uniqueStrings(candidate.creatorIds),
    title: nullableText(shortText(candidate.title, 180)),
    medium: nullableText(shortText(candidate.medium, 180)),
    support: nullableText(shortText(candidate.support, 120)),
    creationYear:
      Number.isInteger(candidate.creationYear) &&
      candidate.creationYear >= 1000 &&
      candidate.creationYear <= 9999
        ? candidate.creationYear
        : null,
    dimensions: {
      height: finiteNumber(candidate.dimensions?.height),
      width: finiteNumber(candidate.dimensions?.width),
      depth: finiteNumber(candidate.dimensions?.depth),
      unit: ["cm", "mm", "in"].includes(candidate.dimensions?.unit)
        ? candidate.dimensions.unit
        : "cm",
    },
    signature: enumValue(
      candidate.signature,
      new Set(["signed", "unsigned", "unknown"]),
      "unknown",
    ),
    inscriptions: nullableText(shortText(candidate.inscriptions, 500)),
    catalogueRaisonneReference: nullableText(
      shortText(candidate.catalogueRaisonneReference, 180),
    ),
    authenticityStatus: enumValue(
      candidate.authenticityStatus,
      new Set([
        "unreviewed",
        "documented",
        "expert-opinion",
        "disputed",
        "not-applicable",
      ]),
      "unreviewed",
    ),
    frameDescription: nullableText(
      shortText(candidate.frameDescription, 300),
    ),
  };
}

function normalizeCarePlan(candidate) {
  const source = isObject(candidate) ? candidate : {};
  return {
    requiresService: source.requiresService === true,
    serviceIntervalMonths: positiveInteger(source.serviceIntervalMonths),
    conditionReviewMonths: positiveInteger(source.conditionReviewMonths),
    handlingNotes: nullableText(shortText(source.handlingNotes, 1000)),
  };
}

function normalizeCollection(candidate, householdId, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const name = shortText(candidate.name, 180);
  if (!id || !name) return null;
  const identity = isObject(candidate.identity) ? candidate.identity : {};
  const curation = isObject(candidate.curation) ? candidate.curation : {};
  const showcase = isObject(candidate.showcase) ? candidate.showcase : {};
  const healthPolicy = isObject(candidate.healthPolicy)
    ? candidate.healthPolicy
    : {};
  return {
    id,
    householdId,
    name,
    kind: enumValue(candidate.kind, COLLECTION_KINDS, "collectibles"),
    identity: {
      theme: nullableText(shortText(identity.theme, 180)),
      maker: nullableText(shortText(identity.maker, 120)),
      series: nullableText(shortText(identity.series, 120)),
      era: nullableText(shortText(identity.era, 120)),
      geography: nullableText(shortText(identity.geography, 120)),
      catalogSystem: nullableText(shortText(identity.catalogSystem, 180)),
      definition: nullableText(shortText(identity.definition, 1000)),
    },
    story: normalizeStory(candidate.story),
    curation: {
      statement: nullableText(shortText(curation.statement, 1500)),
      curatorNote: nullableText(shortText(curation.curatorNote, 1500)),
      pridePrompt: nullableText(shortText(curation.pridePrompt, 300)),
      coverItemProfileId: nullableText(curation.coverItemProfileId),
      featuredItemProfileIds: uniqueStrings(curation.featuredItemProfileIds),
    },
    showcase: {
      visibility: enumValue(
        showcase.visibility,
        COLLECTION_VISIBILITIES,
        "private",
      ),
      slug: normalizePhrase(showcase.slug).replace(/\s+/g, "-") || null,
      title: nullableText(shortText(showcase.title, 180)),
      subtitle: nullableText(shortText(showcase.subtitle, 240)),
      theme: enumValue(
        showcase.theme,
        new Set(["midnight", "gallery", "archive", "warm", "minimal"]),
        "midnight",
      ),
      publishedAt:
        showcase.visibility === "showcase"
          ? timestamp(showcase.publishedAt, null)
          : null,
    },
    completionMode: enumValue(
      candidate.completionMode,
      new Set(["open-ended", "target-list", "edition-run", "one-of-each"]),
      "open-ended",
    ),
    trackValuations: candidate.trackValuations === true,
    healthPolicy: {
      conditionReviewMonths:
        positiveInteger(healthPolicy.conditionReviewMonths) ?? 24,
      valuationReviewMonths:
        positiveInteger(healthPolicy.valuationReviewMonths) ?? 24,
    },
    status: normalizeStatus(candidate),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeItemProfile(candidate, householdId, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const assetId = text(candidate.assetId);
  if (!id || !assetId) return null;
  const kind = enumValue(candidate.kind, ITEM_KINDS, "collectible");
  return {
    id,
    householdId,
    assetId,
    kind,
    identity: normalizeIdentity(candidate.identity),
    edition: normalizeEdition(candidate.edition),
    story: normalizeStory(candidate.story),
    media: normalizeMedia(candidate.media),
    privacy: normalizeItemPrivacy(candidate.privacy),
    art: kind === "art" ? normalizeArtProfile(candidate.art) : null,
    carePlan: normalizeCarePlan(candidate.carePlan),
    tags: uniqueStrings(candidate.tags),
    status: enumValue(candidate.status, PROFILE_STATUSES, "active"),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeMembership(candidate, collectionIds, profileIds, fallbackNow) {
  if (!isObject(candidate)) return null;
  const collectionId = text(candidate.collectionId);
  const itemProfileId = text(candidate.itemProfileId);
  if (!collectionIds.has(collectionId) || !profileIds.has(itemProfileId)) {
    return null;
  }
  return {
    id: text(candidate.id) || `${collectionId}::${itemProfileId}`,
    collectionId,
    itemProfileId,
    role: enumValue(candidate.role, MEMBERSHIP_ROLES, "owned"),
    showcase: candidate.showcase === true,
    displayOrder: nonNegativeInteger(candidate.displayOrder, 0),
    status: normalizeStatus(candidate),
    addedAt: timestamp(candidate.addedAt, fallbackNow),
  };
}

function normalizeBaseHistoryEvent(
  candidate,
  profileIds,
  fallbackNow,
  dateField,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const itemProfileId = text(candidate.itemProfileId);
  if (!id || !profileIds.has(itemProfileId)) return null;
  return {
    id,
    itemProfileId,
    [dateField]: timestamp(candidate[dateField], fallbackNow),
    materialIds: uniqueStrings(candidate.materialIds),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
  };
}

function normalizeProvenanceEvent(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "happenedAt",
  );
  if (!base) return null;
  return {
    ...base,
    eventType: enumValue(
      candidate.eventType,
      new Set([
        "created",
        "made",
        "owned",
        "sold",
        "gifted",
        "inherited",
        "exhibited",
        "published",
        "authenticated",
        "rediscovered",
        "other",
      ]),
      "other",
    ),
    title: shortText(candidate.title, 180) || "Provenance event",
    placeLabel: nullableText(shortText(candidate.placeLabel, 180)),
    partyLabels: uniqueStrings(candidate.partyLabels).slice(0, 20),
    confidence: enumValue(
      candidate.confidence,
      new Set(["documented", "probable", "oral-history", "unknown"]),
      "unknown",
    ),
    verificationStatus: enumValue(
      candidate.verificationStatus,
      new Set(["unreviewed", "reviewed-by-owner", "externally-supported"]),
      "unreviewed",
    ),
    privacy: enumValue(candidate.privacy, EVENT_PRIVACY, "private"),
    publicSummary: nullableText(shortText(candidate.publicSummary, 500)),
  };
}

function normalizeConditionReport(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "observedAt",
  );
  if (!base) return null;
  return {
    ...base,
    grade: enumValue(candidate.grade, CONDITION_GRADES, "unknown"),
    summary: nullableText(shortText(candidate.summary, 1500)),
    publicSummary: nullableText(shortText(candidate.publicSummary, 500)),
    issueCodes: uniqueStrings(candidate.issueCodes),
    assessorLabel: nullableText(shortText(candidate.assessorLabel, 180)),
    nextReviewAt: timestamp(candidate.nextReviewAt, null),
    verificationStatus: enumValue(
      candidate.verificationStatus,
      HISTORY_VERIFICATION_STATUSES,
      "reviewed-by-owner",
    ),
    privacy: enumValue(candidate.privacy, EVENT_PRIVACY, "private"),
  };
}

function normalizeServiceEvent(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "serviceAt",
  );
  if (!base) return null;
  return {
    ...base,
    serviceType: shortText(candidate.serviceType, 120) || "Service",
    status: enumValue(candidate.status, SERVICE_STATUSES, "completed"),
    providerLabel: nullableText(shortText(candidate.providerLabel, 180)),
    summary: nullableText(shortText(candidate.summary, 1500)),
    publicSummary: nullableText(shortText(candidate.publicSummary, 500)),
    cost: normalizeMoney(candidate.cost),
    nextDueAt: timestamp(candidate.nextDueAt, null),
    verificationStatus: enumValue(
      candidate.verificationStatus,
      HISTORY_VERIFICATION_STATUSES,
      "reviewed-by-owner",
    ),
    privacy: enumValue(candidate.privacy, EVENT_PRIVACY, "private"),
  };
}

function normalizeAcquisitionEvent(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "acquiredAt",
  );
  if (!base) return null;
  return {
    ...base,
    method: enumValue(
      candidate.method,
      ACQUISITION_METHODS,
      "other",
    ),
    sourcePartyLabel: nullableText(
      shortText(candidate.sourcePartyLabel, 180),
    ),
    sourcePlaceLabel: nullableText(
      shortText(candidate.sourcePlaceLabel, 180),
    ),
    amount: normalizeMoney(candidate.amount),
    notes: nullableText(shortText(candidate.notes, 1500)),
  };
}

function normalizeDispositionEvent(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "disposedAt",
  );
  if (!base) return null;
  return {
    ...base,
    method: enumValue(candidate.method, DISPOSITION_METHODS, "other"),
    recipientLabel: nullableText(shortText(candidate.recipientLabel, 180)),
    proceeds: normalizeMoney(candidate.proceeds),
    reason: nullableText(shortText(candidate.reason, 1000)),
  };
}

function normalizeValuation(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "valuedAt",
  );
  const amount = normalizeMoney(candidate?.amount);
  if (!base || !amount) return null;
  return {
    ...base,
    kind: enumValue(candidate.kind, VALUATION_KINDS, "user-estimate"),
    amount,
    sourceLabel: nullableText(shortText(candidate.sourceLabel, 180)),
    confidence: enumValue(
      candidate.confidence,
      new Set(["low", "medium", "high", "unknown"]),
      "unknown",
    ),
  };
}

function normalizeTarget(
  candidate,
  collectionIds,
  profileIds,
  fallbackNow,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const collectionId = text(candidate.collectionId);
  const label = shortText(candidate.label, 180);
  if (!id || !collectionIds.has(collectionId) || !label) return null;
  const matchedItemProfileId = profileIds.has(candidate.matchedItemProfileId)
    ? candidate.matchedItemProfileId
    : null;
  const criteria = isObject(candidate.criteria) ? candidate.criteria : {};
  return {
    id,
    collectionId,
    label,
    priority: enumValue(candidate.priority, TARGET_PRIORITIES, "normal"),
    required: candidate.required !== false,
    criteria: {
      maker: nullableText(shortText(criteria.maker, 120)),
      model: nullableText(shortText(criteria.model, 120)),
      series: nullableText(shortText(criteria.series, 120)),
      reference: nullableText(shortText(criteria.reference, 120)),
      variantName: nullableText(shortText(criteria.variantName, 120)),
      productionYear:
        Number.isInteger(criteria.productionYear) &&
        criteria.productionYear >= 1000 &&
        criteria.productionYear <= 9999
          ? criteria.productionYear
          : null,
      tags: uniqueStrings(criteria.tags),
    },
    matchedItemProfileId,
    status:
      matchedItemProfileId
        ? "filled"
        : candidate.status === "skipped"
          ? "skipped"
          : "open",
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeWishlistEntry(
  candidate,
  collectionIds,
  targetIds,
  profileIds,
  fallbackNow,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const collectionId = text(candidate.collectionId);
  const label = shortText(candidate.label, 180);
  if (!id || !collectionIds.has(collectionId) || !label) return null;
  return {
    id,
    collectionId,
    targetId: targetIds.has(candidate.targetId) ? candidate.targetId : null,
    label,
    desiredIdentity: normalizeIdentity(candidate.desiredIdentity),
    priority: enumValue(candidate.priority, TARGET_PRIORITIES, "normal"),
    status: enumValue(
      candidate.status,
      WISHLIST_STATUSES,
      "interested",
    ),
    budget: normalizeMoney(candidate.budget),
    notes: nullableText(shortText(candidate.notes, 1500)),
    candidateUrls: uniqueStrings(candidate.candidateUrls)
      .map(sanitizePublicHttpUrl)
      .filter(Boolean),
    matchedItemProfileId: profileIds.has(candidate.matchedItemProfileId)
      ? candidate.matchedItemProfileId
      : null,
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizePerson(candidate, householdId, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const displayName = shortText(candidate.displayName, 180);
  if (!id || !displayName) return null;
  return {
    id,
    householdId,
    displayName,
    relationship: nullableText(shortText(candidate.relationship, 120)),
    livingStatus: enumValue(
      candidate.livingStatus,
      LIVING_STATUSES,
      "unknown",
    ),
    consentState: enumValue(
      candidate.consentState,
      CONSENT_STATES,
      "not-requested",
    ),
    showInShowcase: candidate.showInShowcase === true,
    publicLabel: nullableText(shortText(candidate.publicLabel, 180)),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeMemoryLink(
  candidate,
  profileIds,
  personIds,
  fallbackNow,
) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const itemProfileId = text(candidate.itemProfileId);
  const personId = text(candidate.personId);
  if (
    !id ||
    !profileIds.has(itemProfileId) ||
    !personIds.has(personId)
  ) {
    return null;
  }
  return {
    id,
    itemProfileId,
    personId,
    relationshipType: enumValue(
      candidate.relationshipType,
      new Set([
        "owned-by",
        "made-by",
        "given-by",
        "inherited-from",
        "shared-memory",
        "photographed-with",
        "other",
      ]),
      "shared-memory",
    ),
    roleLabel: nullableText(shortText(candidate.roleLabel, 120)),
    memorySummary: nullableText(shortText(candidate.memorySummary, 1500)),
    publicSummary: nullableText(shortText(candidate.publicSummary, 500)),
    showInShowcase: candidate.showInShowcase === true,
    rememberedOn: dateOnly(candidate.rememberedOn),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
  };
}

function normalizeCreator(candidate, fallbackNow) {
  if (!isObject(candidate)) return null;
  const id = text(candidate.id);
  const displayName = shortText(candidate.displayName, 180);
  if (!id || !displayName) return null;
  return {
    id,
    displayName,
    birthYear: positiveInteger(candidate.birthYear),
    deathYear: positiveInteger(candidate.deathYear),
    nationality: nullableText(shortText(candidate.nationality, 100)),
    publicBio: nullableText(shortText(candidate.publicBio, 1000)),
    showInShowcase: candidate.showInShowcase !== false,
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

function normalizeExhibitionEvent(
  candidate,
  profileIds,
  creatorIds,
  fallbackNow,
) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "openedAt",
  );
  if (!base) return null;
  return {
    ...base,
    exhibitionName:
      shortText(candidate.exhibitionName, 180) || "Exhibition",
    venueLabel: nullableText(shortText(candidate.venueLabel, 180)),
    city: nullableText(shortText(candidate.city, 120)),
    country: nullableText(shortText(candidate.country, 120)),
    closedAt: timestamp(candidate.closedAt, null),
    creatorIds: uniqueStrings(candidate.creatorIds).filter((id) =>
      creatorIds.has(id),
    ),
    catalogueReference: nullableText(
      shortText(candidate.catalogueReference, 180),
    ),
    publicSummary: nullableText(shortText(candidate.publicSummary, 500)),
    showInShowcase: candidate.showInShowcase === true,
  };
}

function normalizeConservationEvent(candidate, profileIds, fallbackNow) {
  const base = normalizeBaseHistoryEvent(
    candidate,
    profileIds,
    fallbackNow,
    "treatedAt",
  );
  if (!base) return null;
  return {
    ...base,
    treatmentType:
      shortText(candidate.treatmentType, 120) || "Conservation review",
    conservatorLabel: nullableText(
      shortText(candidate.conservatorLabel, 180),
    ),
    treatmentSummary: nullableText(
      shortText(candidate.treatmentSummary, 1500),
    ),
    publicSummary: nullableText(shortText(candidate.publicSummary, 500)),
    beforeConditionReportId: nullableText(
      candidate.beforeConditionReportId,
    ),
    afterConditionReportId: nullableText(candidate.afterConditionReportId),
    nextReviewAt: timestamp(candidate.nextReviewAt, null),
    showInShowcase: candidate.showInShowcase === true,
  };
}

function normalizeFinancialKey(value) {
  return text(value).toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

function isForbiddenFinancialKey(value) {
  const normalizedKey = normalizeFinancialKey(value);
  if (FORBIDDEN_FINANCIAL_KEYS.has(normalizedKey)) return true;
  return /(?:password|passcode|securityanswer|clientsecret|apikey|accesstoken|refreshtoken|bearertoken|privatekey|seedphrase|recoveryphrase|mnemonic|credential|recoverycode|backupcode|accountnumber|routingnumber|fullaccount|loginname|username)$/.test(
    normalizedKey,
  );
}

function inspectCredentialLikeData(value, path = "record", errors = []) {
  if (typeof value === "string") {
    if (CREDENTIAL_TEXT_PATTERN.test(value)) {
      errors.push(`${path} appears to contain a credential or recovery secret.`);
    }
    if (FULL_ACCOUNT_NUMBER_PATTERN.test(value)) {
      errors.push(
        `${path} appears to contain a full account number; keep only the final four characters.`,
      );
    }
    return errors;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectCredentialLikeData(item, `${path}[${index}]`, errors),
    );
    return errors;
  }
  if (!isObject(value)) return errors;
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenFinancialKey(key)) {
      errors.push(`${path}.${key} is not allowed in Continuity.`);
      continue;
    }
    inspectCredentialLikeData(item, `${path}.${key}`, errors);
  }
  return errors;
}

function inspectPortalUrl(value) {
  const portalUrl = text(value);
  if (!portalUrl) return [];
  try {
    const parsed = new URL(portalUrl);
    const errors = [];
    if (!["https:", "http:"].includes(parsed.protocol)) {
      errors.push("portalUrl must use http or https.");
    }
    if (parsed.username || parsed.password) {
      errors.push("portalUrl cannot contain embedded credentials.");
    }
    for (const key of parsed.searchParams.keys()) {
      if (isForbiddenFinancialKey(key)) {
        errors.push("portalUrl cannot contain credential-like query data.");
        break;
      }
    }
    return errors;
  } catch {
    return ["portalUrl must be a valid URL."];
  }
}

function sanitizePublicHttpUrl(value) {
  const url = text(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validatePrivateFinancialReference(candidate) {
  const errors = inspectCredentialLikeData(candidate);
  if (!isObject(candidate)) {
    return { valid: false, errors: ["Financial reference must be an object."] };
  }
  if (!text(candidate.id)) errors.push("id is required.");
  if (!shortText(candidate.label, 180)) errors.push("label is required.");
  if (!shortText(candidate.institution, 180)) {
    errors.push("institution is required.");
  }
  if (!FINANCIAL_ACCOUNT_KINDS.has(candidate.kind)) {
    errors.push("kind is not supported.");
  }
  const accountEnding = text(candidate.accountEnding);
  if (accountEnding && !/^[A-Za-z0-9]{4}$/.test(accountEnding)) {
    errors.push("accountEnding must contain exactly four letters or digits.");
  }
  errors.push(...inspectPortalUrl(candidate.portalUrl));
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

function normalizePrivateFinancialReference(
  candidate,
  householdId,
  personIds,
  fallbackNow,
) {
  if (!validatePrivateFinancialReference(candidate).valid) return null;
  return {
    id: text(candidate.id),
    householdId,
    label: shortText(candidate.label, 180),
    institution: shortText(candidate.institution, 180),
    kind: candidate.kind,
    accountEnding: nullableText(text(candidate.accountEnding).toUpperCase()),
    currency: normalizeCurrency(candidate.currency),
    jurisdiction: nullableText(shortText(candidate.jurisdiction, 120)),
    portalUrl: sanitizePublicHttpUrl(candidate.portalUrl),
    ownerPersonIds: uniqueStrings(candidate.ownerPersonIds).filter((id) =>
      personIds.has(id),
    ),
    beneficiaryPersonIds: uniqueStrings(
      candidate.beneficiaryPersonIds,
    ).filter((id) => personIds.has(id)),
    documentMaterialIds: uniqueStrings(candidate.documentMaterialIds),
    contactLabel: nullableText(shortText(candidate.contactLabel, 180)),
    reviewAt: timestamp(candidate.reviewAt, null),
    visibility: "private",
    status: enumValue(
      candidate.status,
      new Set(["active", "closed", "archived"]),
      "active",
    ),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

export function validateInvestmentReference(candidate) {
  const errors = inspectCredentialLikeData(candidate);
  if (!isObject(candidate)) {
    return { valid: false, errors: ["Investment reference must be an object."] };
  }
  if (!text(candidate.id)) errors.push("id is required.");
  if (!shortText(candidate.label, 180)) errors.push("label is required.");
  if (!INVESTMENT_CLASSES.has(candidate.assetClass)) {
    errors.push("assetClass is not supported.");
  }
  const quantity = finiteNumber(candidate.quantity);
  if (quantity !== null && quantity < 0) {
    errors.push("quantity cannot be negative.");
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

function normalizeInvestmentReference(
  candidate,
  accountIds,
  personIds,
  fallbackNow,
) {
  if (!validateInvestmentReference(candidate).valid) return null;
  return {
    id: text(candidate.id),
    accountReferenceId: accountIds.has(candidate.accountReferenceId)
      ? candidate.accountReferenceId
      : null,
    label: shortText(candidate.label, 180),
    assetClass: candidate.assetClass,
    ticker: nullableText(shortText(candidate.ticker, 24).toUpperCase()),
    externalReference: nullableText(
      shortText(candidate.externalReference, 120),
    ),
    quantity:
      finiteNumber(candidate.quantity) !== null &&
      finiteNumber(candidate.quantity) >= 0
        ? finiteNumber(candidate.quantity)
        : null,
    quantityUnit: nullableText(shortText(candidate.quantityUnit, 40)),
    ownerPersonIds: uniqueStrings(candidate.ownerPersonIds).filter((id) =>
      personIds.has(id),
    ),
    documentMaterialIds: uniqueStrings(candidate.documentMaterialIds),
    reviewAt: timestamp(candidate.reviewAt, null),
    visibility: "private",
    status: enumValue(
      candidate.status,
      new Set(["active", "closed", "archived"]),
      "active",
    ),
    createdAt: timestamp(candidate.createdAt, fallbackNow),
    updatedAt: timestamp(candidate.updatedAt, fallbackNow),
  };
}

export function createEmptyCollectorState({
  householdId = "",
  now = "1970-01-01T00:00:00.000Z",
} = {}) {
  return {
    schemaVersion: COLLECTOR_SCHEMA_VERSION,
    householdId: text(householdId),
    collections: [],
    itemProfiles: [],
    memberships: [],
    provenanceEvents: [],
    conditionReports: [],
    serviceEvents: [],
    acquisitionEvents: [],
    dispositionEvents: [],
    valuationObservations: [],
    collectionTargets: [],
    wishlistEntries: [],
    people: [],
    memoryPersonLinks: [],
    artCreators: [],
    exhibitionEvents: [],
    conservationEvents: [],
    privateFinancialReferences: [],
    investmentReferences: [],
    createdAt: timestamp(now, "1970-01-01T00:00:00.000Z"),
    updatedAt: timestamp(now, "1970-01-01T00:00:00.000Z"),
  };
}

export function normalizeCollectorState(
  value,
  {
    householdId: requestedHouseholdId,
    now = new Date().toISOString(),
  } = {},
) {
  const source = isObject(value) ? value : {};
  const householdId =
    text(requestedHouseholdId) || text(source.householdId) || "household";
  const fallbackNow = timestamp(now, new Date().toISOString());

  let collections = normalizeRecordList(source.collections, (candidate) =>
    normalizeCollection(candidate, householdId, fallbackNow),
  );
  const itemProfiles = normalizeRecordList(source.itemProfiles, (candidate) =>
    normalizeItemProfile(candidate, householdId, fallbackNow),
  );
  const collectionIds = new Set(collections.map((item) => item.id));
  const profileIds = new Set(itemProfiles.map((item) => item.id));

  const membershipCompounds = new Set();
  const memberships = normalizeRecordList(source.memberships, (candidate) => {
    const membership = normalizeMembership(
      candidate,
      collectionIds,
      profileIds,
      fallbackNow,
    );
    if (!membership) return null;
    const compound = `${membership.collectionId}::${membership.itemProfileId}`;
    if (membershipCompounds.has(compound)) return null;
    membershipCompounds.add(compound);
    return membership;
  });
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active",
  );

  collections = collections.map((collection) => {
    const memberProfileIds = new Set(
      activeMemberships
        .filter((item) => item.collectionId === collection.id)
        .map((item) => item.itemProfileId),
    );
    const featuredItemProfileIds =
      collection.curation.featuredItemProfileIds.filter((id) =>
        memberProfileIds.has(id),
      );
    const coverItemProfileId = memberProfileIds.has(
      collection.curation.coverItemProfileId,
    )
      ? collection.curation.coverItemProfileId
      : featuredItemProfileIds[0] ?? memberProfileIds.values().next().value ?? null;
    return {
      ...collection,
      curation: {
        ...collection.curation,
        coverItemProfileId,
        featuredItemProfileIds,
      },
    };
  });

  const people = normalizeRecordList(source.people, (candidate) =>
    normalizePerson(candidate, householdId, fallbackNow),
  );
  const personIds = new Set(people.map((item) => item.id));
  const artCreators = normalizeRecordList(source.artCreators, (candidate) =>
    normalizeCreator(candidate, fallbackNow),
  );
  const creatorIds = new Set(artCreators.map((item) => item.id));

  const provenanceEvents = normalizeRecordList(
    source.provenanceEvents,
    (candidate) =>
      normalizeProvenanceEvent(candidate, profileIds, fallbackNow),
  );
  const conditionReports = normalizeRecordList(
    source.conditionReports,
    (candidate) =>
      normalizeConditionReport(candidate, profileIds, fallbackNow),
  );
  const serviceEvents = normalizeRecordList(source.serviceEvents, (candidate) =>
    normalizeServiceEvent(candidate, profileIds, fallbackNow),
  );
  const acquisitionEvents = normalizeRecordList(
    source.acquisitionEvents,
    (candidate) =>
      normalizeAcquisitionEvent(candidate, profileIds, fallbackNow),
  );
  const dispositionEvents = normalizeRecordList(
    source.dispositionEvents,
    (candidate) =>
      normalizeDispositionEvent(candidate, profileIds, fallbackNow),
  );
  const valuationObservations = normalizeRecordList(
    source.valuationObservations,
    (candidate) => normalizeValuation(candidate, profileIds, fallbackNow),
  );

  const collectionTargets = normalizeRecordList(
    source.collectionTargets,
    (candidate) =>
      normalizeTarget(candidate, collectionIds, profileIds, fallbackNow),
  );
  const targetIds = new Set(collectionTargets.map((item) => item.id));
  const wishlistEntries = normalizeRecordList(
    source.wishlistEntries,
    (candidate) =>
      normalizeWishlistEntry(
        candidate,
        collectionIds,
        targetIds,
        profileIds,
        fallbackNow,
      ),
  );
  const memoryPersonLinks = normalizeRecordList(
    source.memoryPersonLinks,
    (candidate) =>
      normalizeMemoryLink(candidate, profileIds, personIds, fallbackNow),
  );
  const exhibitionEvents = normalizeRecordList(
    source.exhibitionEvents,
    (candidate) =>
      normalizeExhibitionEvent(
        candidate,
        profileIds,
        creatorIds,
        fallbackNow,
      ),
  );
  const conservationEvents = normalizeRecordList(
    source.conservationEvents,
    (candidate) =>
      normalizeConservationEvent(candidate, profileIds, fallbackNow),
  );

  const privateFinancialReferences = normalizeRecordList(
    source.privateFinancialReferences,
    (candidate) =>
      normalizePrivateFinancialReference(
        candidate,
        householdId,
        personIds,
        fallbackNow,
      ),
  );
  const accountIds = new Set(
    privateFinancialReferences.map((item) => item.id),
  );
  const investmentReferences = normalizeRecordList(
    source.investmentReferences,
    (candidate) =>
      normalizeInvestmentReference(
        candidate,
        accountIds,
        personIds,
        fallbackNow,
      ),
  );

  return {
    schemaVersion: COLLECTOR_SCHEMA_VERSION,
    householdId,
    collections,
    itemProfiles,
    memberships,
    provenanceEvents,
    conditionReports,
    serviceEvents,
    acquisitionEvents,
    dispositionEvents,
    valuationObservations,
    collectionTargets,
    wishlistEntries,
    people,
    memoryPersonLinks,
    artCreators,
    exhibitionEvents,
    conservationEvents,
    privateFinancialReferences,
    investmentReferences,
    createdAt: timestamp(source.createdAt, fallbackNow),
    updatedAt: timestamp(source.updatedAt, fallbackNow),
  };
}

const UPSERT_ACTIONS = {
  UPSERT_COLLECTION: ["collections", "collection"],
  UPSERT_ITEM_PROFILE: ["itemProfiles", "itemProfile"],
  UPSERT_COLLECTION_TARGET: ["collectionTargets", "target"],
  UPSERT_WISHLIST_ENTRY: ["wishlistEntries", "wishlistEntry"],
  UPSERT_PERSON: ["people", "person"],
  UPSERT_MEMORY_PERSON_LINK: ["memoryPersonLinks", "link"],
  UPSERT_ART_CREATOR: ["artCreators", "creator"],
  UPSERT_PRIVATE_FINANCIAL_REFERENCE: [
    "privateFinancialReferences",
    "financialReference",
  ],
  UPSERT_INVESTMENT_REFERENCE: [
    "investmentReferences",
    "investmentReference",
  ],
};

const APPEND_ACTIONS = {
  ADD_COLLECTION_MEMBERSHIP: ["memberships", "membership"],
  APPEND_PROVENANCE_EVENT: ["provenanceEvents", "event"],
  APPEND_CONDITION_REPORT: ["conditionReports", "report"],
  APPEND_SERVICE_EVENT: ["serviceEvents", "event"],
  APPEND_ACQUISITION_EVENT: ["acquisitionEvents", "event"],
  APPEND_DISPOSITION_EVENT: ["dispositionEvents", "event"],
  APPEND_VALUATION: ["valuationObservations", "valuation"],
  LINK_MEMORY_PERSON: ["memoryPersonLinks", "link"],
  APPEND_EXHIBITION_EVENT: ["exhibitionEvents", "event"],
  APPEND_CONSERVATION_EVENT: ["conservationEvents", "event"],
};

function mergeUpsertRecord(key, existing, payload) {
  if (!existing) return payload;
  const merged = { ...existing, ...payload };
  if (key === "collections") {
    return {
      ...merged,
      identity: { ...existing.identity, ...payload.identity },
      story: { ...existing.story, ...payload.story },
      curation: { ...existing.curation, ...payload.curation },
      showcase: { ...existing.showcase, ...payload.showcase },
      healthPolicy: {
        ...existing.healthPolicy,
        ...payload.healthPolicy,
      },
    };
  }
  if (key === "itemProfiles") {
    return {
      ...merged,
      identity: { ...existing.identity, ...payload.identity },
      edition: { ...existing.edition, ...payload.edition },
      story: { ...existing.story, ...payload.story },
      media: { ...existing.media, ...payload.media },
      privacy: { ...existing.privacy, ...payload.privacy },
      art:
        existing.art || payload.art
          ? { ...(existing.art ?? {}), ...(payload.art ?? {}) }
          : null,
      carePlan: { ...existing.carePlan, ...payload.carePlan },
    };
  }
  if (key === "collectionTargets") {
    return {
      ...merged,
      criteria: { ...existing.criteria, ...payload.criteria },
    };
  }
  if (key === "wishlistEntries") {
    return {
      ...merged,
      desiredIdentity: {
        ...existing.desiredIdentity,
        ...payload.desiredIdentity,
      },
    };
  }
  return merged;
}

export function collectorReducer(state, action) {
  const now = timestamp(action?.now, new Date().toISOString());
  const current = normalizeCollectorState(state, { now });
  if (!isObject(action)) return current;

  const upsertConfig = UPSERT_ACTIONS[action.type];
  if (upsertConfig) {
    const [key, payloadKey] = upsertConfig;
    const payload = action[payloadKey];
    if (!isObject(payload) || !text(payload.id)) return current;
    const index = current[key].findIndex((item) => item.id === payload.id);
    const mergedPayload = mergeUpsertRecord(
      key,
      index === -1 ? null : current[key][index],
      payload,
    );
    if (
      action.type === "UPSERT_PRIVATE_FINANCIAL_REFERENCE" &&
      !validatePrivateFinancialReference(mergedPayload).valid
    ) {
      return current;
    }
    if (
      action.type === "UPSERT_INVESTMENT_REFERENCE" &&
      !validateInvestmentReference(mergedPayload).valid
    ) {
      return current;
    }
    const nextRecords =
      index === -1
        ? [...current[key], mergedPayload]
        : current[key].map((item, itemIndex) =>
            itemIndex === index ? mergedPayload : item,
          );
    const next = normalizeCollectorState(
      {
        ...current,
        [key]: nextRecords,
        updatedAt: now,
      },
      { householdId: current.householdId, now },
    );
    return JSON.stringify(next) === JSON.stringify(current) ? current : next;
  }

  const appendConfig = APPEND_ACTIONS[action.type];
  if (appendConfig) {
    const [key, payloadKey] = appendConfig;
    const payload = action[payloadKey];
    if (
      !isObject(payload) ||
      !text(payload.id) ||
      current[key].some((item) => item.id === payload.id)
    ) {
      return current;
    }
    const next = normalizeCollectorState(
      {
        ...current,
        [key]: [...current[key], payload],
        updatedAt: now,
      },
      { householdId: current.householdId, now },
    );
    return next[key].length === current[key].length ? current : next;
  }

  if (action.type === "UNLINK_MEMORY_PERSON") {
    const linkId = text(action.linkId);
    if (
      !linkId ||
      !current.memoryPersonLinks.some((link) => link.id === linkId)
    ) {
      return current;
    }
    return normalizeCollectorState(
      {
        ...current,
        memoryPersonLinks: current.memoryPersonLinks.filter(
          (link) => link.id !== linkId,
        ),
        updatedAt: now,
      },
      { householdId: current.householdId, now },
    );
  }

  return current;
}

function activeOwnedProfiles(state, collectionId) {
  const profileById = new Map(
    state.itemProfiles.map((profile) => [profile.id, profile]),
  );
  return state.memberships
    .filter(
      (membership) =>
        membership.collectionId === collectionId &&
        membership.status === "active" &&
        membership.role === "owned",
    )
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.addedAt.localeCompare(right.addedAt),
    )
    .map((membership) => profileById.get(membership.itemProfileId))
    .filter(
      (profile) =>
        profile &&
        !["archived", "disposed"].includes(profile.status),
    );
}

function recordsForProfile(records, itemProfileId, dateField) {
  return records
    .filter((item) => item.itemProfileId === itemProfileId)
    .sort((left, right) =>
      String(right[dateField]).localeCompare(String(left[dateField])),
    );
}

function isReviewedHistoryRecord(record) {
  return record.verificationStatus !== "unreviewed";
}

function isReviewedConditionReport(report) {
  return isReviewedHistoryRecord(report) && report.grade !== "unknown";
}

function editionIsDocumented(edition) {
  if (!edition.applicable || edition.kind === "not-applicable") return true;
  if (edition.kind === "unique" || edition.kind === "open") return true;
  if (["numbered", "limited"].includes(edition.kind)) {
    return Boolean(edition.editionNumber && edition.editionSize);
  }
  if (["artist-proof", "printer-proof"].includes(edition.kind)) {
    return Boolean(edition.proofLabel || edition.editionNumber);
  }
  return edition.kind === "production"
    ? Boolean(edition.variantName || edition.variantAttributes.length)
    : false;
}

function identityIsDocumented(profile) {
  const identity = profile.identity;
  return Boolean(
    identity.displayName &&
      (identity.maker ||
        identity.model ||
        identity.title ||
        identity.reference ||
        identity.identifiers.length ||
        profile.kind === "memory"),
  );
}

function artIsDocumented(profile, state) {
  if (profile.kind !== "art") return true;
  if (!profile.art) return false;
  const validCreators = profile.art.creatorIds.filter((id) =>
    state.artCreators.some((creator) => creator.id === id),
  );
  return Boolean(
    (profile.art.title || profile.identity.title) &&
      validCreators.length &&
      profile.art.medium,
  );
}

function scoreChecks(checks) {
  const applicable = Object.values(checks).filter(
    (check) => check.applicable,
  );
  if (!applicable.length) return 100;
  return Math.round(
    (applicable.filter((check) => check.complete).length / applicable.length) *
      100,
  );
}

function targetIsFilled(target, ownedIds) {
  return Boolean(
    target.status === "filled" &&
      target.matchedItemProfileId &&
      ownedIds.has(target.matchedItemProfileId),
  );
}

export function selectCollectionCompletion(stateInput, collectionId) {
  const state = normalizeCollectorState(stateInput);
  const collection = state.collections.find(
    (item) => item.id === collectionId && item.status === "active",
  );
  if (!collection) return null;
  const profiles = activeOwnedProfiles(state, collectionId);
  const itemChecklists = profiles.map((profile) => {
    const hasProvenance =
      recordsForProfile(
        state.provenanceEvents,
        profile.id,
        "happenedAt",
      ).some(isReviewedHistoryRecord) ||
      recordsForProfile(
        state.acquisitionEvents,
        profile.id,
        "acquiredAt",
      ).length > 0;
    const checks = {
      identity: {
        applicable: true,
        complete: identityIsDocumented(profile),
      },
      visual: {
        applicable: true,
        complete: Boolean(
          profile.media.coverMediaId ||
            profile.media.originalMediaIds.length ||
            profile.media.showcaseMediaIds.length,
        ),
      },
      edition: {
        applicable: profile.edition.applicable,
        complete: editionIsDocumented(profile.edition),
      },
      provenance: {
        applicable: true,
        complete: hasProvenance,
      },
      condition: {
        applicable: profile.kind !== "memory",
        complete:
          profile.kind === "memory" ||
          recordsForProfile(
            state.conditionReports,
            profile.id,
            "observedAt",
          ).some(isReviewedConditionReport),
      },
      care: {
        applicable: profile.carePlan.requiresService,
        complete:
          !profile.carePlan.requiresService ||
          recordsForProfile(
            state.serviceEvents,
            profile.id,
            "serviceAt",
          ).some(
            (event) =>
              event.status === "completed" &&
              isReviewedHistoryRecord(event),
          ),
      },
      story: {
        applicable: true,
        complete: Boolean(
          profile.story.narrative ||
            profile.story.whyItMatters ||
            profile.story.prideNote,
        ),
      },
      art: {
        applicable: profile.kind === "art",
        complete: artIsDocumented(profile, state),
      },
      valuation: {
        applicable: collection.trackValuations,
        complete:
          !collection.trackValuations ||
          recordsForProfile(
            state.valuationObservations,
            profile.id,
            "valuedAt",
          ).length > 0,
      },
    };
    return {
      itemProfileId: profile.id,
      displayName: profile.identity.displayName,
      percent: scoreChecks(checks),
      checks,
    };
  });

  const dimensionNames = [
    "identity",
    "visual",
    "edition",
    "provenance",
    "condition",
    "care",
    "story",
    "art",
    "valuation",
  ];
  const dimensions = Object.fromEntries(
    dimensionNames.map((name) => {
      const applicableChecks = itemChecklists
        .map((item) => item.checks[name])
        .filter((check) => check.applicable);
      return [
        name,
        {
          applicableCount: applicableChecks.length,
          completeCount: applicableChecks.filter((check) => check.complete)
            .length,
          percent: applicableChecks.length
            ? Math.round(
                (applicableChecks.filter((check) => check.complete).length /
                  applicableChecks.length) *
                  100,
              )
            : 100,
        },
      ];
    }),
  );
  const itemPercent = itemChecklists.length
    ? Math.round(
        itemChecklists.reduce((sum, item) => sum + item.percent, 0) /
          itemChecklists.length,
      )
    : 0;
  const ownedIds = new Set(profiles.map((profile) => profile.id));
  const requiredTargets = state.collectionTargets.filter(
    (target) =>
      target.collectionId === collectionId &&
      target.required &&
      target.status !== "skipped",
  );
  const filledTargets = requiredTargets.filter((target) =>
    targetIsFilled(target, ownedIds),
  );
  const setPercent = requiredTargets.length
    ? Math.round((filledTargets.length / requiredTargets.length) * 100)
    : null;
  const percent =
    setPercent === null
      ? itemPercent
      : Math.round(itemPercent * 0.75 + setPercent * 0.25);

  return {
    collectionId,
    itemCount: profiles.length,
    percent,
    itemPercent,
    setPercent,
    dimensions,
    itemChecklists,
    targetCount: requiredTargets.length,
    filledTargetCount: filledTargets.length,
    gapCount:
      itemChecklists.filter((item) => item.percent < 100).length +
      (requiredTargets.length - filledTargets.length),
  };
}

function monthAge(then, now) {
  if (!then || !now) return Number.POSITIVE_INFINITY;
  const thenDate = new Date(then);
  const nowDate = new Date(now);
  return (
    (nowDate.getUTCFullYear() - thenDate.getUTCFullYear()) * 12 +
    nowDate.getUTCMonth() -
    thenDate.getUTCMonth()
  );
}

function isPast(value, asOf) {
  return Boolean(value && Date.parse(value) < Date.parse(asOf));
}

function detectLikelyDuplicatesNormalized(
  state,
  candidateInput,
  { threshold = 0.7 } = {},
) {
  const candidate = normalizeItemProfile(
    candidateInput,
    state.householdId,
    state.updatedAt,
  );
  if (!candidate) return [];

  const candidateIdentifiers = new Set(
    candidate.identity.identifiers.map(
      (identifier) =>
        `${normalizeIdentifierKey(identifier.type)}:${normalizeIdentifierKey(
          identifier.value,
        )}`,
    ),
  );
  return state.itemProfiles
    .filter(
      (profile) =>
        profile.id !== candidate.id && profile.status !== "archived",
    )
    .map((profile) => {
      const reasons = [];
      let score = 0;
      if (profile.assetId === candidate.assetId) {
        score = 1;
        reasons.push("Same Asset Passport");
      }
      const identifierMatch = profile.identity.identifiers.find((identifier) =>
        candidateIdentifiers.has(
          `${normalizeIdentifierKey(identifier.type)}:${normalizeIdentifierKey(
            identifier.value,
          )}`,
        ),
      );
      if (identifierMatch) {
        score = Math.max(score, 0.98);
        reasons.push(`Same ${identifierMatch.type}`);
      }

      const fields = ["maker", "model", "title", "reference", "variantName"];
      const equalFields = fields.filter((field) => {
        const left = normalizePhrase(profile.identity[field]);
        const right = normalizePhrase(candidate.identity[field]);
        return left && right && left === right;
      });
      const editionMatches =
        profile.edition.editionNumber &&
        candidate.edition.editionNumber &&
        profile.edition.editionNumber === candidate.edition.editionNumber &&
        profile.edition.editionSize === candidate.edition.editionSize;
      if (
        equalFields.includes("title") &&
        equalFields.includes("maker") &&
        editionMatches
      ) {
        score = Math.max(score, 0.92);
        reasons.push("Same maker, title, and edition");
      } else if (
        equalFields.length >= 3 ||
        (equalFields.includes("reference") && equalFields.includes("maker"))
      ) {
        score = Math.max(score, 0.84);
        reasons.push(`Matching ${equalFields.join(", ")}`);
      } else {
        const sameName =
          normalizePhrase(profile.identity.displayName) &&
          normalizePhrase(profile.identity.displayName) ===
            normalizePhrase(candidate.identity.displayName);
        const sameYear =
          profile.identity.productionYear &&
          profile.identity.productionYear ===
            candidate.identity.productionYear;
        if (sameName && (sameYear || equalFields.length)) {
          score = Math.max(score, 0.72);
          reasons.push("Matching name and identity details");
        }
      }
      return {
        itemProfileId: profile.id,
        assetId: profile.assetId,
        displayName: profile.identity.displayName,
        score,
        reasons: [...new Set(reasons)],
      };
    })
    .filter((result) => result.score >= threshold)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.displayName.localeCompare(right.displayName),
    );
}

export function detectLikelyDuplicates(
  stateInput,
  candidateInput,
  options = {},
) {
  return detectLikelyDuplicatesNormalized(
    normalizeCollectorState(stateInput),
    candidateInput,
    options,
  );
}

export function selectDuplicateGroups(stateInput, { threshold = 0.7 } = {}) {
  const state = normalizeCollectorState(stateInput);
  const pairs = [];
  const seen = new Set();
  for (const profile of state.itemProfiles) {
    for (const match of detectLikelyDuplicatesNormalized(state, profile, {
      threshold,
    })) {
      const ids = [profile.id, match.itemProfileId].sort();
      const key = ids.join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        itemProfileIds: ids,
        score: match.score,
        reasons: match.reasons,
      });
    }
  }
  return pairs.sort((left, right) => right.score - left.score);
}

export function selectCollectionHealth(
  stateInput,
  collectionId,
  { asOf = new Date().toISOString() } = {},
) {
  const state = normalizeCollectorState(stateInput);
  const collection = state.collections.find(
    (item) => item.id === collectionId && item.status === "active",
  );
  if (!collection) return null;
  const profiles = activeOwnedProfiles(state, collectionId);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const alerts = [];
  let atRiskConditionCount = 0;
  let overdueServiceCount = 0;
  let staleConditionCount = 0;
  let staleValuationCount = 0;
  let provenanceGapCount = 0;

  for (const profile of profiles) {
    const latestCondition = recordsForProfile(
      state.conditionReports,
      profile.id,
      "observedAt",
    ).find(isReviewedConditionReport);
    if (
      latestCondition &&
      ["poor", "needs-attention"].includes(latestCondition.grade)
    ) {
      atRiskConditionCount += 1;
      alerts.push({
        kind: "condition",
        priority: "urgent",
        itemProfileId: profile.id,
        label: `${profile.identity.displayName} needs condition attention`,
      });
    }
    const conditionReviewMonths =
      profile.carePlan.conditionReviewMonths ??
      collection.healthPolicy.conditionReviewMonths;
    if (
      profile.kind !== "memory" &&
      (!latestCondition ||
        (latestCondition.nextReviewAt
          ? isPast(latestCondition.nextReviewAt, asOf)
          : monthAge(latestCondition.observedAt, asOf) >=
            conditionReviewMonths))
    ) {
      staleConditionCount += 1;
      alerts.push({
        kind: "condition-review",
        priority: "normal",
        itemProfileId: profile.id,
        label: latestCondition
          ? `${profile.identity.displayName} condition review is due`
          : `Add a condition record for ${profile.identity.displayName}`,
      });
    }

    const reviewedServices = recordsForProfile(
      state.serviceEvents,
      profile.id,
      "serviceAt",
    ).filter(isReviewedHistoryRecord);
    const completedServices = reviewedServices.filter(
      (event) => event.status === "completed",
    );
    const latestService = completedServices[0];
    const nextDueAt =
      latestService?.nextDueAt ??
      reviewedServices.find((event) => event.status === "planned")?.nextDueAt;
    if (profile.carePlan.requiresService) {
      if (!completedServices.length && !nextDueAt) {
        alerts.push({
          kind: "service-history",
          priority: "normal",
          itemProfileId: profile.id,
          label: `Add service history for ${profile.identity.displayName}`,
        });
      } else if (isPast(nextDueAt, asOf)) {
        overdueServiceCount += 1;
        alerts.push({
          kind: "service",
          priority: "urgent",
          itemProfileId: profile.id,
          label: `${profile.identity.displayName} service is overdue`,
        });
      }
    }

    const provenanceCount =
      recordsForProfile(
        state.provenanceEvents,
        profile.id,
        "happenedAt",
      ).filter(isReviewedHistoryRecord).length +
      recordsForProfile(
        state.acquisitionEvents,
        profile.id,
        "acquiredAt",
      ).length;
    if (!provenanceCount) {
      provenanceGapCount += 1;
      alerts.push({
        kind: "provenance",
        priority: "normal",
        itemProfileId: profile.id,
        label: `Record how ${profile.identity.displayName} joined the collection`,
      });
    }

    if (collection.trackValuations) {
      const latestValuation = recordsForProfile(
        state.valuationObservations,
        profile.id,
        "valuedAt",
      )[0];
      if (
        !latestValuation ||
        monthAge(latestValuation.valuedAt, asOf) >=
          collection.healthPolicy.valuationReviewMonths
      ) {
        staleValuationCount += 1;
      }
    }
  }

  const duplicatePairs = selectDuplicateGroups(state).filter((group) =>
    group.itemProfileIds.every((id) => profileIds.has(id)),
  );
  const criticalCount = atRiskConditionCount + overdueServiceCount;
  const attentionCount =
    staleConditionCount +
    provenanceGapCount +
    alerts.filter((alert) => alert.kind === "service-history").length;
  const score = profiles.length
    ? Math.max(
        0,
        100 -
          criticalCount * 20 -
          staleConditionCount * 8 -
          provenanceGapCount * 8 -
          alerts.filter((alert) => alert.kind === "service-history").length *
            8,
      )
    : 0;
  return {
    collectionId,
    itemCount: profiles.length,
    score,
    status:
      profiles.length === 0
        ? "empty"
        : criticalCount
          ? "needs-care"
          : attentionCount
            ? "attention"
            : "healthy",
    atRiskConditionCount,
    overdueServiceCount,
    staleConditionCount,
    staleValuationCount,
    provenanceGapCount,
    possibleDuplicateCount: duplicatePairs.length,
    alerts: alerts.sort((left, right) => {
      const rank = { urgent: 0, normal: 1 };
      return rank[left.priority] - rank[right.priority];
    }),
  };
}

function profileMatchesCriteria(profile, criteria) {
  const identity = profile.identity;
  const fields = [
    "maker",
    "model",
    "series",
    "reference",
    "variantName",
    "productionYear",
  ];
  const constrainedFields = fields.filter(
    (field) => criteria[field] !== null && criteria[field] !== undefined,
  );
  const fieldsMatch = constrainedFields.every((field) =>
    field === "productionYear"
      ? identity[field] === criteria[field]
      : normalizePhrase(identity[field]) === normalizePhrase(criteria[field]),
  );
  const profileTags = new Set(profile.tags.map(normalizePhrase));
  return (
    fieldsMatch &&
    criteria.tags.every((tag) => profileTags.has(normalizePhrase(tag)))
  );
}

export function selectCollectionGaps(stateInput, collectionId) {
  const state = normalizeCollectorState(stateInput);
  const collection = state.collections.find(
    (item) => item.id === collectionId && item.status === "active",
  );
  if (!collection) return null;
  const ownedProfiles = activeOwnedProfiles(state, collectionId);
  const ownedIds = new Set(ownedProfiles.map((profile) => profile.id));
  const openTargets = state.collectionTargets
    .filter(
      (target) =>
        target.collectionId === collectionId &&
        target.status !== "skipped" &&
        !targetIsFilled(target, ownedIds),
    )
    .map((target) => ({
      ...target,
      candidateItemProfileIds: ownedProfiles
        .filter((profile) => profileMatchesCriteria(profile, target.criteria))
        .map((profile) => profile.id),
    }));
  const openWishlist = state.wishlistEntries.filter(
    (entry) =>
      entry.collectionId === collectionId &&
      !["acquired", "passed"].includes(entry.status),
  );
  return {
    collectionId,
    openTargetCount: openTargets.length,
    openWishlistCount: openWishlist.length,
    targets: openTargets,
    wishlist: [...openWishlist].sort((left, right) => {
      const rank = { essential: 0, high: 1, normal: 2, someday: 3 };
      return rank[left.priority] - rank[right.priority];
    }),
  };
}

export function selectCurrentCollectorLifecycle(stateInput, itemProfileId) {
  const state = normalizeCollectorState(stateInput);
  const profile = state.itemProfiles.find((item) => item.id === itemProfileId);
  if (!profile) return null;
  const events = [
    ...state.acquisitionEvents
      .filter((item) => item.itemProfileId === itemProfileId)
      .map((item) => ({
        kind: "acquired",
        method: item.method,
        at: item.acquiredAt,
        eventId: item.id,
      })),
    ...state.dispositionEvents
      .filter((item) => item.itemProfileId === itemProfileId)
      .map((item) => ({
        kind: "disposed",
        method: item.method,
        at: item.disposedAt,
        eventId: item.id,
      })),
  ].sort((left, right) => right.at.localeCompare(left.at));
  return {
    itemProfileId,
    status: events[0]?.kind ?? "unknown",
    latestEvent: events[0] ?? null,
    history: events,
  };
}

function editionDisplay(edition) {
  if (!edition.applicable || edition.kind === "not-applicable") return null;
  if (edition.editionNumber && edition.editionSize) {
    return `${edition.editionNumber} of ${edition.editionSize}`;
  }
  if (edition.proofLabel) return edition.proofLabel;
  if (edition.kind === "unique") return "Unique work";
  if (edition.kind === "open") return "Open edition";
  return edition.variantName;
}

function showcasePerson(person, link) {
  if (!person || !link || !person.publicLabel) return null;
  const livingConsent =
    person.livingStatus === "deceased" ||
    (person.livingStatus === "living" &&
      person.consentState === "granted");
  if (
    !person.showInShowcase ||
    !link.showInShowcase ||
    !livingConsent
  ) {
    return null;
  }
  return {
    name: person.publicLabel,
    relationship: link.roleLabel || person.relationship,
    memory: link.publicSummary,
  };
}

function projectItemForShowcaseNormalized(
  state,
  itemProfileId,
  { collectionId = null } = {},
) {
  const profile = state.itemProfiles.find(
    (item) =>
      item.id === itemProfileId &&
      item.status === "active" &&
      item.privacy.showcaseEligible,
  );
  if (!profile) return null;
  if (collectionId) {
    const membership = state.memberships.find(
      (item) =>
        item.collectionId === collectionId &&
        item.itemProfileId === itemProfileId &&
        item.status === "active" &&
        item.showcase,
    );
    if (!membership) return null;
  }

  const latestCondition = recordsForProfile(
    state.conditionReports,
    profile.id,
    "observedAt",
  )[0];
  const provenance = recordsForProfile(
    state.provenanceEvents,
    profile.id,
    "happenedAt",
  )
    .filter(
      (event) =>
        event.privacy === "showcase" && Boolean(event.publicSummary),
    )
    .map((event) => ({
      year: new Date(event.happenedAt).getUTCFullYear(),
      summary: event.publicSummary,
    }));
  const people = profile.privacy.showPeople
    ? state.memoryPersonLinks
        .filter((link) => link.itemProfileId === profile.id)
        .map((link) =>
          showcasePerson(
            state.people.find((person) => person.id === link.personId),
            link,
          ),
        )
        .filter(Boolean)
    : [];
  const art =
    profile.kind === "art" && profile.art
      ? {
          title: profile.art.title || profile.identity.title,
          creators: profile.art.creatorIds
            .map((id) =>
              state.artCreators.find(
                (creator) => creator.id === id && creator.showInShowcase,
              ),
            )
            .filter(Boolean)
            .map((creator) => ({
              name: creator.displayName,
              life:
                creator.birthYear || creator.deathYear
                  ? `${creator.birthYear ?? ""}–${creator.deathYear ?? ""}`
                  : null,
              nationality: creator.nationality,
              bio: creator.publicBio,
            })),
          medium: profile.art.medium,
          support: profile.art.support,
          creationYear: profile.art.creationYear,
          dimensions: profile.art.dimensions,
          exhibitions: profile.privacy.showArtHistory
            ? state.exhibitionEvents
                .filter(
                  (event) =>
                    event.itemProfileId === profile.id &&
                    event.showInShowcase,
                )
                .map((event) => ({
                  name: event.exhibitionName,
                  venue: event.venueLabel,
                  city: event.city,
                  country: event.country,
                  year: new Date(event.openedAt).getUTCFullYear(),
                  summary: event.publicSummary,
                }))
            : [],
          conservation:
            profile.privacy.showCondition &&
            profile.privacy.showArtHistory
              ? state.conservationEvents
                  .filter(
                    (event) =>
                      event.itemProfileId === profile.id &&
                      event.showInShowcase &&
                      event.publicSummary,
                  )
                  .map((event) => ({
                    year: new Date(event.treatedAt).getUTCFullYear(),
                    summary: event.publicSummary,
                  }))
              : [],
        }
      : null;

  return {
    name: profile.identity.displayName,
    kind: profile.kind,
    identity: {
      maker: profile.identity.maker,
      model: profile.identity.model,
      title: profile.identity.title,
      series: profile.identity.series,
      productionYear: profile.identity.productionYear,
      variantName: profile.identity.variantName,
    },
    edition: profile.privacy.showEdition
      ? editionDisplay(profile.edition)
      : null,
    story: profile.privacy.showStory
      ? {
          headline: profile.story.headline,
          excerpt: profile.story.publicExcerpt,
        }
      : null,
    media: {
      publicDerivativeIds: profile.media.showcaseMediaIds,
    },
    condition:
      profile.privacy.showCondition &&
      latestCondition &&
      latestCondition.privacy === "showcase"
        ? {
            grade: latestCondition.grade,
            summary: latestCondition.publicSummary,
          }
        : null,
    provenance,
    people,
    art,
  };
}

export function projectItemForShowcase(
  stateInput,
  itemProfileId,
  options = {},
) {
  return projectItemForShowcaseNormalized(
    normalizeCollectorState(stateInput),
    itemProfileId,
    options,
  );
}

export function projectCollectionForShowcase(stateInput, collectionId) {
  const state = normalizeCollectorState(stateInput);
  const collection = state.collections.find(
    (item) =>
      item.id === collectionId &&
      item.status === "active" &&
      item.showcase.visibility === "showcase",
  );
  if (!collection) return null;
  const featuredRank = new Map(
    collection.curation.featuredItemProfileIds.map((id, index) => [id, index]),
  );
  const memberships = state.memberships
    .filter(
      (item) =>
        item.collectionId === collectionId &&
        item.status === "active" &&
        item.showcase,
    )
    .sort((left, right) => {
      const leftRank = featuredRank.has(left.itemProfileId)
        ? featuredRank.get(left.itemProfileId)
        : Number.POSITIVE_INFINITY;
      const rightRank = featuredRank.has(right.itemProfileId)
        ? featuredRank.get(right.itemProfileId)
        : Number.POSITIVE_INFINITY;
      return leftRank - rightRank || left.displayOrder - right.displayOrder;
    });
  const projectedMemberships = memberships
    .map((membership) => ({
      membership,
      projection: projectItemForShowcaseNormalized(
        state,
        membership.itemProfileId,
        {
          collectionId,
        },
      ),
    }))
    .filter((item) => item.projection);
  const items = projectedMemberships.map((item) => item.projection);
  const coverMembershipIndex = projectedMemberships.findIndex(
    (item) =>
      item.membership.itemProfileId ===
      collection.curation.coverItemProfileId,
  );
  return {
    contractVersion: SHOWCASE_CONTRACT_VERSION,
    slug: collection.showcase.slug,
    title: collection.showcase.title || collection.name,
    subtitle: collection.showcase.subtitle,
    kind: collection.kind,
    theme: collection.showcase.theme,
    statement: collection.curation.statement,
    story: collection.story.publicExcerpt,
    coverItemIndex: coverMembershipIndex >= 0 ? coverMembershipIndex : 0,
    items,
  };
}

export function selectCollectionPrideSummary(stateInput, collectionId) {
  const state = normalizeCollectorState(stateInput);
  const collection = state.collections.find(
    (item) => item.id === collectionId && item.status === "active",
  );
  if (!collection) return null;
  const profiles = activeOwnedProfiles(state, collectionId);
  const completion = selectCollectionCompletion(state, collectionId);
  const storyCount = profiles.filter(
    (profile) =>
      profile.story.narrative ||
      profile.story.whyItMatters ||
      profile.story.prideNote,
  ).length;
  const memoryCount = profiles.filter((profile) =>
    ["memory", "heirloom"].includes(profile.kind),
  ).length;
  const publicReadyCount = profiles.filter(
    (profile) =>
      profile.privacy.showcaseEligible &&
      profile.media.showcaseMediaIds.length > 0,
  ).length;
  const acquisitionDates = state.acquisitionEvents
    .filter((event) =>
      profiles.some((profile) => profile.id === event.itemProfileId),
    )
    .map((event) => event.acquiredAt)
    .sort();
  const milestones = [];
  if (profiles.length) {
    milestones.push({
      kind: "collection-size",
      label: `${profiles.length} ${
        profiles.length === 1 ? "piece" : "pieces"
      } brought together`,
    });
  }
  if (storyCount) {
    milestones.push({
      kind: "stories",
      label: `${storyCount} ${
        storyCount === 1 ? "story" : "stories"
      } preserved`,
    });
  }
  if (completion?.setPercent === 100 && completion.targetCount > 0) {
    milestones.push({
      kind: "set-complete",
      label: "Your collecting plan is complete",
    });
  }
  return {
    collectionId,
    name: collection.name,
    itemCount: profiles.length,
    storyCount,
    memoryCount,
    publicReadyCount,
    collectingSince: acquisitionDates[0] ?? null,
    statement:
      collection.curation.statement ||
      collection.story.whyItMatters ||
      null,
    pridePrompt: collection.curation.pridePrompt,
    milestones,
  };
}
