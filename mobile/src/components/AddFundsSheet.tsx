/** Two doors into the wallet: buy dollars with Apple Pay or a card through Privy's funding flow
 *  (USDC on Base), or transfer from an exchange or another wallet to the address. */
import { useState } from "react";
import { useFundWallet } from "@privy-io/expo/ui";
import * as Clipboard from "expo-clipboard";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-styled";
import { base } from "viem/chains";
import { CHAINS } from "@web/lib/chain";
import { Sheet } from "@/components/Sheet";
import { Button, Chip, Muted } from "@/components/ui";
import { colors, fonts, radius } from "@/theme";

export function AddFundsSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address?: `0x${string}` }) {
  const { fundWallet } = useFundWallet();
  const [door, setDoor] = useState<"pick" | "transfer">("pick");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => {
    setDoor("pick");
    setErr(null);
    onClose();
  };

  // Base only. Privy's SDK (js-sdk-core, checked 2026-10-01) has no MoonPay mapping for Robinhood
  // Chain and silently falls back to ETH on Ethereum mainnet, which would strand the money. USDG on
  // Robinhood Chain needs MoonPay's own widget or Robinhood Connect; see DECISIONS.md.
  const buy = async () => {
    if (!address) return;
    setErr(null);
    try {
      await fundWallet({ address, chain: base, asset: "USDC", amount: "20", defaultPaymentMethod: "card", moonpay: { uiConfig: { theme: "dark", accentColor: colors.accent } } });
      close();
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/cancel|closed/i.test(m)) setErr(m || "Funding didn't complete.");
    }
  };

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Sheet open={open} onClose={close} title={door === "pick" ? "Add funds" : "Transfer to your address"}>
      {door === "pick" ? (
        <>
          <Pressable onPress={buy} style={({ pressed }) => [s.door, pressed && s.pressed]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.doorTitle}>Buy with Apple Pay or card</Text>
              <Muted>Dollars become USDC on Base in your wallet. Usually a few minutes.</Muted>
            </View>
            <Chip tone="accent" rotate={3}>Fastest</Chip>
          </Pressable>
          <Pressable onPress={() => setDoor("transfer")} style={({ pressed }) => [s.door, pressed && s.pressed]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.doorTitle}>Transfer from an exchange or wallet</Text>
              <Muted>Send USDC on Base or USDG on Robinhood Chain to your address.</Muted>
            </View>
          </Pressable>
          {err && <Text style={s.err}>{err}</Text>}
        </>
      ) : (
        <>
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <View style={s.qr}>{address ? <QRCode data={address} size={180} color={colors.background} /> : null}</View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            <Chip tone="base" rotate={-2}>{CHAINS[8453].label} · USDC</Chip>
            <Chip tone="robinhood" rotate={2}>{CHAINS[4663].label} · USDG</Chip>
          </View>
          <Text selectable style={s.addr}>{address}</Text>
          <Button onPress={copy}>{copied ? "Address copied" : "Copy address"}</Button>
          <Muted>
            Same address on both networks. Only USDC on Base and USDG on Robinhood Chain show up as cash here. Money sent on any other network won't arrive.
          </Muted>
          <Pressable onPress={() => setDoor("pick")} hitSlop={8}>
            <Muted style={{ textAlign: "center", color: colors.foreground }}>Back</Muted>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  door: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceRaised, borderRadius: radius.inner, padding: 16 },
  pressed: { transform: [{ scale: 0.98 }] },
  doorTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.foreground },
  qr: { backgroundColor: colors.foreground, padding: 12, borderRadius: 16 },
  addr: { fontFamily: fonts.mono, fontSize: 12, color: colors.foreground, textAlign: "center" },
  err: { color: colors.negative, fontSize: 13, fontFamily: fonts.body },
});
