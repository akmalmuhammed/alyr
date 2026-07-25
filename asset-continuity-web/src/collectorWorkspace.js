import {
  collectorReducer,
  normalizeCollectorState,
} from "./collectorDomain.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isFinancialAsset(asset) {
  return (
    asset?.kind === "financial" ||
    String(asset?.categoryId || "").startsWith("financial.")
  );
}

function collectionKind(collection, assets) {
  if (collection.kind === "memory") return "memory";
  if (collection.kind === "archive") return "archive";
  if (
    collection.assetIds.some(
      (assetId) =>
        assets.find((asset) => asset.id === assetId)?.categoryId ===
        "lifestyle.art",
    )
  ) {
    return "art";
  }
  return "collectibles";
}

function itemKind(asset) {
  if (asset.categoryId === "lifestyle.art") return "art";
  if (
    asset.kind === "memory" ||
    asset.meaningFacets?.includes("memory")
  ) {
    return "memory";
  }
  if (asset.meaningFacets?.includes("heirloom")) return "heirloom";
  if (
    asset.meaningFacets?.includes("collectible") ||
    String(asset.categoryId || "").startsWith("lifestyle.collect")
  ) {
    return "collectible";
  }
  return "other";
}

function integerFrom(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function editionFromAsset(asset) {
  const label = text(asset.profile?.edition || asset.reference);
  const numbered = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (numbered) {
    return {
      applicable: true,
      kind: "numbered",
      editionNumber: Number(numbered[1]),
      editionSize: Number(numbered[2]),
    };
  }
  if (asset.categoryId === "lifestyle.art") {
    return { applicable: true, kind: "unknown" };
  }
  if (asset.categoryId === "lifestyle.watch") {
    return {
      applicable: true,
      kind: "production",
      variantName: text(asset.profile?.variant) || null,
    };
  }
  return { applicable: false, kind: "not-applicable" };
}

function creatorIdFor(name) {
  const slug = text(name)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `creator-${slug}` : null;
}

function normalizedPersonName(value) {
  return text(value).toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function legacyPersonNames(value) {
  const generic = new Set(["family", "friends", "others", "everyone", "unknown"]);
  return unique(
    text(value)
      .split(/,| and /i)
      .map((name) => name.trim())
      .filter(
        (name) =>
          name && !generic.has(name.toLocaleLowerCase("en")),
      ),
  );
}

function stableTextHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function legacyPersonIdFor(name) {
  const normalized = normalizedPersonName(name);
  const slug = normalized
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `collector-person-${slug || "remembered"}-${stableTextHash(normalized)}`;
}

export function collectorProfileIdForAsset(assetId) {
  return assetId ? `collector-profile-${assetId}` : null;
}

function seedItemProfile(asset, evidence, now) {
  const profileId = collectorProfileIdForAsset(asset.id);
  const itemEvidence = evidence.filter((item) => item.assetId === asset.id);
  const originalMediaIds = itemEvidence
    .filter(
      (item) =>
        item.fileState === "stored-local" ||
        item.fileState === "protected-backup" ||
        /photo|image|video|audio/i.test(item.type),
    )
    .map((item) => item.id);
  const creatorName = text(asset.profile?.creator);
  const creatorId = creatorIdFor(creatorName);
  const kind = itemKind(asset);
  const productionYear = integerFrom(asset.profile?.["production-year"]);

  return {
    id: profileId,
    assetId: asset.id,
    kind,
    identity: {
      displayName: asset.name,
      maker: text(asset.profile?.maker) || null,
      model: text(asset.profile?.["title-model"]) || null,
      title:
        kind === "art"
          ? text(asset.profile?.["title-model"]) || asset.name
          : null,
      reference: text(asset.reference) || null,
      productionYear,
      identifiers: [],
    },
    edition: editionFromAsset(asset),
    story: {
      headline: text(asset.sentimentalValue) || null,
      narrative:
        text(asset.profile?.story) ||
        text(asset.notes) ||
        text(asset.description) ||
        null,
      whyItMatters: text(asset.sentimentalValue) || null,
      prideNote: text(asset.story) || null,
      publicExcerpt: null,
    },
    media: {
      coverMediaId:
        originalMediaIds[0] || (asset.coverImage ? `cover-${asset.id}` : null),
      originalMediaIds,
      showcaseMediaIds: [],
    },
    privacy: {
      showcaseEligible: false,
      showStory: false,
      showCondition: false,
      showEdition: true,
      showPeople: false,
      showArtHistory: false,
    },
    art:
      kind === "art"
        ? {
            creatorIds: creatorId ? [creatorId] : [],
            title: text(asset.profile?.["title-model"]) || asset.name,
            medium: text(asset.profile?.medium) || null,
            creationYear: productionYear,
            authenticityStatus: "unreviewed",
          }
        : null,
    carePlan: {
      requiresService: asset.categoryId === "lifestyle.watch",
      serviceIntervalMonths:
        asset.categoryId === "lifestyle.watch" ? 60 : null,
      conditionReviewMonths: kind === "art" ? 12 : 24,
      handlingNotes: null,
    },
    tags: unique([
      ...(Array.isArray(asset.tags) ? asset.tags : []),
      ...(Array.isArray(asset.meaningFacets) ? asset.meaningFacets : []),
    ]),
    status:
      asset.lifecycleStatus === "archived"
        ? "archived"
        : asset.lifecycleStatus === "missing"
          ? "missing"
          : "active",
    createdAt: asset.createdAt || now,
    updatedAt: asset.updatedAt || now,
  };
}

function seedCollection(collection, assets, now) {
  const profileIds = collection.assetIds
    .map((assetId) => assets.find((asset) => asset.id === assetId))
    .filter((asset) => asset && !isFinancialAsset(asset))
    .map((asset) => collectorProfileIdForAsset(asset.id));
  const featured = collection.featuredAssetIds
    .filter((assetId) => collection.assetIds.includes(assetId))
    .map(collectorProfileIdForAsset);

  return {
    id: collection.id,
    name: collection.name,
    kind: collectionKind(collection, assets),
    identity: {
      theme: collection.tags?.[0] || null,
      definition: collection.description || null,
    },
    story: {
      headline: collection.story || null,
      narrative: collection.description || null,
      whyItMatters: collection.curatorNote || null,
    },
    curation: {
      statement: collection.description || null,
      curatorNote: collection.curatorNote || null,
      pridePrompt: "Which piece best explains why this collection is yours?",
      coverItemProfileId: collection.coverAssetId
        ? collectorProfileIdForAsset(collection.coverAssetId)
        : profileIds[0] || null,
      featuredItemProfileIds: featured,
    },
    showcase: {
      visibility:
        collection.visibility === "household" ? "household" : "private",
      title: collection.name,
      subtitle: collection.description || null,
      theme: collectionKind(collection, assets) === "art" ? "gallery" : "midnight",
    },
    completionMode: "open-ended",
    trackValuations: false,
    healthPolicy: {
      conditionReviewMonths:
        collectionKind(collection, assets) === "art" ? 12 : 24,
      valuationReviewMonths: 24,
    },
    status: collection.status === "archived" ? "archived" : "active",
    createdAt: collection.createdAt || now,
    updatedAt: collection.updatedAt || now,
  };
}

function seedEvidenceHistory(evidence, profileIds, now) {
  const provenanceEvents = [];
  const conditionReports = [];
  const serviceEvents = [];

  for (const item of evidence) {
    const itemProfileId = profileIds.get(item.assetId);
    if (!itemProfileId) continue;
    const relation = text(item.relation).toLowerCase();
    const type = text(item.type);
    const materialIds = [item.id];
    const eventAt = item.verifiedAt || item.addedAt || now;

    if (relation === "provenance" || /provenance|ownership|certificate/i.test(type)) {
      provenanceEvents.push({
        id: `collector-provenance-${item.id}`,
        itemProfileId,
        happenedAt: eventAt,
        eventType: "documented",
        title: type || "Provenance material",
        confidence: item.status === "verified" ? "documented" : "unknown",
        verificationStatus:
          item.status === "verified" ? "reviewed-by-owner" : "unreviewed",
        privacy: "private",
        materialIds,
        createdAt: item.addedAt || now,
      });
    }

    if (relation === "condition" || /condition/i.test(type)) {
      conditionReports.push({
        id: `collector-condition-${item.id}`,
        itemProfileId,
        observedAt: eventAt,
        grade: "unknown",
        summary: type || "Condition material attached",
        verificationStatus:
          item.status === "verified" ? "reviewed-by-owner" : "unreviewed",
        privacy: "private",
        materialIds,
        createdAt: item.addedAt || now,
      });
    }

    if (
      relation === "service-maintenance" ||
      /service|maintenance|repair|conservation/i.test(type)
    ) {
      serviceEvents.push({
        id: `collector-service-${item.id}`,
        itemProfileId,
        serviceAt: eventAt,
        serviceType: type || "Service",
        status: item.status === "verified" ? "completed" : "planned",
        verificationStatus:
          item.status === "verified" ? "reviewed-by-owner" : "unreviewed",
        privacy: "private",
        materialIds,
        createdAt: item.addedAt || now,
      });
    }
  }

  return { provenanceEvents, conditionReports, serviceEvents };
}

function mergeById(seedRecords, existingRecords, merge) {
  const existingById = new Map(existingRecords.map((item) => [item.id, item]));
  const merged = seedRecords.map((seed) => {
    const existing = existingById.get(seed.id);
    existingById.delete(seed.id);
    return existing ? merge(seed, existing) : seed;
  });
  return [...merged, ...existingById.values()];
}

export function reconcileCollectorState(
  collector,
  { householdId, collections = [], assets = [], evidence = [], now },
) {
  const activeCollections = collections.filter(
    (collection) => collection.status !== "archived",
  );
  const collectibleAssets = assets.filter(
    (asset) => !isFinancialAsset(asset),
  );
  const profileIds = new Map(
    collectibleAssets.map((asset) => [
      asset.id,
      collectorProfileIdForAsset(asset.id),
    ]),
  );
  const collectionSeeds = activeCollections.map((collection) =>
    seedCollection(collection, collectibleAssets, now),
  );
  const profileSeeds = collectibleAssets.map((asset) =>
    seedItemProfile(asset, evidence, now),
  );
  const membershipSeeds = activeCollections.flatMap((collection) =>
    collection.assetIds
      .filter((assetId) => profileIds.has(assetId))
      .map((assetId, index) => ({
        id: `collector-membership-${collection.id}-${assetId}`,
        collectionId: collection.id,
        itemProfileId: profileIds.get(assetId),
        role: "owned",
        showcase: collection.featuredAssetIds.includes(assetId),
        displayOrder: index,
        status: "active",
        addedAt: collection.createdAt || now,
      })),
  );
  const creatorSeeds = unique(
    collectibleAssets.map((asset) => text(asset.profile?.creator)),
  ).map((name) => ({
    id: creatorIdFor(name),
    displayName: name,
    createdAt: now,
    updatedAt: now,
  }));
  const evidenceHistory = seedEvidenceHistory(evidence, profileIds, now);
  const current = normalizeCollectorState(collector, {
    householdId,
    now,
  });
  const existingPersonByName = new Map(
    current.people.map((person) => [
      normalizedPersonName(person.displayName),
      person,
    ]),
  );
  const legacyPersonByName = new Map();
  const legacyMemoryLinkSeeds = [];
  for (const asset of collectibleAssets) {
    const itemProfileId = profileIds.get(asset.id);
    if (!itemProfileId) continue;
    if (asset.profile?.["people-model"] === "canonical-v1") continue;
    for (const name of legacyPersonNames(asset.profile?.people)) {
      const key = normalizedPersonName(name);
      const person =
        existingPersonByName.get(key) ||
        legacyPersonByName.get(key) || {
          id: legacyPersonIdFor(name),
          displayName: name,
          relationship: null,
          livingStatus: "unknown",
          consentState: "not-requested",
          showInShowcase: false,
          publicLabel: null,
          createdAt: asset.createdAt || now,
          updatedAt: asset.updatedAt || now,
        };
      legacyPersonByName.set(key, person);
      legacyMemoryLinkSeeds.push({
        id: `collector-memory-link-legacy-${asset.id}-${person.id}`,
        itemProfileId,
        personId: person.id,
        relationshipType: "shared-memory",
        roleLabel: person.relationship || null,
        memorySummary:
          text(asset.profile?.story) ||
          text(asset.sentimentalValue) ||
          null,
        publicSummary: null,
        showInShowcase: false,
        rememberedOn: null,
        createdAt: asset.createdAt || now,
      });
    }
  }
  const legacyPersonSeeds = [...legacyPersonByName.values()];
  const validLegacyLinkIds = new Set(
    legacyMemoryLinkSeeds.map((link) => link.id),
  );
  const retainedMemoryLinks = current.memoryPersonLinks.filter(
    (link) =>
      !link.id.startsWith("collector-memory-link-legacy-") ||
      validLegacyLinkIds.has(link.id),
  );

  const validSimpleMembershipIds = new Set(
    membershipSeeds.map((membership) => membership.id),
  );
  const managedCollectionIds = new Set(
    activeCollections.map((collection) => collection.id),
  );
  const retainedMemberships = current.memberships.filter(
    (membership) =>
      !managedCollectionIds.has(membership.collectionId) ||
      validSimpleMembershipIds.has(membership.id),
  );

  return normalizeCollectorState(
    {
      ...current,
      householdId,
      collections: mergeById(
        collectionSeeds,
        current.collections.filter((item) =>
          managedCollectionIds.has(item.id),
        ),
        (seed, existing) => ({
          ...seed,
          ...existing,
          name: seed.name,
          kind: seed.kind,
          identity: { ...seed.identity, ...existing.identity },
          story: { ...seed.story, ...existing.story },
          curation: { ...seed.curation, ...existing.curation },
          showcase: { ...seed.showcase, ...existing.showcase },
          healthPolicy: {
            ...seed.healthPolicy,
            ...existing.healthPolicy,
          },
        }),
      ),
      itemProfiles: mergeById(
        profileSeeds,
        current.itemProfiles,
        (seed, existing) => ({
          ...seed,
          ...existing,
          assetId: seed.assetId,
          kind: seed.kind,
          identity: {
            ...seed.identity,
            ...existing.identity,
            displayName: seed.identity.displayName,
          },
          edition: { ...seed.edition, ...existing.edition },
          story: { ...seed.story, ...existing.story },
          media: {
            ...seed.media,
            ...existing.media,
            originalMediaIds: unique([
              ...seed.media.originalMediaIds,
              ...existing.media.originalMediaIds,
            ]),
          },
          privacy: { ...seed.privacy, ...existing.privacy },
          art:
            seed.art || existing.art
              ? { ...(seed.art || {}), ...(existing.art || {}) }
              : null,
          carePlan: { ...seed.carePlan, ...existing.carePlan },
          tags: unique([...seed.tags, ...existing.tags]),
        }),
      ),
      memberships: mergeById(
        membershipSeeds,
        retainedMemberships,
        (seed, existing) => ({ ...seed, ...existing, status: "active" }),
      ),
      artCreators: mergeById(
        creatorSeeds,
        current.artCreators,
        (seed, existing) => ({ ...seed, ...existing, displayName: seed.displayName }),
      ),
      people: mergeById(
        legacyPersonSeeds,
        current.people,
        (seed, existing) => ({
          ...seed,
          ...existing,
          displayName: existing.displayName || seed.displayName,
        }),
      ),
      memoryPersonLinks: mergeById(
        legacyMemoryLinkSeeds,
        retainedMemoryLinks,
        (seed, existing) => ({
          ...seed,
          ...existing,
          itemProfileId: seed.itemProfileId,
          personId: seed.personId,
        }),
      ),
      provenanceEvents: mergeById(
        evidenceHistory.provenanceEvents,
        current.provenanceEvents,
        (seed, existing) => ({
          ...seed,
          ...existing,
          happenedAt: seed.happenedAt,
          confidence: seed.confidence,
          verificationStatus: seed.verificationStatus,
          materialIds: seed.materialIds,
        }),
      ),
      conditionReports: mergeById(
        evidenceHistory.conditionReports,
        current.conditionReports,
        (seed, existing) => ({
          ...seed,
          ...existing,
          observedAt: seed.observedAt,
          grade: seed.grade,
          verificationStatus: seed.verificationStatus,
          materialIds: seed.materialIds,
        }),
      ),
      serviceEvents: mergeById(
        evidenceHistory.serviceEvents,
        current.serviceEvents,
        (seed, existing) => ({
          ...seed,
          ...existing,
          serviceAt: seed.serviceAt,
          status: seed.status,
          verificationStatus: seed.verificationStatus,
          materialIds: seed.materialIds,
        }),
      ),
      updatedAt: current.updatedAt || now,
    },
    { householdId, now },
  );
}

export function applyCollectorCommand(
  collector,
  command,
  workspaceContext,
) {
  const reduced = collectorReducer(collector, command);
  return reconcileCollectorState(reduced, workspaceContext);
}
