// src/state/auth.js
//
// Auth context — mirrors js/db.js auth module exactly:
//  • phone-number login resolves via the lookup_email_by_phone RPC
//  • expectRole blocks admin/customer cross-login (session is signed out)
//  • OTP signup/verify goes through our own /api endpoints (no Supabase
//    emails); verification does NOT create a session — the caller signs
//    in with the captured password right after.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { apiPost } from "../lib/api";
import { unregisterAppPush } from "../lib/app-push";
import { KEYS, storageGet, storageRemove, storageSet } from "./storage";

const AuthContext = createContext(null);

async function loadProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", session.user.id)
    .single();
  return error ? null : data;
}

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [guest, setGuestState] = useState(false);
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    (async () => {
      const [gs, { data: { session: s } }] = await Promise.all([
        storageGet(KEYS.guest, false),
        supabase.auth.getSession(),
      ]);
      if (!mounted.current) return;
      setGuestState(!!gs);
      setSession(s);
      const p = await loadProfile();
      if (!mounted.current) return;
      setProfile(p);
      setReady(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setProfile(null);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await loadProfile();
    setProfile(p);
    return p;
  }, []);

  const signIn = useCallback(async ({ identifier, password, expectRole }) => {
    let email = identifier.trim();
    if (!email.includes("@")) {
      const { data: foundEmail, error: lookupErr } = await supabase.rpc(
        "lookup_email_by_phone",
        { p_phone: email },
      );
      if (lookupErr || !foundEmail)
        return { error: "Incorrect email/phone or password." };
      email = foundEmail;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (/email not confirmed/i.test(error.message))
        return { error: "Please verify your email before logging in.", needsVerification: true, email };
      return { error: "Incorrect email/phone or password." };
    }
    const p = await loadProfile();
    setProfile(p);
    if (expectRole && (!p || p.role !== expectRole)) {
      await supabase.auth.signOut();
      setProfile(null);
      return { error: "Incorrect email/phone or password." };
    }
    return { data: p };
  }, []);

  const signInAdmin = useCallback(async ({ username, password }) => {
    const email =
      username.trim().toLowerCase() + "@users.littlechefpizza.local";
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: "Incorrect username or password." };
    const p = await loadProfile();
    setProfile(p);
    if (!p || p.role !== "admin") {
      await supabase.auth.signOut();
      setProfile(null);
      return { error: "Incorrect username or password." };
    }
    return { data: p };
  }, []);

  const signUp = useCallback(
    async ({
      full_name,
      email,
      phone,
      alt_phone,
      password,
      area,
      address,
    }) => {
      const cleanEmail = email.trim().toLowerCase();
      try {
        const data = await apiPost("/api/auth-signup", {
          full_name,
          email: cleanEmail,
          phone,
          alt_phone,
          area,
          address,
          password,
        });
        return { data: { email: data.email || cleanEmail } };
      } catch (e) {
        return { error: e.message };
      }
    },
    [],
  );

  const verifySignupOtp = useCallback(async ({ email, token }) => {
    try {
      await apiPost("/api/auth-verify-otp", {
        email: email.trim().toLowerCase(),
        token: token.trim(),
      });
      return { data: { verified: true } };
    } catch (e) {
      return { error: e.message };
    }
  }, []);

  const resendSignupOtp = useCallback(async (email) => {
    try {
      await apiPost("/api/auth-resend-otp", {
        email: email.trim().toLowerCase(),
      });
      return { data: true };
    } catch (e) {
      return { error: e.message };
    }
  }, []);

  const setGuest = useCallback(async (flag) => {
    setGuestState(!!flag);
    if (flag) await storageSet(KEYS.guest, "1");
    else await storageRemove(KEYS.guest);
  }, []);

  const signOut = useCallback(async () => {
    // Detach the FCM device first — the unsubscribe call needs the
    // still-live access token (mirrors js/nav.js doLogout).
    await unregisterAppPush();
    await supabase.auth.signOut();
    setProfile(null);
    setGuestState(false);
    await storageRemove(KEYS.guest);
  }, []);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    return s ? s.access_token : null;
  }, []);

  const value = useMemo(
    () => ({
      ready,
      profile,
      session,
      guest,
      isAdmin: !!profile && profile.role === "admin",
      isCustomer: !!profile && profile.role === "customer",
      refreshProfile,
      setGuest,
      signIn,
      signInAdmin,
      signUp,
      verifySignupOtp,
      resendSignupOtp,
      signOut,
      getAccessToken,
    }),
    [
      ready,
      profile,
      session,
      guest,
      refreshProfile,
      setGuest,
      signIn,
      signInAdmin,
      signUp,
      verifySignupOtp,
      resendSignupOtp,
      signOut,
      getAccessToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
