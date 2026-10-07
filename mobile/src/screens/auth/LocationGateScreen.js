// src/screens/auth/LocationGateScreen.js
//
// Step 1 of first launch — mirrors the website's location gate: area
// search, Locate Me, 3km free / 5km limit status, Continue. The live map
// preview is the same graceful fallback the site shows when its map
// can't load ("Map preview unavailable — you can still select your
// location below") because a native map needs a Google Maps API key.

import React, { useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import AuthLayout, { AuthMuted } from "./AuthLayout";
import { Button, Field, Input } from "../../ui/components";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../../theme";
import {
  CENTER,
  RADIUS_KM,
  FREE_RADIUS_KM,
  forwardGeocode,
  getCurrentPosition,
  haversineKm,
  reverseGeocode,
  saveLocation,
} from "../../state/location";
import { toast } from "../../ui/toast";

export default function LocationGateScreen({ onDone }) {
  const [selection, setSelection] = useState(null);
  const [status, setStatus] = useState(null); // {ok, text, info?}
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef(null);

  function useLocation(lat, lng, address) {
    const sel = { lat, lng, address };
    setSelection(sel);
    checkRange(sel);
  }

  function checkRange(sel) {
    const distance = haversineKm(CENTER.lat, CENTER.lng, sel.lat, sel.lng);
    if (distance <= RADIUS_KM) {
      const freeMsg =
        distance <= FREE_RADIUS_KM
          ? " · Free delivery ✓"
          : " · Delivery fee applies (over 3 km)";
      setStatus({
        ok: true,
        text: `✓ Within delivery range (${distance.toFixed(1)} km away)${freeMsg}`,
      });
    } else {
      setStatus({
        ok: false,
        text: "Delivery is only available within 5 km. You are too far.",
      });
    }
  }

  function onAddressChange(text) {
    setSelection(null);
    setStatus({ info: true, text: "" });
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const query = text.trim();
      if (query.length < 3) return;
      setStatus({ info: true, text: "Checking location…" });
      try {
        const result = await forwardGeocode(query);
        if (!result) {
          setStatus({
            ok: false,
            text: "Couldn't find that address. Try being more specific, or use Locate Me.",
          });
          return;
        }
        useLocation(result.lat, result.lng, text.trim() || result.address);
      } catch (e) {
        setStatus({
          ok: false,
          text: "Couldn't check that address right now. Please try again.",
        });
      }
    }, 900);
  }

  async function locateMe() {
    setLocating(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      let address;
      try {
        address = await reverseGeocode(lat, lng);
      } catch (e) {
        address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      useLocation(lat, lng, address);
    } catch (e) {
      setStatus({
        ok: false,
        text: "Location access denied. Please allow location access, or type your address below.",
      });
    } finally {
      setLocating(false);
    }
  }

  function continuePressed() {
    if (!selection || (status && !status.ok)) return;
    saveLocation(selection);
    onDone();
  }

  return (
    <AuthLayout wide>
      <View style={styles.brand}>
        <Image
          source={require("../../../assets/logo-badge.png")}
          style={styles.logo}
        />
        <Text style={styles.heading}>Select Your Delivery Location</Text>
      </View>
      <AuthMuted>
        Free delivery within 3 km of Gujrat — we deliver up to 5 km.
      </AuthMuted>

      <View style={styles.mapFallback}>
        <Text style={styles.mapFallbackText}>
          Map preview unavailable — you can still select your location below.
        </Text>
      </View>

      <Field label="City">
        <Input
          value="Gujrat, Punjab, Pakistan"
          editable={false}
          style={styles.cityInput}
        />
      </Field>
      <Field label="Choose Area">
        <Input
          placeholder="Choose Area — type your street/area"
          autoCorrect={false}
          onChangeText={onAddressChange}
        />
      </Field>

      <Button
        title="📍 Locate Me"
        variant="ghost"
        onPress={locateMe}
        loading={locating}
        loadingText="Locating…"
        style={styles.locateBtn}
      />

      {status && status.text ? (
        <Text
          style={[
            styles.statusText,
            status.info
              ? styles.statusInfo
              : status.ok
                ? styles.statusOk
                : styles.statusErr,
          ]}
        >
          {status.text}
        </Text>
      ) : null}

      <Button
        title="Continue"
        onPress={continuePressed}
        disabled={!selection || (status ? !status.ok : true)}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", marginBottom: 2 },
  logo: { width: 56, height: 56, borderRadius: 28, marginBottom: 8 },
  heading: {
    fontSize: SIZES.h2,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
  },
  mapFallback: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    height: 110,
  },
  mapFallbackText: {
    color: COLORS.inkSoft,
    fontSize: SIZES.small,
    fontFamily: FONTS.body,
    textAlign: "center",
  },
  cityInput: { backgroundColor: COLORS.line, color: COLORS.inkSoft },
  locateBtn: { marginBottom: SPACING.sm },
  statusText: {
    fontSize: SIZES.small,
    fontFamily: FONTS.bodySemi,
    marginBottom: SPACING.md,
    textAlign: "center",
    lineHeight: 18,
  },
  statusInfo: { color: COLORS.inkSoft },
  statusOk: { color: COLORS.success },
  statusErr: { color: COLORS.danger },
});
