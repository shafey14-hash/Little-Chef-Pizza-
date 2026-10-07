// src/navigation/AuthStack.js
//
// First-launch flow. Like index.html, the location gate only shows when
// no delivery location is stored yet — otherwise we land straight on the
// welcome view.

import React, { useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getStoredLocation } from "../state/location";
import LocationGateScreen from "../screens/auth/LocationGateScreen";
import WelcomeScreen from "../screens/auth/WelcomeScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import VerifyOtpScreen from "../screens/auth/VerifyOtpScreen";
import AdminLoginScreen from "../screens/auth/AdminLoginScreen";

const Stack = createNativeStackNavigator();

export default function AuthStack() {
  const [hasLocation, setHasLocation] = useState(null);

  useEffect(() => {
    let alive = true;
    getStoredLocation().then((l) => alive && setHasLocation(!!l));
    return () => {
      alive = false;
    };
  }, []);

  if (hasLocation === null) return null; // one frame while storage resolves

  return (
    <Stack.Navigator
      initialRouteName={hasLocation ? "Welcome" : "LocationGate"}
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      <Stack.Screen name="LocationGate">
        {(props) => (
          <LocationGateScreen
            {...props}
            onDone={() => props.navigation.replace("Welcome")}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
      <Stack.Screen name="AdminLogin" component={AdminLoginScreen} />
    </Stack.Navigator>
  );
}
