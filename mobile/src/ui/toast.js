// src/ui/toast.js
//
// RN port of the website's toast (js/utils.js toast + CSS): dark pill with
// a colored left border, auto-dismiss after ~3.2s. Global module so any
// screen can call toast("...", "success") without context plumbing.

import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { COLORS, FONTS, RADIUS, SIZES, SPACING } from "../theme";

const listeners = new Set();

export function toast(message, type = "info") {
  listeners.forEach((fn) => fn({ message, type, id: Date.now() + Math.random() }));
}

const BORDER = {
  info: COLORS.gold,
  success: COLORS.success,
  error: COLORS.danger,
  warn: COLORS.warn,
};

export function ToastHost() {
  const [current, setCurrent] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => {
    const onToast = (t) => {
      setCurrent(t);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setCurrent(null));
      }, 3200);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
      clearTimeout(timer.current);
    };
  }, [opacity]);

  if (!current) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.host,
        { opacity, borderLeftColor: BORDER[current.type] || BORDER.info },
      ]}
    >
      <Text style={styles.text} numberOfLines={3}>
        {current.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: 90,
    backgroundColor: COLORS.black,
    borderLeftWidth: 4,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    elevation: 8,
  },
  text: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontFamily: FONTS.bodyMed,
    lineHeight: 20,
  },
});
