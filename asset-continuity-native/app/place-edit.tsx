import {
  Stack,
  type Href,
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import { Check, Crosshair, Warning } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import {
  AppScreen,
  BodyText,
  CommandSurface,
  ErrorBanner,
  Field,
  PrimaryButton,
  ScreenTitle
} from "@/components/ui";
import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import { PlaceClassificationSelector } from "@/components/PlaceClassificationSelector";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import {
  placeClassification,
  type NativePlace,
  type PlaceClassification
} from "@/domain/model";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  getPlaceManagementCopy,
  isolateCoordinates,
  placeManagementErrorMessage
} from "@/i18n/placeManagementCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

export default function PlaceEditRoute() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const router = useRouter();
  const { language, rtl } = useLocale();
  const copy = getPlaceManagementCopy(language);
  const { can, workspace } = useWorkspace();
  const place = workspace?.places.find((item) => item.id === placeId);
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
      testID="place-edit-back"
    />
  );
  const stackOptions = rtl
    ? {
        title: copy.placeEdit.screenTitle,
        headerBackVisible: false,
        headerLeft: () => null,
        headerRight: backControl
      }
    : {
        title: copy.placeEdit.screenTitle,
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

  if (!workspace || !place) {
    return (
      <AppScreen safeEdges={[]} testID="place-edit-not-found">
        <Stack.Screen options={stackOptions} />
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <ScreenTitle size="medium">
            {copy.placeEdit.notFoundTitle}
          </ScreenTitle>
          <BodyText muted>{copy.placeEdit.notFoundBody}</BodyText>
        </View>
      </AppScreen>
    );
  }

  return (
    <>
      <Stack.Screen options={stackOptions} />
      <PlaceEditForm onDone={goBack} place={place} />
    </>
  );
}

function PlaceEditForm({
  onDone,
  place
}: {
  readonly onDone: () => void;
  readonly place: NativePlace;
}) {
  const navigation = useNavigation();
  const { language, rtl } = useLocale();
  const copy = getPlaceManagementCopy(language);
  const allowRemovalRef = useRef(false);
  const submittingRef = useRef(false);
  const {
    clearError,
    error,
    saving,
    updatePlaceBasics
  } = useWorkspace();
  const [name, setName] = useState(place.name);
  const [classification, setClassification] =
    useState<PlaceClassification>(placeClassification(place));
  const [regionLabel, setRegionLabel] = useState(place.regionLabel);
  const [addressSummary, setAddressSummary] = useState(
    place.addressSummary ?? ""
  );

  const hasDraft =
    name.trim() !== place.name ||
    classification !== placeClassification(place) ||
    regionLabel.trim() !== place.regionLabel ||
    (addressSummary.trim() || null) !== place.addressSummary;
  const canSave =
    hasDraft &&
    Boolean(name.trim()) &&
    Boolean(regionLabel.trim()) &&
    name.trim().length <= 80 &&
    regionLabel.trim().length <= 80 &&
    addressSummary.trim().length <= 240;

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!hasDraft || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(
          copy.placeEdit.discardTitle,
          copy.placeEdit.discardBody,
          [
            { text: copy.common.keepEditing, style: "cancel" },
            {
              text: copy.placeEdit.discardAction,
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
      await updatePlaceBasics({
        placeId: place.id,
        name,
        classification,
        regionLabel,
        addressSummary: addressSummary.trim() || null
      });
      allowRemovalRef.current = true;
      onDone();
    } catch {
      submittingRef.current = false;
      // WorkspaceProvider keeps the draft visible and reports the error.
    }
  };

  const coordinateLabel =
    place.latitude !== null && place.longitude !== null
      ? isolateCoordinates(place.latitude, place.longitude)
      : copy.placeEdit.noPin;

  return (
    <AppScreen
      footer={
        <PrimaryButton
          disabled={!canSave}
          icon={Check}
          label={copy.placeEdit.save}
          loading={saving}
          onPress={() => void save()}
        />
      }
      safeEdges={[]}
      testID="place-edit-screen"
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
          {copy.placeEdit.kicker}
        </Text>
        <ScreenTitle size="medium">{copy.placeEdit.heading}</ScreenTitle>
        <BodyText muted>{copy.placeEdit.body}</BodyText>
      </View>

      <View style={styles.fields}>
        <Field
          autoCapitalize="words"
          autoCorrect
          label={copy.placeEdit.nameLabel}
          maxLength={80}
          onChangeText={setName}
          placeholder={copy.placeEdit.namePlaceholder}
          returnKeyType="next"
          value={name}
        />
        <PlaceClassificationSelector
          onChange={setClassification}
          testID="place-edit-classification"
          value={classification}
        />
        <Field
          autoCapitalize="words"
          autoCorrect
          label={copy.placeEdit.regionLabel}
          maxLength={80}
          onChangeText={setRegionLabel}
          placeholder={copy.placeEdit.regionPlaceholder}
          returnKeyType="next"
          value={regionLabel}
        />
        <Field
          autoCapitalize="sentences"
          autoCorrect
          description={copy.placeEdit.addressDescription}
          label={copy.placeEdit.addressLabel}
          maxLength={240}
          multiline
          onChangeText={setAddressSummary}
          placeholder={copy.placeEdit.addressPlaceholder}
          style={styles.addressField}
          textAlignVertical="top"
          value={addressSummary}
        />
      </View>

      <CommandSurface>
        <View style={[styles.pinHeader, rtl && styles.rowReverse]}>
          <Crosshair color={colors.volt} size={22} />
          <View style={[styles.pinCopy, rtl && styles.alignEnd]}>
            <Text
              style={[
                styles.pinLabel,
                rtl && styles.arabicMedium,
                rtl && styles.rtlText
              ]}
            >
              {copy.placeEdit.pinPreserved}
            </Text>
            <Text
              selectable
              style={[
                styles.pinValue,
                rtl && styles.rtlText,
                place.latitude !== null &&
                  place.longitude !== null &&
                  styles.coordinateLtr
              ]}
            >
              {coordinateLabel}
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.pinTruth,
            rtl && styles.arabic,
            rtl && styles.rtlText
          ]}
        >
          {copy.placeEdit.source}: {copy.sourceLabels[place.locationSource]}.{" "}
          {copy.placeEdit.pinInstruction}
        </Text>
      </CommandSurface>

      <View style={[styles.localNote, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.localNoteTitle,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {copy.placeEdit.localTitle}
        </Text>
        <BodyText muted>{copy.placeEdit.localBody}</BodyText>
      </View>
    </AppScreen>
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
    letterSpacing: 1.1
  },
  fields: {
    gap: spacing.lg
  },
  addressField: {
    minHeight: 96
  },
  pinHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  pinCopy: {
    flex: 1,
    gap: 3
  },
  pinLabel: {
    color: colors.concrete,
    fontFamily: typography.bodyBold,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1
  },
  pinValue: {
    color: colors.white,
    fontFamily: typography.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    fontVariant: ["tabular-nums"]
  },
  pinTruth: {
    color: colors.concrete,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19
  },
  localNote: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  localNoteTitle: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  notFound: {
    gap: spacing.md,
    paddingVertical: spacing.xl
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
  coordinateLtr: {
    writingDirection: "ltr"
  },
  arabic: {
    fontFamily: typography.arabic
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  }
});
