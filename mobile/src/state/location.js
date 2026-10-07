// src/state/location.js
//
// Port of js/location.js: delivery range rules, Nominatim geocoding and
// the AsyncStorage-backed saved location. The interactive Leaflet map has
// no direct native equivalent without a Google Maps API key, so screens
// show the same graceful "Map preview unavailable" fallback the website
// uses when its map fails to load — address search + Locate Me remain
// fully functional.

import * as Location from "expo-location";
import { KEYS, storageGet, storageSet, storageRemove } from "./storage";

export const CENTER = { lat: 32.57349, lng: 74.0817 };
export const RADIUS_KM = 5; // we deliver up to 5 km
export const FREE_RADIUS_KM = 3; // but delivery is FREE only within 3 km

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function deliveryCheck(lat, lng) {
  const distanceKm = haversineKm(CENTER.lat, CENTER.lng, lat, lng);
  const band =
    distanceKm <= FREE_RADIUS_KM
      ? "free"
      : distanceKm <= RADIUS_KM
        ? "charged"
        : "out_of_range";
  return { distanceKm, band };
}

export const getStoredLocation = () => storageGet(KEYS.location);
export const saveLocation = (loc) => storageSet(KEYS.location, loc);
export const clearLocation = () => storageRemove(KEYS.location);

export async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
  );
  if (!res.ok) throw new Error("reverse geocode failed");
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export async function forwardGeocode(query) {
  const bias = `&viewbox=${CENTER.lng - 0.3},${CENTER.lat + 0.3},${CENTER.lng + 0.3},${CENTER.lat - 0.3}&bounded=0`;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}${bias}&limit=1`,
  );
  if (!res.ok) throw new Error("forward geocode failed");
  const data = await res.json();
  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    address: data[0].display_name,
  };
}

export async function getCurrentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("PERMISSION_DENIED");
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
