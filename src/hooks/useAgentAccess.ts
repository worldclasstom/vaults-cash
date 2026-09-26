"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSigners, useWallets } from "@privy-io/react-auth";

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
const POLICY_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_POLICY_ID;

/**
 * Grant vaults.cash the session signer on the embedded wallet (Privy shows
 * its own confirmation). One permission, used by the Targets keeper and by
 * any AI agent the user connects. Shared by the Account card and the
 * Set-a-target checkbox so the user can turn it on wherever they are.
 */
export function useGrantAgentAccess() {
  const { wallets } = useWallets();
  const { addSigners } = useSigners();
  const qc = useQueryClient();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  return useMutation({
    mutationFn: async () => {
      if (!SIGNER_ID) throw new Error("Agent access isn't configured yet.");
      if (!embedded) throw new Error("No embedded wallet found on this account.");
      await addSigners({ address: embedded.address, signers: [{ signerId: SIGNER_ID, policyIds: POLICY_ID ? [POLICY_ID] : [] }] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-access"] });
      qc.invalidateQueries({ queryKey: ["agent-access-on"] });
    },
  });
}
