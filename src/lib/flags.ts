/** Targets is open for new ladders. Off until the LadderCloser contract is
 *  deployed on both chains; existing ladders keep working either way. */
export const TARGETS_LIVE = process.env.NEXT_PUBLIC_TARGETS_LIVE === "1";
