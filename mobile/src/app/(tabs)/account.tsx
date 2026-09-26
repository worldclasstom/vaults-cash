import { useState } from "react";
import { usePrivy, useLoginWithEmail, useLoginWithOAuth } from "@privy-io/expo";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, Loading, Muted, Screen } from "@/components/ui";
import { shortAddress, useActiveAddress } from "@/lib/wallet";
import { colors, radius } from "@/theme";

export default function AccountScreen() {
  const { isReady, user, logout } = usePrivy();
  const address = useActiveAddress();
  const email = useLoginWithEmail();
  const oauth = useLoginWithOAuth();
  const [addr, setAddr] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (!isReady) return <Screen title="Account"><Loading /></Screen>;

  if (!user) {
    return (
      <Screen title="Account" sub="Same login, same wallet as vaults.cash.">
        <Card style={{ gap: 12 }}>
          <Button onPress={() => run(() => oauth.login({ provider: "apple" }))}>Continue with Apple</Button>
          <Button tone="ghost" onPress={() => run(() => oauth.login({ provider: "google" }))}>
            Continue with Google
          </Button>
          <Muted style={{ textAlign: "center" }}>or with email</Muted>
          <TextInput value={addr} onChangeText={setAddr} placeholder="you@example.com" placeholderTextColor={colors.muted} style={s.input} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
          {sent ? (
            <>
              <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.muted} style={s.input} keyboardType="number-pad" />
              <Button onPress={() => run(() => email.loginWithCode({ code, email: addr }))} disabled={code.length < 6}>
                Log in
              </Button>
            </>
          ) : (
            <Button tone="ghost" onPress={() => run(async () => { await email.sendCode({ email: addr }); setSent(true); })} disabled={!addr.includes("@")}>
              Send code
            </Button>
          )}
          {err && <Text style={{ color: colors.negative, fontSize: 13 }}>{err}</Text>}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Account">
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={s.addr}>{shortAddress(address)}</Text>
          <Chip tone="accent">Smart wallet</Chip>
        </View>
        <Muted>
          This wallet and its positions belong to you. vaults.cash holds no key to it. The same address works on Base, on Robinhood Chain and on the
          web app.
        </Muted>
      </Card>
      <Button tone="ghost" onPress={() => run(() => logout())}>
        Log out
      </Button>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { backgroundColor: colors.surfaceRaised, color: colors.foreground, borderRadius: radius.inner, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  addr: { color: colors.foreground, fontSize: 18, fontWeight: "800", fontFamily: "Menlo" },
});
