// src/navigation/AdminStack.js
//
// Admin area — mirrors /admin/*.html: dashboard, live orders, products &
// prices, deals, history.

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen";
import AdminOrdersScreen from "../screens/admin/AdminOrdersScreen";
import AdminProductsScreen from "../screens/admin/AdminProductsScreen";
import AdminDealsScreen from "../screens/admin/AdminDealsScreen";
import AdminHistoryScreen from "../screens/admin/AdminHistoryScreen";

const Stack = createNativeStackNavigator();

export default function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminOrders" component={AdminOrdersScreen} />
      <Stack.Screen name="AdminProducts" component={AdminProductsScreen} />
      <Stack.Screen name="AdminDeals" component={AdminDealsScreen} />
      <Stack.Screen name="AdminHistory" component={AdminHistoryScreen} />
    </Stack.Navigator>
  );
}
