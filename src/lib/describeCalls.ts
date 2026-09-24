import { decodeFunctionData, erc20Abi, formatEther, formatUnits, toFunctionSelector, zeroAddress } from "viem";
import { CHAINS } from "./chain";
import { fmtAmount, fmtUsd } from "./format";
import { NATIVE_ETH, shareAmount, type Market } from "./markets";
import { PERMIT2, contractsOf, permit2Abi, type Call } from "./uniswap";
import { planSummary, type ZapPlan } from "./zap";

/** One step of the batch, in words a first-time user can check against the
 *  confirm sheet. Every deposit is a handful of well-known calls, so this is
 *  a selector switch, not a general decoder. */
export type CallDescription = {
  title: string;
  detail?: string;
  /** who the call goes to, in words */
  contract: string;
  call: Call;
};

const SEL = {
  approve: toFunctionSelector("function approve(address,uint256)"),
  transfer: toFunctionSelector("function transfer(address,uint256)"),
  permit2Approve: toFunctionSelector("function approve(address,address,uint160,uint48)"),
  execute: toFunctionSelector("function execute(bytes,bytes[],uint256)"),
  modifyLiquidities: toFunctionSelector("function modifyLiquidities(bytes,uint256)"),
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function contractLabels(market: Market): Record<string, string> {
  const { router, posm } = contractsOf(market);
  const stable = CHAINS[market.chainId].quote;
  return {
    [stable.address.toLowerCase()]: `${stable.symbol} token`,
    [market.base.address.toLowerCase()]: `${market.base.symbol} token`,
    [market.quote.address.toLowerCase()]: `${market.quote.symbol} token`,
    [PERMIT2.toLowerCase()]: "Permit2 (Uniswap's approval contract)",
    [router.toLowerCase()]: "Uniswap Universal Router",
    [posm.toLowerCase()]: "Uniswap Position Manager",
  };
}

export function describeCalls(plan: ZapPlan, market: Market): CallDescription[] {
  const chain = CHAINS[market.chainId];
  const { router, posm } = contractsOf(market);
  const labels = contractLabels(market);
  const feeRecipient = (process.env.NEXT_PUBLIC_FEE_RECIPIENT ?? zeroAddress).toLowerCase();
  const tokens: Record<string, { symbol: string; decimals: number; base?: boolean }> = {
    [chain.quote.address.toLowerCase()]: { symbol: chain.quote.symbol, decimals: chain.quote.decimals },
    [market.quote.address.toLowerCase()]: { symbol: market.quote.symbol, decimals: market.quote.decimals },
    [market.base.address.toLowerCase()]: { symbol: market.base.symbol, decimals: market.base.decimals, base: true },
    [NATIVE_ETH.toLowerCase()]: { symbol: "ETH", decimals: 18 },
  };
  const tok = (a: string) => tokens[a.toLowerCase()] ?? { symbol: short(a), decimals: 18 };
  const amt = (units: bigint, a: string) => {
    const t = tok(a);
    const n = Number(formatUnits(units, t.decimals));
    return `${fmtAmount(t.base ? shareAmount(market, n) : n, 5)} ${t.symbol}`;
  };
  const summary = planSummary(plan, market);
  let swaps = 0;

  return plan.calls.map((call) => {
    const sel = call.data.slice(0, 10);
    const to = call.to.toLowerCase();
    const contract = labels[to] ?? short(call.to);
    const base = { contract, call };
    const value = call.value > 0n ? ` Sends ${fmtAmount(Number(formatEther(call.value)), 6)} ETH along with it.` : "";

    if (sel === SEL.approve) {
      return { ...base, title: `Allow Permit2 to move your ${tok(to).symbol}`, detail: "One-time approval, the standard first step of any Uniswap deposit." };
    }
    if (sel === SEL.permit2Approve && to === PERMIT2.toLowerCase()) {
      const { args } = decodeFunctionData({ abi: permit2Abi, data: call.data });
      const [token, spender, , expiration] = args as readonly [string, string, bigint, number];
      const who = spender.toLowerCase() === router.toLowerCase() ? "the Uniswap router swap" : spender.toLowerCase() === posm.toLowerCase() ? "the Uniswap position manager deposit" : `${short(spender)} use`;
      return { ...base, title: `Let ${who} your ${tok(token).symbol}`, detail: `Through Permit2, until ${new Date(Number(expiration) * 1000).toLocaleString()}.` };
    }
    if (sel === SEL.transfer) {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: call.data });
      const [recipient, amount] = args as readonly [string, bigint];
      const dollars = fmtUsd(Number(formatUnits(amount, tok(to).decimals)));
      return recipient.toLowerCase() === feeRecipient
        ? { ...base, title: `vaults.cash fee ${dollars}`, detail: `Paid to ${short(recipient)}, the published fee wallet. The only thing vaults.cash receives.` }
        : { ...base, title: `Referral share ${dollars}`, detail: `Paid to ${short(recipient)}, the wallet that referred you — it comes out of the fee, not your deposit.` };
    }
    if (sel === SEL.execute) {
      swaps += 1;
      if (plan.quoteLeg && swaps === 1) {
        return { ...base, title: `Swap ${amt(plan.quoteLeg.stableIn, chain.quote.address)} for at least ${amt(plan.quoteLeg.quoteOutMin, market.quote.address)}`, detail: `On Uniswap. Reverts if the pool moves and can't deliver the minimum.${value}` };
      }
      return { ...base, title: `Swap ${amt(plan.swapIn, market.quote.address)} for at least ${amt(plan.swapOutMin, market.base.address)}`, detail: `On Uniswap. Reverts if the pool moves and can't deliver the minimum.${value}` };
    }
    if (sel === SEL.modifyLiquidities) {
      const what = `~${fmtUsd(summary.baseUsd)} of ${market.base.symbol} + ~${fmtUsd(summary.quoteUsd)} of ${market.quote.symbol}`;
      return plan.addToTokenId !== undefined
        ? { ...base, title: `Add ${what} to your position #${plan.addToTokenId}`, detail: `The position NFT stays in your wallet.${value}` }
        : { ...base, title: `Place ${what} in the pool as a position NFT`, detail: `Minted straight to your wallet — vaults.cash never holds it.${value}` };
    }
    return { ...base, title: `Call ${contract}`, detail: value || undefined };
  });
}
