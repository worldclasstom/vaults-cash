import { View } from "react-native";
import { Button, Card, Chip, Muted, Screen } from "@/components/ui";
import { TARGETS_LIVE } from "@/lib/config";
import { Text } from "react-native";
import { colors } from "@/theme";

export default function TargetsScreen() {
  return (
    <Screen title="Targets" sub="Pick a price you believe in. Earn fees on every step there.">
      <Card style={{ gap: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 }}>Pick a price you believe in.</Text>
        <Muted>
          Targets turn a price opinion into a ladder of narrow Uniswap positions between here and there. Every rung earns the pool fee as price
          crosses it. When the last rung sells, an open contract closes the ladder into your wallet, so a retrace can&apos;t undo it.
        </Muted>
        <Muted>Fees: 0.6% in and out, like Pools, plus 8% of the trading fees the ladder earns for you. Never of what you put in.</Muted>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <Button disabled={!TARGETS_LIVE} style={{ flex: 1 }}>
            Set a target
          </Button>
          {!TARGETS_LIVE && <Chip tone="accent">Coming soon</Chip>}
        </View>
      </Card>
    </Screen>
  );
}
