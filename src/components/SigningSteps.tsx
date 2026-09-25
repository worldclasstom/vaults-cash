import type { CallDescription } from "@/lib/describeCalls";

/** The "what you're signing" disclosure shared by every confirm sheet:
 *  each call in words, the contract it goes to, raw data one level deeper. */
export function SigningSteps({ steps }: { steps: CallDescription[] }) {
  return (
    <details className="pb-4 text-xs text-muted">
      <summary className="cursor-pointer underline-offset-2 hover:underline">
        What you&apos;re signing ({steps.length} {steps.length === 1 ? "step" : "steps"}, one transaction)
      </summary>
      <ol className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-xl bg-background p-3">
        {steps.map((st, i) => (
          <li key={i}>
            <p className="text-foreground">
              {i + 1}. {st.title}
            </p>
            {st.detail && <p className="text-muted">{st.detail}</p>}
            <details className="font-mono text-muted/60">
              <summary className="cursor-pointer">
                → {st.contract} {st.call.to.slice(0, 6)}…{st.call.to.slice(-4)}
              </summary>
              <p className="break-all">{st.call.data}</p>
            </details>
          </li>
        ))}
        <li className="pt-1 text-muted/60">
          Executed atomically from your wallet as one ERC-4337 user operation. All-or-nothing: if any step fails,
          everything reverts and nothing leaves your wallet.
        </li>
      </ol>
    </details>
  );
}
