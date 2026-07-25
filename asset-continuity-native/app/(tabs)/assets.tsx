import { useRouter } from "expo-router";
import {
  Archive,
  Camera,
  FunnelSimple,
  MagnifyingGlass,
  Plus
} from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AssetListItem } from "@/components/AssetListItem";
import {
  AppScreen,
  BodyText,
  IconButton,
  PrimaryButton,
  ScreenTitle,
  StatusPill,
  Surface
} from "@/components/ui";
import { useCopy } from "@/i18n/copy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

type AssetFilter = "all" | "location" | "evidence";

export default function AssetsScreen() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { text, rtl } = useCopy();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetFilter>("all");

  const filteredAssets = useMemo(() => {
    if (!workspace) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return workspace.assets.filter((asset) => {
      const matchesQuery =
        !normalizedQuery ||
        [asset.name, asset.categoryLabel, asset.locatorText]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery));
      const matchesFilter =
        filter === "all" ||
        (filter === "location" && asset.locationStatus !== "known") ||
        (filter === "evidence" && asset.evidenceIds.length === 0);
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, workspace]);

  if (!workspace) {
    return null;
  }

  return (
    <AppScreen testID="assets-screen">
      <View style={[styles.header, rtl && styles.rowReverse]}>
        <View style={styles.headerCopy}>
          <StatusPill label={`${workspace.assets.length} Passports`} tone="cyan" />
          <ScreenTitle>{text.assets}</ScreenTitle>
          <BodyText muted>
            Search by identity, category, or retrieval location.
          </BodyText>
        </View>
        <IconButton
          icon={Camera}
          label={text.captureAsset}
          onPress={() => router.push("/capture")}
        />
      </View>

      <View style={styles.searchWrap}>
        <MagnifyingGlass
          color={colors.textMuted}
          size={20}
          style={styles.searchIcon}
        />
        <TextInput
          accessibilityLabel="Search assets"
          onChangeText={setQuery}
          placeholder="Search your private register"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.cyan}
          style={[styles.searchInput, rtl && styles.textRight]}
          value={query}
        />
      </View>

      <View
        accessibilityRole="radiogroup"
        style={[styles.filters, rtl && styles.rowReverse]}
      >
        <FilterChip
          active={filter === "all"}
          label="All"
          onPress={() => setFilter("all")}
        />
        <FilterChip
          active={filter === "location"}
          label="Location needed"
          onPress={() => setFilter("location")}
        />
        <FilterChip
          active={filter === "evidence"}
          label="Proof gaps"
          onPress={() => setFilter("evidence")}
        />
      </View>

      {filteredAssets.length > 0 ? (
        <View>
          {filteredAssets.map((asset) => (
            <AssetListItem
              asset={asset}
              evidence={workspace.evidence}
              key={asset.id}
              onPress={() => router.push(`/asset/${asset.id}`)}
              places={workspace.places}
            />
          ))}
        </View>
      ) : workspace.assets.length === 0 ? (
        <Surface style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Archive color={colors.violetSoft} size={32} weight="duotone" />
          </View>
          <Text style={styles.emptyTitle}>{text.noAssets}</Text>
          <BodyText muted>
            Start with one important item. You can leave unknown facts visible
            and improve the Passport later.
          </BodyText>
          <PrimaryButton
            icon={Plus}
            label={text.addFirst}
            onPress={() => router.push("/capture")}
          />
        </Surface>
      ) : (
        <Surface style={styles.empty}>
          <FunnelSimple color={colors.textMuted} size={30} />
          <Text style={styles.emptyTitle}>No matching Passports</Text>
          <BodyText muted>
            Adjust the search or filter. Your private query is never written to
            product analytics.
          </BodyText>
        </Surface>
      )}
    </AppScreen>
  );
}

function FilterChip({
  active,
  label,
  onPress
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        active && styles.filterActive,
        pressed && styles.pressed
      ]}
    >
      <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowReverse: { flexDirection: "row-reverse" },
  textRight: { textAlign: "right" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  headerCopy: {
    flex: 1,
    gap: spacing.sm
  },
  searchWrap: {
    position: "relative",
    minHeight: 54,
    justifyContent: "center"
  },
  searchIcon: {
    position: "absolute",
    left: spacing.md,
    zIndex: 1
  },
  searchInput: {
    minHeight: 54,
    paddingLeft: 48,
    paddingRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontFamily: typography.body,
    fontSize: 16
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  filter: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    backgroundColor: colors.surface
  },
  filterActive: {
    borderColor: "rgba(139, 92, 246, 0.46)",
    backgroundColor: colors.violetQuiet
  },
  filterLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13
  },
  filterLabelActive: {
    color: colors.violetSoft
  },
  pressed: {
    opacity: 0.7
  },
  empty: {
    alignItems: "flex-start",
    paddingVertical: spacing.xl
  },
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.violetQuiet
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    lineHeight: 27
  }
});
