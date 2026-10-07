// src/navigation/MainStack.js
//
// Customer area: bottom tabs + the pushed detail flows (product page,
// bucket, checkout) — matching how the website's customer pages link
// into each other.

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabs from "./MainTabs";
import ProductDetailScreen from "../screens/customer/ProductDetailScreen";
import BucketScreen from "../screens/customer/BucketScreen";
import CheckoutScreen from "../screens/customer/CheckoutScreen";

const Stack = createNativeStackNavigator();

export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Bucket" component={BucketScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
    </Stack.Navigator>
  );
}
