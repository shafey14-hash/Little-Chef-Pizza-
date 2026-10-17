// src/screens/customer/CampaignsScreen.js
//
// Port of customer/campaigns.html for the mobile app:
// 1) Active campaigns with progress bars ("X of Y claimed · Z left")
// 2) Customer's personal vouchers (used vs unused status)
// 3) Realtime updates + pull to refresh

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../state/auth";
import { listActiveCampaigns, listMyVouchers } from "../../lib/db";
import { supabase } from "../../lib/supabase";
import { Button } from "../../ui/components";
import { COLORS, FONTS, RADIUS, SIZES, SPACING, shadowCard } from "../../theme";

export default function CampaignsScreen() {
  const navigation = useNavigation();
  const { profile, setGuest } = useAuth();

  const [campaigns, setCampaigns] = useState(null); // null = loading
  const [vouchers, setVouchers] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const [campsRes, vouchersRes] = await Promise.all([
      listActiveCampaigns(),
      profile ? listMyVouchers(profile.id) : Promise.resolve({ data: [] }),
    ]);
    setCampaigns(campsRes.data || []);
    setVouchers(vouchersRes.data || []);
  }, [profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel("mobile-campaigns-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaigns" },
        () => {
          fetchData();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vouchers" },
        () => {
          fetchData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.red}
            colors={[COLORS.red]}
          />
        }
      >
        <Text style={styles.title}>Campaigns 🎁</Text>
        <Text style={styles.intro}>
          Live offers and your vouchers. Vouchers attach themselves automatically
          at checkout — you never have to type a code.
        </Text>

        {/* -------------------- Active Campaigns -------------------- */}
        <Text style={styles.sectionHeader}>Live Offers</Text>

        {campaigns === null ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={COLORS.red} size="small" />
          </View>
        ) : campaigns.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🍕</Text>
            <Text style={styles.emptyText}>
              No campaigns are running right now — but new ones are on the way.
              Check back soon!
            </Text>
          </View>
        ) : (
          campaigns.map((c) => {
            const max = Number(c.max_grants) || 0;
            const claimed = Math.min(Number(c.granted_count) || 0, max);
            const pct = max > 0 ? Math.round((claimed / max) * 100) : 0;
            const left = Math.max(0, max - claimed);

            return (
              <View key={c.id} style={styles.campaignCard}>
                <View style={styles.badgeCol}>
                  <View style={styles.pctBadge}>
                    <Text style={styles.pctNumber}>
                      {Number(c.discount_percent)}%
                    </Text>
                    <Text style={styles.pctLabel}>OFF</Text>
                  </View>
                </View>

                <View style={styles.campaignBody}>
                  <Text style={styles.campaignTitle}>{c.title}</Text>
                  <Text style={styles.campaignDesc}>{c.description}</Text>

                  {max > 0 && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.min(100, Math.max(4, pct))}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {claimed} of {max} claimed
                        {left > 0
                          ? ` · only ${left} left — hurry!`
                          : " · fully claimed"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}

        {/* -------------------- Vouchers -------------------- */}
        <Text style={[styles.sectionHeader, { marginTop: 28 }]}>
          Your Vouchers
        </Text>

        {!profile ? (
          <View style={styles.guestCard}>
            <Text style={styles.guestIcon}>🎟️</Text>
            <Text style={styles.guestTitle}>
              Create an account to grab your voucher
            </Text>
            <Text style={styles.guestText}>
              Vouchers are tied to your account. Sign up during a live campaign
              and your discount will be waiting right here — ready to apply itself
              at checkout.
            </Text>
            <Button
              variant="primary"
              onPress={() => setGuest(false)}
              style={{ marginTop: 14 }}
            >
              Login / Create Account
            </Button>
          </View>
        ) : vouchers === null ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={COLORS.red} size="small" />
          </View>
        ) : vouchers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎁</Text>
            <Text style={styles.emptyText}>
              You don&apos;t have any vouchers yet. When a campaign rewards your
              account, your voucher will appear here automatically.
            </Text>
          </View>
        ) : (
          vouchers.map((v) => {
            const used = v.status === "used";

            return (
              <View
                key={v.id}
                style={[
                  styles.voucherCard,
                  used && styles.voucherCardUsed,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.voucherCode, used && styles.textMuted]}>
                    {v.code}
                  </Text>
                  {!!v.reason && (
                    <Text style={styles.voucherReason}>{v.reason}</Text>
                  )}
                  <View
                    style={[
                      styles.statusPill,
                      used ? styles.statusPillUsed : styles.statusPillUnused,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        used
                          ? styles.statusPillTextUsed
                          : styles.statusPillTextUnused,
                      ]}
                    >
                      {used
                        ? "Used ✓ — applied to an order"
                        : "Unused — attaches automatically at checkout"}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.voucherPctBadge,
                    used && styles.voucherPctBadgeUsed,
                  ]}
                >
                  <Text
                    style={[
                      styles.voucherPctNum,
                      used && styles.voucherPctNumUsed,
                    ]}
                  >
                    {Number(v.discount_percent)}%
                  </Text>
                  <Text
                    style={[
                      styles.voucherPctSub,
                      used && styles.voucherPctSubUsed,
                    ]}
                  >
                    OFF
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cream },
  inner: {
    padding: SPACING.gutter,
    paddingBottom: 40,
  },
  title: {
    fontSize: SIZES.h1,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 6,
  },
  intro: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 19,
    marginBottom: 18,
  },
  sectionHeader: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 12,
  },
  loadingBox: {
    paddingVertical: 30,
    alignItems: "center",
  },

  /* Campaign card */
  campaignCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadowCard,
  },
  badgeCol: {
    justifyContent: "flex-start",
  },
  pctBadge: {
    backgroundColor: COLORS.red,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 62,
  },
  pctNumber: {
    color: COLORS.white,
    fontFamily: FONTS.display,
    fontSize: 18,
    lineHeight: 20,
  },
  pctLabel: {
    color: COLORS.gold,
    fontFamily: FONTS.bodyBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  campaignBody: {
    flex: 1,
  },
  campaignTitle: {
    fontSize: 15,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    marginBottom: 4,
  },
  campaignDesc: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    lineHeight: 17,
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBar: {
    height: 7,
    backgroundColor: COLORS.creamDark || "#f1eae0",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.gold,
    borderRadius: 999,
  },
  progressText: {
    fontSize: 11,
    fontFamily: FONTS.bodySemi,
    color: COLORS.inkSoft,
    marginTop: 4,
  },

  /* Voucher card */
  voucherCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
    ...shadowCard,
  },
  voucherCardUsed: {
    borderLeftColor: COLORS.line,
    opacity: 0.72,
    backgroundColor: "#faf8f5",
  },
  voucherCode: {
    fontSize: 15,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  voucherReason: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    marginVertical: 4,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  statusPillUnused: {
    backgroundColor: COLORS.successBg || "#e8f7ee",
  },
  statusPillUsed: {
    backgroundColor: "#eae8e4",
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: FONTS.bodyBold,
  },
  statusPillTextUnused: {
    color: COLORS.success || "#1b8744",
  },
  statusPillTextUsed: {
    color: COLORS.inkSoft,
  },
  voucherPctBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff6e5",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "#f5d496",
  },
  voucherPctBadgeUsed: {
    backgroundColor: "#f0eeea",
    borderColor: COLORS.line,
  },
  voucherPctNum: {
    fontSize: 16,
    fontFamily: FONTS.display,
    color: COLORS.gold,
  },
  voucherPctNumUsed: {
    color: COLORS.inkSoft,
  },
  voucherPctSub: {
    fontSize: 10,
    fontFamily: FONTS.bodyBold,
    color: COLORS.gold,
  },
  voucherPctSubUsed: {
    color: COLORS.inkSoft,
  },
  textMuted: {
    color: COLORS.inkSoft,
  },

  /* Empty state */
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    lineHeight: 19,
  },

  /* Guest callout */
  guestCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadowCard,
  },
  guestIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  guestTitle: {
    fontSize: SIZES.h3,
    fontFamily: FONTS.display,
    color: COLORS.ink,
    textAlign: "center",
    marginBottom: 6,
  },
  guestText: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.inkSoft,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 4,
  },
});
