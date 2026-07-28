import { AssetMutationValidationError } from "@alyr/domain";

import { getCaptureCopy } from "@/i18n/captureCopy";
import { localizedAssetMutationRecovery } from "@/i18n/assetMutationCopy";

describe("Asset mutation recovery localization", () => {
  it.each(["en", "ar"] as const)(
    "maps stable boundary reasons to specific %s recovery copy",
    (language) => {
      const copy = getCaptureCopy(language);

      expect(
        localizedAssetMutationRecovery(
          new AssetMutationValidationError({
            code: "ASSET_NAME_REQUIRED",
            field: "name"
          }),
          language
        )
      ).toEqual({
        step: 0,
        field: "name",
        message: copy.nameError
      });
      expect(
        localizedAssetMutationRecovery(
          new AssetMutationValidationError({
            code: "ASSET_SPACE_INVALID",
            field: "space"
          }),
          language
        )
      ).toEqual({
        step: 1,
        field: "location",
        message: copy.exactLocationError
      });
    }
  );

  it("keeps invalid file recovery on the relevant capture step", () => {
    const copy = getCaptureCopy("en");
    const photo = localizedAssetMutationRecovery(
      new AssetMutationValidationError({
        code: "ASSET_FILE_METADATA_INVALID",
        field: "photo",
        fileRole: "photo"
      }),
      "en"
    );
    const evidence = localizedAssetMutationRecovery(
      new AssetMutationValidationError({
        code: "ASSET_FILE_SIZE_INVALID",
        field: "evidence",
        fileRole: "evidence"
      }),
      "en"
    );

    expect(photo).toEqual({
      step: 0,
      field: "photo",
      message: `${copy.photoFailed}. ${copy.photoFailedRecovery}`
    });
    expect(evidence).toEqual({
      step: 2,
      field: "evidence",
      message: `${copy.documentFailed}. ${copy.documentFailedRecovery}`
    });
  });
});
