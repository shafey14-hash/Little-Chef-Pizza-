// App.js — root: providers → splash gate → root navigator + toast host.
//
// The splash screen stays up until the Supabase session/profile check has
// resolved and the cart has been rehydrated, so the very first frame the
// user sees is already the right portal (auth / main / admin) — the same
// "no flash of the wrong page" guarantee the website gets from its
// server-persisted localStorage session.

import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider, useAuth } from "./src/state/auth";
import { hydrateCart } from "./src/state/cart";
import { loadCatalog } from "./src/state/catalog";
import {
  initAppPushNav,
  routeForUrl,
  startAppPush,
  stopAppPush,
} from "./src/lib/app-push";
import { ToastHost } from "./src/ui/toast";
import VersionGate from "./src/ui/VersionGate";
import { initOtaUpdates } from "./src/lib/updates";
import RootNavigator from "./src/navigation/RootNavigator";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootGate({ navigationRef }) {
  const { ready, profile } = useAuth();
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    // Catalog loads lazily in the background (safeFetch caps it at 4s);
    // screens render their own loading states off it.
    loadCatalog();
    hydrateCart().finally(() => setCartReady(true));
    // OTA: release builds auto-download newer JS bundles and reload.
    initOtaUpdates();
  }, []);

  // FCM: attach the device to the signed-in profile (or re-attach on a
  // login/logout swap); detach the JS-side binding on logout.
  useEffect(() => {
    if (profile) startAppPush(profile);
    else stopAppPush();
  }, [profile]);

  // Notification taps → in-app screen. isAdmin lives in a ref so the
  // listeners register exactly once per app launch.
  const isAdminRef = useRef(profile?.role === "admin");
  useEffect(() => {
    isAdminRef.current = profile?.role === "admin";
  }, [profile]);
  useEffect(
    () =>
      initAppPushNav((url) => {
        const route = routeForUrl(url, isAdminRef.current);
        if (route) navigationRef.current?.navigate(route);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const show = ready && cartReady;
  useEffect(() => {
    if (show) SplashScreen.hideAsync().catch(() => {});
  }, [show]);

  if (!show) return null;
  return <RootNavigator />;
}

export default function App() {
  const navigationRef = useRef(null);
  return (
    <AuthProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="dark" />
        <RootGate navigationRef={navigationRef} />
        <ToastHost />
        <VersionGate />
      </NavigationContainer>
    </AuthProvider>
  );
}
