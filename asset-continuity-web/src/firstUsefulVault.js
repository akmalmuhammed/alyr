import { selectAssetReadiness } from "./domain.js";

export const FIRST_USEFUL_VAULT_RECORD_TARGET = 5;

function activeAssets(workspace) {
  return (workspace?.assets || []).filter(
    (asset) => asset.lifecycleStatus !== "archived",
  );
}

function activePlaces(workspace) {
  return (workspace?.places || []).filter(
    (place) => place.status !== "archived",
  );
}

function reviewedMaterials(workspace) {
  return (workspace?.evidence || []).filter(
    (evidence) => evidence.status === "verified",
  );
}

function hasSuccessfulRetrieval(workspace) {
  return (workspace?.activity || []).some((entry) =>
    ["retrieval", "search-retrieval"].includes(entry?.type),
  );
}

export function selectFirstUsefulVaultProgress(workspace) {
  const assets = activeAssets(workspace);
  const places = activePlaces(workspace);
  const reviewed = reviewedMaterials(workspace);
  const readiness = assets.map((asset) => ({
    asset,
    percent: selectAssetReadiness(asset, workspace).percent,
  }));
  const completePassport = readiness.find(
    (entry) => entry.percent === 100,
  );
  const bestIncompletePassport = readiness
    .filter((entry) => entry.percent < 100)
    .sort(
      (left, right) =>
        right.percent - left.percent ||
        left.asset.name.localeCompare(right.asset.name),
    )[0];
  const retrieved = hasSuccessfulRetrieval(workspace);

  const steps = [
    {
      id: "place",
      label: "Add one place",
      copy: "Create the physical structure where things can be found.",
      current: Math.min(places.length, 1),
      target: 1,
      complete: places.length >= 1,
      action: { type: "capture-place" },
    },
    {
      id: "records",
      label: `Save ${FIRST_USEFUL_VAULT_RECORD_TARGET} useful items`,
      copy: "A small real inventory makes search and location useful.",
      current: Math.min(
        assets.length,
        FIRST_USEFUL_VAULT_RECORD_TARGET,
      ),
      target: FIRST_USEFUL_VAULT_RECORD_TARGET,
      complete:
        assets.length >= FIRST_USEFUL_VAULT_RECORD_TARGET,
      action: {
        type: "capture-asset",
        placeId: places[0]?.id || null,
      },
    },
    {
      id: "passport",
      label: "Complete one Asset Passport",
      copy: "Finish one record enough to understand identity and whereabouts.",
      current: completePassport ? 1 : 0,
      target: 1,
      complete: Boolean(completePassport),
      action: bestIncompletePassport
        ? {
            type: "asset",
            assetId: bestIncompletePassport.asset.id,
          }
        : { type: "capture-asset" },
    },
    {
      id: "proof",
      label: "Review one supporting material",
      copy: "Attach and personally review one source photo, paper, or record.",
      current: Math.min(reviewed.length, 1),
      target: 1,
      complete: reviewed.length >= 1,
      action: assets[0]
        ? {
            type: "capture-material",
            assetId: assets[0].id,
          }
        : { type: "capture-asset" },
    },
    {
      id: "retrieval",
      label: "Find something through Search",
      copy: "Prove the vault helps you retrieve a real record.",
      current: retrieved ? 1 : 0,
      target: 1,
      complete: retrieved,
      action: { type: "search" },
    },
  ].map((step) => Object.freeze(step));
  const completedCount = steps.filter((step) => step.complete).length;

  return Object.freeze({
    complete: completedCount === steps.length,
    completedCount,
    totalCount: steps.length,
    percent: Math.round((completedCount / steps.length) * 100),
    steps: Object.freeze(steps),
    nextStep:
      steps.find((step) => !step.complete) || steps[steps.length - 1],
  });
}

