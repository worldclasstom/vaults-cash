import { MarketingShell } from "@/components/MarketingShell";
import { Chip } from "@/components/TokenIcon";

export const OPERATOR = "Prosperity Labs, LLC";
export const OPERATOR_URL = "https://prosperitylabs.co";

/** Shared frame for Terms and Privacy: same sticker header and card sections as Disclosures. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl animate-rise space-y-6 px-4 py-14 sm:px-6">
        <header className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip>Last updated {updated}</Chip>
            <Chip tone="accent">{OPERATOR}</Chip>
          </div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">{title}</h1>
          <p className="max-w-xl text-lg text-muted">{intro}</p>
        </header>
        {children}
      </div>
    </MarketingShell>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-6 shadow-card sm:p-7">
      <h2 className="pb-3 font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
    </section>
  );
}
