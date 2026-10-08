import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiPostAuthed } from "./api";
import { supabase } from "./supabase";

let started = false;
let currentUserId = null;
let cachedToken = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? session.access_token : null;
}

async function registerToken(token) {
  cachedToken = token;
  if (!currentUserId || !token) return;
  try {
    const t = await accessToken();
    if (!t) return;
    await apiPostAuthed(
      "/api/app-push-subscribe",
      { action: "subscribe", token },
      t,
    );
  } catch (e) {
    console.warn("app push register failed (will retry next launch):", e.message);
  }
}

export async function startAppPush(user) {
  if (!Device.isDevice) {
    console.log("Must use physical device for Push Notifications");
    return;
  }
  
  currentUserId = user ? user.id : null;
  if (started) {
    if (cachedToken && currentUserId) await registerToken(cachedToken);
    return;
  }
  started = true;
  
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#e2222a',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn("Notifications blocked — enable them in phone Settings.");
      return;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;
    await registerToken(token);
  } catch (e) {
    console.error("Expo Push setup failed:", e.message);
  }
}

export function stopAppPush() {
  currentUserId = null;
}

export async function unregisterAppPush() {
  const token = cachedToken;
  currentUserId = null;
  if (!token) return;
  try {
    const t = await accessToken();
    if (!t) return;
    await apiPostAuthed(
      "/api/app-push-subscribe",
      { action: "unsubscribe", token },
      t,
    );
  } catch (e) {
  }
}

export function routeForUrl(url, isAdmin) {
  if (typeof url !== "string" || !url.startsWith("/")) return null;
  if (url.startsWith("/admin")) return isAdmin ? "AdminOrders" : "Orders";
  return "Orders";
}

export function initAppPushNav(onOpen) {
  let subClick = null;
  try {
    subClick = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url;
      if (url) onOpen(url);
    });
  } catch (e) {}

  return () => {
    try {
      if (subClick) subClick.remove();
    } catch (e) {}
  };
}
