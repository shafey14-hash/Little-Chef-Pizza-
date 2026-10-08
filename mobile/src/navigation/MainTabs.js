// src/navigation/MainTabs.js
//
// The 6-item bottom tab bar from the website's mobile view:
// 🏠 Home · 🍕 Menu · 🏷️ Deals · 🔍 Track · 🧾 My Orders · 👤 Profile

import React from "react";
import { Text, View, Pressable, StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { COLORS, FONTS, SIZES, shadowCard } from "../theme";
import HomeScreen from "../screens/customer/HomeScreen";
import MenuScreen from "../screens/customer/MenuScreen";
import DealsScreen from "../screens/customer/DealsScreen";
import TrackScreen from "../screens/customer/TrackScreen";
import OrdersScreen from "../screens/customer/OrdersScreen";
import ProfileScreen from "../screens/customer/ProfileScreen";
import { useCart } from "../state/cart";

const Tab = createBottomTabNavigator();

const TABS = [
  { name: "Home", label: "Home", icon: "🏠", component: HomeScreen },
  { name: "Menu", label: "Menu", icon: "🍕", component: MenuScreen },
  { name: "Deals", label: "Deals", icon: "🏷️", component: DealsScreen },
  { name: "Track", label: "Track", icon: "🔍", component: TrackScreen },
  { name: "Orders", label: "My Orders", icon: "🧾", component: OrdersScreen },
  { name: "Profile", label: "Profile", icon: "👤", component: ProfileScreen },
];

function FloatingBucketPill() {
  const { itemCount } = useCart();
  const navigation = useNavigation();

  if (itemCount === 0) return null;

  return (
    <Pressable
      style={styles.bucketPill}
      onPress={() => navigation.navigate("Bucket")}
    >
      <Text style={styles.bucketIcon}>🧺</Text>
      <Text style={styles.bucketLabel}>Bucket</Text>
      <View style={styles.bucketCountBox}>
        <Text style={styles.bucketCountText}>{itemCount}</Text>
      </View>
    </Pressable>
  );
}

export default function MainTabs() {
  return (
    <View style={styles.wrapper}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: COLORS.red,
          tabBarInactiveTintColor: COLORS.inkSoft,
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: FONTS.bodySemi,
          },
          tabBarStyle: {
            height: SIZES.tabH,
            backgroundColor: COLORS.white,
            borderTopColor: COLORS.line,
          },
        }}
      >
        {TABS.map((t) => (
          <Tab.Screen
            key={t.name}
            name={t.name}
            component={t.component}
            options={{
              tabBarLabel: t.label,
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.7 }}>
                  {t.icon}
                </Text>
              ),
            }}
          />
        ))}
      </Tab.Navigator>
      <FloatingBucketPill />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  bucketPill: {
    position: "absolute",
    right: 16,
    bottom: SIZES.tabH + 16,
    backgroundColor: COLORS.gold,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    gap: 8,
    ...shadowCard,
  },
  bucketIcon: { fontSize: 16 },
  bucketLabel: {
    color: COLORS.black,
    fontFamily: FONTS.bodyBold,
    fontSize: 13,
  },
  bucketCountBox: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bucketCountText: {
    color: COLORS.black,
    fontFamily: FONTS.bodyBold,
    fontSize: 11,
  }
});
