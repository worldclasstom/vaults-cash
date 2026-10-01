/** Send the wallet's dollars or ETH to any address, one user operation. Port of the web's SendPanel. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { encodeFunctionData, erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
import { CHAINS, CHAIN_IDS, explorerUrl, type ChainId } from "@web/lib/chain";
import { GAS_RESERVE_USD, gasTokenOf } from "@web/lib/gasToken";
import { fmtAmount } from "@web/lib/format";
import { NATIVE_ETH } from "@web/lib/markets";
import { useTokenBalance } from "@/lib/data";
import { useSendCalls } from "@/lib/sendCalls";
import { Sheet } from "@/components/Sheet";
import { Button, Chip, Muted } from "@/components/ui";
import { colors, fonts, radius } from "@/theme";

type Asset = "quote" | "ETH";

function Pills<T extends string | number>({ items, value, onChange }: { items: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {items.map((it) => (
        <Pressable key={it.id} onPress={() => onChange(it.id)} style={[s.pill, value === it.id && s.pillOn]}>
          <Text style={[s.pillText, value === it.id && { color: "#000" }]}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SendSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address?: `0x${string}` }) {
  const sendCalls = useSendCalls();
  const queryClient = useQueryClient();
  const [chainId, setChainId] = useState<ChainId>(8453);
  const [asset, setAsset] = useState<Asset>("quote");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const chain = CHAINS[chainId];
  const assetLabel = asset === "quote" ? chain.quote.symbol : "ETH";
  const decimals = asset === "quote" ? chain.quote.decimals : 18;
  const { data: balance } = useTokenBalance(address, chainId, asset === "quote" ? chain.quote.address : NATIVE_ETH, decimals);

  let amountRaw = 0n;
  try {
    amountRaw = parseUnits(amount || "0", decimals);
  } catch {
    /* invalid input reads as zero */
  }
  const toValid = isAddress(to.trim());
  const insufficient = balance !== undefined && amountRaw > balance.raw;
  const canReview = amountRaw > 0n && toValid && !insufficient;

  const setMax = () => {
    if (!balance) return;
    const reserve =
      asset === "ETH" && !chain.gasSponsored && !gasTokenOf(chainId)
        ? parseUnits("0.00002", 18)
        : asset !== "ETH" && gasTokenOf(chainId)
          ? parseUnits(GAS_RESERVE_USD.toFixed(decimals), decimals)
          : 0n;
    setAmount(formatUnits(balance.raw > reserve ? balance.raw - reserve : 0n, decimals));
  };

  const send = useMutation({
    mutationFn: async () => {
      const dest = to.trim() as `0x${string}`;
      const call =
        asset === "ETH"
          ? { to: dest, value: amountRaw, data: "0x" as `0x${string}` }
          : { to: chain.quote.address, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [dest, amountRaw] }) };
      const { hash } = await sendCalls([call], { chainId });
      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
      queryClient.invalidateQueries({ queryKey: ["token-balance"] });
    },
  });

  const reset = () => {
    setAmount("");
    setTo("");
    setReviewing(false);
    send.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Send">
      {send.isSuccess ? (
        <View style={{ gap: 10 }}>
          <Text style={s.big}>Sent</Text>
          <Muted>
            {fmtAmount(Number(amount), 6)} {assetLabel} is on its way on {chain.chain.name}.
          </Muted>
          <Pressable onPress={() => Linking.openURL(explorerUrl(chainId, "tx", send.data))}>
            <Text style={s.link}>View on explorer</Text>
          </Pressable>
          <Button tone="ghost" onPress={close}>Done</Button>
        </View>
      ) : reviewing ? (
        <View style={{ gap: 12 }}>
          <View style={s.review}>
            <Text style={s.big}>
              {fmtAmount(Number(amount), 6)} {assetLabel}
            </Text>
            <Muted>to</Muted>
            <Text selectable style={s.addr}>{to.trim()}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 }}>
              <Chip tone={chainId === 8453 ? "base" : "robinhood"}>{chain.label}</Chip>
              <Muted>{gasTokenOf(chainId) ? `Network fee paid in ${chain.quote.symbol}` : chain.gasSponsored ? "Network fee covered" : "Network fee paid in ETH"}</Muted>
            </View>
          </View>
          <Muted>Sends are final. Check the address and the network: money sent to the wrong one can't be recovered.</Muted>
          {send.isError && <Text style={s.err}>{(send.error as Error).message}</Text>}
          <Button onPress={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? "Sending…" : `Send ${assetLabel}`}
          </Button>
          <Button tone="ghost" onPress={() => setReviewing(false)} disabled={send.isPending}>Back</Button>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Pills items={CHAIN_IDS.map((id) => ({ id, label: CHAINS[id].label }))} value={chainId} onChange={(id) => { setChainId(id); setAmount(""); }} />
          <Pills items={[{ id: "quote" as Asset, label: chain.quote.symbol }, { id: "ETH" as Asset, label: "ETH" }]} value={asset} onChange={(a) => { setAsset(a); setAmount(""); }} />
          <View style={s.field}>
            <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={s.amount} />
            <Pressable onPress={setMax} hitSlop={8}>
              <Text style={s.max}>Max</Text>
            </Pressable>
          </View>
          <Muted>
            Available: {balance ? fmtAmount(balance.formatted, asset === "ETH" ? 5 : 2) : "—"} {assetLabel}
            {insufficient ? "  ·  more than you have" : ""}
          </Muted>
          <TextInput value={to} onChangeText={setTo} placeholder="0x… recipient address" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={s.input} />
          {to.length > 0 && !toValid && <Text style={s.err}>That doesn't look like an address.</Text>}
          <Button onPress={() => setReviewing(true)} disabled={!canReview}>Review</Button>
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  pillOn: { backgroundColor: colors.accent },
  pillText: { fontFamily: fonts.display, fontSize: 13, color: colors.muted },
  field: { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: radius.inner, paddingHorizontal: 16 },
  amount: { flex: 1, fontFamily: fonts.display, fontSize: 32, color: colors.foreground, paddingVertical: 12 },
  max: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accent },
  input: { backgroundColor: colors.background, color: colors.foreground, borderRadius: radius.inner, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, fontFamily: fonts.mono },
  review: { backgroundColor: colors.background, borderRadius: radius.inner, padding: 16, gap: 4 },
  big: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground },
  addr: { fontFamily: fonts.mono, fontSize: 12, color: colors.foreground },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  err: { color: colors.negative, fontSize: 13, fontFamily: fonts.body },
});
