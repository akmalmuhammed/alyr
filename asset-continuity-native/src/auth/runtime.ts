import { createPreviewAuthGateway } from "./adapters/preview";
import { createUnavailableAuthGateway } from "./adapters/unavailable";
import type { AccountAuthGateway } from "./types";
import { isSessionPreview } from "@/runtime/environment";

export type AuthGatewayFactory = () => AccountAuthGateway;

let configuredFactory: AuthGatewayFactory | null = null;

/**
 * Installs the production gateway factory before the root AuthFlowProvider
 * mounts.
 * The integration should inject a user-scoped Supabase client configured with
 * a publishable/anon key and secure session storage.
 */
export function configureAuthGatewayFactory(
  factory: AuthGatewayFactory
): () => void {
  configuredFactory = factory;
  return () => {
    if (configuredFactory === factory) configuredFactory = null;
  };
}

export function createRuntimeAuthGateway(): AccountAuthGateway {
  if (configuredFactory) {
    return configuredFactory();
  }
  return isSessionPreview
    ? createPreviewAuthGateway()
    : createUnavailableAuthGateway();
}
