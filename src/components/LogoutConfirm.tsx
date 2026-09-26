"use client";

import { Sheet } from "./Sheet";

/** The one logout check, shared by the header menu and the Account page. */
export function LogoutConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open onClose={onCancel} title="Log out?">
      <p className="pt-2 text-sm text-muted">
        Your funds stay safe in your wallet — nothing moves. Log back in the same way anytime to pick up where you left
        off.
      </p>
      <div className="mt-5 flex gap-2">
        <button onClick={onCancel} className="grow rounded-full bg-surface py-3 font-semibold transition-colors hover:bg-borderline">
          Stay
        </button>
        <button onClick={onConfirm} className="grow rounded-full bg-negative/15 py-3 font-semibold text-negative transition-colors hover:bg-negative/25">
          Log out
        </button>
      </div>
    </Sheet>
  );
}
