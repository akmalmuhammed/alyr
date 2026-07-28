import type { PortfolioReviewIntent } from "@/components/PortfolioDashboard";

const PORTFOLIO_REVIEW_ROUTES: Record<PortfolioReviewIntent, string> = {
  all: "/assets?view=items",
  unvalued: "/assets?view=items&filter=value",
  proof: "/assets?view=items&filter=evidence",
  location: "/assets?view=items&filter=location",
  "proof-review": "/assets?view=items&filter=review"
};

/**
 * Keeps each Portfolio review action attached to the matching Items view.
 * Do not collapse these routes: a proof-review item already has proof, while
 * a proof-gap item does not.
 */
export function portfolioReviewRoute(
  intent: PortfolioReviewIntent
): string {
  return PORTFOLIO_REVIEW_ROUTES[intent];
}

/**
 * Keeps the property-value review cohort in the URL so the user returns to
 * the same truthful queue after opening and updating an exact Place.
 */
export function portfolioPropertyValueReviewRoute(): string {
  return "/assets?view=places&filter=value";
}
