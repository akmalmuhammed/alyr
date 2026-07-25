import { useLocalSearchParams, useRouter } from "expo-router";
import { Buildings, Crosshair, MapPin, Warning } from "phosphor-react-native";
import { StyleSheet, Text, View } from "react-native";

import { AssetListItem } from "@/components/AssetListItem";
import {
  AppScreen,
  BodyText,
  Eyebrow,
  ScreenTitle,
  SectionHeader,
  StatusPill,
  Surface
} from "@/components/ui";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const place = workspace?.places.find((item) => item.id === id);
  if (!workspace || !place) {
    return (
      <AppScreen>
        <Surface>
          <Warning color={colors.warning} size={30} />
          <Text style={styles.sectionTitle}>Place not found</Text>
        </Surface>
      </AppScreen>
    );
  }
  const assets = workspace.assets.filter((asset) => asset.placeId === place.id);

  return (
    <AppScreen testID="place-screen">
      <View style={styles.placeHero}>
        <View style={styles.placeIcon}>
          <Buildings color={colors.cyan} size={38} weight="duotone" />
        </View>
        <StatusPill label={place.regionLabel} tone="cyan" />
        <ScreenTitle>{place.name}</ScreenTitle>
        <BodyText muted>
          {place.addressSummary || "No address summary recorded"}
        </BodyText>
      </View>

      <Surface>
        <View style={styles.pinRow}>
          <Crosshair color={colors.violetSoft} size={24} weight="duotone" />
          <View style={styles.pinCopy}>
            <Eyebrow>Property pin</Eyebrow>
            <Text style={styles.sectionTitle}>
              {place.latitude !== null ? place.precision : "Not set"}
            </Text>
          </View>
        </View>
        <BodyText muted>
          {place.latitude !== null
            ? place.horizontalAccuracyMeters !== null
              ? `Device GPS measured ±${Math.round(place.horizontalAccuracyMeters)} m. Confirm the building pin before treating it as exact.`
              : "This is a user-placed pin. No measured GPS accuracy is claimed."
            : "The locality label is not an exact property pin."}
        </BodyText>
      </Surface>

      <View style={styles.section}>
        <SectionHeader title={`Spaces · ${place.rooms.length}`} />
        {place.rooms.length > 0 ? (
          place.rooms.map((room) => {
            const count = assets.filter(
              (asset) => asset.roomId === room.id
            ).length;
            return (
              <View key={room.id} style={styles.roomRow}>
                <View style={styles.roomGlyph}>
                  <MapPin color={colors.violetSoft} size={19} />
                </View>
                <View style={styles.roomCopy}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomMeta}>
                    {room.kind} · {count} assets
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <BodyText muted>
            Add a room, zone, or container during the next capture.
          </BodyText>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={`Assets · ${assets.length}`} />
        {assets.length > 0 ? (
          assets.map((asset) => (
            <AssetListItem
              asset={asset}
              evidence={workspace.evidence}
              key={asset.id}
              onPress={() => router.push(`/asset/${asset.id}`)}
              places={workspace.places}
            />
          ))
        ) : (
          <BodyText muted>No assets are assigned to this Place yet.</BodyText>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  placeHero: {
    alignItems: "flex-start",
    gap: spacing.sm
  },
  placeIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 216, 245, 0.25)",
    borderRadius: radius.lg,
    backgroundColor: colors.cyanQuiet
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  pinCopy: {
    flex: 1,
    gap: 3
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 24
  },
  roomRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  roomGlyph: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.violetQuiet
  },
  roomCopy: {
    flex: 1,
    gap: 2
  },
  roomName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15
  },
  roomMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12
  }
});
