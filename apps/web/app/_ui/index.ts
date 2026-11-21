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

// Group 2: data display, overlays, charts and the icon set (agent 0B3).
export { Icon } from "./Icon";
export type { IconName, IconSize } from "./Icon";
export { ICONS, FLIPS_IN_RTL } from "./icons";
export { Layer, closeOnEscape, focusStops, useOverlay } from "./overlay";
export { PhoneContext, useIsPhone, usePrefersReducedMotion } from "./env";
export { Table, BulkBar } from "./Table";
export type { TableColumn, TableProps, TablePhoneSlot, TableSelection } from "./Table";
export { Pager } from "./Pager";
export type { PagerStep } from "./Pager";
export { Drawer } from "./Drawer";
export { Modal, ConfirmDialog } from "./Modal";
export { Menu, ContextMenu, placeMenu } from "./Menu";
export type { MenuItem, MenuTriggerProps } from "./Menu";
export { ToastProvider, useToast } from "./Toast";
export type { ToastInput, ToastTone } from "./Toast";
export { Skeleton, SkeletonRows, SkeletonText } from "./Skeleton";
export { Area, Bars, Ring, Spark, Stack } from "./charts";
export type { StackTone } from "./charts";
export { CalendarGrid, CALENDAR_STATES } from "./CalendarGrid";
export type { CalendarBlock, CalendarResource, CalendarState } from "./CalendarGrid";
export { HourHeat } from "./HourHeat";
export type { HeatColumn } from "./HourHeat";
export { Composer } from "./Composer";
export type { ComposerMode } from "./Composer";
export { Workbench } from "./Workbench";
export type { WorkbenchPane } from "./Workbench";
export { PhoneFrame } from "./PhoneFrame";

// Pure logic (each has a node --test file).
export { ariaSort, moveRowFocus, nextSort, pageRange, pruneSelection, selectRange, selectionState, sortRows, toggleAll, toggleOne } from "./tableLogic";
export type { Selected, SortDir, SortState, SortValue } from "./tableLogic";
export { COMPACT_MINUTES, coveredMinutes, dayWindow, freeGaps, hourTicks, layoutLanes, nowOffset, placeSpan, toClock, toMinutes } from "./calendarLayout";
export { areaPolygon, barFractions, plotPoints, ringFraction, stackShares } from "./chartScale";
export { CLOSED as HEAT_CLOSED, heatLevel, heatMax } from "./heat";
export { EMPTY_QUEUE, dismissToast, durationFor, pushToast } from "./toastQueue";
