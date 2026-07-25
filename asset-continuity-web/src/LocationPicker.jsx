import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle,
  Crosshair,
  GlobeHemisphereWest,
  MagnifyingGlass,
  MapPin,
  NavigationArrow,
  PencilSimple,
  Warning,
} from "@phosphor-icons/react";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MAX_EXACT_GPS_ACCURACY_METERS } from "./domain.js";
import "leaflet/dist/leaflet.css";

const LOCATION_METHODS = [
  {
    id: "address",
    label: "Search address",
    copy: "Find a property or street",
    icon: MagnifyingGlass,
  },
  {
    id: "current",
    label: "Current location",
    copy: "Use this device",
    icon: NavigationArrow,
  },
  {
    id: "pin",
    label: "Drop a pin",
    copy: "Choose it on the map",
    icon: MapPin,
  },
  {
    id: "coordinates",
    label: "Coordinates",
    copy: "Enter latitude and longitude",
    icon: Crosshair,
  },
  {
    id: "later",
    label: "Add later",
    copy: "Keep the Place approximate",
    icon: GlobeHemisphereWest,
  },
];

function finiteCoordinate(value, minimum, maximum) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function finiteGpsAccuracy(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function locationLabel(value) {
  if (value.locationMethod === "later") return "No property pin yet";
  if (
    finiteCoordinate(value.latitude, -90, 90) === null ||
    finiteCoordinate(value.longitude, -180, 180) === null
  ) {
    return "Choose a location";
  }
  if (value.locationPrecision === "user_placed") {
    return value.locationSource === "manual_coordinates"
      ? "User-entered coordinates · accuracy not measured"
      : "User-placed pin · accuracy not measured";
  }
  if (
    value.horizontalAccuracyMeters !== "" &&
    value.horizontalAccuracyMeters !== null &&
    value.horizontalAccuracyMeters !== undefined &&
    Number.isFinite(Number(value.horizontalAccuracyMeters))
  ) {
    return `Device estimate ±${Math.round(
      Number(value.horizontalAccuracyMeters),
    )} m`;
  }
  if (value.locationSource === "device_gps") {
    return "Device accuracy unavailable · approximate";
  }
  if (value.locationSource === "geocoder") return "Address result · approximate";
  if (value.locationSource === "user_pin") return "Pin confirmed by you";
  if (value.locationSource === "manual_coordinates") {
    return "Coordinates entered by you";
  }
  return "Location selected";
}

function LeafletPin({ latitude, longitude, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (
      !containerRef.current ||
      String(globalThis.navigator?.userAgent || "").includes("jsdom")
    ) {
      return undefined;
    }
    let cancelled = false;
    let map = null;

    import("leaflet")
      .then(({ default: L }) => {
        if (cancelled || !containerRef.current) return;
        const lat = finiteCoordinate(latitude, -90, 90) ?? 25.2854;
        const lng = finiteCoordinate(longitude, -180, 180) ?? 51.531;
        const icon = L.icon({
          iconUrl: markerIcon,
          iconRetinaUrl: markerIcon2x,
          shadowUrl: markerShadow,
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        });
        map = L.map(containerRef.current, {
          center: [lat, lng],
          zoom: Number.isFinite(Number(latitude)) ? 16 : 11,
          zoomControl: true,
          attributionControl: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);
        const marker = L.marker([lat, lng], {
          draggable: true,
          icon,
          title: "Selected Place location",
        }).addTo(map);
        marker.on("dragend", () => {
          const next = marker.getLatLng();
          onChangeRef.current?.(next.lat, next.lng);
        });
        map.on("click", (event) => {
          marker.setLatLng(event.latlng);
          onChangeRef.current?.(event.latlng.lat, event.latlng.lng);
        });
        mapRef.current = map;
        markerRef.current = marker;
        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) {
          setMapError(
            "The map could not load. You can still enter coordinates below.",
          );
        }
      });

    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const lat = finiteCoordinate(latitude, -90, 90);
    const lng = finiteCoordinate(longitude, -180, 180);
    if (lat === null || lng === null) return;
    markerRef.current?.setLatLng([lat, lng]);
    mapRef.current?.setView([lat, lng], Math.max(mapRef.current.getZoom(), 14), {
      animate: false,
    });
  }, [latitude, longitude]);

  return (
    <div className="pin-map-shell">
      <div
        ref={containerRef}
        className="pin-map"
        aria-label="Adjustable map pin"
      />
      {mapError && (
        <div className="pin-map-error" role="status">
          <Warning weight="bold" /> {mapError}
        </div>
      )}
      <small>Click the map or drag its marker. Coordinates remain available as a keyboard-friendly alternative.</small>
    </div>
  );
}

export function LocationPicker({ value, onChange }) {
  const [query, setQuery] = useState(value.formattedAddress || "");
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [deviceState, setDeviceState] = useState("idle");
  const [deviceError, setDeviceError] = useState("");

  const latitude = finiteCoordinate(value.latitude, -90, 90);
  const longitude = finiteCoordinate(value.longitude, -180, 180);
  const hasCoordinates = latitude !== null && longitude !== null;
  const status = useMemo(() => locationLabel(value), [value]);

  function changeMethod(locationMethod) {
    setSearchError("");
    setDeviceError("");
    onChange({
      locationMethod,
      ...(locationMethod === "later"
        ? {
            latitude: "",
            longitude: "",
            horizontalAccuracyMeters: "",
            locationSource: "not_set",
            locationPrecision: "locality_only",
          }
        : {}),
    });
  }

  async function searchAddress(event) {
    event?.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setSearchError("Enter an address, building, or area to search.");
      return;
    }
    setSearchState("loading");
    setSearchError("");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(
          cleanQuery,
        )}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) throw new Error("Address search is unavailable.");
      const payload = await response.json();
      const nextResults = Array.isArray(payload)
        ? payload
            .map((item) => ({
              id: String(item.place_id || item.osm_id || item.display_name),
              label: String(item.display_name || ""),
              latitude: finiteCoordinate(item.lat, -90, 90),
              longitude: finiteCoordinate(item.lon, -180, 180),
            }))
            .filter(
              (item) =>
                item.label &&
                item.latitude !== null &&
                item.longitude !== null,
            )
        : [];
      setResults(nextResults);
      setSearchState("ready");
      if (!nextResults.length) {
        setSearchError(
          "No matching result was found. Try a broader address or enter coordinates.",
        );
      }
    } catch {
      setResults([]);
      setSearchState("error");
      setSearchError(
        "Address search could not connect. Your draft is safe; use coordinates or a map pin instead.",
      );
    }
  }

  function chooseResult(result) {
    setQuery(result.label);
    setResults([]);
    onChange({
      locationMethod: "address",
      formattedAddress: result.label,
      latitude: result.latitude,
      longitude: result.longitude,
      horizontalAccuracyMeters: "",
      locationSource: "geocoder",
      locationPrecision: "approximate",
      locationCapturedAt: new Date().toISOString(),
    });
  }

  function useCurrentLocation() {
    setDeviceError("");
    if (!globalThis.navigator?.geolocation) {
      setDeviceState("error");
      setDeviceError(
        "This browser cannot provide a device location. Use an address, pin, or coordinates.",
      );
      return;
    }
    setDeviceState("loading");
    globalThis.navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = finiteGpsAccuracy(position.coords.accuracy);
        onChange({
          locationMethod: "current",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          horizontalAccuracyMeters: accuracy ?? "",
          locationSource: "device_gps",
          locationPrecision:
            accuracy !== null && accuracy <= MAX_EXACT_GPS_ACCURACY_METERS
              ? "exact"
              : "approximate",
          locationCapturedAt: new Date(
            position.timestamp || Date.now(),
          ).toISOString(),
        });
        setDeviceState("ready");
      },
      (error) => {
        setDeviceState("error");
        setDeviceError(
          error?.code === 1
            ? "Location permission was not granted. Use an address, pin, or coordinates instead."
            : "A reliable device location was not available. Try again or choose another method.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      },
    );
  }

  function updateCoordinate(name, nextValue) {
    setQuery("");
    onChange({
      [name]: nextValue,
      formattedAddress: "",
      locationSource:
        value.locationMethod === "pin" ? "user_pin" : "manual_coordinates",
      locationPrecision: "user_placed",
      horizontalAccuracyMeters: "",
      locationCapturedAt: new Date().toISOString(),
    });
  }

  function movePin(nextLatitude, nextLongitude) {
    setQuery("");
    onChange({
      locationMethod: "pin",
      latitude: Number(nextLatitude.toFixed(6)),
      longitude: Number(nextLongitude.toFixed(6)),
      formattedAddress: "",
      horizontalAccuracyMeters: "",
      locationSource: "user_pin",
      locationPrecision: "user_placed",
      locationCapturedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="location-picker">
      <div className="location-method-grid" aria-label="Location method">
        {LOCATION_METHODS.map(({ id, label, copy, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={value.locationMethod === id ? "is-active" : ""}
            aria-pressed={value.locationMethod === id}
            onClick={() => changeMethod(id)}
          >
            <Icon weight="duotone" />
            <span>
              <strong>{label}</strong>
              <small>{copy}</small>
            </span>
            {value.locationMethod === id && <CheckCircle weight="duotone" />}
          </button>
        ))}
      </div>

      {value.locationMethod === "address" && (
        <div className="address-search-panel">
          <label>
            <span>Property address</span>
            <div>
              <MagnifyingGlass weight="bold" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Building, street, area, city"
              />
              <button
                type="button"
                onClick={searchAddress}
                disabled={searchState === "loading"}
              >
                {searchState === "loading" ? "Searching…" : "Search"}
              </button>
            </div>
          </label>
          {searchError && (
            <div className="location-inline-error" role="status">
              <Warning weight="bold" /> {searchError}
            </div>
          )}
          {results.length > 0 && (
            <div className="address-result-list" aria-label="Address results">
              {results.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  onClick={() => chooseResult(result)}
                >
                  <MapPin weight="duotone" />
                  <span>{result.label}</span>
                </button>
              ))}
            </div>
          )}
          <small className="location-provider-note">
            Address search is sent to OpenStreetMap’s Nominatim service. Use a
            pin or coordinates if you prefer not to send an address query.
          </small>
        </div>
      )}

      {value.locationMethod === "current" && (
        <div className="current-location-panel">
          <span><NavigationArrow weight="duotone" /></span>
          <div>
            <strong>Use this device only when you are at the Place</strong>
            <p>The browser reports an uncertainty radius. You can adjust the result before saving.</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={useCurrentLocation}
            disabled={deviceState === "loading"}
          >
            {deviceState === "loading" ? "Locating…" : "Use my location"}
          </button>
          {deviceError && (
            <div className="location-inline-error" role="status">
              <Warning weight="bold" /> {deviceError}
            </div>
          )}
        </div>
      )}

      {value.locationMethod !== "later" &&
        (hasCoordinates ||
          ["pin", "coordinates"].includes(value.locationMethod)) && (
          <>
            <LeafletPin
              latitude={latitude}
              longitude={longitude}
              onChange={movePin}
            />
            <div className="coordinate-grid">
              <label>
                <span>Latitude</span>
                <input
                  inputMode="decimal"
                  value={value.latitude}
                  onChange={(event) =>
                    updateCoordinate("latitude", event.target.value)
                  }
                  placeholder="25.285400"
                />
              </label>
              <label>
                <span>Longitude</span>
                <input
                  inputMode="decimal"
                  value={value.longitude}
                  onChange={(event) =>
                    updateCoordinate("longitude", event.target.value)
                  }
                  placeholder="51.531000"
                />
              </label>
            </div>
          </>
        )}

      <div
        className={`location-confidence is-${value.locationPrecision || "locality_only"}`}
        role="status"
      >
        {hasCoordinates ? (
          value.locationPrecision === "approximate" ? (
            <Warning weight="bold" />
          ) : (
            <CheckCircle weight="bold" />
          )
        ) : (
          <PencilSimple weight="bold" />
        )}
        <span>
          <strong>{status}</strong>
          <small>
            {hasCoordinates
              ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
              : "The city remains useful for the globe, but no property pin is recorded."}
          </small>
        </span>
      </div>
    </div>
  );
}
