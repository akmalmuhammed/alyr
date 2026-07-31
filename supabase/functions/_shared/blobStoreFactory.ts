import type { BlobStore } from "./blobStore.ts";
import {
  type BlobStoreEnvironment,
  parseBlobStoreConfig,
} from "./blobStoreConfig.ts";
import {
  createSupabaseStorageTransport,
  SupabaseBlobStore,
  type SupabaseStorageClientLike,
} from "./blobStoreSupabase.ts";
import { S3CompatibleBlobStore } from "./blobStoreS3.ts";

export async function createBlobStoreFromEnv(
  env: BlobStoreEnvironment,
): Promise<BlobStore> {
  const config = parseBlobStoreConfig(env);

  if (config.provider === "supabase") {
    const { createClient } = await import(
      "npm:@supabase/supabase-js@2.111.0"
    );
    const client = createClient(
      config.supabaseUrl,
      config.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const transport = createSupabaseStorageTransport({
      client: client as unknown as SupabaseStorageClientLike,
      supabaseUrl: config.supabaseUrl,
      publicSupabaseUrl: config.publicUrl,
      serviceRoleKey: config.serviceRoleKey,
    });
    return new SupabaseBlobStore({ config, transport });
  }

  const { createAwsS3Transport } = await import("./blobStoreS3Aws.ts");
  return new S3CompatibleBlobStore({
    config,
    transport: createAwsS3Transport(config),
  });
}
