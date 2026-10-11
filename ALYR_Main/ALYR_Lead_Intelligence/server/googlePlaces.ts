import type { PlaceDetails, PlaceSummary } from './types.js';

const API_ROOT = 'https://places.googleapis.com/v1';

interface GoogleLocalizedText {
  text?: string;
}

interface GooglePlace {
  id?: string;
  displayName?: GoogleLocalizedText;
  formattedAddress?: string;
  primaryType?: string;
  primaryTypeDisplayName?: GoogleLocalizedText;
  types?: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

interface SearchResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
}

export interface SearchInput {
  query: string;
  category: string;
  location: string;
  pageToken?: string;
}

export interface SearchOutput {
  results: PlaceSummary[];
  nextPageToken?: string;
}

function normalizeSummary(place: GooglePlace): PlaceSummary | null {
  if (!place.id || !place.displayName?.text) return null;
  return {
    placeId: place.id,
    name: place.displayName.text,
    address: place.formattedAddress ?? '',
    primaryType: place.primaryType ?? 'establishment',
    typeLabel: place.primaryTypeDisplayName?.text ?? 'Business',
    types: place.types ?? [],
    businessStatus: place.businessStatus ?? 'UNKNOWN',
    googleMapsUri: place.googleMapsUri,
    source: 'google',
  };
}

async function googleRequest<T>(path: string, key: string, fieldMask: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask,
      ...init.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Google Places request failed (${response.status}): ${payload.slice(0, 600)}`);
  }

  return response.json() as Promise<T>;
}

export async function searchGooglePlaces(input: SearchInput, key: string): Promise<SearchOutput> {
  const intent = [input.query.trim() || input.category.trim(), input.location.trim()].filter(Boolean).join(' in ');
  const body: Record<string, unknown> = {
    textQuery: intent || 'businesses in Qatar',
    pageSize: 20,
    languageCode: 'en',
    regionCode: 'QA',
  };
  if (input.pageToken) body.pageToken = input.pageToken;

  const payload = await googleRequest<SearchResponse>(
    '/places:searchText',
    key,
    [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.primaryType',
      'places.primaryTypeDisplayName',
      'places.types',
      'places.businessStatus',
      'places.googleMapsUri',
      'nextPageToken',
    ].join(','),
    { method: 'POST', body: JSON.stringify(body) },
  );

  return {
    results: (payload.places ?? []).map(normalizeSummary).filter((place): place is PlaceSummary => Boolean(place)),
    nextPageToken: payload.nextPageToken,
  };
}

export async function getGooglePlaceDetails(placeId: string, key: string): Promise<PlaceDetails> {
  const place = await googleRequest<GooglePlace>(
    `/places/${encodeURIComponent(placeId)}`,
    key,
    [
      'id',
      'displayName',
      'formattedAddress',
      'primaryType',
      'primaryTypeDisplayName',
      'types',
      'businessStatus',
      'googleMapsUri',
      'nationalPhoneNumber',
      'internationalPhoneNumber',
      'websiteUri',
      'rating',
      'userRatingCount',
      'regularOpeningHours.weekdayDescriptions',
    ].join(','),
    { method: 'GET' },
  );

  const summary = normalizeSummary(place);
  if (!summary) throw new Error('Google Places returned an incomplete place record.');

  return {
    ...summary,
    phone: place.nationalPhoneNumber,
    internationalPhone: place.internationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    openingHours: place.regularOpeningHours?.weekdayDescriptions,
  };
}
