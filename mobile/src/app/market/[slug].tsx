import { useLocalSearchParams, router } from "expo-router";
import { Pressable, Text } from "react-native";
import { marketBySlug } from "@web/lib/markets";
import { Button, Card, Muted, Screen } from "@/components/ui";
import { colors } from "@/theme";

/** Placeholder until the deposit sheet is ported: names the pool and points back. */
export default function MarketScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const m = marketBySlug(slug ?? "");
  return (
    <Screen title={m ? `${m.base.symbol} / ${m.quote.symbol}` : "Pool"} sub={m ? `${m.base.name} · ${m.quote.name}` : undefined}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.muted }}>← All pools</Text>
      </Pressable>
      <Card style={{ gap: 12 }}>
        <Muted>Deposits from the phone are next on the list. Until then, this pool is one tap away on vaults.cash with the same wallet.</Muted>
        <Button tone="ghost" onPress={() => router.back()}>
          Back
        </Button>
      </Card>
    </Screen>
  );
}
