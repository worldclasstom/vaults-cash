/** Gas is always sponsored on Base: every user gets a CDP smart account and
 *  useSendCalls sends every operation with useCdpPaymaster, so no user ever
 *  needs ETH. (On Robinhood Chain this was conditional on an Alchemy gas
 *  policy; CDP's paymaster is built in, so there is nothing to configure.) */
export const GAS_SPONSORED = true;
