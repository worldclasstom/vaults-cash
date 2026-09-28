/**
 * Loading skeletons shaped like the real screens, so the first paint has the
 * page's silhouette instead of a blank. Shown while Privy restores the session
 * and while a query has no data yet (persisted data skips them entirely).
 */
export function Skel({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-surface-raised ${className}`} />;
}

function Title({ sub = true }: { sub?: boolean }) {
  return (
    <div className="pb-4">
      <Skel className="h-9 w-40 rounded-lg" />
      {sub && <Skel className="mt-2 h-4 w-72 rounded" />}
    </div>
  );
}

export function Rows({ n = 4, h = "h-[76px]" }: { n?: number; h?: string }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <Skel key={i} className={`${h} rounded-2xl bg-surface`} />
      ))}
    </div>
  );
}

export function TargetsSkeleton() {
  return (
    <div className="py-4" aria-busy>
      <div className="flex items-end justify-between gap-3">
        <Title />
        <Skel className="mb-4 h-10 w-32 rounded-full" />
      </div>
      <div className="rounded-3xl bg-surface p-5 shadow-card sm:p-6">
        <Skel className="h-7 w-64 rounded-lg" />
        <Skel className="mt-2 h-4 w-80 rounded" />
        <div className="mt-5 space-y-2">
          <Skel className="h-11 rounded-xl" />
          <Skel className="h-11 rounded-xl" />
          <Skel className="h-11 rounded-xl" />
          <Skel className="h-11 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function LadderSkeleton() {
  return (
    <div className="py-4" aria-busy>
      <Skel className="h-4 w-24 rounded" />
      <Skel className="mt-3 h-9 w-72 rounded-lg" />
      <div className="mt-6 rounded-3xl bg-surface p-5 shadow-card">
        <div className="space-y-2">
          <Skel className="h-11 rounded-xl" />
          <Skel className="h-11 rounded-xl" />
          <Skel className="h-11 rounded-xl" />
          <Skel className="h-11 rounded-xl" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skel key={i} className="h-20 rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}

export function PortfolioSkeleton() {
  return (
    <div className="py-4" aria-busy>
      <div className="grid grid-cols-2 gap-2 pb-8 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skel key={i} className="h-24 rounded-2xl bg-surface" />
        ))}
      </div>
      <Skel className="mb-3 h-6 w-40 rounded-lg" />
      <Rows n={3} h="h-24" />
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div className="py-4" aria-busy>
      <Title sub={false} />
      <div className="space-y-3">
        <Skel className="h-40 rounded-3xl bg-surface" />
        <Skel className="h-32 rounded-3xl bg-surface" />
        <Skel className="h-48 rounded-3xl bg-surface" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="py-4" aria-busy>
      <div className="grid grid-cols-2 gap-2 pb-8 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skel key={i} className="h-24 rounded-2xl bg-surface" />
        ))}
      </div>
      <Skel className="mb-3 h-6 w-32 rounded-lg" />
      <Rows n={4} />
    </div>
  );
}
