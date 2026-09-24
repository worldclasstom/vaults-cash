/** Share of the platform fee that goes to the referrer (50% of 60bps),
 *  paid on-chain in the same batch as the fee. Lives in its own module so the
 *  zap (client + server) can import it without dragging in the DB client. */
export const REFERRER_SHARE = 0.5;
