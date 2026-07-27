import type { AccountAuthGateway } from "./types";

export type UserAccessTokenProvider = () => Promise<string>;

/**
 * Adapts the auth boundary to HTTP transports without exposing the bearer in
 * React context. The token is fetched for each request so refresh/rotation is
 * honored, then held only in the transport call stack.
 */
export function createUserAccessTokenProvider(
  gateway: AccountAuthGateway
): UserAccessTokenProvider {
  return async () => {
    const result = await gateway.currentAccessToken();
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const token = result.value?.trim() ?? "";
    if (!token) {
      throw new Error("No verified account access token is available.");
    }
    return token;
  };
}
