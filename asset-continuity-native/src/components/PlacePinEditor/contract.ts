export type PlacePinSource =
  | "device_gps"
  | "user_pin"
  | "manual_coordinates";

export type PlacePinPrecision = "exact" | "user_placed" | "approximate";

/**
 * A pin is a claim with provenance, not just a pair of numbers.
 *
 * `horizontalAccuracyMeters` describes the source reading. It does not prove
 * that the pin is on the correct property. `confirmedAt` is only populated
 * after the user explicitly confirms the visible pin.
 */
export interface PlacePinEditorValue {
  readonly latitude: number;
  readonly longitude: number;
  readonly source: PlacePinSource;
  readonly precision: PlacePinPrecision;
  readonly horizontalAccuracyMeters: number | null;
  readonly observedAt: string;
  readonly confirmedAt: string | null;
}

export interface ConfirmedPlacePinEditorValue extends PlacePinEditorValue {
  readonly confirmedAt: string;
}

export interface CoordinateInputErrors {
  readonly latitude: string | null;
  readonly longitude: string | null;
}

export type CoordinateParseResult =
  | {
      readonly ok: true;
      readonly latitude: number;
      readonly longitude: number;
    }
  | {
      readonly ok: false;
      readonly errors: CoordinateInputErrors;
    };

export interface PlacePinTruth {
  readonly sourceLabel: string;
  readonly detail: string;
  readonly isConfirmed: boolean;
}

export interface PlacePinEditorLabels {
  readonly sectionLabel: string;
  readonly noPinTitle: string;
  readonly noPinBody: string;
  readonly mapAccessibilityLabel: string;
  readonly markerAccessibilityLabel: string;
  readonly dragInstruction: string;
  readonly webPreviewLabel: string;
  readonly webPreviewBody: string;
  readonly latitudeLabel: string;
  readonly longitudeLabel: string;
  readonly coordinateExample: string;
  readonly setCoordinates: string;
  readonly useCurrentLocation: string;
  readonly locating: string;
  readonly locationUnavailable: string;
  readonly removeCoordinates: string;
  readonly confirmPin: string;
  readonly confirmedPin: string;
  readonly confirmationHint: string;
  readonly invalidNumber: string;
  readonly latitudeRange: string;
  readonly longitudeRange: string;
  readonly deviceGps: string;
  readonly userPlaced: string;
  readonly manualCoordinates: string;
  readonly exactCoordinate: string;
  readonly approximateCoordinate: string;
  readonly accuracyAbout: (meters: number) => string;
  readonly confirmedByYou: string;
  readonly notConfirmed: string;
}

const ENGLISH_LABELS: PlacePinEditorLabels = {
  sectionLabel: "Property pin",
  noPinTitle: "No coordinates yet",
  noPinBody:
    "Use the device location or enter coordinates. ALYR does not guess a property.",
  mapAccessibilityLabel: "Property pin map",
  markerAccessibilityLabel: "Draggable property pin",
  dragInstruction: "Drag the pin onto the property, then confirm it.",
  webPreviewLabel: "Coordinate preview",
  webPreviewBody:
    "Map dragging is available in the iOS and Android app. Enter coordinates below on web.",
  latitudeLabel: "Latitude",
  longitudeLabel: "Longitude",
  coordinateExample: "Use decimal degrees, for example 25.2854",
  setCoordinates: "Place coordinates",
  useCurrentLocation: "Use current location",
  locating: "Finding location…",
  locationUnavailable:
    "The device location was not available. Enter coordinates instead.",
  removeCoordinates: "Remove coordinates",
  confirmPin: "Confirm this property pin",
  confirmedPin: "Property pin confirmed",
  confirmationHint:
    "Confirms that the visible marker is on the intended property.",
  invalidNumber: "Enter a valid decimal number.",
  latitudeRange: "Latitude must be between −90 and 90.",
  longitudeRange: "Longitude must be between −180 and 180.",
  deviceGps: "Device GPS",
  userPlaced: "Pin adjusted by you",
  manualCoordinates: "Coordinates entered manually",
  exactCoordinate: "Verified exact coordinate",
  approximateCoordinate: "Approximate reading",
  accuracyAbout: (meters) => `About ±${meters} m device accuracy`,
  confirmedByYou: "Confirmed by you",
  notConfirmed: "Not confirmed"
};

const ARABIC_LABELS: PlacePinEditorLabels = {
  sectionLabel: "دبوس العقار",
  noPinTitle: "لا توجد إحداثيات بعد",
  noPinBody:
    "استخدم موقع الجهاز أو أدخل الإحداثيات. لا يحدّد ALYR العقار بالتخمين.",
  mapAccessibilityLabel: "خريطة دبوس العقار",
  markerAccessibilityLabel: "دبوس عقار قابل للسحب",
  dragInstruction: "اسحب الدبوس إلى العقار، ثم أكّد موقعه.",
  webPreviewLabel: "معاينة الإحداثيات",
  webPreviewBody:
    "سحب الدبوس متاح في تطبيق iOS وAndroid. أدخل الإحداثيات أدناه على الويب.",
  latitudeLabel: "خط العرض",
  longitudeLabel: "خط الطول",
  coordinateExample: "استخدم الدرجات العشرية، مثل 25.2854",
  setCoordinates: "ضع الإحداثيات",
  useCurrentLocation: "استخدم الموقع الحالي",
  locating: "جارٍ تحديد الموقع…",
  locationUnavailable:
    "تعذّر الحصول على موقع الجهاز. أدخل الإحداثيات بدلاً من ذلك.",
  removeCoordinates: "احذف الإحداثيات",
  confirmPin: "أكّد دبوس هذا العقار",
  confirmedPin: "تم تأكيد دبوس العقار",
  confirmationHint: "يؤكد أن العلامة الظاهرة تقع على العقار المقصود.",
  invalidNumber: "أدخل رقماً عشرياً صالحاً.",
  latitudeRange: "يجب أن يكون خط العرض بين −90 و90.",
  longitudeRange: "يجب أن يكون خط الطول بين −180 و180.",
  deviceGps: "نظام تحديد موقع الجهاز",
  userPlaced: "عدّلتَ موضع الدبوس",
  manualCoordinates: "أُدخلت الإحداثيات يدوياً",
  exactCoordinate: "إحداثيات دقيقة موثّقة",
  approximateCoordinate: "قراءة تقريبية",
  accuracyAbout: (meters) => `دقة الجهاز نحو ±${meters} م`,
  confirmedByYou: "أكّدته أنت",
  notConfirmed: "غير مؤكّد"
};

export function placePinEditorLabels(
  language: "en" | "ar",
  overrides: Partial<PlacePinEditorLabels> = {}
): PlacePinEditorLabels {
  return {
    ...(language === "ar" ? ARABIC_LABELS : ENGLISH_LABELS),
    ...overrides
  };
}

export function normalizeCoordinateInput(rawValue: string): string {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
  return rawValue
    .trim()
    .replace(/[٠-٩]/g, (digit) =>
      String(arabicIndic.indexOf(digit))
    )
    .replace(/[۰-۹]/g, (digit) =>
      String(easternArabic.indexOf(digit))
    )
    .replace(/[−–—]/g, "-")
    .replace(/[٫،,]/g, ".")
    .replace(/[٬\s\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}

function coordinateError(
  rawValue: string,
  minimum: number,
  maximum: number,
  rangeMessage: string,
  invalidMessage: string
): string | null {
  const trimmed = normalizeCoordinateInput(rawValue);
  if (trimmed.length === 0) return invalidMessage;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return invalidMessage;
  if (number < minimum || number > maximum) return rangeMessage;
  return null;
}

export function parseCoordinateInput(
  latitudeInput: string,
  longitudeInput: string,
  labels: Pick<
    PlacePinEditorLabels,
    "invalidNumber" | "latitudeRange" | "longitudeRange"
  >
): CoordinateParseResult {
  const latitudeError = coordinateError(
    latitudeInput,
    -90,
    90,
    labels.latitudeRange,
    labels.invalidNumber
  );
  const longitudeError = coordinateError(
    longitudeInput,
    -180,
    180,
    labels.longitudeRange,
    labels.invalidNumber
  );

  if (latitudeError || longitudeError) {
    return {
      ok: false,
      errors: {
        latitude: latitudeError,
        longitude: longitudeError
      }
    };
  }

  return {
    ok: true,
    latitude: Number(normalizeCoordinateInput(latitudeInput)),
    longitude: Number(normalizeCoordinateInput(longitudeInput))
  };
}

export function hasValidCoordinates(
  value: PlacePinEditorValue | null
): value is PlacePinEditorValue {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      Number.isFinite(value.longitude) &&
      value.longitude >= -180 &&
      value.longitude <= 180
  );
}

export function createManualPlacePin(
  latitude: number,
  longitude: number,
  observedAt: string
): PlacePinEditorValue {
  return {
    latitude,
    longitude,
    source: "manual_coordinates",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt,
    confirmedAt: null
  };
}

export function createDraggedPlacePin(
  previous: PlacePinEditorValue,
  latitude: number,
  longitude: number,
  observedAt: string
): PlacePinEditorValue {
  return {
    ...previous,
    latitude,
    longitude,
    source: "user_pin",
    precision: "user_placed",
    horizontalAccuracyMeters: null,
    observedAt,
    confirmedAt: null
  };
}

export function normalizeDevicePlacePin(
  reading: PlacePinEditorValue,
  fallbackObservedAt: string
): PlacePinEditorValue | null {
  if (!hasValidCoordinates(reading)) return null;
  return {
    latitude: reading.latitude,
    longitude: reading.longitude,
    source: "device_gps",
    precision: "approximate",
    horizontalAccuracyMeters:
      reading.horizontalAccuracyMeters !== null &&
      Number.isFinite(reading.horizontalAccuracyMeters) &&
      reading.horizontalAccuracyMeters >= 0
        ? reading.horizontalAccuracyMeters
        : null,
    observedAt: reading.observedAt || fallbackObservedAt,
    confirmedAt: null
  };
}

export function confirmPlacePin(
  value: PlacePinEditorValue,
  confirmedAt: string
): ConfirmedPlacePinEditorValue {
  return {
    ...value,
    // Confirmation records the human decision without rewriting how the
    // coordinates were obtained. A GPS reading remains approximate; a
    // dragged/manual point is already tagged as user-placed.
    precision: value.precision,
    confirmedAt
  };
}

export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

/**
 * Formats a coordinate for a passive readout without implying precision that
 * the recorded source did not measure. Editable fields retain six decimals so
 * ALYR never mutates user-entered coordinates.
 */
export function formatCoordinateReadout(
  value: number,
  pin: PlacePinEditorValue
): string {
  if (pin.precision === "exact") {
    return value.toFixed(6);
  }
  if (
    pin.source === "device_gps" &&
    pin.horizontalAccuracyMeters !== null
  ) {
    const angularUncertainty =
      Math.max(1, pin.horizontalAccuracyMeters) / 111_320;
    const decimals = Math.max(
      3,
      Math.min(5, Math.floor(-Math.log10(angularUncertainty)))
    );
    return value.toFixed(decimals);
  }
  return value.toFixed(pin.precision === "approximate" ? 4 : 5);
}

export function describePlacePin(
  value: PlacePinEditorValue,
  labels: PlacePinEditorLabels
): PlacePinTruth {
  const sourceLabel =
    value.source === "device_gps"
      ? labels.deviceGps
      : value.source === "user_pin"
        ? labels.userPlaced
        : labels.manualCoordinates;

  const accuracy =
    value.horizontalAccuracyMeters === null
      ? value.precision === "exact"
        ? labels.exactCoordinate
        : value.precision === "approximate"
          ? labels.approximateCoordinate
          : null
      : labels.accuracyAbout(
          Math.max(1, Math.round(value.horizontalAccuracyMeters))
        );
  const confirmation = value.confirmedAt
    ? labels.confirmedByYou
    : labels.notConfirmed;

  return {
    sourceLabel,
    detail: accuracy ? `${accuracy} · ${confirmation}` : confirmation,
    isConfirmed: value.confirmedAt !== null
  };
}
