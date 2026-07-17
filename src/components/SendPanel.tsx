"use client";

import { useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
import { baseChain } from "@/lib/chain";
import { fmtAmount } from "@/lib/format";
import { NATIVE_ETH, USDC } from "@/lib/markets";
import { publicClient } from "@/lib/onchain";
import { useTokenBalance, useUsdcBalance } from "@/hooks/useChainData";

type Asset = "USDC" | "ETH";

/** gas a plain transfer needs, with headroom — reserved out of an ETH "Max" */
const GAS_LIMIT = 30_000n;

export function SendPanel({ onClose }: { onClose: () => void }) {
  const { sendTransaction } = useSendTransaction();
  const queryClient = useQueryClient();
  const { data: usdcBalance } = useUsdcBalance();
  const { data: ethBalance } = useTokenBalance(NATIVE_ETH, 18);

  const [asset, setAsset] = useState<Asset>("USDC");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const decimals = asset === "USDC" ? USDC.decimals : 18;
  const balance = asset === "USDC" ? usdcBalance : ethBalance;

  let amountRaw = 0n;
  try {
    amountRaw = parseUnits(amount || "0", decimals);
  } catch {
    /* keep 0 — treated as invalid below */
  }
  const toValid = isAddress(to.trim());
  const insufficient = balance !== undefined && amountRaw > balance.raw;
  const canReview = amountRaw > 0n && toValid && !insufficient;
  const noGas = ethBalance !== undefined && ethBalance.raw === 0n;

  const setMax = async () => {
    if (!balance) return;
    if (asset === "USDC") {
      setAmount(formatUnits(balance.raw, USDC.decimals));
      return;
    }
    // leave enough ETH behind to pay for this transfer itself
    const block = await publicClient.getBlock();
    const reserve = GAS_LIMIT * (block.baseFeePerGas ?? 100_000_000n) * 3n;
    const max = balance.raw > reserve ? balance.raw - reserve : 0n;
    setAmount(formatUnits(max, 18));
  };

  const send = useMutation({
    mutationFn: async () => {
      const recipient = to.trim() as `0x${string}`;
      const tx =
        asset === "ETH"
          ? { to: recipient, value: amountRaw, chainId: baseChain.id }
          : {
              to: USDC.address,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [recipient, amountRaw],
              }),
              chainId: baseChain.id,
            };
      const { hash } = await sendTransaction(tx);
      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      return hash as `0x${string}`;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["token-balance"] });
    },
  });

  if (send.isSuccess) {
    return (
      <div className="mt-3 rounded-2xl bg-surface p-4 text-sm">
        <p className="font-semibold text-accent">Sent ✓</p>
        <p className="pt-1 text-muted">
          {fmtAmount(Number(amount), 6)} {asset} is on its way.
        </p>
        <a
          href={`https://base.blockscout.com/tx/${send.data}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all font-mono text-xs text-accent hover:underline"
        >
          View on explorer →
        </a>
        <button
          onClick={onClose}
          className="mt-3 rounded-full bg-surface-raised px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-surface p-4 text-sm">
      {!reviewing ? (
        <>
          <div className="flex gap-2 pb-3">
            {(["USDC", "ETH"] as const).map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAsset(a);
                  setAmount("");
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  asset === a
                    ? "bg-accent text-black"
                    : "bg-surface-raised text-muted hover:bg-borderline"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full rounded-xl bg-surface-raised p-3 font-mono outline-none placeholder:text-muted/50"
            />
            <button
              onClick={setMax}
              className="rounded-full bg-surface-raised px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-borderline hover:text-foreground"
            >
              Max
            </button>
          </div>
          <p className="pt-1 text-xs text-muted">
            Available: {balance ? fmtAmount(balance.formatted, 6) : "—"} {asset}
            {insufficient && <span className="text-negative"> — not enough</span>}
          </p>
          <input
            placeholder="Recipient address (0x…)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-3 w-full rounded-xl bg-surface-raised p-3 font-mono text-xs outline-none placeholder:text-muted/50"
          />
          {to.trim() !== "" && !toValid && (
            <p className="pt-1 text-xs text-negative">That doesn&apos;t look like a valid address.</p>
          )}
          <p className="pt-2 text-xs text-muted">
            Sends on <span className="text-foreground">Base</span> only.
            To move funds to an exchange, use the deposit address it shows for {asset === "ETH" ? "Ethereum" : "USDC"} on{" "}
            <span className="text-foreground">Base</span> — addresses
            for other networks won&apos;t receive it.
          </p>
          {noGas && asset === "USDC" && (
            <p className="pt-1 text-xs text-negative">
              You need a little ETH for the network fee to send USDC.
            </p>
          )}
          <button
            onClick={() => setReviewing(true)}
            disabled={!canReview}
            className="mt-3 w-full rounded-full bg-accent py-2.5 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            Review send
          </button>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">
            Send {fmtAmount(Number(amount), 6)} {asset}
          </p>
          <p className="pt-2 text-xs text-muted">To (Base):</p>
          <p className="break-all font-mono text-xs">{to.trim()}</p>
          <p className="pt-2 text-xs text-muted">
            No vaults.cash fee. Network fee comes out of your ETH. Transfers
            can&apos;t be reversed — double-check the address.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setReviewing(false)}
              disabled={send.isPending}
              className="rounded-full bg-surface-raised px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={() => send.mutate()}
              disabled={send.isPending}
              className="grow rounded-full bg-accent py-2.5 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
          {send.isError && (
            <p className="pt-2 text-xs text-negative">{(send.error as Error).message}</p>
          )}
        </>
      )}
    </div>
  );
}
