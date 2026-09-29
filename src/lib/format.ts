export function fmtUsd(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  if (opts.compact && Math.abs(n) >= 10_000) {
    // hand-rolled: Hermes (the iPhone app) has no compact notation
    const abs = Math.abs(n);
    const [div, suffix] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
    const v = abs / div;
    const digits = v >= 100 ? 0 : 1;
    return `${n < 0 ? "-" : ""}$${v.toFixed(digits).replace(/\.0$/, "")}${suffix}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtAmount(n: number, maxDecimals = 6): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDecimals }).format(n);
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}%`;
}

/** Price with sensible precision at any magnitude: 2,680.36 · 0.6812 · 0.000913 */
export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: abs >= 1 ? 2 : 0, maximumFractionDigits: digits }).format(n);
}
