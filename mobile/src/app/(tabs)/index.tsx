import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fmtPrice, fmtUsd } from "@web/lib/format";
import { VENUE_LABEL } from "@web/lib/chain";
import { useMarketQuotes, useStats } from "@/lib/data";
import { Card, Chip, Loading, Muted, Screen } from "@/components/ui";
import { colors, radius, space } from "@/theme";

export default function PoolsScreen() {
  const { data, isLoading, isError } = useMarketQuotes();
  const { data: stats } = useStats();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => !needle || r.market.base.symbol.toLowerCase().includes(needle) || r.market.base.name?.toLowerCase().includes(needle))
      .sort((a, b) => (stats?.[b.market.slug]?.tvlUsd ?? -1) - (stats?.[a.market.slug]?.tvlUsd ?? -1));
  }, [data, stats, q]);

  return (
    <Screen title="Pools" sub="Earn what traders pay. Pick a pool, deposit dollars.">
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search TSLA, ETH, NVDA…"
        placeholderTextColor={colors.muted}
        style={s.search}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <Card>
          <Muted>Couldn&apos;t load pools. Pull to retry.</Muted>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {rows.map((r, i) => {
            const st = stats?.[r.market.slug];
            return (
              <Pressable key={r.market.slug} style={[s.row, i > 0 && s.rowBorder]}>
                <View style={s.icon}>
                  <Text style={s.iconText}>{r.market.base.symbol.slice(0, 2)}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={s.pair}>
                      {r.market.base.symbol} / {r.market.quote.symbol}
                    </Text>
                    <Chip tone={r.market.chainId === 8453 ? "base" : "robinhood"} rotate={i % 2 ? 2 : -2}>
                      {r.market.chainId === 8453 ? "Base" : "Robinhood"}
                    </Chip>
                    {r.market.venue !== "uniswap-v4" && <Chip rotate={i % 2 ? -2 : 2}>{VENUE_LABEL[r.market.venue]}</Chip>}
                  </View>
                  <Muted>{st ? `${fmtUsd(st.tvlUsd, { compact: true })} liquidity · ${fmtUsd(st.vol24hUsd, { compact: true })} traded 24h` : `$${fmtPrice(r.priceUsd)}`}</Muted>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.apr}>{st ? `${st.estAprPct.toFixed(1)}%` : "—"}</Text>
                  <Muted>est. APR</Muted>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  search: { backgroundColor: colors.surface, color: colors.foreground, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  iconText: { color: colors.foreground, fontWeight: "800", fontSize: 13 },
  pair: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  apr: { color: colors.accent, fontSize: 18, fontWeight: "800" },
});
