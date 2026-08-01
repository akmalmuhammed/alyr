import type { ReactElement } from "react";

import type { PlacePinEditorProps } from "./types";

export declare const OPENFREEMAP_LIBERTY_STYLE_URL: string;
export declare const MAP_LOAD_TIMEOUT_MS: number;

export declare function PlacePinEditor(
  props: PlacePinEditorProps
): ReactElement;

export * from "./contract";
export type { PlacePinEditorProps } from "./types";
