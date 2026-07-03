/**
 * vaults.cash MCP server — lets AI agents (Claude, ChatGPT, Cursor, or any
 * MCP client) open and manage Uniswap v4 LP positions on Robinhood Chain.
 * Read tools return live chain data; build tools return executable call
 * batches that the agent signs with its own wallet. vaults.cash never
 * custodies funds; the 0.6% platform fee is embedded in built calls.
 *
 * Endpoint: https://vaults.cash/api/mcp/mcp (Streamable HTTP)
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { erc20Abi, formatEther, formatUnits, isAddress } from "viem";
import { MARKETS, NATIVE_ETH, USDG, marketBySymbol } from "@/lib/markets";
import { getPoolState, publicClient, tickToUsdgPrice } from "@/lib/onchain";
import { fetchPositions, getUncollectedFees } from "@/lib/positions";
import { buildZapPlan } from "@/lib/zap";
import { buildWithdrawPlan, buildCollectPlan } from "@/lib/withdraw";
import { serializeCalls, AGENT_DOCS } from "@/lib/agent";
import { parseUnits } from "viem";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const ownerSchema = z
  .string()
  .refine((s) => isAddress(s), "must be a checksummed 0x address");

const marketSchema = z
  .string()
  .refine((s) => !!marketBySymbol(s), `one of: ${MARKETS.map((m) => m.symbol).join(", ")}`);

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_markets",
      "List all vaults.cash markets on Robinhood Chain with live mid-prices, pool parameters, and compliance flags. Markets with restricted=true are tokenized stocks that may not be offered to US persons.",
      {},
      async () => {
        const markets = await Promise.all(
          MARKETS.map(async (m) => {
            const s = await getPoolState(m);
            return {
              symbol: m.symbol,
              name: m.name,
              kind: m.kind,
              restricted: m.restricted,
              priceUsdg: tickToUsdgPrice(m, s.tick),
              poolFeeBps: m.pool.fee / 100,
              poolLiquidity: s.liquidity.toString(),
            };
          }),
        );
        return json({ chainId: 4663, usdg: USDG.address, markets });
      },
    );

    server.tool(
      "get_balances",
      "USDG, ETH (gas), and per-market asset balances for a wallet on Robinhood Chain.",
      { owner: ownerSchema },
      async ({ owner }) => {
        const addr = owner as `0x${string}`;
        const [usdg, eth] = await Promise.all([
          publicClient.readContract({
            address: USDG.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [addr],
          }),
          publicClient.getBalance({ address: addr }),
        ]);
        const assets: Record<string, string> = {};
        await Promise.all(
          MARKETS.filter((m) => m.token !== NATIVE_ETH).map(async (m) => {
            const bal = await publicClient.readContract({
              address: m.token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [addr],
            });
            if (bal > 0n) assets[m.symbol] = formatUnits(bal, m.tokenDecimals);
          }),
        );
        return json({
          usdg: formatUnits(usdg, 6),
          eth: formatEther(eth),
          note: "ETH pays network fees (~$0.01/op). Deposits are made in USDG.",
          assets,
        });
      },
    );

    server.tool(
      "get_deposit_quote",
      "Preview how a USDG deposit would split into a two-sided LP position for a market and range preset, without building calls.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
      },
      async ({ market: sym, amountUsd, preset }) => {
        const market = marketBySymbol(sym)!;
        const poolState = await getPoolState(market);
        const plan = await buildZapPlan({
          market,
          owner: "0x1111111111111111111111111111111111111111",
          usdgAmount: parseUnits(amountUsd.toFixed(6), 6),
          preset,
          slippageBps: 100,
          poolState,
        });
        return json({
          market: market.symbol,
          priceUsdg: tickToUsdgPrice(market, poolState.tick),
          feeUsdg: formatUnits(plan.feeAmount, 6),
          swapInUsdg: formatUnits(plan.swapIn, 6),
          minAssetOut: formatUnits(plan.swapOutMin, market.tokenDecimals),
          usdgKept: formatUnits(plan.usdgToPosition, 6),
          tickLower: plan.tickLower,
          tickUpper: plan.tickUpper,
        });
      },
    );

    server.tool(
      "build_deposit_calls",
      "Build the executable call batch converting `amountUsd` of the owner's USDG into a Uniswap v4 LP position owned by them. Execute the calls IN ORDER from the owner wallet (atomically if it supports batching). Includes the 0.6% vaults.cash fee. Calls embed slippage bounds and expire ~20 minutes after building.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        owner: ownerSchema,
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
        slippageBps: z.number().int().min(10).max(1000).default(100),
      },
      async ({ market: sym, amountUsd, owner, preset, slippageBps }) => {
        const market = marketBySymbol(sym)!;
        const poolState = await getPoolState(market);
        const plan = await buildZapPlan({
          market,
          owner: owner as `0x${string}`,
          usdgAmount: parseUnits(amountUsd.toFixed(6), 6),
          preset,
          slippageBps,
          poolState,
        });
        return json({
          chainId: 4663,
          restricted: market.restricted,
          calls: serializeCalls(plan.calls),
          summary: {
            feeUsdg: formatUnits(plan.feeAmount, 6),
            minAssetOut: formatUnits(plan.swapOutMin, market.tokenDecimals),
            usdgToPosition: formatUnits(plan.usdgToPosition, 6),
            range: [plan.tickLower, plan.tickUpper],
          },
          docs: AGENT_DOCS,
        });
      },
    );

    server.tool(
      "list_positions",
      "Live LP positions for a wallet: value, in-range status, and uncollected trading fees.",
      { owner: ownerSchema },
      async ({ owner }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const views = await Promise.all(
          positions.map(async (p) => {
            const [state, fees] = await Promise.all([
              getPoolState(p.market),
              getUncollectedFees(p).catch(() => ({ owed0: 0n, owed1: 0n })),
            ]);
            const price = tickToUsdgPrice(p.market, state.tick);
            const c0 = p.market.assetIsCurrency0;
            const assetOwed = c0 ? fees.owed0 : fees.owed1;
            const usdgOwed = c0 ? fees.owed1 : fees.owed0;
            return {
              tokenId: p.tokenId.toString(),
              market: p.market.symbol,
              inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
              tickRange: [p.tickLower, p.tickUpper],
              currentTick: state.tick,
              priceUsdg: price,
              uncollectedFeesUsd:
                (Number(assetOwed) / 10 ** p.market.tokenDecimals) * price +
                Number(usdgOwed) / 1e6,
            };
          }),
        );
        return json({ owner, positions: views });
      },
    );

    server.tool(
      "build_withdraw_calls",
      "Build the executable call batch that burns a position (auto-collecting accrued fees) and swaps the asset side back to USDG. The 0.6% fee applies to the swapped output only.",
      {
        owner: ownerSchema,
        tokenId: z.string().regex(/^\d+$/),
        slippageBps: z.number().int().min(10).max(1000).default(100),
      },
      async ({ owner, tokenId, slippageBps }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const position = positions.find((p) => p.tokenId === BigInt(tokenId));
        if (!position) return json({ error: `no live position ${tokenId} owned by ${owner}` });
        const plan = await buildWithdrawPlan({ position, slippageBps });
        return json({
          chainId: 4663,
          calls: serializeCalls(plan.calls),
          summary: {
            minUsdgFromSwap: formatUnits(plan.usdgOutMin, 6),
            feeUsdg: formatUnits(plan.feeAmount, 6),
          },
          docs: AGENT_DOCS,
        });
      },
    );

    server.tool(
      "build_collect_calls",
      "Build the call batch that collects a position's accrued trading fees to the owner without touching principal.",
      { owner: ownerSchema, tokenId: z.string().regex(/^\d+$/) },
      async ({ owner, tokenId }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const position = positions.find((p) => p.tokenId === BigInt(tokenId));
        if (!position) return json({ error: `no live position ${tokenId} owned by ${owner}` });
        const calls = await buildCollectPlan(position, owner as `0x${string}`);
        return json({ chainId: 4663, calls: serializeCalls(calls), docs: AGENT_DOCS });
      },
    );
  },
  {
    serverInfo: { name: "vaults-cash", version: "1.0.0" },
    instructions:
      "vaults.cash turns USDG into earning Uniswap v4 LP positions on Robinhood Chain (chain id 4663, RPC https://rpc.mainnet.chain.robinhood.com, gas: ETH). " +
      "Build tools return {to, value, data} call batches; execute them in order from the owner's wallet — atomically if it supports batching (EIP-7702/ERC-4337). " +
      "Markets flagged restricted are tokenized stocks not offerable to US persons; only request them for eligible parties. " +
      "Plans embed slippage bounds and expire ~20 minutes after building — rebuild stale plans. Positions carry impermanent-loss risk.",
  },
  { basePath: "/api/mcp", maxDuration: 60, disableSse: true },
);

export { handler as GET, handler as POST, handler as DELETE };
