import {
  Stack,
  type Href,
  useLocalSearchParams,
  useNavigation,
  useRouter
} from "expo-router";
import { Check, Warning } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";

import { readCurrentLocation } from "@/adapters/location";
import {
  PlacePinEditor,
  type PlacePinEditorValue
} from "@/components/PlacePinEditor";
import { LocalizedRouteBack } from "@/components/LocalizedRouteBack";
import {
  AppScreen,
  BodyText,
  ErrorBanner,
  PrimaryButton,
  ScreenTitle
} from "@/components/ui";
import { PermissionDeniedScreen } from "@/components/PermissionDenied";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  getPlaceManagementCopy,
  placeManagementErrorMessage
} from "@/i18n/placeManagementCopy";
import { useWorkspace } from "@/state/WorkspaceProvider";
import { colors, spacing, typography } from "@/theme/tokens";

function placeValue(
  place:
    | {
        readonly latitude: number | null;
        readonly longitude: number | null;
        readonly locationSource:
          | "device_gps"
          | "user_pin"
          | "manual_coordinates"
          | "not_set";
        readonly precision:
          | "exact"
          | "user_placed"
          | "approximate"
          | "locality_only";
        readonly horizontalAccuracyMeters: number | null;
        readonly observedAt: string | null;
        readonly confirmedAt: string | null;
        readonly updatedAt: string;
      }
    | undefined
): PlacePinEditorValue | null {
  if (
    !place ||
    place.latitude === null ||
    place.longitude === null ||
    place.locationSource === "not_set" ||
    place.precision === "locality_only"
  ) {
    return null;
  }
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    source: place.locationSource,
    precision: place.precision,
    horizontalAccuracyMeters: place.horizontalAccuracyMeters,
    observedAt: place.observedAt ?? place.updatedAt,
    confirmedAt: place.confirmedAt
  };
}

function pinSignature(pin: PlacePinEditorValue | null): string {
  return pin
    ? [
        pin.latitude,
        pin.longitude,
        pin.source,
        pin.precision,
        pin.horizontalAccuracyMeters,
        pin.observedAt,
        pin.confirmedAt
      ].join("|")
    : "none";
}

export default function PlacePinScreen() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { language, rtl } = useLocale();
  const copy = getPlaceManagementCopy(language);
  const allowRemovalRef = useRef(false);
  const {
    workspace,
    can,
    saving,
    error,
    clearError,
    updatePlacePin
  } = useWorkspace();
  const place = workspace?.places.find((item) => item.id === placeId);
  const initialPin = useMemo(() => placeValue(place), [place]);
  const initialSignature = useMemo(
    () => pinSignature(initialPin),
    [initialPin]
  );
  const [pin, setPin] = useState<PlacePinEditorValue | null>(initialPin);
  const dirty = pinSignature(pin) !== initialSignature;
  const needsConfirmation = pin !== null && pin.confirmedAt === null;
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
      testID="place-pin-back"
    />
  );
  const stackOptions = rtl
    ? {
        title: copy.placePin.screenTitle,
        headerBackVisible: false,
        headerLeft: () => null,
        headerRight: backControl
      }
    : {
        title: copy.placePin.screenTitle,
        headerBackVisible: false,
        headerLeft: backControl,
        headerRight: () => null
      };

  useEffect(() => {
    setPin(initialPin);
  }, [initialSignature]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!dirty || allowRemovalRef.current) return;
        event.preventDefault();
        Alert.alert(
          copy.placePin.discardTitle,
          copy.placePin.discardBody,
          [
            { text: copy.common.keepEditing, style: "cancel" },
            {
              text: copy.common.discard,
              style: "destructive",
              onPress: () => {
                allowRemovalRef.current = true;
                navigation.dispatch(event.data.action);
              }
            }
          ]
        );
      }),
    [copy, dirty, navigation]
  );

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
      <AppScreen safeEdges={[]} testID="place-pin-not-found">
        <Stack.Screen options={stackOptions} />
        <View style={[styles.notFound, rtl && styles.alignEnd]}>
          <Warning color={colors.warning} size={32} />
          <Text
            style={[
              styles.notFoundTitle,
              rtl && styles.arabicMedium,
              rtl && styles.rtlText
            ]}
          >
            {copy.placePin.notFoundTitle}
          </Text>
          <BodyText muted>{copy.placePin.notFoundBody}</BodyText>
        </View>
      </AppScreen>
    );
  }

  const requestCurrentLocation =
    async (): Promise<PlacePinEditorValue | null> => {
      const outcome = await readCurrentLocation();
      if (outcome.ok) return outcome.pin;
      if (outcome.reason === "permission") {
        Alert.alert(
          copy.placePin.permissionTitle,
          copy.placePin.permissionBody,
          [
            { text: copy.placePin.notNow, style: "cancel" },
            {
              text: copy.placePin.openSettings,
              onPress: () => void Linking.openSettings()
            }
          ]
        );
      }
      return null;
    };

  const save = async () => {
    if (needsConfirmation) {
      Alert.alert(
        copy.placePin.confirmationTitle,
        copy.placePin.confirmationBody
      );
      return;
    }
    try {
      await updatePlacePin({
        placeId: place.id,
        pin
      });
      allowRemovalRef.current = true;
      goBack();
    } catch {
      // WorkspaceProvider exposes the actionable message in its error banner.
    }
  };

  return (
    <AppScreen
      footer={
        <PrimaryButton
          disabled={!dirty || needsConfirmation}
          icon={Check}
          label={pin ? copy.placePin.save : copy.placePin.saveWithoutPin}
          loading={saving}
          onPress={() => void save()}
        />
      }
      safeEdges={[]}
      testID="place-pin-screen"
    >
      <Stack.Screen options={stackOptions} />
      <View style={[styles.heading, rtl && styles.alignEnd]}>
        <Text
          style={[
            styles.eyebrow,
            rtl && styles.arabicMedium,
            rtl && styles.rtlText
          ]}
        >
          {place.regionLabel}
        </Text>
        <ScreenTitle size="medium">{place.name}</ScreenTitle>
        <BodyText muted>{copy.placePin.body}</BodyText>
      </View>

      {error ? (
        <ErrorBanner
          message={placeManagementErrorMessage(error, language)}
          onDismiss={clearError}
        />
      ) : null}

      <PlacePinEditor
        language={language}
        onChange={setPin}
        onConfirm={setPin}
        onRequestCurrentLocation={requestCurrentLocation}
        value={pin}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.xs
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  notFound: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  notFoundTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    lineHeight: 28
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl"
  },
  arabicMedium: {
    fontFamily: typography.arabicMedium
  }
});
