import { AppShell } from "@/components/AppShell";
import { PoolList } from "@/components/PoolList";

/** Public pool list — the same table signed-in users see on the home
 *  screen, browsable without an account (and indexable). */
export default function PoolsPage() {
  return (
    <AppShell>
      <div className="animate-rise py-4">
        <h1 className="pb-1 text-2xl font-bold">Pools</h1>
        <p className="pb-4 text-sm text-muted">
          Pick a pair, choose a price range, and earn a share of every trade. Deposits are in dollars; we handle the rest.
        </p>
        <PoolList />
      </div>
    </AppShell>
  );
}
