export function canOfferGoogleOAuth(platform: string): boolean {
  // Apple review requires an equivalent privacy-preserving login option when
  // a third-party social provider authenticates the primary account. Until
  // the Apple team and Sign in with Apple provider are configured, iOS keeps
  // the complete email/password path and does not expose Google OAuth.
  return platform === "android";
}
