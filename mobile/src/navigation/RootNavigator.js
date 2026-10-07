// src/navigation/RootNavigator.js
//
// Top-level portal switch, mirroring the website's redirect logic:
//   admin profile  → admin area
//   profile/guest  → customer area (bottom tabs + stack)
//   neither        → auth flow (location gate → welcome → login/signup)

import React from "react";
import { useAuth } from "../state/auth";
import AuthStack from "./AuthStack";
import MainStack from "./MainStack";
import AdminStack from "./AdminStack";

export default function RootNavigator() {
  const { profile, guest } = useAuth();
  if (profile?.role === "admin") return <AdminStack />;
  if (profile || guest) return <MainStack />;
  return <AuthStack />;
}
