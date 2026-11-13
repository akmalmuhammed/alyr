// The product UI kit (see README.md for what each export is for, and never for).
// Group 1: controls and content blocks. Group 2 appends its exports below.

export { UiRoot, useUi, useUiHost } from "./UiRoot";
export type { UiLang } from "./UiRoot";
export { UiIcon } from "./UiIcon";
export type { UiIconName } from "./UiIcon";

export { Button, IconButton } from "./Button";
export type { ButtonProps } from "./Button";
export { Dot, Status, Tag } from "./Tag";
export { Chip } from "./Chip";
export { Tabs, UTabs, tabId, tabPanelId } from "./Tabs";
export type { TabItem } from "./Tabs";
export { Check, Field, FormSection, Input, Kbd, Radio, Search, Select, Textarea, Toggle } from "./Fields";
export { Panel, PanelBody, PanelFooter, PanelHeader } from "./Panel";
export { Band, BandItem, Stat } from "./Stat";
export type { DeltaTone } from "./Stat";
export { KV, KVList } from "./KV";
export { Banner } from "./Banner";
export { DashedSlot, Empty } from "./Empty";
export { Steps, Timeline } from "./Timeline";
export type { TimelineItem, TimelineTone } from "./Timeline";
export { Avatar, Thumb } from "./Avatar";
export { PageTitle, Section, SectionLabel } from "./PageTitle";
export { Meter } from "./Meter";

export {
  buttonClass, cx, initials, meterPercent, nextTabIndex, shopColour, stepState,
} from "./variants";
export type {
  BannerTone, ButtonKind, ButtonSize, DotTone, MeterTone, StatusTone, StepState, TagTone,
} from "./variants";
