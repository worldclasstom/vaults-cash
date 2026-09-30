/** The sign-in tray under the intro: Apple, Google, then email or phone in a code flow. */
import { useState } from "react";
import { useLoginWithEmail, useLoginWithOAuth, useLoginWithSMS } from "@privy-io/expo";
import { SymbolView } from "expo-symbols";
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button, Muted } from "@/components/ui";
import { colors, fonts, radius } from "@/theme";

function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function Envelope() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 6.5h17v11h-17z" stroke={colors.foreground} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M3.5 7l8.5 6 8.5-6" stroke={colors.foreground} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}

export function LoginTray() {
  const oauth = useLoginWithOAuth();
  const email = useLoginWithEmail();
  const sms = useLoginWithSMS();
  const [mode, setMode] = useState<"buttons" | "code">("buttons");
  const [method, setMethod] = useState<"email" | "sms">("email");
  const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const m = (e as Error).message || "Something went wrong";
      if (!/cancel/i.test(m)) setErr(m);
    } finally {
      setBusy(false);
    }
  };

  const canSend = method === "email" ? /.+@.+\..+/.test(addr) : phone.replace(/\D/g, "").length >= 10;
  const sendCode = () =>
    run(async () => {
      if (method === "email") await email.sendCode({ email: addr.trim() });
      else await sms.sendCode({ phone: phone.trim() });
      setSent(true);
    });
  const loginWithCode = () => run(() => (method === "email" ? email.loginWithCode({ code, email: addr.trim() }) : sms.loginWithCode({ code, phone: phone.trim() })));
  const reset = () => {
    setSent(false);
    setCode("");
    setErr(null);
  };

  if (mode === "code") {
    return (
      <View style={s.tray}>
        <View style={s.toggle}>
          {(["email", "sms"] as const).map((m) => (
            <Pressable key={m} onPress={() => { setMethod(m); reset(); }} style={[s.toggleBtn, method === m && s.toggleOn]}>
              <Text style={[s.toggleText, method === m && { color: "#000" }]}>{m === "email" ? "Email" : "Phone"}</Text>
            </Pressable>
          ))}
        </View>
        {method === "email" ? (
          <TextInput value={addr} onChangeText={setAddr} placeholder="you@example.com" placeholderTextColor={colors.muted} style={s.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" autoCorrect={false} editable={!sent} autoFocus />
        ) : (
          <TextInput value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" placeholderTextColor={colors.muted} style={s.input} keyboardType="phone-pad" autoComplete="tel" autoCorrect={false} editable={!sent} autoFocus />
        )}
        {sent ? (
          <>
            <TextInput value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.muted} style={s.input} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
            <Button tone="white" onPress={loginWithCode} disabled={code.length < 6 || busy}>Log in</Button>
          </>
        ) : (
          <Button tone="white" onPress={sendCode} disabled={!canSend || busy}>Send code</Button>
        )}
        {err && <Text style={s.err}>{err}</Text>}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
          {sent && (
            <Pressable onPress={reset} hitSlop={8}>
              <Muted style={s.link}>Use a different {method === "email" ? "email" : "number"}</Muted>
            </Pressable>
          )}
          <Pressable onPress={() => { setMode("buttons"); reset(); }} hitSlop={8}>
            <Muted style={s.link}>Other ways to sign in</Muted>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.tray}>
      {Platform.OS === "ios" && (
        // Drawn by us so all three buttons share one face; keeps Apple's rules: their logo, their exact wording, white or black.
        <Button tone="white" left={<SymbolView name="apple.logo" size={24} tintColor="#000" style={{ width: 22, height: 26, marginTop: -3 }} />} onPress={() => run(() => oauth.login({ provider: "apple" }))} disabled={busy}>
          Sign in with Apple
        </Button>
      )}
      <Button tone="white" left={<GoogleG />} onPress={() => run(() => oauth.login({ provider: "google" }))} disabled={busy}>
        Sign in with Google
      </Button>
      <Button tone="ghost" left={<Envelope />} onPress={() => setMode("code")} disabled={busy}>
        Sign in with Email or Phone
      </Button>
      {err && <Text style={s.err}>{err}</Text>}
      <Text style={s.terms}>
        By continuing you agree to our{" "}
        <Text style={s.termsLink} onPress={() => Linking.openURL("https://vaults.cash/terms")}>Terms</Text> and{" "}
        <Text style={s.termsLink} onPress={() => Linking.openURL("https://vaults.cash/privacy")}>Privacy Policy</Text>.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tray: { paddingHorizontal: 20, gap: 10 },
  input: { backgroundColor: colors.surface, color: colors.foreground, borderRadius: radius.inner, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, fontFamily: fonts.body },
  toggle: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3, alignSelf: "center" },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 7, borderRadius: radius.pill },
  toggleOn: { backgroundColor: colors.foreground },
  toggleText: { color: colors.muted, fontFamily: fonts.display, fontSize: 13 },
  err: { color: colors.negative, fontSize: 13, textAlign: "center", fontFamily: fonts.body },
  link: { textAlign: "center", fontFamily: fonts.medium, color: colors.foreground },
  terms: { color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 17, fontFamily: fonts.body, paddingTop: 4 },
  termsLink: { color: colors.foreground, textDecorationLine: "underline" },
});
