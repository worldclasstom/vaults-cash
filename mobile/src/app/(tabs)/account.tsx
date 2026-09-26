import { useState } from "react";
import { usePrivy, useLoginWithEmail, useLoginWithOAuth, useLoginWithSMS } from "@privy-io/expo";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, Loading, Muted, Screen } from "@/components/ui";
import { shortAddress, useActiveAddress } from "@/lib/wallet";
import { colors, radius } from "@/theme";

export default function AccountScreen() {
  const { isReady, user, logout } = usePrivy();
  const address = useActiveAddress();
  const email = useLoginWithEmail();
  const sms = useLoginWithSMS();
  const oauth = useLoginWithOAuth();
  const [method, setMethod] = useState<"email" | "sms">("email");
  const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canSend = method === "email" ? addr.includes("@") : phone.replace(/\D/g, "").length >= 10;
  const sendCode = () => run(async () => {
    if (method === "email") await email.sendCode({ email: addr });
    else await sms.sendCode({ phone });
    setSent(true);
  });
  const loginWithCode = () => run(() => (method === "email" ? email.loginWithCode({ code, email: addr }) : sms.loginWithCode({ code, phone })));

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
          <View style={s.toggle}>
            {(["email", "sms"] as const).map((m) => (
              <Pressable key={m} onPress={() => { setMethod(m); setSent(false); setCode(""); }} style={[s.toggleBtn, method === m && s.toggleOn]}>
                <Text style={[s.toggleText, method === m && { color: colors.foreground }]}>{m === "email" ? "Email" : "SMS"}</Text>
              </Pressable>
            ))}
          </View>
          {method === "email" ? (
            <TextInput value={addr} onChangeText={setAddr} placeholder="you@example.com" placeholderTextColor={colors.muted} style={s.input} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} editable={!sent} />
          ) : (
            <TextInput value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" placeholderTextColor={colors.muted} style={s.input} keyboardType="phone-pad" autoCorrect={false} editable={!sent} />
          )}
          {sent ? (
            <>
              <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.muted} style={s.input} keyboardType="number-pad" />
              <Button onPress={loginWithCode} disabled={code.length < 6}>
                Log in
              </Button>
              <Pressable onPress={() => { setSent(false); setCode(""); }}>
                <Muted style={{ textAlign: "center" }}>Use a different {method === "email" ? "email" : "number"}</Muted>
              </Pressable>
            </>
          ) : (
            <Button tone="ghost" onPress={sendCode} disabled={!canSend}>
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
  toggle: { flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 3, alignSelf: "center" },
  toggleBtn: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: radius.pill },
  toggleOn: { backgroundColor: colors.surface },
  toggleText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
});
