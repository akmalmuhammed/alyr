export type AtlasLocationWorkKind =
  | "no-pin"
  | "pin-review"
  | "unplaced-items";

export const ATLAS_LOCATION_WORK_ROUTES: Readonly<
  Record<AtlasLocationWorkKind, string>
> = {
  "no-pin": "/assets?view=places&filter=no-pin",
  "pin-review": "/assets?view=places&filter=pin-review",
  "unplaced-items": "/assets?view=items&filter=location"
};

export function atlasLocationWorkRoute(
  kind: AtlasLocationWorkKind
): string {
  return ATLAS_LOCATION_WORK_ROUTES[kind];
}
