import type { ReactNode } from "react";

import type {
  ConfirmedPlacePinEditorValue,
  PlacePinEditorLabels,
  PlacePinEditorValue
} from "./contract";

export interface PlacePinEditorProps {
  readonly value: PlacePinEditorValue | null;
  /**
   * Called for an unconfirmed draft after GPS selection, manual entry, drag,
   * or removal. The parent remains the single source of truth.
   */
  readonly onChange: (value: PlacePinEditorValue | null) => void;
  /**
   * Called only after the user presses the explicit confirmation action.
   * The returned value includes `confirmedAt`; the parent must persist it and
   * feed it back through `value`.
   */
  readonly onConfirm: (value: ConfirmedPlacePinEditorValue) => void;
  /**
   * Optional platform location request. The component normalizes the result to
   * approximate device GPS provenance and clears any premature confirmation.
   */
  readonly onRequestCurrentLocation?: () => Promise<PlacePinEditorValue | null>;
  readonly language?: "en" | "ar";
  readonly labels?: Partial<PlacePinEditorLabels>;
  readonly disabled?: boolean;
  readonly testID?: string;
  readonly now?: () => string;
  readonly headerAccessory?: ReactNode;
}

export type {
  ConfirmedPlacePinEditorValue,
  CoordinateInputErrors,
  PlacePinEditorLabels,
  PlacePinEditorValue,
  PlacePinPrecision,
  PlacePinSource,
  PlacePinTruth
} from "./contract";
