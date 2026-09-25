"use client";

import { useEffect, useId, useRef } from "react";

/**
 * The one dialog surface: a bottom sheet on phones, a centered card from
 * `sm` up. Used for anything that moves money (confirm deposit / withdraw)
 * and for the logout check. Escape and the backdrop dismiss it unless the
 * caller says it's busy; focus moves into the sheet and back out again.
 */
export function Sheet({
  open,
  onClose,
  title,
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** a transaction is in flight: dismissing is disabled */
  busy?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus the first control in the sheet, else the panel itself
    const first = panel.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      // keep Tab inside the sheet
      if (e.key === "Tab" && panel.current) {
        const nodes = panel.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!nodes.length) return;
        const firstNode = nodes[0];
        const lastNode = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === firstNode) {
          e.preventDefault();
          lastNode.focus();
        } else if (!e.shiftKey && document.activeElement === lastNode) {
          e.preventDefault();
          firstNode.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md animate-rise rounded-t-3xl bg-surface-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-elevated outline-none sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-borderline sm:hidden" aria-hidden />
        <h3 id={titleId} className="font-display text-2xl font-extrabold tracking-tight">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}
