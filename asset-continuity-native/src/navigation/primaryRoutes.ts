import type { Href } from "expo-router";

/**
 * Stable public URLs for ALYR's primary authenticated destinations.
 * Route groups never appear in these URLs, so direct links and in-app
 * navigation resolve to the same screen without a duplicate root route.
 */
export const PRIMARY_ROUTES = {
  today: "/",
  items: "/assets",
  search: "/search",
  family: "/family",
  vault: "/vault"
} as const satisfies Record<string, Href>;
