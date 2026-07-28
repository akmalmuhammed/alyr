import { Check, X } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useReduceMotionPreference } from "@/accessibility/useReduceMotionPreference";
import { PrimaryButton } from "@/components/ui";
import type { RegisterCopy } from "@/i18n/registerCopy";
import type {
  AssetFilter,
  CollectionView,
  ItemGroup,
  ItemSort,
  PlaceGroup,
  PlaceSort
} from "@/register/browse";
import { colors, radius, spacing, typography } from "@/theme/tokens";

interface Choice<T extends string> {
  readonly label: string;
  readonly value: T;
}

export function RegisterOrganizerModal({
  copy,
  filter,
  itemGroup,
  itemSort,
  onClose,
  onFilterChange,
  onItemGroupChange,
  onItemSortChange,
  onPlaceGroupChange,
  onPlaceSortChange,
  open,
  placeGroup,
  placeSort,
  rtl,
  view
}: {
  readonly copy: RegisterCopy;
  readonly filter: AssetFilter;
  readonly itemGroup: ItemGroup;
  readonly itemSort: ItemSort;
  readonly onClose: () => void;
  readonly onFilterChange: (value: AssetFilter) => void;
  readonly onItemGroupChange: (value: ItemGroup) => void;
  readonly onItemSortChange: (value: ItemSort) => void;
  readonly onPlaceGroupChange: (value: PlaceGroup) => void;
  readonly onPlaceSortChange: (value: PlaceSort) => void;
  readonly open: boolean;
  readonly placeGroup: PlaceGroup;
  readonly placeSort: PlaceSort;
  readonly rtl: boolean;
  readonly view: CollectionView;
}) {
  const reduceMotion = useReduceMotionPreference();
  const titleRef = useRef<Text>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, reduceMotion ? 0 : 320);
    return () => clearTimeout(timer);
  }, [open, reduceMotion]);

  const filterChoices = (
    Object.keys(copy.filters) as AssetFilter[]
  ).map((value) => ({ label: copy.filters[value], value }));
  const itemSortChoices = (
    Object.keys(copy.itemSorts) as ItemSort[]
  ).map((value) => ({ label: copy.itemSorts[value], value }));
  const itemGroupChoices = (
    Object.keys(copy.itemGroups) as ItemGroup[]
  ).map((value) => ({ label: copy.itemGroups[value], value }));
  const placeSortChoices = (
    Object.keys(copy.placeSorts) as PlaceSort[]
  ).map((value) => ({ label: copy.placeSorts[value], value }));
  const placeGroupChoices = (
    Object.keys(copy.placeGroups) as PlaceGroup[]
  ).map((value) => ({ label: copy.placeGroups[value], value }));

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent={false}
      visible={open}
    >
      <SafeAreaView style={styles.safeArea}>
        <View
          accessibilityViewIsModal
          style={styles.modal}
          testID="register-organizer"
        >
          <View style={[styles.header, rtl && styles.rowReverse]}>
            <View style={styles.headerCopy}>
              <Text
                accessibilityRole="header"
                ref={titleRef}
                style={[
                  styles.title,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {copy.organizerTitle}
              </Text>
              <Text
                style={[
                  styles.intro,
                  rtl && styles.arabic,
                  rtl && styles.rtlText
                ]}
              >
                {copy.organizerIntro}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={copy.close}
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.close,
                pressed && styles.pressed
              ]}
            >
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {view === "items" ? (
              <ChoiceGroup
                choices={filterChoices}
                label={copy.filterBy}
                onChange={onFilterChange}
                rtl={rtl}
                value={filter}
              />
            ) : null}
            <ChoiceGroup
              choices={
                view === "items" ? itemSortChoices : placeSortChoices
              }
              label={copy.sortBy}
              onChange={
                view === "items"
                  ? (value) => onItemSortChange(value as ItemSort)
                  : (value) => onPlaceSortChange(value as PlaceSort)
              }
              rtl={rtl}
              value={view === "items" ? itemSort : placeSort}
            />
            <ChoiceGroup
              choices={
                view === "items" ? itemGroupChoices : placeGroupChoices
              }
              label={copy.groupBy}
              onChange={
                view === "items"
                  ? (value) => onItemGroupChange(value as ItemGroup)
                  : (value) => onPlaceGroupChange(value as PlaceGroup)
              }
              rtl={rtl}
              value={view === "items" ? itemGroup : placeGroup}
            />
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton label={copy.done} onPress={onClose} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ChoiceGroup<T extends string>({
  choices,
  label,
  onChange,
  rtl,
  value
}: {
  readonly choices: readonly Choice<T>[];
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly rtl: boolean;
  readonly value: T;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      <Text
        accessibilityRole="header"
        style={[
          styles.groupLabel,
          rtl && styles.arabicMedium,
          rtl && styles.rtlText
        ]}
      >
        {label}
      </Text>
      <View style={styles.choices}>
        {choices.map((choice, index) => {
          const selected = value === choice.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={choice.value}
              onPress={() => onChange(choice.value)}
              style={({ pressed }) => [
                styles.choice,
                rtl && styles.rowReverse,
                index === choices.length - 1 && styles.choiceLast,
                selected && styles.choiceSelected,
                pressed && styles.pressed
              ]}
            >
              <Text
                style={[
                  styles.choiceLabel,
                  selected && styles.choiceLabelSelected,
                  rtl && styles.arabicMedium,
                  rtl && styles.rtlText
                ]}
              >
                {choice.label}
              </Text>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.selection,
                  selected && styles.selectionSelected
                ]}
              >
                {selected ? (
                  <Check
                    color={colors.carbon}
                    size={15}
                    weight="bold"
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  modal: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs
  },
  title: {
    color: colors.text,
    fontFamily: typography.displayBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5
  },
  intro: {
    maxWidth: 520,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md
  },
  body: {
    gap: spacing.xl,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl
  },
  group: {
    gap: spacing.sm
  },
  groupLabel: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  choices: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  choice: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  choiceSelected: {
    backgroundColor: colors.voltQuiet
  },
  choiceLast: {
    borderBottomWidth: 0
  },
  choiceLabel: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 22
  },
  choiceLabelSelected: {
    color: colors.text,
    fontFamily: typography.bodyMedium
  },
  selection: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  selectionSelected: {
    borderColor: colors.volt,
    backgroundColor: colors.volt
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.canvas
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  pressed: {
    opacity: 0.72
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium,
    letterSpacing: 0
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  }
});
