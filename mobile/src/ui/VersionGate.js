// src/ui/VersionGate.js
//
// Blocking modal for the major-version gate — the master prompt's exact
// headline, linking straight to the hosted APK. Rendered at the app root;
// invisible unless /app-version.json says the installed version is too old.

import React, { useEffect, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { APK_URL, checkMinVersion } from "../lib/updates";
import { COLORS, FONTS, RADIUS, SIZES, shadowCard } from "../theme";

export default function VersionGate() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    checkMinVersion().then((d) => {
      if (alive && d) setInfo(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!info) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🚀</Text>
          <Text style={styles.title}>
            A new version of the app is available!
          </Text>
          <Text style={styles.body}>
            {info.message ||
              "Please update to keep ordering — this version can no longer be used."}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            onPress={() => Linking.openURL(APK_URL)}
          >
            <Text style={styles.btnText}>Download Update</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(12,11,10,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: "center",
    ...shadowCard,
  },
  emoji: { fontSize: 44, marginBottom: 10 },
  title: {
    fontSize: 20,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
    lineHeight: 26,
  },
  body: {
    fontSize: 14,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 18,
  },
  btn: {
    height: 48,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  btnText: {
    fontSize: SIZES.btn,
    fontFamily: FONTS.bodySemi,
    color: COLORS.white,
  },
});
