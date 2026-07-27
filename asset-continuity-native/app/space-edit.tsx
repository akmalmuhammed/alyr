import {
  Stack,
  type Href,
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import { Check, Cube, Warning } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  AppScreen,
  BodyText,
  ErrorBanner,
  Field,
  PrimaryButton,
  ScreenTitle
} from "@/components/ui";
import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import type {
  NativePlace,
  NativeRoom
} from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  formatSpaceKind,
  getPlaceManagementCopy,
  placeManagementErrorMessage,
  spaceUsageSummary
} from "@/i18n/placeManagementCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, radius, spacing, typography } from "@/theme/tokens";

const SPACE_KINDS: readonly NativeRoom["kind"][] = [
  "room",
  "zone",
  "container"
];

export default function SpaceEditRoute() {
  const { placeId, roomId } = useLocalSearchParams<{
    placeId?: string;
    roomId?: string;
  }>();
  const router = useRouter();
  const { language, rtl } = useLocale();
  const copy = getPlaceManagementCopy(language);
  const { can, workspace } = useWorkspace();
  const place = workspace?.places.find((item) => item.id === placeId);
  const room = place?.rooms.find((item) => item.id === roomId) ?? null;
  const requestedExisting = Boolean(roomId);
  const fallback: Href = placeId
    ? (`/place/${encodeURIComponent(placeId)}` as Href)
    : "/(tabs)";
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  };
  const backControl = () => (
    <LocalizedRouteBack
      label={copy.common.back}
      onPress={goBack}
      rtl={rtl}
      testID="space-edit-back"
    />
  );
  const stackOptions = rtl
    ? {
        title: room
          ? copy.spaceEdit.screenTitleEdit
          : copy.spaceEdit.screenTitleCreate,
        headerBackVisible: false,
        headerLeft: () => null,
        headerRight: backControl
      }
    : {
        title: room
          ? copy.spaceEdit.screenTitleEdit
          : copy.spaceEdit.screenTitleCreate,
        headerBackVisible: false,
        headerLeft: backControl,
        headerRight: () => null
      };

  if (!can("place.write")) {
    return (
      <>
        <Stack.Screen options={stackOptions} />
        <PermissionDeniedScreen capability="place.write" />
      </>
    );
  }

  if (!workspace || !place || (requestedExisting && !room)) {
    return (
      <AppScreen safeEdges={[]} testID="space-edit-not-found">
        <Stack.Screen options={stackOptions} />
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <ScreenTitle size="medium">
            {copy.spaceEdit.notFoundTitle}
          </ScreenTitle>
          <BodyText muted>{copy.spaceEdit.notFoundBody}</BodyText>
        </View>
      </AppScreen>
    );
  }

  return (
    <>
      <Stack.Screen options={stackOptions} />
      <SpaceEditForm onDone={goBack} place={place} room={room} />
    </>
  );
}

function descendantIds(
  rooms: readonly NativeRoom[],
  roomId: string
): ReadonlySet<string> {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const room of rooms) {
      if (
        room.parentRoomId &&
        (room.parentRoomId === roomId || result.has(room.parentRoomId)) &&
        !result.has(room.id)
      ) {
        result.add(room.id);
        changed = true;
      }
    }
  }
  return result;
}

function SpaceEditForm({
  onDone,
  place,
  room
}: {
  readonly onDone: () => void;
  readonly place: NativePlace;
  readonly room: NativeRoom | null;
}) {
  const navigation = useNavigation();
  const { language, rtl } = useLocale();
  const copy = getPlaceManagementCopy(language);
  const allowRemovalRef = useRef(false);
  const submittingRef = useRef(false);
  const {
    clearError,
    createPlaceSpace,
    error,
    saving,
    updatePlaceSpace,
    workspace
  } = useWorkspace();
  const [name, setName] = useState(room?.name ?? "");
  const [kind, setKind] = useState<NativeRoom["kind"]>(
    room?.kind ?? "room"
  );
  const [parentRoomId, setParentRoomId] = useState<string | null>(
    room?.parentRoomId ?? null
  );

  const blockedParentIds = useMemo(
    () => (room ? descendantIds(place.rooms, room.id) : new Set<string>()),
    [place.rooms, room]
  );
  const parentCandidates = place.rooms.filter(
    (candidate) =>
      candidate.id !== room?.id && !blockedParentIds.has(candidate.id)
  );
  const hasDraft = room
    ? name.trim() !== room.name ||
      kind !== room.kind ||
      parentRoomId !== room.parentRoomId
    : Boolean(name.trim()) || kind !== "room" || parentRoomId !== null;
  const canSave =
    Boolean(name.trim()) &&
    name.trim().length <= 80 &&
    (room ? hasDraft : true);
  const itemCount = room
    ? workspace?.assets.filter(
        (asset) => asset.placeId === place.id && asset.roomId === room.id
      ).length ?? 0
    : 0;

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!hasDraft || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(
          copy.spaceEdit.discardTitle,
          copy.spaceEdit.discardBody,
          [
            { text: copy.common.keepEditing, style: "cancel" },
            {
              text: copy.spaceEdit.discardAction,
              style: "destructive",
              onPress: () => {
                allowRemovalRef.current = true;
                navigation.dispatch(event.data.action);
              }
            }
          ]
        );
      }),
    [copy, hasDraft, navigation]
  );

  const save = async () => {
    if (!canSave || submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (room) {
        await updatePlaceSpace({
          placeId: place.id,
          roomId: room.id,
          name,
          kind,
          parentRoomId
        });
      } else {
        await createPlaceSpace({
          placeId: place.id,
          name,
          kind,
          parentRoomId
        });
      }
      allowRemovalRef.current = true;
      onDone();
    } catch {
      submittingRef.current = false;
      // WorkspaceProvider preserves the draft and reports the error.
    }
  };

  return (
    <AppScreen
      footer={
        <PrimaryButton
          disabled={!canSave}
          icon={Check}
          label={room ? copy.spaceEdit.save : copy.spaceEdit.add}
          loading={saving}
          onPress={() => void save()}
        />
      }
      safeEdges={[]}
      testID={room ? "space-edit-screen" : "space-create-screen"}
    >
      {error ? (
        <ErrorBanner
          message={placeManagementErrorMessage(error, language)}
          onDismiss={clearError}
        />
      ) : null}
      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.kicker,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {language === "en" ? place.name.toUpperCase() : place.name}
        </Text>
        <ScreenTitle size="medium">
          {room
            ? copy.spaceEdit.headingEdit
            : copy.spaceEdit.headingCreate}
        </ScreenTitle>
        <BodyText muted>
          {room
            ? spaceUsageSummary(itemCount, language)
            : copy.spaceEdit.createBody}
        </BodyText>
      </View>

      <Field
        autoCapitalize="words"
        autoCorrect
        label={copy.spaceEdit.nameLabel}
        maxLength={80}
        onChangeText={setName}
        placeholder={copy.spaceEdit.namePlaceholder}
        returnKeyType="done"
        value={name}
      />

      <View style={styles.group}>
        <Text
          style={[
            styles.groupLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.spaceEdit.type}
        </Text>
        <View accessibilityRole="radiogroup" style={styles.kindGrid}>
          {SPACE_KINDS.map((kindId) => {
            const active = kind === kindId;
            const option = copy.spaceEdit.kinds[kindId];
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                key={kindId}
                onPress={() => setKind(kindId)}
                style={({ pressed }) => [
                  styles.kindOption,
                  active && styles.kindOptionActive,
                  rtl && styles.alignEnd,
                  pressed && styles.pressed
                ]}
              >
                <Text
                  style={[
                    styles.kindLabel,
                    rtl && styles.arabicMedium,
                    rtl && styles.rtlText
                  ]}
                >
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.kindDescription,
                    rtl && styles.arabic,
                    rtl && styles.rtlText
                  ]}
                >
                  {option.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text
          style={[
            styles.groupLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.spaceEdit.inside}
        </Text>
        <BodyText muted>{copy.spaceEdit.insideBody}</BodyText>
        <View accessibilityRole="radiogroup" style={styles.parentList}>
          <ParentOption
            active={parentRoomId === null}
            label={copy.spaceEdit.topLevel}
            meta={copy.spaceEdit.noParent}
            onPress={() => setParentRoomId(null)}
            rtl={rtl}
          />
          {parentCandidates.map((candidate) => (
            <ParentOption
              active={parentRoomId === candidate.id}
              key={candidate.id}
              label={candidate.name}
              meta={formatSpaceKind(candidate.kind, language)}
              onPress={() => setParentRoomId(candidate.id)}
              rtl={rtl}
            />
          ))}
        </View>
      </View>

      <View style={[styles.localNote, rtl && styles.rowReverse]}>
        <Cube color={colors.text} size={21} />
        <View style={[styles.localCopy, rtl && styles.alignEnd]}>
          <Text
            style={[
              styles.localTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.spaceEdit.localTitle}
          </Text>
          <BodyText muted>
            {room
              ? copy.spaceEdit.localBodyEdit
              : copy.spaceEdit.localBodyCreate}
          </BodyText>
        </View>
      </View>
    </AppScreen>
  );
}

function ParentOption({
  active,
  label,
  meta,
  onPress,
  rtl
}: {
  readonly active: boolean;
  readonly label: string;
  readonly meta: string;
  readonly onPress: () => void;
  readonly rtl: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.parentOption,
        active && styles.parentOptionActive,
        rtl && styles.rowReverse,
        pressed && styles.pressed
      ]}
    >
      <View style={[styles.parentCopy, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.parentLabel,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.parentMeta,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {meta}
        </Text>
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <Check color={colors.carbon} size={13} weight="bold" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: typography.bodyBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1
  },
  group: {
    gap: spacing.sm
  },
  groupLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    lineHeight: 20
  },
  kindGrid: {
    gap: spacing.xs
  },
  kindOption: {
    minHeight: 64,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface
  },
  kindOptionActive: {
    borderWidth: 2,
    borderColor: colors.carbon,
    paddingHorizontal: spacing.md - 1,
    paddingVertical: spacing.sm - 1
  },
  kindLabel: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  kindDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  parentList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  parentOption: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  parentOptionActive: {
    borderBottomColor: colors.carbon
  },
  parentCopy: {
    flex: 1,
    gap: 2
  },
  parentLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 20
  },
  parentMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 17
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.round
  },
  radioActive: {
    borderColor: colors.action,
    backgroundColor: colors.action
  },
  localNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  localCopy: {
    flex: 1,
    gap: 3
  },
  localTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  notFound: {
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  pressed: {
    opacity: 0.64
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  rowReverse: {
    flexDirection: "row-reverse"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  }
});
