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
import { MARKETS, NATIVE_ETH, marketBySymbol, marketsOnChain } from "@/lib/markets";
import { getPoolState, publicClientFor, tickToUsdcPrice } from "@/lib/onchain";
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
  .refine((s) => !!marketBySymbol(s), `one of: ${MARKETS.map((m) => m.slug).join(", ")}`);

const chainSummary = CHAIN_IDS.map((id) => `${CHAINS[id].chain.name} (chain ${id}, deposits in ${CHAINS[id].quote.symbol})`).join(" and ");

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_markets",
      `List all vaults.cash markets across ${chainSummary} with live mid-prices and pool parameters. Markets are identified by slug (e.g. "eth" = ETH on Base, "eth-robinhood" = ETH on Robinhood Chain). All markets are crypto paired against the chain's dollar stablecoin; kind=stable marks stablecoin-correlated pairs with minimal impermanent loss.`,
      {},
      async () => {
        const settled = await Promise.allSettled(
          MARKETS.map(async (m) => {
            const s = await getPoolState(m);
            return {
              market: m.slug,
              symbol: m.symbol,
              name: m.name,
              chainId: m.chainId,
              quote: m.quote.symbol,
              kind: m.kind,
              priceUsdc: tickToUsdcPrice(m, s.tick),
              poolFeeBps: m.pool.fee / 100,
              poolLiquidity: s.liquidity.toString(),
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
                .filter((m) => m.token !== NATIVE_ETH)
                .map(async (m) => {
                  const bal = await client.readContract({ address: m.token, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
                  if (bal > 0n) assets[m.symbol] = formatUnits(bal, m.tokenDecimals);
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
        const market = marketBySymbol(sym)!;
        const d = market.quote.decimals;
        const poolState = await getPoolState(market);
        const plan = await buildZapPlan({
          market,
          owner: "0x1111111111111111111111111111111111111111",
          usdcAmount: parseUnits(amountUsd.toFixed(d), d),
          preset,
          slippageBps: 100,
          poolState,
        });
        return json({
          market: market.slug,
          chainId: market.chainId,
          quote: market.quote.symbol,
          priceUsdc: tickToUsdcPrice(market, poolState.tick),
          feeUsdc: formatUnits(plan.feeAmount, d),
          swapInUsdc: formatUnits(plan.swapIn, d),
          minAssetOut: formatUnits(plan.swapOutMin, market.tokenDecimals),
          usdcKept: formatUnits(plan.usdcToPosition, d),
          tickLower: plan.tickLower,
          tickUpper: plan.tickUpper,
        });
      },
    );

    server.tool(
      "build_deposit_calls",
      "Build the executable call batch converting `amountUsd` of the owner's stablecoin (USDC on Base, USDG on Robinhood Chain) into a Uniswap v4 LP position owned by them. Execute the calls IN ORDER from the owner wallet on the returned chainId (atomically if it supports batching). Includes the 0.6% vaults.cash fee. Calls embed slippage bounds and expire ~20 minutes after building.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        owner: ownerSchema,
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
        slippageBps: z.number().int().min(10).max(1000).default(100),
      },
      async ({ market: sym, amountUsd, owner, preset, slippageBps }) => {
        const market = marketBySymbol(sym)!;
        const d = market.quote.decimals;
        const poolState = await getPoolState(market);
        const plan = await buildZapPlan({
          market,
          owner: owner as `0x${string}`,
          usdcAmount: parseUnits(amountUsd.toFixed(d), d),
          preset,
          slippageBps,
          poolState,
        });
        return json({
          chainId: plan.chainId,
          market: market.slug,
          calls: serializeCalls(plan.calls),
          summary: {
            feeUsdc: formatUnits(plan.feeAmount, d),
            minAssetOut: formatUnits(plan.swapOutMin, market.tokenDecimals),
            usdcToPosition: formatUnits(plan.usdcToPosition, d),
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
            const [state, fees] = await Promise.all([
              getPoolState(p.market),
              getUncollectedFees(p).catch(() => ({ owed0: 0n, owed1: 0n })),
            ]);
            const price = tickToUsdcPrice(p.market, state.tick);
            const c0 = p.market.assetIsCurrency0;
            const assetOwed = c0 ? fees.owed0 : fees.owed1;
            const usdcOwed = c0 ? fees.owed1 : fees.owed0;
            return {
              tokenId: p.tokenId.toString(),
              market: p.market.slug,
              chainId: p.market.chainId,
              inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
              tickRange: [p.tickLower, p.tickUpper],
              currentTick: state.tick,
              priceUsdc: price,
              uncollectedFeesUsd:
                (Number(assetOwed) / 10 ** p.market.tokenDecimals) * price +
                Number(usdcOwed) / 10 ** p.market.quote.decimals,
            };
          }),
        );
        return json({ owner, positions: views });
      },
    );

    server.tool(
      "build_withdraw_calls",
      "Build the executable call batch that burns a position (auto-collecting accrued fees) and swaps the asset side back to the chain's stablecoin. The 0.6% fee applies to the swapped output only. Execute on the returned chainId.",
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
        const d = position.market.quote.decimals;
        return json({
          chainId: plan.chainId,
          market: position.market.slug,
          calls: serializeCalls(plan.calls),
          summary: {
            minUsdcFromSwap: formatUnits(plan.usdcOutMin, d),
            feeUsdc: formatUnits(plan.feeAmount, d),
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
