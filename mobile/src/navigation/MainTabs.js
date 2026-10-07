// src/navigation/MainTabs.js
//
// The 6-item bottom tab bar from the website's mobile view:
// 🏠 Home · 🍕 Menu · 🏷️ Deals · 🔍 Track · 🧾 My Orders · 👤 Profile

import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { COLORS, FONTS, SIZES } from "../theme";
import HomeScreen from "../screens/customer/HomeScreen";
import MenuScreen from "../screens/customer/MenuScreen";
import DealsScreen from "../screens/customer/DealsScreen";
import TrackScreen from "../screens/customer/TrackScreen";
import OrdersScreen from "../screens/customer/OrdersScreen";
import ProfileScreen from "../screens/customer/ProfileScreen";

const Tab = createBottomTabNavigator();

const TABS = [
  { name: "Home", label: "Home", icon: "🏠", component: HomeScreen },
  { name: "Menu", label: "Menu", icon: "🍕", component: MenuScreen },
  { name: "Deals", label: "Deals", icon: "🏷️", component: DealsScreen },
  { name: "Track", label: "Track", icon: "🔍", component: TrackScreen },
  { name: "Orders", label: "My Orders", icon: "🧾", component: OrdersScreen },
  { name: "Profile", label: "Profile", icon: "👤", component: ProfileScreen },
];

export default function MainTabs() {
  return (
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
  );
}
