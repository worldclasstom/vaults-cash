import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/expo";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { fetchPositions } from "@web/lib/positions";
import { fmtUsd } from "@web/lib/format";
import { Button, Card, Chip, Loading, Muted, Screen } from "@/components/ui";
import { useActiveAddress } from "@/lib/wallet";
import { colors, space } from "@/theme";

export default function PortfolioScreen() {
  const { isReady, user } = usePrivy();
  const address = useActiveAddress();
  const positions = useQuery({
    queryKey: ["positions", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: () => fetchPositions(address!),
  });

  if (!isReady) return <Screen title="Portfolio"><Loading /></Screen>;
  if (!user || !address) {
    return (
      <Screen title="Portfolio" sub="Your positions, your wallet, on both chains.">
        <Card style={{ gap: 12 }}>
          <Muted>Log in to see your positions. Same wallet as on vaults.cash.</Muted>
          <Button onPress={() => router.push("/account")}>Log in</Button>
        </Card>
      </Screen>
    );
  }
  const list = positions.data ?? [];
  return (
    <Screen title="Portfolio" sub={list.length ? `${list.length} position${list.length === 1 ? "" : "s"}` : undefined}>
      {positions.isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Card style={{ gap: 12 }}>
          <Muted>Nothing here yet. Pick a pool and deposit to start earning.</Muted>
          <Button onPress={() => router.push("/")}>Explore pools</Button>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {list.map((p, i) => (
            <View key={`${p.market.chainId}:${p.tokenId}`} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Text style={s.pair}>
                    {p.market.base.symbol} / {p.market.quote.symbol}
                  </Text>
                  <Chip tone={p.market.chainId === 8453 ? "base" : "robinhood"}>{p.market.chainId === 8453 ? "Base" : "Robinhood"}</Chip>
                </View>
                <Muted>#{p.tokenId.toString()} · ticks {p.tickLower} to {p.tickUpper}</Muted>
              </View>
              <Text style={s.value}>{"valueUsd" in p && typeof (p as { valueUsd?: number }).valueUsd === "number" ? fmtUsd((p as { valueUsd: number }).valueUsd) : ""}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pair: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
  value: { color: colors.foreground, fontSize: 16, fontWeight: "800" },
});
