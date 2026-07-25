/**
 * Property continuity keeps one user concept visible through two projections:
 * a Place for the physical hierarchy and an Asset Passport for ownership proof.
 *
 * This module is intentionally UI- and storage-agnostic. Callers decide how to
 * persist commands, but every helper below preserves the one-to-one invariant.
 */

export const PROPERTY_TENURES = Object.freeze([
  "owned",
  "co_owned",
  "rented",
  "managed",
  "family_property",
  "third_party_storage",
  "unknown",
]);

const PROPERTY_TENURE_SET = new Set(PROPERTY_TENURES);
const OWNED_PROPERTY_TENURES = new Set(["owned", "co_owned"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  return text(value) || null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(type, details = {}) {
  return Object.freeze({ type, ...details });
}

export function normalizePropertyTenure(value) {
  const candidate = text(value).toLowerCase().replace(/[\s-]+/gu, "_");
  const aliases = {
    own: "owned",
    owner: "owned",
    coown: "co_owned",
    co_own: "co_owned",
    co_owner: "co_owned",
    rent: "rented",
    tenant: "rented",
    manage: "managed",
    family: "family_property",
    third_party: "third_party_storage",
  };
  const resolved = aliases[candidate] || candidate;
  return PROPERTY_TENURE_SET.has(resolved) ? resolved : "unknown";
}

export function isOwnedPropertyTenure(value) {
  return OWNED_PROPERTY_TENURES.has(normalizePropertyTenure(value));
}

export function isRealEstateAsset(asset) {
  if (!isRecord(asset)) return false;
  const categoryId = text(asset.categoryId).toLowerCase();
  return (
    categoryId.startsWith("property.") ||
    text(asset.kind).toLowerCase() === "real-estate"
  );
}

export function propertyAssetForPlace(workspace, placeId) {
  if (!isRecord(workspace)) return null;
  const place = Array.isArray(workspace.places)
    ? workspace.places.find((item) => item?.id === placeId)
    : null;
  if (!place?.propertyAssetId || !Array.isArray(workspace.assets)) return null;
  return (
    workspace.assets.find(
      (asset) =>
        asset?.id === place.propertyAssetId &&
        asset.propertyPlaceId === place.id &&
        isRealEstateAsset(asset),
    ) || null
  );
}

export function propertyPlaceForAsset(workspace, assetId) {
  if (!isRecord(workspace)) return null;
  const asset = Array.isArray(workspace.assets)
    ? workspace.assets.find((item) => item?.id === assetId)
    : null;
  if (!asset?.propertyPlaceId || !Array.isArray(workspace.places)) return null;
  return (
    workspace.places.find(
      (place) =>
        place?.id === asset.propertyPlaceId &&
        place.propertyAssetId === asset.id &&
        isOwnedPropertyTenure(place.tenure),
    ) || null
  );
}

/**
 * Reconciles imported or legacy data without inventing ownership.
 *
 * Mutual links win over one-sided links. Remaining candidates are selected in
 * stable ID order, and every conflicting or invalid claim is returned as an
 * issue for a review surface. Rented and managed Places never retain an owned
 * Asset Passport link.
 */
export function reconcilePropertyLinks({
  places: placesInput = [],
  assets: assetsInput = [],
} = {}) {
  const places = (Array.isArray(placesInput) ? placesInput : []).map((place) =>
    isRecord(place)
      ? {
          ...place,
          tenure: normalizePropertyTenure(place.tenure),
          propertyAssetId: nullableText(place.propertyAssetId),
        }
      : place,
  );
  const assets = (Array.isArray(assetsInput) ? assetsInput : []).map((asset) =>
    isRecord(asset)
      ? {
          ...asset,
          propertyPlaceId: nullableText(asset.propertyPlaceId),
        }
      : asset,
  );
  const placeById = new Map(
    places.filter(isRecord).map((place) => [text(place.id), place]),
  );
  const assetById = new Map(
    assets.filter(isRecord).map((asset) => [text(asset.id), asset]),
  );
  const candidateByKey = new Map();
  const issues = [];

  function addCandidate(placeIdValue, assetIdValue, source) {
    const placeId = text(placeIdValue);
    const assetId = text(assetIdValue);
    if (!placeId || !assetId) return;
    const place = placeById.get(placeId);
    const asset = assetById.get(assetId);
    if (!place || !asset) {
      issues.push(issue("dangling_link", { placeId, assetId, source }));
      return;
    }
    if (!isOwnedPropertyTenure(place.tenure)) {
      issues.push(
        issue("ineligible_tenure", {
          placeId,
          assetId,
          tenure: place.tenure,
          source,
        }),
      );
      return;
    }
    if (!isRealEstateAsset(asset)) {
      issues.push(issue("not_real_estate_asset", { placeId, assetId, source }));
      return;
    }
    if (place.status === "archived" || asset.lifecycleStatus === "archived") {
      issues.push(issue("archived_projection", { placeId, assetId, source }));
      return;
    }
    const key = `${placeId}\u0000${assetId}`;
    const candidate = candidateByKey.get(key) || {
      placeId,
      assetId,
      fromPlace: false,
      fromAsset: false,
    };
    candidate[source === "place" ? "fromPlace" : "fromAsset"] = true;
    candidateByKey.set(key, candidate);
  }

  for (const place of places) {
    if (isRecord(place) && place.propertyAssetId) {
      addCandidate(place.id, place.propertyAssetId, "place");
    }
  }
  for (const asset of assets) {
    if (isRecord(asset) && asset.propertyPlaceId) {
      addCandidate(asset.propertyPlaceId, asset.id, "asset");
    }
  }

  const candidates = [...candidateByKey.values()].sort((left, right) => {
    const leftScore = Number(left.fromPlace) + Number(left.fromAsset);
    const rightScore = Number(right.fromPlace) + Number(right.fromAsset);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return `${left.placeId}\u0000${left.assetId}`.localeCompare(
      `${right.placeId}\u0000${right.assetId}`,
    );
  });
  const selectedPlaceIds = new Set();
  const selectedAssetIds = new Set();
  const links = [];
  for (const candidate of candidates) {
    if (
      selectedPlaceIds.has(candidate.placeId) ||
      selectedAssetIds.has(candidate.assetId)
    ) {
      issues.push(issue("conflicting_link", { ...candidate }));
      continue;
    }
    selectedPlaceIds.add(candidate.placeId);
    selectedAssetIds.add(candidate.assetId);
    links.push(
      Object.freeze({
        placeId: candidate.placeId,
        assetId: candidate.assetId,
      }),
    );
  }
  const assetIdByPlaceId = new Map(
    links.map((link) => [link.placeId, link.assetId]),
  );
  const placeIdByAssetId = new Map(
    links.map((link) => [link.assetId, link.placeId]),
  );

  return Object.freeze({
    places: places.map((place) =>
      isRecord(place)
        ? {
            ...place,
            propertyAssetId: assetIdByPlaceId.get(text(place.id)) || null,
          }
        : place,
    ),
    assets: assets.map((asset) =>
      isRecord(asset)
        ? {
            ...asset,
            propertyPlaceId: placeIdByAssetId.get(text(asset.id)) || null,
          }
        : asset,
    ),
    links: Object.freeze(links),
    issues: Object.freeze(issues),
  });
}

export function linkPropertyProjection(
  workspace,
  { placeId: placeIdValue, assetId: assetIdValue } = {},
) {
  if (!isRecord(workspace)) {
    return Object.freeze({ ok: false, reason: "invalid_workspace" });
  }
  const placeId = text(placeIdValue);
  const assetId = text(assetIdValue);
  const places = Array.isArray(workspace.places) ? workspace.places : [];
  const assets = Array.isArray(workspace.assets) ? workspace.assets : [];
  const place = places.find((item) => item?.id === placeId);
  const asset = assets.find((item) => item?.id === assetId);
  if (!place) return Object.freeze({ ok: false, reason: "place_not_found" });
  if (!asset) return Object.freeze({ ok: false, reason: "asset_not_found" });
  if (place.status === "archived") {
    return Object.freeze({ ok: false, reason: "place_archived" });
  }
  if (asset.lifecycleStatus === "archived") {
    return Object.freeze({ ok: false, reason: "asset_archived" });
  }
  if (!isOwnedPropertyTenure(place.tenure)) {
    return Object.freeze({ ok: false, reason: "place_not_owned" });
  }
  if (!isRealEstateAsset(asset)) {
    return Object.freeze({ ok: false, reason: "asset_not_real_estate" });
  }
  if (place.propertyAssetId && place.propertyAssetId !== assetId) {
    return Object.freeze({ ok: false, reason: "place_already_linked" });
  }
  if (asset.propertyPlaceId && asset.propertyPlaceId !== placeId) {
    return Object.freeze({ ok: false, reason: "asset_already_linked" });
  }

  const nextWorkspace = {
    ...workspace,
    places: places.map((item) =>
      item?.id === placeId ? { ...item, propertyAssetId: assetId } : item,
    ),
    assets: assets.map((item) =>
      item?.id === assetId ? { ...item, propertyPlaceId: placeId } : item,
    ),
  };
  return Object.freeze({ ok: true, workspace: nextWorkspace });
}

export function unlinkPropertyProjection(
  workspace,
  { placeId: placeIdValue, assetId: assetIdValue } = {},
) {
  if (!isRecord(workspace)) {
    return Object.freeze({ ok: false, reason: "invalid_workspace" });
  }
  const placeId = text(placeIdValue);
  const assetId = text(assetIdValue);
  const places = Array.isArray(workspace.places) ? workspace.places : [];
  const assets = Array.isArray(workspace.assets) ? workspace.assets : [];
  const place = places.find((item) => item?.id === placeId);
  const asset = assets.find((item) => item?.id === assetId);
  if (!place || !asset) {
    return Object.freeze({ ok: false, reason: "link_not_found" });
  }
  if (
    place.propertyAssetId !== assetId ||
    asset.propertyPlaceId !== placeId
  ) {
    return Object.freeze({ ok: false, reason: "link_not_found" });
  }
  return Object.freeze({
    ok: true,
    workspace: {
      ...workspace,
      places: places.map((item) =>
        item?.id === placeId ? { ...item, propertyAssetId: null } : item,
      ),
      assets: assets.map((item) =>
        item?.id === assetId ? { ...item, propertyPlaceId: null } : item,
      ),
    },
  });
}
