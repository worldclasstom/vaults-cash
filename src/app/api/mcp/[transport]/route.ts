/**
 * vaults.cash MCP server — lets AI agents (Claude, ChatGPT, Cursor, or any
 * MCP client) open and manage Uniswap v4 LP positions on Base and Robinhood
 * Chain. Read tools return live chain data; build tools return executable
 * call batches that the agent signs with its own wallet. vaults.cash never
 * custodies funds; the 0.6% platform fee is embedded in built calls.
 *
 * Endpoint: https://vaults.cash/api/mcp/mcp (Streamable HTTP)
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { erc20Abi, formatEther, formatUnits, isAddress, parseUnits } from "viem";
import { CHAINS, CHAIN_IDS } from "@/lib/chain";
import { MARKETS, NATIVE_ETH, marketBySlug, marketsOnChain } from "@/lib/markets";
import { getMarketPricing, getPoolState, publicClientFor } from "@/lib/onchain";
import { fetchPositions, getUncollectedFees } from "@/lib/positions";
import { buildZapPlan } from "@/lib/zap";
import { buildWithdrawPlan, buildCollectPlan } from "@/lib/withdraw";
import { serializeCalls, AGENT_DOCS } from "@/lib/agent";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const ownerSchema = z
  .string()
  .refine((s) => isAddress(s), "must be a checksummed 0x address");

const marketSchema = z
  .string()
  .refine((s) => !!marketBySlug(s), `one of: ${MARKETS.map((m) => m.slug).join(", ")}`);

const chainSummary = CHAIN_IDS.map((id) => `${CHAINS[id].chain.name} (chain ${id}, deposits in ${CHAINS[id].quote.symbol})`).join(" and ");

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_markets",
      `List all vaults.cash markets (Uniswap v4 pools) across ${chainSummary}. Markets are pairs identified by slug "<chain>/<base>-<quote>" (e.g. "base/eth-usdc", "base/cbbtc-eth", "robinhood/tsla-eth"); deposits and withdrawals are always in the chain's stablecoin regardless of the quote. lowIl=true pairs track the same thing on both legs (minimal impermanent loss).`,
      {},
      async () => {
        const settled = await Promise.allSettled(
          MARKETS.map(async (m) => {
            const { state, price, quoteUsd, priceUsd } = await getMarketPricing(m);
            return {
              market: m.slug,
              pair: m.name,
              chainId: m.chainId,
              base: m.base.symbol,
              quote: m.quote.symbol,
              kind: m.kind,
              lowIl: m.lowIl,
              price,
              quoteUsd,
              priceUsd,
              poolFeeBps: m.pool.fee / 100,
              poolLiquidity: state.liquidity.toString(),
            };
          }),
        );
        const markets = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
        return json({
          chains: CHAIN_IDS.map((id) => ({ chainId: id, name: CHAINS[id].chain.name, quote: CHAINS[id].quote })),
          markets,
        });
      },
    );

    server.tool(
      "get_balances",
      "Stablecoin (USDC / USDG), ETH (gas), and per-market asset balances for a wallet on every supported chain.",
      { owner: ownerSchema },
      async ({ owner }) => {
        const addr = owner as `0x${string}`;
        const perChain = await Promise.all(
          CHAIN_IDS.map(async (chainId) => {
            const client = publicClientFor(chainId);
            const { quote } = CHAINS[chainId];
            const [stable, eth] = await Promise.all([
              client.readContract({ address: quote.address, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
              client.getBalance({ address: addr }),
            ]);
            const assets: Record<string, string> = {};
            await Promise.all(
              marketsOnChain(chainId)
                .filter((m) => m.base.address !== NATIVE_ETH)
                .map(async (m) => {
                  const bal = await client.readContract({ address: m.base.address, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
                  if (bal > 0n) assets[m.base.symbol] = formatUnits(bal, m.base.decimals);
                }),
            );
            return {
              chainId,
              chain: CHAINS[chainId].chain.name,
              [quote.symbol.toLowerCase()]: formatUnits(stable, quote.decimals),
              eth: formatEther(eth),
              gasSponsored: CHAINS[chainId].gasSponsored,
              assets,
            };
          }),
        );
        return json({
          owner,
          balances: perChain,
          note: "Deposits are made in the chain's stablecoin. Where gasSponsored is false, ETH on that chain pays network fees (well under a cent per op).",
        });
      },
    );

    server.tool(
      "get_deposit_quote",
      "Preview how a stablecoin deposit would split into a two-sided LP position for a market and range preset, without building calls.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
      },
      async ({ market: sym, amountUsd, preset }) => {
        const market = marketBySlug(sym)!;
        const stable = CHAINS[market.chainId].quote;
        const poolState = await getPoolState(market);
        const plan = await buildZapPlan({
          market,
          owner: "0x1111111111111111111111111111111111111111",
          usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
          preset,
          slippageBps: 100,
          poolState,
        });
        return json({
          market: market.slug,
          chainId: market.chainId,
          stablecoin: stable.symbol,
          priceUsd: plan.price * plan.quoteUsd,
          fee: formatUnits(plan.feeAmount, stable.decimals),
          quoteLeg: plan.quoteLeg ? `${formatUnits(plan.quoteLeg.stableIn, stable.decimals)} ${stable.symbol} -> ≥${formatUnits(plan.quoteLeg.quoteOutMin, market.quote.decimals)} ${market.quote.symbol}` : null,
          swapInQuote: `${formatUnits(plan.swapIn, market.quote.decimals)} ${market.quote.symbol}`,
          minBaseOut: `${formatUnits(plan.swapOutMin, market.base.decimals)} ${market.base.symbol}`,
          quoteToPosition: `${formatUnits(plan.quoteToPosition, market.quote.decimals)} ${market.quote.symbol}`,
          tickLower: plan.tickLower,
          tickUpper: plan.tickUpper,
        });
      },
    );

    server.tool(
      "build_deposit_calls",
      "Build the executable call batch converting `amountUsd` of the owner's stablecoin (USDC on Base, USDG on Robinhood Chain) into a Uniswap v4 LP position in the given pair, owned by them. Execute the calls IN ORDER from the owner wallet on the returned chainId (atomically if it supports batching). Includes the 0.6% vaults.cash fee. Calls embed slippage bounds and expire ~20 minutes after building.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        owner: ownerSchema,
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
        slippageBps: z.number().int().min(10).max(1000).default(100),
      },
      async ({ market: sym, amountUsd, owner, preset, slippageBps }) => {
        const market = marketBySlug(sym)!;
        const stable = CHAINS[market.chainId].quote;
        const poolState = await getPoolState(market);
        const plan = await buildZapPlan({
          market,
          owner: owner as `0x${string}`,
          usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
          preset,
          slippageBps,
          poolState,
        });
        return json({
          chainId: plan.chainId,
          market: market.slug,
          calls: serializeCalls(plan.calls),
          summary: {
            fee: `${formatUnits(plan.feeAmount, stable.decimals)} ${stable.symbol}`,
            minBaseOut: `${formatUnits(plan.swapOutMin, market.base.decimals)} ${market.base.symbol}`,
            quoteToPosition: `${formatUnits(plan.quoteToPosition, market.quote.decimals)} ${market.quote.symbol}`,
            range: [plan.tickLower, plan.tickUpper],
          },
          docs: AGENT_DOCS,
        });
      },
    );

    server.tool(
      "list_positions",
      "Live LP positions for a wallet on every supported chain: value, in-range status, and uncollected trading fees.",
      { owner: ownerSchema },
      async ({ owner }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const views = await Promise.all(
          positions.map(async (p) => {
            const [{ state, price, quoteUsd, priceUsd }, fees] = await Promise.all([
              getMarketPricing(p.market),
              getUncollectedFees(p).catch(() => ({ owed0: 0n, owed1: 0n })),
            ]);
            const c0 = p.market.baseIsCurrency0;
            const baseOwed = Number(c0 ? fees.owed0 : fees.owed1) / 10 ** p.market.base.decimals;
            const quoteOwed = Number(c0 ? fees.owed1 : fees.owed0) / 10 ** p.market.quote.decimals;
            return {
              tokenId: p.tokenId.toString(),
              market: p.market.slug,
              chainId: p.market.chainId,
              inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
              tickRange: [p.tickLower, p.tickUpper],
              currentTick: state.tick,
              price,
              quoteUsd,
              priceUsd,
              uncollectedFeesUsd: (baseOwed * price + quoteOwed) * quoteUsd,
            };
          }),
        );
        return json({ owner, positions: views });
      },
    );

    server.tool(
      "build_withdraw_calls",
      "Build the executable call batch that burns a position (auto-collecting accrued fees) and converts everything back to the chain's stablecoin (through the quote leg's stablecoin pool when needed). The 0.6% fee applies to the converted output. Execute on the returned chainId.",
      {
        owner: ownerSchema,
        tokenId: z.string().regex(/^\d+$/),
        chainId: z.number().int().optional().describe("disambiguates when the same tokenId exists on both chains"),
        slippageBps: z.number().int().min(10).max(1000).default(100),
      },
      async ({ owner, tokenId, chainId, slippageBps }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const position = positions.find(
          (p) => p.tokenId === BigInt(tokenId) && (chainId === undefined || p.market.chainId === chainId),
        );
        if (!position) return json({ error: `no live position ${tokenId} owned by ${owner}` });
        const plan = await buildWithdrawPlan({ position, slippageBps });
        const stable = CHAINS[position.market.chainId].quote;
        return json({
          chainId: plan.chainId,
          market: position.market.slug,
          calls: serializeCalls(plan.calls),
          summary: {
            minStableOut: `${formatUnits(plan.stableOutMin, stable.decimals)} ${stable.symbol}`,
            fee: `${formatUnits(plan.feeAmount, stable.decimals)} ${stable.symbol}`,
          },
          docs: AGENT_DOCS,
        });
      },
    );

    server.tool(
      "build_collect_calls",
      "Build the call batch that collects a position's accrued trading fees to the owner without touching principal. Execute on the returned chainId.",
      {
        owner: ownerSchema,
        tokenId: z.string().regex(/^\d+$/),
        chainId: z.number().int().optional(),
      },
      async ({ owner, tokenId, chainId }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const position = positions.find(
          (p) => p.tokenId === BigInt(tokenId) && (chainId === undefined || p.market.chainId === chainId),
        );
        if (!position) return json({ error: `no live position ${tokenId} owned by ${owner}` });
        const calls = await buildCollectPlan(position, owner as `0x${string}`);
        return json({ chainId: position.market.chainId, calls: serializeCalls(calls), docs: AGENT_DOCS });
      },
    );
  },
  {
    serverInfo: { name: "vaults-cash", version: "1.1.0" },
    instructions:
      `vaults.cash turns stablecoins into earning Uniswap v4 LP positions on ${chainSummary}; gas is ETH on both. ` +
      "Every market has a slug; every plan returns the chainId its calls must be executed on. " +
      "Build tools return {to, value, data} call batches; execute them in order from the owner's wallet — atomically if it supports batching (EIP-7702/ERC-4337). " +
      "Plans embed slippage bounds and expire ~20 minutes after building — rebuild stale plans. Positions carry impermanent-loss risk.",
  },
  { basePath: "/api/mcp", maxDuration: 60, disableSse: true },
);

export { handler as GET, handler as POST, handler as DELETE };
