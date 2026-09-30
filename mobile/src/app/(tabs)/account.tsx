import { useState } from "react";
import { usePrivy } from "@privy-io/expo";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, Muted, Screen } from "@/components/ui";
import { shortAddress, useActiveAddress } from "@/lib/wallet";
import { colors, fonts } from "@/theme";

type LoginId = { email?: { address?: string }; phone?: { number?: string }; google?: { email?: string }; apple?: { email?: string } };

export default function AccountScreen() {
  const { user, logout } = usePrivy();
  const address = useActiveAddress();
  const [err, setErr] = useState<string | null>(null);
  const u = user as unknown as LoginId | null;
  const loginId = u?.email?.address ?? u?.phone?.number ?? u?.google?.email ?? u?.apple?.email ?? "";

  return (
    <Screen title="Account" sub="Same login, same wallet as vaults.cash.">
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={s.addr}>{shortAddress(address)}</Text>
          <Chip tone="accent">Smart wallet</Chip>
        </View>
        {loginId ? <Text style={s.loginId}>{loginId}</Text> : null}
        <Muted>
          This wallet and its positions belong to you. vaults.cash holds no key to it. The same address works on Base, on Robinhood Chain and on the
          web app.
        </Muted>
      </Card>
      <Button
        tone="ghost"
        onPress={async () => {
          setErr(null);
          try {
            await logout();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Log out
      </Button>
      {err && <Text style={{ color: colors.negative, fontSize: 13, fontFamily: fonts.body }}>{err}</Text>}
    </Screen>
  );
}

const s = StyleSheet.create({
  addr: { color: colors.foreground, fontSize: 18, fontFamily: fonts.monoMedium },
  loginId: { color: colors.foreground, fontSize: 14, fontFamily: fonts.medium },
});
