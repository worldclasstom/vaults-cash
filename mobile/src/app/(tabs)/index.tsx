import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/expo";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { fmtPct, fmtPrice, fmtUsd } from "@web/lib/format";
import { CHAINS, CHAIN_IDS, VENUE_LABEL, type ChainId } from "@web/lib/chain";
import type { Market } from "@web/lib/markets";
import { useCash, useMarketQuotes, useStats } from "@/lib/data";
import { useActiveAddress } from "@/lib/wallet";
import { Button, Card, Chip, Loading, Muted, Screen } from "@/components/ui";
import { colors, radius, space } from "@/theme";

type Category = "all" | "majors" | "crypto" | "stock";
type Sort = "tvl" | "apr" | "vol";
const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "all", label: "All pools" },
  { id: "majors", label: "ETH & BTC" },
  { id: "crypto", label: "Crypto" },
  { id: "stock", label: "Stocks" },
];
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "tvl", label: "Most liquid" },
  { id: "apr", label: "Highest APR" },
  { id: "vol", label: "Most traded" },
];
const MAJORS = new Set(["ETH", "cbBTC", "cbETH", "wstETH", "rETH", "weETH"]);
function inCategory(m: Market, c: Category) {
  if (c === "all") return true;
  if (c === "majors") return MAJORS.has(m.base.symbol) && (MAJORS.has(m.quote.symbol) || m.quoteIsStable);
  return m.kind === c;
}

function TokenLogo({ uri, symbol, color, style }: { uri?: string; symbol: string; color: string; style?: object }) {
  return uri ? (
    <Image source={{ uri }} style={[s.logo, style]} contentFit="cover" />
  ) : (
    <View style={[s.logo, { backgroundColor: color }, style]}>
      <Text style={s.logoText}>{symbol.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function CashHeader() {
  const address = useActiveAddress();
  const { data: cash, isLoading } = useCash(address);
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ paddingVertical: space.md, gap: 6 }}>
      <Muted>Cash available</Muted>
      <Text style={s.cash}>{isLoading || !cash ? "—" : fmtUsd(cash.totalUsd)}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {(cash?.perChain ?? []).map((c) => (
          <View key={c.chainId} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Chip tone={c.chainId === 8453 ? "base" : "robinhood"}>{CHAINS[c.chainId as ChainId].label}</Chip>
            <Text style={{ color: c.formatted > 0 ? colors.foreground : colors.muted, fontSize: 14 }}>
              {fmtUsd(c.formatted)} {c.symbol}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 10, paddingTop: 6 }}>
        <Button
          onPress={async () => {
            if (!address) return;
            await Clipboard.setStringAsync(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          style={{ paddingVertical: 10, paddingHorizontal: 20 }}
        >
          {copied ? "Address copied" : "Add funds"}
        </Button>
      </View>
      <Muted>Send USDC on Base or USDG on Robinhood Chain to your address. Copy it with the button.</Muted>
    </View>
  );
}

export default function PoolsScreen() {
  const { isReady, user } = usePrivy();
  const { data, isLoading, isError } = useMarketQuotes();
  const { data: stats } = useStats();
  const [q, setQ] = useState("");
  const [chain, setChain] = useState<ChainId | 0>(0);
  const [sort, setSort] = useState<Sort>("tvl");
  const [category, setCategory] = useState<Category>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const st = (m: Market) => stats?.[m.slug];
    return (data ?? [])
      .filter((r) => !chain || r.market.chainId === chain)
      .filter((r) => inCategory(r.market, category))
      .filter((r) => !needle || r.market.base.symbol.toLowerCase().includes(needle) || r.market.base.name?.toLowerCase().includes(needle))
      .sort((a, b) => {
        const A = st(a.market);
        const B = st(b.market);
        const key = sort === "apr" ? "estAprPct" : sort === "vol" ? "vol24hUsd" : "tvlUsd";
        return (B?.[key] ?? -1) - (A?.[key] ?? -1);
      });
  }, [data, stats, q, chain, sort, category]);

  return (
    <Screen title="Pools" sub="Pick a pair, choose a price range, and earn a share of every trade. Deposits are in dollars; we handle the rest.">
      {isReady && user ? <CashHeader /> : null}
      <TextInput value={q} onChangeText={setQ} placeholder="Search TSLA, ETH, NVDA…" placeholderTextColor={colors.muted} style={s.search} autoCapitalize="characters" autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[{ id: 0 as ChainId | 0, label: "All networks" }, ...CHAIN_IDS.map((id) => ({ id, label: CHAINS[id].chain.name }))].map((o) => (
          <Pressable key={o.id} onPress={() => setChain(o.id)} style={[s.pill, chain === o.id && s.pillOn]}>
            <Text style={[s.pillText, chain === o.id && s.pillTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
        <View style={{ width: 6 }} />
        {SORTS.map((o) => (
          <Pressable key={o.id} onPress={() => setSort(o.id)} style={[s.pill, sort === o.id && s.pillOn]}>
            <Text style={[s.pillText, sort === o.id && s.pillTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.id} onPress={() => setCategory(c.id)} style={[s.pill, category === c.id && s.pillOn]}>
            <Text style={[s.pillText, category === c.id && s.pillTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <Card>
          <Muted>Couldn&apos;t load pools. Pull to retry.</Muted>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {rows.map((r, i) => {
            const m = r.market;
            const st = stats?.[m.slug];
            return (
              <Pressable key={m.slug} style={[s.row, i > 0 && s.rowBorder]} onPress={() => router.push(`/market/${m.slug}` as never)}>
                <View style={{ width: 52, height: 36 }}>
                  <TokenLogo uri={m.base.logo} symbol={m.base.symbol} color={m.base.color} />
                  <TokenLogo uri={m.quote.logo} symbol={m.quote.symbol} color={m.quote.color} style={{ position: "absolute", left: 20, borderWidth: 2, borderColor: colors.surface }} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.pair}>
                    {m.base.symbol} <Text style={{ color: colors.muted }}>/</Text> {m.quote.symbol}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <Chip rotate={0}>{`${m.pool.fee / 10_000}% fee`}</Chip>
                    <Chip tone={m.chainId === 8453 ? "base" : "robinhood"} rotate={i % 2 ? 2 : -2}>
                      {m.chainId === 8453 ? "Base" : "Robinhood"}
                    </Chip>
                    <Chip rotate={0}>{VENUE_LABEL[m.venue]}</Chip>
                    {m.lowIl && <Chip tone="accent">Steady</Chip>}
                  </View>
                  <Muted>{st ? `${fmtUsd(st.tvlUsd, { compact: true })} liquidity · ${fmtUsd(st.vol24hUsd, { compact: true })} traded 24h` : `$${fmtPrice(r.priceUsd)}`}</Muted>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.apr}>{st ? fmtPct(st.estAprPct) : "—"}</Text>
                  <Muted>est. APR</Muted>
                </View>
              </Pressable>
            );
          })}
          {rows.length === 0 && (
            <View style={{ padding: space.lg }}>
              <Muted>No pools match.</Muted>
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  cash: { color: colors.foreground, fontSize: 52, fontWeight: "800", letterSpacing: -2, lineHeight: 58 },
  search: { backgroundColor: colors.surface, color: colors.foreground, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, fontSize: 15 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface },
  pillOn: { backgroundColor: colors.accent },
  pillText: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  pillTextOn: { color: "#000" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  logo: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#000", fontWeight: "800", fontSize: 11 },
  pair: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  apr: { color: colors.accent, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
});
