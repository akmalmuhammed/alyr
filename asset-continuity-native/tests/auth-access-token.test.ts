import { createUserAccessTokenProvider } from "@/auth/accessToken";
import { createPreviewAuthGateway } from "@/auth/adapters/preview";
import type { AccountAuthGateway } from "@/auth/types";

describe("user access-token transport adapter", () => {
  it("fetches a fresh trimmed bearer for each transport request", async () => {
    const currentAccessToken = jest
      .fn<
        ReturnType<AccountAuthGateway["currentAccessToken"]>,
        Parameters<AccountAuthGateway["currentAccessToken"]>
      >()
      .mockResolvedValueOnce({
        ok: true,
        value: " token-one "
      })
      .mockResolvedValueOnce({
        ok: true,
        value: "token-two"
      });
    const gateway: AccountAuthGateway = {
      ...createPreviewAuthGateway(),
      mode: "supabase",
      currentAccessToken
    };
    const getAccessToken = createUserAccessTokenProvider(gateway);

    await expect(getAccessToken()).resolves.toBe("token-one");
    await expect(getAccessToken()).resolves.toBe("token-two");
    expect(currentAccessToken).toHaveBeenCalledTimes(2);
  });

  it("never invents a bearer for the Expo Go preview", async () => {
    const getAccessToken = createUserAccessTokenProvider(
      createPreviewAuthGateway()
    );

    await expect(getAccessToken()).rejects.toThrow(
      "No verified account access token"
    );
  });
});
