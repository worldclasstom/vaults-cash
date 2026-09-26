import { usePrivy } from "@privy-io/expo";

type Linked = { type?: string; address?: string };

/** The user's smart wallet address: the same on every chain and on the web. */
export function useActiveAddress(): `0x${string}` | undefined {
  const { user } = usePrivy();
  const u = user as unknown as { linked_accounts?: Linked[]; linkedAccounts?: Linked[]; wallet?: { address?: string } } | null;
  const accounts = u?.linked_accounts ?? u?.linkedAccounts ?? [];
  const sw = accounts.find((a) => a.type === "smart_wallet");
  const eoa = accounts.find((a) => a.type === "wallet");
  return (sw?.address ?? eoa?.address ?? u?.wallet?.address) as `0x${string}` | undefined;
}

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
