/**
 * vaults.cash MCP server — lets AI agents (Claude, ChatGPT, Cursor, or any
 * MCP client) open and manage Uniswap v4 LP positions on Base and Robinhood
 * Chain. Read tools return live chain data; build tools return executable
 * call batches that the agent signs with its own wallet. vaults.cash never
 * custodies funds; the 0.6% platform fee is embedded in built calls.
 *
 * Endpoint: https://vaults.cash/api/mcp/mcp (Streamable HTTP)
 *
 * Two ways in:
 *  - bring your own wallet: the build_* tools return call batches you sign;
 *  - a vaults.cash account key (`Authorization: Bearer vc_…`, minted at
 *    /account → Agent access): the deposit/add/withdraw/collect tools run
 *    from the user's own smart wallet through their Privy session signer,
 *    with the app's sponsored gas and atomic batches.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { erc20Abi, formatEther, formatUnits, isAddress, parseUnits } from "viem";
import { CHAINS, CHAIN_IDS, gasMode } from "@/lib/chain";
import { MARKETS, NATIVE_ETH, marketBySlug, marketsOnChain } from "@/lib/markets";
import { getMarketPricing, getPoolState, publicClientFor } from "@/lib/onchain";
import { fetchPositions, getUncollectedFees } from "@/lib/positions";
import { buildZapPlan } from "@/lib/zap";
import { buildWithdrawPlan, buildCollectPlan } from "@/lib/withdraw";
import { serializeCalls, AGENT_DOCS } from "@/lib/agent";
import { referrerWalletForCode } from "@/lib/referral";
import { referrerWalletForUser, resolveAgentKey } from "@/lib/agentAccess";
import { executeForUser } from "@/lib/executor";
import { explorerUrl, isChainId, type ChainId } from "@/lib/chain";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const ownerSchema = z
  .string()
  .refine((s) => isAddress(s), "must be a checksummed 0x address");

const marketSchema = z
  .string()
  .refine((s) => !!marketBySlug(s), `one of: ${MARKETS.map((m) => m.slug).join(", ")}`);

const refSchema = z
  .string()
  .regex(/^[A-Z0-9]{4,16}$/i)
  .optional()
  .describe("vaults.cash referral code; half of the fee is paid on-chain to that code's wallet in the same batch (integrators: use your own code)");

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
              gas: gasMode(chainId),
              assets,
            };
          }),
        );
        return json({
          owner,
          balances: perChain,
          note: "Deposits are made in the chain's stablecoin. gas is 'sponsored' (paid by vaults.cash), 'token' (a few cents charged in the chain's stablecoin — keep ~$0.50 of it spare), or 'eth' (paid from the wallet's ETH).",
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
      "Build the executable call batch converting `amountUsd` of the owner's stablecoin (USDC on Base, USDG on Robinhood Chain) into a NEW Uniswap v4 LP position in the given pair, owned by them. Execute the calls IN ORDER from the owner wallet on the returned chainId (atomically if it supports batching). Includes the 0.6% vaults.cash fee (minimum deposit $5). Calls embed slippage bounds and expire ~20 minutes after building. To grow an existing position use build_add_calls.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        owner: ownerSchema,
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
        widthPct: z.number().positive().max(500).optional().describe("custom ±% range width instead of a preset"),
        slippageBps: z.number().int().min(10).max(1000).default(100),
        ref: refSchema,
      },
      async ({ market: sym, amountUsd, owner, preset, widthPct, slippageBps, ref }) => {
        const market = marketBySlug(sym)!;
        const stable = CHAINS[market.chainId].quote;
        const [poolState, referrer] = await Promise.all([getPoolState(market), referrerWalletForCode(ref, owner)]);
        const plan = await buildZapPlan({
          market,
          owner: owner as `0x${string}`,
          usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
          preset,
          customWidth: widthPct !== undefined ? widthPct / 100 : undefined,
          slippageBps,
          poolState,
          referrer,
        });
        return json({
          chainId: plan.chainId,
          market: market.slug,
          referrer,
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
      "build_add_calls",
      "Build the call batch that adds `amountUsd` of the owner's stablecoin to one of their EXISTING positions, keeping its price range. Same execution rules and fee as build_deposit_calls.",
      {
        owner: ownerSchema,
        tokenId: z.string().regex(/^\d+$/),
        chainId: z.number().int().optional().describe("disambiguates when the same tokenId exists on both chains"),
        amountUsd: z.number().positive(),
        slippageBps: z.number().int().min(10).max(1000).default(100),
        ref: refSchema,
      },
      async ({ owner, tokenId, chainId, amountUsd, slippageBps, ref }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const position = positions.find(
          (p) => p.tokenId === BigInt(tokenId) && (chainId === undefined || p.market.chainId === chainId),
        );
        if (!position) return json({ error: `no live position ${tokenId} owned by ${owner}` });
        const market = position.market;
        const stable = CHAINS[market.chainId].quote;
        const [poolState, referrer] = await Promise.all([getPoolState(market), referrerWalletForCode(ref, owner)]);
        const plan = await buildZapPlan({
          market,
          owner: owner as `0x${string}`,
          usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
          preset: "full",
          slippageBps,
          poolState,
          addTo: { tokenId: position.tokenId, tickLower: position.tickLower, tickUpper: position.tickUpper },
          referrer,
        });
        return json({
          chainId: plan.chainId,
          market: market.slug,
          tokenId,
          referrer,
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
        ref: refSchema,
      },
      async ({ owner, tokenId, chainId, slippageBps, ref }) => {
        const positions = await fetchPositions(owner as `0x${string}`);
        const position = positions.find(
          (p) => p.tokenId === BigInt(tokenId) && (chainId === undefined || p.market.chainId === chainId),
        );
        if (!position) return json({ error: `no live position ${tokenId} owned by ${owner}` });
        const referrer = await referrerWalletForCode(ref, owner);
        const plan = await buildWithdrawPlan({ position, slippageBps, owner: owner as `0x${string}`, referrer });
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

    // ---------------------------------------------------------------
    // Account-linked tools: act on the signed-in user's own smart wallet.
    // ---------------------------------------------------------------
    type Linked = { did: string; wallet: `0x${string}` };
    const linked = (extra: { authInfo?: { extra?: Record<string, unknown> } }): Linked | null => {
      const x = extra.authInfo?.extra;
      return x && typeof x.did === "string" && typeof x.wallet === "string" ? { did: x.did, wallet: x.wallet as `0x${string}` } : null;
    };
    const needKey = json({
      error: "This tool acts on a vaults.cash account and needs an account key. The user creates one at https://vaults.cash/account (Agent access) and you send it as `Authorization: Bearer vc_…`. Without a key, use the build_* tools with your own wallet.",
    });
    const findPosition = async (owner: `0x${string}`, tokenId: string, chainId?: number) => {
      const positions = await fetchPositions(owner);
      return positions.find((p) => p.tokenId === BigInt(tokenId) && (chainId === undefined || p.market.chainId === chainId));
    };
    const done = (r: { chainId: ChainId; txHash: `0x${string}`; smartWallet: `0x${string}` }, what: string) =>
      json({ ok: true, what, chainId: r.chainId, txHash: r.txHash, explorer: explorerUrl(r.chainId, "tx", r.txHash), wallet: r.smartWallet });

    server.tool(
      "my_account",
      "The linked vaults.cash account (needs an account key): smart wallet address, whether agent access is active, and balances on every chain.",
      {},
      async (_args, extra) => {
        const me = linked(extra);
        if (!me) return needKey;
        const perChain = await Promise.all(
          CHAIN_IDS.map(async (chainId) => {
            const client = publicClientFor(chainId);
            const { quote } = CHAINS[chainId];
            const [stable, eth] = await Promise.all([
              client.readContract({ address: quote.address, abi: erc20Abi, functionName: "balanceOf", args: [me.wallet] }),
              client.getBalance({ address: me.wallet }),
            ]);
            return { chainId, chain: CHAINS[chainId].chain.name, [quote.symbol.toLowerCase()]: formatUnits(stable, quote.decimals), eth: formatEther(eth), gasSponsored: CHAINS[chainId].gasSponsored, gas: gasMode(chainId) };
          }),
        );
        return json({ wallet: me.wallet, balances: perChain, note: "Deposits come out of the chain's stablecoin balance. On Base the app pays gas; on Robinhood Chain the wallet needs a little ETH." });
      },
    );

    server.tool(
      "my_positions",
      "Live positions of the linked vaults.cash account (needs an account key).",
      {},
      async (_args, extra) => {
        const me = linked(extra);
        if (!me) return needKey;
        const positions = await fetchPositions(me.wallet);
        const views = await Promise.all(
          positions.map(async (p) => {
            const { state, price, quoteUsd, priceUsd } = await getMarketPricing(p.market);
            return { tokenId: p.tokenId.toString(), market: p.market.slug, chainId: p.market.chainId, inRange: state.tick >= p.tickLower && state.tick < p.tickUpper, price, quoteUsd, priceUsd };
          }),
        );
        return json({ wallet: me.wallet, positions: views });
      },
    );

    server.tool(
      "deposit",
      "Deposit from the linked account's stablecoin into a NEW position in `market` (needs an account key). Executes on-chain from the user's own smart wallet and returns the transaction. Minimum $5; 0.6% fee.",
      {
        market: marketSchema,
        amountUsd: z.number().positive(),
        preset: z.enum(["full", "balanced", "aggressive"]).default("full"),
        widthPct: z.number().positive().max(500).optional(),
        slippageBps: z.number().int().min(10).max(1000).default(100),
      },
      async ({ market: sym, amountUsd, preset, widthPct, slippageBps }, extra) => {
        const me = linked(extra);
        if (!me) return needKey;
        const market = marketBySlug(sym)!;
        const stable = CHAINS[market.chainId].quote;
        const [poolState, referrer] = await Promise.all([getPoolState(market), referrerWalletForUser(me.did)]);
        const plan = await buildZapPlan({
          market, owner: me.wallet, usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
          preset, customWidth: widthPct !== undefined ? widthPct / 100 : undefined, slippageBps, poolState, referrer,
        });
        if (!isChainId(plan.chainId)) return json({ error: "unsupported chain" });
        const r = await executeForUser(me.did, plan.chainId, plan.calls);
        return done(r, `Deposited ${amountUsd} ${stable.symbol} into ${market.slug} (fee ${formatUnits(plan.feeAmount, stable.decimals)} ${stable.symbol}, range ticks ${plan.tickLower}..${plan.tickUpper})`);
      },
    );

    server.tool(
      "add",
      "Add stablecoin to one of the linked account's existing positions, keeping its range (needs an account key). Executes on-chain.",
      { tokenId: z.string().regex(/^\d+$/), chainId: z.number().int().optional(), amountUsd: z.number().positive(), slippageBps: z.number().int().min(10).max(1000).default(100) },
      async ({ tokenId, chainId, amountUsd, slippageBps }, extra) => {
        const me = linked(extra);
        if (!me) return needKey;
        const position = await findPosition(me.wallet, tokenId, chainId);
        if (!position) return json({ error: `no live position ${tokenId} in this account` });
        const market = position.market;
        const stable = CHAINS[market.chainId].quote;
        const [poolState, referrer] = await Promise.all([getPoolState(market), referrerWalletForUser(me.did)]);
        const plan = await buildZapPlan({
          market, owner: me.wallet, usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
          preset: "full", slippageBps, poolState, referrer,
          addTo: { tokenId: position.tokenId, tickLower: position.tickLower, tickUpper: position.tickUpper },
        });
        if (!isChainId(plan.chainId)) return json({ error: "unsupported chain" });
        const r = await executeForUser(me.did, plan.chainId, plan.calls);
        return done(r, `Added ${amountUsd} ${stable.symbol} to position #${tokenId} (${market.slug})`);
      },
    );

    server.tool(
      "withdraw",
      "Close one of the linked account's positions and convert everything back to the chain's stablecoin (needs an account key). Executes on-chain; fees earned are collected in the same transaction.",
      { tokenId: z.string().regex(/^\d+$/), chainId: z.number().int().optional(), slippageBps: z.number().int().min(10).max(1000).default(50) },
      async ({ tokenId, chainId, slippageBps }, extra) => {
        const me = linked(extra);
        if (!me) return needKey;
        const position = await findPosition(me.wallet, tokenId, chainId);
        if (!position) return json({ error: `no live position ${tokenId} in this account` });
        const referrer = await referrerWalletForUser(me.did);
        const plan = await buildWithdrawPlan({ position, slippageBps, owner: me.wallet, referrer });
        if (!isChainId(plan.chainId)) return json({ error: "unsupported chain" });
        const stable = CHAINS[position.market.chainId].quote;
        const r = await executeForUser(me.did, plan.chainId, plan.calls);
        return done(r, `Withdrew position #${tokenId} (${position.market.slug}); at least ${formatUnits(plan.stableOutMin - plan.feeAmount, stable.decimals)} ${stable.symbol} after the ${formatUnits(plan.feeAmount, stable.decimals)} ${stable.symbol} fee`);
      },
    );

    server.tool(
      "collect",
      "Collect the trading fees one of the linked account's positions has earned, without touching principal (needs an account key). Executes on-chain.",
      { tokenId: z.string().regex(/^\d+$/), chainId: z.number().int().optional() },
      async ({ tokenId, chainId }, extra) => {
        const me = linked(extra);
        if (!me) return needKey;
        const position = await findPosition(me.wallet, tokenId, chainId);
        if (!position) return json({ error: `no live position ${tokenId} in this account` });
        const calls = await buildCollectPlan(position, me.wallet);
        const r = await executeForUser(me.did, position.market.chainId as ChainId, calls);
        return done(r, `Collected fees on position #${tokenId} (${position.market.slug})`);
      },
    );
  },
  {
    serverInfo: { name: "vaults-cash", version: "1.3.0" },
    instructions:
      `vaults.cash turns stablecoins into earning Uniswap v4 LP positions on ${chainSummary}; gas is ETH on both. ` +
      "Every market has a slug; every plan returns the chainId its calls must be executed on. " +
      "Build tools return {to, value, data} call batches; execute them in order from the owner's wallet — atomically if it supports batching (EIP-7702/ERC-4337). " +
      "Plans embed slippage bounds and expire ~20 minutes after building — rebuild stale plans. Pass `ref` (a referral code) on build tools to have half the fee paid on-chain to that code's wallet. " +
      "With a vaults.cash account key (Authorization: Bearer vc_…) the my_account / my_positions / deposit / add / withdraw / collect tools act on the user's own wallet and execute on-chain for them. Positions carry impermanent-loss risk.",
  },
  { basePath: "/api/mcp", maxDuration: 60, disableSse: true },
);

/** Optional bearer: a vaults.cash account key links the session to a user.
 *  Anything else (or nothing) is the bring-your-own-wallet mode. */
const authed = withMcpAuth(
  handler,
  async (_req, bearer) => {
    const me = await resolveAgentKey(bearer);
    if (!me) return undefined;
    return { token: bearer!, clientId: "vaults-cash-account-key", scopes: ["account"], extra: { did: me.privyDid, wallet: me.wallet } };
  },
  { required: false },
);

export { authed as GET, authed as POST, authed as DELETE };
